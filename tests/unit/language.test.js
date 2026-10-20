import {test,describe} from 'node:test';
import assert from 'node:assert/strict';
import {compile} from '../../src/parser.js';
import {compileHal,prepareHalSource,HAL_ALIASES,HAL_STRUCTS} from '../../src/hal-source.js';
import {Runtime} from '../../src/runtime.js';
import {HAL_CONSTANTS} from '../../src/hal.js';
import {isFloat,isUnsigned,promote,commonType,convert,arithmetic,numberLiteral} from '../../src/c-types.js';
import {formatPrintf} from '../../src/hal-stdio.js';
import {inspectRuntime,watchValue,displayValue} from '../../src/debug-tools.js';
import {runHal,halLines,halError,runSketch} from './helpers/run.js';

/** Evaluates a C expression in HAL mode and returns the numeric value stored in a double. */
const evalC=(body,globals='')=>{const r=new Runtime(compileHal(`${globals}\ndouble result;\nint main(void){${body}\nreturn 0;}`),{constants:HAL_CONSTANTS});r.tick(10);assert.equal(r.finished,true,"program completed");return r.vars.result;};
/** printf through a minimal runtime stub: strings are passed as JS strings. */
const fmt=(...args)=>formatPrintf(args,{format:([v])=>v});

describe('c-types: scalar conversions',()=>{
  test('type classification and integer promotion',()=>{
    assert.ok(isFloat('float')&&isFloat('double')&&!isFloat('int'));
    assert.ok(isUnsigned('uint32_t')&&isUnsigned('size_t')&&!isUnsigned('uint8_t'),'narrow unsigned types promote to int');
    assert.equal(promote('uint8_t'),'int');assert.equal(promote('char'),'int');assert.equal(promote('unsigned'),'uint32_t');assert.equal(promote('float'),'float');
    assert.equal(commonType('int','uint32_t'),'uint32_t');assert.equal(commonType('float','uint32_t'),'float');assert.equal(commonType('float','double'),'double');assert.equal(commonType('uint16_t','int8_t'),'int');
  });
  test('convert wraps and truncates like a 32-bit Cortex-M4',()=>{
    const cases=[['uint8_t',256,0],['uint8_t',-1,255],['byte',300,44],['char',200,-56],['int8_t',128,-128],['uint16_t',70000,4464],['int16_t',32768,-32768],['short',-32769,32767],
      ['int',2147483648,-2147483648],['uint32_t',-1,4294967295],['unsigned',4294967296,0],['int',3.99,3],['int',-3.99,-3],['bool',5,1],['bool',0,0]];
    for(const [type,input,expected]of cases)assert.equal(convert(type,input),expected,`${type}(${input})`);
    assert.equal(convert('float',0.1),Math.fround(0.1));assert.equal(convert('double',0.1),0.1);
    assert.equal(convert('int','text'),'text','non-numbers pass through');assert.equal(convert(undefined,1.5),1.5);
  });
  test('arithmetic follows usual arithmetic conversions and integer semantics',()=>{
    assert.equal(arithmetic('+',2147483647,1),-2147483648);
    assert.equal(arithmetic('*',65536,65536),0);assert.equal(arithmetic('*',0xffffffff,0xffffffff,'uint32_t','uint32_t'),1);
    assert.equal(arithmetic('/',-7,2),-3);assert.equal(arithmetic('%',-7,3),-1);assert.equal(arithmetic('/',7,2,'double','int'),3.5);
    assert.equal(arithmetic('>>',-16,2),-4);assert.equal(arithmetic('>>',0x80000000,31,'uint32_t','int'),1);
    assert.equal(arithmetic('-',0,1,'uint32_t','int'),4294967295);
    assert.equal(arithmetic('==',4294967295,-1,'uint32_t','int'),1,'-1 converts to UINT_MAX');
    assert.equal(arithmetic('<',-1,1,'int','uint32_t'),0,'signed/unsigned comparison pitfall');
    assert.equal(arithmetic('+',255,1,'uint8_t','int'),256,'narrow operands promote before adding');
  });
  test('division by zero and non-finite results throw Korean errors',()=>{
    assert.throws(()=>arithmetic('/',1,0),/0으로 나눌 수 없습니다/);assert.throws(()=>arithmetic('%',1,0),/0으로/);
    assert.throws(()=>arithmetic('/',1,0,'double','double'),/0으로/);
    assert.throws(()=>arithmetic('**',1,1),/유효하지 않습니다/);
  });
  test('number literals: bases, suffixes and range',()=>{
    assert.deepEqual(numberLiteral('0x1F'),{value:31,numericType:'int'});assert.deepEqual(numberLiteral('0b101'),{value:5,numericType:'int'});
    assert.deepEqual(numberLiteral('010'),{value:8,numericType:'int'});assert.deepEqual(numberLiteral('7u'),{value:7,numericType:'uint32_t'});
    assert.deepEqual(numberLiteral('0xFFFFFFFF'),{value:4294967295,numericType:'uint32_t'});
    assert.deepEqual(numberLiteral('1.5f'),{value:1.5,numericType:'float'});assert.deepEqual(numberLiteral('2e3'),{value:2000,numericType:'double'});
    assert.throws(()=>numberLiteral('09'),/8진수/);assert.throws(()=>numberLiteral('4294967296'),/32비트/);
  });
});

describe('HAL C semantics (compiled and executed)',()=>{
  const cases=[
    ['signed overflow wraps','int x=2147483647;result=x+1;',-2147483648],
    ['unsigned underflow','uint32_t x=0;x--;result=x;',4294967295],
    ['uint8_t store truncates','uint8_t x=300;result=x;',44],
    ['int8_t store sign-extends','int8_t x=200;result=x;',-56],
    ['uint16_t wraps','uint16_t x=65535;x++;result=x;',0],
    ['integer division truncates toward zero','result=-7/2;',-3],
    ['float to int cast truncates','result=(int)-3.99;',-3],
    ['float is single precision','float f=0.1f;result=(f==0.1);',0],
    ['compound assignment narrows','uint8_t x=250;x+=10;result=x;',4],
    ['bitwise not of a byte','uint8_t b=0x0F;b=~b;result=b;',240],
    ['logical operators short-circuit','int n=0;int r=(0 && ++n) || (1 || ++n);result=r*10+n;',10],
    ['ternary picks a branch','int a=5,b=7;result=a>b?a:b;',7],
    ['sizeof basic types','result=sizeof(char)*100+sizeof(int)*10+sizeof(double)-8;',140],
    ['struct sizeof follows alignment','result=sizeof(struct R);',8,'struct R {float v;uint16_t raw;};'],
    ['enum auto-increment','result=C;',6,'enum E {A, B=5, C};'],
    ['scalar typedef','u32 q=4000000000u;result=q;',4000000000,'typedef unsigned int u32;'],
    ['named struct typedef','Q q={3};result=q.x;',3,'struct Q {int x;};\ntypedef struct Q Q;'],
    ['static local keeps value','counter();counter();result=counter();',3,'int counter(void){static int n=0;return ++n;}'],
    ['struct copy is by value','struct P a={1,2};struct P b=a;b.x=9;result=a.x*10+b.x;',19,'struct P {int x;int y;};'],
    ['pointer to struct member','struct P a={1,2};struct P *p=&a;p->y+=5;result=a.y;',7,'struct P {int x;int y;};'],
    ['pointer increment walks an array','int v[4]={1,2,3,4};int *p=v+1;p++;result=*p;',3],
    ['array parameter decays to pointer','int v[3]={1,2,3};result=sum(v,3);',6,'int sum(int a[],int n){int t=0;for(int i=0;i<n;i++)t+=a[i];return t;}'],
    ['object-like #define','result=N*2;',6,'#define N 3'],
    ['#ifdef selects a branch','result=MODE;',2,'#define FAST\n#ifdef FAST\n#define MODE 2\n#else\n#define MODE 1\n#endif'],
    ['switch fall-through','int x=0;switch(1){case 1:x=2;case 2:x+=3;break;default:x=9;}result=x;',5],
    ['do/while executes at least once','int n=0;do{n++;}while(0);result=n;',1],
    ['continue skips an iteration','int t=0;for(int i=0;i<5;i++){if(i==2)continue;t+=i;}result=t;',8],
    ['recursion','result=fact(10);',3628800,'int fact(int n){return n<=1?1:n*fact(n-1);}'],
    ['string literal indexing','const char *s="hello";result=s[4];',111],
  ];
  for(const [name,body,expected,globals='']of cases)test(name,()=>assert.equal(evalC(body,globals),expected));
});

describe('HAL printf (hal-stdio formatting)',()=>{
  test('integer conversions, flags, width and precision',()=>{
    assert.equal(fmt('%d|%i|%u|%x|%X|%o',-3,42,7,255,255,8),'-3|42|7|ff|FF|10');
    assert.equal(fmt('[%+d][% d][%5d][%-5d][%05d][%.3d]',5,5,42,42,-42,7),'[+5][ 5][   42][42   ][-0042][007]');
    assert.equal(fmt('%u',-1),'4294967295');assert.equal(fmt('%hhu %hd',256,65537),'0 1');
    assert.equal(fmt('%x',-1),'ffffffff');
  });
  test('floats, chars, strings and percent',()=>{
    assert.equal(fmt('%f',1.5),'1.500000');assert.equal(fmt('%.2f',3.14159),'3.14');assert.equal(fmt('%08.3f',-3.14159),'-003.142');
    assert.equal(fmt('%c%c',72,105),'Hi');assert.equal(fmt('%s|%.2s|%5s|%-5s|','abc','abc','ab','ab'),'abc|ab|   ab|ab   |');
    assert.equal(fmt('100%%'),'100%');
  });
  test('errors: unsupported specifiers, missing args, bounds and bad types',()=>{
    assert.throws(()=>fmt('%q',1),/지원하지 않는 printf 형식/);
    assert.throws(()=>fmt('%d'),/인수가 부족/);
    assert.throws(()=>fmt('%100d',1),/폭은 80/);assert.throws(()=>fmt('%.9f',1),/정밀도는 8/);
    assert.throws(()=>fmt('%d',NaN),/유한한 숫자/);assert.throws(()=>fmt('%ls','x'),/와이드/);
    assert.throws(()=>formatPrintf([],{format:()=>''}),/32개/);
    assert.throws(()=>fmt('x'.repeat(1025)),/1024자/);
    assert.throws(()=>fmt('%s','y'.repeat(5000)),/4096자/);
  });
  test('printf output reaches the terminal line by line through a real session',()=>{
    assert.deepEqual(halLines('  printf("%d %5.2f|%-4s|%04x\\n", -3, 3.14159, "ab", 255);\n  printf("x");\n  printf("y\\n");'),['-3  3.14|ab  |00ff','x','y']);
  });
});

describe('HAL program behaviour',()=>{
  test('control flow mixes loops, switch and break',()=>{
    assert.deepEqual(halLines('for (int i = 0; i < 4; i++) { switch (i) { case 0: printf("z\\n"); break; case 1: case 2: printf("o\\n"); break; default: printf("d\\n"); } }'),['z','o','o','d']);
    assert.deepEqual(halLines('int n=0; while (1) { if (++n == 5) break; } do { n--; } while (n > 2); printf("%d\\n", n);'),['2']);
  });
  test('char arrays and string.h',()=>{
    assert.deepEqual(runHal('#include <stdio.h>\n#include <string.h>\nint main(void){char s[8]="abc";printf("%s %d\\n",s,(int)strlen(s));return 0;}').out,['abc 3']);
  });
  test('structs containing arrays',()=>{
    assert.deepEqual(halLines('struct S s[2]; s[1].a = 9; s[1].n[0] = 65; printf("%d %c\\n", s[1].a, s[1].n[0]);','struct S {int a; char n[4];};'),['9 A']);
  });
  test('HAL_Delay advances HAL_GetTick and globals are visible to the session',()=>{
    const r=runHal('#include <stdio.h>\nint n=0;\nint main(void){\n  HAL_Delay(100);\n  printf("%lu\\n", HAL_GetTick());\n  while (1) { n++; HAL_Delay(10); }\n}',{ms:205});
    assert.equal(r.error,null);assert.deepEqual(r.out,['100']);assert.equal(r.vars.n,11);
  });
  test('returning from main finishes the program',()=>{
    const r=runHal('int g;\nint main(void){ g = 5; return 0; }',{ms:10});assert.equal(r.vars.g,5);assert.equal(r.session.runtime.finished,true);
  });
  test('recursion is limited to 32 frames',()=>{
    const prog=n=>`#include <stdio.h>\nint f(int n){return n==0?0:1+f(n-1);}\nint main(void){printf("%d\\n",f(${n}));return 0;}`;
    assert.deepEqual(runHal(prog(20),{ms:200}).out,['20']);
    assert.match(runHal(prog(40),{ms:200}).error.message,/함수 호출 깊이 한도/);
  });
  test('additional source files and headers are compiled together',()=>{
    const r=runHal('#include <stdio.h>\n#include "user.h"\nint main(void){ printf("%d\\n", twice(21)); return 0; }',{files:[{name:'user.h',text:'#pragma once\nint twice(int n);\n'},{name:'user.c',text:'#include "user.h"\nint twice(int n){ return n * 2; }\n'}]});
    assert.equal(r.error,null);assert.deepEqual(r.out,['42']);
  });
});

describe('runtime errors (Korean messages with source locations)',()=>{
  const cases=[
    ['array index out of bounds','int main(void){\n  int a[3];\n  a[3]=1;\n  return 0;\n}',/배열 인덱스가 범위를 벗어났습니다/,3],
    ['null pointer write','int main(void){\n  int *p=0;\n  *p=1;\n  return 0;\n}',/유효한 포인터가 필요/,3],
    ['dangling pointer to an expired local','int *g;\nvoid f(void){int x=1;g=&x;}\nint main(void){\n  f();\n  int y=*g;\n  return 0;\n}',/유효기간이 끝난 지역 변수/,5],
    ['pointer past the end dereferenced','int main(void){\n  int v[2]={1,2};\n  int *p=v+2;\n  int x=*p;\n  return 0;\n}',/범위/,4],
    ['division by zero','int main(void){\n  int z=0;\n  int x=5/z;\n  return 0;\n}',/0으로 나눌 수 없습니다/,3],
    ['const write','const int k=1;\nint main(void){\n  k=2;\n  return 0;\n}',/const 값은 변경할 수 없습니다/,3],
    ['undefined variable','int main(void){\n\n  y = 3;\n  return 0;\n}',/정의되지 않은 이름: y/,3],
    ['unknown function','int main(void){\n  nothing(1);\n  return 0;\n}',/지원하지 않는 함수: nothing/,2],
    ['wrong argument count','int f(int a){return a;}\nint main(void){\n  f(1,2);\n  return 0;\n}',/f\(\): 인수 개수/,3],
    ['printf missing argument','#include <stdio.h>\nint main(void){\n  printf("%s\\n");\n  return 0;\n}',/인수가 부족/,3],
  ];
  for(const [name,code,pattern,line]of cases)test(name,()=>{
    const {error,location}=halError(code);assert.match(error.message,pattern);assert.equal(location?.line,line,`reported line for ${name}`);assert.equal(location?.file,'main.c');
  });
  test('busy loops without delay hit the execution limit in sketches',()=>{
    assert.throws(()=>runSketch('void setup(){while(true){}}void loop(){}',{ms:100}),/실행 한도를 넘었습니다. 반복문 안에 delay\(\)/);
  });
  test('oversized local arrays are rejected',()=>{
    assert.match(halError('int main(void){int a[200000];return 0;}').error.message,/배열 크기/);
  });
});

describe('compile errors',()=>{
  const cases=[
    ['syntax error','int main(void){\n  int x = ;\n  return 0;\n}',/^main\.c:2: 표현식 오류/,2],
    ['missing main','int f(void){return 0;}',/int main\(void\) 함수를 작성하세요/,1],
    ['unknown header','#include <foo.h>\nint main(void){return 0;}',/지원하지 않거나 선택하지 않은 헤더: foo\.h/,1],
    ['function-like macro (unsupported)','#include <stdio.h>\n#define SQ(x) ((x)*(x))\nint main(void){return SQ(2);}',/함수형 매크로는 지원하지 않습니다/,2],
    ['multi-dimensional array (unsupported)','int main(void){\n  int m[2][3];\n  return 0;\n}',/다차원 배열은 지원하지 않습니다/,2],
    ['invalid octal literal','int main(void){\n  int x=09;\n  return 0;\n}',/8진수/,2],
  ];
  for(const [name,code,pattern,line]of cases)test(name,()=>{
    assert.throws(()=>compileHal(code),e=>{assert.match(e.message,pattern);assert.equal(e.location?.line,line);return true;});
  });
  test('errors inside included headers point at the header file',()=>{
    assert.throws(()=>compileHal('#include "broken.h"\nint main(void){return 0;}',[{name:'broken.h',text:'int broken = ;'}]),e=>e.location.file==='broken.h'&&e.location.line===1);
  });
  test('prepareHalSource validates file names, duplicates and size',()=>{
    assert.throws(()=>prepareHalSource('int main(void){return 0;}',[{name:'../x.c',text:''}]),/올바르지 않습니다/);
    assert.throws(()=>prepareHalSource('',[{name:'a.c',text:''},{name:'a.c',text:''}]),/중복/);
    assert.throws(()=>prepareHalSource('x'.repeat(300001)),/한도/);
    assert.throws(()=>prepareHalSource('',[{name:'a.c',text:'x'.repeat(300001)}]),/300 KB/);
  });
  test('HAL aliases and structs describe real HAL types',()=>{
    assert.equal(HAL_ALIASES.BYTE,'uint8_t');assert.equal(HAL_ALIASES.DWORD,'uint32_t');
    assert.match(HAL_STRUCTS.CAN_HandleTypeDef,/Init:CAN_InitTypeDef/);
  });
  test('pointer subtraction yields the element distance and rejects unrelated arrays',()=>{
    assert.deepEqual(halLines('int v[4]; int *p = v + 2; printf("%d\\n", (int)(p - v));'),['2']);
    assert.deepEqual(halLines('int v[4]; int *p = &v[3]; int d = p - v; printf("%d\\n", d);'),['3']);
    assert.match(halError('int main(void){int v[4]; int w[4]; int *p = v; int *q = w; int d = p - q; while(1){HAL_Delay(10);}}').error.message,/서로 다른 배열/);
  });
});

describe('sketch mode (Arduino-style API)',()=>{
  test('Serial printing formats numbers, bases and characters',()=>{
    const {out}=runSketch("void setup(){Serial.println(3.14159);Serial.println(255,HEX);Serial.println(5,BIN);Serial.println('A');Serial.print(\"a\");Serial.println(\"b\");}void loop(){delay(10);}");
    assert.deepEqual(out,['3.14159','FF','101','65','a','b']);
  });
  test('pinMode/digitalWrite update GPIO state and blink follows delay()',()=>{
    const {runtime}=runSketch('void setup(){pinMode(LED_BUILTIN,OUTPUT);pinMode(D2,INPUT_PULLUP);}void loop(){digitalWrite(LED_BUILTIN,HIGH);delay(100);digitalWrite(LED_BUILTIN,LOW);delay(100);}');
    assert.equal(runtime.gpio.PA10.mode,'INPUT_PULLUP');
    const seen=[];for(const t of [50,150,250,350]){runtime.tick(t);seen.push(runtime.gpio.PA5.value);}assert.deepEqual(seen,[3.3,0,3.3,0]);
  });
  test('millis() advances with delay()',()=>{
    const {runtime,out}=runSketch('void setup(){}void loop(){Serial.println(millis());delay(250);}');runtime.tick(1000);
    const values=out.map(Number);assert.equal(values[0],0);assert.ok(values.length>=4);
    for(let i=1;i<values.length;i++)assert.ok(values[i]-values[i-1]>=250&&values[i]-values[i-1]<=252,String(values));
  });
  test('analogRead scales 0..3.3 V to 12 bits and clamps',()=>{
    const read=v=>runSketch('void setup(){Serial.println(analogRead(A0));}void loop(){delay(10);}',{voltage:()=>v}).out[0];
    assert.equal(read(1.65),'2048');assert.equal(read(5),'4095');assert.equal(read(0),'0');
  });
  test('digitalRead and Serial input come from the host API',()=>{
    assert.deepEqual(runSketch('void setup(){pinMode(D2,INPUT);Serial.println(digitalRead(D2));}void loop(){delay(10);}',{read:()=>1}).out,['1']);
    const bytes=[65,66];assert.deepEqual(runSketch('void setup(){}void loop(){while(Serial.available()>0){Serial.println(Serial.read());}delay(10);}',{ms:20,serialAvailable:()=>bytes.length,serialRead:()=>bytes.shift()??-1}).out,['65','66']);
  });
  test('analogWrite without waveform mode drives the average voltage',()=>{
    const {runtime}=runSketch('void setup(){pinMode(D9,OUTPUT);analogWrite(D9,128);}void loop(){delay(10);}');
    assert.ok(Math.abs(runtime.gpio.PC7.value-3.3*128/255)<1e-9);
  });
  test('timer callbacks run while loop() sleeps and can be cancelled',()=>{
    const {runtime,out}=runSketch('int count=0; int id; void pulse(){count++;Serial.println(millis());if(count==3)Timer.cancel(id);}void setup(){id=Timer.every(10,pulse);}void loop(){delay(1000);}');
    runtime.tick(60);assert.deepEqual(out,['10','20','30']);
  });
  test('edge interrupts fire once per edge and respect noInterrupts()',()=>{
    let level=1;const {runtime,out}=runSketch('void edge(){Serial.println(1);}void setup(){pinMode(D2,INPUT_PULLUP);attachInterrupt(digitalPinToInterrupt(D2),edge,FALLING);}void loop(){delay(100);}',{read:()=>level});
    level=0;runtime.tick(1);runtime.tick(2);assert.deepEqual(out,['1']);
    runtime.call('noInterrupts',[]);level=1;runtime.tick(3);level=0;runtime.tick(4);assert.equal(out.length,1);
    runtime.call('interrupts',[]);runtime.tick(5);assert.equal(out.length,2,'pending edge delivered after re-enabling');
  });
  test('sketch errors: unknown names, unknown functions, missing loop()',()=>{
    assert.throws(()=>runSketch('void setup(){pinMode(D99,OUTPUT);}void loop(){delay(10);}'),/정의되지 않은 이름: D99/);
    assert.throws(()=>runSketch('void setup(){randomSeed(1);}void loop(){delay(10);}'),/지원하지 않는 함수: randomSeed/);
    assert.throws(()=>compile('void setup(){}'),e=>/void loop\(\) 함수를 작성하세요/.test(e.message)&&e.location.line===1);
    assert.throws(()=>compile('void setup(){\n  foo(;\n}\nvoid loop(){}'),e=>e.location.line===2);
    assert.throws(()=>compile('#include <unknown.h>\nvoid loop(){}'),/라이브러리/);
  });
  test('#define values with trailing comments and quoted URLs',()=>{
    assert.deepEqual(runSketch('#define VALUE 42 // 설명\n#define URL "https://example.test"\nvoid setup(){Serial.println(VALUE);Serial.println(URL);}void loop(){delay(100);}').out,['42','https://example.test']);
  });
});

describe('debugger',()=>{
  const sketch='int count=0;\nint add(int x) {\n  int result=x+2;\n  return result;\n}\nvoid loop(){\n  count=add(count);\n  count++;\n  delay(10);\n}';
  const step=(r,mode='into')=>{r.resume(mode);r.tick(r.microTime/1000+100);assert.equal(r.debug.paused,true,'debugger paused after '+mode);};
  test('entry stop, step into a function, inspect locals and frames',()=>{
    const r=new Runtime(compile(sketch),{debug:{entry:true}});r.tick(0);
    assert.equal(r.debug.paused,true);assert.equal(r.location.line,7);assert.equal(r.vars.count,0);
    step(r);assert.equal(r.location.line,3);assert.equal(r.frames.at(-1).name,'add');assert.equal(watchValue(r,'x'),'0');
    step(r);assert.equal(r.location.line,4);
    const info=inspectRuntime(r);assert.deepEqual(info.locals.find(l=>l.name==='result'),{name:'result',type:'int',value:'2'});
    assert.ok(info.globals.some(g=>g.name==='count'));assert.equal(info.frames[0].name,'add');
  });
  test('step out returns to the caller and step over skips calls',()=>{
    const r=new Runtime(compile(sketch),{debug:{entry:true}});r.tick(0);step(r);
    step(r,'out');assert.equal(r.location.line,8);assert.equal(r.vars.count,2);assert.throws(()=>watchValue(r,'result'),/정의되지/);
    step(r,'over');assert.equal(r.location.line,9);assert.equal(r.vars.count,3);
    step(r,'over');assert.equal(r.location.line,7);assert.ok(r.microTime>=10000,'delay elapsed before wrapping to loop() again');
    step(r,'over');assert.equal(r.location.line,8);assert.equal(r.vars.count,5,'over executes add() without stopping inside');
  });
  test('breakpoints stop before the line and time does not advance while paused',()=>{
    const r=new Runtime(compile(sketch),{debug:{breakpoints:['main.c:8']}});r.tick(100);
    assert.equal(r.debug.paused,true);assert.equal(r.location.line,8);assert.equal(r.vars.count,2);assert.equal(r.microTime,0);
    r.tick(999);assert.equal(r.microTime,0);
    r.resume();r.tick(100);assert.equal(r.vars.count,5);assert.equal(r.microTime,11000);
  });
  test('stepping into a function defined in another source file reports that file',()=>{
    const p=compileHal('#include "user.h"\nint main(void){\n  return twice(3);\n}',[{name:'user.h',text:'#pragma once\nint twice(int n);\n'},{name:'user.c',text:'#include "user.h"\nint twice(int n){\n  int x=n*2;\n  return x;\n}'}]);
    const r=new Runtime(p,{debug:{entry:true}});r.tick(0);assert.deepEqual(r.location,{file:'main.c',line:3});step(r);assert.deepEqual(r.location,{file:'user.c',line:3});
  });
  test('watch expressions are read-only',()=>{
    const r=new Runtime(compile('int values[2]={5,9};\nvoid loop(){ delay(10); }'),{debug:{entry:true}});r.tick(0);
    assert.equal(watchValue(r,'values[1]+2'),'11');assert.equal(watchValue(r,'values'),'[5, 9]');
    for(const text of ['values[0]=9','values[0]++','delay(2)','1; values[0]=3','++values[0]','',' '.repeat(3),'x'.repeat(251)])assert.throws(()=>watchValue(r,text),text);
    assert.equal(watchValue(r,'values[0]'),'5');
  });
  test('displayValue renders primitives, arrays, structs and cycles safely',()=>{
    assert.equal(displayValue(3),'3');assert.equal(displayValue('a'),'"a"');assert.equal(displayValue(null),'null');
    const arr={kind:'array',cells:Array.from({length:20},(_,i)=>({value:i}))};assert.match(displayValue(arr),/^\[0, 1, .*15, …\]$/);
    const s={kind:'struct',fields:{}};s.fields.self={value:s};assert.equal(displayValue(s),'{self: …}');
  });
});
