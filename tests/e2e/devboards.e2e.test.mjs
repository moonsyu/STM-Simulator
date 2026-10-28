import test from 'node:test';
import assert from 'node:assert/strict';
import {launch} from './harness.mjs';

const logText=win=>win.evaluate(()=>document.getElementById('console-output').textContent);
async function openBoardView(win){await win.click('[data-activity="board"]');if(!await win.locator('#view-board').isVisible())await win.click('[data-activity="board"]');}
async function openExamples(win){await win.click('[data-activity="examples"]');if(!await win.locator('#view-examples').isVisible())await win.click('[data-activity="examples"]');}
// Searches by lecture code (kept for search, not shown) and applies the first lecture example found.
async function applyLecture(win,code){
 await openExamples(win);await win.fill('#hal-example-search',code);const item=win.locator('#hal-example-list [data-example^="lecture:"]').first(),title=await item.locator('strong').textContent();await item.click();
 await win.waitForFunction(t=>document.getElementById('console-output').textContent.includes(t+' · 강의'),title);
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

test('examples are grouped by board; a shell assignment reads serial monitor input; PWM dims the LED',{timeout:150000},async()=>{
 const s=await launch();
 try{
  const {win}=s;await openExamples(win);
  const groups=()=>win.evaluate(()=>[...document.querySelectorAll('#hal-example-list .example-group')].map(g=>g.firstChild.textContent.trim()));
  assert.deepEqual(await groups(),['Raspberry Pi','STM32','ESP32']);
  // FW-09 uses an STM32 and an ESP32: listed in both groups.
  assert.equal(await win.locator('#hal-example-list [data-example="lecture:lecture-fw-09"]').count(),2);
  assert.ok(!/RPI-0|KER-0|라즈베리파이5/.test(await win.textContent('#hal-example-list')));
  await win.click('[data-example-board="esp32"]');assert.deepEqual(await groups(),['ESP32']);assert.equal(await win.locator('#hal-example-list [data-example]').count(),3);
  await win.click('[data-example-board="rpi"]');assert.deepEqual(await groups(),['Raspberry Pi']);assert.equal(await win.locator('#hal-example-list [data-example]').count(),15);
  await win.click('[data-example-board="all"]');
  // LED 제어 쉘: the serial monitor sends lines to the Raspberry Pi program.
  await applyLecture(win,'LED 제어 쉘');await win.keyboard.press('Control+F5');
  await win.waitForFunction(()=>/\[RPI-1\] LED 번호/.test(document.getElementById('console-output').textContent),null,{timeout:20000});
  await win.click('[data-monitor="bus"]');await win.selectOption('#serial-target','board:rpi');
  await win.waitForFunction(()=>!document.getElementById('serial-send').disabled);
  await win.fill('#serial-input','2');await win.click('#serial-send');
  await win.waitForFunction(()=>/\[RPI-1\] 2번 LED ON/.test(document.getElementById('console-output').textContent),null,{timeout:10000});
  await win.waitForFunction(()=>Number(document.querySelector('#part-layer [data-part="LED2"] .led-glow')?.getAttribute('opacity'))>0,null,{timeout:10000});
  assert.equal(Number(await win.evaluate(()=>document.querySelector('#part-layer [data-part="LED1"] .led-glow').getAttribute('opacity'))),0);
  await win.keyboard.press('Control+F2');await win.waitForFunction(()=>document.getElementById('shell').dataset.running==='false');
  // PWM LED: the glow follows the brightness steps instead of only on / off.
  await applyLecture(win,'RPI-03');await win.keyboard.press('Control+F5');const seen=new Set();
  for(let i=0;i<40&&seen.size<4;i++){const v=await win.evaluate(()=>document.querySelector('#part-layer [data-part="LED1"] .led-glow')?.getAttribute('opacity'));if(Number(v)>0)seen.add(v);await win.waitForTimeout(100);}
  assert.ok(seen.size>=3,[...seen].join(','));
  await win.keyboard.press('Control+F2');
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

test('an ESP32 sketch is edited and run: the board follows the changed code',{timeout:120000},async()=>{
 const s=await launch();
 try{
  const {win}=s;await applyLecture(win,'FW-08');
  assert.equal(await win.evaluate(()=>document.getElementById('code').readOnly),false);
  await win.evaluate(()=>{const code=document.getElementById('code');code.value=code.value.replace('Serial.println("LED ON");','Serial.println("켜짐");');code.dispatchEvent(new Event('input',{bubbles:true}));});
  await win.keyboard.press('Control+F5');
  await win.waitForFunction(()=>/\[ESP32-1\] 켜짐/.test(document.getElementById('console-output').textContent),null,{timeout:20000});
  assert.match(await logText(win),/\[ESP32-1\] 스케치를 실행합니다/);
  await win.keyboard.press('Control+F2');
  assert.deepEqual(s.errors,[]);
 }finally{await s.close();}
});

test('the ESP32 run target builds the board sketch with Arduino CLI; debugging is not offered',{timeout:120000},async()=>{
 const s=await launch();
 try{
  const {win}=s;await applyLecture(win,'FW-08');
  await win.click('#status-target');await win.selectOption('#native-target','esp32');
  assert.match(await win.textContent('.language-badge'),/ESP32-1 · Arduino CLI/);
  assert.equal(await win.locator('#native-config').isVisible(),false);
  assert.match(await win.textContent('#build-status'),/Arduino CLI → ESP32/);
  await win.keyboard.press('F10');
  await win.waitForFunction(()=>/ESP32 보드는 디버그를 지원하지 않습니다/.test(document.getElementById('console-output').textContent));
  // The target is saved with the project like the other run targets.
  await win.waitForFunction(()=>{try{return JSON.parse(localStorage.getItem('stm32lab.project.v2')).ide.native.target==='esp32';}catch{return false;}},null,{timeout:10000});
  assert.deepEqual(s.errors,[]);
 }finally{await s.close();}
});
