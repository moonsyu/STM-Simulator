import {createHash} from 'node:crypto';
import {blankProject} from '../../src/project.js';
import {PART_DEFS} from '../../src/components.js';
import {CATALOG_BY_TYPE} from '../../src/catalog-defs.js';
import {DEVICE_RECIPES} from '../../src/device-docs-data.js';
import {halExample} from '../../src/hal-examples.js';
import {applyDeviceExample} from '../../src/device-assistance.js';
import {SimulationSession} from '../../src/session.js';

export const family=type=>CATALOG_BY_TYPE[type]?.family||type;
export function fixture(type){
 const project=blankProject(),target=type==='board'?{type:'surface',id:'board'}:{type:'part',id:'selected'};
 if(type!=='board')project.components=[{id:'selected',type,name:type,x:800,y:350,rotation:0,span:70,...(type==='resistor'?{value:330}:{}),...(type==='led'?{color:'red'}:{}),...PART_DEFS[type]?.defaults}];
 project.code+='\nint auditUserKeep(void) { return 42; }\n';
 return {project,target};
}
export function referenceFor(type){
 const p=halExample(DEVICE_RECIPES[type]),primary=p.components.find(c=>c.type===type),selected=fixture(type).project.components[0];
 if(primary&&selected)for(const [key,value]of Object.entries(selected))if(!['id','name','type','x','y','rotation','span'].includes(key))primary[key]=value;
 return p;
}
export const apply=(type,api='all')=>{const {project,target}=fixture(type);return applyDeviceExample(project,target,{api});};
function compact(value,depth=0){
 if(depth>9)return '[depth limit]';
 if(value===null||typeof value!=='object')return typeof value==='function'?undefined:value;
 if(value instanceof Map)return Object.fromEntries([...value].map(([k,v])=>[k,compact(v,depth+1)]));
 if(value instanceof Set)return [...value];
 if(ArrayBuffer.isView(value)||Array.isArray(value)){
  if(value.length>32&&Array.from(value).every(v=>typeof v==='number')){const array=Array.from(value);return {length:array.length,nonzero:array.filter(Boolean).length,sha256:createHash('sha256').update(JSON.stringify(array)).digest('hex'),first:array.slice(0,16),last:array.slice(-4)};}
  return Array.from(value).map(v=>compact(v,depth+1));
 }
 return Object.fromEntries(Object.entries(value).filter(([k])=>!['queue','ptr','init'].includes(k)).map(([k,v])=>[k,compact(v,depth+1)]));
}
export function inputChanges(type,phase){
  const f=family(type),next={};
  if(f==='potentiometer')next.position=phase===1?20:80;
  if(f==='ldr')next.lux=phase===1?1:100;
  if(['ntc','temperature','sht31','dht11','dht22'].includes(f))next.temperature=phase===1?10:45;
  if(['sht31','dht11','dht22'].includes(f))next.humidity=phase===1?30:70;
  if(f==='pir')next.motion=phase===1?1:0;
  if(f==='ultrasonic')next.distance=phase===1?55:170;
  if(f==='joystick')Object.assign(next,{axisX:phase===1?25:75,axisY:phase===1?75:25,switch:phase===1?1:0});
  if(f==='mpu6050')Object.assign(next,{ax:phase===1?-.5:.75,gz:phase===1?90:-45});
  if(f==='slide')next.position=phase===1?1:0;
  if(f==='encoder'){next.position=phase===1?3:1;next.switch=phase===1?1:0;}
  return next;
}
function stimulate(p,s,phase){
 for(const part of p.components){
  if(family(part.type)==='button')s.pressed[part.id]=phase===1;
  Object.assign(part,inputChanges(part.type,phase));
 }
 s.setPressed(s.pressed);s.changed();
}
export function execute(input,{end=3500,stimulus=true,api=null,onTick=null}={}){
 const project=structuredClone(input),printed=[],uart=[],trace=[],calls={},frames=[];
 let s,error=null,time=0;
 const add=(name,args,r,result,failed=false)=>{
  if(!/^HAL_|^__HAL_/.test(name))return;
  const row=calls[name]??={count:0,returns:{},firstUs:r.microTime,lastUs:r.microTime,samples:[]};row.count++;row.lastUs=r.microTime;
  if(result!==undefined){const key=String(result);if(Object.keys(row.returns).length<32||key in row.returns)row.returns[key]=(row.returns[key]||0)+1;}
  if(row.samples.length<3||failed)row.samples.push({atUs:r.microTime,args:args.map(v=>typeof v==='object'?'[pointer/struct]':v),result:typeof result==='object'?'[object]':result,failed});
 };
 try{
  s=new SimulationSession(project,{print:text=>{if(printed.length<120)printed.push({atMs:s?.runtime.microTime/1000||0,text});},uart:event=>{if(uart.length<50)uart.push(compact(event));},trace:event=>{if(trace.length<30)trace.push(compact(event));}});
  const call=s.hal.call.bind(s.hal),invoke=s.hal.invoke.bind(s.hal);
  s.hal.call=(name,args,r)=>{try{const result=call(name,args,r);if(result!==undefined)add(name,args,r,result);return result;}catch(e){add(name,args,r,e.message,true);throw e;}};
  s.hal.invoke=(name,args,r)=>{const generator=invoke(name,args,r);if(!generator)return generator;return(function*(){try{const result=yield* generator;add(name,args,r,result);return result;}catch(e){add(name,args,r,e.message,true);throw e;}})();};
  const milestones=new Set([0,20,100,200,600,1000,1200,1800,2200,2500,3000,3500,4500,5500,end]);
  for(time=0;time<=end;time+=10){
   onTick?.({time,project,session:s});
   if(stimulus&&time===100)for(const id of s.hal.serials.keys())s.inject('Audit42',id+':external');
   if(stimulus&&time===1100)stimulate(project,s,1);
   if(stimulus&&time===2300)stimulate(project,s,2);
   const result=s.tick(time);
   if(milestones.has(time))frames.push({atMs:time,parts:compact(result.parts),pins:compact(s.runtime.gpio),fault:result.fault,warnings:result.warnings,received:compact(s.buses.received),timers:[...s.hal.timerModel.states].map(([id,t])=>({id,kind:t.kind,active:t.active,base:t.base,channels:[...t.channels].map(([key,c])=>({key,active:c.active,pulse:c.pulse}))})),handles:[...s.hal.handles.keys()],adc:[...s.hal.adc].map(([id,a])=>({id,channel:a.channel,value:a.value,active:a.active}))});
  }
 }catch(e){error={message:e.message,atMs:time};}
 return {endMs:end,reachedMs:s?.runtime.microTime/1000,error,printed,uart,trace,calls,frames,selectedApi:api,selectedApiCalls:api?calls[api]?.count||0:undefined};
}
