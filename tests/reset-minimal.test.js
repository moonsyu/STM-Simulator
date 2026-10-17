import test from 'node:test';
import assert from 'node:assert/strict';
import {blankProject} from '../src/project.js';
import {resetMainCode} from '../src/code-reset.js';
import {SimulationSession} from '../src/session.js';
import {Runtime} from '../src/runtime.js';
import {compileHal} from '../src/hal-source.js';
import {resetAuditCases,assertMinimal} from '../scripts/reset-audit-cases.mjs';
import {halExample} from '../src/hal-examples.js';
import {fixture,execute} from '../scripts/docs-audit/runtime.mjs';
import {applyDeviceExample} from '../src/device-assistance.js';
import {assess} from '../scripts/docs-audit/oracles.mjs';


test('all example and edge-case resets contain only referenced initialization and keep configuration',()=>{
 for(const [id,original]of resetAuditCases()){
  const p=resetMainCode(original);assertMinimal(p);
  for(const key of ['mcu','firmware','components','wires','surfaces'])assert.deepEqual(p[key],original[key],id+': '+key);
 }
});

test('reset GPIO input/analog excludes unused speed and output preserves initial HIGH',()=>{
 for(const [id,p]of resetAuditCases().filter(([id])=>['GPIO_Input','Analog','GPIO_Output'].includes(id))){
  const reset=resetMainCode(p),session=new SimulationSession(reset);session.tick(0);
  assert.equal(reset.code.includes('GPIO_InitStruct.Speed'),id==='GPIO_Output');
  if(id==='GPIO_Output')assert.equal(session.runtime.gpio.PA0.value,3.3);
 }
});

test('empty HAL main idles for seconds, processes scheduled work, and remains debuggable',()=>{
 const runtime=new Runtime(compileHal('int events=0; int main(void){while(1){}}'));
 runtime.event(750,()=>{runtime.vars.events++;});runtime.tick(1000);runtime.tick(5000);
 assert.equal(runtime.vars.events,1);assert.equal(runtime.time,5000);assert.equal(runtime.finished,false);
 runtime.debug.enabled=true;runtime.resume('into');runtime.tick(5010);
 assert.equal(runtime.debug.paused,true);assert.equal(runtime.frames.at(-1).name,'main');
 runtime.resume();runtime.tick(6000);assert.equal(runtime.time,6000);
});

test('idle optimization does not swallow a condition change or hide an inner runaway loop',()=>{
 const r=new Runtime(compileHal('int waiting=1;int done=0;int main(void){while(waiting){} done=1;while(1){}}'));
 r.event(1,()=>{r.vars.waiting=0;});r.tick(50);assert.equal(r.vars.done,1);
 const inner=new Runtime(compileHal('void spin(void){while(1){}} int main(void){spin();}'));
 assert.throws(()=>inner.tick(0),/실행 한도/);
});

test('HAL timer and EXTI callbacks still fire while main has no delay or work',()=>{
 for(const id of ['timer','exti']){
  const p=halExample(id);p.code=p.code.replace('    HAL_Delay(10);','');
  const printed=[],s=new SimulationSession(p,{print:line=>printed.push(line)});s.tick(0);s.tick(350);
  if(id==='timer'){assert.equal(printed.length,3);assert.equal(s.result.parts.led1.on,true);}
  else{s.setPressed({USER:true});s.tick(400);assert.equal(s.result.parts.led1.on,true);assert.equal(printed.length,1);}
 }
});

test('reset sketch and native host need neither delay nor stdio',()=>{
 const p=blankProject();p.firmware.mode='sketch';const sketch=resetMainCode(p);assert.doesNotMatch(sketch.code,/delay|include/);
 const s=new SimulationSession(sketch);s.tick(1000);assert.equal(s.result.fault,false);
 p.firmware.mode='hal';p.ide={breakpoints:[],watches:[],native:{target:'host',configuration:'Debug'}};
 assert.equal(resetMainCode(p).code,'int main(void) {\n    return 0;\n}\n');
});

test('board, breadboard and button examples reuse their circuits after code reset',()=>{
 for(const type of ['board','breadboard','button','ref_button_2','ref_button_4','ref_button_module_3']){
  const f=fixture(type),original=applyDeviceExample(f.project,f.target).project;
  const restored=applyDeviceExample(resetMainCode(original),f.target).project;
  assert.deepEqual(restored.components,original.components,type);assert.deepEqual(restored.wires,original.wires,type);
  const result=assess(type,execute(restored));assert.ok(result.passed,type+': '+JSON.stringify(result.checks.filter(c=>!c.passed)));
 }
});

test('a remapped Docs pin cannot duplicate or erase an existing user label',()=>{
 const f=fixture('led');f.project.mcu.pins.PA5={function:'GPIO_Output',pull:'NOPULL',edge:'FALLING',initial:0,label:'LD2'};
 const applied=applyDeviceExample(f.project,f.target,{api:'HAL_GPIO_WritePin'});
 assert.equal(applied.project.mcu.pins.PA5.label,'LD2');assert.notEqual(applied.binding.pins.PA5,'PA5');
 assert.notEqual(applied.project.mcu.pins[applied.binding.pins.PA5].label,'LD2');
 assert.equal(execute(applied.project,{end:30}).frames.at(-1).parts.selected.on,true);
});
