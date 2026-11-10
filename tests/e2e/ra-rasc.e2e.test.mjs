// Feature 22: the RA configuration dialog with the names and flow of the RA Smart Configurator — tabs Summary · BSP ·
// Clocks · Pins · Stacks, pin modes "Input mode" / "Output mode" / IRQ1-DS, the IRQ set as an External IRQ stack with
// its Properties (Channel, Pin, Trigger, Callback, priority, pull-up), and the BSP stack and heap sizes.
import test from 'node:test';
import assert from 'node:assert/strict';
import {launch} from './harness.mjs';

test('RA configuration follows RASC: five tabs, IRQ1-DS pin name, External IRQ as a stack with Properties, BSP sizes into bsp_cfg.h',{timeout:150000},async()=>{
 const s=await launch();
 try{
  const {win}=s;
  await win.evaluate(()=>document.getElementById('new').click());if(await win.evaluate(()=>document.getElementById('replace-dialog').open))await win.click('#replace-confirm');
  await win.waitForSelector('#project-dialog[open]');await win.selectOption('#new-project-board','fpb-ra6e1');await win.selectOption('#new-project-template','ra-minimal');
  await win.click('#project-create');await win.waitForFunction(()=>!document.getElementById('project-dialog').open);
  await win.click('[data-activity="board"]');if(!await win.locator('#pinout-open').isVisible())await win.click('[data-activity="board"]');
  await win.click('#pinout-open');await win.waitForSelector('#ra-pinout-dialog[open]');
  assert.deepEqual(await win.$$eval('#ra-pinout-dialog [data-ra-tab]',b=>b.map(x=>x.textContent)),['Summary','BSP','Clocks','Pins','Stacks']);
  // Pins: RASC's mode names; S1 is IRQ1-DS and its pull-up is not chosen here.
  await win.click('[data-ra-pin="P205"]');
  const modes=await win.$$eval('[data-ra="function"] option',o=>o.map(x=>x.textContent));
  assert.deepEqual(modes.slice(0,3),['Disabled','Output mode','Input mode']);assert.ok(modes.some(m=>/^IRQ1-DS/.test(m)),modes.join('|'));assert.ok(modes.includes('Analog mode'));
  assert.match(await win.$eval('[data-ra="function"]',e=>e.selectedOptions[0].textContent),/^IRQ1-DS/);
  assert.equal(await win.locator('#ra-pin-props [data-ra="pull"]').count(),0);assert.equal(await win.locator('#ra-pin-props [data-ra="edge"]').count(),0);
  assert.match(await win.textContent('#ra-pin-props'),/Stacks 탭의 g_external_irq1 Properties/);
  // An input pin does choose it, with RASC's wording.
  await win.click('[data-ra-pin="P104"]');await win.selectOption('[data-ra="function"]','GPIO_Input');
  assert.deepEqual(await win.$$eval('[data-ra="pull"] option',o=>o.map(x=>x.textContent)),['None','input pull-up']);
  await win.selectOption('[data-ra="function"]','');
  // To the stack's Properties.
  await win.click('[data-ra-pin="P205"]');await win.click('[data-ra-to-stacks]');
  const card='#ra-stacks [data-ra-irq="P205"]';await win.waitForSelector(card);
  assert.equal(await win.inputValue(`${card} input[readonly]`),'g_external_irq1');
  assert.equal(await win.inputValue(`${card} [data-ra-irq-field="channel"]`),'1');
  assert.deepEqual(await win.$$eval(`${card} [data-ra-irq-field="pin"] option`,o=>o.map(x=>x.textContent)),['P101 (IRQ1)','P104 (IRQ1)','P205 (IRQ1-DS)']);
  await win.selectOption(`${card} [data-ra-irq-field="edge"]`,'RISING');
  await win.fill(`${card} [data-ra-irq-field="callback"]`,'irq_callback');await win.locator(`${card} [data-ra-irq-field="callback"]`).dispatchEvent('change');
  await win.selectOption(`${card} [data-ra-irq-field="pull"]`,'NONE');
  assert.equal(await win.inputValue(`${card} [data-ra-irq-field="edge"]`),'RISING');assert.equal(await win.inputValue(`${card} [data-ra-irq-field="callback"]`),'irq_callback');
  // Remove it and add it again as New Stack → Input → External IRQ.
  await win.click('[data-ra-irq-remove="P205"]');assert.equal(await win.locator('#ra-stacks [data-ra-irq]').count(),0);
  assert.equal(await win.$eval('#ra-stack-add optgroup',g=>g.label),'Input');
  await win.selectOption('#ra-stack-add','IRQ');await win.click('[data-ra-add]');await win.waitForSelector(card);
  assert.equal(await win.inputValue(`${card} [data-ra-irq-field="callback"]`),'external_irq1_callback');
  // Channel 6: the stack moves to a pin of that channel and is renamed; the pin can be chosen.
  await win.selectOption(`${card} [data-ra-irq-field="channel"]`,'6');
  await win.waitForSelector('#ra-stacks [data-ra-irq="P000"]');
  assert.equal(await win.inputValue('#ra-stacks [data-ra-irq="P000"] input[readonly]'),'g_external_irq6');
  assert.equal(await win.inputValue('#ra-stacks [data-ra-irq="P000"] [data-ra-irq-field="callback"]'),'external_irq6_callback');
  await win.selectOption('#ra-stacks [data-ra-irq="P000"] [data-ra-irq-field="pin"]','P409');await win.waitForSelector('#ra-stacks [data-ra-irq="P409"]');
  // IRQ6-DS on P000 is the same channel as IRQ6 on P409.
  await win.click('[data-ra-tab="pins"]');await win.click('[data-ra-pin="P000"]');await win.selectOption('[data-ra="function"]','IRQ');
  assert.match(await win.textContent('#ra-pinout-error'),/IRQ6는 이미 P409\(IRQ6\)에서 씁니다\. IRQ6-DS와 같은 채널/);
  await win.selectOption('[data-ra="function"]','');assert.equal(await win.textContent('#ra-pinout-error'),'');
  // BSP: sizes are checked.
  await win.click('[data-ra-tab="bsp"]');
  assert.equal(await win.inputValue('[data-ra-bsp="stackBytes"]'),'0x400');
  await win.fill('[data-ra-bsp="stackBytes"]','0x801');await win.locator('[data-ra-bsp="stackBytes"]').dispatchEvent('change');
  assert.match(await win.textContent('#ra-pinout-error'),/8의 배수/);
  await win.fill('[data-ra-bsp="stackBytes"]','0x800');await win.locator('[data-ra-bsp="stackBytes"]').dispatchEvent('change');
  assert.equal(await win.textContent('#ra-pinout-error'),'');
  // Summary names the device and the stacks.
  await win.click('[data-ra-tab="summary"]');
  const summary=await win.textContent('#ra-summary');assert.match(summary,/R7FA6E10F2CFP/);assert.match(summary,/g_ioport \(r_ioport\), g_external_irq6 \(r_icu\)/);
  await win.click('#ra-pinout-apply');await win.waitForFunction(()=>!document.getElementById('ra-pinout-dialog').open);
  // The generated bsp_cfg.h has the stack size.
  await win.click('[data-activity="explorer"]');if(!await win.locator('#build-files > summary').isVisible())await win.click('[data-activity="explorer"]');
  // Developer Assistance follows the applied stacks: channel 6 now, channel 1 gone.
  assert.deepEqual(await win.$$eval('#ra-assist-list [data-assist]',d=>d.map(x=>x.dataset.assist)),['g_ioport','BSP','g_external_irq6']);
  await win.click('#build-files > summary');
  for(const f of ['ra_cfg','ra_cfg/fsp_cfg','ra_cfg/fsp_cfg/bsp'])await win.click(`#build-file-list [data-tree-folder="${f}"] > summary`);
  await win.click('#build-file-list [data-build-file="ra_cfg/fsp_cfg/bsp/bsp_cfg.h"]');
  await win.waitForFunction(()=>/BSP_CFG_STACK_MAIN_BYTES.\(0x800\)/.test(document.querySelector('#group-code .monaco-editor .view-lines')?.textContent||''),null,{timeout:15000});
  assert.deepEqual(s.errors,[]);
 }finally{await s.close();}
});
