import test from 'node:test';
import assert from 'node:assert/strict';
import {blankProject,validateProject,projectForBoard,hasBoardChanges} from '../src/project.js';
import {BOARD_CATALOG,DEFAULT_BOARD_ID,searchBoards} from '../src/boards.js';
import {BB,HOLES,boardPin,breadboardPrefix,breadboardHoles,circuitHoles,endpointInfo} from '../src/pins.js';
import {attachments,terminalKeys} from '../src/components.js';
import {findMount,applyMount,occupiedHoles} from '../src/placement.js';
import {moveBreadboard,removeBreadboard} from '../src/breadboards.js';
import {solveCircuit,topology} from '../src/engine.js';
const board=(id='bb1',x=1200,y=360,rotation=0)=>({id,type:'breadboard',name:id,x,y,rotation});
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
function circuit(){
 const p=blankProject(),bb=board(),h=breadboardPrefix(bb.id);p.components.push(bb);
 const a=endpointInfo(h+'bb:e:8',p.components),b=endpointInfo(h+'bb:f:8',p.components);
 p.components.push({id:'r1',type:'resistor',name:'R1',value:330,x:(a.x+b.x)/2,y:a.y,rotation:0,span:42,attachA:a.id,attachB:b.id});
 p.wires=[{id:'v',from:boardPin('3V3'),to:h+'bb:a:8',color:'#dd654c'},{id:'g',from:boardPin('GND'),to:h+'bb:j:8',color:'#4e647b'}];return p;
}
test('board search supports the current board only and persists its identity',()=>{
 assert.equal(BOARD_CATALOG.length,1);for(const q of ['', '  ', 'nucleo', ' stm32 f446re ', 'F4','Cortex-M4'])assert.equal(searchBoards(q)[0].id,DEFAULT_BOARD_ID);
 assert.deepEqual(searchBoards('unknown'),[]);const p=projectForBoard();assert.deepEqual(validateProject(JSON.parse(JSON.stringify(p))),p);
 assert.throws(()=>projectForBoard('other'));assert.throws(()=>validateProject({...p,boardId:'other'}));
});
test('board reset checks actual defaults including saved content, configuration and source files',()=>{
 assert.equal(hasBoardChanges(blankProject()),false);assert.equal(hasBoardChanges(projectForBoard()),false);
 const normalized={...projectForBoard(),simulation:{pwmWaveform:false,stepMs:1}};assert.equal(hasBoardChanges(normalized),false);
 for(const edit of [p=>p.name='saved work',p=>p.code+='\n',p=>p.components.push(board()),p=>p.mcu.pins.PA5={function:'GPIO_Output',pull:'NOPULL',edge:'FALLING',initial:0,label:''},p=>p.simulation={stepMs:.1,pwmWaveform:true},p=>p.firmware.files.push({name:'helper.c',text:'int x;'}),p=>p.firmware.mode='sketch']){
  const p=blankProject();edit(p);assert.equal(hasBoardChanges(p),true);
 }
});
test('each additional breadboard has 400 isolated holes even when physically overlapping',()=>{
 const a=board('a',BB.x+BB.w/2,BB.y+BB.h/2),b=board('b',a.x,a.y),p={...blankProject(),components:[a,b]},holes=circuitHoles(p.components),uf=topology(p);
 assert.equal(holes.length,1200);assert.equal(new Set(holes.map(h=>h.id)).size,1200);assert.equal(terminalKeys(a).length,0);
 const pref=breadboardPrefix(a.id);assert.equal(uf.find(pref+'bb:a:1'),uf.find(pref+'bb:e:1'));assert.notEqual(uf.find(pref+'bb:e:1'),uf.find(pref+'bb:f:1'));
 assert.equal(uf.find(pref+'rail:L:+:1'),uf.find(pref+'rail:L:+:25'));assert.notEqual(uf.find(pref+'rail:L:+:1'),uf.find(pref+'rail:L:-:1'));
 assert.notEqual(uf.find(pref+'bb:a:1'),uf.find('bb:a:1'));assert.notEqual(uf.find(pref+'bb:a:1'),uf.find(breadboardPrefix(b.id)+'bb:a:1'));
 const h=breadboardHoles(a)[0];near(h.x,HOLES[0].x);near(h.y,HOLES[0].y);
});
test('wires and mounted components on added breadboards use real row connectivity',()=>{
 const p=circuit(),result=solveCircuit(p),h=breadboardPrefix('bb1');assert.equal(result.fault,false);near(result.parts.r1.current,.01);
 near(result.voltage(h+'bb:b:8'),3.3);near(result.voltage(h+'bb:h:8'),0);assert.equal(result.voltage('bb:b:8'),null);
 assert.deepEqual(validateProject(JSON.parse(JSON.stringify(p))),p);
});
test('added breadboard mounting uses its transformed hole geometry and occupancy',()=>{
 const bb=board('b',1500,600,90),h=breadboardHoles(bb),a=h.find(h=>h.id.endsWith('bb:e:10')),b=h.find(h=>h.id.endsWith('bb:f:10'));
 const part={id:'r',type:'resistor',name:'R',value:330,x:(a.x+b.x)/2,y:(a.y+b.y)/2,rotation:90,span:42};
 const parts=[bb,part];assert.equal(applyMount(part,findMount(part,parts)),true);assert.deepEqual(Object.values(attachments(part)).sort(),[a.id,b.id].sort());assert.equal(occupiedHoles(parts).size,2);
 assert.equal(findMount(bb,parts),null);assert.equal(findMount({...part,id:'other'},parts,1),null);
 for(const key of terminalKeys(part)){const e=endpointInfo(`part:r:${key}`,parts),anchor=endpointInfo(attachments(part)[key],parts);near(e.x,anchor.x);near(e.y,anchor.y);}
});
test('moving and rotating a breadboard preserves mounted parts, wires and electrical state',()=>{
 const p=circuit(),wires=structuredClone(p.wires);moveBreadboard(p,'bb1',{x:1800,y:900,rotation:90});
 assert.deepEqual(p.wires,wires);assert.equal(p.components[1].rotation,90);near(solveCircuit(p).parts.r1.current,.01);
 for(const key of ['a','b']){const e=endpointInfo('part:r1:'+key,p.components),a=endpointInfo(attachments(p.components[1])[key],p.components);near(e.x,a.x);near(e.y,a.y);}
 assert.deepEqual(validateProject(JSON.parse(JSON.stringify(p))),p);
});
test('removing added breadboards unplugs their contacts and wires while preserving other components',()=>{
 const p=circuit();p.components.push(board('keep',1800,360));const h=breadboardPrefix('keep');p.wires.push({id:'keep',from:boardPin('3V3'),to:h+'rail:L:+:1',color:'#dd654c'});
 removeBreadboard(p,'bb1');assert.equal(p.components.length,2);assert.equal(p.components[0].id,'r1');assert.deepEqual(attachments(p.components[0]),{});assert.deepEqual(p.wires.map(w=>w.id),['keep']);assert.deepEqual(validateProject(p),p);
 near(solveCircuit(p).voltage(h+'rail:L:+:25'),3.3);
});
test('moving a board releases only its anchors for a component spanning other supports',()=>{
 const p=circuit();p.components[1].attachB='bb:f:8';moveBreadboard(p,'bb1',{x:1600,y:600});assert.deepEqual(attachments(p.components[1]),{b:'bb:f:8'});assert.doesNotThrow(()=>validateProject(p));
});
test('invalid board hole references, unsupported boards and excessive breadboards are rejected',()=>{
 const p=circuit();for(const bad of ['breadboard:missing:bb:a:1','breadboard:bb1:bb:k:1','breadboard:bb1:rail:L:+:26','breadboard:r1:bb:a:1'])assert.throws(()=>validateProject({...p,wires:[{...p.wires[0],to:bad}]}));
 assert.throws(()=>validateProject({...p,components:Array.from({length:9},(_,i)=>board('b'+i))}));
 assert.throws(()=>validateProject({...p,components:p.components.map(c=>c.type==='breadboard'?{...c,attachments:{a:'bb:a:1'}}:c)}));
});
