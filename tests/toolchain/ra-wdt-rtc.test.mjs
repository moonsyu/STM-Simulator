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
import {SimulationSession} from '../../src/session.js';
import {projectForBoard,validateProject} from '../../src/project.js';
import {raExample} from '../../src/ra-examples.js';
import {raDefaultMcu} from '../../src/ra-config.js';

const require=createRequire(import.meta.url),{prepareBuild,build,detectTools}=require('../../desktop/native-build.cjs');
const tools=await detectTools({armGcc:process.env.ARM_GCC||''});
const skip=!(tools.armGcc&&tools.fsp)&&!process.env.CI_REQUIRE_TOOLCHAIN&&'ARM GCC / Renesas FSP not installed';

async function firmware(project,fn,options={}){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'ra-wdt-rtc-'));
 try{
  const result=await build(await prepareBuild({project:validateProject(project),tools,root,target:'arm'}));
  assert.deepEqual(result.diagnostics.filter(d=>d.severity!=='info'),[]);
  const log={trace:[],uart:[],warn:[]};
  const session=new FirmwareSession(validateProject(project),{elf:new Uint8Array(await fs.readFile(result.elf)),trace:e=>log.trace.push(e),uart:e=>log.uart.push(e),warn:m=>log.warn.push(m),...options});
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

test('RTC (ra_rtc_clock): the real r_rtc on LOCO prints the time each second on SCI9 and raises the midnight alarm',{skip,timeout:600000},async()=>{
 const e=raExample('ra_rtc_clock'),c=e.circuit(),p={...projectForBoard('fpb-ra6e1'),mcu:e.mcu(),code:e.code,components:c.components,wires:c.wires};delete p.surfaces;
 await firmware(p,(s,log)=>{
  run(s,6100);
  const text=String.fromCharCode(...log.uart.filter(x=>x.instance==='SCI9'&&x.direction==='TX').flatMap(x=>x.bytes));
  assert.equal(text,'2025-12-31 23:59:56\r\n2025-12-31 23:59:57\r\n2025-12-31 23:59:58\r\n2025-12-31 23:59:59\r\n2026-01-01 00:00:00 Happy New Year!\r\n2026-01-01 00:00:01\r\n');
  assert.ok(s.gpio.P407.value>1.65);assert.equal(s.buses.received.get('term'),text,'the USB-TTL part decodes it');
 });
});

test('RTC start time "PC 시각" on the sub-clock: R_RTC_Open keeps it running (RTC_CFG_OPEN_SET_CLOCK_SOURCE 0), the PC time is read; an MCU reset keeps the calendar',{skip,timeout:600000},async()=>{
 const mcu={...raDefaultMcu(),peripherals:{RTC:{enabled:true,clockSource:'SUBCLOCK',start:'HOST_TIME',callback:'',alarmPriority:null,periodicPriority:null}}};
 const code=HEAD+`
volatile uint32_t status = 9, boots = 0, hhmmss = 0, ymd = 0, wday = 9;
static uint32_t noinit_boots __attribute__((section(".ram_noinit")));
void hal_entry(void)
{
    if (0U == R_SYSTEM->RSTSR1_b.SWRF) { noinit_boots = 0; }
    boots = ++noinit_boots;
    R_RTC_Open(&g_rtc0_ctrl, &g_rtc0_cfg);
    rtc_info_t info;
    R_RTC_InfoGet(&g_rtc0_ctrl, &info);
    status = info.status;
    R_BSP_SoftwareDelay(600, BSP_DELAY_UNITS_MILLISECONDS);
    rtc_time_t t;
    R_RTC_CalendarTimeGet(&g_rtc0_ctrl, &t);
    hhmmss = (uint32_t) (t.tm_hour * 10000 + t.tm_min * 100 + t.tm_sec);
    ymd = (uint32_t) ((t.tm_year + 1900) * 10000 + (t.tm_mon + 1) * 100 + t.tm_mday);
    wday = (uint32_t) t.tm_wday;
    if (1U == boots) { NVIC_SystemReset(); }
    while (1) { }
}
`;
 const host=new Date(2026,10,13,9,30,15).getTime();
 await firmware({...projectForBoard('fpb-ra6e1'),mcu,code},s=>{
  run(s,700);
  assert.equal(s.resets.length,1,'SYSRESETREQ after the first reading');
  run(s,1400);
  assert.equal(s.readVariable('boots'),2);assert.equal(s.readVariable('status'),1,'RTC_STATUS_RUNNING');
  assert.equal(s.readVariable('ymd'),20261113);assert.equal(s.readVariable('wday'),5,'a Friday');
  assert.equal(s.readVariable('hhmmss'),93016,'09:30:15 + 0.6 s + the reset + 0.6 s: the calendar went on across the reset');
  assert.equal(s.soc.rtc.read(0x28,1)&1,0,'RCR4.RCKSEL: the sub-clock (R_BSP_Init_RTC with SUBCLOCK_POPULATED)');
 },{hostTime:host});
});

// ---- review of features 35 and 34: the same program on both engines (the RA6E1 emulator with the real FSP, and the
// built-in interpreter), 1 ms ticks.
async function both(peripherals,code,fn,{pins}={}){
 const mcu={...raDefaultMcu(),peripherals};mcu.pins={...mcu.pins,...(pins||{})};
 const project={...projectForBoard('fpb-ra6e1'),mcu,code:HEAD+code};
 const interp={warn:[]},sim=new SimulationSession(validateProject(project),{warn:m=>interp.warn.push(m)});
 await firmware(project,(emu,log)=>fn({emu,log,sim,interp,run:ms=>{run(emu,ms);for(let t=Math.floor(sim.time)+1;t<=ms;t++)sim.tick(t);},
  same:(name,tolerance=0)=>{const a=emu.readVariable(name),b=sim.readVariable(name);assert.ok(Math.abs(a-b)<=tolerance,`${name}: emulator ${a}, interpreter ${b}`);return a;}}));
}

test('WDT defaults on both engines: PCLKB/8192 x 16384 (2.68 s) fed every 100 ms never resets; PCLKB/128 (41.9 ms) resets again and again',{skip,timeout:600000},async()=>{
 const code=`
volatile uint32_t refreshes = 0, hz = 0, clocks = 0;
void hal_entry(void)
{
    R_WDT_Open(&g_wdt0_ctrl, &g_wdt0_cfg);
    wdt_timeout_values_t t;
    R_WDT_TimeoutGet(&g_wdt0_ctrl, &t);
    hz = t.clock_frequency_hz;
    clocks = t.timeout_clocks;
    while (1) { R_WDT_Refresh(&g_wdt0_ctrl); refreshes++; R_BSP_SoftwareDelay(100, BSP_DELAY_UNITS_MILLISECONDS); }
}
`;
 await both({WDT:{enabled:true}},code,({emu,sim,interp,run,same})=>{
  run(1000);
  assert.deepEqual(emu.resets,[],'the emulator counts PCLKB/8192 (WDTCR.CKS 8)');assert.equal(sim.runtime.resetCount??0,0);assert.deepEqual(interp.warn,[]);
  assert.equal(same('hz'),6103);assert.equal(same('clocks'),16384);assert.ok(same('refreshes',1)>=10);
  assert.equal(emu.soc.wdt.read(2,2),0x3383,'WDTCR: TOPS 3, CKS 8, window 100/0');
 });
 await both({WDT:{enabled:true,clockDiv:128}},code,({emu,sim,run,same})=>{
  run(400);
  assert.equal(same('hz'),390625);
  assert.ok(emu.resets.length>=8&&Math.abs(emu.resets.length-sim.runtime.resetCount)<=1,`resets every 41.9 ms: emulator ${emu.resets.length}, interpreter ${sim.runtime.resetCount}`);
  assert.ok(Math.abs(emu.resets[0].us/1000-42.2)<1,String(emu.resets[0].us));
 });
});

test('a refresh outside the window with Reset output on both engines: one WDT reset at the call, the statement after it does not run',{skip,timeout:600000},async()=>{
 await both({WDT:{enabled:true,clockDiv:2048,windowStart:50}},`
volatile uint32_t marker = 0, wdtrf = 0;
void hal_entry(void)
{
    wdtrf = R_SYSTEM->RSTSR1_b.WDTRF;
    if (wdtrf) { while (1) { R_BSP_SoftwareDelay(10, BSP_DELAY_UNITS_MILLISECONDS); } }
    R_WDT_Open(&g_wdt0_ctrl, &g_wdt0_cfg);
    R_WDT_Refresh(&g_wdt0_ctrl);
    R_BSP_SoftwareDelay(1, BSP_DELAY_UNITS_MILLISECONDS);
    R_WDT_Refresh(&g_wdt0_ctrl);
    marker++;
    while (1) { R_BSP_SoftwareDelay(10, BSP_DELAY_UNITS_MILLISECONDS); }
}
`,({emu,sim,run,same})=>{
  run(50);
  assert.deepEqual(emu.resets.map(r=>r.reason),['WDT']);assert.equal(sim.runtime.resetCount,1);
  assert.equal(same('wdtrf'),1);assert.equal(same('marker'),0);
 });
});

test('IWDT underflow while the core sleeps in WFI on both engines: the reset comes at 136.5 ms, then SWRF after NVIC_SystemReset',{skip,timeout:600000},async()=>{
 await both({IWDT:{enabled:true,timeout:128,clockDiv:16}},`
volatile uint32_t rstsr1 = 0;
void hal_entry(void)
{
    rstsr1 = R_SYSTEM->RSTSR1;
    if (rstsr1 == 1U) { R_BSP_SoftwareDelay(5, BSP_DELAY_UNITS_MILLISECONDS); NVIC_SystemReset(); }
    if (rstsr1 == 5U) { R_IWDT_Open(&g_iwdt0_ctrl, &g_iwdt0_cfg); while (1) { R_IWDT_Refresh(&g_iwdt0_ctrl); R_BSP_SoftwareDelay(10, BSP_DELAY_UNITS_MILLISECONDS); } }
    while (1) { __WFI(); }
}
`,({emu,sim,run,same})=>{
  run(400);
  assert.deepEqual(emu.resets.map(r=>r.reason),['IWDT','SYSRESETREQ']);assert.ok(Math.abs(emu.resets[0].us/1000-136.5)<0.5,String(emu.resets[0].us));
  assert.equal(sim.runtime.resetCount,2);assert.equal(same('rstsr1'),5,'IWDTRF | SWRF');
 });
});

test('an IWDT with Reset output and a name left in the callback field on both engines: Open succeeds (p_callback NULL) and the refresh keeps it alive',{skip,timeout:600000},async()=>{
 await both({IWDT:{enabled:true,timeout:128,clockDiv:16,callback:'my_cb'}},`
volatile uint32_t err = 99, rerr = 99, refreshes = 0;
void hal_entry(void)
{
    err = R_IWDT_Open(&g_iwdt0_ctrl, &g_iwdt0_cfg);
    while (1) { rerr = R_IWDT_Refresh(&g_iwdt0_ctrl); refreshes++; R_BSP_SoftwareDelay(20, BSP_DELAY_UNITS_MILLISECONDS); }
}
`,({emu,sim,run,same})=>{
  run(400);
  assert.equal(same('err'),0);assert.equal(same('rerr'),0);assert.deepEqual(emu.resets,[]);assert.equal(sim.runtime.resetCount??0,0);assert.ok(same('refreshes',1)>=19);
 });
});

test('window end 75 % on both engines: a refresh at counter 0x2FF is allowed, at 0x2FE it is a refresh error (NMI)',{skip,timeout:600000},async()=>{
 // 1024 clocks of PCLKB/8192 (163.84 us each): the counter reads 0x2FF 42.03 ms after the refresh, 0x2FE at 42.19 ms.
 for(const [us,count,nmis]of [[42025,0x2ff,0],[42189,0x2fe,1]])await both({WDT:{enabled:true,timeout:1024,clockDiv:8192,windowEnd:75,reset:'NMI',callback:'wdt_nmi'}},`
volatile uint32_t nmis = 0, count = 0;
void wdt_nmi(wdt_callback_args_t *p_args){ (void) p_args; nmis++; }
void hal_entry(void)
{
    R_WDT_Open(&g_wdt0_ctrl, &g_wdt0_cfg);
    R_WDT_Refresh(&g_wdt0_ctrl);
    R_BSP_SoftwareDelay(${us}, BSP_DELAY_UNITS_MICROSECONDS);
    uint32_t c;
    R_WDT_CounterGet(&g_wdt0_ctrl, &c);
    count = c;
    R_WDT_Refresh(&g_wdt0_ctrl);
    while (1) { }
}
`,({run,same})=>{run(60);assert.equal(same('count'),count);assert.equal(same('nmis'),nmis,'at 0x'+count.toString(16));});
});

test('an IWDT (NMI) underflow before R_IWDT_Open on both engines: the callback comes once Open enables the NMI (NMIER)',{skip,timeout:600000},async()=>{
 await both({IWDT:{enabled:true,timeout:128,clockDiv:16,reset:'NMI',callback:'iwdt_nmi'}},`
volatile uint32_t nmis = 0, status = 9;
void iwdt_nmi(wdt_callback_args_t *p_args){ (void) p_args; nmis++; }
void hal_entry(void)
{
    R_BSP_SoftwareDelay(200, BSP_DELAY_UNITS_MILLISECONDS);
    R_IWDT_Open(&g_iwdt0_ctrl, &g_iwdt0_cfg);
    wdt_status_t s;
    R_IWDT_StatusGet(&g_iwdt0_ctrl, &s);
    status = s;
    while (1) { }
}
`,({emu,run,same})=>{
  run(190);assert.equal(same('nmis'),0);
  run(215);assert.equal(same('nmis'),1);assert.equal(same('status'),1,'WDT_STATUS_UNDERFLOW');assert.deepEqual(emu.resets,[]);
 });
});
