import fs from 'node:fs/promises';
import {fixture,execute} from './runtime.mjs';
import {assess} from './oracles.mjs';
import {applyDeviceExample} from '../../src/device-assistance.js';
import paths from './paths.cjs';
await fs.mkdir(paths.directory,{recursive:true});
for(const type of ['stepper','l298n']){
 const {project,target}=fixture(type),occupied=type==='stepper'?'PB3':'PB4';project.mcu.pins[occupied]={function:'GPIO_Output',pull:'NOPULL',edge:'FALLING',initial:0,label:'keep'};
 const applied=applyDeviceExample(project,target),steps=[],execution=execute(applied.project,{onTick:({time,session})=>{const n=session.viewResult?.parts.selected?.steps;if(n!==undefined)steps.push({time,steps:n});}});
 const actual=assess(type,execution),functional=type==='stepper'?Math.max(...steps.map(v=>v.steps))>=95&&steps.some((n,i)=>i&&n.steps<steps[i-1].steps):actual.passed;
 const passed=functional&&!execution.error&&applied.binding.pins[occupied][1]!=='B'&&execution.frames.every(f=>!f.pins[occupied]?.value);
 await fs.writeFile(new URL('remapped-'+type+'.json',paths.out),JSON.stringify({type,passed,occupied,binding:applied.binding,project:applied.project,execution,steps},null,2));console.log(type+': '+(passed?'PASS':'FAIL'));if(!passed)process.exitCode=1;
}
