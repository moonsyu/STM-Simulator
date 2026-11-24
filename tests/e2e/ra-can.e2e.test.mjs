// Feature 40 in the app: New Stack → Connectivity → CAN (r_can) with its card (no hint line) and the Summary; the stack
// brings the serial monitor's target "CAN 가상 노드"; the ra_can_loopback example sends and receives in internal loopback
// (LED2 toggles), and without its loopback line the board and the virtual node exchange frames through the serial monitor
// — on the built-in interpreter and, with ARM GCC + FSP installed, on the RA6E1 emulator — and the output log gets no CAN
// lines.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {launch} from './harness.mjs';
import {raExample} from '../../src/ra-examples.js';

const local=path.join(process.env.LOCALAPPDATA||'','STM-Simulator-Tools');
const gcc=process.env.ARM_GCC||path.join(local,'xpack-arm-none-eabi-gcc-15.2.1-1.1/bin/arm-none-eabi-gcc.exe');
const fsp=process.env.FSP_ROOT||path.join(local,'FSP');
const exists=p=>fs.access(p).then(()=>true,()=>false);
const toolchain=await exists(gcc)&&await exists(path.join(fsp,'ra/fsp/src/r_can/r_can.c'));
const consoleText=win=>win.textContent('#console-output');
const stopped=win=>win.waitForFunction(()=>document.getElementById('shell').dataset.running==='false');
const LED_ON='#64e66b',LED_OFF='#89a486';
const led=(win,id,fill,timeout=60000)=>win.waitForFunction(([id,fill])=>document.getElementById('board-led-'+id)?.getAttribute('fill')===fill,[id,fill],{timeout});
// The example in normal mode: its internal loopback line taken out.
const NORMAL=raExample('ra_can_loopback').code.replace(/^\s*R_CAN_ModeTransition\(&g_can0_ctrl, CAN_OPERATION_MODE_NORMAL, CAN_TEST_MODE_LOOPBACK_INTERNAL\);\n/m,'');

async function newRaProject(win,template='ra-minimal'){
 await win.evaluate(()=>document.getElementById('new').click());
 if(await win.evaluate(()=>document.getElementById('replace-dialog').open))await win.click('#replace-confirm');
 await win.waitForSelector('#project-dialog[open]');await win.selectOption('#new-project-board','fpb-ra6e1');await win.selectOption('#new-project-template',template);
 await win.click('#project-create');await win.waitForFunction(()=>!document.getElementById('project-dialog').open);
 await win.waitForFunction(()=>document.querySelector('#surface > .board')?.dataset.board==='fpb-ra6e1');
}
async function openStacks(win){
 if(!await win.locator('#pinout-open').isVisible())await win.click('[data-activity="board"]');
 if(!await win.locator('#pinout-open').isVisible())await win.click('[data-activity="board"]');
 await win.click('#pinout-open');await win.waitForSelector('#ra-pinout-dialog[open]');await win.click('[data-ra-tab="stacks"]');
}
async function setCode(win,code){await win.evaluate(v=>{const c=document.getElementById('code');c.value=v;c.dispatchEvent(new Event('input',{bubbles:true}));},code);}
const noCanLines=async win=>assert.ok(!(await win.evaluate(()=>[...document.querySelectorAll('#console-output .log-line')].some(d=>/^\[CAN/.test(d.lastChild?.textContent||'')))),'no [CAN …] line in the output log');
// The loopback example: LED2 toggles with every frame MB1 takes back.
async function loopback(win,timeout,started){
 await win.keyboard.press('Control+F5');
 if(started)await win.waitForFunction(source=>new RegExp(source).test(document.getElementById('console-output').textContent),started,{timeout});
 await led(win,'LED2',LED_ON,timeout);await led(win,'LED2',LED_OFF,timeout);
 await win.keyboard.press('Control+F2');await stopped(win);await noCanLines(win);
}
// Normal mode: the serial monitor's CAN virtual node gets the board's frames (ID 0x100, the counter) and sends "100 01 02",
// which MB1 takes (LED1: bit 0 of its first byte).
async function exchange(win,timeout,started){
 await setCode(win,NORMAL);
 await win.keyboard.press('Control+F5');await win.click('[data-monitor="bus"]');
 await win.selectOption('#serial-target','can:node');
 await win.waitForFunction(()=>!document.getElementById('serial-send').disabled,null,{timeout});
 if(started)await win.waitForFunction(source=>new RegExp(source).test(document.getElementById('console-output').textContent),started,{timeout});
 await win.waitForFunction(()=>/^CAN 가상 노드\n100 \[1\] 00\n100 \[1\] 01/.test(document.getElementById('uart-output').textContent),null,{timeout})
  .catch(async error=>{throw new Error(`${error.message}\n출력: ${(await consoleText(win)).slice(-1500)}\nCAN: ${await win.textContent('#uart-output')}`);});
 assert.equal(await win.evaluate(()=>document.getElementById('board-led-LED1')?.getAttribute('fill')),LED_OFF,'nothing received yet');
 // A line that is not a frame: the monitor says so where it says a send failed.
 await win.uncheck('#serial-newline');await win.fill('#serial-input','zz');await win.click('#serial-send');
 assert.equal(await win.textContent('#serial-feedback'),'프레임 형식을 확인하세요. 예: 123 01 02 03 (ID와 데이터 바이트, 16진수)');
 await win.fill('#serial-input','100 01 02');await win.click('#serial-send');
 await led(win,'LED1',LED_ON,timeout);
 assert.match(await win.textContent('#uart-output'),/^CAN 가상 노드\n(100 \[1\] [0-9A-F]{2}\n?)+$/);
 await win.keyboard.press('Control+F2');await stopped(win);await noCanLines(win);
}

test('New Stack → Connectivity → CAN (r_can): the g_can0 card without a hint line, Summary, the serial monitor target, undo / redo and save / open; the example on the interpreter',{timeout:240000},async()=>{
 const s=await launch();
 try{
  const {win}=s;
  await newRaProject(win);await openStacks(win);
  assert.ok((await win.evaluate(()=>[...document.querySelectorAll('#ra-stack-add optgroup[label="Connectivity"] option')].map(o=>[o.value,o.textContent]))).some(([v,t])=>v==='CAN0'&&t==='CAN (r_can)'));
  await win.selectOption('#ra-stack-add','CAN0');await win.click('[data-ra-add]');
  const card='[data-ra-stack="CAN0"]';await win.waitForSelector(card);
  assert.match(await win.textContent(card+' header'),/g_can0\s*CAN \(r_can\)/);
  assert.deepEqual(await win.evaluate(sel=>[...document.querySelectorAll(sel+' .ra-stack-fields label')].map(l=>l.firstChild.textContent.trim()),card),['Bit Rate','ID Mode','MB0','MB1','MB2','MB3','Mask','Interrupt Priority','Callback']);
  assert.deepEqual(await win.evaluate(sel=>[...document.querySelectorAll(sel+' [data-ra-field="bitrate"] option')].map(o=>o.textContent),card),['125 kbps','250 kbps','500 kbps','1000 kbps']);
  assert.deepEqual(await win.evaluate(sel=>[...document.querySelectorAll(sel+' [data-ra-field="idMode"] option')].map(o=>o.textContent),card),['Standard','Extended']);
  assert.equal(await win.inputValue(card+' [data-ra-field="bitrate"]'),'500');assert.equal(await win.inputValue(card+' [data-ra-field="idMode"]'),'STANDARD');
  assert.deepEqual(await win.evaluate(sel=>[...document.querySelectorAll(sel+' [data-ra-can-key="type"]')].map(e=>e.value),card),['TRANSMIT','RECEIVE','RECEIVE','RECEIVE']);
  assert.deepEqual(await win.evaluate(sel=>[...document.querySelector(sel+' [data-ra-can-key="type"]').options].map(o=>o.textContent),card),['Transmit','Receive']);
  assert.deepEqual(await win.evaluate(sel=>[...document.querySelectorAll(sel+' [data-ra-can-key="id"]')].map(e=>e.value),card),['0x000','0x100','0x101','0x102']);
  assert.equal(await win.inputValue(card+' [data-ra-field="mask"]'),'0x7FF');assert.equal(await win.inputValue(card+' [data-ra-field="priority"]'),'12');assert.equal(await win.inputValue(card+' [data-ra-field="callback"]'),'can_callback');
  assert.equal(await win.evaluate(sel=>document.querySelector(sel+' .form-hint'),card),null,'no hint line');
  assert.equal(await win.evaluate(()=>document.querySelector('#ra-stack-add option[value="CAN0"]')),null,'one CAN stack');
  // A bad ID: the one common message; a good one in hexadecimal is kept.
  await win.fill(card+' [data-ra-can-mb="2"][data-ra-can-key="id"]','0x800');await win.press(card+' [data-ra-can-mb="2"][data-ra-can-key="id"]','Tab');
  await win.waitForFunction(()=>document.getElementById('ra-pinout-error').textContent.includes('CAN: 설정을 확인하세요.'));
  await win.fill(card+' [data-ra-can-mb="2"][data-ra-can-key="id"]','0x1A0');await win.press(card+' [data-ra-can-mb="2"][data-ra-can-key="id"]','Tab');
  await win.waitForFunction(()=>!document.getElementById('ra-pinout-error').textContent);
  assert.equal(await win.inputValue(card+' [data-ra-can-mb="2"][data-ra-can-key="id"]'),'0x1A0');
  // Text that is not hexadecimal: the value stays and shows again.
  await win.fill(card+' [data-ra-can-mb="2"][data-ra-can-key="id"]','xyz');await win.press(card+' [data-ra-can-mb="2"][data-ra-can-key="id"]','Tab');
  await win.waitForFunction(sel=>document.querySelector(sel).value==='0x1A0',card+' [data-ra-can-mb="2"][data-ra-can-key="id"]');
  // ID Mode sets the mask to compare every ID bit: Extended 0x1FFFFFFF, Standard 0x7FF.
  await win.selectOption(card+' [data-ra-field="idMode"]','EXTENDED');await win.waitForFunction(sel=>document.querySelector(sel+' [data-ra-field="mask"]').value==='0x1FFFFFFF',card);
  await win.selectOption(card+' [data-ra-field="idMode"]','STANDARD');await win.waitForFunction(sel=>document.querySelector(sel+' [data-ra-field="mask"]').value==='0x7FF',card);
  await win.click('[data-ra-tab="summary"]');assert.match(await win.textContent('#ra-summary'),/g_can0 \(r_can\)/);
  await win.click('#ra-pinout-apply');await win.waitForFunction(()=>!document.getElementById('ra-pinout-dialog').open);
  const targets=()=>win.evaluate(()=>[...document.querySelectorAll('#serial-target option')].map(o=>[o.value,o.textContent]));
  assert.deepEqual(await targets(),[['can:node','CAN 가상 노드']]);
  // Undo takes the stack (and the target) away, redo brings it back; saved and opened again, the project keeps it.
  await win.click('#undo');await win.waitForFunction(()=>![...document.querySelectorAll('#serial-target option')].some(o=>o.value==='can:node'));
  await win.click('#redo');await win.waitForFunction(()=>[...document.querySelectorAll('#serial-target option')].some(o=>o.value==='can:node'));
  const file=path.join(await fs.mkdtemp(path.join(os.tmpdir(),'stm-can-')),'can.stm32lab');
  await s.app.evaluate(({dialog},p)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:p});},file);
  await win.click('#save');await win.waitForFunction(()=>document.getElementById('save-state').textContent.includes('파일 저장됨'));
  const saved=JSON.parse(await fs.readFile(file,'utf8'));
  assert.equal(saved.mcu.peripherals.CAN0.enabled,true);assert.equal(saved.mcu.peripherals.CAN0.mailboxes[2].id,0x1a0);
  await newRaProject(win);assert.deepEqual(await targets(),[['','Pins에서 SCI UART 핀을 정하세요']]);
  await s.app.evaluate(({dialog},p)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[p]});},file);
  await win.evaluate(()=>document.getElementById('open').click());
  await win.waitForFunction(()=>/회로를 열었습니다/.test(document.getElementById('console-output').textContent));
  assert.deepEqual(await targets(),[['can:node','CAN 가상 노드']]);
  await fs.rm(path.dirname(file),{recursive:true,force:true});
  // The example on the built-in interpreter: internal loopback, then normal mode with the virtual node.
  await newRaProject(win,'ra_can_loopback');
  await loopback(win,60000);
  await exchange(win,60000);
  assert.deepEqual(s.errors,[]);
 }finally{await s.close();}
});

test('ra_can_loopback on the RA6E1 emulator (ARM GCC + FSP): the real r_can in internal loopback, then with the virtual node',{timeout:300000,skip:!toolchain&&'ARM GCC / Renesas FSP not installed'},async()=>{
 const s=await launch({simEngine:'gcc'});
 try{
  const {win}=s;
  await newRaProject(win,'ra_can_loopback');
  await loopback(win,180000,'시뮬레이터\\(ARM GCC 빌드\\)를 시작했습니다');
  await exchange(win,180000,'시뮬레이터\\(ARM GCC 빌드\\)를 시작했습니다');
  assert.deepEqual(s.errors,[]);
 }finally{await s.close();}
});
