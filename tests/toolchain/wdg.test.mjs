// Watchdogs on the ARM GCC build (real STM32Cube HAL) and the firmware emulator, with the MX_IWDG_Init / MX_WWDG_Init the
// Pinout generates. IWDG: three refreshes, then the timeout resets the MCU and the restarted program reads
// RCC_FLAG_IWDGRST. WWDG: the early wakeup callback refreshes at 0x40 and keeps the program alive; without it the
// program is reset and reads RCC_FLAG_WWDGRST.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {FirmwareSession} from '../../src/firmware-session.js';
import {blankProject,projectForBoard} from '../../src/project.js';
import {generateHal} from '../../src/mcu-config.js';
import {iwdgTimeoutMs,wwdgTiming} from '../../src/wdg-config.js';

const require=createRequire(import.meta.url),{prepareBuild,build,detectTools}=require('../../desktop/native-build.cjs');
const tools=await detectTools({armGcc:process.env.ARM_GCC||''});
const skip=!(tools.armGcc&&tools.cube&&tools.cubeF1)&&!process.env.CI_REQUIRE_TOOLCHAIN&&'ARM GCC / STM32CubeF4·F1 not installed';
const pin=fn=>({function:fn,pull:'NOPULL',edge:'FALLING',label:'',initial:0});
const runTo=(s,us)=>{for(let t=Math.floor(s.now/1000)+1;s.now<us;t+=1)s.tick(t);};
// PC0: restarted by the IWDG, PC1: restarted by the WWDG, PC2: toggled by the main loop.
const flags='  if (__HAL_RCC_GET_FLAG(RCC_FLAG_IWDGRST)) HAL_GPIO_WritePin(GPIOC, GPIO_PIN_0, GPIO_PIN_SET);\n  if (__HAL_RCC_GET_FLAG(RCC_FLAG_WWDGRST)) HAL_GPIO_WritePin(GPIOC, GPIO_PIN_1, GPIO_PIN_SET);\n  __HAL_RCC_CLEAR_RESET_FLAGS();\n';

test('IWDG timeout reset and WWDG early wakeup / reset on the emulator (F446RE, F103RB)',{skip,timeout:600000},async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'wdg-'));
 try{
  for(const [board,base]of [['F446RE',blankProject()],['F103RB',projectForBoard('nucleo-f103rb')]]){
   const make=async(peripherals,nvic,edit)=>{
    const p=structuredClone(base),m=p.mcu;p.components=[];p.wires=[];for(const q of ['PC0','PC1','PC2'])m.pins[q]=pin('GPIO_Output');
    Object.assign(m.peripherals,peripherals);Object.assign(m.nvic,nvic);
    p.code=edit(generateHal(m,{minimal:true}).replace('int main(void) {','volatile uint32_t n;\nint main(void) {'));
    const result=await build(await prepareBuild({project:p,tools,root,target:'arm'}));
    assert.deepEqual(result.diagnostics.filter(d=>d.severity==='error'),[],board);
    return {p,s:new FirmwareSession(p,{elf:new Uint8Array(await fs.readFile(result.elf))})};
   };
   // IWDG: refreshes at 0, 20 and 40 ms, then silence: reset one timeout after the last refresh.
   const iwdg={enabled:true,prescaler:32,reload:99};
   let {p,s}=await make({IWDG:iwdg},{},code=>code.replace('  /* USER CODE BEGIN 2 */','  /* USER CODE BEGIN 2 */\n'+flags).replace('    /* USER CODE BEGIN 3 */','    /* USER CODE BEGIN 3 */\n    if (n++ < 3) HAL_IWDG_Refresh(&hiwdg);\n    HAL_Delay(20);'));
   const timeout=iwdgTimeoutMs(iwdg,p.mcu.family);assert.equal(timeout,board==='F103RB'?80:100);
   runTo(s,(40+timeout-8)*1000);assert.equal(s.gpio.PC0?.value,0,`${board}: no IWDG reset before the timeout`);
   runTo(s,(40+timeout+25)*1000);assert.equal(s.gpio.PC0?.value,3.3,`${board}: restarted with RCC_FLAG_IWDGRST`);assert.equal(s.gpio.PC1?.value,0,board);
   // WWDG with the early wakeup interrupt: the callback refreshes, so 300 ms pass without a reset.
   const wwdg={enabled:true,prescaler:8,window:127,counter:127,ewi:true};
   ({p,s}=await make({WWDG:wwdg},{WWDG_IRQn:{enabled:true,priority:0}},code=>code.replace('  /* USER CODE BEGIN 2 */','  /* USER CODE BEGIN 2 */\n'+flags)+'\nvoid HAL_WWDG_EarlyWakeupCallback(WWDG_HandleTypeDef *h) {\n  if (++n >= 3) HAL_GPIO_WritePin(GPIOC, GPIO_PIN_2, GPIO_PIN_SET);\n  HAL_WWDG_Refresh(h);\n}\n'));
   const t=wwdgTiming(wwdg,p.mcu);
   runTo(s,Math.ceil(t.resetMs*4+20)*1000);
   assert.equal(s.gpio.PC2?.value,3.3,`${board}: three early wakeup interrupts`);assert.equal(s.gpio.PC1?.value,0,`${board}: no WWDG reset while the callback refreshes`);
   // WWDG never refreshed: reset when the counter passes 0x40.
   ({p,s}=await make({WWDG:{enabled:true,prescaler:8,window:127,counter:127}},{},code=>code.replace('  /* USER CODE BEGIN 2 */','  /* USER CODE BEGIN 2 */\n'+flags)));
   runTo(s,Math.floor(t.resetMs-3)*1000);assert.equal(s.gpio.PC1?.value,0,`${board}: no WWDG reset before the counter reaches 0x3F`);
   runTo(s,Math.ceil(t.resetMs+25)*1000);assert.equal(s.gpio.PC1?.value,3.3,`${board}: restarted with RCC_FLAG_WWDGRST`);assert.equal(s.gpio.PC0?.value,0,board);
   // WWDG refreshed above the window: reset at once.
   ({p,s}=await make({WWDG:{enabled:true,prescaler:8,window:80,counter:127}},{},code=>code.replace('  /* USER CODE BEGIN 2 */','  /* USER CODE BEGIN 2 */\n'+flags+'  HAL_Delay(5);\n  HAL_WWDG_Refresh(&hwwdg);')));
   runTo(s,30000);assert.equal(s.gpio.PC1?.value,3.3,`${board}: a refresh above the window resets`);
  }
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
