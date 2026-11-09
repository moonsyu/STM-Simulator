// TIM6/TIM7 basic timers (NUCLEO-F446RE) on the built-in interpreter with the code the Pinout generates: the update
// interrupt on TIM6_DAC_IRQn / TIM7_IRQn calls HAL_TIM_PeriodElapsedCallback, the TRGO master configuration is accepted,
// and channel or down-counting calls are rejected (the basic timers have neither).
import test from 'node:test';
import assert from 'node:assert/strict';
import {halProject,run,advance} from './helpers.js';
import {blankProject} from '../../src/project.js';
import {generateHal} from '../../src/mcu-config.js';
import {SimulationSession} from '../../src/session.js';

// 16 MHz / 16000 = 1 kHz counter: TIM6 ARR 99 → 100 ms, TIM7 ARR 249 → 250 ms.
const peripherals={TIM6:{enabled:true,prescaler:15999,period:99,trgo:'UPDATE'},TIM7:{enabled:true,prescaler:15999,period:249}};
const nvic={TIM6_DAC_IRQn:{enabled:true,priority:1},TIM7_IRQn:{enabled:true,priority:2}};
const counting=`void HAL_TIM_PeriodElapsedCallback(TIM_HandleTypeDef *htim) {
  if (htim->Instance == TIM6) six++;
  else if (htim->Instance == TIM7) seven++;
}
void TIM6_DAC_IRQHandler(void) { HAL_TIM_IRQHandler(&htim6); }
void TIM7_IRQHandler(void) { HAL_TIM_IRQHandler(&htim7); }`;

test('TIM6 (TIM6_DAC_IRQn) and TIM7 (TIM7_IRQn) update interrupts call HAL_TIM_PeriodElapsedCallback at their periods',()=>{
 const p=halProject({peripherals,nvic,globals:'volatile uint32_t six, seven;',init:'  HAL_TIM_Base_Start_IT(&htim6);\n  HAL_TIM_Base_Start_IT(&htim7);',extra:counting,
  loop:'    printf("six=%lu seven=%lu\\n", six, seven);\n    HAL_Delay(1000);'});
 assert.match(p.code,/sMasterConfig\.MasterOutputTrigger = TIM_TRGO_UPDATE;\n {2}sMasterConfig\.MasterSlaveMode = TIM_MASTERSLAVEMODE_DISABLE;\n {2}HAL_TIMEx_MasterConfigSynchronization\(&htim6, &sMasterConfig\);/);
 assert.doesNotMatch(p.code,/htim6\.Init\.ClockDivision/,'basic timers have no clock division');
 const {s,output,warnings}=run(p);advance(s,2010,10);
 assert.ok(!s.result?.fault);assert.deepEqual(warnings,[]);
 assert.deepEqual(output.filter(l=>l.startsWith('six=')).slice(0,3),['six=0 seven=0','six=10 seven=4','six=20 seven=8']);
});

test('the full generated main.c (handlers, TRGO Reset on TIM7) runs; without the NVIC line the callback does not run',()=>{
 const p=blankProject();Object.assign(p.mcu.peripherals,peripherals);Object.assign(p.mcu.nvic,nvic);p.code=generateHal(p.mcu);
 assert.match(p.code,/void TIM6_DAC_IRQHandler\(void\) \{[\s\S]*?HAL_TIM_IRQHandler\(&htim6\);/);
 assert.match(p.code,/sMasterConfig\.MasterOutputTrigger = TIM_TRGO_RESET;\n[^\n]*\n {2}HAL_TIMEx_MasterConfigSynchronization\(&htim7, &sMasterConfig\);/);
 const out=[],s=new SimulationSession(p,{print:x=>out.push(x)});s.tick(0);advance(s,1200,10);assert.ok(!s.result?.fault,out.join('\n'));
 const off=halProject({peripherals:{TIM6:peripherals.TIM6},globals:'volatile uint32_t six, seven;',init:'  HAL_TIM_Base_Start_IT(&htim6);',extra:'void HAL_TIM_PeriodElapsedCallback(TIM_HandleTypeDef *htim) { if (htim->Instance == TIM6) six++; }',
  loop:'    printf("six=%lu\\n", six);\n    HAL_Delay(500);'});
 const r=run(off);advance(r.s,1100,10);assert.deepEqual(r.output.filter(l=>l.startsWith('six=')),['six=0','six=0','six=0']);
});

test('the basic timers count up only and have no channels',()=>{
 const fail=(init,pattern)=>assert.throws(()=>{const {s}=run(halProject({peripherals:{TIM6:{enabled:true,prescaler:15999,period:99}},init}));advance(s,20);},pattern);
 fail('  TIM_OC_InitTypeDef channel = {0};\n  channel.OCMode = TIM_OCMODE_PWM1;\n  HAL_TIM_PWM_ConfigChannel(&htim6, &channel, TIM_CHANNEL_1);',/TIM6: 기본 타이머에는 채널이 없습니다/);
 fail('  htim6.Init.CounterMode = TIM_COUNTERMODE_DOWN;\n  HAL_TIM_Base_Init(&htim6);',/TIM6: 기본 타이머는 채널이 없는 Up 카운터입니다/);
});
