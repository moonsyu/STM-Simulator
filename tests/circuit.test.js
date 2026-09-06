import test from 'node:test';
import assert from 'node:assert/strict';
import {PINS,HOLES,boardPin,endpointInfo,searchPins} from '../src/pins.js';
import {terminalKeys,attachments,detachPart,normalizeAngle} from '../src/components.js';
import {findMount,applyMount} from '../src/placement.js';
import {topology,solveCircuit,digitalRead} from '../src/engine.js';
import {example,blankProject,validateProject} from '../src/project.js';
import {compile,Runtime} from '../src/program.js';
import {PART_DEFS} from '../src/components.js';
import {CircuitSimulation} from '../src/engine.js';
import {UltrasonicSignals} from '../src/sensors.js';
import {componentExample} from '../src/component-examples.js';
const close=(actual,expected,tolerance=1e-5)=>assert.ok(Math.abs(actual-expected)<tolerance,`${actual} ≠ ${expected}`);
test('physical connectors: 108 board pins, 300 terminals and 100 rail holes',()=>{
 assert.equal(PINS.length,108);assert.equal(new Set(PINS.map(p=>p.id)).size,108);assert.equal(HOLES.length,400);assert.equal(new Set(HOLES.map(p=>p.id)).size,400);
 assert.equal(PINS.find(p=>p.id==='board:CN5:6').signal,'PA5');assert.equal(PINS.find(p=>p.id==='board:CN9:2').signal,'PA2');assert.equal(PINS.find(p=>p.id==='board:CN10:18').signal,'NC');
 assert.equal(new Set(HOLES.map(h=>`${h.x},${h.y}`)).size,400);
});
test('breadboard internal buses: five-hole rows, isolated center, continuous separate rails',()=>{
 const u=topology(blankProject());assert.equal(u.find('bb:a:1'),u.find('bb:e:1'));assert.notEqual(u.find('bb:e:1'),u.find('bb:f:1'));assert.notEqual(u.find('bb:a:1'),u.find('bb:a:2'));
 assert.equal(u.find('rail:L:+:1'),u.find('rail:L:+:25'));assert.notEqual(u.find('rail:L:+:1'),u.find('rail:L:-:1'));assert.notEqual(u.find('rail:L:+:1'),u.find('rail:R:+:1'));
});
test('Arduino and Morpho GPIO aliases are the same electrical node',()=>{
 const u=topology(blankProject());assert.equal(u.find(boardPin('D13')),u.find('board:CN10:11'));
});
test('LED circuit obeys series resistance and forward drop, off when output is LOW',()=>{
 const p=example(),r=solveCircuit(p,{PA5:{mode:'OUTPUT',value:3.3}});assert.equal(r.fault,false);assert.equal(r.parts.led1.on,true);close(r.parts.led1.current,(3.3-1.8)/(330+40+12));
 const off=solveCircuit(p,{PA5:{mode:'OUTPUT',value:0}});assert.equal(off.parts.led1.on,false);
});
test('reverse LED does not light and disconnected resistor interrupts the circuit',()=>{
 const p=example();[p.components[1].attachA,p.components[1].attachB]=[p.components[1].attachB,p.components[1].attachA];assert.equal(solveCircuit(p,{PA5:{mode:'OUTPUT',value:3.3}}).parts.led1.on,false);
 const q=example();q.components=q.components.filter(p=>p.type!=='resistor');assert.equal(solveCircuit(q,{PA5:{mode:'OUTPUT',value:3.3}}).parts.led1.on,false);
});
test('a hard supply short fails closed',()=>{
 const p=blankProject();p.wires.push({id:'short',from:boardPin('3V3'),to:boardPin('GND'),color:'#000000'});const r=solveCircuit(p);assert.equal(r.fault,true);assert.match(r.warnings.join(),/단락/);assert.equal(r.voltage(boardPin('3V3')),null);
});
test('GPIO short is current limited and reports an overload',()=>{
 const p=blankProject();p.wires.push({id:'short',from:boardPin('D13'),to:boardPin('GND'),color:'#000000'});const r=solveCircuit(p,{PA5:{mode:'OUTPUT',value:3.3}});assert.match(r.warnings.join(),/PA5/);close(r.voltage(boardPin('D13')),0);
});
test('button circuit reads pull-up HIGH when open and LOW while pressed',()=>{
 const p=example('button'),gpio={PA10:{mode:'INPUT_PULLUP'}};assert.equal(digitalRead('D2',solveCircuit(p,gpio)),1);assert.equal(digitalRead('D2',solveCircuit(p,gpio,{b1:true})),0);
});
test('voltage divider and resistor power are computed',()=>{
 const p=example('divider'),r=solveCircuit(p);close(r.voltage(boardPin('A0')),1.65);close(r.parts.r1.current,0.000165);close(r.parts.r1.power,1.65*0.000165);
});
test('unconnected hole is floating, not a false 0 V measurement',()=>assert.equal(solveCircuit(blankProject()).voltage('bb:a:30'),null));
test('mounted component terminals use exact hole coordinates',()=>{
 const p=example();assert.equal(endpointInfo('part:r1:a',p.components).x,endpointInfo('bb:e:8').x);
});
test('project round trip validates references and excludes unknown fields',()=>{
 const p=example();assert.deepEqual(validateProject(JSON.parse(JSON.stringify(p))),p);assert.throws(()=>validateProject({...p,version:99}));
 assert.throws(()=>validateProject({...p,wires:[{id:'bad',from:'nonexistent',to:boardPin('GND'),color:'#000000'}]}));assert.throws(()=>validateProject({...p,components:[{...p.components[0],value:-10}]}));
 assert.equal(validateProject({...p,command:'evil'}).command,undefined);
});
test('sketch interpreter executes blink across delays',()=>{
 const runtime=new Runtime(compile(example().code),{});runtime.tick(0);assert.equal(runtime.gpio.PA5.value,3.3);runtime.tick(499);assert.equal(runtime.gpio.PA5.value,3.3);runtime.tick(500);assert.equal(runtime.gpio.PA5.value,0);runtime.tick(1001);assert.equal(runtime.gpio.PA5.value,3.3);
});
test('button sketch integrates with the electrical circuit',()=>{
 const p=example('button');let pressed={};let r;
 r=new Runtime(compile(p.code),{read:pin=>digitalRead(pin,solveCircuit(p,r.gpio,pressed))});r.tick(0);assert.equal(r.gpio.PA5.value,0);pressed={b1:true};r.tick(21);assert.equal(r.gpio.PA5.value,3.3);pressed={};r.tick(42);assert.equal(r.gpio.PA5.value,0);
});
test('analog sketch serial output is approximately half the 12-bit range',()=>{
 const p=example('divider'),out=[];let r;r=new Runtime(compile(p.code),{voltage:pin=>solveCircuit(p,r.gpio).voltage(`signal:${pin}`),print:s=>out.push(s)});r.tick(0);assert.ok([2047,2048].includes(Number(out[0])));
});
test('syntax errors, unknown API and busy infinite loops terminate',()=>{
 assert.throws(()=>compile('void loop() { digitalWrite(D13, HIGH) }'),/필요/);
 assert.throws(()=>new Runtime(compile('void loop() { while (true) { } }'),{}).tick(0),/한도/);
 assert.throws(()=>new Runtime(compile('void loop() { require("fs"); }'),{}).tick(0),/지원하지/);
 assert.throws(()=>new Runtime(compile('void loop() { digitalWrite(D99, HIGH); }'),{}).tick(0),/정의되지/);
});
test('variables, define, arithmetic, conditionals and PWM average model',()=>{
 const code='#define PIN D13\nint level = 128; void setup() { pinMode(PIN, OUTPUT); } void loop() { if (level > 100 && level < 200) { analogWrite(PIN, level); } delay(20); }';
 const r=new Runtime(compile(code),{});r.tick(0);close(r.gpio.PA5.value,3.3*128/255);
});
test('drag mounting aligns every contact exactly and refuses occupied or incomplete footprints',()=>{
 for(const part of [
   {id:'r',type:'resistor',x:795.8,y:226.7,rotation:0,span:42},
   {id:'led',type:'led',x:759,y:282,rotation:45,span:56},
   {id:'sw',type:'button',x:795.8,y:380.7,rotation:0},
   {id:'lcd',type:'lcd',x:918.8,y:304.8,rotation:90}
 ]){
   const mount=findMount(part);assert.ok(mount,part.type);applyMount(part,mount);
   const map=attachments(part);assert.equal(Object.keys(map).length,terminalKeys(part).length);
   assert.equal(new Set(Object.values(map)).size,terminalKeys(part).length);
   for(const key of terminalKeys(part)){const e=endpointInfo(`part:${part.id}:${key}`,[part]),h=endpointInfo(map[key]);close(e.x,h.x);close(e.y,h.y);}
   // A board filled with contacts cannot accept another footprint.
   const filled=HOLES.map((h,i)=>({id:'used'+i,type:'resistor',attachA:h.id}));assert.equal(findMount(part,filled),null);
 }
 assert.equal(findMount({id:'lcd',type:'lcd',x:800,y:304,rotation:0}),null);
 assert.equal(findMount({id:'off',type:'button',x:500,y:630,rotation:0}),null);
});
test('four-pin button sides remain joined and all four connect only when pressed',()=>{
 const p=example('button'),open=topology(p),closed=topology(p,{b1:true});
 assert.equal(open.find('part:b1:a'),open.find('part:b1:c'));assert.equal(open.find('part:b1:b'),open.find('part:b1:d'));
 assert.notEqual(open.find('part:b1:a'),open.find('part:b1:d'));assert.equal(closed.find('part:b1:a'),closed.find('part:b1:d'));
});
test('45-degree rotations and 16 LCD terminals survive file round trips',()=>{
 const p=blankProject(),lcd={id:'lcd',name:'LCD1',type:'lcd',x:918,y:303,rotation:90};applyMount(lcd,findMount(lcd));p.components.push(lcd);
 p.wires.push({id:'w',from:'part:lcd:p16',to:boardPin('GND'),color:'#edf2f5'});
 assert.deepEqual(validateProject(JSON.parse(JSON.stringify(p))),p);
 detachPart(lcd);for(let i=0;i<8;i++){lcd.rotation=normalizeAngle(lcd.rotation+45);assert.equal(validateProject(p).components[0].rotation,lcd.rotation);}
 assert.equal(lcd.rotation,90);assert.equal(endpointInfo('part:lcd:p17',p.components),null);
 assert.throws(()=>validateProject({...p,wires:[{...p.wires[0],from:'part:lcd:a'}]}));
});
test('version 1 migration preserves attached coordinates and existing button circuits',()=>{
 const p=example('button');p.version=1;for(const c of p.components){c.rotation=c.type==='led'?1:0;delete c.span;if(c.type==='button'){c.attachA=c.attachments.a;c.attachB=c.attachments.b;delete c.attachments;}}
 const q=validateProject(p);assert.equal(q.version,2);assert.equal(q.components[1].rotation,90);assert.equal(q.components[1].span,56);
 assert.deepEqual(q.components[2].attachments,{a:'bb:e:18',b:'bb:f:18'});
 assert.equal(digitalRead('D2',solveCircuit(q,{PA10:{mode:'INPUT_PULLUP'}})),1);
 assert.equal(digitalRead('D2',solveCircuit(q,{PA10:{mode:'INPUT_PULLUP'}},{b1:true})),0);
});
test('pin search normalizes case and whitespace and finds all physical aliases',()=>{
 assert.deepEqual(searchPins('pC 13').map(p=>p.id),['board:CN7:23']);
 assert.equal(searchPins('PA 8').length,2);assert.ok(searchPins('PA 8').every(p=>p.signal==='PA8'));
 assert.equal(searchPins('D13')[0].signal,'PA5');assert.equal(searchPins('CN7 - 23')[0].signal,'PC13');
 assert.equal(searchPins('PC99').length,0);assert.equal(searchPins('   ').length,0);
});
test('all nine new parts have complete mountable footprints, valid examples and persistent settings',()=>{
 assert.equal(Object.keys(PART_DEFS).length,9);
 for(const type of Object.keys(PART_DEFS)){
   const p=componentExample(type),part=p.components[0];assert.deepEqual(validateProject(p),p,type);assert.equal(Object.keys(attachments(part)).length,terminalKeys(part).length,type);
   for(const key of terminalKeys(part)){const e=endpointInfo(`part:demo:${key}`,p.components),h=endpointInfo(attachments(part)[key]);close(e.x,h.x);close(e.y,h.y);}
   assert.ok(compile(p.code));
 }
 assert.throws(()=>validateProject({...componentExample('capacitor'),components:[{...componentExample('capacitor').components[0],value:-1}]}));
 assert.throws(()=>validateProject({...componentExample('temperature'),components:[{...componentExample('temperature').components[0],temperature:150}]}));
});
test('potentiometer changes divider voltage, honors load and remains finite at endpoints',()=>{
 const p=componentExample('potentiometer');close(solveCircuit(p).voltage(boardPin('A0')),1.65);
 p.components[0].position=25;close(solveCircuit(p).voltage(boardPin('A0')),.825);
 p.components.push({id:'load',name:'RL',type:'resistor',x:500,y:500,span:70,rotation:0,value:2500,attachA:boardPin('A0'),attachB:boardPin('GND')});
 close(solveCircuit(p).voltage(boardPin('A0')),3.3*1250/(7500+1250));
 p.components[0].position=0;assert.ok(solveCircuit(p).voltage(boardPin('A0'))<.001);p.components[0].position=100;assert.ok(solveCircuit(p).voltage(boardPin('A0'))>3.299);
});
test('slide switch latches COM between its two throws and can expose a real supply short',()=>{
 const p=componentExample('slide');assert.equal(digitalRead('D2',solveCircuit(p)),0);p.components[0].position=1;assert.equal(digitalRead('D2',solveCircuit(p)),1);
 p.wires.push({id:'short',from:'part:demo:p2',to:boardPin('GND'),color:'#000000'});assert.equal(solveCircuit(p).fault,true);
});
test('RGB channels are independent, common cathode and current limited by external resistors',()=>{
 const p=componentExample('rgb');for(const [pin,channel]of [['PC7','r'],['PB6','g'],['PA7','b']]){
   const r=solveCircuit(p,{[pin]:{mode:'OUTPUT',value:3.3}});assert.equal(r.fault,false);assert.equal(r.parts.demo.channels[channel].on,true);
   assert.ok(r.parts.demo.channels[channel].current<.005);for(const other of ['r','g','b'].filter(c=>c!==channel))assert.equal(r.parts.demo.channels[other].on,false);
 }
});
test('diode conducts forward, blocks reverse, and capacitor charges once per time step then discharges',()=>{
 const p=componentExample('diode'),gpio={PA5:{mode:'OUTPUT',value:3.3}};close(solveCircuit(p,gpio).parts.demo.current,(3.3-.7)/(330+40+1));
 const q=componentExample('diode');[q.wires[0].to,q.wires[2].to]=[q.wires[2].to,q.wires[0].to];assert.equal(solveCircuit(q,gpio).parts.demo.current,0);
 const c=componentExample('capacitor'),sim=new CircuitSimulation();sim.solve(c,gpio,{},0);let r;
 for(let t=20;t<=500;t+=20)r=sim.solve(c,gpio,{},t);assert.ok(r.parts.demo.voltage>3.2&&r.parts.demo.voltage<3.3);
 const before=r.parts.demo.voltage;for(let i=0;i<5;i++)close(sim.solve(c,gpio,{},500).parts.demo.voltage,before);
 gpio.PA5.value=0;for(let t=520;t<=1000;t+=20)r=sim.solve(c,gpio,{},t);assert.ok(r.parts.demo.voltage<.05);assert.ok(r.parts.demo.current<0);
});
test('active buzzer requires positive operating voltage',()=>{
 const p=componentExample('buzzer');assert.equal(solveCircuit(p,{PA5:{mode:'OUTPUT',value:3.3}}).parts.demo.on,true);assert.equal(solveCircuit(p,{PA5:{mode:'OUTPUT',value:0}}).parts.demo.on,false);
 [p.wires[0].to,p.wires[1].to]=[p.wires[1].to,p.wires[0].to];assert.equal(solveCircuit(p,{PA5:{mode:'OUTPUT',value:3.3}}).parts.demo.on,false);
});
test('seven segment exposes eight independently driven segments and internally joined cathodes',()=>{
 const p=componentExample('sevenseg'),gpio={};const runtime=new Runtime(compile(p.code),{});runtime.tick(0);Object.assign(gpio,runtime.gpio);
 const r=solveCircuit(p,gpio);assert.equal(Object.keys(r.parts.demo.channels).length,8);assert.ok(Object.values(r.parts.demo.channels).every(c=>c.on));assert.equal(r.uf.find('part:demo:p3'),r.uf.find('part:demo:p8'));
 gpio.PA10.value=0;assert.equal(solveCircuit(p,gpio).parts.demo.channels.a.on,false);
});
test('TMP36 output follows temperature only with valid power',()=>{
 const p=componentExample('temperature');close(solveCircuit(p).voltage(boardPin('A0')),.75);p.components[0].temperature=-40;close(solveCircuit(p).voltage(boardPin('A0')),.1);p.components[0].temperature=125;close(solveCircuit(p).voltage(boardPin('A0')),1.75);
 p.wires=p.wires.filter(w=>w.to!=='part:demo:p1');assert.equal(solveCircuit(p).parts.demo.powered,false);
});
test('ultrasonic sketch checks power, wiring, trigger width, timeout and consumes one echo per trigger',()=>{
 const p=componentExample('ultrasonic'),events=new UltrasonicSignals(),out=[];let runtime,result;
 const recompute=()=>{result=solveCircuit(p,runtime.gpio);};
 runtime=new Runtime(compile(p.code),{changed:us=>{recompute();events.update(p,result,us);},pulseIn:(pin,state,timeout,us)=>{recompute();return events.pulseIn(p,result,pin,state,timeout,us);},print:v=>out.push(Number(v))});runtime.tick(0);assert.deepEqual(out,[100]);
 assert.equal(events.pulseIn(p,result,'PA9',1,30000,12),0);
 p.components[0].distance=250;runtime.tick(120);assert.equal(out.at(-1),250);
 p.wires=p.wires.filter(w=>w.to!=='part:demo:p1');runtime.tick(240);assert.equal(out.at(-1),0);
 const short=componentExample('ultrasonic');short.code=short.code.replace('delayMicroseconds(10)','delayMicroseconds(9)');let r;const e=new UltrasonicSignals(),values=[];r=new Runtime(compile(short.code),{changed:us=>e.update(short,solveCircuit(short,r.gpio),us),pulseIn:(pin,state,timeout,us)=>e.pulseIn(short,solveCircuit(short,r.gpio),pin,state,timeout,us),print:v=>values.push(v)});r.tick(0);assert.equal(Number(values[0]),0);
 const normal=componentExample('ultrasonic'),gpio={PC7:{mode:'OUTPUT',value:3.3}},signals=new UltrasonicSignals();signals.update(normal,solveCircuit(normal,gpio),0);gpio.PC7.value=0;const solved=solveCircuit(normal,gpio);signals.update(normal,solved,10);assert.equal(signals.pulseIn(normal,solved,'PA8',1,30000,10),0);assert.equal(signals.pulseIn(normal,solved,'PA9',1,5000,10),0);
});
