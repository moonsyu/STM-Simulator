// Feature 33: the I2C slave on the FPB-RA6E1 — New Stack → Connectivity → I2C Slave (r_iic_slave), the Pins card with
// the Master / Slave mode, Summary, Developer Assistance and the generated files; and the example with an ESP32 as the
// I2C master, on the RA6E1 emulator (ARM GCC + FSP) and on the built-in interpreter.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {launch} from './harness.mjs';

const local=path.join(process.env.LOCALAPPDATA||'','STM-Simulator-Tools');
const gcc=process.env.ARM_GCC||path.join(local,'xpack-arm-none-eabi-gcc-15.2.1-1.1/bin/arm-none-eabi-gcc.exe');
const fsp=process.env.FSP_ROOT||path.join(local,'FSP');
const exists=p=>fs.access(p).then(()=>true,()=>false);
const toolchain=await exists(gcc)&&await exists(path.join(fsp,'ra/fsp/src/r_iic_slave/r_iic_slave.c'));
const output=win=>win.textContent('#console-output');

test('RA I2C slave stack: New Stack → Connectivity adds g_i2c_slave0 on SCL/SDA; the Pins card switches Master / Slave; Summary, Developer Assistance and r_iic_slave_cfg.h follow',{timeout:150000},async()=>{
 const s=await launch();
 try{
  const {win}=s;
  await win.evaluate(()=>document.getElementById('new').click());if(await win.evaluate(()=>document.getElementById('replace-dialog').open))await win.click('#replace-confirm');
  await win.waitForSelector('#project-dialog[open]');await win.selectOption('#new-project-board','fpb-ra6e1');await win.selectOption('#new-project-template','ra-minimal');
  await win.click('#project-create');await win.waitForFunction(()=>!document.getElementById('project-dialog').open);
  await win.click('[data-activity="board"]');if(!await win.locator('#pinout-open').isVisible())await win.click('[data-activity="board"]');
  await win.click('#pinout-open');await win.waitForSelector('#ra-pinout-dialog[open]');
  await win.click('[data-ra-tab="stacks"]');
  assert.ok((await win.$$eval('#ra-stack-add optgroup[label="Connectivity"] option',o=>o.map(x=>x.textContent))).includes('I2C Slave (r_iic_slave) · IIC0'));
  // IIC1's SCL is P205, the board's S1 (IRQ1) in a new project: the reason is shown.
  await win.selectOption('#ra-stack-add','IIC1');await win.click('[data-ra-add]');
  assert.match(await win.textContent('#ra-pinout-error'),/IIC1: 핀\(P205·P206\)이 다른 기능에 쓰이고 있습니다 \(P205는 보드의 S1 스위치/);
  await win.selectOption('#ra-stack-add','IIC0');await win.click('[data-ra-add]');
  const card='#ra-stacks [data-ra-iic-stack="IIC0"]';await win.waitForSelector(card);
  assert.equal(await win.textContent('#ra-pinout-error'),'');
  assert.match(await win.textContent(card),/g_i2c_slave0\s*I2C Slave \(r_iic_slave\)[\s\S]*STANDARD · 자기 주소 0x42 · i2c_slave0_callback/);
  assert.ok(!(await win.$$eval('#ra-stack-add option',o=>o.map(x=>x.value))).includes('IIC0'),'the channel is taken');
  // The Pins card of SCL (P400): slave mode with this board's address, callback and priority.
  await win.click(`${card} [data-ra-goto]`);await win.waitForSelector('[data-ra-pin="P400"].active');
  assert.equal(await win.inputValue('[data-ra="signal"]'),'IIC0_SCL');assert.equal(await win.inputValue('[data-ra-iic="mode"]'),'SLAVE');
  assert.match(await win.textContent('#ra-pin-props'),/g_i2c_slave0 \(r_iic_slave · IIC0\)[\s\S]*R_IIC_SLAVE_Open\(&g_i2c_slave0_ctrl, &g_i2c_slave0_cfg\)/);
  assert.equal(await win.inputValue('[data-ra-iic="slave"]'),'0x42');assert.equal(await win.inputValue('[data-ra-iic="callback"]'),'i2c_slave0_callback');
  await win.fill('[data-ra-iic="slave"]','0x05');await win.locator('[data-ra-iic="slave"]').dispatchEvent('change');
  assert.match(await win.textContent('#ra-pinout-error'),/자기 주소는 7비트 0x08~0x77/);
  await win.fill('[data-ra-iic="slave"]','0x30');await win.locator('[data-ra-iic="slave"]').dispatchEvent('change');
  assert.equal(await win.textContent('#ra-pinout-error'),'');
  // One channel is a master or a slave: the mode changes the stack, its default callback and address.
  await win.selectOption('[data-ra-iic="mode"]','MASTER');
  assert.match(await win.textContent('#ra-pin-props'),/g_i2c_master0 \(r_iic_master · IIC0\)/);assert.equal(await win.inputValue('[data-ra-iic="callback"]'),'i2c_master0_callback');
  await win.selectOption('[data-ra-iic="mode"]','SLAVE');
  assert.match(await win.textContent('#ra-pin-props'),/g_i2c_slave0 \(r_iic_slave · IIC0\)/);assert.equal(await win.inputValue('[data-ra-iic="callback"]'),'i2c_slave0_callback');
  assert.equal(await win.inputValue('[data-ra-iic="slave"]'),'0x30');
  await win.click('[data-ra-tab="summary"]');
  assert.match(await win.textContent('#ra-summary'),/g_i2c_slave0 \(r_iic_slave\)/);
  await win.click('#ra-pinout-apply');await win.waitForFunction(()=>!document.getElementById('ra-pinout-dialog').open);
  // Developer Assistance and the FSP tree follow the stack.
  await win.click('[data-activity="explorer"]');if(!await win.locator('#build-files > summary').isVisible())await win.click('[data-activity="explorer"]');
  assert.deepEqual(await win.$$eval('#ra-assist-list [data-assist]',d=>d.map(x=>x.dataset.assist)),['g_ioport','BSP','g_external_irq1','g_i2c_slave0']);
  assert.ok(await win.$$eval('#ra-assist-list [data-assist="g_i2c_slave0"] [data-assist-item]',b=>b.some(x=>/R_IIC_SLAVE_Read\(&g_i2c_slave0_ctrl/.test(x.title))));
  await win.click('#build-files > summary');
  assert.ok(await win.$$eval('#build-file-list [data-build-file]',b=>['ra/fsp/src/r_iic_slave/r_iic_slave.c','ra/fsp/inc/api/r_i2c_slave_api.h','ra_cfg/fsp_cfg/r_iic_slave_cfg.h'].every(f=>b.some(x=>x.dataset.buildFile===f))));
  assert.ok(!await win.$$eval('#build-file-list [data-build-file]',b=>b.some(x=>x.dataset.buildFile==='ra/fsp/src/r_iic_master/r_iic_master.c')),'IIC0 is not a master');
  for(const f of ['ra_cfg','ra_cfg/fsp_cfg'])await win.click(`#build-file-list [data-tree-folder="${f}"] > summary`);
  await win.click('#build-file-list [data-build-file="ra_cfg/fsp_cfg/r_iic_slave_cfg.h"]');
  await win.waitForFunction(()=>/IIC_SLAVE_CFG_DTC_ENABLE.\(0\)/.test(document.querySelector('#group-code .monaco-editor .view-lines')?.textContent||''),null,{timeout:15000});
  assert.deepEqual(s.errors,[]);
 }finally{await s.close();}
});

test('FPB-RA6E1 I2C slave example on the RA6E1 emulator: the ESP32 master writes the LED byte and reads the counter from r_iic_slave',{skip:!toolchain&&!process.env.CI_REQUIRE_TOOLCHAIN&&'ARM GCC / Renesas FSP (r_iic_slave) not installed',timeout:240000},async()=>{
 const s=await launch({simEngine:'gcc'});
 await fs.writeFile(path.join(s.profile,'native-tools.json'),JSON.stringify({armGcc:gcc,fsp,armGdb:'',cube:'',cubeF1:'',hostGcc:'',hostGdb:'',clangd:'',openocd:'',buildRoot:''}));
 try{
  const {win}=s;
  await win.click('[data-activity="board"]');if(!await win.locator('#board-open').isVisible())await win.click('[data-activity="board"]');
  await win.click('#board-open');await win.click('[data-board-id="fpb-ra6e1"]');
  if(await win.locator('#board-change-dialog').isVisible())await win.click('#board-change-confirm');
  await win.waitForFunction(()=>document.querySelector('#surface > .board')?.dataset.board==='fpb-ra6e1');
  await win.click('[data-activity="examples"]');if(!await win.locator('#view-examples').isVisible())await win.click('[data-activity="examples"]');
  await win.fill('#hal-example-search','I²C 슬레이브');await win.locator('#hal-example-list [data-example]').first().click();
  await win.waitForFunction(()=>/R_IIC_SLAVE_Open\(&g_i2c_slave0_ctrl/.test(document.getElementById('code').value));
  await win.waitForSelector('#devboard-layer [data-part="esp1"]');
  await win.keyboard.press('Control+F5');
  await win.waitForFunction(()=>/시뮬레이터\(ARM GCC 빌드\)를 시작했습니다/.test(document.getElementById('console-output').textContent),null,{timeout:180000})
   .catch(async error=>{throw new Error(`${error.message}\n출력: ${(await output(win)).slice(-1500)}\n빌드: ${(await win.textContent('#build-errors').catch(()=>'')).slice(-800)}`);});
  await win.waitForFunction(()=>/\[ESP32-1\] RA count=1 led=0 error=0/.test(document.getElementById('console-output').textContent),null,{timeout:60000})
   .catch(async error=>{throw new Error(`${error.message}\n출력: ${(await output(win)).slice(-1500)}`);});
  assert.match(await output(win),/\[ESP32-1\] RA count=0 led=1 error=0/);assert.doesNotMatch(await output(win),/RA no answer/);
  await win.keyboard.press('Control+F2');
  await win.waitForFunction(()=>document.getElementById('shell').dataset.running==='false');
  assert.deepEqual(s.errors,[]);
 }finally{await s.close();}
});

test('FPB-RA6E1 I2C slave example on the built-in interpreter: the ESP32 master reaches R_IIC_SLAVE_Read / Write through the callback',{timeout:150000},async()=>{
 const s=await launch();
 try{
  const {win}=s;
  await win.evaluate(()=>document.getElementById('new').click());if(await win.evaluate(()=>document.getElementById('replace-dialog').open))await win.click('#replace-confirm');
  await win.waitForSelector('#project-dialog[open]');await win.selectOption('#new-project-board','fpb-ra6e1');await win.selectOption('#new-project-template','ra_iic_slave');
  await win.click('#project-create');await win.waitForFunction(()=>!document.getElementById('project-dialog').open);
  await win.waitForFunction(()=>/R_IIC_SLAVE_Open\(&g_i2c_slave0_ctrl/.test(document.getElementById('code').value));
  await win.waitForSelector('#devboard-layer [data-part="esp1"]');
  assert.equal(await win.evaluate(()=>document.getElementById('sim-engine').value),'interpreter');
  await win.keyboard.press('Control+F5');
  await win.waitForFunction(()=>/FSP 프로그램\(hal_entry\.c\)을 내장 해석기로 시작했습니다/.test(document.getElementById('console-output').textContent),null,{timeout:30000})
   .catch(async error=>{throw new Error(`${error.message}\n출력: ${(await output(win)).slice(-1500)}`);});
  assert.doesNotMatch(await output(win),/ARM GCC로 펌웨어를 빌드합니다/);
  await win.waitForFunction(()=>/\[ESP32-1\] RA count=1 led=0 error=0/.test(document.getElementById('console-output').textContent),null,{timeout:30000})
   .catch(async error=>{throw new Error(`${error.message}\n출력: ${(await output(win)).slice(-1500)}`);});
  assert.match(await output(win),/\[ESP32-1\] RA count=0 led=1 error=0/);
  await win.keyboard.press('Control+F2');
  await win.waitForFunction(()=>document.getElementById('shell').dataset.running==='false');
  assert.deepEqual(s.errors,[]);
 }finally{await s.close();}
});
