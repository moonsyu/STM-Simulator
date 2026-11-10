// ADC1 regular group on the built-in interpreter with the code the Pinout generates: Number Of Conversion with a
// channel per rank (scan), and the external trigger (TIM3 TRGO on its update event) with HAL_ADC_Start_IT.
import test from 'node:test';
import assert from 'node:assert/strict';
import {halProject,run,advance,pin} from './helpers.js';
import {validateMcu,configProblems,importIoc,defaultMcu} from '../../src/mcu-config.js';
import {adcRanks} from '../../src/adc-config.js';

const pins={PA0:pin('ADC1_IN0'),PA1:pin('ADC1_IN1'),PA4:pin('ADC1_IN4')};

test('Number Of Conversion 3: ScanConvMode, one ConfigChannel per rank in the chosen order; settings rules',()=>{
 const p=halProject({pins,peripherals:{ADC1:{enabled:true,conversions:3,ranks:[4,0,1]}}});
 assert.match(p.code,/hadc1\.Init\.ScanConvMode = ENABLE;[\s\S]*hadc1\.Init\.NbrOfConversion = 3;[\s\S]*sConfig\.Channel = ADC_CHANNEL_4;\n  sConfig\.Rank = 1;[\s\S]*sConfig\.Channel = ADC_CHANNEL_0;\n  sConfig\.Rank = 2;[\s\S]*sConfig\.Channel = ADC_CHANNEL_1;\n  sConfig\.Rank = 3;/);
 const {s}=run(p);advance(s,20,10);assert.ok(!s.result?.fault);
 // Defaults: the pins' channels in ascending order; one conversion keeps the old single-channel code.
 assert.deepEqual(adcRanks(validateMcu({...defaultMcu(),pins,peripherals:{ADC1:{enabled:true,conversions:2}}})),[0,1]);
 const single=halProject({pins,peripherals:{ADC1:{enabled:true}}});assert.match(single.code,/ScanConvMode = DISABLE;[\s\S]*NbrOfConversion = 1;/);assert.equal(single.code.split('HAL_ADC_ConfigChannel').length-1,1);
 assert.deepEqual(configProblems(validateMcu({...defaultMcu(),pins,peripherals:{ADC1:{enabled:true,conversions:2,ranks:[0,5]}}})),['ADC1 Rank 2: IN5 핀을 ADC1_IN5로 활성화하세요.']);
 assert.throws(()=>validateMcu({...defaultMcu(),pins,peripherals:{ADC1:{enabled:true,conversions:17}}}),/Number Of Conversion: 1~16/);
 assert.throws(()=>validateMcu({...defaultMcu('STM32F103RB'),peripherals:{ADC1:{enabled:true,trigger:'T2_TRGO'}}}),/ADC1 External Trigger: SOFTWARE \/ T3_TRGO/);
 const f1=validateMcu({...defaultMcu('STM32F103RB'),pins:{PA0:pin('ADC1_IN0'),PA1:pin('ADC1_IN1')},peripherals:{ADC1:{enabled:true,conversions:2}}});
 assert.deepEqual(configProblems(f1),[]);
});

test('External trigger T3_TRGO: TIM3 update events start the conversions; without TRGO = Update Event the Pinout says what is missing',()=>{
 // 16 MHz / 16000 = 1 kHz, ARR 99: one trigger per 100 ms.
 const mcu={pins:{PA0:pin('ADC1_IN0')},peripherals:{ADC1:{enabled:true,trigger:'T3_TRGO'},TIM3:{enabled:true,prescaler:15999,period:99,trgo:'UPDATE'}},nvic:{ADC_IRQn:{enabled:true,priority:1}}};
 const p=halProject({...mcu,globals:'volatile uint32_t done;',init:'  HAL_ADC_Start_IT(&hadc1);\n  HAL_TIM_Base_Start(&htim3);',extra:'void HAL_ADC_ConvCpltCallback(ADC_HandleTypeDef *h) { (void)h; done++; }'});
 assert.match(p.code,/ExternalTrigConvEdge = ADC_EXTERNALTRIGCONVEDGE_RISING;\n  hadc1\.Init\.ExternalTrigConv = ADC_EXTERNALTRIGCONV_T3_TRGO;/);
 assert.match(p.code,/sMasterConfig\.MasterOutputTrigger = TIM_TRGO_UPDATE;[\s\S]*HAL_TIMEx_MasterConfigSynchronization\(&htim3, &sMasterConfig\);/);
 const {s}=run(p);advance(s,1050,10);
 assert.equal(s.runtime.globals.cells.done.value,10,'one conversion per 100 ms trigger');
 const missing=validateMcu({...defaultMcu(),...mcu,peripherals:{ADC1:{enabled:true,trigger:'T3_TRGO'},TIM3:{enabled:true}}});
 assert.deepEqual(configProblems(missing),['ADC1 External Trigger T3_TRGO: TIM3를 켜고 Trigger Event Selection(TRGO)을 Update Event로 두어야 변환이 시작됩니다.']);
 const poll=halProject({...mcu,init:'  HAL_ADC_Start(&hadc1);'});
 assert.throws(()=>{const r=run(poll);advance(r.s,20,10);},/External Trigger T3_TRGO로 시작하는 변환은 내장 해석기에서 HAL_ADC_Start_IT/);
});

test('.ioc import: NbrOfConversion, rank channels, external trigger and a general timer TRGO',()=>{
 const {config,warnings}=importIoc(['Mcu.Name=STM32F446R(C-E)Tx','Mcu.CPN=STM32F446RET6','Mcu.IP0=ADC1','Mcu.IP1=RCC','Mcu.IP2=SYS','Mcu.IP3=TIM3','PA0-WKUP.Signal=ADCx_IN0','PA1.Signal=ADCx_IN1','PA4.Signal=ADCx_IN4',
  'ADC1.NbrOfConversion=3','ADC1.NbrOfConversionFlag=1','ADC1.ScanConvMode=ENABLE','ADC1.Channel-0\\#ChannelRegularConversion=ADC_CHANNEL_4','ADC1.Rank-0\\#ChannelRegularConversion=1','ADC1.Channel-1\\#ChannelRegularConversion=ADC_CHANNEL_0','ADC1.Rank-1\\#ChannelRegularConversion=2',
  'ADC1.Channel-2\\#ChannelRegularConversion=ADC_CHANNEL_1','ADC1.Rank-2\\#ChannelRegularConversion=3','ADC1.ExternalTrigConv=ADC_EXTERNALTRIGCONV_T3_TRGO','ADC1.ExternalTrigConvEdge=ADC_EXTERNALTRIGCONVEDGE_RISING',
  'TIM3.Prescaler=15999','TIM3.Period=99','TIM3.TIM_MasterOutputTrigger=TIM_TRGO_UPDATE','VP_TIM3_VS_ClockSourceINT.Mode=Internal'].join('\n'));
 assert.deepEqual(warnings,[]);
 assert.deepEqual(config.peripherals.ADC1,{enabled:true,samplingTime:3,conversions:3,ranks:[4,0,1],trigger:'T3_TRGO'});assert.equal(config.peripherals.TIM3.trgo,'UPDATE');
});
