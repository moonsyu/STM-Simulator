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
test('the examples have ESP32 sketches to build',()=>{assert.ok(sketches().length>=5);});
test('every example ESP32 sketch compiles with the esp32 core',{skip:!cli&&!process.env.CI_REQUIRE_ESP32&&'ARDUINO_CLI is not set',timeout:3600000},()=>{
 assert.ok(cli,'ARDUINO_CLI must point to arduino-cli');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'stm-esp32-')),failures=[];
 // CI splits the sketches over jobs: ESP32_SHARD="1/2" builds every second one, starting with the first.
 const [shard,shards]=(process.env.ESP32_SHARD||'1/1').split('/').map(Number),all=sketches(),mine=all.filter((_,i)=>i%shards===shard-1);
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
