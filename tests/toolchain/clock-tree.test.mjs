// Clock Configuration on the ARM GCC build (real STM32Cube HAL) and the firmware emulator: the fastest trees from the
// ST-LINK's 8 MHz (HSE BYPASS) — F446RE PLL 180 MHz with over-drive, F103RB PLL 72 MHz — start, and the HAL reports
// the clocks the Clock tab shows while USART2 still talks to the VCP at 115200 baud.
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
import {CLOCK_PRESETS} from '../../src/clock-ui.js';
import {clockFrequencies} from '../../src/clock-tree.js';

const require=createRequire(import.meta.url),{prepareBuild,build,detectTools}=require('../../desktop/native-build.cjs');
const tools=await detectTools({armGcc:process.env.ARM_GCC||''});
const skip=!(tools.armGcc&&tools.cube&&tools.cubeF1)&&!process.env.CI_REQUIRE_TOOLCHAIN&&'ARM GCC / STM32CubeF4·F1 not installed';

test('HSE PLL trees on the emulator: SystemCoreClock and PCLK1/PCLK2 as the Clock tab computes, UART at 115200',{skip,timeout:600000},async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'clock-tree-'));
 try{
  for(const [board,base]of [['F446RE',blankProject()],['F103RB',projectForBoard('nucleo-f103rb')]]){
   const p=applyHalExample(base,'uart'),family=p.mcu.family;p.mcu.clock={...CLOCK_PRESETS[family].find(x=>x.id==='max').tree};
   const q=clockFrequencies(family,p.mcu.clock);
   p.code=generateHal(p.mcu,{minimal:true}).replace('/* USER CODE BEGIN Includes */','/* USER CODE BEGIN Includes */\n#include <stdio.h>')
    .replace('    /* USER CODE BEGIN 3 */','    /* USER CODE BEGIN 3 */\n    char msg[64];\n    int n = snprintf(msg, sizeof msg, "clk=%lu p1=%lu p2=%lu\\r\\n", SystemCoreClock, HAL_RCC_GetPCLK1Freq(), HAL_RCC_GetPCLK2Freq());\n    HAL_UART_Transmit(&huart2, (uint8_t *)msg, n, 100);\n    HAL_Delay(50);');
   assert.match(p.code,/RCC_HSE_BYPASS/,board);
   const result=await build(await prepareBuild({project:p,tools,root,target:'arm'}));
   assert.deepEqual(result.diagnostics.filter(d=>d.severity==='error'),[],board);
   const s=new FirmwareSession(p,{elf:new Uint8Array(await fs.readFile(result.elf))});
   // At 180 MHz a tick may stop at its wall-clock budget before the target time: run until 300 ms of simulated time.
   for(let t=20,i=0;s.now<300000&&i<2000;i++){s.tick(t);if(s.now>=t*1000-1)t=Math.min(300,t+20);}
   const want=`clk=${q.sysclk} p1=${q.pclk1} p2=${q.pclk2}\r\n`;
   assert.ok((s.buses.vcpOutput||'').includes(want),`${board}: want ${JSON.stringify(want)}, got ${JSON.stringify((s.buses.vcpOutput||'').slice(0,200))}`);
   assert.equal(s.buses.vcpOutput.split(want).length-1>=3,true,`${board}: HAL_Delay(50) repeats in 300 ms of SysTick at the new HCLK`);
  }
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
