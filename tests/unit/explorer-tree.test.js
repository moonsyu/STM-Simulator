// Feature 56: the explorer shows the whole project as one tree, as STM32CubeIDE's Project Explorer does, and the files
// the app generates start with CubeMX's header instead of a note of the app. The tree and the texts are made in Rust
// (rust/stm-core/src/explorer.rs).
import test from 'node:test';
import assert from 'node:assert/strict';
import {rustCall,cubeHeader} from '../../src/rust-core.js';
import {blankProject,projectForBoard} from '../../src/project.js';
import {buildEnvironment} from '../../src/build-environment.js';
import {peripheralFiles,halFiles} from '../../src/peripheral-files.js';
import {compileHal} from '../../src/hal-source.js';

test('the tree: Includes first, folders before files, both in alphabetical order',()=>{
 const paths=['Core/Src/main.c','test.ioc','Core/Src/usart.c','Core/Inc/main.h','STM32F103RBTX_FLASH.ld','Core/Startup/startup_stm32f103xb.s','Drivers/CMSIS/Include/core_cm3.h','Core/Src/gpio.c'];
 const root=rustCall('explorer_tree',{paths,includes:['Core/Inc','Drivers/CMSIS/Include']});
 assert.deepEqual(root.folders.map(f=>f.name),['Includes','Core','Drivers']);assert.deepEqual(root.folders[0].includes,['Core/Inc','Drivers/CMSIS/Include']);
 assert.deepEqual(root.rows.map(i=>paths[i]),['STM32F103RBTX_FLASH.ld','test.ioc']);
 const core=root.folders[1];assert.deepEqual(core.folders.map(f=>f.path),['Core/Inc','Core/Src','Core/Startup']);
 assert.deepEqual(core.folders[1].rows.map(i=>paths[i]),['Core/Src/gpio.c','Core/Src/main.c','Core/Src/usart.c']);
 // An FSP project has no Includes node.
 assert.deepEqual(rustCall('explorer_tree',{paths:['src/hal_entry.c','ra_gen/hal_data.c'],includes:[]}).folders.map(f=>f.name),['ra_gen','src']);
});

test('generated files start with CubeMX\'s header; stm32xxxx_it.h and stm32xxxx_hal_msp.c are part of the project',()=>{
 assert.equal(cubeHeader('gpio.c','This file provides code for the configuration\nof all used GPIO pins.'),
  '/* USER CODE BEGIN Header */\n/**\n  ******************************************************************************\n  * @file    gpio.c\n  * @brief   This file provides code for the configuration\n  *          of all used GPIO pins.\n  ******************************************************************************\n  */\n/* USER CODE END Header */');
 for(const [p,prefix]of [[blankProject(),'stm32f4xx'],[projectForBoard('nucleo-f103rb'),'stm32f1xx']]){
  const files=[...buildEnvironment(p).files,...peripheralFiles(p.mcu).map(f=>({file:f.name,text:f.text}))];
  assert.deepEqual(files.map(f=>f.file.split('/').at(-1)).sort(),['gpio.c','gpio.h','main.h',`${prefix}_hal_msp.c`,`${prefix}_it.c`,`${prefix}_it.h`,'syscalls.c','sysmem.c','usart.c','usart.h',prefix==='stm32f1xx'?'STM32F103RBTX_FLASH.ld':'STM32F446RETX_FLASH.ld'].sort());
  for(const f of files){
   assert.ok(f.text.startsWith('/* USER CODE BEGIN Header */\n/**\n'),f.file);assert.ok(f.text.includes(`  * @file    ${f.file.split('/').at(-1)}\n`),f.file);
   assert.doesNotMatch(f.text,/STM Simulator|고칠 수 있고|읽기 전용/,f.file);
  }
  // The project still builds for the interpreter with the pairs.
  assert.doesNotThrow(()=>compileHal(p.code,halFiles(p),p.mcu.family));
  // A project with its own stm32xxxx_hal_msp.c is not offered a second one.
  const own={...p,firmware:{...p.firmware,files:[{name:`Core/Src/${prefix}_hal_msp.c`,text:'#include "main.h"\nvoid HAL_MspInit(void) {}\n'}]}};
  assert.ok(!buildEnvironment(own).files.some(f=>f.file.endsWith('_hal_msp.c')));
 }
});
