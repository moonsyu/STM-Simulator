// Features 18, 19 and 24 — the RA6E1 course (Day 5) on the app: the Blinky template, switch polling with
// R_IOPORT_PinRead, the external interrupt as the slides set it up (Rising, irq_callback, opened in R_BSP_WarmStart),
// and the challenge with four external LEDs and two switches on the Arduino header. Built with FSP, run on the
// RA6E1 emulator, buttons pressed through the circuit.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {FirmwareSession} from '../../src/firmware-session.js';
import {projectForBoard,validateProject} from '../../src/project.js';
import {raExample} from '../../src/ra-examples.js';
import {raHalEntry} from '../../src/ra-generator.js';
import {raDefaultMcu} from '../../src/ra-config.js';

const require=createRequire(import.meta.url),{prepareBuild,build,detectTools}=require('../../desktop/native-build.cjs');
const tools=await detectTools({armGcc:process.env.ARM_GCC||''});
const skip=!(tools.armGcc&&tools.fsp)&&!process.env.CI_REQUIRE_TOOLCHAIN&&'ARM GCC / Renesas FSP not installed';
const base=()=>projectForBoard('fpb-ra6e1');
const example=id=>{const e=raExample(id),p={...base(),mcu:e.mcu(),code:e.code};if(e.circuit){const c=e.circuit();p.components=c.components;p.wires=c.wires;delete p.surfaces;}return p;};
const high=(s,pin)=>s.gpio[pin]?.value>1?1:0;
async function session(project,root){
 const p=validateProject(project),result=await build(await prepareBuild({project:p,tools,root,target:'arm'}));
 assert.deepEqual(result.diagnostics.filter(d=>d.severity!=='info'),[],'no warning');
 return new FirmwareSession(p,{elf:new Uint8Array(await fs.readFile(result.elf))});
}

test('Bare Metal - Blinky blinks LED1 and LED2 together; a project with no interrupt at all builds without a warning',{skip,timeout:600000},async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'ra-course-'));
 try{
  const s=await session({...base(),code:raHalEntry({blink:true})},root),seen=new Set();
  for(let ms=10;ms<=1200;ms+=10){s.tick(ms);seen.add(`${high(s,'P408')}${high(s,'P407')}`);}
  assert.deepEqual([...seen].sort(),['00','11']);
  // S1 as a plain input: no IRQ stack, so the vector table is empty.
  const mcu=raDefaultMcu();mcu.pins.P205={function:'GPIO_Input',pull:'PULLUP',label:'SW1'};
  await session({...base(),mcu,code:raHalEntry()},root);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});

test('switch polling toggles LED1 once per press; the Rising interrupt toggles LED2 when S1 is let go',{skip,timeout:600000},async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'ra-course-'));
 try{
  const press=(s,pin,at)=>{const out=[];for(let ms=10;ms<=1000;ms+=10){if(ms===100||ms===600)s.setPressed({SW1:true});if(ms===300||ms===800)s.setPressed({});s.tick(ms);if(at.includes(ms))out.push(high(s,pin));}return out;};
  // Polling: LED1 on from the first press, off from the second.
  assert.deepEqual(press(await session(example('ra_button_poll'),root),'P408',[90,290,590,990]),[0,1,1,0]);
  // Rising edge: nothing while S1 is held (290 ms), LED2 on after the release (310 ms), off after the next one (810 ms).
  assert.deepEqual(press(await session(example('ra_button_irq_rising'),root),'P407',[290,310,790,810]),[0,1,1,0]);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});

test('the challenge: four LEDs on the Arduino header count 0000 → 1111 every 0.1 s; switch 2 pauses and resumes, switch 1 starts over',{skip,timeout:600000},async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'ra-course-'));
 try{
  const s=await session(example('ra_led4_switch2'),root),pins=['P107','P303','P113','P103'],value=()=>pins.map(p=>high(s,p)).join('');
  const seq=[];let last='';
  const until=(to,press)=>{for(let ms=s.time+10;ms<=to;ms+=10){s.tick(ms);const v=value();if(v!==last){seq.push(v);last=v;}}if(press!==undefined)s.setPressed(press);};
  until(450);assert.deepEqual(seq.splice(0),['0000','0001','0010','0011','0100']);
  // Switch 2 (D8): the count stops where it is and goes on from there.
  until(460,{sw2:true});until(520,{});const held=value();until(900);assert.equal(value(),held,'paused');assert.deepEqual(seq.splice(0),[]);
  until(910,{sw2:true});until(960,{});until(1300);const resumed=seq.splice(0);
  assert.equal(resumed[0],(parseInt(held,2)+1).toString(2).padStart(4,'0'));assert.ok(resumed.length>=3);
  // Switch 1 (D2): back to 0000.
  until(1310,{sw1:true});until(1360,{});until(1700);assert.deepEqual(seq.slice(0,3),['0000','0001','0010']);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});

// Feature 22: the BSP tab's sizes reach the build — the main stack and the heap take the room they are given, the
// extremes build and run, and malloc returns NULL once a small heap is used up.
test('BSP tab sizes: a large stack with no heap and a small stack with a large heap build and blink; the heap size limits malloc',{skip,timeout:600000},async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'ra-bsp-'));
 try{
  for(const bsp of [{stackBytes:0x20000,heapBytes:0},{stackBytes:0x100,heapBytes:0x20000}]){
   const s=await session({...base(),mcu:{...raDefaultMcu(),bsp},code:raHalEntry({blink:true})},root),seen=new Set();
   for(let ms=10;ms<=1200;ms+=10){s.tick(ms);seen.add(`${high(s,'P408')}${high(s,'P407')}`);}
   assert.deepEqual([...seen].sort(),['00','11'],JSON.stringify(bsp));
  }
  // LED1 on when a 0x800-byte block fits the heap, LED2 on when it does not.
  const code=raHalEntry().replace('#include "hal_data.h"','#include "hal_data.h"\n#include <stdlib.h>').replace('    /* TODO: add your own code here */','    void *p = malloc(0x800);\n    R_IOPORT_PinWrite(&g_ioport_ctrl, p ? BSP_IO_PORT_04_PIN_08 : BSP_IO_PORT_04_PIN_07, BSP_IO_LEVEL_HIGH);\n    while (1) { }');
  assert.match(code,/malloc\(0x800\)/);
  const fits=await session({...base(),mcu:{...raDefaultMcu(),bsp:{stackBytes:0x400,heapBytes:0x1000}},code},root);fits.tick(50);
  assert.deepEqual([high(fits,'P408'),high(fits,'P407')],[1,0]);
  const full=await session({...base(),mcu:{...raDefaultMcu(),bsp:{stackBytes:0x400,heapBytes:0x400}},code},root);full.tick(50);
  assert.deepEqual([high(full,'P408'),high(full,'P407')],[0,1]);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});

// The course's hal_entry.c (Day 5 p.110-111, FSP 5.5): pins opened with R_IOPORT_Open (&g_ioport_ctrl, g_ioport.p_cfg),
// the template's #if blocks deleted by hand, the LED named BBQ_LED. Typed as the screen shows it, it builds and blinks.
test('hal_entry.c as the course screen shows it (g_ioport.p_cfg, #if blocks removed) builds and blinks; the new-project template keeps both TrustZone blocks',{skip,timeout:600000},async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'ra-lecture-'));
 try{
  const code=['#include "hal_data.h"','','FSP_CPP_HEADER','void R_BSP_WarmStart(bsp_warm_start_event_t event);','FSP_CPP_FOOTER','','void hal_entry(void)','{','    /* TODO: add your own code here */',
   '    while (1)','    {','        R_IOPORT_PinWrite(&g_ioport_ctrl, BBQ_LED, BSP_IO_LEVEL_HIGH);','        R_BSP_SoftwareDelay(500, BSP_DELAY_UNITS_MILLISECONDS);','        R_IOPORT_PinWrite(&g_ioport_ctrl, BBQ_LED, BSP_IO_LEVEL_LOW);','        R_BSP_SoftwareDelay(500, BSP_DELAY_UNITS_MILLISECONDS);','    }','}','',
   'void R_BSP_WarmStart(bsp_warm_start_event_t event)','{','    if (BSP_WARM_START_RESET == event)','    {','    }','','    if (BSP_WARM_START_POST_C == event)','    {','        /* C runtime environment and system clocks are setup. */','','        /* Configure pins. */','        R_IOPORT_Open (&g_ioport_ctrl, g_ioport.p_cfg);','    }','}',''].join('\n');
  const mcu=raDefaultMcu();mcu.pins.P408.label='BBQ_LED';
  const s=await session({...base(),mcu,code},root),seen=new Set();
  for(let ms=10;ms<=1200;ms+=10){s.tick(ms);seen.add(high(s,'P408'));}
  assert.deepEqual([...seen].sort(),[0,1]);
  // The template of a new project: the two #if BSP_TZ_SECURE_BUILD blocks of the screen, the second without FSP_CPP_HEADER.
  const template=raHalEntry();
  assert.equal(template.split('#if BSP_TZ_SECURE_BUILD').length,3);
  assert.match(template,/#if BSP_TZ_SECURE_BUILD\n\nBSP_CMSE_NONSECURE_ENTRY void template_nonsecure_callable \(\);\n\n\/\* Trustzone Secure Projects require at least one nonsecure callable function/);
  assert.match(template,/BSP_CMSE_NONSECURE_ENTRY void template_nonsecure_callable \(\)\n\{\n\n\}\n#endif\n$/);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
