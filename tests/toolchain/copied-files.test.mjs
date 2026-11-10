// Feature 11 — files the user copied into the project for editing are what the ARM build compiles:
//  - a copy of the generated stm32xxxx_it.c (its SysTick_Handler edited) replaces the app's handler;
//  - a copy of an SDK source (stm32xxxx_hal_gpio.c with HAL_GPIO_TogglePin edited) is built instead of the SDK's file;
//  - the built-in interpreter leaves those ARM-only files out and still runs the project.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {FirmwareSession} from '../../src/firmware-session.js';
import {SimulationSession} from '../../src/session.js';
import {blankProject,projectForBoard,validateProject} from '../../src/project.js';
import {generateHal} from '../../src/mcu-config.js';
import {buildEnvironment,prefixOf} from '../../src/build-environment.js';

const require=createRequire(import.meta.url),{prepareBuild,build,detectTools}=require('../../desktop/native-build.cjs');
const tools=await detectTools({armGcc:process.env.ARM_GCC||''});
const skip=!(tools.armGcc&&tools.cube&&tools.cubeF1)&&!process.env.CI_REQUIRE_TOOLCHAIN&&'ARM GCC / STM32CubeF4·F1 not installed';
const pin=fn=>({function:fn,pull:'NOPULL',edge:'FALLING',label:'',initial:0});

test('project copies of the generated it.c and of an SDK driver source are compiled in place of the originals (F446RE, F103RB)',{skip,timeout:600000},async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'copied-'));
 try{
  for(const [board,base,cube]of [['F446RE',blankProject(),tools.cube],['F103RB',projectForBoard('nucleo-f103rb'),tools.cubeF1]]){
   const p=structuredClone(base),m=p.mcu,prefix=prefixOf(m.family);p.components=[];p.wires=[];
   for(const q of ['PC0','PC1','PC2'])m.pins[q]=pin('GPIO_Output');
   // PC0 is set from the edited SysTick_Handler, PC1 from the edited HAL_GPIO_TogglePin (called with PC2).
   p.code=generateHal(m,{minimal:true}).replace('    /* USER CODE BEGIN 3 */','    /* USER CODE BEGIN 3 */\n    HAL_GPIO_TogglePin(GPIOC, GPIO_PIN_2);\n    HAL_Delay(5);');
   const it=buildEnvironment(p).files.find(f=>f.file.endsWith('_it.c'));assert.ok(it,'generated it.c view');
   const itText=it.text.replace('void SysTick_Handler(void) { HAL_IncTick(); }','void SysTick_Handler(void) { HAL_IncTick(); GPIOC->BSRR = GPIO_PIN_0; }');assert.notEqual(itText,it.text);
   const sdkPath=`Drivers/${prefix.toUpperCase().replace('XX','xx')}_HAL_Driver/Src/${prefix}_hal_gpio.c`,sdk=await fs.readFile(path.join(cube,sdkPath),'utf8');
   const edited=sdk.replace(/void HAL_GPIO_TogglePin\([^)]*\)\s*\{/,m0=>m0+'\n  GPIOC->BSRR = GPIO_PIN_1; /* project copy */');assert.notEqual(edited,sdk);
   p.firmware.files=[{name:it.file,text:itText},{name:sdkPath,text:edited}];
   const q=validateProject(p),plan=await prepareBuild({project:q,tools,root,target:'arm'}),result=await build(plan);
   assert.deepEqual(result.diagnostics.filter(d=>d.severity==='error'),[],board);
   assert.ok(!plan.units.some(u=>u.file.startsWith(cube.replaceAll('/',path.sep))&&u.file.endsWith(`${prefix}_hal_gpio.c`)),`${board}: the SDK's hal_gpio.c is not compiled`);
   const s=new FirmwareSession(q,{elf:new Uint8Array(await fs.readFile(result.elf))});for(let t=10;t<=60;t+=10)s.tick(t);
   assert.equal(s.gpio.PC0?.value,3.3,`${board}: the copied SysTick_Handler runs`);assert.equal(s.gpio.PC1?.value,3.3,`${board}: the copied HAL_GPIO_TogglePin runs`);
   // The interpreter runs the same project without the ARM-only copy (HAL at API level) and with the copied handlers.
   const sim=new SimulationSession(q,{print:()=>{},warn:()=>{}});sim.tick(0);for(let t=10;t<=60;t+=10)sim.tick(t);
   assert.ok(!sim.result?.fault,board);assert.ok(sim.runtime.gpio.PC2,'main loop toggles PC2');
  }
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
