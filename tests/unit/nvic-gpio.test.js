// CubeMX NVIC (priority group, preemption/sub priority, time base) and GPIO (output type, maximum output speed) settings.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generateHal,defaultMcu,validateMcu,configProblems,importIoc} from '../../src/mcu-config.js';
import {irqLabel,peripheralIrqs,irqAvailable,priorityLimits} from '../../src/nvic-config.js';
import {defaultSpeed} from '../../src/gpio-config.js';

const pin=(fn,extra={})=>({function:fn,pull:'NOPULL',initial:0,label:'',edge:'RISING',...extra});
const F4='STM32F446RE',F1='STM32F103RB';

test('GPIO speed follows CubeMX defaults: outputs and timer channels Low, communication pins Very High (F1: High); inputs get none',()=>{
 for(const [family,fast]of [[F4,'VERY_HIGH'],[F1,'HIGH']]){
  const m=defaultMcu(family);m.pins={PA5:pin('GPIO_Output'),PA6:pin('GPIO_Input'),PC13:pin('GPIO_EXTI'),PA2:pin('USART2_TX'),PA3:pin('USART2_RX')};m.peripherals.USART2={enabled:true,baud:115200};
  const code=generateHal(validateMcu(m)),block=p=>new RegExp(`GPIO_InitStruct\\.Pin = GPIO_PIN_${p};[\\s\\S]*?HAL_GPIO_Init`).exec(code)[0];
  assert.match(block(5),/GPIO_SPEED_FREQ_LOW/,family);assert.doesNotMatch(block(6),/Speed/,family);assert.doesNotMatch(block(13),/Speed/,family);
  assert.match(code,new RegExp(`GPIO_SPEED_FREQ_${fast}`),family);
  assert.equal(defaultSpeed('TIM2_CH1',family===F1),'LOW');
 }
});

test('an Open Drain output and a chosen speed reach HAL_GPIO_Init; F1 has no Very High',()=>{
 const m=defaultMcu(F4);m.pins={PA5:pin('GPIO_Output',{outputType:'OD',speed:'MEDIUM'})};
 const code=generateHal(validateMcu(m));assert.match(code,/GPIO_MODE_OUTPUT_OD/);assert.match(code,/GPIO_SPEED_FREQ_MEDIUM/);
 assert.deepEqual(validateMcu(m).pins.PA5,{function:'GPIO_Output',pull:'NOPULL',edge:'RISING',label:'',initial:0,speed:'MEDIUM',outputType:'OD'});
 const f1=defaultMcu(F1);f1.pins={PA5:pin('GPIO_Output',{speed:'VERY_HIGH'})};assert.throws(()=>validateMcu(f1),/Low \/ Medium \/ High/);
 m.pins.PA5.outputType='XX';assert.throws(()=>validateMcu(m),/Push Pull 또는 Open Drain/);
});

test('NVIC priority group, sub priority and time base are generated after HAL_Init(); ranges follow the group',()=>{
 const m=defaultMcu(F4);m.pins={PC13:pin('GPIO_EXTI')};m.nvic.EXTI15_10_IRQn={enabled:true,priority:1,sub:2};m.nvicGroup=2;m.tickPriority=3;
 const clean=validateMcu(m),code=generateHal(clean);
 assert.equal(clean.nvicGroup,2);assert.equal(clean.tickPriority,3);assert.equal(clean.nvic.EXTI15_10_IRQn.sub,2);
 assert.match(code,/HAL_Init\(\);\s*HAL_NVIC_SetPriorityGrouping\(NVIC_PRIORITYGROUP_2\);\s*HAL_InitTick\(3\);\s*SystemClock_Config\(\);/);
 assert.match(code,/HAL_NVIC_SetPriority\(EXTI15_10_IRQn, 1, 2\);/);
 // Group 4 (HAL default) and SysTick 15 (TICK_INT_PRIORITY) are not stored and add no code.
 const plain=validateMcu({...m,nvicGroup:4,tickPriority:15});assert.equal(plain.nvicGroup,undefined);assert.equal(plain.tickPriority,undefined);
 assert.doesNotMatch(generateHal({...plain,nvic:{EXTI15_10_IRQn:{enabled:true,priority:1}}}),/SetPriorityGrouping|HAL_InitTick/);
 assert.deepEqual(priorityLimits(2),{preempt:3,sub:3});
 assert.match(configProblems(validateMcu({...m,nvic:{EXTI15_10_IRQn:{enabled:true,priority:5}}})).join('\n'),/선점 우선순위\(Preemption\)는 0~3/);
 assert.match(configProblems(validateMcu({...m,nvicGroup:4,nvic:{EXTI15_10_IRQn:{enabled:true,priority:0,sub:1}}})).join('\n'),/서브 우선순위\(Sub\)는 0~0/);
 assert.match(configProblems(validateMcu({...m,tickPriority:9})).join('\n'),/SysTick_IRQn\(Time base\)/);
});

test('NVIC rows use CubeMX names; peripheral NVIC Settings and the available filter pick the right lines',()=>{
 assert.equal(irqLabel('USART2_IRQn'),'USART2 global interrupt');assert.equal(irqLabel('EXTI15_10_IRQn'),'EXTI line[15:10] interrupts');assert.equal(irqLabel('EXTI0_IRQn'),'EXTI line0 interrupt');
 assert.equal(irqLabel('I2C1_EV_IRQn'),'I2C1 event interrupt');assert.equal(irqLabel('DMA1_Stream5_IRQn'),'DMA1 stream5 global interrupt');assert.equal(irqLabel('DMA1_Channel6_IRQn'),'DMA1 channel6 global interrupt');
 assert.deepEqual(peripheralIrqs(F4,'I2C1'),['I2C1_EV_IRQn','I2C1_ER_IRQn']);assert.deepEqual(peripheralIrqs(F4,'ADC1'),['ADC_IRQn']);assert.deepEqual(peripheralIrqs(F1,'ADC1'),['ADC1_2_IRQn']);assert.deepEqual(peripheralIrqs(F4,'TIM2'),['TIM2_IRQn']);
 const m=defaultMcu(F4);m.pins={PC13:pin('GPIO_EXTI'),PA2:pin('USART2_TX'),PA3:pin('USART2_RX')};m.peripherals.USART2={enabled:true,baud:115200};
 assert.equal(irqAvailable(m,'EXTI15_10_IRQn'),true);assert.equal(irqAvailable(m,'USART2_IRQn'),true);assert.equal(irqAvailable(m,'EXTI0_IRQn'),false);assert.equal(irqAvailable(m,'TIM2_IRQn'),false);
});

test('.ioc import keeps GPIO speed / open drain, NVIC sub priority, priority group and SysTick priority',()=>{
 const ioc=['Mcu.Name=STM32F446R(C-E)Tx','PA5.Signal=GPIO_Output','PA5.GPIO_Speed=GPIO_SPEED_FREQ_HIGH','PA5.GPIO_ModeDefaultOutputPP=GPIO_MODE_OUTPUT_OD',
  'PC13.Signal=GPXTI13','NVIC.EXTI15_10_IRQn=true\\:1\\:1\\:true\\:false\\:true\\:true\\:true\\:true','NVIC.PriorityGroup=NVIC_PRIORITYGROUP_2','NVIC.SysTick_IRQn=true\\:2\\:0\\:false\\:false\\:true\\:false\\:true\\:false'].join('\n');
 const {config}=importIoc(ioc);
 assert.equal(config.pins.PA5.speed,'HIGH');assert.equal(config.pins.PA5.outputType,'OD');
 assert.deepEqual(config.nvic.EXTI15_10_IRQn,{enabled:true,priority:1,sub:1});assert.equal(config.nvicGroup,2);assert.equal(config.tickPriority,2);
});
