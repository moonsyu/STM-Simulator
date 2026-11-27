// The nets of a circuit and its DC solution. Which ids are one net and the solution are worked out in Rust
// (rust/stm-core/src/circuit.rs, feature 62); this file is the JavaScript side: it turns a project with catalog parts
// into its model (catalog-model.js), keeps the nets of a circuit until the circuit changes, and gives the answer the
// shape the callers read (`uf.find`, `voltage(id)`).
import {physicalToModel,physicalResult,physicalTopology} from './catalog-model.js';
import {canonicalPin,activeBoard} from './pins.js';
import {rustCall,rustText,rustExact,sealed,opened} from './rust-core.js';

export class UnionFind {
  constructor(){this.parent=new Map();}
  find(x){if(!this.parent.has(x))this.parent.set(x,x);const p=this.parent.get(x);if(p!==x)this.parent.set(x,this.find(p));return this.parent.get(x);}
  join(a,b){this.parent.set(this.find(a),this.find(b));}
}
/** The nets the Rust side answered ({ids, parent}: the ids in the order they were met and where each one's parent is
 *  in that list) as a UnionFind. */
export function netsOf({ids,parent}){const uf=new UnionFind(),map=uf.parent;for(let i=0;i<ids.length;i++)map.set(ids[i],ids[parent[i]]);return uf;}
// What the Rust side reads of a part for the nets: its kind and what it is attached to.
const NET=['id','type','model','variant','catalogVariant','position','attachments','attachA','attachB','electricalPins'];
// … and for a solve: the settings its branches depend on (they may change while the nets stand).
const LIVE=['name','position','value','voltage','color','lux','temperature','switch','motion','axisX','axisY','commonAnode','catalogState','linked'];
const pick=keys=>p=>{if(!p||typeof p!=='object')return p;const q={};for(const key of keys){const v=p[key];if(v!==undefined)q[key]=v;}return q;};
const netOf=pick(NET);
// A number JSON cannot carry (NaN, the infinities) goes as it is told apart on the Rust side (rust-core.js sealed).
const exact=v=>typeof v==='number'?(Number.isFinite(v)?v:sealed(v)):v&&typeof v==='object'?sealed(v):v;
const liveOf=p=>{if(!p||typeof p!=='object')return p;const q={};for(const key of LIVE){const v=p[key];if(v!==undefined)q[key]=exact(v);}return q;};
const hiddenOf=s=>s&&typeof s==='object'?{hidden:s.hidden}:s;
/** What the Rust side reads of a project (physical, or a model of catalog-model.js) for its nets. */
export function circuitView(project){
 const s=project.surfaces,wires=project.wires,ties=project.catalogTies;
 return {boardId:project.boardId,surfaces:s&&typeof s==='object'?{board:hiddenOf(s.board),breadboard:hiddenOf(s.breadboard)}:s,
  components:Array.isArray(project.components)?project.components.map(netOf):project.components,
  wires:Array.isArray(wires)?wires.map(w=>w&&typeof w==='object'?{from:w.from,to:w.to}:w):wires,...(ties?{catalogTies:ties}:{})};
}
// What a solve reads of the pins: how each is driven or pulled.
function pinsOf(gpio){
 const out={};
 for(const pin of Object.keys(gpio)){const g=gpio[pin];if(!g)continue;
  if(typeof g!=='object'){out[pin]=g;continue;}
  const q={mode:g.mode};if(g.value!==undefined)q.value=exact(g.value);if(g.openDrain)q.openDrain=true;if(g.pull)q.pull=g.pull;if(g.pwm)q.pwm={duty:exact(g.pwm.duty)};out[pin]=q;}
 return out;
}
const stepOf=t=>({...(t.dt!==undefined?{dt:exact(t.dt)}:{}),...(t.capacitors?{capacitors:exact(t.capacitors)}:{}),...(t.echoHigh?{echoHigh:t.echoHigh}:{}),...(t.deviceSignals?{deviceSignals:t.deviceSignals}:{}),...(t.pwmPhase?{pwmPhase:true}:{})});
// The nets change only when the circuit does: wires, where parts sit, switch positions and pressed buttons. A run
// solves the same circuit many times a step (every STM32 board solves it again for its own outputs), so the nets are
// kept per project object until that structure changes — here as a UnionFind for the callers, and on the Rust side
// (by `handle`) for the solves, with what else of the circuit does not change while they stand.
const NETS=new WeakMap();
function structureKey(project,pressed){
 let key=`${project.boardId}|${project.surfaces?.board?.hidden?1:0}${project.surfaces?.breadboard?.hidden?1:0}|${project.components.length}|${project.wires.length}|`;
 for(const w of project.wires)key+=w.from+'>'+w.to+';';
 for(const p of project.components){key+=p.id+':'+p.type+':'+(p.catalogVariant??'')+':'+(p.position??'')+':'+(p.model??'');const a=p.attachments;if(a)for(const k in a)key+=k+'='+a[k]+',';key+=';';}
 for(const k in pressed)if(pressed[k])key+='!'+k;
 for(const [a,b]of project.catalogTies||[])key+=a+'~'+b;
 return key;
}
// `index`: where each id the Rust side knows is in its list (the voltages of a solve come by that place).
function build(model,pressed){
 const listed=rustCall('circuit_nets',[sealed(circuitView(model)),pressed]),index=new Map();
 for(let i=0;i<listed.ids.length;i++)index.set(listed.ids[i],i);
 return {handle:listed.handle,uf:netsOf(listed),index};
}
function netsFor(owner,pressed,model){
 if(!owner||typeof owner!=='object')return build(model,pressed);
 const key=structureKey(owner,pressed),hit=NETS.get(owner);
 if(hit?.key===key)return hit.value;
 const value=build(model,pressed);NETS.set(owner,{key,value});return value;
}
export function topology(project,pressed={}) {
  const model=physicalToModel(project);if(model!==project)return physicalTopology(topology(model,pressed),model);
  return netsOf(rustExact('circuit_topology',circuitView(project),pressed));
}
// The Rust side keeps the newest circuits only: one it no longer has is made again.
const GONE='circuit nets: gone';
// `owner`: the project the caller passed (the physical model is new on every call, the cached nets belong to it).
function solve(model,gpio,pressed,transient,owner){
  const nets=netsFor(owner,pressed,model),asked=[0,model.components.map(liveOf),pinsOf(gpio),pressed,stepOf(transient),activeBoard()];
  // A solve is told by its request alone, and a run asks the same one step after step while nothing changes: the
  // last answer of these nets is kept as text and read again (each caller gets its own objects).
  const ask=()=>{
    asked[0]=nets.handle;const request=JSON.stringify({fn:'circuit_solve',args:asked});
    if(nets.request!==request){nets.answer=rustText(request);nets.request=request;}
    const answer=JSON.parse(nets.answer);
    if('error' in answer){nets.request=null;throw new Error(answer.error);}
    return answer.ok;
  };
  let answer;
  try{answer=ask();}
  catch(error){
    if(error.message!==GONE)throw error;
    Object.assign(nets,build(model,pressed));answer=ask();
  }
  const {uf,index}=nets;
  // Ids the solve met for the first time (a driven pin's `drive:PA5`): the nets here learn them in the same order.
  if(answer.met)for(const id of answer.met){uf.find(id);if(!index.has(id))index.set(id,index.size);}
  // A read that is neither an LED's nor a buzzer's has no `on` (it comes as null).
  const parts=answer.inexact?opened(answer.parts):answer.parts;
  for(const id in parts){const read=parts[id];if(read.on===null)read.on=undefined;const channels=read.channels;if(channels)for(const k in channels)if(channels[k].on===null)channels[k].on=undefined;}
  if(!('hasLed' in answer))return {fault:answer.fault,warnings:answer.warnings,parts,voltage:()=>null,current:answer.current,uf};
  // Only ground-referenced voltages are exposed. An isolated circuit must not read as ground.
  const volts=answer.volts,value=new Float64Array(index.size),known=new Uint8Array(index.size);
  for(let i=0;i<volts.length;i+=2){value[volts[i]]=Number(volts[i+1]);known[volts[i]]=1;}
  const voltage=id=>{const i=index.get(uf.find(id));return i!==undefined&&known[i]?value[i]:null;};
  const more=answer.inexact?opened({diagnostics:answer.diagnostics,current:answer.current,capacitors:answer.capacitors}):answer;
  return {fault:answer.fault,diagnostics:more.diagnostics,warnings:answer.warnings,parts,current:more.current,uf,capacitors:more.capacitors,voltage,hasLed:answer.hasLed};
}
// PWM outputs (`pwm: {duty}`) are solved at their average voltage, which suits motors, filters and ADC reads. An LED
// only conducts above its forward voltage, so its current is the average of the PWM high and low phases instead
// (circuit.rs solve_circuit).
export function solveCircuit(project,gpio={},pressed={},transient={}){
  const model=physicalToModel(project);
  return model!==project?physicalResult(solve(model,gpio,pressed,transient,project),model):solve(project,gpio,pressed,transient,project);
}
// A read at the same simulation time must not advance capacitor charge again.
export class CircuitSimulation{
 constructor(){this.time=null;this.base={};this.latest={};this.dt=1e-6;this.drivers=[];}
 // Programs of the other boards (the other STM32 boards) advance with circuit time (ms), add their
 // `<board>.<pin>` states and read their inputs from each solved step.
 withBoards(gpio,time){if(!this.drivers.length)return gpio;const out={...gpio};for(const d of this.drivers){if(time!==undefined)d.advance(time);Object.assign(out,d.gpio());}return out;}
 solve(project,gpio,pressed,time,echoHigh={},deviceSignals={}){
   if(this.time!==null&&time>this.time){this.base={...this.latest};this.dt=(time-this.time)/1000;}
   this.time=time;const result=solveCircuit(project,this.withBoards(gpio,time),pressed,{dt:this.dt,capacitors:this.base,echoHigh,deviceSignals});
   if(!result.fault){this.latest=result.capacitors;for(const d of this.drivers)d.observe?.(result,time);}return result;
 }
 hold(project,gpio,pressed,echoHigh={},deviceSignals={}){return solveCircuit(project,this.withBoards(gpio),pressed,{dt:1e-9,capacitors:this.latest,echoHigh,deviceSignals});}
}
export function digitalRead(pin,result){const v=result?.voltage(`signal:${canonicalPin(pin)}`);return v!=null&&v>=1.65?1:0;}
