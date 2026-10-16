import test from 'node:test';
import assert from 'node:assert/strict';
import {DEVICE_CATALOG} from '../src/device-catalog-data.js';
import {CATALOG_BY_TYPE,CATALOG_DEFS,catalogType} from '../src/catalog-defs.js';
import {PART_LIBRARY} from '../src/part-library.js';
import {terminalKeys,attachments} from '../src/components.js';
import {catalogShape} from '../src/catalog-render.js';
import {halExample} from '../src/hal-examples.js';
import {searchHalExamples} from '../src/hal-example-search.js';
import {exampleProject as blankProject,validateProject} from '../src/project.js';
import {compileHal} from '../src/hal-source.js';
import {SimulationSession} from '../src/session.js';
import {deviceDocs,wiringTopology} from '../src/device-docs-data.js';
import {applyDeviceExample} from '../src/device-assistance.js';
import {managedRegion} from '../src/device-code-insertion.js';
import {WireDraft} from '../src/wire-draft.js';
import {boardPin} from '../src/pins.js';
const part=type=>({id:'selected',type,name:CATALOG_DEFS[type].name,x:850,y:350,rotation:0,...CATALOG_DEFS[type].defaults});
const run=(id,until=200)=>{const p=halExample(catalogType(id)),output=[],session=new SimulationSession(p,{print:s=>output.push(s)});for(let t=0;t<=until;t+=10)session.tick(t);return {p,session,output};};
test('80 references have distinct physical assets and pins; all 35 older part formats remain available',()=>{
 assert.equal(DEVICE_CATALOG.length,80);assert.equal(Object.keys(CATALOG_BY_TYPE).length,78);assert.equal(PART_LIBRARY.filter(p=>p.type!=='board'&&!p.type.startsWith('ref_')).length,35);
 for(const [type,ref]of Object.entries(CATALOG_BY_TYPE)){const p=part(type),def=CATALOG_DEFS[type];assert.equal(terminalKeys(p).length,ref.pins.length,type);assert.equal(def.terminals.length,ref.pins.length,type);assert.equal(new Set(def.terminals.map(p=>p.join(','))).size,ref.pins.length,type);assert.match(catalogShape(p),new RegExp('data-reference="'+ref.id+'"'));assert.ok(ref.source.every(s=>s.url.startsWith('https://')));}
 assert.equal(CATALOG_BY_TYPE.ref_sevenseg_4digit_12.pins.length,14);
 assert.deepEqual(CATALOG_BY_TYPE.ref_l298p_bare_20.pins.slice(0,6),['GND1','SENSE-A','NC3','OUT1','OUT2','VS']);
 assert.deepEqual(CATALOG_BY_TYPE.ref_urm09_trig_3.pins,['GND','VCC','TRIG-ECHO']);
});
test('every reference has valid C, wiring and Docs; all basic HAL examples execute in the circuit',()=>{
 const arm=[];
 for(const ref of DEVICE_CATALOG){const type=catalogType(ref.id),p=validateProject(halExample(type));assert.ok(compileHal(p.code),type);if(!['board','breadboard'].includes(ref.family))assert.ok(deviceDocs(type).wiring.length,type);
  if(p.ide?.native?.target==='arm'){arm.push(ref.id);continue;}const session=new SimulationSession(p);for(let t=0;t<=150;t+=10)session.tick(t);assert.equal(session.result.fault,false,type);
 }
 assert.deepEqual(arm,[]);
});
test('all catalog Docs merge actual code into main.c, preserve user code and round trip',()=>{
 for(const type of Object.keys(CATALOG_BY_TYPE)){
  const p=blankProject();p.components=[part(type)];p.code+='\nint userValue(void){return 123;}\n';
  const {project:q}=applyDeviceExample(p,{type:'part',id:'selected'});assert.ok(managedRegion(q.code,'INIT'),type);assert.ok(managedRegion(q.code,'DECLARATIONS'),type);assert.match(q.code,/int userValue/);assert.ok(!q.firmware.files.some(f=>f.name.startsWith('stm_device_docs')));assert.deepEqual(validateProject(JSON.parse(JSON.stringify(q))),q);
 }
});
test('function selection inserts different dependency prefixes for transmit and receive',()=>{
 const p=blankProject();p.components=[part('ref_spi_eeprom_8')];
 const a=applyDeviceExample(p,{type:'part',id:'selected'},{api:'HAL_SPI_Transmit'}).project,b=applyDeviceExample(p,{type:'part',id:'selected'},{api:'HAL_SPI_Receive'}).project;
 assert.notEqual(a.code,b.code);assert.doesNotMatch(managedRegion(a.code,'INIT').text,/HAL_SPI_Receive/);assert.match(managedRegion(b.code,'INIT').text,/HAL_SPI_Receive/);
 assert.ok(deviceDocs('ref_ads1115_10').functions.some(f=>f.name==='HAL_I2C_Master_Receive'));
});
test('example search covers pin variants, HAL function identifiers and no-match queries',()=>{
 assert.ok(searchHalExamples('부저 3핀').length>=2);assert.ok(searchHalExamples('HAL_I2C_Mem_Read').some(x=>x.id==='ref_ds3231_8'));assert.ok(searchHalExamples('14핀').some(x=>x.id==='ref_sevenseg_4digit_12'));assert.equal(searchHalExamples('no_such_example_xyz').length,0);
});
test('mounted LED and resistor variant examples retain their original electrical attachments',()=>{
 for(const id of ['led-tht-2','resistor-axial-2']){const {p,session}=run(id,10),device=p.components.find(c=>c.type===catalogType(id));assert.equal(Object.keys(attachments(device)).length,2);if(id==='led-tht-2')assert.equal(session.result.parts[device.id].on,true);}
});
test('new I2C and SPI commands produce measured values and live display memory',()=>{
 assert.ok(run('ads1115-10').output.some(s=>s.includes('3.3000 V')));assert.ok(run('mcp4725-6').output[0].includes('1.650 V'));
 assert.equal(run('lcd-i2c-4').session.result.parts.demo.lcd.lines[0].trim(),'STM Emulator');
 for(const id of ['oled-configurable-7','oled-configurable-8']){const read=run(id).session.result.parts.demo;assert.equal(read.visible,true);assert.ok(read.device.ram.some(Boolean));}
 assert.deepEqual(run('rgb-gravity-3').session.result.parts.demo.device.color,[8,16,16]);
 assert.ok(run('sd-storage-board').output.some(s=>s.includes('SD OCR=40ff8000')));
 assert.ok(run('spi-eeprom-8').output.includes('42'));
});
test('stepper phases, TM1637 bytes and multiplexed digits produce observable output',()=>{
 for(const id of ['stepper-bipolar-4','stepper-unipolar-5'])assert.ok(run(id).session.result.parts.demo.steps>0,id);
 assert.ok(run('stepper-driver-11').session.result.parts.motor.steps>0);
 assert.deepEqual(run('sevenseg-tm1637-4',600).session.result.parts.demo.digits,[6,91,79,102]);
 assert.deepEqual(run('sevenseg-4digit-12',200).session.result.parts.demo.digits,[6,91,79,102]);
});
test('shared-net short is removed while unrelated wire routing stays intact',()=>{
 const p=blankProject();p.components=[part('ref_pot_bare_3')];p.wires=[{id:'short',from:boardPin('3V3'),to:boardPin('GND'),color:'#dd654c'},{id:'safe',from:boardPin('PC5'),to:'bb:a:24',points:[{x:900,y:620}],color:'#23a68a'}];
 const q=applyDeviceExample(p,{type:'part',id:'selected'}).project,net=wiringTopology(q);assert.notEqual(net.find(boardPin('3V3')),net.find(boardPin('GND')));assert.deepEqual(q.wires.find(w=>w.id==='safe'),p.wires[1]);
});
test('wire drafts retain bends only on completion; backspace and cancel do not leave electrical stubs',()=>{
 const d=new WireDraft();d.add('A',{x:20,y:30});d.add('A',{x:40,y:50});d.back();assert.match(d.path('A',{x:0,y:0},{x:100,y:50}),/L20 30/);assert.deepEqual(d.finish('A'),{points:[{x:20,y:30}]});assert.deepEqual(d.finish('B'),{});d.add('C',{x:10,y:20});d.reset();assert.equal(d.points.length,0);
});

test('physical pin voltage and network diagnostics remain correct after a live recompute',async()=>{
 const {topology,solveCircuit}=await import('../src/engine.js');const {circuitDiagnostics}=await import('../src/circuit-diagnostics.js');
 const {p,session}=run('pot-module-3');const d=p.components.find(p=>p.type==='ref_pot_module_3');session.setPressed({});
 assert.ok(Math.abs(session.viewResult.voltage('part:'+d.id+':p3')-1.65)<.01);
 assert.equal(session.viewResult.uf.find('part:'+d.id+':p3'),session.viewResult.uf.find(boardPin('PA0')));
 assert.ok(Math.abs(solveCircuit(p).voltage('part:'+d.id+':p3')-1.65)<.01);
 assert.equal(topology(p).find('part:'+d.id+':p2'),topology(p).find(boardPin('GND')));
 assert.ok(!circuitDiagnostics(p,session.viewResult).some(i=>i.id.startsWith('power:')));
});

test('variant Docs preserve custom UART baud, I2C address and servo register pulse',async()=>{
 const {baremetalCards}=await import('../src/device-baremetal.js');
 let p=blankProject();p.components=[{...part('ref_uart_cable_6'),baud:115200}];let q=applyDeviceExample(p,{type:'part',id:'selected'}).project;assert.equal(q.mcu.peripherals.USART2.baud,115200);
 p=blankProject();p.components=[{...part('ref_sht31_breakout_7'),address:0x45}];q=applyDeviceExample(p,{type:'part',id:'selected'},{mode:'baremetal',api:'i2c-transfer'}).project;assert.match(managedRegion(q.code,'STEP').text,/0x45/);
 const sample=halExample('ref_servo_3'),card=baremetalCards(sample.mcu,'ref_servo_3',sample).find(c=>c.id==='timer-compare');assert.match(card.code,/1500U/);
});

test('ordinary RGB GPIO examples preserve an already configured project clock',()=>{
 const p=blankProject();p.mcu.pins.PA5={function:'GPIO_Output',pull:'NOPULL',initial:0,label:'',edge:'CHANGE'};p.components=[part('ref_rgb_common_anode_4')];
 const q=applyDeviceExample(p,{type:'part',id:'selected'}).project;assert.equal(q.mcu.timerClockHz,p.mcu.timerClockHz);
});
