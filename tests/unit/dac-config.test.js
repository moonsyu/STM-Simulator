// DAC settings (dac-config.js, NUCLEO-F446RE): channel rules, pins, DMA requests, the shared TIM6_DAC_IRQn, .ioc import.
import test from 'node:test';
import assert from 'node:assert/strict';
import {validateMcu,generateHal,importIoc,configProblems,defaultMcu} from '../../src/mcu-config.js';
import {peripheralIrqs} from '../../src/nvic-config.js';
import {buildEnvironment} from '../../src/build-environment.js';

const pin=fn=>({function:fn,pull:'NOPULL',edge:'RISING',label:'',initial:0});
const mcu=(dac,pins={PA4:pin('DAC_OUT1')},extra={})=>({...defaultMcu(),pins,peripherals:{DAC:{enabled:true,...dac}},...extra});

test('channel settings: defaults are not stored, a wave needs a trigger, the pin must be the channel\'s; no DAC on the F103RB',()=>{
 assert.deepEqual(validateMcu(mcu({channels:{OUT1:{trigger:'NONE',buffer:true,wave:'NONE'}}})).peripherals.DAC,{enabled:true});
 assert.deepEqual(validateMcu(mcu({channels:{OUT1:{trigger:'T6_TRGO',wave:'NOISE',amplitude:11,buffer:false}}})).peripherals.DAC.channels,{OUT1:{trigger:'T6_TRGO',buffer:false,wave:'NOISE',amplitude:11}});
 assert.throws(()=>validateMcu(mcu({channels:{OUT1:{wave:'TRIANGLE'}}})),/트리거가 있을 때만/);
 assert.throws(()=>validateMcu(mcu({channels:{OUT1:{trigger:'T6_TRGO',wave:'TRIANGLE',amplitude:12}}})),/0~11/);
 assert.throws(()=>validateMcu(mcu({channels:{OUT3:{}}})),/OUT1 또는 OUT2/);
 assert.deepEqual(configProblems(validateMcu(mcu({},{}))),['DAC: 출력 핀(PA4 DAC_OUT1 또는 PA5 DAC_OUT2)을 활성화하세요.']);
 assert.deepEqual(configProblems(validateMcu(mcu({channels:{OUT2:{trigger:'SOFTWARE'}}}))),['DAC OUT2: 설정이 있지만 PA5 핀이 DAC_OUT2가 아닙니다.']);
 assert.throws(()=>validateMcu({...defaultMcu('STM32F103RB'),peripherals:{DAC:{enabled:true}}}),/DAC: STM32F103RB에서 지원하지 않는 주변장치입니다/);
});

test('DMA DAC1/DAC2 on DMA1 streams 5/6 linked as DMA_Handle1/2; TIM6_DAC_IRQn serves TIM6 and the DAC together',()=>{
 const c=mcu({channels:{OUT1:{trigger:'T6_TRGO'}}},{PA4:pin('DAC_OUT1')},{dma:{DAC1:{stream:'DMA1_Stream5',channel:7,mode:'circular',priority:'high'}},nvic:{TIM6_DAC_IRQn:{enabled:true,priority:0}}});
 c.peripherals.TIM6={enabled:true,prescaler:0,period:99,trgo:'UPDATE'};
 const v=validateMcu(c),code=generateHal(v);assert.deepEqual(configProblems(v),[]);
 assert.match(code,/hdma_dac1\.Init\.PeriphDataAlignment = DMA_PDATAALIGN_HALFWORD;[\s\S]*__HAL_LINKDMA\(&hdac, DMA_Handle1, hdma_dac1\);/);
 assert.doesNotMatch(code,/HAL_DAC_Start\(&hdac, DAC_CHANNEL_1\)/,'a DMA channel is started by the user with its table');
 assert.match(code,/void TIM6_DAC_IRQHandler\(void\) \{[\s\S]*?HAL_TIM_IRQHandler\(&htim6\);\n\s*HAL_DAC_IRQHandler\(&hdac\);/);
 assert.deepEqual(peripheralIrqs('STM32F446RE','DAC'),['TIM6_DAC_IRQn']);
 // The DAC alone may keep TIM6_DAC_IRQn on (DMA underrun), and the build environment then serves only the DAC.
 const dacOnly=validateMcu(mcu({},{PA4:pin('DAC_OUT1')},{nvic:{TIM6_DAC_IRQn:{enabled:true,priority:0}}}));
 assert.deepEqual(configProblems(dacOnly),[]);assert.match(buildEnvironment({code:'',mcu:dacOnly}).text,/void TIM6_DAC_IRQHandler\(void\) \{ HAL_DAC_IRQHandler\(&hdac\); \}/);
});

test('.ioc: COMP_DACn_group pins, DAC.DAC_Trigger / DAC_Trigger2 and the DAC1 DMA request',()=>{
 const ioc=['Mcu.Name=STM32F446R(C-E)Tx','Mcu.IP0=DAC','Mcu.IP1=DMA','PA4.Signal=COMP_DAC1_group','PA5.Signal=COMP_DAC2_group','DAC.DAC_Trigger=DAC_TRIGGER_T4_TRGO','DAC.DAC_Trigger2=DAC_TRIGGER_T5_TRGO',
  'DAC.IPParameters=DAC_Trigger,DAC_Trigger2','Dma.Request0=DAC1','Dma.RequestsNb=1','Dma.DAC1.0.Instance=DMA1_Stream5','Dma.DAC1.0.Mode=DMA_CIRCULAR','Dma.DAC1.0.Priority=DMA_PRIORITY_LOW'].join('\n');
 const {config,warnings}=importIoc(ioc);
 assert.equal(config.pins.PA4.function,'DAC_OUT1');assert.equal(config.pins.PA5.function,'DAC_OUT2');
 assert.deepEqual(config.peripherals.DAC,{enabled:true,channels:{OUT1:{trigger:'T4_TRGO'},OUT2:{trigger:'T5_TRGO'}}});
 assert.deepEqual(config.dma,{DAC1:{stream:'DMA1_Stream5',channel:7,mode:'circular',priority:'low'}});
 assert.deepEqual(warnings,[]);
});
