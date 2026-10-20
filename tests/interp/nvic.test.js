import test from 'node:test';
import assert from 'node:assert/strict';
import {halProject,run,advance} from './helpers.js';
import {SimulationSession} from '../../src/session.js';

const timers=(p2,p3,extra,init='  HAL_TIM_Base_Start_IT(&htim2);\n  HAL_TIM_Base_Start_IT(&htim3);',more={})=>halProject({peripherals:{TIM2:{enabled:true,prescaler:15,period:9999},TIM3:{enabled:true,prescaler:15,period:2999}},nvic:{TIM2_IRQn:{enabled:true,priority:p2},TIM3_IRQn:{enabled:true,priority:p3}},globals:'volatile uint32_t n3=0, inside=0;',init,loop:'',extra,...more});
const LONG=`void HAL_TIM_PeriodElapsedCallback(TIM_HandleTypeDef *htim){
  if(htim->Instance==TIM3){ n3++; printf("T3 inside=%lu\\n", inside); return; }
  inside=1; printf("T2 start n3=%lu\\n", n3);
  for(volatile uint32_t i=0;i<50000;i++){}
  inside=0; printf("T2 end n3=%lu\\n", n3);
}`;

test('a higher preemption priority IRQ interrupts a long callback loop mid-way and the loop resumes',()=>{
 const {s,output}=run(timers(5,1,LONG));advance(s,16);
 const start=output.indexOf('T2 start n3=3'),end=output.findIndex(x=>x.startsWith('T2 end'));
 assert.ok(start>=0&&end>start,output.join('|'));assert.ok(output.slice(start+1,end).includes('T3 inside=1'),'TIM3 ran inside TIM2');
 assert.equal(output[end],'T2 end n3=4');
});
test('equal or lower priority IRQs wait for the running callback (tail-chaining)',()=>{
 for(const p3 of [5,9]){const {s,output}=run(timers(5,p3,LONG));advance(s,16);const start=output.indexOf('T2 start n3=3'),end=output.findIndex(x=>x.startsWith('T2 end'));assert.equal(output[end],'T2 end n3=3');assert.ok(!output.slice(start,end).some(x=>x.startsWith('T3')));assert.equal(output[end+1],'T3 inside=0');}
});
test('priority grouping: same group with different sub priority does not preempt, but orders pending IRQs',()=>{
 const init='  HAL_NVIC_SetPriorityGrouping(NVIC_PRIORITYGROUP_2);\n  HAL_NVIC_SetPriority(TIM2_IRQn, 1, 3);\n  HAL_NVIC_SetPriority(TIM3_IRQn, 1, 0);\n  HAL_TIM_Base_Start_IT(&htim2);\n  HAL_TIM_Base_Start_IT(&htim3);';
 const {s,output}=run(timers(5,1,LONG,init));advance(s,16);const end=output.findIndex(x=>x.startsWith('T2 end'));assert.equal(output[end],'T2 end n3=3');
 assert.equal(s.hal.nvicModel.preemptBits,2);assert.equal(s.hal.nvicModel.group('TIM2_IRQn'),1);
});
test('simultaneous pending IRQs are dispatched by priority, then IRQ number',()=>{
 const p=halProject({nvic:{},globals:'',init:`  HAL_NVIC_SetPriority(DMA1_Stream5_IRQn, 2, 0); HAL_NVIC_EnableIRQ(DMA1_Stream5_IRQn);
  HAL_NVIC_SetPriority(DMA1_Stream1_IRQn, 2, 0); HAL_NVIC_EnableIRQ(DMA1_Stream1_IRQn);
  HAL_NVIC_SetPriority(ADC_IRQn, 1, 0); HAL_NVIC_EnableIRQ(ADC_IRQn);
  __disable_irq();
  HAL_NVIC_SetPendingIRQ(DMA1_Stream5_IRQn); HAL_NVIC_SetPendingIRQ(DMA1_Stream1_IRQn); HAL_NVIC_SetPendingIRQ(ADC_IRQn);
  printf("pending=%lu\\n", HAL_NVIC_GetPendingIRQ(ADC_IRQn));
  __enable_irq();
  printf("after\\n");`,loop:'',extra:'void DMA1_Stream5_IRQHandler(void){printf("S5\\n");}\nvoid DMA1_Stream1_IRQHandler(void){printf("S1\\n");}\nvoid ADC_IRQHandler(void){printf("ADC ipsr=%lu\\n", __get_IPSR());}'});
 const {output}=run(p);assert.deepEqual(output,['pending=1','ADC ipsr=34','S1','S5','after']);
});
test('BASEPRI masks lower priorities; ClearPendingIRQ drops a software pend',()=>{
 const p=halProject({init:`  HAL_NVIC_SetPriority(ADC_IRQn, 6, 0); HAL_NVIC_EnableIRQ(ADC_IRQn);
  HAL_NVIC_SetPriority(SPI1_IRQn, 2, 0); HAL_NVIC_EnableIRQ(SPI1_IRQn);
  __set_BASEPRI(5 << 4);
  HAL_NVIC_SetPendingIRQ(ADC_IRQn); HAL_NVIC_SetPendingIRQ(SPI1_IRQn);
  printf("masked basepri=%lu\\n", __get_BASEPRI());
  __set_BASEPRI(0);
  printf("unmasked\\n");
  __set_PRIMASK(1); HAL_NVIC_SetPendingIRQ(ADC_IRQn); HAL_NVIC_ClearPendingIRQ(ADC_IRQn); __set_PRIMASK(0);
  printf("done %lu\\n", HAL_NVIC_GetPendingIRQ(ADC_IRQn));`,loop:'',extra:'void ADC_IRQHandler(void){printf("ADC\\n");}\nvoid SPI1_IRQHandler(void){printf("SPI\\n");}'});
 const {output}=run(p);assert.deepEqual(output,['SPI','masked basepri=80','ADC','unmasked','done 0']);
});
test('HAL_Delay inside an ISR that SysTick cannot preempt hangs like hardware and is reported',()=>{
 const extra='void HAL_TIM_PeriodElapsedCallback(TIM_HandleTypeDef *htim){ if(htim->Instance==TIM2){ printf("before\\n"); HAL_Delay(5); printf("after\\n"); } else n3++; }';
 const {s,output,warnings}=run(timers(5,1,extra));advance(s,40);
 assert.deepEqual(output,['before']);assert.match(warnings[0],/TIM2_IRQn.*HAL_Delay.*SysTick/);assert.ok(s.hal.hung);
 assert.ok(s.runtime.vars.n3>=8,'higher priority TIM3 still preempts the hung ISR');
});
test('HAL_Delay inside an ISR works when SysTick has a higher priority (HAL_InitTick)',()=>{
 const extra='void HAL_TIM_PeriodElapsedCallback(TIM_HandleTypeDef *htim){ if(htim->Instance==TIM2){ uint32_t t=HAL_GetTick(); HAL_Delay(5); printf("delay=%lu\\n", HAL_GetTick()-t); HAL_TIM_Base_Stop_IT(&htim2);} }';
 const {s,output,warnings}=run(timers(5,9,extra,'  HAL_InitTick(0);\n  HAL_TIM_Base_Start_IT(&htim2);'));advance(s,25);assert.deepEqual(output,['delay=5']);assert.deepEqual(warnings,[]);
});
test('SysTick lower than the running ISR freezes HAL_GetTick and loses ticks like real hardware',()=>{
 const extra='void HAL_TIM_PeriodElapsedCallback(TIM_HandleTypeDef *htim){ if(htim->Instance!=TIM2) return; uint32_t t=HAL_GetTick(); for(volatile uint32_t i=0;i<30000;i++){} printf("frozen=%lu\\n", HAL_GetTick()-t); HAL_TIM_Base_Stop_IT(&htim2); }';
 const {s,output}=run(timers(5,9,extra,'  HAL_TIM_Base_Start_IT(&htim2);',{loop:'    HAL_Delay(1);'}));advance(s,20);assert.deepEqual(output,['frozen=0']);
 assert.ok(s.hal.nvicModel.tick.lost>=1&&s.hal.call('HAL_GetTick',[],s.runtime)<20);
});
test('NVIC_SystemReset restarts the program from main with fresh globals and a fresh HAL tick',()=>{
 const p=halProject({globals:'uint32_t boots=0;',init:'  boots++; HAL_Delay(3); printf("boot %lu tick %lu\\n", boots, HAL_GetTick());\n  NVIC_SystemReset();',loop:''});
 const {s,output,warnings}=run(p);advance(s,8);assert.deepEqual(output,['boot 1 tick 3','boot 1 tick 3']);assert.equal(s.runtime.resetCount,2);assert.match(warnings[0],/시스템 리셋/);
});
test('debugger stops at a breakpoint inside a nested callback with a correct call stack',()=>{
 const p=timers(5,1,LONG.replace('n3++;','n3++;\n  if(inside){\n    inside=1;\n  }'));const line=p.code.split('\n').findIndex(l=>l.trim()==='inside=1;')+1;
 const s=new SimulationSession(p,{print:()=>{},debug:{breakpoints:[`main.c:${line}`]}});s.tick(0);advance(s,12);
 assert.equal(s.runtime.debug.paused,true);assert.equal(s.runtime.location.line,line);
 const stack=s.runtime.callStack();assert.deepEqual(stack.map(f=>f.name),['HAL_TIM_PeriodElapsedCallback','HAL_TIM_PeriodElapsedCallback','main']);
 assert.equal(stack[0].irq,'TIM3_IRQn');assert.equal(stack[1].irq,'TIM2_IRQn');assert.equal(s.runtime.vars.inside,1);
 s.runtime.debug.breakpoints.clear();s.runtime.resume('over');s.tick(s.runtime.time+.5);assert.equal(s.runtime.debug.paused,true);assert.equal(s.runtime.callStack()[0].irq,'TIM3_IRQn');
 s.runtime.resume('continue');advance(s,16);assert.equal(s.runtime.debug.paused,false);assert.equal(s.runtime.contexts.length,1);
});
