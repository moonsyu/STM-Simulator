import {validateMcu,configProblems,irqForPin,IRQ_NAMES} from './mcu-config.js';
import {BusDevices} from './buses.js';
import {SERIAL_IDS,isSerial,serialAf,serialFunction} from './serial-config.js';

export const HAL_CONSTANTS={HAL_OK:0,HAL_ERROR:1,HAL_BUSY:2,HAL_TIMEOUT:3,HAL_MAX_DELAY:4294967295,
  GPIO_PIN_RESET:0,GPIO_PIN_SET:1,GPIO_MODE_INPUT:0,GPIO_MODE_OUTPUT_PP:1,GPIO_MODE_OUTPUT_OD:17,GPIO_MODE_AF_PP:2,GPIO_MODE_AF_OD:18,GPIO_MODE_ANALOG:3,
  GPIO_MODE_IT_RISING:0x10110000,GPIO_MODE_IT_FALLING:0x10210000,GPIO_MODE_IT_RISING_FALLING:0x10310000,GPIO_NOPULL:0,GPIO_PULLUP:1,GPIO_PULLDOWN:2,
  GPIO_SPEED_FREQ_LOW:0,GPIO_SPEED_FREQ_MEDIUM:1,GPIO_SPEED_FREQ_HIGH:2,GPIO_SPEED_FREQ_VERY_HIGH:3,
  ENABLE:1,DISABLE:0,RESET:0,SET:1,UART_WORDLENGTH_8B:0,UART_WORDLENGTH_9B:4096,UART_STOPBITS_1:0,UART_STOPBITS_2:8192,UART_PARITY_NONE:0,UART_PARITY_EVEN:1024,UART_PARITY_ODD:1536,UART_MODE_TX_RX:12,UART_MODE_RX:4,UART_MODE_TX:8,UART_HWCONTROL_NONE:0,UART_OVERSAMPLING_16:0,
  I2C_ADDRESSINGMODE_7BIT:16384,I2C_ADDRESSINGMODE_10BIT:49152,I2C_DUTYCYCLE_2:0,I2C_DUALADDRESS_DISABLE:0,I2C_GENERALCALL_DISABLE:0,I2C_NOSTRETCH_DISABLE:0,I2C_MEMADD_SIZE_8BIT:1,I2C_MEMADD_SIZE_16BIT:16,
  SPI_MODE_MASTER:260,SPI_MODE_SLAVE:0,SPI_DIRECTION_2LINES:0,SPI_DATASIZE_8BIT:0,SPI_DATASIZE_16BIT:2048,SPI_POLARITY_LOW:0,SPI_POLARITY_HIGH:2,SPI_PHASE_1EDGE:0,SPI_PHASE_2EDGE:1,SPI_NSS_SOFT:512,SPI_FIRSTBIT_MSB:0,SPI_FIRSTBIT_LSB:128,SPI_TIMODE_DISABLE:0,SPI_CRCCALCULATION_DISABLE:0,
  ADC_RESOLUTION_12B:0,ADC_DATAALIGN_RIGHT:0,ADC_SCAN_DISABLE:0,ADC_SOFTWARE_START:0,ADC_EXTERNALTRIGCONVEDGE_NONE:0,ADC_EOC_SINGLE_CONV:1,ADC_CLOCK_SYNC_PCLK_DIV4:65536,ADC_SAMPLETIME_3CYCLES:0,
  TIM_COUNTERMODE_UP:0,TIM_CLOCKDIVISION_DIV1:0,TIM_AUTORELOAD_PRELOAD_DISABLE:0,TIM_CLOCKSOURCE_INTERNAL:0,TIM_TRGO_RESET:0,TIM_MASTERSLAVEMODE_DISABLE:0,TIM_OCMODE_PWM1:96,TIM_OCPOLARITY_HIGH:0,TIM_OCFAST_DISABLE:0,
  RCC_OSCILLATORTYPE_HSI:2,RCC_OSCILLATORTYPE_HSE:1,RCC_OSCILLATORTYPE_LSE:4,RCC_OSCILLATORTYPE_LSI:8,RCC_HSI_ON:1,RCC_HSE_ON:1,RCC_HSE_BYPASS:5,RCC_LSE_ON:1,RCC_LSI_ON:1,RCC_HSICALIBRATION_DEFAULT:16,RCC_PLL_ON:2,RCC_PLLSOURCE_HSI:0,RCC_PLLSOURCE_HSE:1,RCC_PLLP_DIV2:2,RCC_PLLP_DIV4:4,RCC_PLLP_DIV6:6,RCC_PLLP_DIV8:8,
  RCC_CLOCKTYPE_HCLK:2,RCC_CLOCKTYPE_SYSCLK:1,RCC_CLOCKTYPE_PCLK1:4,RCC_CLOCKTYPE_PCLK2:8,RCC_SYSCLKSOURCE_PLLCLK:2,RCC_SYSCLKSOURCE_HSI:0,RCC_SYSCLK_DIV1:1,RCC_HCLK_DIV1:1,RCC_HCLK_DIV2:2,RCC_HCLK_DIV4:4,PWR_REGULATOR_VOLTAGE_SCALE1:1,PWR_REGULATOR_VOLTAGE_SCALE2:2,PWR_REGULATOR_VOLTAGE_SCALE3:3,
  FLASH_LATENCY_0:0,FLASH_LATENCY_1:1,FLASH_LATENCY_2:2,FLASH_LATENCY_3:3,FLASH_LATENCY_4:4,FLASH_LATENCY_5:5,NVIC_PRIORITYGROUP_0:7,NVIC_PRIORITYGROUP_4:3
};
for(const port of ['A','B','C','D','H'])HAL_CONSTANTS['GPIO'+port]='GPIO'+port;
for(let i=0;i<16;i++)HAL_CONSTANTS['GPIO_PIN_'+i]=1<<i;
HAL_CONSTANTS.GPIO_PIN_All=65535;
for(let i=0;i<16;i++)HAL_CONSTANTS['ADC_CHANNEL_'+i]=i;
for(let i=1;i<=4;i++)HAL_CONSTANTS['TIM_CHANNEL_'+i]=(i-1)*4;
for(const n of [2,4,8,16,32,64,128,256])HAL_CONSTANTS['SPI_BAUDRATEPRESCALER_'+n]=Math.log2(n)-1;
for(const id of [...SERIAL_IDS,'I2C1','SPI1','ADC1','TIM2',...IRQ_NAMES])HAL_CONSTANTS[id]=id;
for(const id of SERIAL_IDS)HAL_CONSTANTS[`GPIO_AF${serialAf(id)}_${id}`]=serialAf(id);
for(const [name,n]of [['GPIO_AF4_I2C1',4],['GPIO_AF5_SPI1',5],['GPIO_AF1_TIM2',1]])HAL_CONSTANTS[name]=n;

const int=(value,min,max,label)=>{if(!Number.isInteger(value)||value<min||value>max)throw new Error(`${label}: ${min}~${max} 범위의 정수가 필요합니다.`);return value;};
export class HalAdapter {
  constructor(config,buses){this.config=validateMcu(config);const errors=configProblems(this.config);if(errors.length)throw new Error(errors.join('\n'));this.buses=buses;this.nvic=new Map();this.pending=[];this.extiPending=0;this.serials=new Map();this.handles=new Map();this.timers=new Map();this.adc=new Map();this.pwm=new Map();this.latches=new Map();this.priorities=new Map();}
  uart(id){
    if(!isSerial(id))throw new Error(`지원하지 않는 UART 인스턴스: ${id}`);
    if(!this.serials.has(id)){const bus=id==='USART2'?this.buses:new BusDevices(this.buses.project,this.buses.getResult,this.buses.trace);bus.uart.instance=id;bus.received=this.buses.received;this.serials.set(id,{bus,rx:null,tx:null});}
    return this.serials.get(id);
  }
  uartWrite(channel,bytes,r){const before=channel.bus.uart.queue.length;channel.bus.call('Serial1.write',[r.array(bytes),bytes.length],r);for(const byte of channel.bus.uart.queue.slice(before))r.event(byte.at/1000,()=>{});}
  field(object,key){if(object?.kind!=='struct'||!Object.hasOwn(object.fields,key))throw new Error(`HAL 구조체 필드 오류: ${key}`);return object.fields[key].value;}
  handle(ptr,r,type){const h=r.get(r.pointerCell(ptr));if(h?.type!==type+'_HandleTypeDef')throw new Error(`${type} 핸들 포인터가 필요합니다.`);const id=this.field(h,'Instance');if(!this.config.peripherals[id]?.enabled)throw new Error(`${id}: Pinout & Configuration에서 주변장치를 활성화하세요.`);return {h,id,init:this.field(h,'Init')};}
  requireHandle(ptr,r,type){const x=this.handle(ptr,r,type);if(this.handles.get(x.id)!==x.h)throw new Error(`${x.id}: HAL 초기화가 필요합니다.`);return x;}
  pinFor(fn){const pin=Object.keys(this.config.pins).find(p=>this.config.pins[p].function===fn);if(!pin)throw new Error(`${fn}: 핀을 지정하세요.`);return pin;}
  pins(port,mask){if(!/^GPIO[ABCDH]$/.test(port))throw new Error('GPIO 포트를 확인하세요.');int(mask,1,65535,'GPIO 핀 마스크');return Array.from({length:16},(_,i)=>i).filter(i=>mask&(1<<i)).map(i=>'P'+port.at(-1)+i);}
  configured(pin){const p=this.config.pins[pin];if(!p||['Reset','Reserved'].includes(p.function))throw new Error(`${pin}: Pinout에서 핀을 활성화하세요.`);return p;}
  callback(r,name,args=[]){if(r.program.functions[name])r.runCallback({name,args});}
  queue(irq,callback,key=irq){if(this.pending.some(j=>j.key===key))return;this.pending.push({irq,callback,key});if(this.pending.length>256)throw new Error('HAL 인터럽트 대기열 한도를 넘었습니다.');}
  poll(r){
    for(const [id,channel]of this.serials){
      if(channel.tx&&channel.tx.at<=r.microTime+1e-6){const job=channel.tx;channel.tx=null;this.queue(id+'_IRQn',()=>this.callback(r,'HAL_UART_TxCpltCallback',[job.handle]),id+':tx');}
      if(channel.rx){const job=channel.rx;while(job.index<job.count&&channel.bus.call('Serial1.available',[],r)>0)r.set(r.pointerCell(job.buffer,job.index++),channel.bus.call('Serial1.read',[],r));
        if(job.index===job.count){channel.rx=null;this.queue(id+'_IRQn',()=>this.callback(r,'HAL_UART_RxCpltCallback',[job.handle]),id+':rx');}}
    }
    if(!r.interruptsEnabled||r.inCallback)return;
    const ready=this.pending.filter(j=>this.nvic.has(j.irq));this.pending=this.pending.filter(j=>!this.nvic.has(j.irq));ready.sort((a,b)=>this.nvic.get(a.irq)-this.nvic.get(b.irq));for(const job of ready)r.runCallback({host:job.callback});
  }
  invoke(name,args,r){
    if(name==='HAL_Delay'||name==='HAL_UART_Transmit'||name==='HAL_UART_Receive')return this.blocking(name,args,r);
    return null;
  }
  *blocking(name,args,r){
    if(r.inCallback)throw new Error(`${name}: 인터럽트 콜백에서 대기할 수 없습니다.`);
    if(name==='HAL_Delay'){if(args.length!==1)throw new Error('HAL_Delay(ms) 형식을 확인하세요.');int(args[0],0,3600000,'HAL_Delay');yield Math.max(.001,args[0]);return 0;}
    const [ptr,buffer,count,timeout]=args,{id}=this.requireHandle(ptr,r,'UART'),channel=this.uart(id);int(count,1,256,'UART 길이');int(timeout,0,4294967295,'UART timeout');const start=r.microTime/1000;
    if(name==='HAL_UART_Transmit'){
      if(channel.tx)return 2;const bytes=this.bytes(buffer,count,r),duration=count*10000/channel.bus.uart.baud;
      if(duration>timeout){if(timeout)yield timeout;return 3;}
      this.uartWrite(channel,bytes,r);yield duration;return 0;
    }
    if(channel.rx)return 2;r.pointerCell(buffer,count-1);let index=0;
    while(index<count){while(index<count&&channel.bus.call('Serial1.available',[],r)>0)r.set(r.pointerCell(buffer,index++),channel.bus.call('Serial1.read',[],r));if(index===count)return 0;if(r.microTime/1000-start>=timeout)return 3;yield Math.min(1,timeout-(r.microTime/1000-start));}
    return 0;
  }
  bytes(buffer,count,r){int(count,1,256,'전송 길이');if(typeof buffer==='string'){if(count>buffer.length+1)throw new Error('문자열 범위를 벗어난 전송');return Array.from({length:count},(_,i)=>buffer.charCodeAt(i)||0);}return Array.from({length:count},(_,i)=>int(r.get(r.pointerCell(buffer,i)),0,255,'전송 바이트'));}
  call(name,args,r){
    const [a,b,c,d,e,f,g]=args;
    if(name==='HAL_Init'){this.callback(r,'HAL_MspInit');return 0;}
    if(name==='HAL_GetTick')return Math.floor(r.microTime/1000)>>>0;
    if(name==='__disable_irq'){r.interruptsEnabled=false;return 0;}if(name==='__enable_irq'){r.interruptsEnabled=true;return 0;}
    if(name==='Error_Handler')throw new Error('Error_Handler(): HAL 초기화 또는 사용자 코드 오류');
    if(/^__HAL_RCC_(GPIO[ABCDH]|SYSCFG|PWR|USART[1236]|UART[45]|I2C1|SPI1|ADC1|TIM2)_CLK_ENABLE$/.test(name))return 0;
    if(['HAL_RCC_OscConfig','HAL_RCC_ClockConfig','HAL_PWREx_ControlVoltageScaling','HAL_PWREx_EnableOverDrive','__HAL_PWR_VOLTAGESCALING_CONFIG','HAL_NVIC_SetPriorityGrouping'].includes(name))return 0;
    if(name==='HAL_NVIC_SetPriority'){if(!IRQ_NAMES.includes(a))throw new Error(`미지원 IRQ: ${a}`);int(b,0,15,'IRQ priority');this.priorities.set(a,b);if(this.nvic.has(a))this.nvic.set(a,b);return 0;}
    if(name==='HAL_NVIC_EnableIRQ'){if(!IRQ_NAMES.includes(a)||!this.config.nvic[a]?.enabled)throw new Error(`${a}: NVIC 설정에서 인터럽트를 활성화하세요.`);this.nvic.set(a,this.priorities.get(a)??this.config.nvic[a].priority);return 0;}
    if(name==='HAL_NVIC_DisableIRQ'){this.nvic.delete(a);return 0;}
    if(name==='HAL_GPIO_Init'){
      const init=r.get(r.pointerCell(b)),mask=this.field(init,'Pin'),mode=this.field(init,'Mode'),pull=this.field(init,'Pull');
      for(const pin of this.pins(a,mask)){
        const p=this.configured(pin),expected=p.function==='GPIO_Output'?1:p.function==='GPIO_Input'?0:p.function==='GPIO_EXTI'?HAL_CONSTANTS['GPIO_MODE_IT_'+(p.edge==='CHANGE'?'RISING_FALLING':p.edge)]:p.function==='Analog'||p.function.startsWith('ADC1_')?3:p.function.startsWith('I2C1_')?18:2;
        if(mode!==expected||pull!==['NOPULL','PULLUP','PULLDOWN'].indexOf(p.pull))throw new Error(`${pin}: HAL_GPIO_Init 모드/풀 설정과 Pinout이 다릅니다.`);
        if([2,18].includes(mode)){const serial=serialFunction(p.function),af=serial?serialAf(serial):p.function.startsWith('I2C1_')?4:p.function.startsWith('SPI1_')?5:1;if(this.field(init,'Alternate')!==af)throw new Error(`${pin}: GPIO Alternate(AF) 설정을 확인하세요.`);}
        if(mode===1){r.call('pinMode',[pin,'OUTPUT']);r.call('digitalWrite',[pin,this.latches.get(pin)??p.initial]);}
        else r.call('pinMode',[pin,p.pull==='PULLUP'?'INPUT_PULLUP':p.pull==='PULLDOWN'?'INPUT_PULLDOWN':'INPUT']);
        if(p.function==='GPIO_EXTI')r.interrupts.set(pin,{mode:p.edge,previous:Number(!!r.api.read(pin)),pending:false,callback:{host:()=>{const mask=1<<Number(pin.slice(2));this.extiPending|=mask;this.queue(irqForPin(pin),()=>{const handler=irqForPin(pin).replace('_IRQn','_IRQHandler');if(r.program.functions[handler])this.callback(r,handler);else this.call('HAL_GPIO_EXTI_IRQHandler',[mask],r);},pin);}}});
      }return 0;
    }
    if(['HAL_GPIO_WritePin','HAL_GPIO_TogglePin','HAL_GPIO_ReadPin','HAL_GPIO_DeInit'].includes(name)){
      const pins=this.pins(a,b);if(name==='HAL_GPIO_ReadPin'){for(const pin of pins)this.configured(pin);return Number(pins.some(pin=>r.call('digitalRead',[pin])));}
      for(const pin of pins){const p=this.configured(pin);if(name==='HAL_GPIO_DeInit'){r.call('pinMode',[pin,'INPUT']);r.interrupts.delete(pin);continue;}if(p.function!=='GPIO_Output')throw new Error(`${pin}: GPIO_Output으로 설정하세요.`);const value=name==='HAL_GPIO_TogglePin'?Number(!(r.gpio[pin]?.value)):int(c,0,1,'GPIO 상태');this.latches.set(pin,value);if(r.gpio[pin]?.mode==='OUTPUT')r.call('digitalWrite',[pin,value]);}
      return 0;
    }
    if(name==='HAL_GPIO_EXTI_IRQHandler'){int(a,1,65535,'EXTI 마스크');if(this.extiPending&a){this.extiPending&=~a;this.callback(r,'HAL_GPIO_EXTI_Callback',[a]);}return 0;}
    if(['HAL_UART_Init','HAL_I2C_Init','HAL_SPI_Init','HAL_ADC_Init','HAL_TIM_Base_Init','HAL_TIM_PWM_Init'].includes(name)){
      const type=name.split('_')[1],{h,id,init}=this.handle(a,r,type),get=k=>this.field(init,k);this.callback(r,`HAL_${type}${type==='TIM'?'_Base':''}_MspInit`,[a]);
      if(type==='UART'){
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
      if(type==='ADC'){if(get('Resolution')||get('DataAlign')||get('ScanConvMode')||get('ExternalTrigConvEdge')||get('NbrOfConversion')>1)throw new Error('ADC1: 12비트, 오른쪽 정렬, 단일 소프트웨어 채널만 지원합니다.');this.adc.set(id,{active:false,channel:null,value:0});}
      if(type==='TIM'){if(get('CounterMode')||get('ClockDivision'))throw new Error('TIM2: up counter, DIV1만 지원합니다.');int(get('Prescaler'),0,65535,'Prescaler');int(get('Period'),0,4294967295,'Period');if(get('Prescaler')!==this.config.peripherals.TIM2.prescaler||get('Period')!==this.config.peripherals.TIM2.period)throw new Error('TIM2: 소스와 Pinout의 Prescaler/Period가 다릅니다.');}
      this.handles.set(id,h);return 0;
    }
    if(name==='HAL_UART_Receive_IT'){
      const channel=this.uart(this.requireHandle(a,r,'UART').id);if(channel.rx)return 2;int(c,1,256,'UART 수신 길이');r.pointerCell(b,c-1);channel.rx={handle:a,buffer:b,count:c,index:0};return 0;
    }
    if(name==='HAL_UART_Transmit_IT'){
      const channel=this.uart(this.requireHandle(a,r,'UART').id);if(channel.tx)return 2;const bytes=this.bytes(b,c,r),duration=c*10000/channel.bus.uart.baud;this.uartWrite(channel,bytes,r);channel.tx={handle:a,at:r.microTime+duration*1000};r.event(r.microTime/1000+duration,()=>{});return 0;
    }
    if(name==='HAL_UART_AbortReceive'){this.uart(this.requireHandle(a,r,'UART').id).rx=null;return 0;}
    if(name==='HAL_UART_IRQHandler'){this.requireHandle(a,r,'UART');this.poll(r);return 0;}
    if(name==='HAL_ADC_ConfigChannel'){const {id}=this.requireHandle(a,r,'ADC'),cfg=r.get(r.pointerCell(b)),channel=int(this.field(cfg,'Channel'),0,15,'ADC 채널');if(this.field(cfg,'Rank')!==1)throw new Error('ADC 단일 채널 Rank 1만 지원합니다.');this.pinFor('ADC1_IN'+channel);this.adc.get(id).channel=channel;return 0;}
    if(['HAL_ADC_Start','HAL_ADC_Stop','HAL_ADC_PollForConversion','HAL_ADC_GetValue'].includes(name)){
      const {id}=this.requireHandle(a,r,'ADC'),s=this.adc.get(id);if(s.channel===null)throw new Error('ADC 채널 설정이 필요합니다.');
      if(name==='HAL_ADC_Stop'){s.active=false;return 0;}if(name==='HAL_ADC_Start'){s.value=r.call('analogRead',[this.pinFor('ADC1_IN'+s.channel)]);s.active=true;return 0;}if(!s.active)return name==='HAL_ADC_GetValue'?s.value:1;return name==='HAL_ADC_GetValue'?s.value:0;
    }
    if(name==='HAL_TIM_Base_Start_IT'){
      const {id,init}=this.requireHandle(a,r,'TIM');if(this.timers.has(id))return 2;const ms=(this.field(init,'Prescaler')+1)*(this.field(init,'Period')+1)*1000/this.config.timerClockHz;if(ms<1||ms>3600000)throw new Error('TIM2 인터럽트 주기 범위: 1~3600000 ms');
      const job={active:true};this.timers.set(id,job);const fire=()=>{if(!job.active)return;this.queue('TIM2_IRQn',()=>{if(job.active)this.callback(r,'HAL_TIM_PeriodElapsedCallback',[a]);});r.event(r.microTime/1000+ms,fire);};r.event(r.microTime/1000+ms,fire);return 0;
    }
    if(name==='HAL_TIM_Base_Stop_IT'){const {id}=this.requireHandle(a,r,'TIM'),s=this.timers.get(id);if(s)s.active=false;this.timers.delete(id);return 0;}
    if(name==='HAL_TIM_ConfigClockSource'){this.handle(a,r,'TIM');if(this.field(r.get(r.pointerCell(b)),'ClockSource')!==0)throw new Error('TIM2 내부 클록만 지원합니다.');return 0;}
    if(name==='HAL_TIMEx_MasterConfigSynchronization'){this.handle(a,r,'TIM');const cfg=r.get(r.pointerCell(b));if(this.field(cfg,'MasterOutputTrigger')||this.field(cfg,'MasterSlaveMode'))throw new Error('타이머 동기화는 지원하지 않습니다.');return 0;}
    if(name==='HAL_TIM_MspPostInit'){this.handle(a,r,'TIM');return 0;}
    if(name==='HAL_TIM_PWM_ConfigChannel'){const {id}=this.requireHandle(a,r,'TIM'),cfg=r.get(r.pointerCell(b));if(this.field(cfg,'OCMode')!==96||this.field(cfg,'OCPolarity'))throw new Error('PWM1 active high만 지원합니다.');int(c/4+1,1,4,'TIM 채널');this.pwm.set(id+':'+c,{pulse:this.field(cfg,'Pulse'),active:false});return 0;}
    if(['HAL_TIM_PWM_Start','HAL_TIM_PWM_Stop','__HAL_TIM_SET_COMPARE'].includes(name)){
      const {id,init}=this.requireHandle(a,r,'TIM'),channel=int(b/4+1,1,4,'TIM 채널'),key=id+':'+b,entry=this.pwm.get(key);if(!entry)throw new Error('PWM 채널 초기화가 필요합니다.');const pin=this.pinFor('TIM2_CH'+channel),period=this.field(init,'Period')+1;
      if(name==='__HAL_TIM_SET_COMPARE')entry.pulse=int(c,0,period,'PWM compare');else entry.active=name==='HAL_TIM_PWM_Start';
      const hz=this.config.timerClockHz/((this.field(init,'Prescaler')+1)*period);r.call('pinMode',[pin,'OUTPUT']);if(entry.active){r.call('analogWriteFrequency',[pin,hz]);r.call('analogWrite',[pin,Math.max(0,Math.min(255,entry.pulse/period*255))]);}else r.call('digitalWrite',[pin,0]);return 0;
    }
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
    if(name==='printf'){if(typeof a!=='string'||args.length!==1||a.includes('%'))throw new Error('printf는 형식 인자 없는 문자열만 지원합니다. UART는 HAL_UART_Transmit을 사용하세요.');r.api.print(a);return a.length;}
    if(name.startsWith('HAL_')||name.startsWith('__HAL_'))throw new Error(`지원하지 않는 HAL API: ${name}`);
    return undefined;
  }
}
