import test from 'node:test';
import assert from 'node:assert/strict';
import {halExample,HAL_EXAMPLES,HAL_GUIDES} from '../src/hal-examples.js';
import {validateProject} from '../src/project.js';
import {SimulationSession} from '../src/session.js';
import {boardPin} from '../src/pins.js';
import {searchParts} from '../src/part-library.js';
import {terminalKeys,terminalLabel,assignAttachments} from '../src/components.js';
import {PassiveBuzzers} from '../src/passive-buzzer.js';
import {BuzzerAudio} from '../src/buzzer-audio.js';

const close=(actual,expected,tolerance=.01)=>assert.ok(Math.abs(actual-expected)<=tolerance,`${actual} != ${expected}`);
function advance(s,end){for(let t=s.runtime.microTime/1000+10;t<end;t+=10)s.tick(t);s.tick(end);return s.result.parts.demo;}
function start(edit=()=>{}){const p=halExample('passive_buzzer');edit(p);const logs=[],s=new SimulationSession(p,{print:x=>logs.push(x)});s.tick(0);return {p,s,logs};}
function sketch(setup,loop='delay(1000);',edit=()=>{}){
  return start(p=>{p.firmware={mode:'sketch',files:[]};p.code=`void setup() { pinMode(PA0, OUTPUT); ${setup} }\nvoid loop() { ${loop} }`;edit(p);});
}

test('passive buzzer is searchable, has two mountable terminals, and round-trips with its HAL example',()=>{
  for(const query of ['수동 부저','passive buzzer','piezo','멜로디'])assert.ok(searchParts(query).some(p=>p.type==='passive_buzzer'),query);
  const p=halExample('passive_buzzer');assert.deepEqual(validateProject(JSON.parse(JSON.stringify(p))),p);
  assert.match(HAL_EXAMPLES.passive_buzzer,/수동 부저/);assert.match(HAL_GUIDES.passive_buzzer,/PA0/);
  assert.deepEqual(terminalKeys(p.components[0]),['a','b']);assert.equal(terminalLabel(p.components[0],'a'),'+');assert.equal(terminalLabel(p.components[0],'b'),'−');
  assignAttachments(p.components[0],{a:'bb:a:1',b:'bb:a:2'});assert.deepEqual(validateProject(p).components[0],p.components[0]);
});

test('passive buzzer HAL melody measures all eight pitches, rests and repeats without faults',()=>{
  const {s,logs}=start();
  for(const [i,hz]of [523,587,659,698,784,880,988,1047].entries()){
    const read=advance(s,i*430+100);assert.equal(read.on,true);close(read.frequency,1e6/Math.floor(1e6/hz));close(read.duty,.5,.001);
    assert.equal(s.result.fault,false);assert.deepEqual(s.result.warnings,[]);
    const rest=advance(s,i*430+380);assert.equal(rest.on,false);assert.equal(rest.frequency,0);
  }
  assert.equal(advance(s,3900).on,false);close(advance(s,4100).frequency,1e6/1912);
  assert.ok(logs.includes('Passive buzzer: rest'));assert.ok(logs.includes('Passive buzzer: 1047 Hz'));
});

test('passive buzzer measures PWM frequency and duty independently of the circuit step',()=>{
  for(const stepMs of [.1,1,20])for(const hz of [20,440,1000,2000]){
    const {s}=sketch(`analogWriteFrequency(PA0, ${hz}); analogWrite(PA0, 64);`,'delay(1000);',p=>p.simulation.stepMs=stepMs);
    const r=advance(s,160);assert.equal(r.on,true);close(r.frequency,hz);close(r.duty,64/255);
  }
});

test('passive buzzer stays silent for DC, 0/100 percent duty, averaged PWM and an isolated circuit',()=>{
  for(const setup of ['digitalWrite(PA0, HIGH);','digitalWrite(PA0, LOW);','analogWrite(PA0, 0);','analogWrite(PA0, 255);']){
    const {s}=sketch(setup);assert.equal(advance(s,200).on,false,setup);
  }
  const averaged=sketch('analogWrite(PA0, 128);','delay(1000);',p=>p.simulation.pwmWaveform=false);assert.equal(advance(averaged.s,200).on,false);
  const isolated=start(p=>p.wires=[]);assert.equal(advance(isolated.s,100).on,false);
  for(const supply of ['3V3','5V']){const dc=start(p=>p.wires[0].from=boardPin(supply));assert.equal(advance(dc.s,100).on,false);}
});

test('passive buzzer reacts to actual wiring, reversed leads and inadequate signal voltage',()=>{
  for(const id of ['tone','ground']){
    const {p,s}=start();assert.equal(advance(s,100).on,true);const wire=p.wires.find(w=>w.id===id);p.wires=p.wires.filter(w=>w.id!==id);s.changed();assert.equal(advance(s,110).on,false,id);
    p.wires.push(wire);s.changed();assert.equal(advance(s,130).on,true,id+' restored');
  }
  const reversed=start(p=>p.wires.forEach(w=>w.to=w.to==='part:demo:a'?'part:demo:b':'part:demo:a'));assert.equal(advance(reversed.s,100).on,true);
  const weak=start(p=>{p.components.push({id:'series',name:'R1',type:'resistor',value:1e6,x:600,y:300,rotation:0,span:70});p.wires[0].to='part:series:a';p.wires.push({id:'load',from:'part:series:b',to:'part:demo:a',color:'#8064d8'});});assert.equal(advance(weak.s,100).on,false);
});

test('passive buzzer follows GPIO edge timing and stops after digital or timer shutdown',()=>{
  // Generate a burst in setup: the sketch runner adds 1 ms between loop() calls.
  const gpio=sketch('for (int i = 0; i < 20; i++) { digitalWrite(PA0, HIGH); delayMicroseconds(500); digitalWrite(PA0, LOW); delayMicroseconds(500); }');close(advance(gpio.s,20).frequency,1000);
  for(const value of [0,1]){
    const {s}=sketch('analogWriteFrequency(PA0, 880); analogWrite(PA0, 128);');assert.equal(advance(s,20).on,true);
    s.runtime.call('digitalWrite',['PA0',value]);assert.equal(advance(s,30).on,false);
  }
  const {s}=start();assert.equal(advance(s,100).on,true);const ptr=s.hal.timerModel.states.get('TIM2').ptr;
  s.hal.call('HAL_TIM_PWM_Stop',[ptr,0],s.runtime);assert.equal(advance(s,110).on,false);
  s.hal.call('HAL_TIM_PWM_Start',[ptr,0],s.runtime);assert.equal(advance(s,130).on,true);
});

test('passive buzzer rejects out-of-range, zero-duration and single edges; fault clears history',()=>{
  const p={components:[{id:'demo',type:'passive_buzzer'}]},model=new PassiveBuzzers();
  let voltage=0;const result={parts:{demo:{}},voltage:id=>id.endsWith(':a')?voltage:0};
  const edge=(at,v)=>{voltage=v;model.update(p,result,at);return result.parts.demo;};
  edge(0,3.3);edge(0,0);assert.equal(edge(0,3.3).on,false);assert.equal(edge(100000,3.3).on,false);
  for(const period of [400,60000]){model.states.clear();edge(0,3.3);edge(period/2,0);assert.equal(edge(period,3.3).on,false);}
  model.states.clear();edge(0,3.3);edge(500,0);assert.equal(edge(1000,3.3).on,true);
  model.update(p,{fault:true},1000);assert.equal(edge(1001,3.3).on,false);
});

test('passive buzzers retain independent frequencies on separate PWM outputs',()=>{
  const {s}=sketch('analogWriteFrequency(PA0, 440); analogWrite(PA0, 128); pinMode(PA1, OUTPUT); analogWriteFrequency(PA1, 880); analogWrite(PA1, 64);','delay(1000);',p=>{
    p.components.push({...p.components[0],id:'second',name:'PBZ2',y:400});p.wires.push({id:'tone2',from:boardPin('PA1'),to:'part:second:a',color:'#8064d8'},{id:'ground2',from:boardPin('GND'),to:'part:second:b',color:'#4e647b'});
  });advance(s,30);close(s.result.parts.demo.frequency,440);close(s.result.parts.second.frequency,880);
});

test('passive buzzer audio tracks each pitch and mutes on sound-off, pause, stop, fault and removal',()=>{
  const param=()=>({value:0,setTargetAtTime(value){this.value=value;}});
  const node=()=>({frequency:param(),gain:param(),connect(other){return other;},start(){this.started=true;},stop(){this.stopped=true;},disconnect(){this.disconnected=true;}});
  const context={currentTime:0,destination:{},createOscillator:node,createGain:node},audio=new BuzzerAudio(context);
  const p={components:[{id:'one',type:'passive_buzzer'},{id:'two',type:'passive_buzzer'}]},r={parts:{one:{on:true,frequency:440},two:{on:true,frequency:880}}};
  audio.update(p,r,false,true);assert.equal(audio.voices.size,0);audio.update(p,r,true,true);
  const a=audio.voices.get('one'),b=audio.voices.get('two');assert.equal(a.oscillator.type,'square');assert.equal(a.oscillator.frequency.value,440);assert.equal(b.oscillator.frequency.value,880);assert.equal(a.gain.gain.value,.0125);
  r.parts.one.frequency=660;audio.update(p,r,true,true);assert.equal(a.oscillator.frequency.value,660);
  for(const [enabled,running,fault]of [[false,true,false],[true,false,false],[true,true,true]]){r.fault=fault;audio.update(p,r,enabled,running);assert.equal(a.gain.gain.value,0);assert.equal(b.gain.gain.value,0);}
  audio.update(p,null,true,false);assert.equal(a.gain.gain.value,0);
  audio.update({components:[]},r,true,true);assert.equal(audio.voices.size,0);assert.equal(a.oscillator.stopped,true);assert.equal(b.gain.disconnected,true);
});
