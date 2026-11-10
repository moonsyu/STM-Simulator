// Pinout ADC1 card (NUCLEO-F103RB, the start board): Number Of Conversion shows a channel select per rank, the external
// trigger explains what TIM3 needs, timers have One Pulse Mode and a TRGO choice, and the generated code follows.
import test from 'node:test';
import assert from 'node:assert/strict';
import {launch} from './harness.mjs';

test('Pinout ADC1 ranks and external trigger, TIM3 TRGO and One Pulse Mode reach main.c',{timeout:150000},async()=>{
 const s=await launch();
 try{
  const {win}=s,code=()=>win.evaluate(()=>document.getElementById('code').value);
  await win.evaluate(()=>document.getElementById('pinout-open').click());await win.waitForSelector('#pinout-dialog[open]');
  // Two analog pins through the pin panel's function select.
  for(const pin of ['PA0','PA1']){await win.click('#pinout-pins [data-config-pin="'+pin+'"]');await win.click('#pin-menu [data-pin-signal="ADC1_IN'+pin.slice(2)+'"]');await win.waitForFunction(p=>/ADC1_IN/.test(document.querySelector('#pinout-pins [data-config-pin="'+p+'"]').textContent),pin);}
  if(!await win.isChecked('[data-peripheral="ADC1"]'))await win.check('[data-peripheral="ADC1"]');
  await win.selectOption('[data-adc-group="conversions"]','2');await win.waitForSelector('[data-adc-rank="1"]');
  await win.selectOption('[data-adc-rank="0"]','1');await win.waitForFunction(()=>document.querySelector('[data-adc-rank="0"]')?.value==='1');
  await win.selectOption('[data-adc-group="trigger"]','T3_TRGO');
  await win.waitForFunction(()=>/ADC1 External Trigger T3_TRGO: TIM3를 켜고/.test(document.getElementById('pinout-errors').textContent));
  await win.check('[data-peripheral="TIM3"]');await win.waitForSelector('[data-timer-trgo="TIM3"]');
  await win.selectOption('[data-timer-trgo="TIM3"]','UPDATE');await win.waitForFunction(()=>!/External Trigger/.test(document.getElementById('pinout-errors').textContent));
  await win.selectOption('[data-timer-opm="TIM3"]','1');await win.waitForFunction(()=>document.querySelector('[data-timer-opm="TIM3"]')?.value==='1');
  await win.evaluate(()=>document.getElementById('hal-generate').click());
  if(await win.evaluate(()=>document.getElementById('hal-replace-dialog').open))await win.click('#hal-replace-confirm');
  await win.waitForFunction(()=>/NbrOfConversion = 2;[\s\S]*ADC_CHANNEL_1;\n\s*sConfig\.Rank = ADC_REGULAR_RANK_1;[\s\S]*ADC_CHANNEL_1;\n\s*sConfig\.Rank = ADC_REGULAR_RANK_2;/.test(document.getElementById('code').value),null,{timeout:10000})
   .catch(async e=>{throw new Error(e.message+'\n'+await win.textContent('#pinout-errors')+'\n'+(await code()).split('\n').filter(l=>/ADC|Rank|TRGO|OnePulse/.test(l)).join('\n'));});
  const c=await code();
  for(const k of ['ExternalTrigConv = ADC_EXTERNALTRIGCONV_T3_TRGO;','ScanConvMode = ADC_SCAN_ENABLE;','sMasterConfig.MasterOutputTrigger = TIM_TRGO_UPDATE;','HAL_TIM_OnePulse_Init(&htim3, TIM_OPMODE_SINGLE)'])assert.ok(c.includes(k),k);
  assert.deepEqual(s.errors,[]);
 }finally{await s.close();}
});
