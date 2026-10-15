const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),{execFileSync}=require('node:child_process');
const {prepareBuild}=require('../desktop/native-build.cjs'),{toolSettings}=require('./native-ide-check.cjs');
(async()=>{
 const {PART_LIBRARY}=await import('../src/part-library.js'),{PART_DEFS}=await import('../src/components.js'),{blankProject}=await import('../src/project.js'),{applyDeviceExample}=await import('../src/device-assistance.js'),{deviceDocs}=await import('../src/device-docs-data.js'),{baremetalCards}=await import('../src/device-baremetal.js');
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'stm-docs-arm-')),tools=await toolSettings(),cache=new Map(),results=[],out=path.resolve(__dirname,'../work/test-results');await fs.mkdir(out,{recursive:true});
 function command(exe,args,cwd){try{return execFileSync(exe,args,{cwd,encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe']});}catch(e){throw new Error((e.stderr||e.stdout||e.message).toString());}}
 async function verify(project,label){const plan=await prepareBuild({project,tools,root,target:'arm'}),objects=[];
  for(const unit of plan.units){const obj=unit.arguments.at(-1),external=!unit.file.startsWith(plan.directory+path.sep);if(external&&cache.has(unit.file)){objects.push(cache.get(unit.file));continue;}command(unit.arguments[0],unit.arguments.slice(1),plan.directory);objects.push(obj);if(external)cache.set(unit.file,obj);}
  command(plan.gcc,[...plan.flags,...objects,...plan.linkFlags,'-Wl,--gc-sections','-Wl,-Map='+path.join(plan.directory,'firmware.map'),'-lm','-o',plan.elf],plan.directory);results.push({label,elf:plan.elf,bytes:(await fs.stat(plan.elf)).size});console.log(label+' compiled and linked');
 }
 const {DEVICE_CATALOG}=await import('../src/device-catalog-data.js'),{catalogType}=await import('../src/catalog-defs.js'),{halExample}=await import('../src/hal-examples.js');
 const errors=[];
 for(const v of DEVICE_CATALOG.filter(v=>!process.env.CATALOG_ARM_IDS||process.env.CATALOG_ARM_IDS.split(',').includes(v.id))){try{const type=catalogType(v.id);await verify(halExample(type),v.id);const p=blankProject();if(!['board','breadboard'].includes(v.family))p.components=[{id:'selected',name:v.name,type,x:800,y:350,rotation:0,span:70,...PART_DEFS[type].defaults}];await verify(applyDeviceExample(p,p.components.length?{type:'part',id:'selected'}:{type:'surface',id:v.family}).project,v.id+' main.c');}catch(error){errors.push({id:v.id,error:error.message});console.log('FAIL '+v.id+' '+error.message.slice(0,1200));}}
 await fs.writeFile(path.join(out,'catalog-arm.json'),JSON.stringify({passed:errors.length===0,errors,hardwareRun:false,compiler:tools.armGcc,results},null,2));if(errors.length)process.exitCode=1;console.log('Compiled '+results.length+' device HAL/register examples linked with real STM32F446 HAL/CMSIS.');
})().catch(e=>{console.error(e.message);process.exitCode=1;});
