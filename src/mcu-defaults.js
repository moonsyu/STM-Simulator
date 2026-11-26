// CubeMX peripheral activation defaults, not register reset values. A fresh configuration uses the full ARR width of
// each timer. See docs/MCU-DEFAULTS.md for the preset and supported scope.
// The code is in Rust (rust/stm-core/src/periph.rs; feature 62): this file is what the JavaScript callers import.
import {rustFn,rustTable} from './rust-core.js';

const T=rustTable('timer_clocks');
export const DEFAULT_TIMER_CLOCK_HZ=T.default;
export const EXAMPLE_TIMER_CLOCK_HZ=T.example;
/** A new object each call: the caller edits it. */
export const timerDefaults=(id,family)=>rustFn('timer_defaults',String(id),family||null);
