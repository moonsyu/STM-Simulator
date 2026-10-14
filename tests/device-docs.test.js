import test from 'node:test';
import assert from 'node:assert/strict';
import {PART_LIBRARY} from '../src/part-library.js';
import {PART_DEFS} from '../src/components.js';
import {blankProject,validateProject} from '../src/project.js';
import {deviceDocs,expectedNets,wiringTopology} from '../src/device-docs-data.js';
import {applyDeviceExample} from '../src/device-assistance.js';
import {halExample} from '../src/hal-examples.js';
import {boardPin} from '../src/pins.js';
import {SimulationSession} from '../src/session.js';
import {insertMainHooks} from '../src/c-source-edit.js';
const add=(p,type,id='selected')=>p.components.push({id,type,name:type,x:800,y:350,rotation:0,span:70,...PART_DEFS[type]?.defaults,...(type==='resistor'?{value:10000}:{}),...(type==='led'?{color:'red'}:{})});
test('code hooks skip finite initialization loops, strings and closed conditional blocks',()=>{
 const source='int main(void) {\n for (int i=0;i<2;i++) { setupPin(i); }\n if (1) { printf("while(1) { fake }"); }\n while(1) { userWork(); }\n}';const edited=insertMainHooks(source);assert.match(edited,/while\(1\) \{\s*STM_Devices_Step\(\);\s*userWork/);assert.equal((edited.match(/STM_Devices_Init\(\);/g)||[]).length,1);assert.match(edited,/for \(int i=0;i<2;i\+\+\) \{ setupPin\(i\); \}/);assert.throws(()=>insertMainHooks('int main(void) { return 0; }'),/실행 루프/);
});
test('all 35 components and board have wiring docs and merge runnable HAL into current source',()=>{
 for(const type of [...PART_LIBRARY.map(d=>d.type),'board']){const p=blankProject();if(type!=='board')add(p,type);p.code+='\nint userKeep(void) { return 42; }\n';const docs=deviceDocs(type);assert.ok(docs.overview&&docs.guide&&docs.wiring.length&&docs.functions.length,type);const {project}=applyDeviceExample(p,type==='board'?{type:'surface',id:'board'}:{type:'part',id:'selected'});assert.match(project.code,/int userKeep\(void\) \{ return 42; \}/);assert.equal(p.wires.length,0);const s=new SimulationSession(project,{print:()=>{}});for(let t=0;t<=150;t+=5)s.tick(t);assert.equal(s.result.fault,false,type);}
});
test('reapplying after persistence is idempotent and keeps correct breadboard wiring',()=>{
 const p=halExample('blink');p.components.find(c=>c.type==='resistor').value=470;const before=structuredClone(p.wires);const first=applyDeviceExample(p,{type:'part',id:'led1'});assert.deepEqual(first.project.wires,before);assert.equal(first.project.components.length,2);assert.equal(first.project.components.find(c=>c.type==='resistor').value,470);const again=applyDeviceExample(validateProject(JSON.parse(JSON.stringify(first.project))),{type:'part',id:'led1'});assert.deepEqual(again.project,first.project);
});
test('missing and wrong leads are repaired while unrelated wiring and source stay intact',()=>{
 const p=blankProject();add(p,'potentiometer');add(p,'led','unrelated');p.wires=[{id:'wrong',from:'part:selected:p1',to:boardPin('5V'),color:'#ff0000'},{id:'keep',from:'part:unrelated:a',to:'bb:a:24',color:'#123456'}];const {project,report}=applyDeviceExample(p,{type:'part',id:'selected'});assert.ok(report.removedWires>0);assert.ok(project.wires.some(w=>w.id==='keep'));assert.ok(!project.wires.some(w=>w.id==='wrong'));const uf=wiringTopology(project);assert.equal(uf.find('part:selected:p1'),uf.find(boardPin('GND')));assert.equal(uf.find('part:selected:p3'),uf.find(boardPin('3V3')));
});
test('two selected devices get separate GPIO and helper namespaces without duplicate main',()=>{
 let p=blankProject();add(p,'rgb','one');add(p,'rgb','two');p=applyDeviceExample(p,{type:'part',id:'one'}).project;p=applyDeviceExample(p,{type:'part',id:'two'}).project;const [a,b]=p.deviceDocs.bindings;assert.equal(Object.values(a.pins).some(pin=>Object.values(b.pins).includes(pin)),false);const s=new SimulationSession(p,{print:()=>{}});for(let t=0;t<=2100;t+=100)s.tick(t);assert.equal(s.result.fault,false);assert.equal((p.code.match(/STM_Devices_Step\(\);/g)||[]).length,1);
});
test('edited generated files are protected and failed apply has no side effects',()=>{
 const p=blankProject();add(p,'led');const ready=applyDeviceExample(p,{type:'part',id:'selected'}).project;ready.firmware.files.find(f=>f.name==='stm_device_docs.c').text+='\n// personal change';const text=JSON.stringify(ready);assert.throws(()=>applyDeviceExample(ready,{type:'part',id:'selected'}),/직접 수정/);assert.equal(JSON.stringify(ready),text);
});
test('valid alternative ADC wiring and a nondefault I2C address are preserved',()=>{
 let p=blankProject();add(p,'potentiometer');p.wires=[{id:'signal',from:boardPin('PC0'),to:'part:selected:p2',color:'#abcdef'}];p=applyDeviceExample(p,{type:'part',id:'selected'}).project;assert.equal(p.deviceDocs.bindings[0].pins.PA0,'PC0');assert.ok(p.wires.some(w=>w.id==='signal'));let out=[];let s=new SimulationSession(p,{print:x=>out.push(x)});s.tick(0);assert.match(out.join(),/1.650/);
 p=blankProject();add(p,'sht31');p.components[0].address=0x45;p=applyDeviceExample(p,{type:'part',id:'selected'}).project;out=[];s=new SimulationSession(p,{print:x=>out.push(x)});for(let t=0;t<100;t++)s.tick(t);assert.match(out.join(),/25.0/);assert.doesNotMatch(out.join(),/CRC error|timeout/i);
});
test('shared ADC and independent PWM timers work when multiple device examples are installed',()=>{
 let p=blankProject();for(const type of ['potentiometer','ntc','servo','motor'])add(p,type,type);for(const type of ['potentiometer','ntc','servo','motor'])p=applyDeviceExample(p,{type:'part',id:type}).project;assert.notEqual(p.deviceDocs.bindings[2].peripherals.TIM2,p.deviceDocs.bindings[3].peripherals.TIM2);const s=new SimulationSession(p,{print:()=>{}});for(let t=0;t<2500;t+=10)s.tick(t);assert.equal(s.result.fault,false);
});
test('a breadboard example mounts its LED and resistor on the selected breadboard',()=>{
 let p=blankProject();add(p,'breadboard');p=applyDeviceExample(p,{type:'part',id:'selected'}).project;for(const part of p.components.filter(c=>c.type!=='breadboard')){assert.match(part.attachA,/^breadboard:selected:/);assert.match(part.attachB,/^breadboard:selected:/);}const s=new SimulationSession(p,{print:()=>{}});s.tick(0);assert.equal(s.result.fault,false);
});
test('separate UART terminals receive on distinct peripherals and duplicate I2C addresses fail atomically',()=>{
 let p=blankProject();add(p,'uart','a');add(p,'uart','b');for(const id of ['a','b'])p=applyDeviceExample(p,{type:'part',id}).project;const s=new SimulationSession(p,{print:()=>{}});for(let t=0;t<100;t+=5)s.tick(t);assert.match(s.buses.received.get('a'),/HAL UART ready/);assert.match(s.buses.received.get('b'),/HAL UART ready/);assert.notEqual(p.deviceDocs.bindings[0].peripherals.USART2,p.deviceDocs.bindings[1].peripherals.USART2);
 p=blankProject();add(p,'sht31','a');add(p,'sht31','b');p=applyDeviceExample(p,{type:'part',id:'a'}).project;const before=JSON.stringify(p);assert.throws(()=>applyDeviceExample(p,{type:'part',id:'b'}),/같은 I2C 버스/);assert.equal(JSON.stringify(p),before);
});
