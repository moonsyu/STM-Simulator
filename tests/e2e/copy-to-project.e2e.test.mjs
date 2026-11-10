// Feature 11: a read-only file the build adds (stm32f1xx_it.c on the start board) has "프로젝트로 복사해 수정"; the copy
// becomes a project source in Core/Src that can be edited, and the build file list no longer offers the generated one.
import test from 'node:test';
import assert from 'node:assert/strict';
import {launch} from './harness.mjs';

test('a generated build file is copied into the project and becomes editable',{timeout:120000},async()=>{
 const s=await launch();
 try{
  const {win}=s,tree=()=>win.evaluate(()=>[...document.querySelectorAll('#file-tree [data-source]')].map(b=>b.dataset.source));
  const row='#build-file-list [data-build-file$="stm32f1xx_it.c"]';
  await win.waitForSelector(row,{state:'attached',timeout:15000});
  await win.evaluate(sel=>document.querySelector(sel).click(),row);
  await win.waitForSelector('#copy-to-project',{timeout:10000});
  assert.match(await win.textContent('#source-path'),/읽기 전용/);
  await win.click('#copy-to-project');
  await win.waitForFunction(()=>[...document.querySelectorAll('#file-tree [data-source]')].some(b=>b.dataset.source==='Core/Src/stm32f1xx_it.c'),null,{timeout:10000}).catch(async e=>{throw new Error(e.message+' / '+await win.textContent('#console-output')+' / '+JSON.stringify(s.errors));});
  assert.deepEqual((await tree()).sort(),['Core/Src/stm32f1xx_it.c','main.c']);
  assert.equal(await win.locator(row).count(),0,'the generated file is no longer listed: the project copy is built');
  assert.equal(await win.locator('#copy-to-project').count(),0);
  const text=await win.evaluate(()=>document.getElementById('code').value);
  assert.match(text,/프로젝트로 복사한 파일입니다/);assert.match(text,/void SysTick_Handler\(void\) \{ HAL_IncTick\(\); \}/);
  // The copy is an ordinary source: typed text is kept.
  await win.evaluate(()=>{const c=document.getElementById('code');c.value=c.value+'\n/* my change */\n';c.dispatchEvent(new Event('input',{bubbles:true}));});
  await win.evaluate(()=>document.querySelector('#file-tree [data-source="main.c"]').click());
  await win.evaluate(()=>document.querySelector('#file-tree [data-source="Core/Src/stm32f1xx_it.c"]').click());
  await win.waitForFunction(()=>/my change/.test(document.getElementById('code').value));
  assert.match(await win.textContent('#console-output'),/Core\/Src\/stm32f1xx_it\.c을 프로젝트로 복사했습니다/);
  assert.deepEqual(s.errors,[]);
 }finally{await s.close();}
});
