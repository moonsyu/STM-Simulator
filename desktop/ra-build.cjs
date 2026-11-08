// The ARM build of a Renesas RA project (FPB-RA6E1): the FSP project files the app generates from the project's MCU
// settings (src/ra-generator.js, what RASC / e² studio writes), the user's src/hal_entry.c and other sources, and the
// FSP sources the project uses (BSP, CMSIS device startup/system, r_ioport, r_icu, …) from the FSP tool folder.
const fs=require('node:fs/promises'),path=require('node:path');

// FSP drivers by the header the generated or user code includes.
const MODULES=['r_ioport','r_icu','r_sci_uart','r_gpt','r_agt','r_adc','r_iic_master'];
const exists=p=>fs.access(p).then(()=>true,()=>false);

/** Writes the generated FSP files into `directory` and returns the compile units, include flags and linker flags. */
async function prepareRa({project,tools,directory,userFiles}){
 const fsp=tools.fsp;
 if(!fsp||!await exists(path.join(fsp,'ra/fsp/src/bsp/mcu/ra6e1/bsp_feature.h')))throw new Error('개발 도구 설정에서 Renesas FSP 폴더를 선택하거나 필요한 도구 설치로 받으세요.');
 const {generateRaFiles}=await import('../src/ra-generator.js');
 const {raFamily}=await import('../src/ra-config.js');
 const fam=raFamily(project.mcu.family),generated=generateRaFiles(project.mcu,{board:{fspBoard:true}});
 for(const [name,text]of Object.entries(generated)){const p=path.join(directory,name);await fs.mkdir(path.dirname(p),{recursive:true});await fs.writeFile(p,text);}
 const bsp=path.join(fsp,'ra/fsp/src/bsp'),mcuDir=path.join(bsp,'mcu',fam.group.toLowerCase()),board=path.join(fsp,'ra/board/ra6e1_fpb');
 const cmsisCore=path.join(fsp,'Drivers/CMSIS/Include');
 const includes=[directory,path.join(directory,'src'),path.join(fsp,'ra/fsp/inc'),path.join(fsp,'ra/fsp/inc/api'),path.join(fsp,'ra/fsp/inc/instances'),path.join(bsp,'mcu/all'),mcuDir,path.join(bsp,'cmsis/Device/RENESAS/Include'),cmsisCore,path.join(directory,'ra_cfg/fsp_cfg'),path.join(directory,'ra_cfg/fsp_cfg/bsp'),path.join(directory,'ra_gen'),board];
 // Every module the generated hal_data.h or a user source includes is compiled (an unused one costs nothing after
 // --gc-sections, a missing one is a link error the user cannot fix).
 const text=[generated['ra_gen/hal_data.h'],generated['ra_gen/common_data.h'],...userFiles.map(f=>f.text||'')].join('\n');
 const used=MODULES.filter(m=>m==='r_ioport'||new RegExp(`#\\s*include\\s*["<]${m}\\.h[">]`).test(text));
 const fspSources=[];
 for(const dir of [path.join(bsp,'mcu/all'),board])for(const f of (await fs.readdir(dir)).sort())if(f.endsWith('.c'))fspSources.push(path.join(dir,f));
 fspSources.push(path.join(bsp,'cmsis/Device/RENESAS/Source/startup.c'),path.join(bsp,'cmsis/Device/RENESAS/Source/system.c'),path.join(mcuDir,'bsp_linker.c'));
 for(const m of used)for(const f of (await fs.readdir(path.join(fsp,'ra/fsp/src',m))).sort())if(f.endsWith('.c'))fspSources.push(path.join(fsp,'ra/fsp/src',m,f));
 const genSources=['common_data.c','hal_data.c','main.c','pin_data.c','vector_data.c'].map(f=>path.join(directory,'ra_gen',f));
 const script=path.join(directory,'script');
 return {
  cpu:fam.cpu,
  includes:includes.map(i=>'-I'+i),
  // FSP and the generated files are not the user's code: their warnings would only fill the 빌드 panel.
  sdkSources:[...fspSources,...genSources],
  linkFlags:['-T'+path.join(script,'fsp.ld'),'-L'+script,'-nostartfiles','--specs=nano.specs','--specs=nosys.specs','-u','_printf_float'],
  generated:Object.keys(generated)
 };
}
module.exports={prepareRa,RA_MODULES:MODULES};
