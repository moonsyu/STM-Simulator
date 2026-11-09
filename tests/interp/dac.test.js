// DAC (NUCLEO-F446RE) on the built-in interpreter with the MX_DAC_Init the Pinout generates: HAL_DAC_SetValue drives
// PA4 at once, a TIM6 TRGO trigger with circular DMA plays a table on PA4 (with the half / complete callbacks), the
// triangle wave on TIM7 TRGO steps PA5, and the ADC reads the DAC voltage back through a wire.
import test from 'node:test';
import assert from 'node:assert/strict';
import {halProject,run,advance,pin} from './helpers.js';

test('HAL_DAC_SetValue drives PA4 (no trigger); ADC1 on PA0 wired to PA4 reads it back',()=>{
 const p=halProject({pins:{PA4:pin('DAC_OUT1'),PA0:pin('ADC1_IN0')},peripherals:{DAC:{enabled:true},ADC1:{enabled:true}},
  wires:[{id:'w',from:'board:CN8:3',to:'board:CN8:1',color:'#23a68a'}],
  init:'  HAL_DAC_Start(&hdac, DAC_CHANNEL_1);\n  HAL_DAC_SetValue(&hdac, DAC_CHANNEL_1, DAC_ALIGN_12B_R, 1241);',
  loop:'    HAL_ADC_Start(&hadc1);\n    HAL_ADC_PollForConversion(&hadc1, 10);\n    printf("dac=%lu adc=%lu\\n", HAL_DAC_GetValue(&hdac, DAC_CHANNEL_1), HAL_ADC_GetValue(&hadc1));\n    HAL_Delay(100);'});
 assert.match(p.code,/sConfig\.DAC_Trigger = DAC_TRIGGER_NONE;[\s\S]*HAL_DAC_ConfigChannel\(&hdac, &sConfig, DAC_CHANNEL_1\)/);
 const {s,output}=run(p);advance(s,250,10);
 assert.ok(Math.abs(s.runtime.gpio.PA4.value-1241/4095*3.3)<1e-9,JSON.stringify(s.runtime.gpio.PA4));
 const line=output.find(l=>l.startsWith('dac='));assert.ok(line,output.join('|'));const adc=Number(/adc=(\d+)/.exec(line)[1]);
 assert.ok(/dac=1241/.test(line)&&Math.abs(adc-1241)<=8,line);
});

test('TIM6 TRGO + circular DMA plays the table on PA4 with half/complete callbacks; TIM7 TRGO triangle on PA5',()=>{
 const p=halProject({pins:{PA4:pin('DAC_OUT1'),PA5:pin('DAC_OUT2')},
  peripherals:{DAC:{enabled:true,channels:{OUT1:{trigger:'T6_TRGO'},OUT2:{trigger:'T7_TRGO',wave:'TRIANGLE',amplitude:3}}},TIM6:{enabled:true,prescaler:15999,period:9,trgo:'UPDATE'},TIM7:{enabled:true,prescaler:15999,period:4,trgo:'UPDATE'}},
  dma:{DAC1:{stream:'DMA1_Stream5',channel:7,mode:'circular',priority:'low'}},nvic:{DMA1_Stream5_IRQn:{enabled:true,priority:0}},
  globals:'const uint16_t steps[4] = {0, 1365, 2730, 4095};\nvolatile uint32_t halves, fulls;',
  init:'  HAL_DAC_Start_DMA(&hdac, DAC_CHANNEL_1, (uint32_t *)steps, 4, DAC_ALIGN_12B_R);\n  HAL_DAC_Start(&hdac, DAC_CHANNEL_2);\n  HAL_TIM_Base_Start(&htim6);\n  HAL_TIM_Base_Start(&htim7);',
  loop:'    printf("halves=%lu fulls=%lu\\n", halves, fulls);\n    HAL_Delay(100);',
  extra:'void HAL_DAC_ConvHalfCpltCallbackCh1(DAC_HandleTypeDef *h) { (void)h; halves++; }\nvoid HAL_DAC_ConvCpltCallbackCh1(DAC_HandleTypeDef *h) { (void)h; fulls++; }'});
 const {s,output}=run(p);const steps=new Set(),tri=[];
 for(let t=10;t<=405;t+=5){advance(s,t,5);steps.add(Math.round(s.runtime.gpio.PA4.value/3.3*3));tri.push(Math.round(s.runtime.gpio.PA5.value/3.3*4095));}
 assert.deepEqual([...steps].sort(),[0,1,2,3],'10 ms per step (1 kHz / 10)');
 assert.equal(Math.max(...tri),15);assert.ok(tri.includes(0)&&tri.includes(8),tri.join(','));
 const [,halves,fulls]=/halves=(\d+) fulls=(\d+)/.exec(output.filter(l=>l.startsWith('halves=')).at(-1)).map(Number);
 assert.ok(fulls>=8&&fulls<=10&&halves>=fulls,`halves=${halves} fulls=${fulls} in 400 ms (40 ms per table)`);
});

test('the DAC needs its pin, a TRGO-mode timer for DMA, and rates the circuit simulator can follow',()=>{
 const fails=(p,pattern)=>assert.throws(()=>{const {s}=run(p);advance(s,60,5);},pattern);
 fails(halProject({pins:{PA4:pin('DAC_OUT1')},peripherals:{DAC:{enabled:true,channels:{OUT1:{trigger:'T6_TRGO'}}},TIM6:{enabled:true,prescaler:15999,period:9}},dma:{DAC1:{stream:'DMA1_Stream5',channel:7,mode:'circular',priority:'low'}},
  globals:'uint16_t t[2];',init:'  HAL_DAC_Start_DMA(&hdac, DAC_CHANNEL_1, (uint32_t *)t, 2, DAC_ALIGN_12B_R);\n  HAL_TIM_Base_Start(&htim6);'}),/TIM6의 TRGO를 Update Event로 설정하세요/);
 fails(halProject({pins:{PA4:pin('DAC_OUT1')},peripherals:{DAC:{enabled:true,channels:{OUT1:{trigger:'T6_TRGO'}}},TIM6:{enabled:true,prescaler:0,period:99,trgo:'UPDATE'}},
  init:'  HAL_DAC_Start(&hdac, DAC_CHANNEL_1);\n  HAL_TIM_Base_Start(&htim6);'}),/DAC 갱신을 5000 Hz까지/);
});
