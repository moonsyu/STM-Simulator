// Runs one of the CI's toolchain test groups: node scripts/toolchain-shard.mjs <1|2|3>.
// node --test-shard deals files out by position, which left one job twice as long as another (196 / 99 / 182 s of tests at
// 1.36.0). The groups below are balanced by the time each file took in that run (seconds in the comments), so a new
// toolchain test goes into the lightest group; tests/unit/toolchain-shards.test.js fails when a file is in no group.
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';

export const TOOLCHAIN_SHARDS=Object.freeze([
 // 106 + 56
 ['arm-examples','ra-build'],
 // 33 + 29 + 28 + 27 + 27 + 15
 ['wdg','adc-sampling','bus-instances','adc-continuous','adc-group','dwarf-version'],
 // 23 + 15 + 14 + 13 + 13 + 11 + 10 + 10 + 10 + 9 + 9 + 8 + 6
 ['emu-accuracy','button-bounce','tim-oc','board-links','spi-params','tim-advanced','dac','tim-channels','rtc','uart-params','source-folders','clock-tree','copied-files','tim-basic'],
]);

if(import.meta.url===pathToFileURL(process.argv[1]||'').href){
 const group=TOOLCHAIN_SHARDS[Number(process.argv[2])-1];
 if(!group){console.error(`usage: node scripts/toolchain-shard.mjs <1-${TOOLCHAIN_SHARDS.length}>`);process.exit(2);}
 const run=spawnSync(process.execPath,['--test','--test-reporter=spec','--test-reporter-destination=stdout','--test-reporter=./tests/github-reporter.mjs','--test-reporter-destination=stdout','--test-concurrency=1',...group.map(name=>`tests/toolchain/${name}.test.mjs`)],{stdio:'inherit'});
 process.exit(run.status??1);
}
