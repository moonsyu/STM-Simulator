// Pointers on the built-in interpreter (STM32 HAL program): &p[i] of a pointer that does not start at element 0.
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
