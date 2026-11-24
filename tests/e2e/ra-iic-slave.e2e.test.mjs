// Feature 33: the I2C slave on the FPB-RA6E1 — New Stack → Connectivity → I2C Slave (r_iic_slave), the Pins card with
// the Master / Slave mode, Summary, Developer Assistance and the generated files.
import test from 'node:test';
import assert from 'node:assert/strict';
import {launch} from './harness.mjs';

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
