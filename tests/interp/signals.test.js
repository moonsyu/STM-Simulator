import test from 'node:test';
import assert from 'node:assert/strict';
import {run,advance} from './helpers.js';
import {halExample} from '../../src/hal-examples.js';
import {validateProject,blankProject} from '../../src/project.js';
import {SignalRecorder,NoiseModel,encodeUart,sampleUart,encodeI2c,encodeSpi,validateNoise,NOISE_DEFAULTS,signalsApi} from '../../src/signals.js';

test('generic recorder: bus channels with lines, samples start at fromUs, decoders for UART/I2C/SPI/1-Wire',()=>{
 const r=new SignalRecorder();r.define('U.TX',{label:'U TX',protocol:'uart',params:{baud:115200}});let t=10;for(const v of [0x41,0x0a]){const f=encodeUart(t,v,{baud:115200});r.write('U.TX',f.edges);t=f.endUs+5;}
 assert.deepEqual(r.channels()[0],{id:'U.TX',label:'U TX',protocol:'uart',lines:[{id:'U.TX',label:'U TX',pins:[]}]});
 const s=r.samples('U.TX',5,200);assert.deepEqual(s[0],[5,1]);assert.ok(s.every((x,i)=>!i||x[0]>s[i-1][0]));assert.deepEqual(r.decode('U.TX').map(f=>f.label),["0x41 'A'",'0x0A']);
 for(const role of ['scl','sda'])r.define('I.'+role,{label:role,protocol:'i2c',group:'I2C',busLabel:'I2C',params:{role}});const i=encodeI2c(1000,{bytes:[0xa1,0x55],drivers:['master','slave'],ackFn:k=>k===0});r.write('I.scl',i.scl);r.write('I.sda',i.sda);
 assert.deepEqual(r.decode('I2C').map(f=>f.label),['START','ADDR 0x50 R ACK','0x55 NACK','STOP']);
 r.define('W',{protocol:'onewire'});const e=[[0,1],[10,0],[510,1],[580,0],[690,1],[1000,0],[1006,1],[1070,0],[1130,1]];r.write('W',e);assert.deepEqual(r.decode('W').map(f=>f.label).slice(0,2),['RESET','PRESENCE']);
});
test('noise model: deterministic, validated, corrupts UART frames into framing/parity/noise errors',()=>{
 assert.deepEqual(validateNoise(undefined),NOISE_DEFAULTS);assert.throws(()=>validateNoise({enabled:true,bitErrorRate:2}),/0~1/);assert.throws(()=>validateNoise({jitterNs:-1}),/jitter/);
 const n=new NoiseModel({enabled:true,bitErrorRate:.05,glitchRate:.05});let fe=0,pe=0,ne=0,bad=0;
 for(let k=0;k<400;k++){const f=encodeUart(0,0x5a,{baud:9600,parity:'even',noise:n});fe+=f.fe;pe+=f.pe;ne+=f.ne;bad+=f.value!==0x5a;}assert.ok(fe>0&&pe>0&&ne>0&&bad>0,JSON.stringify({fe,pe,ne,bad}));
 const clean=encodeUart(0,0x5a,{baud:9600,parity:'odd'});assert.deepEqual([clean.value,clean.fe,clean.pe,clean.ne],[0x5a,false,false,false]);assert.equal(sampleUart(clean.edges,0,{baud:9600,parity:'odd'}).value,0x5a);
 const spi=encodeSpi(0,0x9f,{answer:v=>v^0xff,noise:new NoiseModel({enabled:true,bitErrorRate:1})});assert.equal(spi.mosiSeen,0x60);assert.equal(spi.misoSeen,spi.reply^0xff);
});
test('session.signals: UART/I2C/SPI traffic is recorded with the shared facade shape; record() captures GPIO',()=>{
 const {s}=run(halExample('i2c'));advance(s,5);const ch=s.signals.channels().find(c=>c.id==='I2C1');assert.equal(ch.protocol,'i2c');assert.deepEqual(ch.lines.map(l=>l.id),['I2C1.SCL','I2C1.SDA']);
 assert.deepEqual(s.signals.decode('I2C1').filter(f=>f.label.startsWith('ADDR')).map(f=>f.label),['ADDR 0x50 W ACK','ADDR 0x50 W ACK','ADDR 0x50 R ACK']);
 assert.equal(typeof s.signals.now(),'number');assert.deepEqual(s.signals.noise(),NOISE_DEFAULTS);
 const b=run(halExample('blink'));b.s.signals.record(['PA5']);advance(b.s,1100,50);const g=b.s.signals.samples('GPIO.PA5',0,2e6);assert.ok(g.length>=3);assert.equal(b.s.signals.channels().find(c=>c.id==='GPIO.PA5').protocol,'gpio');
 const u=run(halExample('uart'));advance(u.s,30);assert.match(u.s.signals.decode('USART2.TX').map(f=>String.fromCharCode(f.value)).join(''),/HAL UART ready/);
});
test('wire noise makes HAL_UART_ErrorCallback report FE/PE/NE and echoes corrupted bytes',()=>{
 const p=halExample('uart');p.simulation={stepMs:1,pwmWaveform:false,noise:{enabled:true,bitErrorRate:.08,glitchRate:.05,jitterNs:200}};
 p.code+='\nvoid HAL_UART_ErrorCallback(UART_HandleTypeDef *huart){ printf("uart error 0x%lx\\n", huart->ErrorCode); }\n';
 const {s,output}=run(validateProject(p));advance(s,30);s.inject('The quick brown fox jumps over the lazy dog','USART2');advance(s,120);
 assert.ok(output.some(x=>/^uart error 0x[1-7]$/.test(x)),output.join('|'));assert.ok(s.signals.decode('USART2.RX').some(f=>f.error));
 const clean=run(halExample('uart'));advance(clean.s,30);clean.s.inject('abc','USART2');advance(clean.s,60);assert.ok(clean.s.signals.decode('USART2.RX').every(f=>!f.error));
});
test('wire noise turns I2C transfers into NACK/bus errors and corrupts SPI bytes; setNoise applies live and persists',()=>{
 const p=halExample('i2c');p.code=p.code.replace('printf("I2C write=%d read=%d\\n", writeStatus, readStatus);','printf("I2C write=%d read=%d\\n", writeStatus, readStatus);\n  for (int i = 0; i < 20; i++) { uint8_t v[1] = {0}; if (HAL_I2C_Mem_Read(&hi2c1, 0x50 << 1, 0x10, I2C_MEMADD_SIZE_8BIT, v, 1, 100) != HAL_OK || v[0] != 42) printf("bad %d\\n", i); }');
 const {s,output}=run(p);s.signals.setNoise({enabled:true,bitErrorRate:.2});advance(s,40);assert.ok(output.filter(x=>x.startsWith('bad')).length>3,output.join('|'));
 assert.equal(s.project.simulation.noise.bitErrorRate,.2);assert.equal(p.simulation.noise.bitErrorRate,.2);assert.ok(s.signals.decode('I2C1').some(f=>f.error));
 assert.throws(()=>s.signals.setNoise({enabled:true,glitchRate:-1}),/glitchRate/);
 const q=halExample('spi');q.simulation={stepMs:1,pwmWaveform:false,noise:{enabled:true,bitErrorRate:.5,glitchRate:0,jitterNs:0}};const t=run(q);advance(t.s,5);assert.notDeepEqual(t.output,['42']);
});
test('project.simulation.noise is validated, defaults are filled and old files still load',()=>{
 const p=blankProject();p.simulation={stepMs:1,pwmWaveform:false};assert.equal(validateProject(p).simulation.noise,undefined);
 p.simulation.noise={enabled:true,bitErrorRate:.001};assert.deepEqual(validateProject(p).simulation.noise,{enabled:true,bitErrorRate:.001,glitchRate:0,jitterNs:0});
 p.simulation.noise={enabled:'yes'};assert.throws(()=>validateProject(p),/noise\.enabled/);
 const api=signalsApi(new SignalRecorder(),new NoiseModel());assert.deepEqual(Object.keys(api).filter(k=>typeof api[k]==='function').sort(),['channels','clear','decode','noise','now','record','samples','setNoise']);
});
