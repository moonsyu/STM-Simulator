// Advanced timers TIM1 (both boards) and TIM8 (F446RE) on the built-in interpreter with the code the Pinout generates:
// PWM with its complementary output (CHxN), the repetition counter dividing the update interrupt, the separate update
// and capture/compare vectors, and the misuse the HAL would not report.
import test from 'node:test';
import assert from 'node:assert/strict';
import {halProject,run,advance,pin} from './helpers.js';
import {blankProject} from '../../src/project.js';
import {generateHal,validateMcu,configProblems} from '../../src/mcu-config.js';

const callbacks='void HAL_TIM_PeriodElapsedCallback(TIM_HandleTypeDef *h) { (void)h; ups++; }\nvoid HAL_TIM_OC_DelayElapsedCallback(TIM_HandleTypeDef *h) { (void)h; matches++; }';
const globals='volatile uint32_t ups, matches;';
const count=(s,name)=>s.runtime.globals.cells[name].value;

test('TIM1 PWM on PA8 with the complementary output on PB13: 25 % and its inverse; Repetition Counter 4 gives one update interrupt per 5 periods',()=>{
 // 16 MHz / 16000 = 1 kHz, ARR 99: 100 ms period.
 const p=halProject({pins:{PA8:pin('TIM1_CH1'),PB13:pin('TIM1_CH1N')},peripherals:{TIM1:{enabled:true,prescaler:15999,period:99,pulse:25,mode:'pwm',repetition:4,deadTime:10}},
  nvic:{TIM1_UP_TIM10_IRQn:{enabled:true,priority:0}},globals,init:'  HAL_TIM_PWM_Start(&htim1, TIM_CHANNEL_1);\n  HAL_TIMEx_PWMN_Start(&htim1, TIM_CHANNEL_1);\n  HAL_TIM_Base_Start_IT(&htim1);',extra:callbacks});
 assert.match(p.code,/htim1\.Init\.RepetitionCounter = 4;[\s\S]*channel\.OCNPolarity = TIM_OCNPOLARITY_HIGH;[\s\S]*sBreakDeadTimeConfig\.DeadTime = 10;[\s\S]*HAL_TIMEx_ConfigBreakDeadTime\(&htim1, &sBreakDeadTimeConfig\);/);
 assert.match(p.code,/GPIO_InitStruct\.Pin = GPIO_PIN_13;\n  GPIO_InitStruct\.Mode = GPIO_MODE_AF_PP;[\s\S]*?GPIO_InitStruct\.Alternate = GPIO_AF1_TIM1;/);
 const full=generateHal(p.mcu);
 assert.match(full,/HAL_TIM_PWM_Start\(&htim1, TIM_CHANNEL_1\);\n  HAL_TIMEx_PWMN_Start\(&htim1, TIM_CHANNEL_1\);/);assert.match(full,/void TIM1_UP_TIM10_IRQHandler\(void\) \{[\s\S]*?HAL_TIM_IRQHandler\(&htim1\);/);
 const {s,warnings}=run(p);advance(s,2050,10);
 assert.deepEqual(s.runtime.gpio.PA8.pwm,{duty:.25,frequency:10});assert.deepEqual(s.runtime.gpio.PB13.pwm,{duty:.75,frequency:10});
 assert.equal(count(s,'ups'),4,'update events at 500, 1000, 1500, 2000 ms');
 assert.equal(warnings.length,1);assert.match(warnings[0],/^\[TIM1\] Dead Time 10: 내장 해석기는 상보 출력의 데드타임 구간을 그리지 않습니다/);
});

test('TIM8 output compare interrupt comes on TIM8_CC_IRQn and the update interrupt on TIM8_UP_TIM13_IRQn, each only when its line is enabled',()=>{
 const make=nvic=>halProject({pins:{PC6:pin('TIM8_CH1')},peripherals:{TIM8:{enabled:true,prescaler:15999,period:99,mode:'oc',channels:{CH1:{pulse:50}}}},nvic,globals,
  init:'  HAL_TIM_OC_Start_IT(&htim8, TIM_CHANNEL_1);\n  HAL_TIM_Base_Start_IT(&htim8);',extra:callbacks});
 const both=make({TIM8_CC_IRQn:{enabled:true,priority:1},TIM8_UP_TIM13_IRQn:{enabled:true,priority:2}});
 assert.match(both.code,/GPIO_InitStruct\.Alternate = GPIO_AF3_TIM8;/);
 const full=generateHal(both.mcu);for(const h of ['TIM8_UP_TIM13_IRQHandler','TIM8_CC_IRQHandler'])assert.ok(full.split(`void ${h}(void) {`)[1]?.split('\n}')[0].includes('HAL_TIM_IRQHandler(&htim8);'),h);
 let r=run(both);advance(r.s,1020,10);assert.equal(count(r.s,'matches'),10);assert.equal(count(r.s,'ups'),10);
 r=run(make({TIM8_CC_IRQn:{enabled:true,priority:1}}));advance(r.s,1020,10);assert.equal(count(r.s,'matches'),10);assert.equal(count(r.s,'ups'),0,'the update line is off');
});

test('F103RB: TIM1 uses TIM1_UP_IRQn; complementary pins PA7 / PB0 select the partial AFIO remap',()=>{
 const p=blankProject('STM32F103RB');p.boardId='nucleo-f103rb';Object.assign(p.mcu.pins,{PA8:pin('TIM1_CH1'),PA7:pin('TIM1_CH1N')});p.mcu.peripherals.TIM1={enabled:true,prescaler:7999,period:99,pulse:40,mode:'pwm'};p.mcu.nvic.TIM1_UP_IRQn={enabled:true,priority:0};
 const full=generateHal(p.mcu);
 assert.match(full,/__HAL_AFIO_REMAP_TIM1_PARTIAL\(\);/);assert.match(full,/void TIM1_UP_IRQHandler\(void\) \{[\s\S]*?HAL_TIM_IRQHandler\(&htim1\);/);
 p.code=generateHal(p.mcu,{minimal:true}).replace('int main(void) {',globals+'\nint main(void) {').replace('  /* USER CODE BEGIN 2 */','  /* USER CODE BEGIN 2 */\n  HAL_TIM_PWM_Start(&htim1, TIM_CHANNEL_1);\n  HAL_TIMEx_PWMN_Start(&htim1, TIM_CHANNEL_1);\n  HAL_TIM_Base_Start_IT(&htim1);')+'\n'+callbacks+'\n';
 const {s}=run(p);advance(s,1020,10);
 assert.equal(s.runtime.gpio.PA8.pwm.duty,.4);assert.equal(s.runtime.gpio.PA7.pwm.duty,.6);assert.equal(count(s,'ups'),10);
 const mixed=validateMcu({...p.mcu,pins:{PA8:pin('TIM1_CH1'),PA7:pin('TIM1_CH1N'),PB14:pin('TIM1_CH2N')}});
 assert.ok(configProblems(mixed).some(e=>/^TIM1: .*조합은 STM32F103RB에서 쓸 수 없습니다/.test(e)),configProblems(mixed).join('\n'));
});

test('settings and calls that only the advanced timers have are refused elsewhere',()=>{
 assert.throws(()=>validateMcu({...blankProject().mcu,peripherals:{TIM2:{enabled:true,repetition:3}}}),/TIM2: Repetition Counter는 고급 타이머 TIM1\/TIM8에만 있습니다/);
 assert.throws(()=>validateMcu({...blankProject().mcu,peripherals:{TIM1:{enabled:true,deadTime:256}}}),/TIM1 Dead Time: 0~255/);
 assert.deepEqual(configProblems(validateMcu({...blankProject().mcu,pins:{PA8:pin('TIM1_CH1'),PB13:pin('TIM1_CH1N')},peripherals:{TIM1:{enabled:true,mode:'capture'}}})),['TIM1: 상보 출력(CHxN)은 PWM 또는 출력 비교 모드에서 씁니다.']);
 const p=halProject({pins:{PA5:pin('TIM2_CH1')},peripherals:{TIM2:{enabled:true,prescaler:15999,period:99,pulse:25,mode:'pwm'}},init:'  HAL_TIMEx_PWMN_Start(&htim2, TIM_CHANNEL_1);'});
 assert.throws(()=>{const {s}=run(p);advance(s,20,10);},/TIM2: 상보 출력\(CHxN\)은 고급 타이머 TIM1\/TIM8에만 있습니다/);
 assert.throws(()=>validateMcu({...blankProject('STM32F103RB').mcu,peripherals:{TIM8:{enabled:true}}}),/TIM8: STM32F103RB에서 지원하지 않는 주변장치입니다/);
});

test('a complementary pin alone (CH1N without CH1) gets its channel configured; output compare has a complementary output too',()=>{
 // Found by the random-configuration check: the generated code started CH1N of a channel it had not configured.
 const p=halProject({pins:{PB13:pin('TIM1_CH1N')},peripherals:{TIM1:{enabled:true,prescaler:15999,period:99,pulse:25,mode:'pwm'}},init:'  HAL_TIMEx_PWMN_Start(&htim1, TIM_CHANNEL_1);'});
 assert.match(p.code,/HAL_TIM_PWM_ConfigChannel\(&htim1, &channel, TIM_CHANNEL_1\);/);
 const {s}=run(p);advance(s,50,10);assert.deepEqual(s.runtime.gpio.PB13.pwm,{duty:.75,frequency:10});
 const full=generateHal(p.mcu);assert.match(full,/HAL_TIMEx_PWMN_Start\(&htim1, TIM_CHANNEL_1\);/);assert.ok(!/HAL_TIM_PWM_Start\(&htim1/.test(full),'no start of a channel without a pin');
 const oc=halProject({pins:{PA8:pin('TIM1_CH1'),PB13:pin('TIM1_CH1N')},peripherals:{TIM1:{enabled:true,prescaler:15999,period:99,mode:'oc',channels:{CH1:{ocMode:'FORCED_ACTIVE'}}}},init:'  HAL_TIM_OC_Start(&htim1, TIM_CHANNEL_1);\n  HAL_TIMEx_OCN_Start(&htim1, TIM_CHANNEL_1);'});
 const r=run(oc);advance(r.s,20,10);assert.equal(r.s.runtime.gpio.PA8.value,3.3);assert.equal(r.s.runtime.gpio.PB13.value,0,'CH1N is the inverse');
});
