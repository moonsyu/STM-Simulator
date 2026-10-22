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
    if(typeof p.label!=='string'||(p.label&&!/^[A-Za-z_]\w{0,39}$/.test(p.label))||['__proto__','constructor','prototype'].includes(p.label))throw new Error(`${pin}: 라벨은 영문자나 _로 시작하는 C 이름(영문·숫자·_ 40자 이내)으로 쓰세요.`);
    if(!['NOPULL','PULLUP','PULLDOWN'].includes(p.pull)||!['RISING','FALLING','CHANGE'].includes(p.edge)||![0,1].includes(p.initial))throw new Error(`${pin}: GPIO 설정이 올바르지 않습니다.`);
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
  for(const [irq,p]of Object.entries(value.nvic)){if(!irqs.includes(irq))throw new Error(`${irq}: ${f.id}에 없는 인터럽트입니다.`);if(!p||typeof p.enabled!=='boolean'||!Number.isInteger(p.priority)||p.priority<0||p.priority>15)throw new Error(`${irq}: NVIC 우선순위는 0~15 정수로 설정하세요.`);out.nvic[irq]={enabled:p.enabled,priority:p.priority};}
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
    // F446/F103 I2C1 (not FMPI2C) runs standard or fast mode only.
    if(id==='I2C1'&&p.clock>400000)errors.push('I2C1: 클록은 400 kHz(Fast mode) 이하로 설정하세요.');
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
// CubeMX keeps parameter expressions as typed ("84-1", "1000*2"): + - * / and parentheses on integers only.
export function evalIocNumber(raw){
  const text=String(raw).trim();if(!/^[\d\s+\-*/()]+$/.test(text))return null;let i=0;
  const skip=()=>{while(text[i]===' ')i++;},atom=()=>{skip();if(text[i]==='('){i++;const v=sum();skip();if(text[i++]!==')')throw 0;return v;}if(text[i]==='-'){i++;return -atom();}const m=/^\d+/.exec(text.slice(i));if(!m)throw 0;i+=m[0].length;return Number(m[0]);};
  const product=()=>{let v=atom();for(skip();text[i]==='*'||text[i]==='/';skip()){const op=text[i++],r=atom();v=op==='*'?v*r:v/r;}return v;},sum=()=>{let v=product();for(skip();text[i]==='+'||text[i]==='-';skip()){const op=text[i++],r=product();v=op==='+'?v+r:v-r;}return v;};
  try{const v=sum();skip();return i===text.length&&Number.isInteger(v)?v:null;}catch{return null;}
}
export function importIoc(text){
  if(typeof text!=='string'||text.length>500000)throw new Error('.ioc 파일은 500 KB 이하로 선택하세요.');
  const values=Object.fromEntries(text.split(/\r?\n/).filter(l=>l&&!l.startsWith('#')&&l.includes('=')).map(l=>[l.slice(0,l.indexOf('=')),l.slice(l.indexOf('=')+1).replaceAll('\\:',':')]));
  // CubeMX writes package ranges in Mcu.Name (STM32F103R(8-B)Tx); Mcu.CPN/UserName hold the exact part.
  const familyOf=name=>/^STM32F446R/.test(name)?'STM32F446RE':/^STM32F103R(?:[8B]|\([^)]*B[^)]*\))/.test(name)?'STM32F103RB':null;
  const family=['Mcu.Name','Mcu.CPN','Mcu.UserName'].map(k=>familyOf(values[k]||'')).find(Boolean);
  if(!family)throw new Error('STM32F446RE 또는 STM32F103RB 설정만 지원합니다.');
  const config=defaultMcu(family),f=familyProfile(family),routes=routesOf(family);config.pins={};const warnings=[];
  const number=(raw,fallback)=>{if(raw===undefined)return fallback;const n=evalIocNumber(raw);if(n===null){warnings.push(`${raw}: 숫자로 읽을 수 없어 기본값 ${fallback}을 사용합니다.`);return fallback;}return n;};
  for(const [key,signal]of Object.entries(values)){
    const m=/^(P[A-H]\d+)(?:-[^.]+)?\.Signal$/.exec(key);if(!m)continue;const pin=m[1],base=key.slice(0,-7);
    if(!f.gpioPins.includes(pin)){warnings.push(`${pin}: 보드에서 접근할 수 없는 핀`);continue;}
    // ADCx_INn: a channel shared by ADC1/2/3; the model uses ADC1.
    let fn=signal==='GPIO_Output'?'GPIO_Output':signal==='GPIO_Input'?'GPIO_Input':signal.startsWith('GPXTI')?'GPIO_EXTI':/^S_TIM\d+_CH\d$/.test(signal)?signal.slice(2):/^ADC(?:x|\d+)_IN\d+$/.test(signal)?'ADC1_'+signal.split('_')[1]:signal;
    if(!pinFunctions(pin,family).includes(fn)){fn='Reserved';if(!/^(SYS_|RCC_)/.test(signal))warnings.push(`${pin}: ${signal} 실행 모델 미지원`);}
    const pull=(values[base+'.GPIO_PuPd']||'GPIO_NOPULL').replace('GPIO_','');
    // CubeMX omits GPIO_ModeDefaultEXTI for its default, rising edge.
    const extiMode=values[base+'.GPIO_ModeDefaultEXTI']||(fn==='GPIO_EXTI'?'GPIO_MODE_IT_RISING':''),edge=extiMode.includes('RISING_FALLING')?'CHANGE':extiMode.includes('RISING')?'RISING':'FALLING';
    // Board templates label pins like "B1 [Blue PushButton]"; the C name is the first word.
    const rawLabel=values[base+'.GPIO_Label']||'',label=rawLabel.split(/[\s[]/)[0];
    if(label&&(!/^[A-Za-z_]\w{0,39}$/.test(label)||['__proto__','constructor','prototype'].includes(label)))warnings.push(`${pin}: 라벨 "${rawLabel}"은 C 이름으로 쓸 수 없어 비웠습니다.`);
    config.pins[pin]={function:fn,pull,edge,label:/^[A-Za-z_]\w{0,39}$/.test(label)&&!['__proto__','constructor','prototype'].includes(label)?label:'',initial:values[base+'.PinState']==='GPIO_PIN_SET'?1:0};
  }
  for(const id of Object.keys(routes)){
    const enabled=Object.values(config.pins).some(p=>p.function.startsWith(id+'_'))||Object.entries(values).some(([k,v])=>/^Mcu.IP\d+$/.test(k)&&v===id);
    if(enabled)config.peripherals[id]={enabled:true};
  }
  for(const id of Object.keys(f.serial))if(config.peripherals[id]){
    const p=config.peripherals[id];p.baud=number(values[id+'.BaudRate'],115200);
    // A pin carrying USARTx_CK means CubeMX's synchronous mode.
    if(Object.values(config.pins).some(q=>q.function===id+'_CK'))Object.assign(p,{mode:'synchronous',cpol:values[id+'.CLKPolarity']==='USART_POLARITY_HIGH'?1:0,cpha:values[id+'.CLKPhase']==='USART_PHASE_2EDGE'?1:0,lastBit:values[id+'.CLKLastBit']==='USART_LASTBIT_ENABLE'?1:0});
  }
  if(config.peripherals.I2C1)config.peripherals.I2C1.clock=number(values['I2C1.ClockSpeed'],100000);
  // SPI1 speed: CubeMX stores the computed rate ("5.25 MBits/s") next to the prescaler.
  if(config.peripherals.SPI1){const m=/^([\d.]+)\s*([KM]?)Bits\/s/i.exec(values['SPI1.CalculateBaudRate']||'');if(m)config.peripherals.SPI1.clock=Math.min(20000000,Math.max(1000,Math.round(Number(m[1])*({K:1e3,M:1e6}[m[2].toUpperCase()]??1))));}
  for(const id of Object.keys(f.timers))if(config.peripherals[id]){const p=config.peripherals[id],defaults=timerDefaults(id,family);p.prescaler=number(values[id+'.Prescaler'],defaults.prescaler);p.period=number(values[id+'.Period'],defaults.period);const settings=Object.entries(values).filter(([k])=>k.startsWith(id+'.')).map(([,v])=>v).join(' ');p.mode=/Encoder|ENCODER/.test(settings)?'encoder':/PWM/.test(settings)?'pwm':/INPUTCAPTURE|Input_Capture|IC_CHANNEL/.test(settings)?'capture':'base';}
  config.timerClockHz=number(values['RCC.APB1TimFreq_Value'],f.clock.defaultHz);
  // HSE/other PLL setups (F103 at 72 MHz) cannot be rebuilt from HSI: keep the nearest clock the generator can make.
  if(!f.clock.valid(config.timerClockHz)){const wanted=config.timerClockHz,hz=f.clock.valid(Math.min(f.clock.maxHz,Math.round(wanted/4e6)*4e6))?Math.min(f.clock.maxHz,Math.round(wanted/4e6)*4e6):f.clock.exampleHz;warnings.push(`APB1 타이머 클록 ${wanted/1e6} MHz는 HSI로 만들 수 없어 ${hz/1e6} MHz로 바꿨습니다 (${f.clock.label}). 타이머 Prescaler/Period를 확인하세요.`);config.timerClockHz=hz;}
  // DMA: Dma.<request>.<n>.Instance/Channel/Mode/Priority; a request this model cannot route is reported, not dropped silently.
  const requests=dmaRequestsOf(family),dma={};
  for(const [key,request]of Object.entries(values)){
    if(!/^Dma\.Request\d+$/.test(key))continue;const base=Object.keys(values).find(k=>new RegExp(`^Dma\\.${request}\\.\\d+\\.Instance$`).test(k))?.slice(0,-9);
    const q=base&&{stream:values[base+'.Instance'],channel:Number(/\d+$/.exec(values[base+'.Channel']||'')?.[0]??0),mode:values[base+'.Mode']==='DMA_CIRCULAR'?'circular':'normal',priority:(values[base+'.Priority']||'DMA_PRIORITY_LOW').replace('DMA_PRIORITY_','').toLowerCase()};
    try{if(!requests[request]||!q)throw new Error();validateMcu({...defaultMcu(family),dma:{...dma,[request]:q}});dma[request]=q;}catch{warnings.push(`${request} DMA: 실행 모델에서 같은 설정을 쓸 수 없어 가져오지 않았습니다.`);}
  }
  if(Object.keys(dma).length)config.dma=dma;
  for(const irq of irqNamesOf(family)){const raw=values['NVIC.'+irq];if(raw){const [enabled,priority]=raw.split(':');config.nvic[irq]={enabled:enabled==='true',priority:Number(priority)};}}
  for(const [key,v]of Object.entries(values))if(/^Mcu.IP\d+$/.test(key)&&!Object.hasOwn(routes,v)&&!['GPIO','RCC','NVIC','SYS','NUCLEO-F446RE','NUCLEO-F103RB'].includes(v))warnings.push(`${v}: 실행 모델 미지원`);
  const clean=validateMcu(config);return {config:clean,warnings:[...new Set([...warnings,...configProblems(clean)])]};
}
export function generateHal(config,options){const clean=validateMcu(config),errors=configProblems(clean);if(errors.length)throw new Error(errors.join('\n'));return generateMain(clean,options);}
