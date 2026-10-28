import {CatalogPeripherals,CATALOG_HAL_CONSTANTS} from './catalog-peripherals.js';
import {TIMER_IDS,timerAf} from './timer-config.js';
import {HalTimers} from './hal-timers.js';
import {validateMcu,configProblems,irqForPin,IRQ_NAMES} from './mcu-config.js';
import {BusDevices} from './buses.js';
import {SERIAL_IDS,isSerial,serialAf,serialFunction} from './serial-config.js';
import {formatPrintf} from './hal-stdio.js';
import {Nvic,NVIC_CONSTANTS,IRQ_NUMBERS,SYSTICK} from './hal-nvic.js';
import {HalDma,DMA_CONSTANTS} from './hal-dma.js';
import {HalUsart,USART_CONSTANTS} from './hal-usart.js';
import {HalDcmi,DCMI_CONSTANTS} from './hal-dcmi.js';
import {HalStorage,STORAGE_CONSTANTS} from './hal-storage.js';
import {familyProfile,remapFor,irqNamesOf} from './mcu-family.js';

export const HAL_CONSTANTS={...CATALOG_HAL_CONSTANTS,HAL_OK:0,HAL_ERROR:1,HAL_BUSY:2,HAL_TIMEOUT:3,HAL_MAX_DELAY:4294967295,
  GPIO_PIN_RESET:0,GPIO_PIN_SET:1,GPIO_MODE_INPUT:0,GPIO_MODE_OUTPUT_PP:1,GPIO_MODE_OUTPUT_OD:17,GPIO_MODE_AF_PP:2,GPIO_MODE_AF_OD:18,GPIO_MODE_ANALOG:3,
  GPIO_MODE_IT_RISING:0x10110000,GPIO_MODE_IT_FALLING:0x10210000,GPIO_MODE_IT_RISING_FALLING:0x10310000,GPIO_NOPULL:0,GPIO_PULLUP:1,GPIO_PULLDOWN:2,
  GPIO_SPEED_FREQ_LOW:0,GPIO_SPEED_FREQ_MEDIUM:1,GPIO_SPEED_FREQ_HIGH:2,GPIO_SPEED_FREQ_VERY_HIGH:3,
  ENABLE:1,DISABLE:0,RESET:0,SET:1,UART_WORDLENGTH_8B:0,UART_WORDLENGTH_9B:4096,UART_STOPBITS_1:0,UART_STOPBITS_2:8192,UART_PARITY_NONE:0,UART_PARITY_EVEN:1024,UART_PARITY_ODD:1536,UART_MODE_TX_RX:12,UART_MODE_RX:4,UART_MODE_TX:8,UART_HWCONTROL_NONE:0,UART_OVERSAMPLING_16:0,
  I2C_ADDRESSINGMODE_7BIT:16384,I2C_ADDRESSINGMODE_10BIT:49152,I2C_DUTYCYCLE_2:0,I2C_DUALADDRESS_DISABLE:0,I2C_GENERALCALL_DISABLE:0,I2C_NOSTRETCH_DISABLE:0,I2C_MEMADD_SIZE_8BIT:1,I2C_MEMADD_SIZE_16BIT:16,
  SPI_MODE_MASTER:260,SPI_MODE_SLAVE:0,SPI_DIRECTION_2LINES:0,SPI_DATASIZE_8BIT:0,SPI_DATASIZE_16BIT:2048,SPI_POLARITY_LOW:0,SPI_POLARITY_HIGH:2,SPI_PHASE_1EDGE:0,SPI_PHASE_2EDGE:1,SPI_NSS_SOFT:512,SPI_FIRSTBIT_MSB:0,SPI_FIRSTBIT_LSB:128,SPI_TIMODE_DISABLE:0,SPI_CRCCALCULATION_DISABLE:0,
  ADC_RESOLUTION_12B:0,ADC_DATAALIGN_RIGHT:0,ADC_SCAN_DISABLE:0,ADC_SOFTWARE_START:0,ADC_EXTERNALTRIGCONVEDGE_NONE:0,ADC_EOC_SINGLE_CONV:1,ADC_CLOCK_SYNC_PCLK_DIV4:65536,ADC_SAMPLETIME_3CYCLES:0,ADC_SAMPLETIME_480CYCLES:7,
  TIM_COUNTERMODE_UP:0,TIM_CLOCKDIVISION_DIV1:0,TIM_AUTORELOAD_PRELOAD_DISABLE:0,TIM_CLOCKSOURCE_INTERNAL:0,TIM_TRGO_RESET:0,TIM_MASTERSLAVEMODE_DISABLE:0,TIM_OCMODE_PWM1:96,TIM_OCPOLARITY_HIGH:0,TIM_OCFAST_DISABLE:0,TIM_CHANNEL_ALL:60,TIM_ICPOLARITY_RISING:0,TIM_ICPOLARITY_FALLING:2,TIM_ICPOLARITY_BOTHEDGE:10,TIM_ICSELECTION_DIRECTTI:1,TIM_ICSELECTION_INDIRECTTI:2,TIM_ICPSC_DIV1:0,TIM_ICPSC_DIV2:4,TIM_ICPSC_DIV4:8,TIM_ICPSC_DIV8:12,TIM_ENCODERMODE_TI1:1,TIM_ENCODERMODE_TI2:2,TIM_ENCODERMODE_TI12:3,HAL_TIM_ACTIVE_CHANNEL_1:1,HAL_TIM_ACTIVE_CHANNEL_2:2,HAL_TIM_ACTIVE_CHANNEL_3:4,HAL_TIM_ACTIVE_CHANNEL_4:8,HAL_TIM_ACTIVE_CHANNEL_CLEARED:0,
  RCC_OSCILLATORTYPE_HSI:2,RCC_OSCILLATORTYPE_HSE:1,RCC_OSCILLATORTYPE_LSE:4,RCC_OSCILLATORTYPE_LSI:8,RCC_HSI_ON:1,RCC_HSE_ON:1,RCC_HSE_BYPASS:5,RCC_LSE_ON:1,RCC_LSI_ON:1,RCC_HSICALIBRATION_DEFAULT:16,RCC_PLL_NONE:0,RCC_PLL_OFF:1,RCC_PLL_ON:2,RCC_PLLSOURCE_HSI:0,RCC_PLLSOURCE_HSE:1,RCC_PLLP_DIV2:2,RCC_PLLP_DIV4:4,RCC_PLLP_DIV6:6,RCC_PLLP_DIV8:8,
  RCC_CLOCKTYPE_HCLK:2,RCC_CLOCKTYPE_SYSCLK:1,RCC_CLOCKTYPE_PCLK1:4,RCC_CLOCKTYPE_PCLK2:8,RCC_SYSCLKSOURCE_PLLCLK:2,RCC_SYSCLKSOURCE_HSI:0,RCC_SYSCLK_DIV1:1,RCC_HCLK_DIV1:1,RCC_HCLK_DIV2:2,RCC_HCLK_DIV4:4,PWR_REGULATOR_VOLTAGE_SCALE1:1,PWR_REGULATOR_VOLTAGE_SCALE2:2,PWR_REGULATOR_VOLTAGE_SCALE3:3,
  FLASH_LATENCY_0:0,FLASH_LATENCY_1:1,FLASH_LATENCY_2:2,FLASH_LATENCY_3:3,FLASH_LATENCY_4:4,FLASH_LATENCY_5:5,...NVIC_CONSTANTS,
  HAL_UART_STATE_RESET:0,HAL_UART_STATE_READY:0x20,HAL_UART_STATE_BUSY:0x24,HAL_UART_STATE_BUSY_TX:0x21,HAL_UART_STATE_BUSY_RX:0x22,HAL_UART_STATE_BUSY_TX_RX:0x23,
  HAL_UART_ERROR_NONE:0,HAL_UART_ERROR_PE:1,HAL_UART_ERROR_NE:2,HAL_UART_ERROR_FE:4,HAL_UART_ERROR_ORE:8,HAL_UART_ERROR_DMA:16
};
Object.assign(HAL_CONSTANTS,DMA_CONSTANTS,USART_CONSTANTS,DCMI_CONSTANTS,STORAGE_CONSTANTS);
for(const port of ['A','B','C','D','H'])HAL_CONSTANTS['GPIO'+port]='GPIO'+port;
for(let i=0;i<16;i++)HAL_CONSTANTS['GPIO_PIN_'+i]=1<<i;
HAL_CONSTANTS.GPIO_PIN_All=65535;
for(let i=0;i<16;i++)HAL_CONSTANTS['ADC_CHANNEL_'+i]=i;
for(let i=1;i<=4;i++)HAL_CONSTANTS['TIM_CHANNEL_'+i]=(i-1)*4;
for(const n of [2,4,8,16,32,64,128,256])HAL_CONSTANTS['SPI_BAUDRATEPRESCALER_'+n]=Math.log2(n)-1;
for(const id of [...SERIAL_IDS,'I2C1','SPI1','ADC1',...TIMER_IDS,...IRQ_NAMES])HAL_CONSTANTS[id]=id;
for(const id of TIMER_IDS)HAL_CONSTANTS[`GPIO_AF${timerAf(id)}_${id}`]=timerAf(id);
for(const id of SERIAL_IDS)HAL_CONSTANTS[`GPIO_AF${serialAf(id)}_${id}`]=serialAf(id);
for(const [name,n]of [['GPIO_AF12_SDIO',12],['GPIO_AF13_DCMI',13],['GPIO_AF4_I2C1',4],['GPIO_AF5_SPI1',5],['GPIO_AF1_TIM2',1]])HAL_CONSTANTS[name]=n;
// STM32F1 HAL names (stm32f1xx_hal_*.h). F4-only names are dropped so F1 code cannot use them by mistake.
const F4_ONLY=/^(GPIO_AF\d+_|GPIO_SPEED_FREQ_VERY_HIGH$|GPIOH$|DMA2|DMA\d_Stream|DMA_CHANNEL_|DMA_FIFO|DMA_[MP]BURST|DMA_PFCTRL$|DMA_IT_(DME|FE)$|HAL_DMA_XFER_M1|SDIO|DCMI|HAL_SD_|SD_|RCC_PLLP_|PWR_REGULATOR|ADC_CLOCK_SYNC|ADC_RESOLUTION|ADC_EOC_|ADC_EXTERNALTRIGCONVEDGE|ADC_SAMPLETIME_\d+CYCLES$|ADC_CHANNEL_(18|VBAT)$|ADC_IRQn$|UART[45]|USART6|TIM5|I2S|PLLI2S)/;
const F1_CONSTANTS={GPIO_SPEED_FREQ_LOW:2,GPIO_SPEED_FREQ_MEDIUM:1,GPIO_SPEED_FREQ_HIGH:3,GPIO_MODE_AF_INPUT:0,
  RCC_PLLSOURCE_HSI_DIV2:0,RCC_PLLSOURCE_HSE:0x10000,RCC_HSE_PREDIV_DIV1:0,RCC_HSE_PREDIV_DIV2:0x20000,RCC_PERIPHCLK_RTC:1,RCC_PERIPHCLK_ADC:2,RCC_PERIPHCLK_USB:0x10,
  RCC_ADCPCLK2_DIV2:0,RCC_ADCPCLK2_DIV4:0x4000,RCC_ADCPCLK2_DIV6:0x8000,RCC_ADCPCLK2_DIV8:0xC000,
  ADC_SCAN_DISABLE:0,ADC_SCAN_ENABLE:0x100,ADC_SOFTWARE_START:0xE0000,ADC_DATAALIGN_LEFT:0x800,ADC_CHANNEL_TEMPSENSOR:16,ADC_CHANNEL_VREFINT:17,
  ...Object.fromEntries(['1CYCLE_5','7CYCLES_5','13CYCLES_5','28CYCLES_5','41CYCLES_5','55CYCLES_5','71CYCLES_5','239CYCLES_5'].map((n,i)=>['ADC_SAMPLETIME_'+n,i])),
  ...Object.fromEntries(Array.from({length:16},(_,i)=>['ADC_REGULAR_RANK_'+(i+1),i+1])),
  ...Object.fromEntries(Array.from({length:15},(_,i)=>['RCC_PLL_MUL'+(i+2),i<<18]))};
for(const name of [...familyProfile('STM32F103RB').dmaUnits,...irqNamesOf('STM32F103RB'),'AFIO'])F1_CONSTANTS[name]=name;
const constantsByFamily=new Map();
/** Constants the C source of a project may use (its family's HAL names). */
export function halConstantsFor(family){
  if(familyProfile(family).pinMux!=='remap')return HAL_CONSTANTS;
  if(!constantsByFamily.has(family))constantsByFamily.set(family,{...Object.fromEntries(Object.entries(HAL_CONSTANTS).filter(([k])=>!F4_ONLY.test(k))),...F1_CONSTANTS});
  return constantsByFamily.get(family);
}

const int=(value,min,max,label)=>{if(!Number.isInteger(value)||value<min||value>max)throw new Error(`${label}: ${min}~${max} 범위의 정수가 필요합니다.`);return value;};
// IRQs that existed before the Pinout NVIC table grew; they still require the Pinout NVIC switch.
const PINOUT_IRQS=new Set(['EXTI0_IRQn','EXTI1_IRQn','EXTI2_IRQn','EXTI3_IRQn','EXTI4_IRQn','EXTI9_5_IRQn','EXTI15_10_IRQn',...SERIAL_IDS.map(id=>id+'_IRQn'),...TIMER_IDS.map(id=>id+'_IRQn')]);
const isIterator=v=>v&&typeof v.next==='function'&&typeof v[Symbol.iterator]==='function';
export class HalAdapter {
  constructor(config,buses,{session}={}){this.config=validateMcu(config);this.family=familyProfile(this.config.family);this.f1=this.family.pinMux==='remap';this.remaps=new Set();this.afio=false;this.adcIrq=this.f1?'ADC1_2_IRQn':'ADC_IRQn';const errors=configProblems(this.config);if(errors.length)throw new Error(errors.join('\n'));this.buses=buses;this.nvic=new Map();this.pending=[];this.extiPending=0;this.serials=new Map();this.handles=new Map();this.timerModel=new HalTimers(this);this.adc=new Map();this.latches=new Map();this.priorities=new Map();this.initializedGpio=new Set();this.catalog=new CatalogPeripherals(this);this.nvicModel=new Nvic(this);this.subPriorities=new Map();this.noticeIrq=new Set();this.session=session;this.dma=new HalDma(this);this.usart=new HalUsart(this);this.camera=new HalDcmi(this);this.storage=new HalStorage(this);this.extensions=[this.dma,this.usart,this.camera,this.storage];}
  get active(){return this.nvicModel.active;}
  uart(id){
    if(!isSerial(id))throw new Error(`지원하지 않는 UART 인스턴스: ${id}`);
    if(!this.serials.has(id)){const bus=id==='USART2'?this.buses:new BusDevices(this.buses.project,this.buses.getResult,this.buses.trace);bus.uart.instance=id;bus.received=this.buses.received;bus.signals=this.buses.signals;bus.noise=this.buses.noise;if(bus!==this.buses)bus.peers=(...a)=>this.buses.peers?.(...a);this.serials.set(id,{bus,rx:null,tx:null});}
    return this.serials.get(id);
  }
  uartWrite(channel,bytes,r){const before=channel.bus.uart.queue.length;channel.bus.call('Serial1.write',[r.array(bytes),bytes.length],r);r.api.uart?.({instance:channel.bus.uart.instance,direction:'TX',bytes,micros:r.microTime});for(const byte of channel.bus.uart.queue.slice(before))r.event(byte.at/1000,()=>{});}
  // Reads one received byte through the RX wire model: channel.rxError holds FE/PE/NE of that frame.
  uartRead(channel,r){
    const u=channel.bus.uart,item=u.queue.find(x=>x.at<=r.microTime+1e-6),raw=channel.bus.call('Serial1.read',[],r);channel.rxError=0;if(raw<0)return raw;
    const f=channel.bus.uartRx(raw,item.at-1e7/u.baud),value=f.value;channel.rxError=(f.pe?1:0)|(f.ne?2:0)|(f.fe?4:0);
    r.api.uart?.({instance:u.instance,direction:'RX',bytes:[value],micros:r.microTime,...(channel.rxError?{error:channel.rxError}:{})});return value;
  }
  // UART error interrupt: ErrorCode is accumulated and HAL_UART_ErrorCallback runs from the USART IRQ.
  uartError(r,id,handle,code){const h=r.get(r.pointerCell(handle));if(h?.fields?.ErrorCode)h.fields.ErrorCode.value|=code;const hal=this;this.queue(id+'_IRQn',function*(){yield* hal.userCall(r,'HAL_UART_ErrorCallback',[handle]);if(h?.fields?.ErrorCode)h.fields.ErrorCode.value=0;},id+':error');}
  field(object,key){if(object?.kind!=='struct'||!Object.hasOwn(object.fields,key))throw new Error(`HAL 구조체 필드 오류: ${key}`);return object.fields[key].value;}
  handle(ptr,r,type){const h=r.get(r.pointerCell(ptr));if(h?.type!==type+'_HandleTypeDef')throw new Error(`${type} 핸들 포인터가 필요합니다.`);const id=this.field(h,'Instance');if(!this.config.peripherals[id]?.enabled)throw new Error(`${id}: Pinout & Configuration에서 주변장치를 활성화하세요.`);return {h,id,init:this.field(h,'Init')};}
  requireHandle(ptr,r,type){const x=this.handle(ptr,r,type);if(this.handles.get(x.id)!==x.h)throw new Error(`${x.id}: HAL 초기화가 필요합니다.`);return x;}
  pinFor(fn){const pin=Object.keys(this.config.pins).find(p=>this.config.pins[p].function===fn);if(!pin)throw new Error(`${fn}: 핀을 지정하세요.`);return pin;}
  pins(port,mask){if(!this.family.ports.some(p=>'GPIO'+p===port))throw new Error(`GPIO 포트를 확인하세요 (${this.family.ports.map(p=>'GPIO'+p).join(', ')}).`);int(mask,1,65535,'GPIO 핀 마스크');return Array.from({length:16},(_,i)=>i).filter(i=>mask&(1<<i)).map(i=>'P'+port.at(-1)+i);}
  configured(pin){const p=this.config.pins[pin];if(!p||['Reset','Reserved'].includes(p.function))throw new Error(`${pin}: Pinout에서 핀을 활성화하세요.`);return p;}
  callback(r,name,args=[]){if(r.program.functions[name])r.runCallback({name,args});}
  // User callback as a nested call of the current (ISR) context, so it may loop, delay or be preempted.
  *userCall(r,name,args=[]){if(r.program.functions[name])return yield* r.invoke(name,args);return 0;}
  queue(irq,callback,key=irq){
    if(this.pending.some(j=>j.key===key))return;this.pending.push({irq,callback,key});if(this.pending.length>256)throw new Error('HAL 인터럽트 대기열 한도를 넘었습니다.');
    if(!this.nvic.has(irq)&&!this.warnedIrq?.has(irq)&&this.noticeIrq?.has(irq)){(this.warnedIrq??=new Set()).add(irq);this.runtime?.warn(`[NVIC] ${irq}가 활성화되지 않아 ${key} 완료 콜백이 대기 중입니다. NVIC에서 ${irq}를 켜세요.`);}
  }
  *runJob(r,job){const it=job.callback?.();if(isIterator(it))yield* it;}
  // Called from HAL_xxx_IRQHandler inside a user IRQ handler: run that IRQ's pending jobs.
  *drain(r,irq,match=()=>true){for(let n=0;n<64;n++){const job=this.pending.find(j=>j.irq===irq&&match(j));if(!job)return 0;this.pending.splice(this.pending.indexOf(job),1);yield* this.runJob(r,job);}return 0;}
  dispatch(r,irq,jobs){
    const hal=this,handler=irq.replace(/_IRQn$/,'_IRQHandler'),nvic=this.nvicModel;nvic.active.push(irq);nvic.updateTick(r);
    const body=(function*(){
      if(r.program.functions[handler]){yield* r.invoke(handler,[]);for(const j of jobs){const i=hal.pending.indexOf(j);if(i>=0)hal.pending.splice(i,1);}}
      else for(const j of jobs){const i=hal.pending.indexOf(j);if(i<0)continue;hal.pending.splice(i,1);yield* hal.runJob(r,j);}
    })();
    return r.enterIsr(body,{irq,name:handler,exit:()=>{const k=nvic.active.lastIndexOf(irq);if(k>=0)nvic.active.splice(k,1);nvic.updateTick(r);}});
  }
  preempt(r){if(!this.pending.length||r.atomic)return false;const nvic=this.nvicModel,exec=nvic.exec(r);return this.pending.some(j=>this.nvic.has(j.irq)&&!nvic.active.includes(j.irq)&&nvic.group(j.irq)<exec);}
  poll(r){
    this.timerModel.observe(r);
    for(const [id,channel]of this.serials){
      // Overrun (with the wire error model enabled): bytes arriving while nobody reads RDR are lost;
      // the next IT/DMA reception reports HAL_UART_ERROR_ORE and is aborted like the real HAL.
      if(this.buses.noise?.cfg.enabled&&channel.bus.uart.ready){
        const u=channel.bus.uart,avail=u.queue.filter(x=>x.at<=r.microTime+1e-6);
        if(!channel.rx&&!channel.rxDma&&avail.length>=2){u.queue=u.queue.filter(x=>x===avail[0]||!avail.includes(x));channel.ore=true;}
        const job=channel.rx??channel.rxDma;if(job&&channel.ore){channel.ore=false;if(channel.rxDma)this.dma.stop(channel.rxDma.link.st);channel.rx=null;channel.rxDma=null;const h=r.get(r.pointerCell(job.handle));if(h.fields.RxState)h.fields.RxState.value=0x20;this.uartError(r,id,job.handle,8);continue;}
      }
      if(channel.tx&&channel.tx.at<=r.microTime+1e-6){const job=channel.tx;channel.tx=null;this.queue(id+'_IRQn',()=>this.userCall(r,'HAL_UART_TxCpltCallback',[job.handle]),id+':tx');}
      if(channel.rx){const job=channel.rx;while(job.index<job.count&&channel.bus.call('Serial1.available',[],r)>0){r.set(r.pointerCell(job.buffer,job.index++),this.uartRead(channel,r));if(channel.rxError)this.uartError(r,id,job.handle,channel.rxError);}
        if(job.index===job.count){channel.rx=null;this.queue(id+'_IRQn',()=>this.userCall(r,'HAL_UART_RxCpltCallback',[job.handle]),id+':rx');}}
    }
    for(const ext of this.extensions)ext.poll?.(r);
    this.nvicModel.updateTick(r);
    if(r.atomic)return;
    // Highest priority first (encoded priority, then IRQ number). Only jobs pending at entry form
    // this batch; a job queued by a callback waits for the next poll. Each dispatch may nest.
    const batch=new Set(this.pending),nvic=this.nvicModel;
    while(true){
      const exec=nvic.exec(r);let next;
      for(const job of this.pending)if(batch.has(job)&&this.nvic.has(job.irq)&&!nvic.active.includes(job.irq)&&nvic.group(job.irq)<exec&&(!next||nvic.order(job.irq,next.irq)<0))next=job;
      if(!next)break;
      const jobs=this.pending.filter(j=>j.irq===next.irq&&batch.has(j));jobs.forEach(j=>batch.delete(j));
      if(this.dispatch(r,next.irq,jobs)==='paused')break;
    }
  }
  // ADC conversion time: (sampling + 12) ADC clocks, ADCCLK = PCLK2 / prescaler (PCLK2 = configured clock).
  // F1: sample time + 12.5 cycles at PCLK2 / ADC prescaler (PCLK2 = SYSCLK = timer clock here).
  adcConversionUs(sampling){if(this.f1)return ([1.5,7.5,13.5,28.5,41.5,55.5,71.5,239.5][sampling??0]+12.5)*(this.adcDiv??2)*1e6/this.config.timerClockHz;const s=this.adc.get('ADC1'),cycles=[3,15,28,56,84,112,144,480][sampling??0]+12;return cycles*(s?.prescaler??4)*1e6/this.config.timerClockHz;}
  // Internal channels: 16 temperature sensor (25 °C), 17 VREFINT (1.21 V), 18 VBAT/4 (3.0 V).
  adcRead(channel,r){if(channel===16)return Math.round(.76/3.3*4095);if(channel===17)return Math.round(1.21/3.3*4095);if(channel===18)return Math.round(.75/3.3*4095);return r.call('analogRead',[this.pinFor('ADC1_IN'+channel)]);}
  declareGlobals(r){for(const ext of this.extensions)ext.declareGlobals?.(r);}
  update(result,micros){for(const ext of this.extensions)ext.update?.(result,micros);}
  *pollCounter(name,args,r){yield .002;r.steps=0;return this.call(name,args,r);}
  invoke(name,args,r){
    this.runtime=r;
    if(name==='HAL_I2S_Transmit')return this.catalog.transmit(args,r);
    if(name==='HAL_GPIO_EXTI_IRQHandler')return this.extiHandler(r,args[0]);
    if(name==='HAL_UART_IRQHandler'){const {id}=this.requireHandle(args[0],r,'UART');return this.drain(r,id+'_IRQn');}
    if(name==='HAL_TIM_IRQHandler'){const {id}=this.requireHandle(args[0],r,'TIM');return this.drain(r,id+'_IRQn');}
    if(name==='NVIC_SystemReset'||name==='HAL_NVIC_SystemReset')return (function*(){r.warn('[NVIC] 시스템 리셋: 프로그램을 처음부터 다시 실행합니다.');yield {kind:'reset'};})();
    for(const ext of this.extensions){const it=ext.invoke?.(name,args,r);if(it)return it;}
    if(name==='__HAL_TIM_GET_COUNTER'&&this.buses.project.components.some(p=>p.type==='catalog_singlewire'))return this.pollCounter(name,args,r);
    if(name==='HAL_Delay'||name==='HAL_UART_Transmit'||name==='HAL_UART_Receive')return this.blocking(name,args,r);
    return null;
  }
  *blocking(name,args,r){
    if(r.atomic)throw new Error(`${name}: 인터럽트 콜백에서 대기할 수 없습니다.`);
    if(name==='HAL_Delay'){if(args.length!==1)throw new Error('HAL_Delay(ms) 형식을 확인하세요.');int(args[0],0,3600000,'HAL_Delay');yield* this.delay(r,args[0]);return 0;}
    const [ptr,buffer,count,timeout]=args,{id}=this.requireHandle(ptr,r,'UART'),channel=this.uart(id);int(count,1,256,'UART 길이');int(timeout,0,4294967295,'UART timeout');const start=r.microTime/1000;
    if(name==='HAL_UART_Transmit'){
      if(channel.tx)return 2;const bytes=this.bytes(buffer,count,r),duration=count*10000/channel.bus.uart.baud;
      if(duration>timeout){if(timeout)yield timeout;return 3;}
      this.uartWrite(channel,bytes,r);yield duration;return 0;
    }
    if(channel.rx)return 2;r.pointerCell(buffer,count-1);let index=0;
    while(index<count){while(index<count&&channel.bus.call('Serial1.available',[],r)>0)r.set(r.pointerCell(buffer,index++),this.uartRead(channel,r));if(index===count)return 0;const remaining=timeout-(r.microTime/1000-start);if(remaining<=1e-9)return 3;yield Math.min(1,remaining);}
    return 0;
  }
  // HAL_Delay polls HAL_GetTick(); when SysTick cannot preempt the current priority the tick never
  // advances and the real MCU hangs here. Emulate the hang (higher priority IRQs still run) and warn.
  *delay(r,ms){
    const nvic=this.nvicModel;nvic.updateTick(r);
    if(nvic.tickBlocked(r)){
      const irq=nvic.activeName(),tick=nvic.groupOfValue(nvic.tickEncoded);
      r.warn(irq?`[경고] ${irq}(선점 우선순위 ${nvic.group(irq)}) 안에서 HAL_Delay()를 호출했습니다. SysTick(우선순위 ${tick})이 이 인터럽트를 선점할 수 없어 HAL_GetTick()이 멈추고 실제 보드에서는 여기서 영원히 대기합니다. SysTick 우선순위를 더 높이거나(숫자를 작게) 콜백에서 지연을 제거하세요.`:`[경고] 인터럽트가 차단된 상태(__disable_irq/BASEPRI)에서 HAL_Delay()를 호출해 SysTick이 멈췄습니다. 실제 보드에서는 여기서 영원히 대기합니다.`);
      this.hung={irq:irq??null,at:r.microTime};while(true)yield Infinity;
    }
    yield Math.max(.001,ms);
  }
  *extiHandler(r,mask){
    int(mask,1,65535,'EXTI 마스크');
    for(const j of [...this.pending])if(j.exti&&(j.exti&mask))this.pending.splice(this.pending.indexOf(j),1);
    if(this.extiPending&mask){this.extiPending&=~mask;yield* this.userCall(r,'HAL_GPIO_EXTI_Callback',[mask]);}return 0;
  }
  bytes(buffer,count,r){int(count,1,256,'전송 길이');if(typeof buffer==='string'){if(count>buffer.length+1)throw new Error('문자열 범위를 벗어난 전송');return Array.from({length:count},(_,i)=>buffer.charCodeAt(i)||0);}return Array.from({length:count},(_,i)=>int(r.get(r.pointerCell(buffer,i)),0,255,'전송 바이트'));}
  // STM32F1 specifics: AFIO clock and remaps, JTAG release, ADC clock prescaler and calibration.
  callF1(name,[a],r){
    if(name==='__HAL_RCC_AFIO_CLK_ENABLE'){this.afio=true;return 0;}
    if(/^__HAL_AFIO_REMAP_\w+$/.test(name)){if(!this.afio)throw new Error(`${name}: 먼저 __HAL_RCC_AFIO_CLK_ENABLE()로 AFIO 클록을 켜세요.`);this.remaps.add(name);return 0;}
    if(name==='HAL_RCCEx_PeriphCLKConfig'){const cfg=r.get(r.pointerCell(a));if(this.field(cfg,'PeriphClockSelection')&2)this.adcDiv=[2,4,6,8][(this.field(cfg,'AdcClockSelection')>>14)&3];return 0;}
    if(name==='HAL_ADCEx_Calibration_Start'){const {id}=this.requireHandle(a,r,'ADC');this.adc.get(id).calibrated=true;return 0;}
    if(name==='HAL_RCC_GetPCLK1Freq')return this.config.timerClockHz>36000000?this.config.timerClockHz/2:this.config.timerClockHz;
    if(['HAL_PWREx_EnableOverDrive','__HAL_PWR_VOLTAGESCALING_CONFIG','HAL_PWREx_ControlVoltageScaling','__HAL_RCC_SYSCFG_CLK_ENABLE'].includes(name))throw new Error(`${name}: STM32F103에는 없는 기능입니다.`);
    return undefined;
  }
  // F1 pins: JTAG pins need SWJ_NOJTAG, remapped signals need their __HAL_AFIO_REMAP_* first, EXTI on B..D needs the AFIO clock.
  checkF1Pin(pin,p){
    if(['PD0','PD1'].includes(pin)&&!this.remaps.has('__HAL_AFIO_REMAP_PD01_ENABLE'))throw new Error(`${pin}: 리셋 후 OSC_IN/OSC_OUT 핀입니다. __HAL_AFIO_REMAP_PD01_ENABLE()을 먼저 호출하세요.`);
    if(this.family.jtagPins.includes(pin)&&!this.remaps.has('__HAL_AFIO_REMAP_SWJ_NOJTAG')&&!this.remaps.has('__HAL_AFIO_REMAP_SWJ_DISABLE'))throw new Error(`${pin}: 리셋 후 JTAG 핀입니다. __HAL_AFIO_REMAP_SWJ_NOJTAG()를 먼저 호출하세요 (SWD는 유지).`);
    const id=p.function.split('_')[0],options=this.family.remaps[id];
    if(options){
      const assigned=Object.fromEntries(Object.entries(this.config.pins).filter(([,q])=>q.function.startsWith(id+'_')).map(([name,q])=>[q.function.slice(id.length+1),name])),option=remapFor(this.family.id,id,assigned);
      if(option?.macro&&!this.remaps.has(option.macro))throw new Error(`${pin}: ${id} 신호가 리맵 핀에 있습니다. ${option.macro}()를 먼저 호출하세요.`);
      const wrong=options.find(o=>o.macro&&o!==option&&this.remaps.has(o.macro));if(wrong)throw new Error(`${pin}: ${wrong.macro}()가 ${id}를 다른 핀으로 옮겼습니다. Pinout의 핀 묶음과 맞추세요.`);
    }
    if(p.function==='GPIO_EXTI'&&pin[1]!=='A'&&!this.afio)throw new Error(`${pin}: EXTI를 포트 ${pin[1]}에 연결하려면 __HAL_RCC_AFIO_CLK_ENABLE()가 필요합니다.`);
  }
  call(name,args,r){
    // UNUSED(x) (stm32*xx_hal_def.h) only silences a compiler warning.
    if(name==='UNUSED')return 0;
    const [a,b,c,d,e,f,g]=args;this.runtime=r;if(this.f1){const out=this.callF1(name,args,r);if(out!==undefined)return out;}const catalogResult=this.catalog.call(name,args,r);if(catalogResult!==undefined)return catalogResult;
    for(const ext of this.extensions){const out=ext.call?.(name,args,r);if(out!==undefined)return out;}
    if(name==='HAL_Init'){this.nvicModel.setGrouping(3);this.nvicModel.setPriority(SYSTICK,15,0);this.callback(r,'HAL_MspInit');return 0;}
    if(name==='HAL_GetTick')return this.nvicModel.now(r);
    if(name==='HAL_IncTick'||name==='HAL_SYSTICK_IRQHandler'||name==='HAL_SuspendTick'||name==='HAL_ResumeTick'||name==='__NOP'||name==='__DSB'||name==='__ISB'||name==='__DMB')return 0;
    if(name==='HAL_InitTick'){int(a,0,15,'TICK_INT_PRIORITY');this.nvicModel.setPriority(SYSTICK,a,0);this.nvicModel.updateTick(r);return 0;}
    if(name==='__disable_irq'){r.interruptsEnabled=false;this.nvicModel.updateTick(r);return 0;}if(name==='__enable_irq'){r.interruptsEnabled=true;this.nvicModel.updateTick(r);return 0;}
    if(name==='__set_PRIMASK'){r.interruptsEnabled=!(a&1);this.nvicModel.updateTick(r);return 0;}if(name==='__get_PRIMASK')return r.interruptsEnabled?0:1;
    if(name==='__set_BASEPRI'||name==='__set_BASEPRI_MAX'){int(a,0,255,'BASEPRI');const v=a&0xf0;if(name==='__set_BASEPRI'||v&&(!this.nvicModel.basepri||v<this.nvicModel.basepri))this.nvicModel.basepri=v;this.nvicModel.updateTick(r);return 0;}
    if(name==='__get_BASEPRI')return this.nvicModel.basepri;if(name==='__get_IPSR')return this.nvicModel.ipsr();
    if(name==='HAL_NVIC_SetPriorityGrouping'||name==='NVIC_SetPriorityGrouping'){this.nvicModel.setGrouping(a);return 0;}
    if(name==='HAL_NVIC_GetPriorityGrouping'||name==='NVIC_GetPriorityGrouping')return Object.entries({7:0,6:1,5:2,4:3,3:4}).find(([,b])=>b===this.nvicModel.preemptBits)[0]*1;
    if(name==='HAL_NVIC_GetPriority'){const v=this.nvicModel.encodedOf(a),bits=this.nvicModel.preemptBits;r.set(r.pointerCell(c),v>>(4-bits));r.set(r.pointerCell(d),v&((1<<(4-bits))-1));return 0;}
    if(name==='NVIC_EncodePriority'){const bits={7:0,6:1,5:2,4:3,3:4}[a];if(bits===undefined)throw new Error('NVIC 그룹 값을 확인하세요.');return ((b&((1<<bits)-1))<<(4-bits))|(c&((1<<(4-bits))-1));}
    if(name==='NVIC_SetPriority'){int(b,0,15,'NVIC priority');if(a===SYSTICK)this.nvicModel.tickEncoded=b;else{if(!this.nvicModel.isIrq(a))throw new Error(`미지원 IRQ: ${a}`);this.nvicModel.encoded.set(a,b);}this.nvicModel.updateTick(r);return 0;}
    if(name==='NVIC_GetPriority')return this.nvicModel.encodedOf(a);
    if(name==='HAL_NVIC_SetPendingIRQ'||name==='NVIC_SetPendingIRQ'){if(!this.nvicModel.isIrq(a))throw new Error(`미지원 IRQ: ${a}`);this.queue(a,null,a+':sw');return 0;}
    if(name==='HAL_NVIC_GetPendingIRQ'||name==='NVIC_GetPendingIRQ')return Number(this.pending.some(j=>j.irq===a));
    if(name==='HAL_NVIC_ClearPendingIRQ'||name==='NVIC_ClearPendingIRQ'){this.pending=this.pending.filter(j=>!(j.irq===a&&j.key===a+':sw'));return 0;}
    if(name==='HAL_NVIC_GetActive'||name==='NVIC_GetActive')return Number(this.nvicModel.active.includes(a));
    if(name==='NVIC_EnableIRQ')return this.call('HAL_NVIC_EnableIRQ',[a],r);if(name==='NVIC_DisableIRQ')return this.call('HAL_NVIC_DisableIRQ',[a],r);
    if(name==='Error_Handler')throw new Error('Error_Handler(): HAL 초기화 또는 사용자 코드 오류');
    if(/^__HAL_RCC_(GPIO[ABCDH]|SYSCFG|PWR|USART[1236]|UART[45]|I2C1|SPI1|ADC1|TIM[2345]|SDIO|DCMI|DMA[12])_CLK_ENABLE$/.test(name)){if(this.f1&&name==='__HAL_RCC_GPIOH_CLK_ENABLE')throw new Error('STM32F103RB에는 GPIOH가 없습니다.');return 0;}
    if(['HAL_RCC_OscConfig','HAL_RCC_ClockConfig','HAL_PWREx_ControlVoltageScaling','HAL_PWREx_EnableOverDrive','__HAL_PWR_VOLTAGESCALING_CONFIG'].includes(name))return 0;
    if(name==='HAL_NVIC_SetPriority'){if(a!==SYSTICK&&!this.nvicModel.isIrq(a))throw new Error(`미지원 IRQ: ${a}`);int(b,0,15,'IRQ priority');this.nvicModel.setPriority(a,b,c??0);if(a===SYSTICK){this.nvicModel.updateTick(r);return 0;}this.priorities.set(a,b);this.subPriorities.set(a,c??0);if(this.nvic.has(a))this.nvic.set(a,b);return 0;}
    if(name==='HAL_NVIC_EnableIRQ'){if(!this.nvicModel.isIrq(a)||PINOUT_IRQS.has(a)&&!this.config.nvic[a]?.enabled)throw new Error(`${a}: NVIC 설정에서 인터럽트를 활성화하세요.`);this.nvic.set(a,this.priorities.get(a)??this.config.nvic[a]?.priority??0);return 0;}
    if(name==='HAL_NVIC_DisableIRQ'){this.nvic.delete(a);return 0;}
    if(name==='HAL_GPIO_Init'){
      const init=r.get(r.pointerCell(b)),mask=this.field(init,'Pin'),mode=this.field(init,'Mode'),pull=this.field(init,'Pull');
      for(const pin of this.pins(a,mask)){
        if(this.catalog.configurePin(pin,mode,this.f1?0:this.field(init,'Alternate'),r))continue;
        // F1 peripheral inputs (UART RX, SPI MISO, timer capture/encoder channels) use GPIO_MODE_INPUT.
        const p=this.configured(pin),afInput=this.f1&&(/_RX$|^SPI1_MISO$/.test(p.function)||/^TIM\d_CH\d$/.test(p.function)&&['capture','encoder'].includes(this.config.peripherals[p.function.split('_')[0]]?.mode)),expected=p.function==='GPIO_Output'?1:p.function==='GPIO_Input'||afInput?0:p.function==='GPIO_EXTI'?HAL_CONSTANTS['GPIO_MODE_IT_'+(p.edge==='CHANGE'?'RISING_FALLING':p.edge)]:p.function==='Analog'||p.function.startsWith('ADC1_')?3:p.function.startsWith('I2C1_')?18:2;
        const dynamic=this.initializedGpio.has(pin)&&(['GPIO_Output','GPIO_Input'].includes(p.function)&&[0,1,17,3].includes(mode)||(p.function==='Analog'||p.function.startsWith('ADC1_'))&&[0,3].includes(mode));
        if(!dynamic&&(mode!==expected&&!(expected===1&&mode===17)||pull!==['NOPULL','PULLUP','PULLDOWN'].indexOf(p.pull)))throw new Error(`${pin}: HAL_GPIO_Init 모드/풀 설정과 Pinout이 다릅니다.`);
        if(this.f1)this.checkF1Pin(pin,p);
        if([2,18].includes(mode)&&!this.f1){const serial=serialFunction(p.function)||/^(USART\d)_CK$/.exec(p.function)?.[1],af=serial?serialAf(serial):p.function.startsWith('I2C1_')?4:p.function.startsWith('SPI1_')?5:p.function.startsWith('SDIO_')?12:timerAf(p.function.split('_')[0]);if(this.field(init,'Alternate')!==af)throw new Error(`${pin}: GPIO Alternate(AF) 설정을 확인하세요.`);}
        this.initializedGpio.add(pin);
        if(mode===1||mode===17){r.call('pinMode',[pin,'OUTPUT']);r.gpio[pin].openDrain=mode===17;r.gpio[pin].pull=pull;r.call('digitalWrite',[pin,this.latches.get(pin)??p.initial]);}
        // RM0390 7.3.12: analog mode disables both weak pulls and the digital input.
        else if(mode===3)r.setPinMode(pin,'ANALOG');
        else r.call('pinMode',[pin,pull===1?'INPUT_PULLUP':pull===2?'INPUT_PULLDOWN':'INPUT']);
        if(p.function==='GPIO_EXTI')r.interrupts.set(pin,{mode:p.edge,previous:Number(!!r.api.read(pin)),pending:false,callback:{host:()=>{const mask=1<<Number(pin.slice(2));this.extiPending|=mask;this.queue(irqForPin(pin),()=>this.extiHandler(r,mask),pin);this.pending.at(-1).key===pin&&(this.pending.at(-1).exti=mask);}}});
      }return 0;
    }
    if(['HAL_GPIO_WritePin','HAL_GPIO_TogglePin','HAL_GPIO_ReadPin','HAL_GPIO_DeInit'].includes(name)){
      const pins=this.pins(a,b);if(name==='HAL_GPIO_ReadPin'){for(const pin of pins)this.configured(pin);return Number(pins.some(pin=>r.call('digitalRead',[pin])));}
      for(const pin of pins){const p=this.configured(pin);if(name==='HAL_GPIO_DeInit'){r.call('pinMode',[pin,'INPUT']);r.interrupts.delete(pin);continue;}if(p.function!=='GPIO_Output')throw new Error(`${pin}: GPIO_Output으로 설정하세요.`);const value=name==='HAL_GPIO_TogglePin'?Number(!(r.gpio[pin]?.value)):int(c,0,1,'GPIO 상태');this.latches.set(pin,value);if(r.gpio[pin]?.mode==='OUTPUT')r.call('digitalWrite',[pin,value]);}
      return 0;
    }
    if(name==='HAL_GPIO_EXTI_IRQHandler'){int(a,1,65535,'EXTI 마스크');if(this.extiPending&a){this.extiPending&=~a;this.callback(r,'HAL_GPIO_EXTI_Callback',[a]);}return 0;}
    if(name==='HAL_GPIO_EXTI_GenerateSWIT'){int(a,1,65535,'EXTI 마스크');for(let i=0;i<16;i++)if(a&(1<<i)){const pin=Object.keys(this.config.pins).find(p=>Number(p.slice(2))===i&&this.config.pins[p].function==='GPIO_EXTI');if(pin){this.extiPending|=1<<i;this.queue(irqForPin(pin),()=>this.extiHandler(r,1<<i),pin);this.pending.at(-1).exti=1<<i;}}return 0;}
    if(['HAL_UART_Init','HAL_I2C_Init','HAL_SPI_Init','HAL_ADC_Init','HAL_TIM_Base_Init','HAL_TIM_PWM_Init','HAL_TIM_IC_Init','HAL_TIM_Encoder_Init'].includes(name)){
      const type=name.split('_')[1],{h,id,init}=this.handle(a,r,type),get=k=>this.field(init,k);this.callback(r,`HAL_${type}${type==='TIM'?'_'+name.split('_')[2]:''}_MspInit`,[a]);
      if(type==='UART'){
        if(this.config.peripherals[id]?.mode==='synchronous')throw new Error(`${id}: Pinout에서 동기(Synchronous) 모드입니다. HAL_USART_Init을 사용하세요.`);
        if(!isSerial(id)||get('WordLength')!==0||get('StopBits')!==0||get('Parity')!==0||get('HwFlowCtl')!==0||get('Mode')!==12||get('OverSampling')!==0)throw new Error(`${id}: 비동기 8N1, TX/RX, 흐름제어 없음, oversampling 16을 지원합니다.`);
        if(get('BaudRate')!==this.config.peripherals[id].baud)throw new Error(`${id}: 소스와 Pinout의 baud rate가 다릅니다.`);
        const {bus}=this.uart(id);bus.call('Serial1.setPins',[this.pinFor(id+'_RX'),this.pinFor(id+'_TX')],r);bus.call('Serial1.begin',[get('BaudRate')],r);
      }
      if(type==='I2C'){
        if(get('AddressingMode')!==16384||get('ClockSpeed')!==this.config.peripherals.I2C1.clock||get('DualAddressMode')||get('GeneralCallMode'))throw new Error('I2C1: 7비트 주소와 Pinout의 속도를 사용하세요.');
        this.buses.call('Wire.begin',[this.pinFor('I2C1_SDA'),this.pinFor('I2C1_SCL')],r);this.buses.call('Wire.setClock',[get('ClockSpeed')],r);
      }
      if(type==='SPI'){
        if(get('Mode')!==260||get('Direction')!==0||get('DataSize')!==0||get('CLKPolarity')||get('CLKPhase')||get('FirstBit')||get('NSS')!==512||get('CRCCalculation')||get('TIMode'))throw new Error('SPI1: master, 8비트, mode 0, MSB first, software NSS를 지원합니다.');
        this.buses.call('SPI.setPins',[this.pinFor('SPI1_MOSI'),this.pinFor('SPI1_MISO'),this.pinFor('SPI1_SCK')],r);this.buses.call('SPI.begin',[],r);this.buses.call('SPI.setClock',[this.config.peripherals.SPI1.clock],r);
      }
      if(type==='ADC'&&this.f1){const nbr=get('NbrOfConversion')||1,adcHz=this.config.timerClockHz/(this.adcDiv??2);if(get('DataAlign')||get('ExternalTrigConv')!==0xE0000||!Number.isInteger(nbr)||nbr<1||nbr>16||nbr>1&&get('ScanConvMode')!==0x100)throw new Error('ADC1: 오른쪽 정렬, 소프트웨어 시작(ADC_SOFTWARE_START), 스캔 시 ADC_SCAN_ENABLE과 NbrOfConversion 1~16을 지원합니다.');if(adcHz>14000000)throw new Error(`ADC1: ADC 클록 ${adcHz/1e6} MHz가 14 MHz를 넘습니다. HAL_RCCEx_PeriphCLKConfig로 RCC_ADCPCLK2_DIV6 등을 설정하세요.`);this.adc.set(id,{active:false,channel:null,value:0,ranks:[],nbr,scan:get('ScanConvMode')===0x100,continuous:!!get('ContinuousConvMode'),prescaler:this.adcDiv??2});}
      if(type==='ADC'&&!this.f1){const nbr=get('NbrOfConversion')||1;if(get('Resolution')||get('DataAlign')||get('ExternalTrigConvEdge')||!Number.isInteger(nbr)||nbr<1||nbr>16||nbr>1&&!get('ScanConvMode'))throw new Error('ADC1: 12비트, 오른쪽 정렬, 소프트웨어 시작, 스캔 시 NbrOfConversion 1~16을 지원합니다.');if(![0,0x10000,0x20000,0x30000].includes(get('ClockPrescaler')))throw new Error('ADC1: ClockPrescaler를 확인하세요.');this.adc.set(id,{active:false,channel:null,value:0,ranks:[],nbr,scan:!!get('ScanConvMode'),continuous:!!get('ContinuousConvMode'),prescaler:[2,4,6,8][get('ClockPrescaler')/0x10000]});}
      if(type==='TIM')this.timerModel.init(a,r,name.split('_')[2],b);
      this.handles.set(id,h);return 0;
    }
    if(name==='HAL_UART_Receive_IT'){
      const channel=this.uart(this.requireHandle(a,r,'UART').id);if(channel.rx||channel.rxDma)return 2;int(c,1,256,'UART 수신 길이');r.pointerCell(b,c-1);channel.rx={handle:a,buffer:b,count:c,index:0};return 0;
    }
    if(name==='HAL_UART_Transmit_IT'){
      const channel=this.uart(this.requireHandle(a,r,'UART').id);if(channel.tx||channel.txDma)return 2;const bytes=this.bytes(b,c,r),duration=c*10000/channel.bus.uart.baud;this.uartWrite(channel,bytes,r);channel.tx={handle:a,at:r.microTime+duration*1000};r.event(r.microTime/1000+duration,()=>{});return 0;
    }
    if(name==='HAL_ADC_ConfigChannel'){const {id}=this.requireHandle(a,r,'ADC'),s=this.adc.get(id),cfg=r.get(r.pointerCell(b)),channel=int(this.field(cfg,'Channel'),0,this.f1?17:18,'ADC 채널'),rank=this.field(cfg,'Rank');if(!Number.isInteger(rank)||rank<1||rank>s.nbr)throw new Error(`ADC Rank는 1~${s.nbr}(NbrOfConversion)입니다.`);if(channel<16)this.pinFor('ADC1_IN'+channel);s.ranks[rank-1]={channel,sampling:int(this.field(cfg,'SamplingTime'),0,7,'ADC SamplingTime')};if(rank===1)s.channel=channel;return 0;}
    if(name==='HAL_ADC_Start_IT'||name==='HAL_ADC_Stop_IT'){
      const {id}=this.requireHandle(a,r,'ADC'),s=this.adc.get(id);if(s.channel===null)throw new Error('ADC 채널 설정이 필요합니다.');s.generation=(s.generation||0)+1;if(name.endsWith('Stop_IT')){s.active=false;return 0;}
      const gen=s.generation,hal=this;s.active=true;this.noticeIrq.add(this.adcIrq);let k=0;
      const convert=()=>{if(s.generation!==gen||!s.active)return;const x=s.ranks[k%s.nbr]??{channel:s.channel,sampling:0};s.value=this.adcRead(x.channel,r);k++;this.queue(this.adcIrq,function*(){yield* hal.userCall(r,'HAL_ADC_ConvCpltCallback',[a]);},id+':eoc');if(s.continuous||k<(s.scan?s.nbr:1))r.event((r.microTime+this.adcConversionUs((s.ranks[k%s.nbr]??x).sampling))/1000,convert);else s.active=false;};
      r.event((r.microTime+this.adcConversionUs((s.ranks[0]??{sampling:0}).sampling))/1000,convert);return 0;
    }
    if(['HAL_ADC_Start','HAL_ADC_Stop','HAL_ADC_PollForConversion','HAL_ADC_GetValue'].includes(name)){
      const {id}=this.requireHandle(a,r,'ADC'),s=this.adc.get(id);if(s.channel===null)throw new Error('ADC 채널 설정이 필요합니다.');
      if(name==='HAL_ADC_Stop'){s.active=false;return 0;}if(name==='HAL_ADC_Start'){s.value=this.adcRead(s.channel,r);s.active=true;return 0;}if(!s.active)return name==='HAL_ADC_GetValue'?s.value:1;return name==='HAL_ADC_GetValue'?s.value:0;
    }
    const timerResult=this.timerModel.call(name,args,r);if(timerResult!==undefined)return timerResult;
    if(['HAL_I2C_Master_Transmit','HAL_I2C_Master_Receive','HAL_I2C_Mem_Write','HAL_I2C_Mem_Read'].includes(name)){
      this.requireHandle(a,r,'I2C');int(b,16,238,'HAL I2C 주소(7비트 주소 << 1)');if(b&1)throw new Error('HAL I2C 주소는 7비트 주소를 왼쪽으로 1비트 이동하세요.');const addr=b>>1,mem=name.includes('_Mem_'),buffer=mem?e:c,count=mem?f:d;int(count,1,mem?255:256,'I2C 길이');int(mem?g:e,0,4294967295,'I2C timeout');if(mem&&d!==1)throw new Error('I2C 메모리는 8비트 주소를 지원합니다.');
      const receive=name.endsWith('Receive')||name.endsWith('Read');if(receive)r.pointerCell(buffer,count-1);
      const timeout=mem?g:e,duration=(count+1+(mem?(receive?2:1):0))*9000/this.buses.wire.clock;if(duration>timeout){r.microTime+=timeout*1000;return 3;}
      const bytes=receive?[]:this.bytes(buffer,count,r);if(!receive||mem){this.buses.call('Wire.beginTransmission',[addr],r);if(mem)this.buses.call('Wire.write',[int(c,0,255,'메모리 주소')],r);for(const byte of bytes)this.buses.call('Wire.write',[byte],r);if(this.buses.call('Wire.endTransmission',[],r)!==0)return 1;}
      if(receive){if(this.buses.call('Wire.requestFrom',[addr,count],r)!==count)return 1;for(let i=0;i<count;i++)r.set(r.pointerCell(buffer,i),this.buses.call('Wire.read',[],r));}return 0;
    }
    if(['HAL_SPI_Transmit','HAL_SPI_Receive','HAL_SPI_TransmitReceive'].includes(name)){
      this.requireHandle(a,r,'SPI');const both=name==='HAL_SPI_TransmitReceive',receive=name!=='HAL_SPI_Transmit',count=both?d:c;int(count,1,256,'SPI 길이');const timeout=int(both?e:d,0,4294967295,'SPI timeout');const rx=both?c:b;if(receive)r.pointerCell(rx,count-1);const bytes=name==='HAL_SPI_Receive'?Array(count).fill(255):this.bytes(b,count,r);if(count*8000/this.buses.spi.clock>timeout){r.microTime+=timeout*1000;return 3;}bytes.forEach((value,i)=>{const result=this.buses.call('SPI.transfer',[value],r);if(receive)r.set(r.pointerCell(rx,i),result);});return 0;
    }
    if(name==='strlen'){const str=r.format([a]);return str.length;}
    if(name==='printf'){const text=formatPrintf(args,r);if(text)r.api.print(text.replace(/\r?\n$/,''));return text.length;}
    if(name==='puts'){if(args.length!==1)throw new Error('puts는 문자열 하나가 필요합니다.');const text=r.format([a]);if(text.length>4096)throw new Error('puts 출력 한도는 4096자입니다.');r.api.print(text);return text.length+1;}
    if(name.startsWith('HAL_')||name.startsWith('__HAL_'))throw new Error(`지원하지 않는 HAL API: ${name}`);
    return undefined;
  }
}
