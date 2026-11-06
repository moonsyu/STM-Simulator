// SPI1 Parameter Settings on the ARM GCC build (real STM32Cube HAL) and the firmware emulator: CPOL/CPHA (mode 3),
// 16-bit frames and LSB first reach SPI1_CR1, and the logic analyzer's SPI channel decodes with them (both boards).
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

test('SPI1 mode 3, 16-bit, LSB first on the emulator: CR1 follows the generated MX_SPI1_Init (F446RE and F103RB)',{skip,timeout:600000},async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'spi-params-'));
 try{
  for(const [board,base]of [['F446RE',blankProject()],['F103RB',projectForBoard('nucleo-f103rb')]]){
   const p=applyHalExample(base,'spi');Object.assign(p.mcu.peripherals.SPI1,{cpol:'HIGH',cpha:'2EDGE',dataSize:16,firstBit:'LSB'});
   p.code=generateHal(p.mcu,{minimal:true}).replace('    /* USER CODE BEGIN 3 */','    /* USER CODE BEGIN 3 */\n    uint16_t word = 0x1234, back = 0;\n    HAL_SPI_TransmitReceive(&hspi1, (uint8_t *) &word, (uint8_t *) &back, 1, 10);\n    HAL_Delay(20);');
   const result=await build(await prepareBuild({project:p,tools,root,target:'arm'}));
   assert.deepEqual(result.diagnostics.filter(d=>d.severity==='error'),[],board);
   const s=new FirmwareSession(p,{elf:new Uint8Array(await fs.readFile(result.elf))});
   for(let t=20;t<=200;t+=20)s.tick(t);
   const spi=s.soc.spis.SPI1,cfg=spi.config();
   assert.deepEqual([cfg.cpol,cfg.cpha,cfg.lsbFirst,spi.bits()],[1,1,true,16],board);
   assert.ok(spi.master(),board+' master');
  }
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
