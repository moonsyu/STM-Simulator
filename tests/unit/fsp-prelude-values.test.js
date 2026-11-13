// Feature 42: the interpreter's stand-in for the FSP headers (fsp-interp.js fspPrelude) gives every enum constant and
// macro the value the installed FSP gives it. Each value is checked by the compiler: a file that includes the real
// generated hal_data.h and FSP headers (as the ARM GCC build does) and asserts NAME == prelude value for each one. Skipped
// without ARM GCC and Renesas FSP.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {createRequire} from 'node:module';
import {fspPrelude} from '../../src/fsp-interp.js';
import {RA_EXAMPLES} from '../../src/ra-examples.js';
import {raDefaultMcu,validateRaMcu} from '../../src/ra-config.js';
import {projectForBoard} from '../../src/project.js';

const require=createRequire(import.meta.url),{detectTools}=require('../../desktop/native-build.cjs'),{prepareRa}=require('../../desktop/ra-build.cjs');
const tools=await detectTools({armGcc:process.env.ARM_GCC||''});
const skip=!(tools.armGcc&&tools.fsp)&&'ARM GCC / Renesas FSP not installed';

/** [name, value text] of the prelude's enum constants and object-like macros. */
export function preludeValues(text){
 const out=[];
 for(const body of text.matchAll(/typedef enum \w+\n\{\n([\s\S]*?)\n\}/g))for(const m of body[1].matchAll(/^\s+(\w+) = ([^,\n]+),$/gm))out.push([m[1],m[2]]);
 for(const m of text.matchAll(/^#define (\w+) (.+)$/gm))if(!/^FSP_INTERP_/.test(m[1]))out.push([m[1],m[2]]);
 return out;
}

test('the prelude lists its enum constants and macros (ADC_CHANNEL_VOLT = -2, AGT_CLOCK_LOCO = 0x40 as in FSP 6.x)',()=>{
 const values=new Map(preludeValues(fspPrelude(validateRaMcu(raDefaultMcu()))));
 assert.ok(values.size>400);assert.equal(values.get('ADC_CHANNEL_VOLT'),'-2');assert.equal(values.get('AGT_CLOCK_LOCO'),'0x40');assert.equal(values.get('AGT_CLOCK_SUBCLOCK'),'0x60');
 assert.ok(!values.has('AGT_CLOCK_FSUB'));
});

test('every prelude enum constant and macro has the value of the installed FSP headers (checked by ARM GCC)',{skip,timeout:300000},async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'fsp-prelude-'));
 try{
  const failures=[];
  for(const mcu of [raDefaultMcu(),...RA_EXAMPLES.map(e=>e.mcu())]){
   const dir=await fs.mkdtemp(path.join(root,'p-')),project={...projectForBoard('fpb-ra6e1'),mcu};
   const r=await prepareRa({project,tools,directory:dir,userFiles:[]});
   const values=preludeValues(fspPrelude(validateRaMcu(mcu)));
   const headers=['hal_data.h','r_ioport.h','r_icu.h','r_sci_uart.h','r_gpt.h','r_agt.h','r_adc.h','r_iic_master.h','r_external_irq_api.h','r_uart_api.h','r_timer_api.h','r_adc_api.h','r_i2c_master_api.h'];
   const check=[...headers.map(h=>`#include "${h}"`),...values.map(([name,value])=>`_Static_assert((long long) (${name}) == (long long) (${value}), "${name}");`)].join('\n')+'\n';
   const file=path.join(dir,'prelude_check.c');await fs.writeFile(file,check);
   const output=await new Promise(resolve=>execFile(tools.armGcc,[...r.cpu,...r.includes,'-std=gnu11','-fsyntax-only','-w',file],{maxBuffer:1<<24},(error,stdout,stderr)=>resolve(error?stderr:'')));
   for(const m of output.matchAll(/static assertion failed: "(\w+)"|'(\w+)' undeclared/g))failures.push(`${Object.keys(mcu.peripherals||{}).join('+')||'default'}: ${m[1]?'value of '+m[1]:'not in FSP: '+m[2]}`);
   if(output&&!failures.length)failures.push(output.slice(0,2000));
  }
  assert.deepEqual([...new Set(failures)],[]);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
