import test from 'node:test';
import assert from 'node:assert/strict';
import {resetMainCode} from '../src/code-reset.js';
import {applyDeviceExample} from '../src/device-assistance.js';
import {fixture,execute} from '../scripts/docs-audit/runtime.mjs';
import {SimulationSession} from '../src/session.js';
import {halExample} from '../src/hal-examples.js';

test('reset removes main behavior, preserves circuit/config/files and allows Docs reapplication',()=>{
 const {project,target}=fixture('led');
 project.firmware.files=[{name:'user.h',text:'#pragma once\nint keep(void);\n'},{name:'user.c',text:'int keep(void) { return 42; }\n'}];
 let p=applyDeviceExample(project,target,{api:'HAL_GPIO_WritePin'}).project;
 p.ide={breakpoints:[{file:'main.c',line:5},{file:'user.c',line:1}],watches:['value']};
 const saved=structuredClone(p),reset=resetMainCode(p);
 assert.deepEqual(p,saved);
 for(const key of ['components','wires','mcu','surfaces','firmware'])assert.deepEqual(reset[key],saved[key],key);
 assert.equal(reset.deviceDocs,undefined);assert.doesNotMatch(reset.code,/STM DEVICE DOCS|auditUserKeep|HAL_GPIO_TogglePin|GPIO_PIN_SET/);
 assert.deepEqual(reset.ide.breakpoints,[{file:'user.c',line:1}]);
 const run=execute(reset,{end:30});assert.equal(run.error,null);assert.equal(run.frames.at(-1).parts.selected.on,false);
 const restored=applyDeviceExample(reset,target,{api:'HAL_GPIO_WritePin'}).project;
 assert.deepEqual(restored.components,p.components);assert.deepEqual(restored.wires,p.wires);
 assert.equal(execute(restored,{end:30}).frames.at(-1).parts.selected.on,true);
});

test('reset never resurrects another device example on a later apply',()=>{
 const {project,target}=fixture('led');let p=applyDeviceExample(project,target).project;
 p.components.push({id:'second',type:'buzzer',name:'B2',x:1000,y:100,rotation:0,span:70});
 p=applyDeviceExample(p,{type:'part',id:'second'}).project;
 const next=applyDeviceExample(resetMainCode(p),target,{api:'HAL_GPIO_WritePin'}).project;
 assert.equal(next.deviceDocs.bindings.length,1);assert.equal(next.deviceDocs.bindings[0].key,'selected');
 assert.deepEqual(next.components,p.components);assert.deepEqual(next.wires,p.wires);
});

test('reset PWM keeps routing but does not start motor or generate demonstration toggles',()=>{
 const original=halExample('motor'),reset=resetMainCode(original),s=new SimulationSession(reset);s.tick(50);
 assert.deepEqual(reset.mcu,original.mcu);assert.equal(s.result.parts.demo.rpm,0);
 assert.doesNotMatch(reset.code,/HAL_TIM_PWM_Start|HAL_GPIO_TogglePin|DC command/);
});

test('reset respects sketch and native host modes',()=>{
 const {project}=fixture('led');project.firmware.mode='sketch';let reset=resetMainCode(project),s=new SimulationSession(reset);s.tick(100);assert.equal(s.result.fault,false);assert.match(reset.code,/void loop/);
 project.firmware.mode='hal';project.ide={breakpoints:[],watches:[],native:{target:'host',configuration:'Debug'}};reset=resetMainCode(project);assert.doesNotMatch(reset.code,/HAL_|main.h/);assert.match(reset.code,/return 0/);assert.equal(reset.ide.native.target,'host');
});
