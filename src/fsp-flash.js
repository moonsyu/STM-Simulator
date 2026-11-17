// R_FLASH_HP_* for the built-in interpreter (feature 39): FSP r_flash_hp.c (6.x) for the data flash, function by
// function, on the emulator's flash sequencer model (src/emu/ra6e1/flash.js, the same FACI registers and commands) —
// so the order of the checks, the error codes, the command sequences, the two interrupt routines of background
// operation (BGO) and what an error leaves behind are the driver's, and both engines share one model of the hardware.
// The build is the generated one: FLASH_HP_CFG_PARAM_CHECKING_ENABLE 1, FLASH_HP_CFG_DATA_FLASH_PROGRAMMING_ENABLE 1,
// FLASH_HP_CFG_CODE_FLASH_PROGRAMMING_ENABLE 0 (a code flash address is FSP_ERR_INVALID_ADDRESS, and the code-flash-only
// calls return FSP_ERR_UNSUPPORTED, as r_flash_hp.c does without it), BSP_FEATURE_FLASH_HP_VERSION 40.
// The wait loops of the driver (FLASH_HP_REGISTER_WAIT_TIMEOUT, the FRDY polls) become waits for the model's FRDY; its
// time-outs cannot be reached (the model's times are below FSP's maximums), so FSP_ERR_TIMEOUT is not returned.
// One difference from the driver: R_FLASH_HP_Write copies the source bytes when it is called; the driver reads the
// buffer as it goes (in BGO from the interrupt), which shows only if the program changes the buffer during the write.
import {RaDataFlash,RA_DF_BASE,RA_DF_SIZE,RA_DF_BLOCK,RA_DF_UNIT} from './ra-data-flash.js';
import {Faci,FCU_EVENT,FACI,FSTATR,FASTAT_CMDLK} from './emu/ra6e1/flash.js';
import {memoryBytes,bytesValue} from './hal-stdio.js';
import {raClockHz} from './ra-config.js';

const E={SUCCESS:0,ASSERTION:1,UNSUPPORTED:6,NOT_OPEN:7,IN_USE:8,IRQ_BSP_DISABLED:11,ALREADY_OPEN:14,INVALID_BLOCKS:21,INVALID_ADDRESS:22,INVALID_SIZE:23,WRITE_FAILED:24,ERASE_FAILED:25,PE_FAILURE:500,CMD_LOCKED:501,FCLK:502,BLANK_CHECK_FAILED:504};
// flash_bgo_operation_t, flash_event_t (r_flash_hp.h, r_flash_api.h).
const OP={NON_BGO:0,WRITE:1,ERASE:2,BLANKCHECK:3};
const EVENT={ERASE_COMPLETE:0,WRITE_COMPLETE:1,BLANK:2,NOT_BLANK:3,ERR_DF_ACCESS:4,ERR_CF_ACCESS:5,ERR_CMD_LOCKED:6,ERR_FAILURE:7};
const DF_END=RA_DF_BASE+RA_DF_SIZE;
const hex=v=>'0x'+(v>>>0).toString(16).toUpperCase().padStart(8,'0');
const enumOf=(tag,name,items)=>`typedef enum ${tag}\n{\n${items.map(([k,v])=>`    ${k} = ${v},`).join('\n')}\n} ${name};`;
const READ_ONLY='데이터 플래시는 대입으로 쓸 수 없습니다. R_FLASH_HP_Erase로 블록을 지운 뒤 R_FLASH_HP_Write로 쓰세요.';
const CODE_FLASH='코드 플래시 주소입니다. 이 프로젝트는 코드 플래시 프로그래밍 없이 빌드하므로(r_flash_hp_cfg.h FLASH_HP_CFG_CODE_FLASH_PROGRAMMING_ENABLE 0) FSP_ERR_INVALID_ADDRESS를 돌려줍니다. 데이터 플래시는 0x08000000~0x08001FFF입니다.';
// Calls that need code flash programming, an ID code, an access window, anti-rollback counters or a user lockable
// area: none of them is in this build or on the RA6E1 (bsp_feature.h), and r_flash_hp.c returns FSP_ERR_UNSUPPORTED.
const UNSUPPORTED={R_FLASH_HP_IdCodeSet:'코드 플래시 프로그래밍과 ID 코드',R_FLASH_HP_AccessWindowSet:'코드 플래시 프로그래밍과 액세스 윈도',R_FLASH_HP_AccessWindowClear:'코드 플래시 프로그래밍과 액세스 윈도',R_FLASH_HP_StartUpAreaSelect:'코드 플래시 프로그래밍',R_FLASH_HP_BankSwap:'코드 플래시 프로그래밍',
 R_FLASH_HP_AntiRollbackCounterIncrement:'안티 롤백 카운터',R_FLASH_HP_AntiRollbackCounterRefresh:'안티 롤백 카운터',R_FLASH_HP_AntiRollbackCounterRead:'안티 롤백 카운터',R_FLASH_HP_UserLockableAreaWrite:'사용자 잠금 영역'};

/** r_flash_api.h / r_flash_hp.h for the interpreter's stand-in headers (hal_data.h has them when the stack is there). */
export const FLASH_TYPES=`${enumOf('e_flash_result','flash_result_t',[['FLASH_RESULT_BLANK',0],['FLASH_RESULT_NOT_BLANK',1],['FLASH_RESULT_BGO_ACTIVE',2]])}
${enumOf('e_flash_startup_area_swap','flash_startup_area_swap_t',[['FLASH_STARTUP_AREA_BTFLG',0],['FLASH_STARTUP_AREA_BLOCK0','0x2'],['FLASH_STARTUP_AREA_BLOCK1','0x3']])}
${enumOf('e_flash_event','flash_event_t',['ERASE_COMPLETE','WRITE_COMPLETE','BLANK','NOT_BLANK','ERR_DF_ACCESS','ERR_CF_ACCESS','ERR_CMD_LOCKED','ERR_FAILURE','ERR_ONE_BIT','ERR_TWO_BIT','ERR_ECC'].map((k,i)=>['FLASH_EVENT_'+k,i]))}
${enumOf('e_flash_id_code_mode','flash_id_code_mode_t',[['FLASH_ID_CODE_MODE_UNLOCKED',0],['FLASH_ID_CODE_MODE_LOCKED_WITH_ALL_ERASE_SUPPORT','0xC000'],['FLASH_ID_CODE_MODE_LOCKED','0x8000']])}
${enumOf('e_flash_status','flash_status_t',[['FLASH_STATUS_IDLE',0],['FLASH_STATUS_BUSY',1]])}
${enumOf('e_flash_arc','flash_arc_t',[['FLASH_ARC_SEC',0],['FLASH_ARC_OEMBL',1],['FLASH_ARC_NSEC_0',2],['FLASH_ARC_NSEC_1',3],['FLASH_ARC_NSEC_2',4],['FLASH_ARC_NSEC_3',5]])}
typedef struct st_flash_block_info { uint32_t block_section_st_addr; uint32_t block_section_end_addr; uint32_t block_size; uint32_t block_size_write; } flash_block_info_t;
typedef struct st_flash_regions { uint32_t num_regions; const flash_block_info_t * p_block_array; } flash_regions_t;
typedef struct st_flash_info { flash_regions_t code_flash; flash_regions_t data_flash; } flash_info_t;
typedef struct st_flash_user_cb_data { flash_event_t event; uint32_t data; void * p_context; } flash_callback_args_t;
typedef struct st_flash_cfg { bool data_flash_bgo; void * p_extend; void * p_context; uint8_t ipl; IRQn_Type irq; uint8_t err_ipl; IRQn_Type err_irq; } flash_cfg_t;
typedef struct st_flash_hp_instance_ctrl { uint32_t opened; } flash_hp_instance_ctrl_t;
typedef struct st_flash_instance { void * p_ctrl; const flash_cfg_t * p_cfg; void * p_api; } flash_instance_t;
#define BSP_FEATURE_FLASH_DATA_FLASH_START (0x08000000U)
#define BSP_DATA_FLASH_SIZE_BYTES (8192)
#define BSP_FEATURE_FLASH_HP_DF_BLOCK_SIZE (64U)
#define BSP_FEATURE_FLASH_HP_DF_WRITE_SIZE (4U)`;
/** g_flash0 of hal_data.c for the stand-in header: `t` from raInstances().flash, `vec(k)` the vector macro or FSP_INVALID_VECTOR. */
export function flashPrelude(t,vec){
 return ['flash_hp_instance_ctrl_t g_flash0_ctrl;',`const flash_cfg_t g_flash0_cfg = { .data_flash_bgo = ${t.bgo?'true':'false'}, .p_context = NULL, .p_extend = NULL, .irq = ${t.bgo?vec('FCU_FRDYI'):'FSP_INVALID_VECTOR'}, .err_irq = ${t.bgo?vec('FCU_FIFERR'):'FSP_INVALID_VECTOR'}, .err_ipl = ${t.bgo?`(${t.errorPriority})`:'(BSP_IRQ_DISABLED)'}, .ipl = ${t.bgo?`(${t.readyPriority})`:'(BSP_IRQ_DISABLED)'} };`,
  'const flash_instance_t g_flash0 = { .p_ctrl = &g_flash0_ctrl, .p_cfg = &g_flash0_cfg, .p_api = NULL };',...(t.callback?[`void ${t.callback}(flash_callback_args_t * p_args);`]:[])];
}
// g_code_flash_macro_info / g_data_flash_macro_info of r_flash_hp.c with the RA6E1's bsp_feature.h values (1 MB code
// flash: 8 KB blocks below 0x10000, 32 KB above, 128-byte writes; 8 KB data flash: 64-byte blocks, 4-byte writes).
const CODE_REGIONS=[{block_section_st_addr:0,block_section_end_addr:0xffff,block_size:0x2000,block_size_write:128},{block_section_st_addr:0x10000,block_section_end_addr:0xfffff,block_size:0x8000,block_size_write:128}];
const DATA_REGIONS=[{block_section_st_addr:RA_DF_BASE,block_section_end_addr:DF_END-1,block_size:RA_DF_BLOCK,block_size_write:RA_DF_UNIT}];

const u32=(v,fn,what)=>{if(typeof v!=='number'||!Number.isFinite(v))throw new Error(`${fn}: ${what}은(는) 정수로 넘기세요.`);return v>>>0;};

/** Methods of FspAdapter (fsp-interp.js): the adapter keeps the data flash (`dataFlash`) across resets. */
export const FLASH_METHODS={
 /** The data flash of this run: the project's saved contents at the start (session.js), kept across MCU resets. */
 flashStore(saved){return new RaDataFlash().apply(saved);},
 // The sequencer model, with the interpreter's clock, events and interrupt queue behind it.
 flashDev(r){
  if(!this.faciDev){
   const self=this,soc={r,dataFlash:this.dataFlash,nowUs:()=>soc.r?.microTime??0,sync(){},after:(us,fn)=>{soc.r.event((soc.r.microTime+us)/1000,fn);return null;},
    raiseEvent:ev=>self.flashEvent(soc.r,ev),flashWriteEnabled:()=>!!self.flashFwe,env:{warn:m=>soc.r?.warn(m)}};
   this.faciDev=new Faci(soc);this.faciDev.blankNoted=!!this.flashBlankNoted;
  }
  if(r)this.faciDev.soc.r=r;return this.faciDev;
 },
 flashState(ctrl,r,fn){
  if(ctrl===0)return null;
  if(!this.config.peripherals?.FLASH?.enabled)throw new Error(`${fn}: Stacks에서 g_flash0 (r_flash_hp)을 추가하세요.`);
  const st=this.instance(ctrl,r,fn,'flash');st.op??=OP.NON_BGO;st.callback??='';return st;
 },
 // ---- the two interrupts (ICU IELSR status flag and NVIC enable, as R_BSP_IrqEnable / IrqDisable / IrqStatusClear use them)
 flashEvent(r,ev){const st=this.states.get('g_flash0_ctrl');if(!st)return;const k=ev===FCU_EVENT.FRDYI?'frdy':'err';st[k+'Pend']=true;this.flashDeliver(r,st,k);},
 flashDeliver(r,st,k){
  if(!st[k+'En']||!st[k+'Pend'])return;
  if(k==='frdy')this.queue(r,'FCU_FRDYI',st.ipl,()=>this.flashFrdyiIsr(r,st),'fcu_frdyi_isr','FCU:frdy');
  else this.queue(r,'FCU_FIFERR',st.errIpl,()=>this.flashFiferrIsr(r,st),'fcu_fiferr_isr','FCU:err');
 },
 flashIrqEnable(r,st,k,clear=true){if(clear){st[k+'Pend']=false;this.dropJobs('FCU:'+k);}st[k+'En']=true;this.flashDeliver(r,st,k);},
 flashIrqDisable(st,k){st[k+'En']=false;this.dropJobs('FCU:'+k);},
 // ---- r_flash_hp.c private functions
 *flashReady(r){
  const dev=this.flashDev(r);
  for(let us=dev.busyUs();us>0;us=dev.busyUs()){if(r.atomic){dev.op.until=r.microTime;continue;}yield Math.max(.001,us/1000);}
 },
 // flash_hp_init: FWEPROR, the FCLK check, FPCKAR.
 flashInit(r,st){
  st.op=OP.NON_BGO;this.flashFwe=true;const fclk=raClockHz(this.config,'fclk');
  if(fclk<4e6)return E.FCLK;
  this.flashDev(r).write(FACI.FPCKAR,0x1e00+Math.ceil(fclk/1e6),2);return E.SUCCESS;
 },
 // flash_hp_enter_pe_df_mode
 flashEnterPe(r,st){
  if(st.bgo){this.flashIrqEnable(r,st,'frdy');this.flashIrqEnable(r,st,'err');}
  const dev=this.flashDev(r);dev.write(FACI.FENTRYR,0xaa80,2);return dev.read(FACI.FENTRYR,2)===0x80?E.SUCCESS:E.PE_FAILURE;
 },
 // flash_hp_pe_mode_exit
 flashExitPe(r){const dev=this.flashDev(r);dev.write(FACI.FENTRYR,0xaa00,2);return dev.read(FACI.FENTRYR,2)===0?E.SUCCESS:E.PE_FAILURE;},
 // flash_hp_stop / flash_hp_status_clear
 *flashCommand(r,byte){const dev=this.flashDev(r);dev.command(byte,1);yield* this.flashReady(r);return dev.read(FACI.FASTAT,1)&FASTAT_CMDLK?E.CMD_LOCKED:E.SUCCESS;},
 // flash_hp_check_errors
 *flashCheckErrors(r,previous,bits,failed){
  const dev=this.flashDev(r);let err=E.SUCCESS;
  if(dev.read(FACI.FASTAT,1)&FASTAT_CMDLK){
   if(dev.read(FACI.FSTATR,4)&FSTATR.ILGLERR){dev.read(FACI.FASTAT,1);dev.write(FACI.FASTAT,0,1);}
   err=E.CMD_LOCKED;
  }
  if(dev.read(FACI.FSTATR,4)&bits)err=failed;
  if(previous!==E.SUCCESS)err=previous;
  if(err!==E.SUCCESS)yield* this.flashCommand(r,0xb3);
  return err;
 },
 // flash_hp_write_data (BSP_FEATURE_FLASH_HP_DF_WRITE_SIZE 4: two 16-bit words a command)
 *flashWriteData(r,st,wait){
  const dev=this.flashDev(r);
  if(!wait)this.flashIrqDisable(st,'frdy');
  dev.write(FACI.FSADDR,st.dest,4);dev.command(0xe8,1);dev.command(RA_DF_UNIT/2,1);
  for(let i=0;i<RA_DF_UNIT/2;i++){dev.command(st.data[st.at]|(st.data[st.at+1]<<8),2);st.at+=2;st.dest+=2;st.remaining--;}
  dev.command(0xd0,1);
  if(wait)yield* this.flashReady(r);else this.flashIrqEnable(r,st,'frdy',false);
  return E.SUCCESS;
 },
 // flash_hp_erase_block
 *flashEraseBlock(r,st,wait){
  const dev=this.flashDev(r);dev.write(FACI.FSADDR,st.src,4);dev.command(0x20,1);dev.command(0xd0,1);
  st.src+=RA_DF_BLOCK;st.remaining--;if(wait)yield* this.flashReady(r);return E.SUCCESS;
 },
 // flash_hp_reset
 *flashReset(r,st){
  if(st.bgo){this.flashIrqDisable(st,'frdy');this.flashIrqDisable(st,'err');}
  if(this.flashDev(r).read(FACI.FENTRYR,2)===0)this.flashEnterPe(r,st);
  let err=yield* this.flashCommand(r,0xb3);
  let other=yield* this.flashCommand(r,0x50);if(err===E.SUCCESS)err=other;
  other=this.flashExitPe(r);if(err===E.SUCCESS)err=other;
  st.op=OP.NON_BGO;return err;
 },
 // r_flash_hp_common_parameter_checking
 flashCommon(r,st){
  if(!st)return E.ASSERTION;if(!st.open)return E.NOT_OPEN;
  return this.flashDev(r).read(FACI.FENTRYR,2)&0x81?E.IN_USE:E.SUCCESS;
 },
 // r_flash_hp_write_bc_parameter_checking
 flashCheck(r,st,address,bytes,write,fn){
  const err=this.flashCommon(r,st);if(err)return err;
  if(st.bgo&&!st.callback)return E.ASSERTION;
  if(!(address>=RA_DF_BASE&&address<DF_END)){if(address<0x100000)this.warnOnce(r,'flash-cf',`${fn}: ${hex(address)}은(는) ${CODE_FLASH}`);return E.INVALID_ADDRESS;}
  if(address+bytes>DF_END)return E.INVALID_SIZE;
  if(write){if(address&(RA_DF_UNIT-1))return E.INVALID_ADDRESS;if(bytes&(RA_DF_UNIT-1))return E.INVALID_SIZE;}
  return bytes===0?E.INVALID_SIZE:E.SUCCESS;
 },
 // The bytes R_FLASH_HP_Write programs: the variable, array or structure `source` points at.
 flashSource(r,source,bytes,fn){
  if(typeof source==='number'){
   const at=(source>>>0)-RA_DF_BASE;if(at>=0&&at+bytes<=RA_DF_SIZE)return [...this.dataFlash.bytes.subarray(at,at+bytes)];
   throw new Error(`${fn}: 쓸 데이터(src_address)는 변수나 배열의 주소로 넘기세요 — (uint32_t) buffer, (uint32_t) &value.`);
  }
  try{return memoryBytes(r,source,bytes,fn);}
  catch(error){throw new Error(`${fn}: src_address에서 ${bytes}바이트를 읽을 수 없습니다 (${error.message}) — 그 길이의 배열이나 구조체의 주소를 넘기세요.`);}
 },
 // r_flash_hp_call_callback
 *flashCallback(r,st,event){
  if(!st.callback){this.warnOnce(r,'flash-nocb','[FLASH] BGO 인터럽트가 왔지만 콜백이 없습니다(p_callback NULL) — 실제 FSP는 여기서 NULL 함수를 불러 멈춥니다. Stacks의 g_flash0에 콜백 이름을 쓰거나 R_FLASH_HP_CallbackSet을 부르세요.');return;}
  yield* this.callback(r,st.callback,'flash_callback_args_t',{event,data:0,...this.contextField(st)});
 },
 // fcu_frdyi_isr
 *flashFrdyiIsr(r,st){
  st.frdyPend=false;let event=null;
  if(st.op===OP.WRITE){if(st.remaining)yield* this.flashWriteData(r,st,false);else event=EVENT.WRITE_COMPLETE;}
  else if(st.op===OP.ERASE){if(st.remaining)yield* this.flashEraseBlock(r,st,false);else event=EVENT.ERASE_COMPLETE;}
  // Blank check is a single operation (and what the driver takes any other flash-ready interrupt for).
  else event=this.flashDev(r).read(FACI.FBCSTAT,1)===1?EVENT.NOT_BLANK:EVENT.BLANK;
  if(event===null)return;
  this.flashExitPe(r);st.op=OP.NON_BGO;yield* this.flashCallback(r,st,event);
 },
 // fcu_fiferr_isr
 *flashFiferrIsr(r,st){
  const dev=this.flashDev(r),fastat=dev.read(FACI.FASTAT,1),errors=dev.read(FACI.FSTATR,4);
  const event=fastat&0x08?EVENT.ERR_DF_ACCESS:fastat&0x80?EVENT.ERR_CF_ACCESS:fastat&FASTAT_CMDLK&&!(errors&(FSTATR.PRGERR|FSTATR.ERSERR))?EVENT.ERR_CMD_LOCKED:EVENT.ERR_FAILURE;
  yield* this.flashReset(r,st);st.errPend=false;yield* this.flashCallback(r,st,event);
 },
 // ---- (type *) address: the data flash as the program reads it through a pointer (session.js → runtime cast).
 // The cells are read-only views of the contents, one array per element type; any other address is left to the runtime.
 memory(address,type,r){
  const at=(address>>>0)-RA_DF_BASE;if(!(at>=0&&at<RA_DF_SIZE))return null;
  const elem=type==='void'?'uint8_t':type,size=r.typeSize(elem),phase=at%size,key=elem+'@'+phase;
  this.flashViews??=new Map();
  if(!this.flashViews.has(key)){
   const self=this,owner={alive:true},cells=[];
   for(let o=phase;o+size<=RA_DF_SIZE;o+=size)cells.push({get value(){return self.flashRead(o,size,elem);},set value(v){void v;},owner,constant:true,readOnly:READ_ONLY,dataType:elem});
   this.flashViews.set(key,{kind:'array',cells});
  }
  return {kind:'pointer',array:this.flashViews.get(key),index:(at-phase)/size};
 },
 flashRead(at,size,type){
  const r=this.runtime,dev=this.flashDev(r);dev.dataRead(at,size);this.flashBlankNoted=!!dev.blankNoted;
  return bytesValue(r,[...this.dataFlash.bytes.subarray(at,at+size)],type,r.globals);
 },
 /** R_FLASH_HP_* by name: a generator (a call waits for the flash), or null for another name. */
 flashCall(name,args,r){
  if(Object.hasOwn(FLASH_API,name))return FLASH_API[name].call(this,args,r,name);
  if(Object.hasOwn(UNSUPPORTED,name)){const self=this;return (function*(){self.warnOnce(r,'flash:'+name,`${name}: ${UNSUPPORTED[name]} 기능은 이 빌드와 RA6E1에 없어 FSP_ERR_UNSUPPORTED를 돌려줍니다(실제 r_flash_hp.c도 같습니다).`);return E.UNSUPPORTED;})();}
  return null;
 }
};

const FLASH_API={
 *R_FLASH_HP_Open([ctrl,cfgPtr],r,fn){
  if(cfgPtr===0||ctrl===0)return E.ASSERTION;
  const st=this.flashState(ctrl,r,fn);if(st.open)return E.ALREADY_OPEN;
  const cfg=this.struct(cfgPtr,r,'flash_cfg_t',fn),f=k=>Number(cfg.fields[k].value),bgo=!!f('data_flash_bgo');
  // Background operation needs both interrupts.
  if(bgo&&(f('irq')<0||f('err_irq')<0))return E.IRQ_BSP_DISABLED;
  Object.assign(st,{bgo,irq:f('irq'),errIrq:f('err_irq'),ipl:f('ipl'),errIpl:f('err_ipl'),frdyEn:false,errEn:false,frdyPend:false,errPend:false});
  const dev=this.flashDev(r);
  // Only with BGO does Open take the callback and the context of the configuration.
  if(bgo){
   const context=cfg.fields.p_context.value;st.callback=this.inst.flash?.callback||'';st.context=context?.kind==='pointer'?context:null;
   dev.write(FACI.FRDYIE,1,1);this.flashIrqEnable(r,st,'frdy');dev.write(FACI.FAEINT,0x98,1);this.flashIrqEnable(r,st,'err');
  }else{dev.write(FACI.FRDYIE,0,1);dev.write(FACI.FAEINT,0,1);}
  const err=this.flashInit(r,st);if(err)return err;
  st.open=true;return E.SUCCESS;
 },
 *R_FLASH_HP_Close([ctrl],r,fn){
  const st=this.flashState(ctrl,r,fn);if(!st)return E.ASSERTION;if(!st.open)return E.NOT_OPEN;
  const dev=this.flashDev(r);st.open=false;
  if(st.irq>=0)this.flashIrqDisable(st,'frdy');dev.write(FACI.FRDYIE,0,1);
  if(st.errIrq>=0)this.flashIrqDisable(st,'err');dev.write(FACI.FAEINT,0,1);
  return E.SUCCESS;
 },
 *R_FLASH_HP_Write([ctrl,source,address,bytes],r,fn){
  const st=this.flashState(ctrl,r,fn);address=u32(address,fn,'flash_address');bytes=u32(bytes,fn,'num_bytes');
  let err=this.flashCheck(r,st,address,bytes,true,fn);if(err)return err;
  Object.assign(st,{data:this.flashSource(r,source,bytes,fn),at:0,remaining:bytes>>1,dest:address,op:OP.NON_BGO});
  // flash_hp_df_write
  err=this.flashEnterPe(r,st);if(err)return err;
  if(st.bgo)st.op=OP.WRITE;
  do{
   err=yield* this.flashWriteData(r,st,!st.bgo);
   if(st.bgo)return err; // the rest, and any error, from the interrupts
   err=yield* this.flashCheckErrors(r,err,FSTATR.PRGERR,E.WRITE_FAILED);
  }while(st.remaining&&err===E.SUCCESS);
  const exit=this.flashExitPe(r);return err===E.SUCCESS?exit:err;
 },
 *R_FLASH_HP_Erase([ctrl,address,blocks],r,fn){
  const st=this.flashState(ctrl,r,fn);let err=this.flashCommon(r,st);if(err)return err;
  if(st.bgo&&!st.callback)return E.ASSERTION;
  address=u32(address,fn,'address');blocks=u32(blocks,fn,'num_blocks');
  if(blocks===0)return E.INVALID_BLOCKS;
  st.op=OP.NON_BGO;const start=(address&~(RA_DF_BLOCK-1))>>>0;
  if(!(start>=RA_DF_BASE&&start<DF_END)){if(start<0x100000)this.warnOnce(r,'flash-cf',`${fn}: ${hex(address)}은(는) ${CODE_FLASH}`);return E.INVALID_ADDRESS;}
  if(start+blocks*RA_DF_BLOCK>DF_END)return E.INVALID_BLOCKS;
  // flash_hp_df_erase
  st.src=start;st.remaining=blocks;
  if(this.flashEnterPe(r,st))return E.PE_FAILURE;
  if(st.bgo)st.op=OP.ERASE;
  this.flashDev(r).write(FACI.FCPSR,1,2);
  do{
   err=yield* this.flashEraseBlock(r,st,!st.bgo);
   if(st.bgo)return err;
   err=yield* this.flashCheckErrors(r,err,FSTATR.ERSERR,E.ERASE_FAILED);
  }while(st.remaining&&err===E.SUCCESS);
  const exit=this.flashExitPe(r);return err===E.SUCCESS?exit:err;
 },
 *R_FLASH_HP_BlankCheck([ctrl,address,bytes,result],r,fn){
  const st=this.flashState(ctrl,r,fn);address=u32(address,fn,'address');bytes=u32(bytes,fn,'num_bytes');
  let err=this.flashCheck(r,st,address,bytes,false,fn);if(err)return err;
  if(result===0)return E.ASSERTION;
  // flash_hp_df_blank_check
  err=this.flashEnterPe(r,st);if(err)return err;
  const dev=this.flashDev(r);
  dev.write(FACI.FBCCNT,0,1);dev.write(FACI.FSADDR,address,4);dev.write(FACI.FEADDR,address+bytes-1,4);dev.command(0x71,1);dev.command(0xd0,1);
  if(st.bgo){st.op=OP.BLANKCHECK;this.out(result,r,2,fn);return E.SUCCESS;} // FLASH_RESULT_BGO_ACTIVE: the result comes with the callback
  yield* this.flashReady(r);
  err=yield* this.flashCheckErrors(r,E.SUCCESS,0,E.BLANK_CHECK_FAILED);
  this.out(result,r,dev.read(FACI.FBCSTAT,1)===1?1:0,fn);
  const exit=this.flashExitPe(r);return err===E.SUCCESS?exit:err;
 },
 *R_FLASH_HP_StatusGet([ctrl,status],r,fn){
  const st=this.flashState(ctrl,r,fn);if(!st||status===0)return E.ASSERTION;if(!st.open)return E.NOT_OPEN;
  this.out(status,r,this.flashDev(r).read(FACI.FENTRYR,2)&0x81?1:0,fn);return E.SUCCESS;
 },
 *R_FLASH_HP_InfoGet([ctrl,info],r,fn){
  const st=this.flashState(ctrl,r,fn);if(!st||info===0)return E.ASSERTION;if(!st.open)return E.NOT_OPEN;
  const v=this.struct(info,r,'flash_info_t',fn),owner=r.globals;
  const blocks=list=>({kind:'pointer',array:{kind:'array',cells:list.map(b=>{const value=r.defaultValue('flash_block_info_t',owner);for(const [k,x]of Object.entries(b))value.fields[k].value=x;return {value,owner,constant:true,dataType:'flash_block_info_t'};})},index:0});
  for(const [key,list]of [['code_flash',CODE_REGIONS],['data_flash',DATA_REGIONS]]){const region=r.get(v.fields[key]);this.setField(region,'num_regions',list.length,r);region.fields.p_block_array.value=blocks(list);}
  return E.SUCCESS;
 },
 *R_FLASH_HP_CallbackSet([ctrl,callback,context],r,fn){
  const st=this.flashState(ctrl,r,fn);if(!st||!callback)return E.ASSERTION;if(!st.open)return E.NOT_OPEN;
  st.callback=r.callback(callback).name;st.context=context?.kind==='pointer'?context:null;return E.SUCCESS;
 },
 *R_FLASH_HP_Reset([ctrl],r,fn){
  const st=this.flashState(ctrl,r,fn);if(!st)return E.ASSERTION;if(!st.open)return E.NOT_OPEN;
  return yield* this.flashReset(r,st);
 },
 *R_FLASH_HP_UpdateFlashClockFreq([ctrl],r,fn){
  const st=this.flashState(ctrl,r,fn),err=this.flashCommon(r,st);if(err)return err;
  return this.flashInit(r,st);
 }
};
/** Every R_FLASH_HP_* name the interpreter answers (the supported calls and the ones that return FSP_ERR_UNSUPPORTED). */
export const FLASH_NAMES=Object.freeze([...Object.keys(FLASH_API),...Object.keys(UNSUPPORTED)]);
