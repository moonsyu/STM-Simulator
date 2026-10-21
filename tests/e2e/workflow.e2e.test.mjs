import test from 'node:test';
import assert from 'node:assert/strict';
import {launch,applyExample} from './harness.mjs';

test('example → run → measure → stop in the circuit simulator',{timeout:120000},async()=>{
 const s=await launch();
 try{
  const {win}=s;
  await applyExample(win,'5mm 단색 LED');
  assert.match(await win.evaluate(()=>document.getElementById('code').value),/HAL_GPIO/);
  await win.keyboard.press('Control+F5');
  await win.waitForFunction(()=>document.getElementById('shell').dataset.running==='true');
  await win.waitForFunction(()=>/PA5=1/.test(document.getElementById('console-output').textContent),null,{timeout:15000});
  await win.waitForFunction(()=>/PA5=0/.test(document.getElementById('console-output').textContent),null,{timeout:15000});
  assert.notEqual(await win.textContent('#sim-time'),'0.000 s');
  // Selecting a part while running shows live measurements in the properties bar.
  await win.locator('#part-layer [data-part]').first().click();
  await win.waitForFunction(()=>/V$/.test(document.getElementById('part-voltage')?.textContent||''));
  await win.keyboard.press('Control+F2');
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
  // Default shortcuts: F10 start debugging (and continue while paused), F11 step over, Ctrl+F2 stop.
  await win.keyboard.press('F10');
  await win.waitForFunction(()=>/일시정지/.test(document.getElementById('debug-location').textContent),null,{timeout:15000});
  await win.keyboard.press('F10');
  await win.waitForFunction(l=>new RegExp('main\\.c:'+l).test(document.getElementById('debug-location').textContent),line,{timeout:15000});
  assert.ok(await win.locator('#debug-stack .debug-frame').count()>=1);
  await win.keyboard.press('F11');
  await win.waitForFunction(l=>/일시정지/.test(document.getElementById('debug-location').textContent)&&!new RegExp('main\\.c:'+l+'\\b').test(document.getElementById('debug-location').textContent),line,{timeout:15000});
  // Holding F11 keeps stepping (key auto-repeat).
  await win.evaluate(()=>{window.__stops=0;new MutationObserver(()=>{if(/일시정지/.test(document.getElementById('debug-location').textContent))window.__stops++;}).observe(document.getElementById('debug-location'),{childList:true,characterData:true,subtree:true});});
  await win.keyboard.down('F11');
  for(let i=0;i<10;i++){await win.waitForTimeout(80);await win.keyboard.down('F11');}
  await win.keyboard.up('F11');
  await win.waitForFunction(()=>window.__stops>=3,null,{timeout:10000});
  await win.keyboard.press('Control+F2');
  await win.waitForFunction(()=>document.getElementById('shell').dataset.running==='false');
  assert.deepEqual(s.errors,[]);
 }finally{await s.close();}
});

async function pickExample(win,id){await win.evaluate(id=>{const s=document.getElementById('hal-example');if(![...s.options].some(o=>o.value===id))s.add(new Option(id,id));s.value=id;s.dispatchEvent(new Event('change'));},id);await win.waitForFunction(()=>document.querySelectorAll('#part-layer [data-part]').length>0);}
async function selectPartWith(win,selector){
 const ids=await win.evaluate(()=>[...new Set([...document.querySelectorAll('#part-layer [data-part]')].map(e=>e.dataset.part))]);
 for(const id of ids){await win.locator(`#part-layer [data-part="${id}"]`).first().click({force:true});if(await win.locator(selector).count())return id;}
 return null;
}
test('camera frames appear in the properties panel and SD card files persist after a run',{timeout:150000},async()=>{
 const s=await launch();
 try{
  const {win}=s;
  await pickExample(win,'camera_tft');
  await win.keyboard.press('Control+F5');
  await win.waitForFunction(()=>/frame \d+ shown on TFT/.test(document.getElementById('console-output').textContent),null,{timeout:30000});
  assert.ok(await selectPartWith(win,'#camera-preview'),'camera part selectable');
  await win.waitForFunction(()=>/\d+×\d+/.test(document.getElementById('camera-info').textContent),null,{timeout:15000});
  await win.keyboard.press('Control+F2');
  await pickExample(win,'sd_logger');
  await win.keyboard.press('Control+F5');
  await win.waitForFunction(()=>/LOG\.TXT size=\d+/.test(document.getElementById('console-output').textContent),null,{timeout:30000});
  await win.keyboard.press('Control+F2');
  await win.waitForFunction(()=>/SD 카드에 기록된 파일을 프로젝트에 저장했습니다/.test(document.getElementById('console-output').textContent));
  assert.ok(await selectPartWith(win,'#sd-files'),'SD part selectable');
  assert.match(await win.textContent('#sd-files'),/LOG\.TXT/);
  assert.deepEqual(s.errors,[]);
 }finally{await s.close();}
});

test('parts view adds the 830-point full breadboard next to the 400-point one',{timeout:60000},async()=>{
 const s=await launch();
 try{
  const {win}=s;
  await win.click('[data-activity="parts"]');if(!await win.locator('#view-parts').isVisible())await win.click('[data-activity="parts"]');
  await win.evaluate(()=>document.querySelector('[data-add="breadboard_full"]').click());
  await win.waitForFunction(()=>/830홀/.test(document.getElementById('inspect-panel')?.textContent||''));
  assert.deepEqual(s.errors,[]);
 }finally{await s.close();}
});

test('Gravity RGB (WS2812) example lights the LED with the received colour and shows G/R/B in properties',{timeout:120000},async()=>{
 const s=await launch();
 try{
  const {win}=s;
  await pickExample(win,'ref_rgb_gravity_3');
  await win.keyboard.press('Control+F5');
  await win.waitForFunction(()=>/WS2812 G=0 R=64 B=0/.test(document.getElementById('console-output').textContent),null,{timeout:15000});
  await win.locator('#part-layer [data-part="demo"]').first().click({force:true});
  await win.waitForFunction(()=>/G\s*\d+[\s\S]*R\s*\d+[\s\S]*B\s*\d+/.test(document.getElementById('part-live')?.textContent||''),null,{timeout:15000});
  // The lens follows the received colour: red frame first, then green.
  const lens=()=>win.evaluate(()=>document.querySelector('#part-layer [data-part="demo"] .catalog-light')?.getAttribute('fill'));
  await win.waitForFunction(()=>/^rgb\(0,\s*\d+,\s*0\)$/.test(document.querySelector('#part-layer [data-part="demo"] .catalog-light')?.getAttribute('fill')||''),null,{timeout:15000});
  assert.match(await lens(),/^rgb\(0,/);
  assert.match(await win.textContent('#part-live'),/전송 순서 G→R→B/);
  await win.keyboard.press('Control+F2');
  await win.waitForFunction(()=>document.getElementById('shell').dataset.running==='false');
  assert.deepEqual(s.errors,[]);
 }finally{await s.close();}
});

test('a hole takes one jumper wire; a wire end moves by dragging or by click-to-pick-up and click-to-place (undo restores it)',{timeout:120000},async()=>{
 const s=await launch();
 try{
  const {win}=s;
  await applyExample(win,'5mm 단색 LED');
  const center=async selector=>{const b=await win.locator(selector).first().boundingBox();return {x:b.x+b.width/2,y:b.y+b.height/2};};
  const end=await win.evaluate(()=>{const g=document.querySelector('#wire-layer [data-wire-end]');return {wire:g.dataset.ownerWire,end:g.dataset.wireEnd};});
  const endSel=`#wire-layer [data-owner-wire="${end.wire}"][data-wire-end="${end.end}"]`;
  const free='[data-endpoint="board:CN7:1"]';// PC10, unused by the example
  // (1) Start a wire on a free pin, then try to finish it on a pin that already has a wire end.
  let p=await center(free);await win.mouse.click(p.x,p.y);
  p=await center(endSel);await win.mouse.click(p.x,p.y);
  await win.waitForFunction(()=>/이미 배선이 연결된 칸/.test(document.getElementById('console-output').textContent));
  await win.keyboard.press('Escape');
  const wires=await win.evaluate(()=>document.querySelectorAll('#wire-layer [data-wire]').length);
  // (2) Drag the wire end onto the free pin.
  const from=await center(endSel),to=await center(free);
  await win.mouse.move(from.x,from.y);await win.mouse.down();
  await win.mouse.move((from.x+to.x)/2,(from.y+to.y)/2,{steps:5});await win.mouse.move(to.x,to.y,{steps:5});await win.mouse.up();
  await win.waitForFunction(()=>/배선 끝을 옮겼습니다/.test(document.getElementById('console-output').textContent));
  const moved=await center(endSel);
  assert.ok(Math.hypot(moved.x-to.x,moved.y-to.y)<4,'the end now sits on PC10');
  assert.equal(await win.evaluate(()=>document.querySelectorAll('#wire-layer [data-wire]').length),wires,'the wire was moved, not duplicated');
  await win.click('#undo');
  await win.waitForFunction(([sel,x,y])=>{const b=document.querySelector(sel).getBoundingClientRect();return Math.hypot(b.x+b.width/2-x,b.y+b.height/2-y)<4;},[endSel,from.x,from.y]);
  // (3) Toggle move: click the end to pick it up, Esc puts it back (the wire is kept), click again and click PC10 to move it.
  await win.mouse.click(from.x,from.y);
  await win.waitForFunction(()=>/배선 끝을 옮길 핀/.test(document.getElementById('hint').textContent));
  await win.keyboard.press('Escape');
  assert.equal(await win.evaluate(()=>document.querySelectorAll('#wire-layer [data-wire]').length),wires,'Esc cancels the move without deleting the wire');
  await win.mouse.click(from.x,from.y);await win.mouse.move(to.x,to.y,{steps:4});
  assert.match(await win.evaluate(()=>document.getElementById('preview-layer').innerHTML),/stroke-dasharray/,'the picked-up end follows the pointer');
  await win.mouse.click(to.x,to.y);
  await win.waitForFunction(([sel,x,y])=>{const b=document.querySelector(sel).getBoundingClientRect();return Math.hypot(b.x+b.width/2-x,b.y+b.height/2-y)<4;},[endSel,to.x,to.y]);
  assert.doesNotMatch(await win.evaluate(()=>document.getElementById('hint').textContent),/배선 끝을 옮길 핀/);
  assert.deepEqual(s.errors,[]);
 }finally{await s.close();}
});
