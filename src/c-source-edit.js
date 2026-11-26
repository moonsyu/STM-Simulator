// Edits of C sources as text. The code is in Rust (rust/stm-core/src/csedit.rs and regen.rs; feature 62): this file is
// what the JavaScript callers import.
import {rustCall,rustFn} from './rust-core.js';
// Offset-preserving masking allows edits without interpreting comments or string literals as C.
// A source is a text: anything else is refused, as the string methods of the JavaScript refused it.
const text=source=>{if(typeof source!=='string')throw new TypeError('소스 텍스트가 아닙니다.');return source;};
export const maskC=source=>rustFn('mask_c',text(source));
/** [{name, start, end, open, body, text, signature}] of the functions defined at brace depth 0 (offsets in the source). */
export const cFunctions=source=>rustFn('c_functions',text(source));
/** Adds the calls of the device code to main: STM_Devices_Init before the loop, STM_Devices_Step in it. */
export const insertMainHooks=source=>rustFn('insert_main_hooks',text(source));
/** Every identifier that `mapping` names replaced by its text; comments and literals are left alone. */
export function replaceIdentifiers(source,mapping){
 // Only the names the mapping has itself (not what every object inherits).
 const own={};for(const key of Object.keys(mapping))if(mapping[key])own[key]=String(mapping[key]);
 return rustFn('replace_identifiers',source,own);
}
export const checksum=source=>rustFn('checksum',text(source));
// ---- Regenerating a source the CubeMX way. The code is in Rust (rust/stm-core/src/regen.rs, moved there with feature 52
// on 2026-11-25); these are the calls. The text of every `/* USER CODE BEGIN x */ … /* USER CODE END x */` section of the
// previous source replaces that section of the new one; a section the new source no longer has is kept under #if 0 at the
// end of section 4; `previousDefault`, the source the previous settings generate, marks sections the user never changed
// (those take the new generated text). User code outside the sections (helper functions, globals, #includes) is moved
// into a section first so it is carried over: #include → Includes, other declarations before main → PV, functions before
// main → 0, anything after main → 4. What the generator itself writes is not user code and is generated again.
const str=value=>String(value??'');
export function keepUserCode(previous,generated,previousDefault=''){return rustCall('keep_user_code',{previous:str(previous),generated:str(generated),previousDefault:str(previousDefault)});}
// A handler the user wrote (in a user section, like USART2_IRQHandler in USER CODE 4, or in another source such as an
// imported stm32f4xx_it.c) replaces the generated one, which would otherwise be defined twice.
export function dropShadowedHandlers(source,others=[]){return rustCall('drop_shadowed_handlers',{source:str(source),others:others.map(str)});}
// Top-level items of a source: [{kind:'function'|'declaration'|'directive', name, start, end, text, comment}], skipping
// the user sections (null when the source cannot be read that way). `comment` is the comment block directly above the item.
export function topLevelItems(source){return rustCall('top_level_items',{source:str(source)});}
/** Moves user code outside the USER CODE sections of `previous` into its sections. Returns {source, moved:[names]}.
 *  `generator`: other texts the generator makes; what is in them is the generator's too (see regenerateMain). */
export function adoptOutsideCode(previous,generated,previousDefault='',generator=[]){return rustCall('adopt_outside_code',{previous:str(previous),generated:str(generated),previousDefault:str(previousDefault),generator:generator.map(str)});}
/** Regenerated main.c: user sections kept, user code outside them moved into sections, shadowed handlers dropped.
 *  `generator` (feature 52): the other texts the generator makes — the per-peripheral files (gpio.c, usart.c …) and the
 *  single-file main.c of the same settings. A function or variable of main.c that is in one of them was generated, so
 *  it is not moved into USER CODE when the settings change from one file to per-peripheral files. */
export function regenerateMain(previous,generated,previousDefault='',others=[],generator=[]){return rustCall('regenerate_main',{previous:str(previous),generated:str(generated),previousDefault:str(previousDefault),others:others.map(str),generator:generator.map(str)});}
