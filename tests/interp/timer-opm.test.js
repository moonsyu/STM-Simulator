// One Pulse Mode on the built-in interpreter with the generated code: the counter runs to the next update event,
// gives that update interrupt once and stops; starting again gives one more.
import test from 'node:test';
import assert from 'node:assert/strict';
import {halProject,run,advance,pin} from './helpers.js';
import {validateMcu,importIoc,defaultMcu} from '../../src/mcu-config.js';

test('TIM2 One Pulse: one HAL_TIM_PeriodElapsedCallback after 200 ms, the counter stops at 0, a second start gives one more',()=>{
 const p=halProject({peripherals:{TIM2:{enabled:true,prescaler:15999,period:199,onePulse:true}},nvic:{TIM2_IRQn:{enabled:true,priority:0}},globals:'volatile uint32_t ups;',
  init:'  HAL_TIM_Base_Start_IT(&htim2);',loop:'    HAL_Delay(600);\n    if (ups == 1) HAL_TIM_Base_Start_IT(&htim2);\n    HAL_Delay(100000);',extra:'void HAL_TIM_PeriodElapsedCallback(TIM_HandleTypeDef *h) { (void)h; ups++; }'});
 assert.match(p.code,/HAL_TIM_Base_Init\(&htim2\);\n  if \(HAL_TIM_OnePulse_Init\(&htim2, TIM_OPMODE_SINGLE\) != HAL_OK\) Error_Handler\(\);/);
 const {s}=run(p),ups=()=>s.runtime.globals.cells.ups.value;
 advance(s,190,10);assert.equal(ups(),0);advance(s,210,10);assert.equal(ups(),1);advance(s,590,10);assert.equal(ups(),1,'stopped: no further updates');
 advance(s,790,10);assert.equal(ups(),1);advance(s,820,10);assert.equal(ups(),2,'one more pulse after the second start');advance(s,1500,10);assert.equal(ups(),2);
});

test('One Pulse with PWM1: the output runs one period and stays at its CNT = 0 level; settings and .ioc',()=>{
 const p=halProject({pins:{PA5:pin('TIM2_CH1')},peripherals:{TIM2:{enabled:true,prescaler:15999,period:99,pulse:30,mode:'pwm',onePulse:true}},init:'  HAL_TIM_PWM_Start(&htim2, TIM_CHANNEL_1);'});
 const {s}=run(p);advance(s,50,10);assert.ok(s.runtime.gpio.PA5.pwm,'PWM while counting');
 advance(s,150,10);assert.ok(!s.runtime.gpio.PA5.pwm);assert.equal(s.runtime.gpio.PA5.value,3.3,'CNT 0 < CCR: PWM1 output active');
 assert.throws(()=>validateMcu({...defaultMcu(),pins:{PA0:pin('TIM2_CH1'),PA1:pin('TIM2_CH2')},peripherals:{TIM2:{enabled:true,prescaler:0,mode:'encoder',onePulse:true}}}),/엔코더 모드에서는 One Pulse Mode를 쓰지 않습니다/);
 assert.equal(validateMcu({...defaultMcu(),peripherals:{TIM6:{enabled:true,onePulse:false}}}).peripherals.TIM6.onePulse,undefined);
 const {config}=importIoc(['Mcu.Name=STM32F446R(C-E)Tx','Mcu.CPN=STM32F446RET6','Mcu.IP0=RCC','Mcu.IP1=TIM2','TIM2.Prescaler=15999','TIM2.Period=199','VP_TIM2_VS_ClockSourceINT.Mode=Internal','VP_TIM2_VS_OPM.Mode=OPM_bit','VP_TIM2_VS_OPM.Signal=TIM2_VS_OPM'].join('\n'));
 assert.equal(config.peripherals.TIM2.onePulse,true);
});
