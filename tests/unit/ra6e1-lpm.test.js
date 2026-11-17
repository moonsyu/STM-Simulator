// Feature 37: the RA6E1 emulator's low power modes (src/emu/ra6e1/lpm.js) at the register level, as FSP r_lpm leaves
// them: SBYCR / DPSBYCR select the mode a WFI enters; WUPEN gates what ends Software Standby; DPSIER / DPSIEGR / DPSIFR
// and the IRQn-DS pins cancel Deep Software Standby with a reset (RSTSR0.DPSRSTF) and DPSBYCR.IOKEEP holds the pins.
// (The real r_lpm.c on a built project: tests/firmware and tests/toolchain/ra-lpm.test.mjs.)
import test from 'node:test';
import assert from 'node:assert/strict';
import {Machine} from '../../src/emu/machine.js';
import {Ra6e1,RaBus} from '../../src/emu/ra6e1/soc.js';
import {RA_IRQ_PINS} from '../../src/ra-config.js';

const SYSTEM=0x4001e000,ICU=0x40006000,WDT=0x40083400,RTC=0x40083000,PFS=0x40080800,PORT4=0x40080080;
const SBYCR=SYSTEM+0x0c,DPSBYCR=SYSTEM+0x400,DPSIER=SYSTEM+0x402,DPSIFR=SYSTEM+0x406,DPSIEGR=SYSTEM+0x40a,RSTSR0=SYSTEM+0x410,WUPEN=ICU+0x1a0,IELSR=n=>ICU+0x300+4*n;
function chip(){
 const resets=[],warnings=[],log=[],pins=new Map(),levels={};
 const machine=new Machine({bus:new RaBus()});
 const soc=new Ra6e1(machine,{onReset:r=>resets.push(r),warn:m=>warnings.push(m),lowPower:m=>log.push(m),pinState:(pin,state)=>pins.set(pin,state),digitalIn:pin=>levels[pin]??null},{irqPins:RA_IRQ_PINS});
 const us=n=>{machine.cpu.cycles+=Math.round(n*soc.clock.iclk/1e6);soc.sync();};
 // The core executes WFI and the machine looks for the next event: the mode begins.
 const wfi=()=>{machine.cpu.sleeping=true;machine._nextDeadline();};
 // The core takes exception `exc` out of WFI.
 const wake=exc=>{machine.cpu.sleeping=false;machine.cpu.onWake(exc);};
 const irq=(slot,event)=>{machine.bus.write32(IELSR(slot),event);machine.nvic.setEnabled(16+slot,1);};
 return {machine,soc,bus:machine.bus,resets,warnings,log,pins,levels,us,wfi,wake,irq};
}

test('Deep Software Standby registers: reset values, masks, flags clear by writing 0, kept across a reset, restarted by a pin reset',()=>{
 const {machine,bus,soc}=chip();
 assert.equal(bus.read8(DPSBYCR),0x01,'DEEPCUT 01b after power-on');assert.equal(bus.read8(DPSIER),0);
 bus.write8(DPSBYCR,0xc0);assert.equal(bus.read8(DPSBYCR),0xc0,'DPSBY | IOKEEP');
 for(let i=0;i<4;i++)bus.write8(DPSIER+i,0xff);
 assert.deepEqual([0,1,2,3].map(i=>bus.read8(DPSIER+i)),[0xf3,0xdf,0x1f,0x0d],'BSP_FEATURE_LPM_DPSIER_MASK 0x0D1FDFF3: no IRQ2-DS, IRQ3-DS, IRQ13-DS');
 for(let i=0;i<3;i++)bus.write8(DPSIEGR+i,0xff);assert.deepEqual([0,1,2].map(i=>bus.read8(DPSIEGR+i)),[0xf3,0xdf,0x13]);
 assert.equal(bus.read16(DPSBYCR),0x00c0,'a wider read: DPSBYCR and DPSWCR');
 soc.lpm.dpsifr=0x00080002;assert.equal(bus.read8(DPSIFR),0x02);assert.equal(bus.read8(DPSIFR+2),0x08);
 bus.write8(DPSIFR,0xff);assert.equal(bus.read8(DPSIFR),0x02,'writing 1 leaves a flag');
 bus.write8(DPSIFR,0x00);assert.equal(bus.read8(DPSIFR),0);assert.equal(bus.read8(DPSIFR+2),0x08,'the other register keeps its flag');
 machine.requestReset('SYSRESETREQ');machine._doReset();
 assert.equal(bus.read8(DPSBYCR),0xc0,'a software reset keeps DPSBYCR');assert.equal(bus.read8(DPSIER+1),0xdf);assert.equal(bus.read8(DPSIFR+2),0x08);
 machine.requestReset('PIN');machine._doReset();
 assert.equal(bus.read8(DPSBYCR),0x01);assert.equal(bus.read8(DPSIER+1),0);assert.equal(bus.read8(DPSIFR+2),0);
});

test('Sleep: a bare WFI without r_lpm is not logged; after r_lpm set the mode it is logged once, with what woke the core',()=>{
 const {bus,soc,log,us,wfi,wake,irq,machine}=chip();
 assert.equal(typeof machine.cpu.onWake,'function','the core tells the SoC when it leaves WFI');
 irq(3,0x002);
 wfi();assert.equal(soc.lpm.mode,'SLEEP');us(1000);wake(16+3);assert.equal(soc.lpm.mode,null);assert.deepEqual(log,[],'a program that only idles in WFI');
 bus.write16(SBYCR,0);
 wfi();us(2500);wake(16+3);
 assert.deepEqual(log,['Sleep 진입 · CPU 정지, 주변장치는 계속 동작 — 인터럽트가 깨웁니다 (이후의 Sleep 진입·깨어남은 적지 않습니다)','Sleep에서 깨어남 · IRQ1 (2.5 ms 뒤)']);
 wfi();us(100);wake(16+3);assert.equal(log.length,2,'only the first Sleep of a program start');
 // No interrupt enabled and no watchdog: nothing can end the Sleep.
 const b=chip();b.bus.write16(SBYCR,0);b.wfi();
 assert.match(b.log[1],/^Sleep: 깨울 수 있는 소스가 없습니다 — 켜진 인터럽트가 없습니다\. 리셋\(S2\)으로만 다시 시작합니다\.$/);
});

test('Sleep and the WDT: with its stop control (WDTCSTPR.SLCSTP) the count stops in Sleep and goes on after it',()=>{
 for(const stop of [true,false]){
  const {bus,soc,us,wfi,wake,irq}=chip();irq(0,0x002);
  bus.write16(WDT+2,0x3383);bus.write8(WDT+6,0x80);bus.write8(WDT+8,stop?0x80:0);bus.write8(WDT,0);bus.write8(WDT,0xff);
  assert.equal(soc.wdt.running,true);us(10000);const before=soc.wdt.counter();
  wfi();us(50000);assert.equal(soc.wdt.running,!stop);assert.equal(soc.wdt.counter()===before,stop,stop?'frozen':'counting');
  wake(16);assert.equal(soc.wdt.running,true);us(10000);assert.ok(soc.wdt.counter()<before,'counting again');
 }
});

test('Software Standby: only WUPEN sources reach the ICU, the PCLK timers and the WDT keep their counts, deferred requests come at wake-up',()=>{
 const {bus,soc,log,us,wfi,wake,irq}=chip();
 irq(0,0x002);irq(1,0x001);irq(2,0x0cf);                    // IRQ1, IRQ0, GPT1 overflow
 bus.write16(SBYCR,0x8000);bus.write32(WUPEN,1<<1);
 const gpt=soc.gpts[1],agtP=soc.agts[0],agtL=soc.agts[1];
 gpt.start();agtP.start();agtL.b[0x09]=0x40;agtL.start();    // AGT1 counts LOCO
 bus.write16(WDT+2,0x3383);bus.write8(WDT+8,0);bus.write8(WDT,0);bus.write8(WDT,0xff);
 us(1000);const count=gpt.count(),wdt=soc.wdt.counter();
 wfi();assert.equal(soc.lpm.mode,'STANDBY');
 assert.equal(gpt.running,false);assert.equal(agtP.running,false,'PCLKB');assert.equal(agtL.running,true,'LOCO goes on');assert.equal(soc.wdt.running,false,'the WDT stops whatever its stop control');
 us(200000);assert.equal(soc.wdt.counter(),wdt);
 soc.raiseEvent(0x001);assert.equal(soc.icu.ielsr(1)&0x10000,0,'IRQ0 is not a wake source: the edge is not seen');
 soc.raiseEvent(0x0cf);assert.equal(soc.icu.ielsr(2)&0x10000,0,'a stopped module: its request waits');
 soc.raiseEvent(0x002);assert.equal(soc.icu.ielsr(0)&0x10000,0x10000,'IRQ1 is in WUPEN');
 wake(16);assert.equal(soc.lpm.mode,null);
 assert.equal(gpt.running,true);assert.equal(gpt.count(),count,'the counter goes on from where it stopped');assert.equal(agtP.running,true);assert.equal(soc.wdt.running,true);
 assert.equal(soc.icu.ielsr(2)&0x10000,0x10000,'handed over at wake-up');assert.equal(soc.icu.ielsr(1)&0x10000,0);
 assert.deepEqual(log,['Software Standby 진입 · 클록 정지 — 깨우는 소스: IRQ1','Software Standby에서 깨어남 · IRQ1 (200.0 ms 뒤)']);
});

test('Software Standby with nothing to wake it says why, and stays in the mode',()=>{
 const a=chip();a.bus.write16(SBYCR,0x8000);a.wfi();
 assert.deepEqual(a.log,['Software Standby 진입 · 클록 정지 — 깨우는 소스: 없음','Software Standby: 깨울 수 있는 소스가 없습니다 — 설정된 소스가 없습니다. 리셋(S2)으로만 다시 시작합니다.']);
 assert.equal(a.soc.lpm.mode,'STANDBY');a.us(5e6);assert.equal(a.machine.cpu.sleeping,true,'time passes, the CPU stays stopped');
 // IRQ1 in WUPEN but its interrupt not enabled; AGT1 counting PCLKB stops; LVD1 is not modelled.
 const b=chip();b.bus.write16(SBYCR,0x8000);b.bus.write32(WUPEN,(1<<1)|(1<<18)|(1<<28));b.irq(4,0x043);b.soc.agts[1].start();b.wfi();
 assert.equal(b.log[0],'Software Standby 진입 · 클록 정지 — 깨우는 소스: IRQ1, LVD1, AGT1 언더플로');
 assert.equal(b.log[1],'Software Standby: 깨울 수 있는 소스가 없습니다 — IRQ1: 인터럽트가 켜져 있지 않습니다, LVD1: 시뮬레이터가 다루지 않는 소스입니다, AGT1 언더플로: 이 모드에서 멈춥니다. 리셋(S2)으로만 다시 시작합니다.');
 // The same AGT1 on LOCO with its interrupt can wake it: no such line.
 const c=chip();c.bus.write16(SBYCR,0x8000);c.bus.write32(WUPEN,1<<28);c.irq(4,0x043);c.soc.agts[1].b[0x09]=0x40;c.soc.agts[1].start();c.wfi();
 assert.equal(c.log.length,1);
});

test('Deep Software Standby: an IRQn-DS pin edge sets DPSIFR and resets the MCU (RSTSR0.DPSRSTF); the IRQn pin of the same channel does not',()=>{
 const {machine,bus,soc,log,resets,levels,us,wfi}=chip();
 bus.write8(DPSBYCR,0x80);bus.write8(DPSIER,0x02);bus.write16(SBYCR,0x8000);       // DPSBY, IRQ1-DS falling, no IOKEEP
 levels.P205=1;levels.P101=1;soc.inputsUpdated();
 wfi();assert.equal(soc.lpm.mode,'DEEP');us(300000);
 levels.P101=0;soc.inputsUpdated();assert.equal(soc.lpm.mode,'DEEP','P101 is IRQ1, not IRQ1-DS');assert.equal(bus.read8(DPSIFR),0);
 levels.P205=0;soc.inputsUpdated();
 assert.equal(bus.read8(DPSIFR),0x02,'DIRQ1F');assert.equal(machine._resetPending,'DEEP_STANDBY');
 machine._doReset();
 assert.deepEqual(resets,['DEEP_STANDBY']);assert.equal(bus.read8(RSTSR0),0x81,'DPSRSTF | PORF');assert.equal(soc.lpm.mode,null);assert.equal(soc.lpm.hold,false);
 assert.deepEqual(log,['Deep Software Standby 진입 · DEEPCUT0, I/O 리셋 상태로(IOKEEP 0) — 해제 소스: IRQ1-DS(P205)','Deep Software Standby 해제 · IRQ1-DS(P205) (300.0 ms 뒤) — MCU 리셋(RSTSR0.DPSRSTF = 1)']);
 bus.write8(RSTSR0,0x01);assert.equal(bus.read8(RSTSR0),0x01,'DPSRSTF cleared by writing 0');
 // The rising edge when DPSIEGR says so; outside the mode the flag is set and nothing else happens.
 bus.write8(DPSIFR,0);bus.write8(DPSIEGR,0x02);levels.P205=1;soc.inputsUpdated();
 assert.equal(bus.read8(DPSIFR),0x02);assert.equal(machine._resetPending,null);
});

test('Deep Software Standby with IOKEEP: the pins keep their state across the reset until the bit is cleared',()=>{
 const {machine,bus,soc,pins,levels,wfi}=chip();
 const led=()=>pins.get('P408');
 bus.write8(PFS+0xd03-0x800,0);bus.write8(PFS+0xd03-0x800,0x40);                 // PWPR: PFSWE
 bus.write32(PFS+4*(4*16+8),0x05);assert.deepEqual([led().mode,led().value],['OUTPUT',3.3],'P408 output high');
 bus.write8(DPSBYCR,0xc0);bus.write8(DPSIER,0x02);bus.write16(SBYCR,0x8000);levels.P205=1;soc.inputsUpdated();
 wfi();levels.P205=0;soc.inputsUpdated();machine._doReset();
 assert.equal(soc.lpm.hold,true);assert.deepEqual([led().mode,led().value],['OUTPUT',3.3],'held through the reset');
 assert.equal(bus.read32(PFS+4*(4*16+8))&0x05,0,'the register itself is in its reset state');
 bus.write8(PFS+0xd03-0x800,0);bus.write8(PFS+0xd03-0x800,0x40);bus.write32(PFS+4*(4*16+8),0x04);
 assert.equal(led().value,3.3,'a write does not reach the pin yet');
 bus.write8(DPSBYCR,bus.read8(DPSBYCR)&~0x40);                                    // R_LPM_IoKeepClear
 assert.equal(soc.lpm.hold,false);assert.deepEqual([led().mode,led().value],['OUTPUT',0],'now the pin follows the register');
 void PORT4;
});

test('Deep Software Standby: the RTC periodic request cancels it; with DEEPCUT 1 an RTC on LOCO stops and cannot',()=>{
 const a=chip();
 a.bus.write8(RTC+0x22,(14<<4)|4);                                                 // RCR1: PIE, 1 s
 a.bus.write8(DPSBYCR,0x80);a.bus.write8(DPSIER+2,0x04);a.bus.write16(SBYCR,0x8000);
 assert.equal(a.soc.listens(0x55),true,'the RTC times its request for the cancel source although no IELSR slot links it');
 a.wfi();assert.equal(a.log.length,1);a.us(999000);assert.equal(a.machine._resetPending,null);a.us(2000);
 assert.equal(a.machine._resetPending,'DEEP_STANDBY');assert.equal(a.bus.read8(DPSIFR+2),0x04,'DTRTCIIF');
 assert.match(a.log[1],/^Deep Software Standby 해제 · RTC 주기 \(1\.00 s 뒤\)/);
 const b=chip();
 b.bus.write8(RTC+0x28,1);b.bus.write8(RTC+0x22,(14<<4)|4);
 b.bus.write8(DPSBYCR,0x81);b.bus.write8(DPSIER+2,0x04);b.bus.write16(SBYCR,0x8000);
 b.wfi();assert.equal(b.soc.rtc.running,false,'LOCO is not powered with DEEPCUT 1');
 assert.equal(b.log[0],'Deep Software Standby 진입 · DEEPCUT1, I/O 리셋 상태로(IOKEEP 0) — 해제 소스: RTC 주기');
 assert.equal(b.log[1],'Deep Software Standby: 깨울 수 있는 소스가 없습니다 — RTC 주기: 이 모드에서 멈춥니다. 리셋(S2)으로만 다시 시작합니다.');
 b.us(3e6);assert.equal(b.machine._resetPending,null);
 // No source at all: reset only.
 const c=chip();c.bus.write8(DPSBYCR,0x80);c.bus.write16(SBYCR,0x8000);c.wfi();
 assert.equal(c.log[0],'Deep Software Standby 진입 · DEEPCUT0, I/O 리셋 상태로(IOKEEP 0) — 해제 소스: 없음(리셋만)');assert.match(c.log[1],/설정된 소스가 없습니다/);
});

test('a reset while a mode is on ends it: the watchdog of a Sleep without stop control resets the MCU',()=>{
 const {machine,bus,soc,resets,us,wfi}=chip();
 bus.write16(SBYCR,0);bus.write16(WDT+2,0x0010);bus.write8(WDT+6,0x80);bus.write8(WDT+8,0);bus.write8(WDT,0);bus.write8(WDT,0xff);  // 1024 clocks of PCLKB / 4
 wfi();assert.equal(soc.lpm.mode,'SLEEP');us(1e6);
 assert.equal(machine._resetPending,'WDT');machine._doReset();assert.deepEqual(resets,['WDT']);assert.equal(soc.lpm.mode,null);
});
