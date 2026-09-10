import test from 'node:test';
import assert from 'node:assert/strict';
import {DEVICE_DEFS,DEVICE_RANGES,ldrResistance,ntcResistance} from '../src/device-defs.js';
import {PART_LIBRARY,searchParts} from '../src/part-library.js';
import {deviceExample} from '../src/device-examples.js';
import {validateProject} from '../src/project.js';
import {SimulationSession} from '../src/session.js';
import {DeviceBuses,crc8} from '../src/device-buses.js';
import {boardPin} from '../src/pins.js';
import {terminalKeys,nominalTerminals} from '../src/components.js';
import {deviceControls,deviceShape} from '../src/device-ui.js';

const close=(a,b,epsilon=.02)=>assert.ok(Math.abs(a-b)<epsilon,`${a} != ${b}`);
function start(kind,edit=()=>{}){const p=deviceExample(kind);edit(p);const out=[],s=new SimulationSession(p,{print:x=>out.push(x)});s.tick(0);return {p,s,out};}
function until(s,end){for(let t=Math.ceil(s.runtime.microTime/1000)+10;t<=end;t+=10)s.tick(t);s.tick(end);}
const disconnect=(p,n)=>p.wires=p.wires.filter(w=>w.to!==`part:demo:p${n}`);

test('31 searchable parts include 14 distinct device models with persistent controls and real terminals',()=>{
 assert.equal(PART_LIBRARY.length,31);assert.equal(Object.keys(DEVICE_DEFS).length,14);
 for(const kind of Object.keys(DEVICE_DEFS)){
  const p=deviceExample(kind),part=p.components[0],q=validateProject(p);
  assert.deepEqual(q,p,kind);assert.equal(nominalTerminals(part).length,terminalKeys(part).length);
  assert.ok(deviceShape(part));assert.ok(searchParts(kind).some(p=>p.type===kind));
  for(const key of Object.keys(DEVICE_RANGES[kind]||{}))assert.match(deviceControls(part),new RegExp('data-part-prop="'+key+'"'));
  assert.ok(p.wires.length>=3);assert.match(p.code,/HAL_/);assert.match(p.code,/printf/);
 }
 assert.deepEqual(searchParts('온습도').map(p=>p.type),['sht31']);assert.ok(searchParts('화면').length>=3);assert.ok(searchParts('구동').length>=4);
});
test('device properties reject nonfinite, fractional discrete values and unsupported I2C addresses',()=>{
 for(const [kind,ranges]of Object.entries(DEVICE_RANGES))for(const [key,[min,max]]of Object.entries(ranges))for(const value of [NaN,min-1,max+1]){const p=deviceExample(kind);p.components[0][key]=value;assert.throws(()=>validateProject(p),undefined,kind+key);}
 for(const [kind,key,value]of [['sht31','address',0x50],['encoder','position',.5],['pir','motion',.5],['joystick','switch',.1]]){const p=deviceExample(kind);p.components[0][key]=value;assert.throws(()=>validateProject(p));}
});
test('all new HAL examples run through initialization and emit logs without circuit faults',()=>{
 for(const kind of Object.keys(DEVICE_DEFS)){const {s,out}=start(kind);until(s,2200);assert.equal(s.result.fault,false,kind);assert.ok(out.length,kind+' log');assert.equal(s.result.warnings.length,0,kind+': '+s.result.warnings);}
});
test('LDR light and NTC temperature affect the electrical divider and HAL measurement',()=>{
 close(ldrResistance(10),10000);close(ntcResistance(25),10000);
 const l=start('ldr');const bright=l.s.result.voltage(boardPin('PA0'));l.p.components[0].lux=1;l.s.changed();until(l.s,300);assert.ok(l.s.result.voltage(boardPin('PA0'))<bright/3);
 const n=start('ntc');assert.match(n.out[0],/25.0 C/);n.p.components[0].temperature=60;n.s.changed();until(n.s,300);assert.match(n.out.at(-1),/NTC=60.[01] C/);
});
test('SHT31 conversion has 15 ms readiness, CRC and a measurement snapshot',()=>{
 assert.equal(crc8([0xbe,0xef]),0x92);const bus=new DeviceBuses(),p={id:'s',type:'sht31',temperature:25,humidity:50};
 assert.equal(bus.readI2c(p,6,0),null);assert.equal(bus.writeI2c(p,[0x24,0],100),true);p.temperature=90;
 assert.equal(bus.readI2c(p,6,15099),null);const bytes=bus.readI2c(p,6,15100);assert.equal(bytes[2],crc8(bytes.slice(0,2)));assert.equal(bytes[5],crc8(bytes.slice(3,5)));close(-45+175*(bytes[0]*256+bytes[1])/65535,25);
 assert.equal(bus.readI2c(p,6,16000),null);assert.equal(bus.writeI2c(p,[0xff,0xff],0),false);
});
test('SHT31 live environment reaches HAL and missing supply/GND/SDA/SCL or wrong address NACKs',()=>{
 const {p,s,out}=start('sht31');until(s,40);assert.match(out.join(),/25.0 C RH=50.0/);p.components[0].temperature=-10;p.components[0].humidity=85;s.changed();until(s,600);assert.match(out.at(-1),/-10.0 C RH=85.0/);
 for(const n of [1,2,3,4]){const x=start('sht31',p=>disconnect(p,n));until(x.s,80);assert.match(x.out.join(),/NACK/,String(n));}
 const x=start('sht31',p=>p.components[0].address=0x45);until(x.s,80);assert.match(x.out.join(),/NACK/);
});
test('different I2C device types at the same wired address collide, including generic memory',()=>{
 const {s,out}=start('oled',p=>{p.components.push({id:'other',name:'MEM',type:'i2c',address:0x3c,x:900,y:450,rotation:0});for(let n=1;n<=4;n++)p.wires.push({id:'extra'+n,from:`part:demo:p${n}`,to:`part:other:p${n}`,color:'#23a68a'});});until(s,200);assert.match(out[0],/status=1/);assert.equal(s.result.parts.demo.visible,false);
});
test('MPU6050 WHO_AM_I, sleep, signed sample words, scale selection and software reset',()=>{
 const b=new DeviceBuses(),p={id:'imu',type:'mpu6050',ax:-1,ay:.5,az:1,gx:-100,gy:50,gz:0};
 b.writeI2c(p,[0x75],0);assert.deepEqual(b.readI2c(p,1,0),[0x68]);b.writeI2c(p,[0x3b],0);assert.deepEqual(b.readI2c(p,6,0),[0,0,0,0,0,0]);
 b.writeI2c(p,[0x6b,0],0);b.writeI2c(p,[0x3b],0);let values=b.readI2c(p,14,0);assert.deepEqual(values.slice(0,6),[0xc0,0,0x20,0,0x40,0]);assert.deepEqual(values.slice(8,10),[0xcc,0xd4]);
 b.writeI2c(p,[0x1c,8],0);b.writeI2c(p,[0x3b],0);assert.deepEqual(b.readI2c(p,2,0),[0xe0,0]);
 b.writeI2c(p,[0x6b,128],0);assert.equal(b.state(p).registers[0x6b],64);
 assert.throws(()=>b.writeI2c(p,[0x75,0],0),/지원하지/);
});
test('MPU6050 HAL logs signed live axes and restores sleeping state after power loss',()=>{
 const {p,s,out}=start('mpu6050');until(s,30);p.components[0].ax=-.5;p.components[0].gz=90;s.changed();until(s,300);assert.match(out.at(-1),/g=\(-0.50,0.00,1.00\) dps=\(0.0,0.0,90.0\)/);
 disconnect(p,1);s.changed();assert.equal(s.buses.devices.state(p.components[0]).registers[0x6b],64);
});
test('PIR drives GPIO EXTI only while powered and reacts to both detection edges',()=>{
 const {p,s,out}=start('pir');p.components[0].motion=1;s.changed();s.runtime.pollInterrupts();until(s,20);assert.ok(out.includes('PIR EXTI motion=1'));p.components[0].motion=0;s.changed();s.runtime.pollInterrupts();until(s,40);assert.ok(out.includes('PIR EXTI motion=0'));
 disconnect(p,1);p.components[0].motion=1;s.changed();assert.equal(s.result.parts.demo.motion,false);assert.ok(s.result.voltage(boardPin('PA10'))<1);
});
test('SSD1306 commands address real framebuffer bytes and reject unsupported commands',()=>{
 const b=new DeviceBuses(),p={id:'o',type:'oled'};b.writeI2c(p,[0,0xaf,0x20,0,0x21,4,5,0x22,1,2],0);b.writeI2c(p,[0x40,1,2,3,4],0);const s=b.state(p);assert.equal(s.display,true);assert.deepEqual([s.ram[132],s.ram[133],s.ram[260],s.ram[261]],[1,2,3,4]);assert.deepEqual([s.col,s.page],[4,1]);
 b.writeI2c(p,[0,0xa7,0xae],0);assert.equal(s.invert,true);assert.equal(s.display,false);assert.throws(()=>b.writeI2c(p,[0,0x26],0),/지원하지/);assert.throws(()=>b.writeI2c(p,[0,0x21,100,200],0),/범위/);
});
test('OLED HAL frames change pixels, while disconnecting power clears and hides the screen',()=>{
 const {p,s}=start('oled');until(s,180);const a=[...s.result.parts.demo.device.ram];assert.ok(a.some(Boolean));until(s,800);assert.notDeepEqual([...s.result.parts.demo.device.ram],a);disconnect(p,1);s.changed();assert.equal(s.result.parts.demo.visible,false);assert.ok(s.result.parts.demo.device.ram.every(x=>x===0));
});
test('ST7735 HAL paints complete red green blue bars through CS/DC/RST and RGB565',()=>{
 const {s}=start('tft');until(s,3200);const r=s.result.parts.demo;assert.equal(r.visible,true);for(const y of [0,80,159]){assert.equal(r.device.ram[y*128],0xf800);assert.equal(r.device.ram[y*128+50],0x7e0);assert.equal(r.device.ram[y*128+100],31);}
 for(const pin of [1,3,4,5,7]){const x=start('tft',p=>disconnect(p,pin));until(x.s,500);assert.ok(x.s.result.parts.demo.device.ram.every(n=>!n),'pin '+pin);}
});
test('ST7735 reset and address windows bound pixel writes; unsupported format is explicit',()=>{
 const b=new DeviceBuses(),p={id:'t',type:'tft'},r={voltage:id=>id.endsWith('p6')?r.dc:3.3,dc:0};
 const cmd=(v,bytes=[])=>{r.dc=0;b.transfer(p,v,r);r.dc=3.3;bytes.forEach(x=>b.transfer(p,x,r));};
 cmd(0x11);cmd(0x29);cmd(0x2a,[0,1,0,1]);cmd(0x2b,[0,2,0,2]);cmd(0x2c,[0xf8,0]);assert.equal(b.state(p).ram[257],0xf800);assert.equal(b.state(p).ram.filter(Boolean).length,1);
 assert.throws(()=>cmd(0x3a,[0x66]),/RGB565/);cmd(1);assert.ok(b.state(p).ram.every(n=>!n));assert.equal(b.state(p).sleep,true);
});
test('MAX7219 only latches two-byte register writes on LOAD rising, with shutdown and scan state',()=>{
 const {p,s}=start('matrix');until(s,40);assert.equal(s.result.parts.demo.visible,true);assert.deepEqual([...s.result.parts.demo.device.ram],[1,2,4,8,16,32,64,128]);
 const b=new DeviceBuses(),part=p.components[0],state=b.state(part);b.transfer(part,1);b.transfer(part,0xaa);assert.equal(state.ram[0],0);b.latchMatrix(state);assert.equal(state.ram[0],0xaa);
 b.transfer(part,12);b.transfer(part,1);b.latchMatrix(state);assert.equal(state.display,true);b.transfer(part,12);b.transfer(part,0);b.latchMatrix(state);assert.equal(state.display,false);
});
test('servo decodes pulse width, moves at limited speed, and rejects DC or unpowered input',()=>{
 const {s,p}=start('servo');until(s,100);const a=s.result.parts.demo.angle;assert.ok(a>55&&a<70);until(s,500);close(s.result.parts.demo.angle,0);until(s,1700);close(s.result.parts.demo.angle,90,.1);disconnect(p,3);s.changed();until(s,1900);assert.equal(s.result.parts.demo.on,false);
 for(const edit of [p=>p.simulation.pwmWaveform=false,p=>disconnect(p,1)]){const x=start('servo',edit);until(x.s,500);assert.equal(x.s.result.parts.demo.on,false);close(x.s.result.parts.demo.angle,90);}
});
test('DC motor follows PWM duty and reversed direction with inertia, independent of integration step',()=>{
 const a=start('motor'),b=start('motor',p=>p.simulation.stepMs=.1);until(a.s,1000);until(b.s,1000);close(a.s.result.parts.demo.rpm,2250,12);close(a.s.result.parts.demo.rpm,b.s.result.parts.demo.rpm,8);
 until(a.s,2200);assert.ok(a.s.result.parts.demo.rpm < -900);disconnect(a.p,1);a.s.changed();until(a.s,3000);assert.ok(Math.abs(a.s.result.parts.demo.rpm)<10);
});
test('stepper counts ordered phases in both directions without zero-time ghost steps',()=>{
 const {s}=start('stepper');until(s,700);const forward=s.result.parts.demo.steps;assert.ok(forward>80);until(s,1450);assert.ok(s.result.parts.demo.steps<forward/2);
 const b=start('stepper',p=>disconnect(p,1));until(b.s,500);assert.equal(b.s.result.parts.demo.steps,0);
});
test('relay switches real COM/NO/NC load paths and releases on loss of power',()=>{
 const {p,s}=start('relay');assert.equal(s.result.parts.led1.on,true);assert.ok(s.result.parts.led1.current>.003);until(s,1100);assert.equal(s.result.parts.led1.on,false);
 const nc=start('relay',p=>p.wires=p.wires.map(w=>({...w,from:w.from==='part:demo:p5'?'part:demo:p6':w.from})));assert.equal(nc.s.result.parts.led1.on,false);until(nc.s,1100);assert.equal(nc.s.result.parts.led1.on,true);
 const x=start('relay');disconnect(x.p,1);x.s.changed();assert.equal(x.s.result.parts.led1.on,false);assert.equal(x.s.result.parts.demo.contact,'NC');
});
test('joystick HAL switches ADC channels and sees the real active-low button',()=>{
 const {p,s,out}=start('joystick');p.components[0].axisX=25;p.components[0].axisY=75;p.components[0].switch=1;s.changed();until(s,150);assert.match(out.at(-1),/X=102[34] Y=307[01] pressed=1/);
});
test('encoder schedules quadrature edges, EXTI decodes both directions and power loss stops output',()=>{
 const {p,s,out}=start('encoder');p.components[0].position=3;s.changed();until(s,120);assert.match(out.at(-1),/count=3 edges=12/);p.components[0].position=1;s.changed();until(s,240);assert.match(out.at(-1),/count=1 edges=4/);
 disconnect(p,1);s.changed();p.components[0].position=2;s.changed();until(s,360);assert.equal(s.result.parts.demo.pending,0);
});
