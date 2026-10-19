import test from 'node:test';
import assert from 'node:assert/strict';
import {PART_LIBRARY} from '../src/part-library.js';
import {PART_DEFS,terminalKeys,nominalTerminals} from '../src/components.js';
import {CATALOG_BY_TYPE,CATALOG_DEFS} from '../src/catalog-defs.js';
import {PINS,HOLES,endpointInfo} from '../src/pins.js';
import {boardSvg,breadboardSvg,renderParts} from '../src/render.js';
import {catalogShape} from '../src/catalog-render.js';
import {updateCatalogView} from '../src/catalog-view.js';
const part=type=>({id:'device',type,name:type,x:850,y:360,rotation:0,span:70,value:330,color:'red',...PART_DEFS[type]?.defaults});
const attr=(tag,name)=>tag.match(new RegExp(`(?:^|\\s)${name}="([^"]*)"`))?.[1];

test('all 114 library models render without altering any physical contact definition',()=>{
 assert.equal(PART_LIBRARY.length,114);
 const definitions=structuredClone(PART_DEFS);
 for(const {type}of PART_LIBRARY){
  if(type==='board'){assert.match(boardSvg(),/F446RE/);continue;}
  const p=part(type),project={components:[p],wires:[]},before=structuredClone(project);
  const svg=type==='breadboard'?breadboardSvg(p):renderParts(project,null,null,{});
  assert.doesNotMatch(svg,/NaN|Infinity|undefined/,type);assert.deepEqual(project,before,type);
  if(type==='breadboard'){assert.equal([...svg.matchAll(/class="hole"/g)].length,400);continue;}
  const pins=[...svg.matchAll(/<circle[^>]*class="pin-hit part-pin"[^>]*>/g)].map(m=>m[0]);
  const contacts=[...svg.matchAll(/<circle class="part-contact"[^>]*>/g)].map(m=>m[0]);
  assert.equal(pins.length,terminalKeys(p).length,type);assert.equal(contacts.length,pins.length,type);
  for(const [i,key]of terminalKeys(p).entries()){
   const endpoint=endpointInfo(`part:${p.id}:${key}`,project.components);
   assert.equal(attr(pins[i],'data-endpoint'),endpoint.id,type);
   for(const node of [pins[i],contacts[i]]){assert.equal(Number(attr(node,'cx')),endpoint.x,type);assert.equal(Number(attr(node,'cy')),endpoint.y,type);}
  }
  assert.match(svg,/data-model-family=/,type);
 }
 assert.deepEqual(PART_DEFS,definitions);
});
test('transformed and mounted lead tips still align with their real electrical endpoints',()=>{
 for(const type of PART_LIBRARY.map(p=>p.type).filter(t=>!['board','breadboard'].includes(t))){
  const p={...part(type),x:-450,y:800,rotation:45,scaleX:1.5,scaleY:.8,skewX:12},expected=nominalTerminals(p),svg=renderParts({components:[p],wires:[]},null,null,{});
  const contacts=[...svg.matchAll(/<circle class="part-contact"[^>]*>/g)].map(m=>m[0]);
  for(const [i,node]of contacts.entries()){assert.equal(Number(attr(node,'cx')),expected[i].x,type);assert.equal(Number(attr(node,'cy')),expected[i].y,type);}
 }
 const p={...part('led'),attachA:'bb:a:1',attachB:'bb:a:4'},project={components:[p],wires:[]},svg=renderParts(project,null,null,{});
 const contacts=[...svg.matchAll(/<circle class="part-contact"[^>]*>/g)].map(m=>m[0]);
 for(const [i,key]of terminalKeys(p).entries()){const end=endpointInfo(`part:device:${key}`,project.components);assert.equal(Number(attr(contacts[i],'cx')),end.x);assert.equal(Number(attr(contacts[i],'cy')),end.y);}
});
test('breadboard wells and Nucleo header metal retain the exact shared hole and pin centers',()=>{
 const breadboard=breadboardSvg(),board=boardSvg();
 assert.equal([...breadboard.matchAll(/class="hole"/g)].length,400);
 for(const h of HOLES){const tag=[...breadboard.matchAll(/<rect[^>]*data-hole="([^"]+)"[^>]*>/g)].find(m=>m[1]===h.id)?.[0];assert.ok(tag,h.id);assert.ok(Math.abs(Number(attr(tag,'x'))+2.4-h.x)<1e-9);assert.ok(Math.abs(Number(attr(tag,'y'))+2.4-h.y)<1e-9);}
 for(const pin of PINS)assert.ok(board.includes(`x="${pin.x-3.4}" y="${pin.y-3.4}" width="6.8" height="6.8"`),pin.id);
 assert.match(board,/data-button="USER"/);assert.match(board,/data-button="RESET"/);assert.match(board,/id="builtin-led"/);
});
test('legacy remapped bodies have continuous metal leads into the visible package',()=>{
 // Visible package bounds after the legacy model scale, before user transforms.
 const bounds={lcd:[96.8,33.6],sevenseg:[24.8,24.8],l298n:[56,44.8],i2c:[20.8,10.4],spi:[20.8,10.4],temperature:[13,9.1],potentiometer:[14.3,12.35],slide:[28.8,11.2],ldr:[14.4,14.4],ntc:[9.6,9.6]};
 for(const [type,[halfWidth,halfHeight]]of Object.entries(bounds)){
  const p=part(type),svg=renderParts({components:[p],wires:[]},null,null,{}),leads=[...svg.matchAll(/<path d="M([^ ]+) ([^L]+)L[^>]+stroke="#737d78"/g)];
  assert.equal(leads.length,terminalKeys(p).length,type);
  for(const [,x,y]of leads){assert.ok(Math.abs(Number(x)-p.x)<=halfWidth+1e-9,`${type}: disconnected horizontal lead`);assert.ok(Math.abs(Number(y)-p.y)<=halfHeight+1e-9,`${type}: disconnected vertical lead`);}
 }
});
test('catalog pin labels and live display sizes survive the new physical detail layer',()=>{
 for(const [type,ref]of Object.entries(CATALOG_BY_TYPE)){
  const svg=catalogShape(part(type));
  if(ref.pins.length>2){assert.equal([...svg.matchAll(/data-pad="/g)].length,ref.pins.length,type);for(const label of ref.pins)assert.ok(svg.includes(`<title>${label.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;')}</title>`),`${type}: ${label}`);
   const pads=[...svg.matchAll(/<g data-pad="\d+">(<(?:rect|circle)[^>]+>)/g)].map(([,tag])=>tag.startsWith('<rect')?[Number(attr(tag,'x'))+3.5,Number(attr(tag,'y'))+3.5]:[Number(attr(tag,'cx')),Number(attr(tag,'cy'))]);assert.equal(new Set(pads.map(p=>p.join(','))).size,ref.pins.length,`${type}: connector rows must not collapse to the same pads`);
  }
  if(['oled','tft','matrix'].includes(ref.family)){const size=ref.family==='matrix'?[8,8]:ref.family==='tft'?[128,160]:[128,64];assert.match(svg,new RegExp(`class="device-screen" width="${size[0]}" height="${size[1]}"`),type);}
 }
 assert.match(catalogShape(part('ref_led_tht_2')),/class="catalog-light led-lens"/);
 assert.match(catalogShape(part('ref_rgb_common_cathode_4')),/class="catalog-light rgb-lens"/);
 assert.match(catalogShape(part('ref_button_4')),/class="switch-cap"/);
 assert.match(catalogShape(part('ref_joystick_module_5')),/class="device-knob"/);
 assert.match(catalogShape(part('ref_servo_3')),/class="device-rotor"/);
});
test('live slide position, LCD pixels and LED glow update the new model hooks',()=>{
 const elements=new Map(),node=(selector,dataset={})=>{const el={dataset,attrs:{},setAttribute(k,v){this.attrs[k]=v;},getAttribute(k){return this.attrs[k];}};elements.set(selector,el);return el;};
 const thumb=node('.catalog-slide-thumb',{start:'-33',step:'25.5'}),light=node('.catalog-light'),glow=node('.led-glow, .rgb-glow'),display=node('.catalog-display');
 const g={querySelector:selector=>elements.get(selector)||null,querySelectorAll:()=>[]};
 updateCatalogView(g,part('ref_slide_dp3t_8'),null);assert.equal(thumb.attrs.transform,'translate(-33 0)');
 updateCatalogView(g,{...part('ref_slide_dp3t_8'),position:2},null);assert.equal(thumb.attrs.transform,'translate(18 0)');
 updateCatalogView(g,part('ref_led_tht_2'),{on:true});assert.equal(light.attrs.fill,'#f05a4b');assert.equal(glow.attrs.fill,'#f05a4b');assert.equal(glow.attrs.opacity,'.32');
 updateCatalogView(g,part('ref_lcd_parallel_16'),{lcd:{visible:true}},false,()=>'<text fill="#293e1b">A</text>');assert.equal(display.innerHTML,'<text fill="#293e1b">A</text>');
});
