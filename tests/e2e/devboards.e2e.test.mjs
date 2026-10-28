import test from 'node:test';
import assert from 'node:assert/strict';
import {launch} from './harness.mjs';

const logText=win=>win.evaluate(()=>document.getElementById('console-output').textContent);
async function openBoardView(win){await win.click('[data-activity="board"]');if(!await win.locator('#view-board').isVisible())await win.click('[data-activity="board"]');}
async function applyLecture(win,code){
 await win.click('[data-activity="examples"]');if(!await win.locator('#view-examples').isVisible())await win.click('[data-activity="examples"]');
 await win.fill('#hal-example-search',code);await win.locator('#hal-example-list [data-example^="lecture:"]').first().click();
 await win.waitForFunction(c=>document.getElementById('console-output').textContent.includes(c),code);
}

test('ESP32 and Raspberry Pi boards are added, inspected, documented and removed',{timeout:120000},async()=>{
 const s=await launch();
 try{
  const {win}=s;await openBoardView(win);
  await win.click('[data-devboard-add="esp32-nodemcu-32s"]');await win.click('[data-devboard-add="rpi5"]');
  assert.equal(await win.evaluate(()=>document.querySelectorAll('#devboard-layer [data-devboard]').length),2);
  assert.equal(await win.evaluate(()=>document.querySelectorAll('[data-endpoint^="devboard:"]').length),78);
  assert.match(await win.textContent('#explorer-circuit-summary'),/다른 보드 2개/);
  // A pin's inspector lists its cautions; the board's Docs list the header.
  const pin=await win.evaluate(()=>document.querySelector('[data-endpoint$=":L5"]').dataset.endpoint);
  await win.locator(`[data-endpoint="${pin}"]`).click({force:true});
  assert.match(await win.textContent('#inspector'),/입력 전용/);
  await win.locator('#devboard-layer [data-devboard="rpi5"]').click({position:{x:60,y:120},force:true});
  assert.match(await win.textContent('#inspector'),/RPI-1/);
  await win.click('#open-board-code');await win.waitForFunction(()=>document.querySelector('.language-badge').textContent.includes('RPI-1'));
  assert.equal(await win.evaluate(()=>document.getElementById('code').readOnly),true);
  await win.click('[data-activity="docs"]');assert.match(await win.textContent('#device-docs-panel'),/GPIO17/);
  await win.locator('#devboard-layer [data-devboard="rpi5"]').click({position:{x:60,y:120},force:true});await win.click('#remove-part');
  assert.equal(await win.evaluate(()=>document.querySelectorAll('#devboard-layer [data-devboard]').length),1);
  assert.deepEqual(s.errors,[]);
 }finally{await s.close();}
});

test('a Raspberry Pi lecture example runs as a fixed run and shows its output in the serial monitor',{timeout:120000},async()=>{
 const s=await launch();
 try{
  const {win}=s;await applyLecture(win,'RPI-02');
  assert.equal(await win.evaluate(()=>document.querySelector('.language-badge').textContent),'RPI-1 · Raspberry Pi · 고정 실행');
  await win.keyboard.press('Control+F5');
  await win.waitForFunction(()=>/\[RPI-1\] LED OFF/.test(document.getElementById('console-output').textContent),null,{timeout:20000});
  assert.match(await logText(win),/다른 보드만 실행합니다/);
  await win.click('[data-monitor="bus"]');await win.selectOption('#serial-target','board:rpi');
  await win.waitForFunction(()=>/RPI-1 · Serial \(USB\)[\s\S]*LED ON/.test(document.getElementById('uart-output').textContent));
  await win.keyboard.press('Control+F2');await win.waitForFunction(()=>document.getElementById('shell').dataset.running==='false');
  assert.deepEqual(s.errors,[]);
 }finally{await s.close();}
});

test('FW-09: the STM32 sends I2C commands and the ESP32 fixed-run slave switches its LED',{timeout:120000},async()=>{
 const s=await launch();
 try{
  const {win}=s;await applyLecture(win,'FW-09');
  await win.keyboard.press('Control+F5');
  await win.waitForFunction(()=>/\[ESP32-1\] I2C 수신 0 → LED OFF/.test(document.getElementById('console-output').textContent),null,{timeout:30000});
  assert.match(await logText(win),/ESP32에 1 보냄 \(status=0\)/);
  await win.keyboard.press('Control+F2');
  assert.deepEqual(s.errors,[]);
 }finally{await s.close();}
});
