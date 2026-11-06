// TIM PWM Generation CHn settings on the ARM GCC build (real STM32Cube HAL) and the firmware emulator: TIM2 CH1
// (Pulse 250, PWM1, High) and CH2 (Pulse 750, PWM2, Low) of a 1000-count period drive their pins at 25 % and 75 %
// high time, on both boards.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {FirmwareSession} from '../../src/firmware-session.js';
import {blankProject,projectForBoard} from '../../src/project.js';
import {generateHal} from '../../src/mcu-config.js';
import {twoChannels} from '../unit/helpers/tim-channels.js';

const require=createRequire(import.meta.url),{prepareBuild,build,detectTools}=require('../../desktop/native-build.cjs');
const tools=await detectTools({armGcc:process.env.ARM_GCC||''});
const skip=!(tools.armGcc&&tools.cube&&tools.cubeF1)&&!process.env.CI_REQUIRE_TOOLCHAIN&&'ARM GCC / STM32CubeF4·F1 not installed';

test('two PWM channels with their own Pulse / mode / polarity on the emulator (F446RE and F103RB)',{skip,timeout:600000},async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'tim-ch-'));
 try{
  for(const [board,base]of [['F446RE',blankProject()],['F103RB',projectForBoard('nucleo-f103rb')]]){
   const p=twoChannels(base,{CH2:{pulse:750,ocMode:'PWM2',polarity:'LOW'}});
   p.code=generateHal(p.mcu,{minimal:true}).replace('  /* USER CODE BEGIN 2 */','  /* USER CODE BEGIN 2 */\n  HAL_TIM_PWM_Start(&htim2, TIM_CHANNEL_1);\n  HAL_TIM_PWM_Start(&htim2, TIM_CHANNEL_2);');
   const result=await build(await prepareBuild({project:p,tools,root,target:'arm'}));
   assert.deepEqual(result.diagnostics.filter(d=>d.severity==='error'),[],board);
   const s=new FirmwareSession(p,{elf:new Uint8Array(await fs.readFile(result.elf))});
   for(let t=20;t<=200;t+=20)s.tick(t);
   const pins=Object.entries(p.mcu.pins).filter(([,q])=>/^TIM2_CH[12]$/.test(q.function)).sort((a,b)=>a[1].function.localeCompare(b[1].function)).map(([pin])=>pin);
   const duty=pin=>s.gpio[pin]?.pwm?.duty;
   assert.ok(Math.abs(duty(pins[0])-0.25)<0.01,`${board} CH1 ${pins[0]}: ${JSON.stringify(s.gpio[pins[0]])}`);
   assert.ok(Math.abs(duty(pins[1])-0.75)<0.01,`${board} CH2 ${pins[1]} (PWM2, Low): ${JSON.stringify(s.gpio[pins[1]])}`);
  }
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
