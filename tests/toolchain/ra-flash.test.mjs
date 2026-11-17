// Feature 39 with the real FSP: r_flash_hp built by ARM GCC with the generated ra_gen/ra_cfg and run on the RA6E1
// emulator's flash sequencer, beside the same hal_entry.c on the built-in interpreter (its port of the driver on the
// same sequencer model). Both must give the same return codes, callback events, data flash contents and notes.
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

const require=createRequire(import.meta.url),{prepareBuild,build,detectTools}=require('../../desktop/native-build.cjs');
const tools=await detectTools({armGcc:process.env.ARM_GCC||''});
const skip=!(tools.armGcc&&tools.fsp)&&!process.env.CI_REQUIRE_TOOLCHAIN&&'ARM GCC / Renesas FSP not installed';
const HEAD='#include "hal_data.h"\n#include <string.h>\nvoid R_BSP_WarmStart(bsp_warm_start_event_t event);\nvoid R_BSP_WarmStart(bsp_warm_start_event_t event)\n{\n    if (BSP_WARM_START_POST_C == event)\n    {\n        R_IOPORT_Open(&IOPORT_CFG_CTRL, &IOPORT_CFG_NAME);\n    }\n}\nvoid external_irq1_callback(external_irq_callback_args_t *p_args) { (void) p_args; }\n';
const run=(s,ms)=>{for(let guard=0;guard<100000&&s.now<ms*1000-1;guard++)s.tick(Math.min(ms,Math.floor(s.now/1000)+1));};

/** Builds and runs `code` on both engines for `ms`; returns what each one ended with. */
async function both(flash,code,ms,names,{dataFlash}={}){
 const mcu={...raDefaultMcu(),peripherals:{FLASH:flash}},project=validateProject({...projectForBoard('fpb-ra6e1'),mcu,code:HEAD+code,...(dataFlash?{dataFlash}:{})});
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'ra-flash-'));
 try{
  const result=await build(await prepareBuild({project,tools,root,target:'arm'}));
  assert.deepEqual(result.diagnostics.filter(d=>d.severity!=='info'),[]);
  const read=(session,warn)=>({vars:Object.fromEntries(names.map(n=>[n,session.readVariable(n)])),flash:session.dataFlash.encode(),warn:warn.filter(w=>/^\[FLASH\]/.test(w))});
  const ew=[],emulator=new FirmwareSession(validateProject(project),{elf:new Uint8Array(await fs.readFile(result.elf)),warn:m=>ew.push(m)});
  run(emulator,ms);
  const iw=[],interpreter=new SimulationSession(validateProject(project),{warn:m=>iw.push(m)});
  for(let t=1;t<=ms;t++)interpreter.tick(t);
  return {emulator:read(emulator,ew),interpreter:read(interpreter,iw),unknown:[...emulator.soc.unknown.keys()].map(a=>a.toString(16)),session:emulator};
 }finally{await fs.rm(root,{recursive:true,force:true});}
}
/**
 * Like both(), for programs that may stop: the error each engine stopped with (the emulator stops at the HardFault
 * handler's breakpoint: `halted`), the [FLASH] notes, the MCU resets; `peripherals` beside FLASH (a watchdog).
 */
async function bothStops(flash,code,ms,names,{dataFlash,peripherals={}}={}){
 const mcu={...raDefaultMcu(),peripherals:{FLASH:flash,...peripherals}},project=validateProject({...projectForBoard('fpb-ra6e1'),mcu,code:HEAD+code,...(dataFlash?{dataFlash}:{})});
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'ra-flash-'));
 try{
  const result=await build(await prepareBuild({project,tools,root,target:'arm'}));
  assert.deepEqual(result.diagnostics.filter(d=>d.severity!=='info'),[]);
  const read=(session,warn,error)=>({vars:Object.fromEntries(names.map(n=>[n,session.readVariable(n)])),flash:session.dataFlash.encode(),warn:warn.filter(w=>/^\[FLASH\]/.test(w)),error});
  const ew=[],emulator=new FirmwareSession(validateProject(project),{elf:new Uint8Array(await fs.readFile(result.elf)),warn:m=>ew.push(m)});
  let eerr=null;try{run(emulator,ms);}catch(error){eerr=error.message;}
  const iw=[],interpreter=new SimulationSession(validateProject(project),{warn:m=>iw.push(m)});
  let ierr=null;try{for(let t=1;t<=ms;t++)interpreter.tick(t);}catch(error){ierr=error.message;}
  return {emulator:{...read(emulator,ew,eerr),halted:emulator.runtime.debug.paused,resets:emulator.resets.map(x=>x.reason)},interpreter:{...read(interpreter,iw,ierr),resets:interpreter.runtime.resetCount??0},unknown:[...emulator.soc.unknown.keys()].map(a=>a.toString(16))};
 }finally{await fs.rm(root,{recursive:true,force:true});}
}
const list=(prefix,n)=>Array.from({length:n},(_,i)=>`${prefix}[${i}]`);
const values=(vars,prefix,n)=>list(prefix,n).map(k=>vars[k]);

test('r_flash_hp without background operation: return codes in the driver\'s order, blank check, erase, write, read back, a structure — the same on both engines',{skip,timeout:600000},async()=>{
 const code=`
typedef struct { uint16_t magic; uint8_t brightness; uint8_t mode; uint32_t period_ms; char name[8]; } settings_t;
static settings_t settings = { .magic = 0xA55A, .brightness = 80, .mode = 2, .period_ms = 1500, .name = "RA6E1" };
static uint32_t value = 0x12345678U;
static uint8_t odd[8] = { 1, 2, 3, 4, 5, 6, 7, 8 };
volatile int32_t e[48];
volatile uint32_t v[12];
volatile uint32_t finished = 0;
void hal_entry(void)
{
    int n = 0;
    flash_result_t r = FLASH_RESULT_BLANK;
    flash_status_t s = FLASH_STATUS_BUSY;
    flash_info_t info;
    /* Before Open. */
    e[n++] = (int32_t) R_FLASH_HP_Write(&g_flash0_ctrl, (uint32_t) &value, 0x08000000U, 4);
    e[n++] = (int32_t) R_FLASH_HP_Erase(&g_flash0_ctrl, 0x08000000U, 1);
    e[n++] = (int32_t) R_FLASH_HP_BlankCheck(&g_flash0_ctrl, 0x08000000U, 4, &r);
    e[n++] = (int32_t) R_FLASH_HP_StatusGet(&g_flash0_ctrl, &s);
    e[n++] = (int32_t) R_FLASH_HP_Close(&g_flash0_ctrl);
    e[n++] = (int32_t) R_FLASH_HP_Reset(&g_flash0_ctrl);
    e[n++] = (int32_t) R_FLASH_HP_Open(&g_flash0_ctrl, NULL);
    e[n++] = (int32_t) R_FLASH_HP_Open(NULL, &g_flash0_cfg);
    e[n++] = (int32_t) R_FLASH_HP_Open(&g_flash0_ctrl, &g_flash0_cfg);
    e[n++] = (int32_t) R_FLASH_HP_Open(&g_flash0_ctrl, &g_flash0_cfg);
    /* Write parameters. */
    e[n++] = (int32_t) R_FLASH_HP_Write(&g_flash0_ctrl, (uint32_t) &value, 0x00001000U, 4);
    e[n++] = (int32_t) R_FLASH_HP_Write(&g_flash0_ctrl, (uint32_t) &value, 0x08002000U, 4);
    e[n++] = (int32_t) R_FLASH_HP_Write(&g_flash0_ctrl, (uint32_t) odd, 0x08001FFCU, 8);
    e[n++] = (int32_t) R_FLASH_HP_Write(&g_flash0_ctrl, (uint32_t) &value, 0x08000002U, 4);
    e[n++] = (int32_t) R_FLASH_HP_Write(&g_flash0_ctrl, (uint32_t) odd, 0x08000000U, 6);
    e[n++] = (int32_t) R_FLASH_HP_Write(&g_flash0_ctrl, (uint32_t) &value, 0x08000000U, 0);
    e[n++] = (int32_t) R_FLASH_HP_Write(NULL, (uint32_t) &value, 0x08000000U, 4);
    /* Erase parameters. */
    e[n++] = (int32_t) R_FLASH_HP_Erase(&g_flash0_ctrl, 0x08000000U, 0);
    e[n++] = (int32_t) R_FLASH_HP_Erase(&g_flash0_ctrl, 0x08002000U, 1);
    e[n++] = (int32_t) R_FLASH_HP_Erase(&g_flash0_ctrl, 0x00008000U, 1);
    e[n++] = (int32_t) R_FLASH_HP_Erase(&g_flash0_ctrl, 0x08001FC0U, 2);
    e[n++] = (int32_t) R_FLASH_HP_Erase(&g_flash0_ctrl, 0x08001FFFU, 1);
    /* Blank check parameters. */
    e[n++] = (int32_t) R_FLASH_HP_BlankCheck(&g_flash0_ctrl, 0x08000001U, 3, &r);
    e[n++] = (int32_t) R_FLASH_HP_BlankCheck(&g_flash0_ctrl, 0x08000000U, 4, NULL);
    e[n++] = (int32_t) R_FLASH_HP_BlankCheck(&g_flash0_ctrl, 0x07FFFFFCU, 4, &r);
    e[n++] = (int32_t) R_FLASH_HP_BlankCheck(&g_flash0_ctrl, 0x08001FFFU, 2, &r);
    e[n++] = (int32_t) R_FLASH_HP_BlankCheck(&g_flash0_ctrl, 0x08000000U, 0, &r);
    e[n++] = (int32_t) R_FLASH_HP_StatusGet(&g_flash0_ctrl, NULL);
    e[n++] = (int32_t) R_FLASH_HP_InfoGet(&g_flash0_ctrl, NULL);
    /* Erase, write, write again without an erase, erase and write again. */
    e[n++] = (int32_t) R_FLASH_HP_Erase(&g_flash0_ctrl, 0x08000000U, 1);
    e[n++] = (int32_t) R_FLASH_HP_Write(&g_flash0_ctrl, (uint32_t) &value, 0x08000000U, 4);
    e[n++] = (int32_t) R_FLASH_HP_BlankCheck(&g_flash0_ctrl, 0x08000000U, 8, &r);
    v[0] = (uint32_t) r;
    e[n++] = (int32_t) R_FLASH_HP_BlankCheck(&g_flash0_ctrl, 0x08000004U, 60, &r);
    v[1] = (uint32_t) r;
    value = 0x0F0F0F0FU;
    e[n++] = (int32_t) R_FLASH_HP_Write(&g_flash0_ctrl, (uint32_t) &value, 0x08000000U, 4);
    e[n++] = (int32_t) R_FLASH_HP_StatusGet(&g_flash0_ctrl, &s);
    v[2] = (uint32_t) s;
    v[3] = *(uint32_t *) 0x08000000U;
    e[n++] = (int32_t) R_FLASH_HP_Erase(&g_flash0_ctrl, 0x08000000U, 1);
    e[n++] = (int32_t) R_FLASH_HP_Write(&g_flash0_ctrl, (uint32_t) &value, 0x08000000U, 4);
    v[4] = *(uint32_t *) 0x08000000U;
    /* A structure of settings into block 2 and back. */
    e[n++] = (int32_t) R_FLASH_HP_Erase(&g_flash0_ctrl, 0x08000080U, 1);
    e[n++] = (int32_t) R_FLASH_HP_Write(&g_flash0_ctrl, (uint32_t) &settings, 0x08000080U, sizeof(settings));
    const settings_t *stored = (const settings_t *) 0x08000080U;
    settings_t copy;
    memcpy(&copy, (void *) 0x08000080U, sizeof(copy));
    v[5] = stored->magic;
    v[6] = stored->period_ms;
    v[7] = (uint32_t) copy.name[4] + ((uint32_t) copy.brightness << 8) + ((uint32_t) sizeof(settings_t) << 16);
    e[n++] = (int32_t) R_FLASH_HP_InfoGet(&g_flash0_ctrl, &info);
    v[8] = info.data_flash.p_block_array->block_section_st_addr;
    v[9] = info.data_flash.p_block_array->block_section_end_addr + (info.data_flash.p_block_array->block_size << 16) + (info.data_flash.p_block_array->block_size_write << 28);
    v[10] = info.code_flash.num_regions + (info.code_flash.p_block_array[1].block_size << 4) + (info.code_flash.p_block_array[1].block_section_end_addr << 8);
    /* Not in this build. */
    e[n++] = (int32_t) R_FLASH_HP_AccessWindowClear(&g_flash0_ctrl);
    e[n++] = (int32_t) R_FLASH_HP_BankSwap(&g_flash0_ctrl);
    e[n++] = (int32_t) R_FLASH_HP_UpdateFlashClockFreq(&g_flash0_ctrl);
    e[n++] = (int32_t) R_FLASH_HP_Reset(&g_flash0_ctrl);
    e[n++] = (int32_t) R_FLASH_HP_Close(&g_flash0_ctrl);
    e[n++] = (int32_t) R_FLASH_HP_Close(&g_flash0_ctrl);
    v[11] = (uint32_t) n;
    finished = 1;
    while (1) { R_BSP_SoftwareDelay(10, BSP_DELAY_UNITS_MILLISECONDS); }
}`;
 const r=await both({enabled:true},code,60,[...list('e',46),...list('v',12),'finished']);
 assert.equal(r.emulator.vars.finished,1);assert.equal(r.interpreter.vars.finished,1);
 assert.deepEqual(r.unknown,[],'the driver stays inside the model\'s registers');
 // What the real driver returned on the emulator …
 assert.deepEqual(values(r.emulator.vars,'e',46),[7,7,7,7,7,7, 1,1,0,14, 22,22,23,22,23,23,1, 21,22,22,21,0, 0,1,22,23,23, 1,1, 0,0,0,0,24,0,0,0, 0,0,0, 6,6,0,0,0,7]);
 assert.deepEqual(values(r.emulator.vars,'v',12),[1,0,0,0x02040608,0x0f0f0f0f,0xa55a,1500,0x31+(80<<8)+(16<<16),0x08000000,(0x08001fff+(64<<16)+(4<<28))>>>0,(2+(0x8000<<4)+(0xfffff<<8))>>>0,46]);
 // … and the interpreter the same, with the same contents and the same note about the write that was not erased first.
 assert.deepEqual(r.interpreter.vars,r.emulator.vars);assert.deepEqual(r.interpreter.flash,r.emulator.flash);
 assert.deepEqual(r.emulator.flash,[{at:0,hex:'0f0f0f0f'},{at:0x80,hex:'5aa55002dc0500005241364531000000'}]);
 assert.equal(r.emulator.warn.length,1);assert.match(r.emulator.warn[0],/0x08000000: 지우지 않은\(이미 쓴\) 곳에 다시 썼습니다/);assert.deepEqual(r.interpreter.warn,r.emulator.warn);
});

test('r_flash_hp with background operation: fcu_frdyi_isr / fcu_fiferr_isr call the callback with the same events on both engines, also after a write that fails',{skip,timeout:600000},async()=>{
 const code=`
static uint8_t data[8] = { 1, 2, 3, 4, 5, 6, 7, 8 };
volatile int32_t e[16];
volatile uint32_t ev[16];
volatile uint32_t count = 0, busy = 9, idle = 9, active = 9, after = 9, finished = 0;
void flash_callback(flash_callback_args_t *p_args)
{
    if (count < 16U) { ev[count] = (uint32_t) p_args->event; }
    count++;
}
static void wait(uint32_t n) { while (count < n) { } }
void hal_entry(void)
{
    int n = 0;
    flash_result_t r = FLASH_RESULT_BLANK;
    flash_status_t s;
    e[n++] = (int32_t) R_FLASH_HP_Open(&g_flash0_ctrl, &g_flash0_cfg);
    e[n++] = (int32_t) R_FLASH_HP_Erase(&g_flash0_ctrl, 0x08000100U, 3);
    R_FLASH_HP_StatusGet(&g_flash0_ctrl, &s);
    busy = (uint32_t) s;
    e[n++] = (int32_t) R_FLASH_HP_Write(&g_flash0_ctrl, (uint32_t) data, 0x08000100U, 8);
    e[n++] = (int32_t) R_FLASH_HP_BlankCheck(&g_flash0_ctrl, 0x08000100U, 4, &r);
    wait(1);
    R_FLASH_HP_StatusGet(&g_flash0_ctrl, &s);
    idle = (uint32_t) s;
    e[n++] = (int32_t) R_FLASH_HP_Write(&g_flash0_ctrl, (uint32_t) data, 0x08000100U, 8);
    wait(2);
    e[n++] = (int32_t) R_FLASH_HP_BlankCheck(&g_flash0_ctrl, 0x08000100U, 8, &r);
    active = (uint32_t) r;
    wait(3);
    e[n++] = (int32_t) R_FLASH_HP_BlankCheck(&g_flash0_ctrl, 0x08000108U, 8, &r);
    wait(4);
    /* 8 bytes onto the written place: the first unit fails. */
    e[n++] = (int32_t) R_FLASH_HP_Write(&g_flash0_ctrl, (uint32_t) data, 0x08000100U, 8);
    wait(5);
    R_BSP_SoftwareDelay(5, BSP_DELAY_UNITS_MILLISECONDS);
    R_FLASH_HP_StatusGet(&g_flash0_ctrl, &s);
    after = (uint32_t) s;
    /* The flash works again: erase, 4 bytes, and 4 bytes onto them (nothing left to write when it fails). */
    e[n++] = (int32_t) R_FLASH_HP_Erase(&g_flash0_ctrl, 0x08000100U, 1);
    wait(6);
    e[n++] = (int32_t) R_FLASH_HP_Write(&g_flash0_ctrl, (uint32_t) data, 0x08000100U, 4);
    wait(7);
    e[n++] = (int32_t) R_FLASH_HP_Write(&g_flash0_ctrl, (uint32_t) data, 0x08000100U, 4);
    R_BSP_SoftwareDelay(5, BSP_DELAY_UNITS_MILLISECONDS);
    e[n++] = (int32_t) R_FLASH_HP_Erase(&g_flash0_ctrl, 0x08000140U, 1);
    R_BSP_SoftwareDelay(5, BSP_DELAY_UNITS_MILLISECONDS);
    e[n++] = (int32_t) R_FLASH_HP_Close(&g_flash0_ctrl);
    finished = 1;
    while (1) { R_BSP_SoftwareDelay(10, BSP_DELAY_UNITS_MILLISECONDS); }
}`;
 const r=await both({enabled:true,bgo:true,callback:'flash_callback',readyPriority:12,errorPriority:12},code,80,[...list('e',13),...list('ev',16),'count','busy','idle','active','after','finished']);
 assert.equal(r.emulator.vars.finished,1,'the real driver ran to the end');assert.equal(r.interpreter.vars.finished,1);assert.deepEqual(r.unknown,[]);
 // FSP_ERR_IN_USE (8) while the erase runs; FLASH_RESULT_BGO_ACTIVE (2); idle after the failed write.
 assert.deepEqual(values(r.emulator.vars,'e',13),[0,0,8,8,0,0,0,0,0,0,0,0,0]);
 assert.deepEqual([r.emulator.vars.busy,r.emulator.vars.idle,r.emulator.vars.active,r.emulator.vars.after],[1,0,2,0]);
 // ERASE_COMPLETE 0, WRITE_COMPLETE 1, NOT_BLANK 3, BLANK 2, ERR_FAILURE 7; then erase, write, and for the 4-byte
 // write that fails WRITE_COMPLETE before ERR_FAILURE (the flash-ready routine does not look at the error); the erase.
 assert.deepEqual(values(r.emulator.vars,'ev',r.emulator.vars.count),[0,1,3,2,7,0,1,1,7,0]);
 assert.deepEqual(r.interpreter.vars,r.emulator.vars);assert.deepEqual(r.interpreter.flash,r.emulator.flash);assert.deepEqual(r.interpreter.warn,r.emulator.warn);
 assert.equal(r.emulator.warn.length,1);
});

test('r_flash_hp on the emulator starts from the project\'s saved data flash and a watchdog-free reset keeps it',{skip,timeout:600000},async()=>{
 const code=`
volatile uint32_t stored = 0, blank = 9, resets = 0;
void hal_entry(void)
{
    flash_result_t r;
    uint32_t next;
    R_FLASH_HP_Open(&g_flash0_ctrl, &g_flash0_cfg);
    R_FLASH_HP_BlankCheck(&g_flash0_ctrl, 0x08000040U, 4, &r);
    blank = (uint32_t) r;
    stored = *(uint32_t *) 0x08000040U;
    resets = R_SYSTEM->RSTSR1_b.SWRF;
    next = stored + 1U;
    R_FLASH_HP_Erase(&g_flash0_ctrl, 0x08000040U, 1);
    R_FLASH_HP_Write(&g_flash0_ctrl, (uint32_t) &next, 0x08000040U, 4);
    R_BSP_SoftwareDelay(20, BSP_DELAY_UNITS_MILLISECONDS);
    if (0U == resets) { NVIC_SystemReset(); }
    while (1) { R_BSP_SoftwareDelay(10, BSP_DELAY_UNITS_MILLISECONDS); }
}`;
 const r=await both({enabled:true},code,100,['stored','blank','resets'],{dataFlash:[{at:0x40,hex:'10000000'}]});
 assert.deepEqual(r.emulator.vars,{stored:17,blank:1,resets:1},'16 from the project, 17 written before the reset');
 assert.deepEqual(r.interpreter.vars,r.emulator.vars);assert.deepEqual(r.emulator.flash,[{at:0x40,hex:'12000000'}]);assert.deepEqual(r.interpreter.flash,r.emulator.flash);
 assert.deepEqual(r.session.resets.map(x=>x.reason),['SYSRESETREQ']);
});

// ---- review of feature 39: data flash pointers as addresses, structures and enums in the data flash, sources of a
// write, stores and reads outside it, the size checks' uint32_t sums, and the contents across a watchdog reset.
const VARS='volatile int32_t e[24];\nvolatile uint32_t v[32];\nvolatile uint32_t finished = 0;\n';
const OPEN='\n    int n = 0;\n    e[n++] = (int32_t) R_FLASH_HP_Open(&g_flash0_ctrl, &g_flash0_cfg);';
const END='\n    finished = 1;\n    while (1) { R_BSP_SoftwareDelay(10, BSP_DELAY_UNITS_MILLISECONDS); }\n}';
const same=(r,label)=>{
 assert.deepEqual(r.unknown,[],label);
 for(const key of ['vars','flash','warn','resets'])assert.deepEqual(r.interpreter[key],key==='resets'?r.emulator.resets.length:r.emulator[key],`${label}: ${key}`);
};

test('data flash pointers on both engines: recast to other pointer types and to integers, the address arguments as (uint32_t) pointers, structures, enums and chars, the sources of a write',{skip,timeout:600000},async()=>{
 // A flash pointer converted to another pointer type or to an integer and back.
 let r=await bothStops({enabled:true},VARS+`
static uint8_t data[8] = { 0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88 };
void hal_entry(void)
{${OPEN}
    e[n++] = (int32_t) R_FLASH_HP_Erase(&g_flash0_ctrl, 0x08000000U, 1);
    e[n++] = (int32_t) R_FLASH_HP_Write(&g_flash0_ctrl, (uint32_t) data, 0x08000000U, 8);
    uint32_t *p32 = (uint32_t *) 0x08000000U;
    uint8_t *p8 = (uint8_t *) p32;
    v[0] = p8[1];
    v[1] = p8[5];
    uint16_t *p16 = (uint16_t *) (p8 + 2);
    v[2] = *p16;
    v[3] = (uint32_t) p32;
    uint32_t a = (uint32_t) p32 + 4U;
    v[4] = *(uint8_t *) a;
    v[5] = (p8 == (uint8_t *) 0x08000000U) ? 1U : 0U;
    v[6] = ((uint32_t) (p8 + 3) == 0x08000003U) ? 1U : 0U;
    v[7] = (p32 != NULL) ? 1U : 0U;
    const void *raw = (const void *) 0x08000004U;
    const uint32_t *w = raw;
    v[8] = *w;${END}`,60,[...list('e',3),...list('v',9),'finished']);
 same(r,'recast');assert.deepEqual(values(r.emulator.vars,'v',9),[0x22,0x66,0x4433,0x08000000,0x55,1,1,1,0x88776655]);assert.equal(r.emulator.vars.finished,1);
 // The address arguments given as a pointer converted to uint32_t.
 r=await bothStops({enabled:true},VARS+`
static uint8_t data[8] = { 0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88 };
void hal_entry(void)
{${OPEN}
    uint8_t *dst = (uint8_t *) 0x08000040U;
    flash_result_t r = FLASH_RESULT_NOT_BLANK;
    e[n++] = (int32_t) R_FLASH_HP_Erase(&g_flash0_ctrl, (uint32_t) dst, 1);
    e[n++] = (int32_t) R_FLASH_HP_BlankCheck(&g_flash0_ctrl, (uint32_t) dst, 8, &r);
    v[0] = (uint32_t) r;
    e[n++] = (int32_t) R_FLASH_HP_Write(&g_flash0_ctrl, (uint32_t) data, (uint32_t) dst, 8);
    v[1] = dst[7];${END}`,60,[...list('e',4),...list('v',2),'finished']);
 same(r,'ptrarg');assert.deepEqual(r.emulator.vars,{'e[0]':0,'e[1]':0,'e[2]':0,'e[3]':0,'v[0]':0,'v[1]':0x88,finished:1});
 // Structures: an array of structures written and read back member by member, by assignment and by memcpy; a float.
 r=await bothStops({enabled:true},VARS+`
typedef struct { uint8_t a; uint32_t b; uint16_t c; float f; int8_t d[3]; } rec_t;
static rec_t recs[2] = { { 1, 0x11223344U, 0x5566, 1.5f, { -1, 2, -3 } }, { 2, 0xAABBCCDDU, 0x7788, -2.25f, { 4, -5, 6 } } };
static uint32_t words[4] = { 1, 2, 3, 4 };
static float fl = 3.25f;
void hal_entry(void)
{${OPEN}
    e[n++] = (int32_t) R_FLASH_HP_Erase(&g_flash0_ctrl, 0x08000100U, 2);
    e[n++] = (int32_t) R_FLASH_HP_Write(&g_flash0_ctrl, (uint32_t) recs, 0x08000100U, sizeof(recs));
    e[n++] = (int32_t) R_FLASH_HP_Write(&g_flash0_ctrl, (uint32_t) &words[1], 0x08000140U, 8);
    e[n++] = (int32_t) R_FLASH_HP_Write(&g_flash0_ctrl, (uint32_t) &fl, 0x08000148U, 4);
    const rec_t *r = (const rec_t *) 0x08000100U;
    v[0] = r[1].b;
    v[1] = (uint32_t) r->c + ((uint32_t) r[1].c << 16);
    v[2] = (uint32_t) (int32_t) r[1].d[1];
    v[3] = (uint32_t) (int32_t) (r[1].f * 100.0f);
    rec_t one = *r;
    v[4] = one.b;
    rec_t two;
    memcpy(&two, &r[1], sizeof(two));
    v[5] = (uint32_t) two.d[2] + ((uint32_t) two.a << 8);
    v[6] = *(uint32_t *) 0x08000140U;
    v[7] = *(uint32_t *) 0x08000144U;
    float g = *(float *) 0x08000148U;
    v[8] = (uint32_t) (g * 100.0f);
    v[9] = sizeof(rec_t);
    v[10] = (memcmp(r, recs, sizeof(recs)) == 0) ? 1U : 0U;
    v[11] = (uint32_t) (int32_t) r->d[0];${END}`,60,[...list('e',5),...list('v',12),'finished']);
 same(r,'struct');assert.deepEqual(values(r.emulator.vars,'v',12),[0xaabbccdd,0x77885566,0xfffffffb,0xffffff1f,0x11223344,0x206,2,3,325,20,1,0xffffffff]);
 // Layouts: an enum (one byte with ARM GCC's short enums), a nested structure, bool, double; element types and chars.
 r=await bothStops({enabled:true},VARS+`
typedef enum { MODE_A = 1, MODE_B = 2 } mode_t;
typedef struct { uint8_t x; uint16_t y; } inner_t;
typedef struct { bool on; mode_t mode; inner_t in; double d; uint32_t big; } mix_t;
typedef struct { uint16_t lo; uint16_t hi; } bits_t;
static mix_t mix = { true, MODE_B, { 7, 0x1234 }, 2.5, 0x55667788U };
static bits_t bits = { 0xBCDA, 0x1234 };
static uint8_t raw[8] = { 0x81, 0x82, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88 };
void hal_entry(void)
{${OPEN}
    e[n++] = (int32_t) R_FLASH_HP_Erase(&g_flash0_ctrl, 0x08000800U, 2);
    e[n++] = (int32_t) R_FLASH_HP_Write(&g_flash0_ctrl, (uint32_t) &mix, 0x08000800U, sizeof(mix));
    e[n++] = (int32_t) R_FLASH_HP_Write(&g_flash0_ctrl, (uint32_t) &bits, 0x08000840U, sizeof(bits));
    e[n++] = (int32_t) R_FLASH_HP_Write(&g_flash0_ctrl, (uint32_t) raw, 0x08000848U, 8);
    const mix_t *m = (const mix_t *) 0x08000800U;
    v[0] = sizeof(mix_t) + (sizeof(mode_t) << 8);
    v[1] = (uint32_t) m->on + ((uint32_t) m->mode << 8) + ((uint32_t) m->in.x << 16);
    v[2] = m->in.y;
    v[3] = (uint32_t) (m->d * 10.0);
    v[5] = (uint32_t) m->big;
    const bits_t *b = (const bits_t *) 0x08000840U;
    v[6] = b->lo;
    v[8] = b->hi;
    v[9] = *(uint32_t *) 0x08000840U;
    v[10] = *(unsigned char *) 0x08000848U;
    v[11] = *(unsigned short *) 0x08000848U;
    v[12] = *(unsigned int *) 0x08000848U;
    v[13] = (uint32_t) *(int *) 0x0800084CU;
    v[14] = (uint32_t) *(long *) 0x0800084CU;
    v[15] = (uint32_t) (int32_t) *(char *) 0x08000848U;
    v[16] = (uint32_t) (int32_t) *(signed char *) 0x08000849U;
    v[17] = (uint32_t) (int32_t) *(short *) 0x0800084AU;
    v[19] = *(const volatile uint8_t *) 0x0800084FU;${END}`,60,[...list('e',5),...list('v',20),'finished']);
 same(r,'layout');assert.equal(r.emulator.vars['v[0]'],24+(1<<8));assert.equal(r.emulator.vars['v[1]'],1+(2<<8)+(7<<16));
 assert.equal(r.emulator.vars['v[15]'],0x81,'char is unsigned');assert.equal(r.emulator.vars['v[16]'],0xffffff82);
 assert.deepEqual(r.emulator.flash[0],{at:0x800,hex:'010207003412000000000000000004408877665500000000'});
 // Sources of R_FLASH_HP_Write: a local array, a pointer variable, a member, 16-bit elements, the data flash itself
 // (read in P/E mode: noted on both engines).
 r=await bothStops({enabled:true},VARS+`
typedef struct { uint32_t id; uint16_t pair[2]; } item_t;
static item_t item = { 0xCAFEF00DU, { 0x1234, 0x5678 } };
static uint16_t halves[4] = { 0x0102, 0x0304, 0x0506, 0x0708 };
static uint8_t bytes[12] = { 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12 };
void hal_entry(void)
{${OPEN}
    uint8_t local[4] = { 0xA1, 0xA2, 0xA3, 0xA4 };
    uint8_t *p = bytes + 4;
    e[n++] = (int32_t) R_FLASH_HP_Erase(&g_flash0_ctrl, 0x08000200U, 2);
    e[n++] = (int32_t) R_FLASH_HP_Write(&g_flash0_ctrl, (uint32_t) local, 0x08000200U, 4);
    e[n++] = (int32_t) R_FLASH_HP_Write(&g_flash0_ctrl, (uint32_t) p, 0x08000204U, 8);
    e[n++] = (int32_t) R_FLASH_HP_Write(&g_flash0_ctrl, (uint32_t) item.pair, 0x0800020CU, 4);
    e[n++] = (int32_t) R_FLASH_HP_Write(&g_flash0_ctrl, (uint32_t) halves, 0x08000210U, 8);
    e[n++] = (int32_t) R_FLASH_HP_Write(&g_flash0_ctrl, (uint32_t) &item, 0x08000218U, sizeof(item));
    e[n++] = (int32_t) R_FLASH_HP_Write(&g_flash0_ctrl, (uint32_t) &bytes[8], 0x08000220U, 4);
    e[n++] = (int32_t) R_FLASH_HP_Write(&g_flash0_ctrl, 0x08000200U, 0x08000240U, 8);
    v[0] = *(uint32_t *) 0x08000240U;
    v[1] = *(uint32_t *) 0x08000244U;${END}`,60,[...list('e',9),...list('v',2),'finished']);
 same(r,'src');assert.deepEqual(values(r.emulator.vars,'v',2),[0xa4a3a2a1,0x08070605]);
 assert.equal(r.emulator.warn.length,1);assert.match(r.emulator.warn[0],/P\/E 모드\(쓰기·지우기·블랭크 체크가 진행 중\)에서 데이터 플래시를 읽었습니다/);
});

test('outside the data flash and stores into it on both engines: the same notes, a store goes nowhere, a read past the end stops; the size checks\' uint32_t sums',{skip,timeout:600000},async()=>{
 // A store through a pointer goes nowhere and the program goes on.
 let r=await bothStops({enabled:true},`
volatile uint32_t after = 0, finished = 0;
void hal_entry(void)
{
    R_FLASH_HP_Open(&g_flash0_ctrl, &g_flash0_cfg);
    uint32_t *p = (uint32_t *) 0x08000000U;
    *p = 5U;
    after = *p;${END}`,40,['after','finished']);
 same(r,'assign');assert.deepEqual(r.emulator.vars,{after:0xffffffff,finished:1});
 assert.deepEqual(r.emulator.warn.map(w=>w.split(' — ')[0]),['[FLASH] 데이터 플래시에 대입(버스 쓰기)한 값은 쓰이지 않고 무시됩니다','[FLASH] 지운(빈) 데이터 플래시 0x08000000를 읽었습니다']);
 // Past the end through an index, just after it, and a 32-bit read that crosses it: the emulator stops at the
 // HardFault, the interpreter with the note as its error.
 for(const [label,read,address,size] of [['past','((uint8_t *) 0x08001FF0U)[16]','0x08002000',1],['after','*(uint8_t *) 0x08002000U','0x08002000',1],['cross','*(uint32_t *) 0x08001FFEU','0x08001FFE',4]]){
  r=await bothStops({enabled:true},`
volatile uint32_t a = 0, b = 0, finished = 0;
void hal_entry(void)
{
    a = ((uint8_t *) 0x08001FF0U)[15];
    b = ${read};${END}`,40,['a','b','finished']);
  same(r,label);assert.deepEqual(r.emulator.vars,{a:0xff,b:0,finished:0},label);assert.equal(r.emulator.halted,true,label);
  const note=`데이터 플래시(0x08000000~0x08001FFF) 밖 ${address}에 ${size}바이트로 접근했습니다 — 실제 칩에서는 버스 오류(HardFault)로 멈춥니다. 주소와 읽는 크기를 확인하세요.`;
  assert.equal(r.emulator.warn.at(-1),'[FLASH] '+note,label);assert.equal(r.interpreter.error,note,label);
 }
 // flash_address + num_bytes and num_blocks * 64 in uint32_t: a sum that wraps passes the check, as in the driver.
 r=await bothStops({enabled:true},VARS+`
static uint32_t value = 0x11223344U;
void hal_entry(void)
{${OPEN}
    flash_result_t r = FLASH_RESULT_BLANK;
    e[n++] = (int32_t) R_FLASH_HP_Write(&g_flash0_ctrl, (uint32_t) &value, 0x08001F80U, 4);
    e[n++] = (int32_t) R_FLASH_HP_Write(&g_flash0_ctrl, (uint32_t) &value, 0x08001FC0U, 4);
    e[n++] = (int32_t) R_FLASH_HP_Erase(&g_flash0_ctrl, 0x08001F80U, 3);
    e[n++] = (int32_t) R_FLASH_HP_BlankCheck(&g_flash0_ctrl, 0x08000000U, 0x2001U, &r);
    e[n++] = (int32_t) R_FLASH_HP_Erase(&g_flash0_ctrl, 0x08001F80U, 0x04000001U);
    e[n++] = (int32_t) R_FLASH_HP_BlankCheck(&g_flash0_ctrl, 0x08000000U, 0xFFFFFFFFU, &r);
    e[n++] = (int32_t) R_FLASH_HP_Reset(&g_flash0_ctrl);${END}`,60,[...list('e',8),'finished']);
 same(r,'wrap');assert.deepEqual(values(r.emulator.vars,'e',8),[0,0,0,21,23,501,501,0]);assert.deepEqual(r.emulator.flash,[]);
});

test('the data flash survives a watchdog reset on both engines (WDT without refresh)',{skip,timeout:600000},async()=>{
 const r=await bothStops({enabled:true},`
volatile uint32_t stored = 0, wdtrf = 9, finished = 0;
void hal_entry(void)
{
    flash_result_t r = FLASH_RESULT_BLANK;
    uint32_t next = 0x5A5A0001U;
    wdtrf = R_SYSTEM->RSTSR1_b.WDTRF;
    R_FLASH_HP_Open(&g_flash0_ctrl, &g_flash0_cfg);
    R_FLASH_HP_BlankCheck(&g_flash0_ctrl, 0x08000080U, 4, &r);
    if (FLASH_RESULT_NOT_BLANK == r) { stored = *(uint32_t *) 0x08000080U; }
    if (0U == wdtrf)
    {
        R_FLASH_HP_Erase(&g_flash0_ctrl, 0x08000080U, 1);
        R_FLASH_HP_Write(&g_flash0_ctrl, (uint32_t) &next, 0x08000080U, 4);
        R_WDT_Open(&g_wdt0_ctrl, &g_wdt0_cfg);
        R_WDT_Refresh(&g_wdt0_ctrl);
        while (1) { R_BSP_SoftwareDelay(1, BSP_DELAY_UNITS_MILLISECONDS); }
    }${END}`,150,['stored','wdtrf','finished'],{peripherals:{WDT:{enabled:true,clockDiv:128}}});
 assert.deepEqual(r.emulator.resets,['WDT'],'one watchdog reset (41.9 ms)');
 same(r,'watchdog');assert.deepEqual(r.emulator.vars,{stored:0x5a5a0001,wdtrf:1,finished:1});assert.deepEqual(r.emulator.flash,[{at:0x80,hex:'01005a5a'}]);
});
