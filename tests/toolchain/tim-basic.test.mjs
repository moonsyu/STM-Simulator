// TIM6/TIM7 basic timers on the ARM GCC build (real STM32CubeF4 HAL) and the firmware emulator (NUCLEO-F446RE), with
// the MX_TIM6_Init / MX_TIM7_Init the Pinout generates (TRGO master configuration included). The interrupt handlers
// TIM6_DAC_IRQHandler and TIM7_IRQHandler come from the build environment (the generated stm32f4xx_it.c), so this also
// checks that TIM6 is served on its shared TIM6_DAC vector.
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
const runTo=(s,us)=>{for(let t=10;s.now<us;t+=10)s.tick(t);};

test('TIM6 (TIM6_DAC_IRQn, 100 ms) and TIM7 (TIM7_IRQn, 250 ms) update interrupts on the emulator',{skip,timeout:600000},async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'tim-basic-'));
 try{
  const p=blankProject(),m=p.mcu;p.components=[];p.wires=[];
  for(const q of ['PC0','PC1','PC2'])m.pins[q]=pin('GPIO_Output');
  // 1 kHz counter clock on both timers (APB1 timer clock / (PSC + 1)).
  m.peripherals.TIM6={enabled:true,prescaler:m.timerClockHz/1000-1,period:99,trgo:'UPDATE'};
  m.peripherals.TIM7={enabled:true,prescaler:m.timerClockHz/1000-1,period:249};
  m.nvic.TIM6_DAC_IRQn={enabled:true,priority:1};m.nvic.TIM7_IRQn={enabled:true,priority:2};
  p.code=generateHal(m,{minimal:true}).replace('int main(void) {','volatile uint32_t six, seven;\nint main(void) {')
   .replace('  /* USER CODE BEGIN 2 */','  /* USER CODE BEGIN 2 */\n  if ((TIM6->CR2 & TIM_CR2_MMS) != TIM_TRGO_UPDATE) HAL_GPIO_WritePin(GPIOC, GPIO_PIN_2, GPIO_PIN_SET);\n  HAL_TIM_Base_Start_IT(&htim6);\n  HAL_TIM_Base_Start_IT(&htim7);')
   +'\nvoid HAL_TIM_PeriodElapsedCallback(TIM_HandleTypeDef *htim) {\n  if (htim->Instance == TIM6 && ++six == 10) HAL_GPIO_WritePin(GPIOC, GPIO_PIN_0, GPIO_PIN_SET);\n  if (htim->Instance == TIM7 && ++seven == 4) HAL_GPIO_WritePin(GPIOC, GPIO_PIN_1, GPIO_PIN_SET);\n}\n';
  assert.doesNotMatch(p.code,/TIM6_DAC_IRQHandler/,'the handler comes from the build environment');
  const result=await build(await prepareBuild({project:p,tools,root,target:'arm'}));
  assert.deepEqual(result.diagnostics.filter(d=>d.severity==='error'),[]);
  const s=new FirmwareSession(p,{elf:new Uint8Array(await fs.readFile(result.elf))});
  runTo(s,950000);
  assert.deepEqual([s.gpio.PC0?.value,s.gpio.PC1?.value,s.gpio.PC2?.value],[0,0,0],'before 1 s: 9 TIM6 and 3 TIM7 updates; TRGO = Update');
  runTo(s,1080000);
  assert.deepEqual([s.gpio.PC0?.value,s.gpio.PC1?.value],[3.3,3.3],'10th TIM6 and 4th TIM7 update at 1 s');
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
