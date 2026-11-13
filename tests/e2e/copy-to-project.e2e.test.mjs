// Feature 45 (it replaced feature 11's "프로젝트로 복사해 수정"): a file of the project tree that the build adds
// (stm32f1xx_it.c on the start board) is edited in place. The first change stores that file — and only it — in the
// project under Core/Src; the tree marks it; lines outside the USER CODE sections are faded; generating the code lists
// what goes first, keeps the sections and Ctrl+Z brings the edit back; "원본으로 되돌리기" removes the edit.
import test from 'node:test';
import assert from 'node:assert/strict';
import {launch} from './harness.mjs';

const IT='Core/Src/stm32f1xx_it.c';
const projectFiles=win=>win.evaluate(()=>[...document.querySelectorAll('#file-tree [data-source]')].map(b=>b.dataset.source));
const shownText=win=>win.evaluate(()=>document.querySelector('#group-code .monaco-editor .view-lines')?.textContent.replace(/ /g,' ')||'');
async function openTree(win){await win.click('[data-activity="explorer"]');if(!await win.locator('#build-files > summary').isVisible())await win.click('[data-activity="explorer"]');if(!await win.evaluate(()=>document.getElementById('build-files').open))await win.click('#build-files > summary');}

test('a generated build file is edited in place: only it is stored, marked, faded outside USER CODE, reverted',{timeout:150000},async()=>{
 const s=await launch();
 try{
  const {win}=s;await openTree(win);
  const row='#build-file-list [data-build-file$="stm32f1xx_it.c"]';
  await win.waitForSelector(row,{timeout:15000});await win.click(row);
  await win.waitForFunction(()=>/SysTick_Handler/.test(document.querySelector('#group-code .monaco-editor .view-lines')?.textContent||''));
  // No read-only notice and no copy button: the path line says what an edit does.
  assert.equal(await win.locator('#copy-to-project').count(),0);
  const note=await win.textContent('#source-path');assert.doesNotMatch(note,/읽기 전용/);assert.match(note,/고치면 이 파일만 프로젝트에 저장 · 다시 생성하면 USER CODE 구역 밖은 새로 써짐/);
  // Faded lines outside the sections (the generated parts).
  await win.waitForFunction(()=>document.querySelectorAll('#group-code .outside-user-code-text').length>0,null,{timeout:5000});
  // Type at the end of the file: outside every section.
  await win.evaluate(()=>document.getElementById('code').focus());await win.keyboard.press('Control+End');await win.keyboard.type('\n/* my change */');
  await win.waitForFunction(f=>[...document.querySelectorAll('#file-tree [data-source]')].some(b=>b.dataset.source===f),IT,{timeout:10000}).catch(async e=>{throw new Error(e.message+' / '+await win.textContent('#console-output'));});
  assert.deepEqual((await projectFiles(win)).sort(),[IT,'main.c'].sort(),'only the edited file is stored');
  await win.waitForFunction(()=>/my change/.test(document.getElementById('code').value));
  const text=await win.evaluate(()=>document.getElementById('code').value);
  assert.match(text,/USER CODE BEGIN SysTick_IRQn 0/);assert.match(text,/\/\* my change \*\/\s*$/);
  // The tree: the generated row gives way to the project file, marked as edited.
  assert.equal(await win.locator(row).count(),0);
  assert.equal(await win.locator(`#build-file-list [data-tree-source="${IT}"][data-tree-edited]`).count(),1);
  assert.match(await win.textContent('#console-output'),/Core\/Src\/stm32f1xx_it\.c을 고쳐 프로젝트에 저장했습니다/);
  // More typing goes on in the project file.
  await win.keyboard.type(' more');await win.waitForFunction(()=>/my change \*\/ more/.test(document.getElementById('code').value));
  // Generating the code: the dialog names the file and the lines outside the sections that go.
  await win.evaluate(()=>document.getElementById('pinout-open').click());await win.waitForSelector('#pinout-dialog[open]');
  await win.evaluate(()=>document.getElementById('hal-generate').click());await win.waitForSelector('#hal-replace-dialog[open]');
  assert.match(await win.textContent('#hal-replace-loss'),/Core\/Src\/stm32f1xx_it\.c — 1줄/);
  await win.click('#hal-replace-confirm');await win.waitForFunction(()=>!document.getElementById('pinout-dialog').open);
  // The edit was only outside the sections: the regenerated file equals the generated one, so it is not kept.
  await win.waitForFunction(f=>![...document.querySelectorAll('#file-tree [data-source]')].some(b=>b.dataset.source===f),IT,{timeout:10000});
  // Ctrl+Z brings it back.
  await win.evaluate(()=>document.getElementById('code').focus());await win.keyboard.press('Control+z');
  await win.waitForFunction(f=>[...document.querySelectorAll('#file-tree [data-source]')].some(b=>b.dataset.source===f),IT,{timeout:10000});
  // "원본으로 되돌리기" from the tree: the generated file is shown again, the edit is gone.
  await openTree(win);
  await win.click(`#build-file-list [data-tree-source="${IT}"]`,{button:'right'});await win.waitForSelector('#tab-menu:not([hidden]) [data-tree-action="revert"]');
  await win.click('#tab-menu [data-tree-action="revert"]');
  await win.waitForFunction(f=>![...document.querySelectorAll('#file-tree [data-source]')].some(b=>b.dataset.source===f),IT,{timeout:10000});
  await win.waitForSelector(row);await win.waitForFunction(()=>!document.getElementById('source-path').hidden);
  assert.doesNotMatch(await shownText(win),/my change/);
  assert.deepEqual(s.errors,[]);
 }finally{await s.close();}
});

test('the .ioc stays read only and says where to change it',{timeout:120000},async()=>{
 const s=await launch();
 try{
  const {win}=s;await openTree(win);
  await win.click('#build-file-list > button[data-build-file$=".ioc"]');
  await win.waitForFunction(()=>/Mcu\.UserName=/.test(document.querySelector('#group-code .monaco-editor .view-lines')?.textContent||''));
  assert.match(await win.textContent('#source-path'),/읽기 전용/);
  const before=await projectFiles(win);await win.evaluate(()=>document.getElementById('code').focus());await win.keyboard.type('zz');await win.waitForTimeout(300);
  assert.deepEqual(await projectFiles(win),before);
  assert.doesNotMatch(await shownText(win),/zz/);
  assert.deepEqual(s.errors,[]);
 }finally{await s.close();}
});
