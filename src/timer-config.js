// Timers of the Pinout screen: pin routes (STM32F446RE, DS10693), names of their interrupts, alternate functions.
// The code is in Rust (rust/stm-core/src/periph.rs; feature 62): this file is what the JavaScript callers import.
import {rustPure,rustTable} from './rust-core.js';

const T=rustTable('timer_tables');
export const TIMER_ROUTES=T.routes;
export const TIMER_IDS=T.ids;
export const BASIC_TIMERS=T.basic;
// The timers whose channels reach pins (an alternate function).
export const CHANNEL_TIMER_IDS=T.channelIds;
export const ADVANCED_TIMERS=T.advanced;
export const TIMER_MODES=T.modes;
// TRGO Parameters › Trigger Event Selection (TIMx_CR2 MMS): Reset (UG bit), Enable (CNT_EN), Update Event.
export const TIM_TRGO=T.trgo;

const name=id=>typeof id==='string'?id:String(id);
const isTimerOf=rustPure('is_timer'),isBasicOf=rustPure('is_basic_timer'),isAdvancedOf=rustPure('is_advanced_timer');
const irqOf=rustPure('timer_irq'),ccIrqOf=rustPure('timer_cc_irq'),ofIrq=rustPure('timer_of_irq'),afOf=rustPure('timer_af'),maxOf=rustPure('timer_max');
export const isTimer=id=>isTimerOf(name(id));
export const isBasicTimer=id=>isBasicOf(name(id));
export const isAdvancedTimer=id=>isAdvancedOf(name(id));
/** The NVIC line of a timer's update interrupt (`f1`: STM32F1 names). */
export const timerIrq=(id,f1=false)=>irqOf(name(id),!!f1);
/** The NVIC line of a timer's capture / compare interrupts. */
export const timerCcIrq=(id,f1=false)=>ccIrqOf(name(id),!!f1);
/** The timer an NVIC line belongs to ('TIM6_DAC_IRQn' → 'TIM6', 'TIM1_CC_IRQn' → 'TIM1'), or null. */
export const timerOfIrq=irq=>ofIrq(name(irq));
export const timerAf=id=>afOf(name(id));
export const timerMax=id=>maxOf(name(id));
