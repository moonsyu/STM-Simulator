import {maskC,cFunctions,checksum} from './c-source-edit.js';
const regionNames=source=>[...new Set([...source.matchAll(/\/\* STM DEVICE DOCS (\w+) (?:BEGIN|END) \*\//g)].map(m=>m[1]))].sort();
const marker=(name,edge)=>`/* STM DEVICE DOCS ${name} ${edge} */`;
export function removeLegacyDeviceHooks(source){
 const call=/\bSTM_Devices_\w+Callback\s*\([^;{}]*\)\s*;/g;
 for(const fn of cFunctions(source).reverse()){
  const body=fn.body.replace(call,'');if(body===fn.body)continue;
  // Old generated one-line wrappers can be removed. User callback bodies stay.
  source=!body.trim()?source.slice(0,fn.start)+source.slice(fn.end):source.slice(0,fn.open+1)+body+source.slice(fn.end-1);
 }
 return source;
}
export function managedRegion(source,name){const a=source.indexOf(marker(name,'BEGIN')),b=source.indexOf(marker(name,'END'));if(a<0&&b<0)return null;if(a<0||b<a)throw new Error('장치 예제의 '+name+' 영역 표시를 복구하세요.');return {start:a,end:b+marker(name,'END').length,text:source.slice(a,b+marker(name,'END').length)};}
export function stripDeviceRegions(source){for(const name of regionNames(source)){const r=managedRegion(source,name);if(r){const start=source[r.start-1]==='\n'?r.start-1:r.start,end=source[r.end]==='\n'?r.end+1:r.end;source=source.slice(0,start)+source.slice(end);}}return source;}
export function managedChecksum(source){return checksum(regionNames(source).map(n=>managedRegion(source,n)?.text||'').join('\n'));}
export function statements(source){const mask=maskC(source),out=[];let start=0,brace=0,paren=0;for(let i=0;i<mask.length;i++){const c=mask[i];if(c==='(')paren++;if(c===')')paren--;if(c==='{')brace++;if(c==='}')brace--;if((c===';'&&brace===0&&paren===0)||(c==='}'&&brace===0&&paren===0&&!/^\s*(?:else\b|;)/.test(mask.slice(i+1)))){out.push(source.slice(start,i+1));start=i+1;}}if(source.slice(start).trim())out.push(source.slice(start));return out;}
// Keep the preparation leading to the chosen operation (buffers, command writes, waits),
// but do not append the remaining unrelated operations in the demonstration loop.
export function selectOperation(source,api,helpers=[]){
 if(api==='all')return source;
 const callsApi=(text,seen=new Set())=>{if(new RegExp('\\b'+api+'\\s*\\(').test(maskC(text)))return true;return helpers.some(h=>!seen.has(h.name)&&new RegExp('\\b'+h.name+'\\s*\\(').test(maskC(text))&&callsApi(h.body,new Set([...seen,h.name])));};
 const chunks=statements(source),at=chunks.findIndex(s=>callsApi(s));if(at<0)return '';
 return chunks.slice(0,at+1).join('');
}
export function insertDeviceCode(source,{declarations,init,step,headers='',initializers=[]}){
 let clean=removeLegacyDeviceHooks(stripDeviceRegions(source)).replace(/(\/\* USER CODE BEGIN 3 \*\/)\s*HAL_Delay\(500\);\s*(\/\* USER CODE END 3 \*\/)/,'$1\n$2').replace(/^\s*#include\s+"stm_device_docs.h"\s*$/gm,'').replace(/\bSTM_Devices_(?:Init|Step)\(\);/g,'');
 const setupCalls=[];
 for(const setup of initializers){const fn=cFunctions(clean).find(f=>f.name===setup.name);if(fn){const text='\n'+marker(setup.name,'BEGIN')+'\n{\n'+setup.body+'\n}\n'+marker(setup.name,'END')+'\n';clean=clean.slice(0,fn.end-1)+text+clean.slice(fn.end-1);if(!new RegExp('\\b'+setup.name+'\\s*\\(\\s*\\)\\s*;').test(cFunctions(clean).find(f=>f.name==='main')?.body||''))setupCalls.push(setup.name+'();');}else setupCalls.push('{\n'+setup.body+'\n}');}
 init=setupCalls.join('\n')+'\n'+init;
 const main=cFunctions(clean).find(f=>f.name==='main');if(!main)throw new Error('main.c에 main(void) 함수가 필요합니다.');
 const mask=maskC(clean),loop=/\b(?:while\s*\(\s*(?:1|true)\s*\)|for\s*\(\s*;\s*;\s*\))\s*\{/g;loop.lastIndex=main.open+1;let m;
 while((m=loop.exec(mask))&&m.index<main.end){let depth=0;for(const c of mask.slice(main.open+1,m.index))depth+=c==='{'?1:c==='}'?-1:0;if(depth===0)break;}
 if(!m||m.index>=main.end)throw new Error('main(void)에 while (1) { ... } 실행 루프를 추가하세요.');
 const block=(name,text)=>`\n${marker(name,'BEGIN')}\n${indentC(text.trim(),name==='STEP'?2:name==='HEADERS'?0:1)}\n${marker(name,'END')}\n`;
 const at2=clean.indexOf('/* USER CODE BEGIN 2 */',main.open),at3=clean.indexOf('/* USER CODE BEGIN 3 */',main.open);
 const edits=[[main.start,block('HEADERS',headers)],[main.open+1,block('DECLARATIONS',declarations)],[at2>=0&&at2<main.end?at2+23:m.index,block('INIT',init)],[at3>=0&&at3<main.end?at3+23:loop.lastIndex,block('STEP',step)]];
 for(const [at,text]of edits.sort((a,b)=>b[0]-a[0]))clean=clean.slice(0,at)+text+clean.slice(at);
 return clean;
}

export function indentC(source,base=0){let depth=base;return source.split('\n').map(line=>{const text=line.trim(),mask=maskC(text),leading=(mask.match(/^\}+/)||[''])[0].length;const result='    '.repeat(Math.max(0,depth-leading))+text;depth+=(mask.match(/\{/g)||[]).length-(mask.match(/\}/g)||[]).length;return result;}).join('\n');}

// ---- Per-device marked regions (0.26.1) ----
// Every block Docs inserts is wrapped in one marker pair:
//   /* STM-DOCS BEGIN <type>:<key> <ROLE> · Docs 예제 */ ... /* STM-DOCS END <type>:<key> <ROLE> */
// Regions are found by markers only, so the code between them may be edited freely.
const DOCS_MARK=/\/\* STM-DOCS (BEGIN|END) ([A-Za-z0-9_-]+:[A-Za-z0-9_-]+) ([A-Za-z0-9_]+)[^*]*\*\//g;
export const PER_DEVICE_ROLES=new Set(['DECL','INIT','LOOP','MX_GPIO_Init']);
export const docsTag=binding=>binding.type+':'+binding.key;
export function docsMarker(tag,role,edge){return `/* STM-DOCS ${edge} ${tag} ${role}${edge==='BEGIN'?' · Docs 예제':''} */`;}
const lineStart=(s,i)=>{let j=i;while(j>0&&(s[j-1]===' '||s[j-1]==='\t'))j--;return j===0||s[j-1]==='\n'?j:i;};
const lineEnd=(s,i)=>{let j=i;while(j<s.length&&(s[j]===' '||s[j]==='\t'||s[j]==='\r'))j++;return s[j]==='\n'?j+1:j>=s.length?j:i;};
const afterLine=(s,i)=>{const n=s.indexOf('\n',i);return n<0?s.length:n+1;};
export function docsRegions(source){
 const marks=[...source.matchAll(DOCS_MARK)].map(m=>({edge:m[1],tag:m[2],role:m[3],start:m.index,end:m.index+m[0].length})),used=new Set(),regions=[],broken=[];
 for(let i=0;i<marks.length;i++){const a=marks[i];if(a.edge!=='BEGIN')continue;let j=-1;
  for(let k=i+1;k<marks.length;k++){const b=marks[k];if(b.tag===a.tag&&b.role===a.role){if(b.edge==='END')j=k;break;}}
  if(j<0){broken.push({tag:a.tag,role:a.role,reason:'END 표시를 찾을 수 없습니다'});continue;}
  used.add(i);used.add(j);const b=marks[j];
  regions.push({tag:a.tag,role:a.role,start:lineStart(source,a.start),end:lineEnd(source,b.end),bodyStart:lineEnd(source,a.end),bodyEnd:lineStart(source,b.start),begin:a,close:b});
 }
 marks.forEach((m,i)=>{if(m.edge==='END'&&!used.has(i))broken.push({tag:m.tag,role:m.role,reason:'BEGIN 표시를 찾을 수 없습니다'});});
 return {regions,broken};
}
export function regionBody(source,region){return source.slice(region.bodyStart,region.bodyEnd);}
// Indentation follows the file (CubeMX output uses two spaces per level).
export function indentUnit(source){const m=/\n( +|\t)(?![*\s])\S/.exec(source);return m?m[1]:'    ';}
function indentWith(text,pad,unit){let depth=0;return text.split('\n').map(line=>{const t=line.trim(),mask=maskC(t),lead=(mask.match(/^\}+/)||[''])[0].length;const out=t?pad+unit.repeat(Math.max(0,depth-lead))+t:'';depth+=(mask.match(/\{/g)||[]).length-(mask.match(/\}/g)||[]).length;return out;}).join('\n');}
export function regionText(tag,role,body,level,unit='    '){const pad=typeof level==='string'?level:unit.repeat(level);return `${pad}${docsMarker(tag,role,'BEGIN')}\n${body.trim()?indentWith(body.trim(),pad,unit)+'\n':''}${pad}${docsMarker(tag,role,'END')}\n`;}
export function insertAt(source,at,text){return source.slice(0,at)+(at>0&&source[at-1]!=='\n'?'\n':'')+text+(at<source.length&&source[at]!=='\n'&&!text.endsWith('\n')?'\n':'')+source.slice(at);}
export function removeRegion(source,region){return source.slice(0,region.start)+source.slice(region.end);}
export function retagRegion(source,region,tag){
 const begin=docsMarker(tag,region.role,'BEGIN'),end=docsMarker(tag,region.role,'END');
 return source.slice(0,region.begin.start)+begin+source.slice(region.begin.end,region.close.start)+end+source.slice(region.close.end);
}
export function replaceRegion(source,region,body){const pad=(/^[ \t]*/.exec(source.slice(region.start))||[''])[0];return source.slice(0,region.start)+regionText(region.tag,region.role,body,pad,indentUnit(source))+source.slice(region.end);}
const insideRegion=(regions,at)=>regions.find(r=>at>=r.start&&at<r.end);
// Insertion anchors -------------------------------------------------------
function mainLoop(source){
 const main=cFunctions(source).find(f=>f.name==='main');if(!main)throw new Error('main.c에 main(void) 함수가 필요합니다.');
 const mask=maskC(source),loop=/\b(?:while\s*\(\s*(?:1|true)\s*\)|for\s*\(\s*;\s*;\s*\))\s*\{/g;loop.lastIndex=main.open+1;let m;
 while((m=loop.exec(mask))&&m.index<main.end){let depth=0;for(const c of mask.slice(main.open+1,m.index))depth+=c==='{'?1:c==='}'?-1:0;if(depth===0)break;}
 if(!m||m.index>=main.end)throw new Error('main(void)에 while (1) { ... } 실행 루프를 추가하세요.');
 return {main,loop:m.index,loopOpen:loop.lastIndex-1};
}
function lastRegion(source,role,from,to){const {regions}=docsRegions(source);return regions.filter(r=>r.role===role&&r.start>=from&&r.end<=to).pop();}
export function anchorFor(source,role){
 const {regions}=docsRegions(source);
 if(role==='DECL'||role==='INIT'||role==='LOOP'||role.endsWith('_CALL')){
  const {main,loop,loopOpen}=mainLoop(source),end=main.end;
  if(role==='DECL'){const r=lastRegion(source,'DECL',main.open,end);return {at:r?r.end:afterLine(source,main.open),level:1};}
  if(role==='INIT'){const r=lastRegion(source,'INIT',main.open,end);if(r)return {at:r.end,level:1};const u=source.indexOf('/* USER CODE BEGIN 2 */',main.open);return {at:u>=0&&u<loop?afterLine(source,u):lineStart(source,loop),level:1};}
  if(role==='LOOP'){const r=lastRegion(source,'LOOP',main.open,end);if(r)return {at:r.end,level:2};const u=source.indexOf('/* USER CODE BEGIN 3 */',loopOpen);return {at:u>=0&&u<end?afterLine(source,u):afterLine(source,loopOpen),level:2};}
  // Peripheral init calls follow the last MX_*_Init() call before the user section, as in CubeMX output.
  const mask=maskC(source),u=source.indexOf('/* USER CODE BEGIN 2 */',main.open),limit=u>=0&&u<loop?u:loop;let at=-1;
  for(const m of mask.slice(0,limit).matchAll(/\bMX_\w+_Init\s*\(\s*\)\s*;/g))if(m.index>main.open){const r=insideRegion(regions,m.index);at=r?r.end:afterLine(source,m.index);}
  for(const r of regions)if(r.role.endsWith('_CALL')&&r.start>main.open&&r.end<=limit)at=Math.max(at,r.end);
  if(at<0){const body=mask.slice(main.open,limit),m=/\bSystemClock_Config\s*\(\s*\)\s*;/.exec(body)||/\bHAL_Init\s*\(\s*\)\s*;/.exec(body);at=m?afterLine(source,main.open+m.index):(lastRegion(source,'DECL',main.open,end)?.end??afterLine(source,main.open));}
  return {at,level:1};
 }
 const fns=cFunctions(source),first=fns[0];
 const top=()=>{if(!first)return source.length;const r=insideRegion(regions,first.start);return r?r.start:lineStart(source,first.start);};
 if(role.endsWith('_PROTO')){const mask=maskC(source);let at=-1;for(const m of mask.matchAll(/^[ \t]*(?:static\s+)?void\s+(?:MX_\w+_Init|SystemClock_Config|Error_Handler)\s*\(\s*void\s*\)\s*;[^\n]*$/gm)){if(first&&m.index>first.start)break;const r=insideRegion(regions,m.index);at=r?r.end:afterLine(source,m.index);}for(const r of regions)if(r.role.endsWith('_PROTO')&&(!first||r.end<=top()))at=Math.max(at,r.end);return {at:at>=0?at:top(),level:0};}
 if(role==='HEADERS'||role.startsWith('HANDLE_'))return {at:top(),level:0};
 // A created MX_*_Init definition: after the last MX init definition, else before the support functions.
 let at=-1;for(const f of fns)if(/^MX_\w+_Init$/.test(f.name)||f.name==='SystemClock_Config'){const r=insideRegion(regions,f.start);at=Math.max(at,r?r.end:afterLine(source,f.end));}
 if(at<0){const tail=fns.find(f=>['__io_putchar','Error_Handler'].includes(f.name));at=tail?lineStart(source,tail.start):source.length;}
 return {at,level:0};
}
export function functionEndAnchor(name){return source=>{const fn=cFunctions(source).find(f=>f.name===name);if(!fn)throw new Error(name+' 함수를 찾을 수 없습니다.');return {at:lineStart(source,fn.end-1),level:1};};}
// Creates an empty CubeMX-style MX_GPIO_Init (prototype, definition and call) when the file has none.
export function ensureGpioInit(source){
 if(cFunctions(source).some(f=>f.name==='MX_GPIO_Init'))return source;
 const mask=maskC(source);
 if(!/\bvoid\s+MX_GPIO_Init\s*\(\s*void\s*\)\s*;/.test(mask)){const {at}=anchorFor(source,'MX_GPIO_Init_PROTO');source=insertAt(source,at,'static void MX_GPIO_Init(void);\n');}
 const fns=cFunctions(source),clock=fns.find(f=>f.name==='SystemClock_Config'),tail=fns.find(f=>['__io_putchar','Error_Handler'].includes(f.name));
 const u=indentUnit(source),def='\nstatic void MX_GPIO_Init(void) {\n'+u+'GPIO_InitTypeDef GPIO_InitStruct = {0};\n}\n';
 source=clock?insertAt(source,afterLine(source,clock.end-1),def):tail?insertAt(source,lineStart(source,tail.start),def.slice(1)+'\n'):source.replace(/\s*$/,'\n')+def;
 const {main}=mainLoop(source),body=maskC(source).slice(main.open,main.end);
 if(!/\bMX_GPIO_Init\s*\(\s*\)\s*;/.test(body)){const m=/\bSystemClock_Config\s*\(\s*\)\s*;/.exec(body)||/\bHAL_Init\s*\(\s*\)\s*;/.exec(body);const at=m?afterLine(source,main.open+m.index):afterLine(source,main.open);source=insertAt(source,at,indentUnit(source)+'MX_GPIO_Init();\n');}
 return source;
}
// Whitespace-insensitive search used to remove code inserted by versions without per-device markers.
export function looseFind(source,snippet,from=0,to=source.length){
 const tokens=snippet.trim().split(/\s+/).filter(Boolean);if(!tokens.length)return null;
 const re=new RegExp(tokens.map(t=>t.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('\\s*'),'g');re.lastIndex=from;const m=re.exec(source);
 return m&&m.index+m[0].length<=to?{start:m.index,end:m.index+m[0].length}:null;
}
const GPIO_DECL=/^[ \t]*GPIO_InitTypeDef\s+GPIO_InitStruct\s*=\s*\{\s*0\s*\}\s*;[ \t]*\r?\n?/m;
export function withoutDocsRegions(source){const {regions}=docsRegions(source);for(const r of [...regions].reverse())source=source.slice(0,r.start)+source.slice(r.end);return source;}
const DEFINITION_ROLE=role=>/^MX_\w+_Init$/.test(role)&&role!=='MX_GPIO_Init';
function removeRegionTidy(source,r){let start=r.start;if(start>=2&&source[start-1]==='\n'&&source[start-2]==='\n'&&source[r.end]==='\n')start--;return source.slice(0,start)+source.slice(r.end);}
function insertRegion(source,tag,role,text,anchor){
 const {at,level}=anchor?anchor(source):anchorFor(source,role);
 const pad=level===0&&DEFINITION_ROLE(role)&&at>1&&source[at-1]==='\n'&&source[at-2]!=='\n'?'\n':'';
 return insertAt(source,at,pad+regionText(tag,role,text,level,indentUnit(source)));
}
function setRegion(source,tag,role,text,anchor){
 const current=docsRegions(source).regions.find(r=>r.tag===tag&&r.role===role);
 if(!text.trim())return current?removeRegionTidy(source,current):source;
 return current?replaceRegion(source,current,text):insertRegion(source,tag,role,text,anchor);
}
function sharedRegion(source,tag,role,content,anchor){
 const current=docsRegions(source).regions.find(r=>r.role===role);if(current&&current.tag!==tag)return source;
 return setRegion(source,tag,role,content(withoutDocsRegions(source)),anchor);
}
const hasCall=(source,name)=>{const {main}=mainLoop(source);return new RegExp('\\b'+name+'\\s*\\(\\s*\\)\\s*;').test(maskC(source).slice(main.open,main.end));};
function gpioBody(source,body){
 const stripped=body.replace(GPIO_DECL,'');if(!stripped.trim())return '';
 const fn=cFunctions(withoutDocsRegions(source)).find(f=>f.name==='MX_GPIO_Init');
 const declared=fn&&/\bGPIO_InitTypeDef\s+GPIO_InitStruct\b/.test(maskC(fn.body));
 return declared||!/\bGPIO_InitStruct\b/.test(stripped)?stripped:'{\nGPIO_InitTypeDef GPIO_InitStruct = {0};\n'+stripped+'\n}';
}
function installFunction(source,tag,f){
 const current=docsRegions(source).regions.find(r=>r.role===f.name);if(current&&current.tag!==tag)return source;
 const definition=`static void ${f.name}(void) {\n${f.body.trim()}\n}`,find=()=>cFunctions(source).find(x=>x.name===f.name);let fn=find();
 if(current){const isDefinition=!fn||fn.start>=current.start&&fn.end<=current.end;source=replaceRegion(source,current,isDefinition?definition:f.body);}
 else source=fn?insertRegion(source,tag,f.name,f.body,functionEndAnchor(f.name)):insertRegion(source,tag,f.name,definition);
 const regions=docsRegions(source).regions,own=regions.find(r=>r.role===f.name);fn=find();
 const created=own&&fn&&fn.start>=own.start&&fn.end<=own.end;
 if(created&&!regions.some(r=>r.role===f.name+'_PROTO')&&!new RegExp('\\bvoid\\s+'+f.name+'\\s*\\(\\s*void\\s*\\)\\s*;').test(maskC(source)))source=insertRegion(source,tag,f.name+'_PROTO','static void '+f.name+'(void);');
 if(!docsRegions(source).regions.some(r=>r.role===f.name+'_CALL')&&!hasCall(source,f.name))source=insertRegion(source,tag,f.name+'_CALL',f.name+'();');
 return source;
}
export function moduleNeeds(module){return new Set(['HEADERS',...module.handles.map(h=>'HANDLE_'+h.name),...module.functions.flatMap(f=>[f.name,f.name+'_PROTO',f.name+'_CALL'])]);}
function release(source,region,others){const heir=others.find(o=>o.tag!==region.tag&&o.needs.has(region.role));return heir?{source:retagRegion(source,region,heir.tag),retagged:1}:{source:removeRegionTidy(source,region),retagged:0};}
// Local declarations of two devices must not collide in one scope; such blocks get their own braces.
const DECLARATION=/^\s*(?:(?:static|const|volatile|unsigned|signed|struct|enum)\s+)*(?!return\b|else\b|goto\b|case\b)[A-Za-z_]\w*(?:\s*\*+\s*|\s+)\**[A-Za-z_]\w*\s*(?:\[|=|;|,)/;
export function scoped(text){return statements(text).some(s=>DECLARATION.test(maskC(s)))?'{\n'+text.trim()+'\n}':text;}
export const DOCS_INCLUDES=['#include <stdio.h>','#include <math.h>'];
// Writes one device's regions. Regions of other devices are never touched; shared
// resources (headers, handles, MX_<PERIPH>_Init) are written once and owned by one device.
export function installDeviceRegions(source,tag,module,others=()=>[]){
 const bad=docsRegions(source).broken.filter(b=>b.tag===tag);
 if(bad.length)throw new Error(`main.c의 ${tag} ${bad[0].role} 영역 표시가 손상되었습니다(${bad[0].reason}). 남은 STM-DOCS 표시를 복구하거나 삭제한 뒤 다시 적용하세요.`);
 mainLoop(source);
 const need=moduleNeeds(module);let heirs=null;
 for(let r;(r=docsRegions(source).regions.find(r=>r.tag===tag&&!PER_DEVICE_ROLES.has(r.role)&&!need.has(r.role)));)source=release(source,r,heirs??=others()).source;
 source=setRegion(source,tag,'DECL',module.declarations||'');
 source=setRegion(source,tag,'INIT',scoped(module.init||''));
 source=setRegion(source,tag,'LOOP',scoped(module.step||''));
 if((module.gpio||'').replace(GPIO_DECL,'').trim()){source=ensureGpioInit(source);source=setRegion(source,tag,'MX_GPIO_Init',gpioBody(source,module.gpio),functionEndAnchor('MX_GPIO_Init'));}
 else source=setRegion(source,tag,'MX_GPIO_Init','');
 source=sharedRegion(source,tag,'HEADERS',outside=>DOCS_INCLUDES.filter(line=>!outside.includes(line.slice(9))).join('\n'));
 for(const h of module.handles)source=sharedRegion(source,tag,'HANDLE_'+h.name,outside=>new RegExp('\\b'+h.type+'\\s+'+h.name+'\\b').test(maskC(outside))?'':h.type+' '+h.name+';');
 for(const f of module.functions)source=installFunction(source,tag,f);
 return source;
}
// Removes one device's regions by marker, whatever was edited inside them.
export function removeDeviceRegions(source,tag,others=()=>[]){
 const report={removed:0,retagged:0,missing:docsRegions(source).broken.filter(b=>b.tag===tag).map(b=>`${b.role}: ${b.reason}`)};let heirs=null;
 for(let r;(r=docsRegions(source).regions.find(r=>r.tag===tag));){
  if(PER_DEVICE_ROLES.has(r.role)){source=removeRegionTidy(source,r);report.removed++;}
  else{const out=release(source,r,heirs??=others());source=out.source;if(out.retagged)report.retagged++;else report.removed++;}
 }
 return {source,report};
}
// Removes a whitespace-insensitive match of snippet; returns null when not found.
export function cutLoose(source,snippet,from,to){
 const m=looseFind(source,snippet,from,to);if(!m)return null;
 let s=lineStart(source,m.start),e=lineEnd(source,m.end);if(s!==m.start&&source[s-1]!=='\n')s=m.start;if(e===m.end&&source[e]!=='\n')e=m.end;
 return source.slice(0,s)+source.slice(e);
}
