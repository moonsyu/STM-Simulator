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
import {raDefaultMcu,validateRaMcu,raNameProblem} from '../../src/ra-config.js';
import {generateRaFiles,raVectors,raInstances} from '../../src/ra-generator.js';
import {raAssistance} from '../../src/ra-assistance.js';
import {raExample} from '../../src/ra-examples.js';
import {SimulationSession} from '../../src/session.js';
import {projectForBoard,validateProject} from '../../src/project.js';

const mcu=peripherals=>({...raDefaultMcu(),peripherals});
// An FSP program on the built-in interpreter with the g_flash0 stack (BGO: with flash_callback and both interrupts).
function interp(code,{bgo=false,dataFlash,flash}={}){
 const m=raDefaultMcu();m.peripherals={FLASH:flash??(bgo?{enabled:true,bgo:true,callback:'flash_callback',readyPriority:12,errorPriority:12}:{enabled:true})};
 const log={warn:[],print:[]};
 const project=validateProject({...projectForBoard('fpb-ra6e1'),mcu:m,code:'#include "hal_data.h"\n#include <stdio.h>\n#include <string.h>\n'+code+'\nvoid external_irq1_callback(external_irq_callback_args_t *p_args){(void)p_args;}\n',...(dataFlash?{dataFlash}:{})});
 const session=new SimulationSession(project,{warn:w=>log.warn.push(w),print:t=>log.print.push(t)});
 return {session,log,project,run:ms=>{for(let t=Math.floor(session.time)+1;t<=ms;t++)session.tick(t);}};
}

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
 // A store by the program into the data flash goes nowhere and is said once; one into the code flash says nothing.
 warnings.length=0;bus.write32(RA_DF_BASE,0);bus.write8(RA_DF_BASE+5,0);bus.write32(0x1000,0);
 assert.equal(bus.read32(RA_DF_BASE)>>>0,0xdeadbeef);assert.deepEqual(warnings,['[FLASH] 데이터 플래시에 대입(버스 쓰기)한 값은 쓰이지 않고 무시됩니다 — 실제 칩도 같습니다. R_FLASH_HP_Erase로 블록을 지운 뒤 R_FLASH_HP_Write로 쓰세요.']);
 // An image's data flash bytes (an ELF's .data_flash) are programmed units; loading a new image starts from erased flash.
 bus.loadBytes(RA_DF_BASE+64,Uint8Array.of(9,8,7,6));assert.equal(soc.dataFlash.isBlank(64,4),false);assert.equal(bus.read8(RA_DF_BASE+65),8);
 bus.resetMemory({keepFlash:false});assert.equal(soc.dataFlash.used(),0);assert.equal(bus.read8(RA_DF_BASE),0xff);
});

test('FLASH settings: no background operation by default, the callback goes with BGO, names and priorities are checked',()=>{
 const m=validateRaMcu(mcu({FLASH:{enabled:true}}));
 assert.deepEqual(m.peripherals.FLASH,{enabled:true,bgo:false,callback:'',readyPriority:12,errorPriority:12});
 assert.equal(validateRaMcu(mcu({FLASH:{enabled:true,bgo:false,callback:'flash_callback'}})).peripherals.FLASH.callback,'','without BGO r_flash_hp takes no callback');
 assert.deepEqual(validateRaMcu(mcu({FLASH:{enabled:true,bgo:true,callback:'flash_callback',readyPriority:3,errorPriority:2}})).peripherals.FLASH,{enabled:true,bgo:true,callback:'flash_callback',readyPriority:3,errorPriority:2});
 assert.equal(validateRaMcu(mcu({FLASH:{enabled:true,bgo:true}})).peripherals.FLASH.callback,'','BGO without a callback: R_FLASH_HP_CallbackSet gives one');
 assert.throws(()=>validateRaMcu(mcu({FLASH:{enabled:true,bgo:1}})),/FLASH: Data Flash Background Operation은 Enabled 또는 Disabled/);
 assert.throws(()=>validateRaMcu(mcu({FLASH:{enabled:true,bgo:true,callback:'1x'}})),/FLASH: 콜백 이름은 C 식별자/);
 assert.throws(()=>validateRaMcu(mcu({FLASH:{enabled:true,bgo:true,readyPriority:16}})),/FLASH: Flash Ready 인터럽트 우선순위는 0~15/);
 assert.throws(()=>validateRaMcu(mcu({FLASH:{enabled:true,bgo:true,errorPriority:-1}})),/FLASH: Flash Error 인터럽트 우선순위는 0~15/);
 assert.throws(()=>validateRaMcu(mcu({FLASH:{}})),/FLASH: 설정을 확인하세요/);
 assert.throws(()=>validateRaMcu(mcu({FLASH:{enabled:true,bgo:true,callback:'g_flash0_ctrl'}})),/인스턴스 이름/);
 assert.throws(()=>validateRaMcu(mcu({FLASH:{enabled:true,bgo:true,callback:'fcu_frdyi_isr'}})),/인터럽트 처리 함수\(ISR\)/);
 assert.match(raNameProblem('fcu_fiferr_isr'),/ISR/);assert.match(raNameProblem('g_flash_on_flash_hp'),/API 객체/);assert.equal(raNameProblem('flash_callback'),'');
 // A callback shared with a module of another argument type is two conflicting declarations.
 assert.throws(()=>validateRaMcu(mcu({FLASH:{enabled:true,bgo:true,callback:'shared'},RTC:{enabled:true,callback:'shared'}})),/인자 형식이 다릅니다\(flash_callback_args_t \/ rtc_callback_args_t\)|인자 형식이 다릅니다\(rtc_callback_args_t \/ flash_callback_args_t\)/);
});

test('generated files: g_flash0 in hal_data, r_flash_hp_cfg.h (data flash only), FCU_FRDYI / FCU_FIFERR vectors after the others only with BGO',()=>{
 const plain=validateRaMcu(mcu({FLASH:{enabled:true}})),f=generateRaFiles(plain);
 assert.match(f['ra_gen/hal_data.h'],/#include "r_flash_hp\.h"\n#include "r_flash_api\.h"/);
 assert.match(f['ra_gen/hal_data.h'],/extern const flash_instance_t g_flash0;[\s\S]*extern flash_hp_instance_ctrl_t g_flash0_ctrl;\nextern const flash_cfg_t g_flash0_cfg;/);
 assert.doesNotMatch(f['ra_gen/hal_data.h'],/flash_callback_args_t/);
 assert.match(f['ra_gen/hal_data.c'],/flash_hp_instance_ctrl_t g_flash0_ctrl;\nconst flash_cfg_t g_flash0_cfg =\n\{\n {4}\.data_flash_bgo {6}= false,\n {4}\.p_callback {10}= NULL,\n {4}\.p_context {11}= NULL,\n {4}\.irq {17}= FSP_INVALID_VECTOR,\n {4}\.err_irq {13}= FSP_INVALID_VECTOR,\n {4}\.err_ipl {13}= \(BSP_IRQ_DISABLED\),\n {4}\.ipl {17}= \(BSP_IRQ_DISABLED\),\n\};[\s\S]*\.p_api {9}= &g_flash_on_flash_hp/);
 assert.equal(f['ra_cfg/fsp_cfg/r_flash_hp_cfg.h'].includes('#define FLASH_HP_CFG_CODE_FLASH_PROGRAMMING_ENABLE (0)\n#define FLASH_HP_CFG_DATA_FLASH_PROGRAMMING_ENABLE (1)'),true);
 assert.match(f['ra_cfg/fsp_cfg/r_flash_hp_cfg.h'],/#define FLASH_HP_CFG_PARAM_CHECKING_ENABLE \(BSP_CFG_PARAM_CHECKING_ENABLE\)/);
 assert.equal(raVectors(plain).length,raVectors(validateRaMcu(raDefaultMcu())).length,'no vector without BGO');
 assert.deepEqual(raInstances(plain).flash,{enabled:true,bgo:false,callback:'',readyPriority:12,errorPriority:12,name:'g_flash0'});
 assert.equal(raInstances(validateRaMcu(raDefaultMcu())).flash,null);
 // The cfg header is there without the stack too (the driver is not built then); no instance.
 const none=generateRaFiles(validateRaMcu(raDefaultMcu()));assert.ok(none['ra_cfg/fsp_cfg/r_flash_hp_cfg.h']);assert.doesNotMatch(none['ra_gen/hal_data.c'],/g_flash0/);
 // Background operation: the two interrupts after every earlier vector (RTC here), the callback declared.
 const bgo=validateRaMcu(mcu({RTC:{enabled:true},FLASH:{enabled:true,bgo:true,callback:'flash_callback',readyPriority:5,errorPriority:4}})),g=generateRaFiles(bgo),v=raVectors(bgo);
 assert.deepEqual(v.slice(-5).map(x=>[x.vector,x.isr]),[['RTC_ALARM','rtc_alarm_periodic_isr'],['RTC_PERIOD','rtc_alarm_periodic_isr'],['RTC_CARRY','rtc_carry_isr'],['FCU_FRDYI','fcu_frdyi_isr'],['FCU_FIFERR','fcu_fiferr_isr']]);
 assert.deepEqual(v.map(x=>x.vector).slice(0,-2),raVectors(validateRaMcu(mcu({RTC:{enabled:true}}))).map(x=>x.vector),'the earlier slots keep their numbers');
 const n=v.length;
 assert.match(g['ra_gen/vector_data.h'],new RegExp(`#define VECTOR_NUMBER_FCU_FRDYI \\(\\(IRQn_Type\\) ${n-2}\\)[\\s\\S]*#define VECTOR_NUMBER_FCU_FIFERR \\(\\(IRQn_Type\\) ${n-1}\\)`));
 assert.match(g['ra_gen/vector_data.c'],/fcu_frdyi_isr[\s\S]*fcu_fiferr_isr/);assert.match(g['ra_gen/vector_data.c'],/EVENT_FCU_FRDYI[\s\S]*EVENT_FCU_FIFERR/);
 assert.match(g['ra_gen/hal_data.h'],/#ifndef flash_callback\nvoid flash_callback\(flash_callback_args_t \* p_args\);\n#endif/);
 assert.match(g['ra_gen/hal_data.c'],/\.data_flash_bgo {6}= true,\n {4}\.p_callback {10}= flash_callback,\n {4}\.p_context {11}= NULL,\n#if defined\(VECTOR_NUMBER_FCU_FRDYI\)\n {4}\.irq {17}= VECTOR_NUMBER_FCU_FRDYI,\n#else\n {4}\.irq {17}= FSP_INVALID_VECTOR,\n#endif\n#if defined\(VECTOR_NUMBER_FCU_FIFERR\)\n {4}\.err_irq {13}= VECTOR_NUMBER_FCU_FIFERR,\n#else\n {4}\.err_irq {13}= FSP_INVALID_VECTOR,\n#endif\n {4}\.err_ipl {13}= \(4\),\n {4}\.ipl {17}= \(5\),\n\};/);
});

test('interpreter: Open, blank check, erase, write and the data flash read back through a pointer; each call takes the flash\'s time',()=>{
 const {session,log,run}=interp(`
volatile uint32_t word = 0, t_erase = 0, t_write = 0;
void hal_entry(void)
{
    static uint8_t data[8] = { 0x11, 0x22, 0x33, 0x44, 0xAA, 0xBB, 0xCC, 0xDD };
    flash_result_t blank = FLASH_RESULT_NOT_BLANK, after = FLASH_RESULT_BLANK, next = FLASH_RESULT_NOT_BLANK;
    flash_status_t status = FLASH_STATUS_BUSY;
    flash_info_t info;
    int e[8];
    e[0] = R_FLASH_HP_Open(&g_flash0_ctrl, &g_flash0_cfg);
    e[1] = R_FLASH_HP_BlankCheck(&g_flash0_ctrl, 0x08000040U, 8, &blank);
    e[2] = R_FLASH_HP_Erase(&g_flash0_ctrl, 0x08000047U, 2);
    e[3] = R_FLASH_HP_Write(&g_flash0_ctrl, (uint32_t) data, 0x08000040U, sizeof(data));
    e[4] = R_FLASH_HP_BlankCheck(&g_flash0_ctrl, 0x08000040U, 8, &after);
    e[5] = R_FLASH_HP_BlankCheck(&g_flash0_ctrl, 0x08000048U, 120, &next);
    e[6] = R_FLASH_HP_StatusGet(&g_flash0_ctrl, &status);
    e[7] = R_FLASH_HP_InfoGet(&g_flash0_ctrl, &info);
    printf("%d %d %d %d %d %d %d %d\\n", e[0], e[1], e[2], e[3], e[4], e[5], e[6], e[7]);
    printf("%d %d %d %d\\n", blank, after, next, status);
    const uint8_t *p = (const uint8_t *) 0x08000040U;
    word = *(uint32_t *) 0x08000044U;
    printf("%02X %02X %02X %02X %08lX %04X\\n", p[0], p[1], p[2], p[7], (unsigned long) word, *(uint16_t *) 0x08000042U);
    printf("%lu %lX %lX %lu %lu\\n", (unsigned long) info.data_flash.num_regions, (unsigned long) info.data_flash.p_block_array->block_section_st_addr,
           (unsigned long) info.data_flash.p_block_array[0].block_section_end_addr, (unsigned long) info.data_flash.p_block_array->block_size, (unsigned long) info.data_flash.p_block_array->block_size_write);
    printf("%lu %lX %lu %lu\\n", (unsigned long) info.code_flash.num_regions, (unsigned long) info.code_flash.p_block_array[1].block_section_st_addr,
           (unsigned long) info.code_flash.p_block_array[1].block_size, (unsigned long) info.code_flash.p_block_array[0].block_size_write);
    uint8_t copy[8];
    memcpy(copy, (void *) 0x08000040U, sizeof(copy));
    printf("%02X%02X %d %d\\n", copy[4], copy[5], R_FLASH_HP_Close(&g_flash0_ctrl), R_FLASH_HP_Close(&g_flash0_ctrl));
    while (1) { R_BSP_SoftwareDelay(10, BSP_DELAY_UNITS_MILLISECONDS); }
}`);
 run(50);
 assert.deepEqual(log.print,['0 0 0 0 0 0 0 0','0 1 0 0','11 22 33 DD DDCCBBAA 4433','1 8000000 8001FFF 64 4','2 10000 32768 128','AABB 0 7']);assert.deepEqual(log.warn,[]);
 assert.deepEqual(session.dataFlash.encode(),[{at:0x40,hex:'11223344aabbccdd'}]);assert.equal(session.dataFlash.changed,true);
 // A call without background operation returns when the flash is done: four blocks erased take 4 x 1.8 ms.
 const t=interp(`
volatile uint32_t done = 0;
void hal_entry(void)
{
    R_FLASH_HP_Open(&g_flash0_ctrl, &g_flash0_cfg);
    R_FLASH_HP_Erase(&g_flash0_ctrl, 0x08000000U, 4);
    done = 1;
    while (1) { R_BSP_SoftwareDelay(10, BSP_DELAY_UNITS_MILLISECONDS); }
}`);
 t.run(7);assert.equal(t.session.readVariable('done'),0,'still erasing at 7 ms');t.run(8);assert.equal(t.session.readVariable('done'),1);
});

test('interpreter: the checks and error codes of r_flash_hp.c in its order; a write to a place not erased fails and the next erase works',()=>{
 const {log,run,session}=interp(`
static uint32_t value = 0x12345678U;
static uint8_t odd[6];
void hal_entry(void)
{
    flash_result_t r = FLASH_RESULT_BLANK;
    flash_status_t s;
    printf("%d %d %d %d %d %d\\n", R_FLASH_HP_Write(&g_flash0_ctrl, (uint32_t) &value, 0x08000000U, 4), R_FLASH_HP_Erase(&g_flash0_ctrl, 0x08000000U, 1), R_FLASH_HP_BlankCheck(&g_flash0_ctrl, 0x08000000U, 4, &r),
           R_FLASH_HP_StatusGet(&g_flash0_ctrl, &s), R_FLASH_HP_Close(&g_flash0_ctrl), R_FLASH_HP_Reset(&g_flash0_ctrl));
    printf("%d %d %d %d\\n", R_FLASH_HP_Open(&g_flash0_ctrl, NULL), R_FLASH_HP_Open(NULL, &g_flash0_cfg), R_FLASH_HP_Open(&g_flash0_ctrl, &g_flash0_cfg), R_FLASH_HP_Open(&g_flash0_ctrl, &g_flash0_cfg));
    /* Write: address range, size range, 4-byte boundary, multiple of 4, not zero. */
    printf("%d %d %d %d %d %d %d\\n", R_FLASH_HP_Write(&g_flash0_ctrl, (uint32_t) &value, 0x00001000U, 4), R_FLASH_HP_Write(&g_flash0_ctrl, (uint32_t) &value, 0x08002000U, 4),
           R_FLASH_HP_Write(&g_flash0_ctrl, (uint32_t) &value, 0x08001FFCU, 8), R_FLASH_HP_Write(&g_flash0_ctrl, (uint32_t) &value, 0x08000002U, 4),
           R_FLASH_HP_Write(&g_flash0_ctrl, (uint32_t) odd, 0x08000000U, 6), R_FLASH_HP_Write(&g_flash0_ctrl, (uint32_t) &value, 0x08000000U, 0), R_FLASH_HP_Write(NULL, (uint32_t) &value, 0x08000000U, 4));
    /* Erase: no blocks, address outside, more blocks than there are. The last block is fine. */
    printf("%d %d %d %d %d\\n", R_FLASH_HP_Erase(&g_flash0_ctrl, 0x08000000U, 0), R_FLASH_HP_Erase(&g_flash0_ctrl, 0x08002000U, 1), R_FLASH_HP_Erase(&g_flash0_ctrl, 0x00008000U, 1),
           R_FLASH_HP_Erase(&g_flash0_ctrl, 0x08001FC0U, 2), R_FLASH_HP_Erase(&g_flash0_ctrl, 0x08001FFFU, 1));
    /* Blank check: any address and length inside the data flash; no result pointer is an assertion (after the range checks). */
    printf("%d %d %d %d %d\\n", R_FLASH_HP_BlankCheck(&g_flash0_ctrl, 0x08000001U, 3, &r), R_FLASH_HP_BlankCheck(&g_flash0_ctrl, 0x08000000U, 4, NULL), R_FLASH_HP_BlankCheck(&g_flash0_ctrl, 0x07FFFFFCU, 4, &r),
           R_FLASH_HP_BlankCheck(&g_flash0_ctrl, 0x08001FFFU, 2, &r), R_FLASH_HP_BlankCheck(&g_flash0_ctrl, 0x08000000U, 0, &r));
    printf("%d %d\\n", R_FLASH_HP_StatusGet(&g_flash0_ctrl, NULL), R_FLASH_HP_InfoGet(&g_flash0_ctrl, NULL));
    /* Erase, write, write again without an erase (fails), erase and write again (works). */
    int a = R_FLASH_HP_Erase(&g_flash0_ctrl, 0x08000000U, 1), b = R_FLASH_HP_Write(&g_flash0_ctrl, (uint32_t) &value, 0x08000000U, 4);
    value = 0x0F0F0F0FU;
    int c = R_FLASH_HP_Write(&g_flash0_ctrl, (uint32_t) &value, 0x08000000U, 4);
    R_FLASH_HP_StatusGet(&g_flash0_ctrl, &s);
    uint32_t spoiled = *(uint32_t *) 0x08000000U;
    int d = R_FLASH_HP_Erase(&g_flash0_ctrl, 0x08000000U, 1), f = R_FLASH_HP_Write(&g_flash0_ctrl, (uint32_t) &value, 0x08000000U, 4);
    printf("%d %d %d %d %08lX %d %d %08lX\\n", a, b, c, s, (unsigned long) spoiled, d, f, (unsigned long) *(uint32_t *) 0x08000000U);
    /* Not in this build or on the RA6E1. */
    uint32_t count;
    printf("%d %d %d %d %d %d %d\\n", R_FLASH_HP_AccessWindowSet(&g_flash0_ctrl, 0, 0x1000), R_FLASH_HP_AccessWindowClear(&g_flash0_ctrl), R_FLASH_HP_StartUpAreaSelect(&g_flash0_ctrl, FLASH_STARTUP_AREA_BLOCK1, true),
           R_FLASH_HP_BankSwap(&g_flash0_ctrl), R_FLASH_HP_AntiRollbackCounterRead(&g_flash0_ctrl, FLASH_ARC_SEC, &count), R_FLASH_HP_UpdateFlashClockFreq(&g_flash0_ctrl), R_FLASH_HP_Reset(&g_flash0_ctrl));
    while (1) { R_BSP_SoftwareDelay(10, BSP_DELAY_UNITS_MILLISECONDS); }
}`);
 run(60);
 assert.deepEqual(log.print,[
  '7 7 7 7 7 7',          // FSP_ERR_NOT_OPEN before Open
  '1 1 0 14',             // NULL cfg / ctrl: assertion; then success; then FSP_ERR_ALREADY_OPEN
  '22 22 23 22 23 23 1',  // INVALID_ADDRESS (code flash, past the end), INVALID_SIZE, boundary, multiple of 4, zero, NULL ctrl
  '21 22 22 21 0',        // INVALID_BLOCKS, INVALID_ADDRESS x2, INVALID_BLOCKS, the last block
  '0 1 22 23 23',
  '1 1',
  '0 0 24 0 02040608 0 0 0F0F0F0F', // FSP_ERR_WRITE_FAILED, idle afterwards, the unit holds neither value
  '6 6 6 6 6 0 0']);
 assert.equal(log.warn.length,7,log.warn.join('\n'));
 assert.match(log.warn[0],/^R_FLASH_HP_Write: 0x00001000은\(는\) 코드 플래시 주소입니다\. 이 프로젝트는 코드 플래시 프로그래밍 없이 빌드하므로\(r_flash_hp_cfg\.h FLASH_HP_CFG_CODE_FLASH_PROGRAMMING_ENABLE 0\) FSP_ERR_INVALID_ADDRESS를 돌려줍니다/);
 assert.match(log.warn[1],/^\[FLASH\] 0x08000000: 지우지 않은\(이미 쓴\) 곳에 다시 썼습니다 — 프로그램 오류\(FSTATR\.PRGERR\)이고 이 4바이트의 내용은 보장되지 않습니다\. 쓰기 전에 그 블록\(64바이트\)을 R_FLASH_HP_Erase로 지우세요\.$/);
 assert.match(log.warn[2],/^R_FLASH_HP_AccessWindowSet: 코드 플래시 프로그래밍과 액세스 윈도 기능은 이 빌드와 RA6E1에 없어 FSP_ERR_UNSUPPORTED를 돌려줍니다\(실제 r_flash_hp\.c도 같습니다\)\.$/);
 assert.match(log.warn[6],/^R_FLASH_HP_AntiRollbackCounterRead: 안티 롤백 카운터 기능은/);
 assert.deepEqual(session.dataFlash.encode(),[{at:0,hex:'0f0f0f0f'}]);
});

test('interpreter: background operation — the calls return at once, the callback gets ERASE_COMPLETE / WRITE_COMPLETE / BLANK / NOT_BLANK, the flash is in use meanwhile',()=>{
 const {session,log,run}=interp(`
static uint8_t data[8] = { 1, 2, 3, 4, 5, 6, 7, 8 };
volatile uint32_t events = 0, count = 0, context_seen = 0;
static volatile bool done = false;
static uint32_t marker = 77;
void flash_callback(flash_callback_args_t *p_args)
{
    events = (events << 4) | ((uint32_t) p_args->event + 1U);
    count++;
    if (NULL != p_args->p_context) { context_seen = *(uint32_t *) p_args->p_context; }
    done = true;
}
static void wait(void) { while (!done) { } done = false; }
void hal_entry(void)
{
    flash_result_t r = FLASH_RESULT_BLANK;
    flash_status_t busy, idle;
    int e[10];
    e[0] = R_FLASH_HP_Open(&g_flash0_ctrl, &g_flash0_cfg);
    e[1] = R_FLASH_HP_Erase(&g_flash0_ctrl, 0x08000100U, 3);
    R_FLASH_HP_StatusGet(&g_flash0_ctrl, &busy);
    e[2] = R_FLASH_HP_Write(&g_flash0_ctrl, (uint32_t) data, 0x08000100U, 8);   /* still erasing */
    e[3] = R_FLASH_HP_BlankCheck(&g_flash0_ctrl, 0x08000100U, 4, &r);
    wait();
    R_FLASH_HP_StatusGet(&g_flash0_ctrl, &idle);
    e[4] = R_FLASH_HP_Write(&g_flash0_ctrl, (uint32_t) data, 0x08000100U, 8);
    wait();
    e[5] = R_FLASH_HP_BlankCheck(&g_flash0_ctrl, 0x08000100U, 8, &r);
    int active = r;
    wait();
    e[6] = R_FLASH_HP_CallbackSet(&g_flash0_ctrl, flash_callback, &marker, NULL);
    e[7] = R_FLASH_HP_BlankCheck(&g_flash0_ctrl, 0x08000108U, 8, &r);
    wait();
    e[8] = R_FLASH_HP_CallbackSet(&g_flash0_ctrl, NULL, NULL, NULL);
    e[9] = R_FLASH_HP_Close(&g_flash0_ctrl);
    printf("%d %d %d %d %d %d %d %d %d %d\\n", e[0], e[1], e[2], e[3], e[4], e[5], e[6], e[7], e[8], e[9]);
    printf("%d %d %d %lX %lu %lu %08lX\\n", busy, idle, active, (unsigned long) events, (unsigned long) count, (unsigned long) context_seen, (unsigned long) *(uint32_t *) 0x08000104U);
    while (1) { R_BSP_SoftwareDelay(10, BSP_DELAY_UNITS_MILLISECONDS); }
}`,{bgo:true});
 run(80);
 // IN_USE (8) while the erase runs; events ERASE_COMPLETE(0) WRITE_COMPLETE(1) NOT_BLANK(3) BLANK(2), each + 1 in a nibble.
 assert.deepEqual(log.print,['0 0 8 8 0 0 0 0 1 0','1 0 2 1243 4 77 08070605']);assert.deepEqual(log.warn,[]);
 assert.deepEqual(session.dataFlash.encode(),[{at:0x100,hex:'0102030405060708'}]);
});

test('interpreter: background operation errors — a write to a place not erased reports FLASH_EVENT_ERR_FAILURE from the error interrupt; no callback is an assertion; BGO needs its interrupts',()=>{
 const program=bytes=>`
static uint8_t data[8] = { 1, 2, 3, 4, 5, 6, 7, 8 };
volatile uint32_t events = 0, count = 0;
void flash_callback(flash_callback_args_t *p_args) { events = (events << 4) | ((uint32_t) p_args->event + 1U); count++; }
void hal_entry(void)
{
    R_FLASH_HP_Open(&g_flash0_ctrl, &g_flash0_cfg);
    R_FLASH_HP_Erase(&g_flash0_ctrl, 0x08000000U, 1);
    while (count < 1) { }
    R_FLASH_HP_Write(&g_flash0_ctrl, (uint32_t) data, 0x08000000U, 4);
    while (count < 2) { }
    int e = R_FLASH_HP_Write(&g_flash0_ctrl, (uint32_t) data, 0x08000000U, ${bytes});
    R_BSP_SoftwareDelay(5, BSP_DELAY_UNITS_MILLISECONDS);
    flash_status_t status;
    R_FLASH_HP_StatusGet(&g_flash0_ctrl, &status);
    int again = R_FLASH_HP_Erase(&g_flash0_ctrl, 0x08000000U, 1);
    R_BSP_SoftwareDelay(5, BSP_DELAY_UNITS_MILLISECONDS);
    printf("%d %d %d %lX\\n", e, status, again, (unsigned long) events);
    while (1) { R_BSP_SoftwareDelay(10, BSP_DELAY_UNITS_MILLISECONDS); }
}`;
 // 8 bytes: the first unit fails, the flash-ready interrupt issues the next (not taken: command-locked), the error
 // interrupt resets the sequencer and reports ERR_FAILURE (7 + 1). The flash is idle and usable afterwards.
 let t=interp(program(8),{bgo:true});t.run(60);
 assert.deepEqual(t.log.print,['0 0 0 1281']);assert.equal(t.log.warn.length,1);assert.match(t.log.warn[0],/지우지 않은\(이미 쓴\) 곳에 다시 썼습니다/);
 // 4 bytes: nothing is left to write, so fcu_frdyi_isr reports WRITE_COMPLETE before fcu_fiferr_isr reports the failure
 // (the driver's flash-ready routine does not look at the error flags).
 t=interp(program(4),{bgo:true});t.run(60);assert.deepEqual(t.log.print,['0 0 0 12281']);
 // BGO without a callback: Erase / Write / BlankCheck assert it.
 t=interp(`
void hal_entry(void)
{
    flash_result_t r;
    uint32_t v = 1;
    printf("%d %d %d %d\\n", R_FLASH_HP_Open(&g_flash0_ctrl, &g_flash0_cfg), R_FLASH_HP_Erase(&g_flash0_ctrl, 0x08000000U, 1), R_FLASH_HP_Write(&g_flash0_ctrl, (uint32_t) &v, 0x08000000U, 4), R_FLASH_HP_BlankCheck(&g_flash0_ctrl, 0x08000000U, 4, &r));
    while (1) { R_BSP_SoftwareDelay(10, BSP_DELAY_UNITS_MILLISECONDS); }
}`,{flash:{enabled:true,bgo:true}});t.run(20);assert.deepEqual(t.log.print,['0 1 1 1']);
 // A configuration with BGO but no interrupt (made in the program): FSP_ERR_IRQ_BSP_DISABLED.
 t=interp(`
void hal_entry(void)
{
    flash_cfg_t cfg = g_flash0_cfg;
    cfg.data_flash_bgo = true;
    printf("%d\\n", R_FLASH_HP_Open(&g_flash0_ctrl, &cfg));
    while (1) { R_BSP_SoftwareDelay(10, BSP_DELAY_UNITS_MILLISECONDS); }
}`);t.run(20);assert.deepEqual(t.log.print,['11']);
});

test('interpreter: a structure of settings written and read back (pointer, memcpy); reading a blank place says so once; the data flash is not assigned to',()=>{
 const {log,run,session}=interp(`
typedef struct { uint16_t magic; uint8_t brightness; uint8_t mode; uint32_t period_ms; float gain; char name[8]; } settings_t;
static settings_t settings = { .magic = 0xA55A, .brightness = 80, .mode = 2, .period_ms = 1500, .gain = 1.5f, .name = "RA6E1" };
void hal_entry(void)
{
    settings_t copy;
    R_FLASH_HP_Open(&g_flash0_ctrl, &g_flash0_cfg);
    printf("%u %02X\\n", (unsigned) sizeof(settings_t), *(uint8_t *) 0x08000080U);
    printf("%02X\\n", *(uint8_t *) 0x08000084U);
    R_FLASH_HP_Erase(&g_flash0_ctrl, 0x08000080U, 1);
    printf("%d\\n", R_FLASH_HP_Write(&g_flash0_ctrl, (uint32_t) &settings, 0x08000080U, sizeof(settings)));
    const settings_t *stored = (const settings_t *) 0x08000080U;
    printf("%04X %u %u %lu %.1f %s\\n", stored->magic, stored->brightness, stored->mode, (unsigned long) stored->period_ms, stored->gain, stored->name);
    memcpy(&copy, (void *) 0x08000080U, sizeof(copy));
    printf("%04X %lu %s %d\\n", copy.magic, (unsigned long) copy.period_ms, copy.name, memcmp(&copy, &settings, sizeof(copy)));
    uint8_t raw[20];
    memcpy(raw, &settings, sizeof(raw));
    printf("%02X %02X %02X %02X %02X %c\\n", raw[0], raw[1], raw[2], raw[4], raw[5], raw[12]);
    /* A store through a pointer goes nowhere (as on the chip), said once; the program goes on. */
    uint32_t *word = (uint32_t *) 0x08000080U;
    *word = 0;
    word[1] |= 0x10U;
    memset((void *) 0x08000088U, 0, 4);
    printf("%08lX %08lX %02X\\n", (unsigned long) *word, (unsigned long) word[1], *(uint8_t *) 0x08000088U);
}`);
 run(50);
 assert.deepEqual(log.print,['20 FF','FF','0','A55A 80 2 1500 1.5 RA6E1','A55A 1500 RA6E1 0','5A A5 50 DC 05 R','0250A55A 000005DC 00']);
 assert.equal(log.warn.length,2,'the blank read and the store are each said once');assert.match(log.warn[0],/^\[FLASH\] 지운\(빈\) 데이터 플래시 0x08000080를 읽었습니다/);
 assert.equal(log.warn[1],'[FLASH] 데이터 플래시에 대입(버스 쓰기)한 값은 쓰이지 않고 무시됩니다 — 실제 칩도 같습니다. R_FLASH_HP_Erase로 블록을 지운 뒤 R_FLASH_HP_Write로 쓰세요.');
 // A store is not a read (the emulator's bus only writes): on an erased place only the store is said.
 const store=interp(`
volatile uint32_t after = 0;
void hal_entry(void)
{
    uint32_t *p = (uint32_t *) 0x08000000U;
    *p = 5U;
    after = *p;
}`);
 store.run(20);assert.deepEqual(store.log.warn.map(w=>w.split(' — ')[0]),['[FLASH] 데이터 플래시에 대입(버스 쓰기)한 값은 쓰이지 않고 무시됩니다','[FLASH] 지운(빈) 데이터 플래시 0x08000000를 읽었습니다'],'the order of the emulator');
 assert.equal(store.session.readVariable('after'),0xffffffff);
 assert.equal(session.dataFlash.encode()[0].hex,'5aa55002dc0500000000c03f5241364531000000');
});

test('interpreter: a data flash pointer is an address — cast to another pointer type or to an integer, void *, compared, passed as another type',()=>{
 const {log,run}=interp(`
static uint8_t data[8] = { 0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88 };
static uint32_t word_at(const uint32_t *w) { return *w; }
static uint32_t sum(const uint8_t *p, uint32_t n) { uint32_t s = 0; for (uint32_t i = 0; i < n; i++) { s += p[i]; } return s; }
void hal_entry(void)
{
    R_FLASH_HP_Open(&g_flash0_ctrl, &g_flash0_cfg);
    R_FLASH_HP_Erase(&g_flash0_ctrl, 0x08000000U, 1);
    R_FLASH_HP_Write(&g_flash0_ctrl, (uint32_t) data, 0x08000000U, 8);
    uint32_t *p32 = (uint32_t *) 0x08000000U;
    uint8_t *p8 = (uint8_t *) p32;
    uint16_t *p16 = (uint16_t *) (p8 + 2);
    uint32_t a = (uint32_t) p32 + 4U;
    printf("%02X %02X %04X %08lX %02X\\n", p8[1], p8[5], *p16, (unsigned long) (uint32_t) p32, *(uint8_t *) a);
    printf("%d %d %d %d %d\\n", p8 == (uint8_t *) 0x08000000U, (uint32_t) (p8 + 3) == 0x08000003U, p32 != NULL, (int) ((uint8_t *) (p32 + 1) - p8), (void *) p16 > (void *) p8);
    const void *raw = (const void *) 0x08000004U;
    const uint32_t *w = raw;
    const uint8_t *b;
    b = (const void *) p32;
    printf("%08lX %08lX %lu %02X\\n", (unsigned long) *w, (unsigned long) word_at(raw), (unsigned long) sum((const uint8_t *) p32, 8), b[7]);
}`);
 run(30);
 assert.deepEqual(log.print,['22 66 4433 08000000 55','1 1 1 4 1','88776655 88776655 612 88']);
});

test('interpreter: the address arguments given as a data flash pointer converted to uint32_t (or the pointer itself)',()=>{
 const {log,run}=interp(`
static uint8_t data[8] = { 0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88 };
void hal_entry(void)
{
    flash_result_t r = FLASH_RESULT_NOT_BLANK;
    uint8_t *dst = (uint8_t *) 0x08000040U;
    R_FLASH_HP_Open(&g_flash0_ctrl, &g_flash0_cfg);
    int e1 = R_FLASH_HP_Erase(&g_flash0_ctrl, (uint32_t) dst, 1);
    int e2 = R_FLASH_HP_BlankCheck(&g_flash0_ctrl, (uint32_t) dst, 8, &r);
    int e3 = R_FLASH_HP_Write(&g_flash0_ctrl, (uint32_t) data, (uint32_t) dst, 8);
    int e4 = R_FLASH_HP_Write(&g_flash0_ctrl, (uint32_t) dst, (uint32_t) (dst + 8), 8);
    printf("%d %d %d %d %d %02X %02X\\n", e1, e2, (int) r, e3, e4, dst[7], dst[15]);
    printf("%d\\n", R_FLASH_HP_Erase(&g_flash0_ctrl, dst, 1));
}`);
 run(40);
 assert.deepEqual(log.print,['0 0 0 0 0 88 88','0']);
 // The flash-to-flash write reads its source in P/E mode, as the driver does on the emulator.
 assert.deepEqual(log.warn,['[FLASH] 데이터 플래시 P/E 모드(쓰기·지우기·블랭크 체크가 진행 중)에서 데이터 플래시를 읽었습니다 — 실제 칩에서는 읽은 값이 보장되지 않습니다. 동작이 끝난 뒤(BGO면 콜백 뒤)에 읽으세요.']);
});

test('interpreter: the size checks add in uint32_t as r_flash_hp.c does (a sum past 0xFFFFFFFF wraps and passes the check)',()=>{
 const {log,run,session}=interp(`
static uint32_t value = 0x11223344U;
void hal_entry(void)
{
    flash_result_t r = FLASH_RESULT_BLANK;
    R_FLASH_HP_Open(&g_flash0_ctrl, &g_flash0_cfg);
    R_FLASH_HP_Write(&g_flash0_ctrl, (uint32_t) &value, 0x08001F80U, 4);
    R_FLASH_HP_Write(&g_flash0_ctrl, (uint32_t) &value, 0x08001FC0U, 4);
    printf("%d %d\\n", R_FLASH_HP_Erase(&g_flash0_ctrl, 0x08001F80U, 3), R_FLASH_HP_BlankCheck(&g_flash0_ctrl, 0x08000000U, 0x2001U, &r));
    /* 0x04000001 blocks of 64 bytes are 64 bytes in uint32_t: the check passes, the erase goes on to the end of the data flash and stops there. */
    printf("%d %d\\n", R_FLASH_HP_Erase(&g_flash0_ctrl, 0x08001F80U, 0x04000001U), R_FLASH_HP_BlankCheck(&g_flash0_ctrl, 0x08000000U, 0xFFFFFFFFU, &r));
}`);
 run(60);
 assert.deepEqual(log.print,['21 23','501 501']);
 assert.deepEqual(session.dataFlash.encode(),[],'both blocks erased');
});

test('interpreter: a char read from the data flash is unsigned, as ARM GCC has it (a byte of 0x80 or more)',()=>{
 const {log,run}=interp(`
typedef struct { char tag; uint8_t n; } item_t;
static uint8_t raw[4] = { 0x81, 0x7F, 0xFF, 0x00 };
void hal_entry(void)
{
    R_FLASH_HP_Open(&g_flash0_ctrl, &g_flash0_cfg);
    R_FLASH_HP_Erase(&g_flash0_ctrl, 0x08000000U, 1);
    R_FLASH_HP_Write(&g_flash0_ctrl, (uint32_t) raw, 0x08000000U, 4);
    const item_t *item = (const item_t *) 0x08000002U;
    printf("%ld %ld %ld %ld\\n", (long) (int32_t) *(char *) 0x08000000U, (long) (int32_t) *(char *) 0x08000001U, (long) (int32_t) *(signed char *) 0x08000000U, (long) (int32_t) item->tag);
}`);
 run(30);
 assert.deepEqual(log.print,['129 127 -127 255']);
});

test('outside the data flash: a read past its end or crossing it stops both engines with the same note',()=>{
 const outside=(address,size)=>`데이터 플래시(0x08000000~0x08001FFF) 밖 ${address}에 ${size}바이트로 접근했습니다 — 실제 칩에서는 버스 오류(HardFault)로 멈춥니다. 주소와 읽는 크기를 확인하세요.`;
 for(const [expression,address,size] of [['((uint8_t *) 0x08001FF0U)[16]','0x08002000',1],['*(uint8_t *) 0x08002000U','0x08002000',1],['*(uint32_t *) 0x08001FFEU','0x08001FFE',4],['*(uint16_t *) 0x08004000U','0x08004000',2]]){
  const {log,run}=interp(`
void hal_entry(void)
{
    printf("%02X\\n", ((uint8_t *) 0x08001FF0U)[15]);
    printf("%lu\\n", (unsigned long) ${expression});
    printf("not here\\n");
}`);
  assert.throws(()=>run(20),new RegExp('^Error: '+outside(address,size).replace(/[()~.]/g,'\\$&')+'$'),expression);
  assert.deepEqual(log.print,['FF'],expression);assert.equal(log.warn.at(-1),'[FLASH] '+outside(address,size),expression);
 }
 // The emulator's bus: the same note before the bus fault; a read inside the data flash still works.
 const warnings=[],machine=new Machine({bus:new RaBus()});new Ra6e1(machine,{warn:w=>warnings.push(w)});const bus=machine.bus;
 assert.equal(bus.read32(RA_DF_BASE+RA_DF_SIZE-4)>>>0,0xffffffff);warnings.length=0;
 assert.throws(()=>bus.read32(RA_DF_BASE+RA_DF_SIZE-2));assert.deepEqual(warnings,['[FLASH] '+outside('0x08001FFE',4)]);
 assert.throws(()=>bus.read8(RA_DF_BASE+RA_DF_SIZE));assert.throws(()=>bus.write8(RA_DF_BASE+0x3000,1));assert.equal(warnings.length,1,'said once');
});

test('interpreter: the data flash survives an MCU reset (NVIC_SystemReset) and starts from the project\'s saved contents',()=>{
 const code=`
volatile uint32_t seen = 0;
void hal_entry(void)
{
    flash_result_t blank;
    uint32_t count = 0;
    R_FLASH_HP_Open(&g_flash0_ctrl, &g_flash0_cfg);
    R_FLASH_HP_BlankCheck(&g_flash0_ctrl, 0x08000000U, 4, &blank);
    if (FLASH_RESULT_NOT_BLANK == blank) { count = *(uint32_t *) 0x08000000U; }
    count++;
    R_FLASH_HP_Erase(&g_flash0_ctrl, 0x08000000U, 1);
    R_FLASH_HP_Write(&g_flash0_ctrl, (uint32_t) &count, 0x08000000U, 4);
    seen = count;
    printf("%lu\\n", (unsigned long) count);
    R_BSP_SoftwareDelay(20, BSP_DELAY_UNITS_MILLISECONDS);
    if (count < 3) { NVIC_SystemReset(); }
    while (1) { R_BSP_SoftwareDelay(10, BSP_DELAY_UNITS_MILLISECONDS); }
}`;
 const first=interp(code);first.run(200);
 assert.deepEqual(first.log.print,['1','2','3']);assert.equal(first.session.runtime.resetCount,2);assert.deepEqual(first.session.dataFlash.encode(),[{at:0,hex:'03000000'}]);
 assert.equal(first.project.dataFlash,undefined,'a session does not write into the project it was given');
 // The next run of the same project file, with what this one left (the app saves it when a run ends: app-run.js).
 const second=interp(code,{dataFlash:first.session.dataFlash.encode()});
 assert.equal(second.session.dataFlash.changed,false);second.run(100);assert.deepEqual(second.log.print,['4']);assert.deepEqual(second.session.dataFlash.encode(),[{at:0,hex:'04000000'}]);
});

test('project file: an RA project keeps the data flash contents (dataFlash), checked on load; other boards and empty contents have none',()=>{
 const base=projectForBoard('fpb-ra6e1'),runs=[{at:0,hex:'03000000'},{at:128,hex:'5aa55002dc050000'}];
 const p=validateProject({...base,dataFlash:runs});
 assert.deepEqual(p.dataFlash,runs);assert.notEqual(p.dataFlash,runs,'a copy');
 assert.deepEqual(validateProject(JSON.parse(JSON.stringify(p))).dataFlash,runs,'through the saved file');
 assert.equal(Object.hasOwn(validateProject({...base,dataFlash:[]}),'dataFlash'),false,'erased flash is no entry');
 assert.equal(Object.hasOwn(validateProject(base),'dataFlash'),false);
 assert.throws(()=>validateProject({...base,dataFlash:[{at:1,hex:'00000000'}]}),/저장된 데이터 플래시 내용이 올바르지 않습니다/);
 assert.throws(()=>validateProject({...base,dataFlash:'01000000'}),/저장된 데이터 플래시 내용이 올바르지 않습니다/);
 // Another board has no RA data flash: the entry does not travel with a project turned into one.
 assert.equal(Object.hasOwn(validateProject({...projectForBoard('nucleo-f446re'),dataFlash:runs}),'dataFlash'),false);
 // The contents are not part of the MCU settings (the firmware build's input): saving them does not ask for a rebuild.
 assert.equal(JSON.stringify(p.mcu),JSON.stringify(validateProject(base).mcu));
});

test('Developer Assistance and the example: g_flash0 calls (the callback only with BGO); ra_flash_counter is a valid project with the stack',()=>{
 const items=m=>raAssistance(validateRaMcu(m)).find(x=>x.name==='g_flash0');
 assert.equal(items(raDefaultMcu()),undefined);
 const plain=items(mcu({FLASH:{enabled:true}}));
 assert.equal(plain.title,'Flash (r_flash_hp)');
 assert.deepEqual(plain.items.map(i=>i.label),['Call R_FLASH_HP_Open()','Call R_FLASH_HP_Erase()','Call R_FLASH_HP_Write()','Call R_FLASH_HP_BlankCheck()','Call R_FLASH_HP_StatusGet()','Call R_FLASH_HP_InfoGet()','Call R_FLASH_HP_Close()']);
 assert.match(plain.items[2].code,/R_FLASH_HP_Write\(&g_flash0_ctrl, \(uint32_t\) &value, 0x08000000U, sizeof\(value\)\);/);
 assert.match(plain.items[3].code,/R_FLASH_HP_BlankCheck\(&g_flash0_ctrl, 0x08000000U, 4, &blank\);[\s\S]*\*\(uint32_t \*\) 0x08000000U/);
 const bgo=items(mcu({FLASH:{enabled:true,bgo:true,callback:'flash_done'}}));
 assert.match(bgo.items.at(-1).code,/^void flash_done\(flash_callback_args_t \*p_args\)\n\{\n {4}if \(FLASH_EVENT_ERASE_COMPLETE == p_args->event\)/);
 const e=raExample('ra_flash_counter'),project=validateProject({...projectForBoard('fpb-ra6e1'),mcu:e.mcu(),code:e.code,...e.circuit()});
 assert.deepEqual(project.mcu.peripherals.FLASH,{enabled:true,bgo:false,callback:'',readyPriority:12,errorPriority:12});
 assert.match(e.code,/R_FLASH_HP_BlankCheck\(&g_flash0_ctrl, COUNTER_ADDRESS, COUNTER_BYTES, &blank\)/);assert.equal(project.dataFlash,undefined);
 // The snippets run on the interpreter as they are inserted.
 const t=interp(`void hal_entry(void)\n{\n${plain.items.slice(0,4).map(i=>i.code).join('\n').replace('uint32_t stored','uint32_t stored_value').replace('(void) stored;','printf("%08lX\\n", (unsigned long) stored_value);')}\n    while (1) { R_BSP_SoftwareDelay(10, BSP_DELAY_UNITS_MILLISECONDS); }\n}`);
 t.run(20);assert.deepEqual(t.log.print,['12345678']);assert.deepEqual(t.log.warn,[]);
});
