import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {inlineStatements} from '../../src/c-inline.js';
import {blankProject} from '../../src/project.js';
import {SimulationSession} from '../../src/session.js';
import {apply,execute} from './runtime.mjs';
const {Diagnostics}=createRequire(import.meta.url)('../../desktop/diagnostics.cjs'),out=new URL('../../work/test-results/docs-audit/',import.meta.url);
await fs.mkdir(out,{recursive:true});
const source='int twice(int value) { return value * 2; }',expanded=inlineStatements('printf("answer=%d\\n", twice(21));',source,'audit_'),p=blankProject();
p.code=p.code.replace('/* USER CODE BEGIN 3 */','/* USER CODE BEGIN 3 */\n'+expanded);
const execution=execute(p,{end:600,stimulus:false});
await fs.writeFile(new URL('inline-name-collision.json',out),JSON.stringify({source,expanded,expected:'answer=42',observed:execution.printed,confirmed:execution.printed.some(v=>v.text==='answer=0')},null,2));
const diagnostics=[];
for(const type of ['tft','ref_st7735_8']){
 const s=new SimulationSession(apply(type).project,{print:()=>{}});for(let t=0;t<=3500;t+=10)s.tick(t);
 const detail={status:'running',simulationMs:3500,pins:s.runtime.gpio,parts:s.result.parts,fault:s.result.fault,warnings:s.result.warnings};
 const d=new Diagnostics(fileURLToPath(new URL('diagnostic-limit-test/',out)),'0.23.1');
 try{await d.record({type:'simulation.state',detail});diagnostics.push({type,characters:JSON.stringify(detail).length,accepted:true});}catch(e){diagnostics.push({type,characters:JSON.stringify(detail).length,accepted:false,error:e.message});}
}
await fs.writeFile(new URL('diagnostic-limit.json',out),JSON.stringify(diagnostics,null,2));
console.log(JSON.stringify({inlineCollisionObserved:execution.printed.some(v=>v.text==='answer=0'),diagnostics}));
