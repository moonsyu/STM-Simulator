// A second round of everyday C idioms on the built-in interpreter (probing 64 of them found these missing or wrong):
// the comma operator, #if expressions and #elif, several struct fields in one declaration, <stdlib.h>, sizeof of an
// array of pointers. What is still not supported fails with a message that names it.
import test from 'node:test';
import assert from 'node:assert/strict';
import {blankProject} from '../../src/project.js';
import {generateHal} from '../../src/mcu-config.js';
import {SimulationSession} from '../../src/session.js';
import {evalCondition} from '../../src/hal-source.js';

function run(globals,body){
 const p=blankProject();
 p.code=generateHal(p.mcu,{minimal:true}).replace('/* USER CODE BEGIN 0 */','/* USER CODE BEGIN 0 */\n'+globals).replace('  /* USER CODE BEGIN 2 */','  /* USER CODE BEGIN 2 */\n  '+body);
 const out=[],s=new SimulationSession(p,{print:x=>out.push(x),warn:()=>{}});s.tick(0);for(let t=10;t<=30;t+=10)s.tick(t);return out;
}
const r=String.raw;

test('the comma operator in for (init and step) and in an expression statement',()=>{
 assert.deepEqual(run('',r`int i, j; for (i = 0, j = 10; i < j; i++, j--) ; printf("%d %d\n", i, j);`),['5 5']);
 assert.deepEqual(run('',r`int a, b; a = 1, b = a + 1; printf("%d\n", a + b);`),['3']);
 // A comma between arguments and initializers is still a separator.
 assert.deepEqual(run('int add(int a, int b) { return a + b; }',r`int v[2] = {1, 2}; printf("%d\n", add(v[0], v[1]));`),['3']);
});

test('#if with comparisons, defined(), && / || / !, macro values; #elif picks the first branch that holds',()=>{
 const defs=new Map([['MODE','2'],['A','1'],['EMPTY',''],['WIDE','(MODE + 1)'],['HEX','0x10U']]);
 for(const [text,want] of [['MODE == 2',true],['MODE > 2',false],['defined(A) && !defined(B)',true],['defined A || defined B',true],['defined(B)',false],
  ['WIDE * 2 == 6',true],['HEX >> 4',true],['UNKNOWN',false],['EMPTY',true],['(MODE & 1) ? 0 : 1',true],['!MODE',false],['1 - 1',false],['MODE >= 1 && MODE <= 3',true]])
  assert.equal(evalCondition(text,defs),want,text);
 for(const text of ['MODE ==','(1','1 / 0','"text"','MODE @ 2'])assert.throws(()=>evalCondition(text,defs),/#if 조건식은 지원하지 않습니다/,text);
 const pick=mode=>run(`#define MODE ${mode}\n#if MODE == 1\nstatic int v = 10;\n#elif MODE == 2\nstatic int v = 20;\n#elif MODE == 3\nstatic int v = 30;\n#else\nstatic int v = 99;\n#endif`,r`printf("%d\n", v);`);
 assert.deepEqual([1,2,3,4].map(m=>pick(m)[0]),['10','20','30','99']);
 // A skipped block may hold a condition (or an #elif) that would not evaluate.
 assert.deepEqual(run('#if 0\n#if "x"\n#elif 1\nstatic int v = 1;\n#endif\n#else\nstatic int v = 2;\n#endif',r`printf("%d\n", v);`),['2']);
 assert.throws(()=>run('#if 1\n#else\n#elif 1\n#endif','printf("x\\n");'),/#elif 위치 오류/);
});

test('struct fields declared together (int x, y;), nested structs copied by value',()=>{
 assert.deepEqual(run('typedef struct { int x, y; uint8_t r, g, b; } P;\ntypedef struct { P a; P b; } Box;',r`Box b = { {1, 2, 3, 4, 5}, {6, 7} }; Box c = b; c.b.y = 9; printf("%d %d %d\n", b.b.y, c.a.x + c.b.y, b.a.g + b.a.b);`),['7 10 9']);
});

test('<stdlib.h>: abs, atoi and rand / srand',()=>{
 assert.deepEqual(run('#include <stdlib.h>',r`printf("%d %d %d %d\n", abs(-5), atoi("42") + 1, atoi("  -7x"), atoi("x"));`),['5 43 -7 0']);
 const twice=run('#include <stdlib.h>',r`srand(7); int a = rand(); int b = rand(); srand(7); printf("%d %d\n", a == rand() && b == rand(), a >= 0 && a <= 32767 && a != b);`);
 assert.deepEqual(twice,['1 1']);
});

test('sizeof of an array of pointers counts pointers',()=>{
 assert.deepEqual(run('static const char *names[] = {"red", "green", "blue"};',r`const char *s = names[1]; printf("%d %d %c %s\n", (int)sizeof(names), (int)(sizeof(names) / sizeof(names[0])), s[1], names[2]);`),['12 3 r blue']);
});

test('what is not supported is named: 64-bit integers, union, designated initializers',()=>{
 assert.throws(()=>run('',r`uint64_t big = 5; printf("%d\n", (int)big);`),/64비트 정수형\(uint64_t, int64_t\)은 지원하지 않습니다/);
 assert.throws(()=>run('typedef union { uint32_t w; uint8_t b[4]; } U;','printf("x\\n");'),/union은 지원하지 않습니다/);
 assert.throws(()=>run('typedef struct { int a; int b; } D;',r`D d = { .b = 2, .a = 1 }; printf("%d\n", d.a);`),/지정 초기화/);
});
