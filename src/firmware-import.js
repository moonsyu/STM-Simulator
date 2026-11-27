// Bringing in a CubeIDE project's files. The code is in Rust (rust/stm-core/src/ptools.rs; feature 62).
import {rustExact} from './rust-core.js';

/**
 * The project with the files [{name, text}] of a CubeIDE project: an .ioc becomes its Pinout, main.c (at the top or in
 * Core/Src) its main source, the other .c / .h files its sources, and the startup code and linker script of this
 * board's MCU come along. Only an .ioc: main.c is generated again from the new settings, USER CODE sections kept.
 * Returns {project, warnings, regenerated}; throws with the reason when the files cannot be taken.
 */
export const importFirmware=(project,files)=>rustExact('import_firmware',project,files);
