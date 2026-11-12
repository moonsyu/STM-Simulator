// Feature 23 on the emulators: with simulation.bounceMs set, firmware that toggles an LED on every press without a
// debounce toggles it several times for one press; with a 100 ms wait after the press and after the release it toggles once (waiting only after the press is not enough: the release bounces too). FPB-RA6E1 (FSP,
// R_IOPORT_PinRead polling as in the lecture) and NUCLEO-F446RE (HAL, polling B1).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {FirmwareSession} from '../../src/firmware-session.js';
import {blankProject,projectForBoard,validateProject} from '../../src/project.js';
import {generateHal,validateMcu} from '../../src/mcu-config.js';
import {raDefaultMcu} from '../../src/ra-config.js';

const require=createRequire(import.meta.url),{prepareBuild,build,detectTools}=require('../../desktop/native-build.cjs');
const tools=await detectTools({armGcc:process.env.ARM_GCC||''});
const skip=!(tools.armGcc&&tools.cube&&tools.fsp)&&!process.env.CI_REQUIRE_TOOLCHAIN&&'ARM GCC / STM32CubeF4 / Renesas FSP not installed';

// One press of `key` from 100 ms to 300 ms; returns how often `pin` changed level.
async function toggles(project,root,key,pin){
 const result=await build(await prepareBuild({project,tools,root,target:'arm'}));
 assert.deepEqual(result.diagnostics.filter(d=>d.severity==='error'),[]);
 const s=new FirmwareSession(project,{elf:new Uint8Array(await fs.readFile(result.elf))});let last=null,count=0;
 for(let ms=1;ms<=600;ms++){if(ms===100)s.setPressed({[key]:true});if(ms===300)s.setPressed({});s.tick(ms);const level=s.gpio[pin]?.value>1?1:0;if(last!==null&&level!==last)count++;last=level;}
 return count;
}

test('FPB-RA6E1: polling S1 with R_IOPORT_PinRead — one toggle with clean contacts, several with bounce, one again with a 100 ms debounce',{skip,timeout:600000},async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'bounce-ra-'));
 try{
  const code=wait=>`#include "hal_data.h"
FSP_CPP_HEADER
void R_BSP_WarmStart(bsp_warm_start_event_t event);
FSP_CPP_FOOTER
static bool isButton(void)
{
    bsp_io_level_t level;
    if (FSP_SUCCESS != R_IOPORT_PinRead(&g_ioport_ctrl, SW1, &level)) return false;
    return BSP_IO_LEVEL_LOW == level;
}
void hal_entry(void)
{
    bsp_io_level_t led = BSP_IO_LEVEL_LOW;
    while (1)
    {
        if (isButton())
        {
            led = (BSP_IO_LEVEL_LOW == led) ? BSP_IO_LEVEL_HIGH : BSP_IO_LEVEL_LOW;
            R_IOPORT_PinWrite(&g_ioport_ctrl, LED1, led);
${wait?'            R_BSP_SoftwareDelay(100, BSP_DELAY_UNITS_MILLISECONDS);\n':''}            while (isButton()) { }
${wait?'            R_BSP_SoftwareDelay(100, BSP_DELAY_UNITS_MILLISECONDS);\n':''}        }
    }
}
void R_BSP_WarmStart(bsp_warm_start_event_t event)
{
    if (BSP_WARM_START_POST_C == event) { R_IOPORT_Open (&IOPORT_CFG_CTRL, &IOPORT_CFG_NAME); }
}
`;
  const project=(bounceMs,wait)=>{const mcu=raDefaultMcu();mcu.pins.P205={function:'GPIO_Input',pull:'PULLUP',label:'SW1'};return validateProject({...projectForBoard('fpb-ra6e1'),mcu,code:code(wait),simulation:{stepMs:1,pwmWaveform:false,...(bounceMs?{bounceMs}:{})}});};
  assert.equal(await toggles(project(0,false),root,'SW1','P408'),1,'clean contacts');
  const bouncing=await toggles(project(10,false),root,'SW1','P408');assert.ok(bouncing>1,`10 ms of bounce, no debounce: ${bouncing} toggles`);
  assert.equal(await toggles(project(10,true),root,'SW1','P408'),1,'10 ms of bounce, 100 ms debounce');
 }finally{await fs.rm(root,{recursive:true,force:true});}
});

test('NUCLEO-F446RE: polling B1 with HAL_GPIO_ReadPin — the same three cases',{skip,timeout:600000},async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'bounce-f4-'));
 try{
  const pin=(fn,label)=>({function:fn,pull:'NOPULL',edge:'FALLING',label,initial:0});
  const project=(bounceMs,wait)=>{const p=blankProject();p.components=[];p.wires=[];p.mcu.peripherals={};p.mcu.pins={PC13:pin('GPIO_Input','B1'),PA5:pin('GPIO_Output','LD2')};p.mcu=validateMcu(p.mcu);
   p.code=generateHal(p.mcu,{minimal:true}).replace('    /* USER CODE BEGIN 3 */',`    /* USER CODE BEGIN 3 */
    if (HAL_GPIO_ReadPin(B1_GPIO_Port, B1_Pin) == GPIO_PIN_RESET) {
      HAL_GPIO_TogglePin(LD2_GPIO_Port, LD2_Pin);
${wait?'      HAL_Delay(100);\n':''}      while (HAL_GPIO_ReadPin(B1_GPIO_Port, B1_Pin) == GPIO_PIN_RESET) { }
${wait?'      HAL_Delay(100);\n':''}    }`);
   p.simulation={stepMs:1,pwmWaveform:false,...(bounceMs?{bounceMs}:{})};return validateProject(p);};
  assert.equal(await toggles(project(0,false),root,'USER','PA5'),1,'clean contacts');
  const bouncing=await toggles(project(10,false),root,'USER','PA5');assert.ok(bouncing>1,`10 ms of bounce, no debounce: ${bouncing} toggles`);
  assert.equal(await toggles(project(10,true),root,'USER','PA5'),1,'10 ms of bounce, 100 ms debounce');
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
