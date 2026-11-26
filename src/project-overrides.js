// Feature 45: every file of the CubeIDE project tree is edited in place, as in CubeIDE. A file the app writes (what the
// build adds, the per-peripheral pairs) or reads from the STM32Cube SDK becomes a project file on its first edit — only
// that file is stored, under the path the tree shows it at, with `origin` ('gen' or 'sdk', and `of`: the SDK path).
// The build then compiles it in place of the generated / SDK one (native-build.cjs matches by file name).
//
// Two kinds of files, as STM32CubeMX treats them:
// - regenerated: main.c, main.h, stm32xxxx_it.c, stm32xxxx_hal_conf.h and the per-peripheral .c/.h pairs. Generating the
//   code again keeps only what is inside the USER CODE sections (main.c also moves new functions, globals and #includes
//   written outside them into sections, as before).
// - generated once: syscalls.c, sysmem.c, system_stm32xxxx.c, the startup file, the linker script and Drivers/ (HAL,
//   CMSIS). CubeMX does not write them again once they exist, so an edit stays.
// A file without `origin` is the user's own (a file they added or imported, or a copy made before 1.51.0 with
// "프로젝트로 복사해 수정"): it is never regenerated.
// The work is done in Rust (rust/stm-core/src/overrides.rs, feature 62); this file is the JavaScript side of it.
import {rustFn,rustPure} from './rust-core.js';

export const USER_SECTION=/(\/\* USER CODE BEGIN (.+?) \*\/)([\s\S]*?)(\/\* USER CODE END \2 \*\/)/g;
const armOnlyOf=rustPure('override_arm_only'),regeneratedOf=rustPure('override_regenerated'),kindOf=rustPure('override_file_kind');
/** Files the built-in interpreter does not compile: only the ARM GCC build uses an edit there. */
export const armOnly=name=>armOnlyOf(String(name));
/** Whether generating the code rewrites this file (only its USER CODE sections survive). */
export const regenerated=(name,family)=>regeneratedOf(String(name),family??null);
/** 'regen' | 'once' — how a file the app or the SDK provides is treated (see the top of this file). */
export const fileKind=(name,family)=>kindOf(String(name),family??null);
/** The project's overrides: files that started as a generated or SDK file. */
export const overrides=project=>(project?.firmware?.files||[]).filter(f=>f.origin==='gen'||f.origin==='sdk');
/** A file the tree also offers as generated / SDK: an override, or an older copy of one (same path, no origin). */
export function editedLabel(file,labels){return !!file&&(file.origin==='gen'||file.origin==='sdk'||labels.has(file.name));}
/** Lines of `current` that are the user's (not in `before`, the generated text they started from) and are not in `after`. */
export const lostLines=(current,before,after)=>rustFn('override_lost_lines',current,before,after);

// What the Rust side reads of a project, and its answer put on the project's own file objects (an untouched file stays
// the same object).
const part=(project,files)=>({code:project.code,mcu:project.mcu,firmware:{files:files.map(f=>({name:f.name,text:f.text,origin:f.origin,base:f.base}))}});
const applied=(files,{actions,report})=>({files:files.flatMap((f,i)=>actions[i]==='keep'?[f]:actions[i]==='drop'?[]:[{...f,...actions[i]}]),report});
/**
 * The project's regenerated overrides for a new Pinout (main.c is handled by regenerateMain): each takes the new
 * generated text with the USER CODE sections of the edited one. An override equal to what is generated is dropped
 * (only edited files are stored); hal_conf.h goes back to the SDK template (it has no sections).
 * Returns {files, report: [{name, lost, reset}]} — `lost`: the user's lines outside the sections that go.
 */
export function regenerateOverrides(project,nextMcu){const files=project.firmware?.files||[];return applied(files,rustFn('regenerate_overrides',part(project,files),nextMcu));}
/** Every text the generator makes for these Pinouts, in both forms: main.c as one file, and the per-peripheral files
 *  (gpio.c/h, usart.c/h …). regenerateMain asks them what is the generator's (feature 52): MX_GPIO_Init or huart2 of a
 *  main.c generated as one file is not the user's code when "주변장치별 .c/.h" moves it to gpio.c / usart.c. */
export const generatorTexts=(...mcus)=>rustFn('generator_texts',...mcus);
/** What generating main.c for `nextMcu` changes in the project: the regenerated sources and what goes from them. */
export function generationPlan(project,nextMcu,{main,previousMain}){const files=project.firmware?.files||[];return applied(files,rustFn('generation_plan',part(project,files),nextMcu,main,previousMain));}
/** The main.c a Pinout generates (with the per-peripheral option), as the pinout dialog writes it. */
export const generatedMain=mcu=>rustFn('generated_main',mcu);
