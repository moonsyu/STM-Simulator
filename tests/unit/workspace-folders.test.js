// A project folder (workspace) keeps sources that live in folders (feature 10): created, saved and opened with their
// tree, and a path that would leave the folder is refused. Found while looking for error cases of feature 10: saving
// such a project failed with "Windows에서 사용할 수 없는 소스 파일명입니다".
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
import {blankProject} from '../../src/project.js';
import {withTempDir,readText} from './helpers/tmp.js';

const require=createRequire(import.meta.url),workspace=require('../../desktop/workspace.cjs');

test('create, save and open a workspace whose sources are in folders',()=>withTempDir(async parent=>{
 const p=blankProject();p.firmware.files=[{name:'Core/Inc/app.h',text:'#pragma once\n'},{name:'Core/Src/app.c',text:'#include "app.h"\n'},{name:'top.c',text:'int top;\n'}];p.firmware.mainFolder='Core/Src';
 const state=await workspace.createWorkspace(parent,'project',JSON.stringify(p));
 assert.equal(await readText(path.join(state.directory,'Core/Src/app.c')),'#include "app.h"\n');assert.equal(await readText(path.join(state.directory,'Core/Inc/app.h')),'#pragma once\n');
 // Save: one file changed, one added in a new folder, one removed.
 const q=structuredClone(p);q.firmware.files=[{name:'Core/Inc/app.h',text:'#pragma once\n// v2\n'},{name:'Core/Src/app.c',text:'#include "app.h"\n'},{name:'USER/drv/oled.c',text:'int oled;\n'}];
 await workspace.saveWorkspace(state,JSON.stringify(q));
 assert.equal(await readText(path.join(state.directory,'Core/Inc/app.h')),'#pragma once\n// v2\n');assert.equal(await readText(path.join(state.directory,'USER/drv/oled.c')),'int oled;\n');
 await assert.rejects(fs.access(path.join(state.directory,'top.c')));
 // A file edited outside the app is read back on open.
 await fs.writeFile(path.join(state.directory,'USER/drv/oled.c'),'int oled = 2;\n');
 const opened=await workspace.openWorkspace(state.directory),project=JSON.parse(opened.text);
 assert.equal(project.firmware.files.find(f=>f.name==='USER/drv/oled.c').text,'int oled = 2;\n');assert.equal(project.firmware.mainFolder,'Core/Src');
},'stm-ws-folders-'));

test('unsafe paths are refused before anything is written',()=>withTempDir(async parent=>{
 for(const name of ['../escape.c','Core/../../escape.c','con/x.c','Core/aux.c','a/b/c/d/e/f/g/h.c']){
  const p=blankProject();p.firmware.files=[{name,text:''}];
  await assert.rejects(workspace.createWorkspace(parent,'p-'+Math.random().toString(36).slice(2,7),JSON.stringify(p)),undefined,name);
 }
 assert.deepEqual((await fs.readdir(parent)).filter(n=>n==='escape.c'),[]);
},'stm-ws-unsafe-'));
