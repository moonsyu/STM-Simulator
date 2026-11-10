// Advanced timers TIM1 / TIM8 (timer-config.js): routes, interrupt lines per family, alternate functions, .ioc import.
import test from 'node:test';
import assert from 'node:assert/strict';
import {importIoc} from '../../src/mcu-config.js';
import {routesOf,irqNamesOf} from '../../src/mcu-family.js';
import {timerIrq,timerCcIrq,timerOfIrq,timerAf,isAdvancedTimer} from '../../src/timer-config.js';
import {afNumber} from '../../src/emu/stm32f446/tables.js';
import {signalPins} from '../../src/emu/stm32f103/tables.js';

test('routes and AF match the emulator pin tables; update and capture/compare lines per family',()=>{
 const f4=routesOf('STM32F446RE'),f1=routesOf('STM32F103RB');
 for(const id of ['TIM1','TIM8'])for(const [signal,pins]of Object.entries(f4[id]))for(const p of pins)assert.equal(afNumber(p,`${id}_${signal}`),timerAf(id),`${id}_${signal} on ${p}`);
 assert.deepEqual(f1.TIM1,{CH1:['PA8'],CH2:['PA9'],CH3:['PA10'],CH4:['PA11'],CH1N:['PB13','PA7'],CH2N:['PB14','PB0'],CH3N:['PB15','PB1']});
 const fixed=signalPins(0);for(const [signal,pins]of Object.entries(f1.TIM1))assert.equal(fixed['TIM1_'+signal],pins[0],signal);
 assert.ok(!f1.TIM8);assert.ok(isAdvancedTimer('TIM8')&&!isAdvancedTimer('TIM2'));
 assert.deepEqual([timerIrq('TIM1'),timerIrq('TIM1',true),timerCcIrq('TIM1'),timerIrq('TIM8'),timerCcIrq('TIM8'),timerIrq('TIM3'),timerCcIrq('TIM3')],['TIM1_UP_TIM10_IRQn','TIM1_UP_IRQn','TIM1_CC_IRQn','TIM8_UP_TIM13_IRQn','TIM8_CC_IRQn','TIM3_IRQn','TIM3_IRQn']);
 for(const irq of ['TIM1_UP_TIM10_IRQn','TIM1_UP_IRQn','TIM1_CC_IRQn'])assert.equal(timerOfIrq(irq),'TIM1');
 for(const irq of ['TIM1_UP_TIM10_IRQn','TIM1_CC_IRQn','TIM8_UP_TIM13_IRQn','TIM8_CC_IRQn'])assert.ok(irqNamesOf('STM32F446RE').includes(irq),irq);
 assert.ok(irqNamesOf('STM32F103RB').includes('TIM1_UP_IRQn')&&!irqNamesOf('STM32F103RB').includes('TIM1_UP_TIM10_IRQn'));
 assert.equal(irqNamesOf('STM32F446RE').filter(n=>n==='TIM2_IRQn').length,1,'no duplicate lines');
});

test('.ioc import: TIM1 PWM with a complementary output, repetition counter, dead time and its NVIC lines',()=>{
 const {config,warnings}=importIoc(['Mcu.Name=STM32F446R(C-E)Tx','Mcu.CPN=STM32F446RET6','Mcu.IP0=NVIC','Mcu.IP1=RCC','Mcu.IP2=SYS','Mcu.IP3=TIM1',
  'PA8.Signal=S_TIM1_CH1','PB13.Signal=S_TIM1_CH1N','PA9.Signal=S_TIM1_CH2','SH.S_TIM1_CH1.0=TIM1_CH1,PWM Generation1 CH1 CH1N','SH.S_TIM1_CH1N.0=TIM1_CH1N,PWM Generation1 CH1 CH1N','SH.S_TIM1_CH2.0=TIM1_CH2,PWM Generation2 CH2',
  'TIM1.Channel-PWM\\ Generation1\\ CH1\\ CH1N=TIM_CHANNEL_1','TIM1.Channel-PWM\\ Generation2\\ CH2=TIM_CHANNEL_2','TIM1.Prescaler=15','TIM1.Period=999','TIM1.Pulse-PWM\\ Generation1\\ CH1\\ CH1N=250','TIM1.Pulse-PWM\\ Generation2\\ CH2=500',
  'TIM1.RepetitionCounter=3','TIM1.DeadTime=20','NVIC.TIM1_UP_TIM10_IRQn=true\\:2\\:0\\:false\\:false\\:true\\:true\\:true\\:true','NVIC.TIM1_CC_IRQn=true\\:1\\:0\\:false\\:false\\:true\\:true\\:true\\:true'].join('\n'));
 assert.deepEqual(warnings,[]);
 assert.equal(config.pins.PB13.function,'TIM1_CH1N');
 const t=config.peripherals.TIM1;assert.equal(t.mode,'pwm');assert.equal(t.prescaler,15);assert.equal(t.period,999);assert.equal(t.repetition,3);assert.equal(t.deadTime,20);
 assert.deepEqual([t.channels?.CH1?.pulse??t.pulse,t.channels?.CH2?.pulse??t.pulse].sort(),[250,500]);
 assert.deepEqual(config.nvic.TIM1_UP_TIM10_IRQn,{enabled:true,priority:2});assert.deepEqual(config.nvic.TIM1_CC_IRQn,{enabled:true,priority:1});
});
