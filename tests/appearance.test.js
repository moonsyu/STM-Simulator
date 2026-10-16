import test from 'node:test';
import assert from 'node:assert/strict';
import {exampleProject as blankProject,validateProject} from '../src/project.js';
import {resizeObject} from '../src/resize.js';
import {BOARD,BB,surfacePoint,MAX_SCALE} from '../src/geometry.js';
import {PINS,boardPin,endpointInfo,holeInfo,breadboardHoles} from '../src/pins.js';
import {nominalTerminals,PART_DEFS,TWO_PIN_TYPES,MULTI_PIN_TYPES} from '../src/components.js';
import {wirePoints} from '../src/circuit-edit.js';
import {findMount,applyMount} from '../src/placement.js';
import {defaultPreferences,validatePreferences,loadPreferences,selectedTheme,PREFERENCES_KEY} from '../src/ide-preferences.js';
import {circuitFixture} from './fixtures/circuits.js';
import {CircuitSimulation} from '../src/engine.js';
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
test('every supported component scales terminals uniformly while retaining its rotation',()=>{
 for(const type of new Set([...TWO_PIN_TYPES,...MULTI_PIN_TYPES])){
  const p={id:type,type,x:700,y:400,rotation:45,span:70,...PART_DEFS[type]?.defaults},base=nominalTerminals(p);p.scale=2;
  nominalTerminals(p).forEach((t,i)=>{close(t.x-p.x,(base[i].x-p.x)*2);close(t.y-p.y,(base[i].y-p.y)*2);});
 }
});
test('STM board scaling moves every physical pin, attached contacts, wire ends and preserves logical aliases',()=>{
 const project=blankProject(),a=boardPin('D13'),b=boardPin('GND');project.components=[{id:'led',type:'led',name:'LED',color:'red',x:300,y:300,rotation:0,span:70,attachA:a,attachB:b}];project.wires=[{id:'w',from:a,to:'bb:a:1',color:'#23a68a'}];const old=endpointInfo(a,project.components);
 resizeObject(project,{type:'surface',id:'board'},1.5);
 for(const pin of PINS){const next=endpointInfo(pin.id,project.components,project.surfaces);close(next.x,BOARD.x+(pin.x-BOARD.x)*1.5);close(next.y,BOARD.y+(pin.y-BOARD.y)*1.5);assert.equal(next.signal,pin.signal);}
 const next=endpointInfo('part:led:a',project.components,project.surfaces);close(next.x,BOARD.x+(old.x-BOARD.x)*1.5);close(wirePoints(project,project.wires[0])[0].x,next.x);
 assert.equal(validateProject(project).surfaces.board.scale,1.5);
});
test('resizing the base breadboard carries mounted footprints and retains exact hole alignment',()=>{
 const p=blankProject(),a=holeInfo('bb:a:10'),b=holeInfo('bb:c:10');p.components=[{id:'r',type:'resistor',name:'R',x:(a.x+b.x)/2,y:a.y,rotation:0,span:28,value:330,attachA:a.id,attachB:b.id}];
 resizeObject(p,{type:'surface',id:'breadboard'},2);assert.equal(p.components[0].scale,2);
 for(const [i,id]of [a.id,b.id].entries()){const hole=holeInfo(id,p.components,p.surfaces),terminal=nominalTerminals(p.components[0])[i];close(hole.x,terminal.x);close(hole.y,terminal.y);}
 const anchor=holeInfo('bb:a:15',p.components,p.surfaces),free={id:'button',type:'button',x:anchor.x+42,y:anchor.y+28,rotation:0,scale:2};const mount=findMount(free,p.components,15,p.surfaces);assert.ok(mount);assert.equal(mount.points.length,4);applyMount(free,mount);for(const point of mount.points)assert.equal(endpointInfo(`part:button:${point.key}`,[...p.components,free],p.surfaces).x,point.x);
});
test('additional rotated breadboards scale their hole grid and mounted devices about their own center',()=>{
 const p=blankProject(),board={id:'extra',type:'breadboard',name:'BB',x:1500,y:800,rotation:45};p.components=[board];const holes=breadboardHoles(board),a=holes.find(h=>h.id.endsWith('bb:a:5')),b=holes.find(h=>h.id.endsWith('bb:c:5'));p.components.push({id:'r',type:'resistor',name:'R',value:330,x:(a.x+b.x)/2,y:(a.y+b.y)/2,rotation:45,span:28,attachA:a.id,attachB:b.id});
 resizeObject(p,{type:'part',id:'extra'},1.5);
 const points=nominalTerminals(p.components[1]);for(const [i,id]of [a.id,b.id].entries()){close(holeInfo(id,p.components).x,points[i].x);close(holeInfo(id,p.components).y,points[i].y);}
 assert.equal(validateProject(p).components[0].scale,1.5);
});
test('individual mounted resizing preserves connection IDs and resizing does not alter circuit results',()=>{
 const p=circuitFixture('led'),before=structuredClone(p),simulation=new CircuitSimulation();const old=simulation.solve(before,{PA5:{mode:'OUTPUT',value:3.3}},{});assert.equal(old.parts.led1.on,true);for(const part of [...p.components])resizeObject(p,{type:'part',id:part.id},1.5);resizeObject(p,{type:'surface',id:'board'},1.2);resizeObject(p,{type:'surface',id:'breadboard'},1.2);
 assert.deepEqual(p.wires,before.wires);const result=simulation.solve(p,{PA5:{mode:'OUTPUT',value:3.3}},{});assert.equal(result.fault,old.fault);assert.equal(result.parts.led1.on,true);for(const id of Object.keys(old.parts))close(result.parts[id].current,old.parts[id].current);
});
test('invalid and compound out-of-range resizing is rejected before any mutation, and scale fields round trip',()=>{
 const p=blankProject();for(const scale of [0,-1,Infinity,NaN,MAX_SCALE+1])assert.throws(()=>resizeObject(p,{type:'surface',id:'board'},scale));
 p.components=[{id:'r',type:'resistor',name:'R',value:330,x:750,y:230,rotation:0,span:70,scale:MAX_SCALE,attachA:'bb:a:1',attachB:'bb:b:1'}];const before=JSON.stringify(p);assert.throws(()=>resizeObject(p,{type:'surface',id:'breadboard'},2));assert.equal(JSON.stringify(p),before);
 assert.equal(validateProject(p).components[0].scale,MAX_SCALE);assert.throws(()=>validateProject({...p,surfaces:{board:{scale:'2'}}}));
});
test('IDE defaults use Jellybean and settings are independent from circuit projects',()=>{
 const prefs=defaultPreferences();assert.equal(prefs.theme,'jellybean');assert.equal(selectedTheme(prefs).colors.background,'#151515');assert.equal(blankProject().preferences,undefined);
 prefs.fontSize=18;prefs.lineHeight=28;prefs.themes[0].colors.keyword='#abcdef';const serialized=JSON.stringify(validatePreferences(prefs)),storage={getItem:key=>key===PREFERENCES_KEY?serialized:null};assert.equal(loadPreferences(storage).fontSize,18);assert.equal(selectedTheme(loadPreferences(storage)).colors.keyword,'#abcdef');assert.equal(defaultPreferences().themes[0].colors.keyword,'#8197bf');
});
test('theme addition and editing survive export/import and unsafe or excessive options are refused',()=>{
 const p=defaultPreferences(),theme=structuredClone(p.themes[0]);theme.id='my-theme';theme.name='내 테마';theme.colors.selection='#345678';p.themes.push(theme);p.theme=p.darkTheme=theme.id;const loaded=validatePreferences(JSON.parse(JSON.stringify(p)));assert.equal(selectedTheme(loaded).colors.selection,'#345678');
 for(const change of [{fontSize:100},{fontFamily:'x; background:url(https://bad)'},{tabSize:0},{lineHeight:5},{theme:'missing'}])assert.throws(()=>validatePreferences({...p,...change}));
 const invalid=structuredClone(p);invalid.themes[0].colors.background='url(x)';assert.throws(()=>validatePreferences(invalid));assert.equal(loadPreferences({getItem:()=>'{bad'}).theme,'jellybean');
});
