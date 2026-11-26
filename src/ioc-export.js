// Pinout settings as a CubeMX .ioc (the inverse of importIoc in mcu-config.js): MCU, pins and their GPIO properties,
// peripheral parameters, DMA, NVIC and the clock tree, with the key names CubeMX writes. importIoc(exportIoc(mcu)) gives
// the same settings back (tests/unit/ioc-export.test.js runs that over many configurations).
// What is not written: CubeMX's own pin names with alternate labels (PA0-WKUP, PC13-TAMPER-RTC: plain PA0 / PC13 are
// used), the Project Manager section and the computed RCC *Freq_Value numbers beyond the timer clock. Opening the file
// in CubeMX itself has not been checked here (no CubeMX on the build PCs).
// The work is done in Rust (rust/stm-core/src/iocout.rs, feature 62); this file is the JavaScript side of it.
import {rustFn} from './rust-core.js';

/** Pins the export leaves out, with the reason: a Reserved pin whose CubeMX signal is not known (set by an example,
 * not read from an .ioc). The caller shows them, so the loss is not silent. */
export const unexportedPins=config=>rustFn('unexported_pins',config);
export const exportIoc=config=>rustFn('export_ioc',config);
