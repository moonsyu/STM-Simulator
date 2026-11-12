// Feature 23: contact bounce of buttons. With simulation.bounceMs set, one press is several edges for a few
// milliseconds; code without a debounce counts them all, code with one counts a single press.
import test from 'node:test';
import assert from 'node:assert/strict';
import {blankProject,validateProject} from '../../src/project.js';
import {generateHal,validateMcu} from '../../src/mcu-config.js';
import {SimulationSession} from '../../src/session.js';
import {ButtonBounce,BOUNCE_MS} from '../../src/button-bounce.js';

test('ButtonBounce: flips once a millisecond for bounceMs, ending in the new state; off by default',()=>{
 const off=new ButtonBounce();assert.deepEqual(off.press({},{USER:true},10),{USER:true});assert.equal(off.nextAt(),Infinity);
 const b=new ButtonBounce(5);let pressed=b.press({},{USER:true},100);assert.deepEqual(pressed,{USER:true});assert.equal(b.nextAt(),101);
 const seen=[];for(let t=100.5;t<=106;t+=0.5){const next=b.apply(pressed,t);if(next){pressed=next;seen.push([t,!!pressed.USER]);}}
 assert.deepEqual(seen,[[101,false],[102,true],[103,false],[104,true]]);assert.equal(b.nextAt(),Infinity);
 // A release in the middle of the bounce starts over from the released state.
 const c=new ButtonBounce(5);let p=c.press({},{USER:true},0);p=c.apply(p,1);p=c.press(p,{},1.5);assert.equal(c.nextAt(),2.5);
 const tail=[];for(let t=2;t<=8;t+=0.5){const n=c.apply(p,t);if(n){p=n;tail.push(!!p.USER);}}assert.deepEqual(tail,[true,false,true,false]);
 // Every time on the list bounces, the shortest one too (2 ms once gave no flip at all), and ends pressed within it.
 for(const ms of BOUNCE_MS.filter(Boolean)){const x=new ButtonBounce(ms);let q=x.press({},{USER:true},0),flips=0,last=0;while(x.nextAt()<Infinity){last=x.nextAt();q=x.apply(q,last);flips++;}assert.ok(flips>=2&&flips%2===0&&last<=ms,`${ms} ms: ${flips} flips, last at ${last}`);assert.deepEqual(q,{USER:true},`${ms} ms ends pressed`);}
 assert.deepEqual([...BOUNCE_MS],[0,2,5,10,20]);assert.equal(new ButtonBounce(7).ms,0,'an unknown time is off');
});

test('the project keeps the bounce time; an unknown one is refused',()=>{
 const p=blankProject();p.simulation={stepMs:1,pwmWaveform:false,bounceMs:10};assert.equal(validateProject(p).simulation.bounceMs,10);
 p.simulation.bounceMs=0;assert.equal(validateProject(p).simulation.bounceMs,undefined);
 p.simulation.bounceMs=3;assert.throws(()=>validateProject(p),/버튼 채터링 시간/);
});

const pin=(fn,label='')=>({function:fn,pull:'NOPULL',edge:'FALLING',label,initial:0});
function run(bounceMs,globals,loop=''){
 const p=blankProject();p.mcu.peripherals={};p.mcu.pins={PC13:pin('GPIO_EXTI','B1'),PA5:pin('GPIO_Output','LD2')};p.mcu.nvic={EXTI15_10_IRQn:{enabled:true,priority:5}};p.mcu=validateMcu(p.mcu);
 p.simulation={stepMs:1,pwmWaveform:false,...(bounceMs?{bounceMs}:{})};
 p.code=generateHal(p.mcu,{minimal:true}).replace('/* USER CODE BEGIN 0 */','/* USER CODE BEGIN 0 */\n'+globals).replace('    /* USER CODE BEGIN 3 */','    /* USER CODE BEGIN 3 */\n    '+loop);
 const out=[],s=new SimulationSession(validateProject(p),{print:x=>out.push(x),warn:()=>{}});s.tick(0);
 for(let t=10;t<=400;t+=10){if(t===100)s.setPressed({USER:true});if(t===200)s.setPressed({});s.tick(t);}
 return out;
}
const r=String.raw;
const COUNT=r`volatile int presses;
void HAL_GPIO_EXTI_Callback(uint16_t GPIO_Pin) { if (GPIO_Pin == B1_Pin) presses++; }`;
const REPORT=r`static int shown = -1; if (HAL_GetTick() >= 350 && shown != presses) { shown = presses; printf("presses=%d\n", presses); }`;

test('an edge interrupt counts every flip of one press: 1 clean, 2 with 5 ms of bounce, 5 with 10 ms',()=>{
 assert.deepEqual(run(0,COUNT,REPORT),['presses=1']);
 // B1 pulls PC13 low when pressed: falling edges at the press and at each re-closing of the contact; the release
 // bounces too and adds its own falling edges.
 const five=Number(run(5,COUNT,REPORT)[0].split('=')[1]),ten=Number(run(10,COUNT,REPORT)[0].split('=')[1]);
 assert.ok(five>1&&ten>five,`5 ms: ${five}, 10 ms: ${ten}`);
});

test('a debounce (the level must hold for 30 ms before it counts) brings it back to one press',()=>{
 const debounced=r`volatile int presses; static uint8_t stable = 1, last = 1; static uint32_t since;`;
 const poll=r`uint8_t now = HAL_GPIO_ReadPin(B1_GPIO_Port, B1_Pin); if (now != last) { last = now; since = HAL_GetTick(); } else if (now != stable && HAL_GetTick() - since >= 30) { stable = now; if (stable == GPIO_PIN_RESET) presses++; } HAL_Delay(1); `;
 assert.deepEqual(run(10,debounced,poll+REPORT),['presses=1']);
 // The same polling without the wait counts the bounces.
 const naive=r`volatile int presses; static uint8_t last = 1;`,edge=r`uint8_t now = HAL_GPIO_ReadPin(B1_GPIO_Port, B1_Pin); if (now != last) { last = now; if (now == GPIO_PIN_RESET) presses++; } `;
 assert.ok(Number(run(10,naive,edge+REPORT)[0].split('=')[1])>1);
 assert.deepEqual(run(0,naive,edge+REPORT),['presses=1']);
});
