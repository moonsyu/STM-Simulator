// ADC1 regular group on the ARM GCC build (real STM32Cube HAL) and the firmware emulator with the generated code:
// two conversions per group (scan) started by TIM3's TRGO (update event) instead of software, read in
// HAL_ADC_ConvCpltCallback (both boards).
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

test('scan of two ranks triggered by TIM3 TRGO: conversions come at the timer rate with the potentiometer value (F446RE, F103RB)',{skip,timeout:600000},async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'adc-group-'));
 try{
  for(const [board,base]of [['F446RE',blankProject()],['F103RB',projectForBoard('nucleo-f103rb')]]){
   const p=applyHalExample(base,'potentiometer'),m=p.mcu,f1=board==='F103RB';
   Object.assign(m.peripherals.ADC1,{conversions:2,trigger:'T3_TRGO'});m.peripherals.TIM3={enabled:true,prescaler:m.timerClockHz/10000-1,period:999,trgo:'UPDATE'};m.nvic[f1?'ADC1_2_IRQn':'ADC_IRQn']={enabled:true,priority:1};
   p.code=generateHal(m,{minimal:true}).replace('/* USER CODE BEGIN PV */','/* USER CODE BEGIN PV */\nvolatile uint32_t adc_val, adc_count;')
    .replace('  /* USER CODE BEGIN 2 */','  /* USER CODE BEGIN 2 */\n  HAL_ADC_Start_IT(&hadc1);\n  HAL_TIM_Base_Start(&htim3);')
    +'\nvoid HAL_ADC_ConvCpltCallback(ADC_HandleTypeDef *h) {\n  adc_val = HAL_ADC_GetValue(h);\n  adc_count++;\n}\n';
   assert.match(p.code,/NbrOfConversion = 2;/);assert.match(p.code,/ADC_EXTERNALTRIGCONV_T3_TRGO/);
   const result=await build(await prepareBuild({project:p,tools,root,target:'arm'}));
   assert.deepEqual(result.diagnostics.filter(d=>d.severity==='error'),[],board);
   const s=new FirmwareSession(p,{elf:new Uint8Array(await fs.readFile(result.elf))});
   for(let t=20;t<=80;t+=20)s.tick(t);
   assert.equal(s.readVariable('adc_count'),0,`${board}: no conversion before the first TIM3 update (100 ms)`);
   for(let t=100;t<=1060;t+=20)s.tick(t);
   // F4 (EOC per conversion): 2 callbacks per trigger; F1 (EOC at the end of the group): 1 per trigger. 10 triggers in 1 s.
   const count=s.readVariable('adc_count'),value=s.readVariable('adc_val'),expected=f1?10:20;
   assert.ok(Math.abs(count-expected)<=2,`${board}: ${count} callbacks, expected about ${expected}`);
   assert.ok(value>1900&&value<2200,`${board}: value ${value}`);
  }
 }finally{await fs.rm(root,{recursive:true,force:true});}
});

test('One Pulse Mode: HAL_TIM_OnePulse_Init from the generated code gives exactly one update interrupt (F446RE, F103RB)',{skip,timeout:600000},async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'tim-opm-'));
 try{
  for(const [board,base]of [['F446RE',blankProject()],['F103RB',projectForBoard('nucleo-f103rb')]]){
   const p=structuredClone(base),m=p.mcu;p.components=[];p.wires=[];
   m.peripherals.TIM2={enabled:true,prescaler:m.timerClockHz/10000-1,period:999,onePulse:true};m.nvic.TIM2_IRQn={enabled:true,priority:1};
   p.code=generateHal(m,{minimal:true}).replace('/* USER CODE BEGIN PV */','/* USER CODE BEGIN PV */\nvolatile uint32_t ups;').replace('  /* USER CODE BEGIN 2 */','  /* USER CODE BEGIN 2 */\n  HAL_TIM_Base_Start_IT(&htim2);')
    +'\nvoid HAL_TIM_PeriodElapsedCallback(TIM_HandleTypeDef *h) {\n  (void)h;\n  ups++;\n}\n';
   const result=await build(await prepareBuild({project:p,tools,root,target:'arm'}));
   assert.deepEqual(result.diagnostics.filter(d=>d.severity==='error'),[],board);
   const s=new FirmwareSession(p,{elf:new Uint8Array(await fs.readFile(result.elf))});
   for(let t=20;t<=80;t+=20)s.tick(t);assert.equal(s.readVariable('ups'),0,board);
   for(let t=100;t<=600;t+=20)s.tick(t);assert.equal(s.readVariable('ups'),1,`${board}: one update at 100 ms, then the counter is stopped`);
   assert.equal(s.soc.timers.TIM2.get(0)&1,0,`${board}: CEN cleared`);
  }
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
