// Pointers and layouts on the built-in interpreter (STM32 HAL program): &p[i] of a pointer that does not start at
// element 0; enum sizes as ARM GCC gives them (short enums) in sizeof and in a structure's bytes.
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

test('&p[i] is p + i: a pointer moved into an array keeps its position',()=>{
 assert.deepEqual(run(r`static uint8_t buf[8] = { 1, 2, 3, 4, 5, 6, 7, 8 };`,
  r`uint8_t *p = buf + 4; uint8_t *q = &p[1]; uint8_t *z = &p[0]; p++; uint8_t *w = &p[-2]; printf("%d %d %d %d %d\n", *q, *z, *w, (int)(q - buf), &p[2] == &buf[7]);`),['6 5 4 5 1']);
 // An array itself and a pointer at element 0 are unchanged.
 assert.deepEqual(run(r`static uint16_t v[4] = { 10, 20, 30, 40 };`,r`uint16_t *a = &v[2]; uint16_t *b = v; uint16_t *c = &b[3]; printf("%d %d\n", *a, *c);`),['30 40']);
});

test('an enum takes the bytes ARM GCC gives it (the smallest of 1, 2, 4 for its values): sizeof, a structure, its bytes',()=>{
 // arm-none-eabi-gcc -mcpu=cortex-m4 / cortex-m33: 1 1 2 4 2.
 assert.deepEqual(run(r`typedef enum { A = 1, B = 2 } small_t;
typedef enum { C = -1, D = 100 } neg_t;
enum mid { E = 0, F = 300 };
typedef enum { G = 0, H = 70000 } big_t;
typedef enum { I = -200, J = 0 } negmid_t;
typedef small_t again_t;
typedef struct { uint8_t on; small_t mode; enum mid level; neg_t sign; uint32_t big; } mix_t;`,
 r`printf("%d %d %d %d %d %d %d\n", (int)sizeof(small_t), (int)sizeof(neg_t), (int)sizeof(enum mid), (int)sizeof(big_t), (int)sizeof(negmid_t), (int)sizeof(again_t), (int)sizeof(mix_t));
  mix_t m = { 1, B, F, C, 7 }; uint8_t raw[12]; memcpy(raw, &m, sizeof(m));
  printf("%02X %02X %02X %02X %02X %02X\n", raw[0], raw[1], raw[2], raw[3], raw[4], raw[6]);
  mix_t back; memcpy(&back, raw, sizeof(back)); printf("%d %d %d %lu\n", back.mode, back.level, back.sign, back.big);`),
 ['1 1 2 4 2 1 12','01 02 2C 01 FF 00','2 300 -1 7']);
});
