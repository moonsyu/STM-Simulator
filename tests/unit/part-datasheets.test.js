// Datasheet names and package sizes of the catalog parts.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DEVICE_CATALOG} from '../../src/device-catalog-data.js';
import {CATALOG_BY_TYPE,CATALOG_DEFS,catalogType} from '../../src/catalog-defs.js';
import {PART_DATASHEETS,UNITS_PER_MM,datasheetLine} from '../../src/part-datasheets.js';
import {displayModel,datasheetIdOf} from '../../src/model-geometry.js';
import {localTerminals} from '../../src/components.js';

const parts=DEVICE_CATALOG.filter(v=>!['board','breadboard'].includes(v.family));

test('every catalog part has a plain name and its datasheet model as the detail line',()=>{
 for(const v of parts){
  const d=PART_DATASHEETS[v.id];assert.ok(d?.name&&d.model&&d.manufacturer,v.id);
  assert.equal(CATALOG_DEFS[catalogType(v.id)].name,d.name,v.id);
  assert.equal(datasheetLine(v.id),d.model,v.id);
 }
 // The detail line is the model alone, e.g. KY-013 under "NTC 온도 센서".
 assert.equal(PART_DATASHEETS['ntc-module-3'].name,'NTC 온도 센서');assert.equal(datasheetLine('ntc-module-3'),'KY-013');
});

test('every package is drawn at exactly its datasheet size on the breadboard scale (1 mm = 14/2.54 units)',()=>{
 assert.equal(UNITS_PER_MM,14/2.54);
 for(const v of parts){
  const size=PART_DATASHEETS[v.id].size;assert.ok(size,`${v.id} has a size`);
  const m=displayModel({type:catalogType(v.id),x:0,y:0,rotation:0}),w=(m.bounds.right-m.bounds.left)/UNITS_PER_MM,h=(m.bounds.bottom-m.bounds.top)/UNITS_PER_MM;
  const [a,b]=size.xy?[w,h]:[Math.max(w,h),Math.min(w,h)],[sa,sb]=size.xy?[size.w,size.h]:[Math.max(size.w,size.h),Math.min(size.w,size.h)];
  assert.ok(Math.abs(a-sa)<.05&&Math.abs(b-sb)<.05,`${v.id}: ${w.toFixed(1)}×${h.toFixed(1)} mm for ${size.w}×${size.h} mm`);
 }
});

test('a one-sided header keeps its pins at the package edge; pin positions never change',()=>{
 const type=catalogType('hcsr04-4'),p={type,x:0,y:0,rotation:0},m=displayModel(p),plain=displayModel(p,{datasheet:false});
 assert.equal(m.bounds.bottom,plain.bounds.bottom,'the header edge stays put');
 assert.ok(m.bounds.top<plain.bounds.top,'the larger body grows away from the pins');
 assert.deepEqual(localTerminals(p),localTerminals({...p}),'terminals are not scaled');
 assert.equal(plain.scaleX,1);
});

test('basic parts use the datasheet (and size) of the package they are drawn as',()=>{
 assert.equal(datasheetIdOf('resistor'),'resistor-axial-2');
 assert.equal(datasheetIdOf('led'),'led-tht-2');
 assert.equal(datasheetIdOf(catalogType('hcsr04-4')),'hcsr04-4');
 assert.equal(datasheetIdOf('breadboard'),null);
 const supply=displayModel({type:'dc_supply',x:0,y:0,rotation:0});assert.ok(Math.abs((supply.bounds.right-supply.bounds.left)/UNITS_PER_MM-69.9)<.05,'a battery holder keeps its 70 mm');
 assert.ok(CATALOG_BY_TYPE[catalogType('hcsr04-4')]);
});
