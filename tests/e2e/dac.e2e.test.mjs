// Pinout DAC card (NUCLEO-F446RE): ticking OUT1 puts PA4 in DAC_OUT1 (analog), OUT2 gets a TIM7 TRGO trigger with the
// triangle wave; "설정으로 HAL 코드 생성" writes MX_DAC_Init (ConfigChannel, TriangleWaveGenerate) and the run outputs the
// value written with HAL_DAC_SetValue.
import test from 'node:test';
import assert from 'node:assert/strict';
import {launch} from './harness.mjs';

test('Pinout DAC: OUT1 / OUT2 channels, trigger and triangle wave in main.c; the run outputs HAL_DAC_SetValue',{timeout:150000},async()=>{
 const s=await launch();
 try{
  const {win}=s,code=()=>win.evaluate(()=>document.getElementById('code').value);
  await win.evaluate(()=>document.getElementById('board-open').click());await win.click('#board-results [data-board-id="nucleo-f446re"]');
  if(await win.locator('#board-change-dialog').isVisible())await win.click('#board-change-confirm');
  await win.waitForFunction(()=>/F446RE/.test(document.getElementById('current-board-name').textContent));
  await win.evaluate(()=>document.getElementById('pinout-open').click());await win.waitForSelector('#pinout-dialog[open]');
  await win.check('[data-peripheral="DAC"]');await win.waitForSelector('[data-dac-pin="OUT1"]');
  await win.check('[data-dac-pin="OUT1"]');await win.waitForSelector('[data-dac="OUT1"][data-key="trigger"]');
  await win.check('[data-dac-pin="OUT2"]');await win.waitForSelector('[data-dac="OUT2"][data-key="trigger"]');
  assert.equal(await win.locator('[data-dac="OUT2"][data-key="wave"]').isDisabled(),true,'no wave without a trigger');
  await win.selectOption('[data-dac="OUT2"][data-key="trigger"]','T7_TRGO');await win.waitForSelector('[data-dac="OUT2"][data-key="wave"]:not([disabled])');
  await win.selectOption('[data-dac="OUT2"][data-key="wave"]','TRIANGLE');await win.waitForSelector('[data-dac="OUT2"][data-key="amplitude"]');
  await win.selectOption('[data-dac="OUT2"][data-key="amplitude"]','11');
  const card='#pinout-peripherals section.peripheral-card:has([data-peripheral="DAC"])';
  assert.match(await win.textContent(card),/TIM7의 Trigger Event Selection을 Update Event로/);
  await win.evaluate(()=>document.getElementById('hal-generate').click());
  if(await win.evaluate(()=>document.getElementById('hal-replace-dialog').open))await win.click('#hal-replace-confirm');
  await win.waitForFunction(()=>/hdac\.Instance = DAC;[\s\S]*sConfig\.DAC_Trigger = DAC_TRIGGER_NONE;[\s\S]*DAC_CHANNEL_1\)[\s\S]*sConfig\.DAC_Trigger = DAC_TRIGGER_T7_TRGO;[\s\S]*HAL_DACEx_TriangleWaveGenerate\(&hdac, DAC_CHANNEL_2, DAC_TRIANGLEAMPLITUDE_4095\)/.test(document.getElementById('code').value),null,{timeout:10000})
   .catch(async e=>{throw new Error(e.message+'\n'+(await code()).split('\n').filter(l=>/dac|DAC/.test(l)).join('\n'));});
  assert.match(await code(),/GPIO_InitStruct\.Pin = GPIO_PIN_4;\n\s*GPIO_InitStruct\.Mode = GPIO_MODE_ANALOG;/);
  // The project's own USER CODE 2 section stays on regeneration: start OUT1, write a value and print it back.
  await win.evaluate(()=>{const c=document.getElementById('code');c.value=c.value.replace(/\/\* USER CODE BEGIN 2 \*\/\n/,m=>m+'    HAL_DAC_Start(&hdac, DAC_CHANNEL_1);\n    HAL_DAC_SetValue(&hdac, DAC_CHANNEL_1, DAC_ALIGN_12B_R, 3000);\n    printf("DAC1=%lu\\n", HAL_DAC_GetValue(&hdac, DAC_CHANNEL_1));\n');c.dispatchEvent(new Event('input',{bubbles:true}));});
  await win.keyboard.press('Control+F5');
  await win.waitForFunction(()=>/DAC1=3000/.test(document.getElementById('console-output').textContent),null,{timeout:25000})
   .catch(async e=>{throw new Error(e.message+'\n'+await win.textContent('#console-output'));});
  await win.click('#run');
  assert.deepEqual(s.errors,[]);
 }finally{await s.close();}
});
