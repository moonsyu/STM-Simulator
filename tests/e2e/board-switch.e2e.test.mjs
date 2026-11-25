// Feature 53: the board picker changes the board from any board to any other. With an FPB-RA6E1 project open the
// picker had stopped on "PA2: STM32F446RE에서 지원하지 않는 핀 기능입니다." (an uncaught error, the board stayed).
// It also shows that the app's Rust code (WebAssembly) loads in the page under its Content-Security-Policy.
import test from 'node:test';
import assert from 'node:assert/strict';
import {launch} from './harness.mjs';

test('the board picker goes from every board to every other, also after "보드 구성 초기화"; no page error',{timeout:150000},async()=>{
 const s=await launch();
 try{
  const {win}=s,errors=[];
  win.on('pageerror',e=>errors.push(e.message));
  const board=()=>win.evaluate(()=>document.getElementById('current-board-name').textContent);
  const pick=async(id,name)=>{
   await win.evaluate(()=>document.getElementById('board-open').click());await win.click(`#board-results [data-board-id="${id}"]`);
   // A changed project asks first; a fresh one changes at once.
   await win.waitForFunction(n=>document.getElementById('board-change-dialog').open||document.getElementById('current-board-name').textContent.includes(n),name);
   if(await win.evaluate(()=>document.getElementById('board-change-dialog').open))await win.click('#board-change-confirm');
   await win.waitForFunction(n=>document.getElementById('current-board-name').textContent.includes(n),name,{timeout:5000}).catch(async()=>{throw new Error(`the board stayed ${await board()} (wanted ${name}); page errors: ${errors.join(' | ')}`);});
  };
  const reset=async()=>{await win.evaluate(()=>document.getElementById('board-reset').click());await win.waitForSelector('#board-reset-dialog[open]');await win.click('#board-reset-confirm');
   await win.waitForFunction(()=>!document.getElementById('board-reset-dialog').open);};
  // The Rust code answers in the page (the family's pins, fixed whatever board is shown).
  assert.deepEqual(await win.evaluate(async()=>{const m=await import('./src/rust-core.js');return [m.familyGpioPins('STM32F446RE').length,m.familyGpioPins('STM32F103RB').length];}),[50,51]);
  const boards=[['fpb-ra6e1','FPB-RA6E1'],['nucleo-f446re','F446RE'],['fpb-ra6e1','FPB-RA6E1'],['nucleo-f103rb','F103RB'],['nucleo-f446re','F446RE'],['nucleo-f103rb','F103RB'],['fpb-ra6e1','FPB-RA6E1']];
  for(const [id,name] of boards)await pick(id,name);
  // As in the report: an RA project, "보드 구성 초기화", then an STM32 board.
  await reset();assert.match(await board(),/FPB-RA6E1/);
  await pick('nucleo-f446re','F446RE');
  assert.match(await win.evaluate(()=>document.getElementById('code').value),/HAL_Init\(\);/,'the STM32 project\'s main.c');
  await reset();await pick('fpb-ra6e1','FPB-RA6E1');
  assert.match(await win.evaluate(()=>document.getElementById('code').value),/void hal_entry\(void\)/,'the RA project\'s hal_entry.c');
  assert.deepEqual(errors,[]);
  assert.doesNotMatch(await win.evaluate(()=>document.getElementById('console-output').textContent),/화면 오류|지원하지 않는 핀 기능/);
 }finally{await s.close();}
});
