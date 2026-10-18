import fs from 'node:fs/promises';
import path from 'node:path';
import {PART_LIBRARY} from '../../src/part-library.js';
import {fixture} from '../docs-audit/runtime.mjs';
import {applyDeviceExample} from '../../src/device-assistance.js';
import {resetMainCode} from '../../src/code-reset.js';
const results=[];
for(const {type}of PART_LIBRARY){
 try{
  const {project,target}=fixture(type),initial=applyDeviceExample(project,target).project;
  const normal=applyDeviceExample(resetMainCode(initial),target).project;
  const labelled=structuredClone(initial);for(const pin of Object.values(labelled.mcu.pins))if(pin.label)pin.label='Custom_'+pin.label;
  const reapplied=applyDeviceExample(resetMainCode(labelled),target).project;
  const same=(a,b)=>JSON.stringify(a.components)===JSON.stringify(b.components)&&JSON.stringify(a.wires)===JSON.stringify(b.wires);
  results.push({type,normalPreserved:same(initial,normal),customLabelsPreservedCircuit:same(labelled,reapplied),addedParts:reapplied.components.length-labelled.components.length,addedWires:reapplied.wires.length-labelled.wires.length});
 }catch(error){results.push({type,error:error.message});}
}
const report={checked:results.length,normalFailures:results.filter(r=>!r.normalPreserved),customLabelFailures:results.filter(r=>!r.customLabelsPreservedCircuit),results};
const output=path.resolve(process.env.AUDIT_OUT||'work/test-results/project-audit-0238/docs-reapply.json');await fs.mkdir(path.dirname(output),{recursive:true});
await fs.writeFile(output,JSON.stringify(report,null,2));
console.log(JSON.stringify({checked:report.checked,normalFailures:report.normalFailures,customLabelFailures:report.customLabelFailures}));
if(process.env.AUDIT_ASSERT&&(report.normalFailures.length||report.customLabelFailures.length))process.exitCode=1;
