// HC-05 / HC-06 Bluetooth and ESP-01 Wi-Fi modules: the module models, their examples and boards talking over the air.
import {test,describe} from 'node:test';
import assert from 'node:assert/strict';
import {applyLectureExample} from '../../src/lecture-examples.js';
import {catalogExample} from '../../src/catalog-examples.js';
import {catalogType} from '../../src/catalog-defs.js';
import {SimulationSession} from '../../src/session.js';
import {createStm32Drivers,connectStm32Drivers} from '../../src/stm32-boards.js';
import {createBoardDrivers} from '../../src/fixed-run.js';
import {WirelessHub} from '../../src/wireless.js';

function runBoards(project,ms){
 const main=[],boards=[],session=new SimulationSession(project,{print:s=>main.push(String(s))});
 session.circuit.drivers=[...createBoardDrivers(project,{log:s=>boards.push(s)}),...createStm32Drivers(project,{log:s=>boards.push(s)})];connectStm32Drivers(session);
 let result=session.tick(0);for(let t=20;t<=ms;t+=20)result=session.tick(t);
 return {main,boards,session,result};
}
const example=type=>catalogExample(catalogType(type),()=>{throw new Error('own example');});
function single(type,ms){const out=[],session=new SimulationSession(example(type),{print:s=>out.push(String(s))});let result=session.tick(0);for(let t=20;t<=ms;t+=20)result=session.tick(t);return {out,session,result};}

// A bare model module and what it answers, without a board.
function bench(variant,part={}){
 const session={project:{components:[{id:'m',type:'wireless',catalogVariant:variant,name:'M',baud:variant==='esp01-wifi-8'?115200:9600,role:'slave',btPin:'1234',...part}]},buses:{trace(){}},wirelessRx(module,frames){this.sent.push(...frames.map(f=>String.fromCharCode(f.value)));},sent:[]};
 const hub=new WirelessHub(session),levels={p1:part.vcc??5,p2:0,p5:part.en??0,p6:3.3},result={fault:false,parts:{},voltage:id=>levels[id.split(':')[2]]},part0=session.project.components[0];
 let now=0;
 const advance=us=>{now+=us;hub.advance(now,result,session);};
 const send=text=>{hub.transmit([...text].map((c,i)=>({value:c.charCodeAt(0),at:now+i})),hub.module(part0).uartBaud,()=>true);};
 return {hub,session,advance,send,module:()=>hub.module(part0),levels,take(){const t=session.sent.join('');session.sent.length=0;return t;}};
}

describe('HC-06 (datasheet: no terminator, a command ends with the pause after it)',()=>{
 test('AT, version, name, PIN and baud answer after the pause, not before',()=>{
  const b=bench('hc06-bluetooth-4');b.advance(1000);b.send('AT');b.advance(100000);assert.equal(b.take(),'','not before the pause');b.advance(500000);assert.equal(b.take(),'OK');
  b.send('AT+VERSION');b.advance(600000);assert.equal(b.take(),'OKlinvorV1.8');
  b.send('AT+NAMEROBOT');b.advance(600000);assert.equal(b.take(),'OKsetname');
  b.send('AT+PIN4321');b.advance(600000);assert.equal(b.take(),'OKsetPIN');assert.equal(b.module().btPin,'4321');
  b.send('AT+BAUD8');b.advance(600000);assert.equal(b.take(),'OK115200');assert.equal(b.module().uartBaud,115200,'the new speed applies after the answer');
 });
 test('a wrong speed reaches nothing, and an unpowered module nothing either',()=>{
  const b=bench('hc06-bluetooth-4');b.advance(1000);
  assert.equal(b.hub.transmit([{value:65,at:1}],38400,()=>true),0);
  const off=bench('hc06-bluetooth-4',{vcc:2});off.advance(1000);assert.equal(off.hub.transmit([{value:65,at:1}],9600,()=>true),0);assert.match(off.module().status(),/전원/);
 });
});
describe('HC-05 AT commands',()=>{
 const at=()=>{const b=bench('hc05-bluetooth-6',{en:3.3});b.advance(1000);return b;};
 test('EN high at power on is AT mode at 38400; EN low is communication at 9600',()=>{
  const b=at();assert.equal(b.module().uartBaud,38400);
  b.levels.p5=0;b.advance(1000);assert.equal(b.module().uartBaud,9600);assert.equal(b.module().at,false);
  b.levels.p5=3.3;b.advance(1000);assert.equal(b.module().uartBaud,9600,'EN raised after power on keeps the communication speed');assert.equal(b.module().at,true);
 });
 test('queries and settings end in CR LF and answer with OK or ERROR',()=>{
  const b=at(),ask=text=>{b.send(text+'\r\n');return b.take();};
  assert.equal(ask('AT'),'OK\r\n');assert.equal(ask('AT+ROLE?'),'+ROLE:0\r\nOK\r\n');assert.equal(ask('AT+ROLE=1'),'OK\r\n');assert.equal(b.module().role,'master');
  assert.equal(ask('AT+PSWD=4321'),'OK\r\n');assert.equal(ask('AT+PSWD?'),'+PSWD:4321\r\nOK\r\n');assert.equal(ask('AT+PSWD=12'),'ERROR:(5)\r\n');
  assert.equal(ask('AT+UART=115200,0,0'),'OK\r\n');assert.equal(ask('AT+UART?'),'+UART:115200,0,0\r\nOK\r\n');assert.equal(ask('AT+NOPE'),'ERROR:(0)\r\n');
  assert.equal(ask('AT+ORGL'),'OK\r\n');assert.equal(ask('AT+ROLE?'),'+ROLE:0\r\nOK\r\n');
 });
});
describe('ESP-01 AT firmware',()=>{
 const up=()=>{const b=bench('esp01-wifi-8',{vcc:3.3,en:3.3});b.advance(1000);b.advance(400000);return b;};
 test('needs 3.3 V and CH_PD; prints ready after boot; echoes until ATE0',()=>{
  const b=up();assert.equal(b.take(),'ready\r\n');b.send('AT\r\n');assert.equal(b.take(),'AT\r\n\r\nOK\r\n');
  b.send('ATE0\r\n');b.take();b.send('AT\r\n');assert.equal(b.take(),'\r\nOK\r\n');
  const five=bench('esp01-wifi-8',{vcc:5,en:3.3});five.advance(1000);five.advance(400000);assert.equal(five.module().enabled,false,'5 V: out of range');
  const off=bench('esp01-wifi-8',{vcc:3.3,en:0});off.advance(1000);off.advance(400000);assert.equal(off.module().enabled,false,'CH_PD low');assert.match(off.module().status(),/CH_PD/);
 });
 test('settings follow the AT reference: mode gates, password length, unknown commands',()=>{
  const b=up();b.take();b.send('ATE0\r\n');b.take();const ask=text=>{b.send(text+'\r\n');return b.take();};
  assert.equal(ask('AT+CWSAP="A","12345678",5,3'),'ERROR\r\n','AP settings need mode 2 or 3');assert.equal(ask('AT+CWMODE=2'),'\r\nOK\r\n');
  assert.equal(ask('AT+CWSAP="A","short",5,3'),'ERROR\r\n');assert.equal(ask('AT+CWSAP="A","12345678",5,3'),'\r\nOK\r\n');assert.equal(ask('AT+CWMODE?'),'+CWMODE:2\r\n\r\nOK\r\n');
  assert.equal(ask('AT+CIPSERVER=1,80'),'ERROR\r\n','a server needs AT+CIPMUX=1');assert.equal(ask('AT+CIPMUX=1'),'\r\nOK\r\n');assert.equal(ask('AT+CIPSERVER=1,80'),'\r\nOK\r\n');
  assert.equal(ask('AT+CIPMODE=1'),'ERROR\r\n','passthrough is not modelled');assert.equal(ask('AT+WHAT'),'ERROR\r\n');
 });
});

describe('one-board examples',()=>{
 test('HC-05: AT mode prints version, role, PIN, baud and address',()=>{
  const {out}=single('hc05-bluetooth-6',800);assert.ok(out.includes('+ROLE:1'),out.join('|'));assert.ok(out.includes('+PSWD:1234'));assert.ok(out.includes('+UART:9600,0,0'));assert.ok(out.some(s=>s.startsWith('+ADDR:')));assert.ok(out.includes('AT setup done'));
 });
 test('HC-06: answers OK while unpaired',()=>{const {out}=single('hc06-bluetooth-4',4000);assert.ok(out.includes('reply: OK'),out.join('|'));assert.ok(out.includes('reply: OKlinvorV1.8'),out.join('|'));});
 test('ESP-01: boots, opens an AP and reports its address',()=>{const {out}=single('esp01-wifi-8',1200);assert.ok(out.some(s=>s.includes('+CIFSR:APIP,"192.168.4.1"')),out.join('|'));assert.ok(out.includes('AP STM-LAB ready'));});
});
describe('boards talking over the air',()=>{
 test('BT-01: HC-05 pairs by PIN, STATE goes high, STM32-2 switches LD2 and answers',()=>{
  const {project}=applyLectureExample('wireless-bt-stm32'),{main,boards,session,result}=runBoards(project,4000);
  assert.ok(main.includes('HC-05 searching'));assert.ok(main.includes('HC-05 paired'),main.join('|'));
  assert.ok(main.includes('answer: ACK ON'),main.join('|'));assert.ok(main.includes('answer: ACK OFF'),main.join('|'));
  assert.ok(boards.some(s=>s.includes('got: LED ON')),boards.join('|'));assert.ok(!boards.some(s=>s.includes('HAL ready')),'the start-up message does not go over the air');
  assert.match(result.parts.hc05.status,/연결됨 · HC-06/);assert.ok(session.result.voltage('signal:PB1')>3,'STATE');
 });
 test('BT-01: a different PIN, or no master, never pairs',()=>{
  const pin=structuredClone(applyLectureExample('wireless-bt-stm32').project);pin.components.find(p=>p.id==='hc06').btPin='0000';assert.ok(!runBoards(pin,2500).main.includes('HC-05 paired'));
  const slave=structuredClone(applyLectureExample('wireless-bt-stm32').project);slave.components.find(p=>p.id==='hc05').role='slave';assert.ok(!runBoards(slave,2500).main.includes('HC-05 paired'));
 });
 test('BT-01: swapped TX / RX wires carry nothing',()=>{
  const p=structuredClone(applyLectureExample('wireless-bt-stm32').project);for(const w of p.wires){if(w.to==='part:hc06:p4')w.to='part:hc06:p3';else if(w.from==='part:hc06:p3')w.from='part:hc06:p4';}
  const {main}=runBoards(p,3500);assert.ok(main.includes('HC-05 paired'));assert.ok(!main.some(s=>s.startsWith('answer:')),main.join('|'));
 });
 test('BT-02: the ESP32 on Serial2 receives the commands, switches GPIO2 and answers',()=>{
  const {project}=applyLectureExample('wireless-bt-esp32'),{main,boards,session}=runBoards(project,3200);
  assert.ok(boards.some(s=>s.includes('got: LED ON')),boards.join('|'));assert.ok(main.includes('answer: ACK ON'),main.join('|'));assert.notEqual(session.result.voltage('signal:esp32.GPIO2'),null);
 });
 test('WF-01: station joins the AP, opens TCP and the server answers each command',()=>{
  const {project}=applyLectureExample('wireless-wifi-stm32'),{main,boards,result}=runBoards(project,6000);
  assert.ok(boards.some(s=>s.includes('server ready')),boards.join('|'));assert.ok(main.includes('connected'),main.join('|'));
  assert.ok(boards.some(s=>s.includes('got: LED ON')),boards.join('|'));assert.ok(main.includes('answer: ACK'),main.join('|'));
  assert.match(result.parts.esp1.status,/192\.168\.4\.2/);assert.match(result.parts.esp2.status,/TCP 서버 333/);
 });
 test('WF-01: the wrong password is refused with +CWJAP:2',()=>{
  const p=structuredClone(applyLectureExample('wireless-wifi-stm32').project);p.code=p.code.replace('stm32-lab','wrong-pass');const {main}=runBoards(p,3500);
  assert.ok(main.includes('+CWJAP:2'),main.join('|'));assert.ok(!main.includes('connected'));
 });
});
