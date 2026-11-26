// FSP project files for a Renesas RA board, as the RA Smart Configurator (RASC) / e² studio FSP Configurator writes
// them: ra_cfg/fsp_cfg (BSP and module configuration headers), ra_gen (clock, pins, instances, vectors, main.c,
// linker init tables) and script (linker scripts). The user's code is src/hal_entry.c; the app builds these with the
// FSP sources (BSP + r_* drivers) and ARM GCC, then runs the ELF on the RA6E1 emulator.
// The work is done in Rust (rust/stm-core/src/ragen.rs, the texts in ragen_text.rs; feature 62); this file is the
// JavaScript side of it.
import {rustPure,rustExact,sealed} from './rust-core.js';

const asked=name=>(...args)=>rustExact(name,...args);
/** The pin configuration word for ioport_pin_cfg_t (r_ioport.h ioport_cfg_options_t). */
export const pinCfgWord=asked('ra_pin_cfg_word');
/** PLL2 and UCLK settings that give the USB clock 48 MHz from the HOCO (`hocoMHz` 16, 18 or 20), or null. */
export const raUsbClock=asked('ra_usb_clock');
/** The FSP instances hal_data.c defines for an RA configuration, as the built-in interpreter declares them (fsp-interp.js). */
export const raInstances=asked('ra_instances');
const ioName=rustPure('ra_io_name');
/** "P408" → "BSP_IO_PORT_04_PIN_08". */
export const raIoName=pin=>ioName(sealed(pin));
/** PCLKA of an RA MCU configuration in Hz (the SCI clock). */
export const raPclka=asked('ra_pclka');
/** SCI asynchronous baud register settings closest to `baud` (CKS, BRR, ABCS, BGDM; no modulation), as RASC computes them. */
export const sciBaudSetting=asked('ra_sci_baud');
/** The interrupt slots the vector table allocates, in RASC order (first-come numbering from 0). */
export const raVectors=asked('ra_vectors');
/** Every generated file of an RA project, as {path: text} (paths relative to the build folder). */
export const generateRaFiles=(mcu,{board}={})=>rustExact('ra_generate_files',mcu,!!board?.fspBoard);
/** A new project's src/hal_entry.c, as e² studio's FSP template writes it (pins opened in R_BSP_WarmStart). */
export const raHalEntry=({blink}={})=>rustExact('ra_hal_entry',!!blink);
