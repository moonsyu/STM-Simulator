// R_CAN_* (r_can, normal mailbox mode, no FIFO) for the built-in interpreter (feature 40): FSP 6.6 r_can.c function by
// function, in the configuration the app generates (r_can_cfg.h: CAN_CFG_PARAM_CHECKING_ENABLE 1, CAN_CFG_FIFO_SUPPORT 0),
// on the emulator's CAN0 model with its virtual node (src/emu/ra6e1/can.js) — so the checks and their return codes, the
// register sequences, the interrupts (can_error_isr, can_rx_isr, can_tx_isr at the configuration's ipl, raised again
// while a cause remains) and the callback's events and frames are the driver's, and both engines share one model of the
// hardware and of the bus.
// Differences from the driver: the members of the callback's argument the driver leaves unset (an uninitialised local in
// the receive and transmit ISRs: `error`, and the frame of a transmit event) are 0 here, and so are the bytes of
// frame.data past the DLC; can_instance_ctrl_t.p_reg is a void * (no register block in the interpreter) and is not set;
// g_can0.p_api is NULL.
import {Can,CAN_EVENT} from './emu/ra6e1/can.js';

const enumOf=(tag,name,items)=>`typedef enum ${tag}\n{\n${items.map(([k,v])=>`    ${k} = ${v},`).join('\n')}\n} ${name};`;
/** r_can_api.h and r_can.h for the interpreter's stand-in headers (hal_data.h includes them with the stack): their public
 *  enums, structures and macros with FSP 6.6's values (CAN_DATA_BUFFER_LENGTH 8: the RA6E1 has no CAN FD), and the
 *  FSP_ERR_CAN_* codes of fsp_common_api.h. can_instance_ctrl_t's p_reg (R_CAN0_Type *) is a void * here. */
export const CAN_TYPES=`#define CAN_DATA_BUFFER_LENGTH (8)
${['DATA_UNAVAILABLE','MODE_SWITCH_FAILED','INIT_FAILED','TRANSMIT_NOT_READY','RECEIVE_MAILBOX','TRANSMIT_MAILBOX','MESSAGE_LOST','TRANSMIT_FIFO_FULL'].map((k,i)=>`#define FSP_ERR_CAN_${k} (${60000+i})`).join('\n')}
${enumOf('e_can_event','can_event_t',[['CAN_EVENT_ERR_WARNING','0x0002'],['CAN_EVENT_ERR_PASSIVE','0x0004'],['CAN_EVENT_ERR_BUS_OFF','0x0008'],['CAN_EVENT_BUS_RECOVERY','0x0010'],['CAN_EVENT_MAILBOX_MESSAGE_LOST','0x0020'],['CAN_EVENT_ERR_BUS_LOCK','0x0080'],['CAN_EVENT_ERR_CHANNEL','0x0100'],['CAN_EVENT_TX_ABORTED','0x0200'],['CAN_EVENT_RX_COMPLETE','0x0400'],['CAN_EVENT_TX_COMPLETE','0x0800'],['CAN_EVENT_ERR_GLOBAL','0x1000'],['CAN_EVENT_TX_FIFO_EMPTY','0x2000'],['CAN_EVENT_FIFO_MESSAGE_LOST','0x4000']])}
${enumOf('e_can_operation_mode','can_operation_mode_t',[['CAN_OPERATION_MODE_NORMAL',0],['CAN_OPERATION_MODE_RESET',1],['CAN_OPERATION_MODE_HALT',2],['CAN_OPERATION_MODE_SLEEP',5],['CAN_OPERATION_MODE_GLOBAL_OPERATION','0x80'],['CAN_OPERATION_MODE_GLOBAL_RESET','0x81'],['CAN_OPERATION_MODE_GLOBAL_HALT','0x82'],['CAN_OPERATION_MODE_GLOBAL_SLEEP','0x85']])}
${enumOf('e_can_test_mode','can_test_mode_t',[['CAN_TEST_MODE_DISABLED',0],['CAN_TEST_MODE_LISTEN',3],['CAN_TEST_MODE_LOOPBACK_EXTERNAL',5],['CAN_TEST_MODE_LOOPBACK_INTERNAL',7],['CAN_TEST_MODE_INTERNAL_BUS','0x80']])}
typedef struct st_can_info { uint32_t status; uint32_t rx_mb_status; uint32_t rx_fifo_status; uint8_t error_count_transmit; uint8_t error_count_receive; uint32_t error_code; } can_info_t;
${enumOf('e_can_id_mode','can_id_mode_t',[['CAN_ID_MODE_STANDARD',0],['CAN_ID_MODE_EXTENDED',1]])}
${enumOf('e_can_frame_type','can_frame_type_t',[['CAN_FRAME_TYPE_DATA',0],['CAN_FRAME_TYPE_REMOTE',1]])}
typedef struct st_can_bit_timing_cfg { uint32_t baud_rate_prescaler; uint32_t time_segment_1; uint32_t time_segment_2; uint32_t synchronization_jump_width; } can_bit_timing_cfg_t;
typedef struct st_can_frame { uint32_t id; can_id_mode_t id_mode; can_frame_type_t type; uint8_t data_length_code; uint32_t options; uint8_t data[CAN_DATA_BUFFER_LENGTH]; } can_frame_t;
typedef struct st_can_callback_args { uint32_t channel; can_event_t event; uint32_t error; uint32_t mailbox; void * p_context; can_frame_t frame; } can_callback_args_t;
typedef struct st_can_cfg { uint32_t channel; can_bit_timing_cfg_t * p_bit_timing; void (*p_callback)(can_callback_args_t *); void * p_context; const void * p_extend; uint8_t ipl; IRQn_Type error_irq; IRQn_Type rx_irq; IRQn_Type tx_irq; } can_cfg_t;
typedef void can_ctrl_t;
typedef struct st_can_api { fsp_err_t (*open)(can_ctrl_t * p_ctrl, const can_cfg_t * p_cfg); fsp_err_t (*write)(can_ctrl_t * p_ctrl, uint32_t buffer_number, can_frame_t * p_frame); fsp_err_t (*read)(can_ctrl_t * p_ctrl, uint32_t buffer_number, can_frame_t * p_frame); fsp_err_t (*close)(can_ctrl_t * p_ctrl); fsp_err_t (*modeTransition)(can_ctrl_t * p_ctrl, can_operation_mode_t operation_mode, can_test_mode_t test_mode); fsp_err_t (*infoGet)(can_ctrl_t * p_ctrl, can_info_t * p_info); fsp_err_t (*callbackSet)(can_ctrl_t * p_ctrl, void (*p_callback)(can_callback_args_t *), void * p_context, can_callback_args_t * p_callback_memory); } can_api_t;
typedef struct st_can_instance { can_ctrl_t * p_ctrl; const can_cfg_t * p_cfg; const can_api_t * p_api; } can_instance_t;
${enumOf('e_can_status','can_status_t',['NEW_DATA','SENT_DATA','RECEIVE_FIFO','TRANSMIT_FIFO','NORMAL_MBOX_MESSAGE_LOST','FIFO_MBOX_MESSAGE_LOST','TRANSMISSION_ABORT','ERROR','RESET_MODE','HALT_MODE','SLEEP_MODE','ERROR_PASSIVE','BUS_OFF'].map((k,i)=>['CAN_STATUS_'+k,2**i]))}
${enumOf('e_can_error','can_error_t',['STUFF','FORM','ACK','CRC','BIT_RECESSIVE','BIT_DOMINANT','ACK_DELIMITER'].map((k,i)=>['CAN_ERROR_'+k,2**i]))}
${enumOf('e_can_mailbox_id','can_mailbox_number_t',[...Array.from({length:32},(_,i)=>['CAN_MAILBOX_ID_'+i,i]),['CAN_MAILBOX_ID_TX_FIFO',24],['CAN_MAILBOX_ID_RX_FIFO',28]])}
${enumOf('e_can_mailbox_send_receive','can_mailbox_send_receive_t',[['CAN_MAILBOX_RECEIVE',0],['CAN_MAILBOX_TRANSMIT',1]])}
${enumOf('e_can_global_id_mode','can_global_id_mode_t',[['CAN_GLOBAL_ID_MODE_STANDARD',0],['CAN_GLOBAL_ID_MODE_EXTENDED',1],['CAN_GLOBAL_ID_MODE_MIXED',2]])}
${enumOf('e_can_message_mode','can_message_mode_t',[['CAN_MESSAGE_MODE_OVERWRITE',0],['CAN_MESSAGE_MODE_OVERRUN',1]])}
${enumOf('e_can_clock_source','can_clock_source_t',[['CAN_CLOCK_SOURCE_PCLKB',0],['CAN_CLOCK_SOURCE_CANMCLK',1]])}
${enumOf('e_can_fifo_interrupt_mode','can_fifo_interrupt_mode_t',[['CAN_FIFO_INTERRUPT_MODE_TX_EVERY_FRAME','0x01000000'],['CAN_FIFO_INTERRUPT_MODE_RX_EVERY_FRAME','0x10000000'],['CAN_FIFO_INTERRUPT_MODE_TX_EMPTY','0x03000000']])}
typedef struct st_can_mailbox { uint32_t mailbox_id; can_id_mode_t id_mode; can_frame_type_t frame_type; can_mailbox_send_receive_t mailbox_type; } can_mailbox_t;
typedef struct st_can_fifo_interrupt_cfg { can_fifo_interrupt_mode_t fifo_int_mode; IRQn_Type tx_fifo_irq; IRQn_Type rx_fifo_irq; } can_fifo_interrupt_cfg_t;
typedef struct st_can_rx_fifo_cfg { uint32_t rx_fifo_mask1; uint32_t rx_fifo_mask2; can_mailbox_t rx_fifo_id1; can_mailbox_t rx_fifo_id2; } can_rx_fifo_cfg_t;
typedef struct st_can_extended_cfg { can_clock_source_t clock_source; uint32_t * p_mailbox_mask; can_mailbox_t * p_mailbox; can_global_id_mode_t global_id_mode; uint32_t mailbox_count; can_message_mode_t message_mode; const can_fifo_interrupt_cfg_t * p_fifo_int_cfg; can_rx_fifo_cfg_t * p_rx_fifo_cfg; } can_extended_cfg_t;
typedef struct st_can_instance_ctrl { const can_cfg_t * p_cfg; void * p_reg; uint32_t open; can_operation_mode_t operation_mode; can_test_mode_t test_mode; can_id_mode_t id_mode; uint32_t mailbox_count; can_mailbox_t * p_mailbox; can_clock_source_t clock_source; void (*p_callback)(can_callback_args_t *); can_callback_args_t * p_callback_memory; void * p_context; } can_instance_ctrl_t;`;
/** g_can0 of hal_data.c (ra-generator.js canInstance) for the stand-in header. */
export function canPrelude(t,vec){
 const hex=(n,w)=>'0x'+(n>>>0).toString(16).toUpperCase().padStart(w,'0'),idMode=t.idMode==='EXTENDED'?'CAN_ID_MODE_EXTENDED':'CAN_ID_MODE_STANDARD';
 const mb=m=>`{ .mailbox_id = ${hex(m.id,3)}, .id_mode = ${idMode}, .frame_type = CAN_FRAME_TYPE_DATA, .mailbox_type = ${m.type==='RECEIVE'?'CAN_MAILBOX_RECEIVE':'CAN_MAILBOX_TRANSMIT'} }`;
 return [`void ${t.callback}(can_callback_args_t * p_args);`,'can_instance_ctrl_t g_can0_ctrl;',
  `can_bit_timing_cfg_t g_can0_bit_timing_cfg = { .baud_rate_prescaler = ${t.timing.brp}, .time_segment_1 = ${t.timing.tseg1}, .time_segment_2 = ${t.timing.tseg2}, .synchronization_jump_width = ${t.timing.sjw} };`,
  `uint32_t g_can0_mailbox_mask[8] = { ${hex(t.mask,8)}, 0x1FFFFFFF, 0x1FFFFFFF, 0x1FFFFFFF, 0x1FFFFFFF, 0x1FFFFFFF, 0x1FFFFFFF, 0x1FFFFFFF };`,
  `can_mailbox_t g_can0_mailbox[32] = { ${[...t.mailboxes,...Array.from({length:28},()=>({id:0,type:'TRANSMIT'}))].map(mb).join(', ')} };`,
  `const can_extended_cfg_t g_can0_extended_cfg = { .clock_source = CAN_CLOCK_SOURCE_PCLKB, .p_mailbox_mask = &g_can0_mailbox_mask[0], .p_mailbox = &g_can0_mailbox[0], .global_id_mode = ${t.idMode==='EXTENDED'?'CAN_GLOBAL_ID_MODE_EXTENDED':'CAN_GLOBAL_ID_MODE_STANDARD'}, .mailbox_count = 4, .message_mode = CAN_MESSAGE_MODE_OVERWRITE, .p_fifo_int_cfg = NULL, .p_rx_fifo_cfg = NULL };`,
  `const can_cfg_t g_can0_cfg = { .channel = 0, .p_bit_timing = &g_can0_bit_timing_cfg, .p_callback = ${t.callback}, .p_context = NULL, .p_extend = &g_can0_extended_cfg, .ipl = (${t.priority}), .error_irq = ${vec('CAN0_ERROR')}, .rx_irq = ${vec('CAN0_MAILBOX_RX')}, .tx_irq = ${vec('CAN0_MAILBOX_TX')} };`,
  'const can_instance_t g_can0 = { .p_ctrl = &g_can0_ctrl, .p_cfg = &g_can0_cfg, .p_api = NULL };'];
}

const E={SUCCESS:0,ASSERTION:1,INVALID_ARGUMENT:3,UNSUPPORTED:6,NOT_OPEN:7,ALREADY_OPEN:14,INIT_FAILED:60002,TRANSMIT_NOT_READY:60003,RECEIVE_MAILBOX:60004};
const CAN_OPEN=0x5243414e,XTAL_HZ=24000000;
// R_CAN0 register offsets (R7FA6E10F.h).
const MB=0x200,MKR=0x400,MKIVLR=0x428,MIER=0x42c,MCTL=0x820,CTLR=0x840,STR=0x842,BCR=0x844,EIER=0x84c,EIFR=0x84d,RECR=0x84e,TECR=0x84f,ECSR=0x850,MSSR=0x852,MSMR=0x853,TCR=0x858;
const isNull=p=>p===0||p===null||p===undefined;
// The three interrupts: vector (raVectors), ISR.
const IRQS={error:['CAN0_ERROR','can_error_isr',CAN_EVENT.ERROR],rx:['CAN0_MAILBOX_RX','can_rx_isr',CAN_EVENT.MAILBOX_RX],tx:['CAN0_MAILBOX_TX','can_tx_isr',CAN_EVENT.MAILBOX_TX]};

/** Methods of FspAdapter (fsp-interp.js) for R_CAN_*. */
export const CAN_METHODS={
 // The CAN0 model and its node, with the interpreter's clock and interrupt queue behind them; module stop (MSTPCRB b2) is
 // the adapter's `canStopped`.
 canDev(r){
  if(!this.canHw){
   const self=this,soc={r,mstp:{peek:()=>self.canStopped===false?0:1<<2},clock:{pclkb:this.pclkb},nowUs:()=>soc.r?.microTime??0,
    after:(us,fn)=>{soc.r.event((soc.r.microTime+us)/1000,fn);return null;},raiseEvent:ev=>self.canRaise(soc.r,ev)};
   this.canHw=new Can(soc);if(this.canKeep)this.canHw.node.output=this.canKeep;
  }
  if(r)this.canHw.soc.r=r;return this.canHw;
 },
 canR(r,off,size){return this.canDev(r).read(off,size);},
 canW(r,off,v,size){this.canDev(r).write(off,v,size);},
 // R_BSP_IrqCfgEnable / R_BSP_IrqDisable: the interrupts Open enabled, with their priority and control block.
 canIrqs(){if(!this.canIrq)this.canIrq={};return this.canIrq;},
 canRaise(r,ev){
  const [kind]=Object.entries(IRQS).find(([,i])=>i[2]===ev)??[];if(!kind)return;
  const on=this.canIrqs()[kind],v=this.vectors.find(x=>x.event===IRQS[kind][0]);if(!on||!v||on.irq!==v.index)return;
  this.canPend(r,kind);
 },
 // NVIC_SetPendingIRQ (and an event the ICU passes on): the ISR as an interrupt job at the configuration's ipl.
 // The three share the ipl: pending together, the NVIC takes the lowest IRQ number first (error, receive, transmit), so
 // the CAN jobs waiting are taken in that order.
 canPend(r,kind){
  const on=this.canIrqs()[kind];if(!on)return;const [irq,isr]=IRQS[kind];this.queue(r,irq,on.ipl,()=>this.canIsr(r,kind,on.ctrl),isr,'CAN0:'+kind);
  const mine=this.pending.filter(j=>/^CAN0:/.test(j.key));if(mine.length<2)return;
  const orders=mine.map(j=>j.order).sort((a,b)=>a-b),rank=j=>this.canIrqs()[j.key.slice(5)]?.irq??0;
  mine.sort((a,b)=>rank(a)-rank(b)).forEach((j,i)=>{j.order=orders[i];});
 },
 canGet(v,k){const x=v.fields[k].value;return typeof x==='number'?x>>>0:Number(x)>>>0;},
 canAt(r,ptr,i=0){return r.get(r.pointerCell(ptr,i));},
 // ---- r_can_mode_transition / r_can_switch_to_operation_mode (FSP_HARDWARE_REGISTER_WAIT waits as long as it takes)
 *canSwitch(r,mode){
  this.canW(r,CTLR,this.canR(r,CTLR,2)&~0x400,2);
  this.canW(r,CTLR,(this.canR(r,CTLR,2)&~0x300)|((mode&3)<<8),2);
  while((this.canR(r,STR,2)&0x700)!==(((mode&0xff)<<8)>>>0))yield .01;
 },
 *canTransition(r,ctrl,mode,test){
  if(this.canGet(ctrl,'test_mode')!==(test>>>0)){
   yield* this.canSwitch(r,2);this.canW(r,TCR,test&0xff,1);this.setField(ctrl,'test_mode',test,r);this.setField(ctrl,'operation_mode',2,r);
  }
  if(this.canGet(ctrl,'operation_mode')!==(mode>>>0)){
   if(mode===5){yield* this.canSwitch(r,2);this.canW(r,CTLR,this.canR(r,CTLR,2)|0x400,2);while(!(this.canR(r,STR,2)&0x400))yield .01;}
   else yield* this.canSwitch(r,mode);
   this.setField(ctrl,'operation_mode',mode,r);
  }
 },
 // r_can_mailbox_id_set
 canIdSet(r,ext,off,m){
  const g=this.canGet(ext,'global_id_mode'),idm=this.canGet(m,'id_mode'),id=this.canGet(m,'mailbox_id'),type=this.canGet(m,'frame_type');
  let ide=0,v;
  if(g===0||g===2&&idm===0)v=((id&0x7ff)<<18)>>>0;else{if(g===2&&idm===1)ide=0x80000000;v=id&0x1fffffff;}
  this.canW(r,off,(ide|((type<<30)>>>0)|v)>>>0,4);
 },
 // r_can_call_callback: the callback memory (R_CAN_CallbackSet) takes the arguments when given, as the driver copies them.
 *canCallback(r,ctrl,fields){
  const cb=ctrl.fields.p_callback.value,name=cb?.kind==='function'?cb.name:'';if(!name)return;
  const memPtr=ctrl.fields.p_callback_memory.value;
  if(isNull(memPtr)){yield* this.callback(r,name,'can_callback_args_t',fields);return;}
  const mem=this.canAt(r,memPtr),saved=r.clone?r.clone(mem,mem.fields.channel.owner):null,fresh=r.defaultValue('can_callback_args_t',r.globals);
  for(const [k,v]of Object.entries(fields))if(Object.hasOwn(fresh.fields,k))fresh.fields[k].value=v;
  for(const k of Object.keys(mem.fields))mem.fields[k].value=fresh.fields[k].value;if(fresh.last!==undefined)mem.last=fresh.last;
  if(!r.program.functions[name]){this.warnOnce(r,'cb:'+name,`[FSP] 콜백 ${name}()이 hal_entry.c에 없어 인터럽트에서 부르지 않습니다. ARM GCC 빌드에서는 링크 오류(undefined reference)가 납니다.`);}
  else yield* r.invoke(name,[memPtr]);
  if(saved)for(const k of Object.keys(mem.fields))mem.fields[k].value=saved.fields[k].value;
 },
 // A can_frame_t value with the frame the driver reads from a mailbox (r_can_mailbox_read).
 canFrame(r,ctrl,ext,mb){
  const id=this.canR(r,MB+16*mb,4),f=r.defaultValue('can_frame_t',r.globals),set=(k,v)=>{f.fields[k].value=v;};
  set('type',(id>>>30)&1);const idMode=(this.canGet(ext,'global_id_mode')|(id>>>31))&1;set('id_mode',idMode);
  set('id',idMode===0?(id>>>18)&0x7ff:id&0x1fffffff);
  const dlc=Math.min(8,this.canR(r,MB+16*mb+4,2)&0xf);set('data_length_code',dlc);
  for(let i=0;i<dlc;i++)f.fields.data.value.cells[i].value=this.canR(r,MB+16*mb+6+i,1);
  this.canW(r,MCTL+mb,0x44,1);set('options',0);
  return f;
 },
 *canIsr(r,kind,ctrlPtr){
  const ctrl=this.canAt(r,ctrlPtr),cfg=this.canAt(r,ctrl.fields.p_cfg.value),ext=this.canAt(r,cfg.fields.p_extend.value);
  const search=mode=>{const saved=this.canR(r,MSMR,1);this.canW(r,MSMR,mode,1);const mb=this.canR(r,MSSR,1)&0x1f;this.canW(r,MSMR,saved,1);return mb;};
  const base={channel:this.canGet(cfg,'channel'),p_context:ctrl.fields.p_context.value};
  if(kind==='error'){
   let event=this.canR(r,EIFR,1),mb=0;this.canW(r,EIFR,0,1);
   if(this.canR(r,STR,2)&0x10){event|=0x20;mb=search(2);this.canW(r,MCTL+mb,this.canR(r,MCTL+mb,1)&~4,1);}
   yield* this.canCallback(r,ctrl,{...base,event,error:0,mailbox:mb});
   if(this.canR(r,STR,2)&0x10&&this.canGet(ext,'message_mode')!==0)this.canPend(r,'error');
  }else if(kind==='rx'){
   const mb=search(0),frame=this.canFrame(r,ctrl,ext,mb);
   yield* this.canCallback(r,ctrl,{...base,event:0x400,mailbox:mb,frame});
   if(this.canR(r,STR,2)&1)this.canPend(r,'rx');
  }else{
   const mb=search(1);this.canW(r,MCTL+mb,0,1);this.canW(r,MCTL+mb,0,1);
   yield* this.canCallback(r,ctrl,{...base,event:0x800,mailbox:mb});
   if(this.canR(r,STR,2)&2)this.canPend(r,'tx');
  }
 },
 canCtrl(ptr,r,fn){return this.struct(ptr,r,'can_instance_ctrl_t',fn);},
 /** R_CAN_* by name: a generator, or null for another name (and without the CAN stack). */
 canCall(name,args,r){if(!this.config.peripherals?.CAN0?.enabled||!Object.hasOwn(CAN_API,name))return null;return CAN_API[name].call(this,args,r,name);},
 /** A line the serial monitor sends to the virtual CAN node (session.js inject). */
 canSend(text,r){return this.config.peripherals?.CAN0?.enabled?this.canDev(r).node.send(text):0;},
 canOutput(){return this.canHw?.node.output??this.canKeep??[];}
};

const CAN_API={
 *R_CAN_Open([ctrlPtr,cfgPtr],r,fn){
  if(isNull(ctrlPtr)||isNull(cfgPtr))return E.ASSERTION;
  const ctrl=this.canCtrl(ctrlPtr,r,fn),cfg=this.struct(cfgPtr,r,'can_cfg_t',fn),c=k=>this.canGet(cfg,k);
  if(isNull(cfg.fields.p_extend.value)||isNull(cfg.fields.p_callback.value)||isNull(cfg.fields.p_bit_timing.value))return E.ASSERTION;
  for(const k of ['error_irq','rx_irq','tx_irq'])if((Number(cfg.fields[k].value)|0)<0)return E.ASSERTION;
  const ext=this.canAt(r,cfg.fields.p_extend.value),x=k=>this.canGet(ext,k),count=x('mailbox_count');
  if(count>32||count%4)return E.INIT_FAILED;
  if(this.canGet(ctrl,'open')===CAN_OPEN)return E.ALREADY_OPEN;
  for(let i=0;i<count/4;i++)if((Number(r.get(r.pointerCell(ext.fields.p_mailbox_mask.value,i)))>>>0)>0x1fffffff)return E.INIT_FAILED;
  const bt=this.canAt(r,cfg.fields.p_bit_timing.value),b=k=>this.canGet(bt,k);
  if(b('baud_rate_prescaler')>1024||b('baud_rate_prescaler')<1)return E.INIT_FAILED;
  if(b('time_segment_1')<=b('time_segment_2'))return E.INIT_FAILED;
  if(b('time_segment_2')<b('synchronization_jump_width'))return E.INIT_FAILED;
  // CANMCLK: fPCLKB >= fCANMCLK (BSP_CFG_XTAL_HZ); PCLKB: the system clock is the PLL (always so in the generated BSP).
  if(x('clock_source')===1&&this.pclkb<XTAL_HZ)return E.INIT_FAILED;
  this.canStopped=false; // R_BSP_MODULE_START
  ctrl.fields.p_cfg.value=cfgPtr;ctrl.fields.p_callback.value=cfg.fields.p_callback.value;ctrl.fields.p_context.value=cfg.fields.p_context.value;ctrl.fields.p_callback_memory.value=0;
  this.setField(ctrl,'clock_source',x('clock_source'),r);
  yield* this.canTransition(r,ctrl,1,0);
  this.canW(r,CTLR,((x('global_id_mode')<<1)|(x('message_mode')<<3)|(3<<6)|(1<<8))&0xffff,2);
  this.canW(r,BCR,((((b('baud_rate_prescaler')-1)&0x3ff)<<16)|(((b('time_segment_1')-1)<<28)>>>0)|((b('time_segment_2')-1)<<8)|((b('synchronization_jump_width')-1)<<12)|x('clock_source'))>>>0,4);
  yield* this.canTransition(r,ctrl,2,0);
  this.canW(r,ECSR,0x80,1);
  for(let off=MB;off<MB+16*32;off+=4)this.canW(r,off,0,4);
  for(let i=0;i<32;i++){
   const m=this.canAt(r,ext.fields.p_mailbox.value,i);let mctl=0;
   if(this.canGet(m,'mailbox_type')===0&&i<count){this.canIdSet(r,ext,MB+16*i,m);mctl=0x40;}
   this.canW(r,MCTL+i,mctl,1);
  }
  let enabled=0;
  for(let i=0;i<count/4;i++){
   let mask=Number(r.get(r.pointerCell(ext.fields.p_mailbox_mask.value,i)))>>>0;
   if(mask<0x1fffffff){if(x('global_id_mode')===0)mask=((mask&0x7ff)<<18)>>>0;this.canW(r,MKR+4*i,mask,4);enabled|=0xf<<(i<<2);}
  }
  this.canW(r,MKIVLR,(~enabled)>>>0,4);
  yield* this.canTransition(r,ctrl,0,0);
  this.canW(r,CTLR,this.canR(r,CTLR,2)|0x20,2);while(this.canR(r,CTLR,2)&0x20)yield .01;
  const irqs=this.canIrqs();for(const [kind,k]of [['error','error_irq'],['rx','rx_irq'],['tx','tx_irq']])irqs[kind]={irq:Number(cfg.fields[k].value)|0,ipl:c('ipl')&0xff,ctrl:ctrlPtr};
  this.canW(r,EIER,0x3e,1);this.canW(r,MIER,0xffffffff,4);
  this.setField(ctrl,'open',CAN_OPEN,r);
  return E.SUCCESS;
 },
 *R_CAN_Close([ctrlPtr],r,fn){
  if(isNull(ctrlPtr))return E.ASSERTION;
  const ctrl=this.canCtrl(ctrlPtr,r,fn);if(this.canGet(ctrl,'open')!==CAN_OPEN)return E.NOT_OPEN;
  this.setField(ctrl,'open',0,r);this.canIrq={};
  this.canW(r,EIER,0,1);this.canW(r,MIER,0,4);
  this.canStopped=true; // R_BSP_MODULE_STOP
  return E.SUCCESS;
 },
 *R_CAN_Write([ctrlPtr,mailbox,framePtr],r,fn){
  if(isNull(ctrlPtr)||isNull(framePtr))return E.ASSERTION;
  const ctrl=this.canCtrl(ctrlPtr,r,fn);if(this.canGet(ctrl,'open')!==CAN_OPEN)return E.NOT_OPEN;
  const cfg=this.canAt(r,ctrl.fields.p_cfg.value),ext=this.canAt(r,cfg.fields.p_extend.value),mb=mailbox>>>0;
  if(mb>=this.canGet(ext,'mailbox_count'))return E.INVALID_ARGUMENT;
  if(this.canR(r,MCTL+mb,1)&0x40)return E.RECEIVE_MAILBOX;
  const f=this.struct(framePtr,r,'can_frame_t',fn),dlc=this.canGet(f,'data_length_code')&0xff;
  if(dlc>8)return E.INVALID_ARGUMENT;
  if(this.canR(r,MCTL+mb,1)&0x80)return E.TRANSMIT_NOT_READY;
  // (the frame as a can_mailbox_t: id, id_mode, type)
  const id={fields:{mailbox_id:f.fields.id,id_mode:f.fields.id_mode,frame_type:f.fields.type}};
  this.canIdSet(r,ext,MB+16*mb,id);
  this.canW(r,MB+16*mb+4,(this.canR(r,MB+16*mb+4,2)&~0xf)|(dlc&0xf),2);
  for(let i=0;i<dlc;i++)this.canW(r,MB+16*mb+6+i,Number(f.fields.data.value.cells[i].value)&0xff,1);
  this.canW(r,MCTL+mb,0x80,1);
  return E.SUCCESS;
 },
 *R_CAN_Read(){return E.UNSUPPORTED;},
 *R_CAN_ModeTransition([ctrlPtr,mode,test],r,fn){
  if(isNull(ctrlPtr))return E.ASSERTION;
  const ctrl=this.canCtrl(ctrlPtr,r,fn);if(this.canGet(ctrl,'open')!==CAN_OPEN)return E.NOT_OPEN;
  yield* this.canTransition(r,ctrl,mode>>>0,test>>>0);
  return E.SUCCESS;
 },
 *R_CAN_InfoGet([ctrlPtr,infoPtr],r,fn){
  if(isNull(ctrlPtr)||isNull(infoPtr))return E.ASSERTION;
  const ctrl=this.canCtrl(ctrlPtr,r,fn);if(this.canGet(ctrl,'open')!==CAN_OPEN)return E.NOT_OPEN;
  const info=this.struct(infoPtr,r,'can_info_t',fn),code=this.canR(r,ECSR,1)&0x7f;
  this.setField(info,'status',this.canR(r,STR,2),r);this.setField(info,'error_count_receive',this.canR(r,RECR,1),r);this.setField(info,'error_count_transmit',this.canR(r,TECR,1),r);this.setField(info,'error_code',code,r);
  this.canW(r,ECSR,(code^0x7f)&0xff,1);
  return E.SUCCESS;
 },
 *R_CAN_CallbackSet([ctrlPtr,callback,context,memory],r,fn){
  if(isNull(ctrlPtr)||isNull(callback))return E.ASSERTION;
  const ctrl=this.canCtrl(ctrlPtr,r,fn);if(this.canGet(ctrl,'open')!==CAN_OPEN)return E.NOT_OPEN;
  ctrl.fields.p_callback.value=r.callback(callback);ctrl.fields.p_context.value=context;ctrl.fields.p_callback_memory.value=memory;
  return E.SUCCESS;
 }
};
/** Every R_CAN_* name the interpreter answers. */
export const CAN_NAMES=Object.freeze(Object.keys(CAN_API));
