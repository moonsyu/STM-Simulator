// Designated initializers of a member's member (.a.b = value, as FSP writes transfer_info_t: .transfer_settings_word_b.mode
// = …) on the built-in interpreter (STM32 HAL program): the same as .a = { .b = value }, and several .a.… of one list
// fill one .a together; an array of such structures; deeper paths.
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
const TYPES=r`typedef struct { uint8_t mode; uint8_t size; uint8_t irq; } settings_t;
typedef struct { uint8_t x; settings_t deep; } outer_t;
typedef struct { settings_t s; uint16_t length; outer_t outer; } info_t;`;

test('.a.b = value fills a member of a member, and the .a.… of one list fill one .a',()=>{
 assert.deepEqual(run(TYPES+r`
static info_t one = { .s.mode = 2, .s.size = 1, .length = 16, .s.irq = 1 };`,
  r`printf("%d %d %d %d\n", one.s.mode, one.s.size, one.s.irq, one.length);`),['2 1 1 16']);
 // An array of them, and a path three members deep beside a plain member of the same structure.
 assert.deepEqual(run(TYPES+r`
static info_t list[2] = { { .s.mode = 1, .length = 4 }, { .s.mode = 3, .outer.x = 7, .outer.deep.size = 4, .outer.deep.irq = 5, .length = 8 } };`,
  r`printf("%d %d %d %d %d %d %d\n", list[0].s.mode, list[0].length, list[1].s.mode, list[1].outer.x, list[1].outer.deep.size, list[1].outer.deep.irq, list[1].length);`),['1 4 3 7 4 5 8']);
 // .a = { … } as before.
 assert.deepEqual(run(TYPES+r`
static info_t plain = { .s = { .mode = 9, .size = 8 }, .length = 1 };`,r`printf("%d %d %d\n", plain.s.mode, plain.s.size, plain.length);`),['9 8 1']);
});
