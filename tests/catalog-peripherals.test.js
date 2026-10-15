import test from 'node:test';
import assert from 'node:assert/strict';
import {halExample} from '../src/hal-examples.js';
import {catalogType} from '../src/catalog-defs.js';
import {SimulationSession} from '../src/session.js';
import {blankProject} from '../src/project.js';
import {applyDeviceExample} from '../src/device-assistance.js';
import {boardPin} from '../src/pins.js';

function start(id,edit=()=>{}){const p=halExample(catalogType(id));edit(p);const output=[],s=new SimulationSession(p,{print:v=>output.push(v)});return {p,s,output};}
function advance(s,time){for(let t=s.runtime.time;t<time;t=Math.min(time,t+10))s.tick(t);s.tick(time);return s.result.parts.demo;}
const disconnect=(p,pin)=>{p.wires=p.wires.filter(w=>w.from!==`part:demo:p${pin}`&&w.to!==`part:demo:p${pin}`);};

test('DS18B20 conversion waits, signed temperature and CRC bytes are read through GPIO',()=>{
 for(const id of ['ds18b20-to92-3','ds18b20-probe-3']){
  const {p,s,output}=start(id,p=>p.components[0].temperature=-12.5);advance(s,600);assert.deepEqual(output,[]);advance(s,850);assert.ok(output.includes('DS18B20=-12.50 C'),id);
  p.components[0].temperature=31.25;advance(s,1900);assert.ok(output.includes('DS18B20=31.25 C'),id+' live input');
 }
 for(const pin of [1,2,3]){const {s,output}=start('ds18b20-to92-3',p=>disconnect(p,pin));advance(s,30);assert.ok(output.includes('DS18B20 presence timeout'),'disconnected pin '+pin);}
});

test('DHT11/22 decode real response pulses and checksum; missing data/power times out',()=>{
 for(const [id,t]of [['dht11-module-3',35],['dht22-module-3',-12.5]]){
  const {s,output}=start(id,p=>Object.assign(p.components[0],{temperature:t,humidity:63.4}));advance(s,2100);assert.ok(output.includes(`humidity=63.4% temperature=${t.toFixed(1)} C`),id);
  for(const pin of [1,3]){const {s,output}=start(id,p=>disconnect(p,pin));advance(s,2100);assert.ok(output.includes('DHT timeout/checksum error'),id+' pin '+pin);}
 }
});

test('URM09 single-pin trigger/echo follows changed distance and loses output when disconnected',()=>{
 const {p,s,output}=start('urm09-trig-3',p=>p.components[0].distance=123);advance(s,40);assert.ok(output.includes('URM09=123.0 cm'));
 p.components[0].distance=200;advance(s,140);assert.ok(output.includes('URM09=200.0 cm'));const count=output.length;disconnect(p,2);s.changed();advance(s,300);assert.equal(output.length,count);assert.equal(s.result.parts.demo.powered,false);assert.equal(s.project.components[0].catalogState.high,false);
});

test('CAN explicit loopback receives data; normal mode reports absent ACK and filters reject IDs',()=>{
 const loop=start('can-transceiver-6');advance(loop.s,30);assert.ok(loop.output.includes('CAN id=123 length=2'));assert.equal(loop.s.hal.catalog.can.errors,0);
 const normal=start('can-transceiver-6',p=>p.code=p.code.replace('hcan.Init.Mode=CAN_MODE_LOOPBACK','hcan.Init.Mode=CAN_MODE_NORMAL'));advance(normal.s,30);assert.equal(normal.s.hal.catalog.can.errors,32);assert.ok(!normal.output.some(s=>s.startsWith('CAN id=')));
 const filtered=start('can-transceiver-6',p=>p.code=p.code.replace('filter.FilterBank=0;','filter.FilterBank=0;filter.FilterIdHigh=0x2460;filter.FilterMaskIdHigh=0xFFE0;'));advance(filtered.s,30);assert.ok(filtered.output.includes('CAN id=123 length=2'));
 const rejected=start('can-transceiver-6',p=>p.code=p.code.replace('filter.FilterBank=0;','filter.FilterBank=0;filter.FilterIdHigh=0x2480;filter.FilterMaskIdHigh=0xFFE0;'));advance(rejected.s,30);assert.ok(!rejected.output.some(s=>s.startsWith('CAN id=')));
});

test('I2S PCM samples, clock routes and shutdown affect amplifier output',()=>{
 const {p,s}=start('max98357a-9');let r=advance(s,100);assert.ok(r.frames>0);assert.equal(r.rate,16000);assert.equal(r.frequency,1000);assert.ok(r.rms>0);assert.equal(r.on,true);
 const frames=r.frames;const sd=p.wires.find(w=>w.to==='part:demo:p7');sd.from=boardPin('GND');s.changed();r=advance(s,130);assert.equal(r.on,false);assert.equal(r.frames,frames);
 for(const pin of [1,3,4,5]){const broken=start('max98357a-9',p=>disconnect(p,pin));const read=advance(broken.s,100);assert.equal(read.on,false,'disconnected pin '+pin);assert.ok(!read.frames);}
 const wrongClock=start('max98357a-9',p=>p.code=p.code.replace('clock.PLLI2S.PLLI2SR=2','clock.PLLI2S.PLLI2SR=7'));assert.throws(()=>advance(wrongClock.s,30),/I2S2/);
});

test('OV2640 banked identification requires clock, reset release, power and SCCB',()=>{
 const {s,output}=start('ov2640-camera');advance(s,100);assert.ok(output.includes('OV2640 sensor PID/VER=26 42'));
 for(const pin of [1,3,4,8,17]){const broken=start('ov2640-camera',p=>disconnect(p,pin));advance(broken.s,200);assert.ok(broken.output.includes('OV2640 SCCB timeout: check XCLK/reset/power'),'pin '+pin);}
 const wrongBank=start('ov2640-camera',p=>p.code=p.code.replace('bank[1]={1}','bank[1]={0}'));advance(wrongBank.s,100);assert.ok(wrongBank.output.includes('OV2640 sensor PID/VER=00 00'));
});

test('all eight added protocol examples run after Docs inserts them into main.c',()=>{
 for(const [id,time,expected]of [['ds18b20-to92-3',850,'DS18B20='],['ds18b20-probe-3',850,'DS18B20='],['dht11-module-3',2100,'humidity='],['dht22-module-3',2100,'humidity='],['urm09-trig-3',50,'URM09='],['can-transceiver-6',50,'CAN id='],['max98357a-9',50,null],['ov2640-camera',100,'OV2640 sensor PID/VER=26 42']]){
  const p=blankProject(),sample=halExample(catalogType(id));p.components=[{...sample.components[0],id:'selected'}];const q=applyDeviceExample(p,{type:'part',id:'selected'}).project,output=[],s=new SimulationSession(q,{print:v=>output.push(v)});advance(s,time);assert.equal(s.result.fault,false,id);if(expected)assert.ok(output.some(v=>v.includes(expected)),id+': '+output.join('\n'));else assert.ok(s.result.parts.selected.frames>0);
 }
});
