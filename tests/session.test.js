import test from 'node:test';
import assert from 'node:assert/strict';
import {SimulationSession} from '../src/session.js';
import {PROGRAM_FIXTURES as FEATURE_EXAMPLES,programFixture as featureExample} from './fixtures/programs.js';
import {validateProject} from '../src/project.js';
import {boardPin} from '../src/pins.js';
import {WaveRecorder,waveSvg} from '../src/trace.js';
const run=(project,end=100)=>{const out=[],events=[];const session=new SimulationSession(project,{print:v=>out.push(v),trace:e=>events.push(e)});for(let t=0;t<=end;t+=20)session.tick(t);return {session,out,events};};
test('all feature examples validate, run, and stay finite',()=>{
 for(const type of Object.keys(FEATURE_EXAMPLES)){const p=featureExample(type);assert.deepEqual(validateProject(p),p);const {session}=run(p);assert.equal(session.result.fault,false,type);assert.ok(Number.isFinite(session.result.current),type);}
});
test('LCD follows real 4-bit wiring, power, cursor and screen clearing',()=>{
 const p=featureExample('lcd'),{session}=run(p,40);let lcd=session.result.parts.demo.lcd;
 assert.equal(lcd.visible,true);assert.equal(lcd.lines[0],'STM Emulator    ');assert.match(lcd.lines[1],/^Time: /);
 p.wires=p.wires.filter(w=>w.to!=='part:demo:p2');session.changed();assert.equal(session.result.parts.demo.lcd.powered,false);
 const disconnected=featureExample('lcd');disconnected.wires=disconnected.wires.filter(w=>w.to!=='part:demo:p6');assert.equal(run(disconnected).session.result.parts.demo.lcd.visible,false);
 const clear=featureExample('lcd');clear.code=clear.code.replace('lcd.print("STM Emulator");','lcd.print("OLD"); lcd.clear(); lcd.setCursor(3, 0); lcd.print("NEW");');assert.equal(run(clear).session.result.parts.demo.lcd.lines[0],'   NEW          ');
});
test('LCD custom character memory and display control work without eval',()=>{
 const p=featureExample('lcd');p.code=p.code.replace('lcd.print("STM Emulator");','byte glyph[8]={0,10,0,0,17,14,0,0}; lcd.createChar(0,glyph); lcd.write(0); lcd.cursor();');
 const {session}=run(p,40);const lcd=session.result.parts.demo.lcd;assert.deepEqual(lcd.cgram.slice(0,8),[0,10,0,0,17,14,0,0]);assert.equal(lcd.codes[0][0],0);assert.equal(lcd.cursor,true);
});
test('LCD eight-bit wiring and R/W blocking are respected',()=>{
 const p=featureExample('lcd');p.wires=p.wires.filter(w=>!['p11','p12','p13','p14'].some(k=>w.to==='part:demo:'+k));
 for(let i=0;i<8;i++)p.wires.push({id:'data'+i,from:boardPin('D'+(i+4)),to:'part:demo:p'+(i+7),color:'#23a68a'});
 p.code=p.code.replace('LiquidCrystal lcd(D2, D3, D4, D5, D6, D7);','LiquidCrystal lcd(D2, D3, D4, D5, D6, D7, D8, D9, D10, D11);');
 assert.equal(run(p,40).session.result.parts.demo.lcd.lines[0],'STM Emulator    ');
 const blocked=featureExample('lcd');blocked.wires=blocked.wires.filter(w=>w.to!=='part:demo:p5');blocked.wires.push({id:'rw',from:boardPin('3V3'),to:'part:demo:p5',color:'#dd654c'});assert.equal(run(blocked,40).session.result.parts.demo.lcd.visible,false);
});
test('UART terminal enforces power and baud and receives timed input',()=>{
 const p=featureExample('uart'),{session}=run(p,20);assert.match(session.buses.received.get('demo'),/UART ready/);assert.equal(session.inject('OK','Serial1'),2);session.tick(40);assert.match(session.buses.received.get('demo'),/OK/);
 p.components[0].baud=115200;assert.equal(session.inject('x','Serial1'),0);p.components[0].baud=9600;p.wires=p.wires.filter(w=>w.to!=='part:demo:p1');session.changed();assert.equal(session.inject('x','Serial1'),0);
});
test('I2C memory ACK, pointer read, NACK and bus short are observable',()=>{
 const p=featureExample('i2c'),{out,events}=run(p,40);assert.deepEqual(out,['0','42']);assert.ok(events.some(e=>e.message.includes('ACK')));
 const bad=featureExample('i2c');bad.components[0].address=81;assert.deepEqual(run(bad,40).out,['2']);
 const off=featureExample('i2c');off.wires=off.wires.filter(w=>w.to!=='part:demo:p1');assert.deepEqual(run(off,40).out,['2']);
 const short=featureExample('i2c');short.wires.push({id:'short',from:boardPin('PB9'),to:boardPin('PB8'),color:'#000000'});assert.deepEqual(run(short,40).out,['2']);
});
test('SPI memory requires chip select and power, and supports byte transfers',()=>{
 const p=featureExample('spi'),{out}=run(p,40);assert.deepEqual(out,['42']);
 const missing=featureExample('spi');missing.wires=missing.wires.filter(w=>w.to!=='part:demo:p3');assert.deepEqual(run(missing,40).out,['255']);
 const off=featureExample('spi');off.wires=off.wires.filter(w=>w.to!=='part:demo:p1');assert.deepEqual(run(off,40).out,['255']);
});
test('interrupt and timer examples update circuit while loop sleeps',()=>{
 const {session}=run(featureExample('interrupt'),20);session.setPressed({b1:true});session.tick(40);assert.equal(session.result.parts.led1.on,true);session.setPressed({});session.tick(60);session.setPressed({b1:true});session.tick(80);assert.equal(session.result.parts.led1.on,false);
 const timer=run(featureExample('timer'),260).session;assert.equal(timer.result.parts.led1.on,true);timer.tick(500);assert.equal(timer.result.parts.led1.on,false);
});
test('PWM RC waveform captures switching plus filtered voltage and exports CSV',()=>{
 const {session}=run(featureExample('pwm'),100);const samples=session.wave.samples;
 assert.ok(samples.some(s=>s.values[0]>3));assert.ok(samples.some(s=>s.values[0]<.1));assert.ok(session.result.voltage('signal:PA0')>1&&session.result.voltage('signal:PA0')<2.2);
 assert.ok(samples.every((s,i)=>!i||s.micros>=samples[i-1].micros));assert.match(session.wave.csv(),/^time_ms,PA5_V,PA10_V,PA0_V,PC13_V\n/);assert.match(waveSvg(session.wave,100),/trace-channel/);
});
test('waveform storage is bounded and simulation settings survive save',()=>{
 const wave=new WaveRecorder(['PA5'],10);for(let i=0;i<100;i++)wave.record(i,{voltage:()=>3.3});assert.ok(wave.samples.length<=10);assert.ok(wave.dropped>0);
 const p=featureExample('pwm');assert.deepEqual(validateProject(JSON.parse(JSON.stringify(p))).simulation,p.simulation);assert.throws(()=>validateProject({...p,simulation:{stepMs:0,pwmWaveform:true}}));
});
test('UART RX waits for byte time and SPI loopback is wired',()=>{
 const p=featureExample('uart'),session=new SimulationSession(p);session.tick(0);session.inject('A');assert.equal(session.runtime.call('Serial1.available',[]),0);session.tick(1);assert.equal(session.runtime.call('Serial1.available',[]),0);session.tick(2);assert.equal(session.runtime.call('Serial1.read',[]),65);
 const loop=featureExample('spi');loop.components=[];loop.wires=[{id:'loop',from:boardPin('PA7'),to:boardPin('PA6'),color:'#23a68a'}];loop.code='void setup(){SPI.begin();Serial.println(SPI.transfer(0xA5));}void loop(){delay(100);}';assert.deepEqual(run(loop,0).out,['165']);
});
