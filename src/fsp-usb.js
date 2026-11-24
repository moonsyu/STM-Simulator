// R_USB_* (r_usb_basic with r_usb_pcdc, peripheral mode, Full-Speed, bare metal) for the built-in interpreter (feature
// 41): FSP 6.6 r_usb_basic.c and the peripheral driver under it (r_usb_pdriver.c, r_usb_pstdrequest.c, r_usb_plibusbip.c,
// r_usb_preg_abs.c, r_usb_cdataio.c, r_usb_clibusbip.c, r_usb_creg_*.c, r_usb_pcdc_driver.c) function by function, in the
// configuration the app generates (r_usb_basic_cfg.h: USB_CFG_PARAM_CHECKING_ENABLE 1, DBLB on, no DMA/DTC, battery
// charging, compliance test or request notifications), on the emulator's USBFS model with its PC (src/emu/ra6e1/usbfs.js)
// — so the checks and their return codes, the order of the events R_USB_EventGet gives (one interrupt record handled and at
// most one event returned a call, the event queue of 10 and the interrupt queue of 8), the pipes and the bytes moved are
// the driver's, and both engines share one model of the hardware and of the host.
// The interrupt (usbfs_interrupt_handler → usb_pstd_interrupt_handler) runs at the USBI priority as an interrupt job;
// what it records is handled in R_USB_EventGet, where the callback (p_usb_apl_callback or R_USB_Callback) is called as
// usb_set_event calls it.
// Differences from the driver: the descriptors are FSP's template (r_usb_pcdc_descriptor.c.template, which the project's
// src/r_usb_pcdc_descriptor.c starts as; the interpreter does not read that file), and of the standard requests only the
// ones the PC sends (GET_DESCRIPTOR of the device and configuration, SET_CONFIGURATION; SET_ADDRESS is the hardware's) are
// answered — the others STALL here. R_USB_Write copies the bytes when it is called (the driver reads the buffer as packets
// go). The members of an event's usb_event_info_t that the driver leaves unset (an uninitialised local in the driver) are 0.
import {UsbFs} from './emu/ra6e1/usbfs.js';
import {memoryBytes,valueBytes,bytesValue,numberBytes} from './hal-stdio.js';

const enumOf=(tag,name,items)=>`typedef enum ${tag}\n{\n${items.map(([k,v])=>`    ${k} = ${v},`).join('\n')}\n} ${name};`;
const STATUS=['POWERED','DEFAULT','ADDRESS','CONFIGURED','SUSPEND','RESUME','DETACH','REQUEST','REQUEST_COMPLETE','READ_COMPLETE','WRITE_COMPLETE','BC','OVERCURRENT','NOT_SUPPORT','NONE','MSC_CMD_COMPLETE'];
const CLASSES=['PCDC','PCDCC','PCDC2','PCDCC2','PHID','PHID2','PAUD','PPRN','DFU','PUVC','PVND','HCDC','HCDCC','HHID','HVND','HMSC','PMSC','HPRN','HUVC','HAUD','REQUEST','HUB','END'];
/** r_usb_basic_api.h / r_usb_pcdc_api.h / r_usb_basic.h for the interpreter's stand-in headers (hal_data.h includes them with the stack). */
export const USB_TYPES=`${enumOf('e_usb_speed','usb_speed_t',[['USB_SPEED_LS',0],['USB_SPEED_FS',1],['USB_SPEED_HS',2]])}
${enumOf('e_usb_setup_status','usb_setup_status_t',[['USB_SETUP_STATUS_ACK',0],['USB_SETUP_STATUS_STALL',1]])}
${enumOf('e_usb_status','usb_status_t',STATUS.map((k,i)=>['USB_STATUS_'+k,i]))}
${enumOf('e_usb_class','usb_class_t',CLASSES.map((k,i)=>['USB_CLASS_'+k,'0x'+(0x80+i).toString(16).toUpperCase()]))}
${enumOf('e_usb_transfer','usb_transfer_t',[['USB_TRANSFER_READ',0],['USB_TRANSFER_WRITE',1]])}
${enumOf('e_usb_mode','usb_mode_t',[['USB_MODE_HOST',1],['USB_MODE_PERI',2]])}
${enumOf('e_usb_onoff','usb_onoff_t',[['USB_OFF',0],['USB_ON',1]])}
#define FSP_ERR_USB_FAILED (1500)
#define FSP_ERR_USB_BUSY (1501)
#define FSP_ERR_USB_SIZE_SHORT (1502)
#define FSP_ERR_USB_SIZE_OVER (1503)
#define FSP_ERR_USB_NOT_OPEN (1504)
#define FSP_ERR_USB_NOT_SUSPEND (1505)
#define FSP_ERR_USB_PARAMETER (1506)
#define USB_BREQUEST (0xFF00U)
#define USB_GET_STATUS (0x0000U)
#define USB_CLEAR_FEATURE (0x0100U)
#define USB_SET_FEATURE (0x0300U)
#define USB_SET_ADDRESS (0x0500U)
#define USB_GET_DESCRIPTOR (0x0600U)
#define USB_SET_DESCRIPTOR (0x0700U)
#define USB_GET_CONFIGURATION (0x0800U)
#define USB_SET_CONFIGURATION (0x0900U)
#define USB_GET_INTERFACE (0x0A00U)
#define USB_SET_INTERFACE (0x0B00U)
#define USB_HOST_TO_DEV (0x0000U)
#define USB_DEV_TO_HOST (0x0080U)
#define USB_STANDARD (0x0000U)
#define USB_CLASS (0x0020U)
#define USB_VENDOR (0x0040U)
#define USB_DEVICE (0x0000U)
#define USB_INTERFACE (0x0001U)
#define USB_ENDPOINT (0x0002U)
#define USB_PCDC_SET_LINE_CODING (0x2000U)
#define USB_PCDC_GET_LINE_CODING (0x2100U)
#define USB_PCDC_SET_CONTROL_LINE_STATE (0x2200U)
#define USB_PCDC_SERIAL_STATE (0x20)
#define USB_PCDC_SETUP_TBL_BSIZE (10U)
typedef struct st_usb_descriptor { uint8_t * p_device; uint8_t * p_config_f; uint8_t * p_config_h; uint8_t * p_qualifier; void * p_string; uint8_t num_string; } usb_descriptor_t;
typedef struct st_usb_setup { uint16_t request_type; uint16_t request_value; uint16_t request_index; uint16_t request_length; } usb_setup_t;
typedef struct st_usb_info { uint8_t class_type; uint8_t speed; uint8_t device_status; uint8_t bcport; } usb_info_t;
typedef struct st_usb_event_info { uint8_t module_number; uint8_t device_address; uint8_t pipe; usb_class_t type; uint16_t status; usb_status_t event; uint32_t data_size; usb_setup_t setup; void * p_data; void * p_context; const transfer_instance_t * p_transfer_tx; const transfer_instance_t * p_transfer_rx; } usb_event_info_t;
typedef usb_event_info_t usb_instance_ctrl_t;
typedef usb_event_info_t usb_callback_args_t;
typedef struct st_usb_cfg { usb_mode_t usb_mode; usb_speed_t usb_speed; uint8_t module_number; usb_class_t type; usb_descriptor_t * p_usb_reg; void * usb_complience_cb; IRQn_Type irq; IRQn_Type irq_r; IRQn_Type irq_d0; IRQn_Type irq_d1; IRQn_Type hsirq; IRQn_Type hsirq_d0; IRQn_Type hsirq_d1; uint8_t ipl; uint8_t ipl_r; uint8_t ipl_d0; uint8_t ipl_d1; uint8_t hsipl; uint8_t hsipl_d0; uint8_t hsipl_d1; void (*p_usb_apl_callback)(usb_callback_args_t *); void * p_context; const transfer_instance_t * p_transfer_tx; const transfer_instance_t * p_transfer_rx; void * p_extend; } usb_cfg_t;
typedef struct st_usb_instance { usb_instance_ctrl_t * p_ctrl; const usb_cfg_t * p_cfg; void * p_api; } usb_instance_t;
typedef struct { uint32_t dw_dte_rate; uint8_t b_char_format; uint8_t b_parity_type; uint8_t b_data_bits; uint8_t rsv; } usb_pcdc_linecoding_t;
typedef struct { uint16_t bdtr; uint16_t brts; uint16_t rsv; } usb_pcdc_ctrllinestate_t;`;
/** g_basic0 of hal_data.c (and the descriptor g_usb_descriptor, which the interpreter does not read) for the stand-in header. */
export function usbPrelude(t,vec){
 return [...(t.callback?[`void ${t.callback}(usb_callback_args_t * p_args);`]:[]),'const usb_descriptor_t g_usb_descriptor = { NULL, NULL, NULL, NULL, NULL, 7 };','usb_instance_ctrl_t g_basic0_ctrl;',
  `const usb_cfg_t g_basic0_cfg = { .usb_mode = USB_MODE_PERI, .usb_speed = USB_SPEED_FS, .module_number = 0, .type = USB_CLASS_PCDC, .p_usb_reg = (usb_descriptor_t *) &g_usb_descriptor, .usb_complience_cb = NULL, .irq = ${vec('USBFS_INT')}, .irq_r = ${vec('USBFS_RESUME')}, .irq_d0 = FSP_INVALID_VECTOR, .irq_d1 = FSP_INVALID_VECTOR, .hsirq = FSP_INVALID_VECTOR, .hsirq_d0 = FSP_INVALID_VECTOR, .hsirq_d1 = FSP_INVALID_VECTOR, .ipl = (${t.priority}), .ipl_r = (${t.resumePriority}), .ipl_d0 = (BSP_IRQ_DISABLED), .ipl_d1 = (BSP_IRQ_DISABLED), .hsipl = (BSP_IRQ_DISABLED), .hsipl_d0 = (BSP_IRQ_DISABLED), .hsipl_d1 = (BSP_IRQ_DISABLED), .p_usb_apl_callback = ${t.callback||'NULL'}, .p_context = NULL, .p_transfer_tx = NULL, .p_transfer_rx = NULL, .p_extend = NULL };`,
  'const usb_instance_t g_basic0 = { .p_ctrl = &g_basic0_ctrl, .p_cfg = &g_basic0_cfg, .p_api = NULL };'];
}

// FSP's r_usb_pcdc_descriptor.c.template: the device and the Full-Speed configuration descriptor (bDescriptorType of the
// configuration is USB_SOFT_CHANGE, 0, until the driver's bus reset writes 2 there).
const DEVICE=[18,1,0x00,0x02,0x02,0x02,0,64,0x00,0x00,0x02,0x00,0x00,0x02,1,2,6,1];
const CONFIGURATION=[9,0,67,0,2,1,0,0xc0,5, 9,4,0,0,1,0x02,0x02,1,0, 5,0x24,0,0x10,0x01, 4,0x24,2,2, 5,0x24,6,0,1, 5,0x24,1,3,1, 7,5,0x83,3,16,0,0x10,
 9,4,1,0,2,0x0a,0,0,0, 7,5,0x81,2,64,0,0, 7,5,0x02,2,64,0,0];

const E={SUCCESS:0,ASSERTION:1,FAILED:1500,BUSY:1501,SIZE_SHORT:1502,SIZE_OVER:1503,NOT_OPEN:1504,PARAMETER:1506};
const EV=Object.fromEntries(STATUS.map((k,i)=>[k,i]));
const CLS=Object.fromEntries(CLASSES.map((k,i)=>[k,0x80+i]));
// usb_class_internal_t (the class without its 0x80) and the driver's result codes (usb_er_t, the utr status).
const IN={PCDC:0,PCDCC:1,PCDC2:2,PCDCC2:3,PVND:10,HCDCC:12,HVND:14,HMSC:15,PMSC:16};
const OK=0,ERROR=0xff,QOVR=0xd5;
const DATA={NONE:1,OK:3,SHT:4,OVR:5,STALL:6,ERR:7,STOP:8,FIFO_ERR:21};
// USBFS register offsets (R7FA6E10F.h R_USB_FS0).
const SYSCFG=0x00,SYSSTS0=0x04,DVSTCTR0=0x08,CFIFO=0x14,CFIFOSEL=0x20,CFIFOCTR=0x22,D0FIFOSEL=0x28,D1FIFOSEL=0x2c,INTENB0=0x30,BRDYENB=0x36,NRDYENB=0x38,BEMPENB=0x3a,INTSTS0=0x40,BRDYSTS=0x46,NRDYSTS=0x48,BEMPSTS=0x4a,
 USBREQ=0x54,USBVAL=0x56,USBINDX=0x58,USBLENG=0x5a,DCPCFG=0x5c,DCPMAXP=0x5e,DCPCTR=0x60,PIPESEL=0x64,PIPECFG=0x68,PIPEMAXP=0x6c,PIPEPERI=0x6e,DPUSR0R_FS=0x400;
// PIPEnCTR as the driver addresses it: &PIPE_CTR[0] + (pipe - 1), DCPCTR for pipe 0 where the function says so.
const ctrRaw=p=>0x70+(p-1)*2,ctr=p=>p===0?DCPCTR:ctrRaw(p),tre=p=>0x90+(p-1)*4,trn=p=>0x92+(p-1)*4;

/** Methods of FspAdapter (fsp-interp.js) for R_USB_*. */
export const USB_METHODS={
 // The USBFS model and its PC, with the interpreter's clock and interrupt queue behind them; module stop (MSTPCRB b11) is
 // the adapter's `usbStopped`.
 usbDev(r){
  if(!this.usbFs){
   const self=this,soc={r,mstp:{peek:()=>self.usbStopped===false?0:1<<11},nowUs:()=>soc.r?.microTime??0,
    after:(us,fn)=>{soc.r.event((soc.r.microTime+us)/1000,fn);return null;},raiseEvent:()=>self.usbRaise(soc.r)};
   this.usbFs=new UsbFs(soc);if(this.usbKeep)this.usbFs.host.output=this.usbKeep;
  }
  if(r)this.usbFs.soc.r=r;return this.usbFs;
 },
 usbR(r,off){return this.usbDev(r).read(off,2);},
 usbW(r,off,v){this.usbDev(r).write(off,v&0xffff,2);},
 usbRmw(r,off,and,or=0){this.usbW(r,off,(this.usbR(r,off)&and)|or);},
 // The driver's globals (r_usb_basic.c, r_usb_pdriver.c, r_usb_cdataio.c …), as R_USB_Open finds them at reset.
 usbDrv(){
  if(!this.usbD)this.usbD={init:false,mode:0,openClass:0,callback:'',event:{code:Array(10).fill(EV.NONE),ctrl:Array(10).fill(null),wp:0,rp:0},int:{buf:Array.from({length:8},()=>({type:0,status:0})),wp:0,rp:0},
   pdata:Array.from({length:10},()=>({})),pipeUtr:Array(10).fill(null),dataCnt:Array(10).fill(0),data:Array(10).fill(null),bempSkip:Array(10).fill(0),pipeTable:Array.from({length:10},()=>({use:0,cfg:0,maxp:0,peri:0})),
   pipePeri:Array(20).fill(0),bulkIn:0,bulkOut:0,intIn:0,configNum:0,req:{type:0,value:0,index:0,length:0},pipe0Request:0,stdRequest:0,connected:0,configtbl:null,devicetbl:null,irqOn:false,ipl:12};
  return this.usbD;
 },
 // usbfs_interrupt_handler: an interrupt job at the USBI priority while the request stands (a level, usbfs.js).
 usbRaise(r){const d=this.usbDrv();if(d.irqOn)this.queue(r,'USBFS_INT',d.ipl,()=>this.usbIsr(r),'usbfs_interrupt_handler','USBFS:int');},
 // usb_pstd_usb_handler → usb_pstd_interrupt_handler: one cause a call, recorded for the task.
 usbIsr(r){
  const d=this.usbDrv(),q=d.int,R=off=>this.usbR(r,off),W=(off,v)=>this.usbW(r,off,v);
  const intsts0=R(INTSTS0),brdysts=R(BRDYSTS),nrdysts=R(NRDYSTS),bempsts=R(BEMPSTS),intenb0=R(INTENB0),brdyenb=R(BRDYENB),nrdyenb=R(NRDYENB),bempenb=R(BEMPENB);
  const rec=q.buf[q.wp];rec.type=0;rec.status=0;
  const ists0=intsts0&intenb0,bsts=brdysts&brdyenb,nsts=nrdysts&nrdyenb,ests=bempsts&bempenb;
  if(!(0xff00&intsts0)){q.wp=(q.wp+1)%8;return;}
  if(ists0&0x4000){W(INTSTS0,~0x4000);rec.type=0x12;}
  else if(ists0&0x8000){W(INTSTS0,~0x8000);rec.type=0x11;}
  else if(ists0&0x2000){W(INTSTS0,~0x2000);rec.type=0x13;}
  else if(ists0&0x1000){W(INTSTS0,~0x1000);rec.type=0x14;rec.status=intsts0;}
  else if(ists0&0x0100&&bsts&1){W(BRDYSTS,~1&0x3ff);rec.type=1;rec.status=1;}
  else if(ists0&0x0400&&ests&1){W(BEMPSTS,~1&0x3ff);rec.type=2;rec.status=1;}
  else if(ists0&0x0200&&nsts&1){W(NRDYSTS,~1&0x3ff);rec.type=3;rec.status=1;}
  else if(ists0&0x0800){rec.status=R(INTSTS0);W(INTSTS0,~0x0800);rec.type=0x15;if((rec.status&7)===6){W(INTSTS0,~0x0008);rec.type=0;rec.status=0;}}
  else if(ists0&0x0100){W(BRDYSTS,~bsts&0x3ff);rec.type=1;rec.status=bsts;}
  else if(ists0&0x0400){W(BEMPSTS,~ests&0x3ff);rec.type=2;rec.status=ests;}
  else if(ists0&0x0200){W(NRDYSTS,~nsts&0x3ff);rec.type=3;rec.status=nsts;}
  q.wp=(q.wp+1)%8;
 },
 // ---- register helpers (r_usb_creg_access.c, r_usb_creg_abs.c, r_usb_preg_access.c)
 usbSetPid(r,p,v){const o=ctr(p);this.usbRmw(r,o,~3);this.usbRmw(r,o,0xffff,v);},
 usbClearPid(r,p,v){this.usbRmw(r,ctr(p),~v);},
 usbSetNak(r,p){this.usbClearPid(r,p,1);this.usbR(r,ctr(p));}, // PBUSY reads 0 at once
 usbSetBuf(r,p){if(p>9)return;this.usbSetPid(r,p,1);},
 usbClrStall(r,p){if(p>9)return;this.usbSetNak(r,p);this.usbClearPid(r,p,2);},
 usbEnb(r,off,p,on){if(on&&off===BEMPENB)this.usbDrv().bempSkip[p]=0;this.usbRmw(r,off,on?0xffff:~(1<<p),on?1<<p:0);},
 usbClearSts(r,off,p){this.usbW(r,off,~(1<<p)&0x3ff);},
 usbPid(r,p){return p>9?0:this.usbR(r,ctr(p))&3;},
 usbMaxp(r,p){if(p>9)return 0;if(p===0)return this.usbR(r,DCPMAXP)&0x7ff;this.usbW(r,PIPESEL,p);return this.usbR(r,PIPEMAXP)&0x7ff;},
 usbBufSize(r,p){if(p===0)return this.usbR(r,DCPCFG)&0x100?256:this.usbR(r,DCPMAXP)&0x7f;this.usbW(r,PIPESEL,p);return this.usbR(r,PIPEMAXP)&0x7ff;},
 usbPipeDir(r,p){if(p>9)return 0;this.usbW(r,PIPESEL,p);return this.usbR(r,PIPECFG)&0x10;},
 usbPipeType(r,p){if(p>9)return 0;this.usbW(r,PIPESEL,p);return this.usbR(r,PIPECFG)&0xc000;},
 usbChgCurpipe(r,p,port,isel){if(port!==0)return;do this.usbRmw(r,CFIFOSEL,~(0x8000|0x20|0xf),(0x8000|isel|p)&(0x8000|0x20|0xf));while((this.usbR(r,CFIFOSEL)&0x2f)!==(isel|p));},
 *usbIsSetFrdy(r,p,port,isel){
  this.usbChgCurpipe(r,p,port,isel);
  for(let i=0;i<100;i++){const b=this.usbR(r,CFIFOCTR);if(b&0x2000)return b;this.usbR(r,SYSCFG);this.usbR(r,SYSSTS0);yield .01;}
  return ERROR;
 },
 usbSetMbw(r,data){this.usbRmw(r,CFIFOSEL,~0x0c00);if(data)this.usbRmw(r,CFIFOSEL,0xffff,data);},
 usbDoAclrm(r,p){if(p>9)return;this.usbRmw(r,ctrRaw(p),0xffff,0x200);this.usbRmw(r,ctrRaw(p),~0x200);},
 usbSqclr(r,p){this.usbRmw(r,p===0?DCPCTR:ctrRaw(p),0xffff,0x100);},
 usbCsclr(r,p){this.usbRmw(r,ctrRaw(p),0xffff,0x2000);},
 usbSetTrn(r,p,n){this.usbRmw(r,tre(p),0xffff,0x100);this.usbW(r,trn(p),n);this.usbRmw(r,tre(p),0xffff,0x200);},
 usbClrTrn(r,p){this.usbRmw(r,tre(p),~0x200);this.usbRmw(r,tre(p),0xffff,0x100);},
 usbConfiguredNow(r){return (this.usbR(r,INTSTS0)&0x70)===0x30;},
 usbPortSpeed(r){return {3:0xc0,2:0x80,1:0x40}[this.usbR(r,DVSTCTR0)&7]??0;},
 // ---- FIFO data (usb_pstd_write_fifo / usb_pstd_read_fifo): the transfer's bytes, a JS array or the program's buffer.
 usbFifoWrite(r,p,count){
  const d=this.usbDrv(),src=d.data[p],dev=this.usbDev(r),bytes=src.bytes.slice(src.at,src.at+count);while(bytes.length<count)bytes.push(0);
  for(let i=0;i+1<count;i+=2)dev.write(CFIFO,bytes[i]|(bytes[i+1]<<8),2);
  if(count&1){this.usbSetMbw(r,0);dev.write(CFIFO,bytes[count-1],1);this.usbSetMbw(r,0x0400);}
  src.at+=count;
 },
 usbFifoRead(r,p,count){
  const d=this.usbDrv(),dst=d.data[p],dev=this.usbDev(r),bytes=[];
  for(let i=0;i+1<count;i+=2){const v=dev.read(CFIFO,2);bytes.push(v&0xff,v>>8);}
  if(count&1)bytes.push(dev.read(CFIFO,2)&0xff);
  this.usbStore(r,dst,bytes);dst.at+=count;
 },
 // The bytes the driver writes at the transfer's position in the program's buffer (any element type or a structure).
 usbStore(r,dst,bytes){
  if(!bytes.length)return;
  if(dst.bytes){bytes.forEach((b,i)=>{dst.bytes[dst.at+i]=b;});return;}
  const first=r.pointerCell(dst.ptr,0),value=r.get(first);
  if(value?.kind==='struct'){const size=r.typeSize(value.type),all=[];for(let i=0;all.length<dst.at+bytes.length;i++)all.push(...valueBytes(r,r.get(r.pointerCell(dst.ptr,i)),value.type,dst.fn));bytes.forEach((b,i)=>{all[dst.at+i]=b;});for(let i=0;i*size<all.length;i++){const cell=r.pointerCell(dst.ptr,i);r.set(cell,bytesValue(r,all.slice(i*size,(i+1)*size),value.type,cell.owner,dst.fn));}return;}
  const size=first.dataType==='pointer'?4:r.typeSize(first.dataType||'uint8_t');
  for(let k=0;k<bytes.length;){const pos=dst.at+k,i=Math.floor(pos/size),cell=r.pointerCell(dst.ptr,i),merged=numberBytes(Number(r.get(cell))>>>0,size,false);for(let j=pos%size;j<size&&k<bytes.length;j++,k++)merged[j]=bytes[k];r.set(cell,new DataView(new Uint8Array([...merged,0,0,0,0]).buffer).getUint32(0,true));}
 },
 // ---- usb_pstd_write_data / usb_pstd_read_data
 *usbWriteData(r,p){
  const d=this.usbDrv();
  const b=p===0?yield* this.usbIsSetFrdy(r,p,0,0x20):yield* this.usbIsSetFrdy(r,p,0,0);if(b===ERROR)return ERROR;
  const size=this.usbBufSize(r,p),mxps=this.usbMaxp(r,p);let count,end;
  if(d.dataCnt[p]<=size){count=d.dataCnt[p];end=count===0?1:count%mxps?1:p===0?2:0;}else{end=2;count=size;}
  const pid=this.usbPid(r,p);this.usbSetNak(r,p);
  this.usbFifoWrite(r,p,count);
  if(d.dataCnt[p]<size){d.dataCnt[p]=0;if(!(this.usbR(r,CFIFOCTR)&0x8000))this.usbRmw(r,CFIFOCTR,0xffff,0x8000);}else d.dataCnt[p]-=count;
  this.usbClearSts(r,BEMPSTS,p);if((pid&3)===1)this.usbSetBuf(r,p);
  return end;
 },
 *usbReadData(r,p){
  const d=this.usbDrv(),b=yield* this.usbIsSetFrdy(r,p,0,0);if(b===ERROR)return ERROR;
  const dtln=b&0xfff,mxps=this.usbMaxp(r,p);let count,end;
  if(d.dataCnt[p]<dtln){end=3;this.usbSetNak(r,p);count=d.dataCnt[p];d.dataCnt[p]=dtln;}
  else if(d.dataCnt[p]===dtln){count=dtln;if(p===0&&dtln%mxps===0)end=2;else{end=0;this.usbSetNak(r,p);}}
  else{count=dtln;end=2;if(count===0){end=1;this.usbSetNak(r,p);}if(count%mxps){end=1;this.usbSetNak(r,p);}}
  if(dtln===0)this.usbW(r,CFIFOCTR,0x4000);else this.usbFifoRead(r,p,count);
  d.dataCnt[p]-=count;return end;
 },
 *usbFifoToBuf(r,p){
  if(p>9)return;const end=yield* this.usbReadData(r,p);
  if(end===2)return;if(end===0)yield* this.usbDataEnd(r,p,DATA.OK);else if(end===1)yield* this.usbDataEnd(r,p,DATA.SHT);
  else if(end===3)yield* this.usbForced(r,p,DATA.OVR);else if(end===ERROR)yield* this.usbForced(r,p,DATA.FIFO_ERR);else yield* this.usbForced(r,p,DATA.ERR);
 },
 *usbBufToFifo(r,p){
  if(p>9)return;this.usbEnb(r,BRDYENB,p,false);const end=yield* this.usbWriteData(r,p);
  if(end===2){this.usbEnb(r,BRDYENB,p,true);this.usbEnb(r,NRDYENB,p,true);}
  else if(end===0||end===1){this.usbEnb(r,BEMPENB,p,true);this.usbEnb(r,NRDYENB,p,true);}
  else if(end===ERROR)yield* this.usbForced(r,p,DATA.FIFO_ERR);else yield* this.usbForced(r,p,DATA.ERR);
 },
 // ---- transfers (usb_pstd_transfer_start / end, send / receive start, data end, forced termination)
 *usbTransferStart(r,u){
  const d=this.usbDrv(),p=u.keyword;if(p===0)return ERROR;
  if(d.pipeUtr[p]&&this.usbPipeType(r,p)!==0xc000)return QOVR;
  if(!this.usbConfiguredNow(r))return ERROR;
  d.pipeUtr[p]=u;
  if(this.usbConfiguredNow(r)){if(this.usbPipeDir(r,p)===0)this.usbReceiveStart(r,p);else yield* this.usbSendStart(r,p);}
  else yield* this.usbForced(r,p,DATA.ERR);
  return OK;
 },
 *usbTransferEnd(r,p){const d=this.usbDrv();if(p>9)return ERROR;if(!d.pipeUtr[p])return ERROR;yield* this.usbForced(r,p,DATA.STOP);return OK;},
 *usbSendStart(r,p){
  const d=this.usbDrv(),u=d.pipeUtr[p];this.usbSetNak(r,p);d.dataCnt[p]=u.tranlen;d.data[p]=u.tranadr;
  this.usbClearSts(r,BEMPSTS,p);this.usbClearSts(r,BRDYSTS,p);
  yield* this.usbBufToFifo(r,p);this.usbSetBuf(r,p);
 },
 usbReceiveStart(r,p){
  const d=this.usbDrv(),u=d.pipeUtr[p],length=u.tranlen;this.usbSetNak(r,p);d.dataCnt[p]=length;d.data[p]=u.tranadr;
  this.usbChgCurpipe(r,p,0,0);const mxps=this.usbMaxp(r,p);
  if(length)this.usbSetTrn(r,p,length%mxps?Math.floor(length/mxps)+1:length/mxps);
  this.usbSetBuf(r,p);this.usbEnb(r,BRDYENB,p,true);this.usbEnb(r,NRDYENB,p,true);
 },
 *usbDataEnd(r,p,status){
  const d=this.usbDrv();if(p>9)return;this.usbSetNak(r,p);
  for(const off of [BRDYENB,NRDYENB,BEMPENB])this.usbEnb(r,off,p,false);this.usbClrTrn(r,p);
  const u=d.pipeUtr[p];if(!u)return;
  u.tranlen=d.dataCnt[p];u.status=status;u.pipectr=this.usbR(r,ctr(p));u.keyword=p;yield* this.usbComplete(r,u);d.pipeUtr[p]=null;
 },
 *usbForced(r,p,status){
  const d=this.usbDrv();this.usbSetNak(r,p);for(const off of [BRDYENB,NRDYENB,BEMPENB])this.usbEnb(r,off,p,false);this.usbClrTrn(r,p);
  if((this.usbR(r,CFIFOSEL)&0xf)===p)this.usbChgCurpipe(r,0,0,0);
  this.usbDoAclrm(r,p);this.usbCsclr(r,p);
  const u=d.pipeUtr[p];if(!u)return;
  u.tranlen=d.dataCnt[p];u.status=status;u.pipectr=this.usbR(r,ctr(p));if(u.complete)yield* this.usbComplete(r,u);d.pipeUtr[p]=null;
 },
 // usb_pcdc_read_complete / usb_pcdc_write_complete
 *usbComplete(r,m){
  const d=this.usbDrv();if(!d.connected)return;
  if(m.complete==='read'){const status=m.status===DATA.OK?E.SUCCESS:m.status===DATA.SHT?E.SIZE_SHORT:m.status===DATA.OVR?E.SIZE_OVER:E.FAILED;yield* this.usbEvent(r,EV.READ_COMPLETE,{data_size:(m.readReqLen-m.tranlen)>>>0,pipe:m.keyword&0xff,type:CLS.PCDC,status,module_number:0});}
  else yield* this.usbEvent(r,EV.WRITE_COMPLETE,{pipe:m.keyword&0xff,type:d.bulkIn===m.keyword?CLS.PCDC:CLS.PCDCC,status:m.status===DATA.NONE?E.SUCCESS:E.FAILED,module_number:0});
 },
 // usb_set_event: into the queue of 10 (an overrun overwrites), and to the callback at once when there is one.
 *usbEvent(r,event,ctrl){
  const d=this.usbDrv(),q=d.event;q.code[q.wp]=event;q.ctrl[q.wp]={...ctrl};q.wp=(q.wp+1)%10;
  // (usb_callback_args_t is usb_event_info_t: the structure is made by that name.)
  if(d.callback){const args={...ctrl,event};yield* this.callback(r,d.callback,'usb_event_info_t',this.usbFields(r,args));}
 },
 // A usb_event_info_t value's members from the driver's record (setup as its own structure).
 usbFields(r,c){const f={module_number:c.module_number??0,device_address:c.device_address??0,pipe:c.pipe??0,type:c.type??0,status:c.status??0,event:c.event??0,data_size:c.data_size??0};
  const setup=r.defaultValue('usb_setup_t',r.globals),s=c.setup||{};for(const [k,v]of [['request_type',s.type],['request_value',s.value],['request_index',s.index],['request_length',s.length]])setup.fields[k].value=v??0;f.setup=setup;return f;},
 // ---- usb_pstd_pcd_task / usb_pstd_interrupt
 *usbTask(r){const q=this.usbDrv().int;if(q.wp===q.rp)return;const {type,status}=q.buf[q.rp];yield* this.usbInterrupt(r,type,status);q.rp=(q.rp+1)%8;},
 *usbInterrupt(r,type,status){
  const d=this.usbDrv();
  switch(type){
   case 1:return yield* this.usbBrdyPipe(r,status);
   case 2:return yield* this.usbBempPipe(r,status);
   case 3:return; // NRDY: the model raises none (and the driver acts only on isochronous pipes)
   case 0x12:yield* this.usbEvent(r,EV.RESUME,{module_number:0});this.usbW(r,INTSTS0,~0x4000);this.usbRmw(r,INTENB0,~0x4000);return;
   case 0x11:if((yield* this.usbVbsts(r))===0x40){yield 10;this.usbRmw(r,SYSCFG,0xffff,0x10);}else yield* this.usbDetachProcess(r);return;
   case 0x14:if((status&0x70)===0x10)yield* this.usbBusReset(r);return; // Default; suspend (0x40-0x70) is not modelled
   case 0x15:{
    const stg=status&7;
    if(stg===1||stg===3||stg===5){this.usbW(r,INTSTS0,~0x0008);d.req={type:this.usbR(r,USBREQ),value:this.usbR(r,USBVAL),index:this.usbR(r,USBINDX),length:this.usbR(r,USBLENG)};}
    if((d.req.type&0x60)===0){
     if(stg===0){d.pipe0Request=0;d.stdRequest=0;yield* this.usbStandReq0(r);}
     else if(stg===1)yield* this.usbStandReq1(r);
     else if(stg===3)this.usbSetPid(r,0,2); // usb_pstd_stand_req2: SET_DESCRIPTOR and the rest STALL
     else if(stg===5)yield* this.usbStandReq35(r,5);
     else if(stg===2||stg===4)yield* this.usbStandReq35(r,stg);
     else this.usbCtrlEnd(r,7);
    }else yield* this.usbClassRequest(r,{...d.req},stg);
    return;
   }
   default:return;
  }
 },
 *usbVbsts(r){let a,b,c;do{a=this.usbR(r,INTSTS0);yield .01;b=this.usbR(r,INTSTS0);yield .01;c=this.usbR(r,INTSTS0);}while((a&0x80)!==(b&0x80)||(b&0x80)!==(c&0x80));return a&0x80?0x40:0x43;},
 *usbDetachProcess(r){
  const d=this.usbDrv();this.usbRmw(r,SYSCFG,~0x10);d.configNum=0;
  for(let i=1;i<=9;i++)if(d.pipeTable[i].use){yield* this.usbForced(r,i,DATA.STOP);this.usbClrPipeCnfg(r,i);}
  yield* this.usbPeriDetach(r);
 },
 *usbPeriDetach(r){const d=this.usbDrv();if(d.connected){d.connected=0;yield* this.usbEvent(r,EV.DETACH,{module_number:0});}},
 // usb_pstd_bus_reset → usb_peri_devdefault: the pipes from the configuration descriptor, then USB_STATUS_DEFAULT.
 *usbBusReset(r){
  const d=this.usbDrv();d.configNum=0;const speed=this.usbPortSpeed(r);
  yield* this.usbPeriDetach(r);
  const table=d.configtbl;table[1]=2;const len=table[2]|(table[3]<<8);
  this.usbClrPipeTable();
  let cls=0;for(let at=table[0];at<len;at+=table[at]){if(table[at+1]===4)cls=table[at+5];if(table[at+1]===5)this.usbSetPipeTable(table.slice(at,at+7),cls);if(!table[at])break;}
  yield* this.usbEvent(r,EV.DEFAULT,{module_number:0});
  void speed;this.usbW(r,DCPCFG,0);this.usbW(r,DCPMAXP,d.devicetbl[7]);
 },
 usbClrPipeTable(){const d=this.usbDrv();for(let i=1;i<=9;i++)d.pipeTable[i]={use:0,cfg:0,maxp:0,peri:0};d.bulkIn=d.bulkOut=d.intIn=0;},
 // usb_pstd_set_pipe_table / usb_pstd_get_pipe_no (CDC data interface: bulk on pipes 1-5; CDC control: interrupt IN on 6-9)
 usbSetPipeTable(desc,cls){
  const d=this.usbDrv(),type=desc[3]&3,inDir=!!(desc[2]&0x80);let cfg;
  if(type===2)cfg=inDir?0x4000|0x0200|0x0010:0x4000|0x0200|0x0080;else if(type===3)cfg=inDir?0x8000|0x0010:0x8000;else if(type===1)cfg=inDir?0xc000|0x0200|0x0010:0xc000|0x0200|0x0080;else return 0;
  let pipe=0;
  if(cls===0x0a&&type===2){for(pipe=1;pipe<=5;pipe++)if(!d.pipeTable[pipe].use){if(inDir){if(!d.bulkIn){d.bulkIn=pipe;d.pipePeri[1]=pipe;break;}}else if(!d.bulkOut){d.bulkOut=pipe;d.pipePeri[0]=pipe;break;}}}
  if(cls===0x02&&type===3&&inDir){for(pipe=6;pipe<=9;pipe++)if(!d.pipeTable[pipe].use&&!d.intIn){d.intIn=pipe;d.pipePeri[IN.PCDCC*2+1]=pipe;break;}}
  if(!(cls===0x0a&&type===2)&&!(cls===0x02&&type===3&&inDir))pipe=0;
  if(pipe>9)pipe=0;
  if(pipe&&d.pipeTable[pipe].use!==1)d.pipeTable[pipe]={use:1,cfg:cfg|(desc[2]&0x0f),maxp:desc[4]|(desc[5]<<8),peri:0};else pipe=0;
  return pipe;
 },
 usbPipeInit(r,p){
  const d=this.usbDrv(),t=d.pipeTable[p];d.pipeUtr[p]=null;for(const off of [BRDYENB,NRDYENB,BEMPENB])this.usbEnb(r,off,p,false);this.usbClrStall(r,p);
  this.usbW(r,PIPESEL,p);this.usbW(r,PIPECFG,t.cfg);this.usbW(r,PIPEMAXP,t.maxp);this.usbW(r,PIPEPERI,t.peri);this.usbW(r,PIPESEL,0);
  this.usbSqclr(r,p);this.usbDoAclrm(r,p);this.usbCsclr(r,p);for(const off of [BRDYSTS,NRDYSTS,BEMPSTS])this.usbClearSts(r,off,p);
 },
 usbClrPipeCnfg(r,p){
  const d=this.usbDrv();d.pipeUtr[p]=null;this.usbClrStall(r,p);for(const off of [BRDYENB,NRDYENB,BEMPENB])this.usbEnb(r,off,p,false);this.usbChgCurpipe(r,0,0,0);
  this.usbW(r,PIPESEL,p);this.usbW(r,PIPECFG,0);this.usbW(r,PIPEMAXP,0);this.usbW(r,PIPEPERI,0);this.usbW(r,PIPESEL,0);
  this.usbSqclr(r,p);this.usbDoAclrm(r,p);this.usbCsclr(r,p);this.usbClrTrn(r,p);for(const off of [BRDYSTS,NRDYSTS,BEMPSTS])this.usbClearSts(r,off,p);
 },
 // ---- control transfers (r_usb_pcontrolrw.c)
 *usbCtrlRead(r,size,src){
  const d=this.usbDrv();d.pipe0Request=1;d.dataCnt[0]=size;d.data[0]=src;
  this.usbChgCurpipe(r,0,0,0x20);this.usbW(r,CFIFOCTR,0x4000);this.usbClearSts(r,BEMPSTS,0);
  const end=yield* this.usbWriteData(r,0);
  if(end===1){this.usbEnb(r,NRDYENB,0,true);this.usbSetBuf(r,0);}
  else if(end===0||end===2){this.usbEnb(r,BEMPENB,0,true);this.usbEnb(r,NRDYENB,0,true);this.usbSetBuf(r,0);}
  return end;
 },
 usbCtrlWrite(r,size,dst){
  const d=this.usbDrv();d.pipe0Request=1;d.dataCnt[0]=size;d.data[0]=dst;
  this.usbChgCurpipe(r,0,0,0);this.usbW(r,CFIFOCTR,0x4000);this.usbEnb(r,BRDYENB,0,true);this.usbEnb(r,NRDYENB,0,true);this.usbSetBuf(r,0);
 },
 usbCtrlEnd(r,status){
  const d=this.usbDrv();d.pipe0Request=0;d.stdRequest=0;for(const off of [BEMPENB,BRDYENB,NRDYENB])this.usbEnb(r,off,0,false);this.usbSetMbw(r,0x0400);
  if(status===7||status===5)this.usbSetPid(r,0,2);else if(status===8)this.usbSetNak(r,0);else this.usbRmw(r,DCPCTR,0xffff,0x0004);
 },
 *usbBrdyPipe(r,bits){
  if(bits&1){
   const end=yield* this.usbReadData(r,0);
   if(end===0||end===1)this.usbEnb(r,BRDYENB,0,false);else if(end===2)this.usbSetBuf(r,0);else if(end===3){this.usbW(r,CFIFOCTR,0x4000);this.usbCtrlEnd(r,5);}else if(end===ERROR)this.usbCtrlEnd(r,7);
   return;
  }
  const d=this.usbDrv();
  for(let i=1;i<=9;i++)if(bits&(1<<i)){this.usbClearSts(r,BEMPSTS,i);if(d.pipeUtr[i]){if(this.usbPipeDir(r,i)===0x10)yield* this.usbBufToFifo(r,i);else yield* this.usbFifoToBuf(r,i);}}
 },
 *usbBempPipe(r,bits){
  if(bits&1){
   const end=yield* this.usbWriteData(r,0);
   if(end===0||end===1)this.usbEnb(r,BEMPENB,0,false);else if(end===2)this.usbSetBuf(r,0);else if(end===ERROR)this.usbCtrlEnd(r,7);
   return;
  }
  const d=this.usbDrv();
  for(let i=1;i<=5;i++)if(bits&(1<<i)&&d.pipeUtr[i]&&d.bempSkip[i]!==1){
   if(this.usbPid(r,i)&2)yield* this.usbForced(r,i,DATA.STALL);
   else if(!(this.usbR(r,ctr(i))&0x4000)){d.bempSkip[i]=1;yield* this.usbDataEnd(r,i,DATA.NONE);}
   else this.usbEnb(r,BEMPENB,i,true);
  }
  for(let i=6;i<=9;i++)if(bits&(1<<i)&&d.pipeUtr[i]){if(this.usbPid(r,i)&2)yield* this.usbForced(r,i,DATA.STALL);else yield* this.usbDataEnd(r,i,DATA.NONE);}
 },
 // ---- standard requests (r_usb_pstdrequest.c) the PC sends
 *usbStandReq0(r){
  const d=this.usbDrv();d.stdRequest=0;
  if((d.req.type&0xff00)===0x0900){const old=d.configNum;d.configNum=d.req.value;if(d.req.value!==old){d.connected=1;yield* this.usbEvent(r,EV.CONFIGURED,{module_number:0});}}
 },
 *usbStandReq1(r){
  const d=this.usbDrv(),q=d.req;
  if((q.type&0xff00)!==0x0600||(q.type&0x1f)!==0){this.usbSetPid(r,0,2);return;} // GET_DESCRIPTOR of the device; the PC sends no other
  const idx=q.value&0xff,type=q.value>>8;
  if(type===1&&q.index===0&&idx===0){const t=d.devicetbl;yield* this.usbCtrlRead(r,Math.min(q.length,t[0]),{bytes:t,at:0});return;}
  if(type===2&&q.index===0&&idx===0){const t=d.configtbl,len=t[2]|(t[3]<<8);yield* this.usbCtrlRead(r,Math.min(q.length,len),{bytes:t,at:0});return;}
  this.usbSetPid(r,0,2); // string, qualifier and other-speed descriptors: not requested by the PC
 },
 // usb_pstd_stand_req3 (no data stage), usb_pstd_stand_req4 / req5 (status stages)
 *usbStandReq35(r,stg){
  const d=this.usbDrv(),q=d.req,req=q.type&0xff00;
  if(stg===5){
   if(req===0x0900&&(q.type&0x1f)===0&&(q.value===d.configtbl[5]||q.value===0)&&q.index===0&&q.length===0){
    this.usbSetBuf(r,0);
    if(q.value>0&&q.value!==d.configNum){for(let i=1;i<=9;i++)if(d.pipeTable[i].use)this.usbClrPipeCnfg(r,i);for(let i=1;i<=9;i++)if(d.pipeTable[i].use){if((this.usbR(r,CFIFOSEL)&0xf)===i)this.usbChgCurpipe(r,0,0,0);this.usbR(r,D0FIFOSEL);this.usbR(r,D1FIFOSEL);this.usbPipeInit(r,i);}}
   }else this.usbSetPid(r,0,2);
  }else if(stg===2){if([0x0000,0x0600,0x0800,0x0a00,0x0c00].includes(req))this.usbSetBuf(r,0);else this.usbSetPid(r,0,2);}
  else if(req===0x0700)this.usbSetBuf(r,0);else this.usbSetPid(r,0,2);
  if(d.stdRequest===1){yield* this.usbEvent(r,EV.REQUEST_COMPLETE,{setup:{...q},data_size:0,status:0,type:CLS.REQUEST,module_number:0});d.stdRequest=0;}
  this.usbCtrlEnd(r,0);
 },
 // usb_peri_class_request (class and vendor requests) and usb_peri_other_request
 *usbClassRequest(r,q,ctsq){
  const d=this.usbDrv();
  if((q.type&0x60)!==0x20&&(q.type&0x60)!==0x40){yield* this.usbEvent(r,EV.REQUEST,{type:CLS.REQUEST,setup:q,module_number:0,data_size:0,status:0});return;}
  switch(ctsq){
   case 0:d.pipe0Request=0;d.stdRequest=0;return;
   case 1:case 3:yield* this.usbEvent(r,EV.REQUEST,{module_number:0,setup:q,data_size:0,status:0,type:CLS.REQUEST});return;
   case 5:yield* this.usbEvent(r,EV.REQUEST,{setup:q,module_number:0,data_size:0,status:0,type:CLS.REQUEST});this.usbCtrlEnd(r,0);return;
   case 2:this.usbSetBuf(r,0);yield* this.usbEvent(r,EV.REQUEST_COMPLETE,{setup:q,module_number:0,data_size:0,status:0,type:CLS.REQUEST});d.stdRequest=0;this.usbCtrlEnd(r,0);return;
   case 4:this.usbSetBuf(r,0);yield* this.usbEvent(r,EV.REQUEST_COMPLETE,{setup:q,module_number:0,data_size:((q.length-d.dataCnt[0])>>>0),status:0,type:CLS.REQUEST});d.stdRequest=0;this.usbCtrlEnd(r,0);return;
   default:this.usbCtrlEnd(r,7);
  }
 },
 // ---- the API's pieces
 usbCtrl(ptr,r,fn){return this.struct(ptr,r,null,fn);},
 usbGet(v,k){return Number(v.fields[k].value)>>>0;},
 usbInfo(r,ctrl){
  // R_USB_InfoGet without writing a structure: {result, status}
  const d=this.usbDrv(),mod=this.usbGet(ctrl,'module_number');if(mod!==0&&mod!==1)return {result:E.PARAMETER};if(!d.openClass)return {result:E.FAILED};
  const dvsq=this.usbR(r,INTSTS0)&0x70,status=dvsq===0x10?EV.DEFAULT:dvsq===0x20?EV.ADDRESS:dvsq===0x30?EV.CONFIGURED:dvsq>=0x40?EV.SUSPEND:EV.DETACH;
  const speed=this.usbPortSpeed(r);return {result:E.SUCCESS,status,speed:speed===0xc0?2:speed===0x80?1:speed===0x40?0:0};
 },
 usbClassArg(d,dest){return d.mode===2&&!(dest>=CLS.PCDC&&dest<CLS.END);},
 /** R_USB_* by name: a generator, or null for another name (and without the USB stack). */
 usbCall(name,args,r){if(!this.config.peripherals?.USB?.enabled||!Object.hasOwn(USB_API,name))return null;return USB_API[name].call(this,args,r,name);},
 /** The bytes the serial monitor sends to the device (session.js inject). */
 usbSend(bytes,r){return this.config.peripherals?.USB?.enabled?this.usbDev(r).host.send(bytes):0;},
 usbOutput(){return this.usbFs?.host.output??this.usbKeep??[];}
};

const USB_API={
 *R_USB_Open([ctrlPtr,cfgPtr],r,fn){
  if(!ctrlPtr||!cfgPtr)return E.ASSERTION;
  const d=this.usbDrv(),ctrl=this.usbCtrl(ctrlPtr,r,fn),cfg=this.struct(cfgPtr,r,'usb_cfg_t',fn),f=k=>Number(cfg.fields[k].value);
  if(f('module_number')!==0&&f('module_number')!==1)return E.PARAMETER;
  this.setField(ctrl,'module_number',f('module_number'),r);this.setField(ctrl,'type',f('type')&0x7f,r);
  // p_ctrl->p_context and g_usb_apl_callback from the configuration Open is given (its p_usb_apl_callback, NULL: none).
  if(Object.hasOwn(ctrl.fields,'p_context'))ctrl.fields.p_context.value=cfg.fields.p_context.value;
  const cb=cfg.fields.p_usb_apl_callback.value;d.callback=cb?.kind==='function'?cb.name:'';
  const speed=f('usb_speed');if(speed!==2&&speed!==1&&speed!==0&&f('usb_mode')!==1)return E.PARAMETER;
  if(f('module_number')===1)return E.PARAMETER;
  const type=f('type')&0x7f,peri=[0,4,10,16,6,9,7,8],host=[11,13,14,15,17,18,19];
  if(peri.includes(type)){if(f('usb_mode')!==2)return E.PARAMETER;if(speed===0||!cfg.fields.p_usb_reg.value)return E.PARAMETER;if(speed===2)return E.PARAMETER;}
  else if(host.includes(type)){if(f('usb_mode')!==1)return E.PARAMETER;if(speed===2)return E.PARAMETER;}
  else return E.PARAMETER;
  if(d.init)return E.BUSY;
  if(f('usb_mode')!==1)d.mode=2;
  d.event.wp=d.event.rp=0;d.event.code.fill(0);d.init=true;d.openClass=0;d.pdata=Array.from({length:10},()=>({}));
  // Host mode is not in this build (USB_CFG_MODE peripheral): the driver goes on to return FSP_SUCCESS without starting anything.
  if(f('usb_mode')===1)return E.SUCCESS;
  // usb_module_start
  if(this.usbStopped===false)return E.BUSY;
  this.usbStopped=false;
  // usb_pdriver_init / usb_peri_registration: the template's descriptors (a copy the bus reset may change)
  Object.assign(d,{req:{type:0,value:0,index:0,length:0},pipe0Request:0,stdRequest:0,connected:0,configNum:0,dataCnt:Array(10).fill(0),data:Array(10).fill(null),pipeUtr:Array(10).fill(null),devicetbl:[...DEVICE],configtbl:[...CONFIGURATION]});
  d.event.code.fill(EV.NONE);
  // usb_cpu_usbint_init
  this.usbDev(r).write(DPUSR0R_FS,this.usbDev(r).read(DPUSR0R_FS,4)&~0x10,4);
  if(f('irq')>=0){d.irqOn=true;d.ipl=f('ipl');}
  // hw_usb_pmodule_init
  this.usbRmw(r,SYSCFG,0xffff,0x0400);while(!(this.usbR(r,SYSCFG)&0x0400));
  this.usbRmw(r,SYSCFG,~0x0020);this.usbRmw(r,SYSCFG,0xffff,0x0001);
  this.usbW(r,CFIFOSEL,0x0400);this.usbW(r,D0FIFOSEL,0x0400);this.usbW(r,D1FIFOSEL,0x0400);this.usbW(r,INTENB0,0x0400|0x0100|0x8000|0x1000|0x0800);
  if((yield* this.usbVbsts(r))===0x40){yield 10;this.usbRmw(r,SYSCFG,0xffff,0x0010);}
  d.openClass|=(1<<IN.PCDC)|(1<<IN.PCDCC);
  return E.SUCCESS;
 },
 *R_USB_Close([ctrlPtr],r,fn){
  if(!ctrlPtr)return E.ASSERTION;
  const d=this.usbDrv(),ctrl=this.usbCtrl(ctrlPtr,r,fn),mod=this.usbGet(ctrl,'module_number');if(mod!==0&&mod!==1)return E.PARAMETER;
  // usb_module_stop: usb_module_register_clear, then the module stop bit
  const W=(o,v)=>this.usbW(r,o,v);W(DVSTCTR0,0);W(DCPCTR,0x0080);for(let i=0;i<9;i++)W(0x70+i*2,0);for(const o of [BRDYENB,NRDYENB,BEMPENB,INTENB0,0x32,BRDYSTS,NRDYSTS,BEMPSTS])W(o,0);
  for(const b of [0x10,0x20,0x40,0x01])this.usbRmw(r,SYSCFG,~b);
  if(this.usbStopped!==false)return E.NOT_OPEN;
  this.usbStopped=true;d.init=false;d.devicetbl=null;d.configtbl=null;this.usbClrPipeTable();d.openClass=0;d.mode=0;
  return E.SUCCESS;
 },
 *R_USB_Read([ctrlPtr,buf,size,dest],r,fn){
  if(!ctrlPtr)return E.ASSERTION;const d=this.usbDrv();
  if(this.usbClassArg(d,dest))return E.PARAMETER;
  if(!buf||!size)return E.ASSERTION;
  const ctrl=this.usbCtrl(ctrlPtr,r,fn),mod=this.usbGet(ctrl,'module_number');if(mod!==0&&mod!==1)return E.PARAMETER;
  const t=dest&0x7f;if([IN.PCDCC,IN.PCDCC2,IN.PVND,IN.HVND,IN.HMSC,IN.PMSC].includes(t))return E.PARAMETER;if(!(d.openClass&(1<<t)))return E.PARAMETER;
  if(d.mode===2)this.setField(ctrl,'type',t,r);
  const info=this.usbInfo(r,ctrl);if(info.result)return info.result;if(info.status!==EV.CONFIGURED)return E.FAILED;
  // usb_data_read
  const pipe=d.pipePeri[t*2],u=d.pdata[pipe];Object.assign(u,{readReqLen:size>>>0,keyword:pipe,tranadr:{ptr:buf,at:0,fn},tranlen:size>>>0,complete:t===IN.PCDC||t===IN.PCDC2?'read':null});
  const err=yield* this.usbTransferStart(r,u);return err===OK?E.SUCCESS:err===QOVR?E.BUSY:E.FAILED;
 },
 *R_USB_Write([ctrlPtr,buf,size,dest],r,fn){
  if(!ctrlPtr)return E.ASSERTION;const d=this.usbDrv();
  if(this.usbClassArg(d,dest))return E.PARAMETER;
  if(!buf&&size)return E.ASSERTION;
  const ctrl=this.usbCtrl(ctrlPtr,r,fn),mod=this.usbGet(ctrl,'module_number');if(mod!==0&&mod!==1)return E.PARAMETER;
  const t=dest&0x7f;if([IN.HCDCC,IN.PVND,IN.HVND,IN.HMSC,IN.PMSC].includes(t))return E.PARAMETER;if(!(d.openClass&(1<<t)))return E.PARAMETER;
  if(d.mode===2)this.setField(ctrl,'type',t,r);
  const info=this.usbInfo(r,ctrl);if(info.result)return info.result;if(info.status!==EV.CONFIGURED)return E.FAILED;
  // usb_data_write: the bytes, or the SERIAL_STATE notification with the first two of them for the interrupt IN pipe
  const pipe=d.pipePeri[t*2+1],u=d.pdata[pipe],bytes=size?memoryBytes(r,buf,Math.max(size>>>0,pipe===d.intIn?2:0),fn):[];
  if(pipe!==d.intIn)Object.assign(u,{tranadr:{bytes,at:0},tranlen:size>>>0});
  else Object.assign(u,{tranadr:{bytes:[0xa1,0x20,0,0,0,0,2,0,bytes[0]??0,bytes[1]??0],at:0},tranlen:10});
  Object.assign(u,{keyword:pipe,complete:[0,1,2,3].includes(t)?'write':null});
  const err=yield* this.usbTransferStart(r,u);return err===OK?E.SUCCESS:err===QOVR?E.BUSY:E.FAILED;
 },
 *R_USB_Stop([ctrlPtr,direction,dest],r,fn){
  if(!ctrlPtr)return E.ASSERTION;const d=this.usbDrv();
  if(this.usbClassArg(d,dest))return E.PARAMETER;
  if(direction!==0&&direction!==1)return E.PARAMETER;
  const ctrl=this.usbCtrl(ctrlPtr,r,fn),mod=this.usbGet(ctrl,'module_number');if(mod!==0&&mod!==1)return E.PARAMETER;
  const t=dest&0x7f;if([IN.PVND,IN.HVND,IN.HMSC,IN.PMSC].includes(t))return E.PARAMETER;
  if(t===IN.HCDCC&&direction===1||t===IN.PCDCC&&direction===0||t===IN.PCDCC2&&direction===0)return E.PARAMETER;
  if(d.mode===2)this.setField(ctrl,'type',t,r);
  const info=this.usbInfo(r,ctrl);if(info.status!==EV.CONFIGURED)return E.FAILED;
  const pipe=d.pipePeri[t*2+direction];if(!pipe)return E.FAILED;
  const err=yield* this.usbTransferEnd(r,pipe);return err===OK?E.SUCCESS:err===QOVR?E.BUSY:E.FAILED;
 },
 *R_USB_InfoGet([ctrlPtr,infoPtr],r,fn){
  if(!ctrlPtr||!infoPtr)return E.ASSERTION;
  const ctrl=this.usbCtrl(ctrlPtr,r,fn),info=this.usbInfo(r,ctrl);if(info.result)return info.result;
  const v=this.struct(infoPtr,r,'usb_info_t',fn);this.setField(v,'device_status',info.status,r);this.setField(v,'class_type',0,r);this.setField(v,'speed',info.speed,r);this.setField(v,'bcport',0,r);
  return E.SUCCESS;
 },
 // R_USB_EventGet: the driver's task handles one interrupt record, then the oldest event (with its usb_event_info_t) is
 // returned; USB_STATUS_NONE without one.
 *R_USB_EventGet([ctrlPtr,eventPtr],r,fn){
  this.out(eventPtr,r,EV.NONE,fn);
  const d=this.usbDrv();if(d.init)yield* this.usbTask(r);
  const q=d.event;
  if(q.wp!==q.rp){
   const c=q.ctrl[q.rp]||{},ctrl=this.usbCtrl(ctrlPtr,r,fn),f=this.usbFields(r,c);
   for(const [k,v]of Object.entries(f))if(Object.hasOwn(ctrl.fields,k))ctrl.fields[k].value=v;
   for(const k of ['p_data','p_context','p_transfer_tx','p_transfer_rx'])if(Object.hasOwn(ctrl.fields,k))ctrl.fields[k].value=0;
   this.out(eventPtr,r,q.code[q.rp],fn);q.rp=(q.rp+1)%10;
  }
  return E.SUCCESS;
 },
 *R_USB_Callback([callback],r){if(!callback)return E.ASSERTION;this.usbDrv().callback=r.callback(callback).name;return E.SUCCESS;},
 *R_USB_PeriControlDataGet([ctrlPtr,buf,size],r,fn){
  if(!ctrlPtr||!buf)return E.ASSERTION;const d=this.usbDrv(),ctrl=this.usbCtrl(ctrlPtr,r,fn);
  if(this.usbInfo(r,ctrl).result)return E.FAILED;
  if(d.mode===2){if(d.pipe0Request)return E.BUSY;d.stdRequest=1;this.usbCtrlWrite(r,size>>>0,{ptr:buf,at:0,fn});}
  return E.SUCCESS;
 },
 *R_USB_PeriControlDataSet([ctrlPtr,buf,size],r,fn){
  if(!ctrlPtr||!buf)return E.ASSERTION;const d=this.usbDrv(),ctrl=this.usbCtrl(ctrlPtr,r,fn);
  if(this.usbInfo(r,ctrl).result)return E.FAILED;
  if(d.mode===2){if(d.pipe0Request)return E.BUSY;d.stdRequest=1;yield* this.usbCtrlRead(r,size>>>0,{bytes:memoryBytes(r,buf,size>>>0,fn),at:0});}
  return E.SUCCESS;
 },
 *R_USB_PeriControlStatusSet([ctrlPtr,status],r,fn){
  if(!ctrlPtr)return E.ASSERTION;const ctrl=this.usbCtrl(ctrlPtr,r,fn);
  if(this.usbInfo(r,ctrl).result)return E.FAILED;
  this.setField(ctrl,'status',status,r);
  this.usbRmw(r,DCPCTR,~3);this.usbRmw(r,DCPCTR,0xffff,status===0?1:2);
  return E.SUCCESS;
 },
 *R_USB_PullUp([ctrlPtr,state],r){
  if(!ctrlPtr)return E.ASSERTION;if(state!==0&&state!==1)return E.PARAMETER;if(this.usbDrv().mode===1)return E.FAILED;
  this.usbRmw(r,SYSCFG,state?0xffff:~0x10,state?0x10:0);return E.SUCCESS;
 }
};
/** Every R_USB_* name the interpreter answers. */
export const USB_NAMES=Object.freeze(Object.keys(USB_API));
