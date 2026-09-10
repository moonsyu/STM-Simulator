import test from 'node:test';
import assert from 'node:assert/strict';
import {copySelection,pasteSelection,connectedNet,insertWirePoint,wirePoints,moveSelection} from '../src/circuit-edit.js';
import {circuitDiagnostics} from '../src/circuit-diagnostics.js';
import {validateProject,blankProject} from '../src/project.js';
import {halExample} from '../src/hal-examples.js';
import {boardPin} from '../src/pins.js';
import {attachments} from '../src/components.js';
import {solveCircuit} from '../src/engine.js';
test('editable wire points round trip without changing electrical topology; invalid positions fail',()=>{
  const p=halExample('blink'),w=p.wires[0],before=wirePoints(p,w);insertWirePoint(p,w,{x:500,y:300});assert.equal(w.points.length,3);const q=validateProject(p);assert.deepEqual(q.wires[0].points,w.points);assert.equal(connectedNet(p,w.from).endpoints.length,connectedNet(q,w.from).endpoints.length);assert.deepEqual(wirePoints(p,w)[0],before[0]);p.wires[0].points[0].x=NaN;assert.throws(()=>validateProject(p),/꺾임점/);
});
test('a complete electrical net includes GPIO aliases, breadboard rows and mounted legs but stops at resistor',()=>{
  const p=halExample('blink'),net=connectedNet(p,boardPin('PA5'));assert.ok(net.wires.length);assert.ok(net.endpoints.some(e=>e.id==='part:r1:a'));assert.ok(!net.endpoints.some(e=>e.id==='part:r1:b'));
});
test('copy/paste remaps internal wires, detaches original mounts and never reconnects cloned parts to the board',()=>{
  const p=halExample('blink'),selection={type:'group',parts:p.components.map(p=>p.id),wires:[]},clip=copySelection(p,selection);let n=0;const next=pasteSelection(p,clip,prefix=>prefix+'copy'+(++n));assert.equal(next.parts.length,2);for(const id of next.parts)assert.deepEqual(attachments(p.components.find(p=>p.id===id)),{});assert.doesNotThrow(()=>validateProject(p));
  const pair=blankProject();pair.components=[{id:'a',type:'resistor',name:'R1',x:700,y:200,rotation:0,span:70,value:330},{id:'b',type:'led',name:'LED1',x:800,y:200,rotation:0,span:70,color:'red'}];pair.wires=[{id:'wire',from:'part:a:b',to:'part:b:a',color:'#23a68a',points:[{x:750,y:230}]}];const copied=copySelection(pair,{type:'group',parts:['a','b'],wires:[]});assert.equal(copied.wires.length,1);const pasted=pasteSelection(pair,copied,prefix=>prefix+'clone'+(++n));assert.ok(pair.wires[1].from.startsWith('part:'+pasted.parts[0]+':'));moveSelection(pair,pasted,20,30);assert.equal(pair.wires[1].points[0].x,798);assert.doesNotThrow(()=>validateProject(pair));
});
test('diagnostics identify the exact short net, missing module pins, duplicate addresses and current warnings',()=>{
  const p=blankProject();p.wires=[{id:'short',from:boardPin('3V3'),to:boardPin('GND'),color:'#dd654c'}];let issues=circuitDiagnostics(p,solveCircuit(p));assert.equal(issues.length,1);assert.match(issues[0].message,/직접 연결/);assert.ok(connectedNet(p,issues[0].target.id).wires.some(w=>w.id==='short'));
  const sensor=halExample('sht31');sensor.wires=sensor.wires.filter(w=>w.to!=='part:demo:p2');issues=circuitDiagnostics(sensor);assert.ok(issues.some(i=>i.target?.id==='part:demo:p2'&&i.message.includes('GND')));
  const duplicate=halExample('sht31'),other={...structuredClone(duplicate.components[0]),id:'second',name:'SHT2',x:600};duplicate.components.push(other);for(const i of [1,2,3,4])duplicate.wires.push({id:'other'+i,from:`part:demo:p${i}`,to:`part:second:p${i}`,color:'#23a68a'});issues=circuitDiagnostics(duplicate);assert.ok(issues.some(i=>i.message.includes('0x44')&&i.target.id==='second'));
  const led=halExample('blink');led.components.find(p=>p.id==='r1').value=1;issues=circuitDiagnostics(led,solveCircuit(led,{PA5:{mode:'OUTPUT',value:3.3}}));assert.ok(issues.some(i=>i.target?.id==='led1'));
});
test('copying mounted parts preserves their breadboard connection without retaining the source rail',()=>{
  const p=halExample('blink'),clip=copySelection(p,{type:'group',parts:['r1','led1'],wires:[]});let n=0;
  assert.ok(clip.wires.some(w=>w.from==='part:r1:b'&&w.to==='part:led1:a'));
  const selection=pasteSelection(p,clip,prefix=>prefix+'new'+(++n)),net=connectedNet(p,`part:${selection.parts[0]}:b`);
  assert.ok(net.endpoints.some(p=>p.id===`part:${selection.parts[1]}:a`));assert.ok(!net.endpoints.some(p=>p.id==='part:r1:b'));
});
test('copying a breadboard remaps its mounted contacts and wires and leaves the original untouched',()=>{
  const p=blankProject();p.components=[{id:'bb1',type:'breadboard',name:'BB1',x:1400,y:400,rotation:0},{id:'r1',type:'resistor',name:'R1',x:1400,y:400,rotation:0,span:42,value:330,attachA:'breadboard:bb1:bb:e:8',attachB:'breadboard:bb1:bb:f:8'}];
  p.wires=[{id:'inner',from:'breadboard:bb1:bb:a:8',to:'breadboard:bb1:bb:a:10',color:'#23a68a'}];const clip=copySelection(p,{type:'part',id:'bb1'});let n=0;const next=pasteSelection(p,clip,prefix=>prefix+'copy'+(++n));
  assert.equal(next.parts.length,2);const board=p.components.find(p=>p.id===next.parts[0]),part=p.components.find(p=>p.id===next.parts[1]);assert.equal(part.attachA,`breadboard:${board.id}:bb:e:8`);assert.equal(p.components[1].attachA,'breadboard:bb1:bb:e:8');assert.doesNotThrow(()=>validateProject(p));
});
test('current diagnostics use component IDs even when two parts have the same name',()=>{
  const p=halExample('blink');p.components.unshift({id:'other-led',type:'led',name:'LED1',x:600,y:600,rotation:0,span:42,color:'red'});p.components.find(p=>p.id==='r1').value=1;
  const issues=circuitDiagnostics(p,solveCircuit(p,{PA5:{mode:'OUTPUT',value:3.3}}));assert.ok(issues.some(i=>i.message.includes('LED 전류')&&i.target?.id==='led1'));assert.ok(!issues.some(i=>i.message.includes('LED 전류')&&i.target?.id==='other-led'));
});
