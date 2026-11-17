// Feature 39: the RA6E1 data flash (r_flash_hp g_flash0) — the contents model with its blank state, the emulator's flash
// sequencer (FACI registers and command sequences as r_flash_hp.c issues them, FRDYI / FIFERR events), the Stacks
// settings and generated FSP files, the built-in interpreter's R_FLASH_HP_* and data flash reads through a pointer,
// and the contents kept in the project file.
import test from 'node:test';
import assert from 'node:assert/strict';
import {RaDataFlash,validateDataFlash,dataFlashUsed,RA_DF_BASE,RA_DF_SIZE,RA_DF_TIME_US} from '../../src/ra-data-flash.js';
import {Faci,FACI,FSTATR,FCU_EVENT,FASTAT_CMDLK} from '../../src/emu/ra6e1/flash.js';
import {Machine} from '../../src/emu/machine.js';
import {Ra6e1,RaBus,RA_BASES} from '../../src/emu/ra6e1/soc.js';

test('data flash contents: erased units are blank, a unit is programmed once, an erase clears its 64-byte block',()=>{
 const f=new RaDataFlash();
 assert.equal(f.bytes.length,RA_DF_SIZE);assert.ok(f.isBlank(0,RA_DF_SIZE));assert.equal(f.used(),0);assert.deepEqual(f.encode(),[]);assert.equal(f.changed,false);
 assert.equal(f.program(64,[0x78,0x56,0x34,0x12]),true);assert.equal(f.changed,true);
 assert.deepEqual([...f.bytes.subarray(64,68)],[0x78,0x56,0x34,0x12]);assert.equal(f.isBlank(64,4),false);assert.ok(f.isBlank(68,60));
 // A unit programmed with 0xFFFFFFFF is not blank although it reads like an erased one.
 f.program(72,[0xff,0xff,0xff,0xff]);assert.equal(f.isBlank(72,1),false);assert.equal(f.firstProgrammed(66,20),66);assert.equal(f.firstProgrammed(68,20),72);assert.equal(f.firstProgrammed(76,20),-1);
 // Programming a unit again fails and leaves neither value (the model keeps the AND).
 assert.equal(f.program(64,[0x0f,0xf0,0xff,0x00]),false);assert.deepEqual([...f.bytes.subarray(64,68)],[0x08,0x50,0x34,0x00]);
 assert.deepEqual(f.encode(),[{at:64,hex:'08503400'},{at:72,hex:'ffffffff'}]);assert.equal(f.used(),8);
 f.program(68,[1,2,3,4]);assert.deepEqual(f.encode(),[{at:64,hex:'0850340001020304ffffffff'}],'adjacent units are one run');
 f.erase(100);assert.ok(f.isBlank(64,64),'the block that holds offset 100');assert.deepEqual(f.encode(),[]);
 assert.ok(f.inRange(RA_DF_SIZE-4,4));assert.ok(!f.inRange(RA_DF_SIZE-3,4));assert.ok(!f.inRange(-4,4));
});

test('saved contents: runs go back as they were, an ELF\'s own units stay with keep, bad runs are refused',()=>{
 const f=new RaDataFlash();f.program(0,[1,0,0,0]);f.program(8188,[0xde,0xad,0xbe,0xef]);
 const runs=f.encode();assert.deepEqual(runs,[{at:0,hex:'01000000'},{at:8188,hex:'deadbeef'}]);assert.equal(dataFlashUsed(runs),8);assert.equal(dataFlashUsed(undefined),0);
 const g=new RaDataFlash().apply(runs);assert.deepEqual(g.encode(),runs);assert.equal(g.changed,false,'restoring is not a change of this run');
 const h=new RaDataFlash();h.load(0,0x55);h.apply(runs,{keep:true});assert.equal(h.bytes[0],0x55,'the image\'s unit stays');assert.deepEqual([...h.bytes.subarray(8188,8192)],[0xde,0xad,0xbe,0xef]);
 assert.equal(validateDataFlash(undefined),undefined);assert.deepEqual(validateDataFlash([]),[]);
 for(const bad of [{},[{at:2,hex:'00000000'}],[{at:0,hex:'000000'}],[{at:0,hex:'0000000G'}],[{at:0,hex:'00000000'},{at:0,hex:'00000000'}],[{at:8192,hex:'00000000'}],[{at:8188,hex:'0000000000000000'}],[{at:0,hex:'AABBCCDD'}],[null]])
  assert.throws(()=>validateDataFlash(bad),/저장된 데이터 플래시 내용이 올바르지 않습니다/,JSON.stringify(bad));
});

// A fake SoC for the sequencer model: time in µs, a timer list, the events it raises.
function fakeSoc(){
 const soc={now:0,timers:[],events:[],warnings:[],fwe:true,dataFlash:new RaDataFlash(),nowUs:()=>soc.now,sync(){},
  after:(us,fn)=>{const e={t:soc.now+us,fn,cancel(){e.dead=true;}};soc.timers.push(e);return e;},raiseEvent:ev=>soc.events.push([ev,soc.now]),flashWriteEnabled:()=>soc.fwe,env:{warn:w=>soc.warnings.push(w)}};
 soc.fire=()=>{const e=soc.timers.filter(e=>!e.dead).sort((a,b)=>a.t-b.t)[0];e.dead=true;soc.now=e.t;e.fn();};
 return soc;
}
// The command sequences of r_flash_hp.c (flash_hp_write_data, flash_hp_erase_block, flash_hp_df_blank_check).
const enter=d=>d.write(FACI.FENTRYR,0xaa80,2),leave=d=>d.write(FACI.FENTRYR,0xaa00,2);
const program=(d,address,words)=>{d.write(FACI.FSADDR,address,4);d.command(0xe8,1);d.command(words.length,1);for(const w of words)d.command(w,2);d.command(0xd0,1);};
const erase=(d,address)=>{d.write(FACI.FSADDR,address,4);d.command(0x20,1);d.command(0xd0,1);};
const blankCheck=(d,address,bytes)=>{d.write(FACI.FBCCNT,0,1);d.write(FACI.FSADDR,address,4);d.write(FACI.FEADDR,address+bytes-1,4);d.command(0x71,1);d.command(0xd0,1);};
const frdy=d=>!!(d.read(FACI.FSTATR,4)&FSTATR.FRDY);

test('sequencer: P/E mode entry by key, erase / program / blank check take their time with FRDY 0, results in FBCSTAT',()=>{
 const soc=fakeSoc(),d=new Faci(soc);
 assert.equal(d.read(FACI.FSTATR,4),FSTATR.FRDY,'ready, no error');assert.equal(d.read(FACI.FENTRYR,2),0);
 d.write(FACI.FENTRYR,0x0080,2);assert.equal(d.read(FACI.FENTRYR,2),0,'no key: ignored');
 enter(d);assert.equal(d.read(FACI.FENTRYR,2),0x0080);
 d.write(FACI.FENTRYR,0xaa01,2);assert.equal(d.read(FACI.FENTRYR,2),0x0080,'to code flash P/E mode only through read mode');
 erase(d,RA_DF_BASE+0x47);assert.equal(frdy(d),false);assert.equal(d.busyUs(),RA_DF_TIME_US.erase);
 soc.now=RA_DF_TIME_US.erase-1;assert.equal(frdy(d),false);soc.fire();assert.equal(frdy(d),true);assert.equal(soc.now,RA_DF_TIME_US.erase);
 program(d,RA_DF_BASE+0x40,[0x5678,0x1234]);assert.equal(frdy(d),false);soc.fire();assert.equal(d.read(FACI.FSTATR,4),FSTATR.FRDY);
 assert.deepEqual([...soc.dataFlash.bytes.subarray(0x40,0x44)],[0x78,0x56,0x34,0x12]);
 // Blank check of 8 bytes from the programmed unit: not blank, the address of the first programmed byte; then a blank range.
 blankCheck(d,RA_DF_BASE+0x40,8);assert.ok(Math.abs(d.busyUs()-RA_DF_TIME_US.blankCheck*2)<1e-6,'two 4-byte units');soc.fire();assert.equal(d.read(FACI.FBCSTAT,1),1);assert.equal(d.read(FACI.FBCADDR,4),RA_DF_BASE+0x40);
 blankCheck(d,RA_DF_BASE+0x44,60);soc.fire();assert.equal(d.read(FACI.FBCSTAT,1),0);
 leave(d);assert.equal(d.read(FACI.FENTRYR,2),0);assert.deepEqual(soc.events,[],'no interrupt enabled');assert.deepEqual(soc.warnings,[]);
 // FENTRYR cannot change while a command runs; the byte lanes of a register read as on the bus.
 enter(d);erase(d,RA_DF_BASE);leave(d);assert.equal(d.read(FACI.FENTRYR,2),0x0080);assert.match(soc.warnings.pop(),/FENTRYR를 바꿀 수 없습니다/);
 assert.equal(d.read(FACI.FSTATR+1,1),0,'FRDY is bit 15: the second byte');soc.fire();assert.equal(d.read(FACI.FSTATR+1,1),0x80);
});

test('sequencer: programming a unit that is not blank ends in PRGERR and the command-locked state; forced stop and status clear recover',()=>{
 const soc=fakeSoc(),d=new Faci(soc);enter(d);
 program(d,RA_DF_BASE,[0x1111,0x2222]);soc.fire();
 program(d,RA_DF_BASE,[0x3333,0x4444]);assert.equal(d.read(FACI.FSTATR,4),0,'busy, the error comes when the command ends');soc.fire();
 assert.equal(d.read(FACI.FSTATR,4),FSTATR.FRDY|FSTATR.PRGERR);assert.equal(d.read(FACI.FASTAT,1),FASTAT_CMDLK);
 assert.match(soc.warnings[0],/^\[FLASH\] 0x08000000: 지우지 않은\(이미 쓴\) 곳에 다시 썼습니다 — 프로그램 오류\(FSTATR\.PRGERR\)/);
 assert.deepEqual([...soc.dataFlash.bytes.subarray(0,4)],[0x11,0x11,0x00,0x00],'neither value');
 // Command-locked: a new command is not taken.
 erase(d,RA_DF_BASE);assert.equal(frdy(d),true);assert.equal(soc.dataFlash.isBlank(0,4),false);
 // Forced stop (what flash_hp_check_errors issues): the lock and the error flags are gone, the next command works.
 d.command(0xb3,1);assert.equal(d.read(FACI.FSTATR,4),FSTATR.FRDY);assert.equal(d.read(FACI.FASTAT,1),0);
 erase(d,RA_DF_BASE);soc.fire();assert.ok(soc.dataFlash.isBlank(0,64));
 // An unknown command, a wrong word count and a missing final byte are illegal commands; status clear recovers.
 for(const bad of [()=>d.command(0x40,1),()=>{d.command(0xe8,1);d.command(4,1);},()=>{d.command(0x20,1);d.command(0x00,1);},()=>{d.write(FACI.FSADDR,0x1000,4);d.command(0x20,1);d.command(0xd0,1);},()=>{d.command(0xe8,1);d.command(2,1);d.command(0x12,1);}]){
  bad();assert.equal(d.read(FACI.FSTATR,4),FSTATR.FRDY|FSTATR.ILGLERR);assert.equal(d.read(FACI.FASTAT,1),FASTAT_CMDLK);
  d.command(0x50,1);assert.equal(d.read(FACI.FSTATR,4),FSTATR.FRDY);assert.equal(d.read(FACI.FASTAT,1),0);
 }
 // Without FWEPROR.FLWE = 01 nothing is programmed or erased (FLWEERR).
 soc.fwe=false;program(d,RA_DF_BASE,[1,2]);assert.equal(d.read(FACI.FSTATR,4),FSTATR.FRDY|FSTATR.FLWEERR);assert.ok(soc.dataFlash.isBlank(0,4));d.command(0xb3,1);soc.fwe=true;
 // Code flash P/E mode: no code flash programming in the model.
 leave(d);d.write(FACI.FENTRYR,0xaa01,2);assert.equal(d.read(FACI.FENTRYR,2),1);d.command(0x20,1);assert.equal(d.read(FACI.FASTAT,1),FASTAT_CMDLK);assert.match(soc.warnings.at(-1),/코드 플래시 프로그래밍/);
 d.command(0xb3,1);leave(d);
 // In read mode the command area takes nothing.
 const before=soc.warnings.length;d.command(0x20,1);assert.equal(d.read(FACI.FSTATR,4),FSTATR.FRDY);assert.equal(soc.warnings.length,before+1);assert.match(soc.warnings.at(-1),/P\/E 모드가 아닐 때/);
});

test('sequencer interrupts: FRDYI when FRDY returns to 1 with FRDYIE, FIFERR when an enabled error flag sets; forced stop of a running command',()=>{
 const soc=fakeSoc(),d=new Faci(soc);
 d.write(FACI.FRDYIE,1,1);d.write(FACI.FAEINT,0x98,1);enter(d);
 erase(d,RA_DF_BASE);assert.deepEqual(soc.events,[]);soc.fire();assert.deepEqual(soc.events,[[FCU_EVENT.FRDYI,RA_DF_TIME_US.erase]]);
 program(d,RA_DF_BASE,[1,2]);soc.fire();soc.events.length=0;
 // The failed program: flash ready first, then the access error.
 program(d,RA_DF_BASE,[3,4]);soc.fire();assert.deepEqual(soc.events.map(e=>e[0]),[FCU_EVENT.FRDYI,FCU_EVENT.FIFERR]);
 // The error line is raised once while the lock stays; after forced stop a new error raises it again.
 soc.events.length=0;d.command(0x40,1);assert.deepEqual(soc.events,[]);
 d.command(0xb3,1);assert.deepEqual(soc.events,[],'nothing was running');d.command(0x40,1);assert.deepEqual(soc.events.map(e=>e[0]),[FCU_EVENT.FIFERR]);
 d.command(0x50,1);soc.events.length=0;
 // Forced stop while a command runs: FRDY comes back at once, with its interrupt.
 erase(d,RA_DF_BASE+64);d.command(0xb3,1);assert.equal(frdy(d),true);assert.deepEqual(soc.events.map(e=>e[0]),[FCU_EVENT.FRDYI]);
 // With FAEINT 0 an error raises nothing (the driver without background operation).
 soc.events.length=0;d.write(FACI.FAEINT,0,1);d.write(FACI.FRDYIE,0,1);d.command(0x40,1);assert.deepEqual(soc.events,[]);
 // Enabling the interrupt with the flag already set raises it.
 d.write(FACI.FAEINT,0x10,1);assert.deepEqual(soc.events.map(e=>e[0]),[FCU_EVENT.FIFERR]);
});

test('sequencer: a read of the data flash by the program says so once for a blank unit, and during P/E mode',()=>{
 const soc=fakeSoc(),d=new Faci(soc);
 soc.dataFlash.program(0,[1,2,3,4]);d.dataRead(0,4);assert.deepEqual(soc.warnings,[]);
 d.dataRead(2,4);assert.equal(soc.warnings.length,1);assert.match(soc.warnings[0],/^\[FLASH\] 지운\(빈\) 데이터 플래시 0x08000004를 읽었습니다 — 실제 칩에서는 지운 곳을 읽은 값이 정해지지 않습니다\(시뮬레이터는 0xFF\)\. 비었는지는 R_FLASH_HP_BlankCheck로 확인하세요\.$/);
 d.dataRead(100,1);assert.equal(soc.warnings.length,1,'once in a run');
 enter(d);d.dataRead(0,4);assert.match(soc.warnings[1],/데이터 플래시 P\/E 모드.*읽은 값이 보장되지 않습니다/);
});

test('RA6E1 SoC: the FACI is on the bus at 0x407FE000 / 0x407E0000, FWEPROR gates programming, the data flash reads at 0x08000000 and survives a reset',()=>{
 const warnings=[],machine=new Machine({bus:new RaBus()}),soc=new Ra6e1(machine,{warn:w=>warnings.push(w)}),bus=machine.bus;
 assert.equal(RA_BASES.FACI,0x407fe000);assert.equal(soc.dataFlash,bus.dataFlashStore);
 assert.equal(bus.read32(RA_BASES.FACI+FACI.FSTATR)>>>0,FSTATR.FRDY);
 assert.equal(bus.read8(0x4001e416),0x02,'FWEPROR after reset: P/E disabled');
 const command=(v,size=1)=>size===1?bus.write8(RA_BASES.FACI_CMD,v):bus.write16(RA_BASES.FACI_CMD,v);
 const run=us=>{machine.cycles+=Math.ceil(us*soc.clock.iclk/1e6)+1;soc.sync();};
 bus.write16(RA_BASES.FACI+FACI.FENTRYR,0xaa80);bus.write32(RA_BASES.FACI+FACI.FSADDR,RA_DF_BASE);
 command(0x20);command(0xd0);assert.equal(bus.read32(RA_BASES.FACI+FACI.FSTATR)&FSTATR.FLWEERR,FSTATR.FLWEERR,'FWEPROR not opened');
 assert.match(warnings.pop(),/^\[FLASH\] FWEPROR\.FLWE가 01이 아니라 프로그램·지우기를 할 수 없습니다/);
 command(0xb3);bus.write8(0x4001e416,0x01);
 command(0x20);command(0xd0);assert.equal(bus.read32(RA_BASES.FACI+FACI.FSTATR)>>>0,0,'erasing');run(RA_DF_TIME_US.erase);assert.equal(bus.read32(RA_BASES.FACI+FACI.FSTATR)>>>0,FSTATR.FRDY);
 command(0xe8);command(2);command(0xbeef,2);command(0xdead,2);command(0xd0);run(RA_DF_TIME_US.write);
 bus.write16(RA_BASES.FACI+FACI.FENTRYR,0xaa00);
 assert.equal(bus.read32(RA_DF_BASE)>>>0,0xdeadbeef);assert.equal(bus.read8(RA_DF_BASE+1),0xbe);assert.deepEqual(warnings,[]);
 assert.equal(bus.read32(RA_DF_BASE+4)>>>0,0xffffffff);assert.equal(warnings.length,1,'a blank unit was read');assert.match(warnings[0],/0x08000004/);
 assert.equal(bus.peek(RA_DF_BASE+8,4),0xffffffff);assert.equal(warnings.length,1,'the debugger\'s peek is not a read by the program');
 // The C-cache flush r_flash_hp asks for after data flash P/E reads back done.
 bus.write32(RA_BASES.CACHE+4,1);assert.equal(bus.read32(RA_BASES.CACHE+4),0);
 // An MCU reset: the sequencer and FWEPROR start over, the contents stay.
 bus.write16(RA_BASES.FACI+FACI.FENTRYR,0xaa80);machine.reset();
 assert.equal(bus.read16(RA_BASES.FACI+FACI.FENTRYR),0);assert.equal(bus.read8(0x4001e416),0x02);assert.equal(bus.read32(RA_DF_BASE)>>>0,0xdeadbeef);
 assert.deepEqual(soc.dataFlash.encode(),[{at:0,hex:'efbeadde'}]);
 // An image's data flash bytes (an ELF's .data_flash) are programmed units; loading a new image starts from erased flash.
 bus.loadBytes(RA_DF_BASE+64,Uint8Array.of(9,8,7,6));assert.equal(soc.dataFlash.isBlank(64,4),false);assert.equal(bus.read8(RA_DF_BASE+65),8);
 bus.resetMemory({keepFlash:false});assert.equal(soc.dataFlash.used(),0);assert.equal(bus.read8(RA_DF_BASE),0xff);
});
