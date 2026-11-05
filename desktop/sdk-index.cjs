// Index of the STM32Cube SDK sources a project builds with (HAL driver, CMSIS device and core headers): the
// definitions that Ctrl+click / F12 in main.c jumps to, as CubeIDE does into its Drivers folder. Read only.
const fs=require('node:fs/promises');
const path=require('node:path');
const LAYOUT={
  STM32F446RE:{key:'cube',name:'STM32CubeF4',hal:'STM32F4xx_HAL_Driver',device:'STM32F4xx',prefix:'stm32f4xx',chip:'stm32f446xx.h',core:'core_cm4.h',startup:'startup_stm32f446xx.s'},
  STM32F103RB:{key:'cubeF1',name:'STM32CubeF1',hal:'STM32F1xx_HAL_Driver',device:'STM32F1xx',prefix:'stm32f1xx',chip:'stm32f103xb.h',core:'core_cm3.h',startup:'startup_stm32f103xb.s'}
};
const NAME=/^[A-Za-z_]\w{0,127}$/;
async function listFiles(root,l){
  const dir=rel=>fs.readdir(path.join(root,rel)).then(names=>names.map(n=>rel+'/'+n),()=>[]);
  const hal=`Drivers/${l.hal}`,device=`Drivers/CMSIS/Device/ST/${l.device}`;
  const files=[...(await dir(hal+'/Inc')).filter(f=>f.endsWith('.h')),...(await dir(hal+'/Src')).filter(f=>f.endsWith('.c')&&!/_template\.c$/.test(f)),
    `${device}/Include/${l.prefix}.h`,`${device}/Include/${l.chip}`,`${device}/Include/system_${l.prefix}.h`,`${device}/Source/Templates/system_${l.prefix}.c`,`${device}/Source/Templates/gcc/${l.startup}`,
    ...[l.core,'cmsis_gcc.h','cmsis_compiler.h','cmsis_version.h','mpu_armv7.h'].map(f=>'Drivers/CMSIS/Include/'+f)];
  const out=[];for(const f of files)if(await fs.stat(path.join(root,f)).then(s=>s.isFile(),()=>false))out.push(f);return out;
}
class SdkIndex {
  constructor(){this.cache=new Map();}
  layout(family){const l=LAYOUT[family];if(!l)throw new Error('지원하지 않는 MCU입니다.');return l;}
  async build(family,root){
    const key=family+'|'+root;if(this.cache.has(key))return this.cache.get(key);
    const promise=(async()=>{
      const {cSymbols}=await import('../src/c-symbols.js'),files=await listFiles(root,this.layout(family)),symbols=new Map();
      if(!files.length)throw new Error('SDK 폴더에 HAL 드라이버가 없습니다.');
      for(const file of files){if(file.endsWith('.s'))continue;const text=await fs.readFile(path.join(root,file),'utf8');for(const s of cSymbols(text))if(s.kind!=='include'){let list=symbols.get(s.name);if(!list)symbols.set(s.name,list=[]);list.push({file,line:s.line,column:s.column,kind:s.kind,detail:s.detail});}}
      // Names sorted case-insensitively for completion by prefix (binary search), each with its best definition.
      const names=[...symbols.keys()].sort((a,b)=>a.toLowerCase()<b.toLowerCase()?-1:a.toLowerCase()>b.toLowerCase()?1:a<b?-1:1);
      return {files:new Set(files),symbols,names,lower:names.map(n=>n.toLowerCase())};
    })();
    this.cache.set(key,promise);promise.catch(()=>this.cache.delete(key));return promise;
  }
  root(family,tools){const l=this.layout(family),root=tools[l.key];if(!root)throw new Error(`${l.name} SDK가 없어 HAL 원본을 열 수 없습니다. 실행 및 디버그 → 개발 도구 → 필요한 도구 설치에서 받을 수 있습니다.`);return root;}
  async definition(family,tools,name){
    if(typeof name!=='string'||!NAME.test(name))return [];const {pickDefinitions}=await import('../src/c-symbols.js'),index=await this.build(family,this.root(family,tools));
    return pickDefinitions(index.symbols.get(name)).slice(0,20);
  }
  // Completion (CubeIDE content assist): SDK names starting with the typed prefix, case-insensitive, functions and
  // macros first; each with its kind and declaration text.
  async names(family,tools,prefix,limit=150){
    if(typeof prefix!=='string'||!/^[A-Za-z_]\w{1,63}$/.test(prefix))return [];
    const {pickDefinitions}=await import('../src/c-symbols.js'),index=await this.build(family,this.root(family,tools)),p=prefix.toLowerCase(),out=[];
    let lo=0,hi=index.lower.length;while(lo<hi){const mid=(lo+hi)>>1;if(index.lower[mid]<p)lo=mid+1;else hi=mid;}
    for(let i=lo;i<index.lower.length&&index.lower[i].startsWith(p)&&out.length<limit*4;i++){const name=index.names[i],d=pickDefinitions(index.symbols.get(name))[0];if(d)out.push({name,kind:d.kind,detail:d.detail});}
    const rank={function:0,declaration:0,macro:1,enum:2,typedef:3,variable:4};
    return out.sort((a,b)=>(rank[a.kind]??5)-(rank[b.kind]??5)||(a.name.startsWith(prefix)?0:1)-(b.name.startsWith(prefix)?0:1)||a.name.localeCompare(b.name)).slice(0,limit);
  }
  async file(family,tools,file){
    const root=this.root(family,tools),index=await this.build(family,root);
    if(typeof file!=='string'||!index.files.has(file))throw new Error('SDK 색인에 없는 파일입니다.');
    return {file,sdk:this.layout(family).name,text:await fs.readFile(path.join(root,file),'utf8')};
  }
  // A path clangd reports inside the SDK (…/Drivers/…) as an indexed file name, or null.
  async relative(family,tools,absolute){
    const root=this.root(family,tools),rel=path.relative(root,absolute).replaceAll('\\','/');if(rel.startsWith('..')||path.isAbsolute(rel))return null;
    return (await this.build(family,root)).files.has(rel)?rel:null;
  }
}
module.exports={SdkIndex,SDK_LAYOUT:LAYOUT};
