import {maskC} from './c-source-edit.js';

// A GPIO mask can span ports after allocation. Preserve a single evaluation of
// the state argument and update every destination pin, including combined masks.
export function remapGpioCalls(source,pins,save){
 const masked=maskC(source),pattern=/\bHAL_GPIO_(WritePin|ReadPin|TogglePin)\s*\(/g,edits=[];let match,index=0;
 while((match=pattern.exec(masked))){
  const open=pattern.lastIndex-1,args=[];let start=open+1,depth=1,end=start;
  for(;end<masked.length;end++){
   const c=masked[end];if(c==='(')depth++;if(c===')')depth--;
   if((c===','&&depth===1)||depth===0){args.push(source.slice(start,end).trim());start=end+1;}
   if(depth===0)break;
  }
  pattern.lastIndex=end+1;const port=/^GPIO([A-H])$/.exec((args[0]||'').replace(/[()\s]/g,'')),mask=args[1]||'';
  if(!port)continue;
  const dynamic=!!mask.replace(/GPIO_PIN_\d+|[()|\s]/g,'')||!mask.includes('GPIO_PIN_');
  if(dynamic&&!Object.entries(pins).some(([old,next])=>old.startsWith('P'+port[1])&&old!==next))continue;
  const op=match[1];
  if(dynamic&&op==='ReadPin')throw new Error('동적 GPIO 입력 마스크는 고정 핀 예제로 바꾼 뒤 재배선하세요.');
  let suffix;do{suffix=index++;}while(new RegExp('\\bdocsGpio(?:State|Mask)'+suffix+'\\b').test(masked));
  const maskName='docsGpioMask'+suffix,groups=new Map(),bits=dynamic?Array.from({length:16},(_,i)=>i):[...mask.matchAll(/GPIO_PIN_(\d+)/g)].map(n=>Number(n[1]));
  for(const n of bits){
   const old='P'+port[1]+n,pin=pins[old]||old,key='GPIO'+pin[1];if(!groups.has(key))groups.set(key,new Set());
   const target='GPIO_PIN_'+Number(pin.slice(2));groups.get(key).add(dynamic?`((${maskName} & GPIO_PIN_${n}) ? ${target} : 0)`:target);
  }
  const call=(p,mask,state)=>`HAL_GPIO_${op}(${p}, ${[...mask].join(' | ')}${op==='WritePin'?', '+state:''})`;
  let result;
  if(groups.size===1&&!dynamic){const [p,mask]=[...groups][0];result=call(p,mask,args[2]);}
  else if(op==='ReadPin')result='('+[...groups].map(([p,m])=>call(p,m)).join(' | ')+')';
  else{
   const state='docsGpioState'+suffix;
   const writes=[...groups].map(([p,m],i)=>{if(!dynamic)return call(p,m,state)+';';const portMask='docsGpioPort'+suffix+'_'+i;return `uint32_t ${portMask} = ${[...m].join(' | ')};\nif (${portMask} != 0) ${call(p,[portMask],state)};`;}).join('\n');
   result='do {\n'+(dynamic?`uint32_t ${maskName} = ${mask};\n`:'')+(op==='WritePin'?`GPIO_PinState ${state} = ${args[2]};\n`:'')+writes+'\n} while (0)';
  }
  edits.push({start:match.index,end:end+1,text:save(result)});
 }
 for(const edit of edits.reverse())source=source.slice(0,edit.start)+edit.text+source.slice(edit.end);
 return source;
}
