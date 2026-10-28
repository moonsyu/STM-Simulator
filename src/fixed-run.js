import {devboardModel} from './devboards.js';
import {SketchDriver} from './esp32-sketch.js';

// Fixed run: ESP32 / Raspberry Pi boards from the lecture examples do not execute their code. Each example has a
// scenario that reproduces what its code does: output pins over time, reactions to inputs and the lines the program
// prints. The pin states go into the same circuit solution as the STM32, so wiring mistakes still show.
export const FIXED_RUN_SCENARIOS=new Map();
export function defineScenario(id,scenario){FIXED_RUN_SCENARIOS.set(id,scenario);return id;}

const VCC=3.3;
export class FixedRunDriver{
 constructor(part,scenario,{log=()=>{},project}={}){
  this.part=part;this.scenario=scenario;this.project=project;this.output='';this.print=text=>{this.output=(this.output+text+'\n').slice(-8000);log(text);};this.pins={};this.timers=[];this.handlers=new Map();this.levels=new Map();this.time=0;this.started=false;this.result=null;
  const ctx=this.ctx={
   time:()=>this.time,
   output:(pin,value)=>{this.pins[pin]={mode:'OUTPUT',value:value?VCC:0};},
   pwm:(pin,duty)=>{const d=Math.max(0,Math.min(1,duty));this.pins[pin]={mode:'OUTPUT',value:VCC*d};},
   // `handler(ctx, level)` runs on each change of the input; with `{level:true}` also for the first level read (a
   // program that polls the pin, not one waiting for an edge).
   input:(pin,pull=null,handler=null,{level=false}={})=>{this.pins[pin]={mode:pull==='up'?'INPUT_PULLUP':pull==='down'?'INPUT_PULLDOWN':'INPUT'};if(handler)this.handlers.set(pin,{handler,level});},
   release:pin=>{delete this.pins[pin];},
   read:pin=>{const v=this.voltage(pin);return v==null?null:v>=1.65?1:0;},
   voltage:pin=>this.voltage(pin),
   after:(ms,fn)=>{this.timers.push({at:this.time+ms,fn});},
   every:(ms,fn)=>{this.timers.push({at:this.time+ms,fn,period:ms});},
   log:text=>this.print(text),
   part:name=>this.project?.components.find(p=>p.name===name||p.id===name),
   // A part terminal: its voltage, and whether it is wired to one of this board's pins.
   partVoltage:(name,key)=>{const p=ctx.part(name);return p?this.result?.voltage?.(`part:${p.id}:${key}`)??null:null;},
   wiredTo:(pin,name,key)=>{const p=ctx.part(name),uf=this.result?.uf;return !!p&&!!uf&&uf.find(`part:${p.id}:${key}`)===uf.find(`signal:${this.part.id}.${pin}`);}
  };
  Object.freeze(ctx);
 }
 voltage(pin){return this.result?.voltage?.(`signal:${this.part.id}.${pin}`)??null;}
 advance(time){
  if(!this.started){this.started=true;this.time=Math.min(this.time,time);this.scenario.start?.(this.ctx);}
  // Timers due up to `time` run in order; a timer callback may schedule more (`every` re-arms itself).
  for(let guard=0;guard<10000;guard++){
   const next=this.timers.reduce((a,t)=>!a||t.at<a.at?t:a,null);if(!next||next.at>time)break;
   this.time=next.at;if(next.period)next.at+=next.period;else this.timers.splice(this.timers.indexOf(next),1);next.fn(this.ctx);
  }
  this.time=Math.max(this.time,time);
 }
 gpio(){const out={};for(const [pin,state]of Object.entries(this.pins))out[`${this.part.id}.${pin}`]=state;return out;}
 // I2C slave of a scenario: {address, sda, scl} with onI2cReceive(ctx, bytes) / onI2cRequest(ctx, count) → bytes.
 i2cSlave(){return this.scenario.i2cSlave??null;}
 i2cReceive(bytes){this.scenario.onI2cReceive?.(this.ctx,[...bytes]);return true;}
 i2cRequest(count){const out=[...(this.scenario.onI2cRequest?.(this.ctx,count)??[])].slice(0,count);while(out.length<count)out.push(0xff);return out.map(v=>v&255);}
 observe(result){
  this.result=result;
  for(const [pin,{handler,level:polled}]of this.handlers){const level=this.ctx.read(pin);if(level==null)continue;const before=this.levels.get(pin);this.levels.set(pin,level);if(before===undefined?polled:before!==level)handler(this.ctx,level);}
 }
}
/** A board without a scenario stays idle: its pins are inputs and the circuit still shows their voltages. */
export class IdleDriver{constructor(part){this.part=part;}advance(){}gpio(){return {};}observe(){}}
/**
 * Drivers for the boards that run in this simulation. `scope` is 'all' or a component id (only that board runs);
 * the STM32 itself is not a driver.
 */
export function createBoardDrivers(project,{log=()=>{},scope='all'}={}){
 const drivers=[];
 for(const part of project.components){
  // STM32 boards run as their own simulator / emulator sessions (stm32-boards.js).
  if(part.type!=='devboard'||!devboardModel(part)||devboardModel(part).kind==='stm32')continue;
  if(scope!=='all'&&scope!==part.id)continue;
  const scenario=part.scenario&&FIXED_RUN_SCENARIOS.get(part.scenario),say=text=>log(`[${part.name}] ${text}`);
  // ESP32 boards run their sketch; Raspberry Pi boards their lecture scenario (fixed run).
  if(devboardModel(part).kind==='esp32'){say(`스케치를 실행합니다 · ${devboardModel(part).file}`);drivers.push(new SketchDriver(part,{log:say,project}));continue;}
  if(scenario){say(`고정 실행 시작 · ${scenario.title||part.scenario}`);drivers.push(new FixedRunDriver(part,scenario,{log:say,project}));}
  else{say('고정 실행 예제가 아닌 보드라 코드를 실행하지 않습니다. 배선과 전압만 확인할 수 있습니다.');drivers.push(new IdleDriver(part));}
 }
 return drivers;
}
