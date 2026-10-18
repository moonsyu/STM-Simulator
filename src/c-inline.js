import {compileHal} from './hal-source.js';

// Expand demonstration helpers into ordinary C blocks. Argument temporaries are
// evaluated once; return flags leave nested loops without returning from main.
export function inlineStatements(source,helpers='',prefix='example_'){
 const parsed=compileHal(helpers+'\nint main(void) {\n'+source+'\n}'),functions=parsed.functions;
 let serial=0;
 const names=new Set((source+'\n'+helpers).match(/\b[A-Za-z_]\w*\b/g)||[]);
 const unique=base=>{let name=base;while(names.has(name))name=base+'_'+(++serial);names.add(name);return name;};
 const fresh=()=>unique(prefix+(++serial));
 const type=d=>(d.constant?'const ':'')+(d.volatile?'volatile ':'')+d.type+(d.pointer?' *':' ');
 const hasReturn=n=>n&&typeof n==='object'&&(n.type==='return'||Object.values(n).some(v=>Array.isArray(v)?v.some(hasReturn):hasReturn(v)));
 function expr(n,env={},stack=[]){
  if(!n)return {code:'',before:''};
  const result=(code,before='')=>({code,before});
  if(n.type==='name')return result(env[n.name]||n.name);
  if(n.type==='literal')return result(n.raw??(typeof n.value==='string'?JSON.stringify(n.value):String(n.value)+(n.numericType==='double'&&Number.isInteger(n.value)?'.0':n.value>2147483647?'U':'')));
  if(n.type==='call'){
   const args=n.args.map(a=>expr(a,env,stack)),name=n.callee.name,fn=functions[name];
   if(!fn||name==='main')return result(expr(n.callee,env,stack).code+'('+args.map(a=>a.code).join(', ')+')',args.map(a=>a.before).join(''));
   if(stack.includes(name))throw new Error('재귀 함수는 main 내부 예제로 펼칠 수 없습니다: '+name);
   const local={},id=fresh(),ret=fn.type==='void'?'':unique(id+'_return'),done=hasReturn(fn.body)?unique(id+'_done'):null;
   // Only helper-local names are renamed; shared example state keeps its name.
   const collect=node=>{if(!node||typeof node!=='object')return;if(node.type==='declare')for(const d of node.declarations)local[d.name]??=unique(id+'_local_'+d.name);for(const v of Object.values(node))if(Array.isArray(v))v.forEach(collect);else if(v&&typeof v==='object')collect(v);};collect(fn.body);
   fn.params.forEach(p=>local[p.name]??=unique(id+'_local_'+p.name));
   let before=args.map(a=>a.before).join('')+(ret?type(fn)+ret+' = 0;\n':'')+'{\n';
   before+=fn.params.map((p,i)=>type(p)+local[p.name]+' = '+args[i].code+';\n').join('');
   if(done)before+='int '+done+' = 0;\n';
   before+=stmt(fn.body,local,[...stack,name],{done,ret})+'\n}\n';
   return result(ret||'0',before);
  }
  if(n.type==='conditional'){
   const t=expr(n.test,env,stack),y=expr(n.yes,env,stack),z=expr(n.no,env,stack);
   if(!y.before&&!z.before)return result('('+t.code+' ? '+y.code+' : '+z.code+')',t.before);
   const id=fresh();return result(id,t.before+'int '+id+';\nif ('+t.code+') {\n'+y.before+id+' = '+y.code+';\n} else {\n'+z.before+id+' = '+z.code+';\n}\n');
  }
  if(n.type==='binary'||n.type==='assign'){
   const a=expr(n.a,env,stack),b=expr(n.b,env,stack);
   if(['&&','||'].includes(n.op)&&b.before){const id=fresh();return result(id,a.before+'int '+id+' = !!('+a.code+');\nif ('+(n.op==='||'?'!':'')+id+') {\n'+b.before+id+' = !!('+b.code+');\n}\n');}
   return result('('+a.code+' '+n.op+' '+b.code+')',a.before+b.before);
  }
  if(n.type==='unary'||n.type==='postfix'||n.type==='cast'){const a=expr(n.a,env,stack);return result(n.type==='cast'?'('+(n.constant?'const ':'')+(n.volatile?'volatile ':'')+n.to+(n.pointer?' *':'')+')('+a.code+')':n.type==='postfix'?'('+a.code+n.op+')':'('+n.op+a.code+')',a.before);}
  if(n.type==='sizeofType')return result('sizeof('+(n.constant?'const ':'')+(n.volatile?'volatile ':'')+n.targetType+(n.pointer?' *':'')+')');
  if(n.type==='member'){const a=expr(n.object,env,stack);return result(a.code+(n.pointer?'->':'.')+n.key,a.before);}
  if(n.type==='index'){const a=expr(n.object,env,stack),b=expr(n.index,env,stack);return result(a.code+'['+b.code+']',a.before+b.before);}
  if(n.type==='list'){const values=n.values.map(v=>expr(v,env,stack));return result('{'+values.map(v=>v.code).join(', ')+'}',values.map(v=>v.before).join(''));}
  throw new Error('main 예제 변환을 지원하지 않는 표현식: '+n.type);
 }
 function stmt(n,env={},stack=[],flow={}){
  if(!n)return '';const e=x=>expr(x,env,stack),s=x=>stmt(x,env,stack,flow),guard=flow.done?'!'+flow.done+' && ':'';
  if(n.type==='block'){
   let rest=n.body.map(s),at=n.body.findIndex(hasReturn);
   if(flow.done&&at>=0&&at<n.body.length-1){const tail={type:'block',body:n.body.slice(at+1)};rest=[...rest.slice(0,at+1),'if (!'+flow.done+') '+s(tail)];}
   return '{\n'+rest.join('\n')+'\n}';
  }
  if(n.type==='declare')return n.declarations.map(d=>{const v=e(d.value),size=e(d.size);return size.before+v.before+(d.storage?'static ':'')+type(d)+(env[d.name]||d.name)+(d.array?'['+size.code+']':'')+(d.value?' = '+v.code:'')+';';}).join('\n');
  if(n.type==='expression'){const v=e(n.expr);return v.before+(v.code==='0'&&v.before?'':v.code+';');}
  if(n.type==='return'){const v=e(n.value);if(!flow.done)return v.before+'return'+(n.value?' '+v.code:'')+';';return '{\n'+v.before+(flow.ret?flow.ret+' = '+v.code+';\n':'')+flow.done+' = 1;\n}';}
  if(n.type==='if'){const v=e(n.test);return v.before+'if ('+v.code+') '+s(n.yes)+(n.no?' else '+s(n.no):'');}
  if(n.type==='switch'){const v=e(n.discriminant);return v.before+'switch ('+v.code+') {\n'+n.cases.map(c=>(c.test?'case '+e(c.test).code+':\n':'default:\n')+c.consequent.map(s).join('\n')).join('\n')+'\n}';}
  if(n.type==='while'){const v=e(n.test);return v.before?'while ('+(flow.done?'!'+flow.done:'1')+') {\n'+v.before+'if (!('+v.code+')) break;\n'+s(n.body)+'\n}':'while ('+guard+'('+v.code+')) '+s(n.body);}
  if(n.type==='for'){const t=e(n.test),u=e(n.update);if(u.before)throw new Error('for 증감식의 보조 함수는 본문으로 옮겨 주세요.');return '{\n'+s(n.init)+'\nfor (; '+(t.before?(flow.done?'!'+flow.done:'1'):guard+'('+t.code+')')+'; '+u.code+') {\n'+t.before+(t.before?'if (!('+t.code+')) break;\n':'')+s(n.body)+'\n}\n}';}
  if(n.type==='do'){const t=e(n.test);if(t.before)throw new Error('do 조건의 보조 함수는 본문으로 옮겨 주세요.');return 'do '+s(n.body)+' while ('+guard+'('+t.code+'));';}
  if(n.type==='break'||n.type==='continue')return n.type+';';
  if(n.type==='empty')return ';';throw new Error('main 예제 변환을 지원하지 않는 문장: '+n.type);
 }
 return parsed.functions.main.body.body.map(n=>stmt(n)).join('\n');
}
