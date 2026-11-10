// union on the built-in interpreter: members share their bytes (little-endian, a float as its IEEE 754 bits) — the word
// and its bytes, a float and its bits, two bytes and their 16-bit value; initializers, copies, a union as a struct
// field, through a pointer, in an array.
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

test('a word and its bytes, a float and its bits, two bytes and their value; the size is the largest member',()=>{
 assert.deepEqual(run(r`typedef union { uint32_t w; uint8_t b[4]; } U;`,r`U u; u.w = 0x01020304; printf("%d %d %d %d %d\n", u.b[0], u.b[1], u.b[2], u.b[3], (int)sizeof(u)); u.b[3] = 0xFF; printf("%08lX\n", u.w); u.w = 5; u.w += 1; u.w *= 2; printf("%lu %d\n", u.w, u.b[0]);`),['4 3 2 1 4','FF020304','12 12']);
 assert.deepEqual(run(r`typedef union { float f; uint32_t bits; uint8_t raw[4]; } F;
union Pair { uint16_t v; uint8_t lo_hi[2]; };
typedef union { int16_t s; uint16_t u; } S;`,r`F x; x.f = 1.0f; printf("%08lX %02X\n", x.bits, x.raw[3]); x.bits = 0x40490FDB; union Pair p; p.lo_hi[0] = 0x34; p.lo_hi[1] = 0x12; S v; v.u = 0xFFFE; printf("%.4f %04X %d %d %u\n", x.f, p.v, (int)sizeof(union Pair), v.s, v.u);`),['3F800000 3F','3.1416 1234 2 -2 65534']);
});

test('initializers (first member, a designated one), copies, a union field of a struct, a pointer, an array, memset',()=>{
 assert.deepEqual(run(r`typedef union { uint32_t w; uint8_t b[4]; } U;
static U g = { 0x0A0B0C0D };
static U d = { .b = {1, 2, 3, 4} };
typedef struct { uint8_t id; U data; } Msg;`,r`U c = g; c.b[0] = 0; Msg m = {7}; m.data.w = 0xAABBCCDD; printf("%08lX %08lX %08lX %d %02X %d\n", g.w, c.w, d.w, m.id, m.data.b[0], (int)sizeof(Msg));`),['0A0B0C0D 0A0B0C00 04030201 7 DD 8']);
 assert.deepEqual(run(r`typedef union { uint32_t w; uint8_t b[4]; } U;
static void swap(U *u) { uint8_t t = u->b[0]; u->b[0] = u->b[3]; u->b[3] = t; t = u->b[1]; u->b[1] = u->b[2]; u->b[2] = t; }`,r`U a[2]; a[1].w = 0x11223344; swap(&a[1]); uint32_t sw = a[1].w; memset(a, 0, sizeof(a)); printf("%08lX %lu %d\n", sw, a[1].w, (int)sizeof(a));`),['44332211 0 8']);
});

test('a union written inside a struct, or with a struct member, is refused with the reason; structs are unchanged',()=>{
 assert.throws(()=>run(r`typedef struct { union { uint32_t w; uint8_t b[4]; }; } A;`,'printf("x\\n");'),/구조체 안에 직접 쓴 union은 지원하지 않습니다/);
 assert.throws(()=>run(r`typedef struct { uint8_t a; } In;
typedef union { In i; uint8_t b; } Bad;`,'printf("x\\n");'),/union의 멤버는 숫자형과 그 배열만 지원합니다/);
 assert.deepEqual(run(r`typedef struct { uint32_t w; uint8_t b[4]; } S;`,r`S s = {1, {2}}; s.w = 9; printf("%lu %d %d\n", s.w, s.b[0], (int)sizeof(s));`),['9 2 8']);
});
