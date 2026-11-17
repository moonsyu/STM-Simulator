// R_ELC_*, R_DTC_* and R_DMAC_* for the built-in interpreter (feature 36), and the events that drive them: r_elc.c,
// r_dtc.c and r_dmac.c (FSP 6.x) call by call — the same checks in the same order and the same return codes — with the
// emulator's rules for what a transfer does (src/emu/ra6e1/dtc.js, dmac.js, elc.js): a DTC reads and writes back the
// transfer_info_t of its vector, a DMAC copies it into its channel registers when it is configured, ELC links pass an
// event on (the ADC0 scan start is the modelled consumer).
// An event of the interpreter's peripherals (GPT overflow, AGT underflow, ADC scan end, ICU pin, software event, DMAC end)
// goes through FspAdapter.fspEvent: the DTC on its vector first (the CPU interrupt only when the DTC passes it on), then
// the DMAC channels that select it, then the ELC links — the emulator's order (soc.raiseEvent).
// Transfers move the interpreter's values: a unit is one element of a variable or an array whose size is the transfer size
// (uint16_t samples[] for 2-byte transfers); another size, or a pointer the interpreter has no memory behind, stops with
// the reason. R_ADC_InfoGet's p_address points at ADC0's ADDRn (R_ADC0->ADDR[n] also reads them).
// A UART's DTC (r_sci_uart with p_transfer_tx / p_transfer_rx) is run by the UART model of fsp-interp.js itself: the
// bytes and the callback times are the driver's with the DTC (TX_DATA_EMPTY when the DTC has written the last byte).
import {RA_ELC_EVENTS,RA_ELC_PERIPHERALS,raElcEventName} from './ra-config.js';

const E={SUCCESS:0,ASSERTION:1,UNSUPPORTED:6,NOT_OPEN:7,IN_USE:8,IRQ_BSP_DISABLED:11,ALREADY_OPEN:14,NOT_ENABLED:19,IP_CHANNEL_NOT_PRESENT:1402};
const enumOf=(tag,name,items)=>`typedef enum ${tag}\n{\n${items.map(([k,v])=>`    ${k} = ${v},`).join('\n')}\n} ${name};`;
const hex=n=>'0x'+(n>>>0).toString(16).toUpperCase();
const MODE={NORMAL:0,REPEAT:1,BLOCK:2,REPEAT_BLOCK:3},ADDR={FIXED:0,OFFSET:1,INCREMENTED:2,DECREMENTED:3};
const ELC_NUM=18;
const isNull=p=>p===0||p===null||p===undefined;

/** r_elc_api.h, r_transfer_api.h, r_dtc.h, r_dmac.h and the elc_event_t of bsp_elc.h for the stand-in headers (bsp_api.h
 *  has the events; the transfer types come with every driver API header). */
export const TRANSFER_TYPES=`${enumOf('e_elc_event','elc_event_t',[['ELC_EVENT_NONE',0],...Object.entries(RA_ELC_EVENTS).map(([k,v])=>['ELC_EVENT_'+k,hex(v)])])}
${enumOf('e_elc_peripheral','elc_peripheral_t',Object.entries(RA_ELC_PERIPHERALS).map(([k,v])=>['ELC_PERIPHERAL_'+k,v]))}
${enumOf('e_elc_software_event','elc_software_event_t',[['ELC_SOFTWARE_EVENT_0',0],['ELC_SOFTWARE_EVENT_1',1]])}
#define ELC_PERIPHERAL_NUM (${ELC_NUM}U)
typedef struct st_elc_cfg { elc_event_t link[${ELC_NUM}]; void * p_extend; } elc_cfg_t;
typedef struct st_elc_instance_ctrl { uint32_t open; void * p_context; } elc_instance_ctrl_t;
typedef struct st_elc_instance { elc_instance_ctrl_t * p_ctrl; const elc_cfg_t * p_cfg; void * p_api; } elc_instance_t;
${enumOf('e_transfer_mode','transfer_mode_t',Object.entries(MODE).map(([k,v])=>['TRANSFER_MODE_'+k,v]))}
${enumOf('e_transfer_size','transfer_size_t',[['TRANSFER_SIZE_1_BYTE',0],['TRANSFER_SIZE_2_BYTE',1],['TRANSFER_SIZE_4_BYTE',2],['TRANSFER_SIZE_8_BYTE',3]])}
${enumOf('e_transfer_addr_mode','transfer_addr_mode_t',Object.entries(ADDR).map(([k,v])=>['TRANSFER_ADDR_MODE_'+k,v]))}
${enumOf('e_transfer_repeat_area','transfer_repeat_area_t',[['TRANSFER_REPEAT_AREA_DESTINATION',0],['TRANSFER_REPEAT_AREA_SOURCE',1]])}
${enumOf('e_transfer_chain_mode','transfer_chain_mode_t',[['TRANSFER_CHAIN_MODE_DISABLED',0],['TRANSFER_CHAIN_MODE_EACH',2],['TRANSFER_CHAIN_MODE_END',3]])}
${enumOf('e_transfer_irq','transfer_irq_t',[['TRANSFER_IRQ_END',0],['TRANSFER_IRQ_EACH',1]])}
${enumOf('e_transfer_start_mode','transfer_start_mode_t',[['TRANSFER_START_MODE_SINGLE',0],['TRANSFER_START_MODE_REPEAT',1]])}
typedef struct st_transfer_callback_args_t { void * p_context; } transfer_callback_args_t;
typedef struct st_dmac_callback_args_t { void * p_context; } dmac_callback_args_t;
typedef struct st_transfer_properties { uint32_t block_count_max; uint32_t block_count_remaining; uint32_t transfer_length_max; uint32_t transfer_length_remaining; } transfer_properties_t;
typedef struct st_fsp_interp_transfer_settings { transfer_addr_mode_t dest_addr_mode; transfer_repeat_area_t repeat_area; transfer_irq_t irq; transfer_chain_mode_t chain_mode; transfer_addr_mode_t src_addr_mode; transfer_size_t size; transfer_mode_t mode; } FSP_INTERP_TRANSFER_SETTINGS;
typedef struct st_transfer_info { FSP_INTERP_TRANSFER_SETTINGS transfer_settings_word_b; const void * p_src; void * p_dest; uint16_t num_blocks; uint16_t length; } transfer_info_t;
typedef struct st_transfer_cfg { transfer_info_t * p_info; const void * p_extend; } transfer_cfg_t;
typedef struct st_transfer_instance { void * p_ctrl; const transfer_cfg_t * p_cfg; void * p_api; } transfer_instance_t;
typedef struct st_dtc_extended_cfg { IRQn_Type activation_source; } dtc_extended_cfg_t;
typedef struct st_dtc_instance_ctrl { uint32_t open; IRQn_Type irq; } dtc_instance_ctrl_t;
typedef struct st_dmac_extended_cfg { uint8_t channel; IRQn_Type irq; uint8_t ipl; int32_t offset; uint16_t src_buffer_size; elc_event_t activation_source; void * p_context; } dmac_extended_cfg_t;
typedef struct st_dmac_instance_ctrl { uint32_t open; } dmac_instance_ctrl_t;
typedef struct st_adc_info { const void * p_address; uint32_t length; transfer_size_t transfer_size; elc_peripheral_t elc_peripheral; elc_event_t elc_event; uint32_t calibration_data; uint16_t room_calibration_data; uint16_t low_calibration_data; int16_t slope_microvolts; } adc_info_t;
#define DTC_MAX_NORMAL_TRANSFER_LENGTH (0x10000)
#define DTC_MAX_REPEAT_TRANSFER_LENGTH (0x100)
#define DTC_MAX_BLOCK_TRANSFER_LENGTH (0x100)
#define DTC_MAX_BLOCK_COUNT (0x10000)
#define DMAC_MAX_NORMAL_TRANSFER_LENGTH (0xFFFF)
#define DMAC_MAX_REPEAT_TRANSFER_LENGTH (0x400)
#define DMAC_MAX_BLOCK_TRANSFER_LENGTH (0x400)
#define DMAC_MAX_REPEAT_COUNT (0x10000)
#define DMAC_MAX_BLOCK_COUNT (0x10000)
#define FSP_ERR_IP_CHANNEL_NOT_PRESENT ((fsp_err_t) 1402)`;

const SIZE_ENUM={1:'TRANSFER_SIZE_1_BYTE',2:'TRANSFER_SIZE_2_BYTE',4:'TRANSFER_SIZE_4_BYTE'};
/** g_elc and g_transferN of hal_data.c for the stand-in header (`inst` from raInstances, `vec(k)` the vector macro). */
export function transferPrelude(inst,vec){
 const out=[];
 for(const t of inst.transfers){
  const m=t.own?{mode:'NORMAL',size:1,srcMode:t.own.tx?'INCREMENTED':'FIXED',destMode:t.own.tx?'FIXED':'INCREMENTED',repeatArea:'SOURCE',irq:'END'}:t,dtc=t.driver==='DTC';
  out.push(`${dtc?'dtc':'dmac'}_instance_ctrl_t ${t.name}_ctrl;`,
   `transfer_info_t ${t.name}_info = { .transfer_settings_word_b = { .dest_addr_mode = TRANSFER_ADDR_MODE_${m.destMode}, .repeat_area = TRANSFER_REPEAT_AREA_${m.repeatArea}, .irq = TRANSFER_IRQ_${m.irq}, .chain_mode = TRANSFER_CHAIN_MODE_DISABLED, .src_addr_mode = TRANSFER_ADDR_MODE_${m.srcMode}, .size = ${SIZE_ENUM[m.size]}, .mode = TRANSFER_MODE_${m.mode} }, .p_dest = NULL, .p_src = NULL, .num_blocks = ${t.own?0:t.blocks}, .length = ${t.own?0:t.length} };`,
   dtc?`const dtc_extended_cfg_t ${t.name}_cfg_extend = { .activation_source = ${vec(t.activation)} };`
    :`const dmac_extended_cfg_t ${t.name}_extend = { .offset = 1, .src_buffer_size = 1, .irq = ${t.callback?vec(`DMAC${t.channel}_INT`):'FSP_INVALID_VECTOR'}, .ipl = ${t.callback?`(${t.priority})`:'(BSP_IRQ_DISABLED)'}, .channel = ${t.channel}, .p_context = NULL, .activation_source = ${t.activation==='SOFTWARE'?'ELC_EVENT_NONE':'ELC_EVENT_'+t.activation} };`,
   `const transfer_cfg_t ${t.name}_cfg = { .p_info = &${t.name}_info, .p_extend = &${t.name}_${dtc?'cfg_extend':'extend'} };`,
   `const transfer_instance_t ${t.name} = { .p_ctrl = &${t.name}_ctrl, .p_cfg = &${t.name}_cfg, .p_api = NULL };`,
   ...(t.callback?[`void ${t.callback}(dmac_callback_args_t * p_args);`]:[]));
 }
 if(inst.elc){
  const links=Object.entries(inst.elcLinks||{}).map(([k,ev])=>`[${RA_ELC_PERIPHERALS[k]}] = ELC_EVENT_${ev}`);
  out.push('elc_instance_ctrl_t g_elc_ctrl;',`const elc_cfg_t g_elc_cfg = { .link = { ${links.length?links.join(', '):'[0] = ELC_EVENT_NONE'} }, .p_extend = NULL };`,'const elc_instance_t g_elc = { .p_ctrl = &g_elc_ctrl, .p_cfg = &g_elc_cfg, .p_api = NULL };');
 }
 return out;
}

/** Methods of FspAdapter (fsp-interp.js). */
export const TRANSFER_METHODS={
 // ---- ELC
 elcState(ctrl,r,fn){if(!this.config.peripherals?.ELC?.enabled)throw new Error(`${fn}: Stacks에서 Event Link Controller (g_elc)를 추가하세요.`);const st=this.instance(ctrl,r,fn,'elc');st.kind='elc';st.links??=new Array(ELC_NUM).fill(0);return st;},
 elcCall(name,args,r){
  const st=this.elcState(args[0],r,name);
  if(name==='R_ELC_Open'){
   if(st.open)return E.ALREADY_OPEN;if(isNull(args[1]))return E.ASSERTION;
   const cfg=this.struct(args[1],r,'elc_cfg_t',name),link=cfg.fields.link.value.cells;
   for(let i=0;i<ELC_NUM;i++)if(i in ELC_NAMES)st.links[i]=Number(link[i]?.value??0)>>>0;
   st.open=true;return E.SUCCESS;
  }
  if(!st.open)return E.NOT_OPEN;
  if(name==='R_ELC_Close'){st.open=false;this.elcOn=false;return E.SUCCESS;}
  if(name==='R_ELC_Enable'){this.elcOn=true;return E.SUCCESS;}
  if(name==='R_ELC_Disable'){this.elcOn=false;return E.SUCCESS;}
  if(name==='R_ELC_LinkSet'){const p=Number(args[1]);if(!(p>=0&&p<23))throw new Error(`${name}: elc_peripheral_t 값(ELC_PERIPHERAL_ADC0 등)이 필요합니다.`);st.links[p]=Number(args[2])&0x1ff;return E.SUCCESS;}
  if(name==='R_ELC_LinkBreak'){const p=Number(args[1]);if(!(p>=0&&p<23))throw new Error(`${name}: elc_peripheral_t 값이 필요합니다.`);st.links[p]=0;return E.SUCCESS;}
  if(name==='R_ELC_SoftwareEventGenerate'){const n=Number(args[1]);if(n!==0&&n!==1)throw new Error(`${name}: ELC_SOFTWARE_EVENT_0 또는 ELC_SOFTWARE_EVENT_1을 넘기세요.`);this.fspEvent(r,'ELC_SOFTWARE_EVENT_'+n);return E.SUCCESS;}
  return null;
 },
 // An event through the ELC links (ELCR.ELCON set): ELSR8 starts an ADC0 scan; another peripheral is said once, as the
 // emulator says it.
 elcDeliver(r,event){
  const st=[...this.states.values()].find(s=>s.kind==='elc');if(!st||!this.elcOn)return;
  const code=RA_ELC_EVENTS[event];
  st.links.forEach((v,n)=>{
   if(v!==code||!code)return;
   if(n===8){this.adcElcTrigger(r);return;}
   this.warnOnce(r,'elc:'+n,`[ELC] ELSR${n} (ELC_PERIPHERAL_${ELC_NAMES[n]??n})로 연결한 이벤트는 받는 주변장치가 시뮬레이터 모델에 없어 아무 일도 하지 않습니다(모델에 있는 연결: ADC0 스캔 시작).`);
  });
 },
 /** An event of a peripheral (an ELC_EVENT_ name): the DTC on its vector, the DMAC channels, the ELC links. Returns
  *  whether the CPU gets the interrupt (false when a DTC took it). */
 fspEvent(r,event){
  let cpu=true;
  const dtc=this.transferStates().find(s=>s.driver==='DTC'&&s.open&&s.enabled&&s.event===event&&!s.own);
  if(dtc){const res=this.dtcActivate(r,dtc);cpu=res.cpu;if(res.clearDtce)dtc.enabled=false;}
  for(const s of this.transferStates().filter(s=>s.driver==='DMAC'&&s.open&&s.enabled&&s.event===event).sort((a,b)=>a.channel-b.channel))this.dmacRequest(r,s);
  this.elcDeliver(r,event);
  return cpu;
 },
 transferStates(){return [...this.states.values()].filter(s=>s.driver);},
 // ---- transfer instances
 transferState(ctrl,r,fn,driver){
  const st=this.instance(ctrl,r,fn,'transfer'),n=st.n??st.channel,t=this.inst.transfers.find(x=>x.n===n);
  if(!t)throw new Error(`${fn}: Stacks에서 g_transfer${n} (r_${driver.toLowerCase()})를 추가하세요.`);
  if(t.driver!==driver)throw new Error(`${fn}: g_transfer${n}은(는) ${t.driver} (r_${t.driver.toLowerCase()}) 전송입니다. R_${t.driver}_${fn.split('_').slice(2).join('_')}를 쓰세요.`);
  if(!st.driver)Object.assign(st,{driver,n:t.n,channel:driver==='DMAC'?t.channel:st.channel,event:t.activation,own:t.own,callback:t.callback||'',ipl:t.priority,enabled:false,regs:null});
  return st;
 },
 // The transfer_info_t a pointer names (the cell, for write-back) and its fields as numbers and pointers.
 infoAt(r,ptr,index=0){
  const cell=r.pointerCell(ptr,index),v=r.get(cell);
  if(v?.kind!=='struct'||!v.fields.transfer_settings_word_b)throw new Error('transfer_info_t 구조체가 필요합니다.');
  const s=v.fields.transfer_settings_word_b.value.fields,n=k=>Number(s[k].value);
  return {v,f:v.fields,mode:n('mode'),size:n('size'),sm:n('src_addr_mode'),dm:n('dest_addr_mode'),dts:n('repeat_area'),irq:n('irq'),chain:n('chain_mode'),src:v.fields.p_src.value,dest:v.fields.p_dest.value,length:Number(v.fields.length.value)&0xffff,blocks:Number(v.fields.num_blocks.value)&0xffff};
 },
 // The information of a chain, as r_dtc walks it (until chain_mode DISABLED).
 chainOf(r,ptr){const list=[];for(let i=0;i<64;i++){const info=this.infoAt(r,ptr,i);list.push(info);if(info.chain===0)break;}return list;},
 // One unit from `src` to `dest`; returns the pointers after it.
 moveUnit(r,info,src,dest,bytes,fn){
  if(isNull(src)||isNull(dest))throw new Error(`${fn}: 전송 정보의 p_src · p_dest가 NULL입니다.`);
  // An array passed by name is a pointer to its first element.
  src=r.literal(src);dest=r.literal(dest);if(src?.kind==='array')src=r.pointer(src);if(dest?.kind==='array')dest=r.pointer(dest);
  const from=this.unitCell(r,src,bytes,fn,'p_src'),to=this.unitCell(r,dest,bytes,fn,'p_dest');
  r.set(to,r.get(from));
  const step=(p,mode)=>mode===ADDR.INCREMENTED||mode===ADDR.DECREMENTED?(p.array?{...p,index:p.index+(mode===ADDR.INCREMENTED?1:-1)}:{...p,past:true}):p;
  return [step(src,info.sm),step(dest,info.dm)];
 },
 unitCell(r,p,bytes,fn,what){
  if(p?.past)throw new Error(`${fn}: ${what}가 변수 하나를 가리키는데 주소가 늘어나도록(INCREMENTED/DECREMENTED) 정해 그 다음을 옮기려 했습니다. 배열을 가리키거나 주소 모드를 FIXED로 정하세요.`);
  let cell;try{cell=r.pointerCell(p);}catch(error){throw new Error(`${fn}: ${what}로 옮길 수 없습니다 — ${error.message} (내장 해석기는 변수·배열과 R_ADC_InfoGet의 ADC 결과 레지스터 사이에서만 옮깁니다.)`);}
  const size=cell.dataType?r.typeSize(cell.dataType):bytes;
  if(size!==bytes)throw new Error(`${fn}: ${what}의 원소는 ${size}바이트인데 전송 단위는 ${bytes}바이트입니다. 내장 해석기는 전송 단위와 같은 크기의 원소(예: 2바이트 전송은 uint16_t 배열) 사이에서만 옮깁니다.`);
  return cell;
 },
 // ---- DTC (r_dtc.c)
 dtcLengthAssert(r,ptr){for(const i of this.chainOf(r,ptr)){if(i.sm===ADDR.OFFSET||i.dm===ADDR.OFFSET)return E.UNSUPPORTED;if(i.mode!==MODE.NORMAL&&i.length>0x100)return E.ASSERTION;}return E.SUCCESS;},
 dtcSourceCheck(r,ptr){for(const i of this.chainOf(r,ptr)){if(i.sm===ADDR.OFFSET||i.dm===ADDR.OFFSET)return E.UNSUPPORTED;if(isNull(i.src)||isNull(i.dest))return E.ASSERTION;}return E.SUCCESS;},
 dtcSetInfo(r,st,ptr){for(const i of this.chainOf(r,ptr))if(i.mode!==MODE.NORMAL){const cral=i.length&0xff;r.set(i.f.length,((cral<<8)|cral)&0xffff);}st.info=ptr?.kind==='array'?r.pointer(ptr):ptr;},
 dtcEnable(r,st){const err=this.dtcSourceCheck(r,st.info);if(err)return err;st.enabled=true;return E.SUCCESS;},
 dtcVector(st,r,fn){const v=this.vectorIndex(st.event);if(v<0)throw new Error(`${fn}: ${st.event}에 인터럽트 벡터가 없습니다.`);return v;},
 dtcCall(name,args,r){
  if(['R_DTC_SoftwareStart','R_DTC_SoftwareStop','R_DTC_Reload','R_DTC_CallbackSet'].includes(name))return E.UNSUPPORTED;
  if(isNull(args[0]))return E.ASSERTION;
  const st=this.transferState(args[0],r,name,'DTC');
  if(name==='R_DTC_Open'){
   if(st.open)return E.ALREADY_OPEN;if(isNull(args[1]))return E.ASSERTION;
   const cfg=this.struct(args[1],r,'transfer_cfg_t',name);let ext;try{ext=r.get(r.pointerCell(cfg.fields.p_extend.value));}catch{ext=null;}if(!ext)return E.ASSERTION;
   const irq=Number(ext.fields.activation_source.value);if(irq<0)return E.IRQ_BSP_DISABLED;
   const event=this.vectorEvent(irq);if(!event)throw new Error(`${name}: activation_source ${irq}은(는) 이 프로젝트의 벡터가 아닙니다.`);
   if(this.transferStates().some(s=>s!==st&&s.driver==='DTC'&&s.open&&s.event===event))return E.IN_USE;
   st.event=event;
   if(!isNull(cfg.fields.p_info.value)){const err=this.dtcLengthAssert(r,cfg.fields.p_info.value);if(err)return err;this.dtcSetInfo(r,st,cfg.fields.p_info.value);}else st.info=null;
   st.open=true;st.enabled=false;return E.SUCCESS;
  }
  if(!st.open)return E.NOT_OPEN;
  if(name==='R_DTC_Reconfigure'){
   if(isNull(args[1]))return E.ASSERTION;if(this.dtcLengthAssert(r,args[1])===E.ASSERTION)return E.ASSERTION;
   if(this.infoAt(r,args[1]).size===3)return E.UNSUPPORTED;
   st.enabled=false;this.dtcSetInfo(r,st,args[1]);return this.dtcEnable(r,st)?E.NOT_ENABLED:E.SUCCESS;
  }
  if(name==='R_DTC_Reset'){
   if(!st.info)throw new Error(`${name}: 전송 정보가 없습니다(p_info NULL로 연 DTC는 먼저 R_DTC_Reconfigure).`);
   st.enabled=false;const i=this.infoAt(r,st.info);
   if(!isNull(args[1]))i.f.p_src.value=args[1];if(!isNull(args[2]))i.f.p_dest.value=args[2];
   const n=Number(args[3])&0xffff;if(i.mode===MODE.BLOCK)r.set(i.f.num_blocks,n);else if(i.mode===MODE.NORMAL)r.set(i.f.length,n);
   return this.dtcEnable(r,st)?E.NOT_ENABLED:E.SUCCESS;
  }
  if(name==='R_DTC_Enable')return this.dtcEnable(r,st);
  if(name==='R_DTC_Disable'){st.enabled=false;return E.SUCCESS;}
  if(name==='R_DTC_InfoGet'){
   if(isNull(args[1]))return E.ASSERTION;const v=this.struct(args[1],r,'transfer_properties_t',name),set=(k,x)=>this.setField(v,k,x>>>0,r);
   if(st.own){const rem=this.uartTransferRemaining(r,st);set('block_count_max',0);set('block_count_remaining',0);set('transfer_length_max',0x10000);set('transfer_length_remaining',rem);return E.SUCCESS;}
   const i=this.infoAt(r,st.info);set('block_count_max',0);set('block_count_remaining',0);
   if(i.mode!==MODE.NORMAL){set('transfer_length_max',0x100);set('transfer_length_remaining',i.length&0xff);if(i.mode===MODE.BLOCK){set('block_count_max',0x10000);set('block_count_remaining',i.blocks);}}
   else{set('transfer_length_max',0x10000);set('transfer_length_remaining',i.length);}
   return E.SUCCESS;
  }
  if(name==='R_DTC_Close'){st.enabled=false;st.open=false;return E.SUCCESS;}
  return null;
 },
 // An activation: the chain of the vector's information, as the emulator's DTC runs it (dtc.js activate / run).
 dtcActivate(r,st){
  const fn='DTC';let cpu=false,clearDtce=false,ptr=st.info;
  for(let k=0;k<64;k++){
   const i=this.infoAt(r,ptr),bytes=[1,2,4][i.size];
   if(!bytes)throw new Error('DTC: 8바이트 전송은 RA6E1에 없습니다.');
   let src=i.src,dest=i.dest,length=i.length,blocks=i.blocks,ended=false,zero=false;
   const move=()=>{[src,dest]=this.moveUnit(r,i,src,dest,bytes,fn);};
   const back=(p,mode,count)=>(mode===ADDR.INCREMENTED||mode===ADDR.DECREMENTED)&&p.array?{...p,index:p.index-(mode===ADDR.INCREMENTED?count:-count)}:p;
   if(i.mode===MODE.NORMAL){move();const c=(length||0x10000)-1;length=c&0xffff;ended=zero=c===0;}
   else{
    const crah=(length>>8)&0xff,size=crah||256;
    if(i.mode===MODE.REPEAT){move();const cral=((length&0xff)||256)-1;if(cral===0){zero=true;length=(crah<<8)|crah;if(i.dts)src=back(src,i.sm,size);else dest=back(dest,i.dm,size);}else length=(crah<<8)|cral;}
    else if(i.mode===MODE.BLOCK){for(let u=0;u<size;u++)move();if(i.dts)src=back(src,i.sm,size);else dest=back(dest,i.dm,size);const c=(blocks||0x10000)-1;blocks=c&0xffff;ended=zero=c===0;}
    else throw new Error('DTC: 정의되지 않은 전송 모드입니다.');
   }
   i.f.p_src.value=src;i.f.p_dest.value=dest;r.set(i.f.length,length);r.set(i.f.num_blocks,blocks);
   if(i.irq)cpu=true;if(ended){cpu=true;if(!i.irq)clearDtce=true;}
   if(!i.chain||(i.chain===3&&!zero))break;
   ptr=this.nextInfo(ptr);
  }
  return {cpu,clearDtce};
 },
 nextInfo(ptr){if(!ptr?.array)throw new Error('DTC: 체인 전송의 전송 정보는 transfer_info_t 배열로 두세요.');return {...ptr,index:ptr.index+1};},
 // ---- DMAC (r_dmac.c): the channel registers, set from the transfer_info_t when the transfer is configured.
 dmacConfig(r,st,ptr){
  const i=this.infoAt(r,ptr),bytes=[1,2,4][i.size];
  st.enabled=false;st.swreq=false;
  const len=i.length&0xffff,rep=i.mode!==MODE.NORMAL;
  st.regs={mode:i.mode,bytes,sm:i.sm,dm:i.dm,dts:rep&&i.mode!==MODE.REPEAT_BLOCK?i.dts:2,sar:i.src,dar:i.dest,crah:rep?len&0x3ff:0,cral:rep?len&0x3ff:len,crb:rep?i.blocks:0,
   dtie:!!st.callback,rptie:!!st.callback&&i.irq===1&&i.mode!==MODE.REPEAT_BLOCK};
 },
 dmacEnableCheck(st){const g=st.regs;if(isNull(g.sar)||isNull(g.dar))return E.ASSERTION;if(g.mode===MODE.NORMAL&&g.cral===0)return E.ASSERTION;return E.SUCCESS;},
 dmacEnable(r,st){const err=this.dmacEnableCheck(st);if(err)return err;st.enabled=true;return E.SUCCESS;},
 dmacCall(name,args,r){
  if(name==='R_DMAC_Reload')return E.UNSUPPORTED;
  if(isNull(args[0]))return E.ASSERTION;
  const st=this.transferState(args[0],r,name,'DMAC');
  if(name==='R_DMAC_Open'){
   if(st.open)return E.ALREADY_OPEN;if(isNull(args[1]))return E.ASSERTION;
   const cfg=this.struct(args[1],r,'transfer_cfg_t',name);let ext;try{ext=r.get(r.pointerCell(cfg.fields.p_extend.value));}catch{ext=null;}if(!ext)return E.ASSERTION;
   const ch=Number(ext.fields.channel.value);if(ch>=8)return E.IP_CHANNEL_NOT_PRESENT;
   if(st.callback&&Number(ext.fields.irq.value)<0)return E.IRQ_BSP_DISABLED;
   if(isNull(cfg.fields.p_info.value))return E.ASSERTION;
   const i=this.infoAt(r,cfg.fields.p_info.value);if(i.mode!==MODE.NORMAL&&i.length>0x400)return E.ASSERTION;if(i.mode===MODE.REPEAT_BLOCK&&i.irq===1)return E.ASSERTION;
   if(i.mode===MODE.REPEAT_BLOCK)throw new Error(`${name}: Repeat-Block 모드(TRANSFER_MODE_REPEAT_BLOCK)는 시뮬레이터가 지원하지 않습니다.`);
   const ev=Number(ext.fields.activation_source.value);st.event=ev?raElcEventName(ev):'SOFTWARE';st.ipl=Number(ext.fields.ipl.value);
   if(ev&&!st.event)throw new Error(`${name}: activation_source ${hex(ev)}은(는) 시뮬레이터가 내는 이벤트가 아닙니다.`);
   st.vectorOk=Number(ext.fields.irq.value)>=0;
   this.dmacConfig(r,st,cfg.fields.p_info.value);st.open=true;return E.SUCCESS;
  }
  if(!st.open)return E.NOT_OPEN;
  if(name==='R_DMAC_Reconfigure'){
   if(isNull(args[1]))return E.ASSERTION;const i=this.infoAt(r,args[1]);if(i.mode!==MODE.NORMAL&&i.length>0x400)return E.ASSERTION;if(i.mode===MODE.REPEAT_BLOCK&&i.irq===1)return E.ASSERTION;if(i.size===3)return E.UNSUPPORTED;
   if(i.mode===MODE.REPEAT_BLOCK)throw new Error(`${name}: Repeat-Block 모드는 시뮬레이터가 지원하지 않습니다.`);
   this.dmacConfig(r,st,args[1]);return this.dmacEnable(r,st)?E.NOT_ENABLED:E.SUCCESS;
  }
  if(name==='R_DMAC_Reset'){
   st.enabled=false;st.swreq=false;const g=st.regs;if(!isNull(args[1]))g.sar=args[1];if(!isNull(args[2]))g.dar=args[2];
   const n=Number(args[3])&0xffff;if(g.mode!==MODE.NORMAL)g.crb=n;else{g.cral=n;g.crah=0;}
   return this.dmacEnable(r,st)?E.NOT_ENABLED:E.SUCCESS;
  }
  if(name==='R_DMAC_SoftwareStart'){
   if(st.event!=='SOFTWARE')return E.UNSUPPORTED;
   const repeat=Number(args[1])===1;st.swreq=true;
   if(st.enabled){let units=0;do{units+=this.dmacRequest(r,st);}while(repeat&&st.enabled&&st.swreq&&units<(1<<20));if(!repeat||!st.enabled)st.swreq=false;}
   return E.SUCCESS;
  }
  if(name==='R_DMAC_SoftwareStop'){st.swreq=false;return E.SUCCESS;}
  if(name==='R_DMAC_Enable')return this.dmacEnable(r,st);
  if(name==='R_DMAC_Disable'){st.enabled=false;st.swreq=false;return E.SUCCESS;}
  if(name==='R_DMAC_InfoGet'){
   if(isNull(args[1]))return E.ASSERTION;const v=this.struct(args[1],r,'transfer_properties_t',name),g=st.regs,set=(k,x)=>this.setField(v,k,x>>>0,r);
   set('transfer_length_max',g.mode===MODE.NORMAL?0xffff:0x400);set('block_count_max',0x10000);set('block_count_remaining',g.crb);set('transfer_length_remaining',g.cral&0xffff);return E.SUCCESS;
  }
  if(name==='R_DMAC_CallbackSet'){if(isNull(args[1]))return E.ASSERTION;const fnv=args[1];st.callback=fnv?.kind==='function'?fnv.name:st.callback;return E.SUCCESS;}
  if(name==='R_DMAC_Close'){st.enabled=false;st.swreq=false;st.open=false;this.dropJobs(`DMAC${st.channel}:`);return E.SUCCESS;}
  return null;
 },
 // One request of a DMAC channel (dmac.js request); returns the units moved.
 dmacRequest(r,st){
  const g=st.regs,fn='DMAC';if(!g)return 0;
  const size=g.crah||1024,back=(p,mode)=>(mode===ADDR.INCREMENTED||mode===ADDR.DECREMENTED)&&p.array?{...p,index:p.index-(mode===ADDR.INCREMENTED?size:-size)}:p;
  let units=0,end=false,escape=false;
  const move=()=>{if(g.sm===ADDR.OFFSET||g.dm===ADDR.OFFSET)throw new Error('DMAC: 오프셋 주소 모드(TRANSFER_ADDR_MODE_OFFSET)는 내장 해석기가 지원하지 않습니다. ARM GCC 빌드로 실행하세요.');[g.sar,g.dar]=this.moveUnit(r,g,g.sar,g.dar,g.bytes,fn);units++;};
  if(g.mode===MODE.NORMAL){move();g.cral=(g.cral-1)&0x3ffffff;end=g.cral===0;}
  else{
   let wrapped=false;
   if(g.mode===MODE.REPEAT){move();g.cral=(g.cral||size)-1;if(g.cral===0){g.cral=g.crah;wrapped=true;}}
   else{for(let i=0;i<size;i++)move();wrapped=true;}
   if(wrapped){if(g.dts===1)g.sar=back(g.sar,g.sm);else if(g.dts===0)g.dar=back(g.dar,g.dm);const left=(g.crb||0x10000)-1;g.crb=left&0xffff;if(left===0)end=true;else if(g.rptie)escape=true;}
  }
  if(end||escape){
   st.enabled=false;
   if(end&&!g.dtie)return units;
   // DMACn_INT: other consumers first (the event goes everywhere), then the CPU's dmac_int_isr when the vector is there.
   const cpu=this.fspEvent(r,`DMAC${st.channel}_INT`);
   if(cpu&&st.callback&&st.vectorOk)this.queue(r,`DMAC${st.channel}_INT`,st.ipl,()=>this.dmacIsr(r,st),'dmac_int_isr',`DMAC${st.channel}:${this.seq}`);
  }
  return units;
 },
 // r_dmac dmac_int_isr: the callback, then the channel enabled again while blocks remain (each-repeat interrupts).
 *dmacIsr(r,st){yield* this.callback(r,st.callback,'dmac_callback_args_t',{});if(st.open&&st.regs.crb>0)st.enabled=true;},
 // ---- ADC: R_ADC_InfoGet and its ADDRn, the ELC start trigger
 adcRegisters(){
  if(!this.adcAddr){const self=this;this.adcAddr={kind:'array',cells:Array.from({length:29},(_,ch)=>({get value(){return self.adcRegister(ch);},set value(v){void v;},owner:{alive:true},constant:true,readOnly:'R_ADC0->ADDR은 읽기 전용입니다(A/D 변환 결과).',dataType:'uint16_t'}))};}
  return this.adcAddr;
 },
 adcRegister(ch){const st=[...this.states.values()].find(s=>/^g_adc\d+_ctrl$/.test(s.name));return st?.values?.get(ch)??0;},
 adcInfoGet([ctrl,info],r,fn){
  if(isNull(ctrl)||isNull(info))return E.ASSERTION;const st=this.instance(ctrl,r,fn,'adc');if(!st.open)return E.NOT_OPEN;
  const v=this.struct(info,r,'adc_info_t',fn),mask=st.mask??0;
  if(mask){const low=31-Math.clz32(mask&-mask),high=31-Math.clz32(mask);v.fields.p_address.value={kind:'pointer',array:this.adcRegisters(),index:low};this.setField(v,'length',high-low+1,r);}
  else this.setField(v,'length',0,r);
  this.setField(v,'transfer_size',1,r);this.setField(v,'elc_event',RA_ELC_EVENTS.ADC0_SCAN_END,r);this.setField(v,'elc_peripheral',8,r);this.setField(v,'calibration_data',0xffffffff,r);
  return E.SUCCESS;
 },
 // ELSR8 → ADC0: with an ELC start trigger and R_ADC_ScanStart having armed it, a scan of the channels (1 µs each, as the
 // emulator), then the scan end event. A trigger during a scan is ignored.
 adcElcTrigger(r){
  const st=[...this.states.values()].find(s=>/^g_adc\d+_ctrl$/.test(s.name));
  if(!st?.open||!st.armed||st.running)return;
  st.running=true;const n=Math.max(1,[...Array(29).keys()].filter(ch=>(st.mask??0)&(1<<ch)).length),gen=st.armGen;
  r.event((r.microTime+n)/1000,()=>{if(!st.open||st.armGen!==gen)return;st.running=false;for(let ch=0;ch<29;ch++)if((st.mask??0)&(1<<ch))st.values.set(ch,this.adcSample(r,st,ch));this.adcScanEnd(r,st);});
 },
 adcScanEnd(r,st){const cpu=this.fspEvent(r,'ADC0_SCAN_END');if(cpu&&st.callback)this.queue(r,'ADC0_SCAN_END',st.ipl,()=>this.callback(r,st.callback,'adc_callback_args_t',{unit:0,event:0,group_mask:1}),'adc_scan_end_isr');},
 // ---- vectors
 vectorIndex(event){return this.vectors.find(v=>v.vector===event)?.index??-1;},
 vectorEvent(index){return this.vectors.find(v=>v.index===index)?.event??null;},
};
const ELC_NAMES=Object.fromEntries(Object.entries(RA_ELC_PERIPHERALS).map(([k,v])=>[v,k]));
export const TRANSFER_NAMES=['R_ELC_Open','R_ELC_Close','R_ELC_Enable','R_ELC_Disable','R_ELC_LinkSet','R_ELC_LinkBreak','R_ELC_SoftwareEventGenerate',
 ...['Open','Reconfigure','Reset','Enable','Disable','SoftwareStart','SoftwareStop','InfoGet','Reload','CallbackSet','Close'].flatMap(k=>['R_DTC_'+k,'R_DMAC_'+k])];
