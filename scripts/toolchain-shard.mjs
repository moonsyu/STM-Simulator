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
 // fsp-interp-parity (feature 42) has eight tests, in groups 1-6, measured locally at 9-22 s (an FSP build and two
 // 2 s runs per example): the heaviest goes with the lightest group.
 // ra-course's test that builds and runs every FSP example took 78 s on a faster runner (1.46.6): about 94, on its own
 // + parity of ADC, AGT, IIC (22 s locally) + parity of the WDT example (10 s locally)
 // + five review programs of ra-lpm (about 17 s locally)
 // + the first review test of ra-transfer (feature 36: four FSP builds on both engines, about 17 s locally)
 // + three review tests of ra-usb (feature 41: five FSP builds on both engines)
 [['ra-course','contact bounce on'],['fsp-interp-parity','parity: ra_adc_pot|parity: ra_wdt_reset'],['ra-lpm','review: (agt|iwdt|rtc|wdt|hold) —'],['ra-transfer','^review 1'],['ra-usb','^(reads of 200|a system reset|PullUp off)']],
 // 70 + 28 = 98 + parity of blink and IRQ (14 s locally)
 // + parity of the RTC example (11 s locally)
 // + parity of the low power example (feature 37)
 // + ra-iic-slave (feature 33: four FSP builds, about 18 s locally)
 // + the second review test of ra-transfer (feature 36: five FSP builds on both engines, about 20 s locally)
 // + four review tests of ra-usb (feature 41: five FSP builds on both engines)
 [['arm-examples','NUCLEO-F446RE'],'bus-instances',['fsp-interp-parity','parity: ra_blink|parity: ra_rtc_clock|parity: ra_lpm_deep'],'ra-iic-slave',['ra-transfer','^review 2'],['ra-usb','^(a program that leaves|R_USB_Write of 0|a copy of g_basic0_cfg|the USB stack removed)']],
 // 58 + 38 = 96 + parity of polling and rising IRQ (18 s locally)
 // + the register-start WDT test of ra-wdt-rtc (feature 35: about 16 s locally)
 // + ra-flash (feature 39: fourteen FSP builds with the review's two-engine checks, about 60 s locally)
 [['arm-examples','NUCLEO-F103RB'],'button-bounce',['fsp-interp-parity','parity: ra_button_poll'],['ra-wdt-rtc','the real r_wdt in register-start mode'],'ra-flash'],
 // 62 + 32 + 6 = 100 + parity of the challenge (9 s locally) + ra-spi (about 6 locally, 1.51.x)
 // + the IWDT and WDT NMI tests of ra-wdt-rtc (feature 35: about 13 s locally)
 // + four review programs of ra-lpm (about 11 s locally)
 // + ra-transfer but its review tests (feature 36: five FSP builds with ELC, DTC and DMAC on both engines, about 17 s locally)
 ['ra-build','wdg','tim-basic','ra-spi',['ra-transfer','^(r_|the example)'],['fsp-interp-parity','parity: ra_led4_switch2'],['ra-wdt-rtc','IWDT: OFS0|WDT NMI:'],['ra-lpm','review: (isr|isrsleep|pending|flags) —']],
 // the rest of ra-course 61 + 26 + 15 = 102 + parity of UART and GPT (16 s locally)
 // (the tests are named: a "not this one" pattern with a lookahead did not keep the heavy test out)
 // + ra-lpm (feature 37: programs with r_lpm on both engines, about 3 s each locally): its first four tests here (13 s),
 //   the review programs in groups 1, 4 and 7
 // + the first three tests of ra-usb (feature 41: three FSP builds on both engines, about 14 s locally; its review tests
 //   in groups 1 and 2) and the parity of the USB example (10 s locally)
 [['ra-course','Bare Metal - Blinky|switch polling toggles|the challenge:|BSP tab sizes|as the course screen shows it'],'adc-continuous','clock-tree',['ra-usb','^(echo on both engines|R_USB_\\* return codes|the callback \\(Stacks)'],['fsp-interp-parity','parity: ra_uart_echo|parity: ra_usb_cdc_echo'],['ra-lpm','^R_LPM_\\* return codes|^Software Standby on both engines|^Deep Software Standby on both engines|^a Software Standby nothing can end']],
 // 26 + 23 + 22 + 17 + 16 = 104 + parity of the SPI memory (15 s locally, 1.51.x)
 // + the two-engine review tests of ra-wdt-rtc ("on both engines") + parity of the flash counter (feature 39)
 // + parity of the ELC + DTC example (feature 36, about 8 s locally)
 // + ra-can but its review tests (feature 40: five FSP builds on both engines, about 15 s locally) and the parity of the CAN example
 ['emu-accuracy','dwarf-version','board-links','copied-files','adc-group','peripheral-files','project-overrides',['ra-can','^(loopback example|return codes|acceptance filter|extended ID mode|message lost)'],['fsp-interp-parity','parity: ra_spi_memory|parity: ra_flash_counter|parity: ra_elc_adc_dtc|parity: ra_can_loopback'],['ra-wdt-rtc','on both engines']],
 // 17 + 16 + 14 + 13 + 11 + 9 + 9 + 9 + 9 = 107
 // + the RTC tests of ra-wdt-rtc (feature 34: about 22 s locally)
 ['tim-oc','adc-sampling','tim-advanced','dac','rtc','source-folders','spi-params','tim-channels','uart-params',['ra-wdt-rtc','RTC \\(ra_rtc_clock\\)|RTC start time'],
  // + five review programs of ra-lpm (about 13 s locally)
  ['ra-lpm','review: (holdpwm|pwm|wfe|uart|rtcsleep) —'],
  // + the review tests of ra-can (feature 40: nine FSP builds on both engines, about 23 s locally)
  ['ra-can','^review']],
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
