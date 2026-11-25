// Feature 57: a GPIO output the program switches faster than the screen is drawn is shown with its duty — an LED on it
// is dimmer, as on a real board, instead of flickering with the level the pin had when the frame was drawn. A slow
// blink stays a blink. The measuring is in Rust (rust/stm-core/src/duty.rs); here: the built-in interpreters (STM32
// HAL and FSP). The emulator is in tests/toolchain/pin-duty.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import {applyHalExample} from '../../src/hal-examples.js';
import {blankProject,projectForBoard,validateProject} from '../../src/project.js';
import {SimulationSession} from '../../src/session.js';
import {RA_EXAMPLES} from '../../src/ra-examples.js';
import {PinDuty,shownResult} from '../../src/pin-duty.js';
import {ledShade} from '../../src/render.js';

const LOOP=/(\/\* USER CODE BEGIN 3 \*\/)[\s\S]*?(\/\* USER CODE END 3 \*\/)/;
const blink=body=>{const p=validateProject(applyHalExample(blankProject(),'blink'));assert.match(p.code,LOOP);p.code=p.code.replace(LOOP,(_,a,b)=>a+'\n'+body+'\n'+b);return p;};
// What each frame shows of the external LED (mA) and of PA5 (V), frames 20 ms apart.
function frames(p,end=400,step=20){
 const s=new SimulationSession(p,{print(){}}),seen=[];
 for(let t=0;t<=end;t+=step){const r=s.tick(t),led=Object.values(r.parts).find(x=>x.led);seen.push({on:led.on,mA:led.current*1000,pa5:r.voltage('signal:PA5'),own:s.result.voltage('signal:PA5')});}
 return seen;
}
const FULL=3.73; // mA through the example's LED with PA5 HIGH

test('STM32 HAL interpreter: a pin HIGH a quarter of the time lights the LED at a quarter, in every frame',()=>{
 const seen=frames(blink('    HAL_GPIO_WritePin(GPIOA, GPIO_PIN_5, GPIO_PIN_SET);\n    HAL_Delay(1);\n    HAL_GPIO_WritePin(GPIOA, GPIO_PIN_5, GPIO_PIN_RESET);\n    HAL_Delay(3);')).slice(2);
 for(const f of seen){
  assert.equal(f.on,true);assert.ok(f.mA>FULL*0.2&&f.mA<FULL*0.3,`LED current ${f.mA} mA`);
  // The pin's voltage on screen is its average (the on-board LD2 is drawn from it: dimmer, not off or full).
  assert.ok(f.pa5>0.6&&f.pa5<1.1,`PA5 shown at ${f.pa5} V`);
  const shade=ledShade(f.pa5);assert.notEqual(shade.fill,ledShade(0).fill);assert.notEqual(shade.fill,ledShade(3.3).fill);
  // The program itself reads the pin as it is: LOW or HIGH.
  assert.ok(f.own<0.2||f.own>3,`the circuit the program reads: ${f.own} V`);
 }
});

test('a slow blink stays a blink: every frame shows the LED fully on or off',()=>{
 for(const [delay,changes]of [[500,0],[100,3],[25,10]]){
  const seen=frames(blink(`    HAL_GPIO_TogglePin(GPIOA, GPIO_PIN_5);\n    HAL_Delay(${delay});`));
  for(const f of seen)assert.ok(f.mA<0.01||Math.abs(f.mA-FULL)<0.05,`HAL_Delay(${delay}): ${f.mA} mA`);
  const flips=seen.filter((f,i)=>i&&f.on!==seen[i-1].on).length;assert.ok(flips>=changes,`HAL_Delay(${delay}): ${flips} changes seen`);
 }
 // In one large step too (a second as one frame): 1 Hz is not averaged.
 const s=new SimulationSession(blink('    HAL_GPIO_TogglePin(GPIOA, GPIO_PIN_5);\n    HAL_Delay(500);'),{print(){}});s.tick(0);
 const led=Object.values(s.tick(1200).parts).find(x=>x.led);assert.ok(led.current<1e-5||Math.abs(led.current*1000-FULL)<0.05);
});

test('FSP interpreter (FPB-RA6E1): LED1 switched every millisecond is shown at its duty; 500 ms stays a blink',()=>{
 const ra=RA_EXAMPLES.find(e=>e.id==='ra_blink'),project=code=>validateProject({...projectForBoard('fpb-ra6e1'),mcu:ra.mcu(),code});
 const shown=(code,end=400)=>{const s=new SimulationSession(project(code),{print(){}}),out=[];for(let t=0;t<=end;t+=20)out.push(s.tick(t).voltage('signal:P408'));return out;};
 assert.match(ra.code,/R_BSP_SoftwareDelay\(500, BSP_DELAY_UNITS_MILLISECONDS\);/);
 const fast=shown(ra.code.replace('R_BSP_SoftwareDelay(500, BSP_DELAY_UNITS_MILLISECONDS);','R_BSP_SoftwareDelay(1, BSP_DELAY_UNITS_MILLISECONDS);').replace('R_BSP_SoftwareDelay(500, BSP_DELAY_UNITS_MILLISECONDS);','R_BSP_SoftwareDelay(3, BSP_DELAY_UNITS_MILLISECONDS);')).slice(2);
 const high=Math.max(...shown(ra.code,300));
 for(const v of fast)assert.ok(v>high*0.2&&v<high*0.3,`LED1 pin shown at ${v} V of ${high} V`);
 const slow=shown(ra.code,1200);
 for(const v of slow)assert.ok(v<0.1||Math.abs(v-high)<0.05,`500 ms blink: ${v} V`);
 assert.ok(slow.some(v=>v<0.1)&&slow.some(v=>v>high-0.05));
});

test('the tracker: what a frame shows of the pins, and what is left alone',()=>{
 const d=new PinDuty(),gpio={PA5:{mode:'OUTPUT',value:0},PA6:{mode:'OUTPUT',value:3.3},PA7:{mode:'OUTPUT',value:1.65,pwm:{duty:0.5,frequency:1000}}};
 for(let us=0;us<20000;us+=1000){d.level('PA5',us,3.3);d.level('PA5',us+500,0);}
 d.level('PA6',100,3.3);
 const view=d.frame(gpio,20000);
 assert.deepEqual(Object.keys(view),['PA5','PA6','PA7']);assert.equal(view.PA6,gpio.PA6,'a steady pin is untouched');assert.equal(view.PA7,gpio.PA7,'a timer PWM pin keeps its own duty');
 assert.equal(view.PA5.mode,'OUTPUT');assert.ok(Math.abs(view.PA5.pwm.duty-0.5)<0.01);assert.ok(Math.abs(view.PA5.value-1.65)<0.05);assert.ok(Math.abs(view.PA5.pwm.frequency-1000)<60);
 assert.equal(gpio.PA5.pwm,undefined,'the session\'s own states are not changed');
 // The next frame without a change: nothing is averaged.
 assert.equal(d.frame(gpio,40000),null);
 // A pin that became a timer output is not measured.
 for(let us=40000;us<60000;us+=1000){d.level('PA5',us,3.3);d.level('PA5',us+500,0);}
 d.clear('PA5',60000);assert.equal(d.frame(gpio,60000),null);
 // What a frame shows keeps what the session added to its result.
 // What a frame shows: the electrical reading of every part and whether an LED is lit; a device's own state (a servo's
 // angle, a display's contents, its `on`) stays as the session has it.
 const merged=shownResult({parts:{servo:{on:true,current:0.01,angle:90},led:{on:false,current:0,led:true}},extra:1},{parts:{servo:{on:undefined,current:0.02},led:{on:true,current:0.001,led:true}},voltage:()=>1});
 assert.deepEqual(merged.parts,{servo:{on:true,current:0.02,angle:90},led:{on:true,current:0.001,led:true}});assert.equal(merged.extra,1);assert.equal(merged.voltage(),1);
 assert.equal(shownResult('same',null),'same');assert.equal(shownResult('same',{fault:true}),'same');
});
