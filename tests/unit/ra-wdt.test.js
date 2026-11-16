// Feature 35: the RA6E1 watchdogs (r_wdt g_wdt0, r_iwdt g_iwdt0) — Stacks settings and their checks, the generated FSP
// files (hal_data, r_*_cfg.h, OFS0 in bsp_mcu_ofs_cfg.h), the emulator model (register-start and OFS0 auto-start,
// underflow and window errors → reset or NMI) and the built-in interpreter (R_WDT_* / R_IWDT_*, reset log, RSTSR1 read).
import test from 'node:test';
import assert from 'node:assert/strict';
import {raDefaultMcu,validateRaMcu,raOfs0,raWdtTiming,raNameProblem} from '../../src/ra-config.js';
import {generateRaFiles,raVectors} from '../../src/ra-generator.js';
import {raAssistance} from '../../src/ra-assistance.js';
import {Watchdog} from '../../src/emu/ra6e1/wdt.js';
import {SimulationSession} from '../../src/session.js';
import {projectForBoard,validateProject} from '../../src/project.js';
import {raExample} from '../../src/ra-examples.js';

const mcu=peripherals=>({...raDefaultMcu(),peripherals});

test('WDT/IWDT settings: RASC defaults, the values each one has, NMI needs a callback, IWDT starts from OFS0 only',()=>{
 const m=validateRaMcu(mcu({WDT:{enabled:true},IWDT:{enabled:true}}));
 assert.deepEqual(m.peripherals.WDT,{enabled:true,startMode:'REGISTER',timeout:16384,clockDiv:8192,windowStart:100,windowEnd:0,reset:'RESET',stopInSleep:false,callback:''});
 assert.deepEqual(m.peripherals.IWDT,{enabled:true,startMode:'AUTO',timeout:2048,clockDiv:256,windowStart:100,windowEnd:0,reset:'RESET',stopInSleep:false,callback:''});
 assert.throws(()=>validateRaMcu(mcu({WDT:{enabled:true,timeout:2048}})),/WDT: Timeout은 1024 · 4096 · 8192 · 16384/);
 assert.throws(()=>validateRaMcu(mcu({IWDT:{enabled:true,timeout:16384}})),/IWDT: Timeout은 128 · 512 · 1024 · 2048/);
 assert.throws(()=>validateRaMcu(mcu({WDT:{enabled:true,clockDiv:256}})),/클록 분주는 \/4/);
 assert.throws(()=>validateRaMcu(mcu({IWDT:{enabled:true,startMode:'REGISTER'}})),/OFS0으로 리셋 때 시작/);
 assert.throws(()=>validateRaMcu(mcu({WDT:{enabled:true,reset:'NMI'}})),/NMI로 알리려면 콜백/);
 assert.throws(()=>validateRaMcu(mcu({WDT:{enabled:true,windowStart:25,windowEnd:50}})),/창 끝\(50 %\)은 창 시작\(25 %\)보다/);
 assert.throws(()=>validateRaMcu(mcu({WDT:{enabled:true,reset:'NMI',callback:'g_wdt0'}})),/인스턴스 이름/);
 assert.equal(raNameProblem('g_iwdt0_cfg').includes('인스턴스'),true);
 // PCLKB 50 MHz / 2048 → 24414 Hz × 16384 = 671 ms; IWDT 15 kHz / 256 × 2048 = 34.95 s.
 const t=raWdtTiming(mcu({WDT:{enabled:true,clockDiv:2048}}),'WDT');assert.ok(Math.abs(t.ms-671.09)<0.01,String(t.ms));
 assert.ok(Math.abs(raWdtTiming(m,'IWDT').ms-34952.5)<0.1);
});

test('OFS0: erased unless a watchdog auto-starts; the fields where r_iwdt.c / r_wdt.c read them',()=>{
 assert.equal(raOfs0(validateRaMcu(raDefaultMcu())),0xffffffff);
 assert.equal(raOfs0(validateRaMcu(mcu({WDT:{enabled:true}}))),0xffffffff,'register-start WDT: WDTSTRT stays 1');
 const iwdt=raOfs0(validateRaMcu(mcu({IWDT:{enabled:true}})));
 assert.equal(iwdt,0xffffbf5d);
 assert.equal(iwdt&2,0,'IWDTSTRT 0: auto-start');assert.equal((iwdt>>>2)&3,3,'TOPS 2048');assert.equal((iwdt>>>4)&15,5,'CKS /256');assert.equal(iwdt&0x1000,0x1000,'RSTIRQS: reset');
 const wdt=raOfs0(validateRaMcu(mcu({WDT:{enabled:true,startMode:'AUTO',reset:'NMI',callback:'wdt_nmi',stopInSleep:true}})));
 assert.equal((wdt>>>17)&1,0,'WDTSTRT 0');assert.equal((wdt>>>18)&3,3,'TOPS 16384');assert.equal((wdt>>>20)&15,8,'CKS /8192');assert.equal((wdt>>>28)&1,0,'NMI');assert.equal((wdt>>>30)&1,1,'stop in sleep');
 assert.equal(wdt&0xffff,0xffff,'the IWDT half stays erased');
});

test('generated files: g_wdt0 / g_iwdt0 in hal_data, r_wdt_cfg.h NMI support, OFS0 header; no vector (NMI)',()=>{
 const m=validateRaMcu(mcu({WDT:{enabled:true,clockDiv:2048,reset:'NMI',callback:'wdt_nmi'},IWDT:{enabled:true,timeout:1024,clockDiv:64}}));
 const f=generateRaFiles(m);
 assert.match(f['ra_gen/hal_data.h'],/#include "r_wdt\.h"\n#include "r_iwdt\.h"\n#include "r_wdt_api\.h"/);
 assert.match(f['ra_gen/hal_data.h'],/extern const wdt_instance_t g_wdt0;[\s\S]*extern wdt_instance_ctrl_t g_wdt0_ctrl;[\s\S]*void wdt_nmi\(wdt_callback_args_t \* p_args\);/);
 assert.match(f['ra_gen/hal_data.h'],/extern iwdt_instance_ctrl_t g_iwdt0_ctrl;/);
 assert.match(f['ra_gen/hal_data.c'],/\.timeout {13}= WDT_TIMEOUT_16384,\n {4}\.clock_division {6}= WDT_CLOCK_DIVISION_2048,[\s\S]*\.reset_control {7}= WDT_RESET_CONTROL_NMI,[\s\S]*\.p_callback {10}= wdt_nmi,[\s\S]*\.p_api {9}= &g_wdt_on_wdt/);
 assert.match(f['ra_gen/hal_data.c'],/\.timeout {13}= WDT_TIMEOUT_1024,\n {4}\.clock_division {6}= WDT_CLOCK_DIVISION_64,[\s\S]*\.p_api {9}= &g_wdt_on_iwdt/);
 assert.match(f['ra_cfg/fsp_cfg/r_wdt_cfg.h'],/#define WDT_CFG_REGISTER_START_NMI_SUPPORTED \(1\)/);
 assert.match(f['ra_cfg/fsp_cfg/r_iwdt_cfg.h'],/#define IWDT_CFG_PARAM_CHECKING_ENABLE/);
 assert.match(f['ra_cfg/fsp_cfg/bsp/bsp_mcu_ofs_cfg.h'],new RegExp(`#define BSP_CFG_OPTION_SETTING_OFS0 \\(0x${raOfs0(m).toString(16).toUpperCase()}UL\\)`));
 assert.equal(raVectors(m).length,raVectors(validateRaMcu(raDefaultMcu())).length,'no ICU vector');
 const items=raAssistance(m).find(x=>x.name==='g_wdt0').items.map(i=>i.label);
 assert.deepEqual(items,['Call R_WDT_Open()','Call R_WDT_Refresh()','Call R_WDT_CounterGet()','Call R_WDT_TimeoutGet()','Call R_WDT_StatusGet()','Call R_WDT_StatusClear()','Read reset cause (RSTSR1)','Callback function definition']);
 assert.match(raAssistance(m).find(x=>x.name==='g_iwdt0').items.find(i=>/RSTSR1/.test(i.label)).code,/R_SYSTEM->RSTSR1_b\.IWDTRF/);
});

// A fake SoC: time in µs, a timer list, the reset and NMI requests.
function fakeSoc(ofs0=0xffffffff){
 const soc={now:0,timers:[],resets:[],nmis:[],clock:{pclkb:50e6},bus:{ofs0},nowUs:()=>soc.now,sync(){},
  atUs:(t,fn)=>{const e={t,fn,cancel(){e.dead=true;}};soc.timers.push(e);return e;},systemReset:r=>soc.resets.push([r,soc.now]),nmi:b=>soc.nmis.push([b,soc.now]),env:{warn(){}}};
 soc.next=()=>soc.timers.filter(e=>!e.dead).sort((a,b)=>a.t-b.t)[0];
 soc.fire=()=>{const e=soc.next();e.dead=true;soc.now=e.t;e.fn();};
 return soc;
}
const refresh=w=>{w.write(0,0x00,1);w.write(0,0xff,1);};

test('WDT model: register-start mode counts from the first refresh, CNTVAL counts down, an underflow resets (WDTRF)',()=>{
 const soc=fakeSoc(),w=new Watchdog(soc,'WDT');
 w.write(6,0x80,1);w.write(2,0x3373&~0x30|0x70,2); // RSTIRQS reset; TOPS 16384, CKS 7 (/2048), window 100/0
 assert.equal(w.read(4,2)&0x3fff,0,'stopped');assert.equal(soc.next(),undefined);
 refresh(w);assert.equal(w.read(4,2),16383,'counts from 16383');
 soc.now=100000;assert.equal(w.read(4,2),16383-Math.floor(0.1*50e6/2048));
 w.write(2,0x3300,2);assert.equal(w.read(2,2),0x3373,'settings are locked once it counts');
 refresh(w);assert.equal(w.read(4,2),16383,'a refresh starts it again');
 soc.fire();assert.deepEqual(soc.resets,[['WDT',100000+16384/(50e6/2048)*1e6]]);assert.equal(w.read(4,2)&0x4000,0x4000,'UNDFF');
 w.write(4,0,2);assert.equal(w.read(4,2)&0xc000,0,'cleared by writing 0');
});

test('WDT model: a refresh outside the window sets REFEF and raises the NMI (RSTIRQS 0); IWDT auto-starts from OFS0',()=>{
 const soc=fakeSoc(),w=new Watchdog(soc,'WDT');
 w.write(6,0x00,1);w.write(2,0x1073,2); // window start 50 % (RPSS 1), end 0 %
 refresh(w);soc.now=1000;refresh(w);
 assert.equal(w.read(4,2)&0x8000,0x8000,'REFEF');assert.deepEqual(soc.nmis,[[1,1000]]);assert.deepEqual(soc.resets,[]);
 assert.equal(soc.next(),undefined,'stopped after the NMI');refresh(w);assert.ok(soc.next(),'a refresh starts it again');
 // OFS0 0xFFFFBF5D: IWDT auto-start, 2048 clocks of 15 kHz / 256.
 const s2=fakeSoc(0xffffbf5d),iw=new Watchdog(s2,'IWDT');
 assert.equal(iw.read(4,2),2047,'running from the reset');assert.equal(iw.read(2,2)&3,3);assert.equal(iw.read(6,1),0x80);
 iw.write(2,0,2);assert.equal(iw.read(2,2)&3,3,'OFS0 settings cannot be changed');
 s2.fire();assert.deepEqual(s2.resets,[['IWDT',2048/(15000/256)*1e6]]);
 assert.equal(new Watchdog(fakeSoc(0xffffbf5d),'WDT').read(4,2),0,'the WDT half of OFS0 is erased: not started');
});

const base=()=>projectForBoard('fpb-ra6e1');
function interp(code,peripherals,{pins}={}){
 const m=raDefaultMcu();Object.assign(m.pins,pins||{});m.peripherals=peripherals;
 const log={warn:[],print:[]};
 const session=new SimulationSession(validateProject({...base(),mcu:m,code:'#include "hal_data.h"\n'+code+'\nvoid external_irq1_callback(external_irq_callback_args_t *p_args){(void)p_args;}\n'}),{warn:w=>log.warn.push(w),print:t=>log.print.push(t)});
 return {session,log,run:ms=>{for(let t=Math.floor(session.time)+1;t<=ms;t++)session.tick(t);}};
}

test('interpreter: R_WDT_* — no refresh resets the program (log entry), RSTSR1_b.WDTRF and RSTSR1 read the cause',()=>{
 const {session,log,run}=interp(`
volatile uint32_t starts = 0, cause = 0, bits = 0;
void hal_entry(void)
{
    cause = R_SYSTEM->RSTSR1_b.WDTRF;
    bits = R_SYSTEM->RSTSR1 & R_SYSTEM_RSTSR1_WDTRF_Msk;
    R_WDT_Open(&g_wdt0_ctrl, &g_wdt0_cfg);
    R_WDT_Refresh(&g_wdt0_ctrl);
    uint32_t count;
    R_WDT_CounterGet(&g_wdt0_ctrl, &count);
    wdt_timeout_values_t t;
    R_WDT_TimeoutGet(&g_wdt0_ctrl, &t);
    printf("%u %lu %lu\\n", (unsigned) count, (unsigned long) t.clock_frequency_hz, (unsigned long) t.timeout_clocks);
    starts++;
    while (1) { R_BSP_SoftwareDelay(10, BSP_DELAY_UNITS_MILLISECONDS); }
}`,{WDT:{enabled:true,clockDiv:2048}});
 run(500);
 assert.equal(session.readVariable('cause'),0);assert.deepEqual(log.print,['16383 24414 16384']);assert.deepEqual(log.warn,[]);
 run(700);
 assert.equal(session.runtime.resetCount,1);assert.equal(session.readVariable('cause'),1,'RSTSR1_b.WDTRF after the WDT reset');assert.equal(session.readVariable('bits'),2);
 assert.match(log.warn[0],/^\[WDT\] 671\.1 ms 안에 R_WDT_Refresh가 없었습니다 — 워치독 리셋: 프로그램을 처음부터 다시 실행합니다\(RSTSR1\.WDTRF\)\.$/);
});

test('interpreter: NMI calls the callback (StatusGet / StatusClear), a refresh outside the window is an error; RSTSR1 is read-only',()=>{
 const {session,log,run}=interp(`
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
    R_WDT_Refresh(&g_wdt0_ctrl);   /* 99.8 % left: before the 50 % window opens */
    while (1) { }
}`,{WDT:{enabled:true,clockDiv:2048,windowStart:50,reset:'NMI',callback:'wdt_nmi'}});
 run(50);
 assert.equal(session.readVariable('nmis'),1);assert.equal(session.readVariable('status'),2,'WDT_STATUS_REFRESH_ERROR');assert.equal(session.readVariable('after'),0);
 assert.equal(session.runtime.resetCount??0,0,'NMI: no reset');assert.deepEqual(log.warn,[]);
 const w=interp(`void hal_entry(void){ R_SYSTEM->RSTSR1 = 0; }`,{});
 assert.throws(()=>w.run(5),/R_SYSTEM->RSTSR1: 내장 해석기는 리셋 원인 레지스터를 읽기만 합니다/);
 const other=interp(`volatile uint32_t x; void hal_entry(void){ x = R_SYSTEM->RSTSR0; }`,{});
 assert.throws(()=>other.run(5),/레지스터 직접 접근은 ARM GCC 실행에서만 됩니다\(R_SYSTEM->RSTSR0\)/);
});

test('interpreter: the IWDT starts from OFS0 at the program start (no Open needed) and resets with IWDTRF; StatusGet needs NMI',()=>{
 const {session,log,run}=interp(`
volatile uint32_t iwdt = 0, err = 0;
void hal_entry(void)
{
    iwdt = R_SYSTEM->RSTSR1_b.IWDTRF;
    R_IWDT_Open(&g_iwdt0_ctrl, &g_iwdt0_cfg);
    wdt_status_t s;
    err = R_IWDT_StatusGet(&g_iwdt0_ctrl, &s);
    while (1) { R_BSP_SoftwareDelay(100, BSP_DELAY_UNITS_MILLISECONDS); }
}`,{IWDT:{enabled:true,timeout:128,clockDiv:16}});
 run(100);assert.equal(session.readVariable('err'),6,'FSP_ERR_UNSUPPORTED');
 run(140);assert.equal(session.runtime.resetCount,1,'128 / (15 kHz / 16) = 136.5 ms');assert.equal(session.readVariable('iwdt'),1);
 assert.match(log.warn[0],/^\[IWDT\] 136\.5 ms 안에 R_IWDT_Refresh가 없었습니다/);
});

test('ra_wdt_reset example on the interpreter: S1 held → reset after 671 ms → LED2 blinks (RSTSR1.WDTRF)',()=>{
 const e=raExample('ra_wdt_reset'),s=new SimulationSession(validateProject({...base(),mcu:e.mcu(),code:e.code}),{warn:()=>{}});
 const led2=[];let last=0;
 for(let t=1;t<=1600;t++){if(t===350)s.setPressed({SW1:true});if(t===1350)s.setPressed({});s.tick(t);const v=s.runtime.gpio.P407?.value>1.65?1:0;if(v!==last){led2.push(t);last=v;}}
 assert.equal(s.runtime.resetCount,1);assert.equal(s.readVariable('wdt_resets_seen'),1);
 assert.deepEqual(led2.slice(0,3),[972,1072,1172]);
});

test('a project with the watchdog stacks saves and opens again unchanged (validateProject on its JSON)',()=>{
 const p=validateProject({...base(),mcu:{...raDefaultMcu(),peripherals:{WDT:{enabled:true,startMode:'AUTO',clockDiv:2048,reset:'NMI',callback:'wdt_nmi'},IWDT:{enabled:true,timeout:512,clockDiv:64,stopInSleep:true}}}});
 const again=validateProject(JSON.parse(JSON.stringify(p)));
 assert.deepEqual(again.mcu.peripherals,p.mcu.peripherals);
 assert.equal(again.mcu.peripherals.WDT.startMode,'AUTO');assert.equal(again.mcu.peripherals.IWDT.stopInSleep,true);
 assert.equal(raOfs0(again.mcu),raOfs0(p.mcu));
});

test('callback names across modules: a WDT and an RTC callback of one name are refused (different argument types), FSP ISR and API object names too',()=>{
 assert.throws(()=>validateRaMcu(mcu({WDT:{enabled:true,reset:'NMI',callback:'on_event'},RTC:{enabled:true,callback:'on_event'}})),/콜백 이름 on_event은\(는\) .*인자 형식이 다릅니다\((rtc|wdt)_callback_args_t \/ (wdt|rtc)_callback_args_t\)/);
 assert.equal(validateRaMcu(mcu({WDT:{enabled:true,reset:'NMI',callback:'wdt_nmi'},IWDT:{enabled:true,reset:'NMI',callback:'wdt_nmi'}})).peripherals.IWDT.callback,'wdt_nmi','both watchdogs take wdt_callback_args_t');
 assert.throws(()=>validateRaMcu(mcu({RTC:{enabled:true,callback:'rtc_carry_isr'}})),/인터럽트 처리 함수\(ISR\) 이름/);
 assert.throws(()=>validateRaMcu(mcu({RTC:{enabled:true,callback:'rtc_alarm_periodic_isr'}})),/ISR/);
 for(const name of ['g_wdt_on_wdt','g_wdt_on_iwdt','g_rtc_on_rtc'])assert.throws(()=>validateRaMcu(mcu({RTC:{enabled:true,callback:name}})),/API 객체 이름/,name);
 // A disabled stack does not count.
 assert.ok(validateRaMcu(mcu({WDT:{enabled:false,reset:'NMI',callback:'on_event'},RTC:{enabled:true,callback:'on_event'}})));
});
