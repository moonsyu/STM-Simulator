// ADC1 Sampling Time (CubeMX Rank 1): the choices per family, the HAL macro in the generated main.c (the longest time
// stays the default the app always generated), and the .ioc value (missing = CubeMX's default, the shortest).
import test from 'node:test';
import assert from 'node:assert/strict';
import {ADC_SAMPLING,adcSamplingMacro,adcSamplingOf,validateMcu,generateHal,importIoc,defaultMcu} from '../../src/mcu-config.js';

const adc=(family,extra={})=>{const m=defaultMcu(family);m.pins.PA0={function:'ADC1_IN0',pull:'NOPULL',edge:'RISING',label:'',initial:0};m.peripherals.ADC1={enabled:true,...extra};return validateMcu(m);};

test('HAL macros for every choice; the default stays the longest (480 / 239.5 cycles) and is not stored',()=>{
 assert.deepEqual(ADC_SAMPLING.STM32F446RE.map(adcSamplingMacro),['ADC_SAMPLETIME_3CYCLES','ADC_SAMPLETIME_15CYCLES','ADC_SAMPLETIME_28CYCLES','ADC_SAMPLETIME_56CYCLES','ADC_SAMPLETIME_84CYCLES','ADC_SAMPLETIME_112CYCLES','ADC_SAMPLETIME_144CYCLES','ADC_SAMPLETIME_480CYCLES']);
 assert.deepEqual(ADC_SAMPLING.STM32F103RB.map(adcSamplingMacro),['ADC_SAMPLETIME_1CYCLE_5','ADC_SAMPLETIME_7CYCLES_5','ADC_SAMPLETIME_13CYCLES_5','ADC_SAMPLETIME_28CYCLES_5','ADC_SAMPLETIME_41CYCLES_5','ADC_SAMPLETIME_55CYCLES_5','ADC_SAMPLETIME_71CYCLES_5','ADC_SAMPLETIME_239CYCLES_5']);
 assert.match(generateHal(adc('STM32F446RE')),/sConfig\.SamplingTime = ADC_SAMPLETIME_480CYCLES;/);
 assert.match(generateHal(adc('STM32F103RB')),/sConfig\.SamplingTime = ADC_SAMPLETIME_239CYCLES_5;/);
 assert.equal(adc('STM32F446RE',{samplingTime:480}).peripherals.ADC1.samplingTime,undefined);
});

test('a chosen time is kept and generated; one the family lacks is refused',()=>{
 const f4=adc('STM32F446RE',{samplingTime:15});assert.equal(adcSamplingOf(f4),15);assert.match(generateHal(f4),/ADC_SAMPLETIME_15CYCLES;/);
 const f1=adc('STM32F103RB',{samplingTime:7.5});assert.match(generateHal(f1),/ADC_SAMPLETIME_7CYCLES_5;/);
 assert.throws(()=>adc('STM32F103RB',{samplingTime:15}),/ADC1 Sampling Time: 1\.5 \/ 7\.5/);
 assert.throws(()=>adc('STM32F446RE',{samplingTime:'480'}),/Sampling Time/);
});

test('.ioc: the Rank 1 value is read, and a missing one is CubeMX\'s default (3 / 1.5 cycles)',()=>{
 const base=['Mcu.Family=STM32F4','Mcu.UserName=STM32F446RETx','Mcu.IP0=ADC1','PA0-WKUP.Signal=ADCx_IN0','PA0-WKUP.Mode=IN0'];
 assert.equal(importIoc([...base,'ADC1.SamplingTime-0\\#ChannelRegularConversion=ADC_SAMPLETIME_56CYCLES'].join('\n')).config.peripherals.ADC1.samplingTime,56);
 assert.equal(importIoc([...base,'ADC1.SamplingTime-0\\#ChannelRegularConversion=ADC_SAMPLETIME_480CYCLES'].join('\n')).config.peripherals.ADC1.samplingTime,undefined,'the default is not stored');
 assert.equal(importIoc(base.join('\n')).config.peripherals.ADC1.samplingTime,3);
 const f1=['Mcu.Family=STM32F1','Mcu.UserName=STM32F103RBTx','Mcu.IP0=ADC1','PA0-WKUP.Signal=ADCx_IN0','PA0-WKUP.Mode=IN0'];
 assert.equal(importIoc([...f1,'ADC1.SamplingTime-0\\#ChannelRegularConversion=ADC_SAMPLETIME_71CYCLES_5'].join('\n')).config.peripherals.ADC1.samplingTime,71.5);
 assert.equal(importIoc(f1.join('\n')).config.peripherals.ADC1.samplingTime,1.5);
});
