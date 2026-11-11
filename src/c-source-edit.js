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
// Regenerating main.c the CubeMX way: the text of every `/* USER CODE BEGIN x */ … /* USER CODE END x */` section of the
// previous source replaces that section of the new one. A section the new source no longer has (a callback of a peripheral
// that was turned off) is kept under #if 0 at the end of section 4, so no user code is lost. `previousDefault`, the source
// the previous settings generate, marks sections the user never changed: those take the new generated text (the "HAL ready"
// message of a UART that was turned off is not kept).
const USER_SECTION=/(\/\* USER CODE BEGIN (.+?) \*\/)([\s\S]*?)(\/\* USER CODE END \2 \*\/)/g;
export function keepUserCode(previous,generated,previousDefault=''){
 const flat=text=>text.replace(/\s+/g,' ').trim(),untouched=new Map();for(const m of String(previousDefault).matchAll(USER_SECTION))if(!untouched.has(m[2]))untouched.set(m[2],flat(m[3]));
 const old=new Map();for(const m of String(previous||'').matchAll(USER_SECTION))if(!old.has(m[2])&&untouched.get(m[2])!==flat(m[3]))old.set(m[2],m[3]);
 const used=new Set();
 let out=generated.replace(USER_SECTION,(all,begin,tag,body,end)=>{if(!old.has(tag)||used.has(tag))return all;used.add(tag);return begin+old.get(tag)+end;});
 const orphans=[...old].filter(([tag,body])=>!used.has(tag)&&body.trim());
 if(orphans.length){
  const kept=orphans.map(([tag,body])=>`/* USER CODE ${tag}: 새 코드에 이 구간이 없어 보관합니다. */\n#if 0\n${body.replace(/^\s*\n|\s+$/g,'')}\n#endif\n`).join('');
  const at=out.lastIndexOf('/* USER CODE END 4 */');out=at>=0?out.slice(0,at)+kept+out.slice(at):out+'\n'+kept;
 }
 return out;
}
// A handler the user wrote (in a user section, like USART2_IRQHandler in USER CODE 4, or in another source such as an
// imported stm32f4xx_it.c) replaces the generated one, which would otherwise be defined twice.
export function dropShadowedHandlers(source,others=[]){
 const names=text=>{try{return cFunctions(text||'');}catch{return [];}};
 const spans=[...source.matchAll(USER_SECTION)].map(m=>[m.index,m.index+m[0].length]),inUser=at=>spans.some(([a,b])=>at>=a&&at<b);
 const handlers=names(source).filter(f=>/^\w+_(IRQ)?Handler$/.test(f.name)),elsewhere=new Set(others.flatMap(t=>names(t).map(f=>f.name)));
 const user=new Set(handlers.filter(f=>inUser(f.start)).map(f=>f.name));
 for(const f of handlers.filter(f=>!inUser(f.start)&&(user.has(f.name)||elsewhere.has(f.name))).sort((a,b)=>b.start-a.start))source=source.slice(0,f.start).replace(/\n\n$/,'\n')+source.slice(f.end).replace(/^\n/,'');
 return source;
}
export function checksum(text){let h=2166136261;for(let i=0;i<text.length;i++)h=Math.imul(h^text.charCodeAt(i),16777619);return (h>>>0).toString(16);}
// ---- User code outside the USER CODE sections (helper functions, globals, #includes of an older example or a main.c
// edited by hand). CubeMX loses it on regeneration; here it is moved into a section first, so keepUserCode carries it over:
// #include → Includes, other declarations before main → PV, functions before main → 0, anything after main → 4. What the
// generator itself writes (same function name, same declaration) is not user code and is generated again.
const flatC=text=>text.replace(/\s+/g,' ').trim();
const FN_NAME=/([A-Za-z_]\w*)\s*\([^()]*(?:\([^()]*\)[^()]*)*\)\s*$/,LAST_NAME=/([A-Za-z_]\w*)\s*(?:\[[^\]]*\]\s*)*$/;
// The name a top-level declaration (comments and strings masked) introduces: `x` of `int x[2] = …`, `t` of
// `int (*t[2])(void)`, `Reading` of `typedef struct { … } Reading`, `P` of `struct P { … }`.
function declaredName(text){
 const body=text.replace(/;\s*$/,''),open=body.indexOf('{'),eq=body.indexOf('=');
 if(open>=0&&(eq<0||open<eq)){const after=body.slice(body.lastIndexOf('}')+1).split('=')[0];return LAST_NAME.exec(after)?.[1]??LAST_NAME.exec(body.slice(0,open))?.[1]??'';}
 const head=eq<0?body:body.slice(0,eq);return /\(\s*\*\s*(?:(?:const|volatile)\s+)*([A-Za-z_]\w*)/.exec(head)?.[1]??LAST_NAME.exec(head.split('(')[0])?.[1]??'';
}
// Top-level items of a source: [{kind:'function'|'declaration'|'directive', name, start, end, text, comment}], skipping
// the user sections. `comment` is the comment block directly above the item.
export function topLevelItems(source){
 const masked=maskC(source),sections=[...source.matchAll(USER_SECTION)].map(m=>[m.index,m.index+m[0].length]),items=[];let i=0,gapStart=0;
 const section=at=>sections.find(([a,b])=>at>=a&&at<b);
 while(i<masked.length){
  const s=section(i);if(s){i=s[1];gapStart=i;continue;}
  if(/\s/.test(masked[i])){i++;continue;}
  const start=i;let end,kind,name='';
  if(masked[i]==='#'&&/^[ \t]*$/.test(masked.slice(masked.lastIndexOf('\n',i-1)+1,i))){
   end=i;do{end=masked.indexOf('\n',end);if(end<0)end=masked.length;}while(source[end-1]==='\\'&&end++<masked.length);kind='directive';name=flatC(source.slice(start,end));
  }else{
   // Up to the first `;` or `{` at parenthesis depth 0: a `{` after `)` without `=` opens a function body.
   let j=i,paren=0;while(j<masked.length&&!(paren===0&&(masked[j]===';'||masked[j]==='{'))){if(masked[j]==='(')paren++;else if(masked[j]===')')paren--;j++;}
   const head=masked.slice(i,j),fn=masked[j]==='{'&&/\)\s*$/.test(head)&&!head.includes('=');
   if(masked[j]==='{'){let depth=1;j++;while(j<masked.length&&depth){if(masked[j]==='{')depth++;else if(masked[j]==='}')depth--;j++;}if(depth)return null;if(!fn){while(j<masked.length&&masked[j]!==';'){if(masked[j]==='{')return null;j++;}j++;}}else j++;
   end=Math.min(j,masked.length);kind=fn?'function':'declaration';
   name=fn?FN_NAME.exec(head)?.[1]??'':declaredName(masked.slice(i,end));
  }
  if(section(end-1))return null;
  // A comment after the item on its last line (`int n; /* count */`) is part of it.
  {const eol=source.indexOf('\n',end),rest=source.slice(end,eol<0?source.length:eol);if(/^[ \t]*(\/\/.*|\/\*.*\*\/)[ \t]*$/.test(rest))end+=rest.length;}
  // The comment lines right above belong to the item.
  const gap=source.slice(gapStart,start),comment=/((?:[ \t]*(?:\/\/[^\n]*|\/\*[\s\S]*?\*\/)[ \t]*\n)+)[ \t]*$/.exec(gap)?.[1]??'';
  items.push({kind,name,start:start-comment.length,end,text:source.slice(start,end),comment});i=end;gapStart=end;
 }
 return items;
}
/** Moves user code outside the USER CODE sections of `previous` into its sections. Returns {source, moved:[names]}. */
export function adoptOutsideCode(previous,generated,previousDefault=''){
 const out={source:previous,moved:[]};
 if(!/\/\* USER CODE BEGIN PV \*\//.test(previous)||!/\/\* USER CODE BEGIN 4 \*\//.test(previous))return out;
 let items;try{items=topLevelItems(previous);}catch{return out;}
 const known=[generated,previousDefault].filter(Boolean).map(t=>{try{return topLevelItems(t)??[];}catch{return [];}}).flat();if(!items||!known.length)return out;
 const texts=new Set(known.map(k=>flatC(k.text))),names=new Set(known.filter(k=>k.kind!=='directive'&&k.name).map(k=>k.name));
 const main=items.find(k=>k.kind==='function'&&k.name==='main');if(!main)return out;
 const has=tag=>previous.includes(`/* USER CODE END ${tag} */`),add={};
 // A callback or handler written without the generator's user section, under a name the generator also writes, is the
 // user's own version: it is kept and the generated one is dropped (dropShadowedCallbacks).
 const own=k=>k.kind==='function'&&/^HAL_\w+Callback$|_Handler$/.test(k.name)&&!k.text.includes('/* USER CODE BEGIN ');
 const user=items.filter(k=>!(texts.has(flatC(k.text))||k.kind!=='directive'&&names.has(k.name)&&!own(k)||k===main||k.kind==='declaration'&&!k.name));
 for(const k of user){
  const before=k.start<main.start,tag=!before?'4':k.kind==='directive'&&/^#\s*include\b/.test(k.text)&&has('Includes')?'Includes':k.kind==='function'?(has('0')?'0':'4'):'PV';
  (add[tag]??=[]).push(k);
 }
 if(!user.length)return out;
 let source=previous;
 // Remove from the end so offsets stay valid, then append each group to its section in source order.
 for(const k of [...user].sort((a,b)=>b.start-a.start))source=source.slice(0,k.start)+source.slice(k.end).replace(/^[ \t]*\n/,'');
 for(const [tag,list]of Object.entries(add)){
  const marker=`/* USER CODE END ${tag} */`,at=source.indexOf(marker),lineStart=source.lastIndexOf('\n',at-1)+1;
  const text=list.map(k=>k.comment+k.text).join('\n')+'\n';source=source.slice(0,lineStart)+text+source.slice(lineStart);
 }
 return {source,moved:user.map(k=>k.name||flatC(k.text).slice(0,40))};
}
// A callback or handler the user defines in a user section replaces the generated one of the same name.
function dropShadowedCallbacks(source){
 let fns;try{fns=cFunctions(source);}catch{return source;}
 const spans=[...source.matchAll(USER_SECTION)].map(m=>[m.index,m.index+m[0].length]),inUser=at=>spans.some(([a,b])=>at>=a&&at<b);
 const user=new Set(fns.filter(f=>inUser(f.start)).map(f=>f.name));
 for(const f of fns.filter(f=>!inUser(f.start)&&user.has(f.name)&&/^HAL_\w+Callback$|^__io_putchar$|^__io_getchar$|^_write$|^_read$/.test(f.name)).sort((a,b)=>b.start-a.start))source=source.slice(0,f.start).replace(/\n\n$/,'\n')+source.slice(f.end).replace(/^\n/,'');
 return source;
}
/** Regenerated main.c: user sections kept, user code outside them moved into sections, shadowed handlers dropped. */
export function regenerateMain(previous,generated,previousDefault='',others=[]){
 const adopted=adoptOutsideCode(String(previous||''),generated,previousDefault);
 return {code:dropShadowedCallbacks(dropShadowedHandlers(keepUserCode(adopted.source,generated,previousDefault),others)),moved:adopted.moved};
}
