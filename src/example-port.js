// Ports a HAL example written for the STM32F446RE to the STM32F103RB (NUCLEO-F103RB).
// The pin configuration moves to the F1 profile (clock, DMA channels, IRQ names, AFIO remaps, signals that have no
// route on their F4 pin), functions the generator owns are regenerated for the F1, and the rest of the code gets the
// F4 → F1 HAL translations (DMA streams, ADC fields, GPIO Alternate, sample times). Timer prescalers are scaled so
// the example keeps its timing at the F1 timer clock.
import {generateHal,pinFunctions} from './mcu-config.js';
import {familyProfile,routesOf,irqNamesOf} from './mcu-family.js';
import {cFunctions} from './c-source-edit.js';
import {PINS,boardPin} from './pins.js';
import {isTimer} from './timer-config.js';

export const F1_FAMILY='STM32F103RB';
const F1=familyProfile(F1_FAMILY);
// 84 MHz (example PLL) → 64 MHz (HSI/2 × 16); 16 MHz (HSI) → 8 MHz (HSI).
const CLOCKS={84000000:64000000,16000000:8000000};
const SAMPLE_TIMES={3:'1CYCLE_5',15:'13CYCLES_5',28:'28CYCLES_5',56:'55CYCLES_5',84:'71CYCLES_5',112:'71CYCLES_5',144:'239CYCLES_5',480:'239CYCLES_5'};

/** Reasons an example cannot run on the STM32F103RB (hardware the F103 medium-density part does not have). */
export function f1Unavailable(project){
  const m=project.mcu??{},code=project.code??'',reasons=[];
  if(m.peripherals?.DCMI?.enabled||/\bHAL_DCMI_/.test(code))reasons.push('DCMI 카메라 인터페이스');
  if(/\bHAL_I2S_|PLLI2S/.test(code))reasons.push('I2S 디지털 오디오');
  if(m.peripherals?.SDIO?.enabled||/\bHAL_SD_/.test(code))reasons.push('SDIO');
  for(const id of ['UART4','UART5','USART6','TIM5'])if(m.peripherals?.[id]?.enabled)reasons.push(id);
  return reasons;
}

function scaleTimer(c,from,to){
  const q={...c};if(c.mode==='encoder')return q;
  const ratio=to/from,psc=(c.prescaler+1)*ratio;
  if(Number.isInteger(psc))q.prescaler=psc-1;
  else{const period=Math.round((c.period+1)*ratio)-1;q.period=Math.max(0,period);if(c.pulse)q.pulse=Math.round(c.pulse*ratio);}
  return q;
}
const freePin=(mcu,pin)=>!mcu.pins[pin]||['Reset','Reserved'].includes(mcu.pins[pin].function);

/** F1 pin configuration for an F4 one; returns {mcu, moved:{oldPin:newPin}, timerChanges:{TIMx:{from,to}}}. */
export function portMcu(f4){
  const to=CLOCKS[f4.timerClockHz]??Math.min(64000000,Math.max(8000000,Math.round(f4.timerClockHz/4000000)*4000000));
  const mcu={family:F1_FAMILY,pins:{},peripherals:{},nvic:{},timerClockHz:to},moved={},timerChanges={};let port16;
  for(const [pin,p]of Object.entries(f4.pins))mcu.pins[pin]={...p};
  // Signals without an F1 route at their pin move to a free F1 pin of the same signal (e.g. TIM2_CH1: PA5 → PA0/PA15).
  for(const [pin,p]of Object.entries(f4.pins)){
    if(F1.gpioPins.includes(pin)&&pinFunctions(pin,F1_FAMILY).includes(p.function))continue;
    const [id,...rest]=p.function.split('_'),signal=rest.join('_'),options=routesOf(F1_FAMILY)[id]?.[signal]??[];
    const target=options.filter(o=>freePin(mcu,o)).sort((a,b)=>F1.jtagPins.includes(a)-F1.jtagPins.includes(b))[0];
    if(!target)throw new Error(`${pin} ${p.function}: STM32F103RB에서 옮길 핀이 없습니다.`);
    delete mcu.pins[pin];mcu.pins[target]={...p};moved[pin]=target;
  }
  for(const [id,c]of Object.entries(f4.peripherals)){
    let q=isTimer(id)&&f4.timerClockHz!==to?scaleTimer(c,f4.timerClockHz,to):{...c};
    // F1 timers are 16-bit: a free-running 32-bit counter (ARR 0xFFFFFFFF) becomes a 16-bit one.
    if(isTimer(id)&&q.period>65535)q={...q,period:65535,wide:true};
    if(isTimer(id)&&(q.prescaler!==c.prescaler||q.period!==c.period))timerChanges[id]={from:c,to:q};
    const {wide,...stored}=q;mcu.peripherals[id]=stored;if(wide)(port16??=[]).push(id);
  }
  const irqs=irqNamesOf(F1_FAMILY),streamToChannel={};
  if(f4.dma){mcu.dma={};for(const [request,d]of Object.entries(f4.dma)){const channel=F1.dmaRequests[request][0][0];streamToChannel[d.stream]=channel;mcu.dma[request]={stream:channel,channel:0,mode:d.mode,priority:d.priority};}}
  for(const [irq,n]of Object.entries(f4.nvic)){
    const name=irq==='ADC_IRQn'?'ADC1_2_IRQn':irq.replace(/^(DMA\d_Stream\d)(?=_IRQn$)/,s=>streamToChannel[s]??s);
    if(irqs.includes(name))mcu.nvic[name]={...n};
  }
  return {mcu,moved,timerChanges,streamToChannel,counters16:port16??[]};
}

/** C source of an F4 example translated for the F1 configuration `port` (from portMcu). */
export function portCode(code,f4,port){
  const {mcu}=port,byName=src=>new Map(cFunctions(src).map(f=>[f.name,f]));
  const f4Full=byName(generateHal(f4)),f4Min=byName(generateHal(f4,{minimal:true})),f1Full=byName(generateHal(mcu)),f1Min=byName(generateHal(mcu,{minimal:true}));
  let out=code;
  // Generator-owned functions: SystemClock_Config and MX_GPIO_Init are always regenerated (F1 clock tree, AFIO
  // remaps); other MX_* functions are regenerated when the example left them as generated.
  for(const f of cFunctions(code)){
    const full=f4Full.get(f.name),min=f4Min.get(f.name);if(!full&&!min)continue;
    const minimal=min?.text===f.text||!full,replacement=(minimal?f1Min:f1Full).get(f.name)??f1Full.get(f.name)??f1Min.get(f.name);
    if(replacement&&(['SystemClock_Config','MX_GPIO_Init','MX_DMA_Init'].includes(f.name)||f.text===full?.text||f.text===min?.text))out=out.replace(f.text,replacement.text);
  }
  const generatedHeader=/\/\* Copy this main\.c into a CubeIDE STM32F446RE project[\s\S]*?\*\//;
  const f1Header=generateHal(mcu).match(/\/\* Copy this main\.c into a CubeIDE STM32F103RB project[\s\S]*?\*\//)?.[0];
  if(f1Header)out=out.replace(generatedHeader,f1Header);
  for(const [stream,channel]of Object.entries(port.streamToChannel))out=out.replace(new RegExp(`\\b${stream}(?=\\b|_)`,'g'),channel);
  // Comments spell streams as "DMA1 Stream5".
  out=out.replace(/\bDMA(\d) Stream(\d)\b/g,(m,u,n)=>port.streamToChannel[`DMA${u}_Stream${n}`]?.replace('_',' ')??m);
  for(const [id,{from,to}]of Object.entries(port.timerChanges)){
    const h='htim'+id.slice(3);
    out=out.replace(new RegExp(`(${h}\\.Init\\.Prescaler\\s*=\\s*)${from.prescaler}\\b`,'g'),`$1${to.prescaler}`).replace(new RegExp(`(${h}\\.Init\\.Period\\s*=\\s*)${from.period}\\b`,'g'),`$1${to.period}`);
    if(from.pulse!==to.pulse)out=out.replace(new RegExp(`(\\.Pulse\\s*=\\s*)${from.pulse}\\b`,'g'),`$1${to.pulse}`);
    out=out.replace(new RegExp(`\\(${from.prescaler} \\+ 1\\)`,'g'),`(${to.prescaler} + 1)`);
  }
  const mhz=mcu.timerClockHz/1e6,f4mhz=f4.timerClockHz/1e6;
  out=out.replace(new RegExp(`\\b${f4mhz} MHz\\b`,'g'),`${mhz} MHz`).replace(new RegExp(`\\b${f4.timerClockHz}\\b`,'g'),String(mcu.timerClockHz));
  out=out
    .replace(/[ \t]*[\w.\[\]>-]+\.Init\.(Channel|FIFOMode|FIFOThreshold|MemBurst|PeriphBurst|ClockPrescaler|Resolution|ExternalTrigConvEdge|DMAContinuousRequests|EOCSelection)\s*=[^;\n]*;([ \t]*\r?\n)?/g,'')
    .replace(/[ \t]*[\w.\[\]>-]+\.Alternate\s*=[^;\n]*;([ \t]*\r?\n)?/g,'')
    .replace(/[ \t]*__HAL_RCC_(SYSCFG|DMA2)_CLK_ENABLE\(\);([ \t]*\r?\n)?/g,'')
    .replace(/(\.Init\.ScanConvMode\s*=\s*)(ENABLE|DISABLE)\b/g,(_,a,b)=>`${a}ADC_SCAN_${b}`)
    .replace(/\bADC_SAMPLETIME_(\d+)CYCLES\b/g,(m,n)=>SAMPLE_TIMES[n]?'ADC_SAMPLETIME_'+SAMPLE_TIMES[n]:m)
    .replace(/\bADC_IRQ(n|Handler)\b/g,'ADC1_2_IRQ$1')
    .replace(/\bGPIO_SPEED_FREQ_VERY_HIGH\b/g,'GPIO_SPEED_FREQ_HIGH');
  // The guide comment names the pins of the circuit.
  for(const [from,to]of Object.entries(port.moved))out=out.replace(/^\/\/.*$/m,line=>line.replace(new RegExp(`\\b${from}\\b`,'g'),to));
  // A counter that became 16-bit: elapsed-time differences wrap at 16 bits (intervals stay below 65.5 ms).
  for(const id of port.counters16){
    const counter=`__HAL_TIM_GET_COUNTER(&htim${id.slice(3)})`,names=new Set();
    for(let grew=true;grew;){grew=false;for(const m of out.matchAll(/\b(\w+)\s*=\s*([^;]+);/g))if(!names.has(m[1])&&(m[2].includes(counter)||[...names].some(n=>new RegExp(`^${n}$`).test(m[2].trim())))){names.add(m[1]);grew=true;}}
    const uses=line=>line.includes(counter)||[...names].some(n=>new RegExp(`\\b${n}\\b`).test(line));
    out=out.split('\n').map(line=>uses(line)?line.replace(/\(uint32_t\)\((?=[^()]*-)/g,'(uint16_t)('):line).join('\n');
  }
  // CAN1 on PB8 (RX) / PB9 (TX): F1 remap 2, RX as an input and TX as an alternate-function output (as CubeMX does).
  if(/GPIO_AF9_CAN1/.test(code))out=out.replace(/__HAL_RCC_CAN1_CLK_ENABLE\(\);/,'__HAL_RCC_CAN1_CLK_ENABLE();__HAL_RCC_AFIO_CLK_ENABLE();__HAL_AFIO_REMAP_CAN1_2();')
    .replace(/(\w+)\.Pin=GPIO_PIN_8\|GPIO_PIN_9;\1\.Mode=GPIO_MODE_AF_PP;/,'$1.Pin=GPIO_PIN_8;$1.Mode=GPIO_MODE_INPUT;$1.Pull=GPIO_NOPULL;HAL_GPIO_Init(GPIOB,&$1);$1.Pin=GPIO_PIN_9;$1.Mode=GPIO_MODE_AF_PP;');
  if(/\bGPIO_AF\d+_\w+/.test(out))throw new Error('STM32F103RB로 옮길 수 없는 F4 대체 기능 설정이 남았습니다: '+out.match(/\bGPIO_AF\d+_\w+/)[0]);
  return out;
}

/** The F103 version of an example project (as built by halExample), or throws with the reason it cannot run. */
export function portExampleToF1(project){
  const reasons=f1Unavailable(project);
  if(reasons.length)throw new Error(`STM32F103RB에는 ${reasons.join(', ')}가 없어 이 예제를 실행할 수 없습니다.`);
  const port=portMcu(project.mcu),p=structuredClone(project);
  p.mcu=port.mcu;p.boardId='nucleo-f103rb';p.code=portCode(project.code,project.mcu,port);
  for(const file of p.firmware?.files||[])if(/\.(c|h)$/i.test(file.name))file.text=portCode(file.text,project.mcu,port);
  // Wires that went to a moved signal's header pins now go to the new pin.
  if(Object.keys(port.moved).length){
    const headerOf=new Map(PINS.map(pin=>[pin.id,pin.signal]));
    const move=id=>{const signal=headerOf.get(id);return signal&&port.moved[signal]?boardPin(port.moved[signal]):id;};
    p.wires=p.wires.map(w=>({...w,from:move(w.from),to:move(w.to)}));
    for(const part of p.components)for(const [key,value]of Object.entries(part.attachments??{}))if(typeof value==='string')part.attachments[key]=move(value);
  }
  return p;
}
