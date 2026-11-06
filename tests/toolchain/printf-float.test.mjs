// CubeIDE's "Use float with printf" on the ARM GCC build (newlib-nano) and the firmware emulator: without
// -u _printf_float, printf("%.2f") leaves the number out; with it, the number is printed (F446RE, the debug output of printf).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {FirmwareSession} from '../../src/firmware-session.js';
import {blankProject} from '../../src/project.js';

const require=createRequire(import.meta.url),{prepareBuild,build,detectTools}=require('../../desktop/native-build.cjs');
const tools=await detectTools({armGcc:process.env.ARM_GCC||''});
const skip=!(tools.armGcc&&tools.cube)&&!process.env.CI_REQUIRE_TOOLCHAIN&&'ARM GCC / STM32CubeF4 not installed';

test('newlib-nano printf("%.2f") on the emulator: empty with float printf off, the number with it on',{skip,timeout:600000},async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'printf-float-'));
 try{
  for(const flag of [false,true]){
   const p=blankProject();p.build={printfFloat:flag};
   p.code=p.code.replace('printf("HAL ready\\n");','printf("v=[%.2f] n=%d\\r\\n", 3.14159, 7);');
   const result=await build(await prepareBuild({project:p,tools,root,target:'arm'}));
   const printed=[],s=new FirmwareSession(p,{elf:new Uint8Array(await fs.readFile(result.elf)),print:t=>printed.push(String(t))});
   for(let t=20;t<=200;t+=20)s.tick(t);
   const out=printed.join('')+(s.buses.vcpOutput||'');
   assert.match(out,flag?/v=\[3\.14\] n=7/:/v=\[\] n=7/,`printfFloat ${flag}: ${JSON.stringify(out)}`);
  }
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
