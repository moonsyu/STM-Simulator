import {compile} from './parser.js';
export function displayValue(value,depth=0,seen=new Set()){
  if(value===null||typeof value!=='object')return typeof value==='string'?JSON.stringify(value):String(value);
  if(depth>3||seen.has(value))return '…';seen.add(value);
  if(value.kind==='array')return '['+value.cells.slice(0,16).map(c=>displayValue(c.value,depth+1,new Set(seen))).join(', ')+(value.cells.length>16?', …':'')+']';
  if(value.kind==='struct')return '{'+Object.entries(value.fields).slice(0,16).map(([k,c])=>`${k}: ${displayValue(c.value,depth+1,new Set(seen))}`).join(', ')+'}';
  if(value.kind==='pointer'){const c=value.array?.cells[value.index]??value.cell;return c?.owner?.alive===false?'[수명이 끝난 포인터]':c?'→ '+displayValue(c.value,depth+1,seen):'[범위 끝 포인터]';}
  return value.name??value.kind??'[값]';
}
export function inspectRuntime(runtime){
  const globalNames=new Set(runtime.program.globals.flatMap(s=>(s.declarations||[]).map(d=>d.name)));
  const locals=Object.assign(Object.create(null),...runtime.scopes.slice(1).map(s=>s.cells));
  const rows=cells=>Object.entries(cells).map(([name,cell])=>({name,type:cell.dataType||'',value:displayValue(cell.value)}));
  return {location:runtime.location,locals:rows(locals),globals:rows(Object.fromEntries(Object.entries(runtime.globals.cells).filter(([n])=>globalNames.has(n)))),frames:runtime.frames.map(f=>({name:f.name,loc:f.loc})).reverse()};
}
export function watchValue(runtime,text){
  if(!text.trim()||text.length>250)throw new Error('감시식은 1~250자로 입력하세요.');
  const p=compile(`void loop(){ ${text}; }`),body=p.functions.loop.body.body;
  if(body.length!==1||body[0].type!=='expression')throw new Error('값을 읽는 표현식만 사용할 수 있습니다.');
  const check=n=>{if(!n||!['literal','name','binary','unary','index','member','conditional','cast'].includes(n.type)||['++','--'].includes(n.op))throw new Error('감시식에서 대입·함수 호출은 사용할 수 없습니다.');for(const [k,v] of Object.entries(n))if(v&&typeof v==='object'&&k!=='loc')check(v);};
  check(body[0].expr);const steps=runtime.steps,allocations=runtime.allocations;
  try{const result=runtime.evaluate(body[0].expr).next();if(!result.done)throw new Error('평가를 완료할 수 없습니다.');return displayValue(result.value);}finally{runtime.steps=steps;runtime.allocations=allocations;}
}
