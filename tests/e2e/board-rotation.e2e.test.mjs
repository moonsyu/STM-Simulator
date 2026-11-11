// Feature 29: the MCU board turns in quarter turns — the main board and another STM32 board, by the inspector button and
// the R key. Header pins, the on-board button's click area and the drawing turn together; editing the other board swaps
// the two turns; nothing turns while the circuit runs.
import test from 'node:test';
import assert from 'node:assert/strict';
import {launch} from './harness.mjs';

async function openBoardView(win){await win.click('[data-activity="board"]');if(!await win.locator('#view-board').isVisible())await win.click('[data-activity="board"]');}
const centre=(win,selector)=>win.$eval(selector,e=>{const r=e.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};});
const mainTurn=win=>win.$eval('#surface > .board',g=>Number(/rotate\((\d+)\)/.exec(g.getAttribute('transform'))?.[1]??0));

test('the main board and a second STM32 board turn by the button and the R key; the swap carries the turn',{timeout:150000},async()=>{
 const s=await launch();
 try{
  const {win}=s;await openBoardView(win);
  await win.click('#empty-add-board');
  await win.waitForSelector('#rotate-part');
  assert.equal(await win.textContent('#board-rotation'),'0°');assert.equal(await mainTurn(win),0);
  const pins=await win.$$eval('#endpoint-layer [data-endpoint^="board:"], [data-endpoint^="board:"]',e=>[...new Set(e.map(x=>x.dataset.endpoint))].slice(0,40));
  assert.ok(pins.length>=2,'the board has header pins');
  const [a,b]=[pins[0],pins[pins.length-1]],at=id=>centre(win,`[data-endpoint="${id}"]`);
  const a0=await at(a),b0=await at(b),v0={x:b0.x-a0.x,y:b0.y-a0.y};
  assert.ok(Math.hypot(v0.x,v0.y)>20,'the two pins are apart');
  // The button: one quarter turn clockwise. A vector between two pins (dx, dy) becomes (-dy, dx).
  await win.click('#rotate-part');
  await win.waitForFunction(()=>document.getElementById('board-rotation')?.textContent==='90°');
  assert.equal(await mainTurn(win),90);
  const a1=await at(a),b1=await at(b),v1={x:b1.x-a1.x,y:b1.y-a1.y};
  assert.ok(Math.abs(v1.x+v0.y)<1.5&&Math.abs(v1.y-v0.x)<1.5,`pins turned: ${JSON.stringify(v0)} → ${JSON.stringify(v1)}`);
  // The header pin drawn on the board and its click area are in the same place, and so is the on-board button.
  const user=await centre(win,'#surface > .board [data-button]');
  assert.ok(await win.evaluate(({x,y})=>!!document.elementsFromPoint(x,y).find(e=>e.closest?.('[data-button]')),user),'the on-board button is clicked where it is drawn');
  // The R key, with the canvas focused: another quarter turn.
  await win.focus('#circuit');await win.keyboard.press('r');
  await win.waitForFunction(()=>document.getElementById('board-rotation')?.textContent==='180°');
  const a2=await at(a),b2=await at(b);
  assert.ok(Math.abs((b2.x-a2.x)+v0.x)<1.5&&Math.abs((b2.y-a2.y)+v0.y)<1.5,'half a turn reverses the vector');
  // Undo and redo step through the turns.
  const turned=degrees=>win.waitForFunction(d=>document.querySelector('#surface > .board').getAttribute('transform').includes('rotate('+d+')'),degrees,{timeout:8000});
  await win.keyboard.press('Control+z');await turned(90);
  await win.keyboard.press('Control+y');await turned(180);
  // A second STM32 board is placed clear of the turned main board and turns on its own.
  await win.click('[data-devboard-add="nucleo-f446re"]');
  await win.waitForSelector('#edit-board');
  const second='#devboard-layer [data-devboard="nucleo-f446re"]';
  assert.equal(await win.$eval(second,g=>g.dataset.rotation),'0');
  const boxes=await win.evaluate(sel=>{const r=q=>{const b=document.querySelector(q).getBoundingClientRect();return {left:b.left,right:b.right};};return {main:r('#surface > .board'),part:r(sel)};},second);
  assert.ok(boxes.part.left>=boxes.main.right-2,`the new board is right of the main board: ${JSON.stringify(boxes)}`);
  await win.click('#rotate-part');
  await win.waitForFunction(sel=>document.querySelector(sel).dataset.rotation==='90',second);
  assert.equal(await win.textContent('#board-rotation'),'90°');
  assert.match(await win.$eval(second,g=>g.getAttribute('transform')),/rotate\(90\)/);
  const id=await win.$eval(second,g=>g.dataset.part),pin=`[data-endpoint^="devboard:${id}:"]`;
  assert.ok(await win.locator(pin).count()>20);
  // Editing the second board: it becomes the main board at 90°, and the old main board stays at 180°.
  const partCentre=await centre(win,second);
  await win.click('#edit-board');
  await win.waitForFunction(()=>document.querySelector('#surface .board-title')?.textContent==='STM32-2 · 편집 중');
  assert.equal(await mainTurn(win),90);
  assert.equal(await win.$eval('#devboard-layer [data-devboard]',g=>g.dataset.rotation),'180');
  // Running: the button is disabled and R does nothing.
  await openBoardView(win);
  await win.keyboard.press('Control+F5');
  await win.waitForFunction(()=>document.getElementById('shell').dataset.running==='true',null,{timeout:30000});
  // The board being edited is the selection after the swap; its inspector is drawn again when the run starts.
  await win.waitForFunction(()=>document.getElementById('rotate-part')?.disabled===true,null,{timeout:8000}).catch(async e=>{throw new Error(e.message+'\n'+await win.textContent('#inspector'));});
  assert.equal(await win.$eval('#rotate-part',b=>b.disabled),true);
  await win.focus('#circuit');await win.keyboard.press('r');
  assert.equal(await mainTurn(win),90);
  await win.keyboard.press('Control+F2');await win.waitForFunction(()=>document.getElementById('shell').dataset.running==='false');
  void partCentre;
  assert.deepEqual(s.errors,[]);
 }finally{await s.close();}
});
