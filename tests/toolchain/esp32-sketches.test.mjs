// Builds every ESP32 sketch the examples put on a board with Arduino CLI and the Espressif esp32 core, the way the
// app builds for a real board (desktop/esp32-build.cjs: esp32:esp32:esp32). The simulator runs these sketches in its
// own interpreter; this shows the same text is also a real Arduino program. Skipped without ARDUINO_CLI.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {LECTURE_EXAMPLES,applyLectureExample} from '../../src/lecture-examples.js';
import {devboardModel} from '../../src/devboards.js';

const cli=process.env.ARDUINO_CLI;
// Every distinct sketch once, named after the first example that uses it.
function sketches(){
 const seen=new Map();
 for(const e of LECTURE_EXAMPLES){
  for(const p of applyLectureExample(e.id).project.components.filter(c=>c.type==='devboard'&&devboardModel(c)?.kind==='esp32')){
   const key=createHash('sha256').update(p.code).digest('hex');if(!seen.has(key))seen.set(key,{name:`${e.code}-${p.name}`.replace(/[^\w-]/g,'_'),code:p.code});
  }
 }
 return [...seen.values()];
}
// Seconds a sketch took to build in CI (1.46.1); WiFi sketches are the slow ones. A sketch not listed counts as 25.
const BUILD_SECONDS={'WF-03-ESP32-1':62,'WF-02-ESP32-1':44,'WF-02-ESP32-2':43,'BT-03-ESP32-1':27,'IOT-01-ESP32-1':22,'FW-09-ESP32-1':17,'BT-02-ESP32-1':14,'FW-08-ESP32-1':13};
function dealSketches(all,shards){
 const jobs=Array.from({length:shards},()=>({seconds:0,list:[]})),cost=s=>BUILD_SECONDS[s.name]??25;
 for(const s of [...all].sort((a,b)=>cost(b)-cost(a)||a.name.localeCompare(b.name))){const job=jobs.reduce((least,j)=>j.seconds<least.seconds?j:least);job.list.push(s);job.seconds+=cost(s);}
 return jobs.map(j=>j.list);
}
test('the sketches are dealt to the CI jobs once each, with about the same build time',()=>{
 const all=sketches(),jobs=dealSketches(all,2),cost=list=>list.reduce((n,s)=>n+(BUILD_SECONDS[s.name]??25),0);
 assert.deepEqual(jobs.flat().map(s=>s.name).sort(),all.map(s=>s.name).sort());
 assert.ok(Math.abs(cost(jobs[0])-cost(jobs[1]))<=30,`${cost(jobs[0])} s / ${cost(jobs[1])} s`);
 assert.deepEqual(dealSketches(all,1)[0].map(s=>s.name).sort(),all.map(s=>s.name).sort());
});
test('the examples have ESP32 sketches to build',()=>{assert.ok(sketches().length>=5);});
test('every example ESP32 sketch compiles with the esp32 core',{skip:!cli&&!process.env.CI_REQUIRE_ESP32&&'ARDUINO_CLI is not set',timeout:3600000},()=>{
 assert.ok(cli,'ARDUINO_CLI must point to arduino-cli');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'stm-esp32-')),failures=[];
 // CI splits the sketches over jobs: ESP32_SHARD="1/2". The slowest go first, each to the job with the least so far.
 const [shard,shards]=(process.env.ESP32_SHARD||'1/1').split('/').map(Number),all=sketches(),mine=dealSketches(all,shards)[shard-1]||[];
 assert.ok(Number.isInteger(shard)&&Number.isInteger(shards)&&shard>=1&&shard<=shards,'ESP32_SHARD is n/m');
 console.log(`building ${mine.length} of ${all.length} sketches (shard ${shard}/${shards})`);
 for(const s of mine){const started=Date.now();
  const dir=path.join(root,s.name);fs.mkdirSync(dir);fs.writeFileSync(path.join(dir,s.name+'.ino'),s.code);
  const r=spawnSync(cli,['compile','--fqbn','esp32:esp32:esp32','--build-cache-path',process.env.ESP32_BUILD_CACHE||path.join(root,'.cache'),dir],{encoding:'utf8'});
  if(r.status!==0)failures.push(`${s.name}\n${(r.stderr||r.stdout||String(r.error)).slice(-2000)}`);
  else console.log(`built ${s.name} in ${Math.round((Date.now()-started)/1000)} s`);
 }
 assert.deepEqual(failures,[]);
});
