// The STM32 HAL main.c a Pinout configuration generates, as CubeMX would write it into one file: handles, main,
// SystemClock_Config, MX_*_Init of every enabled peripheral, interrupt handlers and callbacks.
// The code is in Rust (rust/stm-core/src/halgen.rs; feature 62): this file is what the JavaScript callers import.
import {rustFn} from './rust-core.js';

/** printf / scanf go to USART2 when it is enabled as an asynchronous UART that can transmit. */
export const stdioUart=config=>rustFn('stdio_uart',{peripherals:{USART2:config.peripherals?.USART2}});
/** The HSI plan of the older single clock setting (F446): {source, apb1, n, divider, latency}, or throws. */
export const clockPlan=hz=>rustFn('clock_plan',hz);
// STM32F103: SYSCLK = HSI 8 MHz, or HSI/2 × PLLMUL (2..16): {source, apb1, mul, latency}, or throws.
export const clockPlanF1=hz=>rustFn('clock_plan_f1',hz);
/** The generated main.c of a checked configuration. `minimal`: no example code in main and no callbacks;
 *  `legacyGpio`: the pre-1.16 GPIO speed rule that removing old Docs code has to match. */
export const generateMain=(config,{minimal=false,legacyGpio=false}={})=>rustFn('generate_main',config,minimal,legacyGpio);
