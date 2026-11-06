// FPB-RA6E1 (Renesas RA6E1, FSP): pick the board, write hal_entry() with FSP calls, run (ARM GCC build with the
// Renesas FSP on the RA6E1 emulator): LED1 blinks from R_BSP_SoftwareDelay, S1 (P205, IRQ1) toggles LED2 through
// r_icu's callback.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {launch} from './harness.mjs';

const local=path.join(process.env.LOCALAPPDATA||'','STM-Simulator-Tools');
const gcc=process.env.ARM_GCC||path.join(local,'xpack-arm-none-eabi-gcc-15.2.1-1.1/bin/arm-none-eabi-gcc.exe');
const fsp=process.env.FSP_ROOT||path.join(local,'FSP');
const exists=p=>fs.access(p).then(()=>true,()=>false);
const toolchain=await exists(gcc)&&await exists(path.join(fsp,'ra/fsp/src/bsp/mcu/ra6e1/bsp_feature.h'));
const shot=async(win,name)=>{if(process.env.RA_SHOT_DIR)await win.screenshot({path:path.join(process.env.RA_SHOT_DIR,name)});};
const ledOn=(win,id)=>win.evaluate(id=>document.getElementById('board-led-'+id)?.getAttribute('fill')==='#64e66b',id);

test('FPB-RA6E1: FSP hal_entry builds with ARM GCC + Renesas FSP and runs on the RA6E1 emulator; LED1 blinks, S1 toggles LED2',{skip:!toolchain&&!process.env.CI_REQUIRE_TOOLCHAIN&&'ARM GCC / Renesas FSP not installed',timeout:240000},async()=>{
 const s=await launch();
 await fs.writeFile(path.join(s.profile,'native-tools.json'),JSON.stringify({armGcc:gcc,fsp,armGdb:'',cube:'',cubeF1:'',hostGcc:'',hostGdb:'',clangd:'',openocd:'',buildRoot:''}));
 try{
  const {win}=s;
  await win.click('[data-activity="board"]');if(!await win.locator('#board-open').isVisible())await win.click('[data-activity="board"]');
  await win.click('#board-open');await win.click('[data-board-id="fpb-ra6e1"]');
  if(await win.locator('#board-change-dialog').isVisible())await win.click('#board-change-confirm');
  await win.waitForFunction(()=>document.querySelector('#surface > .board')?.dataset.board==='fpb-ra6e1');
  // The new project is e² studio's FSP template.
  assert.match(await win.evaluate(()=>document.getElementById('code').value),/void hal_entry\(void\)[\s\S]*R_IOPORT_Open \(&IOPORT_CFG_CTRL, &IOPORT_CFG_NAME\)/);
  // The examples panel lists the FSP examples for an FPB-RA6E1 project (not the STM32 HAL ones).
  await win.click('[data-activity="examples"]');if(!await win.locator('#view-examples').isVisible())await win.click('[data-activity="examples"]');
  await win.fill('#hal-example-search','');
  // Only lecture examples (they open their own board's circuit) besides the FSP group; no STM32 HAL example.
  assert.deepEqual(await win.$$eval('#hal-example option',o=>o.map(x=>x.value).filter(v=>v&&!/^(ra|lecture):/.test(v))),[]);
  assert.ok(await win.$$eval('#hal-example option',o=>o.some(x=>x.value==='ra:ra_blink')));
  await win.fill('#hal-example-search','S1 인터럽트');await win.locator('#hal-example-list [data-example]').first().click();
  await win.waitForFunction(()=>/R_ICU_ExternalIrqOpen\(&g_external_irq1_ctrl/.test(document.getElementById('code').value));
  await win.keyboard.press('Control+F5');
  await win.waitForFunction(()=>/시뮬레이터\(ARM GCC 빌드\)를 시작했습니다/.test(document.getElementById('console-output').textContent),null,{timeout:180000})
   .catch(async error=>{throw new Error(`${error.message}\n출력: ${(await win.textContent('#console-output')).slice(-1500)}\n빌드: ${(await win.textContent('#build-errors').catch(()=>'')).slice(-800)}`);});
  await win.waitForFunction(()=>document.getElementById('board-led-LED1')?.getAttribute('fill')==='#64e66b',null,{timeout:30000});
  await win.waitForFunction(()=>document.getElementById('board-led-LED1')?.getAttribute('fill')==='#89a486',null,{timeout:30000});
  assert.equal(await ledOn(win,'LED2'),false);
  await shot(win,'ra6e1-running.png');
  // S1 → P205 low → IRQ1 falling edge → r_icu_isr → callback toggles LED2.
  const button=win.locator('[data-button="SW1"]');
  const box=await button.boundingBox();await win.mouse.move(box.x+box.width/2,box.y+box.height/2);await win.mouse.down();await win.waitForTimeout(300);await win.mouse.up();
  await win.waitForFunction(()=>document.getElementById('board-led-LED2')?.getAttribute('fill')==='#64e66b',null,{timeout:15000});
  await win.keyboard.press('Control+F2');
  await win.waitForFunction(()=>document.getElementById('shell').dataset.running==='false');
  assert.deepEqual(s.errors,[]);
 }finally{await s.close();}
});

test('FPB-RA6E1 Pins dialog (RA Smart Configurator style): set D3 (P104) as an output; ra_gen shows it read only',{timeout:120000},async()=>{
 const s=await launch();
 try{
  const {win}=s;
  await win.click('[data-activity="board"]');if(!await win.locator('#board-open').isVisible())await win.click('[data-activity="board"]');
  await win.click('#board-open');await win.click('[data-board-id="fpb-ra6e1"]');
  if(await win.locator('#board-change-dialog').isVisible())await win.click('#board-change-confirm');
  await win.waitForFunction(()=>document.querySelector('#surface > .board')?.dataset.board==='fpb-ra6e1');
  await win.click('#pinout-open');await win.waitForSelector('#ra-pinout-dialog[open]');
  assert.equal(await win.locator('[data-ra-pin]').count(),76);
  assert.match(await win.textContent('[data-ra-pin="P408"]'),/LED1/);
  await win.click('[data-ra-pin="P104"]');assert.match(await win.textContent('#ra-pin-props'),/Arduino D3/);
  await win.selectOption('[data-ra="function"]','GPIO_Output');
  await win.fill('[data-ra="label"]','MOTOR');await win.locator('[data-ra="label"]').dispatchEvent('change');
  assert.match(await win.textContent('#ra-pin-props'),/#define MOTOR \(BSP_IO_PORT_01_PIN_04\)/);
  // P104 is IRQ1 like S1 (P205): choosing IRQ there is refused with the reason.
  await win.selectOption('[data-ra="function"]','IRQ');assert.match(await win.textContent('#ra-pinout-error'),/IRQ1는 이미 P205/);
  await win.selectOption('[data-ra="function"]','GPIO_Output');await win.fill('[data-ra="label"]','MOTOR');await win.locator('[data-ra="label"]').dispatchEvent('change');
  await win.click('#ra-pinout-apply');await win.waitForFunction(()=>!document.getElementById('ra-pinout-dialog').open);
  await win.click('[data-activity="explorer"]');if(!await win.locator('#build-files summary').isVisible())await win.click('[data-activity="explorer"]');
  assert.equal(await win.textContent('#build-files-title'),'ra_gen · ra_cfg');
  await win.click('#build-files summary');await win.click('#build-file-list [data-build-file="ra_gen/pin_data.c"]');
  await win.waitForFunction(()=>/BSP_IO_PORT_01_PIN_04/.test(document.querySelector('#group-code .monaco-editor .view-lines')?.textContent||''),null,{timeout:10000});
  assert.match(await win.textContent('#source-tabs'),/hal_entry\.c/);
  assert.deepEqual(s.errors,[]);
 }finally{await s.close();}
});

test('FPB-RA6E1 SCI9 UART example: the USB-TTL part on D0/D1 shows the hello line, the serial monitor sends to SCI9 and gets the echo',{skip:!toolchain&&!process.env.CI_REQUIRE_TOOLCHAIN&&'ARM GCC / Renesas FSP not installed',timeout:240000},async()=>{
 const s=await launch();
 await fs.writeFile(path.join(s.profile,'native-tools.json'),JSON.stringify({armGcc:gcc,fsp,armGdb:'',cube:'',cubeF1:'',hostGcc:'',hostGdb:'',clangd:'',openocd:'',buildRoot:''}));
 try{
  const {win}=s;
  await win.click('[data-activity="board"]');if(!await win.locator('#board-open').isVisible())await win.click('[data-activity="board"]');
  await win.click('#board-open');await win.click('[data-board-id="fpb-ra6e1"]');
  if(await win.locator('#board-change-dialog').isVisible())await win.click('#board-change-confirm');
  await win.waitForFunction(()=>document.querySelector('#surface > .board')?.dataset.board==='fpb-ra6e1');
  await win.click('[data-activity="examples"]');if(!await win.locator('#view-examples').isVisible())await win.click('[data-activity="examples"]');
  await win.fill('#hal-example-search','SCI9 UART');await win.locator('#hal-example-list [data-example]').first().click();
  await win.waitForFunction(()=>/R_SCI_UART_Open\(&g_uart9_ctrl, &g_uart9_cfg\)/.test(document.getElementById('code').value));
  // The example places the USB-TTL part wired to 3V3/GND and D0 (RXD9) / D1 (TXD9).
  await win.waitForSelector('[data-part="term"]');
  // The Pins dialog shows P109 as SCI9_TXD with g_uart9's baud rate.
  await win.click('[data-activity="board"]');if(!await win.locator('#pinout-open').isVisible())await win.click('[data-activity="board"]');
  await win.click('#pinout-open');await win.waitForSelector('#ra-pinout-dialog[open]');
  await win.click('[data-ra-pin="P109"]');
  assert.equal(await win.inputValue('[data-ra="signal"]'),'SCI9_TXD');
  assert.equal(await win.inputValue('[data-ra-sci="baud"]'),'115200');
  assert.match(await win.textContent('#ra-pin-props'),/g_uart9 \(r_sci_uart · SCI9\)[\s\S]*114679 bps \(오차 0\.45 %\)/);
  await win.click('#ra-pinout-close');
  await win.keyboard.press('Control+F5');
  await win.waitForFunction(()=>/시뮬레이터\(ARM GCC 빌드\)를 시작했습니다/.test(document.getElementById('console-output').textContent),null,{timeout:180000})
   .catch(async error=>{throw new Error(`${error.message}\n출력: ${(await win.textContent('#console-output')).slice(-1500)}\n빌드: ${(await win.textContent('#build-errors').catch(()=>'')).slice(-800)}`);});
  await win.click('[data-monitor="bus"]');
  assert.equal(await win.inputValue('#serial-target'),'SCI9');
  await win.waitForFunction(()=>/USB-TTL: FPB-RA6E1 SCI9 ready/.test(document.getElementById('uart-output').textContent),null,{timeout:30000});
  await win.uncheck('#serial-newline');
  await win.waitForFunction(()=>!document.getElementById('serial-send').disabled);
  await win.fill('#serial-input','ok');await win.click('#serial-send');
  assert.equal(await win.evaluate(()=>document.getElementById('serial-feedback').textContent),'');
  await win.waitForFunction(()=>/ready\r?\n?ok/.test(document.getElementById('uart-output').textContent),null,{timeout:15000});
  await shot(win,'ra6e1-uart.png');
  await win.keyboard.press('Control+F2');
  await win.waitForFunction(()=>document.getElementById('shell').dataset.running==='false');
  assert.deepEqual(s.errors,[]);
 }finally{await s.close();}
});
