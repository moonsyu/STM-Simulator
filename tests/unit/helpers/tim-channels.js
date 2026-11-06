// The HAL PWM example (TIM2 CH1) with a second channel CH2 and per-channel settings, for the TIM channel tests.
import {applyHalExample} from '../../../src/hal-examples.js';
import {blankProject} from '../../../src/project.js';

export function twoChannels(base=blankProject(),channels){
 const p=applyHalExample(base,'pwm');
 // CH2 next to the example's CH1: PA1 (F446RE AF1), or the F103RB remap group of CH1 (PA0 → PA1, PA15 → PB3).
 const ch1=Object.keys(p.mcu.pins).find(pin=>p.mcu.pins[pin].function==='TIM2_CH1');
 p.mcu.pins[ch1==='PA15'?'PB3':'PA1']={function:'TIM2_CH2',pull:'NOPULL',edge:'FALLING',label:'',initial:0};
 Object.assign(p.mcu.peripherals.TIM2,{pulse:250,channels});
 // The averaged PWM level (duty on the pin), not the toggling waveform the example turns on.
 p.simulation={...(p.simulation||{}),pwmWaveform:false};
 return p;
}
