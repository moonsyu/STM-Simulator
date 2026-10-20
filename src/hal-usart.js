import {encodeUsartSync,risingSamples} from './signals.js';
import {readBytes,writeElement,checkRange} from './hal-memory.js';
import {isSerial} from './serial-config.js';
// Synchronous USART (HAL_USART): master clock on the CK pin, data LSB first on TX, sampled RX.
// SPI-style shift devices wired to CK/TX/CS receive the bits they latch on rising CK edges,
// so CPOL/CPHA/LastBit mistakes show up as shifted or missing bits like on real hardware.
export const USART_CONSTANTS={USART_WORDLENGTH_8B:0,USART_WORDLENGTH_9B:0x1000,USART_STOPBITS_1:0,USART_STOPBITS_0_5:0x1000,USART_STOPBITS_2:0x2000,USART_STOPBITS_1_5:0x3000,USART_PARITY_NONE:0,USART_PARITY_EVEN:0x400,USART_PARITY_ODD:0x600,
 USART_MODE_RX:4,USART_MODE_TX:8,USART_MODE_TX_RX:12,USART_POLARITY_LOW:0,USART_POLARITY_HIGH:0x400,USART_PHASE_1EDGE:0,USART_PHASE_2EDGE:0x200,USART_LASTBIT_DISABLE:0,USART_LASTBIT_ENABLE:0x100,
 USART_CLOCK_DISABLE:0,USART_CLOCK_ENABLE:0x800,HAL_USART_STATE_RESET:0,HAL_USART_STATE_READY:1,HAL_USART_STATE_BUSY:2,HAL_USART_STATE_BUSY_TX:0x12,HAL_USART_STATE_BUSY_RX:0x22,HAL_USART_STATE_BUSY_TX_RX:0x32,HAL_USART_ERROR_NONE:0};
const int=(v,min,max,label)=>{if(!Number.isInteger(v)||v<min||v>max)throw new Error(`${label}: ${min}~${max} 범위의 정수가 필요합니다.`);return v;};
const reverse8=v=>{let o=0;for(let i=0;i<8;i++)o|=((v>>i)&1)<<(7-i);return o;};
export class HalUsart{
 constructor(hal){this.hal=hal;this.ports=new Map();}
 handle(ptr,r){const h=r.get(r.pointerCell(ptr));if(h?.type!=='USART_HandleTypeDef')throw new Error('USART_HandleTypeDef 포인터가 필요합니다.');const id=this.hal.field(h,'Instance');const p=this.ports.get(id);return {h,id,p};}
 port(ptr,r){const x=this.handle(ptr,r);if(!x.p||x.p.handle!==x.h)throw new Error(`${x.id}: HAL_USART_Init이 필요합니다.`);return x;}
 init(ptr,r){
  const hal=this.hal,{h,id}=this.handle(ptr,r),cfg=hal.config.peripherals[id],init=hal.field(h,'Init'),get=k=>hal.field(init,k);
  if(!isSerial(id)||!cfg?.enabled)throw new Error(`${id}: Pinout & Configuration에서 주변장치를 활성화하세요.`);
  if(cfg.mode!=='synchronous')throw new Error(`${id}: Pinout에서 동기(Synchronous) 모드를 선택하세요.`);
  if(get('WordLength')||get('StopBits')||get('Parity'))throw new Error(`${id}: 8비트, 정지 1비트, 패리티 없음만 지원합니다.`);
  if(![4,8,12].includes(get('Mode')))throw new Error(`${id}: USART_MODE_TX/RX/TX_RX를 사용하세요.`);
  if(get('BaudRate')!==cfg.baud)throw new Error(`${id}: 소스와 Pinout의 baud rate가 다릅니다.`);
  hal.callback(r,'HAL_USART_MspInit',[ptr]);
  const p={id,handle:h,ptr,baud:get('BaudRate'),cpol:get('CLKPolarity')?1:0,cpha:get('CLKPhase')?1:0,lastBit:!!get('CLKLastBit'),ck:hal.pinFor(id+'_CK'),tx:hal.pinFor(id+'_TX'),rx:hal.pinFor(id+'_RX'),acc:0,bits:0,busy:null};
  if(p.cpol!==(cfg.cpol??0)||p.cpha!==(cfg.cpha??0)||(p.lastBit?1:0)!==(cfg.lastBit??0))r.warn(`[USART] ${id}: 소스의 CPOL/CPHA/LastBit가 Pinout 설정과 다릅니다.`);
  r.call('pinMode',[p.ck,'OUTPUT']);r.call('digitalWrite',[p.ck,p.cpol]);r.call('pinMode',[p.tx,'OUTPUT']);r.call('digitalWrite',[p.tx,1]);r.call('pinMode',[p.rx,'INPUT']);
  const sig=hal.buses.signals;if(sig){const g={group:id+'.SYNC',busLabel:`${id} 동기`,protocol:'usart-sync',params:{cpol:p.cpol,cpha:p.cpha,lsbFirst:true,clockHz:p.baud}};for(const [role,pin]of [['ck',p.ck],['tx',p.tx],['rx',p.rx]])sig.define(`${id}.SYNC.${role.toUpperCase()}`,{...g,label:role.toUpperCase(),pins:[pin],params:{...g.params,role}});}
  h.fields.State.value=1;h.fields.ErrorCode.value=0;this.ports.set(id,p);return 0;
 }
 frameUs(p){return 10e6/p.baud;}
 // One frame at time t: drive CK/TX, let wired shift devices latch, sample RX.
 exchange(r,p,value,t){
  const hal=this.hal,bus=hal.buses,e=encodeUsartSync(t,value&255,{baud:p.baud,cpol:p.cpol,cpha:p.cpha,lastBit:p.lastBit,noise:bus.noise});
  const sig=bus.signals;if(sig){sig.write(`${p.id}.SYNC.CK`,e.ck);sig.write(`${p.id}.SYNC.TX`,e.tx);}
  let answer=null;
  for(const bit of risingSamples(e.ck,e.tx)){p.acc=((p.acc<<1)|bit)&255;if(++p.bits===8){p.bits=0;answer=this.device(r,p,p.acc);}}
  let rx=answer==null?255:reverse8(answer);if(bus.same(bus.pin(p.tx),bus.pin(p.rx)))rx=value&255;
  if(sig){const T=1e6/p.baud,rxe=[[t,1]];for(let i=0;i<8;i++)rxe.push([t+(i+1)*T,(rx>>i)&1]);rxe.push([t+9*T,1]);sig.write(`${p.id}.SYNC.RX`,rxe);}
  return rx;
 }
 device(r,p,value){const s=this.hal.buses.spi,saved={sck:s.sck,mosi:s.mosi,miso:s.miso};Object.assign(s,{sck:p.ck,mosi:p.tx,miso:p.rx});try{return this.hal.buses.spiRespond(value,r);}finally{Object.assign(s,saved);}}
 invoke(name,args,r){
  if(name==='HAL_USART_Transmit'||name==='HAL_USART_Receive'||name==='HAL_USART_TransmitReceive')return this.blocking(name,args,r);
  if(name==='HAL_USART_IRQHandler'){const {id}=this.handle(args[0],r);return this.hal.drain(r,id+'_IRQn');}
  return null;
 }
 *blocking(name,args,r){
  const {p,h}=this.port(args[0],r),both=name.endsWith('TransmitReceive'),count=both?args[3]:args[2],timeout=both?args[4]:args[3],tx=name==='HAL_USART_Receive'?null:args[1],rx=both?args[2]:name==='HAL_USART_Receive'?args[1]:null;
  int(count,1,65535,'USART 길이');int(timeout,0,4294967295,'USART timeout');if(p.busy)return 2;if(tx)checkRange(r,tx,count,'USART 송신');if(rx)checkRange(r,rx,count,'USART 수신');
  const frame=this.frameUs(p),total=count*frame/1000;if(total>timeout){if(timeout)yield timeout;return 3;}
  const bytes=tx?readBytes(r,tx,0,count):Array(count).fill(255);h.fields.State.value=both?0x32:tx?0x12:0x22;
  for(let i=0;i<count;i++){const v=this.exchange(r,p,bytes[i],r.microTime);if(rx)writeElement(r,rx,i,1,v);yield frame/1000;}
  this.hal.buses.report(r,'USART',`${p.id} 동기 ${tx?'TX':'RX'} ${count} B · ${p.baud} Hz CK`);h.fields.State.value=1;r.api.changed?.(r.microTime);return 0;
 }
 call(name,args,r){
  const hal=this.hal,[a,b,c,d]=args;
  if(!name.startsWith('HAL_USART_'))return undefined;
  if(name==='HAL_USART_Init')return this.init(a,r);
  if(name==='HAL_USART_DeInit'){const {id}=this.handle(a,r);this.ports.delete(id);return 0;}
  if(name==='HAL_USART_GetState'){const {h}=this.handle(a,r);return h.fields.State.value;}
  if(name==='HAL_USART_GetError'){const {h}=this.handle(a,r);return h.fields.ErrorCode.value;}
  const {p,h,id}=this.port(a,r);
  if(name==='HAL_USART_Abort'){if(p.busy){if(p.busy.st)hal.dma.stop(p.busy.st);p.busy=null;}h.fields.State.value=1;return 0;}
  const m=/^HAL_USART_(Transmit|Receive|TransmitReceive)_(IT|DMA)$/.exec(name);if(!m)throw new Error(`지원하지 않는 HAL API: ${name}`);
  if(p.busy)return 2;const both=m[1]==='TransmitReceive',count=both?d:c,tx=m[1]==='Receive'?null:b,rx=both?c:m[1]==='Receive'?b:null;int(count,1,65535,'USART 길이');
  if(tx)checkRange(r,tx,count,'USART 송신');if(rx)checkRange(r,rx,count,'USART 수신');
  const kind=both?'TxRx':tx?'Tx':'Rx',frame=this.frameUs(p),irq=id+'_IRQn',job={};p.busy=job;h.fields.State.value=both?0x32:tx?0x12:0x22;hal.noticeIrq.add(irq);
  const item=i=>{const v=this.exchange(r,p,tx?readBytes(r,tx,i,1)[0]:255,r.microTime-frame);if(rx)writeElement(r,rx,i,1,v);};
  const done=function*(){if(p.busy===job){p.busy=null;h.fields.State.value=1;}yield* hal.userCall(r,`HAL_USART_${kind}CpltCallback`,[a]);};
  if(m[2]==='DMA'){
   const link=hal.dma.check(hal.dma.linked(r,h,rx?'hdmarx':'hdmatx',id),id+(rx?'_RX':'_TX'),rx?0:0x40);job.st=link.st;
   return hal.dma.start(r,link,{count,itemUs:frame,item,onHalf:function*(){yield* hal.userCall(r,`HAL_USART_${kind==='TxRx'?'Rx':kind}HalfCpltCallback`,[a]);},onComplete:done,onDone:()=>{}});
  }
  let i=0;const step=()=>{if(p.busy!==job)return;item(i);if(++i<count)r.event((r.microTime+frame)/1000,step);else hal.queue(irq,done,id+':usart');};r.event((r.microTime+frame)/1000,step);return 0;
 }
}
