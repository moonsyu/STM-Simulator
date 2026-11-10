// Pinout TIM1 card (NUCLEO-F103RB, the start board): the advanced timer has a Repetition Counter, PWM mode adds Dead
// Time, and its NVIC lines are the separate update and capture/compare vectors. No TIM8 on this board.
import test from 'node:test';
import assert from 'node:assert/strict';
import {launch} from './harness.mjs';

test('Pinout TIM1: Repetition Counter, Dead Time in PWM mode, TIM1_UP / TIM1_CC lines',{timeout:120000},async()=>{
 const s=await launch();
 try{
  const {win}=s;
  await win.evaluate(()=>document.getElementById('pinout-open').click());await win.waitForSelector('#pinout-dialog[open]');
  assert.equal(await win.locator('[data-peripheral="TIM8"]').count(),0,'no TIM8 on the F103RB');
  await win.check('[data-peripheral="TIM1"]');await win.waitForSelector('[data-peripheral-value="TIM1"][data-key="repetition"]');
  assert.equal(await win.locator('[data-peripheral-value="TIM1"][data-key="deadTime"]').count(),0,'Dead Time only with outputs');
  assert.equal(await win.locator('[data-peripheral-value="TIM2"][data-key="repetition"]').count(),0,'TIM2 has no repetition counter');
  await win.selectOption('[data-timer-mode="TIM1"]','pwm');await win.waitForSelector('[data-peripheral-value="TIM1"][data-key="deadTime"]');
  await win.fill('[data-peripheral-value="TIM1"][data-key="repetition"]','300');await win.dispatchEvent('[data-peripheral-value="TIM1"][data-key="repetition"]','change');
  await win.evaluate(()=>document.getElementById('hal-generate').click());
  await win.waitForFunction(()=>/TIM1 Repetition Counter: 0~255 범위의 정수를 입력하세요/.test(document.getElementById('pinout-errors').textContent),null,{timeout:10000});
  const nvic=await win.evaluate(()=>[...document.querySelectorAll('#pinout-dialog [data-irq]')].map(e=>e.dataset.irq));
  for(const irq of ['TIM1_UP_IRQn','TIM1_CC_IRQn'])assert.ok(nvic.includes(irq),irq+' in '+nvic.join(','));
  assert.deepEqual(s.errors,[]);
 }finally{await s.close();}
});
