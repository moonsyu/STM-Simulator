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

test('a part is selected only on what is drawn: the LED glow and pin labels neither grab clicks nor widen the frame',{timeout:120000},async()=>{
 const s=await launch();
 try{
  const {win}=s;
  await applyExample(win,'5mm 단색 LED');
  const lens=win.locator('#part-layer [data-part="led1"] .led-lens');let b=await lens.boundingBox();
  await win.mouse.move(b.x+b.width/2,b.y+b.height/2);for(let i=0;i<12;i++){await win.mouse.wheel(0,-120);await win.waitForTimeout(30);}
  b=await lens.boundingBox();const cx=b.x+b.width/2,cy=b.y+b.height/2,r=b.width/2;
  // Inside the (dark) glow ring but outside the lens: the hole below gets the click, not the LED.
  const under=await win.evaluate(([x,y])=>{const el=document.elementFromPoint(x,y);return {part:!!el?.closest('#part-layer [data-part="led1"]'),hole:!!el?.closest('[data-hole],[data-endpoint]')};},[cx-r*1.6,cy]);
  assert.equal(under.part,false,'the invisible glow does not catch clicks');
  await win.mouse.click(cx,cy);
  await win.waitForFunction(()=>document.querySelectorAll('[data-resize-handle]').length>0);
  const frame=await win.evaluate(()=>{const h=[...document.querySelectorAll('[data-resize-handle]')].map(e=>e.getBoundingClientRect());return {l:Math.min(...h.map(r=>r.left+r.width/2)),r:Math.max(...h.map(r=>r.right-r.width/2))};});
  // Lens plus a small margin for the leads; the A/K labels beside the pins stay outside the frame.
  assert.ok(frame.l>cx-r*1.6&&frame.r<cx+r*1.6,`frame ${Math.round(frame.l-cx)}..${Math.round(frame.r-cx)} around a lens of radius ${Math.round(r)}`);
  assert.deepEqual(s.errors,[]);
 }finally{await s.close();}
});

test('a part lead never shares a hole with a jumper wire end',{timeout:120000},async()=>{
 const s=await launch();
 try{
  const {win}=s;
  await applyExample(win,'5mm 단색 LED');
  // A breadboard hole that holds a wire end.
  const hole=await win.evaluate(()=>{for(const g of document.querySelectorAll('#wire-layer [data-wire-end]')){const c=g.querySelector('circle').getBoundingClientRect();const x=c.x+c.width/2,y=c.y+c.height/2;const under=document.elementsFromPoint(x,y).find(el=>el.closest('[data-hole]'));if(under)return {x,y,id:under.closest('[data-hole]').dataset.hole};}return null;});
  assert.ok(hole,'the example has a wire in a breadboard hole');
  await win.click('[data-activity="parts"]');if(!await win.locator('#view-parts').isVisible())await win.click('[data-activity="parts"]');
  await win.fill('#part-search','저항');await win.locator('#part-list [data-add="resistor"]').click();
  const parts=await win.evaluate(()=>document.querySelectorAll('#part-layer [data-part]').length);
  await win.mouse.click(hole.x,hole.y);
  await win.waitForFunction(()=>/점퍼선이 꽂힌 구멍/.test(document.getElementById('console-output').textContent));
  assert.equal(await win.evaluate(()=>document.querySelectorAll('#part-layer [data-part]').length),parts,'no resistor was placed');
  await win.keyboard.press('Escape');
  // Dragging the LED onto that hole: when released, no lead sits in the wired hole.
  const led=win.locator('#part-layer [data-part="led1"] .part-body');const b=await led.boundingBox();
  await win.mouse.move(b.x+b.width/2,b.y+b.height/2);await win.mouse.down();await win.mouse.move(hole.x,hole.y,{steps:8});await win.mouse.up();
  await win.waitForTimeout(300);
  const leadHoles=await win.evaluate(()=>[...document.querySelectorAll('#part-layer [data-part="led1"] .part-contact')].map(c=>{const r=c.getBoundingClientRect();const el=document.elementsFromPoint(r.x+r.width/2,r.y+r.height/2).find(e=>e.closest('[data-hole]'));return el?.closest('[data-hole]').dataset.hole||null;}));
  assert.ok(!leadHoles.includes(hole.id),`LED leads ${leadHoles} must not use ${hole.id}`);
  assert.deepEqual(s.errors,[]);
 }finally{await s.close();}
});

test('DMA UART echo: the example opens the serial monitor and text sent there comes back over USART2',{timeout:120000},async()=>{
 const s=await launch();
 try{
  const {win}=s;
  await win.evaluate(()=>{const e=document.getElementById('hal-example');e.value='dma_uart_echo';e.dispatchEvent(new Event('change'));});
  await win.waitForFunction(()=>/직렬 모니터 탭/.test(document.getElementById('console-output').textContent));
  assert.ok(await win.locator('#serial-input').isVisible(),'the serial monitor is shown');
  await win.keyboard.press('Control+F5');
  await win.waitForFunction(()=>/DMA UART echo ready/.test(document.getElementById('console-output').textContent),null,{timeout:15000});
  await win.fill('#serial-input','hello');await win.click('#serial-send');
  await win.waitForFunction(()=>/RX event: 6 bytes/.test(document.getElementById('console-output').textContent),null,{timeout:15000});
  await win.waitForFunction(()=>/hello/.test(document.getElementById('bus-panel')?.innerText||document.body.innerText),null,{timeout:15000});
  await win.keyboard.press('Control+F2');
  assert.deepEqual(s.errors,[]);
 }finally{await s.close();}
});
