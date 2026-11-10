// Runs one of the CI's toolchain test groups: node scripts/toolchain-shard.mjs <1|2|3>.
// node --test-shard deals files out by position, which left one job twice as long as another (196 / 99 / 182 s of tests at
// 1.36.0). The groups below are balanced by the time each file took (seconds in the comments, from the 1.46.1 run, where
// the groups had drifted to 185 / 122 / 123 s as examples were added), so a new toolchain test goes into the lightest
// group; tests/unit/toolchain-shards.test.js fails when a file is in no group.
// An entry is a file name, or [file name, test name pattern] for a file whose tests are dealt to different groups
// (arm-examples: one test per board, 68 s and 59 s). The patterns of a file must cover all its tests; the unit test checks
// that for arm-examples.
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';

export const TOOLCHAIN_SHARDS=Object.freeze([
 // 68 + 57 + 10 + 11 = 146
 [['arm-examples','NUCLEO-F446RE'],'ra-build','adc-sampling','adc-group'],
 // 59 + 20 + 21 + 17 + 29 = 146
 [['arm-examples','NUCLEO-F103RB'],'wdg','adc-continuous','bus-instances','ra-course'],
 // 123 + 13 = 136
 ['emu-accuracy','button-bounce','tim-oc','board-links','spi-params','tim-advanced','dac','tim-channels','rtc','uart-params','source-folders','clock-tree','copied-files','tim-basic','dwarf-version'],
]);
/** The file names of a group (an entry with a pattern counts once). */
export const shardFiles=group=>group.map(e=>Array.isArray(e)?e[0]:e);

if(import.meta.url===pathToFileURL(process.argv[1]||'').href){
 const group=TOOLCHAIN_SHARDS[Number(process.argv[2])-1];
 if(!group){console.error(`usage: node scripts/toolchain-shard.mjs <1-${TOOLCHAIN_SHARDS.length}>`);process.exit(2);}
 const base=['--test','--test-reporter=spec','--test-reporter-destination=stdout','--test-reporter=./tests/github-reporter.mjs','--test-reporter-destination=stdout','--test-concurrency=1'];
 const file=name=>`tests/toolchain/${name}.test.mjs`;
 // Whole files in one run, then each patterned entry in a run of its own (a name pattern applies to every file of a run).
 const runs=[[...base,...group.filter(e=>!Array.isArray(e)).map(file)],...group.filter(Array.isArray).map(([name,pattern])=>[...base,`--test-name-pattern=${pattern}`,file(name)])];
 let status=0;
 for(const args of runs){const run=spawnSync(process.execPath,args,{stdio:'inherit'});if(run.status!==0)status=run.status??1;}
 process.exit(status);
}
