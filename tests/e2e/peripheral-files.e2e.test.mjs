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
  assert.doesNotMatch(await code(win),/#include "gpio\.h"/);
  await generate(win,true);
  await win.waitForFunction(()=>/#include "gpio\.h"/.test(document.getElementById('code').value));
  const split=await code(win);
  assert.match(split,/#include "main\.h"\n#include "gpio\.h"/);assert.match(split,/\n\s+MX_GPIO_Init\(\);/);
  assert.doesNotMatch(split,/static void MX_GPIO_Init|void MX_GPIO_Init\(void\)\s*\{/);
  // The option is kept: the dialog shows it checked the next time.
  await win.evaluate(()=>document.getElementById('pinout-open').click());await win.waitForSelector('#pinout-dialog[open]');
  assert.equal(await win.isChecked('#pinout-couple'),true);
  await win.keyboard.press('Escape');await win.waitForFunction(()=>!document.getElementById('pinout-dialog').open);
  // The project structure lists the pair where CubeIDE keeps it; the file opens read only with the init function.
  await win.click('[data-activity="explorer"]');if(!await win.locator('#build-files > summary').isVisible())await win.click('[data-activity="explorer"]');
  await win.click('#build-files > summary');
  await win.waitForSelector('#build-file-list [data-build-file="Core/Src/gpio.c"]');
  assert.equal(await win.locator('#build-file-list [data-build-file="Core/Inc/gpio.h"]').count(),1);
  await win.click('#build-file-list [data-build-file="Core/Src/gpio.c"]');
  await win.waitForSelector('#copy-to-project');
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
