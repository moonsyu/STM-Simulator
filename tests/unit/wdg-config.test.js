// Watchdog settings (wdg-config.js, both boards): ranges, timing, generated MX_IWDG_Init / MX_WWDG_Init, the WWDG
// interrupt handler and .ioc import.
import test from 'node:test';
import assert from 'node:assert/strict';
import {validateMcu,generateHal,importIoc,configProblems,defaultMcu} from '../../src/mcu-config.js';
import {iwdgTimeoutMs,wwdgTiming,pclk1Hz} from '../../src/wdg-config.js';

const mcu=(peripherals,extra={},family)=>({...defaultMcu(family),peripherals,...extra});

test('ranges and CubeMX defaults (IWDG prescaler 4 / reload 4095, WWDG prescaler 1 / window 64 / counter 64)',()=>{
 for(const family of ['STM32F446RE','STM32F103RB']){
  const v=validateMcu(mcu({IWDG:{enabled:true},WWDG:{enabled:true,ewi:false}},{},family));
  assert.deepEqual(v.peripherals,{IWDG:{enabled:true,prescaler:4,reload:4095},WWDG:{enabled:true,prescaler:1,window:64,counter:64}});
 }
 assert.throws(()=>validateMcu(mcu({IWDG:{enabled:true,prescaler:5}})),/IWDG Prescaler: 4 \/ 8 \/ 16 \/ 32 \/ 64 \/ 128 \/ 256/);
 assert.throws(()=>validateMcu(mcu({IWDG:{enabled:true,reload:4096}})),/0~4095/);
 assert.throws(()=>validateMcu(mcu({WWDG:{enabled:true,prescaler:16}})),/WWDG Prescaler: 1 \/ 2 \/ 4 \/ 8/);
 assert.throws(()=>validateMcu(mcu({WWDG:{enabled:true,window:63}})),/64~127/);
 assert.throws(()=>validateMcu(mcu({WWDG:{enabled:true,counter:128}})),/64~127/);
 assert.deepEqual(configProblems(validateMcu(mcu({},{nvic:{WWDG_IRQn:{enabled:true,priority:0}}}))),['WWDG_IRQn: WWDG를 활성화하거나 인터럽트를 끄세요.']);
});

test('timing: IWDG from the LSI (F446 32 kHz, F103 40 kHz), WWDG from PCLK1 / 4096 / prescaler',()=>{
 assert.equal(iwdgTimeoutMs({prescaler:4,reload:4095},'STM32F446RE'),512);
 assert.equal(iwdgTimeoutMs({prescaler:4,reload:4095},'STM32F103RB'),409.6);
 assert.equal(iwdgTimeoutMs({prescaler:256,reload:4095},'STM32F446RE'),32768);
 const c=validateMcu(mcu({}));assert.equal(pclk1Hz(c),16e6);
 const t=wwdgTiming({prescaler:8,window:80,counter:127},c);
 assert.equal(t.tickMs,2.048);assert.equal(t.openMs,47*2.048);assert.equal(t.resetMs,64*2.048);
 assert.equal(pclk1Hz({family:'STM32F446RE',timerClockHz:84e6}),42e6);
});

test('generated code: MX_IWDG_Init without a clock enable, the example loop refreshes in time; MX_WWDG_Init, WWDG_IRQHandler and the early wakeup callback',()=>{
 for(const family of ['STM32F446RE','STM32F103RB']){
  const code=generateHal(mcu({IWDG:{enabled:true,prescaler:64,reload:999},WWDG:{enabled:true,prescaler:8,window:100,counter:127,ewi:true}},{nvic:{WWDG_IRQn:{enabled:true,priority:2}}},family));
  assert.match(code,/IWDG_HandleTypeDef hiwdg;\nWWDG_HandleTypeDef hwwdg;/);
  assert.match(code,/static void MX_IWDG_Init\(void\) \{\n  hiwdg\.Instance = IWDG;\n  hiwdg\.Init\.Prescaler = IWDG_PRESCALER_64;\n  hiwdg\.Init\.Reload = 999;\n  if \(HAL_IWDG_Init\(&hiwdg\) != HAL_OK\) Error_Handler\(\);\n\}/);
  assert.match(code,/static void MX_WWDG_Init\(void\) \{\n  __HAL_RCC_WWDG_CLK_ENABLE\(\);\n  hwwdg\.Instance = WWDG;\n  hwwdg\.Init\.Prescaler = WWDG_PRESCALER_8;\n  hwwdg\.Init\.Window = 100;\n  hwwdg\.Init\.Counter = 127;\n  hwwdg\.Init\.EWIMode = WWDG_EWI_ENABLE;\n  if \(HAL_WWDG_Init\(&hwwdg\) != HAL_OK\) Error_Handler\(\);\n\}/);
  assert.match(code,/HAL_NVIC_SetPriority\(WWDG_IRQn, 2, 0\);\n  HAL_NVIC_EnableIRQ\(WWDG_IRQn\);/);
  assert.match(code,/void WWDG_IRQHandler\(void\) \{\n  \/\* USER CODE BEGIN WWDG_IRQn 0 \*\/\n  \/\* USER CODE END WWDG_IRQn 0 \*\/\n  HAL_WWDG_IRQHandler\(&hwwdg\);/);
  assert.match(code,/void HAL_WWDG_EarlyWakeupCallback\(WWDG_HandleTypeDef \*hwwdg\) \{\n  \/\* USER CODE BEGIN WWDG_EarlyWakeup \*\/\n  HAL_WWDG_Refresh\(hwwdg\);/);
  assert.match(code,/    HAL_IWDG_Refresh\(&hiwdg\);\n    HAL_Delay\(500\);/);
 }
 // CubeMX's default IWDG (0.41 s on the F103): the example loop waits half the timeout.
 assert.match(generateHal(mcu({IWDG:{enabled:true}},{},'STM32F103RB')),/    HAL_IWDG_Refresh\(&hiwdg\);\n    HAL_Delay\(204\);/);
 assert.match(generateHal(mcu({IWDG:{enabled:true}})),/    HAL_IWDG_Refresh\(&hiwdg\);\n    HAL_Delay\(256\);/);
});

test('.ioc import: IWDG / WWDG parameters, WWDG_IRQn; a value out of range falls back to the default with a warning',()=>{
 const base=['Mcu.Name=STM32F446R(C-E)Tx','Mcu.CPN=STM32F446RET6','Mcu.IP0=IWDG','Mcu.IP1=NVIC','Mcu.IP2=RCC','Mcu.IP3=SYS','Mcu.IP4=WWDG',
  'IWDG.IPParameters=Prescaler,Reload','IWDG.Prescaler=IWDG_PRESCALER_32','IWDG.Reload=1999','VP_IWDG_VS_IWDG.Mode=IWDG_Activate','VP_IWDG_VS_IWDG.Signal=IWDG_VS_IWDG',
  'WWDG.IPParameters=Prescaler,Window,Counter,EWIMode','WWDG.Prescaler=WWDG_PRESCALER_8','WWDG.Window=100','WWDG.Counter=127','WWDG.EWIMode=WWDG_EWI_ENABLE','VP_WWDG_VS_WWDG.Mode=WWDG_Activate',
  'NVIC.WWDG_IRQn=true\\:3\\:0\\:false\\:false\\:true\\:true\\:true\\:true'];
 const {config,warnings}=importIoc(base.join('\n'));
 assert.deepEqual(config.peripherals.IWDG,{enabled:true,prescaler:32,reload:1999});
 assert.deepEqual(config.peripherals.WWDG,{enabled:true,prescaler:8,window:100,counter:127,ewi:true});
 assert.deepEqual(config.nvic.WWDG_IRQn,{enabled:true,priority:3});assert.deepEqual(warnings,[]);
 // CubeMX leaves default parameters out of the file.
 const f1=importIoc(['Mcu.Name=STM32F103R(8-B)Tx','Mcu.CPN=STM32F103RBT6','Mcu.IP0=IWDG','Mcu.IP1=RCC','VP_IWDG_VS_IWDG.Mode=IWDG_Activate'].join('\n'));
 assert.deepEqual(f1.config.peripherals.IWDG,{enabled:true,prescaler:4,reload:4095});assert.deepEqual(f1.warnings,[]);
 const bad=importIoc(base.map(l=>l==='IWDG.Reload=1999'?'IWDG.Reload=5000':l).join('\n'));
 assert.deepEqual(bad.config.peripherals.IWDG,{enabled:true,prescaler:4,reload:4095});assert.match(bad.warnings.join('\n'),/IWDG Down-counter reload value: 0~4095 범위의 정수를 입력하세요\. 기본값을 씁니다\./);
});
