import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {inlineStatements} from '../../src/c-inline.js';
import {blankProject} from '../../src/project.js';
import {SimulationSession} from '../../src/session.js';
import {createDiagnostics} from '../../src/diagnostics.js';
import {apply,execute} from './runtime.mjs';
import paths from './paths.cjs';
const {Diagnostics}=createRequire(import.meta.url)('../../desktop/diagnostics.cjs'),{out,version}=paths;
await fs.mkdir(out,{recursive:true});
const source='int twice(int value) { return value * 2; }',expanded=inlineStatements('printf("answer=%d\\n", twice(21));',source,'audit_'),p=blankProject();
p.code=p.code.replace('/* USER CODE BEGIN 3 */','/* USER CODE BEGIN 3 */\n'+expanded);
const execution=execute(p,{end:600,stimulus:false});
const correct=execution.printed.some(v=>v.text==='answer=42');
await fs.writeFile(new URL('inline-name-collision.json',out),JSON.stringify({source,expanded,expected:'answer=42',observed:execution.printed,passed:correct},null,2));
const diagnostics=[];
for(const type of ['tft','ref_st7735_8']){
 const s=new SimulationSession(apply(type).project,{print:()=>{}});for(let t=0;t<=3500;t+=10)s.tick(t);
 const detail={status:'running',simulationMs:3500,pins:s.runtime.gpio,parts:s.result.parts,fault:s.result.fault,warnings:s.result.warnings};
 const d=new Diagnostics(fileURLToPath(new URL('diagnostic-limit-test/'+type+'/',out)),version);
 try{const errors=[];await createDiagnostics(input=>d.record(input),()=>null,e=>errors.push(e))('simulation.state',detail);if(errors.length)throw new Error(errors.join('; '));const saved=(await fs.readFile(new URL('diagnostic-limit-test/'+type+'/diagnostics/events.jsonl',out),'utf8')).trim().split('\n').map(JSON.parse).at(-1);if(saved.session!==d.session)throw new Error('No new state event saved');diagnostics.push({type,characters:JSON.stringify(detail).length,savedCharacters:JSON.stringify(saved).length,accepted:true,ram:saved.detail.parts.selected.device.ram});}catch(e){diagnostics.push({type,characters:JSON.stringify(detail).length,accepted:false,error:e.message});}
}
await fs.writeFile(new URL('diagnostic-limit.json',out),JSON.stringify(diagnostics,null,2));
console.log(JSON.stringify({inlineReturnCorrect:correct,diagnostics}));
if(!correct||diagnostics.some(d=>!d.accepted))process.exitCode=1;
