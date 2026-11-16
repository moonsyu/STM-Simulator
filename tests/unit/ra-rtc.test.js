// Feature 34: the RA6E1 RTC (r_rtc g_rtc0) — Stacks settings, the generated FSP files (hal_data, vectors, r_rtc_cfg.h,
// BSP sub-clock and RTC macros), the emulator model (BCD calendar, START/RESET, periodic, alarm, carry, kept across an
// MCU reset) and the built-in interpreter (R_RTC_*: calendar, alarm and periodic callbacks, the start time).
import test from 'node:test';
import assert from 'node:assert/strict';
import {raDefaultMcu,validateRaMcu} from '../../src/ra-config.js';
import {generateRaFiles,raVectors} from '../../src/ra-generator.js';
import {raAssistance} from '../../src/ra-assistance.js';
import {Rtc,RTC_EVENT,rtcPowerOn,rtcSeconds} from '../../src/emu/ra6e1/rtc.js';
import {SimulationSession} from '../../src/session.js';
import {projectForBoard,validateProject} from '../../src/project.js';
import {raExample} from '../../src/ra-examples.js';

const mcu=peripherals=>({...raDefaultMcu(),peripherals});
const base=()=>projectForBoard('fpb-ra6e1');

test('RTC settings: defaults (LOCO, simulation start, priorities 12), the checks, saved and opened again unchanged',()=>{
 const m=validateRaMcu(mcu({RTC:{enabled:true}}));
 assert.deepEqual(m.peripherals.RTC,{enabled:true,clockSource:'LOCO',start:'SIMULATION',freqCompare:255,callback:'rtc_callback',alarmPriority:12,periodicPriority:12,carryPriority:12});
 assert.throws(()=>validateRaMcu(mcu({RTC:{enabled:true,clockSource:'MAIN'}})),/RTC: 클록 소스는 LOCO 또는 Sub-Clock/);
 assert.throws(()=>validateRaMcu(mcu({RTC:{enabled:true,start:'NOW'}})),/RTC: 시작 시각은/);
 assert.throws(()=>validateRaMcu(mcu({RTC:{enabled:true,freqCompare:7}})),/RTC: 주파수 비교값\(RFRL\)은 8~510/);
 assert.throws(()=>validateRaMcu(mcu({RTC:{enabled:true,carryPriority:null}})),/RTC: Carry 인터럽트 우선순위는 0~15/);
 assert.equal(validateRaMcu(mcu({RTC:{enabled:true,alarmPriority:null,periodicPriority:null}})).peripherals.RTC.alarmPriority,null,'Disabled');
 const p=validateProject({...base(),mcu:mcu({RTC:{enabled:true,clockSource:'SUBCLOCK',start:'HOST_TIME',alarmPriority:null,callback:'clock_cb'}})});
 assert.deepEqual(validateProject(JSON.parse(JSON.stringify(p))).mcu.peripherals.RTC,p.mcu.peripherals.RTC);
});

test('generated files: g_rtc0 in hal_data, RTC_ALARM / PERIOD / CARRY vectors after the others, r_rtc_cfg.h, BSP RTC and sub-clock',()=>{
 const m=validateRaMcu({...mcu({RTC:{enabled:true}}),pins:{...raDefaultMcu().pins}});
 const f=generateRaFiles(m),v=raVectors(m);
 assert.deepEqual(v.slice(-3).map(x=>[x.vector,x.isr,x.event]),[['RTC_ALARM','rtc_alarm_periodic_isr','RTC_ALARM'],['RTC_PERIOD','rtc_alarm_periodic_isr','RTC_PERIOD'],['RTC_CARRY','rtc_carry_isr','RTC_CARRY']]);
 assert.equal(v[0].vector,'ICU_IRQ1','earlier slots keep their numbers');
 assert.match(f['ra_gen/hal_data.h'],/#include "r_rtc\.h"\n#include "r_rtc_api\.h"/);
 assert.match(f['ra_gen/hal_data.h'],/extern const rtc_instance_t g_rtc0;[\s\S]*extern rtc_instance_ctrl_t g_rtc0_ctrl;[\s\S]*void rtc_callback\(rtc_callback_args_t \* p_args\);/);
 assert.match(f['ra_gen/hal_data.c'],/\.clock_source {12}= RTC_CLOCK_SOURCE_LOCO,\n {4}\.freq_compare_value {6}= 255,[\s\S]*\.p_callback {14}= rtc_callback,[\s\S]*\.carry_ipl {15}= \(12\),[\s\S]*\.carry_irq {15}= VECTOR_NUMBER_RTC_CARRY,[\s\S]*\.p_api {9}= &g_rtc_on_rtc/);
 assert.match(f['ra_gen/vector_data.c'],/= rtc_carry_isr, \/\* RTC CARRY \(Carry interrupt\) \*\/[\s\S]*BSP_PRV_VECT_ENUM\(EVENT_RTC_CARRY,GROUP\d\)/);
 assert.match(f['ra_cfg/fsp_cfg/r_rtc_cfg.h'],/#define RTC_CFG_OPEN_SET_CLOCK_SOURCE \(1\)/);
 assert.match(f['ra_cfg/fsp_cfg/bsp/bsp_cfg.h'],/#define BSP_CFG_RTC_USED \(1\)/);
 assert.doesNotMatch(f['ra_gen/bsp_clock_cfg.h'],/SUBCLOCK_POPULATED/,'LOCO: the sub-clock stays not populated');
 const sub=validateRaMcu(mcu({RTC:{enabled:true,clockSource:'SUBCLOCK',start:'HOST_TIME',alarmPriority:null,periodicPriority:null}})),g=generateRaFiles(sub);
 assert.match(g['ra_gen/bsp_clock_cfg.h'],/#define BSP_CLOCK_CFG_SUBCLOCK_POPULATED \(1\)/);
 assert.match(g['ra_gen/hal_data.c'],/RTC_CLOCK_SOURCE_SUBCLK/);
 assert.match(g['ra_gen/hal_data.c'],/\.alarm_ipl {15}= \(BSP_IRQ_DISABLED\),[\s\S]*\.alarm_irq {15}= FSP_INVALID_VECTOR,/);
 assert.match(g['ra_cfg/fsp_cfg/r_rtc_cfg.h'],/#define RTC_CFG_OPEN_SET_CLOCK_SOURCE \(0\)/,'host time: Open keeps the running RTC');
 assert.deepEqual(raVectors(sub).map(x=>x.vector).filter(x=>x.startsWith('RTC')),['RTC_CARRY']);
 assert.doesNotMatch(generateRaFiles(validateRaMcu(raDefaultMcu()))['ra_cfg/fsp_cfg/bsp/bsp_cfg.h'],/BSP_CFG_RTC_USED \(1\)/);
 const items=raAssistance(m).find(x=>x.name==='g_rtc0').items.map(i=>i.label);
 assert.deepEqual(items,['Call R_RTC_Open()','Call R_RTC_CalendarTimeSet()','Call R_RTC_CalendarTimeGet()','Call R_RTC_CalendarAlarmSet()','Call R_RTC_PeriodicIrqRateSet()','Call R_RTC_InfoGet()','Call R_RTC_Close()','Callback function definition']);
});

// A fake SoC: time in µs, a timer list, the events raised.
function fakeSoc(options={}){
 const soc={now:0,timers:[],events:[],options,nowUs:()=>soc.now,sync(){},listens:()=>true,raiseEvent:e=>soc.events.push([e,soc.now]),
  atUs:(t,fn)=>{const e={t,fn,cancel(){e.dead=true;}};soc.timers.push(e);return e;}};
 soc.until=us=>{for(;;){const e=soc.timers.filter(x=>!x.dead&&x.t<=us).sort((a,b)=>a.t-b.t)[0];if(!e)break;e.dead=true;soc.now=e.t;e.fn();}soc.now=us;};
 return soc;
}

test('RTC model: power-on 2000-01-01 (Saturday) counting, BCD counters set while stopped, START restarts the second, RESET self-clears',()=>{
 const soc=fakeSoc(),r=new Rtc(soc);
 assert.deepEqual([r.read(0x0e,2),r.read(0x0c,1),r.read(0x0a,1),r.read(0x08,1),r.read(0x06,1)],[0x00,0x01,0x01,6,0x00]);
 soc.until(2.5e6);assert.equal(r.read(0x02,1),0x02,'counting from power-on');
 r.write(0x24,0,1);assert.equal(r.read(0x24,1)&1,0,'stopped');r.write(0x24,2,1);assert.equal(r.read(0x24,1)&2,0,'RESET reads back 0');
 r.write(0x02,0x55,1);r.write(0x04,0x59,1);r.write(0x06,0x23,1);r.write(0x08,3,1);r.write(0x0a,0x31,1);r.write(0x0c,0x12,1);r.write(0x0e,0x25,2);
 soc.until(3.9e6);assert.equal(r.read(0x02,1),0x55,'stopped: no count');
 r.write(0x24,0x41,1);soc.until(3.9e6+4.999e6);assert.equal(r.read(0x02,1),0x59);
 soc.until(3.9e6+5e6);assert.deepEqual([r.read(0x0e,2),r.read(0x0c,1),r.read(0x0a,1),r.read(0x08,1),r.read(0x06,1),r.read(0x04,1),r.read(0x02,1)],[0x26,0x01,0x01,4,0x00,0x00,0x00],'2026-01-01 00:00:00, the day of week counts on (Wed → Thu)');
 assert.equal(rtcPowerOn('HOST_TIME',new Date(2026,10,13,9,30,15).getTime()),rtcSeconds(2026,11,13,9,30,15),'host time: the PC local time');
 const h=new Rtc(fakeSoc({rtcStart:'HOST_TIME',hostTime:new Date(2026,10,13,9,30,15).getTime()}));assert.deepEqual([h.read(0x0e,2),h.read(0x0c,1),h.read(0x0a,1),h.read(0x08,1),h.read(0x06,1)],[0x26,0x11,0x13,5,0x09]);
});

test('RTC model: periodic interrupt by PES from START, carry every second, alarm once when the enabled fields match; an MCU reset keeps it',()=>{
 const soc=fakeSoc(),r=new Rtc(soc);
 r.write(0x24,0,1);r.write(0x02,0x58,1);r.write(0x24,0x41,1);
 r.write(0x22,(13<<4)|4,1);soc.until(1.6e6);
 assert.deepEqual(soc.events.map(([e,t])=>[e,t]),[[RTC_EVENT.PERIOD,0.5e6],[RTC_EVENT.PERIOD,1e6],[RTC_EVENT.PERIOD,1.5e6]],'every 1/2 s');
 soc.events.length=0;r.write(0x22,(14<<4)|4|2|1,1);r.write(0x10,0x80|0x00,1); // alarm at sec 00
 soc.until(3.05e6);
 assert.deepEqual(soc.events.map(([e,t])=>[e,t/1e6]),[[RTC_EVENT.CARRY,2],[RTC_EVENT.ALARM,2],[RTC_EVENT.PERIOD,2],[RTC_EVENT.CARRY,3],[RTC_EVENT.PERIOD,3]],'the alarm once, when 00 s begins');
 assert.equal(r.read(0x02,1),0x01);
 soc.timers.forEach(e=>{e.dead=true;});r.reset();assert.equal(r.read(0x02,1),0x01,'an MCU reset keeps the time');assert.ok(soc.timers.some(e=>!e.dead),'and plans its events again');
});

function interp(code,peripherals,options={}){
 const m=raDefaultMcu();m.peripherals=peripherals;Object.assign(m.pins,options.pins||{});
 const log={warn:[],print:[]};
 const session=new SimulationSession(validateProject({...base(),mcu:m,code:'#include "hal_data.h"\n'+code+'\nvoid external_irq1_callback(external_irq_callback_args_t *p_args){(void)p_args;}\n'}),{warn:w=>log.warn.push(w),print:t=>log.print.push(t),hostTime:options.hostTime});
 return {session,log,run:ms=>{for(let t=Math.floor(session.time)+1;t<=ms;t++)session.tick(t);}};
}
const PRINT=`static void show(void)
{
    rtc_time_t t;
    R_RTC_CalendarTimeGet(&g_rtc0_ctrl, &t);
    printf("%04d-%02d-%02d %02d:%02d:%02d w%d\\n", t.tm_year + 1900, t.tm_mon + 1, t.tm_mday, t.tm_hour, t.tm_min, t.tm_sec, t.tm_wday);
}`;

test('interpreter: R_RTC_Open stops the counter (Set Source Clock in Open), CalendarTimeSet fixes tm_wday and starts it; periodic and alarm callbacks',()=>{
 const {session,log,run}=interp(PRINT+`
volatile uint32_t periods = 0, alarms = 0, status = 9;
volatile int wday = -1;
void rtc_callback(rtc_callback_args_t *p_args)
{
    if (RTC_EVENT_PERIODIC_IRQ == p_args->event) { periods++; }
    if (RTC_EVENT_ALARM_IRQ == p_args->event) { alarms++; show(); }
}
void hal_entry(void)
{
    R_RTC_Open(&g_rtc0_ctrl, &g_rtc0_cfg);
    rtc_info_t info;
    R_RTC_InfoGet(&g_rtc0_ctrl, &info);
    status = info.status;
    show();
    rtc_time_t set = { .tm_sec = 58, .tm_min = 59, .tm_hour = 23, .tm_mday = 31, .tm_mon = 11, .tm_year = 125, .tm_wday = 0 };
    R_RTC_CalendarTimeSet(&g_rtc0_ctrl, &set);
    wday = set.tm_wday;
    rtc_alarm_time_t a = { .time = { .tm_sec = 0, .tm_min = 0, .tm_hour = 0 }, .sec_match = true, .min_match = true, .hour_match = true };
    R_RTC_CalendarAlarmSet(&g_rtc0_ctrl, &a);
    R_RTC_PeriodicIrqRateSet(&g_rtc0_ctrl, RTC_PERIODIC_IRQ_SELECT_1_DIV_BY_4_SECOND);
    while (1) { }
}`,{RTC:{enabled:true}});
 run(3010);
 assert.equal(session.readVariable('status'),0,'RTC_STATUS_STOPPED after Open');assert.equal(session.readVariable('wday'),3,'2025-12-31 is a Wednesday (FSP computes tm_wday)');
 assert.deepEqual(log.print,['2000-01-01 00:00:00 w6','2026-01-01 00:00:00 w4']);
 assert.equal(session.readVariable('alarms'),1);assert.equal(session.readVariable('periods'),12,'4 a second for 3 s');assert.deepEqual(log.warn,[]);
});

test('interpreter: start time HOST_TIME — Open keeps the RTC running from the PC time; the calendar survives a reset; rates the RA6E1 lacks are refused',()=>{
 const host=new Date(2026,10,13,9,30,15).getTime();
 const {session,log,run}=interp(PRINT+`
volatile uint32_t status = 9;
void hal_entry(void)
{
    R_RTC_Open(&g_rtc0_ctrl, &g_rtc0_cfg);
    rtc_info_t info;
    R_RTC_InfoGet(&g_rtc0_ctrl, &info);
    status = info.status;
    R_BSP_SoftwareDelay(1500, BSP_DELAY_UNITS_MILLISECONDS);
    show();
    NVIC_SystemReset();
}`,{RTC:{enabled:true,start:'HOST_TIME'}},{hostTime:host});
 run(1600);
 assert.equal(session.readVariable('status'),1,'RTC_STATUS_RUNNING');assert.deepEqual(log.print,['2026-11-13 09:30:16 w5']);
 run(3200);assert.deepEqual(log.print,['2026-11-13 09:30:16 w5','2026-11-13 09:30:18 w5'],'the reset keeps the calendar');
 const bad=interp(`void rtc_callback(rtc_callback_args_t *p_args){(void)p_args;}
void hal_entry(void){ R_RTC_Open(&g_rtc0_ctrl, &g_rtc0_cfg); R_RTC_PeriodicIrqRateSet(&g_rtc0_ctrl, RTC_PERIODIC_IRQ_SELECT_1_MINUTE); }`,{RTC:{enabled:true}});
 assert.throws(()=>bad.run(5),/RTC_PERIODIC_IRQ_SELECT_1_MINUTE: RA6E1의 RTC는 주기 인터럽트를 1\/256초~2초만/);
 const off=interp(`volatile uint32_t err = 0;
void hal_entry(void){ R_RTC_Open(&g_rtc0_ctrl, &g_rtc0_cfg); rtc_alarm_time_t a = { .sec_match = true }; err = R_RTC_CalendarAlarmSet(&g_rtc0_ctrl, &a); }`,{RTC:{enabled:true,alarmPriority:null,callback:''}});
 off.run(5);assert.equal(off.session.readVariable('err'),11,'FSP_ERR_IRQ_BSP_DISABLED without the alarm interrupt');
});

test('ra_rtc_clock example on the interpreter: SCI9 prints the time each second, the alarm at midnight lights LED2',()=>{
 const e=raExample('ra_rtc_clock'),p={...base(),mcu:e.mcu(),code:e.code},c=e.circuit();p.components=c.components;p.wires=c.wires;delete p.surfaces;
 const uart=[],s=new SimulationSession(validateProject(p),{uart:x=>uart.push(x),warn:m=>{throw new Error(m);}});
 for(let t=1;t<=6200;t++)s.tick(t);
 const text=String.fromCharCode(...uart.filter(x=>x.instance==='SCI9'&&x.direction==='TX').flatMap(x=>x.bytes));
 assert.equal(text,'2025-12-31 23:59:56\r\n2025-12-31 23:59:57\r\n2025-12-31 23:59:58\r\n2025-12-31 23:59:59\r\n2026-01-01 00:00:00 Happy New Year!\r\n2026-01-01 00:00:01\r\n');
 assert.ok(s.runtime.gpio.P407.value>1.65,'LED2 on after the alarm');assert.equal(s.readVariable('seconds'),6);
});
