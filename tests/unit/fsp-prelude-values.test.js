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

// r_sci_spi on SCI9 and r_spi on SPI1 without SSL0 (3-wire), LSB first: the SPI example has only the 4-wire r_spi.
function spiMcu(){
 const mcu=raDefaultMcu(),peripheral=signal=>({function:'Peripheral',signal});
 Object.assign(mcu.pins,{P109:peripheral('SCI9_TXD'),P110:peripheral('SCI9_RXD'),P111:peripheral('SCI9_SCK'),P100:peripheral('SPI1_MISO'),P101:peripheral('SPI1_MOSI'),P102:peripheral('SPI1_RSPCK')});
 mcu.peripherals={SCI9:{enabled:true,mode:'SPI',bitrate:2000000,cpol:1,cpha:1,callback:'sci_spi9_callback',priority:10},SPI1:{enabled:true,bitrate:4000000,bitOrder:'LSB',callback:'spi1_callback',priority:10}};
 return mcu;
}

test('the prelude lists its enum constants and macros (ADC_CHANNEL_VOLT = -2, AGT_CLOCK_LOCO = 0x40 as in FSP 6.x)',()=>{
 const values=new Map(preludeValues(fspPrelude(validateRaMcu(raDefaultMcu()))));
 assert.ok(values.size>400);assert.equal(values.get('ADC_CHANNEL_VOLT'),'-2');assert.equal(values.get('AGT_CLOCK_LOCO'),'0x40');assert.equal(values.get('AGT_CLOCK_SUBCLOCK'),'0x60');
 assert.ok(!values.has('AGT_CLOCK_FSUB'));
 // r_spi_api.h (FSP 6.6): the bit width is the count minus one, events start at 1; r_spi.h's own enums only with SPI.
 assert.equal(values.get('SPI_BIT_WIDTH_8_BITS'),'7');assert.equal(values.get('SPI_BIT_WIDTH_32_BITS'),'31');assert.equal(values.get('SPI_EVENT_TRANSFER_COMPLETE'),'1');
 assert.ok(!values.has('SPI_SSL_MODE_SPI'));assert.equal(new Map(preludeValues(fspPrelude(validateRaMcu(spiMcu())))).get('SPI_DELAY_COUNT_8'),'7');
});

test('every prelude enum constant and macro has the value of the installed FSP headers (checked by ARM GCC)',{skip,timeout:300000},async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'fsp-prelude-'));
 try{
  const failures=[];
  for(const mcu of [raDefaultMcu(),...RA_EXAMPLES.map(e=>e.mcu()),spiMcu()]){
   const dir=await fs.mkdtemp(path.join(root,'p-')),project={...projectForBoard('fpb-ra6e1'),mcu};
   const r=await prepareRa({project,tools,directory:dir,userFiles:[]});
   const values=preludeValues(fspPrelude(validateRaMcu(mcu)));
   const headers=['hal_data.h','r_ioport.h','r_icu.h','r_sci_uart.h','r_gpt.h','r_agt.h','r_adc.h','r_iic_master.h','r_external_irq_api.h','r_uart_api.h','r_timer_api.h','r_adc_api.h','r_i2c_master_api.h','r_spi_api.h','r_wdt.h','r_iwdt.h','r_wdt_api.h','r_rtc.h','r_rtc_api.h','r_iic_slave.h','r_i2c_slave_api.h','r_transfer_api.h','r_dtc.h','r_dmac.h','r_elc.h','r_elc_api.h',...(mcu.peripherals?.USB?.enabled?['r_usb_basic.h','r_usb_basic_api.h','r_usb_pcdc_api.h']:[])];
   const check=[...headers.map(h=>`#include "${h}"`),...values.map(([name,value])=>`_Static_assert((long long) (${name}) == (long long) (${value}), "${name}");`)].join('\n')+'\n';
   const file=path.join(dir,'prelude_check.c');await fs.writeFile(file,check);
   const output=await new Promise(resolve=>execFile(tools.armGcc,[...r.cpu,...r.includes,'-std=gnu11','-fsyntax-only','-w',file],{maxBuffer:1<<24},(error,stdout,stderr)=>resolve(error?stderr:'')));
   for(const m of output.matchAll(/static assertion failed: "(\w+)"|'(\w+)' undeclared/g))failures.push(`${Object.keys(mcu.peripherals||{}).join('+')||'default'}: ${m[1]?'value of '+m[1]:'not in FSP: '+m[2]}`);
   if(output&&!failures.length)failures.push(output.slice(0,2000));
  }
  assert.deepEqual([...new Set(failures)],[]);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});

// Feature 41: the USB stack's stand-in has every public name of r_usb_basic_api.h and r_usb_pcdc_api.h (the macros, enum
// constants and typedef names read from the installed headers), but the ones the interpreter's C cannot declare.
test('the USB prelude has every public macro, enum constant and typedef of r_usb_basic_api.h and r_usb_pcdc_api.h',{skip},async()=>{
 const unsupported=new Set(['usb_compliance_cb_t','usb_callback_t','usb_otg_callback_t','usb_serial_state_bitmap_t']);
 const text=fspPrelude(validateRaMcu({...raDefaultMcu(),peripherals:{USB:{enabled:true}}})),names=new Set(text.match(/\b\w+\b/g));
 const missing=[];
 for(const header of ['r_usb_basic_api.h','r_usb_pcdc_api.h']){
  // The public part only: the header without its RTOS branches (BSP_CFG_RTOS is 0 here).
  const source=(await fs.readFile(path.join(tools.fsp,'ra/fsp/inc/api',header),'utf8')).replace(/#if \(BSP_CFG_RTOS == [12]\)[\s\S]*?#endif/g,'').replace(/#elif\s+\(BSP_CFG_RTOS == 1\)[\s\S]*?#endif/g,'');
  const found=[...source.matchAll(/^\s*#define\s+(USB_\w+)\s/gm),...source.matchAll(/^\s+(USB_[A-Z0-9_]+)\s*(?:=[^,\n]*)?,/gm),...source.matchAll(/^\}\s*(\w+_t)\s*;/gm),...source.matchAll(/^typedef [^;(]*?\b(\w+_t)\s*;/gm),...source.matchAll(/^typedef \w+\s*\(\s*\*?\s*(\w+_t)\s*\)/gm)].map(m=>m[1]);
  for(const name of new Set(found))if(!names.has(name)&&!unsupported.has(name))missing.push(`${header}: ${name}`);
 }
 assert.deepEqual(missing,[]);
});
