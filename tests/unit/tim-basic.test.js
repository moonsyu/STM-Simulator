// TIM6/TIM7 basic timers (STM32F446RE only): project rules, generated MX_TIMx_Init (no ClockDivision, TRGO master
// configuration), the shared TIM6_DAC_IRQn line (NVIC list, label, handler, build environment), .ioc import and F103RB.
import test from 'node:test';
import assert from 'node:assert/strict';
import {validateMcu,generateHal,importIoc,configProblems,defaultMcu} from '../../src/mcu-config.js';
import {irqNamesOf} from '../../src/mcu-family.js';
import {peripheralIrqs,irqLabel} from '../../src/nvic-config.js';
import {buildEnvironment} from '../../src/build-environment.js';
import {f1Unavailable} from '../../src/example-port.js';
import {timerIrq,timerOfIrq} from '../../src/timer-config.js';

const mcu=(peripherals,nvic={})=>({...defaultMcu(),timerClockHz:84000000,peripherals,nvic});

test('TIM6/TIM7: base mode with an Up counter only, no channels; TRGO Reset / Enable / Update (only on the basic timers)',()=>{
 const v=validateMcu(mcu({TIM6:{enabled:true,prescaler:8399,period:4999,trgo:'UPDATE'},TIM7:{enabled:true,trgo:'RESET'}}));
 assert.deepEqual(v.peripherals.TIM6,{enabled:true,prescaler:8399,period:4999,pulse:0,mode:'base',trgo:'UPDATE'});
 assert.deepEqual(v.peripherals.TIM7,{enabled:true,prescaler:0,period:65535,pulse:0,mode:'base'},'Reset is the default and is not stored');
 for(const [bad,message]of [[{mode:'pwm'},/TIM6: 기본 타이머는 채널이 없어 내부 클록 \/ 주기 모드만 씁니다/],[{counterMode:'DOWN'},/Up 카운터만/],[{channels:{CH1:{pulse:1}}},/채널이 없습니다/],[{trgo:'OC1'},/RESET \/ ENABLE \/ UPDATE/]])
  assert.throws(()=>validateMcu(mcu({TIM6:{enabled:true,...bad}})),message);
 assert.throws(()=>validateMcu(mcu({TIM2:{enabled:true,trgo:'UPDATE'}})),/TIM2: TRGO\(Trigger Event Selection\)는 기본 타이머 TIM6\/TIM7에서 설정합니다/);
 assert.throws(()=>validateMcu({...defaultMcu('STM32F103RB'),peripherals:{TIM6:{enabled:true}}}),/TIM6: STM32F103RB에서 지원하지 않는 주변장치입니다/);
});

test('generated MX_TIM6_Init: no ClockDivision, TRGO master configuration; Base_Start_IT and TIM6_DAC_IRQHandler with the NVIC line',()=>{
 const code=generateHal(mcu({TIM6:{enabled:true,prescaler:8399,period:4999,trgo:'UPDATE'},TIM7:{enabled:true,prescaler:83,period:999}},{TIM6_DAC_IRQn:{enabled:true,priority:1}}));
 const init=code.slice(code.indexOf('static void MX_TIM6_Init(void) {'),code.indexOf('static void MX_TIM7_Init(void) {'));
 assert.equal(init,`static void MX_TIM6_Init(void) {
  __HAL_RCC_TIM6_CLK_ENABLE();
  htim6.Instance = TIM6;
  htim6.Init.Prescaler = 8399;
  htim6.Init.CounterMode = TIM_COUNTERMODE_UP;
  htim6.Init.Period = 4999;
  htim6.Init.AutoReloadPreload = TIM_AUTORELOAD_PRELOAD_DISABLE;
  HAL_TIM_Base_Init(&htim6);
  TIM_MasterConfigTypeDef sMasterConfig = {0};
  sMasterConfig.MasterOutputTrigger = TIM_TRGO_UPDATE;
  sMasterConfig.MasterSlaveMode = TIM_MASTERSLAVEMODE_DISABLE;
  HAL_TIMEx_MasterConfigSynchronization(&htim6, &sMasterConfig);
}

`);
 assert.match(code,/sMasterConfig\.MasterOutputTrigger = TIM_TRGO_RESET;\n[^\n]*\n {2}HAL_TIMEx_MasterConfigSynchronization\(&htim7, &sMasterConfig\);/);
 assert.match(code,/ {2}HAL_TIM_Base_Start_IT\(&htim6\);/);assert.doesNotMatch(code,/HAL_TIM_Base_Start_IT\(&htim7\)/,'TIM7 has no NVIC line on');
 assert.match(code,/HAL_NVIC_SetPriority\(TIM6_DAC_IRQn, 1, 0\);\n {2}HAL_NVIC_EnableIRQ\(TIM6_DAC_IRQn\);/);
 assert.match(code,/void TIM6_DAC_IRQHandler\(void\) \{\n {2}\/\* USER CODE BEGIN TIM6_DAC_IRQn 0 \*\/\n {2}\/\* USER CODE END TIM6_DAC_IRQn 0 \*\/\n {2}HAL_TIM_IRQHandler\(&htim6\);/);
 // The ARM build adds the same handler when main.c has none.
 const env=buildEnvironment({code:'int main(void){}',mcu:validateMcu(mcu({TIM6:{enabled:true}},{TIM6_DAC_IRQn:{enabled:true,priority:0}}))}).text;
 assert.match(env,/extern TIM_HandleTypeDef htim6;[\s\S]*void TIM6_DAC_IRQHandler\(void\) \{ HAL_TIM_IRQHandler\(&htim6\); \}/);
});

test('NVIC: TIM6_DAC_IRQn and TIM7_IRQn on the F446RE (CubeMX names), none on the F103RB; a line on without its timer is reported',()=>{
 const f4=irqNamesOf('STM32F446RE'),f1=irqNamesOf('STM32F103RB');
 assert.ok(f4.includes('TIM6_DAC_IRQn')&&f4.includes('TIM7_IRQn')&&!f4.includes('TIM6_IRQn'));
 assert.ok(!f1.some(n=>/^TIM[67]/.test(n)));
 assert.deepEqual(peripheralIrqs('STM32F446RE','TIM6'),['TIM6_DAC_IRQn']);assert.deepEqual(peripheralIrqs('STM32F446RE','TIM7'),['TIM7_IRQn']);
 assert.equal(irqLabel('TIM6_DAC_IRQn'),'TIM6 global interrupt, DAC1 and DAC2 underrun error interrupts');assert.equal(irqLabel('TIM7_IRQn'),'TIM7 global interrupt');
 assert.deepEqual([timerIrq('TIM6'),timerIrq('TIM7'),timerOfIrq('TIM6_DAC_IRQn'),timerOfIrq('USART2_IRQn')],['TIM6_DAC_IRQn','TIM7_IRQn','TIM6',null]);
 assert.deepEqual(configProblems(validateMcu(mcu({},{TIM6_DAC_IRQn:{enabled:true,priority:0}}))),['TIM6_DAC_IRQn: TIM6 주변장치를 활성화하거나 인터럽트를 끄세요.']);
});

test('.ioc: TIM6/TIM7 from Mcu.IP with Prescaler, Period, TRGO and their NVIC lines; F103RB examples using them do not port',()=>{
 const ioc=['Mcu.Name=STM32F446R(C-E)Tx','Mcu.IP0=NVIC','Mcu.IP1=RCC','Mcu.IP2=TIM6','Mcu.IP3=TIM7','TIM6.IPParameters=Prescaler,Period,TIM_MasterOutputTrigger','TIM6.Prescaler=8400-1','TIM6.Period=4999',
  'TIM6.TIM_MasterOutputTrigger=TIM_TRGO_UPDATE','TIM7.Prescaler=83','TIM7.Period=999','TIM7.TIM_MasterOutputTrigger=TIM_TRGO_RESET','NVIC.TIM6_DAC_IRQn=true\\:1\\:0\\:false\\:false\\:true\\:true\\:true\\:true',
  'NVIC.TIM7_IRQn=true\\:2\\:0\\:false\\:false\\:true\\:true\\:true\\:true','VP_TIM6_VS_ClockSourceINT.Mode=Enable_Timer','VP_TIM6_VS_ClockSourceINT.Signal=TIM6_VS_ClockSourceINT'].join('\n');
 const {config,warnings}=importIoc(ioc);
 assert.deepEqual(config.peripherals.TIM6,{enabled:true,prescaler:8399,period:4999,pulse:0,mode:'base',trgo:'UPDATE'});
 assert.deepEqual(config.peripherals.TIM7,{enabled:true,prescaler:83,period:999,pulse:0,mode:'base'});
 assert.deepEqual(config.nvic,{TIM6_DAC_IRQn:{enabled:true,priority:1},TIM7_IRQn:{enabled:true,priority:2}});assert.deepEqual(warnings,[]);
 assert.deepEqual(f1Unavailable({mcu:{peripherals:{TIM6:{enabled:true}}},code:''}),['TIM6']);
});
