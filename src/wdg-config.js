// Watchdogs (CubeMX System Core › IWDG / WWDG) on both boards. IWDG counts the LSI (F446 32 kHz, F103 40 kHz) down from
// Reload; HAL_IWDG_Refresh must come before it reaches 0. WWDG counts PCLK1 / 4096 / Prescaler down from Counter: a refresh
// is allowed only once the counter is at or below Window, and the MCU resets when the counter passes 0x40 → 0x3F; the
// early wakeup interrupt (WWDG_IRQn) comes at 0x40.
// The code is in Rust (rust/stm-core/src/mcu.rs; feature 62): this file is what the JavaScript callers import.
import {rustFn,rustPure,rustTable,orNaN,withNumbers,iocPart} from './rust-core.js';

const T=rustTable('wdg_tables');
export const IWDG_PRESCALERS=T.iwdg;
export const WWDG_PRESCALERS=T.wwdg;
const lsiOf=rustPure('lsi_hz');
export const lsiHz=family=>lsiOf(String(family));
const clockPart=config=>({family:config.family,clock:config.clock,timerClockHz:config.timerClockHz});
// APB1 clock: from the Clock tab, otherwise from the single APB1 timer clock (APB1 is divided above 45 / 36 MHz).
export function pclk1Hz(config){
 const hz=rustFn('pclk1_hz',clockPart(config));
 return hz===null?(config.clock?NaN:config.timerClockHz):hz;
}
export const validateIwdg=p=>({enabled:p.enabled,...rustFn('validate_iwdg',{prescaler:p.prescaler,reload:p.reload})});
export const validateWwdg=p=>({enabled:p.enabled,...rustFn('validate_wwdg',{prescaler:p.prescaler,window:p.window,counter:p.counter,ewi:p.ewi})});
/** IWDG timeout in ms: (Reload + 1) × Prescaler / LSI. */
export const iwdgTimeoutMs=(p,family)=>orNaN(rustFn('iwdg_timeout_ms',{reload:p.reload,prescaler:p.prescaler},String(family)));
/** WWDG timing in ms: one count, the earliest allowed refresh after a refresh, and the reset. */
export function wwdgTiming(p,config){
 const t=rustFn('wwdg_timing',{prescaler:p.prescaler,window:p.window,counter:p.counter},clockPart(config));
 return {tickMs:orNaN(t.tickMs),openMs:orNaN(t.openMs),resetMs:orNaN(t.resetMs)};
}
export const iwdgInitLines=p=>rustFn('iwdg_init_lines',{prescaler:p.prescaler,reload:p.reload});
export const wwdgInitLines=p=>rustFn('wwdg_init_lines',{prescaler:p.prescaler,window:p.window,counter:p.counter,ewi:p.ewi});
/** CubeMX .ioc keys: IWDG.Prescaler=IWDG_PRESCALER_32, IWDG.Reload=…; WWDG.Prescaler, WWDG.Window, WWDG.Counter, WWDG.EWIMode.
 *  `number(raw, fallback)`: the caller's reader of a .ioc number. */
export const iwdgFromIoc=(values,number)=>withNumbers(rustFn('iwdg_from_ioc',iocPart(values,'IWDG.')),number);
export const wwdgFromIoc=(values,number)=>withNumbers(rustFn('wwdg_from_ioc',iocPart(values,'WWDG.')),number);
