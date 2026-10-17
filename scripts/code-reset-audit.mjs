import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {resetAuditCases,assertMinimal} from './reset-audit-cases.mjs';
import {resetMainCode} from '../src/code-reset.js';
import {SimulationSession} from '../src/session.js';
import {applyDeviceExample} from '../src/device-assistance.js';
import {PART_LIBRARY} from '../src/part-library.js';
import {fixture,execute} from './docs-audit/runtime.mjs';
import {assess} from './docs-audit/oracles.mjs';

const out=new URL('../work/test-results/minimal-reset/',import.meta.url);await fs.mkdir(out,{recursive:true});
const results=[],errors=[];
for(const [id,original]of resetAuditCases()){
 try{
  const p=resetMainCode(original),printed=[];assertMinimal(p);
  const session=new SimulationSession(p,{print:text=>printed.push(text)}),states=[];
  for(const time of [0,100,1100]){session.tick(time);states.push(structuredClone({time:session.runtime.time,pins:session.runtime.gpio,parts:session.viewResult.parts,timers:[...session.hal.timerModel.states.values()].map(t=>({id:t.id,active:t.active})),fault:session.result.fault}));}
  assert.equal(printed.length,0);assert.ok(states.every(s=>!s.fault&&s.timers.every(t=>!t.active)));
  const record={id,passed:true,code:p.code,mcu:p.mcu,states,printed};
  await fs.writeFile(new URL(id+'.json',out),JSON.stringify(record,null,2));results.push({id,passed:true});
 }catch(error){errors.push({phase:'reset',id,error:error.message});console.log('FAIL reset '+id+': '+error.message);}
}
for(const {type}of PART_LIBRARY){
 try{
  const {project,target}=fixture(type),p=applyDeviceExample(project,target).project;
  const reset=resetMainCode(p);assertMinimal(reset);
  const restored=applyDeviceExample(reset,target).project;
  for(const key of ['components','wires'])assert.deepEqual(restored[key],p[key],type+': '+key);
  const execution=execute(restored,{end:/dht|ds18b20/.test(type)?5500:3500}),checks=assess(type,execution);
  await fs.writeFile(new URL('reapply-'+type+'.json',out),JSON.stringify({type,passed:checks.passed,code:restored.code,checks,execution},null,2));
  assert.ok(checks.passed,checks.checks.filter(c=>!c.passed).map(c=>c.name).join(', '));
  results.push({type,reapplied:true,passed:true});console.log('PASS reset/reapply '+type);
 }catch(error){errors.push({phase:'reapply',type,error:error.message});console.log('FAIL reapply '+type+': '+error.message);}
}
const report={passed:errors.length===0,resetCount:results.filter(r=>r.id).length,reapplyCount:results.filter(r=>r.reapplied).length,results,errors};
await fs.writeFile(new URL('summary.json',out),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,resetCount:report.resetCount,reapplyCount:report.reapplyCount,errors}));
if(errors.length)process.exitCode=1;
