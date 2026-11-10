// A project that keeps its files in folders, as imported from CubeIDE (Core/Src/main.c, Core/Inc, a user folder),
// builds with ARM GCC: every folder is an include directory and main.c compiles from its own folder.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {FirmwareSession} from '../../src/firmware-session.js';
import {blankProject,projectForBoard} from '../../src/project.js';
import {generateHal} from '../../src/mcu-config.js';
import {importFirmware} from '../../src/firmware-import.js';

const require=createRequire(import.meta.url),{prepareBuild,build,detectTools}=require('../../desktop/native-build.cjs');
const tools=await detectTools({armGcc:process.env.ARM_GCC||''});
const skip=!(tools.armGcc&&tools.cube&&tools.cubeF1)&&!process.env.CI_REQUIRE_TOOLCHAIN&&'ARM GCC / STM32CubeF4·F1 not installed';

test('folders build: Core/Src/main.c with "app.h" (Core/Inc) and "../../USER/board.h" (F446RE, F103RB)',{skip,timeout:600000},async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'folders-'));
 try{
  for(const [board,base]of [['F446RE',blankProject()],['F103RB',projectForBoard('nucleo-f103rb')]]){
   const start=structuredClone(base);start.components=[];start.wires=[];start.mcu.pins.PC0={function:'GPIO_Output',pull:'NOPULL',edge:'FALLING',label:'',initial:0};
   const main=generateHal(start.mcu,{minimal:true}).replace('/* USER CODE BEGIN Includes */','/* USER CODE BEGIN Includes */\n#include "app.h"\n#include "../../USER/board.h"')
    .replace('  /* USER CODE BEGIN 2 */','  /* USER CODE BEGIN 2 */\n  if (app_add(2, 3) == 5 + BOARD_OFFSET) HAL_GPIO_WritePin(GPIOC, GPIO_PIN_0, GPIO_PIN_SET);');
   const {project:p}=importFirmware(start,[{name:'Core/Src/main.c',text:main},{name:'Core/Inc/app.h',text:'#pragma once\nint app_add(int a, int b);\n'},
    {name:'Core/Src/app.c',text:'#include "app.h"\n#include "board.h"\nint app_add(int a, int b) { return a + b + BOARD_OFFSET; }\n'},{name:'USER/board.h',text:'#pragma once\n#define BOARD_OFFSET 10\n'}]);
   assert.equal(p.firmware.mainFolder,'Core/Src');
   const plan=await prepareBuild({project:p,tools,root,target:'arm'}),result=await build(plan);
   assert.deepEqual(result.diagnostics.filter(d=>d.severity==='error'),[],board);
   await fs.access(path.join(plan.directory,'Core/Src/main.c'));await fs.access(path.join(plan.directory,'USER/board.h'));
   const s=new FirmwareSession(p,{elf:new Uint8Array(await fs.readFile(result.elf))});for(let t=10;t<=100;t+=10)s.tick(t);
   assert.equal(s.gpio.PC0?.value,3.3,board);
  }
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
