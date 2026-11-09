import {TIMER_ROUTES,TIMER_IDS,isTimer,isBasicTimer,timerOfIrq,timerMax,TIM_TRGO} from './timer-config.js';
import {generateMain} from './hal-generator.js';
import {GPIO_PINS} from './pins.js';
import {SERIAL_ROUTES,SERIAL_IDS,isSerial,serialFunction} from './serial-config.js';
import {DEFAULT_TIMER_CLOCK_HZ,timerDefaults} from './mcu-defaults.js';
import {DMA_REQUESTS} from './hal-dma.js';
import {familyProfile,routesOf,irqNamesOf,remapFor,DEFAULT_FAMILY,FAMILIES} from './mcu-family.js';
import {nvicProblems,NVIC_GROUP_DEFAULT,TICK_PRIORITY_DEFAULT} from './nvic-config.js';
import {speedsOf,SPEED_NAMES} from './gpio-config.js';
import {validateClockTree,clockFrequencies,clockTreeProblems,adcClockProblem,clockTreeFromIoc,treeFromTimerHz} from './clock-tree.js';
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
// ADC1 Rank 1 Sampling Time in ADC clock cycles (CubeMX ADC_SAMPLETIME_*). The app has always generated the longest one, so
// that stays the default when none is stored; CubeMX's own default is the shortest (3 / 1.5 cycles).
export const ADC_SAMPLING={STM32F446RE:[3,15,28,56,84,112,144,480],STM32F103RB:[1.5,7.5,13.5,28.5,41.5,55.5,71.5,239.5]};
export const adcSamplingDefault=family=>ADC_SAMPLING[family].at(-1);
export const adcSamplingOf=config=>config.peripherals?.ADC1?.samplingTime??adcSamplingDefault(config.family);
/** HAL macro of a sampling time: 480 → ADC_SAMPLETIME_480CYCLES, 239.5 → ADC_SAMPLETIME_239CYCLES_5, 1.5 → ADC_SAMPLETIME_1CYCLE_5. */
export const adcSamplingMacro=cycles=>Number.isInteger(cycles)?`ADC_SAMPLETIME_${cycles}CYCLES`:`ADC_SAMPLETIME_${Math.floor(cycles)}CYCLE${cycles<2?'':'S'}_5`;
export function defaultMcu(family=DEFAULT_FAMILY){const f=familyProfile(family);return {family:f.id,pins:{},peripherals:{},nvic:{},timerClockHz:f.clock.defaultHz};}
/** UART Parameter Settings (CubeMX Asynchronous mode): the first value of each list is CubeMX's default. */
/** SPI Parameter Settings (CubeMX Full-Duplex Master): clock polarity/phase (SPI mode 0-3), data size, first bit. */
export const SPI_PARAMS=Object.freeze({cpol:['LOW','HIGH'],cpha:['1EDGE','2EDGE'],dataSize:[8,16],firstBit:['MSB','LSB']});
/** PWM channel settings: CH Polarity and PWM mode (the first value is CubeMX's default). */
export const TIM_CHANNEL_PARAMS=Object.freeze({polarity:['HIGH','LOW'],ocMode:['PWM1','PWM2']});
/** Output Compare CHn modes (CubeMX OCMode_n; Frozen = TIMING is its default). */
export const TIM_OC_MODES=Object.freeze(['TIMING','ACTIVE','INACTIVE','TOGGLE','FORCED_ACTIVE','FORCED_INACTIVE']);
export const timChannelParams=mode=>mode==='oc'?{...TIM_CHANNEL_PARAMS,ocMode:TIM_OC_MODES}:TIM_CHANNEL_PARAMS;
/** Counter Settings › Counter Mode (CubeMX CounterMode; Up is its default). */
export const TIM_COUNTER_MODES=Object.freeze(['UP','DOWN','CENTERALIGNED1','CENTERALIGNED2','CENTERALIGNED3']);
export const UART_PARAMS=Object.freeze({wordLength:[8,9],parity:['NONE','EVEN','ODD'],stopBits:[1,2],direction:['TX_RX','TX','RX'],overSampling:[16,8]});
export function validateMcu(value){
  if(!value||!Object.hasOwn(FAMILIES,value.family)||!value.pins||!value.peripherals||!value.nvic)throw new Error(`MCU 핀 설정이 필요합니다 (${Object.keys(FAMILIES).join(' / ')}).`);
  const f=familyProfile(value.family),routes=routesOf(f.id);
  const out={family:value.family,pins:{},peripherals:{},nvic:{},timerClockHz:value.timerClockHz??f.clock.defaultHz};
  // CubeMX Clock Configuration (`clock`): the APB1 timer clock follows the tree, so the interpreter and examples keep
  // reading timerClockHz. Without a tree the project keeps the older single HSI setting.
  if(value.clock!==undefined){out.clock=validateClockTree(f.id,value.clock);out.timerClockHz=Math.round(clockFrequencies(f.id,out.clock).tim1);}
  else if(!f.clock.valid(out.timerClockHz))throw new Error(`APB1 타이머 클록 범위: ${f.clock.label}`);
  for(const [pin,p] of Object.entries(value.pins)){
    if(!f.gpioPins.includes(pin)||!p||!pinFunctions(pin,f.id).includes(p.function))throw new Error(`${pin}: ${f.id}에서 지원하지 않는 핀 기능입니다.`);
    if(typeof p.label!=='string'||(p.label&&!/^[A-Za-z_]\w{0,39}$/.test(p.label))||['__proto__','constructor','prototype'].includes(p.label))throw new Error(`${pin}: 라벨은 영문자나 _로 시작하는 C 이름(영문·숫자·_ 40자 이내)으로 쓰세요.`);
    if(!['NOPULL','PULLUP','PULLDOWN'].includes(p.pull)||!['RISING','FALLING','CHANGE'].includes(p.edge)||![0,1].includes(p.initial))throw new Error(`${pin}: GPIO 설정이 올바르지 않습니다.`);
    out.pins[pin]={function:p.function,pull:p.pull,edge:p.edge,label:p.label,initial:p.initial};
    // Optional CubeMX GPIO fields: maximum output speed and push-pull / open-drain output.
    if(p.speed!==undefined){if(!speedsOf(f.pinMux==='remap').includes(p.speed))throw new Error(`${pin}: 최대 출력 속도는 ${speedsOf(f.pinMux==='remap').map(s=>SPEED_NAMES[s]).join(' / ')} 중에서 고르세요.`);out.pins[pin].speed=p.speed;}
    if(p.outputType!==undefined){if(!['PP','OD'].includes(p.outputType))throw new Error(`${pin}: GPIO 출력 방식은 Push Pull 또는 Open Drain입니다.`);out.pins[pin].outputType=p.outputType;}
  }
  for(const [id,p]of Object.entries(value.peripherals)){
    if(!Object.hasOwn(routes,id)||!p||typeof p.enabled!=='boolean')throw new Error(`${id}: ${f.id}에서 지원하지 않는 주변장치입니다.`);
    const q={enabled:p.enabled},defaults=isTimer(id)?timerDefaults(id,f.id):null;
    for(const [key,def,min,max]of isSerial(id)?[['baud',115200,300,2000000]]:id==='I2C1'?[['clock',100000,1000,1000000]]:id==='SPI1'?[['clock',1000000,1000,20000000]]:isTimer(id)?[['prescaler',defaults.prescaler,0,65535],['period',defaults.period,0,f.timerMax(id)],['pulse',defaults.pulse,0,f.timerMax(id)]]:[]){q[key]=p[key]??def;if(!Number.isInteger(q[key])||q[key]<min||q[key]>max)throw new Error(`${id}.${key}: 범위를 확인하세요.`);}
    if(isTimer(id)){q.mode=p.mode??defaults.mode;if(!['base','pwm','oc','capture','encoder'].includes(q.mode))throw new Error(id+': 타이머 모드를 확인하세요.');}
    // Basic timers (TIM6/TIM7): an up counter without channels; TRGO Trigger Event Selection is kept when not Reset.
    if(isBasicTimer(id)){
     if(q.mode!=='base')throw new Error(`${id}: 기본 타이머는 채널이 없어 내부 클록 / 주기 모드만 씁니다.`);
     if(p.counterMode!==undefined&&p.counterMode!=='UP')throw new Error(`${id}: 기본 타이머는 Up 카운터만 있습니다.`);
     if(p.channels!==undefined)throw new Error(`${id}: 기본 타이머에는 채널이 없습니다.`);
    }
    if(p.trgo!==undefined){
     if(!isBasicTimer(id))throw new Error(`${id}: TRGO(Trigger Event Selection)는 기본 타이머 TIM6/TIM7에서 설정합니다.`);
     if(!Object.hasOwn(TIM_TRGO,p.trgo))throw new Error(`${id}.trgo: ${Object.keys(TIM_TRGO).join(' / ')} 중에서 고르세요.`);
     if(p.trgo!=='RESET')q.trgo=p.trgo;
    }
    // Counter Mode: only a non-Up value is kept; the encoder sets the direction itself.
    if(isTimer(id)&&p.counterMode!==undefined){
     if(!TIM_COUNTER_MODES.includes(p.counterMode))throw new Error(`${id}.counterMode: ${TIM_COUNTER_MODES.join(' / ')} 중에서 고르세요.`);
     if(p.counterMode!=='UP'){if(q.mode==='encoder')throw new Error(id+': 엔코더 모드에서는 Counter Mode를 Up으로 두세요.');q.counterMode=p.counterMode;}
    }
    // PWM Generation CHn (CubeMX): each channel's Pulse, CH Polarity and PWM mode; only what differs from the timer's
    // Pulse / High / PWM1 is kept.
    if(isTimer(id)&&p.channels!==undefined){
     if(!p.channels||typeof p.channels!=='object'||Array.isArray(p.channels))throw new Error(id+': 채널 설정을 확인하세요.');
     const channels={};
     for(const [ch,c]of Object.entries(p.channels)){
      if(!/^CH[1-4]$/.test(ch)||!c||typeof c!=='object')throw new Error(`${id}.${ch}: 채널 설정을 확인하세요.`);
      const out={};
      if(c.pulse!==undefined){if(!Number.isInteger(c.pulse)||c.pulse<0||c.pulse>f.timerMax(id))throw new Error(`${id}.${ch}.pulse: 범위를 확인하세요.`);if(c.pulse!==q.pulse)out.pulse=c.pulse;}
      for(const [key,values]of Object.entries(timChannelParams(q.mode))){if(c[key]===undefined)continue;if(!values.includes(c[key]))throw new Error(`${id}.${ch}.${key}: ${values.join(' / ')} 중에서 고르세요.`);if(c[key]!==values[0])out[key]=c[key];}
      if(Object.keys(out).length)channels[ch]=out;
     }
     if(Object.keys(channels).length)q.channels=channels;
    }
    // CubeMX ADC Settings › Continuous Conversion Mode (off = single conversion per HAL_ADC_Start, as CubeMX's default).
    if(id==='ADC1'&&p.samplingTime!==undefined){if(!ADC_SAMPLING[f.id].includes(p.samplingTime))throw new Error(`ADC1 Sampling Time: ${ADC_SAMPLING[f.id].join(' / ')} Cycles 중에서 고르세요.`);if(p.samplingTime!==adcSamplingDefault(f.id))q.samplingTime=p.samplingTime;}
    if(id==='ADC1'&&p.continuous!==undefined){if(typeof p.continuous!=='boolean')throw new Error('ADC1: Continuous Conversion Mode를 확인하세요.');if(p.continuous)q.continuous=true;}
    // CubeMX Parameter Settings of an asynchronous UART (only the values that differ from 8N1 / TX_RX / 16 are kept).
    if(isSerial(id)){
     for(const [key,values]of Object.entries(UART_PARAMS)){if(p[key]===undefined)continue;if(!values.includes(p[key]))throw new Error(`${id}.${key}: ${values.join(' / ')} 중에서 고르세요.`);if(p[key]!==values[0])q[key]=p[key];}
     if(q.overSampling===8&&f.id==='STM32F103RB')throw new Error(`${id}: STM32F103RB의 USART는 Over Sampling 16만 지원합니다.`);
    }
    // I2C1 Parameter Settings: Primary slave address (7-bit, OwnAddress1 = address << 1), Fast Mode Duty Cycle (Tlow/Thigh
    // 2 or 16/9, only above 100 kHz), Clock No Stretch Mode.
    if(id==='I2C1'){
     if(p.ownAddress!==undefined){if(!Number.isInteger(p.ownAddress)||p.ownAddress<0||p.ownAddress>0x7f)throw new Error('I2C1.ownAddress: 7비트 주소(0x00~0x7F)입니다.');if(p.ownAddress)q.ownAddress=p.ownAddress;}
     if(p.dutyCycle!==undefined){if(!['2','16_9'].includes(p.dutyCycle))throw new Error('I2C1.dutyCycle: 2 / 16_9 중에서 고르세요.');if(p.dutyCycle==='16_9'){if(q.clock<=100000)throw new Error('I2C1: Fast Mode Duty Cycle 16/9는 100 kHz보다 빠를 때만 씁니다.');q.dutyCycle='16_9';}}
     if(p.noStretch!==undefined){if(typeof p.noStretch!=='boolean')throw new Error('I2C1.noStretch: true 또는 false입니다.');if(p.noStretch)q.noStretch=true;}
    }
    if(id==='SPI1')for(const [key,values]of Object.entries(SPI_PARAMS)){if(p[key]===undefined)continue;if(!values.includes(p[key]))throw new Error(`SPI1.${key}: ${values.join(' / ')} 중에서 고르세요.`);if(p[key]!==values[0])q[key]=p[key];}
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
  const priority=v=>Number.isInteger(v)&&v>=0&&v<=15;
  for(const [irq,p]of Object.entries(value.nvic)){if(!irqs.includes(irq))throw new Error(`${irq}: ${f.id}에 없는 인터럽트입니다.`);if(!p||typeof p.enabled!=='boolean'||!priority(p.priority)||p.sub!==undefined&&!priority(p.sub))throw new Error(`${irq}: NVIC 우선순위는 0~15 정수로 설정하세요.`);out.nvic[irq]={enabled:p.enabled,priority:p.priority};if(p.sub)out.nvic[irq].sub=p.sub;}
  // CubeMX NVIC Priority Group (NVIC_PRIORITYGROUP_0..4, HAL default 4) and the time base priority (TICK_INT_PRIORITY).
  if(value.nvicGroup!==undefined){if(![0,1,2,3,4].includes(value.nvicGroup))throw new Error('NVIC Priority Group은 0~4입니다.');if(value.nvicGroup!==NVIC_GROUP_DEFAULT)out.nvicGroup=value.nvicGroup;}
  if(value.tickPriority!==undefined){if(!priority(value.tickPriority))throw new Error('SysTick(Time base) 우선순위는 0~15 정수로 설정하세요.');if(value.tickPriority!==TICK_PRIORITY_DEFAULT)out.tickPriority=value.tickPriority;}
  return out;
}
export function configProblems(config){
  const errors=[],signals=new Map(),exti=new Map(),labels=new Set();
  for(const [pin,p]of Object.entries(config.pins)){
    // PA13/PA14 carry SWD: reconfiguring them cuts the ST-LINK off the running board.
    if(['PA13','PA14'].includes(pin)&&!['Reset','Reserved'].includes(p.function))errors.push(`${pin}: SWD 디버그 핀(${pin==='PA13'?'SWDIO':'SWCLK'})이라 다른 기능으로 쓸 수 없습니다. 보드 쓰기와 디버깅이 끊깁니다.`);
    // LABEL_Pin / LABEL_GPIO_Port become macros: a HAL name (GPIO_Pin of HAL_GPIO_EXTI_Callback) or HAL/CMSIS prefix would break the headers.
    if(p.label&&(/^(GPIO|HAL|RCC|NVIC|EXTI|SYSCFG|AFIO|PWR|FLASH|IS|USE|STM32\w*)$/i.test(p.label)||/^(__|HAL_|GPIO_|RCC_|LL_|IS_)/i.test(p.label)))errors.push(`${pin}: 라벨 ${p.label}은 HAL 이름과 겹칩니다 (${p.label}_Pin 매크로). 다른 이름을 쓰세요.`);
    if(p.label){if(labels.has(p.label))errors.push(`사용자 라벨 중복: ${p.label}`);labels.add(p.label);}
    if(p.function==='GPIO_EXTI'){const n=pin.slice(2);if(exti.has(n))errors.push(`EXTI${n}: ${exti.get(n)}와 ${pin} 충돌`);exti.set(n,pin);}
    if(!MODES.includes(p.function)){if(signals.has(p.function))errors.push(`${p.function}: 핀을 하나만 지정하세요.`);signals.set(p.function,pin);}
    const serial=serialFunction(p.function)||/^(USART\d)_CK$/.exec(p.function)?.[1];if(serial&&!config.peripherals[serial]?.enabled)errors.push(`${pin}: ${serial} 주변장치를 활성화하세요.`);
    const owner=p.function.split('_')[0];if(!serial&&!MODES.includes(p.function)&&routesOf(config.family)[owner]&&!config.peripherals[owner]?.enabled)errors.push(`${pin}: ${owner} 주변장치를 활성화하세요.`);
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
    if(isTimer(id)&&['pwm','oc','capture'].includes(p.mode)&&![...signals.keys()].some(k=>k.startsWith(id+'_CH')))errors.push(id+': 채널 핀을 활성화하세요.');
    if(id==='ADC1'&&![...signals.keys()].some(k=>k.startsWith('ADC1_IN')))errors.push('ADC1: 입력 채널을 활성화하세요.');
  }
  // F1: every signal of a peripheral must sit on one AFIO remap option (default or remapped pins together).
  const family=familyProfile(config.family??DEFAULT_FAMILY);
  if(family.pinMux==='remap')for(const id of Object.keys(family.remaps)){
    const assigned=Object.fromEntries(Object.entries(config.pins).filter(([,p])=>p.function.startsWith(id+'_')).map(([pin,p])=>[p.function.slice(id.length+1),pin]));
    if(Object.keys(assigned).length&&!remapFor(family.id,id,assigned))errors.push(`${id}: ${Object.entries(assigned).map(([s,pin])=>`${s}=${pin}`).join(', ')} 조합은 ${family.id}에서 쓸 수 없습니다. 함께 옮겨지는 핀 묶음: ${family.remaps[id].map(o=>Object.entries(o.pins).map(([s,pin])=>`${s} ${pin}`).join('/')).join(' 또는 ')}`);
  }
  for(const [irq,n]of Object.entries(config.nvic||{})){const id=timerOfIrq(irq)??irq.replace(/_IRQn$/,'');if(n.enabled&&(isSerial(id)||isTimer(id))&&!config.peripherals[id]?.enabled)errors.push(`${irq}: ${id} 주변장치를 활성화하거나 인터럽트를 끄세요.`);}
  for(const [request,d]of Object.entries(config.dma||{})){const id=dmaPeripheral(request);if(id&&!config.peripherals[id]?.enabled)errors.push(`${request} DMA: ${id} 주변장치를 활성화하세요.`);if(id&&isTimer(id)&&config.peripherals[id].mode!=='pwm')errors.push(`${request} DMA: ${id}를 PWM 모드로 설정하세요.`);}
  errors.push(...nvicProblems(config));
  if(config.clock){errors.push(...clockTreeProblems(config.family,config.clock));if(config.peripherals.ADC1?.enabled){const adc=adcClockProblem(config.family,config.clock);if(adc)errors.push(adc);}}
  return errors;
}
// CubeMX keeps parameter expressions as typed ("84-1", "1000*2"): + - * / and parentheses on integers only.
export function evalIocNumber(raw){
  const text=String(raw).trim();if(!/^[\dxXa-fA-F\s+\-*/()]+$/.test(text))return null;let i=0;
  const skip=()=>{while(text[i]===' ')i++;},atom=()=>{skip();if(text[i]==='('){i++;const v=sum();skip();if(text[i++]!==')')throw 0;return v;}if(text[i]==='-'){i++;return -atom();}const m=/^0[xX][\da-fA-F]+|^\d+/.exec(text.slice(i));if(!m)throw 0;i+=m[0].length;return Number(m[0]);};
  const product=()=>{let v=atom();for(skip();text[i]==='*'||text[i]==='/';skip()){const op=text[i++],r=atom();v=op==='*'?v*r:v/r;}return v;},sum=()=>{let v=product();for(skip();text[i]==='+'||text[i]==='-';skip()){const op=text[i++],r=product();v=op==='+'?v+r:v-r;}return v;};
  try{const v=sum();skip();return i===text.length&&Number.isInteger(v)?v:null;}catch{return null;}
}
export function importIoc(text){
  if(typeof text!=='string'||text.length>500000)throw new Error('.ioc 파일은 500 KB 이하로 선택하세요.');
  // CubeMX writes keys as Java properties: spaces and # are escaped ("TIM2.Pulse-PWM\ Generation1\ CH1").
  const values=Object.fromEntries(text.split(/\r?\n/).filter(l=>l&&!l.startsWith('#')&&l.includes('=')).map(l=>[l.slice(0,l.indexOf('=')).replace(/\\(.)/g,'$1'),l.slice(l.indexOf('=')+1).replaceAll('\\:',':')]));
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
    let fn=signal==='GPIO_Analog'?'Analog':signal==='GPIO_Output'?'GPIO_Output':signal==='GPIO_Input'?'GPIO_Input':signal.startsWith('GPXTI')?'GPIO_EXTI':/^S_TIM\d+_CH\d$/.test(signal)?signal.slice(2):/^ADC(?:x|\d+)_IN\d+$/.test(signal)?'ADC1_'+signal.split('_')[1]:signal;
    if(!pinFunctions(pin,family).includes(fn)){fn='Reserved';if(!/^(SYS_|RCC_)/.test(signal))warnings.push(`${pin}: ${signal} 실행 모델 미지원`);}
    const pull=(values[base+'.GPIO_PuPd']||'GPIO_NOPULL').replace('GPIO_','');
    // CubeMX omits GPIO_ModeDefaultEXTI for its default, rising edge.
    const extiMode=values[base+'.GPIO_ModeDefaultEXTI']||(fn==='GPIO_EXTI'?'GPIO_MODE_IT_RISING':''),edge=extiMode.includes('RISING_FALLING')?'CHANGE':extiMode.includes('RISING')?'RISING':'FALLING';
    // Board templates label pins like "B1 [Blue PushButton]"; the C name is the first word.
    const rawLabel=values[base+'.GPIO_Label']||'',label=rawLabel.split(/[\s[]/)[0];
    if(label&&(!/^[A-Za-z_]\w{0,39}$/.test(label)||['__proto__','constructor','prototype'].includes(label)))warnings.push(`${pin}: 라벨 "${rawLabel}"은 C 이름으로 쓸 수 없어 비웠습니다.`);
    config.pins[pin]={function:fn,pull,edge,label:/^[A-Za-z_]\w{0,39}$/.test(label)&&!['__proto__','constructor','prototype'].includes(label)?label:'',initial:values[base+'.PinState']==='GPIO_PIN_SET'?1:0};
    // GPIO_Speed (absent = CubeMX default) and an open-drain output (GPIO_ModeDefaultOutputPP).
    const speed=/^GPIO_SPEED_FREQ_(LOW|MEDIUM|HIGH|VERY_HIGH)$/.exec(values[base+'.GPIO_Speed']||'')?.[1];
    if(speed&&speedsOf(f.pinMux==='remap').includes(speed)&&fn!=='Reserved')config.pins[pin].speed=speed;
    if(fn==='GPIO_Output'&&values[base+'.GPIO_ModeDefaultOutputPP']==='GPIO_MODE_OUTPUT_OD')config.pins[pin].outputType='OD';
  }
  for(const id of Object.keys(routes)){
    const enabled=Object.values(config.pins).some(p=>p.function.startsWith(id+'_'))||Object.entries(values).some(([k,v])=>/^Mcu.IP\d+$/.test(k)&&v===id);
    if(enabled)config.peripherals[id]={enabled:true};
  }
  for(const id of Object.keys(f.serial))if(config.peripherals[id]){
    const p=config.peripherals[id];p.baud=number(values[id+'.BaudRate'],115200);
    // A pin carrying USARTx_CK means CubeMX's synchronous mode.
    const w=values[id+'.WordLength'],par=values[id+'.Parity'],stop=values[id+'.StopBits'],mode=values[id+'.Mode'],over=values[id+'.OverSampling'];
    if(/9B/.test(w||''))p.wordLength=9;if(/EVEN/.test(par||''))p.parity='EVEN';else if(/ODD/.test(par||''))p.parity='ODD';if(/STOPBITS_2/.test(stop||''))p.stopBits=2;
    if(/MODE_TX$/.test(mode||''))p.direction='TX';else if(/MODE_RX$/.test(mode||''))p.direction='RX';if(/OVERSAMPLING_8/.test(over||'')&&f.id!=='STM32F103RB')p.overSampling=8;
    if(Object.values(config.pins).some(q=>q.function===id+'_CK'))Object.assign(p,{mode:'synchronous',cpol:values[id+'.CLKPolarity']==='USART_POLARITY_HIGH'?1:0,cpha:values[id+'.CLKPhase']==='USART_PHASE_2EDGE'?1:0,lastBit:values[id+'.CLKLastBit']==='USART_LASTBIT_ENABLE'?1:0});
  }
  if(config.peripherals.I2C1){const c=config.peripherals.I2C1;c.clock=number(values['I2C1.ClockSpeed'],100000);const own=Number(values['I2C1.OwnAddress']);if(Number.isInteger(own)&&own>0)c.ownAddress=(own>>1)&0x7f; /* the value CubeMX writes to OwnAddress1 (address << 1) */if(/16_9/.test(values['I2C1.DutyCycle']||'')&&c.clock>100000)c.dutyCycle='16_9';if(/NOSTRETCH_ENABLE/.test(values['I2C1.NoStretchMode']||''))c.noStretch=true;}
  if(config.peripherals.ADC1&&values['ADC1.ContinuousConvMode']==='ENABLE')config.peripherals.ADC1.continuous=true;
  // Rank 1 Sampling Time (ADC1.SamplingTime-0\#ChannelRegularConversion); a .ioc without it has CubeMX's default, the shortest.
  if(config.peripherals.ADC1){const key=Object.keys(values).find(k=>/^ADC1\.SamplingTime-0\\?#ChannelRegularConversion$/.test(k)),m=/ADC_SAMPLETIME_(\d+)CYCLES?(_5)?/.exec(values[key]||''),cycles=m?Number(m[1])+(m[2]?0.5:0):ADC_SAMPLING[family][0];if(ADC_SAMPLING[family].includes(cycles)&&cycles!==adcSamplingDefault(family))config.peripherals.ADC1.samplingTime=cycles;}
  // SPI1 speed: CubeMX stores the computed rate ("5.25 MBits/s") next to the prescaler.
  if(config.peripherals.SPI1){const s=config.peripherals.SPI1;if(/HIGH/.test(values['SPI1.CLKPolarity']||''))s.cpol='HIGH';if(/2EDGE/.test(values['SPI1.CLKPhase']||''))s.cpha='2EDGE';if(/16BIT/.test(values['SPI1.DataSize']||''))s.dataSize=16;if(/LSB/.test(values['SPI1.FirstBit']||''))s.firstBit='LSB';}
  if(config.peripherals.SPI1){const m=/^([\d.]+)\s*([KM]?)Bits\/s/i.exec(values['SPI1.CalculateBaudRate']||'');if(m)config.peripherals.SPI1.clock=Math.min(20000000,Math.max(1000,Math.round(Number(m[1])*({K:1e3,M:1e6}[m[2].toUpperCase()]??1))));}
  for(const id of Object.keys(f.timers))if(config.peripherals[id]){const p=config.peripherals[id],defaults=timerDefaults(id,family);p.prescaler=number(values[id+'.Prescaler'],defaults.prescaler);p.period=number(values[id+'.Period'],defaults.period);const pulse=Object.keys(values).find(k=>k.startsWith(id+'.Pulse'));if(pulse)p.pulse=number(values[pulse],defaults.pulse);const settings=Object.entries(values).filter(([k])=>k.startsWith(id+'.')).map(([,v])=>v).join(' ');p.mode=/Encoder|ENCODER/.test(settings)?'encoder':/PWM/.test(settings)?'pwm':/Output Compare\d CH\d/.test(settings)?'oc':/INPUTCAPTURE|Input_Capture|IC_CHANNEL/.test(settings)?'capture':'base';
    const counter=/TIM_COUNTERMODE_(\w+)/.exec(values[id+'.CounterMode']||'')?.[1];if(counter&&counter!=='UP'&&TIM_COUNTER_MODES.includes(counter)&&p.mode!=='encoder'&&!isBasicTimer(id))p.counterMode=counter;
    // TIM6/TIM7 TRGO Parameters (TIM6.TIM_MasterOutputTrigger=TIM_TRGO_UPDATE); the basic timers have only the time base.
    if(isBasicTimer(id)){p.mode='base';const trgo=/^TIM_TRGO_(RESET|ENABLE|UPDATE)$/.exec(values[id+'.TIM_MasterOutputTrigger']||'')?.[1];if(trgo&&trgo!=='RESET')p.trgo=trgo;}}
  // Per-channel settings: PWM "TIM2.Pulse-PWM Generation1 CH1", "TIM2.OCPolarity_1", "TIM2.OCMode_PWM-PWM Generation1 CH1";
  // Output Compare "TIM2.Pulse-Output Compare1 CH1", "TIM2.OCMode_1" (TIM_OCMODE_TIMING when missing, as CubeMX).
  for(const id of Object.keys(f.timers))if(['pwm','oc'].includes(config.peripherals[id]?.mode)){
   const p=config.peripherals[id],oc=p.mode==='oc',ch={},name=oc?'Output Compare':'PWM Generation';const at=n=>ch['CH'+n]??={};
   for(const [k,v]of Object.entries(values)){
    let m=new RegExp('^'+id+'\\.Pulse-'+name+'(\\d) CH\\d$').exec(k);if(m){at(m[1]).pulse=number(v,p.pulse);continue;}
    m=new RegExp('^'+id+'\\.OCPolarity_(\\d)(?:-.*)?$').exec(k);if(m&&/LOW/.test(v)){at(m[1]).polarity='LOW';continue;}
    m=new RegExp('^'+id+'\\.OCMode_PWM-PWM Generation(\\d) CH\\d$').exec(k);if(!oc&&m&&/PWM2/.test(v)){at(m[1]).ocMode='PWM2';continue;}
    m=new RegExp('^'+id+'\\.OCMode_(\\d)(?:-.*)?$').exec(k);const mode=/TIM_OCMODE_(\w+)/.exec(v)?.[1];if(oc&&m&&mode!=='TIMING'&&TIM_OC_MODES.includes(mode))at(m[1]).ocMode=mode;
   }
   for(const c of Object.values(ch))if(c.pulse===p.pulse)delete c.pulse;
   for(const [n,c]of Object.entries(ch))if(!Object.keys(c).length)delete ch[n];
   if(Object.keys(ch).length)p.channels=ch;
  }
  config.timerClockHz=number(values['RCC.APB1TimFreq_Value'],f.clock.defaultHz);
  // The .ioc clock tree: kept as the project's Clock Configuration unless the single APB1 timer clock gives the same clocks.
  const tree=clockTreeFromIoc(f.id,values);
  if(tree){const q=clockFrequencies(f.id,tree),hz=Math.round(q.tim1),old=f.clock.valid(hz)?clockFrequencies(f.id,treeFromTimerHz(f.id,hz)):null;
   const same=old&&['sysclk','hclk','pclk1','pclk2','adc'].every(k=>Math.abs(old[k]-q[k])<1);
   if(same)config.timerClockHz=hz;else{config.clock=tree;config.timerClockHz=hz;for(const p of clockTreeProblems(f.id,tree))warnings.push('클록 설정: '+p);}}
  // HSE/other PLL setups (F103 at 72 MHz) cannot be rebuilt from HSI: keep the nearest clock the generator can make.
  if(!config.clock&&!f.clock.valid(config.timerClockHz)){const wanted=config.timerClockHz,hz=f.clock.valid(Math.min(f.clock.maxHz,Math.round(wanted/4e6)*4e6))?Math.min(f.clock.maxHz,Math.round(wanted/4e6)*4e6):f.clock.exampleHz;warnings.push(`APB1 타이머 클록 ${wanted/1e6} MHz는 HSI로 만들 수 없어 ${hz/1e6} MHz로 바꿨습니다 (${f.clock.label}). 타이머 Prescaler/Period를 확인하세요.`);config.timerClockHz=hz;}
  // DMA: Dma.<request>.<n>.Instance/Channel/Mode/Priority; a request this model cannot route is reported, not dropped silently.
  const requests=dmaRequestsOf(family),dma={};
  for(const [key,request]of Object.entries(values)){
    if(!/^Dma\.Request\d+$/.test(key))continue;const base=Object.keys(values).find(k=>new RegExp(`^Dma\\.${request}\\.\\d+\\.Instance$`).test(k))?.slice(0,-9);
    const q=base&&{stream:values[base+'.Instance'],channel:Number(/\d+$/.exec(values[base+'.Channel']||'')?.[0]??0),mode:values[base+'.Mode']==='DMA_CIRCULAR'?'circular':'normal',priority:(values[base+'.Priority']||'DMA_PRIORITY_LOW').replace('DMA_PRIORITY_','').toLowerCase()};
    try{if(!requests[request]||!q)throw new Error();validateMcu({...defaultMcu(family),dma:{...dma,[request]:q}});dma[request]=q;}catch{warnings.push(`${request} DMA: 실행 모델에서 같은 설정을 쓸 수 없어 가져오지 않았습니다.`);}
  }
  if(Object.keys(dma).length)config.dma=dma;
  // NVIC.<irq>=enabled:preemption:sub:…; NVIC.PriorityGroup; the time base priority is TICK_INT_PRIORITY.
  for(const irq of irqNamesOf(family)){const raw=values['NVIC.'+irq];if(raw){const [enabled,priority,sub]=raw.split(':');config.nvic[irq]={enabled:enabled==='true',priority:Number(priority)};if(Number(sub))config.nvic[irq].sub=Number(sub);}}
  const group=/^NVIC_PRIORITYGROUP_([0-4])$/.exec(values['NVIC.PriorityGroup']||'');if(group)config.nvicGroup=Number(group[1]);
  const tick=values['NVIC.SysTick_IRQn']?.split(':');if(tick&&Number.isInteger(Number(tick[1])))config.tickPriority=Number(tick[1]);
  for(const [key,v]of Object.entries(values))if(/^Mcu.IP\d+$/.test(key)&&!Object.hasOwn(routes,v)&&!['GPIO','RCC','NVIC','SYS','NUCLEO-F446RE','NUCLEO-F103RB'].includes(v))warnings.push(`${v}: 실행 모델 미지원`);
  const clean=validateMcu(config);return {config:clean,warnings:[...new Set([...warnings,...configProblems(clean)])]};
}
export function generateHal(config,options){const clean=validateMcu(config),errors=configProblems(clean);if(errors.length)throw new Error(errors.join('\n'));return generateMain(clean,options);}
