import test from 'node:test';
import assert from 'node:assert/strict';
import {boxSelection,copySelection,pasteSelection,connectedNet,insertWirePoint,wirePoints,moveSelection} from '../src/circuit-edit.js';
import {circuitDiagnostics} from '../src/circuit-diagnostics.js';
import {validateProject,exampleProject as blankProject} from '../src/project.js';
import {halExample} from '../src/hal-examples.js';
import {boardPin,endpointInfo} from '../src/pins.js';
import {zoomView} from '../src/canvas-view.js';
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

const group=(parts=[],wires=[])=>({type:'group',parts,wires});
const part=(id,x,y)=>({id,name:id,type:'resistor',x,y,span:20,rotation:0});
const rect={minX:-100,minY:-100,maxX:100,maxY:100};
const wire=(id,from,to,points)=>({id,from,to,...(points===undefined?{}:{points})});
const bounds=points=>({minX:Math.min(...points.map(p=>p.x)),minY:Math.min(...points.map(p=>p.y)),maxX:Math.max(...points.map(p=>p.x)),maxY:Math.max(...points.map(p=>p.y))});

test('box selection includes component centers and boundary points in either drag direction',()=>{
  const project={components:[part('inside',0,0),part('boundary',100,-100),part('outside',101,0)],wires:[]};
  const expected=group(['inside','boundary']);
  assert.deepEqual(boxSelection(project,rect),expected);
  assert.deepEqual(boxSelection(project,{minX:100,minY:100,maxX:-100,maxY:-100}),expected);
  assert.deepEqual(boxSelection(project,{minX:-100,minY:100,maxX:100,maxY:-100}),expected);
  assert.deepEqual(boxSelection(project,{minX:0,minY:0,maxX:0,maxY:0}),group(['inside']));
});

test('box selection requires the whole wire route, not just its endpoints or crossing segment',()=>{
  const project={components:[part('left',-50,0),part('right',50,0),part('outside',300,0)],wires:[
    wire('default','part:left:a','part:right:b'),
    wire('direct','part:left:a','part:right:b',[]),
    wire('boundary','part:left:a','part:right:b',[{x:-100,y:100},{x:100,y:100}]),
    wire('outside-bend','part:left:a','part:right:b',[{x:0,y:101}]),
    wire('crossing','part:left:a','part:outside:b'),
    wire('outside-only','part:outside:a','part:outside:b')
  ]};
  assert.deepEqual(boxSelection(project,rect),group(['left','right'],['default','direct','boundary']));
});

test('box selection rejects unknown endpoints, malformed routes, and non-finite coordinates',()=>{
  const project={components:[part('valid',0,0),part('nan',NaN,0),part('infinite',0,Infinity),part('string','0',0)],wires:[
    wire('missing','part:missing:a','part:valid:b'),wire('missing-key','part:valid:p99','part:valid:b'),
    wire('missing-both','not-a-pin','another-missing-pin'),wire('nan-terminal','part:nan:a','part:valid:b'),
    wire('nan-route','part:valid:a','part:valid:b',[{x:NaN,y:0}]),
    wire('infinite-route','part:valid:a','part:valid:b',[{x:0,y:Infinity}]),
    wire('string-route','part:valid:a','part:valid:b',[{x:'0',y:0}]),
    wire('null-route-point','part:valid:a','part:valid:b',[null]),
    wire('object-route','part:valid:a','part:valid:b',{}),wire('null-route','part:valid:a','part:valid:b',null),null
  ]};
  assert.deepEqual(boxSelection(project,rect),group(['valid']));
  for(const invalid of [undefined,null,{}, {...rect,minX:NaN},{...rect,maxY:Infinity},{...rect,minY:'-100'}])assert.deepEqual(boxSelection(project,invalid),group());
  assert.deepEqual(boxSelection({components:[],wires:[]},rect),group());
  assert.deepEqual(boxSelection(null,rect),group());
});

test('box selection supports negative and distant coordinates without mutating project or bounds',()=>{
  const project={components:[part('distant',-250000,900000),part('origin',0,0)],wires:[wire('distant-wire','part:distant:a','part:distant:b')]};
  const area={minX:-250020,minY:899980,maxX:-249980,maxY:900020},before=structuredClone(project),beforeArea={...area};
  assert.deepEqual(boxSelection(project,area),group(['distant'],['distant-wire']));
  assert.deepEqual(project,before);assert.deepEqual(area,beforeArea);
});

test('box selection uses mounted terminals and transformed breadboard holes',()=>{
  const board={id:'bb2',name:'BB2',type:'breadboard',x:-1000,y:15000,rotation:45,scaleX:1.5,scaleY:.7};
  const mounted={...part('mounted',-1000,15000),attachA:'breadboard:bb2:bb:a:1',attachB:'breadboard:bb2:bb:c:1'};
  const project={components:[board,mounted],wires:[wire('mounted-wire','part:mounted:a','breadboard:bb2:bb:d:1',[])]};
  const route=wirePoints(project,project.wires[0]),area=bounds(route),before=structuredClone(project);
  assert.equal(route[0].x,endpointInfo(mounted.attachA,project.components).x);
  assert.deepEqual(boxSelection(project,area),group([],['mounted-wire']));
  assert.deepEqual(boxSelection(project,bounds([...route,board,mounted])),group(['bb2','mounted'],['mounted-wire']));
  assert.deepEqual(project,before);
});

test('box selection excludes hidden board and default breadboard endpoints',()=>{
  const project={components:[],wires:[wire('board-wire','board:CN5:6','board:CN5:7'),wire('breadboard-wire','bb:a:1','bb:b:1')],surfaces:{board:{hidden:true},breadboard:{hidden:true}}};
  assert.deepEqual(boxSelection(project,{minX:-10000,minY:-10000,maxX:10000,maxY:10000}),group());
});

test('anchored zoom preserves cursor location and existing aspect ratio without mutating inputs',()=>{
  const view={x:-123.5,y:4000,w:1120,h:500},anchor={x:45,y:4200},before={...view},beforeAnchor={...anchor};
  for(const mult of [.5,1.08,4]){
    const next=zoomView(view,mult,anchor);
    assert.ok(Math.abs((anchor.x-next.x)/next.w-(anchor.x-view.x)/view.w)<1e-12);
    assert.ok(Math.abs((anchor.y-next.y)/next.h-(anchor.y-view.y)/view.h)<1e-12);
    assert.ok(Math.abs(next.h/next.w-view.h/view.w)<1e-12);
  }
  assert.deepEqual(view,before);assert.deepEqual(anchor,beforeAnchor);
});

test('toolbar zoom keeps the center fixed, respects minimum width, and remains unbounded',()=>{
  const view={x:-8000,y:16000,w:12000,h:6000};
  const out=zoomView(view,2);assert.deepEqual(out,{x:-14000,y:13000,w:24000,h:12000});
  const inward=zoomView(out,.5);assert.deepEqual(inward,view);
  const minimum=zoomView(view,.0001);assert.equal(minimum.w,100);assert.equal(minimum.h,50);
  assert.equal(minimum.x+minimum.w/2,view.x+view.w/2);assert.equal(minimum.y+minimum.h/2,view.y+view.h/2);
});

test('zoom rejects invalid dimensions, multipliers, anchors and overflowing coordinates',()=>{
  const view={x:20,y:30,w:1120,h:730};
  for(const mult of [0,-1,NaN,Infinity,'2'])assert.deepEqual(zoomView(view,mult),view);
  for(const invalid of [{...view,w:0},{...view,h:-1},{...view,x:NaN},{...view,y:Infinity}])assert.deepEqual(zoomView(invalid,.5),invalid);
  for(const anchor of [{x:NaN,y:0},{x:0,y:Infinity},{x:'20',y:30}])assert.deepEqual(zoomView(view,.5,anchor),view);
  const extreme={x:Number.MAX_VALUE,y:0,w:Number.MAX_VALUE,h:100};assert.deepEqual(zoomView(extreme,2),extreme);
  assert.deepEqual(zoomView(view,3,{x:-Number.MAX_VALUE,y:0}),view);
});
