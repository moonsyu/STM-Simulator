// FPB-RA6E1: the app's RA build (generated ra_gen/ra_cfg + Renesas FSP, ARM GCC) compiles every FSP example without a
// warning, the ELF runs on the RA6E1 emulator, and a compile error points at the editor's main file.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {FirmwareSession} from '../../src/firmware-session.js';
import {projectForBoard,validateProject} from '../../src/project.js';
import {RA_EXAMPLES,raExample} from '../../src/ra-examples.js';

const require=createRequire(import.meta.url),{prepareBuild,build,detectTools}=require('../../desktop/native-build.cjs');
const tools=await detectTools({armGcc:process.env.ARM_GCC||''});
const ready=!!tools.armGcc&&!!tools.fsp;
const skip=!ready&&!process.env.CI_REQUIRE_TOOLCHAIN&&'ARM GCC / Renesas FSP not installed';
const projectOf=ex=>validateProject({...projectForBoard('fpb-ra6e1'),mcu:ex.mcu(),code:ex.code});

test('every FSP example builds with no warning and runs on the RA6E1 emulator',{skip,timeout:600000},async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'ra-build-'));
 try{
  for(const ex of RA_EXAMPLES){
   const project=projectOf(ex),result=await build(await prepareBuild({project,tools,root,target:'arm'}));
   assert.deepEqual(result.diagnostics.filter(d=>d.severity!=='info'),[],ex.id);
   const session=new FirmwareSession(project,{elf:new Uint8Array(await fs.readFile(result.elf))});
   for(let ms=20;ms<=1200;ms+=20)session.tick(ms);
   assert.equal(session.soc.clock.iclk,200e6,ex.id);assert.equal(session.gpio.P408.mode,'OUTPUT',ex.id);
  }
 }finally{await fs.rm(root,{recursive:true,force:true});}
});

test('a compile error in hal_entry.c is reported on the editor\'s main file',{skip,timeout:300000},async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'ra-build-'));
 try{
  const ex=raExample('ra_blink'),project=projectOf({...ex,code:ex.code+'\nint broken = ;\n'});
  await assert.rejects(build(await prepareBuild({project,tools,root,target:'arm'})),e=>e.diagnostics.some(d=>d.file==='main.c'&&d.severity==='error'&&/[\\/]src[\\/]hal_entry\.c$/.test(d.path)));
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
