// CubeMX › Project Manager › Code Generator › "Generate peripheral initialization as a pair of '.c/.h' files per
// peripheral": gpio.c/.h, i2c.c/.h, usart.c/.h … hold the handles and the MX_*_Init functions, and main.c includes the
// headers. The pairs are cut out of the one-file main.c the generator writes (hal-generator.js), so both forms always
// carry the same initialisation.
//
// The pairs are generated files (read only, like stm32xxxx_it.c): they are not stored in the project. A build adds them
// when a project source includes one of their headers — the Pinout option on, or a main.c pasted from a CubeIDE project
// that was generated this way.
import {generateMain} from './hal-generator.js';

const HANDLE=/^(\w+)_HandleTypeDef (\w+);$/,PROTOTYPE=/^static void (MX_\w+_Init)\(void\);$/;
// File names as CubeMX writes them: one pair per kind of peripheral (usart.c holds every USART and UART).
const groupOfInit=name=>{const id=/^MX_([A-Z0-9]+?)\d*_/.exec(name)?.[1]??'';return /^US?ART$/.test(id)?'usart':id==='SDIO'?'sdio':id.toLowerCase();};
const groupOfHandle=type=>/^US?ART$/.test(type)?'usart':type==='SD'?'sdio':type.toLowerCase();
const ORDER=['adc','dac','dcmi','dma','i2c','iwdg','rtc','sdio','spi','tim','usart','wwdg','gpio'];
const note=(file,folder)=>`/* ${file} — STM Simulator가 Pinout 설정으로 만드는 코드(읽기 전용).\n * CubeIDE 프로젝트의 Core/${folder}/${file}에 해당합니다 (CubeMX의 "주변장치별 .c/.h 파일로 생성").\n * Pinout 설정을 바꾸면 이 내용도 바뀝니다. 직접 고치려면 프로젝트에 복사하세요 — 같은 이름의 프로젝트 파일이 있으면 그 파일을 씁니다. */`;

/** One-file main.c text → {main: the main.c that includes the pairs, files: [{name:'i2c.h',text}, {name:'i2c.c',text}, …]}. */
export function splitMain(text){
  const groups=new Map(),group=key=>{if(!groups.has(key))groups.set(key,{handles:[],functions:[]});return groups.get(key);};
  const lines=text.split('\n'),pv=lines.indexOf('/* USER CODE BEGIN PV */'),kept=[];
  let dma=false;
  for(let i=0;i<lines.length;i++){
    const line=lines[i],handle=i<pv?HANDLE.exec(line):null;
    if(handle){group(groupOfHandle(handle[1])).handles.push([handle[1],handle[2]]);if(handle[1]==='DMA')dma=true;continue;}
    if(PROTOTYPE.test(line))continue;
    const definition=/^static void (MX_\w+_Init)\(void\) \{$/.exec(line);
    if(definition){
      const end=lines.indexOf('}',i);if(end<0)throw new Error('생성 코드의 '+definition[1]+' 끝을 찾지 못했습니다.');
      group(groupOfInit(definition[1])).functions.push({name:definition[1],body:lines.slice(i+1,end)});
      i=end;if(kept.at(-1)===''&&lines[i+1]==='')i++; // one blank line between what is left
      continue;
    }
    kept.push(line);
  }
  const names=[...groups.keys()].sort((a,b)=>(ORDER.indexOf(a)+1||99)-(ORDER.indexOf(b)+1||99)||a.localeCompare(b));
  const at=kept.indexOf('#include "main.h"');if(at<0)throw new Error('생성 코드에 main.h 포함이 없습니다.');
  kept.splice(at+1,0,...names.map(n=>`#include "${n}.h"`));
  const files=names.flatMap(name=>{
    const g=groups.get(name),guard=`__${name.toUpperCase()}_H__`;
    const header=[note(name+'.h','Inc'),`#ifndef ${guard}`,`#define ${guard}`,'','#include "main.h"','',...g.handles.map(([type,h])=>`extern ${type}_HandleTypeDef ${h};`),...(g.handles.length?['']:[]),...g.functions.map(f=>`void ${f.name}(void);`),'',`#endif /* ${guard} */`,''];
    // A peripheral with a DMA request links its handle (kept in dma.c) inside its init function.
    const source=[note(name+'.c','Src'),`#include "${name}.h"`,...(dma&&name!=='dma'?['#include "dma.h"']:[]),'',...g.handles.map(([type,h])=>`${type}_HandleTypeDef ${h};`),...g.functions.flatMap(f=>['',`void ${f.name}(void) {`,...f.body,'}']),''];
    return [{name:name+'.h',text:header.join('\n')},{name:name+'.c',text:source.join('\n')}];
  });
  return {main:kept.join('\n'),files};
}
/** The pairs for a Pinout configuration. */
export function peripheralFiles(config,options){return splitMain(generateMain(config,options)).files;}
/** main.c for a Pinout configuration with the option on. */
export function generateSplitMain(config,options){return splitMain(generateMain(config,options)).main;}

const baseName=name=>name.split('/').at(-1);
const stripComments=text=>text.replace(/\/\*[\s\S]*?\*\//g,' ').replace(/\/\/[^\n]*/g,' ');
/** The generated pairs a build of this project adds: none unless a project source includes one of their headers; a
 * pair is left out when the project has a file of that name or already defines one of its init functions. */
export function generatedSources(project){
  if(project?.firmware?.mode!=='hal'||!project.mcu)return [];
  const sources=[{name:'main.c',text:project.code||''},...(project.firmware.files||[])].filter(f=>/\.(c|h|cpp|hpp|cc)$/i.test(f.name));
  const text=stripComments(sources.map(f=>f.text||'').join('\n'));
  if(!/^[ \t]*#[ \t]*include[ \t]*"(?:[\w./-]*\/)?(?:gpio|usart|i2c|spi|tim|adc|dac|dma|rtc|iwdg|wwdg|sdio|dcmi)\.h"/m.test(text))return [];
  let files;try{files=peripheralFiles(project.mcu);}catch{return [];}
  const own=new Set(sources.map(f=>baseName(f.name).toLowerCase())),included=name=>new RegExp(`^[ \\t]*#[ \\t]*include[ \\t]*"(?:[\\w./-]*\\/)?${name}\\.h"`,'m').test(text);
  const defines=name=>new RegExp(`\\b${name}\\s*\\(\\s*(?:void)?\\s*\\)\\s*\\{`).test(text);
  const out=[];
  for(let i=0;i<files.length;i+=2){
    const [header,source]=[files[i],files[i+1]],name=header.name.slice(0,-2);
    // Only what the project asks for by including it (dma.h is pulled in by the pairs that use it).
    if(!included(name)&&name!=='dma')continue;
    const inits=[...source.text.matchAll(/^void (MX_\w+_Init)\(void\) \{$/gm)].map(m=>m[1]);
    if(!own.has(header.name))out.push(header);
    if(!own.has(source.name)&&!inits.some(defines))out.push(source);
  }
  return out;
}
/** The project's extra sources as a build sees them: its own files, then the generated pairs it includes. */
export function halFiles(project){return [...(project?.firmware?.files||[]),...generatedSources(project)];}
