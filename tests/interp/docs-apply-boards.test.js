import test from 'node:test';
import assert from 'node:assert/strict';
import {advance} from './helpers.js';
import {applyHalExample} from '../../src/hal-examples.js';
import {blankProject,validateProject} from '../../src/project.js';
import {applyDeviceExample} from '../../src/device-assistance.js';
import {SimulationSession} from '../../src/session.js';

// Docs "HAL 예제 + 핀·배선 보완" on a device of its own example (whose MX_<P>_Init already exists) and on the
// NUCLEO-F103RB (TIM5, 84 MHz, VERY_HIGH speed and F4 ADC sampling constants must not leak into F1 code).
const CASES=[['ref_pot_module_3','demo'],['ref_servo_3','demo'],['timer_encoder','demo'],['ref_hcsr04_4','demo'],['ref_rgb_gravity_3','demo'],['ref_can_transceiver_6','demo'],['adc','demo']];
for(const board of ['nucleo-f446re','nucleo-f103rb'])test(`Docs apply on ${board} compiles and runs for ADC, PWM, encoder, timer, bit-timing and CAN devices`,()=>{
  const failures=[];
  for(const [id,part] of CASES){
    const project=validateProject(applyHalExample({...blankProject(board==='nucleo-f103rb'?'STM32F103RB':undefined),boardId:board},id));
    if(!project.components.some(c=>c.id===part))continue;
    try{
      const {project:applied}=applyDeviceExample(project,{type:'part',id:part},{mode:'hal',api:'all'});
      const s=new SimulationSession(validateProject(applied),{print:()=>{}});s.tick(0);advance(s,200,10);
      assert.doesNotMatch(applied.code,board==='nucleo-f103rb'?/TIM5|GPIO_SPEED_FREQ_VERY_HIGH|ADC_SAMPLETIME_3CYCLES/:/$^/);
    }catch(e){failures.push(`${id}:${part} ${e.message}`);}
  }
  assert.deepEqual(failures,[]);
});
