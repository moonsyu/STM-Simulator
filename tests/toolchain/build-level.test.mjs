// Feature 54: the optimisation level chosen in 편집 → 설정 → 빌드 수준 is the -O flag of the ARM GCC build, for each
// build configuration, on STM32 and FPB-RA6E1 projects. Both configurations build with -O0 unless the project says
// otherwise (Release was -Os before 1.62.1).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {applyHalExample} from '../../src/hal-examples.js';
import {blankProject,projectForBoard,validateProject} from '../../src/project.js';
import {RA_EXAMPLES} from '../../src/ra-examples.js';
import {BUILD_LEVELS} from '../../src/build-level.js';
import {FirmwareSession} from '../../src/firmware-session.js';

const require=createRequire(import.meta.url),{prepareBuild,build,detectTools}=require('../../desktop/native-build.cjs');
const tools=await detectTools({armGcc:process.env.ARM_GCC||''});
const skip=!(tools.armGcc&&tools.cube&&tools.cubeF1)&&!process.env.CI_REQUIRE_TOOLCHAIN&&'ARM GCC / STM32CubeF4·F1 not installed';
const levels=(p,optimization)=>validateProject({...p,ide:{breakpoints:[],watches:[],native:{target:'arm',configuration:'Release',optimization}}});
const optimisation=plan=>plan.flags.filter(f=>/^-O/.test(f));

test('the -O flag of a build is the level of its configuration; -O0 without a choice',{skip,timeout:600000},async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'build-level-'));
 try{
  const ra=RA_EXAMPLES.find(e=>e.id==='ra_blink');
  const cases=[['F446RE',applyHalExample(blankProject(),'blink')],['F103RB',applyHalExample(projectForBoard('nucleo-f103rb'),'blink')]];
  if(tools.fsp)cases.push(['FPB-RA6E1',validateProject({...projectForBoard('fpb-ra6e1'),mcu:ra.mcu(),code:ra.code})]);
  for(const [board,p]of cases){
   for(const configuration of ['Debug','Release'])assert.deepEqual(optimisation(await prepareBuild({project:p,tools,root,target:'arm',configuration})),['-O0'],`${board} ${configuration}: -O0 by default`);
   const chosen=levels(p,{Debug:'-Og',Release:'-Os'});
   assert.deepEqual(optimisation(await prepareBuild({project:chosen,tools,root,target:'arm',configuration:'Debug'})),['-Og'],board);
   const release=await prepareBuild({project:chosen,tools,root,target:'arm',configuration:'Release'});
   assert.deepEqual(optimisation(release),['-Os'],board);
   // Every unit is compiled with it, and the firmware still runs on the emulator.
   for(const unit of release.units)assert.ok(unit.arguments.includes('-Os')&&!unit.arguments.includes('-O0'),`${board}: ${path.basename(unit.arguments.at(-1))}`);
   const small=await build(release),elf=new Uint8Array(await fs.readFile(small.elf));
   const s=new FirmwareSession(chosen,{elf});for(let t=20;t<=200;t+=20)s.tick(t);
   assert.ok(!s.result?.fault,`${board}: the -Os build runs`);
  }
  // Every level of the list builds (F446RE blink).
  const [,blink]=cases[0];
  for(const {flag}of BUILD_LEVELS){
   const plan=await prepareBuild({project:levels(blink,{Release:flag}),tools,root,target:'arm',configuration:'Release'});
   assert.deepEqual(optimisation(plan),[flag]);
   assert.ok((await fs.stat((await build(plan)).elf)).size>0,flag);
  }
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
