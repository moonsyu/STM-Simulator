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

// Already wired example devices keep their wires; devices whose leads sit next to other bodies still route.
test('Docs keeps an example that is already wired and routes crowded example devices',()=>{
  for(const [id,part,wires] of [['blink','led1',2],['rgb','demo',4]]){
    const p=validateProject(applyHalExample(blankProject(),id)),{project:applied,report}=applyDeviceExample(p,{type:'part',id:part},{mode:'hal',api:'all'});
    assert.equal(applied.wires.length,wires,id);assert.equal(report.addedWires,0,id);
  }
  for(const [id,part] of [['ref_resistor_axial_2','r2'],['ref_dc_supply_2','driver'],['relay','r1'],['sevenseg','r5']]){
    const p=validateProject(applyHalExample(blankProject(),id));assert.doesNotThrow(()=>applyDeviceExample(p,{type:'part',id:part},{mode:'hal',api:'all'}),id);
  }
});
test('example guides and search follow the board',async()=>{
  const {halGuideFor}=await import('../../src/hal-examples.js'),{searchHalExamples}=await import('../../src/hal-example-search.js'),{deviceDocs}=await import('../../src/device-docs-data.js');
  assert.match(halGuideFor('timer_multi','nucleo-f103rb'),/TIM2 PA0/);assert.match(halGuideFor('timer_multi','nucleo-f446re'),/TIM2 PA5/);
  assert.notEqual(halGuideFor('ref_hcsr04_4','nucleo-f446re'),'HC-SR04 초음파 4핀','the guide is more than the device name');
  assert.deepEqual(searchHalExamples('PA5 servo','STM32F103RB').map(r=>r.id),[]);assert.ok(searchHalExamples('PA0 servo','STM32F103RB').some(r=>r.id==='servo'));
  assert.ok(searchHalExamples('uart','STM32F446RE').length<20,'boilerplate comments are not searched');
  assert.ok(searchHalExamples('','STM32F103RB').find(r=>r.id==='ref_nucleo_f446re').name.includes('NUCLEO-F103RB'));
  const f1=deviceDocs('servo','nucleo-f103rb');assert.match(f1.guide,/PA0/);assert.match(f1.source,/stm32f1xx-hal-driver/);
});
