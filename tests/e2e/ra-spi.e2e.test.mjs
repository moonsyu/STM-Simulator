// Feature 32: SPI on the FPB-RA6E1 — RASC-style Stacks (New Stack → Connectivity → r_spi / r_sci_spi) and Pins cards,
// the generated hal_data, Developer Assistance, and the SPI memory example built with ARM GCC + FSP and run on the RA6E1
// emulator, and the same example on the built-in interpreter (the default engine, feature 42).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {launch} from './harness.mjs';

const local=path.join(process.env.LOCALAPPDATA||'','STM-Simulator-Tools');
const gcc=process.env.ARM_GCC||path.join(local,'xpack-arm-none-eabi-gcc-15.2.1-1.1/bin/arm-none-eabi-gcc.exe');
const fsp=process.env.FSP_ROOT||path.join(local,'FSP');
const exists=p=>fs.access(p).then(()=>true,()=>false);
const toolchain=await exists(gcc)&&await exists(path.join(fsp,'ra/fsp/src/r_spi/r_spi.c'));

test('RA SPI stacks: New Stack → Connectivity adds g_spi1 on D10-D13 and g_sci_spi9; Properties, Pins cards, Summary and Developer Assistance follow',{timeout:150000},async()=>{
 const s=await launch();
 try{
  const {win}=s;
  await win.evaluate(()=>document.getElementById('new').click());if(await win.evaluate(()=>document.getElementById('replace-dialog').open))await win.click('#replace-confirm');
  await win.waitForSelector('#project-dialog[open]');await win.selectOption('#new-project-board','fpb-ra6e1');await win.selectOption('#new-project-template','ra-minimal');
  await win.click('#project-create');await win.waitForFunction(()=>!document.getElementById('project-dialog').open);
  await win.click('[data-activity="board"]');if(!await win.locator('#pinout-open').isVisible())await win.click('[data-activity="board"]');
  await win.click('#pinout-open');await win.waitForSelector('#ra-pinout-dialog[open]');
  await win.click('[data-ra-tab="stacks"]');
  assert.deepEqual(await win.$$eval('#ra-stack-add optgroup',g=>g.map(x=>x.label)),['Input','Connectivity','Timers','Monitoring · System','Power','Storage','Transfer']);
  assert.deepEqual(await win.$$eval('#ra-stack-add optgroup[label="Connectivity"] option',o=>o.map(x=>x.textContent)),['SPI (r_spi) · SPI1','SPI (r_sci_spi) · SCI9 Simple SPI','I2C Slave (r_iic_slave) · IIC0','I2C Slave (r_iic_slave) · IIC1']);
  // r_spi: pin group A (Arduino D12/D11/D13/D10) and the Properties RASC shows.
  await win.selectOption('#ra-stack-add','SPI1');await win.click('[data-ra-add]');
  const card='#ra-stacks [data-ra-spi-stack="SPI1"]';await win.waitForSelector(card);
  assert.match(await win.textContent(`${card} header`),/g_spi1\s*SPI \(r_spi\)/);
  assert.match(await win.textContent(card),/SPBR 49 · BRDV 0 → 1000000 bps[\s\S]*SSL0 \(P103\)/);
  await win.fill(`${card} [data-ra-spi="bitrate"]`,'500000');await win.locator(`${card} [data-ra-spi="bitrate"]`).dispatchEvent('change');
  await win.waitForFunction(()=>/SPBR 99 · BRDV 0 → 500000 bps/.test(document.querySelector('#ra-stacks [data-ra-spi-stack="SPI1"]').textContent));
  await win.selectOption(`${card} [data-ra-spi="cpol"]`,'1');
  await win.fill(`${card} [data-ra-spi="bitrate"]`,'60000000');await win.locator(`${card} [data-ra-spi="bitrate"]`).dispatchEvent('change');
  assert.match(await win.textContent('#ra-pinout-error'),/PCLKA\/2/);
  await win.fill(`${card} [data-ra-spi="bitrate"]`,'500000');await win.locator(`${card} [data-ra-spi="bitrate"]`).dispatchEvent('change');
  assert.equal(await win.textContent('#ra-pinout-error'),'');
  // The pins: D10 is SSL0 with the same card; making it a GPIO turns the stack 3-wire.
  await win.click(`${card} [data-ra-goto]`);await win.waitForSelector('[data-ra-pin="P100"].active');
  assert.equal(await win.inputValue('[data-ra="signal"]'),'SPI1_MISO');
  assert.match(await win.textContent('#ra-pin-props'),/g_spi1 \(r_spi · SPI1\)/);assert.equal(await win.inputValue('[data-ra-spi="cpol"]'),'1');
  await win.click('[data-ra-pin="P103"]');assert.equal(await win.inputValue('[data-ra="signal"]'),'SPI1_SSL0');
  await win.selectOption('[data-ra="function"]','GPIO_Output');await win.click('[data-ra-pin="P102"]');
  assert.match(await win.textContent('#ra-pin-props'),/Slave Select: 사용 안 함 — Clock Synchronous Operation\(3-wire\)/);
  assert.equal(await win.textContent('#ra-pinout-error'),'');
  // r_sci_spi: SCI9 on D1 (MOSI9), D0 (MISO9) and P111 (SCK9); its mode select goes back to a UART.
  await win.click('[data-ra-tab="stacks"]');await win.selectOption('#ra-stack-add','SCI9');await win.click('[data-ra-add]');
  await win.waitForSelector('#ra-stacks [data-ra-spi-stack="SCI9"]');
  assert.match(await win.textContent('#ra-stacks [data-ra-spi-stack="SCI9"]'),/g_sci_spi9[\s\S]*CKS 0 · BRR 24 → 1000000 bps/);
  assert.equal(await win.inputValue('#ra-stacks [data-ra-spi-stack="SCI9"] [data-ra-spi="callback"]'),'sci_spi9_callback');
  await win.click('[data-ra-tab="pins"]');await win.click('[data-ra-pin="P111"]');
  assert.equal(await win.inputValue('[data-ra="signal"]'),'SCI9_SCK');assert.equal(await win.inputValue('[data-ra-sci="mode"]'),'SPI');
  assert.match(await win.textContent('#ra-pin-props'),/g_sci_spi9 \(r_sci_spi · SCI9\)/);
  await win.click('[data-ra-tab="summary"]');
  assert.match(await win.textContent('#ra-summary'),/g_spi1 \(r_spi\)[\s\S]*g_sci_spi9 \(r_sci_spi\)/);
  await win.click('#ra-pinout-apply');await win.waitForFunction(()=>!document.getElementById('ra-pinout-dialog').open);
  // The serial monitor reaches SCI UARTs only: SCI9 as simple SPI is not a target, so the empty-state hint shows.
  assert.deepEqual(await win.$$eval('#serial-target option',o=>o.map(x=>[x.value,x.textContent])),[['','Pins에서 SCI UART 핀을 정하세요']]);
  // Developer Assistance and the FSP tree follow the stacks.
  await win.click('[data-activity="explorer"]');if(!await win.locator('#build-files > summary').isVisible())await win.click('[data-activity="explorer"]');
  assert.deepEqual(await win.$$eval('#ra-assist-list [data-assist]',d=>d.map(x=>x.dataset.assist)),['g_ioport','BSP','g_external_irq1','g_spi1','g_sci_spi9']);
  assert.ok(await win.$$eval('#ra-assist-list [data-assist="g_spi1"] [data-assist-item]',b=>b.some(x=>/R_SPI_WriteRead\(&g_spi1_ctrl/.test(x.title))));
  await win.click('#build-files > summary');
  for(const f of ['ra_cfg','ra_cfg/fsp_cfg'])await win.click(`#build-file-list [data-tree-folder="${f}"] > summary`);
  await win.click('#build-file-list [data-build-file="ra_cfg/fsp_cfg/r_spi_cfg.h"]');
  await win.waitForFunction(()=>/SPI_TRANSMIT_FROM_RXI_ISR.\(0\)/.test(document.querySelector('#group-code .monaco-editor .view-lines')?.textContent||''),null,{timeout:15000});
  assert.ok(await win.$$eval('#build-file-list [data-build-file]',b=>['ra/fsp/src/r_spi/r_spi.c','ra/fsp/src/r_sci_spi/r_sci_spi.c','ra/fsp/inc/api/r_spi_api.h'].every(f=>b.some(x=>x.dataset.buildFile===f))));
  assert.ok(!await win.$$eval('#build-file-list [data-build-file]',b=>b.some(x=>x.dataset.buildFile==='ra/fsp/src/r_sci_uart/r_sci_uart.c')),'SCI9 is not a UART');
  assert.deepEqual(s.errors,[]);
 }finally{await s.close();}
});

test('FPB-RA6E1 SPI example: the SPI memory on D10-D13 is written and read back over SPI1; SCI9 prints 0x2A and LED2 lights',{skip:!toolchain&&!process.env.CI_REQUIRE_TOOLCHAIN&&'ARM GCC / Renesas FSP (r_spi) not installed',timeout:240000},async()=>{
 // The RA6E1 emulator (ARM GCC engine): the RSPI registers, SSL0 and the interrupts of the built program.
 const s=await launch({simEngine:'gcc'});
 await fs.writeFile(path.join(s.profile,'native-tools.json'),JSON.stringify({armGcc:gcc,fsp,armGdb:'',cube:'',cubeF1:'',hostGcc:'',hostGdb:'',clangd:'',openocd:'',buildRoot:''}));
 try{
  const {win}=s;
  await win.click('[data-activity="board"]');if(!await win.locator('#board-open').isVisible())await win.click('[data-activity="board"]');
  await win.click('#board-open');await win.click('[data-board-id="fpb-ra6e1"]');
  if(await win.locator('#board-change-dialog').isVisible())await win.click('#board-change-confirm');
  await win.waitForFunction(()=>document.querySelector('#surface > .board')?.dataset.board==='fpb-ra6e1');
  await win.click('[data-activity="examples"]');if(!await win.locator('#view-examples').isVisible())await win.click('[data-activity="examples"]');
  await win.fill('#hal-example-search','SPI 메모리');await win.locator('#hal-example-list [data-example]').first().click();
  await win.waitForFunction(()=>/R_SPI_WriteRead\(&g_spi1_ctrl/.test(document.getElementById('code').value));
  await win.waitForSelector('#part-layer [data-part="mem"]');await win.waitForSelector('[data-part="term"]');
  await win.click('[data-activity="board"]');if(!await win.locator('#pinout-open').isVisible())await win.click('[data-activity="board"]');
  await win.click('#pinout-open');await win.waitForSelector('#ra-pinout-dialog[open]');
  await win.click('[data-ra-pin="P102"]');
  assert.equal(await win.inputValue('[data-ra="signal"]'),'SPI1_RSPCK');
  assert.match(await win.textContent('#ra-pin-props'),/g_spi1 \(r_spi · SPI1\)[\s\S]*SPBR 49 · BRDV 0 → 1000000 bps[\s\S]*SSL0 \(P103\)/);
  await win.click('#ra-pinout-close');
  await win.keyboard.press('Control+F5');
  await win.waitForFunction(()=>/시뮬레이터\(ARM GCC 빌드\)를 시작했습니다/.test(document.getElementById('console-output').textContent),null,{timeout:180000})
   .catch(async error=>{throw new Error(`${error.message}\n출력: ${(await win.textContent('#console-output')).slice(-1500)}\n빌드: ${(await win.textContent('#build-errors').catch(()=>'')).slice(-800)}`);});
  await win.waitForFunction(()=>document.getElementById('board-led-LED2')?.getAttribute('fill')==='#64e66b',null,{timeout:30000});
  await win.click('[data-monitor="bus"]');
  await win.waitForFunction(()=>/USB-TTL: SPI1 read 0x2A/.test(document.getElementById('uart-output').textContent),null,{timeout:30000});
  await win.keyboard.press('Control+F2');
  await win.waitForFunction(()=>document.getElementById('shell').dataset.running==='false');
  assert.deepEqual(s.errors,[]);
 }finally{await s.close();}
});

test('FPB-RA6E1 SPI example on the built-in interpreter: R_SPI_Write and WriteRead reach the SPI memory with SSL0, SCI9 prints 0x2A, LED2 lights',{timeout:150000},async()=>{
 const s=await launch();
 try{
  const {win}=s;
  await win.evaluate(()=>document.getElementById('new').click());if(await win.evaluate(()=>document.getElementById('replace-dialog').open))await win.click('#replace-confirm');
  await win.waitForSelector('#project-dialog[open]');await win.selectOption('#new-project-board','fpb-ra6e1');await win.selectOption('#new-project-template','ra_spi_memory');
  await win.click('#project-create');await win.waitForFunction(()=>!document.getElementById('project-dialog').open);
  await win.waitForFunction(()=>/R_SPI_WriteRead\(&g_spi1_ctrl/.test(document.getElementById('code').value));
  await win.waitForSelector('#part-layer [data-part="mem"]');
  assert.equal(await win.evaluate(()=>document.getElementById('sim-engine').value),'interpreter');
  await win.keyboard.press('Control+F5');
  await win.waitForFunction(()=>/FSP 프로그램\(hal_entry\.c\)을 내장 해석기로 시작했습니다/.test(document.getElementById('console-output').textContent),null,{timeout:30000})
   .catch(async error=>{throw new Error(`${error.message}
출력: ${(await win.textContent('#console-output')).slice(-1500)}`);});
  assert.doesNotMatch(await win.textContent('#console-output'),/ARM GCC로 펌웨어를 빌드합니다/);
  await win.waitForFunction(()=>document.getElementById('board-led-LED2')?.getAttribute('fill')==='#64e66b',null,{timeout:15000});
  await win.click('[data-monitor="bus"]');
  await win.waitForFunction(()=>/USB-TTL: SPI1 read 0x2A/.test(document.getElementById('uart-output').textContent),null,{timeout:15000});
  await win.keyboard.press('Control+F2');
  await win.waitForFunction(()=>document.getElementById('shell').dataset.running==='false');
  assert.deepEqual(s.errors,[]);
 }finally{await s.close();}
});
