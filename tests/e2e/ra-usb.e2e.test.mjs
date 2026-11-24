// Feature 41 in the app: New Stack → Connectivity → USB PCDC (r_usb_basic · r_usb_pcdc) with its card, the one line about
// the real board and the Summary; the stack brings src/r_usb_pcdc_descriptor.c and the serial monitor's target
// "USB 가상 COM (PCDC)"; the ra_usb_cdc_echo example echoes what the monitor sends — on the built-in interpreter and,
// with ARM GCC + FSP installed, on the RA6E1 emulator — and the output log gets no USB lines.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {launch} from './harness.mjs';

const local=path.join(process.env.LOCALAPPDATA||'','STM-Simulator-Tools');
const gcc=process.env.ARM_GCC||path.join(local,'xpack-arm-none-eabi-gcc-15.2.1-1.1/bin/arm-none-eabi-gcc.exe');
const fsp=process.env.FSP_ROOT||path.join(local,'FSP');
const exists=p=>fs.access(p).then(()=>true,()=>false);
const toolchain=await exists(gcc)&&await exists(path.join(fsp,'ra/fsp/src/r_usb_basic/r_usb_basic.c'));
const consoleText=win=>win.textContent('#console-output');
const stopped=win=>win.waitForFunction(()=>document.getElementById('shell').dataset.running==='false');

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
// Runs the project, sends text to the USB virtual COM port from the serial monitor and waits for it to come back.
async function echo(win,text,timeout,started){
 await win.keyboard.press('Control+F5');await win.click('[data-monitor="bus"]');
 await win.selectOption('#serial-target','usb:pcdc');
 await win.waitForFunction(()=>!document.getElementById('serial-send').disabled,null,{timeout});
 // The emulator runs once its ELF is built.
 if(started)await win.waitForFunction(source=>new RegExp(source).test(document.getElementById('console-output').textContent),started,{timeout});
 // The PC has to enumerate the device first (a few tens of milliseconds of the run).
 await win.waitForTimeout(1500);
 await win.uncheck('#serial-newline');await win.fill('#serial-input',text);await win.click('#serial-send');
 await win.waitForFunction(t=>document.getElementById('uart-output').textContent===`USB 가상 COM (PCDC)\n${t}`,text,{timeout})
  .catch(async error=>{throw new Error(`${error.message}\n출력: ${(await consoleText(win)).slice(-1500)}\nUSB: ${await win.textContent('#uart-output')}`);});
 await win.keyboard.press('Control+F2');await stopped(win);
 assert.ok(!(await win.evaluate(()=>[...document.querySelectorAll('#console-output .log-line')].some(d=>/^\[USB/.test(d.lastChild?.textContent||'')))),'no [USB …] line in the output log');
}

test('New Stack → Connectivity → USB PCDC: the g_basic0 card, the line about the real board, Summary, the descriptor source and the serial monitor target; the echo example on the interpreter',{timeout:240000},async()=>{
 const s=await launch();
 try{
  const {win}=s;
  await newRaProject(win);await openStacks(win);
  assert.ok((await win.evaluate(()=>[...document.querySelectorAll('#ra-stack-add optgroup[label="Connectivity"] option')].map(o=>[o.value,o.textContent]))).some(([v,t])=>v==='USB'&&t==='USB PCDC (r_usb_basic · r_usb_pcdc)'));
  await win.selectOption('#ra-stack-add','USB');await win.click('[data-ra-add]');
  const card='[data-ra-stack="USB"]';await win.waitForSelector(card);
  assert.match(await win.textContent(card+' header'),/g_basic0\s*USB PCDC \(r_usb_basic · r_usb_pcdc\)/);
  assert.deepEqual(await win.evaluate(sel=>[...document.querySelectorAll(sel+' .ra-stack-fields label')].map(l=>l.firstChild.textContent.trim()),card),['Interrupt Priority (USBI)','Interrupt Priority (USBR)','Callback']);
  assert.equal(await win.inputValue(card+' [data-ra-field="priority"]'),'12');assert.equal(await win.inputValue(card+' [data-ra-field="resumePriority"]'),'12');assert.equal(await win.inputValue(card+' [data-ra-field="callback"]'),'');
  assert.equal(await win.textContent(card+' .form-hint'),'실물 보드는 J3·J4의 USB 신호를 USB 커넥터에 직접 배선해야 합니다.');
  assert.equal(await win.evaluate(()=>document.querySelector('#ra-stack-add option[value="USB"]')),null,'one USB stack');
  await win.click('[data-ra-tab="summary"]');assert.match(await win.textContent('#ra-summary'),/g_basic0 \(r_usb_basic · r_usb_pcdc\)/);
  await win.click('#ra-pinout-apply');await win.waitForFunction(()=>!document.getElementById('ra-pinout-dialog').open);
  assert.ok((await win.evaluate(()=>[...document.querySelectorAll('#source-file option')].map(o=>o.value))).includes('r_usb_pcdc_descriptor.c'),'the descriptor source is in the project');
  assert.match(await win.textContent('#file-tree'),/r_usb_pcdc_descriptor\.c/);
  assert.deepEqual(await win.evaluate(()=>[...document.querySelectorAll('#serial-target option')].map(o=>[o.value,o.textContent])),[['usb:pcdc','USB 가상 COM (PCDC)']]);
  // Undo takes the stack and the descriptor source away together, redo brings both back; saved and opened again, the
  // project keeps both.
  const descriptor=want=>win.waitForFunction(w=>[...document.querySelectorAll('#source-file option')].some(o=>o.value==='r_usb_pcdc_descriptor.c')===w,want);
  const targets=()=>win.evaluate(()=>[...document.querySelectorAll('#serial-target option')].map(o=>o.value));
  await win.click('#undo');await descriptor(false);
  assert.ok(!(await targets()).includes('usb:pcdc'));
  await win.click('#redo');await descriptor(true);
  assert.deepEqual(await targets(),['usb:pcdc']);
  const file=path.join(await fs.mkdtemp(path.join(os.tmpdir(),'stm-usb-')),'usb.stm32lab');
  await s.app.evaluate(({dialog},p)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:p});},file);
  await win.click('#save');await win.waitForFunction(()=>document.getElementById('save-state').textContent.includes('파일 저장됨'));
  const saved=JSON.parse(await fs.readFile(file,'utf8'));
  assert.equal(saved.mcu.peripherals.USB.enabled,true);assert.ok(saved.firmware.files.some(f=>f.name==='r_usb_pcdc_descriptor.c'));
  await newRaProject(win);await descriptor(false);
  await s.app.evaluate(({dialog},p)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[p]});},file);
  await win.evaluate(()=>document.getElementById('open').click());
  await win.waitForFunction(()=>/회로를 열었습니다/.test(document.getElementById('console-output').textContent));
  await descriptor(true);
  assert.deepEqual(await targets(),['usb:pcdc']);
  await fs.rm(path.dirname(file),{recursive:true,force:true});
  // The example on the built-in interpreter: what the monitor sends comes back.
  await newRaProject(win,'ra_usb_cdc_echo');
  await echo(win,'hello',60000);
  assert.deepEqual(s.errors,[]);
 }finally{await s.close();}
});

test('ra_usb_cdc_echo on the RA6E1 emulator (ARM GCC + FSP): the real r_usb_basic / r_usb_pcdc echoes what the serial monitor sends',{timeout:300000,skip:!toolchain&&'ARM GCC / Renesas FSP not installed'},async()=>{
 const s=await launch({simEngine:'gcc'});
 try{
  const {win}=s;
  await newRaProject(win,'ra_usb_cdc_echo');
  await echo(win,'USB echo',180000,'시뮬레이터\\(ARM GCC 빌드\\)를 시작했습니다');
  assert.deepEqual(s.errors,[]);
 }finally{await s.close();}
});
