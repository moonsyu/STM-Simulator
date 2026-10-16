import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {createDiagnostics} from '../src/diagnostics.js';
import {blankProject} from '../src/project.js';
import {applyDeviceExample} from '../src/device-assistance.js';
const {Diagnostics}=createRequire(import.meta.url)('../desktop/diagnostics.cjs');
async function fixture(t,options){const root=await fs.mkdtemp(path.join(os.tmpdir(),'stm-diagnostics-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));return new Diagnostics(root,'test-version',options);}
test('Docs apply writes matching code, pins, circuit and event hash to local files',async t=>{
 const sink=await fixture(t),p=blankProject();p.components=[{id:'led',type:'led',name:'LED1',x:800,y:350,rotation:0,span:70,color:'red'}];
 const applied=applyDeviceExample(p,{type:'part',id:'led'},{api:'HAL_GPIO_WritePin'}),record=createDiagnostics(input=>sink.record(input),()=>applied.project);
 await record('docs.applied',{binding:applied.binding,report:applied.report},true);await sink.flush();
 const text=await fs.readFile(path.join(sink.directory,'latest-project.stm32lab'),'utf8'),event=JSON.parse(await fs.readFile(path.join(sink.directory,'events.jsonl'),'utf8'));
 assert.deepEqual(JSON.parse(text),applied.project);assert.match(JSON.parse(text).code,/GPIO_PIN_5, GPIO_PIN_SET/);
 assert.equal(event.projectSha256,createHash('sha256').update(text).digest('hex'));assert.equal(event.detail.binding.api,'HAL_GPIO_WritePin');assert.equal(event.version,'test-version');
});
test('queued diagnostic snapshots capture the event state and preserve event ordering',async t=>{
 const sink=await fixture(t);let project=blankProject();const record=createDiagnostics(input=>sink.record(input),()=>project),first=record('docs.applied',{sequence:1},true);
 project=structuredClone(project);project.name='second';const second=record('project.saved',{sequence:2},true);await Promise.all([first,second]);await sink.flush();
 const events=(await fs.readFile(path.join(sink.directory,'events.jsonl'),'utf8')).trim().split('\n').map(JSON.parse);
 assert.deepEqual(events.map(e=>e.detail.sequence),[1,2]);assert.notEqual(events[0].projectSha256,events[1].projectSha256);
 assert.equal(JSON.parse(await fs.readFile(path.join(sink.directory,'latest-project.stm32lab'),'utf8')).name,'second');
});
test('logs rotate, malformed and oversized requests reject, and disk failures do not poison later writes',async t=>{
 const sink=await fixture(t,{maxBytes:700});
 await assert.rejects(sink.record({type:'../escape'}));await assert.rejects(sink.record({type:'bad',detail:{value:'x'.repeat(65537)}}));
 await assert.rejects(sink.record({type:'bad',project:'x'.repeat(2_000_001)}));await assert.rejects(sink.record({type:'bad',project:'{}'}));
 for(let i=0;i<12;i++)await sink.record({type:'test',detail:{i}});
 assert.ok((await fs.stat(path.join(sink.directory,'events.jsonl'))).size<=700);assert.ok((await fs.stat(path.join(sink.directory,'events.previous.jsonl'))).size<=700);
 const obstacle=path.join(sink.directory,'latest-project.tmp');await fs.mkdir(obstacle);
 await assert.rejects(sink.record({type:'project.saved',project:JSON.stringify(blankProject())}));await fs.rmdir(obstacle);
 await sink.record({type:'recovered',project:JSON.stringify(blankProject())});await sink.flush();assert.equal(sink.pending,0);
 assert.equal(JSON.parse((await fs.readFile(path.join(sink.directory,'events.jsonl'),'utf8')).trim().split('\n').at(-1)).type,'recovered');
});
test('diagnostics do not break web mode or app operations when the disk service fails',async()=>{
 await createDiagnostics(null,()=>{throw new Error('must not read');})('app.started',{},true);
 const errors=[],record=createDiagnostics(()=>Promise.reject(new Error('disk full')),()=>blankProject(),e=>errors.push(e));
 await record('first');await record('second');assert.equal(errors.length,1);assert.match(errors[0],/disk full/);
});
