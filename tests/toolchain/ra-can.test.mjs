// Feature 40 with the real FSP: r_can built by ARM GCC with the generated ra_gen/ra_cfg and run on the RA6E1 emulator's
// CAN0 with the virtual node on its bus (emu/ra6e1/can.js), beside the same hal_entry.c on the built-in interpreter (its
// port of the driver on the same model, fsp-can.js). Both must give the same return codes, the same callbacks in the same
// order with the same mailboxes and frames, and the same frames to the node, with no register outside the model.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {FirmwareSession} from '../../src/firmware-session.js';
import {SimulationSession} from '../../src/session.js';
import {projectForBoard,validateProject} from '../../src/project.js';
import {raDefaultMcu,RA_LPM_DEFAULTS} from '../../src/ra-config.js';
import {raExample} from '../../src/ra-examples.js';

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
// The callbacks a program records: event, mailbox and, for a received frame, (low 23 bits of the ID << 8) | data[0] and
// DLC | type << 4 | id_mode << 8 (the frame of a transmit or error event is not set by the driver).
const LOG=`
volatile int32_t ev[32];
volatile int32_t mb[32];
volatile int32_t fr[32];
volatile int32_t dl[32];
volatile int32_t nev = 0;
static void note (can_callback_args_t * p_args, int32_t tag)
{
    if (nev >= 32)
    {
        return;
    }
    ev[nev] = (int32_t) p_args->event | tag;
    mb[nev] = (int32_t) p_args->mailbox;
    fr[nev] = 0;
    dl[nev] = 0;
    if (CAN_EVENT_RX_COMPLETE == p_args->event)
    {
        fr[nev] = (int32_t) (((p_args->frame.id & 0x7FFFFFU) << 8) | p_args->frame.data[0]);
        dl[nev] = (int32_t) (p_args->frame.data_length_code | ((uint32_t) p_args->frame.type << 4) | ((uint32_t) p_args->frame.id_mode << 8));
    }
    nev++;
}
void can_callback (can_callback_args_t * p_args)
{
    note(p_args, 0);
}
can_frame_t frame (uint32_t id, can_id_mode_t mode, uint8_t d0);
can_frame_t frame (uint32_t id, can_id_mode_t mode, uint8_t d0)
{
    can_frame_t f = { .id = id, .id_mode = mode, .type = CAN_FRAME_TYPE_DATA, .data_length_code = 1, .options = 0 };
    f.data[0] = d0;
    return f;
}
static void wait_ms (uint32_t ms)
{
    R_BSP_SoftwareDelay(ms, BSP_DELAY_UNITS_MILLISECONDS);
}
`;
const list=(prefix,n)=>Array.from({length:n},(_,i)=>`${prefix}[${i}]`);
const canMcu=(can={})=>({...raDefaultMcu(),peripherals:{CAN0:{enabled:true,...can}}});
const run=(s,ms)=>{for(let guard=0;guard<100000&&s.now<ms*1000-1;guard++)s.tick(Math.min(ms,Math.floor(s.now/1000)+1));};

/** Builds and runs `code` on both engines for `ms` (the node sending `sends` {at ms: line}); what each one ended with. */
async function both(code,ms,names,{can,sends={},project:given}={}){
 const base=projectForBoard('fpb-ra6e1');
 const project=given??validateProject({...base,mcu:canMcu(can),code:HEAD+LOG+code});
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'ra-can-'));
 try{
  const result=await build(await prepareBuild({project,tools,root,target:'arm'}));
  assert.deepEqual(result.diagnostics.filter(d=>d.severity!=='info'),[]);
  const vars=s=>Object.fromEntries(names.map(n=>[n,s.readVariable(n)]));
  const drive=(s,tick)=>{for(const at of [...Object.keys(sends).map(Number).sort((a,b)=>a-b),ms]){tick(at);if(sends[at]!==undefined)for(const line of [].concat(sends[at]))assert.ok(s.inject(line,'can:node')>0,line);}};
  const ew=[],emulator=new FirmwareSession(validateProject(project),{elf:new Uint8Array(await fs.readFile(result.elf)),warn:m=>ew.push(m)});
  drive(emulator,at=>run(emulator,at));
  const iw=[],interpreter=new SimulationSession(validateProject(project),{warn:m=>iw.push(m)});
  let t=0;drive(interpreter,at=>{for(;t<at;)interpreter.tick(++t);});
  return {emulator:{vars:vars(emulator),output:[...emulator.canOutput],warn:ew},interpreter:{vars:vars(interpreter),output:[...interpreter.canOutput],warn:iw},unknown:[...emulator.soc.unknown.keys()].map(a=>a.toString(16))};
 }finally{await fs.rm(root,{recursive:true,force:true});}
}
const events=(r,n)=>Array.from({length:r.vars.nev},(_,i)=>[r.vars[`ev[${i}]`],r.vars[`mb[${i}]`],r.vars[`fr[${i}]`],r.vars[`dl[${i}]`]]).slice(0,n);
const LOGGED=[...list('ev',32),...list('mb',32),...list('fr',32),...list('dl',32),'nev'];
const same=(r,expected)=>{
 assert.deepEqual(r.unknown,[],'no register outside the model');assert.deepEqual(r.emulator.warn,[]);assert.deepEqual(r.interpreter.warn,[]);
 // A transmit or error event's frame is the driver's uninitialised local on the emulator: only received frames compare.
 assert.deepEqual(r.interpreter.vars,r.emulator.vars);assert.deepEqual(r.interpreter.output,r.emulator.output);
 if(expected)assert.deepEqual(events(r.emulator,32),expected);
};
// A receive event's frame fields; a transmit or error event's.
const RX=(mailbox,id,d0,dlc=1,ext=0)=>[0x400,mailbox,((id&0x7fffff)<<8)|d0,dlc|(ext<<8)],TX=(mailbox,tag=0)=>[0x800|tag,mailbox,0,0];

test('loopback example: the same frames, callbacks and LEDs on both engines',{skip,timeout:300000},async()=>{
 const e=raExample('ra_can_loopback'),base=projectForBoard('fpb-ra6e1');
 const r=await both(null,2200,['g_tx_count','g_rx_count','g_rx_data'],{project:validateProject({...base,mcu:e.mcu(),code:e.code})});
 assert.deepEqual(r.emulator.vars,{g_tx_count:5,g_rx_count:5,g_rx_data:4});assert.deepEqual(r.interpreter.vars,r.emulator.vars);
 assert.deepEqual(r.emulator.output,[]);assert.deepEqual(r.interpreter.output,[]);assert.deepEqual(r.unknown,[]);
});

test('return codes (not open, receive mailbox, transmit in progress, bad DLC, Read unsupported), InfoGet, CallbackSet with memory, Close and Open again',{skip,timeout:300000},async()=>{
 const r=await both(`
volatile int32_t e[16];
volatile uint32_t st[4];
static can_callback_args_t g_memory;
static can_info_t g_info;
void other_callback (can_callback_args_t * p_args)
{
    note(p_args, 0x10000);
}
void hal_entry (void)
{
    can_frame_t f = frame(0x100, CAN_ID_MODE_STANDARD, 1);
    e[0] = (int32_t) R_CAN_Write(&g_can0_ctrl, 0, &f);
    e[1] = (int32_t) R_CAN_Open(&g_can0_ctrl, &g_can0_cfg);
    e[2] = (int32_t) R_CAN_ModeTransition(&g_can0_ctrl, CAN_OPERATION_MODE_NORMAL, CAN_TEST_MODE_LOOPBACK_INTERNAL);
    e[3] = (int32_t) R_CAN_Write(&g_can0_ctrl, 1, &f);
    e[4] = (int32_t) R_CAN_Write(&g_can0_ctrl, 0, &f);
    e[5] = (int32_t) R_CAN_Write(&g_can0_ctrl, 0, &f);
    f.data_length_code = 9;
    e[6] = (int32_t) R_CAN_Write(&g_can0_ctrl, 0, &f);
    f.data_length_code = 1;
    e[7] = (int32_t) R_CAN_Read(&g_can0_ctrl, 1, &f);
    wait_ms(2);
    e[8] = (int32_t) R_CAN_InfoGet(&g_can0_ctrl, &g_info);
    st[0] = g_info.status;
    e[9] = (int32_t) R_CAN_CallbackSet(&g_can0_ctrl, other_callback, NULL, &g_memory);
    f.data[0] = 2;
    e[10] = (int32_t) R_CAN_Write(&g_can0_ctrl, 0, &f);
    wait_ms(2);
    e[11] = (int32_t) R_CAN_Close(&g_can0_ctrl);
    e[12] = (int32_t) R_CAN_Write(&g_can0_ctrl, 0, &f);
    e[13] = (int32_t) R_CAN_Open(&g_can0_ctrl, &g_can0_cfg);
    e[14] = (int32_t) R_CAN_ModeTransition(&g_can0_ctrl, CAN_OPERATION_MODE_NORMAL, CAN_TEST_MODE_LOOPBACK_INTERNAL);
    f.data[0] = 3;
    e[15] = (int32_t) R_CAN_Write(&g_can0_ctrl, 0, &f);
    wait_ms(2);
    R_CAN_InfoGet(&g_can0_ctrl, &g_info);
    st[1] = g_info.status;
    st[2] = g_memory.mailbox;
    while (1)
    {
        wait_ms(1);
    }
}`,12,[...LOGGED,...list('e',16),...list('st',3)]);
 const tagged=([e,...rest])=>[e|0x10000,...rest];
 same(r,[RX(1,0x100,1),TX(0),tagged(RX(1,0x100,2)),TX(0,0x10000),RX(1,0x100,3),TX(0)]);
 assert.deepEqual(list('e',16).map(n=>r.emulator.vars[n]),[7,0,0,60004,0,60003,3,6,0,0,0,0,7,0,0,0]);
 assert.equal(r.emulator.vars['st[0]']&0x713,0,'CAN operation mode; the ISRs left no NEWDATA, SENTDATA or MSGLOST');
 assert.equal(r.emulator.vars['st[2]'],0,'the callback memory is restored after each callback');
});

test('acceptance filter and mask, transmit order by ID, listen only, halt: with the virtual node in normal mode',{skip,timeout:300000},async()=>{
 const can={mailboxes:[{type:'TRANSMIT',id:0},{type:'TRANSMIT',id:0},{type:'RECEIVE',id:0x100},{type:'RECEIVE',id:0x200}],mask:0x700};
 const r=await both(`
volatile int32_t e[4];
void hal_entry (void)
{
    can_frame_t a = frame(0x300, CAN_ID_MODE_STANDARD, 0x30);
    can_frame_t b = frame(0x050, CAN_ID_MODE_STANDARD, 0x05);
    can_frame_t c = frame(0x111, CAN_ID_MODE_STANDARD, 0x11);
    R_CAN_Open(&g_can0_ctrl, &g_can0_cfg);
    wait_ms(10);
    /* Two requests while halted: the lower ID wins the bus first. */
    R_CAN_ModeTransition(&g_can0_ctrl, CAN_OPERATION_MODE_HALT, CAN_TEST_MODE_DISABLED);
    R_CAN_Write(&g_can0_ctrl, 0, &a);
    R_CAN_Write(&g_can0_ctrl, 1, &b);
    R_CAN_ModeTransition(&g_can0_ctrl, CAN_OPERATION_MODE_NORMAL, CAN_TEST_MODE_DISABLED);
    wait_ms(10);
    /* Listen only: the request waits, the node is heard. */
    R_CAN_ModeTransition(&g_can0_ctrl, CAN_OPERATION_MODE_NORMAL, CAN_TEST_MODE_LISTEN);
    e[0] = (int32_t) R_CAN_Write(&g_can0_ctrl, 0, &c);
    wait_ms(10);
    e[1] = (int32_t) R_CAN_Write(&g_can0_ctrl, 0, &c);
    R_CAN_ModeTransition(&g_can0_ctrl, CAN_OPERATION_MODE_NORMAL, CAN_TEST_MODE_DISABLED);
    wait_ms(10);
    /* Halt: the node's frame is lost. */
    R_CAN_ModeTransition(&g_can0_ctrl, CAN_OPERATION_MODE_HALT, CAN_TEST_MODE_DISABLED);
    wait_ms(10);
    R_CAN_ModeTransition(&g_can0_ctrl, CAN_OPERATION_MODE_NORMAL, CAN_TEST_MODE_DISABLED);
    while (1)
    {
        wait_ms(1);
    }
}`,60,[...LOGGED,...list('e',2)],{can,sends:{3:'1AB 01',4:'2cd 02 ff',5:'3EF 03',6:'123 R 2',7:'0123 04',25:'100 09',45:'100 0A'}});
 same(r,[RX(2,0x1ab,1),RX(3,0x2cd,2,2),TX(1),TX(0),RX(2,0x100,9),TX(0)]);
 assert.deepEqual(r.emulator.output,['050 [1] 05','300 [1] 30','111 [1] 11']);
 assert.deepEqual([r.emulator.vars['e[0]'],r.emulator.vars['e[1]']],[0,60003]);
});

test('extended ID mode: 29-bit IDs in and out, a standard frame is not taken',{skip,timeout:300000},async()=>{
 const can={idMode:'EXTENDED',mailboxes:[{type:'TRANSMIT',id:0},{type:'RECEIVE',id:0x1ABCDEF0},{type:'RECEIVE',id:0x100},{type:'RECEIVE',id:2}],mask:0x1FFFFFFF};
 const r=await both(`
void hal_entry (void)
{
    can_frame_t a = frame(0x01234567, CAN_ID_MODE_EXTENDED, 0x77);
    R_CAN_Open(&g_can0_ctrl, &g_can0_cfg);
    wait_ms(10);
    R_CAN_Write(&g_can0_ctrl, 0, &a);
    while (1)
    {
        wait_ms(1);
    }
}`,20,LOGGED,{can,sends:{3:'1ABCDEF0 01 02',4:'00000100 05',5:'123 07'}});
 same(r,[RX(1,0x1abcdef0,1,2,1),RX(2,0x100,5,1,1),TX(0)]);assert.deepEqual(r.emulator.output,['01234567 [1] 77']);
});

test('message lost: overwrite mode (the generated configuration) and overrun mode (a configuration in the code)',{skip,timeout:300000},async()=>{
 const r=await both(`
volatile uint32_t st[2];
static can_info_t g_info;
static can_extended_cfg_t g_ext;
static can_cfg_t g_cfg;
void hal_entry (void)
{
    R_CAN_Open(&g_can0_ctrl, &g_can0_cfg);
    __disable_irq();
    wait_ms(10);
    __enable_irq();
    wait_ms(2);
    R_CAN_InfoGet(&g_can0_ctrl, &g_info);
    st[0] = g_info.status;
    R_CAN_Close(&g_can0_ctrl);
    g_ext = g_can0_extended_cfg;
    g_ext.message_mode = CAN_MESSAGE_MODE_OVERRUN;
    g_cfg = g_can0_cfg;
    g_cfg.p_extend = &g_ext;
    R_CAN_Open(&g_can0_ctrl, &g_cfg);
    __disable_irq();
    wait_ms(10);
    __enable_irq();
    wait_ms(2);
    R_CAN_InfoGet(&g_can0_ctrl, &g_info);
    st[1] = g_info.status;
    while (1)
    {
        wait_ms(1);
    }
}`,40,[...LOGGED,...list('st',2)],{sends:{3:'100 01',5:'100 02',17:'100 03',19:'100 04'}});
 same(r,[RX(1,0x100,2),[0x20,1,0,0],RX(1,0x100,3)]);
 assert.equal(r.emulator.vars['st[0]']&0x10,0x10,'overwrite: MSGLOST stays (CAN_STATUS_NORMAL_MBOX_MESSAGE_LOST)');assert.equal(r.emulator.vars['st[1]']&0x10,0,'overrun: the error ISR cleared it');
});

// ---- The review's programs (feature 40 review): a fuller log (every callback's channel and context, a received frame's
// options and a checksum of its data bytes), return codes e[] and states st[].
const RLOG=`
volatile int32_t ev[48];
volatile int32_t mb[48];
volatile int32_t fr[48];
volatile int32_t dl[48];
volatile int32_t cx[48];
volatile int32_t nev = 0;
volatile int32_t e[32];
volatile uint32_t st[16];
static void note (can_callback_args_t * p_args, int32_t tag)
{
    if (nev >= 48)
    {
        return;
    }
    ev[nev] = (int32_t) p_args->event | tag;
    mb[nev] = (int32_t) p_args->mailbox;
    fr[nev] = 0;
    dl[nev] = 0;
    cx[nev] = (int32_t) ((uint32_t) p_args->channel * 1000U + (NULL != p_args->p_context ? *(uint32_t *) p_args->p_context : 0U));
    if (CAN_EVENT_RX_COMPLETE == p_args->event)
    {
        uint32_t sum = 0;
        for (uint32_t i = 0; i < p_args->frame.data_length_code; i++) { sum = sum * 3U + p_args->frame.data[i]; }
        fr[nev] = (int32_t) p_args->frame.id;
        dl[nev] = (int32_t) (p_args->frame.data_length_code | ((uint32_t) p_args->frame.type << 4) | ((uint32_t) p_args->frame.id_mode << 8) | (p_args->frame.options << 12) | (sum << 16));
    }
    nev++;
}
can_frame_t frame (uint32_t id, can_id_mode_t mode, uint8_t d0);
can_frame_t frame (uint32_t id, can_id_mode_t mode, uint8_t d0)
{
    can_frame_t f = { .id = id, .id_mode = mode, .type = CAN_FRAME_TYPE_DATA, .data_length_code = 1, .options = 0 };
    f.data[0] = d0;
    return f;
}
static void wait_ms (uint32_t ms)
{
    R_BSP_SoftwareDelay(ms, BSP_DELAY_UNITS_MILLISECONDS);
}
`;
const RCB=`
void can_callback (can_callback_args_t * p_args)
{
    note(p_args, 0);
}
`;
const RLOGGED=(withSt)=>[...list('ev',48),...list('mb',48),...list('fr',48),...list('dl',48),...list('cx',48),'nev',...list('e',32),...(withSt?list('st',16):[])];
/** Builds and runs a review program on both engines; they must end with the same variables and node lines. */
async function review(code,ms,{can,sends,peripherals={},st=false}={}){
 const base=projectForBoard('fpb-ra6e1'),mcu={...raDefaultMcu(),peripherals:{...peripherals,CAN0:{enabled:true,...can}}};
 const r=await both(null,ms,RLOGGED(st),{sends,project:validateProject({...base,mcu,code:HEAD+RLOG+code})});
 assert.deepEqual(r.unknown,[],'no register outside the model');
 assert.deepEqual(r.interpreter.vars,r.emulator.vars);assert.deepEqual(r.interpreter.output,r.emulator.output);
 const v=r.emulator.vars;
 return {...r,log:Array.from({length:v.nev},(_,i)=>[v[`ev[${i}]`],v[`mb[${i}]`]]),v};
}
const TXS={mailboxes:[{type:'TRANSMIT',id:0},{type:'TRANSMIT',id:0},{type:'TRANSMIT',id:0},{type:'RECEIVE',id:0x100}],mask:0};
const TWO={mailboxes:[{type:'TRANSMIT',id:0},{type:'TRANSMIT',id:0},{type:'RECEIVE',id:0x100},{type:'RECEIVE',id:0x101}],mask:0x7FF};

test('review: Close takes the CAN interrupts waiting away (with interrupts off, from a callback, with a frame on its way)',{skip,timeout:300000},async()=>{
 const r=await review(`
volatile int32_t close_in_cb = 0;
void can_callback (can_callback_args_t * p_args)
{
    note(p_args, 0);
    if (close_in_cb)
    {
        close_in_cb = 0;
        e[20] = (int32_t) R_CAN_Close(&g_can0_ctrl);
    }
}
void hal_entry (void)
{
    can_frame_t a = frame(0x100, CAN_ID_MODE_STANDARD, 0x30);
    R_CAN_Open(&g_can0_ctrl, &g_can0_cfg);
    R_CAN_ModeTransition(&g_can0_ctrl, CAN_OPERATION_MODE_NORMAL, CAN_TEST_MODE_LOOPBACK_INTERNAL);
    __disable_irq();
    e[0] = (int32_t) R_CAN_Write(&g_can0_ctrl, 0, &a);
    wait_ms(2);
    e[1] = (int32_t) R_CAN_Close(&g_can0_ctrl);
    __enable_irq();
    wait_ms(2);
    st[0] = (uint32_t) nev;
    e[2] = (int32_t) R_CAN_Open(&g_can0_ctrl, &g_can0_cfg);
    e[3] = (int32_t) R_CAN_ModeTransition(&g_can0_ctrl, CAN_OPERATION_MODE_NORMAL, CAN_TEST_MODE_LOOPBACK_INTERNAL);
    wait_ms(2);
    st[1] = (uint32_t) nev;
    a.data[0] = 0x31;
    e[4] = (int32_t) R_CAN_Write(&g_can0_ctrl, 0, &a);
    wait_ms(2);
    st[2] = (uint32_t) nev;
    close_in_cb = 1;
    a.data[0] = 0x32;
    e[5] = (int32_t) R_CAN_Write(&g_can0_ctrl, 0, &a);
    wait_ms(2);
    st[3] = (uint32_t) nev;
    e[6] = (int32_t) R_CAN_Open(&g_can0_ctrl, &g_can0_cfg);
    e[7] = (int32_t) R_CAN_ModeTransition(&g_can0_ctrl, CAN_OPERATION_MODE_NORMAL, CAN_TEST_MODE_LOOPBACK_INTERNAL);
    a.data[0] = 0x33;
    e[8] = (int32_t) R_CAN_Write(&g_can0_ctrl, 0, &a);
    wait_ms(2);
    st[4] = (uint32_t) nev;
    a.data[0] = 0x34;
    e[9] = (int32_t) R_CAN_Write(&g_can0_ctrl, 0, &a);
    e[10] = (int32_t) R_CAN_Close(&g_can0_ctrl);
    wait_ms(2);
    e[11] = (int32_t) R_CAN_Open(&g_can0_ctrl, &g_can0_cfg);
    e[12] = (int32_t) R_CAN_ModeTransition(&g_can0_ctrl, CAN_OPERATION_MODE_NORMAL, CAN_TEST_MODE_LOOPBACK_INTERNAL);
    wait_ms(2);
    st[5] = (uint32_t) nev;
    a.data[0] = 0x35;
    e[13] = (int32_t) R_CAN_Write(&g_can0_ctrl, 0, &a);
    wait_ms(2);
    while (1) { wait_ms(1); }
}`,40,{st:true});
 assert.deepEqual([0,1,2,3,4,5].map(i=>r.v[`st[${i}]`]),[0,0,2,3,5,5],'nothing from before a Close');
});

test('review: CAN interrupts waiting together are taken as the NVIC takes them (receive, receive, transmit, transmit)',{skip,timeout:300000},async()=>{
 const r=await review(RCB+`
void hal_entry (void)
{
    can_frame_t a = frame(0x100, CAN_ID_MODE_STANDARD, 0xA0);
    can_frame_t b = frame(0x101, CAN_ID_MODE_STANDARD, 0xB0);
    R_CAN_Open(&g_can0_ctrl, &g_can0_cfg);
    R_CAN_ModeTransition(&g_can0_ctrl, CAN_OPERATION_MODE_NORMAL, CAN_TEST_MODE_LOOPBACK_INTERNAL);
    __disable_irq();
    R_CAN_Write(&g_can0_ctrl, 0, &a);
    R_CAN_Write(&g_can0_ctrl, 1, &b);
    R_BSP_SoftwareDelay(2, BSP_DELAY_UNITS_MILLISECONDS);
    __enable_irq();
    R_BSP_SoftwareDelay(2, BSP_DELAY_UNITS_MILLISECONDS);
    e[0] = 1;
    while (1) { wait_ms(1); }
}`,20,{can:TWO});
 assert.deepEqual(r.log,[[0x400,2],[0x400,3],[0x800,0],[0x800,1]]);
});

test('review: overrun mode with interrupts off — the error interrupt three times (one a lost mailbox), then the receive interrupts',{skip,timeout:300000},async()=>{
 const r=await review(RCB+`
static can_extended_cfg_t g_ext;
static can_cfg_t g_cfg;
void hal_entry (void)
{
    can_info_t info;
    g_ext = g_can0_extended_cfg; g_ext.message_mode = CAN_MESSAGE_MODE_OVERRUN;
    g_cfg = g_can0_cfg; g_cfg.p_extend = &g_ext;
    R_CAN_Open(&g_can0_ctrl, &g_cfg);
    e[0] = 1;
    __disable_irq();
    R_BSP_SoftwareDelay(6500, BSP_DELAY_UNITS_MICROSECONDS);
    R_CAN_InfoGet(&g_can0_ctrl, &info); st[0] = info.status;
    __enable_irq();
    R_BSP_SoftwareDelay(1000, BSP_DELAY_UNITS_MICROSECONDS);
    R_CAN_InfoGet(&g_can0_ctrl, &info); st[1] = info.status;
    while (1) { wait_ms(1); }
}`,30,{st:true,sends:{2:['100 11','101 12','102 13'],3:['100 14','101 15','102 16'],4:['100 17'],9:['100 21','101 22']}});
 assert.deepEqual(r.log.slice(0,6),[[0x20,1],[0x20,2],[0x20,3],[0x400,1],[0x400,2],[0x400,3]]);
});

test('review: p_args->buffer is the mailbox; a configuration copy with a 4-entry mailbox array; a remote frame in loopback',{skip,timeout:300000},async()=>{
 const b=await review(`
void can_callback (can_callback_args_t * p_args)
{
    note(p_args, 0);
    st[0] = p_args->buffer + 100U;
}
void hal_entry (void)
{
    can_frame_t a = frame(0x100, CAN_ID_MODE_STANDARD, 0xA0);
    R_CAN_Open(&g_can0_ctrl, &g_can0_cfg);
    R_CAN_ModeTransition(&g_can0_ctrl, CAN_OPERATION_MODE_NORMAL, CAN_TEST_MODE_LOOPBACK_INTERNAL);
    e[0] = (int32_t) R_CAN_Write(&g_can0_ctrl, CAN_MAILBOX_ID_0, &a);
    wait_ms(2);
    e[1] = 1;
    while (1) { wait_ms(1); }
}`,10,{st:true});
 assert.deepEqual(b.log,[[0x400,1],[0x800,0]]);assert.equal(b.v['st[0]'],100,'the last callback (transmit, MB0)');
 const f=await review(RCB+`
static can_extended_cfg_t g_ext;
static can_cfg_t g_cfg;
static can_mailbox_t g_four[4];
void hal_entry (void)
{
    can_frame_t a = frame(0x321, CAN_ID_MODE_STANDARD, 0xA0);
    g_ext = g_can0_extended_cfg; g_cfg = g_can0_cfg; g_cfg.p_extend = &g_ext; g_ext.p_mailbox = g_four;
    for (int i = 0; i < 4; i++) { g_four[i] = g_can0_extended_cfg.p_mailbox[i]; }
    g_four[1].mailbox_id = 0x321;
    e[0] = (int32_t) R_CAN_Open(&g_can0_ctrl, &g_cfg);
    e[1] = (int32_t) R_CAN_ModeTransition(&g_can0_ctrl, CAN_OPERATION_MODE_NORMAL, CAN_TEST_MODE_LOOPBACK_INTERNAL);
    e[2] = (int32_t) R_CAN_Write(&g_can0_ctrl, 0, &a);
    wait_ms(2);
    e[3] = 1;
    while (1) { wait_ms(1); }
}`,10);
 assert.deepEqual(f.log,[[0x400,1],[0x800,0]]);assert.equal(f.v['fr[0]'],0x321);
 // A remote frame (DLC 5): it comes back with the ID and the DLC and no data (the receive mailbox's data bytes stay).
 const m=await review(RCB+`
static can_mailbox_t g_mbs[32];
static can_extended_cfg_t g_ext;
static can_cfg_t g_cfg;
void hal_entry (void)
{
    can_frame_t a = frame(0x321, CAN_ID_MODE_STANDARD, 0xA0);
    g_ext = g_can0_extended_cfg; g_cfg = g_can0_cfg; g_cfg.p_extend = &g_ext;
    for (int i = 0; i < 32; i++) { g_mbs[i] = g_can0_extended_cfg.p_mailbox[i]; }
    g_mbs[1].mailbox_id = 0x321; g_mbs[1].frame_type = CAN_FRAME_TYPE_REMOTE; g_ext.p_mailbox = g_mbs;
    R_CAN_Open(&g_can0_ctrl, &g_cfg);
    R_CAN_ModeTransition(&g_can0_ctrl, CAN_OPERATION_MODE_NORMAL, CAN_TEST_MODE_LOOPBACK_INTERNAL);
    a.type = CAN_FRAME_TYPE_REMOTE; a.data_length_code = 5; a.data[0] = 0x77;
    e[0] = (int32_t) R_CAN_Write(&g_can0_ctrl, 0, &a);
    wait_ms(2);
    while (1) { wait_ms(1); }
}`,10);
 assert.deepEqual(m.log,[[0x400,1],[0x800,0]]);assert.equal(m.v['dl[0]'],0x15,'remote, DLC 5, no data');
});

test('review: Write from the callback (a chain of transmissions, a received frame sent back)',{skip,timeout:300000},async()=>{
 const r=await review(`
volatile int32_t chain = 0;
void can_callback (can_callback_args_t * p_args)
{
    note(p_args, 0);
    if ((CAN_EVENT_TX_COMPLETE == p_args->event) && (chain < 4))
    {
        can_frame_t f = frame(0x100U + (uint32_t) chain, CAN_ID_MODE_STANDARD, (uint8_t) chain);
        chain++;
        e[chain] = (int32_t) R_CAN_Write(&g_can0_ctrl, p_args->mailbox, &f);
    }
    if ((CAN_EVENT_RX_COMPLETE == p_args->event) && (p_args->frame.id == 0x7A0))
    {
        can_frame_t f = p_args->frame;
        f.id = 0x7A1;
        e[10 + chain] = (int32_t) R_CAN_Write(&g_can0_ctrl, 1, &f);
    }
}
void hal_entry (void)
{
    can_frame_t a = frame(0x7A0, CAN_ID_MODE_STANDARD, 0x30);
    R_CAN_Open(&g_can0_ctrl, &g_can0_cfg);
    R_CAN_ModeTransition(&g_can0_ctrl, CAN_OPERATION_MODE_NORMAL, CAN_TEST_MODE_LOOPBACK_INTERNAL);
    e[0] = (int32_t) R_CAN_Write(&g_can0_ctrl, 0, &a);
    wait_ms(10);
    while (1) { wait_ms(1); }
}`,20,{can:TXS});
 assert.ok(r.log.length>=6);
});

test('review: an MCU reset (NVIC_SystemReset) with a frame on the bus and the node\'s frames waiting',{skip,timeout:300000},async()=>{
 const r=await review(RCB+`
void hal_entry (void)
{
    can_frame_t a = frame(0x100, CAN_ID_MODE_STANDARD, 0xA0);
    uint32_t again = R_SYSTEM->RSTSR1_b.SWRF;
    e[0] = (int32_t) again;
    e[1] = (int32_t) R_CAN_Open(&g_can0_ctrl, &g_can0_cfg);
    a.data[0] = (uint8_t) (0xA0U + again);
    e[2] = (int32_t) R_CAN_Write(&g_can0_ctrl, 0, &a);
    if (!again)
    {
        R_BSP_SoftwareDelay(5180, BSP_DELAY_UNITS_MICROSECONDS);
        a.data[0] = 0xEE;
        R_CAN_Write(&g_can0_ctrl, 0, &a);
        NVIC_SystemReset();
    }
    R_BSP_SoftwareDelay(3500, BSP_DELAY_UNITS_MICROSECONDS);
    a.data[0] = 0xB0;
    e[3] = (int32_t) R_CAN_Write(&g_can0_ctrl, 0, &a);
    while (1) { wait_ms(1); }
}`,40,{sends:{2:'101 01',5:['101 02','101 03','101 04','101 05'],6:'102 06',12:'102 09'}});
 assert.equal(r.v['e[0]'],1,'the program runs again after the reset');
});

test('review: Sleep mode (r_lpm) — a CAN interrupt wakes the core',{skip,timeout:300000},async()=>{
 const r=await review(RCB+`
void hal_entry (void)
{
    R_CAN_Open(&g_can0_ctrl, &g_can0_cfg);
    e[0] = (int32_t) R_LPM_Open(&g_lpm0_ctrl, &g_lpm0_cfg);
    for (int i = 0; i < 3; i++)
    {
        e[1 + i] = (int32_t) R_LPM_LowPowerModeEnter(&g_lpm0_ctrl);
        st[i] = (uint32_t) nev;
    }
    e[10] = 1;
    while (1) { wait_ms(1); }
}`,40,{st:true,sends:{5:'100 01',9:'555 02',12:'101 03',20:'102 04'},peripherals:{LPM:{enabled:true,...RA_LPM_DEFAULTS,wake:[],cancel:[],cancelRising:[]}}});
 assert.equal(r.v['e[10]'],1);assert.deepEqual([0,1,2].map(i=>r.v[`st[${i}]`]),[1,2,3]);
});
