// Builds every HAL example with the app's real ARM GCC pipeline (desktop/native-build.cjs)
// and runs the ELF on the Cortex-M4 emulator. Skipped when ARM GCC / STM32CubeF4 are absent.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url);
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const {prepareBuild,build}=require(path.join(root,'desktop/native-build.cjs'));
const {blankProject}=await import('../../src/project.js');
const {allHalExamples,applyHalExample,SIMULATOR_ONLY_EXAMPLES}=await import('../../src/hal-examples.js');
const {FirmwareSession}=await import('../../src/firmware-session.js');
const exe=process.platform==='win32'?'.exe':'';
const gcc=process.env.ARM_GCC||'/home/claude/tools/xpack-arm-none-eabi-gcc-14.2.1-1.1/bin/arm-none-eabi-gcc'+exe;
const cube=process.env.STM32CUBE_F4_ROOT||'/home/claude/tools/cubef4';
const exists=p=>fs.access(p).then(()=>true,()=>false);
const available=await exists(gcc)&&await exists(path.join(cube,'Drivers/STM32F4xx_HAL_Driver/Inc/stm32f4xx_hal.h'));
const tools={armGcc:gcc,cube,armGdb:'',hostGcc:'',hostGdb:'',clangd:'',openocd:'',buildRoot:''};
const only=process.env.EXAMPLES?.split(',');
const cases=[['blank',blankProject()],...Object.keys(allHalExamples()).filter(id=>!SIMULATOR_ONLY_EXAMPLES.has(id)&&(!only||only.includes(id))).map(id=>[id,applyHalExample(blankProject(),id)])];

test('every example compiles and links with ST HAL, then runs on the emulator without faults',{skip:!available&&!process.env.CI_REQUIRE_TOOLCHAIN&&'ARM GCC / STM32CubeF4 not installed',timeout:3600000},async t=>{
 const work=await fs.mkdtemp(path.join(os.tmpdir(),'stm-arm-'));const failures=[];
 try{
  for(const [id,project] of cases){
   await t.test(id,async()=>{
    let r;
    try{const plan=await prepareBuild({project,tools,root:work,target:'arm',configuration:'Debug'});r=await build(plan,{onOutput:()=>{}});}
    catch(error){failures.push(`${id}: build · ${error.message.slice(0,300)}`);throw error;}
    const elf=new Uint8Array(await fs.readFile(r.elf));
    try{
     const session=new FirmwareSession(project,{elf,print:()=>{},uart:()=>{},trace:()=>{}});
     for(let ms=20;ms<=200;ms+=20)session.tick(ms);
     const top=session.runtime.inspect().frames[0]?.name||'';
     // SysTick must be serviced (uwTick ≈ 1/ms). Demos with long high-priority ISRs legitimately delay it,
     // so require steady progress rather than an exact rate; a missing handler leaves it at 0-1.
     const tick=Number(String(session.runtime.evaluate('uwTick')).match(/^\d+/)?.[0]);
     // Compare with the simulated time actually reached (heavy circuits can lag behind the requested 200 ms).
     const nowMs=session.runtime.microTime/1000;
     assert.ok(nowMs>=5,`simulation barely advanced (${nowMs.toFixed(1)} ms)`);
     assert.ok(tick>=nowMs*0.2,`uwTick did not advance (${tick} at ${nowMs.toFixed(1)} ms)`);
     assert.ok(!/^(Error_Handler|HardFault_Handler|Default_Handler|.*_IRQHandler_default)$/.test(top),`stuck in ${top}`);
    }catch(error){failures.push(`${id}: run · ${error.message.slice(0,300)}`);throw error;}
    await fs.rm(path.dirname(r.elf),{recursive:true,force:true});
   });
  }
 }finally{
  await fs.rm(work,{recursive:true,force:true});
  // CI turns this file into annotations so failures are readable without the raw log.
  const out=path.join(root,'work/test-results');await fs.mkdir(out,{recursive:true});await fs.writeFile(path.join(out,'toolchain-failures.json'),JSON.stringify(failures,null,1));
 }
 assert.deepEqual(failures,[]);
});
