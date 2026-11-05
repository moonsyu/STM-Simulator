// CubeMX-style Pinout: the pin click menu, GPIO mode / speed fields, NVIC Settings in the pin and peripheral cards and
// the NVIC tab (priority group, preemption / sub priority, system rows).
import test from 'node:test';
import assert from 'node:assert/strict';
import {launch} from './harness.mjs';

test('pin click menu, GPIO speed / open drain, EXTI NVIC and the NVIC tab reach the generated main.c',{timeout:120000},async()=>{
 const s=await launch();
 try{
  const {win}=s,code=()=>win.evaluate(()=>document.getElementById('code').value);
  await win.evaluate(()=>document.getElementById('pinout-open').click());await win.waitForSelector('#pinout-dialog[open]');
  // Clicking a pin opens its signal list (CubeMX names); Esc closes the menu, not the dialog.
  await win.click('[data-config-pin="PA5"]');await win.waitForSelector('#pin-menu:not([hidden])');
  const signals=await win.$$eval('#pin-menu [data-pin-signal]',b=>b.map(x=>x.textContent));
  for(const name of ['Reset_State','GPIO_Input','GPIO_Output','GPIO_Analog','GPIO_EXTI5'])assert.ok(signals.includes(name),name);
  await win.keyboard.press('Escape');assert.equal(await win.evaluate(()=>document.getElementById('pin-menu').hidden),true);assert.equal(await win.evaluate(()=>document.getElementById('pinout-dialog').open),true);
  await win.click('[data-config-pin="PA5"]');await win.click('#pin-menu [data-pin-signal="GPIO_Output"]');
  assert.match(await win.textContent('[data-config-pin="PA5"]'),/GPIO_Output/);
  assert.equal(await win.inputValue('#pin-speed'),'LOW','CubeMX default for an output');
  await win.selectOption('#pin-otype','OD');await win.selectOption('#pin-speed','MEDIUM');
  // EXTI: CubeMX's rising edge, and the line's NVIC switch right in the pin card.
  await win.click('[data-config-pin="PC13"]');await win.click('#pin-menu [data-pin-signal="GPIO_EXTI"]');
  assert.equal(await win.inputValue('#pin-edge'),'RISING');
  await win.locator('#pinout-properties [data-card-irq="EXTI15_10_IRQn"]').check();
  // NVIC tab: system rows, the enabled line, priority group 2 with preemption 1 / sub 1.
  await win.click('#pinout-tab-nvic');
  assert.match(await win.textContent('#pinout-nvic'),/Time base: System tick timer/);assert.match(await win.textContent('#pinout-nvic-count'),/1/);
  assert.equal(await win.locator('#pinout-nvic [data-irq="EXTI15_10_IRQn"]').isChecked(),true);
  await win.selectOption('#nvic-group','2');
  assert.equal(await win.inputValue('#nvic-tick'),'3','the time base 15 is brought into group 2 range (0~3)');
  await win.fill('#pinout-nvic [data-priority="EXTI15_10_IRQn"]','1');await win.press('#pinout-nvic [data-priority="EXTI15_10_IRQn"]','Tab');
  await win.fill('#pinout-nvic [data-sub="EXTI15_10_IRQn"]','1');await win.press('#pinout-nvic [data-sub="EXTI15_10_IRQn"]','Tab');
  await win.evaluate(()=>document.getElementById('hal-generate').click());
  if(await win.evaluate(()=>document.getElementById('hal-replace-dialog').open))await win.click('#hal-replace-confirm');
  await win.waitForFunction(()=>!document.getElementById('pinout-dialog').open,null,{timeout:10000}).catch(async()=>{throw new Error('Pinout did not close: '+await win.textContent('#pinout-errors'));});
  const c=await code();
  assert.match(c,/GPIO_MODE_OUTPUT_OD/);assert.match(c,/GPIO_SPEED_FREQ_MEDIUM/);assert.match(c,/GPIO_MODE_IT_RISING/);
  assert.match(c,/HAL_NVIC_SetPriorityGrouping\(NVIC_PRIORITYGROUP_2\);\s*HAL_InitTick\(3\);/);assert.match(c,/HAL_NVIC_SetPriority\(EXTI15_10_IRQn, 1, 1\);/);assert.match(c,/void EXTI15_10_IRQHandler\(void\)/);
  assert.deepEqual(s.errors,[]);
 }finally{await s.close();}
});
