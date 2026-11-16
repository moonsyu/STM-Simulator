// RA6E1 emulator foundations for the watchdogs, the RTC and low-power modes: the option-setting memory (OFS0) the ELF
// programs, the reset request wiring with its log entry, the reset status registers RSTSR0/1/2 that survive a reset,
// the event helpers the models use, and the note for a register the model does not have.
import test from 'node:test';
import assert from 'node:assert/strict';
import {Machine} from '../../src/emu/machine.js';
import {Ra6e1,RaBus} from '../../src/emu/ra6e1/soc.js';
import {RA_OPTION_SETTING} from '../../src/emu/ra6e1/bus.js';

const SYSTEM=0x4001e000;
function chip(){
 const resets=[],warnings=[];
 const machine=new Machine({bus:new RaBus()}),soc=new Ra6e1(machine,{onReset:r=>resets.push(r),warn:m=>warnings.push(m)},{});
 return {machine,soc,bus:machine.bus,resets,warnings};
}

test('option-setting memory: OFS0 at 0x0100A100 keeps what the ELF programs; erased elsewhere and after a new load',()=>{
 const bus=new RaBus();
 assert.equal(bus.ofs0,0xffffffff,'erased');
 bus.loadBytes(RA_OPTION_SETTING,[0xfd,0xff,0xfe,0xff]);
 assert.equal(bus.ofs0,0xfffefffd);assert.equal(bus.read32(RA_OPTION_SETTING)>>>0,0xfffefffd);assert.equal(bus.read8(RA_OPTION_SETTING),0xfd);
 assert.equal(bus.read32(RA_OPTION_SETTING+0x10)>>>0,0xffffffff);assert.equal(bus.read32(0x01000000)>>>0,0xffffffff,'outside the region');
 assert.equal(bus.peek(RA_OPTION_SETTING,4),0xfffefffd,'the debugger sees it');
 bus.resetMemory({keepFlash:true});assert.equal(bus.ofs0,0xfffefffd,'a reset keeps the flash');
 bus.resetMemory({keepFlash:false});assert.equal(bus.ofs0,0xffffffff,'loading another ELF erases it');
});

test('reset status: PORF at power-on; SYSRESETREQ goes through prepareReset (log entry, SWRF), flags survive the reset and clear by writing 0',()=>{
 const {machine,bus,resets}=chip();
 assert.equal(bus.read8(SYSTEM+0x410),1,'RSTSR0.PORF');assert.equal(bus.read16(SYSTEM+0xc0),0,'RSTSR1');assert.equal(bus.read8(SYSTEM+0x411),0,'RSTSR2.CWSF: cold start');
 bus.write8(SYSTEM+0x411,1);assert.equal(bus.read8(SYSTEM+0x411),1,'CWSF is set by software');
 machine.requestReset('SYSRESETREQ');machine._doReset();
 assert.deepEqual(resets,['SYSRESETREQ'],'env.onReset: the session logs "MCU 리셋"');
 assert.equal(bus.read16(SYSTEM+0xc0),4,'RSTSR1.SWRF after the reset');assert.equal(bus.read8(SYSTEM+0x410),1,'PORF stays until cleared');assert.equal(bus.read8(SYSTEM+0x411),1,'CWSF stays');
 machine.requestReset('WDT');machine._doReset();machine.requestReset('IWDT');machine._doReset();
 assert.equal(bus.read16(SYSTEM+0xc0),7,'IWDTRF | WDTRF | SWRF');assert.equal(bus.read8(SYSTEM+0xc0),7,'byte read');
 bus.write16(SYSTEM+0xc0,0xffff);assert.equal(bus.read16(SYSTEM+0xc0),7,'writing 1 leaves the flags');
 bus.write16(SYSTEM+0xc0,~2&0xffff);assert.equal(bus.read16(SYSTEM+0xc0),5,'writing 0 clears WDTRF only');
 bus.write8(SYSTEM+0x410,0);assert.equal(bus.read8(SYSTEM+0x410),0,'PORF cleared');
 machine.requestReset('PIN');machine._doReset();assert.equal(bus.read16(SYSTEM+0xc0),0,'a pin reset starts the causes over');
});

test('event helpers: raiseEvent sets IR in the linked IELSR slot, listens tells whether a slot links the event',()=>{
 const {soc,bus}=chip();
 assert.equal(soc.listens(0x55),false);
 bus.write32(0x40006000+0x300+4*3,0x55);assert.equal(soc.listens(0x55),true);
 soc.raiseEvent(0x55);assert.equal(bus.read32(0x40006000+0x300+4*3)&0x10000,0x10000,'IR');
 soc.raiseEvent(0x54);assert.equal(soc.icu.ielsr(3)&0x10000,0x10000);
});

test('a register the model does not have is said once per address in the output',()=>{
 const {bus,warnings}=chip();
 bus.write32(0x40050000,1);bus.read32(0x40050000);bus.read32(0x40050002);
 assert.equal(warnings.length,1);assert.match(warnings[0],/0x40050000: 이 레지스터는 아직 모델에 없습니다/);
 bus.read32(0x40050004);assert.equal(warnings.length,2);
 // The security attribution block the BSP writes in every project is a register block (no note).
 bus.write32(0x400e0004,0xffffffff);assert.equal(warnings.length,2);
});

test('NMI sources: a status set while its NMIER bit is off requests the NMI once the bit is set; NMICLR clears the status',()=>{
 const {machine,soc,bus}=chip(),pended=[];
 machine.nvic.setPendingExc=n=>pended.push(n);
 soc.nmi(1);assert.deepEqual(pended,[],'WDT underflow with NMIER.WDTEN 0');assert.equal(bus.read16(0x40006140),2,'NMISR.WDTST');
 bus.write16(0x40006120,2);assert.deepEqual(pended,[2],'enabled: the NMI exception pends');
 bus.write16(0x40006120,0);assert.equal(bus.read16(0x40006120),2,'NMIER bits cannot be cleared');assert.equal(pended.length,1);
 bus.write16(0x40006130,2);assert.equal(bus.read16(0x40006140),0);
 soc.nmi(1);assert.equal(pended.length,2,'enabled source: at once');
});
