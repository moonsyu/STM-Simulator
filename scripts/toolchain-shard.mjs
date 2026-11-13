// Runs one of the CI's toolchain test groups: node scripts/toolchain-shard.mjs <1-7>.
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

const file=name=>`tests/toolchain/${name}.test.mjs`;
/** The `node --test` runs of a group: its whole files in one run, then each patterned entry in a run of its own (a name
 * pattern applies to every file of a run). A group with no whole file has no first run — `node --test` without a file
 * runs every test of the repository (1.47.0: group 1 was one patterned entry and its job never finished). */
export function shardRuns(group){
 const whole=group.filter(e=>!Array.isArray(e)).map(file);
 return [...(whole.length?[whole]:[]),...group.filter(Array.isArray).map(([name,pattern])=>[`--test-name-pattern=${pattern}`,file(name)])];
}
export const TOOLCHAIN_SHARDS=Object.freeze([
 // fsp-interp-parity (feature 42) has five tests, one per group 1-5, measured locally at 9-22 s (an FSP build and two
 // 2 s runs per example): the heaviest goes with the lightest group.
 // ra-course's test that builds and runs every FSP example took 78 s on a faster runner (1.46.6): about 94, on its own
 // + parity of ADC, AGT, IIC (22 s locally)
 [['ra-course','contact bounce on'],['fsp-interp-parity','parity: ra_adc_pot']],
 // 70 + 28 = 98 + parity of blink and IRQ (14 s locally)
 [['arm-examples','NUCLEO-F446RE'],'bus-instances',['fsp-interp-parity','parity: ra_blink']],
 // 58 + 38 = 96 + parity of polling and rising IRQ (18 s locally)
 [['arm-examples','NUCLEO-F103RB'],'button-bounce',['fsp-interp-parity','parity: ra_button_poll']],
 // 62 + 32 + 6 = 100 + parity of the challenge (9 s locally)
 ['ra-build','wdg','tim-basic',['fsp-interp-parity','parity: ra_led4_switch2']],
 // the rest of ra-course 61 + 26 + 15 = 102 + parity of UART and GPT (16 s locally)
 // (the tests are named: a "not this one" pattern with a lookahead did not keep the heavy test out)
 [['ra-course','Bare Metal - Blinky|switch polling toggles|the challenge:|BSP tab sizes|as the course screen shows it'],'adc-continuous','clock-tree',['fsp-interp-parity','parity: ra_uart_echo']],
 // 26 + 23 + 22 + 17 + 16 = 104
 ['emu-accuracy','dwarf-version','board-links','copied-files','adc-group','peripheral-files','project-overrides'],
 // 17 + 16 + 14 + 13 + 11 + 9 + 9 + 9 + 9 = 107
 ['tim-oc','adc-sampling','tim-advanced','dac','rtc','source-folders','spi-params','tim-channels','uart-params'],
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
 const runs=shardRuns(group).map(args=>[...base,...args]);
 let status=0;
 for(const args of runs){const run=spawnSync(process.execPath,args,{stdio:'inherit'});if(run.status!==0)status=run.status??1;}
 process.exit(status);
}
