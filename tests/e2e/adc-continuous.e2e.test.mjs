// ADC1 Continuous Conversion Mode, as reported: HAL_ADC_Start once, HAL_ADC_GetValue in the loop. With the mode on in
// Pinout & Configuration, moving the potentiometer's wiper in the property panel while running changes the value.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
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

// The ARM GCC simulator (the default engine). The example converts each loop (Start + PollForConversion), so the value
// follows the wiper with no hint; the reported code (Start once, GetValue only, single mode) keeps the value as the chip
// does, and the 출력 log says why once.
const local=path.join(process.env.LOCALAPPDATA||'','STM-Simulator-Tools');
const gcc=process.env.ARM_GCC||path.join(local,'xpack-arm-none-eabi-gcc-15.2.1-1.1/bin/arm-none-eabi-gcc'+(process.platform==='win32'?'.exe':''));
const cubeF1=process.env.STM32CUBE_F1_ROOT||path.join(local,'STM32CubeF1');
const exists=p=>fs.access(p).then(()=>true,()=>false);
const toolchain=await exists(gcc)&&await exists(path.join(cubeF1,'Drivers/STM32F1xx_HAL_Driver/Inc/stm32f1xx_hal.h'));
test('ARM GCC simulator: the potentiometer example follows the wiper; single mode read again gets one hint in the 출력 log',{skip:!toolchain&&!process.env.CI_REQUIRE_TOOLCHAIN&&'ARM GCC / STM32CubeF1 not installed',timeout:400000},async()=>{
 const s=await launch({simEngine:'gcc'});
 await fs.writeFile(path.join(s.profile,'native-tools.json'),JSON.stringify({armGcc:gcc,cube:path.join(local,'STM32CubeF4'),cubeF1,armGdb:'',hostGdb:'',hostGcc:'',clangd:'',openocd:'',buildRoot:''}));
 try{
  const {win}=s,out=()=>win.textContent('#console-output');
  const wiper=async value=>{await win.locator('#part-layer [data-part="demo"]').first().click({force:true});await win.waitForSelector('#extra-position');
   await win.evaluate(v=>{const el=document.getElementById('extra-position');el.value=v;el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));},String(value));};
  await win.click('[data-activity="examples"]');if(!await win.locator('#view-examples').isVisible())await win.click('[data-activity="examples"]');
  await win.selectOption('#hal-example','potentiometer');
  await win.waitForFunction(()=>document.querySelector('#part-layer [data-part="demo"]'));
  assert.equal(await win.evaluate(()=>document.getElementById('sim-engine').value),'gcc');
  await win.keyboard.press('Control+F5');
  await win.waitForFunction(()=>/ADC=204[78]/.test(document.getElementById('console-output').textContent),null,{timeout:300000});
  await wiper(90);
  await win.waitForFunction(()=>/ADC=36[89]\d/.test(document.getElementById('console-output').textContent),null,{timeout:30000});
  assert.doesNotMatch(await out(),/단일 변환 모드/);
  await win.keyboard.press('Control+F2');await win.waitForFunction(()=>/실행/.test(document.getElementById('run').textContent));
  // The reported code: HAL_ADC_Start once in USER CODE 2, HAL_ADC_GetValue only in the loop.
  await wiper(50);
  // The C text is passed as an argument: an escape written inside the page function would reach GCC as a real line break.
  const loop=String.raw`
    uint32_t adc_val = HAL_ADC_GetValue(&hadc1);
    printf("value: %lu\r\n", adc_val);
    HAL_Delay(100);
    `;
  await win.evaluate(loop=>{const c=document.getElementById('code');
   c.value=c.value.replace(/(\/\* USER CODE BEGIN 2 \*\/)/,'$1\n  HAL_ADC_Start(&hadc1);').replace(/(\/\* USER CODE BEGIN 3 \*\/)[\s\S]*?(\/\* USER CODE END 3 \*\/)/,(m,a,b)=>a+loop+b);
   c.dispatchEvent(new Event('input',{bubbles:true}));},loop);
  await win.keyboard.press('Control+F5');
  await win.waitForFunction(()=>/value: 204[78]/.test(document.getElementById('console-output').textContent),null,{timeout:300000});
  await wiper(90);
  await win.waitForFunction(()=>/ADC1: 단일 변환 모드라 HAL_ADC_GetValue가 같은 값을 돌려줍니다[\s\S]*Continuous Conversion Mode/.test(document.getElementById('console-output').textContent),null,{timeout:30000});
  assert.doesNotMatch((await out()).split('단일 변환 모드')[1],/value: 3[5-9]\d\d/,'single mode keeps the first result, as on the chip');
  assert.equal(((await out()).match(/단일 변환 모드라/g)||[]).length,1,'said once');
  await win.keyboard.press('Control+F2');
  assert.deepEqual(s.errors,[]);
 }finally{await s.close();}
});
