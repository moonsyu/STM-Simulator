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
 const selected=process.env.DOCS_ARM_TYPES?.split(',');
 if(selected?.includes('uart')){const {halExample}=await import('../src/hal-examples.js');for(const kind of ['uart','uart_external'])await verify(halExample(kind),kind+' standalone main.c');}
 for(const part of PART_LIBRARY.filter(p=>p.type!=='board'&&(!selected||selected.includes(p.type)))){const p=blankProject();p.components=[{id:'selected',name:part.name,type:part.type,x:800,y:350,rotation:0,span:70,...PART_DEFS[part.type]?.defaults,...(part.type==='resistor'?{value:10000}:{}),...(part.type==='led'?{color:'red'}:{})}];
  const target={type:'part',id:'selected'};await verify(applyDeviceExample(p,target).project,part.type+' HAL');
  for(const card of baremetalCards(deviceDocs(part.type).sample.mcu,part.type))await verify(applyDeviceExample(p,target,{mode:'baremetal',api:card.id}).project,part.type+' '+card.id);
 }
 if(selected){let multi=blankProject();multi.components=['a','b'].map(id=>({id,type:'uart',name:id,x:800,y:300,rotation:0,baud:9600}));for(const id of ['a','b'])multi=applyDeviceExample(multi,{type:'part',id}).project;await verify(multi,'two UART instances');}
 await fs.writeFile(path.join(out,selected?'device-docs-arm-followup.json':'device-docs-arm.json'),JSON.stringify({passed:true,hardwareRun:false,compiler:tools.armGcc,results},null,2));console.log('All '+results.length+' device HAL/register examples linked with real STM32F446 HAL/CMSIS.');
})().catch(e=>{console.error(e.message);process.exitCode=1;});
