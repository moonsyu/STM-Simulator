import {timerMax} from './timer-config.js';
import {familyProfile} from './mcu-family.js';
// CubeMX peripheral activation defaults, not register reset values.
// A fresh configuration uses the full ARR width of each timer.
// See docs/MCU-DEFAULTS.md for the preset and supported scope.
export const DEFAULT_TIMER_CLOCK_HZ=16000000;
export const EXAMPLE_TIMER_CLOCK_HZ=84000000;
export const timerDefaults=(id,family)=>({enabled:false,prescaler:0,period:family?familyProfile(family).timerMax(id):timerMax(id),pulse:0,mode:'base'});
