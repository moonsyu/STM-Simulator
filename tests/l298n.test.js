import test from 'node:test';
import assert from 'node:assert/strict';
import {halExample} from '../src/hal-examples.js';
import {solveCircuit} from '../src/engine.js';
import {SimulationSession} from '../src/session.js';
import {validateProject} from '../src/project.js';
import {terminalKeys,terminalLabel,nominalTerminals} from '../src/components.js';
import {searchParts} from '../src/part-library.js';
import {boardPin} from '../src/pins.js';
import {circuitDiagnostics} from '../src/circuit-diagnostics.js';
const output=value=>({mode:'OUTPUT',value});
const gpio=(a=3.3,b=3.3)=>({PA0:output(a),PA1:output(b),PB4:output(3.3),PB5:output(0),PB6:output(0),PB7:output(3.3)});
const until=(s,end)=>{for(let t=Math.floor(s.runtime.microTime/1000)+20;t<end;t+=20)s.tick(t);s.tick(end);return s.result;};
const near=(a,b,e=.03)=>assert.ok(Math.abs(a-b)<e,`${a} != ${b}`);
test('L298N parts are searchable and survive persistence with distinct module terminals',()=>{
 for(const [query,type]of [['L298N','l298n'],['모터 드라이버','l298n'],['DC 모터','dc_motor'],['외부 전원','dc_supply']])assert.ok(searchParts(query).some(p=>p.type===type));
 const p=halExample('l298n'),q=validateProject(JSON.parse(JSON.stringify(p)));assert.deepEqual(q,p);
 assert.equal(p.components.length,4);assert.equal(p.wires.length,14);assert.equal(p.simulation.pwmWaveform,true);
 assert.deepEqual(terminalKeys(p.components[0]).map(k=>terminalLabel(p.components[0],k)),['VM','GND','5V','ENA','IN1','IN2','IN3','IN4','ENB','OUT1','OUT2','OUT3','OUT4']);
 for(const rotation of [0,45,90,180]){p.components[0].rotation=rotation;const t=nominalTerminals(p.components[0]);assert.equal(new Set(t.map(v=>`${v.x},${v.y}`)).size,13);assert.doesNotThrow(()=>validateProject(p));}
 q.components[1].voltage=25;assert.throws(()=>validateProject(q));
});
test('both bridges implement forward, reverse, equal-input braking and enable-low high impedance',()=>{
 const p=halExample('l298n');
 for(const [a,b,mode,sign]of [[3.3,0,'forward',1],[0,3.3,'reverse',-1],[0,0,'brake',0],[3.3,3.3,'brake',0]]){
  const g=gpio();g.PB4=output(a);g.PB5=output(b);g.PB6=output(a);g.PB7=output(b);
  const r=solveCircuit(p,g);assert.equal(r.fault,false);assert.deepEqual(r.warnings,[]);
  for(const name of ['A','B']){assert.equal(r.parts.driver.channels[name].mode,mode);const v=r.parts['motor'+name].voltage;sign?assert.ok(v*sign>9&&v*sign<10):near(v,0);}
 }
 const off=solveCircuit(p,gpio(0,0));for(const name of ['A','B']){assert.equal(off.parts.driver.channels[name].mode,'coast');near(off.parts['motor'+name].current,0);}
 assert.equal(off.voltage('part:driver:p10'),null);
 const one=solveCircuit(p,gpio(0,3.3));near(one.parts.motorA.current,0);assert.ok(one.parts.motorB.voltage<-9);
});
test('missing VM, logic supply or common ground disables the bridge and reports the wiring problem',()=>{
 for(const index of [0,2,3]){const p=halExample('l298n');p.wires.splice(index,1);const r=solveCircuit(p,gpio());assert.equal(r.fault,false);assert.equal(r.parts.driver.powered,false);near(r.parts.motorA.current,0);assert.ok(circuitDiagnostics(p,r).some(i=>i.id==='l298-power:driver'));}
 const p=halExample('l298n');p.wires.find(w=>w.to==='part:driver:p3').from=boardPin('3V3');assert.equal(solveCircuit(p,gpio()).parts.driver.powered,false);
});
test('undefined TTL levels are not interpreted as PWM duty or a valid direction',()=>{
 const p=halExample('l298n'),g=gpio(1.8);const r=solveCircuit(p,g);assert.equal(r.parts.driver.channels.A.mode,'invalid');near(r.parts.motorA.current,0);assert.ok(circuitDiagnostics(p,r).some(i=>i.id==='l298-logic:driver'));
 g.PA0=output(3.3);g.PB4=output(1.8);assert.equal(solveCircuit(p,g).parts.driver.channels.A.mode,'invalid');
});
test('supply and output shorts produce actionable current diagnostics',()=>{
 for(const [a,b]of [['part:driver:p10','part:driver:p11'],['part:supply:a','part:supply:b']]){const p=halExample('l298n');p.wires.push({id:'short',from:a,to:b,color:'#dd654c'});const r=solveCircuit(p,gpio());assert.equal(r.fault,false);assert.ok(r.warnings.some(w=>w.includes('2 A 초과')));assert.ok(circuitDiagnostics(p,r).some(i=>i.severity==='error'));}
});
test('external supply powers actual output nets and respects motor wiring polarity',()=>{
 const p=halExample('l298n'),g=gpio(),r=solveCircuit(p,g);near(-r.parts.supply.current,Math.abs(r.parts.motorA.current)+Math.abs(r.parts.motorB.current),.002);
 const wires=p.wires.filter(w=>w.to.startsWith('part:motorA:'));[wires[0].to,wires[1].to]=[wires[1].to,wires[0].to];assert.ok(solveCircuit(p,g).parts.motorA.voltage<-9);
 p.wires=p.wires.filter(w=>w.to!=='part:motorA:a');near(solveCircuit(p,g).parts.motorA.current,0);
});
test('HAL example runs both PWM channels through reversal, brake, coast and restart',()=>{
 const logs=[],s=new SimulationSession(halExample('l298n'),{print:v=>logs.push(v)});s.tick(0);
 let r=until(s,1800);assert.ok(r.parts.motorA.rpm>1700&&r.parts.motorA.rpm<1850);assert.ok(r.parts.motorB.rpm<-900&&r.parts.motorB.rpm>-1000);
 r=until(s,2900);assert.ok(Math.abs(r.parts.motorA.rpm)<10);assert.equal(r.parts.driver.channels.A.mode,'coast');
 r=until(s,4800);assert.ok(r.parts.motorA.rpm<-1100);assert.ok(r.parts.motorB.rpm>2300);
 r=until(s,5300);assert.equal(r.parts.driver.channels.A.mode,'brake');assert.ok(Math.abs(r.parts.motorB.rpm)<10);
 r=until(s,6200);assert.equal(r.parts.driver.channels.A.mode,'coast');
 r=until(s,7200);assert.ok(r.parts.motorA.rpm>0);assert.ok(r.parts.motorB.rpm<0);assert.deepEqual(r.warnings,[]);assert.ok(logs.some(x=>x.includes('brake')));
});
test('static 0%/100%, disabled PWM and disconnected motor are not mistaken for independent channel activity',()=>{
 const p=halExample('l298n');p.code=p.code.replaceAll('TIM_CHANNEL_1, 750','TIM_CHANNEL_1, 0').replaceAll('TIM_CHANNEL_2, 400','TIM_CHANNEL_2, 1000');
 let s=new SimulationSession(p);s.tick(0);let r=until(s,500);near(r.parts.motorA.rpm,0);assert.ok(r.parts.motorB.rpm<-2200);
 const q=halExample('l298n');q.simulation.pwmWaveform=false;s=new SimulationSession(q);s.tick(0);r=until(s,300);assert.equal(r.parts.driver.channels.B.mode,'coast');near(r.parts.motorB.rpm,0);
 const open=halExample('l298n');open.wires=open.wires.filter(w=>w.to!=='part:motorA:a');s=new SimulationSession(open);s.tick(0);r=until(s,300);near(r.parts.motorA.rpm,0);assert.ok(r.parts.motorB.rpm<-800);
});
