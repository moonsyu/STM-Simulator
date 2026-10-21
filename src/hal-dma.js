import {readElement,writeElement,readBytes,checkRange} from './hal-memory.js';
import {receiveWs2812} from './rgb-color.js';
// STM32F446 DMA1/DMA2 streams and the peripheral DMA paths of the HAL interpreter.
// Transfers take peripheral time (UART byte frames, ADC conversions, SPI/I2C clocks, timer periods)
// and move data into / out of the user's C arrays item by item.
export const DMA_STREAMS=['DMA1','DMA2'].flatMap(d=>Array.from({length:8},(_,i)=>`${d}_Stream${i}`));
// RM0390 tables 28/29: request -> [stream, channel] options.
export const DMA_REQUESTS={
 USART1_RX:[['DMA2_Stream2',4],['DMA2_Stream5',4]],USART1_TX:[['DMA2_Stream7',4]],USART2_RX:[['DMA1_Stream5',4]],USART2_TX:[['DMA1_Stream6',4]],
 USART3_RX:[['DMA1_Stream1',4]],USART3_TX:[['DMA1_Stream3',4],['DMA1_Stream4',7]],UART4_RX:[['DMA1_Stream2',4]],UART4_TX:[['DMA1_Stream4',4]],
 UART5_RX:[['DMA1_Stream0',4]],UART5_TX:[['DMA1_Stream7',4]],USART6_RX:[['DMA2_Stream1',5],['DMA2_Stream2',5]],USART6_TX:[['DMA2_Stream6',5],['DMA2_Stream7',5]],
 ADC1:[['DMA2_Stream0',0],['DMA2_Stream4',0]],SPI1_RX:[['DMA2_Stream0',3],['DMA2_Stream2',3]],SPI1_TX:[['DMA2_Stream3',3],['DMA2_Stream5',3]],
 I2C1_RX:[['DMA1_Stream0',1],['DMA1_Stream5',1]],I2C1_TX:[['DMA1_Stream6',1],['DMA1_Stream7',1]],
 TIM2_CH1:[['DMA1_Stream5',3]],TIM2_CH2:[['DMA1_Stream6',3]],TIM2_CH3:[['DMA1_Stream1',3]],TIM2_CH4:[['DMA1_Stream6',3],['DMA1_Stream7',3]],
 TIM3_CH1:[['DMA1_Stream4',5]],TIM3_CH2:[['DMA1_Stream5',5]],TIM3_CH3:[['DMA1_Stream7',5]],TIM3_CH4:[['DMA1_Stream2',5]],
 TIM4_CH1:[['DMA1_Stream0',2]],TIM4_CH2:[['DMA1_Stream3',2]],TIM4_CH3:[['DMA1_Stream7',2]],
 TIM5_CH1:[['DMA1_Stream2',6]],TIM5_CH2:[['DMA1_Stream4',6]],TIM5_CH3:[['DMA1_Stream0',6]],TIM5_CH4:[['DMA1_Stream1',6],['DMA1_Stream3',6]],
 DCMI:[['DMA2_Stream1',1],['DMA2_Stream7',1]],SDIO_RX:[['DMA2_Stream3',4],['DMA2_Stream6',4]],SDIO_TX:[['DMA2_Stream3',4],['DMA2_Stream6',4]],
 MEMTOMEM:Array.from({length:8},(_,i)=>[`DMA2_Stream${i}`,null])
};
export const DMA_CONSTANTS={...Object.fromEntries(DMA_STREAMS.map(s=>[s,s])),...Object.fromEntries(Array.from({length:8},(_,i)=>['DMA_CHANNEL_'+i,i*0x2000000])),
 DMA_PERIPH_TO_MEMORY:0,DMA_MEMORY_TO_PERIPH:0x40,DMA_MEMORY_TO_MEMORY:0x80,DMA_PINC_ENABLE:0x200,DMA_PINC_DISABLE:0,DMA_MINC_ENABLE:0x400,DMA_MINC_DISABLE:0,
 DMA_PDATAALIGN_BYTE:0,DMA_PDATAALIGN_HALFWORD:0x800,DMA_PDATAALIGN_WORD:0x1000,DMA_MDATAALIGN_BYTE:0,DMA_MDATAALIGN_HALFWORD:0x2000,DMA_MDATAALIGN_WORD:0x4000,
 DMA_NORMAL:0,DMA_CIRCULAR:0x100,DMA_PFCTRL:0x20,DMA_PRIORITY_LOW:0,DMA_PRIORITY_MEDIUM:0x10000,DMA_PRIORITY_HIGH:0x20000,DMA_PRIORITY_VERY_HIGH:0x30000,
 DMA_FIFOMODE_DISABLE:0,DMA_FIFOMODE_ENABLE:4,DMA_FIFO_THRESHOLD_1QUARTERFULL:0,DMA_FIFO_THRESHOLD_HALFFULL:1,DMA_FIFO_THRESHOLD_3QUARTERSFULL:2,DMA_FIFO_THRESHOLD_FULL:3,
 DMA_MBURST_SINGLE:0,DMA_MBURST_INC4:0x800000,DMA_PBURST_SINGLE:0,DMA_PBURST_INC4:0x200000,DMA_IT_TC:0x10,DMA_IT_HT:0x08,DMA_IT_TE:0x04,DMA_IT_DME:0x02,DMA_IT_FE:0x80,
 HAL_DMA_FULL_TRANSFER:0,HAL_DMA_HALF_TRANSFER:1,HAL_DMA_XFER_CPLT_CB_ID:0,HAL_DMA_XFER_HALFCPLT_CB_ID:1,HAL_DMA_XFER_M1CPLT_CB_ID:2,HAL_DMA_XFER_M1HALFCPLT_CB_ID:3,HAL_DMA_XFER_ERROR_CB_ID:4,HAL_DMA_XFER_ABORT_CB_ID:5,HAL_DMA_XFER_ALL_CB_ID:6,
 HAL_DMA_STATE_RESET:0,HAL_DMA_STATE_READY:1,HAL_DMA_STATE_BUSY:2,HAL_DMA_STATE_TIMEOUT:3,HAL_DMA_STATE_ERROR:4,HAL_DMA_STATE_ABORT:5,
 HAL_DMA_ERROR_NONE:0,HAL_DMA_ERROR_TE:1,HAL_DMA_ERROR_FE:2,HAL_DMA_ERROR_DME:4,HAL_DMA_ERROR_TIMEOUT:0x20,HAL_DMA_ERROR_PARAM:0x40,HAL_DMA_ERROR_NO_XFER:0x80,
 TIM_DMA_ID_UPDATE:0,TIM_DMA_ID_CC1:1,TIM_DMA_ID_CC2:2,TIM_DMA_ID_CC3:3,TIM_DMA_ID_CC4:4,TIM_DMA_ID_COMMUTATION:5,TIM_DMA_ID_TRIGGER:6,
 HAL_UART_RXEVENT_TC:0,HAL_UART_RXEVENT_HT:1,HAL_UART_RXEVENT_IDLE:2,HAL_UART_RECEPTION_STANDARD:0,HAL_UART_RECEPTION_TOIDLE:1,UART_IT_IDLE:0x10,UART_IT_RXNE:0x20,UART_IT_TC:0x40,UART_IT_TXE:0x80,UART_IT_PE:0x100,UART_IT_ERR:1,
 ADC_SCAN_ENABLE:1,ADC_EOC_SEQ_CONV:0,ADC_CLOCK_SYNC_PCLK_DIV2:0,ADC_CLOCK_SYNC_PCLK_DIV6:0x20000,ADC_CLOCK_SYNC_PCLK_DIV8:0x30000,ADC_SAMPLETIME_15CYCLES:1,ADC_SAMPLETIME_28CYCLES:2,ADC_SAMPLETIME_56CYCLES:3,ADC_SAMPLETIME_84CYCLES:4,ADC_SAMPLETIME_112CYCLES:5,ADC_SAMPLETIME_144CYCLES:6,
 ADC_CHANNEL_16:16,ADC_CHANNEL_17:17,ADC_CHANNEL_18:18,ADC_CHANNEL_TEMPSENSOR:16,ADC_CHANNEL_VREFINT:17,ADC_CHANNEL_VBAT:18,HAL_ADC_STATE_READY:1,HAL_I2C_ERROR_NONE:0,HAL_I2C_ERROR_BERR:1,HAL_I2C_ERROR_ARLO:2,HAL_I2C_ERROR_AF:4,HAL_I2C_ERROR_OVR:8,HAL_I2C_ERROR_DMA:16,HAL_I2C_ERROR_TIMEOUT:32,
 HAL_SPI_ERROR_NONE:0,HAL_SPI_ERROR_MODF:1,HAL_SPI_ERROR_CRC:2,HAL_SPI_ERROR_OVR:4,HAL_SPI_ERROR_DMA:16};
const int=(v,min,max,label)=>{if(!Number.isInteger(v)||v<min||v>max)throw new Error(`${label}: ${min}~${max} 범위의 정수가 필요합니다.`);return v;};
const WIDTH={0:1,0x800:2,0x1000:4},MWIDTH={0:1,0x2000:2,0x4000:4},BATCH_US=50;
const isFn=v=>v?.kind==='function';
export class HalDma{
 constructor(hal){this.hal=hal;this.streams=new Map();this.adcRuns=new Map();}
 // ---- DMA handles ----
 handle(ptr,r){const h=r.get(r.pointerCell(ptr));if(h?.type!=='DMA_HandleTypeDef')throw new Error('DMA_HandleTypeDef 포인터가 필요합니다.');return h;}
 field(h,k){return this.hal.field(h,k);}
 state(h){const id=this.field(h,'Instance');if(!DMA_STREAMS.includes(id))throw new Error(`DMA 스트림 이름을 확인하세요: ${id}`);if(!this.streams.has(id))this.streams.set(id,{id,irq:id+'_IRQn',busy:false,gen:0,flags:0,it:{tc:true,ht:true,te:true},index:0,count:0,remaining:0});const st=this.streams.get(id);return st;}
 init(ptr,r){
  const h=this.handle(ptr,r),st=this.state(h),init=this.field(h,'Init'),get=k=>this.field(init,k),ch=get('Channel'),dir=get('Direction');
  if(!Number.isInteger(ch)||ch%0x2000000||ch/0x2000000>7)throw new Error(`${st.id}: DMA_CHANNEL_0~7을 사용하세요.`);
  if(![0,0x40,0x80].includes(dir))throw new Error(`${st.id}: DMA 방향을 확인하세요.`);if(dir===0x80&&!st.id.startsWith('DMA2'))throw new Error('메모리→메모리 전송은 DMA2 스트림만 지원합니다.');
  if(!(get('PeriphDataAlignment') in WIDTH)||!(get('MemDataAlignment') in MWIDTH))throw new Error(`${st.id}: DMA 데이터 정렬을 확인하세요.`);
  if(![0,0x100].includes(get('Mode')))throw new Error(`${st.id}: DMA_NORMAL 또는 DMA_CIRCULAR를 사용하세요.`);if(dir===0x80&&get('Mode'))throw new Error('메모리→메모리 전송은 순환 모드를 지원하지 않습니다.');
  if(st.busy)return 2;st.handle=h;st.ptr=ptr;st.inited=true;h.fields.State.value=1;h.fields.ErrorCode.value=0;return 0;
 }
 // Handle linked with __HAL_LINKDMA(handle, field, hdma).
 linked(r,handle,field,label){
  const ptr=this.hal.field(handle,field);if(!ptr||ptr?.kind!=='pointer')throw new Error(`${label}: __HAL_LINKDMA(…, ${field}, hdma_…)로 DMA 핸들을 연결하세요.`);
  const h=r.get(r.pointerCell(ptr));if(h?.type!=='DMA_HandleTypeDef')throw new Error(`${label}: ${field}에 DMA 핸들이 연결되지 않았습니다.`);
  const st=this.state(h);if(!st.inited||st.handle!==h)throw new Error(`${label}: HAL_DMA_Init(${st.id})이 필요합니다.`);st.ptr=ptr;return {h,st,ptr};
 }
 check(link,request,direction){
  const {h,st}=link,init=this.field(h,'Init'),channel=this.field(init,'Channel')/0x2000000,options=DMA_REQUESTS[request];
  if(!options?.some(([s,c])=>s===st.id&&(c===null||c===channel)))throw new Error(`${request}: ${st.id} 채널 ${channel}은(는) 이 요청을 처리하지 않습니다. 가능한 조합: ${options.map(([s,c])=>s+(c===null?'':' CH'+c)).join(', ')}`);
  const dir=this.field(init,'Direction');if(direction!==undefined&&dir!==direction)throw new Error(`${request}: DMA Direction이 ${direction===0?'DMA_PERIPH_TO_MEMORY':direction===0x40?'DMA_MEMORY_TO_PERIPH':'DMA_MEMORY_TO_MEMORY'}이어야 합니다.`);
  this.hal.noticeIrq.add(st.irq);return link;
 }
 widths(h){const init=this.field(h,'Init');return {mem:MWIDTH[this.field(init,'MemDataAlignment')],periph:WIDTH[this.field(init,'PeriphDataAlignment')],minc:!!(this.field(init,'MemInc')&0x400),pinc:!!(this.field(init,'PeriphInc')&0x200),circular:this.field(init,'Mode')===0x100};}
 // ---- transfer engine ----
 start(r,link,spec){
  const st=link.st,w=this.widths(link.h);if(st.busy)return 2;int(spec.count,1,65535,'DMA 전송 길이');
  Object.assign(st,{busy:true,paused:false,count:spec.count,index:0,remaining:spec.count,half:Math.floor(spec.count/2),spec,circular:spec.circular??w.circular,gen:st.gen+1,base:r.microTime,flags:0,handle:link.h,ptr:link.ptr});
  st.it={tc:spec.it!==false,ht:spec.it!==false,te:spec.it!==false};link.h.fields.State.value=2;link.h.fields.ErrorCode.value=0;
  if(!spec.external)this.schedule(r,st);return 0;
 }
 schedule(r,st){
  if(!st.busy||st.paused)return;const gen=st.gen,start=st.spec.phase==='start',k=start?1:Math.max(1,Math.min(st.count-st.index,Math.floor(BATCH_US/st.spec.itemUs)));
  const at=st.base+(st.index+(start?0:k))*st.spec.itemUs;
  r.event(at/1000,()=>{if(gen!==st.gen||!st.busy||st.paused)return;for(let n=0;n<k&&st.busy&&gen===st.gen;n++){st.spec.item(st.index,r);this.advance(r,st);}if(gen===st.gen)this.schedule(r,st);});
 }
 advance(r,st){
  if(!st.busy)return;st.index++;st.remaining=st.count-st.index;
  if(st.half&&st.index===st.half){st.flags|=1;if(st.it.ht&&st.spec.onHalf)this.hal.queue(st.irq,st.spec.onHalf,st.id+':ht');}
  if(st.index>=st.count){
   st.flags|=2;const done=st.spec.onComplete;
   if(st.circular){st.index=0;st.remaining=st.count;st.base+=st.count*st.spec.itemUs;}else{st.busy=false;st.handle.fields.State.value=1;}
   st.spec.onDone?.(r);if(st.it.tc&&done)this.hal.queue(st.irq,done,st.id+':tc');
  }
 }
 stop(st){if(!st)return;st.busy=false;st.gen++;if(st.handle)st.handle.fields.State.value=1;}
 pause(st,r){if(st?.busy){st.paused=true;}}
 resume(st,r){if(st?.busy&&st.paused){st.paused=false;st.base=r.microTime-st.index*st.spec.itemUs;if(!st.spec.external)this.schedule(r,st);}}
 hclk(){return this.hal.config.timerClockHz;}
 callbackJob(r,st,field,fallback){const hal=this.hal;return function*(){const cb=st.handle.fields[field]?.value;if(isFn(cb)&&r.program.functions[cb.name])yield* r.invoke(cb.name,[st.ptr]);else if(fallback)yield* fallback();};}
 // ---- user-level API ----
 invoke(name,args,r){
  const hal=this.hal;
  if(name==='HAL_DMA_IRQHandler'){const st=this.state(this.handle(args[0],r));return hal.drain(r,st.irq);}
  if(name==='HAL_DMA_PollForTransfer')return this.pollTransfer(args,r);
  if(name==='HAL_ADC_PollForConversion'&&this.adcRuns.size)return null;
  return null;
 }
 *pollTransfer([ptr,level,timeout],r){
  const h=this.handle(ptr,r),st=this.state(h),want=level===1?1:2,start=r.microTime;
  if(!st.busy&&!(st.flags&want))return 1;if(st.circular)throw new Error('순환 모드 DMA에는 HAL_DMA_PollForTransfer를 사용할 수 없습니다.');
  while(!(st.flags&want)){const left=timeout-(r.microTime-start)/1000;if(timeout!==0xffffffff&&left<=0){h.fields.ErrorCode.value|=0x20;h.fields.State.value=1;this.stop(st);return 3;}const eta=st.busy?Math.max(.001,(st.base+(want===1?st.half:st.count)*st.spec.itemUs-r.microTime)/1000):left;yield Math.min(eta,timeout===0xffffffff?eta:left);}
  st.flags&=want===2?0:~1;return 0;
 }
 call(name,args,r){
  const hal=this.hal,[a,b,c,d]=args;
  if(name==='__HAL_RCC_DMA1_CLK_ENABLE'||name==='__HAL_RCC_DMA2_CLK_ENABLE')return 0;
  if(name==='HAL_DMA_Init')return this.init(a,r);
  if(name==='HAL_DMA_DeInit'){const h=this.handle(a,r),st=this.state(h);this.stop(st);st.inited=false;h.fields.State.value=0;return 0;}
  if(name==='HAL_DMA_GetState')return this.handle(a,r).fields.State.value;
  if(name==='HAL_DMA_GetError')return this.handle(a,r).fields.ErrorCode.value;
  if(name==='__HAL_DMA_GET_COUNTER'){const st=this.state(this.handle(a,r));return st.busy?st.remaining:st.flags&2&&!st.circular?0:st.remaining;}
  if(name==='__HAL_DMA_ENABLE_IT'||name==='__HAL_DMA_DISABLE_IT'){const st=this.state(this.handle(a,r)),on=name.includes('ENABLE');if(b&0x10)st.it.tc=on;if(b&8)st.it.ht=on;if(b&4)st.it.te=on;return 0;}
  if(name==='__HAL_DMA_DISABLE'){this.stop(this.state(this.handle(a,r)));return 0;}
  if(name==='__HAL_DMA_ENABLE')return 0;
  if(name==='HAL_DMA_RegisterCallback'||name==='HAL_DMA_UnRegisterCallback'){
   const h=this.handle(a,r),fields=['XferCpltCallback','XferHalfCpltCallback','XferM1CpltCallback','XferM1HalfCpltCallback','XferErrorCallback','XferAbortCallback'],set=(k,v)=>h.fields[k].value=v;
   if(name==='HAL_DMA_UnRegisterCallback'){if(b===6)fields.forEach(k=>set(k,0));else set(fields[int(b,0,5,'DMA 콜백 ID')],0);return 0;}
   if(!isFn(c)||!r.program.functions[c.name])throw new Error('HAL_DMA_RegisterCallback: 사용자 함수를 지정하세요.');set(fields[int(b,0,5,'DMA 콜백 ID')],c);return 0;
  }
  if(name==='HAL_DMA_Start'||name==='HAL_DMA_Start_IT'){
   const h=this.handle(a,r),st=this.state(h);if(!st.inited)throw new Error(`${st.id}: HAL_DMA_Init이 필요합니다.`);const link=this.check({h,st,ptr:a},'MEMTOMEM',0x80),w=this.widths(h);int(d,1,65535,'DMA 길이');
   checkRange(r,b,w.pinc?d*w.periph:w.periph,'DMA 원본');checkRange(r,c,w.minc?d*w.mem:w.mem,'DMA 대상');const it=name.endsWith('_IT');
   return this.start(r,link,{count:d,it,itemUs:4e6/this.hclk(),item:i=>writeElement(r,c,w.minc?i:0,w.mem,readElement(r,b,w.pinc?i:0,w.periph)&(2**(8*w.mem)-1)),
    onHalf:this.callbackJob(r,st,'XferHalfCpltCallback'),onComplete:this.callbackJob(r,st,'XferCpltCallback')});
  }
  if(name==='HAL_DMA_Abort'||name==='HAL_DMA_Abort_IT'){const h=this.handle(a,r),st=this.state(h);if(!st.busy)return name.endsWith('_IT')?1:0;this.stop(st);if(name.endsWith('_IT'))hal.queue(st.irq,this.callbackJob(r,st,'XferAbortCallback'),st.id+':abort');return 0;}
  return this.peripheral(name,args,r);
 }
 // ---- peripherals ----
 peripheral(name,args,r){
  const hal=this.hal,[a,b,c,d,e,f]=args;
  if(/^HAL_UART_(Transmit|Receive)_DMA$|^HAL_UARTEx_ReceiveToIdle_DMA$|^HAL_UART_DMA(Stop|Pause|Resume)$|^HAL_UART_Abort(Receive|Transmit)?$/.test(name))return this.uart(name,args,r);
  if(name==='HAL_ADC_Start_DMA'||name==='HAL_ADC_Stop_DMA')return this.adc(name,args,r);
  if(/^HAL_SPI_(Transmit|Receive|TransmitReceive)_DMA$|^HAL_SPI_DMA(Stop|Pause|Resume)$/.test(name))return this.spi(name,args,r);
  if(/^HAL_I2C_(Master_Transmit|Master_Receive|Mem_Write|Mem_Read)_(DMA|IT)$/.test(name))return this.i2c(name,args,r);
  if(name==='HAL_TIM_PWM_Start_DMA'||name==='HAL_TIM_PWM_Stop_DMA')return this.timPwm(name,args,r);
  return undefined;
 }
 uart(name,args,r){
  const hal=this.hal,[a,b,c]=args,{h,id}=hal.requireHandle(a,r,'UART'),ch=hal.uart(id),u=ch.bus.uart,byteUs=1e7/u.baud,set=(k,v)=>{if(h.fields[k])h.fields[k].value=v;};
  if(name==='HAL_UART_Transmit_DMA'){
   if(ch.tx||ch.txDma)return 2;int(c,1,65535,'UART DMA 길이');const link=this.check(this.linked(r,h,'hdmatx',id),id+'_TX',0x40),w=this.widths(link.h);checkRange(r,b,c*w.mem,'UART DMA 송신');
   hal.noticeIrq.add(id+'_IRQn');set('gState',0x21);const job={link},self=this;ch.txDma=job;
   return this.start(r,link,{count:c,itemUs:byteUs,phase:'start',item:i=>hal.uartWrite(ch,[readElement(r,b,w.minc?i:0,w.mem)&255],r),
    onHalf:function*(){yield* hal.userCall(r,'HAL_UART_TxHalfCpltCallback',[a]);},
    onComplete:function*(){
     if(link.st.circular){yield* hal.userCall(r,'HAL_UART_TxCpltCallback',[a]);return;}
     // Normal mode: DMA TC enables the USART TC interrupt; the callback follows the last stop bit.
     const end=Math.max(r.microTime,link.st.base+c*byteUs);r.event(end/1000,()=>hal.queue(id+'_IRQn',function*(){if(ch.txDma===job){ch.txDma=null;set('gState',0x20);}yield* hal.userCall(r,'HAL_UART_TxCpltCallback',[a]);},id+':txdma'));
    },onDone:()=>{if(link.st.circular)return;}});
  }
  if(name==='HAL_UART_Receive_DMA'||name==='HAL_UARTEx_ReceiveToIdle_DMA'){
   if(ch.rx||ch.rxDma)return 2;int(c,1,65535,'UART DMA 길이');const link=this.check(this.linked(r,h,'hdmarx',id),id+'_RX',0),w=this.widths(link.h),toIdle=name.includes('ToIdle');checkRange(r,b,c*w.mem,'UART DMA 수신');
   hal.noticeIrq.add(id+'_IRQn');set('RxState',0x22);set('ReceptionType',toIdle?1:0);const job={link,buffer:b,width:w.mem,toIdle,handle:a,since:0,lastAt:null};ch.rxDma=job;
   const event=(type,size)=>function*(){set('RxEventType',type);yield* hal.userCall(r,'HAL_UARTEx_RxEventCallback',[a,size]);};
   return this.start(r,link,{count:c,itemUs:byteUs,external:true,
    onHalf:toIdle?event(1,Math.floor(c/2)):function*(){yield* hal.userCall(r,'HAL_UART_RxHalfCpltCallback',[a]);},
    onComplete:toIdle?event(0,c):function*(){yield* hal.userCall(r,'HAL_UART_RxCpltCallback',[a]);},
    onDone:()=>{job.since=0;if(!link.st.circular){ch.rxDma=null;set('RxState',0x20);}}});
  }
  const stopTx=()=>{if(ch.txDma){this.stop(ch.txDma.link.st);ch.txDma=null;}ch.tx=null;set('gState',0x20);},stopRx=()=>{if(ch.rxDma){this.stop(ch.rxDma.link.st);ch.rxDma=null;}ch.rx=null;set('RxState',0x20);};
  if(name==='HAL_UART_DMAStop'||name==='HAL_UART_Abort'){stopTx();stopRx();return 0;}
  if(name==='HAL_UART_AbortReceive'){stopRx();return 0;}
  if(name==='HAL_UART_AbortTransmit'){stopTx();return 0;}
  if(name==='HAL_UART_DMAPause'){this.pause(ch.txDma?.link.st,r);this.pause(ch.rxDma?.link.st,r);return 0;}
  if(name==='HAL_UART_DMAResume'){this.resume(ch.txDma?.link.st,r);this.resume(ch.rxDma?.link.st,r);return 0;}
 }
 poll(r){this.pollUart(r);}
 // UART RX DMA is fed by arriving bytes (not by a timer), including IDLE line detection.
 pollUart(r){
  const hal=this.hal;
  for(const [id,ch]of hal.serials){
   const job=ch.rxDma;if(!job)continue;const st=job.link.st,u=ch.bus.uart,frame=1e7/u.baud;if(!st.busy||st.paused)continue;
   while(ch.rxDma===job&&st.busy&&ch.bus.call('Serial1.available',[],r)>0){
    const item=u.queue.find(x=>x.at<=r.microTime+1e-6),value=hal.uartRead(ch,r);writeElement(r,job.buffer,st.index,job.width,value);job.lastAt=item.at;job.since++;
    r.event((item.at+frame)/1000,()=>{});
    if(ch.rxError){
     // DMA reception + line error: HAL aborts the DMA transfer and reports through ErrorCallback.
     this.stop(st);ch.rxDma=null;const h=r.get(r.pointerCell(job.handle));if(h.fields.RxState)h.fields.RxState.value=0x20;hal.uartError(r,id,job.handle,ch.rxError|0);break;
    }
    this.advance(r,st);
   }
   if(ch.rxDma===job&&job.toIdle&&job.since>0&&job.lastAt!=null&&r.microTime>=job.lastAt+frame-1e-6&&!ch.bus.call('Serial1.available',[],r)&&st.index>0&&st.index<st.count){
    const size=st.index,h=r.get(r.pointerCell(job.handle));job.since=0;
    if(!st.circular){this.stop(st);ch.rxDma=null;if(h.fields.RxState)h.fields.RxState.value=0x20;}
    hal.queue(id+'_IRQn',function*(){if(h.fields.RxEventType)h.fields.RxEventType.value=2;yield* hal.userCall(r,'HAL_UARTEx_RxEventCallback',[job.handle,size]);},id+':idle');
   }
  }
 }
 adc(name,args,r){
  const hal=this.hal,[a,b,c]=args,{h,id}=hal.requireHandle(a,r,'ADC'),s=hal.adc.get(id);
  if(name==='HAL_ADC_Stop_DMA'){const run=this.adcRuns.get(id);if(run){this.stop(run.link.st);this.adcRuns.delete(id);}s.active=false;return 0;}
  if(this.adcRuns.has(id))return 2;int(c,1,65535,'ADC DMA 길이');const seq=s.ranks.slice(0,s.nbr);if(seq.length<s.nbr||seq.some(x=>!x))throw new Error(`${id}: Rank 1~${s.nbr} 채널을 모두 설정하세요.`);
  const link=this.check(this.linked(r,h,'DMA_Handle',id),'ADC1',0),w=this.widths(link.h);checkRange(r,b,c*w.mem,'ADC DMA 버퍼');
  const conv=seq.map(x=>hal.adcConversionUs(x.sampling)),avg=conv.reduce((x,y)=>x+y,0)/conv.length,limit=s.continuous?Infinity:seq.length;let produced=0;
  const run={link};this.adcRuns.set(id,run);s.active=true;
  return this.start(r,link,{count:c,itemUs:avg,item:i=>{if(produced>=limit){this.stop(link.st);this.adcRuns.delete(id);s.active=false;return;}const x=seq[produced%seq.length];produced++;const v=hal.adcRead(x.channel,r);s.value=v;writeElement(r,b,w.minc?i:0,w.mem,v);},
   onHalf:function*(){yield* hal.userCall(r,'HAL_ADC_ConvHalfCpltCallback',[a]);},onComplete:function*(){yield* hal.userCall(r,'HAL_ADC_ConvCpltCallback',[a]);},
   onDone:()=>{if(!link.st.circular||produced>=limit){this.stop(link.st);this.adcRuns.delete(id);s.active=false;}}});
 }
 spi(name,args,r){
  const hal=this.hal,[a,b,c,d]=args,{h,id}=hal.requireHandle(a,r,'SPI'),bus=hal.buses,set=(k,v)=>{if(h.fields[k])h.fields[k].value=v;};this.spiJobs??=new Map();
  if(/DMA(Stop|Pause|Resume)$/.test(name)){const job=this.spiJobs.get(id);if(!job)return 0;if(name.endsWith('Stop')){this.stop(job.st);this.spiJobs.delete(id);set('State',1);}else if(name.endsWith('Pause'))this.pause(job.st,r);else this.resume(job.st,r);return 0;}
  if(this.spiJobs.has(id))return 2;
  const both=name==='HAL_SPI_TransmitReceive_DMA',receive=name!=='HAL_SPI_Transmit_DMA',count=both?d:c,tx=name==='HAL_SPI_Receive_DMA'?null:b,rx=both?c:receive?b:null;int(count,1,65535,'SPI DMA 길이');
  const txLink=tx||!receive?this.check(this.linked(r,h,'hdmatx',id),id+'_TX',0x40):null,rxLink=receive?this.check(this.linked(r,h,'hdmarx',id),id+'_RX',0):null,link=rxLink??txLink;
  if(tx)checkRange(r,tx,count,'SPI DMA 송신');if(rx)checkRange(r,rx,count,'SPI DMA 수신');
  const kind=both?'TxRx':receive?'Rx':'Tx',itemUs=8e6/bus.spi.clock;set('State',both?5:receive?4:3);
  const job={st:link.st};this.spiJobs.set(id,job);
  if(txLink&&rxLink&&txLink.st!==rxLink.st){txLink.st.busy=false;}
  const result=this.start(r,link,{count,itemUs,item:i=>{const v=tx?readBytes(r,tx,i,1)[0]:255,answer=bus.spiExchange(v,r,link.st.base+i*itemUs);if(rx)writeElement(r,rx,i,1,answer);},
   onHalf:function*(){yield* hal.userCall(r,`HAL_SPI_${kind}HalfCpltCallback`,[a]);},onComplete:function*(){set('State',1);yield* hal.userCall(r,`HAL_SPI_${kind}CpltCallback`,[a]);},
   onDone:()=>{if(!link.st.circular){this.spiJobs.delete(id);bus.report(r,'SPI',`DMA ${kind} ${count} B · ${bus.spi.clock} Hz`);}}});
  return result;
 }
 i2c(name,args,r){
  const hal=this.hal,[a,b,c,d,e,f]=args,{h,id}=hal.requireHandle(a,r,'I2C'),bus=hal.buses,dma=name.endsWith('_DMA'),mem=name.includes('_Mem_'),receive=/Receive|Read/.test(name);this.i2cJobs??=new Map();
  int(b,16,238,'HAL I2C 주소(7비트 주소 << 1)');if(b&1)throw new Error('HAL I2C 주소는 7비트 주소를 왼쪽으로 1비트 이동하세요.');const addr=b>>1,buffer=mem?e:c,count=mem?f:d;int(count,1,65535,'I2C 길이');if(mem&&d!==1)throw new Error('I2C 메모리는 8비트 주소를 지원합니다.');
  if(this.i2cJobs.has(id))return 2;checkRange(r,buffer,count,'I2C 버퍼');
  const link=dma?this.check(this.linked(r,h,receive?'hdmarx':'hdmatx',id),id+(receive?'_RX':'_TX'),receive?0:0x40):null,clock=bus.wire.clock,byteUs=9e6/clock,at=r.microTime;
  const kind=mem?(receive?'MemRx':'MemTx'):(receive?'MasterRx':'MasterTx'),cb=`HAL_I2C_${kind}CpltCallback`,errIrq=id+'_ER_IRQn',evIrq=id+'_EV_IRQn';hal.noticeIrq.add(errIrq);
  const fail=(code,delay)=>{h.fields.ErrorCode.value=code;this.i2cJobs.set(id,{});r.event((at+delay)/1000,()=>{this.i2cJobs.delete(id);hal.queue(errIrq,function*(){yield* hal.userCall(r,'HAL_I2C_ErrorCallback',[a]);},id+':error');});bus.report(r,'I²C',`0x${addr.toString(16)} ${kind} · ${code&1?'BUS ERROR':'NACK'}`);return 0;};
  h.fields.ErrorCode.value=0;
  if(!receive||mem){const out=mem?[c&255,...(receive?[]:readBytes(r,buffer,0,count))]:readBytes(r,buffer,0,count),x=bus.i2cWrite(addr,out,r,at);if(!x.ok)return fail(x.busError?1:4,byteUs*2);if(!receive){bus.report(r,'I²C',`0x${addr.toString(16)} ${kind} ${count} B · ${dma?'DMA':'IT'}`);r.api.changed?.(r.microTime);}}
  let data=[];if(receive){const x=bus.i2cRead(addr,count,r,at+(mem?3*byteUs:0));if(!x.ok)return fail(x.busError?1:4,byteUs*(mem?4:2));data=x.data;bus.report(r,'I²C',`0x${addr.toString(16)} ${kind} ${count} B · ${dma?'DMA':'IT'}`);}
  const irq=link?link.st.irq:evIrq,job={};this.i2cJobs.set(id,job);
  const finish=function*(){yield* hal.userCall(r,cb,[a]);};
  if(link)return this.start(r,link,{count,itemUs:byteUs,it:true,item:i=>{if(receive)writeElement(r,buffer,i,1,data[i]);},onComplete:finish,onDone:()=>this.i2cJobs.delete(id)});
  let i=0;const step=()=>{if(this.i2cJobs.get(id)!==job)return;if(receive)writeElement(r,buffer,i,1,data[i]);if(++i<count)r.event((r.microTime+byteUs)/1000,step);else{this.i2cJobs.delete(id);hal.queue(irq,finish,id+':'+kind);}};r.event((at+(1+(mem?2:0))*byteUs)/1000,step);return 0;
 }
 timPwm(name,args,r){
  const hal=this.hal,tm=hal.timerModel,[a,b,c,d]=args,s=tm.get(a,r),ch=tm.channel(s,b),{h}=hal.requireHandle(a,r,'TIM');this.timJobs??=new Map();const key=s.id+':'+b;
  if(name==='HAL_TIM_PWM_Stop_DMA'){const job=this.timJobs.get(key);if(job){this.stop(job.st);this.timJobs.delete(key);}tm.freeze(s,r.microTime);ch.active=false;tm.syncActive(s,r);tm.pwm(s,ch,r);return 0;}
  if(ch.kind!=='PWM')throw new Error('HAL_TIM_PWM_Start_DMA: PWM 채널이 필요합니다.');if(this.timJobs.has(key))return 2;int(d,1,65535,'PWM DMA 길이');
  const n=b/4+1,slot=h.fields.hdma.value.cells[n].value;if(slot?.kind!=='pointer')throw new Error(`${s.id}: __HAL_LINKDMA(htim, hdma[TIM_DMA_ID_CC${n}], hdma_…)가 필요합니다.`);
  return this._timStart(r,s,ch,n,a,c,d,key);
 }
 _timStart(r,s,ch,n,a,buffer,count,key){
  const hal=this.hal,tm=hal.timerModel,{h}=hal.requireHandle(a,r,'TIM'),ptr=h.fields.hdma.value.cells[n].value,dh=r.get(r.pointerCell(ptr));if(dh?.type!=='DMA_HandleTypeDef')throw new Error(`${s.id}: hdma[CC${n}]에 DMA 핸들이 필요합니다.`);const st=this.state(dh);if(!st.inited||st.handle!==dh)throw new Error(`${s.id}: HAL_DMA_Init(${st.id})이 필요합니다.`);const link=this.check({h:dh,st,ptr},`${s.id}_CH${n}`,0x40),w=this.widths(dh);
  checkRange(r,buffer,count*w.mem,'PWM DMA 버퍼');const period=tm.period(s),hz=tm.hz(s)/period,itemUs=1e6/hz,fast=hz>2000,line=`${s.id}.CH${n}`,pin=ch.pin,bits=[];
  if(hal.buses.signals)hal.buses.signals.define(line,{label:`${s.id} CH${n} PWM`,pins:[pin],protocol:'gpio'});
  tm.freeze(s,r.microTime);ch.active=true;ch.it=false;tm.syncActive(s,r);if(fast){r.call('pinMode',[pin,'OUTPUT']);r.call('digitalWrite',[pin,0]);}const job={st};this.timJobs.set(key,job);
  const setChannel=fn=>function*(){h.fields.Channel.value=1<<(n-1);try{yield* fn();}finally{h.fields.Channel.value=0;}};
  return this.start(r,link,{count,itemUs,item:(i)=>{ch.pulse=readElement(r,buffer,i,w.mem);const t=st.base+i*itemUs,hi=Math.min(1,ch.pulse/period);
    if(hal.buses.signals){hal.buses.signals.edge(line,t,hi>0?1:0);if(hi>0&&hi<1)hal.buses.signals.edge(line,t+hi*itemUs,0);}
    if(fast){if(ch.pulse>0)bits.push(hi>.5?1:0);else if(bits.length){this.ws2812(pin,bits.splice(0));}}else tm.pwm(s,ch,r);},
   onHalf:setChannel(function*(){yield* hal.userCall(r,'HAL_TIM_PWM_PulseFinishedHalfCpltCallback',[a]);}),
   onComplete:setChannel(function*(){yield* hal.userCall(r,'HAL_TIM_PWM_PulseFinishedCallback',[a]);}),
   onDone:()=>{if(fast&&bits.length)this.ws2812(pin,bits.splice(0));if(!st.circular)this.timJobs.delete(key);if(fast)r.call('digitalWrite',[pin,0]);}});
 }
 // WS2812-style decoding of a fast PWM duty sequence (>50 % = 1). 24 bits GRB per LED.
 ws2812(pin,bits){
  const bus=this.hal.buses,parts=bus.project.components.filter(p=>p.catalogVariant?.startsWith('rgb-')&&bus.powered(p)&&bus.same(bus.terminal(p,5),bus.pin(pin)));
  parts.forEach((p,k)=>{const b=bits.slice(k*24,k*24+24);if(b.length<24)return;const grb=b.reduce((v,x)=>v*2+x,0),s=bus.devices.state(p);receiveWs2812(s,grb);bus.devices.touch(s);});
  this.ws2812Frames=(this.ws2812Frames||0)+1;
 }
}
