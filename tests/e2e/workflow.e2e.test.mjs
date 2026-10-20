import test from 'node:test';
import assert from 'node:assert/strict';
import {launch,applyExample} from './harness.mjs';

test('example → run → measure → stop in the circuit simulator',{timeout:120000},async()=>{
 const s=await launch();
 try{
  const {win}=s;
  await applyExample(win,'5mm 단색 LED');
  assert.match(await win.evaluate(()=>document.getElementById('code').value),/HAL_GPIO/);
  await win.keyboard.press('F5');
  await win.waitForFunction(()=>document.getElementById('shell').dataset.running==='true');
  await win.waitForFunction(()=>/PA5=1/.test(document.getElementById('console-output').textContent),null,{timeout:15000});
  await win.waitForFunction(()=>/PA5=0/.test(document.getElementById('console-output').textContent),null,{timeout:15000});
  assert.notEqual(await win.textContent('#sim-time'),'0.000 s');
  // Selecting a part while running shows live measurements in the properties bar.
  await win.locator('#part-layer [data-part]').first().click();
  await win.waitForFunction(()=>/V$/.test(document.getElementById('part-voltage')?.textContent||''));
  await win.keyboard.press('F5');
  await win.waitForFunction(()=>document.getElementById('shell').dataset.running==='false');
  assert.match(await win.textContent('#run-status'),/준비됨/);
  assert.deepEqual(s.errors,[]);
 }finally{await s.close();}
});

test('parts view adds a resistor between two breadboard holes and undo removes it',{timeout:120000},async()=>{
 const s=await launch();
 try{
  const {win}=s;
  await win.click('#empty-add-board');
  await win.click('[data-activity="parts"]');if(!await win.locator('#view-parts').isVisible())await win.click('[data-activity="parts"]');
  await win.fill('#part-search','빵판');
  await win.locator('#part-list [data-add="breadboard"]').click();
  await win.waitForFunction(()=>document.querySelectorAll('#breadboard-layer [data-part]').length>0||document.querySelectorAll('[data-hole]').length>100);
  const count=()=>win.evaluate(()=>document.querySelectorAll('#part-layer [data-part]').length);
  const before=await count();
  await win.fill('#part-search','저항');
  await win.locator('#part-list [data-add="resistor"]').click();
  const holes=win.locator('[data-hole]');
  const n=await holes.count();assert.ok(n>100,'holes rendered');
  await holes.nth(Math.floor(n/2)).click({force:true});
  await holes.nth(Math.floor(n/2)+3).click({force:true});
  await win.waitForFunction(b=>document.querySelectorAll('#part-layer [data-part]').length>b,before);
  assert.match(await win.textContent('#inspector'),/RESISTOR|저항/);
  await win.click('#undo');
  await win.waitForFunction(b=>document.querySelectorAll('#part-layer [data-part]').length===b,before);
  assert.deepEqual(s.errors,[]);
 }finally{await s.close();}
});

test('debug view pauses at a breakpoint and shows variables',{timeout:120000},async()=>{
 const s=await launch();
 try{
  const {win}=s;
  await applyExample(win,'5mm 단색 LED');
  const line=await win.evaluate(()=>document.getElementById('code').value.split('\n').findIndex(l=>/HAL_GPIO_TogglePin|HAL_GPIO_WritePin/.test(l))+1);
  assert.ok(line>0);
  await win.evaluate(l=>document.dispatchEvent(new CustomEvent('ide-open-source',{detail:{file:'main.c',line:l}})),line);
  await win.keyboard.press('F9');
  await win.click('[data-activity="debug"]');if(!await win.locator('#view-debug').isVisible())await win.click('[data-activity="debug"]');
  await win.click('.debug-toolbar [data-debug="start"]');
  await win.waitForFunction(()=>/일시정지/.test(document.getElementById('debug-location').textContent),null,{timeout:15000});
  await win.click('.debug-toolbar [data-debug="continue"]');
  await win.waitForFunction(l=>new RegExp('main\\.c:'+l).test(document.getElementById('debug-location').textContent),line,{timeout:15000});
  assert.ok(await win.locator('#debug-stack .debug-frame').count()>=1);
  await win.click('.debug-toolbar [data-debug="stop"]');
  await win.waitForFunction(()=>document.getElementById('shell').dataset.running==='false');
  assert.deepEqual(s.errors,[]);
 }finally{await s.close();}
});
