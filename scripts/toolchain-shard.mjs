// Runs one of the CI's toolchain test groups: node scripts/toolchain-shard.mjs <1-5>.
// node --test-shard deals files out by position, which left one job twice as long as another, so the groups are listed
// here by measured time. The seconds in the comments are from one run (1.46.3, CI 42807689195) on runners with the same
// CPU (AMD EPYC 7763, 4 cores; the one job on a faster CPU scaled by its benchmark) — times taken from jobs on different
// runners are not comparable: the same test took 0.6 to 1.8 times as long from one job to another, and the first
// regrouping (1.46.2) was made from such numbers and came out uneven. The line "runner: … benchmark: …" each job prints
// says what it ran on. A new toolchain test goes into the lightest group; tests/unit/toolchain-shards.test.js fails
// when a file is in no group.
// An entry is a file name, or [file name, test name pattern] for a file whose tests are dealt to different groups
// (arm-examples: one test per board). The patterns of a file must cover all its tests; the unit test checks that.
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import os from 'node:os';

export const TOOLCHAIN_SHARDS=Object.freeze([
 // 70 + 57 = 127
 [['arm-examples','NUCLEO-F446RE'],'ra-course'],
 // 58 + 62 = 120
 [['arm-examples','NUCLEO-F103RB'],'ra-build'],
 // 38 + 32 + 28 + 26 = 124
 ['button-bounce','wdg','bus-instances','adc-continuous'],
 // 26 + 23 + 22 + 17 + 17 + 16 = 121
 ['emu-accuracy','dwarf-version','board-links','copied-files','tim-oc','adc-group'],
 // 16 + 15 + 14 + 13 + 11 + 9 + 9 + 9 + 9 + 6 = 111
 ['adc-sampling','clock-tree','tim-advanced','dac','rtc','source-folders','spi-params','tim-channels','uart-params','tim-basic'],
]);
/** The file names of a group (an entry with a pattern counts once). */
export const shardFiles=group=>group.map(e=>Array.isArray(e)?e[0]:e);

if(import.meta.url===pathToFileURL(process.argv[1]||'').href){
 const group=TOOLCHAIN_SHARDS[Number(process.argv[2])-1];
 const only=process.argv[2]==='benchmark';
 if(!group&&!only){console.error(`usage: node scripts/toolchain-shard.mjs <1-${TOOLCHAIN_SHARDS.length}|benchmark>`);process.exit(2);}
 // What this runner is: hosted runners differ (the same test took 0.6 to 1.8 times as long from one job to another at
 // 1.46.2), so a job's time is read against this line — the CPU, and a fixed piece of JavaScript and of compiling.
 {const cpus=os.cpus(),t0=process.hrtime.bigint();let x=0;for(let i=0;i<150000000;i++)x=(x+i*i)|0;const js=Number(process.hrtime.bigint()-t0)/1e6;
  let gcc='-';if(process.env.ARM_GCC){const source=Array.from({length:400},(_,i)=>`int f${i+1}(int a){int s=0;for(int i=0;i<a;i++)s+=i*i+${i};return s;}`).join('\n');
   const t1=process.hrtime.bigint(),r=spawnSync(process.env.ARM_GCC,['-O2','-mcpu=cortex-m4','-mthumb','-c','-x','c','-','-o',os.platform()==='win32'?'NUL':'/dev/null'],{input:source});gcc=r.status===0?Math.round(Number(process.hrtime.bigint()-t1)/1e6)+' ms':'failed';}
  console.log(`runner: ${cpus[0]?.model?.trim()} x${cpus.length}, ${Math.round(os.totalmem()/2**30)} GB · benchmark: JavaScript ${Math.round(js)} ms, ARM GCC ${gcc} (${x&1})`);}
 if(only)process.exit(0);
 const base=['--test','--test-reporter=spec','--test-reporter-destination=stdout','--test-reporter=./tests/github-reporter.mjs','--test-reporter-destination=stdout','--test-concurrency=1'];
 const file=name=>`tests/toolchain/${name}.test.mjs`;
 // Whole files in one run, then each patterned entry in a run of its own (a name pattern applies to every file of a run).
 const runs=[[...base,...group.filter(e=>!Array.isArray(e)).map(file)],...group.filter(Array.isArray).map(([name,pattern])=>[...base,`--test-name-pattern=${pattern}`,file(name)])];
 let status=0;
 for(const args of runs){const run=spawnSync(process.execPath,args,{stdio:'inherit'});if(run.status!==0)status=run.status??1;}
 process.exit(status);
}
