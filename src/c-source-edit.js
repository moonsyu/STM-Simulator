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
