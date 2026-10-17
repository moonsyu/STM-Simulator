import fs from 'node:fs/promises';
import {Worker,isMainThread,parentPort,workerData} from 'node:worker_threads';
import {HAL_EXAMPLES,halExample} from '../../src/hal-examples.js';
import {CATALOG_EXAMPLES} from '../../src/catalog-examples.js';
import {execute} from './runtime.mjs';
import {assess} from './oracles.mjs';
import paths from './paths.cjs';

export const legacyIds=Object.keys(HAL_EXAMPLES).filter(k=>!CATALOG_EXAMPLES[k]);
export function legacyAssessment(id,project,e){
 const mapping={blink:'led',uart_external:'uart',adc:'resistor',pwm:'capacitor',timer_encoder:'encoder'},type=mapping[id]||id;
 const selected=project.components.find(v=>v.type===type)||project.components[0];
 const extra=['timer_multi','timer_capture','exti','uart','timer','samples','language'].includes(id);
 if(!extra)return assess(type,{...e,frames:e.frames.map(f=>({...f,parts:{...f.parts,selected:f.parts?.[selected?.id]}}))});
 const checks=[],check=(name,passed,evidence)=>checks.push({name,passed:!!passed,evidence}),text=e.printed.map(v=>v.text).join('\n'),parts=e.frames.flatMap(f=>Object.values(f.parts||{}));
 check('execution without exception or circuit short',!e.error&&!e.frames.some(f=>f.fault),e.error);
 if(id==='timer_multi'){
  check('servo independently reaches 0, 90 and 180 degrees',[0,90,180].every(n=>parts.some(p=>Math.abs(p.angle-n)<5)),parts.filter(p=>'angle'in p).map(p=>p.angle));
  check('motor keeps positive rotation above 2000 rpm',parts.some(p=>p.rpm>2000)&&!parts.some(p=>p.rpm<0),parts.filter(p=>'rpm'in p).map(p=>p.rpm));
 }else if(id==='timer_capture')check('250 Hz captures have 4000 us periods',e.printed.length>10&&e.printed.every(v=>v.text==='TIM4 capture: period=4000 us frequency=250 Hz'),e.printed.slice(0,5));
 else if(id==='exti')check('one falling edge causes exactly one LED transition',e.printed.filter(v=>v.text==='EXTI PC13').length===1&&parts.some(p=>p.on)&&parts.some(p=>p.on===false),e.printed);
 else if(id==='uart'){
  const tx=e.uart.filter(v=>v.direction==='TX').flatMap(v=>v.bytes||[]),received=String.fromCharCode(...tx);
  check('onboard VCP greeting and injected bytes echoed without UART component',!project.components.some(p=>p.type==='uart')&&received.includes('HAL UART ready')&&received.includes('Vcp42'),received);
 }else if(id==='timer'){
  const values=[...text.matchAll(/TIM2 tick=(\d+)/g)].map(m=>Number(m[1]));
  check('100 ms timer interrupt cadence',values.length>=30&&values.every((n,i)=>n===(i+1)*100),values);
 }else if(id==='samples')check('all eight ADC array entries read the divider',[...Array(8).keys()].every(i=>new RegExp('sample\\['+i+'\\]=204[78]').test(text)),e.printed.slice(0,8));
 else if(id==='language')check('helper/array/structure computes average 25',text.trim()==='average=25',text);
 return {passed:checks.every(c=>c.passed),checks};
}

async function run(id){
 const project=halExample(id),execution=execute(project,{onTick:({time,session})=>{
  if(id==='exti'&&[1100,2300].includes(time))session.setPressed({USER:time===1100});
  if(id==='uart'&&time===100)session.inject('Vcp42','USART2');
 }}),assessment=legacyAssessment(id,project,execution);
 const result={id,name:HAL_EXAMPLES[id],assessment,project,execution};
 await fs.writeFile(new URL('legacy-'+id+'.json',paths.out),JSON.stringify(result,null,2));
 return {id,name:HAL_EXAMPLES[id],...assessment};
}
if(!isMainThread){run(workerData).then(result=>parentPort.postMessage(result)).catch(error=>parentPort.postMessage({id:workerData,passed:false,error:error.message}));}
else if(process.argv[1]&&new URL(import.meta.url).pathname.replace(/^\//,'').toLowerCase()===process.argv[1].replaceAll('\\','/').toLowerCase()){
 await fs.mkdir(paths.directory,{recursive:true});const queue=[...legacyIds],results=[];
 await Promise.all(Array.from({length:3},async()=>{while(queue.length){const id=queue.shift(),row=await new Promise((resolve,reject)=>{const w=new Worker(new URL(import.meta.url),{workerData:id});w.once('message',resolve);w.once('error',reject);w.once('exit',code=>{if(code)reject(new Error(id+' worker exit '+code));});});results.push(row);console.log(id+': '+(row.passed?'PASS':'FAIL'));}}));
 const report={version:paths.version,passed:results.every(r=>r.passed),count:results.length,results:results.sort((a,b)=>a.id.localeCompare(b.id))};
 await fs.writeFile(new URL('legacy-summary.json',paths.out),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,count:report.count}));if(!report.passed)process.exitCode=1;
}
