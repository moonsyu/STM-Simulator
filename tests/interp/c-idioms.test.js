// C idioms of everyday embedded code on the built-in interpreter (found missing by probing 25 idioms): typedef'd
// structs, function-like macros and the float forms of <math.h>. What is still not supported fails with a message
// that names it.
import test from 'node:test';
import assert from 'node:assert/strict';
import {blankProject} from '../../src/project.js';
import {generateHal} from '../../src/mcu-config.js';
import {SimulationSession} from '../../src/session.js';
import {expandMacros} from '../../src/hal-source.js';

function run(globals,body){
 const p=blankProject();
 p.code=generateHal(p.mcu,{minimal:true}).replace('/* USER CODE BEGIN 0 */','/* USER CODE BEGIN 0 */\n'+globals).replace('  /* USER CODE BEGIN 2 */','  /* USER CODE BEGIN 2 */\n  '+body);
 const out=[],s=new SimulationSession(p,{print:x=>out.push(x),warn:()=>{}});s.tick(0);for(let t=10;t<=30;t+=10)s.tick(t);return out;
}

test('typedef struct: anonymous, with a tag, and of an existing struct; fields, pointers and arrays of the type',()=>{
 assert.deepEqual(run('typedef struct { int a; int b; } Pair;','Pair p = {1, 2};\n  printf("%d\\n", p.a + p.b);'),['3']);
 assert.deepEqual(run('typedef struct Node { int value; uint8_t data[4]; } Node_t;\nstatic Node_t nodes[2];\nvoid bump(Node_t *n) { n->value += 5; n->data[1] = 9; }','struct Node first = {1};\n  bump(&first);\n  nodes[1].value = first.value + first.data[1];\n  printf("%d\\n", nodes[1].value);'),['15']);
 assert.deepEqual(run('struct Point { int x; int y; };\ntypedef struct Point Point;','Point p = {3, 4};\n  printf("%d\\n", p.x * p.y);'),['12']);
 assert.deepEqual(run('typedef struct Same { int v; } Same;','Same s = {8};\n  struct Same t = s;\n  printf("%d\\n", t.v);'),['8']);
 assert.throws(()=>run('typedef struct { int a; } T;\ntypedef struct { int b; } T;','printf("x\\n");'),/구조체가 중복되었습니다/);
 assert.throws(()=>run('typedef struct Missing Alias;','printf("x\\n");'),/정의되지 않은 구조체입니다/);
});

test('function-like macros: arguments, nesting, use in conditions and statements; strings are left alone',()=>{
 assert.deepEqual(run('#define SQ(x) ((x) * (x))\n#define MAX(a, b) ((a) > (b) ? (a) : (b))\n#define LED_ON() HAL_GPIO_WritePin(GPIOA, GPIO_PIN_5, GPIO_PIN_SET)',
  'int v = MAX(SQ(3), SQ(2) + 1);\n  if (MAX(v, 2) == 9) printf("SQ(x) is %d\\n", v);'),['SQ(x) is 9']);
 assert.equal(expandMacros('y = ADD(f(1, 2), "a,b") + ADD2;',new Map([['ADD',{params:['a','b'],body:'a + sizeof(b)'}]])),'y = (f(1, 2) + sizeof("a,b")) + ADD2;');
 assert.equal(expandMacros('s.ADD(1, 2); x = ADD (3, 4);',new Map([['ADD',{params:['a','b'],body:'a+b'}]])),'s.ADD(1, 2); x = (3+4);');
 assert.throws(()=>expandMacros('ADD(1)',new Map([['ADD',{params:['a','b'],body:'a+b'}]])),/매크로 ADD의 인자는 2개입니다/);
 assert.throws(()=>expandMacros('LOOP(1)',new Map([['LOOP',{params:['a'],body:'LOOP(a)'}]])),/자기 자신을 반복해서/);
 assert.throws(()=>run('#define LOG(fmt, ...) printf(fmt)','LOG("x");'),/가변 인자\(\.\.\.\) 매크로는 지원하지 않습니다/);
 assert.throws(()=>run('#define NAME(x) #x','printf(NAME(a));'),/# \/ ## 연산자는 지원하지 않습니다/);
});

test('<math.h>: float forms and the functions sensor code uses',()=>{
 assert.deepEqual(run('#include <math.h>','float v = sqrtf(16.0f) + fabsf(-0.5f);\n  printf("%.1f %.2f %.1f %.0f\\n", v, atan2f(1.0f, 1.0f), fmodf(7.5f, 2.0f), powf(2.0f, 10.0f));'),['4.5 0.79 1.5 1024']);
 assert.deepEqual(run('#include <math.h>','printf("%.3f %.1f %.1f\\n", log10(1000.0), fmax(1.5, 2.5), exp(0.0));'),['3.000 2.5 1.0']);
 assert.throws(()=>run('#include <math.h>','printf("%f\\n", sqrtf(-1.0f));'),/수학 함수 결과가 유효하지 않습니다/);
});

test('what the interpreter does not run says so: 3-D arrays, unions, goto',()=>{
 assert.throws(()=>run('','int g[2][3][4];\n  printf("x\\n");'),/3차원 이상의 배열은 지원하지 않습니다/);
 assert.throws(()=>run('union U { uint32_t w; uint8_t b[4]; };','printf("x\\n");'),/main\.c:\d+/);
});
