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
