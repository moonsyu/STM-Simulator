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
import {buildEnvironment,prefixOf} from './build-environment.js';
import {peripheralFiles} from './peripheral-files.js';
import {keepUserCode} from './c-source-edit.js';
import {generateHal} from './mcu-config.js';
import {expandC} from './c-format.js';

const base=name=>String(name).split('/').at(-1);
const PAIR=/^(gpio|usart|i2c|spi|tim|adc|dac|dma|rtc|iwdg|wwdg|sdio|dcmi)\.[ch]$/;
export const USER_SECTION=/(\/\* USER CODE BEGIN (.+?) \*\/)([\s\S]*?)(\/\* USER CODE END \2 \*\/)/g;
/** Files the built-in interpreter does not compile: only the ARM GCC build uses an edit there. */
export const armOnly=name=>/^(Drivers|Middlewares)\//.test(name)||/^(syscalls|sysmem|system_stm32\w+)\.c$/.test(base(name))||/\.(s|ld)$/i.test(name);
/** Whether generating the code rewrites this file (only its USER CODE sections survive). */
export function regenerated(name,family){
  const b=base(name),p=prefixOf(family);
  return b==='main.c'||b==='main.h'||b===p+'_it.c'||b===p+'_hal_conf.h'||PAIR.test(b);
}
/** 'regen' | 'once' — how a file the app or the SDK provides is treated (see the top of this file). */
export const fileKind=(name,family)=>regenerated(name,family)?'regen':'once';
/** The project's overrides: files that started as a generated or SDK file. */
export const overrides=project=>(project?.firmware?.files||[]).filter(f=>f.origin==='gen'||f.origin==='sdk');
/** A file the tree also offers as generated / SDK: an override, or an older copy of one (same path, no origin). */
export function editedLabel(file,labels){return !!file&&(file.origin==='gen'||file.origin==='sdk'||labels.has(file.name));}

// What the generator writes for a regenerated file today, for the project as it would be without that file.
function generatedText(name,project,mcu){
  const own=(project.firmware?.files||[]).find(f=>f.name===name),sections=own?[...String(own.text).matchAll(USER_SECTION)].map(m=>m[3]).join('\n'):'';
  // The file itself is left out (it would hide every handler), but what the user wrote in its USER CODE sections stays:
  // a handler written there is not generated again.
  const p=structuredClone(project);p.mcu=mcu;p.firmware={...p.firmware,files:[...(p.firmware?.files||[]).filter(f=>f.name!==name),...(sections.trim()?[{name:'__user_sections.c',text:sections}]:[])]};
  const b=base(name);
  if(PAIR.test(b)){try{const f=peripheralFiles(mcu).find(x=>x.name===b);if(f)return f.text;}catch{/* a Pinout the generator refuses */}return null;}
  // hal_conf.h is the SDK's template (the app does not write its own): an edit is not merged, it goes back to the template.
  if(b===prefixOf(mcu?.family)+'_hal_conf.h')return null;
  const env=buildEnvironment(p).files.find(f=>base(f.file)===b);
  return env?env.text:null;
}
/** Lines of `current` that are the user's (not in `before`, the generated text they started from) and are not in `after`. */
export function lostLines(current,before,after){
  const count=text=>{const m=new Map();for(const line of String(text||'').split('\n')){const t=line.trim();if(t)m.set(t,(m.get(t)||0)+1);}return m;};
  const was=count(before),now=count(after);let lost=0;
  for(const [line,n]of count(current)){const kept=(was.get(line)||0)+(now.get(line)||0);if(n>kept)lost+=n-kept;}
  return lost;
}
/**
 * The project's regenerated overrides for a new Pinout (main.c is handled by regenerateMain): each takes the new
 * generated text with the USER CODE sections of the edited one. An override equal to what is generated is dropped
 * (only edited files are stored); hal_conf.h goes back to the SDK template (it has no sections).
 * Returns {files, report: [{name, lost, reset}]} — `lost`: the user's lines outside the sections that go.
 */
export function regenerateOverrides(project,nextMcu){
  const family=nextMcu?.family||project.mcu?.family,report=[],files=[];
  for(const f of project.firmware?.files||[]){
    if(f.origin!=='gen'&&f.origin!=='sdk'||!regenerated(f.name,family)){files.push(f);continue;}
    // The text the file was edited from (kept since 1.51.0), else what the current settings generate.
    const before=typeof f.base==='string'?f.base:generatedText(f.name,project,project.mcu),after=generatedText(f.name,project,nextMcu);
    // hal_conf.h, or a pair whose peripheral is off: the edit goes (the file is not generated any more).
    if(after===null){report.push({name:f.name,lost:lostLines(f.text,before??'',''),reset:true});continue;}
    const merged=keepUserCode(f.text,after,before??'');
    const lost=lostLines(f.text,before??'',merged);if(lost)report.push({name:f.name,lost,reset:false});
    if(merged!==after)files.push({...f,text:merged,base:after});
  }
  return {files,report};
}
/** What generating main.c for `nextMcu` changes in the project: the regenerated sources and what goes from them. */
export function generationPlan(project,nextMcu,{main,previousMain}){
  const {files,report}=regenerateOverrides(project,nextMcu);
  const mainLost=lostLines(project.code,previousMain,main);
  return {files,report:[...(mainLost?[{name:'main.c',lost:mainLost,reset:false}]:[]),...report]};
}
/** The main.c a Pinout generates (with the per-peripheral option), as the pinout dialog writes it. */
export const generatedMain=mcu=>{try{return expandC(generateHal(mcu));}catch{return '';}};
/** Line ranges (1-based, inclusive) outside the USER CODE sections, for a file that has at least one section. */
export function outsideRanges(text){
  const t=String(text||'');if(!/\/\* USER CODE BEGIN /.test(t))return [];
  const lineOf=offset=>t.slice(0,offset).split('\n').length,ranges=[];let line=1;
  for(const m of t.matchAll(USER_SECTION)){
    // The BEGIN and END comment lines are the generator's too; what is between them is the user's.
    const begin=lineOf(m.index),end=lineOf(m.index+m[0].length);
    if(begin>line)ranges.push([line,begin-1]);ranges.push([begin,begin]);if(end>begin)ranges.push([end,end]);line=end+1;
  }
  const last=t.split('\n').length;if(line<=last)ranges.push([line,last]);
  return ranges.filter(([a,b])=>a<=b);
}
