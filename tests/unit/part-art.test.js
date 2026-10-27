// Catalog parts drawn from their photos at real size.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DEVICE_CATALOG} from '../../src/device-catalog-data.js';
import {catalogType,CATALOG_DEFS} from '../../src/catalog-defs.js';
import {PART_IMAGES} from '../../src/part-images.js';
import {ON_CONTACT_PINS} from '../../src/catalog-defs.js';
import {hasPartArt,hasArtPads,photoRect,artPadPosition,partArtShape} from '../../src/part-art.js';
import {displayModel} from '../../src/model-geometry.js';
import {catalogShape} from '../../src/catalog-render.js';

const parts=DEVICE_CATALOG.filter(v=>!['board','breadboard'].includes(v.family));

test('every catalog part has a top-view photo (WebP)',()=>{
 for(const v of parts){
  const img=PART_IMAGES[v.id];assert.ok(img,v.id);assert.ok(hasPartArt(catalogType(v.id)),v.id);
  assert.ok(img.w>0&&img.h>0&&img.w<=512&&img.h<=512,v.id);
  assert.equal(Buffer.from(img.webp,'base64').toString('ascii',8,12),'WEBP',v.id);
 }
});

test('the photo keeps its proportions and fits inside the datasheet outline',()=>{
 for(const v of parts){
  const type=catalogType(v.id),m=displayModel({type,x:0,y:0,rotation:0}),r=photoRect(type,m),b=m.bounds,img=PART_IMAGES[v.id];
  assert.ok(Math.abs(r.w/r.h-img.w/img.h)<1e-6,v.id);
  assert.ok(r.x>=b.left-1e-6&&r.y>=b.top-1e-6&&r.x+r.w<=b.right+1e-6&&r.y+r.h<=b.bottom+1e-6,v.id);
  // It touches the outline on at least one axis (fitted, not shrunk).
  assert.ok(Math.abs(r.w-(b.right-b.left))<1e-6||Math.abs(r.h-(b.bottom-b.top))<1e-6,v.id);
 }
});

test('pads stay on the 2.54 mm pin grid of the part',()=>{
 for(const v of parts){
  const type=catalogType(v.id),terms=CATALOG_DEFS[type].terminals,b=displayModel({type,x:0,y:0,rotation:0}).bounds;
  if(hasArtPads(type))continue;
  terms.forEach(([x,y],i)=>{const pad=artPadPosition(type,i);if(!pad.outside)return;
   // A pad sits straight in line with its pin (same x for a header along an edge, same y on a side), except where
   // the pin row is wider than the package (SOT-23, 1.27 mm pitch ICs): those pads spread along its edge in order.
   const row=terms.filter(t=>t[1]===y),beyond=row.some(t=>t[0]<b.left+3.5||t[0]>b.right-3.5);
   assert.ok(Math.abs(pad.x-x)<1e-6||Math.abs(pad.y-y)<1e-6||beyond,`${v.id} pin ${i+1}`);});
 }
});

test('the shape is the photo plus its run-time overlays, drawn in real coordinates',()=>{
 const led=catalogShape({id:'d',type:catalogType('led-tht-2'),x:0,y:0,rotation:0},null);
 assert.match(led,/<image class="part-photo" data-part-image="led-tht-2"/);assert.match(led,/class="catalog-light" data-art=""/);assert.match(led,/class="led-glow"/);
 const seg=partArtShape({id:'s',type:catalogType('sevenseg-4digit-12'),x:0,y:0,rotation:0},null);
 assert.equal((seg.match(/data-segment=/g)||[]).length,32,'4 digits × 8 segments');
 const oled=partArtShape({id:'o',type:catalogType('oled-i2c-4'),x:0,y:0,rotation:0},null);assert.match(oled,/class="device-screen" width="128" height="64"/);
 const slide=partArtShape({id:'w',type:catalogType('slide-dp3t-8'),x:0,y:0,rotation:0,position:2},null);assert.match(slide,/class="catalog-slide-thumb" data-start="0"/);
});

test('an LED shows the photo of the colour chosen in its properties',()=>{
 for(const type of [catalogType('led-tht-2'),'led'])for(const color of ['red','green','blue','yellow']){
  const shape=type==='led'?catalogShape({id:'l',type:catalogType('led-tht-2'),x:0,y:0,rotation:0,color},null,false):catalogShape({id:'l',type,x:0,y:0,rotation:0,color},null);
  assert.match(shape,new RegExp(`data-part-image="led-tht-2${color==='red'?'':':'+color}"`),`${type} ${color}`);
 }
 for(const color of ['green','blue','yellow'])assert.ok(PART_IMAGES['led-tht-2:'+color],color);
});

test('two-lead parts stand on short legs: an LED takes three holes, a resistor four',async()=>{
 const {fixedLeadSpan}=await import('../../src/components.js');
 assert.equal(fixedLeadSpan({type:'led'}),28);assert.equal(fixedLeadSpan({type:catalogType('led-tht-2')}),28);
 assert.equal(fixedLeadSpan({type:'resistor'}),42);assert.equal(fixedLeadSpan({type:catalogType('capacitor-ceramic-2')}),28);
 assert.equal(fixedLeadSpan({type:'dc_supply'}),null,'a battery holder keeps its spacing');assert.equal(fixedLeadSpan({type:'dc_motor'}),56,'a DC motor on its two end tabs');
 const {applyHalExample}=await import('../../src/hal-examples.js'),{blankProject}=await import('../../src/project.js');
 const led=applyHalExample(blankProject(),'blink').components.find(p=>p.type==='led');
 if(led)assert.equal(led.span,28,'example layouts use the same spacing');
});

test('leads of modules start at the contacts printed in their photos, in order, without crossing',()=>{
 const type=catalogType('l298n-module-13'),m=displayModel({type,x:0,y:0,rotation:0}),R=photoRect(type,m),pads=CATALOG_DEFS[type].terminals.map((_,i)=>artPadPosition(type,i,m));
 const u=i=>(pads[i].x-R.x)/R.w,v=i=>(pads[i].y-R.y)/R.h;
 // The L298N module's pins stand under the board at its contacts: VM/GND/5V on the front screw terminal, ENA…ENB on
 // the six-pin header, OUT1/2 left and OUT3/4 right.
 // Every module on its own contacts has each pin within half a pitch-and-a-bit of the contact measured on its photo.
 for(const [id,pins] of Object.entries(ON_CONTACT_PINS)){
  const t=catalogType(id),mm=displayModel({type:t,x:0,y:0,rotation:0}),bb=mm.bounds;
  pins.forEach(([x,y],i)=>{const pad=artPadPosition(t,i,mm),inside=x>bb.left&&x<bb.right&&y>bb.top&&y<bb.bottom;
   if(inside)assert.ok(Math.hypot(pad.x-x,pad.y-y)<=18,`${id} pin ${i+1}: ${Math.hypot(pad.x-x,pad.y-y).toFixed(1)} from its contact`);});
  assert.ok(pins.every(([x,y])=>pins.every(([x2,y2])=>Number.isInteger((x-x2)/14)&&Number.isInteger((y-y2)/14))),`${id} pins on one 2.54 mm grid`);
 }
 assert.ok([0,1,2].every(i=>v(i)>.85&&u(i)<.45)&&[3,4,5,6,7,8].every(i=>v(i)>.85&&u(i)>.5));
 assert.ok(u(9)<.1&&u(10)<.1&&u(11)>.9&&u(12)>.9&&v(9)<v(10)&&v(11)<v(12));
 for(const id of ['l298n-module-13','relay-module-6','matrix-10','isolated-rs485','oled-configurable-8','urm09-trig-3']){
  const t=catalogType(id),mm=displayModel({type:t,x:0,y:0,rotation:0}),terms=CATALOG_DEFS[t].terminals,ps=terms.map((_,i)=>artPadPosition(t,i,mm));
  const cross=(a,b,c,d)=>{const s=(p,q,r)=>Math.sign((q.x-p.x)*(r.y-p.y)-(q.y-p.y)*(r.x-p.x));return s(a,b,c)*s(a,b,d)<0&&s(c,d,a)*s(c,d,b)<0;};
  for(let i=0;i<terms.length;i++)for(let j=i+1;j<terms.length;j++)
   assert.ok(!cross(ps[i],{x:terms[i][0],y:terms[i][1]},ps[j],{x:terms[j][0],y:terms[j][1]}),`${id}: leads ${i+1} and ${j+1} cross`);
 }
});
