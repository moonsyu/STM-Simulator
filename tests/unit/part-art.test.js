// Catalog parts drawn from their photos at real size.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DEVICE_CATALOG} from '../../src/device-catalog-data.js';
import {catalogType,CATALOG_DEFS} from '../../src/catalog-defs.js';
import {PART_IMAGES} from '../../src/part-images.js';
import {hasPartArt,photoRect,artPadPosition,partArtShape} from '../../src/part-art.js';
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
  terms.forEach(([x,y],i)=>{const pad=artPadPosition(type,i);if(!pad.outside)return;
   // A pad sits straight in line with its pin (same x for a header along an edge, same y on a side), except where
   // the pin lies beyond the end of a package smaller than its pin row (SOT-23).
   const beyond=x<b.left+3.5||x>b.right-3.5;
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
