// Feature 42: an FPB-RA6E1 (FSP) project runs on the built-in interpreter: picked as the simulator engine, or for the
// run when ARM GCC and Renesas FSP are not installed. The SCI9 UART example blinks LED1, says hello on the USB-TTL part
// and echoes what the serial monitor sends.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {launch} from './harness.mjs';

const consoleText=win=>win.textContent('#console-output');
const LED_ON='#64e66b',LED_OFF='#89a486';
const led=(win,id,fill,timeout=15000)=>win.waitForFunction(([id,fill])=>document.getElementById('board-led-'+id)?.getAttribute('fill')===fill,[id,fill],{timeout});
async function newRaProject(win,template){
 await win.evaluate(()=>document.getElementById('new').click());
 if(await win.evaluate(()=>document.getElementById('replace-dialog').open))await win.click('#replace-confirm');
 await win.waitForSelector('#project-dialog[open]');await win.selectOption('#new-project-board','fpb-ra6e1');await win.selectOption('#new-project-template',template);
 await win.click('#project-create');await win.waitForFunction(()=>!document.getElementById('project-dialog').open);
 await win.waitForFunction(()=>document.querySelector('#surface > .board')?.dataset.board==='fpb-ra6e1');
}

test('FPB-RA6E1 on the built-in interpreter: the engine select is offered; the SCI9 example blinks LED1, prints its hello line and echoes the serial monitor',{timeout:240000},async()=>{
 const s=await launch();
 try{
  const {win}=s;
  await newRaProject(win,'ra_uart_echo');
  assert.match(await win.evaluate(()=>document.getElementById('code').value),/R_SCI_UART_Open\(&g_uart9_ctrl, &g_uart9_cfg\)/);
  // An FSP project chooses its engine like an STM32 one (the harness picked the interpreter).
  assert.deepEqual(await win.evaluate(()=>[document.getElementById('sim-engine').hidden,document.getElementById('sim-engine').value]),[false,'interpreter']);
  await win.keyboard.press('Control+F5');
  await win.waitForFunction(()=>/FSP 프로그램\(hal_entry\.c\)을 내장 해석기로 시작했습니다/.test(document.getElementById('console-output').textContent),null,{timeout:30000})
   .catch(async error=>{throw new Error(`${error.message}\n출력: ${(await consoleText(win)).slice(-1500)}`);});
  assert.doesNotMatch(await consoleText(win),/ARM GCC로 펌웨어를 빌드합니다/);
  await led(win,'LED1',LED_ON);await led(win,'LED1',LED_OFF);await led(win,'LED1',LED_ON);
  // SCI9 → the USB-TTL part on D0/D1; the serial monitor sends to SCI9 and the part gets the echo, LED2 toggles.
  await win.click('[data-monitor="bus"]');await win.selectOption('#serial-target','SCI9');
  await win.waitForFunction(()=>/USB-TTL: FPB-RA6E1 SCI9 ready/.test(document.getElementById('uart-output').textContent),null,{timeout:15000});
  await win.evaluate(()=>{document.getElementById('serial-newline').checked=false;});
  await win.waitForFunction(()=>!document.getElementById('serial-send').disabled);
  await win.fill('#serial-input','Z');await win.click('#serial-send');
  await win.waitForFunction(()=>/SCI9 ready\s*Z/.test(document.getElementById('uart-output').textContent),null,{timeout:15000});
  await led(win,'LED2',LED_ON);
  assert.equal(await win.textContent('#serial-feedback'),'');
  await win.keyboard.press('Control+F2');
  await win.waitForFunction(()=>document.getElementById('shell').dataset.running==='false');
  assert.deepEqual(s.errors,[]);
 }finally{await s.close();}
});

test('FPB-RA6E1 with the ARM GCC engine on a PC without ARM GCC / FSP: the run goes on the interpreter with a one-line notice, the setting stays ARM GCC',{timeout:240000},async t=>{
 const empty=await fs.mkdtemp(path.join(tmpdir(),'stm-no-tools-'));
 const s=await launch({simEngine:'gcc',env:{LOCALAPPDATA:empty}});
 try{
  const {win}=s;
  await newRaProject(win,'ra_blink');
  assert.equal(await win.evaluate(()=>document.getElementById('sim-engine').value),'gcc');
  await win.keyboard.press('Control+F5');
  const how=await win.waitForFunction(()=>{const text=document.getElementById('console-output').textContent;return /내장 해석기로 실행합니다\(지원하는 FSP API만\)/.test(text)?'interpreter':/ARM GCC로 펌웨어를 빌드합니다/.test(text)?'gcc':null;},null,{timeout:30000}).then(h=>h.jsonValue());
  if(how==='gcc'){t.skip('ARM GCC and FSP are found outside the tools folder on this PC');await win.keyboard.press('Control+F2');return;}
  assert.equal(await win.evaluate(()=>document.getElementById('sim-tools-dialog').open),false,'no install dialog');
  assert.match(await consoleText(win),/ARM GCC와 Renesas FSP가 설치되어 있지 않아 FPB-RA6E1 프로젝트를 내장 해석기로 실행합니다/);
  await win.waitForFunction(()=>/FSP 프로그램\(hal_entry\.c\)을 내장 해석기로 시작했습니다/.test(document.getElementById('console-output').textContent),null,{timeout:30000});
  await led(win,'LED1',LED_ON);await led(win,'LED1',LED_OFF);
  assert.equal(await win.evaluate(()=>[document.getElementById('sim-engine').value,localStorage.getItem('stm32lab.simEngine')].join()),'gcc,gcc');
  await win.keyboard.press('Control+F2');
  await win.waitForFunction(()=>document.getElementById('shell').dataset.running==='false');
  assert.deepEqual(s.errors,[]);
 }finally{await s.close();await fs.rm(empty,{recursive:true,force:true});}
});
