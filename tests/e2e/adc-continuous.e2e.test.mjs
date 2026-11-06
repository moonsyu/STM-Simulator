// ADC1 Continuous Conversion Mode, as reported: HAL_ADC_Start once, HAL_ADC_GetValue in the loop. With the mode on in
// Pinout & Configuration, moving the potentiometer's wiper in the property panel while running changes the value.
import test from 'node:test';
import assert from 'node:assert/strict';
import {launch} from './harness.mjs';

test('Pinout ADC1 Continuous Conversion Mode: one HAL_ADC_Start, the printed value follows the wiper while running',{timeout:150000},async()=>{
 const s=await launch();
 try{
  const {win}=s;
  // The basic potentiometer example (1→GND, 2→PA0 ADC1_IN0, 3→3V3), chosen by its id.
  await win.click('[data-activity="examples"]');if(!await win.locator('#view-examples').isVisible())await win.click('[data-activity="examples"]');
  await win.selectOption('#hal-example','potentiometer');
  await win.waitForFunction(()=>document.querySelector('#part-layer [data-part="demo"]'));
  await win.click('[data-activity="board"]');if(!await win.locator('#pinout-open').isVisible())await win.click('[data-activity="board"]');
  await win.click('#pinout-open');await win.waitForSelector('#pinout-dialog[open]');
  assert.equal(await win.inputValue('[data-adc-continuous]'),'0','CubeMX default: Disabled');
  await win.selectOption('[data-adc-continuous]','1');
  assert.match(await win.textContent('#pinout-peripherals'),/HAL_ADC_Start 한 번 뒤 계속 변환/);
  await win.click('#pinout-apply');await win.waitForFunction(()=>!document.getElementById('pinout-dialog').open);
  await win.evaluate(()=>{const c=document.getElementById('code');let v=c.value;
   v=v.replace(/(\/\* USER CODE BEGIN 2 \*\/)/,'$1\n  HAL_ADC_Start(&hadc1);').replace(/(\/\* USER CODE BEGIN 3 \*\/)[\s\S]*?(\/\* USER CODE END 3 \*\/)/,'$1\n    uint32_t adc_val = HAL_ADC_GetValue(&hadc1);\n    printf("value: %lu\\r\\n", adc_val);\n    HAL_Delay(100);\n    $2').replace('hadc1.Init.ContinuousConvMode = DISABLE;','hadc1.Init.ContinuousConvMode = ENABLE;');
   c.value=v;c.dispatchEvent(new Event('input',{bubbles:true}));});
  assert.match(await win.evaluate(()=>document.getElementById('code').value),/ContinuousConvMode = ENABLE/);
  await win.keyboard.press('Control+F5');
  await win.waitForFunction(()=>/value: 204[78]/.test(document.getElementById('console-output').textContent),null,{timeout:30000});
  // Select the potentiometer and move its wiper from the property panel while the program runs.
  // The example's potentiometer is the part "demo" (ref_pot_bare_3).
  await win.locator('#part-layer [data-part="demo"]').first().click({force:true});
  await win.waitForSelector('#extra-position');
  await win.evaluate(()=>{const el=document.getElementById('extra-position');el.value='90';el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));});
  await win.waitForFunction(()=>/value: 36[89]\d/.test(document.getElementById('console-output').textContent),null,{timeout:30000});
  await win.keyboard.press('Control+F2');
  assert.deepEqual(s.errors,[]);
 }finally{await s.close();}
});
