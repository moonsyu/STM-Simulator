import {GPIO_PINS,ALIASES,canonicalPin} from './pins.js';
// Deliberately interpreted: no eval, new Function, filesystem or network APIs.
export function compile(source){
  if(typeof source!=='string'||source.length>50000)throw new Error('코드는 50,000자 이하로 작성하세요.');
  const defines=[];
  source=source.replace(/^\s*#define\s+(\w+)\s+([^\r\n]+)/gm,(_,n,v)=>{defines.push(`const int ${n} = ${v};`);return '';});
  source=defines.join('\n')+'\n'+source.replace(/\/\*[\s\S]*?\*\//g,'').replace(/\/\/[^\r\n]*/g,'');
  const tokens=[];let i=0,line=1;
  while(i<source.length){
    const s=source.slice(i),m=/^\s+/.exec(s);if(m){line+=(m[0].match(/\n/g)||[]).length;i+=m[0].length;continue;}
    const t=/^(?:\d+(?:\.\d+)?|"(?:\\.|[^"\\])*"|[A-Za-z_]\w*|==|!=|<=|>=|&&|\|\||\+\+|--|[{}();,+\-*\/%<>=!.])/.exec(s);
    if(!t)throw new Error(`${line}행: 지원하지 않는 문자 ${s[0]}`);
    tokens.push({v:t[0],line});i+=t[0].length;
  }
  tokens.push({v:'<end>',line});let at=0,depth=0;
  const peek=()=>tokens[at].v,take=()=>tokens[at++].v;
  const fail=m=>{throw new Error(`${tokens[at]?.line||line}행: ${m}`);};
  const expect=v=>{if(peek()!==v)fail(`'${v}'가 필요합니다. 현재 '${peek()}'`);take();};
  const precedence={'||':1,'&&':2,'==':3,'!=':3,'<':4,'>':4,'<=':4,'>=':4,'+':5,'-':5,'*':6,'/':6,'%':6};
  function expr(min=0){
    if(++depth>80)fail('표현식 중첩이 너무 깊습니다.');
    let n;const t=take();
    if(t==='('){n=expr();expect(')');}
    else if(['!','-','+'].includes(t))n={type:'unary',op:t,a:expr(7)};
    else if(/^\d/.test(t))n={type:'literal',value:Number(t)};
    else if(t[0]==='"'){try{n={type:'literal',value:JSON.parse(t)};}catch{fail('문자열 형식이 잘못되었습니다.');}}
    else if(/^[A-Za-z_]\w*$/.test(t)){
      let name=t;if(peek()==='.'){take();name+='.'+take();}
      if(peek()==='('){take();const args=[];if(peek()!==')'){do{args.push(expr());if(peek()!==',')break;take();}while(true);}expect(')');n={type:'call',name,args};}
      else n={type:'name',name};
    }else fail(`표현식 오류: ${t}`);
    while(precedence[peek()]>=min){const op=take(),p=precedence[op];n={type:'binary',op,a:n,b:expr(p+1)};}
    depth--;return n;
  }
  function block(){expect('{');const body=[];while(peek()!=='}'){if(peek()==='<end>')fail("닫는 '}'가 없습니다.");body.push(stmt());}take();return body;}
  function stmt(){
    if(peek()===';'){take();return {type:'empty'};}
    if(peek()==='{')return {type:'block',body:block()};
    if(peek()==='if'){take();expect('(');const test=expr();expect(')');const yes=stmt();let no=null;if(peek()==='else'){take();no=stmt();}return {type:'if',test,yes,no};}
    if(peek()==='while'){take();expect('(');const test=expr();expect(')');return {type:'while',test,body:stmt()};}
    if(['const','int','bool','float','long','unsigned','uint32_t'].includes(peek())){
      while(['const','int','bool','float','long','unsigned','uint32_t'].includes(peek()))take();const name=take();
      if(!/^[A-Za-z_]\w*$/.test(name))fail('변수 이름이 필요합니다.');
      let value={type:'literal',value:0};if(peek()==='='){take();value=expr();}expect(';');return {type:'assign',name,value};
    }
    const e=expr();
    if(e.type==='name'&&['=','++','--'].includes(peek())){const op=take();const value=op==='='?expr():{type:'binary',op:op==='++'?'+':'-',a:e,b:{type:'literal',value:1}};expect(';');return {type:'assign',name:e.name,value};}
    expect(';');return {type:'expression',expr:e};
  }
  const program={globals:[],setup:[],loop:[]};let functions=new Set();
  while(peek()!=='<end>'){
    if(peek()==='void'){take();const name=take();if(!['setup','loop'].includes(name))fail('setup()과 loop() 함수만 정의할 수 있습니다.');if(functions.has(name))fail(`${name}() 함수가 중복되었습니다.`);functions.add(name);expect('(');expect(')');program[name]=block();}
    else program.globals.push(stmt());
  }
  if(!functions.has('loop'))fail('void loop() 함수를 작성하세요.');
  return program;
}
export class Runtime {
  constructor(program,api){
    this.api=api;this.gpio={};this.time=0;this.wake=0;this.steps=0;this.microTime=0;
    this.vars={HIGH:1,LOW:0,true:1,false:0,OUTPUT:'OUTPUT',INPUT:'INPUT',INPUT_PULLUP:'INPUT_PULLUP',INPUT_PULLDOWN:'INPUT_PULLDOWN',...Object.fromEntries([...GPIO_PINS,...Object.keys(ALIASES)].map(p=>[p,p]))};
    this.program=program;this.iterator=this.run();
  }
  budget(){if(++this.steps>12000)throw new Error('실행 한도를 넘었습니다. 반복문 안에 delay()를 넣으세요.');}
  value(n){
    this.budget();
    if(n.type==='literal')return n.value;
    if(n.type==='name'){if(!Object.hasOwn(this.vars,n.name))throw new Error(`정의되지 않은 이름: ${n.name}`);return this.vars[n.name];}
    if(n.type==='unary'){const a=this.value(n.a);return n.op==='!'?Number(!a):n.op==='-'?-a:+a;}
    if(n.type==='binary'){
      const a=this.value(n.a);if(n.op==='&&')return a?Number(!!this.value(n.b)):0;if(n.op==='||')return a?1:Number(!!this.value(n.b));const b=this.value(n.b);
      return ({'+':()=>a+b,'-':()=>a-b,'*':()=>a*b,'/':()=>a/b,'%':()=>a%b,'==':()=>Number(a===b),'!=':()=>Number(a!==b),'<':()=>Number(a<b),'>':()=>Number(a>b),'<=':()=>Number(a<=b),'>=':()=>Number(a>=b)})[n.op]();
    }
    if(n.type==='call')return this.call(n.name,n.args.map(a=>this.value(a)));
    throw new Error('표현식을 실행할 수 없습니다.');
  }
  call(name,args){
    const [p,v]=args,pin=canonicalPin(p);
    if(['pinMode','digitalWrite','digitalRead','analogRead','analogWrite','pulseIn'].includes(name)&&!GPIO_PINS.includes(pin))throw new Error(`GPIO 핀 이름을 확인하세요: ${p}`);
    if(name==='pinMode'){if(!['OUTPUT','INPUT','INPUT_PULLUP','INPUT_PULLDOWN'].includes(v))throw new Error('pinMode 모드가 올바르지 않습니다.');this.gpio[pin]={mode:v,value:0};return 0;}
    if(name==='digitalWrite'||name==='analogWrite'){
      if(this.gpio[pin]?.mode!=='OUTPUT')throw new Error(`${p}: pinMode(${p}, OUTPUT)을 먼저 설정하세요.`);
      if(!Number.isFinite(Number(v)))throw new Error('출력 값은 유한한 숫자여야 합니다.');
      this.gpio[pin].value=name==='digitalWrite'?(v?3.3:0):3.3*Math.max(0,Math.min(255,v))/255;this.api.changed?.(this.microTime);return 0;
    }
    if(name==='digitalRead')return this.api.read(pin)?1:0;
    if(name==='analogRead')return Math.round(Math.max(0,Math.min(3.3,this.api.voltage(pin)??0))/3.3*4095);
    if(name==='millis')return this.time;
    if(name==='micros')return this.microTime;
    if(name==='delayMicroseconds'){if(args.length!==1||!Number.isFinite(p)||p<0||p>1e6)throw new Error('delayMicroseconds 범위: 0~1000000 µs');this.microTime+=p;return 0;}
    if(name==='pulseIn'){const timeout=args[2]??1000000;if(![0,1].includes(v)||!Number.isFinite(timeout)||timeout<0||timeout>1e7)throw new Error('pulseIn(pin, HIGH/LOW, timeout) 인수를 확인하세요.');if(this.gpio[pin]?.mode==='OUTPUT')throw new Error('pulseIn은 입력 핀에 사용하세요.');return this.api.pulseIn?.(pin,v,timeout,this.microTime)??0;}
    if(name==='Serial.begin')return 0;
    if(name==='Serial.println'||name==='Serial.print'){this.api.print(args.map(String).join(' '));return 0;}
    if(name==='delay')throw new Error('delay()는 독립적인 문장으로 사용하세요.');
    throw new Error(`지원하지 않는 함수: ${name}`);
  }
  *statement(s){
    this.budget();
    if(s.type==='assign'){this.vars[s.name]=this.value(s.value);return;}
    if(s.type==='block'){yield* this.statements(s.body);return;}
    if(s.type==='if'){const branch=this.value(s.test)?s.yes:s.no;if(branch)yield* this.statement(branch);return;}
    if(s.type==='while'){while(this.value(s.test))yield* this.statement(s.body);return;}
    if(s.type==='expression'){
      if(s.expr.type==='call'&&s.expr.name==='delay'){
        if(s.expr.args.length!==1)throw new Error('delay(ms) 인수 하나가 필요합니다.');
        const ms=Number(this.value(s.expr.args[0]));if(!Number.isFinite(ms)||ms<0||ms>3600000)throw new Error('delay 범위: 0~3600000 ms');yield Math.max(1,ms);
      }else this.value(s.expr);
    }
  }
  *statements(ss){for(const s of ss)yield* this.statement(s);}
  *run(){yield* this.statements(this.program.globals);yield* this.statements(this.program.setup);while(true){yield* this.statements(this.program.loop);yield 1;}}
  tick(time){this.time=time;this.steps=0;let count=0;while(this.wake<=time){if(++count>1000)throw new Error('시간당 실행 한도를 초과했습니다. delay() 값을 늘리세요.');this.microTime=Math.max(this.microTime,this.wake*1000);const next=this.iterator.next();if(next.done)return;this.wake+=next.value;}}
}
