import {test,describe} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {solveCircuit} from '../../src/engine.js';
import {validateProject,projectForBoard} from '../../src/project.js';
import {boardPins,endpointInfo} from '../../src/pins.js';
import {BOARD} from '../../src/geometry.js';
import {DEVBOARD_MODELS,devboardPins,devboardNet,boardSourceFiles} from '../../src/devboards.js';
import {halExampleFor} from '../../src/hal-examples.js';
import {SimulationSession} from '../../src/session.js';
import {createBoardDrivers} from '../../src/fixed-run.js';
import {newStm32Fields,swapStm32,stm32View,viewMapper,promoteStm32,createStm32Drivers,connectStm32Drivers,stm32BoardList,mainBoardName} from '../../src/stm32-boards.js';

const require=createRequire(import.meta.url);
const wire=(id,from,to)=>({id,from,to,color:'#e53935'});
// NUCLEO-F103RB main board and a NUCLEO-F446RE STM32-2 whose PA5 (LD2, CN10-11) is wired to the main board's PA0 (CN7-28).
function twoBoards(){
 const p=projectForBoard('nucleo-f103rb');p.components.push({id:'b2',...newStm32Fields(p,'nucleo-f446re',430)});
 p.wires.push(wire('w1','devboard:b2:CN10:11','board:CN7:28'));return p;
}
const READ_PA0='void setup(){pinMode(PA0, INPUT);}\nint last=-1;\nvoid loop(){int v=digitalRead(PA0); if(v!=last){Serial.print("PA0=");Serial.println(v); last=v;} delay(10);}';
function run(project,ms,{out=[],drivers=createStm32Drivers(project,{log:t=>out.push(t)})}={}){
 const session=new SimulationSession(project,{print:t=>out.push('main: '+t)});session.circuit.drivers=drivers;connectStm32Drivers(session);let result=session.tick(0);
 for(let t=100;t<=ms;t+=100)result=session.tick(t);return {result,out,session};
}

describe('STM32 boards: pins and project',()=>{
 test('another NUCLEO has the main board header, its own GPIO nets and the shared supplies',()=>{
  const m=DEVBOARD_MODELS['nucleo-f103rb'],part={id:'b2',type:'devboard',model:'nucleo-f103rb',x:BOARD.x+BOARD.w/2,y:BOARD.y+BOARD.h/2,rotation:0,name:'STM32-2'};
  assert.equal(m.kind,'stm32');assert.equal(m.pins.length,108);
  const pins=devboardPins(part),main=boardPins('nucleo-f103rb');
  for(const pin of main){const q=pins.find(p=>p.id===`devboard:b2:${pin.header}:${pin.number}`);assert.ok(Math.abs(q.x-pin.x)<1e-9&&Math.abs(q.y-pin.y)<1e-9,pin.id);}
  const net=key=>devboardNet(part,pins.find(p=>p.key===key));
  assert.equal(net('CN10:11'),'signal:b2.PA5');assert.equal(net('CN7:29'),'signal:b2.PD0');assert.equal(net('CN7:16'),'signal:3V3');
  assert.equal(net('CN10:32'),'signal:GND','AGND joins GND');assert.equal(net('CN7:14'),'signal:b2.NRST');assert.equal(net('CN7:9'),null,'NC');assert.equal(net('CN7:5'),'signal:VDD');
  assert.match(endpointInfo('devboard:b2:CN10:11',[part]).label,/STM32-2 · CN10-11 PA5/);
 });
 test('a new board starts from the empty HAL project of its MCU; four STM32 boards at most',()=>{
  const p=twoBoards(),b2=p.components[0];
  assert.equal(b2.name,'STM32-2');assert.equal(b2.mcu.family,'STM32F446RE');assert.match(b2.code,/HAL_Init\(\);/);assert.deepEqual(b2.firmware,{mode:'hal',files:[]});
  const saved=validateProject(JSON.parse(JSON.stringify(p)));assert.equal(saved.components[0].mcu.family,'STM32F446RE');
  assert.deepEqual(stm32BoardList(p).map(b=>[b.id,b.name,b.boardId]),[['main','STM32-1','nucleo-f103rb'],['b2','STM32-2','nucleo-f446re']]);
  assert.deepEqual(boardSourceFiles(p),[],'STM32 boards are edited by swapping, not as board files');
  for(const id of ['b3','b4'])p.components.push({id,...newStm32Fields(p,'nucleo-f103rb',430)});
  assert.deepEqual(p.components.map(c=>c.name),['STM32-2','STM32-3','STM32-4']);
  assert.throws(()=>newStm32Fields(p,'nucleo-f103rb'),/4개까지/);
  assert.throws(()=>validateProject({...p,components:[...p.components,{...p.components[1],id:'b5',name:'STM32-5'}]}),/4개까지/);
  assert.throws(()=>validateProject({...p,components:[{...p.components[0],mcu:{...p.components[0].mcu,family:'STM32F103RB'}}]}),/STM32F446RE 핀 설정/);
  assert.throws(()=>validateProject({...p,components:[{...p.components[0],rotation:90}]}),/회전하지 않습니다/);
  assert.throws(()=>validateProject({...p,components:[{...p.components[0],stlink:'x'}]}),/ST-LINK/);
 });
 test('the two boards drive each other through wires; supplies are common',()=>{
  const p=twoBoards(),r=solveCircuit(p,{'b2.PA5':{mode:'OUTPUT',value:3.3}});
  assert.ok(r.voltage('signal:PA0')>3.2);assert.ok(r.voltage('signal:b2.PC13')>3.2,'USER pull-up');
  assert.ok(solveCircuit(p,{},{'b2.USER':true}).voltage('signal:b2.PC13')<.1,'b2 USER pressed');
  assert.equal(r.uf.find('devboard:b2:CN7:16'),r.uf.find('board:CN7:16'),'3V3 pins share the rail');
 });
});

describe('STM32 boards: editing swaps the board with the main board',()=>{
 test('software, name, ST-LINK and place are exchanged and every endpoint is relabelled',()=>{
  const p=twoBoards();p.ide={breakpoints:[{file:'main.c',line:3}],watches:['x'],native:{target:'arm',configuration:'Debug'}};p.surfaces.board.stlink='066FFF111111111111111111';
  p.components.push({id:'r1',type:'resistor',name:'R1',x:900,y:60,rotation:0,value:220,attachA:'board:CN10:13'});
  const before=solveCircuit(p,{PA0:{mode:'OUTPUT',value:3.3}}),mainCode=p.code;
  swapStm32(p,'b2');
  assert.equal(p.boardId,'nucleo-f446re');assert.equal(p.mcu.family,'STM32F446RE');assert.equal(mainBoardName(p),'STM32-2');assert.equal(p.surfaces.board.stlink,undefined);
  assert.deepEqual(p.ide,{native:{target:'arm',configuration:'Debug'},breakpoints:[],watches:[]});
  const b2=p.components[0];assert.equal(b2.name,'STM32-1');assert.equal(b2.model,'nucleo-f103rb');assert.equal(b2.code,mainCode);assert.equal(b2.stlink,'066FFF111111111111111111');assert.deepEqual(b2.ide,{breakpoints:[{file:'main.c',line:3}],watches:['x']});
  assert.deepEqual([p.wires[0].from,p.wires[0].to],['board:CN10:11','devboard:b2:CN7:28']);assert.equal(p.components[1].attachA,'devboard:b2:CN10:13');
  // The same circuit: STM32-1's PA0 is now `b2.PA0`.
  const after=solveCircuit(p,{'b2.PA0':{mode:'OUTPUT',value:3.3}});for(const id of ['signal:PA5','part:r1:a'])assert.equal(after.voltage(viewMapper('b2')(id)),before.voltage(id));
  assert.ok(Math.abs(endpointInfo('board:CN10:11',p.components,p.surfaces).x-endpointInfo('devboard:b2:CN10:11',twoBoards().components,twoBoards().surfaces).x)<1e-9,'STM32-2 stays in its place');
  validateProject(JSON.parse(JSON.stringify(p)));
  swapStm32(p,'b2');assert.equal(p.code,mainCode);assert.deepEqual(p.ide.breakpoints,[{file:'main.c',line:3}]);assert.equal(p.wires[0].from,'devboard:b2:CN10:11');
 });
 test('the name mapping between a board view and the shared circuit is its own inverse',()=>{
  const m=viewMapper('b2'),ids=['signal:PA5','signal:b2.PA5','signal:GND','signal:3V3','board:CN7:1','devboard:b2:CN7:1','signal:esp.GPIO2','drive:PA5','signal:NRST','part:r1:a','bb:a1'];
  for(const id of ids)assert.equal(m(m(id)),id);
  assert.deepEqual(ids.slice(0,5).map(m),['signal:b2.PA5','signal:PA5','signal:GND','signal:3V3','devboard:b2:CN7:1']);
  assert.equal(stm32View(twoBoards(),'b2').boardId,'nucleo-f446re');
 });
 test('deleting the main board makes the next STM32 board the main board',()=>{
  const p=twoBoards();promoteStm32(p);
  assert.equal(p.boardId,'nucleo-f446re');assert.equal(mainBoardName(p),'STM32-2');assert.equal(p.components.length,0);assert.equal(p.wires.length,0,'wires of the removed board go');
 });
});

describe('STM32 boards: running together',()=>{
 test('simulator: STM32-2 blinks its HAL program and the main board reads it on PA0',()=>{
  const p=twoBoards(),blink=halExampleFor('blink','nucleo-f446re');Object.assign(p.components[0],{code:blink.code,mcu:blink.mcu,firmware:blink.firmware});
  p.code=READ_PA0;p.firmware={mode:'sketch',files:[]};
  const {result,out}=run(p,2500),reads=out.filter(l=>/^main: [01]$/.test(l));
  assert.equal(out[0],'[STM32-2] HAL 프로그램을 시작했습니다.');assert.ok(out.some(l=>l.startsWith('[STM32-2] ')&&l.includes('PA5=1')),out.join('\n'));
  assert.ok(reads.length>=4,'PA0 follows STM32-2: '+reads.join(','));assert.ok(result.voltage('signal:b2.PA5')!=null);
  assert.deepEqual(createBoardDrivers(p),[],'STM32 boards are not fixed-run drivers');
 });
 test('a part wired only to another board shows that board\'s device state (OLED)',()=>{
  const p=structuredClone(halExampleFor('oled','nucleo-f103rb'));p.components.push({id:'b2',...newStm32Fields(p,'nucleo-f103rb',600)});swapStm32(p,'b2');
  const oled=p.components.find(c=>!['devboard','breadboard'].includes(c.type)).id;
  assert.equal(run(p,1500,{drivers:[]}).result.parts[oled].on,false,'the main board does not drive it');
  const {result,out}=run(p,1500);assert.equal(result.parts[oled].on,true);assert.ok(out.some(l=>/\[STM32-1\] OLED init status=0/.test(l)),out.join('\n'));
 });
 test('HAL examples behave the same on another board as on the main board (servo PWM, SPI chip select, LCD, EXTI)',()=>{
  const state=(result,ids)=>JSON.stringify(ids.map(id=>{const {voltage,current,power,device,...rest}=result.parts[id]||{};return rest;}));
  for(const kind of ['servo','spi','lcd','exti']){
   const example=structuredClone(halExampleFor(kind,'nucleo-f103rb')),ids=example.components.filter(c=>!['breadboard','devboard'].includes(c.type)).map(c=>c.id);
   const alone=run(structuredClone(example),2000,{drivers:[]}).result;
   const moved=structuredClone(example);moved.components.push({id:'b2',...newStm32Fields(moved,'nucleo-f103rb',900)});swapStm32(moved,'b2');
   assert.equal(state(run(moved,2000).result,ids),state(alone,ids),kind);
  }
 });
 test('UART between boards: STM32-2 TX → main board RX at the same baud; the main board echoes it',()=>{
  const main=halExampleFor('uart','nucleo-f103rb'),other=halExampleFor('uart','nucleo-f446re'),p=projectForBoard('nucleo-f103rb');
  Object.assign(p,{code:main.code,mcu:main.mcu,firmware:main.firmware});p.components.push({id:'b2',...newStm32Fields(p,'nucleo-f446re',430),code:other.code,mcu:other.mcu,firmware:other.firmware});
  p.wires.push(wire('w1','devboard:b2:CN10:35','board:CN10:37'));
  const echo=project=>{const tx=[],out=[],session=new SimulationSession(project,{uart:e=>{if(e.direction==='TX')tx.push(String.fromCharCode(...e.bytes));}});session.circuit.drivers=createStm32Drivers(project,{log:t=>out.push(t)});connectStm32Drivers(session);for(let t=0;t<=400;t+=50)session.tick(t);return {tx:tx.join(''),out};};
  const {tx,out}=echo(p);assert.equal(tx,'HAL UART ready\r\nHAL UART ready\r\n','own message, then the echo of STM32-2');assert.ok(out.includes('[STM32-2] [USART2 TX] HAL UART ready'),out.join('|'));
  const slow=structuredClone(p),b2=slow.components[0];b2.mcu.peripherals.USART2.baud=115200;b2.code=b2.code.replace('BaudRate = 9600','BaudRate = 115200');assert.equal(echo(slow).tx,'HAL UART ready\r\n','another baud rate is not received');
  const apart=structuredClone(p);apart.wires=[];assert.equal(echo(apart).tx,'HAL UART ready\r\n','not wired');
 });
 test('RESET restarts one board; a compile error names the board',()=>{
  const p=twoBoards();p.components[0].code='int main(void){HAL_Init(); while(1){}';
  assert.throws(()=>createStm32Drivers(p),/STM32-2 · main\.c/);
  const ok=twoBoards(),out=[],{session}=run(ok,300,{out}),driver=session.circuit.drivers[0];
  const count=()=>out.filter(l=>l==='[STM32-2] HAL ready').length,before=count();driver.reset();session.tick(600);assert.equal(count(),before+1);
 });
 test('emulator: STM32-2 runs its ARM ELF on the shared circuit',()=>{
  const dir=new URL('../fixtures/firmware/',import.meta.url),fixture=JSON.parse(fs.readFileSync(new URL('blink.json',dir),'utf8'));
  const p=twoBoards();Object.assign(p.components[0],{code:fixture.code,mcu:fixture.mcu,firmware:fixture.firmware??{mode:'hal',files:[]}});p.code=READ_PA0;p.firmware={mode:'sketch',files:[]};
  const out=[],drivers=createStm32Drivers(p,{emulate:true,elfs:{b2:new Uint8Array(fs.readFileSync(new URL('blink.elf',dir)))},log:t=>out.push(t)});
  const {out:all}=run(p,3000,{drivers,out});const reads=all.filter(l=>/^main: [01]$/.test(l));
  assert.match(all[0],/\[STM32-2\] 펌웨어 에뮬레이터를 시작했습니다 · STM32F446RE/);assert.ok(reads.length>=3,'PA0 follows the emulated LD2: '+all.join('|'));
  assert.throws(()=>createStm32Drivers(p,{emulate:true}),/ELF가 없습니다/);
 });
});

describe('STM32 boards: real boards',()=>{
 const links=list=>async()=>list;
 test('each board gets its own ST-LINK: set, matched by board kind, or the only unknown one',async()=>{
  const {assignStlinks}=require('../../desktop/native-ide.cjs');
  const f1={serial:'0668FF544949878667173544',board:'NUCLEO-F103RB'},f4={serial:'0672FF485775495067192757',board:'NUCLEO-F446RE'},unknown={serial:'0670FF000000000000000001',board:''};
  const item=(name,boardName,serial='')=>({name,boardName,serial});
  assert.deepEqual(await assignStlinks([item('STM32-1','NUCLEO-F103RB'),item('STM32-2','NUCLEO-F446RE')],links([f4,f1])),[f1.serial,f4.serial]);
  assert.deepEqual(await assignStlinks([item('STM32-1','NUCLEO-F103RB',f1.serial),item('STM32-2','NUCLEO-F103RB')],links([f1,unknown])),[f1.serial,unknown.serial]);
  await assert.rejects(assignStlinks([item('STM32-1','NUCLEO-F103RB'),item('STM32-2','NUCLEO-F103RB')],links([f1,{...f1,serial:'0668FF000000000000000002'}])),/실물 기록 ST-LINK/);
  await assert.rejects(assignStlinks([item('STM32-1','NUCLEO-F103RB',f1.serial),item('STM32-2','NUCLEO-F446RE',f1.serial)],links([f1,f4])),/같은 ST-LINK/);
  await assert.rejects(assignStlinks([item('STM32-1','NUCLEO-F446RE',f1.serial)],links([f1])),/NUCLEO-F103RB에 연결/);
  await assert.rejects(assignStlinks([item('STM32-1','NUCLEO-F103RB'),item('STM32-2','NUCLEO-F446RE')],links([f1])),/쓸 ST-LINK가 없습니다/);
 });
});
