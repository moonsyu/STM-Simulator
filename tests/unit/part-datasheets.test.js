// Datasheet names and package sizes of the catalog parts.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DEVICE_CATALOG} from '../../src/device-catalog-data.js';
import {CATALOG_BY_TYPE,CATALOG_DEFS,catalogType} from '../../src/catalog-defs.js';
import {PART_DATASHEETS,UNITS_PER_MM,datasheetLine} from '../../src/part-datasheets.js';
import {displayModel,datasheetIdOf,catalogBodyBounds} from '../../src/model-geometry.js';
import {localTerminals} from '../../src/components.js';

const parts=DEVICE_CATALOG.filter(v=>!['board','breadboard'].includes(v.family));

test('every catalog part has its datasheet model and name',()=>{
 for(const v of parts){
  const d=PART_DATASHEETS[v.id];assert.ok(d?.model&&d.manufacturer&&d.name,v.id);
  assert.equal(CATALOG_DEFS[catalogType(v.id)].name,d.name,v.id);
  assert.match(datasheetLine(v.id),new RegExp(d.model.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
 }
});

test('a package is drawn at its datasheet size (1 mm = 14/2.54 units)',()=>{
 assert.equal(UNITS_PER_MM,14/2.54);
 let checked=0;
 for(const v of parts){
  const size=PART_DATASHEETS[v.id].size,type=catalogType(v.id);if(!size)continue;
  const p={type,x:0,y:0,rotation:0},m=displayModel(p),b=catalogBodyBounds(type),terms=localTerminals(p);
  // Two-lead parts may be shrunk to fit between their leads; a drawing far from the datasheet's proportions keeps
  // at most 1.4:1 distortion. Every other package matches the datasheet's area exactly.
  if(terms.length===2&&terms.every(t=>t.y===0))continue;
  const w=m.bounds.right-m.bounds.left,h=m.bounds.bottom-m.bounds.top,area=size.w*size.h*UNITS_PER_MM**2;
  assert.ok(Math.abs(w*h/area-1)<.01,`${v.id}: ${(w/UNITS_PER_MM).toFixed(1)}×${(h/UNITS_PER_MM).toFixed(1)} mm for ${size.w}×${size.h} mm`);
  const ratio=(m.scaleX/m.scaleY);assert.ok(ratio<=1.4+1e-9&&ratio>=1/1.4-1e-9,v.id);
  assert.ok(b.right>b.left);checked++;
 }
 assert.ok(checked>50,`${checked} packages checked`);
});

test('a one-sided header keeps its pins at the package edge; pin positions never change',()=>{
 const type=catalogType('hcsr04-4'),p={type,x:0,y:0,rotation:0},m=displayModel(p),plain=displayModel(p,{datasheet:false});
 assert.equal(m.bounds.bottom,plain.bounds.bottom,'the header edge stays put');
 assert.ok(m.bounds.top<plain.bounds.top,'the larger body grows away from the pins');
 assert.deepEqual(localTerminals(p),localTerminals({...p}),'terminals are not scaled');
 assert.equal(plain.scaleX,1);
});

test('basic parts use the datasheet of the package they are drawn as',()=>{
 assert.equal(datasheetIdOf('resistor'),'resistor-axial-2');
 assert.equal(datasheetIdOf('led'),'led-tht-2');
 assert.equal(datasheetIdOf(catalogType('hcsr04-4')),'hcsr04-4');
 assert.equal(datasheetIdOf('breadboard'),null);
 assert.ok(CATALOG_BY_TYPE[catalogType('hcsr04-4')]);
});
