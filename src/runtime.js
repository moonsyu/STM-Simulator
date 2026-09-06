import {GPIO_PINS,ALIASES,canonicalPin} from './pins.js';

const own=(o,k)=>Object.hasOwn(o,k), truth=v=>!!v;
const checkedNumber=v=>{if(typeof v!=='number'||!Number.isFinite(v))throw new Error('유한한 숫자가 필요합니다.');return v;};
const integer=v=>Math.trunc(checkedNumber(v));
const isArray=v=>v?.kind==='array', isPointer=v=>v?.kind==='pointer';

export class Runtime {
  constructor(program,api={}){
    this.program=program;this.api=api;this.gpio={};this.time=0;this.microTime=0;this.steps=0;this.depth=0;this.allocations=0;
    this.globals={cells:Object.create(null),alive:true};this.scopes=[this.globals];this.vars=Object.create(null);
    this.events=[];this.nextId=1;this.nextOrder=1;this.timers=new Map();this.dmas=new Map();this.interrupts=new Map();this.interruptsEnabled=true;this.inCallback=false;this.pwm=new Map();this.pwmFrequency=new Map();
    const constants={HIGH:1,LOW:0,true:1,false:0,NULL:0,OUTPUT:'OUTPUT',INPUT:'INPUT',INPUT_PULLUP:'INPUT_PULLUP',INPUT_PULLDOWN:'INPUT_PULLDOWN',CHANGE:'CHANGE',RISING:'RISING',FALLING:'FALLING',LSBFIRST:0,MSBFIRST:1,DEC:10,HEX:16,OCT:8,BIN:2,PI:Math.PI};
    for(const [key,value]of Object.entries({...constants,...Object.fromEntries([...GPIO_PINS,...Object.keys(ALIASES)].map(p=>[p,p]))}))this.declareCell(key,value,true);
    for(const name of ['Serial','Serial1','Wire','SPI','Timer','DMA'])this.declareCell(name,{kind:'library',name},true);
    this.iterator=this.run();this.wake=0;
  }
  budget(){if(++this.steps>30000)throw new Error('실행 한도를 넘었습니다. 반복문 안에 delay()를 넣으세요.');}
  clone(value,owner,depth=0){
    if(value?.kind!=='struct')return value;
    if(depth>80)throw new Error('구조체 중첩 한도를 넘었습니다.');
    return {kind:'struct',type:value.type,fields:Object.fromEntries(Object.entries(value.fields).map(([key,cell])=>{this.budget();if(++this.allocations>50000)throw new Error('구조체 복사 한도를 넘었습니다.');return [key,{...cell,owner,value:this.clone(cell.value,owner,depth+1)}];}))};
  }
  scope(){return this.scopes.at(-1);}
  pushScope(){const scope={cells:Object.create(null),alive:true};this.scopes.push(scope);return scope;}
  popScope(){const scope=this.scopes.pop();scope.alive=false;}
  declareCell(name,value,constant=false){
    const scope=this.scope();if(own(scope.cells,name))throw new Error(`같은 범위에 중복된 변수: ${name}`);
    if(++this.allocations>50000)throw new Error('한 단계의 메모리 할당 한도를 넘었습니다.');
    const cell={value:this.clone(value,scope),constant,owner:scope};scope.cells[name]=cell;
    if(scope===this.globals)Object.defineProperty(this.vars,name,{enumerable:true,configurable:true,get:()=>cell.value,set:value=>{cell.value=value;}});
    return cell;
  }
  cell(name){for(let i=this.scopes.length-1;i>=0;i--)if(own(this.scopes[i].cells,name))return this.scopes[i].cells[name];throw new Error(`정의되지 않은 이름: ${name}`);}
  get(cell){if(cell.owner&&!cell.owner.alive)throw new Error('유효기간이 끝난 지역 변수를 참조했습니다.');return cell.value;}
  set(cell,value){this.get(cell);if(cell.constant)throw new Error('const 값은 변경할 수 없습니다.');cell.value=this.clone(value,cell.owner);return cell.value;}
  array(values,owner=this.scope()){if(values.length>4096)throw new Error('배열은 4096개 이하로 선언하세요.');this.allocations+=values.length;if(this.allocations>50000)throw new Error('한 단계의 메모리 할당 한도를 넘었습니다.');return {kind:'array',cells:values.map(value=>({value:this.clone(value,owner),owner,constant:false}))};}
  pointer(value){return isArray(value)?{kind:'pointer',array:value,index:0}:value;}
  pointerCell(p,offset=0){
    if(isArray(p))p=this.pointer(p);if(!isPointer(p))throw new Error('배열 또는 유효한 포인터가 필요합니다.');
    if(p.array){const index=p.index+integer(offset);if(index<0||index>=p.array.cells.length)throw new Error('배열 인덱스가 범위를 벗어났습니다.');return p.array.cells[index];}
    if(offset!==0)throw new Error('단일 변수 포인터에 범위를 벗어난 연산을 할 수 없습니다.');return p.cell;
  }
  callback(value){if(value?.kind!=='function'||!own(this.program.functions,value.name))throw new Error('사용자 함수 이름을 콜백으로 지정하세요.');return value;}
  *reference(n){
    this.budget();
    if(n.type==='name')return this.cell(n.name);
    if(n.type==='unary'&&n.op==='*')return this.pointerCell(yield* this.evaluate(n.a));
    if(n.type==='index')return this.pointerCell(yield* this.evaluate(n.object),yield* this.evaluate(n.index));
    if(n.type==='member'){
      let object=yield* this.evaluate(n.object);if(n.pointer)object=this.get(this.pointerCell(object));
      if(object?.kind!=='struct'||!own(object.fields,n.key))throw new Error(`구조체 필드가 없습니다: ${n.key}`);return object.fields[n.key];
    }
    throw new Error('대입할 수 없는 값입니다.');
  }
  binary(op,a,b){
    if((isPointer(a)||isArray(a))&&['+','-'].includes(op)){const p=this.pointer(a);if(!p.array)throw new Error('포인터 산술에는 배열이 필요합니다.');const index=p.index+(op==='+'?1:-1)*integer(b);if(index<0||index>p.array.cells.length)throw new Error('포인터가 배열 범위를 벗어났습니다.');return {...p,index};}
    if(op==='+'&&(typeof a==='string'||typeof b==='string'))return String(a)+String(b);
    if(['==','!='].includes(op)){let eq=a===b;if(isPointer(a)&&isPointer(b))eq=a.array? a.array===b.array&&a.index===b.index:a.cell===b.cell;return Number(op==='=='?eq:!eq);}
    checkedNumber(a);checkedNumber(b);if(['/','%'].includes(op)&&b===0)throw new Error('0으로 나눌 수 없습니다.');
    const value=({'+':()=>a+b,'-':()=>a-b,'*':()=>a*b,'/':()=>a/b,'%':()=>a%b,'<':()=>Number(a<b),'>':()=>Number(a>b),'<=':()=>Number(a<=b),'>=':()=>Number(a>=b),'&':()=>a&b,'|':()=>a|b,'^':()=>a^b,'<<':()=>a<<b,'>>':()=>a>>b})[op]?.();
    if(value===undefined||!Number.isFinite(value))throw new Error('숫자 연산 결과가 유효하지 않습니다.');return value;
  }
  *evaluate(n){
    this.budget();
    if(n.type==='literal')return n.value;
    if(n.type==='name'){if(own(this.program.functions,n.name))return {kind:'function',name:n.name};return this.get(this.cell(n.name));}
    if(n.type==='list'){const values=[];for(const v of n.values)values.push(yield* this.evaluate(v));return {kind:'initializer',values};}
    if(n.type==='construct'){const args=[];for(const v of n.args)args.push(yield* this.evaluate(v));if(n.name!=='LiquidCrystal')throw new Error('지원하지 않는 생성자입니다.');return this.api.construct?.(n.name,args,this)??{kind:'device',name:n.name,args};}
    if(n.type==='cast'){const value=yield* this.evaluate(n.a);return n.to==='String'?String(value):n.to==='bool'?Number(truth(value)):['float','double'].includes(n.to)?checkedNumber(value):integer(value);}
    if(n.type==='index'||n.type==='member')return this.get(yield* this.reference(n));
    if(n.type==='unary'){
      if(n.op==='&'){if(n.a.type==='index')return {kind:'pointer',array:(this.pointer(yield* this.evaluate(n.a.object))).array,index:integer(yield* this.evaluate(n.a.index))};return {kind:'pointer',cell:yield* this.reference(n.a)};}
      if(n.op==='*')return this.get(this.pointerCell(yield* this.evaluate(n.a)));
      if(n.op==='++'||n.op==='--'){const cell=yield* this.reference(n.a);return this.set(cell,this.binary(n.op==='++'?'+':'-',this.get(cell),1));}
      const a=yield* this.evaluate(n.a);return n.op==='!'?Number(!a):n.op==='~'?~integer(a):n.op==='-'?-checkedNumber(a):checkedNumber(a);
    }
    if(n.type==='postfix'){const cell=yield* this.reference(n.a),old=this.get(cell);this.set(cell,this.binary(n.op==='++'?'+':'-',old,1));return old;}
    if(n.type==='assign'){const cell=yield* this.reference(n.a),value=yield* this.evaluate(n.b);return this.set(cell,n.op==='='?value:this.binary(n.op.slice(0,-1),this.get(cell),value));}
    if(n.type==='conditional')return yield* this.evaluate(truth(yield* this.evaluate(n.test))?n.yes:n.no);
    if(n.type==='binary'){
      const a=yield* this.evaluate(n.a);if(n.op==='&&')return a?Number(truth(yield* this.evaluate(n.b))):0;if(n.op==='||')return a?1:Number(truth(yield* this.evaluate(n.b)));
      return this.binary(n.op,a,yield* this.evaluate(n.b));
    }
    if(n.type==='call'){
      const args=[];for(const a of n.args)args.push(yield* this.evaluate(a));
      if(n.callee.type==='name'){
        if(own(this.program.functions,n.callee.name))return yield* this.invoke(n.callee.name,args);
        if(n.callee.name==='delay'){if(this.inCallback)throw new Error('콜백에서는 delay()를 사용할 수 없습니다.');const ms=this.interval(args[0],0);if(args.length!==1)throw new Error('delay(ms) 인수 하나가 필요합니다.');yield Math.max(.001,ms);return 0;}
        return this.call(n.callee.name,args);
      }
      if(n.callee.type==='member'&&!n.callee.pointer){const object=yield* this.evaluate(n.callee.object);if(object?.kind==='library')return this.call(`${object.name}.${n.callee.key}`,args);if(object?.kind==='device')return this.api.deviceCall?.(object,n.callee.key,args,this)??0;}
      throw new Error('지원하지 않는 함수 호출입니다.');
    }
    throw new Error('표현식을 실행할 수 없습니다.');
  }
  defaultValue(type,owner=this.scope(),depth=0){
    this.budget();if(depth>32||++this.allocations>50000)throw new Error('구조체 메모리 한도를 넘었습니다.');
    if(own(this.program.structs,type))return {kind:'struct',type,fields:Object.fromEntries(this.program.structs[type].map(f=>[f.name,{value:this.defaultValue(f.type,owner,depth+1),owner,constant:f.constant}]))};
    return type==='String'?'':0;
  }
  initialize(type,value,owner=this.scope()){
    if(own(this.program.structs,type)){
      if(value?.kind==='struct')return this.clone(value);
      const result=this.defaultValue(type,owner);if(value?.kind==='initializer'){const keys=Object.keys(result.fields);if(value.values.length>keys.length)throw new Error('구조체 초기값이 너무 많습니다.');value.values.forEach((v,i)=>{result.fields[keys[i]].value=this.clone(v);});}return result;
    }
    if(value?.kind==='initializer')throw new Error('배열 또는 구조체에만 초기값 목록을 사용하세요.');return value??this.defaultValue(type,owner);
  }
  *statement(s){
    this.budget();
    if(s.type==='declare'){
      for(const d of s.declarations){let value=d.value?yield* this.evaluate(d.value):undefined;
        if(d.array){let values=value?.kind==='initializer'?value.values:typeof value==='string'?[...value].map(c=>c.charCodeAt(0)).concat(0):[];const length=d.size?integer(yield* this.evaluate(d.size)):values.length;if(length<1||length>4096||values.length>length)throw new Error('배열 크기 또는 초기값 개수를 확인하세요.');value=this.array(Array.from({length},(_,i)=>this.initialize(d.type,values[i])));if(d.constant)value.cells.forEach(c=>c.constant=true);}
        else if(d.pointer){if(typeof value==='string')value=this.array([...value].map(c=>c.charCodeAt(0)).concat(0),this.globals);value=this.pointer(value??0);if(value!==0&&!isPointer(value))throw new Error('포인터 초기값을 확인하세요.');}
        else if(d.type!=='LiquidCrystal')value=this.initialize(d.type,value);
        this.declareCell(d.name,value,d.constant);
      }return;
    }
    if(s.type==='block'){this.pushScope();try{return yield* this.statements(s.body);}finally{this.popScope();}}
    if(s.type==='expression'){yield* this.evaluate(s.expr);return;}
    if(s.type==='if'){const branch=truth(yield* this.evaluate(s.test))?s.yes:s.no;if(branch)return yield* this.statement(branch);return;}
    if(['while','for','do'].includes(s.type)){
      this.pushScope();try{
        if(s.init)yield* this.statement(s.init);let first=true;
        while((s.type==='do'&&first)||truth(yield* this.evaluate(s.test))){first=false;const signal=yield* this.statement(s.body);if(signal?.type==='return')return signal;if(signal?.type==='break')break;if(s.update)yield* this.evaluate(s.update);this.budget();}
      }finally{this.popScope();}return;
    }
    if(s.type==='return')return {type:'return',value:s.value?yield* this.evaluate(s.value):0};
    if(s.type==='break'||s.type==='continue')return {type:s.type};
  }
  *statements(body){for(const statement of body){const signal=yield* this.statement(statement);if(signal)return signal;}}
  *invoke(name,args=[]){
    const fn=this.program.functions[name];if(!fn)throw new Error(`정의되지 않은 함수: ${name}`);if(args.length!==fn.params.length)throw new Error(`${name}(): 인수 개수를 확인하세요.`);
    if(++this.depth>32)throw new Error('함수 호출 깊이 한도를 넘었습니다.');
    const previous=this.scopes;this.scopes=[this.globals];this.pushScope();
    try{fn.params.forEach((p,i)=>this.declareCell(p.name,p.pointer?this.pointer(args[i]):this.clone(args[i]),p.constant));const signal=yield* this.statement(fn.body);if(signal&&signal.type!=='return')throw new Error('break/continue는 반복문 안에서 사용하세요.');return signal?.value??0;}
    finally{this.popScope();this.scopes=previous;this.depth--;}
  }
  *run(){yield* this.statements(this.program.globals);if(this.program.functions.setup)yield* this.invoke('setup');while(true){yield* this.invoke('loop');yield 1;}}
  pin(name){const pin=canonicalPin(name);if(!GPIO_PINS.includes(pin))throw new Error(`GPIO 핀 이름을 확인하세요: ${name}`);return pin;}
  interval(value,min=1){checkedNumber(value);if(value<min||value>3600000)throw new Error(`시간 범위: ${min}~3600000 ms`);return value;}
  output(pin,value){if(this.gpio[pin]?.mode!=='OUTPUT')throw new Error(`${pin}: pinMode(${pin}, OUTPUT)을 먼저 설정하세요.`);this.api.beforeChange?.(this.microTime);this.gpio[pin].value=value;this.api.changed?.(this.microTime);this.pollInterrupts();}
  event(at,fn){if(this.events.length>=4096)throw new Error('예약 이벤트 한도를 넘었습니다.');this.events.push({at,fn,order:this.nextOrder++});}
  timer(period,callback,once=false){
    if(this.timers.size>=32)throw new Error('타이머는 32개까지 사용할 수 있습니다.');this.interval(period);this.callback(callback);
    const id=this.nextId++,timer={active:true};this.timers.set(id,timer);
    const fire=()=>{if(!timer.active)return;if(once){timer.active=false;this.timers.delete(id);}else this.event(this.microTime/1000+period,fire);this.runCallback(callback);};
    this.event(this.microTime/1000+period,fire);return id;
  }
  runCallback(callback){this.inCallback=true;try{const iterator=this.invoke(callback.name,[]),r=iterator.next();if(!r.done){iterator.return();throw new Error('콜백에서 대기할 수 없습니다.');}}finally{this.inCallback=false;}}
  pollInterrupts(){
    if(!this.api.read)return;
    for(const [pin,s]of this.interrupts){const state=Number(!!this.api.read(pin));const fired=state!==s.previous&&(s.mode==='CHANGE'||(s.mode==='RISING'&&state)||(s.mode==='FALLING'&&!state));s.previous=state;if(fired&&!s.pending){s.pending=true;}}
  }
  format(args){const [value,base]=args;if(base!==undefined&&typeof value==='number'){if(Number.isInteger(value)&&[2,8,10,16].includes(base))return Math.trunc(value).toString(base).toUpperCase();if(Number.isInteger(base)&&base>=0&&base<=8)return value.toFixed(base);}if(isPointer(value)||isArray(value)){const p=this.pointer(value);let s='';for(let i=0;i<4096;i++){const n=this.get(this.pointerCell(p,i));if(n===0)return s;s+=String.fromCharCode(integer(n));}throw new Error('문자열 종료 문자가 없습니다.');}return args.map(String).join(' ');}
  call(name,args){
    const [a,b,c,d,e]=args;
    if(['pinMode','digitalWrite','digitalRead','analogRead','analogWrite','analogWriteFrequency','pulseIn','attachInterrupt','detachInterrupt','digitalPinToInterrupt'].includes(name)){
      const pin=this.pin(a);
      if(name==='pinMode'){if(!['OUTPUT','INPUT','INPUT_PULLUP','INPUT_PULLDOWN'].includes(b))throw new Error('pinMode 모드가 올바르지 않습니다.');this.pwm.delete(pin);this.gpio[pin]={mode:b,value:0};this.api.changed?.(this.microTime);return 0;}
      if(name==='digitalWrite'){this.pwm.delete(pin);this.output(pin,b?3.3:0);return 0;}
      if(name==='analogWriteFrequency'){checkedNumber(b);if(b<1||b>2000)throw new Error('PWM 주파수 범위: 1~2000 Hz');this.pwmFrequency.set(pin,b);return 0;}
      if(name==='analogWrite'){
        const duty=Math.max(0,Math.min(255,checkedNumber(b)))/255;this.pwm.delete(pin);
        if(!this.api.pwmEnabled||duty===0||duty===1){this.output(pin,3.3*duty);return 0;}
        const period=1000/(this.pwmFrequency.get(pin)||500),state={high:true};this.pwm.set(pin,state);this.output(pin,3.3);
        const edge=()=>{if(this.pwm.get(pin)!==state)return;state.high=!state.high;this.output(pin,state.high?3.3:0);this.event(this.microTime/1000+period*(state.high?duty:1-duty),edge);};this.event(this.microTime/1000+period*duty,edge);return 0;
      }
      if(name==='digitalRead')return Number(!!this.api.read?.(pin));
      if(name==='analogRead')return Math.round(Math.max(0,Math.min(3.3,this.api.voltage?.(pin)??0))/3.3*4095);
      if(name==='digitalPinToInterrupt')return pin;
      if(name==='attachInterrupt'){this.callback(b);if(!['CHANGE','RISING','FALLING'].includes(c))throw new Error('인터럽트 모드는 CHANGE/RISING/FALLING입니다.');this.interrupts.set(pin,{callback:b,mode:c,previous:Number(!!this.api.read?.(pin)),pending:false});return 0;}
      if(name==='detachInterrupt'){this.interrupts.delete(pin);return 0;}
      if(name==='pulseIn'){const timeout=c??1e6;if(![0,1].includes(b)||!Number.isFinite(timeout)||timeout<0||timeout>1e7)throw new Error('pulseIn 인수를 확인하세요.');if(this.gpio[pin]?.mode==='OUTPUT')throw new Error('pulseIn은 입력 핀에 사용하세요.');return this.api.pulseIn?.(pin,b,timeout,this.microTime)??0;}
    }
    if(name==='millis')return Math.floor(this.microTime/1000);
    if(name==='micros')return Math.floor(this.microTime);
    if(name==='delayMicroseconds'){if(this.inCallback)throw new Error('콜백에서 대기할 수 없습니다.');checkedNumber(a);if(a<0||a>1e6)throw new Error('delayMicroseconds 범위: 0~1000000 µs');this.microTime+=a;return 0;}
    if(name==='noInterrupts'){this.interruptsEnabled=false;return 0;}
    if(name==='interrupts'){this.interruptsEnabled=true;return 0;}
    if(name==='Timer.every'||name==='Timer.after')return this.timer(a,b,name==='Timer.after');
    if(name==='Timer.cancel'){const t=this.timers.get(a);if(t)t.active=false;this.timers.delete(a);return 0;}
    if(name==='DMA.start'||name==='DMA.write'){
      const pin=this.pin(a),buffer=this.pointer(b),length=integer(c),period=this.interval(d);if(length<1||length>4096)throw new Error('DMA 길이 범위: 1~4096');this.pointerCell(buffer,length-1);if(e!==undefined)this.callback(e);if(this.dmas.size>=8)throw new Error('DMA 채널은 8개까지 사용할 수 있습니다.');
      const id=this.nextId++,state={active:true,index:0};this.dmas.set(id,state);
      const transfer=()=>{if(!state.active)return;const cell=this.pointerCell(buffer,state.index);if(name==='DMA.start')this.set(cell,this.call('analogRead',[pin]));else this.call('analogWrite',[pin,this.get(cell)]);state.index++;if(state.index>=length){state.active=false;this.dmas.delete(id);if(e)this.runCallback(e);}else this.event(this.microTime/1000+period,transfer);};this.event(this.microTime/1000+period,transfer);return id;
    }
    if(name==='DMA.busy')return Number(this.dmas.has(a));
    if(name==='DMA.cancel'){const s=this.dmas.get(a);if(s)s.active=false;this.dmas.delete(a);return 0;}
    if(name==='Serial.begin')return 0;
    if(name==='Serial.println'||name==='Serial.print'){this.api.print?.(this.format(args));return 0;}
    if(name==='Serial.available')return this.api.serialAvailable?.()??0;
    if(name==='Serial.read')return this.api.serialRead?.()??-1;
    if(name==='Serial.write'){this.api.print?.(typeof a==='number'?String.fromCharCode(a&255):String(a));return 1;}
    if(name==='constrain')return Math.max(b,Math.min(c,a));
    if(name==='map'){if(c===b)throw new Error('map 입력 범위가 0입니다.');return (a-b)*(e-d)/(c-b)+d;}
    if(name==='bitRead')return (integer(a)>>>integer(b))&1;
    if(name==='abs')return Math.abs(checkedNumber(a));if(name==='min')return Math.min(...args.map(checkedNumber));if(name==='max')return Math.max(...args.map(checkedNumber));
    if(['sin','cos','tan','sqrt','floor','ceil','round','pow'].includes(name)){const value=Math[name](...args.map(checkedNumber));if(!Number.isFinite(value))throw new Error('수학 함수 결과가 유효하지 않습니다.');return value;}
    if(['int','long','byte','char','uint8_t','uint16_t','uint32_t','float','double'].includes(name)){const value=checkedNumber(a);return ['float','double'].includes(name)?value:['byte','char','uint8_t'].includes(name)?integer(value)&255:name==='uint16_t'?integer(value)&65535:integer(value);}
    if(name==='String')return this.format(args);
    if(this.api.call){const result=this.api.call(name,args,this);if(result!==undefined)return result;}
    throw new Error(`지원하지 않는 함수: ${name}`);
  }
  tick(target){
    if(!Number.isFinite(target)||target<0)throw new Error('시뮬레이션 시간이 올바르지 않습니다.');this.steps=0;this.allocations=0;let count=0;this.pollInterrupts();
    while(true){
      if(++count>4000)throw new Error('시간당 실행 한도를 초과했습니다. 주파수나 반복 횟수를 줄이세요.');
      if(this.interruptsEnabled){for(const state of this.interrupts.values())if(state.pending){state.pending=false;this.runCallback(state.callback);}}
      this.events.sort((a,b)=>a.at-b.at||a.order-b.order);const event=this.events[0],at=Math.min(this.wake,event?.at??Infinity);if(at>target)break;
      this.time=at;this.microTime=Math.max(this.microTime,at*1000);this.api.advance?.(this.microTime);
      if(event&&event.at<=this.wake){this.events.shift();event.fn();}
      else {const next=this.iterator.next();if(next.done){this.wake=Infinity;}else this.wake=Math.max(this.wake,this.microTime/1000)+next.value;}
      this.pollInterrupts();
    }
    this.time=target;this.microTime=Math.max(this.microTime,target*1000);this.api.advance?.(this.microTime);
  }
}
