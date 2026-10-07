// Documented reset preset, not a CubeMX application/example configuration.
// RM0390 rev 9: RCC §6.2/6.3; TIM2–5 §17.4.1, §17.4.10–16.
// In particular §17.4.12 lists ARR=0 (not the timer's maximum value).
// See docs/MCU-DEFAULTS.md for the scope and ARR documentation caveat.
export const RESET_TIMER_CLOCK_HZ=16000000;
export const EXAMPLE_TIMER_CLOCK_HZ=84000000;
export const TIMER_RESET=Object.freeze({enabled:false,prescaler:0,period:0,pulse:0,mode:'base'});
