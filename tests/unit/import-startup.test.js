// Error-case pass, feature 10 (CubeIDE project import): the project's own startup code and linker script were left
// out without a word, so a project with an edited linker script was built with the app's. They come along now — the
// ones of this board's MCU only — and what is left out is named.
import test from 'node:test';
import assert from 'node:assert/strict';
import {blankProject,projectForBoard,validateProject} from '../../src/project.js';
import {importFirmware} from '../../src/firmware-import.js';
import {generateHal,defaultMcu} from '../../src/mcu-config.js';
import {planDrop} from '../../src/file-drop.js';

const f=(name,text='/* x */\n')=>({name,text});
const main=generateHal(defaultMcu('STM32F446RE'));

test('a CubeIDE project folder: Core/Startup/startup_….s and …_FLASH.ld become project files',()=>{
 const r=importFirmware(blankProject(),[f('Core/Src/main.c',main),f('Core/Inc/main.h','#pragma once\n'),f('Core/Startup/startup_stm32f446xx.s','/* startup */\n'),f('STM32F446RETX_FLASH.ld','/* flash */\n'),f('STM32F446RETX_RAM.ld','/* ram */\n')]);
 const p=validateProject(r.project);
 assert.deepEqual(p.firmware.files.map(x=>x.name),['Core/Inc/main.h','Core/Startup/startup_stm32f446xx.s','STM32F446RETX_FLASH.ld']);
 assert.equal(p.firmware.mainFolder,'Core/Src');
 assert.equal(r.warnings.length,1);assert.match(r.warnings[0],/가져오지 않은 시작 코드·링커 스크립트: STM32F446RETX_RAM\.ld/);
});

test('files of another MCU, a second startup file or script are left out and named; without them nothing is said',()=>{
 const other=importFirmware(blankProject(),[f('main.c',main),f('startup_stm32f103xb.s'),f('STM32F103RBTX_FLASH.ld'),f('boot.s')]);
 assert.deepEqual(other.project.firmware.files,[]);assert.match(other.warnings[0],/startup_stm32f103xb\.s, STM32F103RBTX_FLASH\.ld, boot\.s/);
 const twice=importFirmware(blankProject(),[f('main.c',main),f('a/startup_stm32f446xx.s'),f('b/startup_stm32f446re.s'),f('STM32F446RETX_FLASH.ld'),f('old/STM32F446RE_FLASH.ld')]);
 assert.deepEqual(twice.project.firmware.files.map(x=>x.name),['a/startup_stm32f446xx.s','STM32F446RETX_FLASH.ld']);assert.match(twice.warnings[0],/b\/startup_stm32f446re\.s, old\/STM32F446RE_FLASH\.ld/);
 const f103=importFirmware(projectForBoard('nucleo-f103rb'),[f('Core/Src/main.c',generateHal(defaultMcu('STM32F103RB'))),f('Core/Startup/startup_stm32f103xb.s'),f('STM32F103RBTX_FLASH.ld')]);
 assert.deepEqual(f103.project.firmware.files.map(x=>x.name),['Core/Startup/startup_stm32f103xb.s','STM32F103RBTX_FLASH.ld']);assert.deepEqual(f103.warnings,[]);
 assert.deepEqual(importFirmware(blankProject(),[f('main.c',main),f('app.c')]).warnings,[]);
 // Only a startup file, with no main.c: nothing to import it into.
 assert.throws(()=>importFirmware(blankProject(),[f('startup_stm32f446xx.s')]),/main\.c를 함께/);
});

test('a dropped project folder passes the same files on',()=>{
 const plan=planDrop([{name:'Demo/Core/Src/main.c',text:main,size:main.length},{name:'Demo/Core/Startup/startup_stm32f446xx.s',text:'x',size:1},{name:'Demo/STM32F446RETX_FLASH.ld',text:'x',size:1},{name:'Demo/README.md',text:'x',size:1}],blankProject());
 assert.equal(plan.action,'import');assert.deepEqual(plan.files.map(x=>x.name),['Core/Src/main.c','Core/Startup/startup_stm32f446xx.s','STM32F446RETX_FLASH.ld']);assert.deepEqual(plan.skipped,['README.md']);
});
