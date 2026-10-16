import fs from 'node:fs/promises';
import {Worker,isMainThread,parentPort,workerData} from 'node:worker_threads';
import {createHash} from 'node:crypto';
import {PART_LIBRARY} from '../../src/part-library.js';
import {deviceDocs,expectedNets,wiringTopology} from '../../src/device-docs-data.js';
import {baremetalCards} from '../../src/device-baremetal.js';
import {applyDeviceExample} from '../../src/device-assistance.js';
import {PINS,boardPin} from '../../src/pins.js';
import {cFunctions} from '../../src/c-source-edit.js';
import {apply,execute,fixture,referenceFor} from './runtime.mjs';
import {assess} from './oracles.mjs';

const root=new URL('../../',import.meta.url),out=new URL('work/test-results/docs-audit/',root);
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
function netGroups(sample,binding){return expectedNets(sample).map(net=>[...new Set(net.map(id=>{const pin=PINS.find(p=>p.id===id);if(pin)return boardPin(binding.pins[pin.signal]||pin.signal);const [,part,key]=id.split(':');return `part:${binding.parts[part]}:${key}`;}))]);}
function topology(project,groups){const uf=wiringTopology(project);return {connected:groups.every(g=>g.every(id=>uf.find(id)===uf.find(g[0]))),isolated:groups.every((g,i)=>groups.slice(i+1).every(other=>uf.find(other[0])!==uf.find(g[0])))};}
function structural(original,p){return {userCodePreserved:p.code.includes('int auditUserKeep(void) { return 42; }'),noNewFiles:JSON.stringify(p.firmware.files)===JSON.stringify(original.firmware.files),noNewFunctions:JSON.stringify(cFunctions(p.code).map(f=>f.name).sort())===JSON.stringify(cFunctions(original.code).map(f=>f.name).sort())};}
async function core(type){
 const {project:original,target}=fixture(type),a=apply(type),docs=deviceDocs(type),groups=netGroups(docs.sample,a.binding),end=/dht/.test(type)?5500:3500;
 const execution=execute(a.project,{end}),assessment=assess(type,execution),nets=topology(a.project,groups),structure=structural(original,a.project);
 const repeat=applyDeviceExample(a.project,target),idempotent=hash(repeat.project)===hash(a.project),removed=[];
 for(const wire of a.project.wires){const p=structuredClone(a.project);p.wires=p.wires.filter(w=>w.id!==wire.id);try{const fixed=applyDeviceExample(p,target);removed.push({wire:wire.id,...topology(fixed.project,groups)});}catch(e){removed.push({wire:wire.id,error:e.message});}}
 const damaged=structuredClone(a.project);damaged.wires=[];
 if(groups.length>1)damaged.wires.push({id:'audit-wrong',from:groups[0][0],to:groups[1][0],color:'#ff0000'});
 damaged.components.push({id:'unrelated',type:'resistor',value:330,name:'preserved',x:1500,y:300,rotation:0,span:70});
 const keep={id:'audit-keep',from:'part:unrelated:a',to:'part:unrelated:b',color:'#abcdef',points:[{x:1400,y:300}]};damaged.wires.push(keep);
 let repair;try{const fixed=applyDeviceExample(damaged,target),run=execute(fixed.project,{end});repair={report:fixed.report,topology:topology(fixed.project,groups),unrelatedWirePreserved:JSON.stringify(fixed.project.wires.find(w=>w.id===keep.id))===JSON.stringify(keep),execution:run,assessment:assess(type,run)};}catch(e){repair={error:e.message};}
 let reference;try{const p=referenceFor(type);reference={execution:execute(p,{end})};}catch(e){reference={error:e.message};}
 await fs.writeFile(new URL(type+'.stm32lab',out),JSON.stringify(a.project));
 return {type,...PART_LIBRARY.find(p=>p.type===type),report:a.report,binding:a.binding,structure,topology:nets,idempotent,removedWireChecks:removed,assessment,execution,repair,reference,baremetal:baremetalCards(docs.sample.mcu,type,docs.sample).map(c=>({id:c.id,name:c.name,status:'not-executable-by-HAL-simulator'}))};
}
async function cards(type){
 const docs=deviceDocs(type),rows=[];
 for(const {name:api} of docs.functions){
  try{
   const {project:original}=fixture(type),a=apply(type,api);let e=execute(a.project,{end:/dht/.test(type)?5500:/ds18b20|sd_storage|tft|st7735/.test(type)?3500:800,api});
   if(!e.error&&!e.calls[api])e=execute(a.project,{end:6500,api});
   const call=e.calls[api],structure=structural(original,a.project);
   const statusApis=/^HAL_(?:ADC_(?:Init|Start|PollForConversion|ConfigChannel)|(?:I2C|SPI|UART)_(?:Init|Transmit|Receive|Mem|Master)|TIM_(?:PWM|Base|IC|Encoder)_(?:Init|Start|Stop|Config)|CAN_(?:Init|Start|ConfigFilter|AddTxMessage|GetRxMessage)|I2S_(?:Init|Transmit)|RCC_.*Config)/;
   const nonzeroOnly=statusApis.test(api)&&call&&Object.keys(call.returns).length>0&&!Object.hasOwn(call.returns,'0');
   const status=e.error?'runtime-error':!call?'api-not-reached':nonzeroOnly?'no-success-return':'api-exercised';
   rows.push({api,status,structure,topology:topology(a.project,netGroups(docs.sample,a.binding)),execution:e});
  }catch(e){rows.push({api,status:'apply-error',error:e.message});}
 }
 return {type,cards:rows};
}
if(!isMainThread){try{parentPort.postMessage(await (workerData.phase==='core'?core:cards)(workerData.type));}catch(e){parentPort.postMessage({type:workerData.type,fatal:e.stack});}}
else {
 await fs.mkdir(out,{recursive:true});const phase=process.argv[2]||'core',selected=process.env.DOCS_AUDIT_TYPES?.split(','),queue=PART_LIBRARY.filter(p=>!selected||selected.includes(p.type)).map(p=>p.type),results=[];
 async function consume(){while(queue.length){const type=queue.shift(),start=Date.now();const result=await new Promise(resolve=>{const w=new Worker(new URL(import.meta.url),{workerData:{type,phase},resourceLimits:{maxOldGenerationSizeMb:512}});const timer=setTimeout(()=>{w.terminate();resolve({type,fatal:'worker timeout 180 seconds'});},180000);w.once('message',v=>{clearTimeout(timer);resolve(v);});w.once('error',e=>{clearTimeout(timer);resolve({type,fatal:e.message});});});await fs.writeFile(new URL(`${phase}-${type}.json`,out),JSON.stringify(result,null,2));results.push({type,ms:Date.now()-start,fatal:result.fatal,passed:result.assessment?.passed,failures:result.assessment?.checks.filter(c=>!c.passed).map(c=>c.name),cards:result.cards?.length,cardFailures:result.cards?.filter(c=>c.status!=='api-exercised').map(c=>({api:c.api,status:c.status,error:c.error}))});console.log(JSON.stringify(results.at(-1)));}}
 await Promise.all(Array.from({length:Number(process.env.DOCS_AUDIT_WORKERS||3)},consume));await fs.writeFile(new URL(`${phase}-summary.json`,out),JSON.stringify(results,null,2));
}
