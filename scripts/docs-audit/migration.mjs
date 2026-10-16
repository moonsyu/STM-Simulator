import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {applyDeviceExample} from '../../src/device-assistance.js';
import {cFunctions} from '../../src/c-source-edit.js';
import {execute} from './runtime.mjs';
import {assess} from './oracles.mjs';
import paths from './paths.cjs';

// The previous audit's generated fixtures are independent test projects.
// Never read or modify a user's live profile here.
const previous=new URL('../../work/test-results/docs-audit/',import.meta.url),rows=[];
for(const type of ['ref_button_2','ref_button_module_3','encoder','ref_encoder_module_5','ref_ds18b20_to92_3','ref_ds18b20_probe_3','ref_sd_storage_board','capacitor','ref_capacitor_ceramic_2','ref_capacitor_electrolytic_2']){
 const text=await fs.readFile(new URL(type+'.stm32lab',previous),'utf8'),before=JSON.parse(text),target={type:'part',id:'selected'};
 try{
  const applied=applyDeviceExample(before,target),execution=execute(applied.project,{end:/ds18b20/.test(type)?5500:3500}),assessment=assess(type,execution);
  const functionsPreserved=JSON.stringify(cFunctions(before.code).map(f=>f.name))===JSON.stringify(cFunctions(applied.project.code).map(f=>f.name));
  const filesPreserved=JSON.stringify(before.firmware.files)===JSON.stringify(applied.project.firmware.files);
  rows.push({type,previousSha256:createHash('sha256').update(text).digest('hex'),passed:assessment.passed&&functionsPreserved&&filesPreserved,functionsPreserved,filesPreserved,assessment,execution});
 }catch(error){rows.push({type,passed:false,error:error.stack});}
}
await fs.mkdir(paths.out,{recursive:true});await fs.writeFile(new URL('migration.json',paths.out),JSON.stringify(rows,null,2));
console.log(JSON.stringify(rows.map(({type,passed,error,assessment})=>({type,passed,error,failures:assessment?.checks.filter(c=>!c.passed)}))));
if(rows.some(r=>!r.passed))process.exitCode=1;
