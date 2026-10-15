import test from 'node:test';
import assert from 'node:assert/strict';
import {blankProject,validateProject} from '../src/project.js';
import {resizeObject,resizeFrame,resizeFromHandle} from '../src/resize.js';
import {BOARD,BB,scaleXOf,scaleYOf,matrixOf,vector,inverse,multiply} from '../src/geometry.js';
import {PART_LIBRARY} from '../src/part-library.js';
import {PART_DEFS,nominalTerminals} from '../src/components.js';
import {endpointInfo,breadboardHoles} from '../src/pins.js';
import {renderParts} from '../src/render.js';
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
const same=(a,b)=>{close(a.x,b.x);close(a.y,b.y);};
const bounds={x:-30,y:-20,width:60,height:40};
const part=rotation=>({id:'r',type:'resistor',name:'R',value:330,x:800,y:650,rotation,span:70});
test('all eight handles keep their opposite edge or corner fixed at every 45 degree rotation',()=>{
 for(const rotation of [0,45,90,135,180,225,270,315])for(const handle of ['n','ne','e','se','s','sw','w','nw']){
  const project=blankProject();project.components=[part(rotation)];const target={type:'part',id:'r'},before=resizeFrame(project,target,bounds);
  const anchor={x:handle.includes('w')?30:handle.includes('e')?-30:0,y:handle.includes('n')?20:handle.includes('s')?-20:0};
  const delta=vector(before.matrix,{x:handle.includes('w')?-17.3:17.3,y:handle.includes('n')?-9.1:9.1});
  const next=resizeFromHandle(project,target,bounds,handle,{x:0,y:0},delta),after=resizeFrame(next,target,bounds);
  same(before.point(anchor.x,anchor.y),after.point(anchor.x,anchor.y));assert.equal(project.components[0].scale,undefined);
  if(handle==='e'||handle==='w')close(scaleYOf(next.components[0]),1);
  if(handle==='n'||handle==='s')close(scaleXOf(next.components[0]),1);
 }
});
test('board left and top resizing changes its origin while preserving opposite pins and project round trips',()=>{
 const project=blankProject(),target={type:'surface',id:'board'},b={x:BOARD.x,y:BOARD.y,width:BOARD.w,height:BOARD.h};
 const next=resizeFromHandle(project,target,b,'nw',{x:0,y:0},{x:20,y:13.7});
 const before=resizeFrame(project,target,b),after=resizeFrame(next,target,b);same(before.point(b.x+b.width,b.y+b.height),after.point(b.x+b.width,b.y+b.height));
 close(next.surfaces.board.x,BOARD.x+20);close(next.surfaces.board.y,BOARD.y+13.7);assert.deepEqual(validateProject(next).surfaces,next.surfaces);
});
test('continuous sizing exceeds the old 400 percent ceiling and Shift retains aspect ratio',()=>{
 const project=blankProject();project.components=[part(0)];const target={type:'part',id:'r'};
 let next=resizeFromHandle(project,target,bounds,'se',{x:0,y:0},{x:253.5,y:17});assert.ok(scaleXOf(next.components[0])>4);close(scaleYOf(next.components[0]),1.425);
 next=resizeFromHandle(project,target,bounds,'se',{x:0,y:0},{x:17.3,y:9.1},true);close(scaleXOf(next.components[0]),scaleYOf(next.components[0]));
});
test('all 113 menu devices preserve terminals, transforms and saved dimensions under independent resizing',()=>{
 assert.equal(PART_LIBRARY.length,113);
 for(const item of PART_LIBRARY){
  const p={...part(45),id:'device',type:item.type,name:item.name,...PART_DEFS[item.type]?.defaults,...(item.type==='led'?{color:'red'}:{})};
  const project=blankProject();project.components=[p];const old=nominalTerminals(p),oldMatrix=matrixOf(p);resizeObject(project,{type:'part',id:p.id},{scaleX:2.317,scaleY:.637});
  const transform=multiply(matrixOf(p),inverse(oldMatrix));nominalTerminals(p).forEach((t,i)=>same({x:t.x-p.x,y:t.y-p.y},vector(transform,{x:old[i].x-p.x,y:old[i].y-p.y})));
  const saved=validateProject(JSON.parse(JSON.stringify(project))).components[0];close(scaleXOf(saved),2.317);close(scaleYOf(saved),.637);
  if(item.type!=='breadboard')assert.match(renderParts(project,null,null,{}),/scale\(2.317 0.637\)/);
 }
});
test('nonuniform scaling of a rotated breadboard carries diagonal mounted footprints exactly',()=>{
 const project=blankProject(),board={id:'bb',type:'breadboard',name:'BB',x:1500,y:1000,rotation:45};project.components=[board];
 const holes=breadboardHoles(board),a=holes.find(h=>h.id.endsWith('bb:a:10')),b=holes.find(h=>h.id.endsWith('bb:c:12'));
 const r={...part(0),id:'r',x:(a.x+b.x)/2,y:(a.y+b.y)/2,rotation:Math.atan2(b.y-a.y,b.x-a.x)*180/Math.PI,span:Math.hypot(b.x-a.x,b.y-a.y),attachA:a.id,attachB:b.id};project.components.push(r);
 resizeObject(project,{type:'part',id:'bb'},{scaleX:1.73,scaleY:.81,x:1522,y:1024});
 nominalTerminals(r).forEach((t,i)=>same(t,endpointInfo([a.id,b.id][i],project.components)));
 const saved=validateProject(JSON.parse(JSON.stringify(project)));nominalTerminals(saved.components[1]).forEach((t,i)=>same(t,endpointInfo([a.id,b.id][i],saved.components)));
});
test('invalid dimensions and malformed persisted transforms do not partially modify circuits',()=>{
 const project=blankProject();project.components=[part(0)];const before=JSON.stringify(project);
 for(const size of [{scaleX:NaN},{scaleY:-1},{scaleX:2,x:Infinity}])assert.throws(()=>resizeObject(project,{type:'part',id:'r'},size));assert.equal(JSON.stringify(project),before);
 for(const fields of [{scaleX:'2'},{scaleY:Infinity},{skewX:90}])assert.throws(()=>validateProject({...project,components:[{...part(0),...fields}]}));
 assert.throws(()=>validateProject({...project,surfaces:{board:{x:'20'}}}));
});
