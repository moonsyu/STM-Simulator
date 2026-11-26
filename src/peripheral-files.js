// CubeMX › Project Manager › Code Generator › "Generate peripheral initialization as a pair of '.c/.h' files per
// peripheral": gpio.c/.h, i2c.c/.h, usart.c/.h … hold the handles and the MX_*_Init functions, and main.c includes the
// headers. The pairs are cut out of the one-file main.c the generator writes, so both forms always carry the same
// initialisation.
//
// The pairs are generated files (read only, like stm32xxxx_it.c): they are not stored in the project. A build adds them
// when a project source includes one of their headers — the Pinout option on, or a main.c pasted from a CubeIDE project
// that was generated this way.
// The code is in Rust (rust/stm-core/src/pfiles.rs; feature 62): this file is what the JavaScript callers import.
import {rustFn} from './rust-core.js';

/** One-file main.c text → {main: the main.c that includes the pairs, files: [{name:'i2c.h',text}, {name:'i2c.c',text}, …]}. */
export const splitMain=text=>rustFn('split_main',text);
/** The pairs for a Pinout configuration. */
export const peripheralFiles=(config,options)=>rustFn('peripheral_files',config,!!options?.minimal,!!options?.legacyGpio);
/** main.c for a Pinout configuration with the option on. */
export const generateSplitMain=(config,options)=>rustFn('generate_split_main',config,!!options?.minimal,!!options?.legacyGpio);
/** The generated pairs a build of this project adds: none unless a project source includes one of their headers; a
 * pair is left out when the project has a file of that name or already defines one of its init functions. */
export const generatedSources=project=>rustFn('generated_sources',{code:project?.code,mcu:project?.mcu,firmware:project?.firmware&&{mode:project.firmware.mode,files:project.firmware.files}});
/** The project's extra sources as a build sees them: its own files, then the generated pairs it includes. */
export function halFiles(project){return [...(project?.firmware?.files||[]),...generatedSources(project)];}
