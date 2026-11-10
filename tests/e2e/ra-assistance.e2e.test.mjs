// Feature 21: Developer Assistance — an FSP project lists the API calls of its stacks in the explorer; a click puts
// the call into the source being edited. An STM32 project does not show the section.
import test from 'node:test';
import assert from 'node:assert/strict';
import {launch} from './harness.mjs';

test('Developer Assistance lists the stacks of an FSP project and a click inserts the call into hal_entry.c',{timeout:150000},async()=>{
 const s=await launch();
 try{
  const {win}=s;
  await win.click('[data-activity="explorer"]');if(!await win.locator('#build-files > summary').isVisible())await win.click('[data-activity="explorer"]');
  // The STM32 start project: no Developer Assistance.
  assert.equal(await win.$eval('#ra-assist',d=>d.hidden),true);
  await win.evaluate(()=>document.getElementById('new').click());if(await win.evaluate(()=>document.getElementById('replace-dialog').open))await win.click('#replace-confirm');
  await win.waitForSelector('#project-dialog[open]');await win.selectOption('#new-project-board','fpb-ra6e1');await win.selectOption('#new-project-template','ra_button_irq_rising');
  await win.click('#project-create');await win.waitForFunction(()=>!document.getElementById('project-dialog').open);
  await win.click('[data-activity="explorer"]');if(!await win.locator('#ra-assist > summary').isVisible())await win.click('[data-activity="explorer"]');
  assert.equal(await win.$eval('#ra-assist',d=>d.hidden),false);
  await win.click('#ra-assist > summary');
  const groups=await win.$$eval('#ra-assist-list [data-assist]',d=>d.map(x=>x.dataset.assist));
  assert.deepEqual(groups,['g_ioport','BSP','g_external_irq1']);
  // g_ioport is open; its items are the calls.
  const labels=await win.$$eval('#ra-assist-list [data-assist="g_ioport"] [data-assist-item]',b=>b.map(x=>x.querySelector('.file-label').textContent));
  assert.deepEqual(labels,['Call R_IOPORT_PinWrite()','Call R_IOPORT_PinRead()','Call R_IOPORT_PinCfg()','Call R_IOPORT_Open()']);
  assert.equal(await win.$eval('#ra-assist-list [data-assist="g_ioport"] [data-assist-item]',b=>b.draggable),true);
  const before=await win.$eval('#code',c=>c.value);assert.ok(!/R_IOPORT_PinCfg/.test(before));
  await win.click('#ra-assist-list [data-assist="g_ioport"] [data-assist-item="0:2"]');
  await win.waitForFunction(()=>/R_IOPORT_PinCfg\(&g_ioport_ctrl, \w+, IOPORT_CFG_PORT_DIRECTION_OUTPUT\);/.test(document.getElementById('code').value));
  // The callback definition of the IRQ stack carries the project's callback name.
  await win.click('#ra-assist-list [data-assist="g_external_irq1"] > summary');
  assert.match(await win.$eval('#ra-assist-list [data-assist="g_external_irq1"] [data-assist-item]:last-child',b=>b.title),/^void irq_callback\(external_irq_callback_args_t \*p_args\)/);
  // With a read-only file open nothing is inserted.
  await win.click('#build-files > summary');await win.click('#build-file-list [data-build-file="ra_gen/main.c"]');
  await win.waitForFunction(()=>/hal_entry\(\)/.test(document.querySelector('#group-code .monaco-editor .view-lines')?.textContent||''));
  const mid=await win.$eval('#code',c=>c.value);
  await win.click('#ra-assist-list [data-assist="BSP"] > summary');await win.click('#ra-assist-list [data-assist="BSP"] [data-assist-item]');
  assert.equal(await win.$eval('#code',c=>c.value),mid);
  assert.deepEqual(s.errors,[]);
 }finally{await s.close();}
});
