// Feature 45: every file of the CubeIDE project tree is edited in place. An edited generated / SDK file is a project file
// with its origin; generating the code again rewrites the regenerated kind (main.c, main.h, it.c, hal_conf.h, the
// per-peripheral pairs) keeping only USER CODE sections, and leaves the generated-once kind alone.
import test from 'node:test';
import assert from 'node:assert/strict';
import {blankProject,validateProject} from '../../src/project.js';
import {generateHal,validateMcu} from '../../src/mcu-config.js';
import {buildEnvironment} from '../../src/build-environment.js';
import {peripheralFiles} from '../../src/peripheral-files.js';
import {regenerated,fileKind,armOnly,regenerateOverrides,generationPlan,lostLines,outsideRanges,editedLabel} from '../../src/project-overrides.js';
import {compileHal} from '../../src/hal-source.js';
import {halFiles} from '../../src/peripheral-files.js';
import {SimulationSession} from '../../src/session.js';
import {regenerateMain} from '../../src/c-source-edit.js';
import {expandC} from '../../src/c-format.js';

const pin=fn=>({function:fn,pull:'NOPULL',edge:'FALLING',label:'',initial:0});
const itOf=p=>buildEnvironment(p).files.find(f=>/_it\.c$/.test(f.file));

test('which files generating the code rewrites (CubeMX) and which it makes once; what only ARM GCC compiles',()=>{
 for(const name of ['main.c','Core/Inc/main.h','Core/Src/stm32f4xx_it.c','Core/Inc/stm32f4xx_hal_conf.h','Core/Src/gpio.c','Core/Inc/usart.h'])assert.equal(fileKind(name,'STM32F446RE'),'regen',name);
 for(const name of ['Core/Src/syscalls.c','Core/Src/sysmem.c','Core/Src/system_stm32f4xx.c','Core/Startup/startup_stm32f446xx.s','STM32F446RETX_FLASH.ld','Drivers/STM32F4xx_HAL_Driver/Src/stm32f4xx_hal_gpio.c'])assert.equal(fileKind(name,'STM32F446RE'),'once',name);
 assert.equal(regenerated('Core/Src/stm32f1xx_it.c','STM32F103RB'),true);assert.equal(regenerated('Core/Src/stm32f4xx_it.c','STM32F103RB'),false,'another family');
 for(const name of ['Drivers/CMSIS/Device/ST/STM32F1xx/Include/stm32f103xb.h','Core/Src/syscalls.c','Core/Src/system_stm32f1xx.c','Core/Startup/startup_stm32f103xb.s','x.ld'])assert.equal(armOnly(name),true,name);
 for(const name of ['main.c','Core/Src/stm32f1xx_it.c','Core/Inc/main.h','Core/Src/app.c'])assert.equal(armOnly(name),false,name);
 // A file without origin is the user's own unless the tree also offers that path (a copy made before 1.51.0).
 const labels=new Set(['Core/Src/syscalls.c']);
 assert.equal(editedLabel({name:'Core/Src/app.c'},labels),false);assert.equal(editedLabel({name:'Core/Src/syscalls.c'},labels),true);assert.equal(editedLabel({name:'x.c',origin:'sdk'},labels),true);
});

test('the generated stm32xxxx_it.c, main.h and pairs have CubeMX\'s USER CODE sections',()=>{
 const p=blankProject();p.mcu.nvic.USART2_IRQn={enabled:true,priority:1};p.mcu=validateMcu(p.mcu);
 const it=itOf(p).text;
 assert.match(it,/void SysTick_Handler\(void\)\n\{\n {2}\/\* USER CODE BEGIN SysTick_IRQn 0 \*\/\n\n {2}\/\* USER CODE END SysTick_IRQn 0 \*\/\n {2}HAL_IncTick\(\);\n {2}\/\* USER CODE BEGIN SysTick_IRQn 1 \*\//);
 assert.match(it,/void USART2_IRQHandler\(void\)\n\{\n {2}\/\* USER CODE BEGIN USART2_IRQn 0 \*\/[\s\S]*HAL_UART_IRQHandler\(&huart2\);/);
 assert.equal(it.split('extern UART_HandleTypeDef huart2;').length,2,'one declaration of the handle');
 const header=buildEnvironment(p).files.find(f=>f.file==='Core/Inc/main.h').text;
 for(const tag of ['Includes','ET','EC','EM','EFP','Private defines'])assert.match(header,new RegExp(`USER CODE BEGIN ${tag} \\*/`),tag);
 // The edited it.c is a project source: the interpreter compiles it and the program still runs.
 const edited=itOf(p).text.replace('/* USER CODE BEGIN SysTick_IRQn 1 */\n','/* USER CODE BEGIN SysTick_IRQn 1 */\n  ticks++;\n').replace('/* USER CODE BEGIN EV */','volatile unsigned ticks;\n/* USER CODE BEGIN EV */');
 p.firmware.files.push({name:'Core/Src/stm32f4xx_it.c',text:edited,origin:'gen'});
 assert.doesNotThrow(()=>compileHal(p.code,halFiles(p),p.mcu.family));
});

test('regenerating an edited it.c keeps its USER CODE sections, drops what is outside, and counts the lost lines',()=>{
 const p=blankProject(),it=itOf(p).text;
 const edited=it.replace('  /* USER CODE BEGIN SysTick_IRQn 1 */\n','  /* USER CODE BEGIN SysTick_IRQn 1 */\n  user_tick();\n').replace('  HAL_IncTick();','  HAL_IncTick();\n  outside_line_a();\n  outside_line_b();');
 p.firmware.files.push({name:'Core/Src/stm32f4xx_it.c',text:edited,origin:'gen'});
 // A new Pinout: USART2's interrupt on.
 const next=validateMcu({...structuredClone(p.mcu),nvic:{USART2_IRQn:{enabled:true,priority:1}}});
 const {files,report}=regenerateOverrides(p,next),out=files.find(f=>f.name==='Core/Src/stm32f4xx_it.c');
 assert.match(out.text,/USER CODE BEGIN SysTick_IRQn 1 \*\/\n {2}user_tick\(\);/,'the section stays');
 assert.doesNotMatch(out.text,/outside_line_/,'the lines outside go');assert.match(out.text,/void USART2_IRQHandler\(void\)/,'the new handler is there');
 assert.deepEqual(report,[{name:'Core/Src/stm32f4xx_it.c',lost:2,reset:false}]);
 assert.equal(out.origin,'gen');
 // An edit that only changed sections loses nothing; an override equal to the generated file is not kept.
 const sameP=blankProject();sameP.firmware.files.push({name:'Core/Src/stm32f4xx_it.c',text:itOf(sameP).text,origin:'gen'});
 const same=regenerateOverrides(sameP,next);assert.deepEqual(same.report,[]);assert.equal(same.files.some(f=>f.name==='Core/Src/stm32f4xx_it.c'),false,'only edited files are stored');
});

test('generated-once and user files are not touched; hal_conf.h and a removed pair go back to the original',()=>{
 const p=blankProject();
 p.firmware.files.push({name:'Core/Src/syscalls.c',text:'int edited_syscalls;\n',origin:'gen'},{name:'Core/Src/system_stm32f4xx.c',text:'int edited_system;\n',origin:'sdk',of:'Drivers/CMSIS/Device/ST/STM32F4xx/Source/Templates/system_stm32f4xx.c'},
  {name:'Core/Src/stm32f4xx_it.c',text:'/* an imported it.c without origin */\n',},{name:'Core/Inc/stm32f4xx_hal_conf.h',text:'#define HSE_VALUE 8000000U\n',origin:'sdk',of:'Drivers/STM32F4xx_HAL_Driver/Inc/stm32f4xx_hal_conf_template.h'});
 const v=validateProject(p);assert.equal(v.firmware.files.find(f=>f.name==='Core/Src/system_stm32f4xx.c').of,'Drivers/CMSIS/Device/ST/STM32F4xx/Source/Templates/system_stm32f4xx.c','origin and of are stored');
 const {files,report}=regenerateOverrides(v,v.mcu);
 assert.deepEqual(files.map(f=>f.name),['main.h','Core/Src/syscalls.c','Core/Src/system_stm32f4xx.c','Core/Src/stm32f4xx_it.c'].filter(n=>v.firmware.files.some(f=>f.name===n)));
 assert.deepEqual(report,[{name:'Core/Inc/stm32f4xx_hal_conf.h',lost:1,reset:true}]);
 // A pair whose peripheral is turned off is not generated any more: the edit goes.
 const q=blankProject();q.mcu=validateMcu({...q.mcu,coupleFiles:true});const usart=peripheralFiles(q.mcu).find(f=>f.name==='usart.c');
 q.firmware.files.push({name:'Core/Src/usart.c',text:usart.text.replace('/* USER CODE BEGIN 1 */','int extra;\n/* USER CODE BEGIN 1 */'),origin:'gen'});
 const off=validateMcu({...q.mcu,pins:{},peripherals:{}});const r=regenerateOverrides(q,off);
 assert.equal(r.files.some(f=>f.name==='Core/Src/usart.c'),false);assert.deepEqual(r.report.map(x=>[x.name,x.reset]),[['Core/Src/usart.c',true]]);
});

test('the plan before generating names main.c and the edited files with the lines that go',()=>{
 // As the Pinout dialog computes it: main.c regenerated (USER CODE kept) against what the old settings generate.
 const p=blankProject(),previous=expandC(generateHal(p.mcu));
 p.code=p.code.replace('    SystemClock_Config();','    SystemClock_Config();\n    my_outside_call();');
 const main=regenerateMain(p.code,previous,previous).code;assert.doesNotMatch(main,/my_outside_call/);assert.match(main,/printf\("HAL ready\\n"\);/,'the section is kept');
 const plan=generationPlan(p,p.mcu,{main,previousMain:previous});
 assert.deepEqual(plan.report,[{name:'main.c',lost:1,reset:false}]);
 assert.equal(lostLines('a\nb\nc','a\nb','a'),1,'c was the user\'s; b was generated');
 assert.equal(lostLines('a\nb','a\nb','a\nb\nx'),0);
});

test('lines outside the USER CODE sections, for the faded view',()=>{
 assert.deepEqual(outsideRanges('int a;\n/* USER CODE BEGIN 1 */\nmine();\n/* USER CODE END 1 */\nint b;\n'),[[1,1],[2,2],[4,4],[5,6]]);
 assert.deepEqual(outsideRanges('no sections here\n'),[],'a file without sections is not faded');
 assert.deepEqual(outsideRanges('/* USER CODE BEGIN 0 */\n/* USER CODE END 0 */'),[[1,1],[2,2]]);
});

test('project files: origin and of are checked; edited SDK files have their own 4 MB',()=>{
 const p=blankProject();
 p.firmware.files=[{name:'a.c',text:'int a;',origin:'other'}];assert.throws(()=>validateProject(p),/파일 출처/);
 p.firmware.files=[{name:'a.c',text:'int a;',origin:'gen',of:'x.c'}];assert.throws(()=>validateProject(p),/SDK 파일 경로/);
 p.firmware.files=[{name:'a.c',text:'int a;',origin:'sdk',of:'../x.c'}];assert.throws(()=>validateProject(p),/SDK 파일 경로/);
 // 1.5 MB of edited SDK headers is fine; the same as an ordinary source is over the 1 MB.
 p.firmware.files=[{name:'Drivers/x/big.h',text:'x'.repeat(1.5e6),origin:'sdk',of:'Drivers/x/big.h'}];assert.doesNotThrow(()=>validateProject(p));
 p.firmware.files=[{name:'Drivers/x/big.h',text:'x'.repeat(1.5e6)}];assert.throws(()=>validateProject(p),/1 MB/);
 p.firmware.files=[{name:'Drivers/x/a.h',text:'x'.repeat(2.1e6),origin:'sdk',of:'a'},{name:'Drivers/x/b.h',text:'x'.repeat(2.1e6),origin:'sdk',of:'b'}];assert.throws(()=>validateProject(p),/4 MB/);
});

test('an old project with a copied it.c (no origin) loads and runs as before',()=>{
 const p=blankProject();p.firmware.files.push({name:'Core/Src/stm32f4xx_it.c',text:'/* stm32f4xx_it.c — 프로젝트로 복사한 파일입니다. */\n#include "main.h"\nvoid SysTick_Handler(void) { HAL_IncTick(); }\n'});
 const v=validateProject(JSON.parse(JSON.stringify(p)));assert.equal(v.firmware.files[0].origin,undefined);
 const out=[],s=new SimulationSession(v,{print:x=>out.push(x)});for(let t=0;t<=30;t+=10)s.tick(t);
 assert.equal(s.runtime.error??null,null);
 assert.deepEqual(regenerateOverrides(v,v.mcu).files.map(f=>f.text),v.firmware.files.map(f=>f.text),'not regenerated');
});

// Found by the review of 1.51.0 (a workflow of independent reviewers, each finding checked by two skeptics).
test('review: a handler written in an edited it.c\'s own USER CODE section is not generated a second time',()=>{
 const p=blankProject(),it=itOf(p).text;
 p.firmware.files.push({name:'Core/Src/stm32f4xx_it.c',text:it.replace('/* USER CODE BEGIN 1 */','/* USER CODE BEGIN 1 */\nvoid USART2_IRQHandler(void) { mine(); }'),origin:'gen'});
 const next=validateMcu({...structuredClone(p.mcu),nvic:{USART2_IRQn:{enabled:true,priority:1}}});
 const out=regenerateOverrides(p,next).files.find(f=>f.name==='Core/Src/stm32f4xx_it.c').text;
 assert.equal(out.split('void USART2_IRQHandler(void)').length-1,1,'one definition');assert.match(out,/mine\(\);/);
});

test('review: the baseline is the text the file was edited from — a Pinout applied in between does not count as the user\'s lines',()=>{
 const p=blankProject();p.mcu=validateMcu({...p.mcu,nvic:{USART2_IRQn:{enabled:true,priority:1}}});
 const base=itOf(p).text,edited=base.replace('  /* USER CODE BEGIN SysTick_IRQn 1 */\n','  /* USER CODE BEGIN SysTick_IRQn 1 */\n  user_tick();\n');
 p.firmware.files.push({name:'Core/Src/stm32f4xx_it.c',text:edited,origin:'gen',base});
 // USART2's interrupt turned off with "설정 적용" (no generation), then the code is generated.
 p.mcu=validateMcu({...p.mcu,nvic:{}});
 const {files,report}=regenerateOverrides(p,p.mcu);
 assert.deepEqual(report,[],'only a section was edited: nothing of the user\'s goes');
 const out=files.find(f=>f.name==='Core/Src/stm32f4xx_it.c');assert.match(out.text,/user_tick\(\);/);assert.doesNotMatch(out.text,/USART2_IRQHandler/);
 assert.equal(out.base,itOf({...p,firmware:{...p.firmware,files:[]}}).text,'the new baseline is what was generated now');
 assert.doesNotThrow(()=>validateProject({...p,firmware:{...p.firmware,files}}));
 p.firmware.files=[{name:'a.c',text:'x',origin:'sdk',of:'a.c',base:'y'}];assert.throws(()=>validateProject(p),/생성 원본/);
});

