// Function pointers on the built-in interpreter: handler tables, a variable that is reassigned, a callback parameter,
// a typedef, a struct field, (*fn)(…) and &function, a state machine stepping through a table.
import test from 'node:test';
import assert from 'node:assert/strict';
import {blankProject} from '../../src/project.js';
import {generateHal} from '../../src/mcu-config.js';
import {SimulationSession} from '../../src/session.js';

function run(globals,body){
 const p=blankProject();
 p.code=generateHal(p.mcu,{minimal:true}).replace('/* USER CODE BEGIN 0 */','/* USER CODE BEGIN 0 */\n'+globals).replace('  /* USER CODE BEGIN 2 */','  /* USER CODE BEGIN 2 */\n  '+body);
 const out=[],s=new SimulationSession(p,{print:x=>out.push(x),warn:()=>{}});s.tick(0);for(let t=10;t<=30;t+=10)s.tick(t);return out;
}
const r=String.raw;

test('a table of handlers, a variable that is reassigned, NULL compared',()=>{
 assert.deepEqual(run(r`static void a(void) { printf("a\n"); }
static void b(void) { printf("b\n"); }
static void (*const tbl[])(void) = { a, b };`,r`tbl[1](); tbl[0](); printf("%d\n", (int)(sizeof(tbl) / sizeof(tbl[0])));`),['b','a','2']);
 assert.deepEqual(run(r`static int twice(int v) { return v * 2; }
static int neg(int v) { return -v; }
static int (*op)(int) = twice;`,r`int x = op(4); op = neg; int y = op(4); int (*none)(int) = NULL; printf("%d %d %d %d\n", x, y, none == NULL, op != NULL);`),['8 -4 1 1']);
});

test('a callback parameter through a typedef, &function and (*fn)(…), a struct field, a state table',()=>{
 assert.deepEqual(run(r`typedef void (*Handler)(int);
static int total;
static void add(int v) { total += v; }
static void each(const int *v, int n, Handler h) { for (int i = 0; i < n; i++) h(v[i]); }`,r`int v[3] = {1, 2, 3}; each(v, 3, add); Handler h = &add; (*h)(10); printf("%d\n", total);`),['16']);
 assert.deepEqual(run(r`typedef struct { const char *name; void (*run)(void); } Cmd;
static void on(void) { printf("on\n"); }
static void off(void) { printf("off\n"); }
static const Cmd cmds[] = { {"on", on}, { .name = "off", .run = off } };`,r`for (unsigned i = 0; i < 2; i++) if (strcmp(cmds[i].name, "off") == 0) cmds[i].run(); const Cmd *c = &cmds[0]; c->run();`),['off','on']);
 assert.deepEqual(run(r`typedef enum { S_A, S_B, S_END } St;
static St fa(void) { return S_B; }
static St fb(void) { return S_END; }
static St (*const step[])(void) = { fa, fb };`,r`St s = S_A; int n = 0; while (s != S_END) { s = step[s](); n++; } printf("%d\n", n);`),['2']);
});

test('a NULL function pointer is not called silently; if (cb) cb(); guards it',()=>{
 assert.throws(()=>run(r`static void (*cb)(void);`,r`cb();`),/NULL 함수 포인터를 호출했습니다/);
 assert.throws(()=>run(r`static void (*tbl[2])(void);`,r`tbl[1]();`),/NULL 함수 포인터를 호출했습니다/);
 assert.throws(()=>run('',r`int v = 3; v();`),/지원하지 않는 함수: v/);
 assert.deepEqual(run(r`static void hi(void) { printf("hi\n"); }
static void (*cb)(void);`,r`if (cb) cb(); cb = hi; if (cb) cb();`),['hi']);
});
