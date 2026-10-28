import {physicalToModel,physicalResult,physicalTopology} from './catalog-model.js';
import {catalogBranches} from './catalog-electrical.js';
import {l298Branches,l298BranchOn,l298State} from './l298n.js';
import {MODULE_DEVICES,I2C_DEVICES,ldrResistance,ntcResistance} from './device-defs.js';
import {boardPins, circuitHoles, ALL_GPIO_PINS, canonicalPin, boardPin} from './pins.js';
import {terminalKeys,attachments,PART_DEFS} from './components.js';
import {devboardPins,devboardNet,devboardModel} from './devboards.js';

export class UnionFind {
  constructor(){this.parent=new Map();}
  find(x){if(!this.parent.has(x))this.parent.set(x,x);const p=this.parent.get(x);if(p!==x)this.parent.set(x,this.find(p));return this.parent.get(x);}
  join(a,b){this.parent.set(this.find(a),this.find(b));}
}
export function topology(project,pressed={}) {
  const model=physicalToModel(project);if(model!==project)return physicalTopology(topology(model,pressed),model);
  const uf=new UnionFind();
  for(const p of (project.surfaces?.board?.hidden?[]:boardPins(project.boardId))){uf.find(p.id);if(p.signal!=='NC')uf.join(p.id,`signal:${p.signal==='AGND'?'GND':p.signal}`);}
  for(const h of circuitHoles(project.components,project.surfaces))uf.join(h.id,h.bus);
  // Other boards (ESP32, Raspberry Pi): each GPIO is its own net, power pins join the common rails.
  for(const p of project.components)if(p.type==='devboard')for(const pin of devboardPins(p)){uf.find(pin.id);const net=devboardNet(p,pin);if(net)uf.join(pin.id,net);const hole=p.attachments?.[pin.key];if(hole)uf.join(pin.id,hole);}
  for(const p of project.components){
    for(const key of terminalKeys(p)){const id=`part:${p.id}:${key}`;uf.find(id);if(attachments(p)[key])uf.join(id,attachments(p)[key]);}
    if(p.type==='button'){uf.join(`part:${p.id}:a`,`part:${p.id}:c`);uf.join(`part:${p.id}:b`,`part:${p.id}:d`);if(pressed[p.id])uf.join(`part:${p.id}:a`,`part:${p.id}:b`);}
    if(p.type==='catalog_switch'){const t=n=>`part:${p.id}:p${n}`;if(p.catalogVariant.includes('dp3t')){uf.join(t(4),t(1+(p.position??0)));uf.join(t(8),t(5+(p.position??0)));}else {uf.join(t(2),t(p.position?3:1));uf.join(t(5),t(p.position?6:4));}}
    if(p.type==='slide')uf.join(`part:${p.id}:p2`,`part:${p.id}:p${p.position?3:1}`);
    if(p.type==='sevenseg')uf.join(`part:${p.id}:p3`,`part:${p.id}:p8`);
  }
  for(const w of project.wires)uf.join(w.from,w.to);for(const [a,b]of project.catalogTies||[])uf.join(a,b);
  return uf;
}
function gaussian(A,b){
  const n=b.length;
  for(let k=0;k<n;k++){
    let p=k;for(let i=k+1;i<n;i++)if(Math.abs(A[i][k])>Math.abs(A[p][k]))p=i;
    if(Math.abs(A[p][k])<1e-18)throw new Error('회로 해석이 수렴하지 않습니다.');
    [A[p],A[k]]=[A[k],A[p]];[b[p],b[k]]=[b[k],b[p]];
    for(let i=k+1;i<n;i++){const f=A[i][k]/A[k][k];if(!f)continue;for(let j=k+1;j<n;j++)A[i][j]-=f*A[k][j];b[i]-=f*b[k];}
  }
  const x=new Float64Array(n);for(let i=n-1;i>=0;i--){let s=b[i];for(let j=i+1;j<n;j++)s-=A[i][j]*x[j];x[i]=s/A[i][i];}return x;
}
// PWM outputs (`pwm: {duty}`) are solved at their average voltage, which suits motors, filters and ADC reads. An LED
// only conducts above its forward voltage, so its current is the average of the PWM high and low phases instead: for
// each PWM pin the circuit is also solved with that pin high and low, and the LED current follows that pin's duty.
export function solveCircuit(project,gpio={},pressed={},transient={}){
  const result=solveOnce(project,gpio,pressed,transient);
  if(result.fault||!result.hasLed||transient.pwmPhase)return result;
  const pwm=Object.entries(gpio).filter(([,g])=>g?.mode==='OUTPUT'&&g.pwm&&g.pwm.duty>0&&g.pwm.duty<1);if(!pwm.length)return result;
  const phase={...transient,pwmPhase:true},reads=[];
  for(const [id,read]of Object.entries(result.parts)){if(read.led)reads.push([read,id,null]);for(const [ch,c]of Object.entries(read.channels??{}))if(c.led)reads.push([c,id,ch]);}
  const current=(r,id,ch)=>{const part=r.fault?null:r.parts[id];return (ch?part?.channels?.[ch]:part)?.current??0;};
  const change=reads.map(()=>0);
  for(const [pin,g]of pwm){
    const high=solveOnce(project,{...gpio,[pin]:{...g,value:g.value/g.pwm.duty,pwm:undefined}},pressed,phase),low=solveOnce(project,{...gpio,[pin]:{...g,value:0,pwm:undefined}},pressed,phase);
    reads.forEach(([read,id,ch],i)=>{const hi=current(high,id,ch),lo=current(low,id,ch);change[i]+=lo+g.pwm.duty*(hi-lo)-read.current;});
  }
  reads.forEach(([read],i)=>{read.current=Math.max(0,read.current+change[i]);read.on=read.current>0.00008;});
  for(const read of Object.values(result.parts))if(read.channels&&!read.led){const channels=Object.values(read.channels);read.on=channels.some(c=>c.on);if(channels.every(c=>c.led))read.current=channels.reduce((a,c)=>a+c.current,0);}
  return result;
}
function solveOnce(project,gpio={},pressed={},transient={}){
  const model=physicalToModel(project);if(model!==project)return physicalResult(solveOnce(model,gpio,pressed,transient),model);
  const uf=topology(project,pressed),known=new Map(),warnings=[],diagnostics=[],branches=[],roots=new Set();
  const warn=(message,target)=>{warnings.push(message);diagnostics.push({message,target});};
  const fixed=(id,v)=>{const r=uf.find(id);if(known.has(r)&&Math.abs(known.get(r)-v)>0.01)warnings.push('전원 단락: 서로 다른 전압의 전원 또는 GND가 직접 연결되었습니다.');else known.set(r,v);roots.add(r);};
  fixed('signal:GND',0);
  for(const p of ['3V3','VDD','AVDD','IOREF'])fixed(`signal:${p}`,3.3);
  for(const p of ['5V','U5V'])fixed(`signal:${p}`,5);
  if(warnings.length)return {fault:true,warnings:[...new Set(warnings)],parts:{},voltage:()=>null,current:0,uf};
  const branch=(a,b,r,extra={})=>{const aa=uf.find(a),bb=uf.find(b);roots.add(aa);roots.add(bb);branches.push({a:aa,b:bb,r,...extra});};
  // Board GPIOs other than the STM32's are keyed `<board id>.<GPIO>` (fixed-run and sketch boards).
  for(const pin of [...ALL_GPIO_PINS,...Object.keys(gpio).filter(k=>k.includes('.'))]){
    const g=gpio[pin]||{mode:'INPUT'};
    if(g.mode==='OUTPUT'&&!(g.openDrain&&g.value>0)){
      fixed(`drive:${pin}`,g.value??0);branch(`signal:${pin}`,`drive:${pin}`,40,{gpio:pin});
    }else if(g.mode==='INPUT_PULLUP')branch(`signal:${pin}`,'signal:3V3',40000);
    else if(g.mode==='INPUT_PULLDOWN')branch(`signal:${pin}`,'signal:GND',40000);
    if(g.mode==='OUTPUT'&&g.pull)branch(`signal:${pin}`,g.pull===1?'signal:3V3':'signal:GND',40000);
  }
  // The on-board USER button is active LOW with a modeled pull-up.
  branch('signal:PC13','signal:3V3',4700);
  if(pressed.USER)branch('signal:PC13','signal:GND',1);
  for(const p of project.components)if(p.type==='devboard')for(const [pin,r]of Object.entries(devboardModel(p)?.pullups||{}))branch(`signal:${p.id}.${pin}`,'signal:3V3',r);
  // Other STM32 boards have the same USER button (`<id>.USER` while pressed).
  for(const p of project.components)if(p.type==='devboard'&&devboardModel(p)?.kind==='stm32'){branch(`signal:${p.id}.PC13`,'signal:3V3',4700);if(pressed[p.id+'.USER'])branch(`signal:${p.id}.PC13`,'signal:GND',1);}
  for(const p of project.components){
    const a=`part:${p.id}:a`,b=`part:${p.id}:b`,pin=n=>`part:${p.id}:p${n}`;
    catalogBranches(p,uf,branch,pressed);
    if(p.type==='catalog_analog'){branch(pin(1),pin(2),10000);const resistance=p.catalogVariant.startsWith('ntc')?ntcResistance(p.temperature):ldrResistance(p.lux);branch(pin(3),pin(1),resistance);branch(pin(3),pin(2),10000);if(p.catalogVariant==='ldr-comparator-4')branch(pin(4),pin(2),100,{sensor:{supply:uf.find(pin(1)),ground:uf.find(pin(2)),min:2.7,max:5.5},emf:(p.lux??100)>100?3.3:0});}
    if(p.catalogVariant==='mcp4725-6')branch(pin(5),pin(2),1,{emf:p.catalogState.voltage??0});
    if(p.type==='l298n')l298Branches(p,uf,branch);
    if(p.type==='dc_supply')branch(a,b,.1,{id:p.id,emf:p.voltage,supply:p.name});
    if(p.type==='dc_motor')branch(a,b,24,{id:p.id});
    if(p.type==='resistor')branch(a,b,p.value,{id:p.id});
    if(p.type==='ldr'||p.type==='ntc')branch(a,b,p.type==='ldr'?ldrResistance(p.lux):ntcResistance(p.temperature),{id:p.id});
    if(MODULE_DEVICES.includes(p.type)){
      branch(pin(1),pin(2),10000,{id:p.id});
      if(I2C_DEVICES.includes(p.type))for(const n of [3,4])branch(pin(n),pin(1),10000);
      if(p.type==='joystick')for(const [n,pos] of [[3,p.axisX],[4,p.axisY]]){branch(pin(n),pin(2),Math.max(.01,10000*pos/100));branch(pin(n),pin(1),Math.max(.01,10000*(1-pos/100)));}
      if(['joystick','encoder'].includes(p.type)){branch(pin(5),pin(1),10000);if(p.switch)branch(pin(5),pin(2),1);}
      if(p.type==='encoder')for(const n of [3,4]){branch(pin(n),pin(1),10000);if((transient.deviceSignals?.[p.id]??[1,1])[n-3]===0)branch(pin(n),pin(2),1);}
      if(p.type==='pir')branch(pin(3),pin(2),100,{sensor:{supply:uf.find(pin(1)),ground:uf.find(pin(2)),min:4.5,max:5.5},emf:p.motion?3.3:0});
      if(p.type==='relay')for(const [n,normallyOpen] of [[5,true],[6,false]])branch(pin(4),pin(n),.1,{relay:{supply:uf.find(pin(1)),ground:uf.find(pin(2)),input:uf.find(pin(3)),normallyOpen},contact:p.name,contactId:p.id});
      const inputs=({servo:[3],motor:[3,4,5],stepper:[3,4,5,6],relay:[3],tft:[3,4,5,6,7],matrix:[3,4,5]})[p.type]||[];
      for(const n of inputs)if(n===3&&['tft','matrix'].includes(p.type))branch(pin(n),pin(1),100000);else branch(pin(n),pin(2),1000000);
    }
    if(p.type==='led')branch(a,b,12,{id:p.id,diode:true,led:true,vf:({red:1.8,green:2.1,blue:2.8,yellow:2.0})[p.color]||1.8});
    if(p.type==='diode')branch(a,b,1,{id:p.id,diode:true,vf:0.7});
    if(p.type==='buzzer')branch(a,b,1000,{id:p.id,buzzer:true});
    if(p.type==='passive_buzzer')branch(a,b,1e6,{id:p.id});
    if(p.type==='capacitor'&&transient.dt>0)branch(a,b,transient.dt/(p.value*1e-6),{id:p.id,emf:transient.capacitors?.[p.id]??0,capacitor:true});
    if(p.type==='potentiometer'){
      branch(pin(1),pin(2),Math.max(.01,p.value*p.position/100),{id:p.id,channel:'1–2',pot:true});
      branch(pin(2),pin(3),Math.max(.01,p.value*(1-p.position/100)),{id:p.id,channel:'2–3',pot:true});
    }
    if(p.type==='rgb')for(const [n,channel,vf]of [[1,'r',1.8],[3,'g',2.1],[4,'b',2.8]])branch(pin(p.commonAnode?2:n),pin(p.commonAnode?n:2),12,{id:p.id,diode:true,led:true,vf,channel});
    if(p.type==='sevenseg')PART_DEFS.sevenseg.labels.forEach((label,i)=>{if(!label.startsWith('K'))branch(pin(p.commonAnode?3:i+1),pin(p.commonAnode?i+1:3),12,{id:p.id,diode:true,led:true,vf:1.8,channel:label});});
    if(p.type==='lcd'){branch(pin(2),pin(1),4200,{id:p.id});branch(pin(15),pin(16),220,{diode:true,vf:2.1});}
    if(['uart','i2c','spi'].includes(p.type))branch(pin(1),pin(2),10000,{id:p.id});
    if(p.type==='i2c'){branch(pin(3),pin(1),10000);branch(pin(4),pin(1),10000);}
    if(p.type==='temperature'||p.type==='ultrasonic'){
      const temp=p.type==='temperature',gnd=pin(temp?3:4),output=pin(temp?2:3);
      branch(pin(1),gnd,temp?200000:2500);
      branch(output,gnd,100,{id:p.id,sensor:{supply:uf.find(pin(1)),ground:uf.find(gnd),min:temp?2.7:4.5,max:5.5},emf:temp?.5+.01*p.temperature:(transient.echoHigh?.[p.id]?5:0)});
    }
  }
  const unknown=[...roots].filter(r=>!known.has(r)),index=new Map(unknown.map((r,i)=>[r,i]));
  const volt=new Map(known);unknown.forEach(r=>volt.set(r,0));
  let converged=false;
  for(let iter=0;iter<80;iter++){
    const n=unknown.length,A=Array.from({length:n},()=>new Float64Array(n)),z=new Float64Array(n);
    for(let i=0;i<n;i++)A[i][i]=1e-10; // Numerical shunt, 10 GΩ.
    for(const b of branches){
      const supply=b.sensor?(volt.get(b.sensor.supply)??0)-(volt.get(b.sensor.ground)??0):0;
      const relayOn=b.relay?((volt.get(b.relay.supply)-volt.get(b.relay.ground)>=4.5&&volt.get(b.relay.supply)-volt.get(b.relay.ground)<=5.5&&volt.get(b.relay.input)-volt.get(b.relay.ground)>=2)===b.relay.normallyOpen):true;
      const on=l298BranchOn(b,volt,uf)&&relayOn&&(!b.diode||(volt.get(b.a)-volt.get(b.b)>b.vf))&&(!b.sensor||(supply>=b.sensor.min&&supply<=b.sensor.max));
      const g=!on?1e-10:1/b.r,offset=on?(b.diode?b.vf:b.emf??0):0;
      const i=index.get(b.a),j=index.get(b.b);
      if(i!==undefined){A[i][i]+=g;if(j!==undefined)A[i][j]-=g;else z[i]+=g*known.get(b.b);z[i]+=g*offset;}
      if(j!==undefined){A[j][j]+=g;if(i!==undefined)A[j][i]-=g;else z[j]+=g*known.get(b.a);z[j]-=g*offset;}
    }
    const x=gaussian(A,z);let diff=0;
    unknown.forEach((r,i)=>{diff=Math.max(diff,Math.abs(volt.get(r)-x[i]));volt.set(r,x[i]);});
    if(diff<1e-7){converged=true;break;}
  }
  if(!converged)warnings.push('회로가 수렴하지 않았습니다. LED 방향과 연결을 확인하세요.');
  const parts={};let maxCurrent=0;
  for(const b of branches){
    const supply=b.sensor?(volt.get(b.sensor.supply)??0)-(volt.get(b.sensor.ground)??0):0,powered=!b.sensor||(supply>=b.sensor.min&&supply<=b.sensor.max);
    const dv=volt.get(b.a)-volt.get(b.b),relayOn=b.relay?((volt.get(b.relay.supply)-volt.get(b.relay.ground)>=4.5&&volt.get(b.relay.supply)-volt.get(b.relay.ground)<=5.5&&volt.get(b.relay.input)-volt.get(b.relay.ground)>=2)===b.relay.normallyOpen):true,i=!l298BranchOn(b,volt,uf)||!powered||!relayOn?0:b.diode?Math.max(0,(dv-b.vf)/b.r):(dv-(b.emf??0))/b.r;
    const read={voltage:dv,current:i,on:b.buzzer?dv>=2:b.led&&i>0.00008,power:Math.abs(dv*i),...(b.sensor?{powered}: {}),...(b.led?{led:true}:{})};
    if(b.id){
      if(b.channel){const total=parts[b.id]??={voltage:0,current:0,power:0,on:false,channels:{}};total.channels[b.channel]=read;total.voltage=Math.max(total.voltage,dv);total.current=b.pot?Math.max(total.current,Math.abs(i)):total.current+i;total.power+=read.power;total.on||=read.on;}
      else parts[b.id]=read;
    }
    if(b.driver&&Math.abs(i)>2)warn(`${project.components.find(p=>p.id===b.driver).name}: L298N 출력 전류 2 A 초과. 단락·부하를 확인하세요.`,{type:'part',id:b.driver});
    if(b.supply&&Math.abs(i)>2)warn(`${b.supply}: 외부 전원 전류 2 A 초과. 단락·부하를 확인하세요.`,{type:'part',id:b.id});
    if(b.contact&&Math.abs(i)>1)warn(b.contact+': 접점 전류 1 A 초과. 부하와 전원 배선을 확인하세요.',{type:'part',id:b.contactId});
    if(b.gpio&&Math.abs(i)>0.02)warn(`${gpioName(project,b.gpio)}: GPIO 전류 ${(Math.abs(i)*1000).toFixed(1)} mA. 저항과 배선을 확인하세요.`,{type:'endpoint',id:gpioEndpoint(project,b.gpio)});
    if(b.led&&i>0.02)warn(`${project.components.find(p=>p.id===b.id)?.name}${b.channel?' '+b.channel:''}: LED 전류 ${(i*1000).toFixed(1)} mA. 직렬 저항을 늘리세요.`,{type:'part',id:b.id});
    if(b.id)maxCurrent=Math.max(maxCurrent,Math.abs(i));
  }
  for(const p of project.components)if(p.type==='resistor'&&parts[p.id]?.power>0.25)warn(`${p.name}: 저항 소비 전력이 0.25 W를 넘습니다.`,{type:'part',id:p.id});
  // Only expose ground-referenced voltages. An isolated circuit must not read as ground.
  const anchored=new Set(known.keys());let changed=true;
  while(changed){changed=false;for(const b of branches){if(!l298BranchOn(b,volt,uf))continue;if(anchored.has(b.a)&&!anchored.has(b.b)){anchored.add(b.b);changed=true;}if(anchored.has(b.b)&&!anchored.has(b.a)){anchored.add(b.a);changed=true;}}}
  const voltage=id=>{const r=uf.find(id);return anchored.has(r)&&volt.has(r)?volt.get(r):null;},capacitors={};
  for(const p of project.components){
    if(p.type==='l298n'){const state=l298State(p,voltage,uf.find(`part:${p.id}:p2`)===uf.find('signal:GND'));Object.assign(parts[p.id],state,{on:state.powered});}
    if(p.type==='capacitor'){const va=voltage(`part:${p.id}:a`),vb=voltage(`part:${p.id}:b`);capacitors[p.id]=va!=null&&vb!=null?va-vb:transient.capacitors?.[p.id]??0;if(!parts[p.id])parts[p.id]={voltage:capacitors[p.id],current:0,power:0,on:false};}
    if(p.type==='potentiometer')parts[p.id].voltage=(voltage(`part:${p.id}:p3`)??0)-(voltage(`part:${p.id}:p1`)??0);
  }
  return {fault:!converged,diagnostics,warnings:[...new Set(warnings)],parts,current:maxCurrent,uf,capacitors,voltage,hasLed:branches.some(b=>b.led)};
}
// A read at the same simulation time must not advance capacitor charge again.
export class CircuitSimulation{
 constructor(){this.time=null;this.base={};this.latest={};this.dt=1e-6;this.drivers=[];}
 // Programs of the other boards (fixed-run scenarios, ESP32 sketches) advance with circuit time (ms), add their
 // `<board>.<GPIO>` states and read their inputs from each solved step.
 withBoards(gpio,time){if(!this.drivers.length)return gpio;const out={...gpio};for(const d of this.drivers){if(time!==undefined)d.advance(time);Object.assign(out,d.gpio());}return out;}
 solve(project,gpio,pressed,time,echoHigh={},deviceSignals={}){
   if(this.time!==null&&time>this.time){this.base={...this.latest};this.dt=(time-this.time)/1000;}
   this.time=time;const result=solveCircuit(project,this.withBoards(gpio,time),pressed,{dt:this.dt,capacitors:this.base,echoHigh,deviceSignals});
   if(!result.fault){this.latest=result.capacitors;for(const d of this.drivers)d.observe?.(result,time);}return result;
 }
 hold(project,gpio,pressed,echoHigh={},deviceSignals={}){return solveCircuit(project,this.withBoards(gpio),pressed,{dt:1e-9,capacitors:this.latest,echoHigh,deviceSignals});}
}
// `<board id>.<GPIO>` pins of other boards: the board name and its header pin for messages and issue links.
function gpioName(project,pin){const [id,gpio]=pin.split('.');if(!gpio)return pin;return `${project.components.find(p=>p.id===id)?.name??id} ${gpio}`;}
function gpioEndpoint(project,pin){const [id,gpio]=pin.split('.');if(!gpio)return boardPin(pin);const part=project.components.find(p=>p.id===id);return part&&devboardPins(part).find(p=>p.signal===gpio)?.id;}
export function digitalRead(pin,result){const v=result?.voltage(`signal:${canonicalPin(pin)}`);return v!=null&&v>=1.65?1:0;}
