import test from 'node:test';
import assert from 'node:assert/strict';
import {blankProject,validateProject} from '../src/project.js';
import {boardPin} from '../src/pins.js';
import {applyDeviceExample} from '../src/device-assistance.js';
import {deviceDocs,wiringTopology} from '../src/device-docs-data.js';
import {exampleStatements} from '../src/device-inline-example.js';
import {managedRegion} from '../src/device-code-insertion.js';
import {SimulationSession} from '../src/session.js';
import {cFunctions} from '../src/c-source-edit.js';

function fixture(){
 const p=blankProject();p.surfaces.board.hidden=false;
 p.components=[{id:'bb',type:'breadboard',name:'BB1',x:803,y:337,rotation:0},{id:'led',type:'led',name:'LED1',x:750,y:357,rotation:90,span:70,color:'red',attachB:'breadboard:bb:bb:d:19'}];
 p.wires=[{id:'ground',from:boardPin('GND'),to:'breadboard:bb:bb:a:19',color:'#2786d7',points:[{x:418,y:380}]}];
 return p;
}
const target={type:'part',id:'led'};
test('WritePin preview and applied main drive a mounted LED after a board reset',()=>{
 const p=fixture(),preview=exampleStatements(deviceDocs('led').sample,'HAL_GPIO_WritePin').preview;
 assert.match(preview,/HAL_GPIO_WritePin\(GPIOA, GPIO_PIN_5, GPIO_PIN_SET\)/);
 assert.doesNotMatch(preview,/GPIO_InitTypeDef|HAL_GPIO_Init|#define/);
 const q=applyDeviceExample(p,target,{api:'HAL_GPIO_WritePin'}).project;
 assert.match(managedRegion(q.code,'STEP').text,/HAL_GPIO_WritePin\(GPIOA, GPIO_PIN_5, GPIO_PIN_SET\)/);
 assert.equal(q.mcu.pins.PA5.function,'GPIO_Output');assert.deepEqual(q.wires.find(w=>w.id==='ground'),p.wires[0]);
 assert.deepEqual(cFunctions(q.code).map(f=>f.name),cFunctions(p.code).map(f=>f.name));assert.deepEqual(q.firmware.files,p.firmware.files);
 const s=new SimulationSession(q);s.tick(20);assert.equal(s.result.fault,false);assert.equal(s.result.parts.led.on,true);assert.ok(s.result.parts.led.current>0.001);
 const off=structuredClone(q);off.code=off.code.replace(/HAL_GPIO_WritePin\(GPIOA, GPIO_PIN_5, GPIO_PIN_SET\)/g,'HAL_GPIO_WritePin(GPIOA, GPIO_PIN_5, GPIO_PIN_RESET)');
 const stopped=new SimulationSession(off);stopped.tick(20);assert.equal(stopped.result.parts.led.on,false);
 assert.deepEqual(applyDeviceExample(validateProject(q),target,{api:'HAL_GPIO_WritePin'}).project,q);
});
test('reapplying WritePin repairs a missing breadboard ground and restores LED current',()=>{
 const p=applyDeviceExample(fixture(),target,{api:'HAL_GPIO_WritePin'}).project;p.wires=p.wires.filter(w=>w.id!=='ground');
 const disconnected=new SimulationSession(p);disconnected.tick(20);assert.equal(disconnected.result.parts.led.on,false);
 const {project:q,report}=applyDeviceExample(p,target,{api:'HAL_GPIO_WritePin'}),net=wiringTopology(q);
 assert.equal(net.find('part:led:b'),net.find(boardPin('GND')));assert.equal(report.addedParts,0);assert.ok(report.addedWires>=1);assert.ok(q.wires.every(w=>!w.from.startsWith('part:')&&!w.to.startsWith('part:')));
 const repaired=new SimulationSession(q);repaired.tick(20);assert.equal(repaired.result.parts.led.on,true);
});
test('LED catalog variant and a remapped output pin use the selected WritePin operation',()=>{
 for(const type of ['led','ref_led_tht_2']){const p=blankProject();p.components=[{id:'led',type,name:'LED1',x:800,y:350,rotation:0,span:70,color:'red'}];p.mcu.pins.PA5={function:'GPIO_Input',pull:'PULLUP',initial:0,edge:'FALLING',label:'USER'};
  const q=applyDeviceExample(p,target,{api:'HAL_GPIO_WritePin'}).project,pin=q.deviceDocs.bindings[0].pins.PA5;
  assert.notEqual(pin,'PA5');assert.equal(q.mcu.pins.PA5.function,'GPIO_Input');assert.match(managedRegion(q.code,'STEP').text,new RegExp('HAL_GPIO_WritePin\\(GPIO'+pin[1]+', GPIO_PIN_'+pin.slice(2)+', GPIO_PIN_SET\\)'));
  const s=new SimulationSession(q);s.tick(20);assert.equal(s.result.parts.led.on,true,type);
 }
});
