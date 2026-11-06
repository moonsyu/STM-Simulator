// CubeIDE's "Use float with printf from newlib-nano (-u _printf_float)": the project setting (off in a new project,
// on for older projects and for examples that print floats), the interpreter's %f output, and the ARM link flags.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {usesFloatPrintf,printfFloatEnabled,withExamplePrintfFloat} from '../../src/printf-float.js';
import {blankProject,projectForBoard,validateProject} from '../../src/project.js';
import {applyHalExample} from '../../src/hal-examples.js';
import {SimulationSession} from '../../src/session.js';

const require=createRequire(import.meta.url),nativeBuild=require('../../desktop/native-build.cjs');

test('usesFloatPrintf finds %f / %e / %g in printf-family format strings only',()=>{
 assert.equal(usesFloatPrintf(['printf("t=%.2f C\\r\\n", t);']),true);
 assert.equal(usesFloatPrintf(['snprintf(buf, sizeof buf, "%5.1e", v);']),true);
 assert.equal(usesFloatPrintf(['sprintf(s, "%d %lu", a, b);','printf("100%% done\\n");']),false);
 assert.equal(usesFloatPrintf(['// printf("%f", x);\nputs("%f");']),false,'comments and non-printf strings');
 assert.equal(usesFloatPrintf(['printf(\n  "%-8.3g|", x);']),true,'format on the next line');
});

test('new projects start with float printf off as CubeIDE does; older projects keep it on; examples that print floats turn it on',()=>{
 assert.deepEqual(blankProject().build,{printfFloat:false});assert.deepEqual(projectForBoard('nucleo-f103rb').build,{printfFloat:false});
 assert.deepEqual(projectForBoard('fpb-ra6e1').build,{printfFloat:false});
 const old=validateProject(blankProject());delete old.build;assert.equal(printfFloatEnabled(validateProject(old)),true,'no build setting: as before');
 assert.equal(printfFloatEnabled(validateProject(blankProject())),false);
 assert.throws(()=>validateProject({...blankProject(),build:{printfFloat:'yes'}}),/빌드 설정/);
 assert.equal(applyHalExample(blankProject(),'temperature').build.printfFloat,true,'TMP36 prints the temperature with %f');
 assert.equal(applyHalExample(blankProject(),'blink').build?.printfFloat,false);
 const p=blankProject();p.code=p.code.replace('printf("HAL ready\\n");','printf("%.1f\\n", 1.5);');assert.equal(withExamplePrintfFloat(p).build.printfFloat,true);
});

test('interpreter: with float printf off %f prints nothing (newlib-nano), on prints the number',()=>{
 const run=flag=>{const p=blankProject();p.build={printfFloat:flag};p.code=p.code.replace('printf("HAL ready\\n");','printf("v=[%.2f] n=%d\\n", 3.14159, 7);');const out=[];const s=new SimulationSession(p,{print:t=>out.push(String(t))});for(let t=10;t<=50;t+=10)s.tick(t);return out.join('\n');};
 assert.match(run(false),/v=\[\] n=7/);
 assert.match(run(true),/v=\[3\.14\] n=7/);
});

test('ARM builds link -u _printf_float only when the setting is on',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'printf-float-'));
 try{
  const gcc=path.join(dir,'bin','arm-none-eabi-gcc'),cube=path.join(dir,'cube');await fs.mkdir(path.dirname(gcc));await fs.writeFile(gcc,'');
  const inc=path.join(cube,'Drivers/STM32F4xx_HAL_Driver/Inc');await fs.mkdir(inc,{recursive:true});await fs.writeFile(path.join(inc,'stm32f4xx_hal.h'),'');await fs.writeFile(path.join(inc,'stm32f4xx_hal_conf_template.h'),'');
  const flags=async flag=>{const p=blankProject();p.build={printfFloat:flag};return (await nativeBuild.prepareBuild({project:p,tools:{armGcc:gcc,cube},root:path.join(dir,'b'+flag)})).linkFlags.join(' ');};
  assert.doesNotMatch(await flags(false),/_printf_float/);
  assert.match(await flags(true),/-u _printf_float/);
  const a=blankProject(),b={...blankProject(),build:{printfFloat:true}};
  assert.notEqual(nativeBuild.fingerprint(a,{target:'arm'}),nativeBuild.fingerprint(b,{target:'arm'}),'switching rebuilds');
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
