// Feature 43: the Pinout option "주변장치별 .c/.h로 생성" (CubeMX: a pair of .c/.h files per peripheral). With it on the
// generated main.c includes gpio.h and has no MX_GPIO_Init of its own; the pair shows in the project structure as
// Core/Inc/gpio.h and Core/Src/gpio.c (read only) and the program runs. Off again, main.c is one file as before.
import test from 'node:test';
import assert from 'node:assert/strict';
import {launch} from './harness.mjs';

const code=win=>win.evaluate(()=>document.getElementById('code').value);
async function generate(win,couple){
 await win.evaluate(()=>document.getElementById('pinout-open').click());await win.waitForSelector('#pinout-dialog[open]');
 await win.setChecked('#pinout-couple',couple);
 await win.evaluate(()=>document.getElementById('hal-generate').click());
 // A main.c that is not empty is replaced after a confirmation.
 await win.waitForFunction(()=>document.getElementById('hal-replace-dialog').open||!document.getElementById('pinout-dialog').open);
 if(await win.evaluate(()=>document.getElementById('hal-replace-dialog').open))await win.click('#hal-replace-confirm');
 await win.waitForFunction(()=>!document.getElementById('pinout-dialog').open);
}

test('the Pinout option writes main.c with the peripheral headers; the pairs are listed, open read only, and the program runs',{timeout:150000},async()=>{
 const s=await launch();
 try{
  const {win}=s;
  // Feature 51: a new project starts with the option on.
  assert.match(await code(win),/#include "main\.h"\n#include "usart\.h"\n#include "gpio\.h"/);
  await generate(win,false);
  await win.waitForFunction(()=>!/#include "gpio\.h"/.test(document.getElementById('code').value));
  assert.match(await code(win),/^static void MX_GPIO_Init\(void\)\s*\{/m);
  await generate(win,true);
  await win.waitForFunction(()=>/#include "gpio\.h"/.test(document.getElementById('code').value));
  const split=await code(win);
  assert.match(split,/#include "main\.h"\n#include "usart\.h"\n#include "gpio\.h"/);assert.match(split,/\n\s+MX_GPIO_Init\(\);/);
  assert.doesNotMatch(split,/static void MX_GPIO_Init|void MX_GPIO_Init\(void\)\s*\{/);
  // The option is kept: the dialog shows it checked the next time.
  await win.evaluate(()=>document.getElementById('pinout-open').click());await win.waitForSelector('#pinout-dialog[open]');
  assert.equal(await win.isChecked('#pinout-couple'),true);
  await win.keyboard.press('Escape');await win.waitForFunction(()=>!document.getElementById('pinout-dialog').open);
  // The project structure lists the pair where CubeIDE keeps it; it opens as an editable view of the generated file.
  await win.click('[data-activity="explorer"]');if(!await win.locator('#build-files > summary').isVisible())await win.click('[data-activity="explorer"]');
  await win.click('#build-files > summary');
  await win.waitForSelector('#build-file-list [data-build-file="Core/Src/gpio.c"]');
  assert.equal(await win.locator('#build-file-list [data-build-file="Core/Inc/gpio.h"]').count(),1);
  await win.click('#build-file-list [data-build-file="Core/Src/gpio.c"]');
  await win.waitForFunction(()=>/USER\s*CODE\s*BEGIN\s*0/.test((document.querySelector('#group-code .monaco-editor .view-lines')?.textContent||'').replace(/\u00a0/g,' ')));
  assert.match(await win.textContent('#source-path'),/고치면 이 파일만 프로젝트에 저장 · 다시 생성하면 USER CODE 구역 밖은 새로 써짐/);
  await win.click('#source-tabs [data-source="main.c"]');
  // The program runs: MX_GPIO_Init comes from the generated gpio.c.
  await win.evaluate(()=>{const c=document.getElementById('code');c.value=c.value.replace('/* USER CODE BEGIN 2 */','/* USER CODE BEGIN 2 */\n  printf("pairs ok\\n");');c.dispatchEvent(new Event('input',{bubbles:true}));});
  await win.keyboard.press('Control+F5');
  await win.waitForFunction(()=>/pairs ok/.test(document.getElementById('console-output').textContent),null,{timeout:30000}).catch(async e=>{throw new Error(e.message+'\n'+await win.textContent('#console-output'));});
  await win.keyboard.press('Control+F2');await win.waitForFunction(()=>document.getElementById('shell').dataset.running==='false');
  // Off again: one file, and the pair is gone from the list.
  await generate(win,false);
  await win.waitForFunction(()=>/static void MX_GPIO_Init\(void\);/.test(document.getElementById('code').value));
  assert.doesNotMatch(await code(win),/#include "gpio\.h"/);
  await win.waitForFunction(()=>!document.querySelector('#build-file-list [data-build-file="Core/Src/gpio.c"]'));
  assert.deepEqual(s.errors,[]);
 }finally{await s.close();}
});

// Feature 52: main.c generated as one file; the option is switched on and applied with "설정 적용" (no generation), and
// the code is generated later. MX_GPIO_Init, MX_USART2_UART_Init and huart2 leave main.c for gpio.c / usart.c instead of
// being kept in USER CODE sections; what the user wrote stays; the program runs.
test('one file first, the option applied with "설정 적용" and generated later: the generator\'s functions leave main.c',{timeout:150000},async()=>{
 const s=await launch();
 try{
  const {win}=s;
  await generate(win,false);
  const before=await code(win);
  assert.match(before,/^static void MX_GPIO_Init\(void\)\s*\{/m);assert.match(before,/^UART_HandleTypeDef huart2;/m);
  // The user's line in a section.
  await win.evaluate(()=>{const e=document.getElementById('code');e.value=e.value.replace('/* USER CODE BEGIN 2 */\n','/* USER CODE BEGIN 2 */\n  printf("mine\\n");\n');e.dispatchEvent(new Event('input',{bubbles:true}));});
  await win.waitForFunction(()=>/printf\("mine/.test(document.getElementById('code').value));
  // Tick the box and apply the settings only.
  await win.evaluate(()=>document.getElementById('pinout-open').click());await win.waitForSelector('#pinout-dialog[open]');
  await win.setChecked('#pinout-couple',true);await win.click('#pinout-apply');
  await win.waitForFunction(()=>!document.getElementById('pinout-dialog').open);
  assert.match(await code(win),/^static void MX_GPIO_Init\(void\)\s*\{/m,'applying does not write the code');
  // Generate later: the box is still on.
  await generate(win,true);
  const after=await code(win);
  assert.match(after,/#include "gpio\.h"/);assert.match(after,/#include "usart\.h"/);
  assert.doesNotMatch(after,/^(?:static )?void MX_\w+_Init\(void\)\s*\{/m,'no MX_*_Init is defined in main.c');
  assert.doesNotMatch(after,/^UART_HandleTypeDef huart2;/m);assert.doesNotMatch(after,/^static void MX_\w+_Init\(void\);/m);
  assert.match(after,/printf\("mine\\n"\);/,'the user line stays');
  assert.doesNotMatch(await win.evaluate(()=>document.getElementById('console-output').textContent),/구역 안으로 옮겨 유지했습니다/,'nothing was taken for user code');
  await win.waitForSelector('#build-file-list [data-build-file="Core/Src/gpio.c"]',{state:'attached'});
  assert.deepEqual(s.errors,[]);
 }finally{await s.close();}
});
