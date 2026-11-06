// ADC1 Continuous Conversion Mode on the ARM GCC build (real STM32Cube HAL) and the firmware emulator: one
// HAL_ADC_Start, then HAL_ADC_GetValue follows the potentiometer (single mode keeps the first result), on both boards.
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
function program(continuous,base){
 const p=applyHalExample(base,'potentiometer');if(continuous)p.mcu.peripherals.ADC1.continuous=true;
 p.code=generateHal(p.mcu,{minimal:true}).replace('/* USER CODE BEGIN PV */','/* USER CODE BEGIN PV */\nvolatile uint32_t adc_val;').replace('  /* USER CODE BEGIN 2 */','  /* USER CODE BEGIN 2 */\n  HAL_ADC_Start(&hadc1);').replace('    /* USER CODE BEGIN 3 */','    /* USER CODE BEGIN 3 */\n    adc_val = HAL_ADC_GetValue(&hadc1);\n    HAL_Delay(20);');
 return p;
}

test('continuous ADC on the emulator: GetValue follows the wiper after one Start; single mode does not (F446RE and F103RB)',{skip,timeout:600000},async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'adc-cont-'));
 try{
  for(const [board,base]of [['F446RE',blankProject()],['F103RB',projectForBoard('nucleo-f103rb')]])for(const continuous of [true,false]){
   const p=program(continuous,base),result=await build(await prepareBuild({project:p,tools,root,target:'arm'}));
   const warnings=[],s=new FirmwareSession(p,{elf:new Uint8Array(await fs.readFile(result.elf)),warn:w=>warnings.push(w)});
   const until=ms=>{for(let t=Math.ceil(s.now/1000/20)*20+20;t<=ms;t+=20)s.tick(t);};
   until(300);const first=s.readVariable('adc_val');assert.ok(first>1900&&first<2200,`${board} start ${first}`);
   assert.deepEqual(warnings,[],`${board}: no hint while the input has not moved`);
   // The session's model part reads the position from the project's part (catalog-model.js), as the property panel changes it.
   p.components.find(c=>c.type==='ref_pot_bare_3').position=90;s.dirty=true;
   until(700);const later=s.readVariable('adc_val');
   if(continuous)assert.ok(later>3500,`${board} continuous follows: ${later}`);else assert.ok(Math.abs(later-first)<60,`${board} single keeps ${first}: ${later}`);
   // Single mode read again after the wiper moved: the emulator says so once, as the built-in interpreter does.
   if(continuous)assert.deepEqual(warnings,[],board);
   else{assert.equal(warnings.length,1,`${board}: ${warnings.join('|')}`);assert.match(warnings[0],/ADC1: 단일 변환 모드[\s\S]*Pinout의 ADC1에서 Continuous Conversion Mode/);}
  }
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
