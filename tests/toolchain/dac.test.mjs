// DAC (NUCLEO-F446RE) on the ARM GCC build (real STM32CubeF4 HAL) and the firmware emulator, with the MX_DAC_Init the
// Pinout generates: OUT1 (PA4) first set by HAL_DAC_SetValue without a trigger, then a 4-step staircase fed by circular
// DMA on TIM6 TRGO (1 kHz); OUT2 (PA5) a triangle wave on TIM7 TRGO.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {FirmwareSession} from '../../src/firmware-session.js';
import {blankProject} from '../../src/project.js';
import {generateHal} from '../../src/mcu-config.js';

const require=createRequire(import.meta.url),{prepareBuild,build,detectTools}=require('../../desktop/native-build.cjs');
const tools=await detectTools({armGcc:process.env.ARM_GCC||''});
const skip=!(tools.armGcc&&tools.cube)&&!process.env.CI_REQUIRE_TOOLCHAIN&&'ARM GCC / STM32CubeF4 not installed';
const pin=fn=>({function:fn,pull:'NOPULL',edge:'FALLING',label:'',initial:0});
const runTo=(s,ms)=>{for(let t=Math.ceil(s.now/1000)+1;s.now<ms*1000;t++)s.tick(t);};

async function firmware(p,root){
 const result=await build(await prepareBuild({project:p,tools,root,target:'arm'}));
 assert.deepEqual(result.diagnostics.filter(d=>d.severity==='error'),[]);
 return new FirmwareSession(p,{elf:new Uint8Array(await fs.readFile(result.elf))});
}

test('DAC: SetValue on PA4, TIM6 TRGO + circular DMA staircase, TIM7 TRGO triangle on PA5 (emulator)',{skip,timeout:600000},async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'dac-'));
 try{
  // 1) No trigger: the value appears on PA4 as soon as it is written.
  let p=blankProject(),m=p.mcu;p.components=[];p.wires=[];m.pins.PA4=pin('DAC_OUT1');m.peripherals.DAC={enabled:true};
  p.code=generateHal(m,{minimal:true}).replace('  /* USER CODE BEGIN 2 */','  /* USER CODE BEGIN 2 */\n  HAL_DAC_Start(&hdac, DAC_CHANNEL_1);\n  HAL_DAC_SetValue(&hdac, DAC_CHANNEL_1, DAC_ALIGN_12B_R, 2048);');
  let s=await firmware(p,root);runTo(s,20);
  assert.equal(s.gpio.PA4?.mode,'OUTPUT');assert.ok(Math.abs(s.gpio.PA4.value-2048/4095*3.3)<1e-6,JSON.stringify(s.gpio.PA4));
  // 2) TIM6 update (1 kHz at 16 MHz: PSC 15, ARR 999) moves the DMA table to PA4; TIM7 (10 kHz) steps the PA5 triangle.
  p=blankProject();m=p.mcu;p.components=[];p.wires=[];m.pins.PA4=pin('DAC_OUT1');m.pins.PA5=pin('DAC_OUT2');
  m.peripherals.DAC={enabled:true,channels:{OUT1:{trigger:'T6_TRGO'},OUT2:{trigger:'T7_TRGO',wave:'TRIANGLE',amplitude:3}}};
  m.peripherals.TIM6={enabled:true,prescaler:15,period:999,trgo:'UPDATE'};m.peripherals.TIM7={enabled:true,prescaler:15,period:99,trgo:'UPDATE'};
  m.dma={DAC1:{stream:'DMA1_Stream5',channel:7,mode:'circular',priority:'low'}};
  p.code=generateHal(m,{minimal:true}).replace('int main(void) {','const uint16_t steps[4] = {0, 1365, 2730, 4095};\nint main(void) {')
   .replace('  /* USER CODE BEGIN 2 */','  /* USER CODE BEGIN 2 */\n  HAL_DAC_Start_DMA(&hdac, DAC_CHANNEL_1, (uint32_t *)steps, 4, DAC_ALIGN_12B_R);\n  HAL_DAC_Start(&hdac, DAC_CHANNEL_2);\n  HAL_TIM_Base_Start(&htim6);\n  HAL_TIM_Base_Start(&htim7);');
  s=await firmware(p,root);runTo(s,20);
  const seen=new Set(),tri=new Set();
  for(let k=0;k<40;k++){s.tick(Math.ceil(s.now/1000)+1);seen.add(Math.round(s.gpio.PA4.value/3.3*3));for(let j=0;j<10;j++){s.tick(s.now/1000+.1);tri.add(Math.round(s.gpio.PA5.value/3.3*4095));}}
  assert.deepEqual([...seen].sort(),[0,1,2,3],'all four steps of the DMA table');
  assert.deepEqual([...tri].sort((a,b)=>a-b),[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15].filter(v=>v<=15),'triangle 0 → 15 → 0 (MAMP 3)');
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
