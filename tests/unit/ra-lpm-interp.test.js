// Feature 37: r_lpm on the built-in interpreter (src/fsp-interp.js R_LPM_*): the driver's checks and return codes, Sleep,
// Software Standby (WUPEN sources, stopped timers, deferred requests), Deep Software Standby (IRQn-DS pins, the RTC,
// the reset with RSTSR0.DPSRSTF, IOKEEP and R_LPM_IoKeepClear) and the run log. The same programs run on the emulator
// with the real r_lpm.c in tests/toolchain/ra-lpm.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import {SimulationSession} from '../../src/session.js';
import {projectForBoard,validateProject} from '../../src/project.js';
import {raDefaultMcu,validateRaMcu} from '../../src/ra-config.js';
import {fspPrelude} from '../../src/fsp-interp.js';
import {raExample} from '../../src/ra-examples.js';
import {LPM_ERRORS,LPM_STANDBY,LPM_DEEP_RTC,LPM_STUCK} from '../fixtures/ra-lpm-programs.js';

function open({mcu,code},options={}){
 const log={trace:[],warn:[]};
 const session=new SimulationSession(validateProject({...projectForBoard('fpb-ra6e1'),mcu:typeof mcu==='function'?mcu():mcu,code}),{trace:e=>log.trace.push(e),warn:m=>log.warn.push(m),...options});
 return {session,log,lpm:()=>log.trace.filter(e=>e.protocol==='LPM').map(e=>e.message)};
}
const run=(s,from,to,each)=>{for(let t=from;t<=to;t++){each?.(t);s.tick(t);}};
const high=(s,pin)=>s.runtime.gpio[pin]?.value>1.65?1:0;
const HEAD='#include "hal_data.h"\nvoid R_BSP_WarmStart(bsp_warm_start_event_t event);\n';
const WARM='\nvoid R_BSP_WarmStart(bsp_warm_start_event_t event)\n{\n    if (BSP_WARM_START_POST_C == event)\n    {\n        R_IOPORT_Open (&IOPORT_CFG_CTRL, &IOPORT_CFG_NAME);\n    }\n}\n';
const lpmMcu=(extra={},more={})=>{const m=raDefaultMcu();m.peripherals={LPM:{enabled:true,mode:'DEEP',wake:['IRQ1'],cancel:['IRQ1'],cancelRising:[],ioKeep:true,power:'DEEPCUT0',...extra},...more};return m;};

test('the prelude declares g_lpm0 with the Stacks settings (the AGT3 wake sources in the second 32-bit member)',()=>{
 const text=fspPrelude(validateRaMcu(lpmMcu({mode:'STANDBY',wake:['IRQ1','RTCALM','AGT3UD'],cancel:['IRQ1','RTC_ALARM'],cancelRising:['IRQ1'],ioKeep:false,power:'DEEPCUT1'})));
 assert.match(text,/const lpm_cfg_t g_lpm0_cfg = \{ \.low_power_mode = LPM_MODE_STANDBY, \.standby_wake_sources = 0x01000002, \.fsp_interp_wake_sources_high = 1, /);
 assert.match(text,/\.io_port_state = LPM_IO_PORT_RESET, \.power_supply_state = LPM_POWER_SUPPLY_DEEPCUT1, \.deep_standby_cancel_source = 0x00080002, \.deep_standby_cancel_edge = 0x00000002, /);
 assert.match(text,/LPM_STANDBY_WAKE_SOURCE_RTCALM = 0x01000000,/);assert.match(text,/LPM_DEEP_STANDBY_CANCEL_SOURCE_RTC_INTERVAL = 0x00040000,/);assert.match(text,/LPM_MODE_DEEP = 4,/);
 assert.doesNotMatch(fspPrelude(validateRaMcu(raDefaultMcu())),/lpm/,'only with the stack');
});

test('R_LPM_* return codes follow r_lpm.c: not open, assertions, unsupported and invalid modes, already open; a refused reconfigure changes nothing',()=>{
 const {session,log,lpm}=open(LPM_ERRORS);
 run(session,1,100);assert.equal(session.readVariable('done'),0,'sleeping until S1');
 run(session,101,200,t=>{if(t===150)session.setPressed({SW1:true});if(t===180)session.setPressed({});});
 assert.equal(session.readVariable('done'),1);
 assert.deepEqual(LPM_ERRORS.expected.map((_,i)=>session.readVariable(`e[${i}]`)),LPM_ERRORS.expected);
 assert.deepEqual(log.warn,[]);
 assert.equal(lpm().length,2);assert.match(lpm()[0],/^Sleep 진입 · /);assert.match(lpm()[1],/^Sleep에서 깨어남 · IRQ1 \(1[45]\d\.\d ms 뒤\)$/);
});

test('Software Standby: S1 (IRQ1) and AGT1 on LOCO wake it; AGT0 on PCLKB stands still; entries are logged at most every 0.5 s',()=>{
 const {session,log,lpm}=open(LPM_STANDBY);
 run(session,1,2010,t=>{if(t===1000)session.setPressed({SW1:true});if(t===1050)session.setPressed({});});
 // AGT1 every 400 ms: 400, 800, 1200, 1600, 2000; S1 at 1000.
 assert.equal(session.readVariable('ticks1'),5);assert.equal(session.readVariable('presses'),1);assert.equal(session.readVariable('wakes'),6);
 assert.equal(session.readVariable('ticks0'),14,'7 ms ticks in the first 100 ms only: the PCLKB timer does not count in Software Standby');
 assert.equal(high(session,'P408'),0,'LED1 toggled six times');
 assert.deepEqual(log.warn,[]);
 const text=lpm();
 assert.equal(text[0],'Software Standby 진입 · 클록 정지 — 깨우는 소스: IRQ1, AGT1 언더플로');assert.equal(text[1],'Software Standby에서 깨어남 · AGT1 언더플로 (300.0 ms 뒤)');
 // 400 ms (not logged: 300 ms after the last entry), 800, 1000 (not logged), 1200 (not), 1600, 2000 (not).
 assert.deepEqual(log.trace.filter(e=>e.protocol==='LPM'&&/진입/.test(e.message)).map(e=>Math.round(e.micros/1000)),[100,800,1600]);
 assert.ok(text.some(m=>/^Software Standby에서 깨어남 · AGT1 언더플로 \(400\.0 ms 뒤\)$/.test(m)));
});

test('Software Standby keeps a request of a module that is not a wake source until the wake-up; an IRQ pin that is not one is not seen',()=>{
 // IRQ4 (P402) is not in WUPEN; GPT1 periodic 30 ms is stopped; AGT1 (LOCO, 200 ms) wakes.
 const mcu=lpmMcu({mode:'STANDBY',wake:['AGT1UD'],cancel:[]},{AGT1:{enabled:true,period:200,unit:'ms',callback:'agt1_callback',priority:12},GPT1:{enabled:true,mode:'PERIODIC',period:30,unit:'ms',duty:50,callback:'gpt1_callback',priority:12}});
 mcu.pins.P402={function:'IRQ',edge:'FALLING',pull:'PULLUP',priority:12,callback:'external_irq4_callback'};delete mcu.pins.P205;
 const code=HEAD+`
volatile uint32_t gpt_ticks = 0;
volatile uint32_t agt_ticks = 0;
volatile uint32_t irq4 = 0;
void hal_entry(void)
{
    R_ICU_ExternalIrqOpen(&g_external_irq4_ctrl, &g_external_irq4_cfg);
    R_ICU_ExternalIrqEnable(&g_external_irq4_ctrl);
    R_GPT_Open(&g_timer1_ctrl, &g_timer1_cfg);
    R_AGT_Open(&g_agt1_ctrl, &g_agt1_cfg);
    R_GPT_Start(&g_timer1_ctrl);
    R_AGT_Start(&g_agt1_ctrl);
    R_LPM_Open(&g_lpm0_ctrl, &g_lpm0_cfg);
    R_BSP_SoftwareDelay(100, BSP_DELAY_UNITS_MILLISECONDS);
    R_LPM_LowPowerModeEnter(&g_lpm0_ctrl);
    while (1)
    {
        R_BSP_SoftwareDelay(10, BSP_DELAY_UNITS_MILLISECONDS);
    }
}
void gpt1_callback(timer_callback_args_t * p_args) { (void) p_args; gpt_ticks++; }
void agt1_callback(timer_callback_args_t * p_args) { (void) p_args; agt_ticks++; }
void external_irq4_callback(external_irq_callback_args_t * p_args) { (void) p_args; irq4++; }
`+WARM;
 // A push button from D8 (P402, J1-1) to GND (J2-7), as the 4-LED example wires its switches.
 const project={...projectForBoard('fpb-ra6e1'),mcu,code,components:[{id:'b4',type:'button',name:'B4',x:520,y:380,rotation:0}],wires:[{id:'w1',from:'board:J1:1',to:'part:b4:a',color:'#8064d8'},{id:'w2',from:'part:b4:d',to:'board:J2:7',color:'#3a3a3a'}]};delete project.surfaces;
 const log=[],session=new SimulationSession(validateProject(project),{trace:e=>log.push(e)});
 run(session,1,195,t=>{if(t===130)session.setPressed({b4:true});if(t===160)session.setPressed({});});
 assert.equal(session.readVariable('gpt_ticks'),3,'30, 60, 90 ms; stopped at 100 ms with 10 ms counted');assert.equal(session.readVariable('irq4'),0,'the edge of an IRQ pin outside WUPEN is not seen');
 run(session,196,235);
 assert.equal(session.readVariable('agt_ticks'),1);assert.equal(session.readVariable('gpt_ticks'),4,'the GPT goes on from its count: 20 ms after the wake-up at 200 ms');
 assert.equal(session.readVariable('irq4'),0);
});

test('Deep Software Standby by the RTC periodic request: reset with RSTSR0.DPSRSTF, LED1 held low by IOKEEP until R_LPM_IoKeepClear',()=>{
 const {session,log,lpm}=open(LPM_DEEP_RTC,{hostTime:Date.UTC(2026,0,1,9,0,0)});
 const led1=[],led2=[];
 run(session,1,2400,()=>{},);
 const s2=open(LPM_DEEP_RTC,{hostTime:Date.UTC(2026,0,1,9,0,0)}).session;
 for(let t=1;t<=2400;t++){s2.tick(t);led1.push(high(s2,'P408'));led2.push(high(s2,'P407'));}
 const edges=x=>x.map((v,i)=>i&&v!==x[i-1]?i+1:0).filter(Boolean);
 assert.deepEqual(edges(led1),[300,1001,1301,2001,2301],'on for 300 ms after each start: power-on, and the resets at 1 s and 2 s (seen at the next 1 ms tick)');
 assert.deepEqual(edges(led2),[1001],'LED2 from the first restart on (it is on when the mode is entered again, and IOKEEP keeps it)');
 assert.equal(session.runtime.resetCount,2);assert.equal(session.readVariable('from_deep_standby'),1);assert.deepEqual(log.warn,[]);
 assert.deepEqual(lpm().slice(0,3),['Deep Software Standby 진입 · DEEPCUT0, I/O 유지(IOKEEP 1) — 해제 소스: RTC 주기',
  'Deep Software Standby 해제 · RTC 주기 (700.0 ms 뒤) — MCU 리셋(RSTSR0.DPSRSTF = 1, I/O는 R_LPM_IoKeepClear까지 유지)','Deep Software Standby 진입 · DEEPCUT0, I/O 유지(IOKEEP 1) — 해제 소스: RTC 주기']);
});

test('Deep Software Standby by S1: only the IRQ1-DS pin (P205) cancels it, on the configured edge; without IOKEEP the pins restart',()=>{
 const code=HEAD+`
void hal_entry(void)
{
    bool woke = (1U == R_SYSTEM->RSTSR0_b.DPSRSTF);
    if (woke)
    {
        R_BSP_SoftwareDelay(50, BSP_DELAY_UNITS_MILLISECONDS);
        R_LPM_IoKeepClear(&g_lpm0_ctrl);
    }
    R_LPM_Open(&g_lpm0_ctrl, &g_lpm0_cfg);
    R_IOPORT_PinWrite(&g_ioport_ctrl, LED1, BSP_IO_LEVEL_HIGH);
    if (woke)
    {
        R_IOPORT_PinWrite(&g_ioport_ctrl, LED2, BSP_IO_LEVEL_HIGH);
    }
    R_BSP_SoftwareDelay(100, BSP_DELAY_UNITS_MILLISECONDS);
    R_LPM_LowPowerModeEnter(&g_lpm0_ctrl);
    while (1)
    {
        R_BSP_SoftwareDelay(10, BSP_DELAY_UNITS_MILLISECONDS);
    }
}
void external_irq1_callback(external_irq_callback_args_t * p_args) { (void) p_args; }
`+WARM;
 // Falling edge, IOKEEP: LED1 stays on through the reset and the 50 ms before IoKeepClear.
 const a=open({mcu:lpmMcu(),code});let dark=0;
 run(a.session,1,400,t=>{if(t===200)a.session.setPressed({SW1:true});if(t===300)a.session.setPressed({});if(t>5&&!high(a.session,'P408'))dark++;});
 assert.equal(a.session.runtime.resetCount,1);assert.equal(dark,0,'LED1 never went dark');assert.equal(high(a.session,'P407'),1);
 assert.match(a.lpm()[1],/^Deep Software Standby 해제 · IRQ1-DS\(P205\) \(\d+\.\d ms 뒤\) — MCU 리셋\(RSTSR0\.DPSRSTF = 1, I\/O는 R_LPM_IoKeepClear까지 유지\)$/);
 // Rising edge: the release of S1 cancels it. Without IOKEEP: LED1 goes dark at the reset (the pins are set up again).
 const b=open({mcu:lpmMcu({cancelRising:['IRQ1'],ioKeep:false}),code});let off=0;
 run(b.session,1,250,t=>{if(t===200)b.session.setPressed({SW1:true});});assert.equal(b.session.runtime.resetCount??0,0,'the press is the falling edge');
 run(b.session,251,400,t=>{if(t===300)b.session.setPressed({});if(t>300&&!high(b.session,'P408'))off++;});
 assert.equal(b.session.runtime.resetCount,1);assert.ok(off>=45&&off<=55,'dark for the 50 ms before R_LPM_Open and the write: '+off);
 assert.match(b.lpm()[0],/DEEPCUT0, I\/O 리셋 상태로\(IOKEEP 0\) — 해제 소스: IRQ1-DS\(P205\)$/);assert.match(b.lpm()[1],/MCU 리셋\(RSTSR0\.DPSRSTF = 1\)$/);
});

test('a mode nothing can end says why and stays; a bare __WFI() after R_LPM_Open enters the configured mode',()=>{
 const {session,lpm}=open(LPM_STUCK);
 run(session,1,1000,t=>{if(t===300)session.setPressed({SW1:true});if(t===350)session.setPressed({});});
 assert.equal(session.readVariable('after'),0,'still in Software Standby');assert.equal(high(session,'P408'),1);
 assert.deepEqual(lpm(),['Software Standby 진입 · 클록 정지 — 깨우는 소스: IRQ1','Software Standby: 깨울 수 있는 소스가 없습니다 — IRQ1: 인터럽트가 켜져 있지 않습니다. 리셋(S2)으로만 다시 시작합니다.']);
 // Deep Software Standby with no cancel source, and with DEEPCUT 1 an RTC on LOCO as its only source.
 const code=HEAD+'void rtc_callback(rtc_callback_args_t * p_args) { (void) p_args; }\nvoid hal_entry(void)\n{\n    R_LPM_Open(&g_lpm0_ctrl, &g_lpm0_cfg);\n    R_LPM_LowPowerModeEnter(&g_lpm0_ctrl);\n    while (1)\n    {\n        R_BSP_SoftwareDelay(10, BSP_DELAY_UNITS_MILLISECONDS);\n    }\n}\nvoid external_irq1_callback(external_irq_callback_args_t * p_args) { (void) p_args; }\n'+WARM;
 const none=open({mcu:lpmMcu({cancel:[]}),code});run(none.session,1,50);
 assert.deepEqual(none.lpm(),['Deep Software Standby 진입 · DEEPCUT0, I/O 유지(IOKEEP 1) — 해제 소스: 없음(리셋만)','Deep Software Standby: 깨울 수 있는 소스가 없습니다 — 설정된 소스가 없습니다. 리셋(S2)으로만 다시 시작합니다.']);
 const rtcCode=code.replace('    R_LPM_Open(','    R_RTC_Open(&g_rtc0_ctrl, &g_rtc0_cfg);\n    R_RTC_PeriodicIrqRateSet(&g_rtc0_ctrl, RTC_PERIODIC_IRQ_SELECT_1_SECOND);\n    R_LPM_Open(');
 const cut=open({mcu:lpmMcu({cancel:['RTC_INTERVAL'],power:'DEEPCUT1'},{RTC:{enabled:true,start:'HOST_TIME'}}),code:rtcCode});run(cut.session,1,2500);
 assert.equal(cut.session.runtime.resetCount??0,0);
 assert.deepEqual(cut.lpm(),['Deep Software Standby 진입 · DEEPCUT1, I/O 유지(IOKEEP 1) — 해제 소스: RTC 주기','Deep Software Standby: 깨울 수 있는 소스가 없습니다 — RTC 주기: 이 모드에서 멈춥니다. 리셋(S2)으로만 다시 시작합니다.']);
});

test('example ra_lpm_deep: Deep Software Standby after 1 s, S1 (IRQ1-DS) restarts it, the UART part shows where each start came from',()=>{
 const e=raExample('ra_lpm_deep'),uart=[];
 const {session,log,lpm}=open({mcu:e.mcu,code:e.code},{uart:x=>uart.push(x)});
 const text=()=>String.fromCharCode(...uart.filter(x=>x.instance==='SCI9'&&x.direction==='TX').flatMap(x=>x.bytes));
 run(session,1,1400);
 assert.equal(text(),'Power-on start\r\nEntering Deep Software Standby: press S1\r\n');assert.equal(high(session,'P408'),0);assert.equal(high(session,'P407'),0);
 assert.deepEqual(lpm(),['Deep Software Standby 진입 · DEEPCUT0, I/O 유지(IOKEEP 1) — 해제 소스: IRQ1-DS(P205)']);
 run(session,1401,3500,t=>{if(t===3000)session.setPressed({SW1:true});if(t===3040)session.setPressed({});});
 assert.equal(session.runtime.resetCount,1);assert.equal(session.readVariable('from_deep_standby'),1);assert.equal(high(session,'P407'),1,'LED2');assert.equal(high(session,'P408'),1,'LED1 working again');
 assert.match(text(),/Woke up from Deep Software Standby by S1 \(IRQ1-DS\)\r\n$/);assert.match(lpm()[1],/^Deep Software Standby 해제 · IRQ1-DS\(P205\) \(\d\.\d\d s 뒤\) — MCU 리셋/);
 let dark=0;run(session,3501,4600,t=>{if(t===4500)session.setPressed({SW1:true});if(t===4540)session.setPressed({});if(!high(session,'P407'))dark++;});
 assert.equal(session.runtime.resetCount,2);assert.equal(dark,0,'IOKEEP: LED2 stays on in the mode and through the second reset');assert.deepEqual(log.warn,[]);
});

test('Sleep and the WDT stop control: "Count Disabled in Low Power Mode" stops the count in a __WFI() sleep, otherwise the WDT resets the sleeping program',()=>{
 // PCLKB / 128 x 16384 clocks = 41.9 ms; the program refreshes once and sleeps until S1.
 const code=HEAD+'volatile uint32_t presses = 0;\nvoid hal_entry(void)\n{\n    R_ICU_ExternalIrqOpen(&g_external_irq1_ctrl, &g_external_irq1_cfg);\n    R_ICU_ExternalIrqEnable(&g_external_irq1_ctrl);\n    R_WDT_Open(&g_wdt0_ctrl, &g_wdt0_cfg);\n    R_WDT_Refresh(&g_wdt0_ctrl);\n    while (1)\n    {\n        __WFI();\n        R_WDT_Refresh(&g_wdt0_ctrl);\n    }\n}\nvoid external_irq1_callback(external_irq_callback_args_t * p_args) { (void) p_args; presses++; }\n'+WARM;
 const wdt=stopInSleep=>{const m=raDefaultMcu();m.peripherals={WDT:{enabled:true,clockDiv:128,stopInSleep}};return m;};
 const stopped=open({mcu:wdt(true),code});
 run(stopped.session,1,300,t=>{if(t===200)stopped.session.setPressed({SW1:true});if(t===230)stopped.session.setPressed({});});
 assert.equal(stopped.session.runtime.resetCount??0,0,'the count stands still while the program sleeps');assert.equal(stopped.session.readVariable('presses'),1);
 const counting=open({mcu:wdt(false),code});run(counting.session,1,100);
 assert.ok(counting.session.runtime.resetCount>=1,'no stop control: the WDT underflows 41.9 ms into the sleep');
});

test('what the interpreter does not run is said: Snooze mode, writing the reset status register',()=>{
 const snooze=open({mcu:lpmMcu(),code:HEAD+'void hal_entry(void)\n{\n    lpm_cfg_t cfg = g_lpm0_cfg;\n    cfg.low_power_mode = LPM_MODE_STANDBY_SNOOZE;\n    R_LPM_Open(&g_lpm0_ctrl, &cfg);\n}\nvoid external_irq1_callback(external_irq_callback_args_t * p_args) { (void) p_args; }\n'+WARM});
 assert.throws(()=>run(snooze.session,1,5),/R_LPM_Open: 내장 해석기는 Snooze 모드\(LPM_MODE_STANDBY_SNOOZE\)를 실행하지 않습니다/);
 const write=open({mcu:lpmMcu(),code:HEAD+'void hal_entry(void)\n{\n    R_SYSTEM->RSTSR0_b.DPSRSTF = 0;\n}\nvoid external_irq1_callback(external_irq_callback_args_t * p_args) { (void) p_args; }\n'+WARM});
 assert.throws(()=>run(write.session,1,5),/R_SYSTEM->RSTSR0: 내장 해석기는 리셋 원인 레지스터를 읽기만 합니다/);
 const read=open({mcu:lpmMcu(),code:HEAD+'volatile uint32_t porf = 0;\nvolatile uint32_t rstsr0 = 0;\nvoid hal_entry(void)\n{\n    porf = R_SYSTEM->RSTSR0_b.PORF;\n    rstsr0 = R_SYSTEM->RSTSR0;\n    while (1)\n    {\n        R_BSP_SoftwareDelay(10, BSP_DELAY_UNITS_MILLISECONDS);\n    }\n}\nvoid external_irq1_callback(external_irq_callback_args_t * p_args) { (void) p_args; }\n'+WARM});
 run(read.session,1,5);assert.equal(read.session.readVariable('porf'),1,'power-on');assert.equal(read.session.readVariable('rstsr0'),1);
});
