// ADC1 Sampling Time on the ARM GCC build (real STM32Cube HAL) and the firmware emulator: HAL_ADC_ConfigChannel writes
// the chosen time into SMPR2, and the conversion time grows with it (F446RE 3 vs 480 cycles, F103RB 7.5 vs 239.5).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {FirmwareSession} from '../../src/firmware-session.js';
import {applyHalExample} from '../../src/hal-examples.js';
import {blankProject,projectForBoard} from '../../src/project.js';
import {generateHal} from '../../src/mcu-config.js';

const require=createRequire(import.meta.url),{prepareBuild,build,detectTools}=require('../../desktop/native-build.cjs');
const tools=await detectTools({armGcc:process.env.ARM_GCC||''});
const skip=!(tools.armGcc&&tools.cube&&tools.cubeF1)&&!process.env.CI_REQUIRE_TOOLCHAIN&&'ARM GCC / STM32CubeF4·F1 not installed';

test('Sampling Time reaches SMPR2 on the emulator and sets the conversion time (F446RE, F103RB)',{skip,timeout:600000},async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'adc-sampling-'));
 try{
  for(const [board,base,times]of [['F446RE',blankProject(),[3,480]],['F103RB',projectForBoard('nucleo-f103rb'),[7.5,239.5]]]){
   const us=[];
   for(const cycles of times){
    const p=applyHalExample(base,'potentiometer');p.mcu.peripherals.ADC1.samplingTime=cycles;p.code=generateHal(p.mcu,{minimal:true});
    const result=await build(await prepareBuild({project:p,tools,root,target:'arm'}));
    assert.deepEqual(result.diagnostics.filter(d=>d.severity==='error'),[],board);
    const s=new FirmwareSession(p,{elf:new Uint8Array(await fs.readFile(result.elf))});
    for(let t=20;t<=100;t+=20)s.tick(t);
    const ch=Number(/ADC1_IN(\d+)/.exec(Object.values(p.mcu.pins).find(q=>q.function.startsWith('ADC1_IN')).function)[1]),adc=s.soc.adcs[0];
    assert.equal(adc.sampleCycles(ch),cycles,`${board} SMPR channel ${ch}`);us.push(adc.conversionUs(ch));
   }
   assert.ok(us[1]>us[0]*5,`${board}: ${us.map(v=>v.toFixed(2)).join(' → ')} µs`);
  }
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
