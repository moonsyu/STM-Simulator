import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {root,windows,wait,compileFixture,specialTemp} from './helpers.mjs';
const require=createRequire(import.meta.url);
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
async function readResult(directory,timeout=25000){const end=Date.now()+timeout;while(Date.now()<end){try{return JSON.parse((await fs.readFile(path.join(directory,'last-result.json'),'utf8')).replace(/^﻿/,''));}catch{}await wait(150);}throw new Error('update helper produced no result: '+await fs.readFile(path.join(directory,'helper.log'),'utf8').catch(()=>''));}
async function started(target,tries=150){for(let i=0;i<tries;i++){try{return await fs.readFile(target+'.started','utf8');}catch{}await wait(100);}return null;}

test('update helper waits for a locked EXE, replaces it, relaunches, and rolls back an invalid one',{skip:!windows&&'Windows only',timeout:180000},async()=>{
 const {launchHelper}=require(path.join(root,'desktop/updater.cjs'));
 const temp=await specialTemp('update helper');const children=[];
 try{
  const template=path.join(temp.dir,'fixture.exe');compileFixture(template,{hold:true});const valid=await fs.readFile(template);
  for(const failure of [false,true]){
   const directory=path.join(temp.dir,failure?'failure':'success');await fs.mkdir(directory);
   const target=path.join(directory,'STM 한글 custom.exe'),source=path.join(directory,'pending.exe');
   await fs.copyFile(template,target);const bytes=failure?Buffer.from('MZ invalid executable'):valid;await fs.writeFile(source,bytes);
   const old=spawn(target,['--hold'],{stdio:'ignore',windowsHide:true});children.push(old);await new Promise((resolve,reject)=>{old.once('spawn',resolve);old.once('error',reject);});
   await launchHelper({directory,source,target,pid:old.pid,info:{sha256:sha(bytes),bytes:bytes.length}});
   const result=await readResult(directory);assert.equal(result.ok,!failure,JSON.stringify(result));
   if(failure)assert.deepEqual(await fs.readFile(target),valid,'a failed startup restores the original EXE');
   else assert.equal(await started(target),'updated');
  }
  // The updater's parent process exits; the helper must survive with its own handles.
  const directory=path.join(temp.dir,'parent-exit');await fs.mkdir(directory);
  const target=path.join(directory,'STM after parent.exe'),incoming=path.join(directory,'pending.exe');await fs.copyFile(template,target);await fs.copyFile(template,incoming);
  const runner=path.join(temp.dir,'runner.cjs');
  await fs.writeFile(runner,`const {launchHelper}=require(${JSON.stringify(path.join(root,'desktop/updater.cjs'))});launchHelper(JSON.parse(process.argv[2])).then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1);});`);
  const parent=spawn(process.execPath,[runner,JSON.stringify({directory,source:incoming,target,info:{sha256:sha(valid),bytes:valid.length}})],{stdio:['ignore','pipe','pipe'],windowsHide:true});children.push(parent);
  let log='';parent.stderr.on('data',c=>log+=c);assert.equal(await new Promise(resolve=>parent.on('exit',resolve)),0,log);
  assert.equal(await started(target),'updated');
 }finally{for(const c of children)if(c.exitCode===null)c.kill();await wait(500);await temp.cleanup();}
});
