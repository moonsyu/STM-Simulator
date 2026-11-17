// Feature 37: RA6E1 low power modes on both engines. Each program of tests/fixtures/ra-lpm-programs.js is built with ARM
// GCC and FSP (the real r_lpm.c) and run on the RA6E1 emulator, and run from its hal_entry.c on the built-in interpreter:
// the same R_LPM_* return codes, the same LED timelines (within 1 ms), the same variables, the same resets and the same
// run log entries (the waited time within 1 ms).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {FirmwareSession} from '../../src/firmware-session.js';
import {SimulationSession} from '../../src/session.js';
import {projectForBoard,validateProject} from '../../src/project.js';
import {LPM_ERRORS,LPM_STANDBY,LPM_DEEP_RTC,LPM_STUCK,LPM_REVIEW} from '../fixtures/ra-lpm-programs.js';

const require=createRequire(import.meta.url),{prepareBuild,build,detectTools}=require('../../desktop/native-build.cjs');
const tools=await detectTools({armGcc:process.env.ARM_GCC||''});
const skip=!(tools.armGcc&&tools.fsp)&&!process.env.CI_REQUIRE_TOOLCHAIN&&'ARM GCC / Renesas FSP not installed';
const HOST_TIME=Date.UTC(2026,0,1,9,0,0),LEDS=['P408','P407'];

/** Both engines on one program: {emu, interp}, each {session, trace, warn, leds: per pin the level of every ms}. */
async function both(program,{ms,at={}}){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'ra-lpm-'));
 try{
  const project=validateProject({...projectForBoard('fpb-ra6e1'),mcu:program.mcu(),code:program.code});
  const result=await build(await prepareBuild({project,tools,root,target:'arm'}));
  assert.ok(result.elf,'the project builds with r_lpm: '+(result.output||'').slice(-2000));
  const make=(Session,options)=>{const log={trace:[],warn:[]};return {...log,session:new Session(validateProject(project),{trace:e=>log.trace.push(e),warn:m=>log.warn.push(m),hostTime:HOST_TIME,...options})};};
  const emu=make(FirmwareSession,{elf:new Uint8Array(await fs.readFile(result.elf))}),interp=make(SimulationSession,{});
  for(const e of [emu,interp]){
   const gpio=()=>e.session.gpio??e.session.runtime.gpio;e.leds=Object.fromEntries(LEDS.map(p=>[p,[]]));
   // The level of a pin each millisecond: its PWM duty, or high / low.
   for(let t=1;t<=ms;t++){at[t]?.(e.session);e.session.tick(t);for(const p of LEDS){const g=gpio()[p];e.leds[p].push(g?.pwm?Math.round(g.pwm.duty*1000)/1000:g?.value>1.65?1:0);}}
   e.lpm=e.trace.filter(x=>x.protocol==='LPM');
  }
  return {emu,interp};
 }finally{await fs.rm(root,{recursive:true,force:true});}
}
// Instants where the engines differ, other than within 1 ms of a change in either.
function differences(a,b){
 const near=(x,t)=>x[t-1]!==x[t]||x[t+1]!==undefined&&x[t+1]!==x[t];
 return a.map((v,t)=>v===b[t]||near(a,t)||near(b,t)?null:`${t+1} ms: emulator ${v}, interpreter ${b[t]}`).filter(Boolean);
}
// The run log of the two engines: the same entries at the same time, the waited time in an entry within 1 ms.
function sameLog(emu,interp,label){
 const waited=m=>{const x=/\((\d+(?:\.\d+)?) (ms|s) 뒤\)/.exec(m);return x?Number(x[1])*(x[2]==='s'?1000:1):null;},text=m=>m.replace(/\(\d+(?:\.\d+)? (?:ms|s) 뒤\)/,'(… 뒤)');
 assert.deepEqual(interp.lpm.map(e=>text(e.message)),emu.lpm.map(e=>text(e.message)),label+': log entries');
 emu.lpm.forEach((e,i)=>{
  assert.ok(Math.abs(e.micros-interp.lpm[i].micros)<=1000,`${label}: entry ${i} at ${e.micros/1000} ms on the emulator, ${interp.lpm[i].micros/1000} ms on the interpreter`);
  const a=waited(e.message),b=waited(interp.lpm[i].message);if(a!==null)assert.ok(Math.abs(a-b)<=(a>=1000?10:1),`${label}: entry ${i} waited ${a} / ${b} ms`);
 });
}
const press=(from,to)=>({[from]:s=>s.setPressed({SW1:true}),[to]:s=>s.setPressed({})});
// A review program on both engines: the same variables, as many resets, the same LED timelines and the same log; then
// what is particular to it (`check(emu, interp)`).
async function review(name,check){
 const program=LPM_REVIEW[name],{emu,interp}=await both(program,program);
 for(const v of program.vars)assert.equal(interp.session.readVariable(v),emu.session.readVariable(v),`${name} ${v}: emulator ${emu.session.readVariable(v)}`);
 assert.equal(interp.session.runtime.resetCount??0,emu.session.resets.length,name+': resets');
 for(const pin of LEDS)assert.deepEqual(differences(emu.leds[pin],interp.leds[pin]).slice(0,5),[],`${name} ${pin}`);
 sameLog(emu,interp,name);
 // A watchdog reset is said in each engine's own words.
 for(const e of [emu,interp])assert.deepEqual(e.warn.filter(m=>!/^\[I?WDT\] /.test(m)),[],name);
 check?.(emu,interp);
}
const messages=e=>e.lpm.map(x=>x.message);

test('R_LPM_* return codes: the real r_lpm.c and the interpreter give the same ones, in the driver\'s order of checks',{skip,timeout:900000},async()=>{
 const {emu,interp}=await both(LPM_ERRORS,{ms:200,at:press(150,180)});
 for(const [name,e]of [['emulator',emu],['interpreter',interp]]){
  assert.equal(e.session.readVariable('done'),1,name);
  assert.deepEqual(LPM_ERRORS.expected.map((_,i)=>e.session.readVariable(`e[${i}]`)),LPM_ERRORS.expected,name);
  assert.deepEqual(e.warn,[],name);
 }
 sameLog(emu,interp,'Sleep');assert.equal(emu.lpm.length,2);assert.match(emu.lpm[1].message,/^Sleep에서 깨어남 · IRQ1 /);
});

test('Software Standby on both engines: IRQ1 and AGT1 (LOCO) wake it, AGT0 (PCLKB) stands still, the log is the same',{skip,timeout:900000},async()=>{
 const {emu,interp}=await both(LPM_STANDBY,{ms:2010,at:press(1000,1050)});
 assert.deepEqual(differences(emu.leds.P408,interp.leds.P408).slice(0,5),[],'LED1 toggles at every wake-up');
 assert.ok(emu.leds.P408.some(v=>v===1));
 for(const [name,want]of Object.entries({ticks0:14,ticks1:5,presses:1,wakes:6}))for(const [engine,e]of [['emulator',emu],['interpreter',interp]])assert.equal(e.session.readVariable(name),want,`${engine} ${name}`);
 sameLog(emu,interp,'Software Standby');
 assert.equal(emu.lpm[0].message,'Software Standby 진입 · 클록 정지 — 깨우는 소스: IRQ1, AGT1 언더플로');
 assert.deepEqual(emu.warn,[]);assert.deepEqual(interp.warn,[]);assert.equal(emu.session.resets.length,0);
});

test('Deep Software Standby on both engines: the RTC periodic request resets the MCU (DPSRSTF), IOKEEP holds the LEDs until R_LPM_IoKeepClear',{skip,timeout:900000},async()=>{
 const {emu,interp}=await both(LPM_DEEP_RTC,{ms:2400});
 for(const pin of LEDS)assert.deepEqual(differences(emu.leds[pin],interp.leds[pin]).slice(0,5),[],pin);
 const edges=x=>x.map((v,i)=>i&&v!==x[i-1]?i+1:0).filter(Boolean);
 // (the emulator starts hal_entry about 0.2 ms after a reset: the FSP start-up code)
 assert.deepEqual(edges(emu.leds.P408),[301,1001,1301,2001,2301],'LED1 300 ms after each start');assert.deepEqual(edges(interp.leds.P408),[300,1001,1301,2001,2301]);assert.deepEqual(edges(emu.leds.P407),[1001],'LED2 once the start came from Deep Software Standby, kept by IOKEEP afterwards');
 assert.deepEqual(emu.session.resets.map(r=>r.reason),['DEEP_STANDBY','DEEP_STANDBY']);assert.equal(interp.session.runtime.resetCount,2);
 assert.ok(emu.trace.some(e=>e.protocol==='RESET'&&e.message==='MCU 리셋 · DEEP_STANDBY'),'the reset is in the run log as the other resets are');
 for(const e of [emu,interp])assert.equal(e.session.readVariable('from_deep_standby'),1);
 sameLog(emu,interp,'Deep Software Standby');
 assert.match(emu.lpm[1].message,/^Deep Software Standby 해제 · RTC 주기 \(69\d\.\d ms 뒤\) — MCU 리셋\(RSTSR0\.DPSRSTF = 1, I\/O는 R_LPM_IoKeepClear까지 유지\)$/);
});

test('a Software Standby nothing can end, entered by a bare __WFI(): both engines say why and stay in it',{skip,timeout:900000},async()=>{
 const {emu,interp}=await both(LPM_STUCK,{ms:600,at:press(300,350)});
 sameLog(emu,interp,'stuck');
 assert.deepEqual(emu.lpm.map(e=>e.message),['Software Standby 진입 · 클록 정지 — 깨우는 소스: IRQ1','Software Standby: 깨울 수 있는 소스가 없습니다 — IRQ1: 인터럽트가 켜져 있지 않습니다. 리셋(S2)으로만 다시 시작합니다.']);
 for(const e of [emu,interp]){assert.equal(e.session.readVariable('after'),0);assert.equal(e.leds.P408.at(-1),1,'LED1 stays as it was');}
});

// ---- the programs of the review (tests/fixtures/ra-lpm-programs.js LPM_REVIEW)
test('review: flags — after Deep Software Standby RSTSR0 and DPSIFR0 say why, and writing 0 clears DPSRSTF and DIRQ1F on both engines',{skip,timeout:900000},()=>review('flags',emu=>{
 const v=n=>emu.session.readVariable(n);
 assert.deepEqual([v('rstsr0_start'),v('dpsifr0_start'),v('rstsr0_cleared'),v('dpsifr0_cleared'),v('flag_after')],[0x81,0x02,0x01,0,0]);
}));
test('review: holdpwm — a GPT PWM started while IOKEEP holds the pins: nothing on the pin until R_LPM_IoKeepClear, the PWM after it',{skip,timeout:900000},()=>review('holdpwm',(emu,interp)=>{
 for(const e of [emu,interp]){assert.deepEqual(e.leds.P408.slice(210,345).filter(v=>v!==0),[],'low while held (restart at 199 ms, released at 349 ms)');assert.equal(e.leds.P408[390],0.5,'PWM duty after the release');}
}));
test('review: pwm — a GPT PWM output in Software Standby: the stop level while the clock is stopped, PWM again after the wake-up',{skip,timeout:900000},()=>review('pwm',(emu,interp)=>{
 for(const e of [emu,interp])assert.deepEqual([e.leds.P408[40],e.leds.P408[150],e.leds.P408[280]],[0.5,0,0.5]);
}));
test('review: isr — R_LPM_LowPowerModeEnter in an interrupt callback enters Deep Software Standby; S1 again resets the MCU',{skip,timeout:900000},()=>review('isr',emu=>{
 assert.deepEqual(emu.session.resets.map(r=>r.reason),['DEEP_STANDBY']);assert.equal(emu.session.readVariable('from'),1);assert.equal(emu.session.readVariable('after'),0,'the callback did not go on');
 assert.match(messages(emu)[0],/^Deep Software Standby 진입 /);assert.match(messages(emu)[1],/^Deep Software Standby 해제 · IRQ1-DS\(P205\) \(200\.\d ms 뒤\)/);
}));
test('review: isrsleep — Sleep in an interrupt callback: a request of the same priority waits, a higher one wakes the core',{skip,timeout:900000},()=>review('isrsleep',emu=>{
 assert.equal(emu.session.readVariable('after'),1);assert.equal(emu.session.readVariable('ticks1'),2,'AGT1 at 150 and 300 ms');
 assert.equal(emu.session.readVariable('ticks0_at_wake'),5,'AGT0 (same priority as the callback) did not run while the callback slept: 5 ticks before the press');
 assert.match(messages(emu)[1],/^Sleep에서 깨어남 · AGT1 언더플로 \(11\d\.\d ms 뒤\)$/);
}));
test('review: pending — a request already waiting keeps WFI from entering Deep Software Standby on both engines',{skip,timeout:900000},()=>review('pending',emu=>{
 assert.deepEqual(messages(emu),[]);assert.equal(emu.session.resets.length,0);assert.equal(emu.session.readVariable('after'),1);assert.equal(emu.session.readVariable('err'),0);assert.equal(emu.session.readVariable('presses'),1);
}));
test('review: rtcsleep — Sleep with an RTC that is only opened: both engines say nothing can end it',{skip,timeout:900000},()=>review('rtcsleep',emu=>{
 assert.equal(messages(emu)[1],'Sleep: 깨울 수 있는 소스가 없습니다 — 켜진 인터럽트가 없습니다. 리셋(S2)으로만 다시 시작합니다.');assert.equal(emu.session.readVariable('woke'),0);
}));
test('review: uart — Sleep ended by the SCI9 transmit interrupt: both logs name it by its vector',{skip,timeout:900000},()=>review('uart',emu=>{
 assert.match(messages(emu)[1],/^Sleep에서 깨어남 · SCI9_TXI \(0\.\d ms 뒤\)$/);assert.equal(emu.session.readVariable('woke'),1);
}));
test('review: wfe — __WFE() with Software Standby configured is not a mode entry on either engine',{skip,timeout:900000},()=>review('wfe',emu=>{
 assert.deepEqual(messages(emu),[]);assert.equal(emu.session.readVariable('ticks0'),57,'AGT0 keeps ticking every 7 ms');assert.equal(emu.session.readVariable('wakes'),103,'the event register lets every second WFE through');
}));
