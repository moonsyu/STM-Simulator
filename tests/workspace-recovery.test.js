import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {spawnSync} from 'node:child_process';
import workspace from '../desktop/workspace.cjs';
import {blankProject} from '../src/project.js';

async function fixture(run){const parent=await fs.mkdtemp(path.join(os.tmpdir(),'stm-transaction-'));try{const p=blankProject();p.code='int main(void){return 1;}';p.firmware.files=[{name:'old.c',text:'int old_value=1;'}];const state=await workspace.createWorkspace(parent,'project',JSON.stringify(p));await run(p,state);}finally{assert.equal(path.dirname(parent),path.resolve(os.tmpdir()));assert.ok(path.basename(parent).startsWith('stm-transaction-'));await fs.rm(parent,{recursive:true,force:true});}}
function edit(p){const next=structuredClone(p);next.code='int main(void){return 2;}';next.firmware.files=[{name:'new.c',text:'int new_value=2;'}];return next;}
async function checkOld(p,state){const opened=await workspace.openWorkspace(state.directory);assert.equal(JSON.parse(opened.text).code,p.code);assert.equal(await fs.readFile(path.join(state.directory,'old.c'),'utf8'),p.firmware.files[0].text);await assert.rejects(fs.stat(path.join(state.directory,'new.c')),e=>e.code==='ENOENT');}
test('failed second replacement rolls back the file set and permits retry',()=>fixture(async(p,state)=>{
 const rename=fs.rename;let fail=true;try{fs.rename=async(from,to)=>{if(fail&&to===path.join(state.directory,'main.c')){fail=false;throw Object.assign(Error('locked source'),{code:'EACCES'});}return rename(from,to);};await assert.rejects(workspace.saveWorkspace(state,JSON.stringify(edit(p))),/locked source/);}finally{fs.rename=rename;}
 await checkOld(p,state);await workspace.saveWorkspace(state,JSON.stringify(edit(p)));assert.equal(JSON.parse((await workspace.openWorkspace(state.directory)).text).code,edit(p).code);
}));
test('failure deleting an old source restores replacements and preserves the old source',()=>fixture(async(p,state)=>{
 const unlink=fs.unlink;let fail=true;try{fs.unlink=async name=>{if(fail&&name===path.join(state.directory,'old.c')){fail=false;throw Error('locked deletion');}return unlink(name);};await assert.rejects(workspace.saveWorkspace(state,JSON.stringify(edit(p))),/locked deletion/);}finally{fs.unlink=unlink;}
 await checkOld(p,state);await workspace.saveWorkspace(state,JSON.stringify(edit(p)));
}));
test('process exit during a save is recovered before reading project sources',()=>fixture(async(p,state)=>{
 const source=`const fs=require('node:fs/promises'),w=require(${JSON.stringify(path.resolve('desktop/workspace.cjs'))});(async()=>{const o=await w.openWorkspace(${JSON.stringify(state.directory)}),rename=fs.rename;fs.rename=async(a,b)=>{await rename(a,b);if(b===${JSON.stringify(path.join(state.directory,'project.stm32lab'))})process.exit(86);};await w.saveWorkspace(o.state,${JSON.stringify(JSON.stringify(edit(p)))});})().catch(()=>process.exit(2));`;
 const child=spawnSync(process.execPath,['-e',source],{windowsHide:true,timeout:20000});assert.equal(child.status,86,child.stderr?.toString());await checkOld(p,state);await workspace.saveWorkspace(state,JSON.stringify(edit(p)));
}));
test('serialized saves finish with the latest complete project',()=>fixture(async(p,state)=>{
 const a=edit(p),b=edit(p);b.code='int main(void){return 3;}';await Promise.all([workspace.saveWorkspace(state,JSON.stringify(a)),workspace.saveWorkspace(state,JSON.stringify(b))]);assert.equal(JSON.parse((await workspace.openWorkspace(state.directory)).text).code,b.code);
}));
test('rollback failure leaves recoverable journal and never overwrites an external edit',()=>fixture(async(p,state)=>{
 const rename=fs.rename;try{fs.rename=async(from,to)=>{if(to===path.join(state.directory,'main.c')||path.basename(from).startsWith('restore-'))throw Error('locked rollback');return rename(from,to);};await assert.rejects(workspace.saveWorkspace(state,JSON.stringify(edit(p))),/복구 기록/);}finally{fs.rename=rename;}
 const filename=path.join(state.directory,'project.stm32lab'),partial=await fs.readFile(filename);await fs.writeFile(filename,'external edit');await assert.rejects(workspace.openWorkspace(state.directory),/외부 변경/);assert.equal(await fs.readFile(filename,'utf8'),'external edit');await fs.writeFile(filename,partial);await checkOld(p,state);
}));
