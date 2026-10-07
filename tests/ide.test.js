import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {compile} from '../src/parser.js';
import {compileHal} from '../src/hal-source.js';
import {Runtime} from '../src/runtime.js';
import {inspectRuntime,watchValue} from '../src/debug-tools.js';
import {DEFAULT_LAYOUT,validateLayout,layoutPanels,movePanel} from '../src/layout-model.js';
import {blankProject,validateProject} from '../src/project.js';
import {changeSourceFile} from '../src/source-files.js';
import workspace from '../desktop/workspace.cjs';

test('dock layout can move every panel on all edges without losing another panel',()=>{
 let tree=structuredClone(DEFAULT_LAYOUT);for(const source of ['project','code','simulator','terminal'])for(const target of ['project','code','simulator','terminal'])for(const edge of ['left','right','top','bottom']){tree=movePanel(tree,source,target,edge);assert.deepEqual(layoutPanels(validateLayout(JSON.parse(JSON.stringify(tree)))).sort(),['code','project','simulator','terminal']);}
 assert.throws(()=>validateLayout({axis:'x',ratio:.5,a:'code',b:'code'}));assert.throws(()=>validateLayout({...DEFAULT_LAYOUT,ratio:NaN}));
});
const sketch='int count=0;\nint add(int x) {\n  int result=x+2;\n  return result;\n}\nvoid loop(){\n  count=add(count);\n  count++;\n  delay(10);\n}';
const advance=(r,mode='into')=>{r.resume(mode);r.tick(r.microTime/1000+100);assert.equal(r.debug.paused,true);};
test('source debugger stops before statements, steps into/out/over and exposes real scopes',()=>{
 const r=new Runtime(compile(sketch),{debug:{entry:true}});r.tick(0);assert.equal(r.location.line,7);assert.equal(r.vars.count,0);
 advance(r);assert.equal(r.location.line,3);assert.equal(r.frames.at(-1).name,'add');assert.equal(watchValue(r,'x'), '0');assert.equal(r.depth,2);
 advance(r);assert.equal(r.location.line,4);assert.equal(watchValue(r,'result'), '2');assert.equal(inspectRuntime(r).frames[1].loc.line,7);
 advance(r,'out');assert.equal(r.location.line,8);assert.equal(r.vars.count,2);assert.throws(()=>watchValue(r,'result'),/정의되지/);
 advance(r,'over');assert.equal(r.location.line,9);assert.equal(r.vars.count,3);
 advance(r,'over');assert.equal(r.location.line,7);assert.ok(r.microTime>=10000);
 advance(r,'over');assert.equal(r.location.line,8);assert.equal(r.vars.count,5);
});
test('breakpoints resume past their stop and loops can be paused without changing time',()=>{
 const r=new Runtime(compile(sketch),{debug:{breakpoints:['main.c:8']}});r.tick(100);assert.equal(r.debug.paused,true);assert.equal(r.vars.count,2);assert.equal(r.microTime,0);
 r.tick(999);assert.equal(r.microTime,0);r.resume();r.tick(100);assert.equal(r.debug.paused,true);assert.equal(r.vars.count,5);assert.equal(r.microTime,11000);
});
test('HAL include and additional C source locations map back to original files',()=>{
 const p=compileHal('#include "user.h"\nint main(void){\n  return twice(3);\n}',[{name:'user.h',text:'#pragma once\nint twice(int n);\n'},{name:'user.c',text:'#include "user.h"\nint twice(int n){\n  int x=n*2;\n  return x;\n}'}]);
 const r=new Runtime(p,{debug:{entry:true}});r.tick(0);assert.deepEqual(r.location,{file:'main.c',line:3});advance(r);assert.deepEqual(r.location,{file:'user.c',line:3});
 assert.throws(()=>compileHal('#include "broken.h"\nint main(void){return 0;}',[{name:'broken.h',text:'int broken = ;'}]),e=>e.location.file==='broken.h'&&e.location.line===1);
});
test('watches cannot call functions, write variables or mutate arrays',()=>{
 const r=new Runtime(compile('int values[2]={5,9};\nvoid loop(){ delay(10); }'),{debug:{entry:true}});r.tick(0);assert.equal(watchValue(r,'values[1]+2'),'11');for(const text of ['values[0]=9','values[0]++','delay(2)','1; values[0]=3','++values[0]'])assert.throws(()=>watchValue(r,text));assert.equal(watchValue(r,'values[0]'),'5');
});
test('file creation, rename and deletion preserve includes and protect main and collisions',()=>{
 let p=changeSourceFile(blankProject(),'add','user.h');p.code+='#include "user.h"\n';p=changeSourceFile(p,'rename','user.h','app.h');assert.match(p.code,/#include "app.h"/);assert.throws(()=>changeSourceFile(p,'add','APP.h'));assert.throws(()=>changeSourceFile(p,'delete','app.h'),/include/);assert.throws(()=>changeSourceFile(p,'rename','main.c','x.c'));assert.throws(()=>changeSourceFile(p,'add','../escape.c'));p.code=p.code.replace('#include "app.h"\n','');assert.equal(changeSourceFile(p,'delete','app.h').firmware.files.length,0);
});
test('breakpoints and watches round trip with source names and bounds validated',()=>{
 const p=blankProject();p.ide={breakpoints:[{file:'main.c',line:3}],watches:['count']};assert.deepEqual(validateProject(p).ide,p.ide);p.ide.breakpoints[0].file='../secret';assert.throws(()=>validateProject(p));
});
test('project folders create sources, refuse overwrite and protect external edits',async()=>{
 const parent=await fs.mkdtemp(path.join(os.tmpdir(),'stm-ide-workspace-'));try{const p=changeSourceFile(blankProject(),'add','user.c'),text=JSON.stringify(p),state=await workspace.createWorkspace(parent,'테스트 프로젝트',text);
 assert.equal(await fs.readFile(path.join(state.directory,'main.c'),'utf8'),p.code);await assert.rejects(()=>workspace.createWorkspace(parent,'테스트 프로젝트',text),/이미/);await assert.rejects(()=>workspace.createWorkspace(parent,'../outside',text));
 p.code+='\n// saved';await workspace.saveWorkspace(state,JSON.stringify(p));await fs.writeFile(path.join(state.directory,'main.c'),p.code+'\n// outside');await assert.rejects(()=>workspace.saveWorkspace(state,JSON.stringify(p)),/앱 밖/);
 const opened=await workspace.openWorkspace(state.directory);assert.match(JSON.parse(opened.text).code,/outside/);await workspace.saveWorkspace(opened.state,opened.text);assert.equal(await fs.readFile(path.join(state.directory,'main.c'),'utf8'),JSON.parse(opened.text).code);
 }finally{assert.equal(path.dirname(parent),path.resolve(os.tmpdir()));assert.ok(path.basename(parent).startsWith('stm-ide-workspace-'));await fs.rm(parent,{recursive:true,force:true});}
});
