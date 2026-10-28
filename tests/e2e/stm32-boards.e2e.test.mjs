import test from 'node:test';
import assert from 'node:assert/strict';
import {launch} from './harness.mjs';

const logText=win=>win.evaluate(()=>document.getElementById('console-output').textContent);
async function openBoardView(win){await win.click('[data-activity="board"]');if(!await win.locator('#view-board').isVisible())await win.click('[data-activity="board"]');}

test('a second STM32 board is added, edited by swapping with the main board, and runs with it',{timeout:150000},async()=>{
 const s=await launch();
 try{
  const {win}=s;await openBoardView(win);
  // The start circuit has no board yet: put the NUCLEO-F103RB on the canvas, then add a NUCLEO-F446RE.
  await win.click('#empty-add-board');
  await win.click('[data-devboard-add="nucleo-f446re"]');
  assert.equal(await win.evaluate(()=>document.querySelectorAll('#devboard-layer [data-devboard="nucleo-f446re"] [data-button$=".USER"]').length),1);
  assert.equal(await win.textContent('#surface .board-title'),'STM32-1 · 편집 중');
  assert.match(await win.textContent('#inspector'),/STM32-2[\s\S]*이 보드 편집/);
  assert.match(await win.textContent('#explorer-circuit-summary'),/STM32 2개 \(편집: STM32-1\)/);
  const id=await win.evaluate(()=>document.querySelector('#devboard-layer [data-devboard="nucleo-f446re"]').dataset.part);
  assert.ok(await win.evaluate(i=>[...document.getElementById('source-file').options].some(o=>o.value==='stm32:'+i),id));
  // Editing STM32-2 makes it the main board: its F446RE main.c, its name on the board being edited.
  await win.click('#edit-board');
  await win.waitForFunction(()=>document.querySelector('#surface .board-title')?.textContent==='STM32-2 · 편집 중');
  assert.match(await win.evaluate(()=>document.getElementById('code').value),/STM32F446RE project/);
  assert.equal(await win.evaluate(()=>document.querySelector('.language-badge').textContent),'STM32-2 · STM32 HAL');
  assert.equal(await win.evaluate(()=>document.querySelector('#devboard-layer .devboard-name').textContent),'STM32-1');
  await win.evaluate(()=>{const code=document.getElementById('code');code.value=code.value.replace('printf("HAL ready\\n");','printf("board two\\n");');code.dispatchEvent(new Event('input',{bubbles:true}));});
  // Both boards run: the edited one as the main session, STM32-1 as its own session on the same circuit.
  await win.keyboard.press('Control+F5');
  await win.waitForFunction(()=>/\[STM32-1\] HAL ready/.test(document.getElementById('console-output').textContent),null,{timeout:30000});
  const text=await logText(win);assert.match(text,/board two/);assert.match(text,/\[STM32-1\] HAL 프로그램을 시작했습니다/);
  // STM32-1's RESET restarts only that board.
  await win.locator('#devboard-layer [data-button$=".RESET"]').click({force:true});
  await win.waitForFunction(()=>/\[STM32-1\] RESET/.test(document.getElementById('console-output').textContent));
  assert.equal(await win.evaluate(()=>document.getElementById('shell').dataset.running),'true');
  await win.keyboard.press('Control+F2');await win.waitForFunction(()=>document.getElementById('shell').dataset.running==='false');
  // Switching back restores STM32-1's code; Undo returns to editing STM32-2.
  await win.selectOption('#source-file','stm32:'+id);
  await win.waitForFunction(()=>document.querySelector('#surface .board-title')?.textContent==='STM32-1 · 편집 중');
  assert.match(await win.evaluate(()=>document.getElementById('code').value),/STM32F103RB project/);
  await win.keyboard.press('Control+Z');
  await win.waitForFunction(()=>document.querySelector('#surface .board-title')?.textContent==='STM32-2 · 편집 중');
  assert.deepEqual(s.errors,[]);
 }finally{await s.close();}
});
