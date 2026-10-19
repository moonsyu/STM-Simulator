import test from 'node:test';
import assert from 'node:assert/strict';
import {blankProject} from '../src/project.js';
import {generateHal,irqForPin} from '../src/mcu-config.js';
import {SimulationSession} from '../src/session.js';
import {boardPin} from '../src/pins.js';

function simultaneousExti({priorities=[0,15],callback='',startup}={}){
 const project=blankProject();project.surfaces.board.hidden=false;
 for(const [i,priority]of priorities.entries()){
  project.mcu.pins['PA'+i]={function:'GPIO_EXTI',pull:'PULLDOWN',edge:'RISING',initial:0,label:''};
  project.mcu.pins['PB'+i]={function:'GPIO_Output',pull:'NOPULL',edge:'RISING',initial:0,label:''};
  project.mcu.nvic[irqForPin('PA'+i)]={enabled:true,priority};
  project.wires.push({id:'w'+i,from:boardPin('PB'+i),to:boardPin('PA'+i),color:'#ff0000'});
 }
 const drive=startup??`__disable_irq(); HAL_GPIO_WritePin(GPIOB, ${priorities.map((_,i)=>'GPIO_PIN_'+i).join(' | ')}, GPIO_PIN_SET); __enable_irq(); HAL_Delay(10);`;
 project.code=generateHal(project.mcu,{minimal:true}).replace('  /* USER CODE BEGIN 2 */','  /* USER CODE BEGIN 2 */\n'+drive);
 project.code+='\nvoid HAL_GPIO_EXTI_Callback(uint16_t GPIO_Pin) { printf("%u\\n", GPIO_Pin); '+callback+' }\n';
 const output=[],session=new SimulationSession(project,{print:value=>output.push(value)});
 return {session,output};
}

test('an EXTI callback can disable another pending IRQ until it is enabled again',()=>{
 const {session:s,output}=simultaneousExti({callback:'if (GPIO_Pin == GPIO_PIN_0) HAL_NVIC_DisableIRQ(EXTI1_IRQn);'});
 s.tick(0);assert.deepEqual(output,['1']);assert.equal(s.hal.extiPending,2);
 assert.deepEqual(s.hal.pending.map(job=>job.irq),['EXTI1_IRQn']);
 s.tick(1);assert.deepEqual(output,['1']);
 s.hal.call('HAL_NVIC_EnableIRQ',['EXTI1_IRQn'],s.runtime);s.tick(2);
 assert.deepEqual(output,['1','2']);assert.equal(s.hal.extiPending,0);assert.equal(s.hal.pending.length,0);
 s.tick(3);assert.deepEqual(output,['1','2']);
});

test('global masking inside an EXTI callback retains the rest of the batch for resume',()=>{
 const {session:s,output}=simultaneousExti({callback:'if (GPIO_Pin == GPIO_PIN_0) __disable_irq();'});
 s.tick(0);assert.deepEqual(output,['1']);assert.equal(s.runtime.interruptsEnabled,false);assert.equal(s.hal.extiPending,2);
 s.tick(1);assert.deepEqual(output,['1']);
 s.hal.call('__enable_irq',[],s.runtime);s.tick(2);
 assert.deepEqual(output,['1','2']);assert.equal(s.hal.pending.length,0);
 s.tick(3);assert.deepEqual(output,['1','2']);
});

test('HAL priority changes in a callback apply to the remaining simultaneous EXTI jobs',()=>{
 const {session:s,output}=simultaneousExti({priorities:[0,5,15],callback:'if (GPIO_Pin == GPIO_PIN_0) HAL_NVIC_SetPriority(EXTI2_IRQn, 1, 0);'});
 s.tick(0);assert.deepEqual(output,['1','4','2']);assert.equal(s.hal.priorities.get('EXTI2_IRQn'),1);
 assert.equal(s.hal.pending.length,0);assert.equal(s.hal.extiPending,0);
});

test('callbacks cannot recursively consume newly queued jobs within the same HAL poll',()=>{
 const {session:s}=simultaneousExti({startup:''});s.tick(0);let delivered=0;
 const callback=()=>{delivered++;s.hal.queue('EXTI0_IRQn',callback,'requeued');};
 s.hal.queue('EXTI0_IRQn',callback,'requeued');
 s.hal.poll(s.runtime);assert.equal(delivered,1);assert.equal(s.hal.pending.length,1);
 s.hal.poll(s.runtime);assert.equal(delivered,2);assert.equal(s.hal.pending.length,1);
});
