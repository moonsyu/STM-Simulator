import {rustCall} from './rust-core.js';
// Offset-preserving masking allows edits without interpreting comments or string literals as C.
export function maskC(source){return source.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g,s=>s.replace(/[^\n]/g,' '));}
export function cFunctions(source){
 const masked=maskC(source),found=[],pattern=/\b([A-Za-z_]\w*)\s*\(([^;{}]*)\)\s*\{/g;let m;
 while((m=pattern.exec(masked))){if(['if','while','for','switch'].includes(m[1]))continue;const open=masked.indexOf('{',m.index),prefix=masked.slice(0,m.index);let depth=0;for(const c of prefix)depth+=c==='{'?1:c==='}'?-1:0;if(depth)continue;
  let end=open+1,level=1;while(end<masked.length&&level){if(masked[end]==='{')level++;else if(masked[end]==='}')level--;end++;}if(level)throw new Error('C 함수 중괄호를 확인하세요.');let start=m.index;while(start>0&&!';}\n'.includes(masked[start-1]))start--;while(/\s/.test(source[start]))start++;
  found.push({name:m[1],start,end,open,body:source.slice(open+1,end-1),text:source.slice(start,end),signature:source.slice(start,open).trim()});pattern.lastIndex=end;
 }return found;
}
export function insertMainHooks(source){
 if(source.includes('STM_Devices_Init();')&&source.includes('STM_Devices_Step();'))return source;
 // Remove only the untouched generator's placeholder wait, never a user's loop logic.
 source=source.replace(/(\/\* USER CODE BEGIN 3 \*\/)\s*HAL_Delay\(500\);\s*(\/\* USER CODE END 3 \*\/)/,'$1\n$2');
 const main=cFunctions(source).find(f=>f.name==='main');if(!main)throw new Error('예제를 적용하려면 main(void) 함수가 필요합니다.');
 const mask=maskC(source),loop=/\b(?:while\s*\(\s*(?:1|true)\s*\)|for\s*\(\s*;\s*;\s*\))\s*\{/g;loop.lastIndex=main.open+1;let m;while((m=loop.exec(mask))&&m.index<main.end){let depth=0;for(const c of mask.slice(main.open+1,m.index))depth+=c==='{'?1:c==='}'?-1:0;if(depth===0)break;}
 if(!m||m.index>=main.end)throw new Error('main 함수에 while(1) { ... } 실행 루프를 추가한 뒤 다시 적용하세요.');
 const initAt=source.indexOf('/* USER CODE BEGIN 2 */',main.open),stepAt=source.indexOf('/* USER CODE BEGIN 3 */',main.open);
 const insertions=[[initAt>=0&&initAt<main.end?initAt+23:m.index,'\n  STM_Devices_Init();\n  '],[stepAt>=0&&stepAt<main.end?stepAt+23:loop.lastIndex,'\n    STM_Devices_Step();\n    ']];
 for(const [at,text]of insertions.sort((a,b)=>b[0]-a[0]))source=source.slice(0,at)+text+source.slice(at);
 return '#include "stm_device_docs.h"\n'+source;
}
export function replaceIdentifiers(source,mapping){return source.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\b[A-Za-z_]\w*\b/g,token=>mapping[token]||token);}
export function checksum(text){let h=2166136261;for(let i=0;i<text.length;i++)h=Math.imul(h^text.charCodeAt(i),16777619);return (h>>>0).toString(16);}
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
