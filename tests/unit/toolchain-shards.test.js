// The CI runs the toolchain tests in groups (scripts/toolchain-shard.mjs): a test file left out of every group would
// never run, so each file must be in a group — once, or once per test name pattern when its tests are dealt to
// different groups, and then the patterns must cover every test of the file.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readdirSync,readFileSync} from 'node:fs';
import {TOOLCHAIN_SHARDS,shardFiles} from '../../scripts/toolchain-shard.mjs';

test('every toolchain test file is in a CI group, split files are covered by their patterns, and the workflow runs each group',()=>{
 // esp32-sketches has its own job (Arduino CLI, not ARM GCC).
 const files=readdirSync(new URL('../toolchain/',import.meta.url)).filter(f=>f.endsWith('.test.mjs')).map(f=>f.replace('.test.mjs','')).filter(f=>f!=='esp32-sketches').sort();
 const entries=TOOLCHAIN_SHARDS.flat(),whole=entries.filter(e=>!Array.isArray(e)),split=entries.filter(Array.isArray);
 assert.deepEqual([...new Set(TOOLCHAIN_SHARDS.flatMap(shardFiles))].sort(),files);
 assert.equal(new Set(whole).size,whole.length,'a whole file is in one group only');
 for(const [name]of split)assert.ok(!whole.includes(name),name+' is split and also listed whole');
 // Each test of a split file matches exactly one of its patterns (so it runs once), and each pattern matches a test.
 for(const name of new Set(split.map(e=>e[0]))){
  const patterns=split.filter(e=>e[0]===name).map(e=>e[1]),source=readFileSync(new URL(`../toolchain/${name}.test.mjs`,import.meta.url),'utf8');
  // arm-examples has one test per board, named from its BOARDS list: for(const board of BOARDS)test(`${board.name}: …`).
  const perBoard=/for\(const board of BOARDS\)test\(`\$\{board\.name\}:/.test(source);
  const titles=perBoard?[...source.matchAll(/^ \{name:'([^']+)'/gm)].map(m=>m[1]+': every example'):[...source.matchAll(/^test\('([^']+)'/gm)].map(m=>m[1]);
  assert.ok(titles.length>0,name+': its test names are found');
  assert.ok(titles.length>=patterns.length,name);
  for(const title of titles)assert.equal(patterns.filter(p=>new RegExp(p).test(title)).length,1,`${name}: "${title}" runs once`);
  for(const p of patterns)assert.ok(titles.some(t=>new RegExp(p).test(t)),`${name}: pattern ${p} matches a test`);
 }
 const workflow=readFileSync(new URL('../../.github/workflows/build-windows.yml',import.meta.url),'utf8');
 assert.match(workflow,/run: node scripts\/toolchain-shard\.mjs \$\{\{ matrix\.shard \}\}/);
 const shards=workflow.match(/firmware:[\s\S]*?shard: \[([\d, ]+)\]/)[1].split(',').map(Number);
 assert.deepEqual(shards,TOOLCHAIN_SHARDS.map((_,i)=>i+1));
});
