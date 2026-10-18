// A bounded C-like parser. Sketches never enter the JavaScript evaluator.
import {numberLiteral,arithmetic,convert,promote,commonType} from './c-types.js';
const TYPES = new Set(['void','int','bool','float','double','long','short','char','byte','String','unsigned','signed','uint8_t','uint16_t','uint32_t','int8_t','int16_t','int32_t','size_t','LiquidCrystal']);
const QUALIFIERS = new Set(['const','volatile','static']);
const INCLUDES = new Set(['Arduino.h','LiquidCrystal.h','Wire.h','SPI.h','stdint.h','math.h']);
const OPS = {'=':1,'+=':1,'-=':1,'*=':1,'/=':1,'%=':1,'&=':1,'|=':1,'^=':1,'<<=':1,'>>=':1,'||':3,'&&':4,'|':5,'^':6,'&':7,'==':8,'!=':8,'<':9,'>':9,'<=':9,'>=':9,'<<':10,'>>':10,'+':11,'-':11,'*':12,'/':12,'%':12};
const ASSIGN = new Set(['=','+=','-=','*=','/=','%=','&=','|=','^=','<<=','>>=']);

export function compile(source,options={}) {
  if(typeof source!=='string'||source.length>(options.hal?300000:50000))throw new Error('코드 크기 한도를 넘었습니다.');
  const tokens=[]; let pos=0,line=1;
  while(pos<source.length){
    const tail=source.slice(pos);
    const space=/^\s+/.exec(tail); if(space){line+=(space[0].match(/\n/g)||[]).length;pos+=space[0].length;continue;}
    if(tail.startsWith('//')){const n=tail.indexOf('\n');pos+=n<0?tail.length:n;continue;}
    if(tail.startsWith('/*')){const n=tail.indexOf('*/',2);if(n<0)throw new Error(`${line}행: 주석이 닫히지 않았습니다.`);line+=(tail.slice(0,n+2).match(/\n/g)||[]).length;pos+=n+2;continue;}
    if(tail[0]==='#'){
      const directive=tail.split(/\r?\n/,1)[0];
      const inc=/^#\s*include\s*[<"]([^>"]+)[>"]\s*$/.exec(directive);
      const def=/^#\s*define\s+([A-Za-z_]\w*)\s+(.+)$/.exec(directive);
      if(inc){if(!INCLUDES.has(inc[1]))throw new Error(`${line}행: 지원하지 않는 라이브러리 ${inc[1]}`);pos+=directive.length;continue;}
      if(def){let value=def[2],quoted=false,escaped=false;for(let i=0;i<value.length;i++){const ch=value[i];if(escaped){escaped=false;continue;}if(ch==='\\'&&quoted){escaped=true;continue;}if(ch==='"')quoted=!quoted;if(!quoted&&ch==='/'&&value[i+1]==='/'){value=value.slice(0,i);break;}}const trimmed=value.trim(),isStr=/^"(?:\\.|[^"\\\r\n])*"$/.test(trimmed),isFlt=!isStr&&!(/^0[xXbB]/.test(trimmed))&&/(?:\d+\.\d*|\.\d+)(?:[eE][+-]?\d+)?[fF]?|\d+[eE][+-]?\d+[fF]?|\d+[fF]$/.test(trimmed);source=source.slice(0,pos)+`const ${isStr?'char *':isFlt?'double':'int'} ${def[1]} = ${value};`+tail.slice(directive.length);continue;}
      throw new Error(`${line}행: 지원하지 않는 전처리 지시문입니다.`);
    }
    const match=/^(?:0[xX][0-9a-fA-F]+[uUlL]*|0[bB][01]+[uUlL]*|(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?[uUlLfF]*|"(?:\\.|[^"\\\r\n])*"|'(?:\\.|[^'\\\r\n])'|[A-Za-z_]\w*|<<=|>>=|->|\+\+|--|\+=|-=|\*=|\/=|%=|&=|\|=|\^=|==|!=|<=|>=|&&|\|\||<<|>>|[{}\[\]();,:?+\-*\/%<>=!.&|^~])/.exec(tail);
    if(!match)throw new Error(`${line}행: 지원하지 않는 문자 ${tail[0]}`);
    tokens.push({v:match[0],line});pos+=match[0].length;
    if(tokens.length>(options.hal?60000:20000))throw new Error('코드 토큰 수가 너무 많습니다.');
  }
  tokens.push({v:'<end>',line});let at=0,depth=0;
  const program={globals:[],functions:Object.create(null),structs:Object.assign(Object.create(null),options.structs||{}),hal:!!options.hal};
  const aliases=new Map([['HAL_StatusTypeDef','int'],['GPIO_PinState','int']]),enumConstants=new Map();
  const peek=(n=0)=>tokens[at+n]?.v??'<end>',take=()=>tokens[at++].v;
  const location=(index=at)=>options.sourceMap?.[(tokens[index]?.line??line)-1]??{file:options.filename??'main.c',line:tokens[index]?.line??line};
  const fail=(message,index=at)=>{const loc=location(index),error=new Error(`${loc.file}:${loc.line}: ${message}`);error.location=loc;throw error;};
  const expect=value=>{if(peek()!==value)fail(`'${value}'가 필요합니다. 현재 '${peek()}'`);take();};
  const identifier=()=>{if(!/^[A-Za-z_]\w*$/.test(peek()))fail('이름이 필요합니다.');const name=take();if(['__proto__','prototype','constructor'].includes(name))fail('사용할 수 없는 이름입니다.');return name;};
  const isType=()=>TYPES.has(peek())||aliases.has(peek())||QUALIFIERS.has(peek())||['struct','enum','extern'].includes(peek())||Object.hasOwn(program.structs,peek());
  function constantValue(n){
    if(n.type==='literal'&&typeof n.value==='number'&&Number.isInteger(n.value))return {value:n.value,type:n.numericType||'int'};
    if(n.type==='name'&&enumConstants.has(n.name))return enumConstants.get(n.name);
    if(n.type==='cast'&&!n.pointer){const a=constantValue(n.a);return {value:convert(n.to,a.value),type:n.to};}
    if(n.type==='unary'&&['+','-','~','!'].includes(n.op)){const a=constantValue(n.a),type=promote(a.type);return {value:n.op==='!'?Number(!a.value):convert(type,n.op==='-'?-a.value:n.op==='~'?~a.value:a.value),type:n.op==='!'?'int':type};}
    if(n.type==='conditional')return constantValue(constantValue(n.test).value?n.yes:n.no);
    if(n.type==='binary'){const a=constantValue(n.a);if(n.op==='&&'&&!a.value)return {value:0,type:'int'};if(n.op==='||'&&a.value)return {value:1,type:'int'};const b=constantValue(n.b);const value=['&&','||'].includes(n.op)?Number(!!b.value):arithmetic(n.op,a.value,b.value,a.type,b.type);return {value,type:['&&','||','==','!=','<','>','<=','>='].includes(n.op)?'int':['<<','>>'].includes(n.op)?promote(a.type):commonType(a.type,b.type)};}
    fail('정수 상수식이 필요합니다.');
  }
  function parseEnumBody(){
    expect('{');const items=[];let nextVal=0;
    while(peek()!=='}'){
      if(peek()==='<end>')fail("닫는 '}'가 없습니다.");
      const name=identifier();let exprNode;
      if(peek()==='='){take();exprNode=expression(2);nextVal=constantValue(exprNode).value;exprNode={type:'literal',value:nextVal++,numericType:'int'};}
      else if(nextVal!==null){exprNode={type:'literal',value:nextVal++,numericType:'int'};}
      else fail('열거형 항목의 상수를 지정하세요.');
      if(exprNode.value<-2147483648||exprNode.value>2147483647)fail('열거형은 지원하는 int 범위 안에서 지정하세요.');
      enumConstants.set(name,{value:exprNode.value,type:'int'});
      items.push({type:'int',constant:true,external:false,storage:false,volatile:false,name,pointer:false,value:exprNode});
      if(peek()!==',')break;take();if(peek()==='}')break;
    }
    expect('}');return items;
  }
  function spec(){
    let constant=false,external=false,storage=false,volatile=false;while(QUALIFIERS.has(peek())||peek()==='extern'){const q=take();if(q==='const')constant=true;if(q==='extern')external=true;if(q==='static')storage=true;if(q==='volatile')volatile=true;}
    let type;
    if(peek()==='struct'){take();type=identifier();if(!Object.hasOwn(program.structs,type))fail('정의되지 않은 구조체입니다.');}
    else if(peek()==='enum'){take();const tag=identifier();type=aliases.get(tag)||'int';}
    else {if(!isType())fail('자료형이 필요합니다.');const specs=[take()];while(['long','short','int','unsigned','signed','char','double'].includes(peek()))specs.push(take());type=specs.at(-1);if(specs.includes('unsigned'))type=specs.includes('char')?'uint8_t':specs.includes('short')?'uint16_t':'uint32_t';else if(specs.includes('short'))type='int16_t';}
    return {type:aliases.get(type)||type,constant,external,storage,volatile};
  }
  function declarator(base){
    let pointer=false;while(peek()==='*'){take();if(pointer)fail('이중 포인터는 지원하지 않습니다.');pointer=true;}
    return {...base,name:identifier(),pointer};
  }
  function initializer(){
    if(peek()!=='{')return expression();take();const values=[];
    while(peek()!=='}'){values.push(initializer());if(peek()!==',')break;take();if(peek()==='}')break;}
    expect('}');return {type:'list',values};
  }
  function finishDeclaration(first,base,semicolon=true){
    const declarations=[];let d=first;
    do{
      if(peek()==='['){take();d.array=true;if(peek()!==']')d.size=expression();expect(']');if(peek()==='[')fail('다차원 배열은 지원하지 않습니다.');}
      if(peek()==='='){take();d.value=initializer();}
      else if(d.type==='LiquidCrystal'&&peek()==='('){d.value={type:'construct',name:d.type,args:argumentsList()};}
      declarations.push(d);if(d.constant&&d.value&&!d.pointer&&!d.array){try{enumConstants.set(d.name,constantValue(d.value));}catch{}}
      if(peek()!==',')break;take();d=declarator(base);
    }while(true);
    if(semicolon)expect(';');return {type:'declare',declarations};
  }
  function argumentsList(){expect('(');const args=[];if(peek()!==')')do{args.push(expression());if(peek()!==',')break;take();}while(true);expect(')');return args;}
  function castAhead(){
    let i=0;while(['const','volatile'].includes(peek(i)))i++;
    if(peek(i)==='struct'||peek(i)==='enum'){i++;if(!/^[A-Za-z_]\w*$/.test(peek(i)))return false;i++;}
    else if(TYPES.has(peek(i))||aliases.has(peek(i))||Object.hasOwn(program.structs,peek(i))){i++;while(['long','short','int','unsigned','signed','char','double'].includes(peek(i)))i++;}
    else return false;
    if(peek(i)==='*')i++;return peek(i)===')';
  }
  function expression(min=0){
    if(++depth>80)fail('표현식 중첩이 너무 깊습니다.');let node;const t=take();
    if(['!','~','-','+','*','&','++','--'].includes(t))node={type:'unary',op:t,a:expression(13)};
    else if(t==='sizeof'){
      if(peek()==='('){take();
       if(castAhead()){const base=spec(),pointer=peek()==='*';if(pointer)take();expect(')');node={type:'sizeofType',to:base.type,pointer};}
       else {const arg=expression();expect(')');node={type:'sizeofExpr',arg};}
      }else node={type:'sizeofExpr',arg:expression(13)};
    }
    else if(t==='('){
      if(castAhead()){const base=spec(),pointer=peek()==='*';if(pointer)take();take();node={type:'cast',to:base.type,constant:base.constant,volatile:base.volatile,pointer,a:expression(13)};}
      else {node=expression();expect(')');}
    }
    else if(/^\d|^\.\d/.test(t)){try{node={type:'literal',...numberLiteral(t),raw:t};}catch(error){fail(error.message);}}
    else if(t[0]==='"'){try{node={type:'literal',value:JSON.parse(t)};}catch{fail('문자열 형식이 잘못되었습니다.');}}
    else if(t[0]==="'"){const raw=t.slice(1,-1),char=raw.startsWith('\\')?({'n':'\n','r':'\r','t':'\t','0':'\0',"'":"'",'\\':'\\'}[raw.slice(1)]):raw;if(char===undefined)fail('문자 이스케이프가 잘못되었습니다.');node={type:'literal',value:char.charCodeAt(0)};}
    else if(/^[A-Za-z_]\w*$/.test(t))node={type:'name',name:t};
    else fail(`표현식 오류: ${t}`,at-1);
    while(true){
      if(peek()==='('){node={type:'call',callee:node,args:argumentsList()};continue;}
      if(peek()==='['){take();const index=expression();expect(']');node={type:'index',object:node,index};continue;}
      if(peek()==='.'||peek()==='->'){const op=take();node={type:'member',object:node,key:identifier(),pointer:op==='->'};continue;}
      if(peek()==='++'||peek()==='--'){node={type:'postfix',op:take(),a:node};continue;}
      if(peek()==='?'&&min<=2){take();const yes=expression();expect(':');node={type:'conditional',test:node,yes,no:expression(2)};continue;}
      const op=peek(),precedence=OPS[op];if(precedence===undefined||precedence<min)break;take();node={type:ASSIGN.has(op)?'assign':'binary',op,a:node,b:expression(precedence+(ASSIGN.has(op)?0:1))};
    }
    depth--;return node;
  }
  function block(){expect('{');const constants=new Map(enumConstants),body=[];while(peek()!=='}'){if(peek()==='<end>')fail("닫는 '}'가 없습니다.");body.push(statement());}take();enumConstants.clear();for(const [k,v]of constants)enumConstants.set(k,v);return {type:'block',body};}
  function statement(){
    if(++depth>80)fail('문장 중첩이 너무 깊습니다.');let result;const loc=location();
    const t=peek();
    if(t===';'){take();result={type:'empty'};}
    else if(t==='{')result=block();
    else if(t==='if'){take();expect('(');const test=expression();expect(')');const yes=statement();let no=null;if(peek()==='else'){take();no=statement();}result={type:'if',test,yes,no};}
    else if(t==='switch'){
      take();expect('(');const discriminant=expression();expect(')');expect('{');const cases=[];
      while(peek()!=='}'){
        if(peek()==='<end>')fail("닫는 '}'가 없습니다.");
        if(peek()==='case'){take();const test=expression();expect(':');cases.push({test,body:[]});}
        else if(peek()==='default'){take();expect(':');cases.push({test:null,body:[]});}
        else {if(!cases.length)fail('switch 내부 문장은 case 또는 default 뒤에 작성하세요.');cases.at(-1).body.push(statement());}
      }
      take();result={type:'switch',discriminant,cases};
    }
    else if(t==='while'){take();expect('(');const test=expression();expect(')');result={type:'while',test,body:statement()};}
    else if(t==='do'){take();const body=statement();expect('while');expect('(');const test=expression();expect(')');expect(';');result={type:'do',test,body};}
    else if(t==='for'){
      take();expect('(');let init=null;if(peek()!==';'){if(isType()){const base=spec();init=finishDeclaration(declarator(base),base,false);}else init={type:'expression',expr:expression()};}expect(';');
      const test=peek()===';'?{type:'literal',value:1}:expression();expect(';');const update=peek()===')'?null:expression();expect(')');result={type:'for',init,test,update,body:statement()};
    }
    else if(t==='return'){take();const value=peek()===';'?null:expression();expect(';');result={type:'return',value};}
    else if(t==='break'||t==='continue'){take();expect(';');result={type:t};}
    else if(t==='enum'&&(peek(1)==='{'||peek(2)==='{')){take();if(peek()!=='{')aliases.set(identifier(),'int');const declarations=parseEnumBody();expect(';');result={type:'declare',declarations};}
    else if(isType()){const base=spec();result=finishDeclaration(declarator(base),base);}
    else {result={type:'expression',expr:expression()};expect(';');}
    depth--;return {...result,loc};
  }
  while(peek()!=='<end>'){
    if(peek()==='typedef'&&peek(1)==='enum'){const loc=location();take();take();if(peek()!=='{')aliases.set(identifier(),'int');const declarations=parseEnumBody(),alias=identifier();expect(';');aliases.set(alias,'int');program.globals.push({type:'declare',declarations,loc});continue;}
    if(peek()==='typedef'){take();const base=spec(),d=declarator(base);if(d.pointer)fail('포인터 typedef는 지원하지 않습니다.');expect(';');aliases.set(d.name,base.type);continue;}
    if(peek()==='enum'&&(peek(1)==='{'||peek(2)==='{')){const loc=location();take();if(peek()!=='{')aliases.set(identifier(),'int');const declarations=parseEnumBody();expect(';');program.globals.push({type:'declare',declarations,loc});continue;}
    if(peek()==='struct'&&peek(2)==='{'){
      take();const name=identifier();if(Object.hasOwn(program.structs,name))fail('구조체가 중복되었습니다.');expect('{');const fields=[];
      while(peek()!=='}'){const base=spec(),d=declarator(base);if(d.pointer||peek()==='[')fail('구조체 필드는 스칼라/구조체 값으로 선언하세요.');fields.push(d);expect(';');}
      take();expect(';');program.structs[name]=fields;continue;
    }
    if(!isType())fail('전역 변수 또는 함수 정의가 필요합니다.');
    const loc=location(),base=spec(),d=declarator(base);
    if(peek()==='('&&base.type!=='LiquidCrystal'){
      take();const params=[];if(peek()==='void'&&peek(1)===')')take();
      else if(peek()!==')')do{const p=declarator(spec());if(peek()==='['){take();expect(']');p.pointer=true;}params.push(p);if(peek()!==',')break;take();}while(true);
      expect(')');if(peek()===';'){take();continue;}
      if(Object.hasOwn(program.functions,d.name))fail(`${d.name}() 함수가 중복되었습니다.`);
      program.functions[d.name]={...d,params,loc,body:block()};
    }else program.globals.push({...finishDeclaration(d,base),loc});
  }
  if(options.hal){if(!program.functions.main)fail('int main(void) 함수를 작성하세요.');if(program.functions.main.params.length)fail('main(void) 형식을 사용하세요.');}
  else if(!program.functions.loop)fail('void loop() 함수를 작성하세요.');
  for(const name of ['setup','loop'])if(program.functions[name]?.params.length)fail(`${name}()에는 매개변수를 지정할 수 없습니다.`);
  return program;
}
