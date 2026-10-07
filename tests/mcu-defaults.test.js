import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultMcu,validateMcu,generateHal,importIoc} from '../src/mcu-config.js';
import {blankProject,validateProject} from '../src/project.js';
import {halExample} from '../src/hal-examples.js';
import {timerExample} from '../src/timer-examples.js';
import {SimulationSession} from '../src/session.js';

test('fresh board uses 16 MHz HSI clock, no assigned GPIO or enabled peripheral/IRQ',()=>{
  const p=blankProject();assert.equal(p.mcu.timerClockHz,16000000);
  for(const key of ['pins','peripherals','nvic'])assert.deepEqual(p.mcu[key],{});
  assert.match(p.code,/PLLState = RCC_PLL_OFF/);assert.match(p.code,/SYSCLKSource = RCC_SYSCLKSOURCE_HSI/);
  for(const bus of ['APB1','APB2'])assert.match(p.code,new RegExp(bus+'CLKDivider = RCC_HCLK_DIV1'));
  assert.match(p.code,/FLASH_LATENCY_0/);assert.doesNotMatch(p.code,/PLLState = RCC_PLL_ON|HAL_GPIO_TogglePin/);
  const s=new SimulationSession(p);s.tick(0);assert.equal(s.hal.timerModel.states.size,0);assert.equal(s.hal.nvic.size,0);assert.deepEqual(s.runtime.gpio,{});
});

test('missing timer/IOC settings use CubeMX full-width ARR defaults; explicit zero and configured values survive',()=>{
  for(const id of ['TIM2','TIM3','TIM4','TIM5']){
    const m=defaultMcu(),period=['TIM2','TIM5'].includes(id)?4294967295:65535;m.peripherals[id]={enabled:true};
    assert.deepEqual(validateMcu(m).peripherals[id],{enabled:true,prescaler:0,period,pulse:0,mode:'base'});
    const imported=importIoc(`Mcu.Name=STM32F446RETx\nMcu.IP0=${id}`).config;
    assert.equal(imported.timerClockHz,16000000);assert.equal(imported.peripherals[id].period,period);assert.equal(imported.peripherals[id].prescaler,0);
    const explicit=importIoc(`Mcu.Name=STM32F446RETx\nMcu.IP0=${id}\n${id}.Prescaler=0\n${id}.Period=0`).config;
    assert.equal(explicit.peripherals[id].period,0);
  }
  const old=halExample('timer'),saved=JSON.parse(JSON.stringify(old)),restored=validateProject(saved);
  assert.equal(restored.mcu.timerClockHz,84000000);assert.equal(restored.mcu.peripherals.TIM2.prescaler,8399);assert.equal(restored.mcu.peripherals.TIM2.period,999);assert.equal(restored.code,old.code);
  assert.match(generateHal(restored.mcu),/PLLState = RCC_PLL_ON/);
});

test('ARR zero blocks count and update IRQ; assigning ARR resumes at the reset-clock rate and reblocking cancels events',()=>{
  const p=blankProject();p.mcu.peripherals.TIM3={enabled:true,prescaler:15999,period:0};p.mcu.nvic.TIM3_IRQn={enabled:true,priority:0};p.mcu=validateMcu(p.mcu);
  p.code=generateHal(p.mcu).replace('  /* 타이머 주기 인터럽트 */','  printf("tick=%lu", HAL_GetTick());');
  const output=[],s=new SimulationSession(p,{print:v=>output.push(v)});s.tick(0);
  const ptr=s.hal.timerModel.states.get('TIM3').ptr,call=(name,...args)=>s.hal.call(name,[ptr,...args],s.runtime);
  s.tick(100);assert.equal(call('__HAL_TIM_GET_COUNTER'),0);assert.deepEqual(output,[]);
  call('__HAL_TIM_SET_AUTORELOAD',99);s.tick(199);assert.equal(call('__HAL_TIM_GET_COUNTER'),99);assert.deepEqual(output,[]);
  s.tick(200);assert.deepEqual(output,['tick=200']);s.tick(220);assert.equal(call('__HAL_TIM_GET_COUNTER'),20);
  call('__HAL_TIM_SET_AUTORELOAD',0);s.tick(400);assert.equal(call('__HAL_TIM_GET_COUNTER'),20);assert.deepEqual(output,['tick=200']);
  call('__HAL_TIM_SET_AUTORELOAD',99);s.tick(480);assert.deepEqual(output,['tick=200','tick=480']);
});

test('new PWM starts with CCR zero and no accidental 50 percent output; configured pulse and width are honored',()=>{
  const p=blankProject();p.mcu.pins.PA6={function:'TIM3_CH1',pull:'NOPULL',edge:'FALLING',initial:0,label:''};
  p.mcu.peripherals.TIM3={enabled:true,prescaler:15,period:999,mode:'pwm'};p.mcu=validateMcu(p.mcu);p.code=generateHal(p.mcu);
  assert.match(p.code,/channel.Pulse = 0;/);const s=new SimulationSession(p);s.tick(0);
  assert.equal(s.runtime.gpio.PA6.value,0);assert.equal(s.runtime.pwmFrequency.get('PA6'),1000);
  p.mcu.peripherals.TIM3.pulse=250;p.code=generateHal(p.mcu);const on=new SimulationSession(p);on.tick(0);assert.ok(Math.abs(on.runtime.gpio.PA6.value-.825)<.001);
  const ptr=on.hal.timerModel.states.get('TIM3').ptr;on.hal.call('__HAL_TIM_SET_COMPARE',[ptr,0,65535],on.runtime);assert.equal(on.runtime.gpio.PA6.value,3.3);
  assert.throws(()=>on.hal.call('__HAL_TIM_SET_COMPARE',[ptr,0,65536],on.runtime),/PWM compare/);
  p.mcu.peripherals.TIM3.period=0;p.mcu.peripherals.TIM3.pulse=0;p.code=generateHal(p.mcu);const blocked=new SimulationSession(p);blocked.tick(0);blocked.tick(50);
  assert.equal(blocked.runtime.gpio.PA6.value,0);assert.equal(blocked.runtime.pwmFrequency.size,0);
});

test('ARR zero freezes the counter without disabling input capture of that frozen value',()=>{
  const p=timerExample('timer_capture');p.mcu.peripherals.TIM4.period=0;
  p.code=generateHal(p.mcu).replace('  /* Read HAL_TIM_ReadCapturedValue(htim, TIM_CHANNEL_1). */','  printf("capture=%lu", HAL_TIM_ReadCapturedValue(htim, TIM_CHANNEL_1));');
  const output=[],s=new SimulationSession(p,{print:v=>output.push(v)});for(let t=0;t<=20;t++)s.tick(t);
  assert.ok(output.length>=4);assert.ok(output.every(v=>v==='capture=0'));
});


test('CubeMX timer defaults count immediately and schedule each full-width update interval',()=>{
  for(const id of ['TIM2','TIM3','TIM4','TIM5']){
    const p=blankProject(),period=['TIM2','TIM5'].includes(id)?4294967295:65535;
    p.mcu.peripherals[id]={enabled:true};p.mcu.nvic[id+'_IRQn']={enabled:true,priority:0};p.mcu=validateMcu(p.mcu);p.code=generateHal(p.mcu);
    const s=new SimulationSession(p);s.tick(1);const ptr=s.hal.timerModel.states.get(id).ptr;
    assert.equal(s.hal.call('__HAL_TIM_GET_COUNTER',[ptr],s.runtime),16000);
    assert.equal(s.hal.call('__HAL_TIM_GET_AUTORELOAD',[ptr],s.runtime),period);
    assert.ok(s.runtime.events.some(e=>Math.abs(e.at-(period+1)/16000)<1e-8));
  }
});

test('full-width default PWM supports 32-bit sub-Hz periods, zero duty and scheduled half-duty edges',()=>{
  for(const [id,pin] of [['TIM2','PA5'],['TIM3','PA6'],['TIM4','PB6'],['TIM5','PA0']]){
    const p=blankProject(),period=['TIM2','TIM5'].includes(id)?4294967295:65535;
    p.simulation={pwmWaveform:true};p.mcu.pins[pin]={function:id+'_CH1',pull:'NOPULL',edge:'FALLING',initial:0,label:''};
    p.mcu.peripherals[id]={enabled:true,mode:'pwm'};p.mcu=validateMcu(p.mcu);p.code=generateHal(p.mcu);
    const s=new SimulationSession(p);s.tick(0);assert.equal(s.runtime.gpio[pin].value,0);assert.equal(s.runtime.pwm.size,0);
    assert.equal(s.runtime.pwmFrequency.get(pin),16000000/(period+1));
    const ptr=s.hal.timerModel.states.get(id).ptr;
    s.hal.call('__HAL_TIM_SET_COMPARE',[ptr,0,(period+1)/2],s.runtime);
    assert.equal(s.runtime.gpio[pin].value,3.3);
    assert.ok(s.runtime.events.some(e=>Math.abs(e.at-(period+1)/32000)<1e-8));
    s.tick(1);assert.equal(s.runtime.gpio[pin].value,3.3);
  }
});
