// Feature 45 on the ARM GCC build: edited generated / SDK files are built in place of the originals.
// - an edited SDK header is seen also where another SDK header includes it (GCC looks in the including file's folder
//   first, so the build copies the other headers of that folder next to the edited one);
// - an edited hal_conf.h (the SDK template, which leaves HSE_VALUE to the build) keeps the NUCLEO's 8 MHz;
// - an edited stm32xxxx_it.c replaces the build's handlers and runs on the emulator.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {FirmwareSession} from '../../src/firmware-session.js';
import {projectForBoard,validateProject} from '../../src/project.js';
import {buildEnvironment} from '../../src/build-environment.js';

const require=createRequire(import.meta.url),{prepareBuild,build,detectTools}=require('../../desktop/native-build.cjs');
const tools=await detectTools({armGcc:process.env.ARM_GCC||''});
const skip=!(tools.armGcc&&tools.cubeF1)&&!process.env.CI_REQUIRE_TOOLCHAIN&&'ARM GCC / STM32CubeF1 not installed';
const runTo=(s,us)=>{for(let t=10;s.now<us;t+=10)s.tick(t);};
const sdkText=file=>fs.readFile(path.join(tools.cubeF1,file),'utf8');

test('edited SDK header, hal_conf.h and it.c are what the ARM build uses (NUCLEO-F103RB)',{skip,timeout:600000},async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'overrides-'));
 try{
  const p=projectForBoard('nucleo-f103rb');
  const header='Drivers/CMSIS/Device/ST/STM32F1xx/Include/system_stm32f1xx.h',conf='Drivers/STM32F1xx_HAL_Driver/Inc/stm32f1xx_hal_conf_template.h';
  // The device header is reached only through the SDK's stm32f1xx.h (#include "system_stm32f1xx.h").
  const system=(await sdkText(header)).replace(/#ifndef __SYSTEM_STM32F10X_H\r?\n#define __SYSTEM_STM32F10X_H/,m=>m+'\n#define EDITED_SYSTEM_HEADER 7');
  assert.match(system,/EDITED_SYSTEM_HEADER/,'the guard was found');
  const it=buildEnvironment(p).files.find(f=>f.file==='Core/Src/stm32f1xx_it.c').text.replace('/* USER CODE BEGIN SysTick_IRQn 1 */\n','/* USER CODE BEGIN SysTick_IRQn 1 */\n  edited_ticks++;\n').replace('/* USER CODE BEGIN EV */','volatile unsigned edited_ticks;\n/* USER CODE BEGIN EV */');
  p.firmware.files.push({name:header,text:system,origin:'sdk',of:header},{name:'Core/Inc/stm32f1xx_hal_conf.h',text:await sdkText(conf),origin:'sdk',of:conf},{name:'Core/Src/stm32f1xx_it.c',text:it,origin:'gen'});
  p.code=p.code.replace('/* USER CODE BEGIN 0 */','/* USER CODE BEGIN 0 */\n#if EDITED_SYSTEM_HEADER != 7\n#error "the edited system_stm32f1xx.h is not used"\n#endif\n#if HSE_VALUE != 8000000U\n#error "HSE_VALUE is not the NUCLEO 8 MHz"\n#endif\nextern volatile unsigned edited_ticks;\nvolatile unsigned seen_ticks;').replace('    /* USER CODE BEGIN 3 */','    /* USER CODE BEGIN 3 */\n    seen_ticks = edited_ticks;');
  const project=validateProject(p);
  const result=await build(await prepareBuild({project,tools,root,target:'arm'}));
  assert.deepEqual(result.diagnostics.filter(d=>d.severity==='error'),[]);
  const s=new FirmwareSession(project,{elf:new Uint8Array(await fs.readFile(result.elf))});
  runTo(s,1200000);
  // The edited SysTick handler counted, as HAL_IncTick did (one per millisecond, the loop waits 500 ms).
  const seen=Number(String(s.runtime.evaluate('seen_ticks')).match(/^\d+/)?.[0]);
  assert.ok(seen>=900,`edited_ticks seen by the loop: ${seen}`);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
