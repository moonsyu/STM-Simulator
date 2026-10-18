import {commonType,promote} from './c-types.js';
const scalar=type=>({type});
// Inspect declared types only. In particular, sizeof must not run calls,
// increment indices, or dereference a pointer to discover an expression's type.
export function expressionType(runtime,n){
 const of=node=>expressionType(runtime,node);
 if(!n)return scalar('int');
 if(n.type==='sizeofType'||n.type==='sizeofExpr')return scalar('size_t');
 if(n.type==='literal')return typeof n.value==='string'?{type:'char',array:true,length:n.value.length+1}:scalar(n.numericType||'int');
 if(n.type==='cast')return {type:n.to,pointer:!!n.pointer};
 if(n.type==='name'){
  const fn=runtime.program.functions[n.name];if(fn)return {type:fn.type,pointer:!!fn.pointer};
  const c=runtime.cell(n.name),value=c.value;
  if(c.dataType==='pointer')return {type:c.pointeeType||value?.array?.cells[0]?.dataType||value?.cell?.dataType||'int',pointer:true};
  return {type:c.dataType||value?.type||(typeof value==='number'&&!Number.isInteger(value)?'double':value>2147483647?'uint32_t':'int'),...(value?.kind==='array'?{array:true,length:value.cells.length}:{})};
 }
 if(n.type==='index'){const object=of(n.object);return scalar(object.type);}
 if(n.type==='member'){
  const object=of(n.object),field=runtime.program.structs[object.type]?.find(f=>f.name===n.key);
  if(!field)throw Error('구조체 필드가 없습니다: '+n.key);return {type:field.type,pointer:!!field.pointer};
 }
 if(n.type==='unary'){
  const a=of(n.a);if(n.op==='&')return {type:a.type,pointer:true};if(n.op==='*')return scalar(a.type);
  if(n.op==='++'||n.op==='--')return a;
  return scalar(n.op==='!'?'int':promote(a.type));
 }
 if(n.type==='postfix'||n.type==='assign')return of(n.a);
 if(n.type==='conditional'){const a=of(n.yes),b=of(n.no);return a.pointer||a.array?{type:a.type,pointer:true}:b.pointer||b.array?{type:b.type,pointer:true}:scalar(commonType(a.type,b.type));}
 if(n.type==='binary'){
  if(['==','!=','<','>','<=','>=','&&','||'].includes(n.op))return scalar('int');
  const a=of(n.a),b=of(n.b);
  if(a.pointer||a.array)return b.pointer||b.array?scalar('int'):{type:a.type,pointer:true};
  return scalar(n.op==='<<'||n.op==='>>'?promote(a.type):commonType(a.type,b.type));
 }
 if(n.type==='call'&&n.callee.type==='name'){
  const name=n.callee.name,fn=runtime.program.functions[name];if(fn)return {type:fn.type,pointer:!!fn.pointer};
  if(['sin','cos','tan','sqrt','floor','ceil','round','pow','log'].includes(name))return scalar('double');
  if(['HAL_GetTick','HAL_ADC_GetValue','HAL_RCC_GetHCLKFreq','HAL_RCC_GetPCLK1Freq','HAL_RCC_GetPCLK2Freq','HAL_RCC_GetSysClockFreq','__HAL_TIM_GET_COUNTER','__HAL_TIM_GET_COMPARE'].includes(name))return scalar('uint32_t');
 }
 return scalar('int');
}
