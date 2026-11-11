// Error-case pass, feature 10 (CubeIDE project import) and feature 23 (button bounce settings): what each odd input
// gives — imported, imported with a named omission, or refused with the reason. One row per case.
import test from 'node:test';
import assert from 'node:assert/strict';
import {blankProject,validateProject} from '../../src/project.js';
import {importFirmware} from '../../src/firmware-import.js';
import {generateHal,defaultMcu} from '../../src/mcu-config.js';
import {exportIoc} from '../../src/ioc-export.js';
import {SimulationSession} from '../../src/session.js';
import {applyHalExample} from '../../src/hal-examples.js';

const main=generateHal(defaultMcu('STM32F446RE')),f=(name,text='/* x */\n')=>({name,text});
const ioc446=exportIoc(defaultMcu('STM32F446RE')),ioc103=exportIoc(defaultMcu('STM32F103RB'));
const run=files=>{const r=importFirmware(blankProject(),files);return {files:validateProject(r.project).firmware?.files.map(x=>x.name)??[],mainFolder:r.project.firmware?.mainFolder,warnings:r.warnings,code:r.project.code};};

test('folders, several main.c, line endings and name clashes are imported, with what was left out named',()=>{
 let r=run([f('Core/Src/main.c',main),f('Core/Inc/app.h','#pragma once\n'),f('USER/lib/util.c','int util(void){return 1;}\n')]);
 assert.deepEqual(r.files,['Core/Inc/app.h','USER/lib/util.c']);assert.equal(r.mainFolder,'Core/Src');assert.deepEqual(r.warnings,[]);
 r=run([f('main.c',main),f('Core/Src/main.c',main)]);assert.equal(r.mainFolder,undefined);assert.match(r.warnings[0],/main\.c가 여러 개라 main\.c을 주 소스로[\s\S]*Core\/Src\/main\.c는 가져오지 않았습니다/);
 r=run([f('A/main.c',main),f('B/main.c',main)]);assert.equal(r.mainFolder,'A');assert.match(r.warnings[0],/B\/main\.c는 가져오지 않았습니다/);
 r=run([f('main.c','﻿'+main.replace(/\n/g,'\r\n'))]);assert.ok(!r.code.includes('\r')&&!r.code.startsWith('﻿'),'CRLF and the byte order mark are normalised');
 r=run([f('main.c',main),f('App.c'),f('app.c')]);assert.deepEqual(r.files,['App.c']);assert.match(r.warnings[0],/이름이 겹쳐 가져오지 않은 파일: app\.c/);
 // CubeIDE's own copies of files the app provides come along as project files (the build then uses them).
 r=run([f('Core/Src/main.c',main),f('Core/Src/stm32f4xx_it.c','void SysTick_Handler(void){HAL_IncTick();}\n'),f('Core/Src/system_stm32f4xx.c'),f('Core/Src/syscalls.c')]);
 assert.deepEqual(r.files,['Core/Src/stm32f4xx_it.c','Core/Src/system_stm32f4xx.c','Core/Src/syscalls.c']);
 // An empty main.c and one that is not C are taken as they are (the editor and the build then say what is wrong).
 assert.equal(run([f('main.c','')]).code,'');assert.doesNotThrow(()=>run([f('main.c','\u0000\u0001binary')]));
 assert.deepEqual(run([f('main.c',main),f('h'.repeat(71)+'.h')]).files,['h'.repeat(71)+'.h'],'the longest name a project holds');
});

test('what cannot be imported is refused with the reason',()=>{
 const refused=(files,pattern)=>assert.throws(()=>importFirmware(blankProject(),files),pattern);
 refused([f('Core/Src/app.c')],/main\.c를 함께 선택하세요/);
 refused([f('p.ioc',ioc103)],/이 \.ioc는 STM32F103RB용입니다[\s\S]*NUCLEO-F103RB 보드로 새 프로젝트/);
 refused([f('a.ioc',ioc446),f('b.ioc',ioc446),f('main.c',main)],/\.ioc 파일은 하나만/);
 refused([f('Core/p.ioc',ioc446),f('main.c',main)],/파일 이름, 확장자 또는 중복/);
 for(const name of ['MAIN.C','README.md','Makefile','my file.c','a/b/c/d/e/f/g/x.c','../x.c','h'.repeat(72)+'.h'])refused([f('main.c',main),f(name)],/파일 이름, 확장자 또는 중복/);
 refused([f('main.c',main),f('x.c'),f('x.c')],/파일 이름, 확장자 또는 중복/);
 refused([f('main.c',main),...Array.from({length:121},(_,i)=>f(`src/f${i}.c`))],/\.ioc 및 \.c\/\.h 파일을 선택하세요/);
 refused([f('main.c',main),f('big.c','/*'+'x'.repeat(1100000)+'*/')],/합계 1 MB 이하/);
 refused([],/\.ioc 및 \.c\/\.h 파일을 선택하세요/);refused(null,/\.ioc 및 \.c\/\.h 파일을 선택하세요/);
});

test('button bounce: only the listed times are a valid setting, and a press let go inside the bounce ends released',()=>{
 const base=applyHalExample(blankProject(),'ref_button_2'),sim={stepMs:1,pwmWaveform:false,...(base.simulation||{})};
 const withBounce=v=>validateProject({...base,simulation:{...sim,bounceMs:v}}).simulation?.bounceMs;
 for(const ms of [2,5,10,20])assert.equal(withBounce(ms),ms);
 assert.equal(withBounce(0),undefined,'0 is off and is not stored');
 for(const bad of [7,-1,'5',null,2.5,1e9,true])assert.throws(()=>withBounce(bad),/버튼 채터링 시간이 올바르지 않습니다/,String(bad));
 const p=validateProject({...base,simulation:{...sim,bounceMs:20}}),s=new SimulationSession(p);
 for(let t=1;t<=20;t++)s.tick(t);
 s.setPressed({USER:true});for(let t=21;t<=25;t++)s.tick(t);
 assert.ok(s.bounce.queue.length>0,'still bouncing 5 ms after the press');
 s.setPressed({});for(let t=26;t<=80;t++)s.tick(t);
 assert.deepEqual(s.pressed,{});assert.equal(s.bounce.queue.length,0);
});
