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
