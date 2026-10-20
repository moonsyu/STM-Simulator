import {TIMER_ROUTES,TIMER_IDS,isTimer,timerMax} from './timer-config.js';
import {generateMain} from './hal-generator.js';
import {GPIO_PINS} from './pins.js';
import {SERIAL_ROUTES,SERIAL_IDS,isSerial,serialFunction} from './serial-config.js';
import {DEFAULT_TIMER_CLOCK_HZ,timerDefaults} from './mcu-defaults.js';
import {DMA_REQUESTS,DMA_STREAMS} from './hal-dma.js';
// Synchronous USART clock outputs on F446RE LQFP64 (DS10693 table 11): AF7 USART1/2/3, AF8 USART6.
export const USART_CK_ROUTES={USART1:['PA8'],USART2:['PA4'],USART3:['PB12','PC12'],USART6:['PC8']};
export const DMA_MODES=['normal','circular'],DMA_PRIORITIES=['low','medium','high','very_high'];
// Peripheral of each DMA request (used to require that peripheral to be enabled).
export const dmaPeripheral=request=>request==='MEMTOMEM'?null:request==='ADC1'||request==='DCMI'?request:request.startsWith('SDIO')?'SDIO':request.replace(/_(RX|TX|CH\d)$/,'');
export const dmaDirection=request=>request==='MEMTOMEM'?'M2M':/_RX$|^ADC1$|^DCMI$/.test(request)?'P2M':'M2P';

// F446RE routes used by this simulator. Peripheral alternatives are explicit;
// choosing a peripheral never assigns an arbitrary GPIO as an alternate function.
export const ROUTES = {
  ...SERIAL_ROUTES,
  I2C1: {SCL:['PB6','PB8'],SDA:['PB7','PB9']},
  SDIO: {D0:['PC8'],D1:['PC9'],D2:['PC10'],D3:['PC11'],CK:['PC12'],CMD:['PD2']},
  DCMI: {},
  SPI1: {SCK:['PA5','PB3'],MISO:['PA6','PB4'],MOSI:['PA7','PB5']},
  ADC1: Object.fromEntries(['PA0','PA1','PA2','PA3','PA4','PA5','PA6','PA7','PB0','PB1','PC0','PC1','PC2','PC3','PC4','PC5'].map((p,i)=>['IN'+i,[p]])),
  ...TIMER_ROUTES
};
export const IRQ_NAMES=['EXTI0_IRQn','EXTI1_IRQn','EXTI2_IRQn','EXTI3_IRQn','EXTI4_IRQn','EXTI9_5_IRQn','EXTI15_10_IRQn',...SERIAL_IDS.map(id=>id+'_IRQn'),...TIMER_IDS.map(id=>id+'_IRQn'),'ADC_IRQn','SPI1_IRQn','I2C1_EV_IRQn','I2C1_ER_IRQn','DCMI_IRQn','SDIO_IRQn',...DMA_STREAMS.map(s=>s+'_IRQn')];
export const MODES=['Reset','GPIO_Input','GPIO_Output','GPIO_EXTI','Analog','Reserved'];
export const irqForPin=pin=>{const n=Number(pin.slice(2));return n<5?`EXTI${n}_IRQn`:n<10?'EXTI9_5_IRQn':'EXTI15_10_IRQn';};
export function pinFunctions(pin){return [...MODES,...Object.entries(ROUTES).flatMap(([id,routes])=>Object.entries(routes).filter(([,pins])=>pins.includes(pin)).map(([signal])=>`${id}_${signal}`)),...Object.entries(USART_CK_ROUTES).filter(([,pins])=>pins.includes(pin)).map(([id])=>id+'_CK')];}
export function defaultMcu(){return {family:'STM32F446RE',pins:{},peripherals:{},nvic:{},timerClockHz:DEFAULT_TIMER_CLOCK_HZ};}
export function validateMcu(value){
  if(!value||value.family!=='STM32F446RE'||!value.pins||!value.peripherals||!value.nvic)throw new Error('STM32F446RE 핀 설정이 필요합니다.');
  const out={family:value.family,pins:{},peripherals:{},nvic:{},timerClockHz:value.timerClockHz??DEFAULT_TIMER_CLOCK_HZ};
  if(!Number.isInteger(out.timerClockHz)||out.timerClockHz<1000000||out.timerClockHz>180000000)throw new Error('APB1 타이머 클록 범위: 1~180 MHz');
  for(const [pin,p] of Object.entries(value.pins)){
    if(!GPIO_PINS.includes(pin)||!p||!pinFunctions(pin).includes(p.function))throw new Error(`${pin}: 지원하지 않는 핀 기능입니다.`);
    if(!['NOPULL','PULLUP','PULLDOWN'].includes(p.pull)||!['RISING','FALLING','CHANGE'].includes(p.edge)||![0,1].includes(p.initial)||typeof p.label!=='string'||(p.label&&!/^[A-Za-z_]\w{0,39}$/.test(p.label))||['__proto__','constructor','prototype'].includes(p.label))throw new Error(`${pin}: GPIO 설정이 올바르지 않습니다.`);
    out.pins[pin]={function:p.function,pull:p.pull,edge:p.edge,label:p.label,initial:p.initial};
  }
  for(const [id,p]of Object.entries(value.peripherals)){
    if(!Object.hasOwn(ROUTES,id)||!p||typeof p.enabled!=='boolean')throw new Error(`${id}: 지원하지 않는 주변장치입니다.`);
    const q={enabled:p.enabled},defaults=isTimer(id)?timerDefaults(id):null;
    for(const [key,def,min,max]of isSerial(id)?[['baud',115200,300,2000000]]:id==='I2C1'?[['clock',100000,1000,1000000]]:id==='SPI1'?[['clock',1000000,1000,20000000]]:isTimer(id)?[['prescaler',defaults.prescaler,0,65535],['period',defaults.period,0,timerMax(id)],['pulse',defaults.pulse,0,timerMax(id)]]:[]){q[key]=p[key]??def;if(!Number.isInteger(q[key])||q[key]<min||q[key]>max)throw new Error(`${id}.${key}: 범위를 확인하세요.`);}
    if(isTimer(id)){q.mode=p.mode??defaults.mode;if(!['base','pwm','capture','encoder'].includes(q.mode))throw new Error(id+': 타이머 모드를 확인하세요.');}
    if(isSerial(id)&&p.mode!==undefined&&p.mode!=='asynchronous'){if(p.mode!=='synchronous'||!USART_CK_ROUTES[id])throw new Error(id+': 동기 모드는 USART1/2/3/6에서만 지원합니다.');q.mode='synchronous';for(const [key,values]of [['cpol',[0,1]],['cpha',[0,1]],['lastBit',[0,1]]]){q[key]=p[key]??0;if(!values.includes(q[key]))throw new Error(`${id}.${key}: 0 또는 1입니다.`);}}
    out.peripherals[id]=q;
  }
  if(value.dma!==undefined){
    if(!value.dma||typeof value.dma!=='object'||Array.isArray(value.dma))throw new Error('DMA 설정을 확인하세요.');out.dma={};const streams=new Map();
    for(const [request,d]of Object.entries(value.dma)){
      const options=DMA_REQUESTS[request];if(!options||!d)throw new Error(`${request}: 지원하지 않는 DMA 요청입니다.`);
      const q={stream:d.stream??options[0][0],channel:d.channel??options[0][1]??0,mode:d.mode??'normal',priority:d.priority??'low'};
      if(!options.some(([s,c])=>s===q.stream&&(c===null||c===q.channel)))throw new Error(`${request}: ${q.stream} 채널 ${q.channel} 조합은 사용할 수 없습니다.`);
      if(!DMA_MODES.includes(q.mode)||!DMA_PRIORITIES.includes(q.priority)||request==='MEMTOMEM'&&q.mode==='circular')throw new Error(`${request}: DMA 모드/우선순위를 확인하세요.`);
      if(streams.has(q.stream))throw new Error(`${q.stream}: ${streams.get(q.stream)}와 ${request}가 같은 스트림을 사용합니다.`);streams.set(q.stream,request);out.dma[request]=q;
    }
  }
  for(const [irq,p]of Object.entries(value.nvic)){if(!IRQ_NAMES.includes(irq)||!p||typeof p.enabled!=='boolean'||!Number.isInteger(p.priority)||p.priority<0||p.priority>15)throw new Error('NVIC 설정을 확인하세요.');out.nvic[irq]={enabled:p.enabled,priority:p.priority};}
  return out;
}
export function configProblems(config){
  const errors=[],signals=new Map(),exti=new Map(),labels=new Set();
  for(const [pin,p]of Object.entries(config.pins)){
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
    if(isTimer(id)&&['pwm','capture'].includes(p.mode)&&![...signals.keys()].some(k=>k.startsWith(id+'_CH')))errors.push(id+': 채널 핀을 활성화하세요.');
    if(id==='ADC1'&&![...signals.keys()].some(k=>k.startsWith('ADC1_IN')))errors.push('ADC1: 입력 채널을 활성화하세요.');
  }
  for(const [request,d]of Object.entries(config.dma||{})){const id=dmaPeripheral(request);if(id&&!config.peripherals[id]?.enabled)errors.push(`${request} DMA: ${id} 주변장치를 활성화하세요.`);if(id&&isTimer(id)&&config.peripherals[id].mode!=='pwm')errors.push(`${request} DMA: ${id}를 PWM 모드로 설정하세요.`);}
  return errors;
}
export function importIoc(text){
  if(typeof text!=='string'||text.length>500000)throw new Error('.ioc 파일은 500 KB 이하로 선택하세요.');
  const values=Object.fromEntries(text.split(/\r?\n/).filter(l=>l&&!l.startsWith('#')&&l.includes('=')).map(l=>[l.slice(0,l.indexOf('=')),l.slice(l.indexOf('=')+1).replaceAll('\\:',':')]));
  if(!/^STM32F446R/.test(values['Mcu.Name']||values['Mcu.CPN']||''))throw new Error('STM32F446RE 설정만 지원합니다.');
  const config=defaultMcu();config.pins={};const warnings=[];
  for(const [key,signal]of Object.entries(values)){
    const m=/^(P[A-H]\d+)(?:-[^.]+)?\.Signal$/.exec(key);if(!m)continue;const pin=m[1],base=key.slice(0,-7);
    if(!GPIO_PINS.includes(pin)){warnings.push(`${pin}: 보드에서 접근할 수 없는 핀`);continue;}
    let fn=signal==='GPIO_Output'?'GPIO_Output':signal==='GPIO_Input'?'GPIO_Input':signal.startsWith('GPXTI')?'GPIO_EXTI':/^S_TIM\d+_CH\d$/.test(signal)?signal.slice(2):signal;
    if(!pinFunctions(pin).includes(fn)){fn='Reserved';if(!/^(SYS_|RCC_)/.test(signal))warnings.push(`${pin}: ${signal} 실행 모델 미지원`);}
    const pull=(values[base+'.GPIO_PuPd']||'GPIO_NOPULL').replace('GPIO_','');
    const edge=(values[base+'.GPIO_ModeDefaultEXTI']||'').includes('RISING_FALLING')?'CHANGE':(values[base+'.GPIO_ModeDefaultEXTI']||'').includes('RISING')?'RISING':'FALLING';
    config.pins[pin]={function:fn,pull,edge,label:values[base+'.GPIO_Label']||'',initial:values[base+'.PinState']==='GPIO_PIN_SET'?1:0};
  }
  for(const id of Object.keys(ROUTES)){
    const enabled=Object.values(config.pins).some(p=>p.function.startsWith(id+'_'))||Object.entries(values).some(([k,v])=>/^Mcu.IP\d+$/.test(k)&&v===id);
    if(enabled)config.peripherals[id]={enabled:true};
  }
  for(const id of SERIAL_IDS)if(config.peripherals[id])config.peripherals[id].baud=Number(values[id+'.BaudRate']||115200);
  if(config.peripherals.I2C1)config.peripherals.I2C1.clock=Number(values['I2C1.ClockSpeed']||100000);
  for(const id of TIMER_IDS)if(config.peripherals[id]){const p=config.peripherals[id],defaults=timerDefaults(id);p.prescaler=Number(values[id+'.Prescaler']??defaults.prescaler);p.period=Number(values[id+'.Period']??defaults.period);const settings=Object.entries(values).filter(([k])=>k.startsWith(id+'.')).map(([,v])=>v).join(' ');p.mode=/Encoder|ENCODER/.test(settings)?'encoder':/PWM/.test(settings)?'pwm':/INPUTCAPTURE|Input_Capture|IC_CHANNEL/.test(settings)?'capture':'base';}
  config.timerClockHz=Number(values['RCC.APB1TimFreq_Value']??DEFAULT_TIMER_CLOCK_HZ);
  for(const irq of IRQ_NAMES){const raw=values['NVIC.'+irq];if(raw){const [enabled,priority]=raw.split(':');config.nvic[irq]={enabled:enabled==='true',priority:Number(priority)};}}
  for(const [key,v]of Object.entries(values))if(/^Mcu.IP\d+$/.test(key)&&!Object.hasOwn(ROUTES,v)&&!['GPIO','RCC','NVIC','SYS','NUCLEO-F446RE'].includes(v))warnings.push(`${v}: 실행 모델 미지원`);
  const clean=validateMcu(config);return {config:clean,warnings:[...new Set([...warnings,...configProblems(clean)])]};
}
export function generateHal(config,options){const clean=validateMcu(config),errors=configProblems(clean);if(errors.length)throw new Error(errors.join('\n'));return generateMain(clean,options);}
