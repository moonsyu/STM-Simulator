// The CI runs the E2E files in jobs dealt by measured time (scripts/e2e-shard.mjs): every file must be in exactly one
// job, the jobs about equal, and the workflow must run as many jobs as it deals.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dealE2e,e2eFiles,E2E_SECONDS} from '../../scripts/e2e-shard.mjs';

test('every E2E file is in exactly one job; the jobs take about the same time; the workflow runs each of them',()=>{
 const files=e2eFiles();assert.ok(files.length>=40,String(files.length));
 const workflow=readFileSync(new URL('../../.github/workflows/build-windows.yml',import.meta.url),'utf8');
 const jobs=workflow.match(/\n  e2e:[\s\S]*?shard: \[([\d, ]+)\]/)[1].split(',').map(Number);
 assert.deepEqual(jobs,jobs.map((_,i)=>i+1));
 assert.match(workflow,new RegExp(`node scripts/e2e-shard\\.mjs \\$\\{\\{ matrix\\.shard \\}\\}/${jobs.length} `));
 const groups=dealE2e(files,jobs.length);
 assert.deepEqual(groups.flatMap(g=>g.files).sort(),files);
 const seconds=groups.map(g=>g.seconds);assert.ok(Math.max(...seconds)-Math.min(...seconds)<=20,seconds.join(' / '));
 // Every listed time belongs to a file that exists (a renamed test would silently count as 5 s).
 for(const name of Object.keys(E2E_SECONDS))assert.ok(files.includes(name+'.e2e.test.mjs'),name);
 // One job gets everything; more jobs than files leaves the extra ones empty.
 assert.deepEqual(dealE2e(files,1)[0].files.slice().sort(),files);
 assert.equal(dealE2e(files.slice(0,2),4).filter(g=>g.files.length).length,2);
});
