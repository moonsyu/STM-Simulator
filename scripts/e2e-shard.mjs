// Runs one of the CI's E2E jobs: node scripts/e2e-shard.mjs <n>/<of> (for example 2/6).
// node --test-shard deals the files out by position, and the heavy ones happened to land together: at 1.46.3 one job
// had devboards, workflow and adc-continuous (153 s of tests) while the others took 68 to 99 s. Here the files are
// dealt by the time they took (CI 42815651634, seconds below), the slowest first, each to the job with the least so
// far. A file that is not listed counts as 5 s, so a new test file needs no entry until it is slow.
import {spawnSync} from 'node:child_process';
import {readdirSync} from 'node:fs';
import {pathToFileURL} from 'node:url';

export const E2E_SECONDS=Object.freeze({ra6e1:65,devboards:53,emulator:39,shell:39,workflow:38,'adc-continuous':25,'sim-gcc':19,'peripheral-params':12,storage:11,
 rtc:9,'board-reset':9,help:9,'project-structure':8,'variable-graph':7,definition:6,'adc-group':6});
const nameOf=file=>file.replace(/\.e2e\.test\.mjs$/,'');
/** The files of each of `jobs` jobs. */
export function dealE2e(files,jobs){
 const cost=f=>E2E_SECONDS[nameOf(f)]??5,groups=Array.from({length:jobs},()=>({seconds:0,files:[]}));
 for(const f of [...files].sort((a,b)=>cost(b)-cost(a)||a.localeCompare(b))){const g=groups.reduce((least,x)=>x.seconds<least.seconds?x:least);g.files.push(f);g.seconds+=cost(f);}
 return groups;
}
export const e2eFiles=()=>readdirSync(new URL('../tests/e2e/',import.meta.url)).filter(f=>f.endsWith('.test.mjs')).sort();

if(import.meta.url===pathToFileURL(process.argv[1]||'').href){
 const [shard,jobs]=(process.argv[2]||'').split('/').map(Number);
 if(!Number.isInteger(shard)||!Number.isInteger(jobs)||shard<1||shard>jobs){console.error('usage: node scripts/e2e-shard.mjs <n>/<of>');process.exit(2);}
 const group=dealE2e(e2eFiles(),jobs)[shard-1];
 console.log(`E2E job ${shard}/${jobs}: ${group.files.length} files, about ${group.seconds} s — ${group.files.map(nameOf).join(', ')}`);
 if(!group.files.length)process.exit(0);
 const run=spawnSync(process.execPath,['--test','--test-reporter=spec','--test-reporter-destination=stdout','--test-reporter=./tests/github-reporter.mjs','--test-reporter-destination=stdout','--test-concurrency=1',...group.files.map(f=>`tests/e2e/${f}`)],{stdio:'inherit'});
 process.exit(run.status??1);
}
