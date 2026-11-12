// printf of floats is always on: the interpreter prints %f and both ARM builds link -u _printf_float. A project saved
// by 1.25.0–1.27.0 with the removed switch off (build.printfFloat false) loads without it and prints numbers too.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {blankProject,validateProject} from '../../src/project.js';
import {SimulationSession} from '../../src/session.js';
import {consoleSink} from './helpers/console.js';

const require=createRequire(import.meta.url),nativeBuild=require('../../desktop/native-build.cjs');
const saved=()=>({...blankProject(),build:{printfFloat:false}});

test('a project saved with the old printf float switch off loads without it and the interpreter prints %f',()=>{
 assert.equal(blankProject().build,undefined);
 const p=validateProject(saved());assert.equal(p.build,undefined);
 p.code=p.code.replace('printf("HAL ready\\n");','printf("v=[%.2f] n=%d\\n", 3.14159, 7);');
 const out=[];const s=new SimulationSession(p,consoleSink(out));for(let t=10;t<=50;t+=10)s.tick(t);
 assert.match(out.join('\n'),/v=\[3\.14\] n=7/);
});

test('ARM builds always link -u _printf_float',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'printf-float-'));
 try{
  const gcc=path.join(dir,'bin','arm-none-eabi-gcc'),cube=path.join(dir,'cube');await fs.mkdir(path.dirname(gcc));await fs.writeFile(gcc,'');
  const inc=path.join(cube,'Drivers/STM32F4xx_HAL_Driver/Inc');await fs.mkdir(inc,{recursive:true});await fs.writeFile(path.join(inc,'stm32f4xx_hal.h'),'');await fs.writeFile(path.join(inc,'stm32f4xx_hal_conf_template.h'),'');
  const flags=async(p,name)=>(await nativeBuild.prepareBuild({project:p,tools:{armGcc:gcc,cube},root:path.join(dir,name)})).linkFlags.join(' ');
  assert.match(await flags(blankProject(),'a'),/-u _printf_float/);
  assert.match(await flags(saved(),'b'),/-u _printf_float/,'the old switch is ignored');
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
