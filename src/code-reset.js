// main.c back to how its kind of project starts. The code is in Rust (rust/stm-core/src/ptools.rs; feature 62).
import {rustExact} from './rust-core.js';

/** A checked copy of the project with main.c reset: e² studio's empty hal_entry() for an FSP project, an empty sketch,
 *  an empty host program, or the code generated from the Pinout (with the generated _write / _read when USART2 is on).
 *  Its Docs bindings and the breakpoints of main.c go; the other sources stay. */
export const resetMainCode=original=>rustExact('reset_main_code',original);
