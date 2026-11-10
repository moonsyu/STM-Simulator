// Feature 14: the whole CubeIDE project structure can be seen and changed. A project may hold startup code (.s) and a
// linker script (.ld) of its own; the ARM build then uses them in place of the SDK's startup file and the script the
// app writes. The interpreter leaves them alone.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {blankProject,validateProject} from '../../src/project.js';
import {SOURCE_PATH,changeSourceFile} from '../../src/source-files.js';
import {buildEnvironment,linkerScript,linkerName,mainHeader,HAL_MODULES} from '../../src/build-environment.js';
import {generateHal} from '../../src/mcu-config.js';
import {SimulationSession} from '../../src/session.js';

const nativeBuild=createRequire(import.meta.url)('../../desktop/native-build.cjs');
const hal=()=>{const p=blankProject();p.mcu.pins.PA5={function:'GPIO_Output',pull:'NOPULL',edge:'FALLING',label:'LD2',initial:0};p.code=generateHal(p.mcu,{minimal:true});p.firmware={mode:'hal',files:[]};return p;};

test('a project can hold .s and .ld files; they are validated like the other sources',()=>{
 for(const name of ['Core/Startup/startup_stm32f446xx.s','STM32F446RETX_FLASH.ld','boot.s'])assert.ok(SOURCE_PATH.test(name),name);
 for(const name of ['startup.S.bak','script.ld.txt','../x.ld','a.asm'])assert.ok(!SOURCE_PATH.test(name),name);
 const p=changeSourceFile(changeSourceFile(hal(),'add','Core/Startup/startup_stm32f446xx.s'),'add','STM32F446RETX_FLASH.ld');
 assert.deepEqual(p.firmware.files.map(f=>[f.name,f.text]),[['Core/Startup/startup_stm32f446xx.s',''],['STM32F446RETX_FLASH.ld','']]);
 assert.equal(validateProject(p).firmware.files.length,2);
});

test('what the build writes is offered as views — main.h with the Pinout labels, the linker script — until the project has its own',()=>{
 const p=hal(),names=q=>buildEnvironment(q).files.map(f=>f.file);
 assert.deepEqual(names(p),['Core/Src/stm32f4xx_it.c','Core/Src/syscalls.c','Core/Src/sysmem.c','Core/Inc/main.h','STM32F446RETX_FLASH.ld']);
 assert.match(mainHeader(p),/#include "stm32f4xx_hal\.h"[\s\S]*#define LD2_Pin GPIO_PIN_5\n#define LD2_GPIO_Port GPIOA/);
 assert.match(linkerScript('STM32F103RB'),/LENGTH = 128K[\s\S]*LENGTH = 20K/);assert.equal(linkerName('STM32F103RB'),'STM32F103RBTX_FLASH.ld');
 p.firmware.files=[{name:'Core/Inc/main.h',text:mainHeader(p)},{name:'my.ld',text:linkerScript(p.mcu.family)}];
 assert.deepEqual(names(p),['Core/Src/stm32f4xx_it.c','Core/Src/syscalls.c','Core/Src/sysmem.c']);
 assert.ok(HAL_MODULES.STM32F446RE.includes('hal_gpio')&&HAL_MODULES.STM32F103RB.includes('hal_gpio_ex'));
});

test('the ARM build assembles the project\'s startup file and links with its linker script instead of the SDK\'s and the app\'s',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'stm-structure-'));
 try{
  const gcc=path.join(dir,'bin','arm-none-eabi-gcc'),cube=path.join(dir,'cube');await fs.mkdir(path.dirname(gcc));await fs.writeFile(gcc,'');
  const inc=path.join(cube,'Drivers/STM32F4xx_HAL_Driver/Inc');await fs.mkdir(inc,{recursive:true});await fs.writeFile(path.join(inc,'stm32f4xx_hal.h'),'');await fs.writeFile(path.join(inc,'stm32f4xx_hal_conf_template.h'),'');
  const p=hal(),plain=await nativeBuild.prepareBuild({project:p,tools:{armGcc:gcc,cube},root:path.join(dir,'a')});
  assert.ok(plain.units.some(u=>/Templates[\\/]gcc[\\/]startup_stm32f446xx\.s$/.test(u.file)));
  assert.ok(plain.linkFlags.includes('-T'+path.join(plain.directory,'STM32F446RETX_FLASH.ld')));
  p.firmware.files=[{name:'Core/Startup/startup_stm32f446xx.s',text:'/* my startup */\n'},{name:'STM32F446RETX_FLASH.ld',text:'/* my script */\n'+linkerScript(p.mcu.family)}];
  const own=await nativeBuild.prepareBuild({project:validateProject(p),tools:{armGcc:gcc,cube},root:path.join(dir,'b')});
  const startups=own.units.filter(u=>/startup_.*\.s$/.test(u.file)).map(u=>u.file);
  assert.deepEqual(startups,[path.join(own.directory,'Core/Startup/startup_stm32f446xx.s')]);
  assert.ok(own.linkFlags.includes('-T'+path.join(own.directory,'STM32F446RETX_FLASH.ld')));
  assert.match(await fs.readFile(path.join(own.directory,'STM32F446RETX_FLASH.ld'),'utf8'),/my script/);
  assert.match(await fs.readFile(path.join(own.directory,'Core/Startup/startup_stm32f446xx.s'),'utf8'),/my startup/);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});

test('the interpreter runs the project and ignores its .s and .ld files',()=>{
 const p=hal();p.code=p.code.replace('  /* USER CODE BEGIN 2 */','  /* USER CODE BEGIN 2 */\n  printf("up\\n");');
 p.firmware.files=[{name:'Core/Startup/startup_stm32f446xx.s',text:'.syntax unified\n  .global Reset_Handler\n'},{name:'STM32F446RETX_FLASH.ld',text:linkerScript(p.mcu.family)}];
 const out=[],s=new SimulationSession(validateProject(p),{print:x=>out.push(x),warn:()=>{}});s.tick(0);s.tick(10);
 assert.deepEqual(out,['up']);
});
