// Features 34 and 35 with the real FSP: r_wdt / r_iwdt (and r_rtc) built by ARM GCC with the generated ra_gen/ra_cfg,
// run on the RA6E1 emulator — register-start WDT reset and its RSTSR1 cause, the IWDT started by OFS0 (the
// .option_setting section the BSP places at 0x0100A100), the WDT NMI through the BSP's NMI_Handler.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {FirmwareSession} from '../../src/firmware-session.js';
import {projectForBoard,validateProject} from '../../src/project.js';
import {raExample} from '../../src/ra-examples.js';
import {raDefaultMcu} from '../../src/ra-config.js';

const require=createRequire(import.meta.url),{prepareBuild,build,detectTools}=require('../../desktop/native-build.cjs');
const tools=await detectTools({armGcc:process.env.ARM_GCC||''});
const skip=!(tools.armGcc&&tools.fsp)&&!process.env.CI_REQUIRE_TOOLCHAIN&&'ARM GCC / Renesas FSP not installed';

async function firmware(project,fn){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'ra-wdt-rtc-'));
 try{
  const result=await build(await prepareBuild({project:validateProject(project),tools,root,target:'arm'}));
  assert.deepEqual(result.diagnostics.filter(d=>d.severity!=='info'),[]);
  const log={trace:[],uart:[],warn:[]};
  const session=new FirmwareSession(validateProject(project),{elf:new Uint8Array(await fs.readFile(result.elf)),trace:e=>log.trace.push(e),uart:e=>log.uart.push(e),warn:m=>log.warn.push(m)});
  await fn(session,log);
 }finally{await fs.rm(root,{recursive:true,force:true});}
}
// 1 ms ticks until the emulator time reaches `ms` (a tick may run less than asked when the circuit is busy).
const run=(s,ms)=>{for(let guard=0;guard<100000&&s.now<ms*1000-1;guard++)s.tick(Math.min(ms,Math.floor(s.now/1000)+1));};
const HEAD='#include "hal_data.h"\nvoid R_BSP_WarmStart(bsp_warm_start_event_t event);\nvoid R_BSP_WarmStart(bsp_warm_start_event_t event)\n{\n    if (BSP_WARM_START_POST_C == event)\n    {\n        R_IOPORT_Open(&IOPORT_CFG_CTRL, &IOPORT_CFG_NAME);\n    }\n}\nvoid external_irq1_callback(external_irq_callback_args_t *p_args) { (void) p_args; }\n';

test('WDT (ra_wdt_reset): the real r_wdt in register-start mode resets the MCU 671 ms after the last refresh; RSTSR1.WDTRF',{skip,timeout:600000},async()=>{
 const e=raExample('ra_wdt_reset');
 await firmware({...projectForBoard('fpb-ra6e1'),mcu:e.mcu(),code:e.code},(s,log)=>{
  run(s,350);s.setPressed({SW1:true});run(s,1350);s.setPressed({});run(s,1800);
  assert.deepEqual(s.resets.map(r=>r.reason),['WDT']);assert.ok(Math.abs(s.resets[0].us/1000-971.3)<1.5,String(s.resets[0].us));
  assert.ok(log.trace.some(x=>x.message==='MCU 리셋 · WDT'));assert.ok(log.warn.some(m=>/^\[WDT\] 시간 초과/.test(m)));
  assert.equal(s.readVariable('wdt_resets_seen'),1);assert.equal(s.machine.bus.ofs0,0xffffffff,'register-start: OFS0 erased');
 });
});

test('IWDT: OFS0 from bsp_mcu_ofs_cfg.h starts it at reset (no Open needed), R_IWDT_TimeoutGet / CounterGet, reset with IWDTRF',{skip,timeout:600000},async()=>{
 const mcu={...raDefaultMcu(),peripherals:{IWDT:{enabled:true,timeout:128,clockDiv:16}}};
 const code=HEAD+`
volatile uint32_t iwdtrf = 0, hz = 0, clocks = 0, count = 0, err = 0;
void hal_entry(void)
{
    iwdtrf = R_SYSTEM->RSTSR1_b.IWDTRF;
    err = R_IWDT_Open(&g_iwdt0_ctrl, &g_iwdt0_cfg);
    wdt_timeout_values_t t;
    R_IWDT_TimeoutGet(&g_iwdt0_ctrl, &t);
    hz = t.clock_frequency_hz;
    clocks = t.timeout_clocks;
    R_BSP_SoftwareDelay(50, BSP_DELAY_UNITS_MILLISECONDS);
    uint32_t c;
    R_IWDT_CounterGet(&g_iwdt0_ctrl, &c);
    count = c;
    while (1) { }
}
`;
 await firmware({...projectForBoard('fpb-ra6e1'),mcu,code},s=>{
  assert.equal(s.machine.bus.ofs0,0xffffbf21,'OFS0: IWDTSTRT 0, TOPS 128, CKS /16, window 100/0, reset');
  run(s,100);
  assert.equal(s.readVariable('err'),0);assert.equal(s.readVariable('hz'),937);assert.equal(s.readVariable('clocks'),128);
  assert.ok(Math.abs(s.readVariable('count')-(127-0.05*937.5))<2,'counted from the reset: '+s.readVariable('count'));
  run(s,150);
  assert.deepEqual(s.resets.map(r=>r.reason),['IWDT']);assert.ok(Math.abs(s.resets[0].us/1000-136.5)<0.5,String(s.resets[0].us));
  run(s,200);assert.equal(s.readVariable('iwdtrf'),1);
 });
});

test('WDT NMI: a refresh before the window opens calls the callback through NMI_Handler; R_WDT_StatusGet says why',{skip,timeout:600000},async()=>{
 const mcu={...raDefaultMcu(),peripherals:{WDT:{enabled:true,clockDiv:2048,windowStart:50,reset:'NMI',callback:'wdt_nmi'}}};
 const code=HEAD+`
volatile uint32_t nmis = 0, status = 0, after = 9;
void wdt_nmi(wdt_callback_args_t *p_args)
{
    (void) p_args;
    wdt_status_t s;
    R_WDT_StatusGet(&g_wdt0_ctrl, &s);
    status = s;
    R_WDT_StatusClear(&g_wdt0_ctrl, s);
    R_WDT_StatusGet(&g_wdt0_ctrl, &s);
    after = s;
    nmis++;
}
void hal_entry(void)
{
    R_WDT_Open(&g_wdt0_ctrl, &g_wdt0_cfg);
    R_WDT_Refresh(&g_wdt0_ctrl);
    R_BSP_SoftwareDelay(1, BSP_DELAY_UNITS_MILLISECONDS);
    R_WDT_Refresh(&g_wdt0_ctrl);
    while (1) { }
}
`;
 await firmware({...projectForBoard('fpb-ra6e1'),mcu,code},s=>{
  run(s,50);
  assert.equal(s.readVariable('nmis'),1);assert.equal(s.readVariable('status'),2,'WDT_STATUS_REFRESH_ERROR');assert.equal(s.readVariable('after'),0);assert.deepEqual(s.resets,[]);
 });
});
