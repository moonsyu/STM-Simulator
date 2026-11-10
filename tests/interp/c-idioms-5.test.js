// Designated initializers on the built-in interpreter: .field = value in a struct (in any order, nested, in arrays of
// structs, for HAL init structs) and [index] = value in an array; what follows a designator continues from it.
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

test('.field = value: any order, the rest zero, a plain value after one goes to the next field',()=>{
 assert.deepEqual(run(r`typedef struct { int a; int b; int c; } D;`,r`D d = { .b = 2, .a = 1 }; D e = { .b = 5, 6 }; printf("%d %d %d | %d %d %d\n", d.a, d.b, d.c, e.a, e.b, e.c);`),['1 2 0 | 0 5 6']);
 assert.deepEqual(run(r`typedef struct { const char *name; uint16_t pin; uint8_t on; } Led;
static const Led led = { .name = "LD2", .pin = GPIO_PIN_5, .on = 1 };
typedef struct { int id; int v; } T;
static T t[] = { { .id = 1, .v = 10 }, { .v = 20, .id = 2 } };`,r`printf("%s %d %d %d %d %d\n", led.name, led.pin, led.on, t[0].v + t[1].v, t[1].id, (int)(sizeof(t) / sizeof(t[0])));`),['LD2 32 1 30 2 2']);
 assert.deepEqual(run(r`typedef struct { int x; int y; } P;
typedef struct { P pos; int z; uint8_t tag[3]; } Q;`,r`Q q = { .pos = { .y = 4 }, .z = 9, .tag = {1, 2} }; GPIO_InitTypeDef g = { .Pin = GPIO_PIN_5, .Mode = GPIO_MODE_OUTPUT_PP, .Pull = GPIO_NOPULL }; printf("%d %d %d %d %d\n", q.pos.x, q.pos.y, q.z, q.tag[1], (int)g.Pin);`),['0 4 9 2 32']);
});

test('[index] = value: tables keyed by an enum, gaps are zero, the size follows the largest index',()=>{
 assert.deepEqual(run(r`enum { RED, GREEN, BLUE, COLORS };
static const char *names[COLORS] = { [BLUE] = "blue", [RED] = "red" };
static int lut[8] = { [2] = 20, 30, [7] = 70 };`,r`int a[] = { [3] = 1 }; printf("%s %s %d %d %d %d %d\n", names[RED], names[BLUE], lut[2], lut[3], lut[7], lut[0], (int)(sizeof(a) / sizeof(a[0])));`),['red blue 20 30 70 0 4']);
});

test('a designator of the wrong kind or an unknown field is named; plain lists are unchanged',()=>{
 assert.throws(()=>run(r`typedef struct { int a; } D;`,r`D d = { .zz = 1 };`),/구조체 필드가 없습니다: zz/);
 assert.throws(()=>run(r`typedef struct { int a; } D;`,r`D d = { [0] = 1 };`),/구조체 초기값에는 \.필드 = 값 형식/);
 assert.throws(()=>run('',r`int a[2] = { .x = 1 };`),/배열 초기값에는 \[번호\] = 값 형식/);
 assert.throws(()=>run(r`typedef struct { int a; int b; } D;`,r`D d = { .b = 1, 2 };`),/구조체 초기값이 너무 많습니다/);
 assert.throws(()=>run('',r`int a[2] = { [5] = 1 };`),/배열 크기 또는 초기값 개수/);
 assert.deepEqual(run(r`typedef struct { int a; int b; } D;`,r`D d = {1, 2}; int v[3] = {4, 5}; D z = {0}; printf("%d %d %d\n", d.b, v[1] + v[2], z.b);`),['2 5 0']);
});
