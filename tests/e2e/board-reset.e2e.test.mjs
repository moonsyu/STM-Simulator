// 보드 구성 초기화 clears the circuit and the pin settings and resets main.c with them (to the code of the default
// settings, as 코드 초기화 does); 실행 취소 brings the circuit, the pins and the code back together.
import test from 'node:test';
import assert from 'node:assert/strict';
import {launch,applyExample} from './harness.mjs';

test('보드 구성 초기화 resets main.c too, and 실행 취소 restores circuit, pins and code',{timeout:120000},async()=>{
 const s=await launch();
 try{
  const {win}=s,code=()=>win.evaluate(()=>document.getElementById('code').value),parts=()=>win.locator('#part-layer [data-part]').count();
  await applyExample(win,'5mm 단색 LED');
  const before=await code(),partCount=await parts();
  assert.match(before,/HAL_GPIO_(Toggle|Write)Pin/);assert.ok(partCount>0);
  // 편집 → 보드 구성 초기화, as a user opens it.
  await win.click('.menubar-item >> nth=1');await win.click('.menu:popover-open [data-command="edit.boardReset"]');
  await win.waitForSelector('#board-reset-dialog[open]');
  assert.match(await win.textContent('#board-reset-description'),/main\.c도/);
  await win.click('#board-reset-confirm');
  await win.waitForFunction(()=>!document.getElementById('board-reset-dialog').open);
  assert.equal(await parts(),0);
  const after=await code();
  assert.doesNotMatch(after,/HAL_GPIO_(Toggle|Write)Pin|MX_GPIO_Init/,'the example code is gone with its pins');
  assert.match(after,/int main\(void\)[\s\S]*HAL_Init\(\);[\s\S]*SystemClock_Config\(\);/,'main.c of the default settings');
  assert.match(await win.textContent('#console-output'),/보드 구성과 main\.c를 초기화했습니다/);
  await win.click('#undo');
  await win.waitForFunction(b=>document.getElementById('code').value===b,before);
  assert.equal(await parts(),partCount,'the circuit comes back with the code');
  assert.deepEqual(s.errors,[]);
 }finally{await s.close();}
});
