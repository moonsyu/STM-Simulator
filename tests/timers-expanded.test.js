import test from 'node:test';
import assert from 'node:assert/strict';
import {timerExample} from '../src/timer-examples.js';
import {SimulationSession} from '../src/session.js';
import {validateMcu,importIoc,pinFunctions,generateHal} from '../src/mcu-config.js';
const boot=kind=>{const p=timerExample(kind),output=[],s=new SimulationSession(p,{print:v=>output.push(v)});s.tick(0);return {p,s,output};};
const advance=(s,end)=>{for(let t=s.time+1;t<=end;t++)s.tick(t);};
test('independent timers drive 50 Hz servo and 1 kHz motor with separate ARR and CCR',()=>{
  const {s}=boot('timer_multi');advance(s,240);
  assert.equal(s.runtime.pwmFrequency.get('PA5'),50);assert.equal(s.runtime.pwmFrequency.get('PA6'),1000);
  assert.equal(s.result.parts.servo2.target,0);assert.ok(s.result.parts.demo.rpm>1200);
  const states=s.hal.timerModel.states;assert.equal(states.get('TIM2').channels.get(0).pulse,1000);assert.equal(states.get('TIM3').channels.get(0).pulse,750);
});
test('input capture reads physical rising edges and preserves period across 16-bit wrap',()=>{
  const {s,output}=boot('timer_capture');advance(s,220);
  assert.ok(output.filter(v=>v.includes('period=4000 us frequency=250 Hz')).length>=2);
  const {p}=boot('timer_capture');p.wires=[];const disconnected=[];const off=new SimulationSession(p,{print:v=>disconnected.push(v)});advance(off,220);assert.deepEqual(disconnected,[]);
});
test('capture respects NVIC masking, validates channel/filter and stops sampling',()=>{
  const {p}=boot('timer_capture');p.code=p.code.replace('  HAL_TIM_IC_Start_IT(&htim4, TIM_CHANNEL_1);','  HAL_TIM_IC_Start_IT(&htim4, TIM_CHANNEL_1);\n  HAL_NVIC_DisableIRQ(TIM4_IRQn);');const output=[],s=new SimulationSession(p,{print:v=>output.push(v)});advance(s,220);assert.deepEqual(output,[]);
  const ptr=s.hal.timerModel.states.get('TIM4').ptr;s.hal.call('HAL_TIM_IC_Stop_IT',[ptr,0],s.runtime);const before=s.hal.call('HAL_TIM_ReadCapturedValue',[ptr,0],s.runtime);advance(s,300);assert.equal(s.hal.call('HAL_TIM_ReadCapturedValue',[ptr,0],s.runtime),before);
  const bad=timerExample('timer_capture');bad.code=bad.code.replace('channel.ICFilter = 0','channel.ICFilter = 2');assert.throws(()=>new SimulationSession(bad).tick(0),/filter 0/);
});
test('encoder counts real A/B transitions in both directions, wraps and stops',()=>{
  const {p,s}=boot('timer_encoder'),ptr=s.hal.timerModel.states.get('TIM4').ptr;
  p.components[0].position=3;s.changed();advance(s,110);assert.equal(s.hal.call('__HAL_TIM_GET_COUNTER',[ptr],s.runtime),12);
  p.components[0].position=-1;s.changed();advance(s,220);assert.equal(s.hal.call('__HAL_TIM_GET_COUNTER',[ptr],s.runtime),65532);assert.equal(s.hal.call('__HAL_TIM_IS_TIM_COUNTING_DOWN',[ptr],s.runtime),1);
  s.hal.call('HAL_TIM_Encoder_Stop',[ptr,60],s.runtime);p.components[0].position=3;s.changed();advance(s,310);assert.equal(s.hal.call('__HAL_TIM_GET_COUNTER',[ptr],s.runtime),65532);
});
test('TIM3/4 are 16-bit, TIM2/5 are 32-bit and AF routes match the F446RE package',()=>{
  assert.ok(pinFunctions('PC6').includes('TIM3_CH1'));assert.ok(pinFunctions('PB9').includes('TIM4_CH4'));assert.ok(pinFunctions('PA3').includes('TIM5_CH4'));assert.ok(!pinFunctions('PA5').includes('TIM4_CH1'));
  const p=timerExample('timer_encoder');p.mcu.peripherals.TIM4.period=65536;assert.throws(()=>validateMcu(p.mcu),/Period|period/);
  p.mcu.peripherals={TIM5:{enabled:true,prescaler:0,period:4294967295}};p.mcu.pins={};assert.equal(validateMcu(p.mcu).peripherals.TIM5.period,4294967295);
  const imported=importIoc('Mcu.Name=STM32F446RETx\nMcu.IP0=TIM4\nPB6.Signal=TIM4_CH1\nPB7.Signal=TIM4_CH2\nTIM4.EncoderMode=TIM_ENCODERMODE_TI12\nTIM4.Prescaler=0\nTIM4.Period=65535\nRCC.APB1TimFreq_Value=84000000');assert.equal(imported.config.peripherals.TIM4.mode,'encoder');assert.match(generateHal(imported.config),/HAL_TIM_Encoder_Init/);
});
test('base interrupt counter advances while waiting, changing ARR reschedules and Stop retains count',()=>{
  const p=timerExample('timer_capture');p.code=p.code.replace('HAL_TIM_IC_Start_IT(&htim4, TIM_CHANNEL_1);','HAL_TIM_Base_Start_IT(&htim4);');p.code=p.code.replace('  /* 타이머 주기 인터럽트 */','  printf("overflow=%lu", HAL_GetTick());');const output=[],s=new SimulationSession(p,{print:v=>output.push(v)});s.tick(0);
  const ptr=s.hal.timerModel.states.get('TIM4').ptr;advance(s,10);assert.equal(s.hal.call('__HAL_TIM_GET_COUNTER',[ptr],s.runtime),10000);
  s.hal.call('__HAL_TIM_SET_AUTORELOAD',[ptr,19999],s.runtime);advance(s,45);assert.deepEqual(output,['overflow=20','overflow=40']);
  s.hal.call('HAL_TIM_Base_Stop_IT',[ptr],s.runtime);const stopped=s.hal.call('__HAL_TIM_GET_COUNTER',[ptr],s.runtime);advance(s,90);assert.equal(s.hal.call('__HAL_TIM_GET_COUNTER',[ptr],s.runtime),stopped);assert.equal(output.length,2);
});
