// The code an STM32 ARM build adds to the project's sources (CubeIDE keeps it in Core/Src): interrupt handlers
// (stm32xxxx_it.c), newlib system calls (syscalls.c) and the heap (sysmem.c). The build compiles them as one file,
// __stm_environment.c; the editor shows the same text split into CubeIDE's files, read only.
// The work is done in Rust (rust/stm-core/src/buildenv.rs, feature 62); this file is the JavaScript side of it.
import {rustFn,rustTable} from './rust-core.js';
export const prefixOf=family=>rustFn('prefix_of',family);
export const startupOf=family=>rustFn('startup_of',family);
// The HAL modules the ARM build compiles from the SDK (CubeIDE's Drivers/<HAL>/Src).
export const HAL_MODULES=rustTable('hal_modules');
/** The linker script's file name as CubeIDE names it. */
export const linkerName=family=>rustFn('linker_name',family);
/** The linker script the ARM build uses unless the project has its own .ld file. */
export const linkerScript=family=>rustFn('linker_script',family);
// What the Rust side reads of a project: its main.c, the names and texts of its files and the Pinout settings.
const part=project=>{const files=project.firmware?.files;return {code:project.code,firmware:{files:Array.isArray(files)?files.map(f=>({name:f.name,text:f.text})):undefined},mcu:project.mcu};};
/** The main.h the ARM build writes when the project has none: the HAL include, Error_Handler and the Pinout labels. */
export const mainHeader=project=>rustFn('main_header',{mcu:project.mcu});
/** The build's added code for a HAL project: {text} for the build and {files} as CubeIDE would name them. */
export const buildEnvironment=project=>rustFn('build_environment',part(project));
