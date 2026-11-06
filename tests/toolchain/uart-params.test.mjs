// USART Parameter Settings on the ARM GCC build (real STM32Cube HAL) and the firmware emulator: 9-bit words with even
// parity and two stop bits (or 7 data bits + odd parity on the F103RB) reach the ST-LINK VCP intact, whose receiver
// follows the USART's frame settings, and the frame time on the line grows with the extra bits.
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
function program(base,params){
 const p=applyHalExample(base,'uart');Object.assign(p.mcu.peripherals.USART2,params);
 p.code=generateHal(p.mcu,{minimal:true}).replace('/* USER CODE BEGIN Includes */','/* USER CODE BEGIN Includes */\n#include <string.h>').replace('    /* USER CODE BEGIN 3 */','    /* USER CODE BEGIN 3 */\n    static const char msg[] = "parity ok\\r\\n";\n    HAL_UART_Transmit(&huart2, (const uint8_t *) msg, strlen(msg), 100);\n    HAL_Delay(50);');
 return p;
}

test('UART word length / parity / stop bits on the emulator: the VCP decodes them (F446RE 9E2, F103RB 8O1)',{skip,timeout:600000},async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'uart-params-'));
 try{
  for(const [board,base,params,bits]of [['F446RE',blankProject(),{wordLength:9,parity:'EVEN',stopBits:2},12],['F103RB',projectForBoard('nucleo-f103rb'),{parity:'ODD'},10]]){
   const p=program(base,params),result=await build(await prepareBuild({project:p,tools,root,target:'arm'}));
   assert.deepEqual(result.diagnostics.filter(d=>d.severity==='error'),[],board);
   const s=new FirmwareSession(p,{elf:new Uint8Array(await fs.readFile(result.elf))});
   for(let t=20;t<=300;t+=20)s.tick(t);
   assert.match(s.buses.vcpOutput||'',/parity ok\r\n/,`${board}: ${JSON.stringify(s.buses.vcpOutput)}`);
   const u=s.soc.usarts.USART2;assert.equal(u.parity(),params.parity==='EVEN'?'even':'odd',board);
   assert.equal(1+u.frameBits()+u.stopBits(),bits,`${board} bits on the line per character`);
  }
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
