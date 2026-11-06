// Pinout TIM2 card on the PWM example: Output Compare mode with Counter Mode Center Aligned, CH1 Toggle on match shows
// what the pin does, "설정으로 HAL 코드 생성" writes HAL_TIM_OC_* and the counter mode, and going back to PWM drops
// the Output Compare channel mode.
import test from 'node:test';
import assert from 'node:assert/strict';
import {launch} from './harness.mjs';

test('Pinout TIM2 Output Compare + Counter Mode: channel note, generated main.c, back to PWM',{timeout:120000},async()=>{
 const s=await launch();
 try{
  const {win}=s,code=()=>win.evaluate(()=>document.getElementById('code').value);
  await win.click('[data-activity="examples"]');if(!await win.locator('#view-examples').isVisible())await win.click('[data-activity="examples"]');
  await win.selectOption('#hal-example','pwm');await win.waitForFunction(()=>/HAL_TIM_PWM_Init\(&htim2\)/.test(document.getElementById('code').value));
  await win.evaluate(()=>document.getElementById('pinout-open').click());await win.waitForSelector('#pinout-dialog[open]');
  const ch='#pinout-peripherals fieldset.tim-channel';
  await win.selectOption('[data-timer-mode="TIM2"]','oc');
  await win.waitForFunction(c=>/Output Compare CH1 · P[AB]\d+/.test(document.querySelector(c)?.textContent||''),ch);
  assert.equal(await win.inputValue('[data-tim-channel="TIM2"][data-ch="CH1"][data-key="ocMode"]'),'TIMING','CubeMX default: Frozen');
  assert.match(await win.textContent(ch),/핀 출력은 바뀌지 않습니다/);
  await win.selectOption('[data-tim-channel="TIM2"][data-ch="CH1"][data-key="ocMode"]','TOGGLE');
  await win.waitForFunction(c=>/핀 토글 →/.test(document.querySelector(c)?.textContent||''),ch);
  const up=await win.textContent(ch);
  await win.selectOption('[data-timer-counter="TIM2"]','CENTERALIGNED1');
  await win.waitForFunction(([c,u])=>document.querySelector(c)?.textContent!==u,[ch,up]);
  assert.equal(await win.inputValue('[data-timer-counter="TIM2"]'),'CENTERALIGNED1');
  await win.evaluate(()=>document.getElementById('hal-generate').click());
  if(await win.evaluate(()=>document.getElementById('hal-replace-dialog').open))await win.click('#hal-replace-confirm');
  await win.waitForFunction(()=>/htim2\.Init\.CounterMode = TIM_COUNTERMODE_CENTERALIGNED1;[\s\S]*HAL_TIM_OC_Init\(&htim2\);[\s\S]*channel\.OCMode = TIM_OCMODE_TOGGLE;[\s\S]*HAL_TIM_OC_ConfigChannel\(&htim2, &channel, TIM_CHANNEL_1\);/.test(document.getElementById('code').value),null,{timeout:10000})
   .catch(async e=>{throw new Error(e.message+'\n'+(await code()).split('\n').filter(l=>/htim2|channel\./.test(l)).join('\n'));});
  // Back to PWM: the Output Compare mode is not a PWM mode, so the channel returns to PWM mode 1.
  await win.evaluate(()=>document.getElementById('pinout-open').click());await win.waitForSelector('#pinout-dialog[open]');
  await win.selectOption('[data-timer-mode="TIM2"]','pwm');
  await win.waitForFunction(c=>/PWM Generation CH1/.test(document.querySelector(c)?.textContent||''),ch);
  assert.equal(await win.inputValue('[data-tim-channel="TIM2"][data-ch="CH1"][data-key="ocMode"]'),'PWM1');
  assert.equal(await win.textContent('#pinout-errors'),'');
  assert.deepEqual(s.errors,[]);
 }finally{await s.close();}
});
