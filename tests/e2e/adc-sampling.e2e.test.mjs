// Pinout ADC1 Sampling Time on the potentiometer example: the longest time is selected as before, choosing another one
// updates the conversion time shown under it, and "설정으로 HAL 코드 생성" writes it into sConfig.SamplingTime.
import test from 'node:test';
import assert from 'node:assert/strict';
import {launch} from './harness.mjs';

test('Pinout ADC1 Sampling Time: default kept, conversion time shown, generated into main.c',{timeout:120000},async()=>{
 const s=await launch();
 try{
  const {win}=s;
  await win.click('[data-activity="examples"]');if(!await win.locator('#view-examples').isVisible())await win.click('[data-activity="examples"]');
  await win.selectOption('#hal-example','potentiometer');
  await win.waitForFunction(()=>document.querySelector('#part-layer [data-part="demo"]'));
  await win.click('[data-activity="board"]');if(!await win.locator('#pinout-open').isVisible())await win.click('[data-activity="board"]');
  await win.click('#pinout-open');await win.waitForSelector('#pinout-dialog[open]');
  const f103=/STM32F103RB/.test(await win.textContent('#pinout-dialog')),[longest,short,macro]=f103?['239.5','7.5','ADC_SAMPLETIME_7CYCLES_5']:['480','15','ADC_SAMPLETIME_15CYCLES'];
  assert.equal(await win.inputValue('[data-adc-sampling]'),longest,'the time the app always generated');
  const before=await win.textContent('#pinout-peripherals');assert.match(before,/한 번 변환 [\d.]+ µs \(ADC 클록/);
  await win.selectOption('[data-adc-sampling]',short);
  await win.waitForFunction(b=>document.getElementById('pinout-peripherals').textContent!==b,before);
  const us=t=>Number(/한 번 변환 ([\d.]+) µs/.exec(t)[1]);assert.ok(us(await win.textContent('#pinout-peripherals'))<us(before),'a shorter time converts faster');
  await win.evaluate(()=>document.getElementById('hal-generate').click());
  if(await win.evaluate(()=>document.getElementById('hal-replace-dialog').open))await win.click('#hal-replace-confirm');
  await win.waitForFunction(m=>document.getElementById('code').value.includes(`sConfig.SamplingTime = ${m};`),macro,{timeout:10000});
  assert.deepEqual(s.errors,[]);
 }finally{await s.close();}
});
