import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {defaultPreferences,validatePreferences,appearanceMode,selectedTheme,withEditorTheme} from '../src/ide-preferences.js';
import {moveSurface} from '../src/surface-move.js';
import {surfaceOrigin} from '../src/geometry.js';
import {endpointInfo,boardPin} from '../src/pins.js';
import {nominalTerminals} from '../src/components.js';
import {validateProject} from '../src/project.js';
import {WireDraft} from '../src/wire-draft.js';
import {circuitFixture} from './fixtures/circuits.js';
test('system appearance and separate editor selections round trip, with four-space defaults and v1 migration',()=>{
 const p=defaultPreferences();assert.equal(p.tabSize,4);assert.equal(p.appearance,'system');
 assert.equal(appearanceMode(p,true),'dark');assert.equal(appearanceMode(p,false),'light');
 assert.equal(selectedTheme(p,'dark').id,'jellybean');assert.equal(selectedTheme(p,'light').id,'github-light');
 const custom=withEditorTheme({...p,appearance:'light'},'stm-light'),loaded=validatePreferences(JSON.parse(JSON.stringify(custom)));
 assert.equal(appearanceMode(loaded,true),'light');assert.equal(selectedTheme(loaded).id,'stm-light');assert.equal(selectedTheme(loaded,'dark').id,'jellybean');
 const old={...p,version:1,theme:'stm-light',tabSize:2,themes:p.themes.filter(t=>t.id!=='github-light')};const migrated=validatePreferences(old);
 assert.equal(migrated.appearance,'system');assert.equal(migrated.lightTheme,'stm-light');assert.equal(migrated.darkTheme,'jellybean');assert.equal(migrated.tabSize,4);
 assert.equal(validatePreferences({...loaded,tabSize:2}).tabSize,2);
 for(const field of [{appearance:'invalid'},{lightTheme:'missing'},{darkTheme:'missing'}])assert.throws(()=>validatePreferences({...p,...field}));
});
test('bundled GitHub Light retains the downloaded source hash, MIT license and editor palette',()=>{
 const theme=selectedTheme(defaultPreferences(),'light'),raw=readFileSync(new URL('../src/themes/github-light/light-default.json',import.meta.url));
 assert.equal(createHash('sha256').update(raw).digest('hex'),theme.source.sha256);assert.equal(theme.source.license,'MIT');
 assert.equal(theme.colors.background,JSON.parse(raw).colors['editor.background']);assert.equal(theme.editor.base,'vs');
 assert.match(readFileSync(new URL('../src/themes/github-light/LICENSE.txt',import.meta.url),'utf8'),/Permission is hereby granted/);
});
test('moving the breadboard carries mounted footprints and internal routes, preserving cross-surface routes and connections',()=>{
 const p=circuitFixture('led'),before=structuredClone(p),origin=surfaceOrigin('breadboard',p.surfaces),delta={x:-9000,y:12000};
 p.wires[0].points=[{x:400,y:200}];p.wires[2].points=[{x:890,y:330}];
 moveSurface(p,'breadboard',{x:origin.x+delta.x,y:origin.y+delta.y});
 for(const [i,part]of p.components.entries()){
  assert.equal(part.x,before.components[i].x+delta.x);assert.equal(part.y,before.components[i].y+delta.y);
  for(const [j,anchor]of [part.attachA,part.attachB].entries()){const end=endpointInfo(anchor,p.components,p.surfaces),terminal=nominalTerminals(part)[j];assert.ok(Math.hypot(end.x-terminal.x,end.y-terminal.y)<1e-8);}
 }
 assert.deepEqual(p.wires[0].points,[{x:400,y:200}]);assert.deepEqual(p.wires[2].points,[{x:-8110,y:12330}]);
 assert.deepEqual(p.wires.map(w=>[w.from,w.to]),before.wires.map(w=>[w.from,w.to]));assert.deepEqual(validateProject(JSON.parse(JSON.stringify(p))).surfaces,p.surfaces);
});
test('board movement preserves scaled pins, and unfinished wire paths accept either side of the old bounds',()=>{
 const p=circuitFixture('led');p.surfaces={board:{scaleX:1.7,scaleY:.8,x:30,y:60}};const id=boardPin('D13'),old=endpointInfo(id,p.components,p.surfaces);
 moveSurface(p,'board',{x:10030,y:-8040});const pin=endpointInfo(id,p.components,p.surfaces);
 assert.equal(pin.x-old.x,10000);assert.equal(pin.y-old.y,-8100);assert.equal(p.surfaces.board.scaleX,1.7);
 const draft=new WireDraft();draft.add(id,{x:-50000,y:60001});assert.deepEqual(draft.finish(id),{points:[{x:-50000,y:60001}]});assert.equal(draft.start,null);
 draft.add(id,{x:0,y:0});draft.reset();assert.deepEqual(draft.finish(id),{});assert.throws(()=>draft.add(id,{x:Infinity,y:0}));
 assert.doesNotThrow(()=>validateProject(p));
});
