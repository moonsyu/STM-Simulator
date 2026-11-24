// Feature 41 with the real FSP: r_usb_basic and r_usb_pcdc built by ARM GCC with the generated ra_gen/ra_cfg and run on
// the RA6E1 emulator's USBFS with its PC (emu/ra6e1/usbfs.js), beside the same hal_entry.c on the built-in interpreter
// (its port of the driver on the same model, fsp-usb.js). Both must give the same return codes, the same events in the
// same order with the same contents, the same line coding and the same bytes back to the PC, with no register outside
// the model.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {FirmwareSession} from '../../src/firmware-session.js';
import {SimulationSession} from '../../src/session.js';
import {projectForBoard,validateProject} from '../../src/project.js';
import {raDefaultMcu} from '../../src/ra-config.js';
import {RA_USB_DESCRIPTOR_FILE,RA_USB_DESCRIPTOR_C} from '../../src/ra-usb-descriptor.js';

const require=createRequire(import.meta.url),{prepareBuild,build,detectTools}=require('../../desktop/native-build.cjs');
const tools=await detectTools({armGcc:process.env.ARM_GCC||''});
const skip=!(tools.armGcc&&tools.fsp)&&!process.env.CI_REQUIRE_TOOLCHAIN&&'ARM GCC / Renesas FSP not installed';
const HEAD=`#include "hal_data.h"
void R_BSP_WarmStart(bsp_warm_start_event_t event);
void R_BSP_WarmStart(bsp_warm_start_event_t event)
{
    if (BSP_WARM_START_POST_C == event)
    {
        R_IOPORT_Open(&IOPORT_CFG_CTRL, &IOPORT_CFG_NAME);
    }
}
void external_irq1_callback(external_irq_callback_args_t *p_args) { (void) p_args; }
`;
// The events a program records (ev[]) with what the driver sets for each: READ_COMPLETE data_size and status, REQUEST and
// REQUEST_COMPLETE the request (bRequest | bmRequestType), its length and, for REQUEST_COMPLETE, data_size.
const SERVICE=`
volatile int32_t ev[64];
volatile int32_t info[64];
volatile int32_t nev = 0;
volatile int32_t configured = 0;
volatile int32_t line_state = 0;
static usb_pcdc_linecoding_t line_coding;
volatile uint32_t baud = 0;
volatile uint32_t data_bits = 0;
static void note (usb_status_t event, usb_event_info_t * p)
{
    if (nev >= 64)
    {
        return;
    }
    ev[nev] = (int32_t) event;
    if (USB_STATUS_READ_COMPLETE == event)
    {
        info[nev] = (int32_t) (p->data_size * 10000U + (uint32_t) p->status);
    }
    else if ((USB_STATUS_REQUEST == event) || (USB_STATUS_REQUEST_COMPLETE == event))
    {
        info[nev] = (int32_t) (((uint32_t) p->setup.request_type << 16) | ((uint32_t) p->setup.request_length << 8) | p->data_size);
    }
    else if (USB_STATUS_WRITE_COMPLETE == event)
    {
        info[nev] = (int32_t) p->status;
    }
    else
    {
        info[nev] = 0;
    }
    nev++;
}
static usb_status_t service (void)
{
    usb_status_t event;
    R_USB_EventGet(&g_basic0_ctrl, &event);
    if (USB_STATUS_NONE != event)
    {
        note(event, &g_basic0_ctrl);
    }
    if (USB_STATUS_CONFIGURED == event)
    {
        configured++;
    }
    if (USB_STATUS_REQUEST == event)
    {
        if (USB_PCDC_SET_LINE_CODING == (g_basic0_ctrl.setup.request_type & USB_BREQUEST))
        {
            R_USB_PeriControlDataGet(&g_basic0_ctrl, (uint8_t *) &line_coding, 7);
        }
        else if (USB_PCDC_SET_CONTROL_LINE_STATE == (g_basic0_ctrl.setup.request_type & USB_BREQUEST))
        {
            line_state = (int32_t) g_basic0_ctrl.setup.request_value;
            R_USB_PeriControlStatusSet(&g_basic0_ctrl, USB_SETUP_STATUS_ACK);
        }
    }
    if (USB_STATUS_REQUEST_COMPLETE == event)
    {
        baud = line_coding.dw_dte_rate;
        data_bits = line_coding.b_data_bits;
    }
    return event;
}
static void serve_ms (uint32_t ms)
{
    for (uint32_t i = 0; i < ms * 10U; i++)
    {
        service();
        R_BSP_SoftwareDelay(100, BSP_DELAY_UNITS_MICROSECONDS);
    }
}
`;
const list=(prefix,n)=>Array.from({length:n},(_,i)=>`${prefix}[${i}]`);
const usbMcu=(usb={})=>({...raDefaultMcu(),peripherals:{USB:{enabled:true,callback:'',priority:12,resumePriority:12,...usb}}});
const run=(s,ms)=>{for(let guard=0;guard<100000&&s.now<ms*1000-1;guard++)s.tick(Math.min(ms,Math.floor(s.now/1000)+1));};

/** Builds and runs `code` on both engines for `ms` (typing `sends` {at ms: text} into the USB port); what each one ended with. */
async function both(code,ms,names,{usb,sends={}}={}){
 const base=projectForBoard('fpb-ra6e1');
 const project=validateProject({...base,mcu:usbMcu(usb),code:HEAD+code,firmware:{...base.firmware,files:[{name:RA_USB_DESCRIPTOR_FILE,text:RA_USB_DESCRIPTOR_C}]}});
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'ra-usb-'));
 try{
  const result=await build(await prepareBuild({project,tools,root,target:'arm'}));
  assert.deepEqual(result.diagnostics.filter(d=>d.severity!=='info'),[]);
  const vars=s=>Object.fromEntries(names.map(n=>[n,s.readVariable(n)]));
  const drive=(s,tick)=>{let t=0;for(const at of [...Object.keys(sends).map(Number).sort((a,b)=>a-b),ms]){tick(at);t=at;if(sends[at]!==undefined)s.inject(sends[at],'usb:pcdc');}void t;};
  const ew=[],emulator=new FirmwareSession(validateProject(project),{elf:new Uint8Array(await fs.readFile(result.elf)),warn:m=>ew.push(m)});
  drive(emulator,at=>run(emulator,at));
  const iw=[],interpreter=new SimulationSession(validateProject(project),{warn:m=>iw.push(m)});
  let t=0;drive(interpreter,at=>{for(;t<at;)interpreter.tick(++t);});
  const out=s=>String.fromCharCode(...s.usbOutput);
  return {emulator:{vars:vars(emulator),output:out(emulator),host:emulator.soc.usbfs.host.events,state:emulator.soc.usbfs.host.state,queue:emulator.soc.usbfs.host.queue.length,warn:ew},
   interpreter:{vars:vars(interpreter),output:out(interpreter),host:interpreter.hal.usbFs.host.events,state:interpreter.hal.usbFs.host.state,queue:interpreter.hal.usbFs.host.queue.length,warn:iw},
   unknown:[...emulator.soc.unknown.keys()].map(a=>a.toString(16)),emulatorSession:emulator,interpreterSession:interpreter};
 }finally{await fs.rm(root,{recursive:true,force:true});}
}
const ENUMERATION=['RESET','GET_DESCRIPTOR(Device, 18)','SET_ADDRESS(1)','GET_DESCRIPTOR(Device, 18)','GET_DESCRIPTOR(Configuration, 9)','GET_DESCRIPTOR(Configuration, 67)','SET_CONFIGURATION','SET_LINE_CODING','SET_CONTROL_LINE_STATE'];
const EV={DEFAULT:1,CONFIGURED:3,REQUEST:7,REQUEST_COMPLETE:8,READ_COMPLETE:9,WRITE_COMPLETE:10};

test('echo on both engines: the enumeration, the CDC requests, one byte, 100 bytes (64 + 36), 64 bytes and bytes in a row come back; every event in the same order with the same contents',{skip,timeout:600000},async()=>{
 const code=SERVICE+`
static uint8_t buf[64];
volatile uint32_t received = 0;
void hal_entry(void)
{
    R_USB_Open(&g_basic0_ctrl, &g_basic0_cfg);
    serve_ms(0);
    while (1)
    {
        usb_status_t event = service();
        if ((USB_STATUS_CONFIGURED == event) || (USB_STATUS_WRITE_COMPLETE == event))
        {
            R_USB_Read(&g_basic0_ctrl, buf, sizeof(buf), USB_CLASS_PCDC);
        }
        else if (USB_STATUS_READ_COMPLETE == event)
        {
            received += g_basic0_ctrl.data_size;
            R_USB_Write(&g_basic0_ctrl, buf, g_basic0_ctrl.data_size, USB_CLASS_PCDC);
        }
    }
}
`;
 const a100='a'.repeat(100),b64='b'.repeat(64);
 const r=await both(code,200,['nev','received','configured','line_state','baud','data_bits',...list('ev',24),...list('info',24)],{sends:{60:'x',80:a100,110:b64,140:'yz',141:'!'}});
 assert.deepEqual(r.unknown,[],'no register outside the model');assert.deepEqual(r.emulator.warn,[]);assert.deepEqual(r.interpreter.warn,[]);
 assert.deepEqual(r.emulator.host,ENUMERATION);assert.deepEqual(r.interpreter.host,ENUMERATION);
 assert.deepEqual(r.interpreter.vars,r.emulator.vars);
 const v=r.emulator.vars,expect='x'+a100+b64+'yz!';
 assert.equal(r.emulator.output,expect);assert.equal(r.interpreter.output,expect);
 assert.equal(v.received,expect.length);assert.equal(v.configured,1);assert.equal(v.line_state,3);assert.equal(v.baud,115200);assert.equal(v.data_bits,8);
 // DEFAULT, CONFIGURED, SET_LINE_CODING (REQUEST, then REQUEST_COMPLETE with its 7 bytes), SET_CONTROL_LINE_STATE (REQUEST
 // only: no data stage), then a READ_COMPLETE / WRITE_COMPLETE pair per packet the PC sent.
 const events=list('ev',v.nev).map(k=>v[k]);
 assert.deepEqual(events.slice(0,5),[EV.DEFAULT,EV.CONFIGURED,EV.REQUEST,EV.REQUEST_COMPLETE,EV.REQUEST]);
 assert.equal(v['info[2]'],(0x2021<<16)|(7<<8));assert.equal(v['info[3]'],(0x2021<<16)|(7<<8)|7);assert.equal(v['info[4]'],0x2221<<16);
 // Short packets complete with FSP_ERR_USB_SIZE_SHORT, a full 64-byte read with FSP_SUCCESS.
 const reads=events.map((e,i)=>e===EV.READ_COMPLETE?v[`info[${i}]`]:null).filter(x=>x!==null);
 assert.deepEqual(reads.map(x=>[Math.floor(x/10000),x%10000]),[[1,1502],[64,0],[36,1502],[64,0],[2,1502],[1,1502]].slice(0,reads.length));
});

test('R_USB_* return codes on both engines: before Open, before the PC configured the device, Read in progress, Stop, Close and Open again (the PC enumerates again)',{skip,timeout:600000},async()=>{
 const code=SERVICE+`
volatile int32_t e[32];
volatile int32_t n_e = 0;
volatile int32_t status_before = -1;
volatile int32_t status_after = -1;
volatile int32_t speed_after = -1;
volatile int32_t configured_again = 0;
static uint8_t buf[8];
void hal_entry(void)
{
    usb_info_t usb_info;
    int n = 0;
    e[n++] = (int32_t) R_USB_Read(&g_basic0_ctrl, buf, sizeof(buf), USB_CLASS_PCDC);
    e[n++] = (int32_t) R_USB_Write(&g_basic0_ctrl, buf, 1, USB_CLASS_PCDC);
    e[n++] = (int32_t) R_USB_InfoGet(&g_basic0_ctrl, &usb_info, 0);
    e[n++] = (int32_t) R_USB_Close(&g_basic0_ctrl);
    e[n++] = (int32_t) R_USB_Open(NULL, &g_basic0_cfg);
    e[n++] = (int32_t) R_USB_Open(&g_basic0_ctrl, &g_basic0_cfg);
    e[n++] = (int32_t) R_USB_Open(&g_basic0_ctrl, &g_basic0_cfg);
    e[n++] = (int32_t) R_USB_Read(&g_basic0_ctrl, buf, sizeof(buf), USB_CLASS_PCDC);
    e[n++] = (int32_t) R_USB_Write(&g_basic0_ctrl, buf, 1, USB_CLASS_PCDC);
    e[n++] = (int32_t) R_USB_Read(&g_basic0_ctrl, NULL, 8, USB_CLASS_PCDC);
    e[n++] = (int32_t) R_USB_Read(&g_basic0_ctrl, buf, 8, USB_CLASS_PCDCC);
    e[n++] = (int32_t) R_USB_Write(&g_basic0_ctrl, NULL, 1, USB_CLASS_PCDC);
    e[n++] = (int32_t) R_USB_InfoGet(&g_basic0_ctrl, &usb_info, 0);
    status_before = (int32_t) usb_info.device_status;
    e[n++] = (int32_t) R_USB_PullUp(&g_basic0_ctrl, 2);
    e[n++] = (int32_t) R_USB_Stop(&g_basic0_ctrl, USB_TRANSFER_READ, USB_CLASS_PCDC);
    serve_ms(40);
    e[n++] = (int32_t) R_USB_InfoGet(&g_basic0_ctrl, &usb_info, 0);
    status_after = (int32_t) usb_info.device_status;
    speed_after = (int32_t) usb_info.speed;
    e[n++] = (int32_t) R_USB_Read(&g_basic0_ctrl, buf, sizeof(buf), USB_CLASS_PCDC);
    e[n++] = (int32_t) R_USB_Read(&g_basic0_ctrl, buf, sizeof(buf), USB_CLASS_PCDC);
    e[n++] = (int32_t) R_USB_Stop(&g_basic0_ctrl, USB_TRANSFER_READ, USB_CLASS_PCDC);
    e[n++] = (int32_t) R_USB_Stop(&g_basic0_ctrl, USB_TRANSFER_READ, USB_CLASS_PCDC);
    e[n++] = (int32_t) R_USB_Stop(&g_basic0_ctrl, USB_TRANSFER_READ, USB_CLASS_PCDCC);
    e[n++] = (int32_t) R_USB_Write(&g_basic0_ctrl, (uint8_t *) "hi", 2, USB_CLASS_PCDC);
    e[n++] = (int32_t) R_USB_Write(&g_basic0_ctrl, (uint8_t *) "hi", 2, USB_CLASS_PCDC);
    serve_ms(5);
    e[n++] = (int32_t) R_USB_Close(&g_basic0_ctrl);
    e[n++] = (int32_t) R_USB_Close(&g_basic0_ctrl);
    e[n++] = (int32_t) R_USB_Read(&g_basic0_ctrl, buf, sizeof(buf), USB_CLASS_PCDC);
    configured = 0;
    e[n++] = (int32_t) R_USB_Open(&g_basic0_ctrl, &g_basic0_cfg);
    serve_ms(40);
    configured_again = configured;
    e[n++] = (int32_t) R_USB_Write(&g_basic0_ctrl, (uint8_t *) "ok", 2, USB_CLASS_PCDC);
    serve_ms(5);
    n_e = n;
    while (1)
    {
        service();
    }
}
`;
 const r=await both(code,150,['n_e','status_before','status_after','speed_after','configured_again','nev',...list('e',28),...list('ev',32),...list('info',32)]);
 assert.deepEqual(r.unknown,[],'no register outside the model');assert.deepEqual(r.emulator.warn,[]);assert.deepEqual(r.interpreter.warn,[]);
 assert.deepEqual(r.interpreter.vars,r.emulator.vars);
 const v=r.emulator.vars,codes=list('e',v.n_e).map(k=>v[k]);
 const P=1506,F=1500,B=1501,A=1,N=1504;
 assert.deepEqual(codes,[P,P,F,N,A,0,B,F,F,A,P,A,0,P,F, 0,0,B,0,F,P,0,B, 0,N,P,0, 0]);
 assert.equal(v.status_before,6,'USB_STATUS_DETACH before the bus reset');assert.equal(v.status_after,3,'USB_STATUS_CONFIGURED');assert.equal(v.speed_after,1,'USB_SPEED_FS');
 assert.equal(v.configured_again,1);
 assert.equal(r.emulator.output,'hiok');assert.equal(r.interpreter.output,'hiok');
 // The stopped read completes (FSP_ERR_USB_FAILED, nothing read); after Close and Open the PC enumerates again.
 const events=list('ev',v.nev).map(k=>v[k]);
 assert.ok(events.includes(EV.READ_COMPLETE));assert.equal(v[`info[${events.indexOf(EV.READ_COMPLETE)}]`],1500);
 assert.deepEqual(r.emulator.host,[...ENUMERATION,'DETACH',...ENUMERATION]);assert.deepEqual(r.interpreter.host,r.emulator.host);
});

test('the callback (Stacks Callback, then R_USB_Callback) gets every event on both engines, from R_USB_EventGet',{skip,timeout:600000},async()=>{
 const code=SERVICE+`
volatile int32_t cb[32];
volatile int32_t ncb = 0;
volatile int32_t cb2 = 0;
static uint8_t buf[64];
void usb_cb (usb_callback_args_t * p_args)
{
    if (ncb < 32)
    {
        cb[ncb++] = (int32_t) p_args->event;
    }
    if (USB_STATUS_READ_COMPLETE == p_args->event)
    {
        /* The driver still holds the pipe while it calls back: a new read is refused. */
        cb[ncb++] = (int32_t) R_USB_Read(&g_basic0_ctrl, buf, sizeof(buf), USB_CLASS_PCDC);
    }
}
void other_cb (usb_callback_args_t * p_args)
{
    (void) p_args;
    cb2++;
}
void hal_entry(void)
{
    R_USB_Open(&g_basic0_ctrl, &g_basic0_cfg);
    serve_ms(40);
    R_USB_Read(&g_basic0_ctrl, buf, sizeof(buf), USB_CLASS_PCDC);
    serve_ms(30);
    R_USB_Callback(other_cb);
    R_USB_Write(&g_basic0_ctrl, (uint8_t *) "ab", 2, USB_CLASS_PCDC);
    while (1)
    {
        service();
    }
}
`;
 const r=await both(code,120,['ncb','cb2','nev',...list('cb',12),...list('ev',12)],{usb:{callback:'usb_cb'},sends:{55:'Q'}});
 assert.deepEqual(r.unknown,[]);assert.deepEqual(r.emulator.warn,[]);assert.deepEqual(r.interpreter.warn,[]);
 assert.deepEqual(r.interpreter.vars,r.emulator.vars);
 const v=r.emulator.vars;
 assert.deepEqual(list('cb',v.ncb).map(k=>v[k]),[EV.DEFAULT,EV.CONFIGURED,EV.REQUEST,EV.REQUEST_COMPLETE,EV.REQUEST,EV.READ_COMPLETE,1501]);
 assert.deepEqual(list('ev',v.nev).map(k=>v[k]),[EV.DEFAULT,EV.CONFIGURED,EV.REQUEST,EV.REQUEST_COMPLETE,EV.REQUEST,EV.READ_COMPLETE,EV.WRITE_COMPLETE]);
 assert.equal(v.cb2,1);assert.equal(r.emulator.output,'ab');assert.equal(r.interpreter.output,'ab');
});

// Both engines ended alike: the same variables, bytes back to the PC, PC state and queue, and (unless told otherwise)
// the same PC log, with no register outside the model and no warning.
function alike(r,{host=true,warn=true}={}){
 assert.deepEqual(r.unknown,[],'no register outside the model');
 if(warn){assert.deepEqual(r.emulator.warn,[]);assert.deepEqual(r.interpreter.warn,[]);}
 assert.deepEqual(r.interpreter.vars,r.emulator.vars);assert.equal(r.interpreter.output,r.emulator.output);
 assert.equal(r.emulator.state,'ready');assert.equal(r.interpreter.state,'ready');assert.equal(r.interpreter.queue,r.emulator.queue);
 if(host)assert.deepEqual(r.interpreter.host,r.emulator.host);
}
const EVN=['nev','configured','line_state','baud','data_bits',...list('ev',32),...list('info',32)];
// Echo with a buffer of `size` bytes and reads of `readSize`.
const echoOf=(size,readSize=size)=>SERVICE+`
static uint8_t buf[${size}];
volatile uint32_t received = 0;
void hal_entry(void)
{
    R_USB_Open(&g_basic0_ctrl, &g_basic0_cfg);
    serve_ms(0);
    while (1)
    {
        usb_status_t event = service();
        if ((USB_STATUS_CONFIGURED == event) || (USB_STATUS_WRITE_COMPLETE == event))
        {
            R_USB_Read(&g_basic0_ctrl, buf, ${readSize}, USB_CLASS_PCDC);
        }
        else if (USB_STATUS_READ_COMPLETE == event)
        {
            received += g_basic0_ctrl.data_size;
            R_USB_Write(&g_basic0_ctrl, buf, g_basic0_ctrl.data_size > ${size} ? ${size} : g_basic0_ctrl.data_size, USB_CLASS_PCDC);
        }
    }
}
`;

test('reads of 200, 10 and 70 bytes (not the packet size) on both engines: the same events, sizes and bytes back',{skip,timeout:900000},async()=>{
 for(const [size,readSize,sends] of [
  [200,200,{60:'a'.repeat(65),80:'b'.repeat(128),110:'c'.repeat(200),150:'d'.repeat(256),220:'tail'}],
  [10,10,{60:'12345',80:'0123456789',100:'0123456789X',130:'q'.repeat(64),170:'z'.repeat(100)}],
  [100,70,{60:'a'.repeat(64),80:'b'.repeat(70),110:'c'.repeat(100),160:'d'.repeat(6)}]]){
  const r=await both(echoOf(size,readSize),300,[...EVN,'received'],{sends});
  alike(r);assert.ok(r.emulator.vars.nev>5,`read size ${readSize}: data moved`);
 }
});

test('a system reset (NVIC_SystemReset) while configured: the PC enumerates again and the echo goes on, on both engines',{skip,timeout:600000},async()=>{
 const code=SERVICE+`
static uint8_t buf[64];
volatile uint32_t received = 0;
void hal_entry(void)
{
    R_USB_Open(&g_basic0_ctrl, &g_basic0_cfg);
    serve_ms(0);
    while (1)
    {
        usb_status_t event = service();
        if ((USB_STATUS_CONFIGURED == event) || (USB_STATUS_WRITE_COMPLETE == event))
        {
            R_USB_Read(&g_basic0_ctrl, buf, 64, USB_CLASS_PCDC);
        }
        else if (USB_STATUS_READ_COMPLETE == event)
        {
            received += g_basic0_ctrl.data_size;
            if ('R' == buf[0])
            {
                NVIC_SystemReset();
            }
            R_USB_Write(&g_basic0_ctrl, buf, g_basic0_ctrl.data_size, USB_CLASS_PCDC);
        }
    }
}
`;
 const r=await both(code,300,[...EVN,'received'],{sends:{60:'a',80:'R',85:'early',200:'b'}});
 // The interpreter starts a new USB model at the reset (its PC log begins again); the emulator's PC keeps one log.
 alike(r,{host:false,warn:false});
 assert.deepEqual(r.emulator.warn,[]);assert.deepEqual(r.interpreter.warn,['[NVIC] 시스템 리셋: 프로그램을 처음부터 다시 실행합니다.']);
 assert.deepEqual(r.emulator.host,[...ENUMERATION,...ENUMERATION]);assert.deepEqual(r.interpreter.host,ENUMERATION);
 assert.equal(r.emulator.output,'aearlyb');assert.equal(r.emulator.vars.received,6);assert.equal(r.emulator.vars.configured,1);
});

test('PullUp off and on with a read pending: the PC sees the device go and enumerates it again, on both engines',{skip,timeout:600000},async()=>{
 const code=SERVICE+`
volatile int32_t e[16];
volatile int32_t n_e = 0;
static uint8_t buf[64];
void hal_entry(void)
{
    int n = 0;
    usb_info_t usb_info;
    e[n++] = (int32_t) R_USB_PullUp(&g_basic0_ctrl, 1);
    R_USB_Open(&g_basic0_ctrl, &g_basic0_cfg);
    serve_ms(40);
    e[n++] = (int32_t) R_USB_Read(&g_basic0_ctrl, buf, 64, USB_CLASS_PCDC);
    e[n++] = (int32_t) R_USB_PullUp(&g_basic0_ctrl, 0);
    serve_ms(10);
    e[n++] = (int32_t) R_USB_InfoGet(&g_basic0_ctrl, &usb_info, 0);
    e[n++] = (int32_t) usb_info.device_status;
    e[n++] = (int32_t) R_USB_Read(&g_basic0_ctrl, buf, 64, USB_CLASS_PCDC);
    e[n++] = (int32_t) R_USB_Write(&g_basic0_ctrl, buf, 1, USB_CLASS_PCDC);
    e[n++] = (int32_t) R_USB_PullUp(&g_basic0_ctrl, 1);
    serve_ms(40);
    e[n++] = (int32_t) R_USB_InfoGet(&g_basic0_ctrl, &usb_info, 0);
    e[n++] = (int32_t) usb_info.device_status;
    e[n++] = (int32_t) R_USB_Read(&g_basic0_ctrl, buf, 64, USB_CLASS_PCDC);
    n_e = n;
    while (1)
    {
        usb_status_t event = service();
        if (USB_STATUS_READ_COMPLETE == event)
        {
            R_USB_Write(&g_basic0_ctrl, buf, g_basic0_ctrl.data_size, USB_CLASS_PCDC);
        }
        if (USB_STATUS_WRITE_COMPLETE == event)
        {
            R_USB_Read(&g_basic0_ctrl, buf, 64, USB_CLASS_PCDC);
        }
    }
}
`;
 const r=await both(code,220,[...EVN,'n_e',...list('e',16)],{sends:{45:'lost?',150:'after'}});
 alike(r);
 const v=r.emulator.vars;
 assert.deepEqual(list('e',v.n_e).map(k=>v[k]),[0,0,0,0,6,1500,1500,0,0,3,0]);
 assert.deepEqual(r.emulator.host,[...ENUMERATION,'DETACH',...ENUMERATION]);assert.equal(r.emulator.output,'after');assert.equal(v.configured,2);
});

test('a program that leaves the CDC requests unanswered, or STALLs one: the PC gives the request up and the echo works, on both engines',{skip,timeout:600000},async()=>{
 const loop=(request='')=>`
volatile int32_t ev[64];
volatile int32_t nev = 0;
volatile int32_t e[8];
static uint8_t buf[64];
${request?'static usb_pcdc_linecoding_t lc;\n':''}void hal_entry(void)
{
    usb_status_t event;
    R_USB_Open(&g_basic0_ctrl, &g_basic0_cfg);
    while (1)
    {
        R_USB_EventGet(&g_basic0_ctrl, &event);
        if ((USB_STATUS_NONE != event) && (nev < 64))
        {
            ev[nev++] = (int32_t) event;
        }
        if ((USB_STATUS_CONFIGURED == event) || (USB_STATUS_WRITE_COMPLETE == event))
        {
            R_USB_Read(&g_basic0_ctrl, buf, 64, USB_CLASS_PCDC);
        }
        if (USB_STATUS_READ_COMPLETE == event)
        {
            R_USB_Write(&g_basic0_ctrl, buf, g_basic0_ctrl.data_size, USB_CLASS_PCDC);
        }
${request}
    }
}
`;
 const ignore=await both(loop(),200,['nev',...list('ev',16)],{sends:{80:'abc',120:'def'}});
 alike(ignore);
 assert.deepEqual(ignore.emulator.host,[...ENUMERATION.slice(0,8),'TIMEOUT','SET_CONTROL_LINE_STATE']);assert.equal(ignore.emulator.output,'abcdef');
 const stall=await both(loop(`        if (USB_STATUS_REQUEST == event)
        {
            if (USB_PCDC_SET_LINE_CODING == (g_basic0_ctrl.setup.request_type & USB_BREQUEST))
            {
                e[0] = (int32_t) R_USB_PeriControlDataGet(&g_basic0_ctrl, (uint8_t *) &lc, 7);
                e[1] = (int32_t) R_USB_PeriControlDataGet(&g_basic0_ctrl, (uint8_t *) &lc, 7);
            }
            else
            {
                e[2] = (int32_t) R_USB_PeriControlStatusSet(&g_basic0_ctrl, USB_SETUP_STATUS_STALL);
                e[3] = (int32_t) g_basic0_ctrl.status;
            }
        }`),200,['nev',...list('ev',16),...list('e',4)],{sends:{80:'abc',120:'def'}});
 alike(stall);
 assert.deepEqual(stall.emulator.host,[...ENUMERATION,'STALL']);assert.equal(stall.emulator.output,'abcdef');
 assert.deepEqual(list('e',4).map(k=>stall.emulator.vars[k]),[0,1501,0,1]);
});

test('R_USB_Write of 0 bytes, BUSY, 64 / 128 / 200 bytes, Stop, PCDCC and wrong arguments: the same codes and bytes on both engines',{skip,timeout:600000},async()=>{
 const code=SERVICE+`
volatile int32_t e[40];
volatile int32_t n_e = 0;
static uint8_t big[200];
static uint8_t rb[64];
void hal_entry(void)
{
    int n = 0;
    for (int i = 0; i < 200; i++)
    {
        big[i] = (uint8_t) ('A' + (i % 26));
    }
    R_USB_Open(&g_basic0_ctrl, &g_basic0_cfg);
    serve_ms(40);
    e[n++] = (int32_t) R_USB_Write(&g_basic0_ctrl, big, 0, USB_CLASS_PCDC);
    e[n++] = (int32_t) R_USB_Write(&g_basic0_ctrl, NULL, 0, USB_CLASS_PCDC);
    serve_ms(5);
    e[n++] = (int32_t) R_USB_Write(&g_basic0_ctrl, NULL, 0, USB_CLASS_PCDC);
    serve_ms(5);
    e[n++] = (int32_t) R_USB_Write(&g_basic0_ctrl, big, 64, USB_CLASS_PCDC);
    e[n++] = (int32_t) R_USB_Write(&g_basic0_ctrl, big, 64, USB_CLASS_PCDC);
    serve_ms(5);
    e[n++] = (int32_t) R_USB_Write(&g_basic0_ctrl, big, 200, USB_CLASS_PCDC);
    e[n++] = (int32_t) R_USB_Stop(&g_basic0_ctrl, USB_TRANSFER_WRITE, USB_CLASS_PCDC);
    serve_ms(5);
    e[n++] = (int32_t) R_USB_Write(&g_basic0_ctrl, big, 128, USB_CLASS_PCDC);
    serve_ms(5);
    e[n++] = (int32_t) R_USB_Read(&g_basic0_ctrl, rb, 64, USB_CLASS_PCDC);
    e[n++] = (int32_t) R_USB_Write(&g_basic0_ctrl, big, 3, USB_CLASS_PCDC);
    serve_ms(5);
    e[n++] = (int32_t) R_USB_Write(&g_basic0_ctrl, big, 1, USB_CLASS_PCDCC);
    serve_ms(5);
    e[n++] = (int32_t) R_USB_Write(&g_basic0_ctrl, big, 2, USB_CLASS_PCDCC);
    e[n++] = (int32_t) R_USB_Write(&g_basic0_ctrl, big, 2, USB_CLASS_PCDCC);
    serve_ms(5);
    e[n++] = (int32_t) R_USB_Stop(&g_basic0_ctrl, USB_TRANSFER_WRITE, USB_CLASS_PCDC);
    e[n++] = (int32_t) R_USB_Stop(&g_basic0_ctrl, USB_TRANSFER_WRITE, USB_CLASS_PCDCC);
    e[n++] = (int32_t) R_USB_Stop(&g_basic0_ctrl, USB_TRANSFER_READ, USB_CLASS_PCDC);
    e[n++] = (int32_t) R_USB_Stop(&g_basic0_ctrl, (usb_transfer_t) 2, USB_CLASS_PCDC);
    e[n++] = (int32_t) R_USB_Write(&g_basic0_ctrl, big, 2, 0x10);
    e[n++] = (int32_t) R_USB_Write(&g_basic0_ctrl, big, 2, USB_CLASS_PHID);
    e[n++] = (int32_t) R_USB_Read(&g_basic0_ctrl, rb, 0, USB_CLASS_PCDC);
    e[n++] = (int32_t) R_USB_Read(&g_basic0_ctrl, rb, 2, USB_CLASS_PCDC2);
    e[n++] = (int32_t) R_USB_Callback(NULL);
    e[n++] = (int32_t) R_USB_PeriControlDataGet(&g_basic0_ctrl, NULL, 2);
    e[n++] = (int32_t) R_USB_PeriControlStatusSet(NULL, USB_SETUP_STATUS_ACK);
    n_e = n;
    while (1)
    {
        service();
    }
}
`;
 const r=await both(code,200,[...EVN,'n_e',...list('e',40)]);
 alike(r);
 const v=r.emulator.vars;
 assert.deepEqual(list('e',v.n_e).map(k=>v[k]),[0,1501,0,0,1501,0,0,0,0,0,0,0,1501,1500,1500,0,1506,1506,1506,1,1506,1,1,1]);
 assert.ok(r.emulator.output.length>0);
});

test('a copy of g_basic0_cfg with its own p_usb_apl_callback, given to R_USB_Open: that callback gets the events, on both engines',{skip,timeout:600000},async()=>{
 const code=SERVICE+`
volatile int32_t cb[16];
volatile int32_t ncb = 0;
static usb_cfg_t my_cfg;
void my_cb (usb_callback_args_t * p_args)
{
    if (ncb < 16)
    {
        cb[ncb++] = (int32_t) p_args->event;
    }
}
void hal_entry(void)
{
    my_cfg = g_basic0_cfg;
    my_cfg.p_usb_apl_callback = my_cb;
    R_USB_Open(&g_basic0_ctrl, &my_cfg);
    serve_ms(0);
    while (1)
    {
        service();
    }
}
`;
 const r=await both(code,100,['ncb','nev',...list('cb',16),...list('ev',16)]);
 alike(r);
 const v=r.emulator.vars,seq=[EV.DEFAULT,EV.CONFIGURED,EV.REQUEST,EV.REQUEST_COMPLETE,EV.REQUEST];
 assert.deepEqual(list('cb',v.ncb).map(k=>v[k]),seq);assert.deepEqual(list('ev',v.nev).map(k=>v[k]),seq);
});

test('the USB stack removed: the src/r_usb_pcdc_descriptor.c left in the project is not built, both engines run; with the stack again it is',{skip,timeout:600000},async()=>{
 const base=projectForBoard('fpb-ra6e1'),files=[{name:RA_USB_DESCRIPTOR_FILE,text:RA_USB_DESCRIPTOR_C}];
 const project=validateProject({...base,mcu:raDefaultMcu(),firmware:{...base.firmware,files}});
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'ra-usb-'));
 try{
  const prepared=await prepareBuild({project,tools,root,target:'arm'});
  assert.ok(!prepared.units.some(u=>path.basename(u.file)===RA_USB_DESCRIPTOR_FILE),'not compiled without the stack');
  const result=await build(prepared);
  assert.deepEqual(result.diagnostics.filter(d=>d.severity!=='info'),[]);
  const ew=[],emulator=new FirmwareSession(validateProject(project),{elf:new Uint8Array(await fs.readFile(result.elf)),warn:m=>ew.push(m)});run(emulator,50);
  const iw=[],interpreter=new SimulationSession(validateProject(project),{warn:m=>iw.push(m)});for(let t=1;t<=50;t++)interpreter.tick(t);
  assert.deepEqual(ew,[]);assert.deepEqual(iw,[]);assert.deepEqual([...emulator.soc.unknown.keys()],[]);
  const again=await prepareBuild({project:validateProject({...project,mcu:usbMcu()}),tools,root:await fs.mkdtemp(path.join(root,'again-')),target:'arm'});
  assert.ok(again.units.some(u=>path.basename(u.file)===RA_USB_DESCRIPTOR_FILE),'compiled with the stack');
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
