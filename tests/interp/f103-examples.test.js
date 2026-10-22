import test from 'node:test';
import assert from 'node:assert/strict';
import {advance} from './helpers.js';
import {allHalExamples,applyHalExample} from '../../src/hal-examples.js';
import {blankProject,validateProject} from '../../src/project.js';
import {SimulationSession} from '../../src/session.js';
import {searchHalExamples} from '../../src/hal-example-search.js';

const F4='nucleo-f446re',F1='nucleo-f103rb';
const project=(board,id)=>validateProject(applyHalExample({...blankProject(board===F1?'STM32F103RB':undefined),boardId:board},id));
function run(p,ms=400){const out=[],s=new SimulationSession(p,{print:x=>out.push(x)});s.tick(0);advance(s,ms,10);return {out,vcp:s.buses.vcpOutput,fault:s.result?.fault};}
// Printed numbers with decimals depend on analog timing; compare the text around them.
const norm=lines=>lines.slice(0,8).map(l=>l.replace(/-?\d+\.\d+/g,'#.#'));
// Peripherals the STM32F103RB lacks (DCMI camera, I2S audio).
const UNAVAILABLE=['camera_tft','ref_max98357a_9'];
// The F1 ADC (239.5-cycle sampling at 64 MHz) completes conversions at a different rate.
const TIMING=['adc_dma_scan'];

test('every HAL example ports to NUCLEO-F103RB and prints the same output as on NUCLEO-F446RE',()=>{
 const failures=[];
 for(const id of Object.keys(allHalExamples())){
  if(UNAVAILABLE.includes(id)){assert.throws(()=>project(F1,id),/STM32F103RB에는 .* 없어 이 예제를 실행할 수 없습니다/);continue;}
  let a,b;
  try{b=run(project(F1,id));}catch(e){failures.push(`${id}: ${e.message}`);continue;}
  if(b.fault){failures.push(`${id}: fault ${b.fault}`);continue;}
  if(TIMING.includes(id))continue;
  a=run(project(F4,id));
  if(JSON.stringify(norm(a.out))!==JSON.stringify(norm(b.out))||a.vcp!==b.vcp)failures.push(`${id}: F4 ${JSON.stringify(a.out.slice(0,2))} / F1 ${JSON.stringify(b.out.slice(0,2))}`);
 }
 assert.deepEqual(failures,[]);
});

test('ported F103 examples use F1 clocks, AFIO remaps and DMA1 channels',()=>{
 const uart=project(F1,'dma_uart_echo');
 assert.equal(uart.boardId,F1);assert.equal(uart.mcu.family,'STM32F103RB');
 assert.match(uart.code,/RCC_PLL_MUL16/);assert.match(uart.code,/hdma_usart2_rx\.Instance = DMA1_Channel6;/);
 assert.doesNotMatch(uart.code,/Stream|\.Init\.Channel|FIFOMode|GPIO_AF\d/);
 const sonar=project(F1,'ultrasonic');
 assert.match(sonar.code,/htim2\.Init\.Period = 65535;/);assert.match(sonar.code,/\(uint16_t\)\(now - started\)/);
 const can=project(F1,'ref_can_transceiver_6');
 assert.match(can.code,/__HAL_AFIO_REMAP_CAN1_2\(\);/);assert.doesNotMatch(can.code,/GPIO_AF9_CAN1/);
});

test('the example list of an F103 project leaves out examples that need F4-only peripherals',()=>{
 const f4=searchHalExamples('').map(r=>r.id),f1=searchHalExamples('','STM32F103RB').map(r=>r.id);
 assert.deepEqual(f4.filter(id=>!f1.includes(id)).sort(),[...UNAVAILABLE].sort());
});

test('the servo position-feedback wire follows the commanded angle (ADC reads it)',()=>{
 const out=run(project(F4,'ref_servo_feedback_4'),3000).out.filter(l=>/^Feedback=/.test(l)).map(l=>Number(l.match(/[\d.]+/)[0]));
 assert.ok(out.length>=3,out.join(','));assert.ok(Math.abs(out[0]-1.65)<0.05&&Math.abs(out[1])<0.05,out.join(','));
});
