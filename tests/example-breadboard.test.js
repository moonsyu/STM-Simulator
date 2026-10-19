import test from 'node:test';
import assert from 'node:assert/strict';
import {PART_LIBRARY} from '../src/part-library.js';
import {HAL_EXAMPLES,halExample,applyHalExample} from '../src/hal-examples.js';
import {blankProject,validateProject} from '../src/project.js';
import {fixture} from '../scripts/docs-audit/runtime.mjs';
import {applyDeviceExample} from '../src/device-assistance.js';
import {attachments,terminalKeys} from '../src/components.js';
import {PINS,holeInfo,endpointInfo,boardPin} from '../src/pins.js';
import {wiringTopology} from '../src/circuit-topology.js';
import {exampleBreadboards,exampleBodyBounds,containsPoint,overlapBounds} from '../src/example-breadboard.js';
import {segmentHitsBox} from '../src/example-wire-route.js';
import {wirePoints} from '../src/circuit-edit.js';

export function checkBreadboardLayout(p){
 const parts=p.components.filter(p=>p.type!=='breadboard'),boards=exampleBreadboards(p),contacts=new Set();assert.ok(boards.length);
 for(const part of parts){const body=exampleBodyBounds(part),map=attachments(part),points=terminalKeys(part).map(k=>holeInfo(map[k],p.components,p.surfaces));
  assert.ok(points.every(Boolean),part.type+' every leg mounted');
  assert.ok(boards.some(b=>body.left>=b.bounds.left&&body.right<=b.bounds.right&&body.top>=b.bounds.top&&body.bottom<=b.bounds.bottom&&points.every(h=>b.holes.some(q=>q.id===h.id))),part.type+' same board contains body and all pins');
  for(const h of points){assert.ok(!contacts.has(h.id),part.type+' unique socket');contacts.add(h.id);for(const other of parts)assert.ok(!containsPoint(exampleBodyBounds(other),h,4),part.type+' exposed pin beside '+other.type);}
  for(const other of parts)if(other!==part)assert.ok(!overlapBounds(body,exampleBodyBounds(other),12),part.type+' body separation from '+other.type);
 }
 const sockets=new Set();for(const w of p.wires){assert.ok(!w.from.startsWith('part:')&&!w.to.startsWith('part:'),'jumpers use strips, not component terminals');assert.ok(holeInfo(w.from,p.components,p.surfaces)||holeInfo(w.to,p.components,p.surfaces),'wire touches breadboard');
  for(const id of [w.from,w.to])if(holeInfo(id,p.components,p.surfaces)){assert.ok(!contacts.has(id),'jumper and leg separate');assert.ok(!sockets.has(id),'one jumper per socket');sockets.add(id);}
  const path=wirePoints(p,w);for(let i=1;i<path.length;i++)for(const part of parts){assert.ok(!segmentHitsBox(path[i-1],path[i],exampleBodyBounds(part)),w.id+' clear of '+part.type);for(const id of Object.values(attachments(part))){const h=holeInfo(id,p.components,p.surfaces);assert.ok(!segmentHitsBox(path[i-1],path[i],{left:h.x-3,right:h.x+3,top:h.y-3,bottom:h.y+3}),w.id+' clear of pin '+id);}}
 }
 validateProject(p);
}
function compareNets(a,b){
 const endpoints=[...PINS.map(p=>p.id),...a.components.flatMap(p=>terminalKeys(p).map(k=>`part:${p.id}:${k}`))],before=wiringTopology(a),after=wiringTopology(b);
 for(let i=0;i<endpoints.length;i++)for(let j=i+1;j<endpoints.length;j++)assert.equal(after.find(endpoints[i])===after.find(endpoints[j]),before.find(endpoints[i])===before.find(endpoints[j]),endpoints[i]+' / '+endpoints[j]);
}
test('all HAL library examples mount every device, separate sockets and preserve every electrical net',()=>{
 for(const kind of Object.keys(HAL_EXAMPLES)){const p=applyHalExample(blankProject(),kind);try{checkBreadboardLayout(p);compareNets(halExample(kind),p);}catch(e){throw Error(kind+': '+e.message,{cause:e});}}
});
test('all 114 Docs devices use breadboards and remain identical after reload and reapply',()=>{
 for(const {type}of PART_LIBRARY){const {project,target}=fixture(type),p=applyDeviceExample(project,target).project;try{checkBreadboardLayout(p);assert.deepEqual(applyDeviceExample(validateProject(JSON.parse(JSON.stringify(p))),target).project,p);}catch(e){throw Error(type+': '+e.message,{cause:e});}}
});
test('an occupied power rail is never reassigned to another voltage by Docs',()=>{
 const {project,target}=fixture('potentiometer');project.surfaces.breadboard.hidden=false;project.wires=[{id:'keep5V',from:boardPin('5V'),to:'rail:L:+:25',color:'#abcdef'}];
 const p=applyDeviceExample(project,target).project,uf=wiringTopology(p);assert.notEqual(uf.find(boardPin('5V')),uf.find(boardPin('3V3')));assert.deepEqual(p.wires.find(w=>w.id==='keep5V'),project.wires[0]);
});
test('a missing jumper on an extended LCD strip can be repaired without stacking contacts',()=>{
 const {project,target}=fixture('lcd'),p=applyDeviceExample(project,target).project;
 for(const wire of p.wires){const damaged=structuredClone(p);damaged.wires=damaged.wires.filter(w=>w.id!==wire.id);const fixed=applyDeviceExample(damaged,target).project;compareNets(p,fixed);checkBreadboardLayout(fixed);}
});
test('a moved enlarged MCU leaves room for the automatic breadboard and device',()=>{
 const {project,target}=fixture('potentiometer');project.surfaces.board={hidden:false,x:700,y:68,scale:2};const p=applyDeviceExample(project,target).project;
 assert.ok(exampleBreadboards(p).every(b=>b.bounds.left>1580));checkBreadboardLayout(p);
});
