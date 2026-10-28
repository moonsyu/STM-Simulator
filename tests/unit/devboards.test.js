import {test,describe} from 'node:test';
import assert from 'node:assert/strict';
import {topology,solveCircuit,CircuitSimulation} from '../../src/engine.js';
import {holeInfo,endpointInfo} from '../../src/pins.js';
import {findMount,applyMount} from '../../src/placement.js';
import {validateProject,startProject} from '../../src/project.js';
import {attachments} from '../../src/components.js';
import {copySelection,pasteSelection} from '../../src/circuit-edit.js';
import {DEVBOARD_MODELS,devboardPins,devboardPinInfo,devboardNet,newDevboardFields,removeDevboard,boardFileKey,boardForFile,boardSourceFiles} from '../../src/devboards.js';
import {defineScenario,createBoardDrivers,FixedRunDriver} from '../../src/fixed-run.js';
import {LECTURE_EXAMPLES,applyLectureExample,searchLectureExamples} from '../../src/lecture-examples.js';
import {SimulationSession} from '../../src/session.js';

const board=(model,extra={})=>({id:'b1',type:'devboard',model,name:'B1',x:400,y:300,rotation:0,code:'',...extra});
const project=(...components)=>{const p=startProject();p.components.push(...components);return p;};

describe('boards: pin maps',()=>{
 test('ESP32 38-pin boards: DevKitC V4 order, rows 9 pitches apart, NodeMCU-32S labels',()=>{
  for(const id of ['esp32-nodemcu-32s','esp32-devkit-wroom32']){
   const m=DEVBOARD_MODELS[id],left=m.pins.filter(p=>p.key.startsWith('L')),right=m.pins.filter(p=>p.key.startsWith('R'));
   assert.equal(m.pins.length,38);assert.equal(left.length,19);
   assert.deepEqual(left.map(p=>p.signal),['3V3','EN','GPIO36','GPIO39','GPIO34','GPIO35','GPIO32','GPIO33','GPIO25','GPIO26','GPIO27','GPIO14','GPIO12','GND','GPIO13','GPIO9','GPIO10','GPIO11','5V']);
   assert.deepEqual(right.map(p=>p.signal),['GND','GPIO23','GPIO22','GPIO1','GPIO3','GPIO21','GND','GPIO19','GPIO18','GPIO5','GPIO17','GPIO16','GPIO4','GPIO0','GPIO2','GPIO15','GPIO8','GPIO7','GPIO6']);
   assert.ok(Math.abs(right[0].x-left[0].x-126)<1e-9,'22.86 mm = 9 × 14 units');
   for(let i=1;i<19;i++)assert.equal(left[i].y-left[i-1].y,14);
  }
  assert.equal(DEVBOARD_MODELS['esp32-nodemcu-32s'].pins.find(p=>p.signal==='GPIO34').label,'P34');
  assert.equal(DEVBOARD_MODELS['esp32-devkit-wroom32'].pins.find(p=>p.signal==='GPIO34').label,'34');
  assert.ok(DEVBOARD_MODELS['esp32-devkit-wroom32'].unverified,'the WROOM-32 board is drawn from DevKitC V4 until checked');
 });
 test('ESP32 pin cautions: input-only, flash, strapping, ADC2, UART0',()=>{
  const note=signal=>DEVBOARD_MODELS['esp32-nodemcu-32s'].pins.find(p=>p.signal===signal).notes.map(n=>n.text).join(' / ');
  assert.match(note('GPIO34'),/입력 전용/);assert.match(note('GPIO9'),/사용 금지/);assert.match(note('GPIO12'),/1\.8 V/);assert.match(note('GPIO25'),/ADC2/);assert.match(note('GPIO1'),/시리얼/);assert.match(note('GPIO2'),/내장 파란 LED/);
 });
 test('Raspberry Pi 5: physical pins 1–40, odd inner row, even edge row, GPIO2/3 pull-ups',()=>{
  const m=DEVBOARD_MODELS.rpi5;assert.equal(m.pins.length,40);
  assert.deepEqual([1,2,3,6,11,13,15,38,40].map(n=>m.pins[n-1].signal),['3V3','5V','GPIO2','GND','GPIO17','GPIO27','GPIO22','GPIO20','GPIO21']);
  assert.ok(m.pins[0].y>m.pins[1].y,'pin 1 is on the inner row');assert.ok(Math.abs(m.pins[2].x-m.pins[0].x-14)<1e-9);
  assert.deepEqual(m.pullups,{GPIO2:1800,GPIO3:1800});
 });
});

describe('boards: circuit',()=>{
 test('GPIOs are the board\'s own nets; power pins join the common rails',()=>{
  const b=board('rpi5'),p=project(b),uf=topology(p),pin=n=>`devboard:b1:P${n}`;
  assert.equal(uf.find(pin(1)),uf.find('signal:3V3'));assert.equal(uf.find(pin(6)),uf.find('signal:GND'));
  assert.equal(uf.find(pin(11)),uf.find('signal:b1.GPIO17'));assert.notEqual(uf.find(pin(11)),uf.find('signal:PA5'));
  assert.equal(devboardNet(b,{signal:'EN'}),null);
 });
 test('a driven board GPIO lights an LED through a resistor; GPIO2/3 read HIGH from the pull-ups',()=>{
  const p=project(board('rpi5'),{id:'L1',type:'led',name:'LED1',x:700,y:600,rotation:0,color:'red',span:28},{id:'R1',type:'resistor',name:'R1',x:700,y:650,rotation:0,value:220,span:42});
  p.wires.push({id:'w1',from:'devboard:b1:P11',to:'part:L1:a',color:'#ff0000'},{id:'w2',from:'part:L1:b',to:'part:R1:a',color:'#ff0000'},{id:'w3',from:'part:R1:b',to:'devboard:b1:P6',color:'#000000'});
  const q=validateProject(p),on=solveCircuit(q,{'b1.GPIO17':{mode:'OUTPUT',value:3.3}}),off=solveCircuit(q,{'b1.GPIO17':{mode:'OUTPUT',value:0}});
  assert.equal(on.parts.L1.on,true);assert.equal(off.parts.L1.on,false);assert.ok(on.voltage('signal:b1.GPIO2')>3.2);
 });
 test('an ESP32 board plugs into a 400-point breadboard across the channel (columns b and i)',()=>{
  const p=startProject();p.surfaces={board:{hidden:true},breadboard:{hidden:false}};const b=board('esp32-nodemcu-32s');
  const h=holeInfo('bb:b:11',[],p.surfaces);b.x=h.x+63;b.y=h.y+126;assert.ok(applyMount(b,findMount(b,p.components,4,p.surfaces,p.wires)));p.components.push(b);
  assert.equal(attachments(b).L1,'bb:b:11');assert.equal(attachments(b).R19,'bb:i:29');assert.equal(Object.keys(attachments(b)).length,38);
  const q=validateProject(p),uf=topology(q);assert.equal(uf.find('bb:a:11'),uf.find('signal:3V3'),'the strip of the 3V3 pin');assert.equal(uf.find('bb:j:25'),uf.find('signal:b1.GPIO2'));
  assert.throws(()=>validateProject({...q,components:[{...q.components[0],attachments:{L1:'bb:b:11',L2:'bb:b:11'}}]}),/빵판 연결/);
 });
 test('the Raspberry Pi header is wired, not plugged',()=>{const b=board('rpi5');assert.equal(findMount(b,[],15,{breadboard:{hidden:false}},[]),null);});
});

describe('boards: project and editing',()=>{
 test('validation keeps the board program and scenario; unknown models and huge programs are refused',()=>{
  const p=project(board('esp32-devkit-wroom32',{code:'void setup(){}',scenario:'lecture-esp32-blink'}));p.wires.push({id:'w1',from:'devboard:b1:R15',to:'devboard:b1:L14',color:'#123456'});
  const q=validateProject(JSON.parse(JSON.stringify(p)));assert.equal(q.components[0].code,'void setup(){}');assert.equal(q.components[0].scenario,'lecture-esp32-blink');
  assert.throws(()=>validateProject(project(board('esp32-c3'))),/지원하지 않는 보드/);
  assert.throws(()=>validateProject(project(board('rpi5',{code:'x'.repeat(100001)}))),/100 KB/);
  assert.throws(()=>validateProject({...p,wires:[{id:'w1',from:'devboard:b1:L40',to:'devboard:b1:L1',color:'#123456'}]}),/배선/);
 });
 test('new boards get unique names; removing a board removes its wires; program files are listed',()=>{
  const p=startProject(),a={id:'a',...newDevboardFields(p,'esp32-nodemcu-32s',430)};p.components.push(a);const b={id:'b',...newDevboardFields(p,'esp32-devkit-wroom32',600)};p.components.push(b);
  assert.deepEqual([a.name,b.name],['ESP32-1','ESP32-2']);assert.match(a.code,/pinMode\(2, OUTPUT\)/);
  assert.equal(boardFileKey(a),'board/a/sketch.ino');assert.equal(boardForFile(p,'board/b/sketch.ino'),b);assert.deepEqual(boardSourceFiles(p).map(f=>f.label),['ESP32-1 · sketch.ino','ESP32-2 · sketch.ino']);
  p.wires.push({id:'w1',from:'devboard:a:L1',to:'devboard:b:L1',color:'#000000'});removeDevboard(p,'a');assert.equal(p.wires.length,0);assert.deepEqual(p.components.map(c=>c.id),['b']);
 });
 test('copy and paste brings a board with its wires and a fresh name',()=>{
  const p=project(board('rpi5'));p.wires.push({id:'w1',from:'devboard:b1:P1',to:'devboard:b1:P17',color:'#ff0000'});
  const clip=copySelection(p,{type:'group',parts:['b1'],wires:['w1']});let n=0;pasteSelection(p,clip,prefix=>prefix+(++n),40);
  const copy=p.components[1];assert.equal(copy.type,'devboard');assert.equal(copy.name,'RPI-1');assert.notEqual(copy.id,'b1');
  assert.ok(p.wires.some(w=>w.from===`devboard:${copy.id}:P1`&&w.to===`devboard:${copy.id}:P17`));
 });
 test('board pins are endpoints with the board name and pin notes',()=>{
  const b=board('esp32-nodemcu-32s'),p=project(b);assert.equal(endpointInfo('devboard:b1:R15',p.components).label,'B1 · P2 / GPIO2');
  assert.match(devboardPinInfo('devboard:b1:L5',p.components).notes[1].text,/입력 전용/);assert.equal(devboardPins(b).length,38);
 });
});

describe('fixed run',()=>{
 test('timers, outputs, PWM and input edges drive the circuit step by step',()=>{
  defineScenario('test-fixed',{start(ctx){let on=0;ctx.output('GPIO17',0);ctx.every(100,c=>{on^=1;c.output('GPIO17',on);c.log('LED '+on);});ctx.input('GPIO27','up',(c,level)=>c.log('button '+level));ctx.after(250,c=>c.pwm('GPIO18',.5));}});
  const p=validateProject(project(board('rpi5',{scenario:'test-fixed'}))),logs=[],sim=new CircuitSimulation();sim.drivers=createBoardDrivers(p,{log:s=>logs.push(s)});
  let r=sim.solve(p,{},{},0);assert.equal(r.voltage('signal:b1.GPIO17'),0);assert.ok(r.voltage('signal:b1.GPIO27')>3);
  r=sim.solve(p,{},{},150);assert.ok(r.voltage('signal:b1.GPIO17')>3);r=sim.solve(p,{},{},260);assert.ok(Math.abs(r.voltage('signal:b1.GPIO18')-1.65)<.01);
  assert.deepEqual(logs,['[B1] 고정 실행 시작 · test-fixed','[B1] LED 1','[B1] LED 0']);
 });
 test('a board without a scenario stays idle; scope runs one board only',()=>{
  const p=validateProject(project(board('rpi5'),{...board('esp32-nodemcu-32s'),id:'b2',name:'B2',scenario:'lecture-esp32-blink'})),logs=[];
  const all=createBoardDrivers(p,{log:s=>logs.push(s)});assert.equal(all.length,2);assert.match(logs[0],/실행하지 않습니다/);
  assert.deepEqual(createBoardDrivers(p,{scope:'b2'}).map(d=>d.part.id),['b2']);assert.ok(all[1] instanceof FixedRunDriver);
 });
});

describe('lecture examples',()=>{
 // Steps are times (ms) or [time, pressed buttons].
 const run=(id,steps)=>{const {project:p}=applyLectureExample(id),logs=[],sim=new CircuitSimulation();sim.drivers=createBoardDrivers(p,{log:s=>logs.push(s)});let r;for(const step of steps){const [t,pressed={}]=Array.isArray(step)?step:[step];r=sim.solve(p,{},pressed,t);}return {p,r,logs};};
 test('all ten circuits build, validate and use each pin or hole once',()=>{
  assert.equal(LECTURE_EXAMPLES.length,10);assert.deepEqual(searchLectureExamples('IOT-01').map(e=>e.code),['IOT-01']);assert.equal(searchLectureExamples('라즈베리파이').length,10);
  for(const e of LECTURE_EXAMPLES){const {project:p,file}=applyLectureExample(e.id);assert.ok(p.components.some(c=>c.type==='devboard'),e.code);
   const used=[...p.wires.flatMap(w=>[w.from,w.to]),...p.components.flatMap(c=>Object.values(attachments(c)))];assert.equal(new Set(used).size,used.length,e.code+': one endpoint per pin/hole');
   assert.ok(file==='main.c'||boardForFile(p,file),e.code);}
 });
 test('Raspberry Pi: GPIO17 blinks the LED once a second; a 3.3 V LED stays on',()=>{
  const a=run('lecture-rpi-02',[0,500]),b=run('lecture-rpi-02',[0,1100]);assert.equal(a.r.parts.LED1.on,true);assert.equal(b.r.parts.LED1.on,false);assert.ok(b.logs.includes('[RPI-1] LED OFF'));
  assert.equal(run('lecture-rpi-01',[0,10]).r.parts.LED1.on,true);
 });
 test('switches: internal pull-up on GPIO27, external pull-up on GPIO22, kernel driver LED follows GPIO2',()=>{
  const two=run('lecture-rpi-05',[0,[10,{SW2:true}],[20,{SW2:true}]]);assert.ok(two.logs.includes('[RPI-1] GPIO22 눌림'));assert.ok(!two.logs.includes('[RPI-1] GPIO27 눌림'));
  const ker=run('lecture-ker-02',[0,[10,{SW1:true}],[20,{SW1:true}]]);assert.equal(ker.r.parts.LED1.on,true);assert.ok(ker.logs.includes('[RPI-1] button_driver: pressed'));
 });
 test('ESP32 IOT-01: switch lights the LED, the pot reads mid-scale, DHT11 reports its settings',()=>{
  const io=run('lecture-iot-01',[0,1100,[1200,{SW1:true}],[1300,{SW1:true}]]);assert.ok(io.logs.includes('[ESP32-1] 스위치 떼어짐 → LED OFF'),'the polled switch is reported at start');assert.equal(io.r.parts.LED1.on,true);
  assert.ok(io.logs.includes('[ESP32-1] 가변저항 2047 (1.65 V)'));assert.ok(io.logs.includes('[ESP32-1] 온도 25.0 C, 습도 50 %'));
 });
 test('FW-09: the STM32 HAL code writes 1 / 0 over I2C and the ESP32 slave switches its LED',()=>{
  const {project:p}=applyLectureExample('lecture-fw-09'),out=[],logs=[],session=new SimulationSession(p,{print:s=>out.push(String(s))});
  session.circuit.drivers=createBoardDrivers(p,{log:s=>logs.push(s)});session.buses.boards=()=>session.circuit.drivers;
  let r=session.tick(0);for(let t=20;t<=1500;t+=20)r=session.tick(t);
  assert.ok(out.some(s=>/ESP32에 1 보냄 \(status=0\)/.test(s)),out.join('|'));assert.ok(out.some(s=>/ESP32에 0 보냄 \(status=0\)/.test(s)));
  assert.ok(logs.includes('[ESP32-1] I2C 수신 1 → LED ON'));assert.ok(logs.includes('[ESP32-1] I2C 수신 0 → LED OFF'));
 });
});
