// The CI runs the toolchain tests in groups (scripts/toolchain-shard.mjs): a test file left out of every group would
// never run, so each file must be in exactly one.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readdirSync,readFileSync} from 'node:fs';
import {TOOLCHAIN_SHARDS} from '../../scripts/toolchain-shard.mjs';

test('every toolchain test file is in exactly one CI group, and the workflow runs each group',()=>{
 // esp32-sketches has its own job (Arduino CLI, not ARM GCC).
 const files=readdirSync(new URL('../toolchain/',import.meta.url)).filter(f=>f.endsWith('.test.mjs')).map(f=>f.replace('.test.mjs','')).filter(f=>f!=='esp32-sketches').sort();
 assert.deepEqual(TOOLCHAIN_SHARDS.flat().sort(),files);
 const workflow=readFileSync(new URL('../../.github/workflows/build-windows.yml',import.meta.url),'utf8');
 assert.match(workflow,/run: node scripts\/toolchain-shard\.mjs \$\{\{ matrix\.shard \}\}/);
 const shards=workflow.match(/firmware:[\s\S]*?shard: \[([\d, ]+)\]/)[1].split(',').map(Number);
 assert.deepEqual(shards,TOOLCHAIN_SHARDS.map((_,i)=>i+1));
});
