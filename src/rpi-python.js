// Raspberry Pi main.py: a small Python 3 interpreter for the GPIO programs of the lecture examples and programs like
// them. It runs as a circuit driver on the same time axis as the other boards: sleep() and input() wait, every
// statement takes a little time (so busy loops on perf_counter() advance), and pins go into the shared circuit.
//
// Language: assignments (also to attributes, items and tuples, and += …), if/elif/else, while, for … in, break,
// continue, pass, def with return and global, lambda, try/except/finally, raise, numbers, strings with f-strings,
// lists, tuples, dicts, comparisons, and/or/not, the conditional expression, calls with keyword arguments.
// Library: gpiozero LED, PWMLED, Button, LEDBoard; RPi.GPIO (setmode, setup, output, input, PWM, cleanup);
// time.sleep / time / perf_counter / monotonic; signal.pause; print, input, int, float, str, bool, len, range, abs,
// min, max, round, sum, list, tuple, dict, enumerate.
import {devboardModel} from './devboards.js';

const VCC=3.3,STATEMENT_US=2;
export class PythonError extends Error{constructor(type,message){super(message);this.type=type;}}
const fail=(type,message)=>{throw new PythonError(type,message);};

// ------------------------------------------------------------------ values
export class PyFloat{constructor(v){this.v=v;}}
class Tuple extends Array{}
const tuple=items=>{const t=new Tuple();t.push(...items);return t;};
const isNum=x=>typeof x==='number'||x instanceof PyFloat||typeof x==='boolean';
const num=x=>x instanceof PyFloat?x.v:typeof x==='boolean'?Number(x):x;
const isFloat=x=>x instanceof PyFloat;
const make=(v,float)=>float?new PyFloat(v):v;
const truthy=x=>x===null||x===undefined?false:x instanceof PyFloat?x.v!==0:Array.isArray(x)?x.length>0:x instanceof Map?x.size>0:typeof x==='string'?x.length>0:typeof x==='object'||typeof x==='function'?true:!!x;
function typeName(x){
 if(x===null)return 'NoneType';if(typeof x==='boolean')return 'bool';if(typeof x==='number')return 'int';if(x instanceof PyFloat)return 'float';
 if(typeof x==='string')return 'str';if(x instanceof Tuple)return 'tuple';if(Array.isArray(x))return 'list';if(x instanceof Map)return 'dict';
 if(x?.pyFunction||typeof x==='function')return 'function';return x?.constructor?.pyName??'object';
}
function floatText(v){if(!Number.isFinite(v))return Number.isNaN(v)?'nan':v>0?'inf':'-inf';const s=String(v);return Number.isInteger(v)&&!/e/.test(s)?s+'.0':s;}
export function str(x){
 if(x===null||x===undefined)return 'None';if(x===true)return 'True';if(x===false)return 'False';
 if(x instanceof PyFloat)return floatText(x.v);if(typeof x==='string')return x;if(typeof x==='number')return String(x);
 return repr(x);
}
function repr(x){
 if(typeof x==='string')return `'${x.replace(/\\/g,'\\\\').replace(/'/g,"\\'")}'`;
 if(x instanceof Tuple)return x.length===1?`(${repr(x[0])},)`:`(${x.map(repr).join(', ')})`;
 if(Array.isArray(x))return `[${x.map(repr).join(', ')}]`;
 if(x instanceof Map)return `{${[...x].map(([k,v])=>`${repr(k)}: ${repr(v)}`).join(', ')}}`;
 if(x?.pyFunction)return `<function ${x.name}>`;if(typeof x==='function')return `<built-in function ${x.pyName??x.name}>`;
 if(typeof x==='object'&&x&&!(x instanceof PyFloat))return x.pyRepr?.()??`<${typeName(x)} object>`;
 return str(x);
}
const key=x=>x instanceof PyFloat?(Number.isInteger(x.v)?x.v:'f'+x.v):typeof x==='boolean'?Number(x):x instanceof Tuple?'t'+x.map(key).join(','):typeof x==='string'?'s'+x:x;
class Dict extends Map{
 get(k){return super.get(key(k))?.[1];}set(k,v){return super.set(key(k),[k,v]);}has(k){return super.has(key(k));}delete(k){return super.delete(key(k));}
 *[Symbol.iterator](){for(const [,pair] of super.entries())yield pair;}
 keys(){return [...this].map(p=>p[0]);}
}
function equal(a,b){
 if(isNum(a)&&isNum(b))return num(a)===num(b);
 if(Array.isArray(a)&&Array.isArray(b))return (a instanceof Tuple)===(b instanceof Tuple)&&a.length===b.length&&a.every((x,i)=>equal(x,b[i]));
 return a===b;
}
function contains(container,item){
 if(typeof container==='string')return container.includes(str(item));
 if(Array.isArray(container))return container.some(x=>equal(x,item));
 if(container instanceof Map)return container.has(item);
 fail('TypeError',`'${typeName(container)}'에는 in을 쓸 수 없습니다.`);
}
// %-free format specs: [fill][align][width][,][.precision][type] with types d f % e s
function formatSpec(value,spec){
 if(!spec)return str(value);
 const m=/^(?:(.)?([<>^]))?(0)?(\d+)?(,)?(?:\.(\d+))?([dfe%sgx])?$/.exec(spec);if(!m)fail('ValueError',`지원하지 않는 서식: ${spec}`);
 const [,fill=' ',align,zero,width,comma,precision,type]=m;let text;
 if(type==='%')text=(num(value)*100).toFixed(precision===undefined?6:Number(precision))+'%';
 else if(type==='f')text=num(value).toFixed(precision===undefined?6:Number(precision));
 else if(type==='e')text=num(value).toExponential(precision===undefined?6:Number(precision)).replace(/e([+-])(\d)$/,'e$10$2');
 else if(type==='d')text=String(Math.trunc(num(value)));
 else if(type==='x')text=Math.trunc(num(value)).toString(16);
 else if(precision!==undefined&&isNum(value))text=Number(num(value).toPrecision(Number(precision))).toString();
 else text=str(value);
 if(comma)text=text.replace(/^(-?\d+)/,d=>d.replace(/\B(?=(\d{3})+(?!\d))/g,','));
 const w=Number(width||0);if(text.length<w){const pad=(zero?'0':fill).repeat(w-text.length),a=align||(isNum(value)?'>':'<');text=a==='<'?text+pad:a==='^'?pad.slice(0,pad.length>>1)+text+pad.slice(pad.length>>1):zero&&/^-/.test(text)?'-'+pad+text.slice(1):pad+text;}
 return text;
}

// ------------------------------------------------------------------ tokens
const KEYWORDS=new Set(['False','None','True','and','as','break','continue','def','del','elif','else','except','finally','for','from','global','if','import','in','is','lambda','nonlocal','not','or','pass','raise','return','try','while','with','assert']);
const OPS=['**=','//=','>>=','<<=','**','//','==','!=','<=','>=','+=','-=','*=','/=','%=','->','<<','>>','+','-','*','/','%','<','>','=','(',')','[',']','{','}',',',':','.','&','|','^','~','@',';'];
export function tokenize(source){
 const tokens=[],indents=[0],lines=String(source).replace(/\r\n?/g,'\n').split('\n');let depth=0;
 const push=(type,value,line)=>tokens.push({type,value,line});
 for(let n=0;n<lines.length;n++){
  const text=lines[n],line=n+1;let i=0;
  if(depth===0){
   const indent=/^[ \t]*/.exec(text)[0].replace(/\t/g,'    ').length,rest=text.trimStart();
   if(!rest||rest.startsWith('#'))continue;
   if(indent>indents.at(-1)){indents.push(indent);push('indent',null,line);}
   while(indent<indents.at(-1)){indents.pop();push('dedent',null,line);}
   if(indent!==indents.at(-1))fail('IndentationError',`${line}행: 들여쓰기가 맞지 않습니다.`);
   i=text.length-rest.length;
  }
  while(i<text.length){
   const c=text[i];
   if(c===' '||c==='\t'){i++;continue;}
   if(c==='#')break;
   if(c==='\\'&&i===text.length-1){i++;break;}
   const sm=/^([rRfFbB]{0,2})('''|"""|'|")/.exec(text.slice(i));
   if(sm&&(sm[1]===''||/^[rRfFbB]+$/.test(sm[1]))&&!(sm[1]&&/[\w]/.test(text[i-1]??''))){
    const prefix=sm[1].toLowerCase(),quote=sm[2];let j=i+sm[0].length,value='';
    const triple=quote.length===3;
    for(;;){
     if(j>=text.length){if(!triple)fail('SyntaxError',`${line}행: 문자열이 닫히지 않았습니다.`);n++;if(n>=lines.length)fail('SyntaxError',`${line}행: 문자열이 닫히지 않았습니다.`);value+='\n';j=0;continue;}
     const cur=n<lines.length?lines[n]:'';
     if(cur.startsWith(quote,j)){j+=quote.length;break;}
     if(cur[j]==='\\'&&!prefix.includes('r')){const e=cur[j+1];value+=({n:'\n',t:'\t',r:'\r','\\':'\\',"'":"'",'"':'"','0':'\0'})[e]??('\\'+e);j+=2;continue;}
     value+=cur[j++];
    }
    push(prefix.includes('f')?'fstring':'string',value,line);
    if(lines[n]!==text){i=j;const t=lines[n];while(i<t.length&&t[i]!=='#'){if(t[i]!==' ')break;i++;}if(i<t.length&&t[i]!=='#')fail('SyntaxError',`${n+1}행: 여러 줄 문자열 뒤의 코드는 지원하지 않습니다.`);break;}
    i=j;continue;
   }
   const nm=/^(0[xX][0-9a-fA-F_]+|0[bB][01_]+|(?:\d[\d_]*\.?[\d_]*|\.\d[\d_]*)(?:[eE][+-]?\d+)?)/.exec(text.slice(i));
   if(nm&&/[\d.]/.test(c)&&!(c==='.'&&!/\d/.test(text[i+1]??''))){const t=nm[1].replace(/_/g,'');push('number',/^0[xX]/.test(t)?parseInt(t,16):/^0[bB]/.test(t)?parseInt(t.slice(2),2):/[.eE]/.test(t)?new PyFloat(Number(t)):Number(t),line);i+=nm[1].length;continue;}
   const id=/^[A-Za-z_\u00c0-\uffff][\w\u00c0-\uffff]*/.exec(text.slice(i));
   if(id){push(KEYWORDS.has(id[0])?'keyword':'name',id[0],line);i+=id[0].length;continue;}
   const op=OPS.find(o=>text.startsWith(o,i));
   if(!op)fail('SyntaxError',`${line}행: 알 수 없는 문자 '${c}'`);
   if('([{'.includes(op))depth++;if(')]}'.includes(op))depth=Math.max(0,depth-1);
   push('op',op,line);i+=op.length;
  }
  if(depth===0&&tokens.length&&tokens.at(-1).type!=='newline'&&!text.trimEnd().endsWith('\\'))push('newline',null,line);
 }
 while(indents.length>1){indents.pop();push('dedent',null,lines.length);}
 push('eof',null,lines.length);
 return tokens;
}

// ------------------------------------------------------------------ parser
export function parse(source){
 const t=tokenize(source);let p=0;
 const peek=(o=0)=>t[p+o],at=(type,value)=>t[p].type===type&&(value===undefined||t[p].value===value),op=v=>at('op',v),kw=v=>at('keyword',v);
 const err=msg=>fail('SyntaxError',`${t[p].line}행: ${msg}`);
 const take=(type,value)=>{if(!at(type,value))err(value?`'${value}'이(가) 필요합니다.`:`${type}이(가) 필요합니다.`);return t[p++];};
 const name=()=>take('name').value;
 function block(){
  take('op',':');
  if(!at('newline')){const s=simpleLine();return s;}
  take('newline');take('indent');const body=[];while(!at('dedent')&&!at('eof'))body.push(...statement());take('dedent');return body;
 }
 function simpleLine(){const out=[small()];while(op(';')){p++;if(at('newline'))break;out.push(small());}if(!at('eof'))take('newline');return out;}
 function statement(){
  const line=t[p].line;
  if(kw('if')){p++;const branches=[{test:expression(),body:block()}];let orelse=null;
   while(kw('elif')){p++;branches.push({test:expression(),body:block()});}
   if(kw('else')){p++;orelse=block();}return [{type:'if',branches,orelse,line}];}
  if(kw('while')){p++;const test=expression(),body=block();let orelse=null;if(kw('else')){p++;orelse=block();}return [{type:'while',test,body,orelse,line}];}
  if(kw('for')){p++;const target=targetList();take('keyword','in');const iter=expressionList(),body=block();let orelse=null;if(kw('else')){p++;orelse=block();}return [{type:'for',target,iter,body,orelse,line}];}
  if(kw('def')){p++;const fname=name();take('op','(');const params=[];
   while(!op(')')){const pn=name();let def=null;if(op('=')){p++;def=expression();}params.push({name:pn,def});if(!op(')'))take('op',',');}
   take('op',')');if(op('->')){p++;expression();}return [{type:'def',name:fname,params,body:block(),line}];}
  if(kw('try')){p++;const body=block(),handlers=[];let orelse=null,final=null;
   while(kw('except')){p++;let types=null,as=null;if(!op(':')){types=expression();if(kw('as')){p++;as=name();}}handlers.push({types,as,body:block()});}
   if(kw('else')){p++;orelse=block();}if(kw('finally')){p++;final=block();}
   if(!handlers.length&&!final)err('except 또는 finally가 필요합니다.');return [{type:'try',body,handlers,orelse,final,line}];}
  if(kw('with'))err('with 문은 지원하지 않습니다.');
  return simpleLine();
 }
 function small(){
  const line=t[p].line;
  if(kw('pass')){p++;return {type:'pass',line};}
  if(kw('break')){p++;return {type:'break',line};}
  if(kw('continue')){p++;return {type:'continue',line};}
  if(kw('return')){p++;return {type:'return',value:at('newline')||op(';')?null:expressionList(),line};}
  if(kw('global')||kw('nonlocal')){p++;const names=[name()];while(op(',')){p++;names.push(name());}return {type:'global',names,line};}
  if(kw('raise')){p++;return {type:'raise',value:at('newline')?null:expression(),line};}
  if(kw('del')){p++;return {type:'del',target:expression(),line};}
  if(kw('assert')){p++;const test=expression();let msg=null;if(op(',')){p++;msg=expression();}return {type:'assert',test,msg,line};}
  if(kw('import')){p++;const items=[];do{if(op(','))p++;let mod=name();while(op('.')){p++;mod+='.'+name();}let as=null;if(kw('as')){p++;as=name();}items.push({mod,as});}while(op(','));return {type:'import',items,line};}
  if(kw('from')){p++;let mod=name();while(op('.')){p++;mod+='.'+name();}take('keyword','import');const names=[];const paren=op('(');if(paren)p++;
   do{if(op(','))p++;if(paren&&op(')'))break;if(op('*')){p++;names.push({name:'*'});continue;}const n=name();let as=null;if(kw('as')){p++;as=name();}names.push({name:n,as});}while(op(','));
   if(paren)take('op',')');return {type:'from',mod,names,line};}
  const first=expressionList();
  if(op('=')){const targets=[first];let value;while(op('=')){p++;value=expressionList();if(op('='))targets.push(value);}targets.forEach(checkTarget);return {type:'assign',targets,value,line};}
  const aug=['+=','-=','*=','/=','//=','%=','**='].find(o=>op(o));
  if(aug){p++;checkTarget(first);return {type:'augassign',target:first,op:aug.slice(0,-1),value:expressionList(),line};}
  if(op(':'))err('변수 타입 표기는 지원하지 않습니다.');
  return {type:'expr',value:first,line};
 }
 function checkTarget(e){if(['name','attr','index'].includes(e.type))return;if(e.type==='tuple'||e.type==='list'){e.items.forEach(checkTarget);return;}err('대입할 수 없는 대상입니다.');}
 function targetList(){const items=[primary()];while(op(',')){p++;if(kw('in'))break;items.push(primary());}return items.length===1?items[0]:{type:'tuple',items};}
 function expressionList(){const first=expression();if(!op(','))return first;const items=[first];while(op(',')){p++;if(at('newline')||op('=')||op(')')||op(';'))break;items.push(expression());}return {type:'tuple',items};}
 function expression(){
  if(kw('lambda')){p++;const params=[];while(!op(':')){const pn=name();let def=null;if(op('=')){p++;def=expression();}params.push({name:pn,def});if(!op(':'))take('op',',');}take('op',':');return {type:'lambda',params,body:expression()};}
  const value=or();
  if(kw('if')){p++;const test=or();take('keyword','else');return {type:'ifexp',test,yes:value,no:expression()};}
  return value;
 }
 function or(){let a=and();while(kw('or')){p++;a={type:'or',a,b:and()};}return a;}
 function and(){let a=not();while(kw('and')){p++;a={type:'and',a,b:not()};}return a;}
 function not(){if(kw('not')){p++;return {type:'not',value:not()};}return compare();}
 function compare(){
  const first=bitor(),ops=[],rest=[];
  for(;;){let o=null;
   if(['<','>','==','!=','<=','>='].some(x=>op(x))){o=t[p++].value;}
   else if(kw('in')){p++;o='in';}else if(kw('not')&&peek(1).type==='keyword'&&peek(1).value==='in'){p+=2;o='not in';}
   else if(kw('is')){p++;if(kw('not')){p++;o='is not';}else o='is';}
   if(!o)break;ops.push(o);rest.push(bitor());}
  return ops.length?{type:'compare',first,ops,rest}:first;
 }
 function bitor(){let a=bitxor();while(op('|')){p++;a={type:'bin',op:'|',a,b:bitxor()};}return a;}
 function bitxor(){let a=bitand();while(op('^')){p++;a={type:'bin',op:'^',a,b:bitand()};}return a;}
 function bitand(){let a=shift();while(op('&')){p++;a={type:'bin',op:'&',a,b:shift()};}return a;}
 function shift(){let a=arith();while(op('<<')||op('>>')){const o=t[p++].value;a={type:'bin',op:o,a,b:arith()};}return a;}
 function arith(){let a=term();while(op('+')||op('-')){const o=t[p++].value;a={type:'bin',op:o,a,b:term()};}return a;}
 function term(){let a=factor();while(op('*')||op('/')||op('//')||op('%')){const o=t[p++].value;a={type:'bin',op:o,a,b:factor()};}return a;}
 function factor(){if(op('-')||op('+')||op('~')){const o=t[p++].value;return {type:'unary',op:o,value:factor()};}return power();}
 function power(){const base=primary();if(op('**')){p++;return {type:'bin',op:'**',a:base,b:factor()};}return base;}
 function primary(){
  let e=atom();
  for(;;){
   if(op('.')){p++;e={type:'attr',object:e,name:name()};continue;}
   if(op('(')){p++;const args=[],kwargs=[];
    while(!op(')')){
     if(op('*')){p++;args.push({type:'star',value:expression()});}
     else if(at('name')&&peek(1).type==='op'&&peek(1).value==='='){const k=name();p++;kwargs.push({name:k,value:expression()});}
     else args.push(expression());
     if(!op(')'))take('op',',');
    }
    p++;e={type:'call',func:e,args,kwargs};continue;}
   if(op('[')){p++;let index;
    if(op(':')||(()=>{return false;})()){index=slice(null);}
    else{const first=expression();index=op(':')?slice(first):first;}
    take('op',']');e={type:'index',object:e,index};continue;}
   return e;
  }
 }
 function slice(start){take('op',':');const stop=op(']')||op(':')?null:expression();let step=null;if(op(':')){p++;step=op(']')?null:expression();}return {type:'slice',start,stop,step};}
 function atom(){
  const tok=t[p];
  if(tok.type==='number'){p++;return {type:'const',value:tok.value};}
  if(tok.type==='string'||tok.type==='fstring'){
   const parts=[];while(at('string')||at('fstring')){const s=t[p++];parts.push(s.type==='string'?{type:'const',value:s.value}:fstringParts(s.value,s.line));}
   return parts.length===1?parts[0]:{type:'concat',parts};
  }
  if(tok.type==='name'){p++;return {type:'name',name:tok.value,line:tok.line};}
  if(kw('True')){p++;return {type:'const',value:true};}
  if(kw('False')){p++;return {type:'const',value:false};}
  if(kw('None')){p++;return {type:'const',value:null};}
  if(op('(')){p++;if(op(')')){p++;return {type:'tuple',items:[]};}const first=expression();
   if(op(')')){p++;return first;}const items=[first];while(op(',')){p++;if(op(')'))break;items.push(expression());}take('op',')');return {type:'tuple',items};}
  if(op('[')){p++;const items=[];
   if(!op(']')){const first=expression();if(kw('for')){const comp=comprehension(first);take('op',']');return {type:'listcomp',...comp};}items.push(first);while(op(',')){p++;if(op(']'))break;items.push(expression());}}
   take('op',']');return {type:'list',items};}
  if(op('{')){p++;const pairs=[];while(!op('}')){const k=expression();take('op',':');pairs.push([k,expression()]);if(!op('}'))take('op',',');}p++;return {type:'dict',pairs};}
  err(`예상하지 못한 ${tok.value??tok.type}`);
 }
 function comprehension(element){take('keyword','for');const target=targetList();take('keyword','in');const iter=or();let cond=null;if(kw('if')){p++;cond=or();}return {element,target,iter,cond};}
 function fstringParts(text,line){
  const parts=[];let i=0,lit='';
  while(i<text.length){
   if(text.startsWith('{{',i)){lit+='{';i+=2;continue;}if(text.startsWith('}}',i)){lit+='}';i+=2;continue;}
   if(text[i]==='{'){
    if(lit){parts.push({type:'const',value:lit});lit='';}
    let depth=0,j=i+1,inner='';for(;j<text.length;j++){const c=text[j];if('([{'.includes(c))depth++;if(')]}'.includes(c)){if(c==='}'&&depth===0)break;depth--;}if(c===':'&&depth===0&&text[j+1]!=='=')break;if(c==='!'&&depth===0&&/[rsa]/.test(text[j+1]))break;inner+=c;}
    let conv=null,spec='';if(text[j]==='!'){conv=text[j+1];j+=2;}if(text[j]===':'){j++;while(j<text.length&&text[j]!=='}')spec+=text[j++];}
    if(text[j]!=='}')fail('SyntaxError',`${line}행: f-string의 {가 닫히지 않았습니다.`);
    parts.push({type:'format',value:parse(inner.trim()).body[0].value,conv,spec});i=j+1;continue;
   }
   lit+=text[i++];
  }
  if(lit)parts.push({type:'const',value:lit});
  return {type:'concat',parts,fstring:true};
 }
 const body=[];while(!at('eof'))body.push(...statement());
 return {body};
}

// ------------------------------------------------------------------ control flow signals
class Break{} class Continue{} class Return{constructor(value){this.value=value;}}
const BREAK=new Break(),CONTINUE=new Continue();

// ------------------------------------------------------------------ interpreter
export class PythonProgram{
 /**
  * `host`: {now() µs, print(text), modules: {name: {attr: value}}, readLine() → string|null}.
  * run() is a generator: it yields {wait: µs} to let time pass, {input: true} when input() has no line yet, and
  * {pause: true} for signal.pause(). The caller resumes it when the time has come.
  */
 constructor(source,host){this.ast=parse(source);this.host=host;this.globals=new Map(Object.entries(BUILTINS(this)));this.clock=0;}
 *run(){yield* this.block(this.ast.body,this.globals,null);}
 cost(){this.clock+=STATEMENT_US;}
 *block(stmts,scope,fn){for(const s of stmts){const r=yield* this.statement(s,scope,fn);if(r)return r;}return null;}
 lookup(nameNode,scope,fn){
  const n=nameNode.name;
  if(fn&&!fn.globals.has(n)&&scope.has(n))return scope.get(n);
  // A name the function assigns is local all through it (Python decides this when it compiles the function).
  if(fn?.locals?.has(n)&&!fn.globals.has(n))fail('UnboundLocalError',`지역 변수 '${n}'에 값을 넣기 전에 읽었습니다. 전역 변수를 바꾸려면 global ${n}을 쓰세요.`);
  if(this.globals.has(n))return this.globals.get(n);
  if(fn&&scope.has(n))fail('UnboundLocalError',`지역 변수 '${n}'에 값을 넣기 전에 읽었습니다. 전역 변수를 바꾸려면 global ${n}을 쓰세요.`);
  fail('NameError',`'${n}'이(가) 정의되지 않았습니다.`);
 }
 assignName(n,value,scope,fn){if(fn&&!fn.globals.has(n))scope.set(n,value);else this.globals.set(n,value);}
 *assign(target,value,scope,fn){
  if(target.type==='name'){this.assignName(target.name,value,scope,fn);return;}
  if(target.type==='attr'){const obj=yield* this.eval(target.object,scope,fn);setAttr(obj,target.name,value);return;}
  if(target.type==='index'){const obj=yield* this.eval(target.object,scope,fn),idx=yield* this.eval(target.index,scope,fn);
   if(obj instanceof Map){obj.set(idx,value);return;}if(Array.isArray(obj)&&!(obj instanceof Tuple)){obj[index(obj,idx)]=value;return;}fail('TypeError',`'${typeName(obj)}'의 항목은 바꿀 수 없습니다.`);}
  if(target.type==='tuple'||target.type==='list'){const items=iterate(value);if(items.length!==target.items.length)fail('ValueError',`값 ${items.length}개를 ${target.items.length}개로 나눌 수 없습니다.`);for(let i=0;i<items.length;i++)yield* this.assign(target.items[i],items[i],scope,fn);}
 }
 *statement(s,scope,fn){
  this.cost();this.line=s.line??this.line;if(this.clock>=this.budget)yield {wait:0};
  switch(s.type){
   case 'pass':return null;
   case 'break':return BREAK;
   case 'continue':return CONTINUE;
   case 'return':return new Return(s.value?yield* this.eval(s.value,scope,fn):null);
   case 'global':if(fn)s.names.forEach(n=>fn.globals.add(n));return null;
   case 'expr':yield* this.eval(s.value,scope,fn);return null;
   case 'assign':{const v=yield* this.eval(s.value,scope,fn);for(const tg of s.targets)yield* this.assign(tg,v,scope,fn);return null;}
   case 'augassign':{const cur=yield* this.eval(s.target,scope,fn),v=yield* this.eval(s.value,scope,fn);yield* this.assign(s.target,binary(s.op,cur,v,true),scope,fn);return null;}
   case 'del':{const tg=s.target;if(tg.type==='index'){const o=yield* this.eval(tg.object,scope,fn),i=yield* this.eval(tg.index,scope,fn);if(o instanceof Map)o.delete(i);else if(Array.isArray(o))o.splice(index(o,i),1);}else if(tg.type==='name'){if(fn&&!fn.globals.has(tg.name))scope.delete(tg.name);else this.globals.delete(tg.name);}return null;}
   case 'assert':if(!truthy(yield* this.eval(s.test,scope,fn)))fail('AssertionError',s.msg?str(yield* this.eval(s.msg,scope,fn)):'');return null;
   case 'raise':{if(!s.value){if(this.handling)throw this.handling;fail('RuntimeError','다시 던질 예외가 없습니다.');}const v=yield* this.eval(s.value,scope,fn);
    if(v instanceof PythonError)throw v;if(v?.pyException)throw new PythonError(v.pyException,'');if(v?.exceptionType)throw new PythonError(v.exceptionType,'');fail('TypeError','예외만 던질 수 있습니다.');}
   case 'import':for(const {mod,as} of s.items){const m=this.module(mod);if(as)this.assignName(as,m,scope,fn);else{const top=mod.split('.')[0];this.assignName(top,mod.includes('.')?this.module(top,true):m,scope,fn);}}return null;
   case 'from':{const m=this.module(s.mod);for(const {name,as} of s.names){if(name==='*'){for(const [k,v] of Object.entries(m))this.assignName(k,v,scope,fn);continue;}if(!(name in m))fail('ImportError',`${s.mod}에 ${name}이(가) 없습니다.`);this.assignName(as??name,m[name],scope,fn);}return null;}
   case 'def':{const f=this.makeFunction(s.name,s.params,s.body,scope,fn);for(const pdef of f.params)if(pdef.def)pdef.value=yield* this.eval(pdef.def,scope,fn);this.assignName(s.name,f,scope,fn);return null;}
   case 'if':{for(const b of s.branches)if(truthy(yield* this.eval(b.test,scope,fn)))return yield* this.block(b.body,scope,fn);return s.orelse?yield* this.block(s.orelse,scope,fn):null;}
   case 'while':{
    while(truthy(yield* this.eval(s.test,scope,fn))){this.cost();if(this.clock>=this.budget)yield {wait:0};const r=yield* this.block(s.body,scope,fn);if(r===BREAK)return null;if(r instanceof Return)return r;}
    return s.orelse?yield* this.block(s.orelse,scope,fn):null;
   }
   case 'for':{
    const items=iterate(yield* this.eval(s.iter,scope,fn));
    for(const item of items){this.cost();if(this.clock>=this.budget)yield {wait:0};yield* this.assign(s.target,item,scope,fn);const r=yield* this.block(s.body,scope,fn);if(r===BREAK)return null;if(r instanceof Return)return r;}
    return s.orelse?yield* this.block(s.orelse,scope,fn):null;
   }
   case 'try':{
    // finally runs after the body or a handler, also when they raise; a return / break in it wins, as in Python.
    let r=null,error=null;
    try{
     try{r=yield* this.block(s.body,scope,fn);if(!r&&s.orelse)r=yield* this.block(s.orelse,scope,fn);}
     catch(e){
      if(!(e instanceof PythonError))throw e;
      const h=s.handlers.find(h=>!h.types||this.matches(e,h.types,scope,fn));if(!h)throw e;
      if(h.as)this.assignName(h.as,exceptionValue(e),scope,fn);
      const prev=this.handling;this.handling=e;try{r=yield* this.block(h.body,scope,fn);}finally{this.handling=prev;}
     }
    }catch(e){error=e;}
    if(s.final){const f=yield* this.block(s.final,scope,fn);if(f)return f;}
    if(error)throw error;
    return r;
   }
  }
  fail('SyntaxError',`지원하지 않는 문장: ${s.type}`);
 }
 matches(e,typesNode,scope){
  const names=typesNode.type==='tuple'?typesNode.items:[typesNode];
  return names.some(n=>{const v=n.type==='name'?this.globals.get(n.name)??scope.get(n.name):null;const type=v?.exceptionType??n.name;return type==='Exception'||type==='BaseException'||type===e.type||(type==='ArithmeticError'&&e.type==='ZeroDivisionError')||(type==='LookupError'&&['IndexError','KeyError'].includes(e.type));});
 }
 makeFunction(name,params,body,scope,parent,expression=false){
  const program=this;
  const f=function*(args,kwargs){
   const local=new Map(),info={globals:new Set(),locals:assignedNames(body,params)};
   for(const st of collectGlobals(body))info.globals.add(st);
   params.forEach((pp,i)=>{if(i<args.length)local.set(pp.name,args[i]);else if(kwargs&&kwargs.has(pp.name))local.set(pp.name,kwargs.get(pp.name));else if(pp.def)local.set(pp.name,pp.value);else fail('TypeError',`${name}()에 인수 '${pp.name}'이(가) 필요합니다.`);});
   if(args.length>params.length)fail('TypeError',`${name}()은 인수를 ${params.length}개까지 받습니다.`);
   // Names the enclosing function defined stay readable (closures over a parent's locals).
   if(parent)for(const [k,v] of scope)if(!local.has(k)&&!info.globals.has(k))local.set(k,v);
   if(expression)return yield* program.eval(body,local,info);
   const r=yield* program.block(body,local,info);
   return r instanceof Return?r.value:null;
  };
  f.pyFunction=true;f.params=params;Object.defineProperty(f,'name',{value:name});return f;
 }
 *call(func,args,kwargs=new Map()){
  if(func?.pyFunction)return yield* func(args,kwargs);
  if(typeof func==='function'){const r=func(args,kwargs);return r&&typeof r.next==='function'&&r[Symbol.iterator]?yield* r:r;}
  if(func?.pyClass)return func.create(args,kwargs);
  fail('TypeError',`'${typeName(func)}'은(는) 호출할 수 없습니다.`);
 }
 *eval(e,scope,fn){
  switch(e.type){
   case 'const':return e.value;
   case 'name':return this.lookup(e,scope,fn);
   case 'tuple':{const out=[];for(const x of e.items)out.push(yield* this.eval(x,scope,fn));return tuple(out);}
   case 'list':{const out=[];for(const x of e.items)out.push(yield* this.eval(x,scope,fn));return out;}
   case 'listcomp':{const out=[],inner=new Map(scope),own={globals:new Set()};for(const item of iterate(yield* this.eval(e.iter,scope,fn))){yield* this.assign(e.target,item,inner,own);if(e.cond&&!truthy(yield* this.eval(e.cond,inner,own)))continue;out.push(yield* this.eval(e.element,inner,own));}return out;}
   case 'dict':{const d=new Dict();for(const [k,v] of e.pairs)d.set(yield* this.eval(k,scope,fn),yield* this.eval(v,scope,fn));return d;}
   case 'concat':{let s='';for(const part of e.parts){if(part.type==='format'){let v=yield* this.eval(part.value,scope,fn);if(part.conv==='r')v=repr(v);s+=formatSpec(v,part.spec);}else if(part.type==='concat')s+=yield* this.eval(part,scope,fn);else s+=part.value;}return s;}
   case 'attr':return getAttr(yield* this.eval(e.object,scope,fn),e.name);
   case 'index':{const obj=yield* this.eval(e.object,scope,fn);if(e.index.type==='slice')return sliceOf(obj,e.index.start&&num(yield* this.eval(e.index.start,scope,fn)),e.index.stop&&num(yield* this.eval(e.index.stop,scope,fn)),e.index.step&&num(yield* this.eval(e.index.step,scope,fn)));return item(obj,yield* this.eval(e.index,scope,fn));}
   case 'call':{
    const func=yield* this.eval(e.func,scope,fn),args=[],kwargs=new Map();
    for(const a of e.args){if(a.type==='star')args.push(...iterate(yield* this.eval(a.value,scope,fn)));else args.push(yield* this.eval(a,scope,fn));}
    for(const k of e.kwargs)kwargs.set(k.name,yield* this.eval(k.value,scope,fn));
    return yield* this.call(func,args,kwargs);
   }
   case 'lambda':{const f=this.makeFunction('<lambda>',e.params,e.body,scope,fn,true);for(const pdef of f.params)if(pdef.def)pdef.value=yield* this.eval(pdef.def,scope,fn);return f;}
   case 'ifexp':return truthy(yield* this.eval(e.test,scope,fn))?yield* this.eval(e.yes,scope,fn):yield* this.eval(e.no,scope,fn);
   case 'or':{const a=yield* this.eval(e.a,scope,fn);return truthy(a)?a:yield* this.eval(e.b,scope,fn);}
   case 'and':{const a=yield* this.eval(e.a,scope,fn);return truthy(a)?yield* this.eval(e.b,scope,fn):a;}
   case 'not':return !truthy(yield* this.eval(e.value,scope,fn));
   case 'unary':{const v=yield* this.eval(e.value,scope,fn);if(!isNum(v))fail('TypeError',`'${typeName(v)}'에 단항 ${e.op}를 쓸 수 없습니다.`);return e.op==='-'?make(-num(v),isFloat(v)):e.op==='~'?~num(v):make(num(v),isFloat(v));}
   case 'bin':return binary(e.op,yield* this.eval(e.a,scope,fn),yield* this.eval(e.b,scope,fn));
   case 'compare':{
    let left=yield* this.eval(e.first,scope,fn);
    for(let i=0;i<e.ops.length;i++){const right=yield* this.eval(e.rest[i],scope,fn);if(!compare(e.ops[i],left,right))return false;left=right;}
    return true;
   }
  }
  fail('SyntaxError',`지원하지 않는 식: ${e.type}`);
 }
 module(name,top=false){
  const m=this.host.modules[name];
  if(!m)fail('ModuleNotFoundError',`'${name}' 모듈은 이 시뮬레이터에 없습니다. gpiozero, RPi.GPIO, time, signal을 쓸 수 있습니다.`);
  return top?m:m;
 }
}
function assignedNames(body,params){
 const out=new Set(params.map(p=>p.name));if(!Array.isArray(body))return out;
 const target=t=>{if(t.type==='name')out.add(t.name);else if(t.type==='tuple'||t.type==='list')t.items.forEach(target);};
 const walk=list=>{for(const s of list??[]){if(s.type==='assign')s.targets.forEach(target);if(s.type==='augassign')target(s.target);if(s.type==='for')target(s.target);if(s.type==='def')out.add(s.name);if(s.type==='import')s.items.forEach(i=>out.add(i.as??i.mod.split('.')[0]));if(s.type==='from')s.names.forEach(n=>out.add(n.as??n.name));for(const k of ['body','orelse','final'])if(Array.isArray(s[k])&&s.type!=='def')walk(s[k]);for(const b of s.branches??[])walk(b.body);for(const h of s.handlers??[]){if(h.as)out.add(h.as);walk(h.body);}}};
 walk(body);return out;
}
function collectGlobals(body){const out=[];const walk=list=>{for(const s of list??[]){if(s.type==='global')out.push(...s.names);for(const k of ['body','orelse','final'])if(Array.isArray(s[k]))walk(s[k]);for(const b of s.branches??[])walk(b.body);for(const h of s.handlers??[])walk(h.body);}};walk(Array.isArray(body)?body:[]);return out;}
function exceptionValue(e){return {pyException:e.type,message:e.message,pyRepr(){return `${e.type}('${e.message}')`;},toString(){return e.message;}};}
function index(list,i){let n=num(i);if(!Number.isInteger(n))fail('TypeError','인덱스는 정수여야 합니다.');if(n<0)n+=list.length;if(n<0||n>=list.length)fail('IndexError','인덱스가 범위를 벗어났습니다.');return n;}
function item(obj,i){
 if(obj instanceof Map){if(!obj.has(i))fail('KeyError',repr(i));return obj.get(i);}
 if(Array.isArray(obj)||typeof obj==='string')return obj[index(obj,i)];
 if(obj?.getItem)return obj.getItem(i);
 fail('TypeError',`'${typeName(obj)}'에는 [ ]를 쓸 수 없습니다.`);
}
function sliceOf(obj,start,stop,step){
 const n=obj.length,s=step??1;if(s===0)fail('ValueError','슬라이스 간격은 0일 수 없습니다.');
 const norm=(v,def)=>v==null?def:v<0?Math.max(v+n,s<0?-1:0):Math.min(v,s<0?n-1:n);
 const a=norm(start,s>0?0:n-1),b=norm(stop,s>0?n:-1),out=[];
 for(let i=a;s>0?i<b:i>b;i+=s)out.push(obj[i]);
 return typeof obj==='string'?out.join(''):obj instanceof Tuple?tuple(out):out;
}
export function iterate(x){
 if(Array.isArray(x))return [...x];if(typeof x==='string')return [...x];if(x instanceof Dict)return x.keys();if(x instanceof Map)return [...x.keys()];
 if(x?.pyIter)return x.pyIter();
 fail('TypeError',`'${typeName(x)}'은(는) 반복할 수 없습니다.`);
}
function binary(op,a,b){
 if(op==='+'&&typeof a==='string'&&typeof b==='string')return a+b;
 if(op==='+'&&Array.isArray(a)&&Array.isArray(b)&&(a instanceof Tuple)===(b instanceof Tuple))return a instanceof Tuple?tuple([...a,...b]):[...a,...b];
 if(op==='*'&&(typeof a==='string'||Array.isArray(a))&&isNum(b)){const k=Math.max(0,num(b));if(typeof a==='string')return a.repeat(k);const out=[];for(let i=0;i<k;i++)out.push(...a);return a instanceof Tuple?tuple(out):out;}
 if(op==='*'&&isNum(a)&&(typeof b==='string'||Array.isArray(b)))return binary(op,b,a);
 if(op==='%'&&typeof a==='string')return percentFormat(a,b);
 if(!isNum(a)||!isNum(b))fail('TypeError',`'${typeName(a)}'과(와) '${typeName(b)}'에 ${op}를 쓸 수 없습니다.`);
 const x=num(a),y=num(b),float=isFloat(a)||isFloat(b);
 switch(op){
  case '+':return make(x+y,float);case '-':return make(x-y,float);case '*':return make(x*y,float);
  case '/':if(y===0)fail('ZeroDivisionError','0으로 나눌 수 없습니다.');return new PyFloat(x/y);
  case '//':if(y===0)fail('ZeroDivisionError','0으로 나눌 수 없습니다.');return make(Math.floor(x/y),float);
  case '%':if(y===0)fail('ZeroDivisionError','0으로 나눌 수 없습니다.');return make(((x%y)+y)%y,float);
  case '**':return make(x**y,float||y<0);
  case '&':return x&y;case '|':return x|y;case '^':return x^y;case '<<':return x<<y;case '>>':return x>>y;
 }
 fail('SyntaxError',`연산자 ${op}`);
}
function percentFormat(fmt,args){const list=args instanceof Tuple?[...args]:[args];let i=0;return fmt.replace(/%([-+ 0]*\d*(?:\.\d+)?)([sdfr%])/g,(m,flags,type)=>{if(type==='%')return '%';const v=list[i++];if(type==='s')return str(v);if(type==='r')return repr(v);const prec=/\.(\d+)/.exec(flags)?.[1];return type==='d'?String(Math.trunc(num(v))):num(v).toFixed(prec?Number(prec):6);});}
function compare(op,a,b){
 switch(op){
  case '==':return equal(a,b);case '!=':return !equal(a,b);
  case 'in':return contains(b,a);case 'not in':return !contains(b,a);
  case 'is':return a===b||(a===null&&b===null);case 'is not':return !(a===b||(a===null&&b===null));
 }
 if(typeof a==='string'&&typeof b==='string')return op==='<'?a<b:op==='>'?a>b:op==='<='?a<=b:a>=b;
 if(!isNum(a)||!isNum(b))fail('TypeError',`'${typeName(a)}'과(와) '${typeName(b)}'은(는) ${op}로 비교할 수 없습니다.`);
 const x=num(a),y=num(b);return op==='<'?x<y:op==='>'?x>y:op==='<='?x<=y:x>=y;
}
function getAttr(obj,name){
 if(obj&&typeof obj==='object'&&!(obj instanceof PyFloat)){
  if(obj.pyAttrs&&name in obj.pyAttrs){const d=obj.pyAttrs[name];return typeof d==='function'?d.call(obj):d.get.call(obj);}
  if(Object.hasOwn(obj,name)&&!name.startsWith('_'))return obj[name];
 }
 if(typeof obj==='string'){const m=STRING_METHODS[name];if(m)return (args)=>m(obj,...args);}
 if(Array.isArray(obj)&&!(obj instanceof Tuple)){const m=LIST_METHODS[name];if(m)return (args)=>m(obj,...args);}
 if(obj instanceof Dict){const m=DICT_METHODS[name];if(m)return (args)=>m(obj,...args);}
 fail('AttributeError',`'${typeName(obj)}'에 '${name}' 속성이 없습니다.`);
}
function setAttr(obj,name,value){
 const d=obj?.pyAttrs?.[name];
 if(d&&typeof d==='object'&&d.set){d.set.call(obj,value);return;}
 if(obj?.pyModule||obj?.pyOpen){obj[name]=value;return;}
 fail('AttributeError',`'${typeName(obj)}'의 '${name}'은(는) 바꿀 수 없습니다.`);
}
const STRING_METHODS={
 upper:s=>s.toUpperCase(),lower:s=>s.toLowerCase(),strip:(s,c)=>c?s.replace(new RegExp(`^[${c}]+|[${c}]+$`,'g'),''):s.trim(),
 lstrip:s=>s.trimStart(),rstrip:s=>s.trimEnd(),split:(s,sep=null,max=-1)=>{const parts=sep===null?s.trim().split(/\s+/).filter(Boolean):s.split(sep);return max>=0&&parts.length>max+1?[...parts.slice(0,max),parts.slice(max).join(sep??' ')]:parts;},
 join:(s,items)=>iterate(items).map(x=>{if(typeof x!=='string')fail('TypeError','join에는 문자열만 쓸 수 있습니다.');return x;}).join(s),
 startswith:(s,x)=>s.startsWith(x),endswith:(s,x)=>s.endsWith(x),replace:(s,a,b)=>s.split(a).join(b),find:(s,x)=>s.indexOf(x),
 isdigit:s=>/^\d+$/.test(s),isalpha:s=>/^\p{L}+$/u.test(s),format:(s,...args)=>{let i=0;return s.replace(/\{(\d*)(?::([^}]*))?\}/g,(m,n,spec)=>formatSpec(args[n===''?i++:Number(n)],spec));},
 count:(s,x)=>s.split(x).length-1,zfill:(s,w)=>s.padStart(num(w),'0')
};
const LIST_METHODS={append:(l,x)=>{l.push(x);return null;},extend:(l,x)=>{l.push(...iterate(x));return null;},pop:(l,i=-1)=>l.splice(index(l,i),1)[0],insert:(l,i,x)=>{l.splice(num(i),0,x);return null;},remove:(l,x)=>{const k=l.findIndex(y=>equal(x,y));if(k<0)fail('ValueError','목록에 없는 값입니다.');l.splice(k,1);return null;},index:(l,x)=>{const k=l.findIndex(y=>equal(x,y));if(k<0)fail('ValueError','목록에 없는 값입니다.');return k;},clear:l=>{l.length=0;return null;},reverse:l=>{l.reverse();return null;},sort:l=>{l.sort((a,b)=>num(a)-num(b));return null;},count:(l,x)=>l.filter(y=>equal(x,y)).length};
const DICT_METHODS={get:(d,k,def=null)=>d.has(k)?d.get(k):def,keys:d=>d.keys(),values:d=>[...d].map(p=>p[1]),items:d=>[...d].map(p=>tuple(p)),pop:(d,k,def)=>{if(!d.has(k)){if(def!==undefined)return def;fail('KeyError',repr(k));}const v=d.get(k);d.delete(k);return v;}};
function toInt(x,base){
 if(typeof x==='string'){const s=x.trim();if(!(base?new RegExp(`^[+-]?[0-9a-z]+$`,'i'):/^[+-]?\d+$/).test(s))fail('ValueError',`int()에 쓸 수 없는 값: '${x}'`);const v=parseInt(s,base?num(base):10);if(Number.isNaN(v))fail('ValueError',`int()에 쓸 수 없는 값: '${x}'`);return v;}
 if(isNum(x))return Math.trunc(num(x));fail('TypeError',`int()에 '${typeName(x)}'을(를) 쓸 수 없습니다.`);
}
function toFloat(x){if(typeof x==='string'){const v=Number(x.trim());if(x.trim()===''||Number.isNaN(v))fail('ValueError',`float()에 쓸 수 없는 값: '${x}'`);return new PyFloat(v);}if(isNum(x))return new PyFloat(num(x));fail('TypeError',`float()에 '${typeName(x)}'을(를) 쓸 수 없습니다.`);}
function pyRound(x,n){if(n===undefined||n===null){const v=num(x),r=Math.round(v);return Math.abs(v%1)===0.5&&r%2!==0?r-1:r;}const f=10**num(n);return make(Math.round(num(x)*f)/f,isFloat(x));}
const exceptionClass=type=>{const f=(args)=>new PythonError(type,args.length?str(args[0]):'');f.exceptionType=type;f.pyName=type;return f;};
function BUILTINS(program){
 const host=program.host;
 const b={
  print:function*(args,kw){const sep=kw?.has('sep')?str(kw.get('sep')):' ',end=kw?.has('end')?str(kw.get('end')):'\n';host.print(args.map(str).join(sep)+end);return null;},
  // The line typed in the serial monitor shows after the prompt, as a terminal echoes it.
  input:function*(args){if(args.length)host.print(str(args[0]));for(;;){const line=host.readLine();if(line!==null){host.print(line+'\n');return line;}yield {input:true};}},
  int:(args)=>args.length?toInt(args[0],args[1]):0,float:(args)=>args.length?toFloat(args[0]):new PyFloat(0),str:(args)=>args.length?str(args[0]):'',bool:(args)=>truthy(args[0]),
  len:(args)=>{const x=args[0];if(typeof x==='string'||Array.isArray(x))return x.length;if(x instanceof Map)return x.size;fail('TypeError',`'${typeName(x)}'에는 len()을 쓸 수 없습니다.`);},
  range:(args)=>{const [a,b2,c]=args.map(num),start=args.length>1?a:0,stop=args.length>1?b2:a,step=c??1;if(step===0)fail('ValueError','range의 간격은 0일 수 없습니다.');const out=[];for(let i=start;step>0?i<stop:i>stop;i+=step){out.push(i);if(out.length>1e6)fail('MemoryError','range가 너무 큽니다.');}return out;},
  abs:(args)=>make(Math.abs(num(args[0])),isFloat(args[0])),
  min:(args,kw)=>pick(args,(a,b)=>compare('<',b,a),kw),max:(args,kw)=>pick(args,(a,b)=>compare('>',b,a),kw),
  round:(args)=>pyRound(args[0],args[1]),sum:(args)=>iterate(args[0]).reduce((s,x)=>binary('+',s,x),args[1]??0),
  list:(args)=>args.length?iterate(args[0]):[],tuple:(args)=>tuple(args.length?iterate(args[0]):[]),dict:()=>new Dict(),
  enumerate:(args)=>iterate(args[0]).map((x,i)=>tuple([i+num(args[1]??0),x])),zip:(args)=>{const lists=args.map(iterate),n=Math.min(...lists.map(l=>l.length));return Array.from({length:n},(_,i)=>tuple(lists.map(l=>l[i])));},
  sorted:(args)=>iterate(args[0]).sort((a,c)=>compare('<',a,c)?-1:compare('>',a,c)?1:0),reversed:(args)=>iterate(args[0]).reverse(),
  isinstance:(args)=>{const t=args[1];return typeName(args[0])===(t?.pyName??'');},
  type:(args)=>typeName(args[0]),chr:(args)=>String.fromCharCode(num(args[0])),ord:(args)=>args[0].charCodeAt(0),hex:(args)=>'0x'+num(args[0]).toString(16),
 };
 for(const name of ['Exception','BaseException','ValueError','TypeError','KeyError','IndexError','ZeroDivisionError','RuntimeError','KeyboardInterrupt','NameError','AttributeError','AssertionError','ArithmeticError','LookupError','StopIteration','OSError'])b[name]=exceptionClass(name);
 b.int.pyName='int';b.float.pyName='float';b.str.pyName='str';b.bool.pyName='bool';b.list.pyName='list';b.tuple.pyName='tuple';b.dict.pyName='dict';
 return b;
}
function pick(args,better,kw){const list=args.length===1?iterate(args[0]):args;if(!list.length){if(kw?.has('default'))return kw.get('default');fail('ValueError','빈 목록입니다.');}return list.reduce((a,x)=>better(a,x)?x:a);}
const pyClass=(name,create)=>({pyClass:true,pyName:name,create});

// ------------------------------------------------------------------ the board: gpiozero and RPi.GPIO on its pins
export class PythonDriver{
 constructor(part,{log=()=>{},project}={}){
  this.part=part;this.project=project;this.output='';this.outputLabel='main.py 출력';this.pins={};this.levels=new Map();this.callbacks=[];this.lines=[];this.time=null;this.result=null;this.ended=false;this.buttons=[];
  this.say=text=>{for(const l of String(text).split('\n').filter(Boolean))log(l);};
  let pending='';
  const host={
   now:()=>this.program?.clock??0,
   print:text=>{this.output=(this.output+text).slice(-8000);pending+=text;const parts=pending.split('\n');pending=parts.pop();for(const l of parts)if(l)log(l);if(pending.length>200){log(pending);pending='';}},
   readLine:()=>this.lines.length?this.lines.shift():null,
   modules:this.modules()
  };
  try{this.program=new PythonProgram(part.code??'',host);}
  catch(e){throw new Error(`${part.name} · main.py: ${e.message}`);}
  this.flush=()=>{if(pending){log(pending);pending='';}};
  this.task=null;
 }
 // Only a program that reads input() takes serial monitor lines.
 get acceptsInput(){return /\binput\s*\(/.test(this.part.code??'');}
 receive(text){
  let count=0;for(const line of String(text).split(/\r?\n/)){if(!line)continue;this.lines.push(line);count+=line.length+1;}
  return count;
 }
 pin(n){const name='GPIO'+num(n);if(!devboardModel(this.part).pins.some(p=>p.signal===name))fail('ValueError',`라즈베리파이에 없는 GPIO 번호입니다: ${str(n)}`);return name;}
 level(pin){const v=this.result?.voltage?.(`signal:${this.part.id}.${pin}`);return v==null?null:v>=1.65?1:0;}
 // A pin driven by software: its high time within the circuit step becomes the duty of the LED it lights.
 write(pin,high){
  const now=this.program.host.now(),state=this.pins[pin];
  if(state?.soft){if(state.high!==high){if(state.high)state.highUs+=now-state.since;state.since=now;state.high=high;state.toggles++;}return;}
  this.pins[pin]={mode:'OUTPUT',soft:true,high,since:now,highUs:0,toggles:0,windowStart:now,value:high?VCC:0};
 }
 pwm(pin,duty,frequency){const d=Math.max(0,Math.min(1,duty));this.pins[pin]={mode:'OUTPUT',value:VCC*d,...(d>0&&d<1?{pwm:{duty:d,frequency}}:{})};}
 input(pin,mode){this.pins[pin]={mode};}
 modules(){
  const driver=this;
  const output=(pin,activeHigh=true)=>{let on=false;return {get on(){return on;},set(value){on=!!value;driver.write(pin,on===activeHigh);}};};
  class LEDBase{constructor(){this.pyOpen=false;}}
  const led=(args,kw)=>{
   const pin=driver.pin(args[0]),active=kw.get('active_high')!==false,o=output(pin,active);let state=false;o.set(!!kw.get('initial_value'));
   const obj=new LEDBase();obj.constructor.pyName='LED';
   obj.pyAttrs={
    on(){return ()=>{state=true;o.set(true);return null;};},off(){return ()=>{state=false;o.set(false);return null;};},toggle(){return ()=>{state=!state;o.set(state);return null;};},
    blink(){return (bargs,bkw)=>{const onT=num(bargs[0]??bkw.get('on_time')??1),offT=num(bargs[1]??bkw.get('off_time')??1);driver.blinkers.set(pin,{on:onT,off:offT,start:driver.program.host.now(),set:v=>{state=v;o.set(v);}});return null;};},
    is_lit:{get(){return state;}},is_active:{get(){return state;}},
    value:{get(){return state?1:0;},set(v){state=truthy(v);o.set(state);}},pin:{get(){return `GPIO${pin.slice(4)}`;}},close(){return ()=>{delete driver.pins[pin];return null;};}
   };
   const plain=obj.pyAttrs.on;obj.pyAttrs.on=function(){driver.blinkers.delete(pin);return plain.call(this);};const plainOff=obj.pyAttrs.off;obj.pyAttrs.off=function(){driver.blinkers.delete(pin);return plainOff.call(this);};
   obj.pyRepr=()=>`<gpiozero.LED object on pin ${pin}, active_high=${active?'True':'False'}, is_active=${state?'True':'False'}>`;
   return obj;
  };
  const pwmled=(args,kw)=>{
   const pin=driver.pin(args[0]),frequency=num(kw.get('frequency')??100);let value=num(kw.get('initial_value')??0);
   const apply=()=>driver.pwm(pin,value,frequency);apply();
   const obj={pyAttrs:{
    on(){return ()=>{value=1;apply();return null;};},off(){return ()=>{value=0;apply();return null;};},toggle(){return ()=>{value=1-value;apply();return null;};},
    value:{get(){return new PyFloat(value);},set(v){const x=num(v);if(!(x>=0&&x<=1))fail('ValueError','PWMLED 값은 0~1입니다.');value=x;apply();}},
    is_lit:{get(){return value>0;}},is_active:{get(){return value>0;}}
   }};
   obj.constructor={pyName:'PWMLED'};return obj;
  };
  const button=(args,kw)=>{
   const pin=driver.pin(args[0]),pull=kw.has('pull_up')?kw.get('pull_up'):true;
   if(pull===null&&!kw.has('active_state'))fail('ValueError','pull_up=None이면 active_state를 정해야 합니다.');
   const activeLow=pull===true?true:pull===false?false:kw.get('active_state')===false;
   driver.input(pin,pull===true?'INPUT_PULLUP':pull===false?'INPUT_PULLDOWN':'INPUT');
   const isPressed=()=>{const l=driver.level(pin);return l==null?false:activeLow?l===0:l===1;};
   // The state when the button is made is the reference: the next change is the first edge.
   const b={pin,activeLow,pressed:driver.result?isPressed():null,when_pressed:null,when_released:null};driver.buttons.push(b);
   const obj={pyAttrs:{
    is_pressed:{get:isPressed},is_active:{get:isPressed},value:{get:()=>isPressed()?1:0},
    when_pressed:{get:()=>b.when_pressed,set:v=>{b.when_pressed=v;}},when_released:{get:()=>b.when_released,set:v=>{b.when_released=v;}},
    wait_for_press(){return function*(){while(!isPressed())yield {wait:1000};return null;};},wait_for_release(){return function*(){while(isPressed())yield {wait:1000};return null;};}
   }};
   obj.constructor={pyName:'Button'};return obj;
  };
  const ledboard=(args,kw)=>{
   const leds=args.map(a=>led([a],new Map([['active_high',kw.get('active_high')??true]])));
   const values=()=>tuple(leds.map(l=>getAttr(l,'value')));
   const obj={pyAttrs:{
    on(){return ()=>{leds.forEach(l=>getAttr(l,'on')([]));return null;};},off(){return ()=>{leds.forEach(l=>getAttr(l,'off')([]));return null;};},toggle(){return ()=>{leds.forEach(l=>getAttr(l,'toggle')([]));return null;};},
    value:{get:values,set(v){const items=iterate(v);if(items.length!==leds.length)fail('ValueError',`LED ${leds.length}개에 값 ${items.length}개를 넣을 수 없습니다.`);leds.forEach((l,i)=>setAttr(l,'value',items[i]));}},
    leds:{get:()=>tuple(leds)},is_lit:{get:()=>leds.some(l=>getAttr(l,'is_lit'))}
   },getItem:i=>leds[index(leds,i)],pyIter:()=>[...leds]};
   obj.constructor={pyName:'LEDBoard'};return obj;
  };
  this.blinkers=new Map();
  // RPi.GPIO: BCM or BOARD numbering, outputs, inputs with pulls, and software PWM objects.
  let mode=null;
  const gpioPin=n=>{if(mode==='BOARD'){const p=devboardModel(this.part).pins.find(q=>q.key===`P${num(n)}`);if(!p?.signal?.startsWith('GPIO'))fail('ValueError',`${str(n)}번 핀은 GPIO가 아닙니다.`);return p.signal;}if(mode!=='BCM')fail('RuntimeError','GPIO.setmode(GPIO.BCM) 또는 GPIO.setmode(GPIO.BOARD)를 먼저 호출하세요.');return driver.pin(n);};
  const RPiGPIO={pyModule:true,BCM:'BCM',BOARD:'BOARD',OUT:'OUT',IN:'IN',HIGH:1,LOW:0,PUD_UP:'up',PUD_DOWN:'down',PUD_OFF:'off',RISING:'rising',FALLING:'falling',BOTH:'both',
   setmode:(a)=>{mode=a[0];return null;},getmode:()=>mode,setwarnings:()=>null,
   setup:(a,kw)=>{const pins=Array.isArray(a[0])?a[0]:[a[0]];for(const n of pins){const pin=gpioPin(n);if(a[1]==='OUT')driver.write(pin,truthy(kw.get('initial')??0));else{const pud=kw.get('pull_up_down');driver.input(pin,pud==='up'?'INPUT_PULLUP':pud==='down'?'INPUT_PULLDOWN':'INPUT');}}return null;},
   output:(a)=>{const pins=Array.isArray(a[0])?a[0]:[a[0]];pins.forEach(n=>driver.write(gpioPin(n),truthy(a[1])));return null;},
   input:(a)=>driver.level(gpioPin(a[0]))??0,
   cleanup:()=>{driver.pins={};return null;},
   PWM:pyClass('PWM',(a)=>{const pin=gpioPin(a[0]);let freq=num(a[1]),duty=0;const apply=()=>driver.pwm(pin,duty/100,freq);
    return {pyAttrs:{start(){return (b)=>{duty=num(b[0]);apply();return null;};},ChangeDutyCycle(){return (b)=>{duty=num(b[0]);apply();return null;};},ChangeFrequency(){return (b)=>{freq=num(b[0]);apply();return null;};},stop(){return ()=>{duty=0;apply();return null;};}}};})
  };
  const time={pyModule:true,
   sleep:function*(a){const s=num(a[0]);if(s<0)fail('ValueError','sleep 시간은 0 이상이어야 합니다.');yield {wait:s*1e6};return null;},
   time:()=>new PyFloat(1.7e9+this.program.host.now()/1e6),perf_counter:()=>new PyFloat(this.program.host.now()/1e6),monotonic:()=>new PyFloat(this.program.host.now()/1e6),
   time_ns:()=>Math.round(this.program.host.now()*1000)
  };
  return {
   gpiozero:{pyModule:true,LED:pyClass('LED',led),PWMLED:pyClass('PWMLED',pwmled),Button:pyClass('Button',button),LEDBoard:pyClass('LEDBoard',ledboard)},
   'RPi':{pyModule:true,GPIO:RPiGPIO},'RPi.GPIO':RPiGPIO,time,
   signal:{pyModule:true,pause:function*(){for(;;)yield {pause:true};}},
   sys:{pyModule:true,exit:()=>{throw new ProgramExit();}}
  };
 }
 /** Runs the program up to `time` (ms): its statements, its waits, and the callbacks of the buttons that changed. */
 advance(time){
  if(this.time==null||this.ended)return;
  const program=this.program,target=time*1000;
  // The program's clock is absolute (µs); it starts when the circuit first has a solution.
  if(!this.task){this.task=program.run();program.clock=this.time*1000;}
  for(let guard=0;guard<100000;guard++){
   const now=program.clock;if(now>=target)break;
   if(this.waitUntil!=null&&this.waitUntil>now){program.clock=Math.min(this.waitUntil,target);if(program.clock<this.waitUntil)break;}
   this.waitUntil=null;
   if(this.blocked==='input'&&!this.lines.length){program.clock=target;break;}
   if(this.blocked==='pause'){program.clock=target;break;}
   this.blocked=null;
   program.budget=target;
   let step;
   try{step=this.task.next();}
   catch(e){this.end(e);return;}
   if(step.done){this.flush();this.say('main.py가 끝났습니다.');this.ended=true;return;}
   const r=step.value;
   if(r.wait)this.waitUntil=program.host.now()+r.wait;
   // The prompt of input() has no line end: it shows in the log while the program waits.
   else if(r.input){this.blocked='input';this.flush();}
   else if(r.pause)this.blocked='pause';
  }
  this.time=Math.max(this.time,time);
  this.updateBlinkers();
 }
 end(e){
  this.ended=true;this.flush();
  if(e instanceof ProgramExit){this.say('main.py가 끝났습니다 (sys.exit).');return;}
  if(e instanceof PythonError)throw new Error(`${this.part.name} · main.py ${this.program.line??''}행: ${e.type}: ${e.message}`);
  throw e;
 }
 updateBlinkers(){const now=this.program.host.now();for(const [,b] of this.blinkers){const period=(b.on+b.off)*1e6,phase=(now-b.start)%period;b.set(phase<b.on*1e6);}}
 gpio(){
  const out={},now=this.program.host.now();
  for(const [pin,state]of Object.entries(this.pins)){
   if(state.soft){
    // The circuit is solved several times at one instant: the window closes only once time has moved on.
    if(state.report&&now-state.windowStart<1000){out[`${this.part.id}.${pin}`]=state.report;continue;}
    const span=now-state.windowStart,high=state.highUs+(state.high?now-state.since:0);
    let value=state.high?VCC:0,pwm=null;
    // Only switching faster than the window (two whole periods in it) is a brightness; a slow blink shows its level.
    if(state.toggles>=4&&span>0){const duty=Math.max(0,Math.min(1,high/span));value=VCC*duty;if(duty>0&&duty<1)pwm={duty,frequency:Math.round(state.toggles/2/(span/1e6))};}
    out[`${this.part.id}.${pin}`]=state.report={mode:'OUTPUT',value,...(pwm?{pwm}:{})};
    if(span>=1000){state.windowStart=now;state.highUs=0;state.since=now;state.toggles=0;}else state.report=null;
    continue;
   }
   out[`${this.part.id}.${pin}`]=state;
  }
  return out;
 }
 /** Button edges run their when_pressed / when_released callbacks (gpiozero runs them on its own thread). */
 // The program starts with the first solved circuit (its inputs are known from then on).
 observe(result,time){
  this.result=result;if(this.time==null)this.time=time??0;if(this.ended||!this.program)return;
  for(const b of this.buttons){
   const l=this.level(b.pin);if(l==null)continue;const pressed=b.activeLow?l===0:l===1;
   if(b.pressed===null){b.pressed=pressed;continue;}
   if(pressed===b.pressed)continue;b.pressed=pressed;
   const cb=pressed?b.when_pressed:b.when_released;if(!cb)continue;
   try{const it=this.program.call(cb,[]);let s=it.next();for(let guard=0;!s.done&&guard<10000;guard++)s=it.next();}
   catch(e){this.end(e);}
  }
 }
}
class ProgramExit extends Error{}
/** True for the Linux kernel module sources of the lecture examples (they keep their fixed run). */
export const isKernelSource=code=>/#include\s*<linux\//.test(code??'');
/** A main.py with statements (not only comments and blank lines). */
export const hasPythonCode=code=>!isKernelSource(code)&&String(code??'').split('\n').some(l=>l.trim()&&!l.trim().startsWith('#'));
