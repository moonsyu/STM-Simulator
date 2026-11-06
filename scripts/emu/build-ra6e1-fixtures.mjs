// Builds the FPB-RA6E1 firmware emulator fixtures: the FSP examples (src/ra-examples.js) compiled with the app's own
// ARM GCC pipeline (desktop/native-build.cjs → desktop/ra-build.cjs: generated ra_gen/ra_cfg + Renesas FSP).
//
//   node scripts/emu/build-ra6e1-fixtures.mjs [exampleId ...]
//
// Tools are auto-detected like the app does (STM-Simulator-Tools); ARM_GCC and FSP_ROOT override them.
// Output: tests/fixtures/firmware-ra6e1/<id>.elf and <id>.json (project).
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const require=createRequire(import.meta.url);
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const {prepareBuild,build,detectTools}=require(path.join(root,'desktop/native-build.cjs'));
const {projectForBoard,validateProject}=await import('../../src/project.js');
const {RA_EXAMPLES}=await import('../../src/ra-examples.js');
const out=path.join(root,'tests/fixtures/firmware-ra6e1');
const tools=await detectTools({armGcc:process.env.ARM_GCC||''});
if(!tools.armGcc||!tools.fsp)throw new Error('ARM GCC and Renesas FSP are required (ARM_GCC / FSP_ROOT).');
await fs.mkdir(out,{recursive:true});
const ids=process.argv.slice(2),work=await fs.mkdtemp(path.join(os.tmpdir(),'ra6e1-fixtures-'));
try{
 for(const ex of RA_EXAMPLES.filter(e=>!ids.length||ids.includes(e.id))){
  const project=validateProject({...projectForBoard('fpb-ra6e1'),name:ex.id,mcu:ex.mcu(),code:ex.code,...(ex.circuit?.()||{})});
  const plan=await prepareBuild({project,tools,root:work,target:'arm',configuration:'Debug'});
  const result=await build(plan);
  await fs.copyFile(result.elf,path.join(out,ex.id+'.elf'));
  await fs.writeFile(path.join(out,ex.id+'.json'),JSON.stringify(project,null,1)+'\n');
  console.log(ex.id,result.artifacts.find(a=>a.name==='firmware.elf').bytes,'B');
 }
}finally{await fs.rm(work,{recursive:true,force:true});}
