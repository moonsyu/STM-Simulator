import {TIMER_ROUTES,TIMER_IDS,isTimer,timerMax} from './timer-config.js';
import {generateMain} from './hal-generator.js';
import {GPIO_PINS} from './pins.js';
import {SERIAL_ROUTES,SERIAL_IDS,isSerial,serialFunction} from './serial-config.js';
import {DEFAULT_TIMER_CLOCK_HZ,timerDefaults} from './mcu-defaults.js';
import {DMA_REQUESTS} from './hal-dma.js';
import {familyProfile,routesOf,irqNamesOf,remapFor,DEFAULT_FAMILY,FAMILIES} from './mcu-family.js';
// Synchronous USART clock outputs on F446RE LQFP64 (DS10693 table 11): AF7 USART1/2/3, AF8 USART6.
export const USART_CK_ROUTES=familyProfile(DEFAULT_FAMILY).usartCk;
export const usartCkRoutesOf=family=>familyProfile(family).usartCk;
export const DMA_MODES=['normal','circular'],DMA_PRIORITIES=['low','medium','high','very_high'];
// Peripheral of each DMA request (used to require that peripheral to be enabled).
export const dmaPeripheral=request=>request==='MEMTOMEM'?null:request==='ADC1'||request==='DCMI'?request:request.startsWith('SDIO')?'SDIO':request.replace(/_(RX|TX|CH\d)$/,'');
export const dmaDirection=request=>request==='MEMTOMEM'?'M2M':/_RX$|^ADC1$|^DCMI$/.test(request)?'P2M':'M2P';

// Routes and IRQs of the default (F446RE) family; per-family versions come from mcu-family.js.
// Peripheral alternatives are explicit; choosing a peripheral never assigns an arbitrary GPIO as an alternate function.
export const ROUTES=routesOf(DEFAULT_FAMILY);
export const IRQ_NAMES=irqNamesOf(DEFAULT_FAMILY);
export const dmaRequestsOf=family=>familyProfile(family).dmaRequests??DMA_REQUESTS;
export const MODES=['Reset','GPIO_Input','GPIO_Output','GPIO_EXTI','Analog','Reserved'];
export const irqForPin=pin=>{const n=Number(pin.slice(2));return n<5?`EXTI${n}_IRQn`:n<10?'EXTI9_5_IRQn':'EXTI15_10_IRQn';};
export function pinFunctions(pin,family=DEFAULT_FAMILY){return [...MODES,...Object.entries(routesOf(family)).flatMap(([id,routes])=>Object.entries(routes).filter(([,pins])=>pins.includes(pin)).map(([signal])=>`${id}_${signal}`)),...Object.entries(usartCkRoutesOf(family)).filter(([,pins])=>pins.includes(pin)).map(([id])=>id+'_CK')];}
export function defaultMcu(family=DEFAULT_FAMILY){const f=familyProfile(family);return {family:f.id,pins:{},peripherals:{},nvic:{},timerClockHz:f.clock.defaultHz};}
export function validateMcu(value){
  if(!value||!Object.hasOwn(FAMILIES,value.family)||!value.pins||!value.peripherals||!value.nvic)throw new Error(`MCU 핀 설정이 필요합니다 (${Object.keys(FAMILIES).join(' / ')}).`);
  const f=familyProfile(value.family),routes=routesOf(f.id);
  const out={family:value.family,pins:{},peripherals:{},nvic:{},timerClockHz:value.timerClockHz??f.clock.defaultHz};
  if(!f.clock.valid(out.timerClockHz))throw new Error(`APB1 타이머 클록 범위: ${f.clock.label}`);
  for(const [pin,p] of Object.entries(value.pins)){
    if(!f.gpioPins.includes(pin)||!p||!pinFunctions(pin,f.id).includes(p.function))throw new Error(`${pin}: ${f.id}에서 지원하지 않는 핀 기능입니다.`);
    if(!['NOPULL','PULLUP','PULLDOWN'].includes(p.pull)||!['RISING','FALLING','CHANGE'].includes(p.edge)||![0,1].includes(p.initial)||typeof p.label!=='string'||(p.label&&!/^[A-Za-z_]\w{0,39}$/.test(p.label))||['__proto__','constructor','prototype'].includes(p.label))throw new Error(`${pin}: GPIO 설정이 올바르지 않습니다.`);
    out.pins[pin]={function:p.function,pull:p.pull,edge:p.edge,label:p.label,initial:p.initial};
  }
  for(const [id,p]of Object.entries(value.peripherals)){
    if(!Object.hasOwn(routes,id)||!p||typeof p.enabled!=='boolean')throw new Error(`${id}: ${f.id}에서 지원하지 않는 주변장치입니다.`);
    const q={enabled:p.enabled},defaults=isTimer(id)?timerDefaults(id,f.id):null;
    for(const [key,def,min,max]of isSerial(id)?[['baud',115200,300,2000000]]:id==='I2C1'?[['clock',100000,1000,1000000]]:id==='SPI1'?[['clock',1000000,1000,20000000]]:isTimer(id)?[['prescaler',defaults.prescaler,0,65535],['period',defaults.period,0,f.timerMax(id)],['pulse',defaults.pulse,0,f.timerMax(id)]]:[]){q[key]=p[key]??def;if(!Number.isInteger(q[key])||q[key]<min||q[key]>max)throw new Error(`${id}.${key}: 범위를 확인하세요.`);}
    if(isTimer(id)){q.mode=p.mode??defaults.mode;if(!['base','pwm','capture','encoder'].includes(q.mode))throw new Error(id+': 타이머 모드를 확인하세요.');}
    if(isSerial(id)&&p.mode!==undefined&&p.mode!=='asynchronous'){if(p.mode!=='synchronous'||!f.usartCk[id])throw new Error(`${id}: 동기 모드는 USART${Object.keys(f.usartCk).map(u=>u.replace('USART','')).join('/')}에서만 지원합니다.`);q.mode='synchronous';for(const [key,values]of [['cpol',[0,1]],['cpha',[0,1]],['lastBit',[0,1]]]){q[key]=p[key]??0;if(!values.includes(q[key]))throw new Error(`${id}.${key}: 0 또는 1입니다.`);}}
    out.peripherals[id]=q;
  }
  if(value.dma!==undefined){
    if(!value.dma||typeof value.dma!=='object'||Array.isArray(value.dma))throw new Error('DMA 설정을 확인하세요.');out.dma={};const streams=new Map();
    for(const [request,d]of Object.entries(value.dma)){
      const options=dmaRequestsOf(f.id)[request];if(!options||!d)throw new Error(`${request}: ${f.id}에서 지원하지 않는 DMA 요청입니다.`);
      const q={stream:d.stream??options[0][0],channel:d.channel??options[0][1]??0,mode:d.mode??'normal',priority:d.priority??'low'};
      if(!options.some(([s,c])=>s===q.stream&&(c===null||c===q.channel)))throw new Error(`${request}: ${q.stream} 채널 ${q.channel} 조합은 사용할 수 없습니다.`);
      if(!DMA_MODES.includes(q.mode)||!DMA_PRIORITIES.includes(q.priority)||request==='MEMTOMEM'&&q.mode==='circular')throw new Error(`${request}: DMA 모드/우선순위를 확인하세요.`);
      if(streams.has(q.stream))throw new Error(`${q.stream}: ${streams.get(q.stream)}와 ${request}가 같은 ${f.pinMux==='remap'?'채널':'스트림'}을 사용합니다.`);streams.set(q.stream,request);out.dma[request]=q;
    }
  }
  const irqs=irqNamesOf(f.id);
  for(const [irq,p]of Object.entries(value.nvic)){if(!irqs.includes(irq)||!p||typeof p.enabled!=='boolean'||!Number.isInteger(p.priority)||p.priority<0||p.priority>15)throw new Error('NVIC 설정을 확인하세요.');out.nvic[irq]={enabled:p.enabled,priority:p.priority};}
  return out;
}
export function configProblems(config){
  const errors=[],signals=new Map(),exti=new Map(),labels=new Set();
  for(const [pin,p]of Object.entries(config.pins)){
    // PA13/PA14 carry SWD: reconfiguring them cuts the ST-LINK off the running board.
    if(['PA13','PA14'].includes(pin)&&!['Reset','Reserved'].includes(p.function))errors.push(`${pin}: SWD 디버그 핀(${pin==='PA13'?'SWDIO':'SWCLK'})이라 다른 기능으로 쓸 수 없습니다. 보드 쓰기와 디버깅이 끊깁니다.`);
    if(p.label){if(labels.has(p.label))errors.push(`사용자 라벨 중복: ${p.label}`);labels.add(p.label);}
    if(p.function==='GPIO_EXTI'){const n=pin.slice(2);if(exti.has(n))errors.push(`EXTI${n}: ${exti.get(n)}와 ${pin} 충돌`);exti.set(n,pin);}
    if(!MODES.includes(p.function)){if(signals.has(p.function))errors.push(`${p.function}: 핀을 하나만 지정하세요.`);signals.set(p.function,pin);}
    const serial=serialFunction(p.function)||/^(USART\d)_CK$/.exec(p.function)?.[1];if(serial&&!config.peripherals[serial]?.enabled)errors.push(`${pin}: ${serial} 주변장치를 활성화하세요.`);
    if(/_CK$/.test(p.function)&&serial&&config.peripherals[serial]?.mode!=='synchronous')errors.push(`${pin}: ${serial} 동기(Synchronous) 모드에서만 CK 핀을 사용합니다.`);
  }
  for(const [id,p]of Object.entries(config.peripherals))if(p.enabled){
    const required=isSerial(id)?['TX','RX',...(p.mode==='synchronous'?['CK']:[])]:id==='I2C1'?['SCL','SDA']:id==='SPI1'?['SCK','MISO','MOSI']:id==='SDIO'?['D0','CK','CMD']:[];
    for(const role of required)if(!signals.has(`${id}_${role}`))errors.push(`${id}: ${role} 핀을 활성화하세요.`);
    if(isTimer(id)&&p.mode==='encoder')for(const ch of ['CH1','CH2'])if(!signals.has(id+'_'+ch))errors.push(id+': 엔코더 '+ch+' 핀을 활성화하세요.');
    // The encoder model counts every edge (TIM_ENCODERMODE_TI1/TI2/TI12 with Prescaler 0), as the interpreter does.
    if(isTimer(id)&&p.enabled&&p.mode==='encoder'&&p.prescaler)errors.push(id+': 엔코더 모드는 Prescaler 0을 사용하세요.');
    if(isTimer(id)&&['pwm','capture'].includes(p.mode)&&![...signals.keys()].some(k=>k.startsWith(id+'_CH')))errors.push(id+': 채널 핀을 활성화하세요.');
    if(id==='ADC1'&&![...signals.keys()].some(k=>k.startsWith('ADC1_IN')))errors.push('ADC1: 입력 채널을 활성화하세요.');
  }
  // F1: every signal of a peripheral must sit on one AFIO remap option (default or remapped pins together).
  const family=familyProfile(config.family??DEFAULT_FAMILY);
  if(family.pinMux==='remap')for(const id of Object.keys(family.remaps)){
    const assigned=Object.fromEntries(Object.entries(config.pins).filter(([,p])=>p.function.startsWith(id+'_')).map(([pin,p])=>[p.function.slice(id.length+1),pin]));
    if(Object.keys(assigned).length&&!remapFor(family.id,id,assigned))errors.push(`${id}: ${Object.entries(assigned).map(([s,pin])=>`${s}=${pin}`).join(', ')} 조합은 ${family.id}에서 쓸 수 없습니다. 함께 옮겨지는 핀 묶음: ${family.remaps[id].map(o=>Object.entries(o.pins).map(([s,pin])=>`${s} ${pin}`).join('/')).join(' 또는 ')}`);
  }
  for(const [request,d]of Object.entries(config.dma||{})){const id=dmaPeripheral(request);if(id&&!config.peripherals[id]?.enabled)errors.push(`${request} DMA: ${id} 주변장치를 활성화하세요.`);if(id&&isTimer(id)&&config.peripherals[id].mode!=='pwm')errors.push(`${request} DMA: ${id}를 PWM 모드로 설정하세요.`);}
  return errors;
}
export function importIoc(text){
  if(typeof text!=='string'||text.length>500000)throw new Error('.ioc 파일은 500 KB 이하로 선택하세요.');
  const values=Object.fromEntries(text.split(/\r?\n/).filter(l=>l&&!l.startsWith('#')&&l.includes('=')).map(l=>[l.slice(0,l.indexOf('=')),l.slice(l.indexOf('=')+1).replaceAll('\\:',':')]));
  const mcuName=values['Mcu.Name']||values['Mcu.CPN']||'',family=/^STM32F446R/.test(mcuName)?'STM32F446RE':/^STM32F103R[8B]/.test(mcuName)?'STM32F103RB':null;
  if(!family)throw new Error('STM32F446RE 또는 STM32F103RB 설정만 지원합니다.');
  const config=defaultMcu(family),f=familyProfile(family),routes=routesOf(family);config.pins={};const warnings=[];
  for(const [key,signal]of Object.entries(values)){
    const m=/^(P[A-H]\d+)(?:-[^.]+)?\.Signal$/.exec(key);if(!m)continue;const pin=m[1],base=key.slice(0,-7);
    if(!f.gpioPins.includes(pin)){warnings.push(`${pin}: 보드에서 접근할 수 없는 핀`);continue;}
    let fn=signal==='GPIO_Output'?'GPIO_Output':signal==='GPIO_Input'?'GPIO_Input':signal.startsWith('GPXTI')?'GPIO_EXTI':/^S_TIM\d+_CH\d$/.test(signal)?signal.slice(2):signal;
    if(!pinFunctions(pin,family).includes(fn)){fn='Reserved';if(!/^(SYS_|RCC_)/.test(signal))warnings.push(`${pin}: ${signal} 실행 모델 미지원`);}
    const pull=(values[base+'.GPIO_PuPd']||'GPIO_NOPULL').replace('GPIO_','');
    const edge=(values[base+'.GPIO_ModeDefaultEXTI']||'').includes('RISING_FALLING')?'CHANGE':(values[base+'.GPIO_ModeDefaultEXTI']||'').includes('RISING')?'RISING':'FALLING';
    config.pins[pin]={function:fn,pull,edge,label:values[base+'.GPIO_Label']||'',initial:values[base+'.PinState']==='GPIO_PIN_SET'?1:0};
  }
  for(const id of Object.keys(routes)){
    const enabled=Object.values(config.pins).some(p=>p.function.startsWith(id+'_'))||Object.entries(values).some(([k,v])=>/^Mcu.IP\d+$/.test(k)&&v===id);
    if(enabled)config.peripherals[id]={enabled:true};
  }
  for(const id of Object.keys(f.serial))if(config.peripherals[id])config.peripherals[id].baud=Number(values[id+'.BaudRate']||115200);
  if(config.peripherals.I2C1)config.peripherals.I2C1.clock=Number(values['I2C1.ClockSpeed']||100000);
  for(const id of Object.keys(f.timers))if(config.peripherals[id]){const p=config.peripherals[id],defaults=timerDefaults(id,family);p.prescaler=Number(values[id+'.Prescaler']??defaults.prescaler);p.period=Number(values[id+'.Period']??defaults.period);const settings=Object.entries(values).filter(([k])=>k.startsWith(id+'.')).map(([,v])=>v).join(' ');p.mode=/Encoder|ENCODER/.test(settings)?'encoder':/PWM/.test(settings)?'pwm':/INPUTCAPTURE|Input_Capture|IC_CHANNEL/.test(settings)?'capture':'base';}
  config.timerClockHz=Number(values['RCC.APB1TimFreq_Value']??f.clock.defaultHz);
  for(const irq of irqNamesOf(family)){const raw=values['NVIC.'+irq];if(raw){const [enabled,priority]=raw.split(':');config.nvic[irq]={enabled:enabled==='true',priority:Number(priority)};}}
  for(const [key,v]of Object.entries(values))if(/^Mcu.IP\d+$/.test(key)&&!Object.hasOwn(routes,v)&&!['GPIO','RCC','NVIC','SYS','NUCLEO-F446RE','NUCLEO-F103RB'].includes(v))warnings.push(`${v}: 실행 모델 미지원`);
  const clean=validateMcu(config);return {config:clean,warnings:[...new Set([...warnings,...configProblems(clean)])]};
}
export function generateHal(config,options){const clean=validateMcu(config),errors=configProblems(clean);if(errors.length)throw new Error(errors.join('\n'));return generateMain(clean,options);}
