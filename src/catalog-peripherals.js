// Transaction models for the board's CAN and I2S routes used by catalog examples.
// CAN normal mode reports missing ACK; only explicit loopback returns a sent frame.
export const CATALOG_HAL_CONSTANTS={CAN1:'CAN1',SPI2:'SPI2',GPIO_AF9_CAN1:9,GPIO_AF5_SPI2:5,
 CAN_MODE_NORMAL:0,CAN_MODE_LOOPBACK:0x40000000,CAN_SJW_1TQ:0,CAN_BS1_13TQ:0xc0000,CAN_BS2_2TQ:0x100000,
 CAN_FILTERMODE_IDMASK:0,CAN_FILTERSCALE_32BIT:1,CAN_RX_FIFO0:0,CAN_ID_STD:0,CAN_RTR_DATA:0,HAL_CAN_ERROR_ACK:32,
 I2S_MODE_MASTER_TX:512,I2S_STANDARD_PHILIPS:0,I2S_DATAFORMAT_16B:0,I2S_MCLKOUTPUT_DISABLE:0,I2S_CPOL_LOW:0,I2S_CLOCK_PLL:0,I2S_FULLDUPLEXMODE_DISABLE:0,I2S_AUDIOFREQ_16K:16000,
 RCC_PERIPHCLK_I2S_APB1:1,RCC_I2SAPB1CLKSOURCE_PLLI2S:0,RCC_MCO1:0,RCC_MCO1SOURCE_HSI:0,RCC_MCODIV_1:0};
export class CatalogPeripherals {
 constructor(hal){this.hal=hal;this.routes=new Map();this.can=null;this.i2s=null;this.audioClock=false;}
 configurePin(pin,mode,af,r){
  const h=this.hal;if(h.config.pins[pin]?.function!=='Reserved'||mode!==2)return false;
  if(!(af===9&&['PB8','PB9'].includes(pin)||af===5&&['PB12','PB13','PB15'].includes(pin)))return false;
  this.routes.set(pin,af);r.call('pinMode',[pin,'INPUT']);return true;
 }
 handle(ptr,r,type){const h=r.get(r.pointerCell(ptr));if(h?.type!==type+'_HandleTypeDef')throw new Error(type+' 핸들 포인터를 확인하세요.');return h;}
 module(type,pins){const b=this.hal.buses;return b.project.components.find(p=>p.type===type&&b.powered(p)&&pins.every(([n,signal])=>b.same(b.terminal(p,n),b.pin(signal))));}
 *transmit(args,r){
  const [ptr,buffer,count,timeout]=args,h=this.handle(ptr,r,'I2S'),s=this.i2s;
  if(!s||s.handle!==h)throw new Error('HAL_I2S_Init을 먼저 호출하세요.');
  if(!Number.isInteger(count)||count<2||count>4096||count%2||!Number.isInteger(timeout)||timeout<0)throw new Error('I2S: 16비트 스테레오 버퍼와 유효한 제한 시간이 필요합니다.');
  const duration=count/2/s.rate*1000;if(duration>timeout){yield timeout;return 3;}
  const p=this.module('catalog_i2s',[[3,'PB15'],[4,'PB13'],[5,'PB12']]),sd=p?(this.hal.buses.result()?.voltage(`part:${p.id}:p7`)??0):0;
  const signed=n=>{const v=n&65535;return v>32767?v-65536:v;};
  const samples=Array.from({length:count/2},(_,i)=>{const left=signed(r.get(r.pointerCell(buffer,i*2))),right=signed(r.get(r.pointerCell(buffer,i*2+1)));return sd>1.4?left:sd>.77?right:Math.round((left+right)/2);});
  if(p&&sd>.16){const edges=[];for(let i=1;i<samples.length;i++)if(samples[i]>=0&&samples[i-1]<0)edges.push(i);
   const crossings=samples.reduce((n,v,i)=>n+(i>0&&Math.sign(v)!==Math.sign(samples[i-1])?1:0),0),frequency=edges.length>1?s.rate/(edges[1]-edges[0]):crossings?s.rate*Math.ceil(crossings/2)/samples.length:0;
   Object.assign(p.catalogState,{samples,rate:s.rate,frames:(p.catalogState.frames||0)+samples.length,at:r.microTime,until:r.microTime+duration*1000,frequency,rms:Math.sqrt(samples.reduce((sum,n)=>sum+n*n,0)/samples.length)/32768});
  }
  this.hal.buses.report(r,'I2S',`${s.rate} Hz · ${count/2} stereo frames${p?' · amplifier':' · no connected amplifier'}`);r.api.changed?.(r.microTime);yield duration;return 0;
 }
 call(name,args,r){
  const h=this.hal,[ptr,a,b,c]=args,get=(o,key)=>h.field(o,key);
  if(name==='HAL_RCC_GetPCLK1Freq')return h.config.timerClockHz>42000000?h.config.timerClockHz/2:h.config.timerClockHz;
  if(['__HAL_RCC_CAN1_CLK_ENABLE','__HAL_RCC_SPI2_CLK_ENABLE'].includes(name))return 0;
  if(name==='HAL_RCCEx_PeriphCLKConfig'){const cfg=r.get(r.pointerCell(ptr));this.audioClock=get(cfg,'PeriphClockSelection')===1&&get(get(cfg,'PLLI2S'),'PLLI2SN')===192&&get(get(cfg,'PLLI2S'),'PLLI2SR')===2&&get(cfg,'I2sApb1ClockSelection')===0;return this.audioClock?0:1;}
  if(name==='HAL_RCC_MCOConfig'){if(ptr!==0||a!==0||b!==0)throw new Error('MCO: PA8의 HSI 16 MHz 출력을 지원합니다.');h.buses.clocks??=new Map();h.buses.clocks.set('PA8',16000000);return 0;}
  if(name==='HAL_I2S_Init'){const handle=this.handle(ptr,r,'I2S'),init=get(handle,'Init');if(get(handle,'Instance')!=='SPI2'||!this.audioClock||[...['PB12','PB13','PB15']].some(p=>this.routes.get(p)!==5)||get(init,'Mode')!==512||get(init,'Standard')||get(init,'DataFormat')||get(init,'AudioFreq')!==16000)throw new Error('I2S2: PB12/13/15 AF5, PLLI2S, Philips 16-bit stereo 16 kHz 설정을 확인하세요.');this.i2s={handle,rate:get(init,'AudioFreq')};return 0;}
  if(!name.startsWith('HAL_CAN_'))return undefined;
  const handle=this.handle(ptr,r,'CAN');
  if(name==='HAL_CAN_Init'){const init=get(handle,'Init'),prescaler=get(init,'Prescaler'),mode=get(init,'Mode');if(get(handle,'Instance')!=='CAN1'||!Number.isInteger(prescaler)||prescaler<1||get(init,'TimeSeg1')!==0xc0000||get(init,'TimeSeg2')!==0x100000||![0,0x40000000].includes(mode))throw new Error('CAN1 비트 타이밍/모드를 확인하세요.');this.can={handle,mode,queue:[],errors:0,started:false,filter:null,transmitted:0};return 0;}
  const s=this.can;if(!s||s.handle!==handle)throw new Error('HAL_CAN_Init을 먼저 호출하세요.');
  if(name==='HAL_CAN_ConfigFilter'){const filter=r.get(r.pointerCell(a));if(get(filter,'FilterFIFOAssignment')!==0||get(filter,'FilterScale')!==1||get(filter,'FilterMode')!==0)throw new Error('CAN: FIFO0의 32-bit ID/mask 필터를 지원합니다.');s.filter={enabled:!!get(filter,'FilterActivation'),id:((get(filter,'FilterIdHigh')<<16)|get(filter,'FilterIdLow'))>>>0,mask:((get(filter,'FilterMaskIdHigh')<<16)|get(filter,'FilterMaskIdLow'))>>>0};return 0;}
  if(name==='HAL_CAN_Start'){if(!s.filter||['PB8','PB9'].some(p=>this.routes.get(p)!==9))return 1;s.started=true;return 0;}
  if(name==='HAL_CAN_GetTxMailboxesFreeLevel')return s.started?3:0;
  if(name==='HAL_CAN_GetRxFifoFillLevel')return s.started?s.queue.length:0;
  if(name==='HAL_CAN_GetError')return s.errors;
  if(name==='HAL_CAN_AddTxMessage'){
   if(!s.started)return 1;const header=r.get(r.pointerCell(a)),id=get(header,'StdId'),count=get(header,'DLC');if(get(header,'IDE')||get(header,'RTR')||id<0||id>2047||!Number.isInteger(count)||count<0||count>8)throw new Error('CAN: 표준 11-bit ID, 데이터 프레임 0~8바이트를 지원합니다.');
   const bytes=count?h.bytes(b,count,r):[];r.set(r.pointerCell(c),1);s.transmitted++;
   if(s.mode===0x40000000){if(s.filter.enabled&&(((id<<21)&s.filter.mask)>>>0)===((s.filter.id&s.filter.mask)>>>0)&&s.queue.length<3)s.queue.push({id,bytes});}
   else s.errors|=32;
   const p=this.module('catalog_can',[[3,'PB9'],[4,'PB8']]);if(p)Object.assign(p.catalogState,{transmitted:s.transmitted,errors:s.errors,lastId:id,lastData:bytes,loopback:s.mode!==0});
   h.buses.report(r,'CAN',`TX 0x${id.toString(16)} · ${count} B · ${s.mode?'loopback':'no peer ACK'}`);return 0;
  }
  if(name==='HAL_CAN_GetRxMessage'){const frame=s.queue.shift();if(!s.started||!frame)return 1;const target=r.get(r.pointerCell(b));for(const [key,value]of Object.entries({StdId:frame.id,ExtId:0,IDE:0,RTR:0,DLC:frame.bytes.length,Timestamp:Math.floor(r.microTime/1000),FilterMatchIndex:0}))r.set(target.fields[key],value);frame.bytes.forEach((v,i)=>r.set(r.pointerCell(c,i),v));return 0;}
  throw new Error('지원하지 않는 CAN 호출: '+name);
 }
 update(project,result,us){
  if(!result||result.fault)return;const bus=this.hal.buses;
  for(const p of project.components.filter(p=>['catalog_can','catalog_i2s'].includes(p.type))){const powered=bus.powered(p),s=p.catalogState;Object.assign(result.parts[p.id]??={},s,{powered,on:powered&&p.type==='catalog_i2s'&&(result.voltage(`part:${p.id}:p7`)??0)>.16&&us<=(s.until??-1)+3000&&s.rms>0});}
 }
}
