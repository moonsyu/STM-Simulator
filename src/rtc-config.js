// RTC (CubeMX Pinout & Configuration › Timers › RTC) for NUCLEO-F446RE (STM32F4 RTC, RM0390 22) and NUCLEO-F103RB
// (STM32F1 RTC counter, RM0008 18): clock source, calendar time and date, alarm A and (F4) the wakeup timer.
// The project keeps `mcu.peripherals.RTC`; this module validates it, writes MX_RTC_Init and reads a CubeMX .ioc.
// The code is in Rust (rust/stm-core/src/mcu.rs; feature 62): this file is what the JavaScript callers import.
import {rustFn,rustPure,rustTable,withNumbers,iocPart} from './rust-core.js';

const T=rustTable('rtc_tables');
export const RTC_CLOCKS=T.clocks;
export const RTC_LSI_HZ=T.lsi;
export const RTC_WEEKDAYS=T.weekdays;
export const RTC_MONTHS=T.months;
// RTCEx wakeup clock (F4): RTCCLK/16, /8, /4, /2 or ck_spre (1 Hz) with a 16-bit counter.
export const RTC_WAKEUP_CLOCKS=T.wakeupClocks;

export const rtcDefaults=()=>rustFn('rtc_defaults');
const prescalersOf=rustPure('rtc_prescalers'),clockHzOf=rustPure('rtc_clock_hz');
// Asynchronous / synchronous prescalers for a 1 Hz calendar (F4: (A+1)(S+1) = RTC clock).
export const rtcPrescalers=(family,source)=>({...prescalersOf(String(family),String(source))});
export const rtcClockHz=(family,source)=>clockHzOf(String(family),String(source));

/** A checked copy of the project's RTC settings, or throws with the reason (Korean, shown in the Pinout). */
export const validateRtc=(p,family)=>({enabled:p.enabled,...rustFn('validate_rtc',p,String(family))});
/** Wakeup period in seconds: (counter + 1) ticks of RTCCLK/n or of the 1 Hz ck_spre. */
export const rtcWakeupSeconds=(rtc,family)=>rustFn('rtc_wakeup_seconds',{clockSource:rtc.clockSource,wakeUp:rtc.wakeUp},String(family));
/** MX_RTC_Init body lines (CubeMX order, with the clock part CubeMX puts in HAL_RTC_MspInit / SystemClock_Config). */
export const rtcInitLines=config=>rustFn('rtc_init_lines',{family:config.family,peripherals:{RTC:config.peripherals.RTC},nvic:{RTC_Alarm_IRQn:config.nvic?.RTC_Alarm_IRQn,RTC_WKUP_IRQn:config.nvic?.RTC_WKUP_IRQn}});
/** RTC settings from CubeMX .ioc keys (RTC.Hours, RTC.WeekDay, RTC.Hours_A, RTC.WakeUpCounter, RCC.RTCClockSelection, VP_RTC_*).
 *  `number(raw, fallback)`: the caller's reader of a .ioc number. */
export const rtcFromIoc=(values,family,number)=>withNumbers(rustFn('rtc_from_ioc',iocPart(values,'RTC.','RCC.RTC','VP_RTC_'),String(family)),number);
