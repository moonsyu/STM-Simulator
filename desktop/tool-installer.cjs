// In-app installer for the tools a real-board build needs (개발 도구 → 필요한 도구 설치).
// It mirrors scripts/setup-native-tools.ps1 without Git: release zips are checked against pinned SHA-256 values,
// and the STM32CubeF4 subset comes from GitHub source archives at fixed commits, every kept file verified against
// desktop/tool-manifest.json. Everything lands in %LOCALAPPDATA%/STM-Simulator-Tools, which detectTools reads.
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {createHash}=require('node:crypto');
const {execFile}=require('node:child_process');
const MANIFEST=require('./tool-manifest.json');

const RELEASES=[
  {id:'gcc',keys:['armGcc','armGdb'],label:'ARM GCC 15.2.1 · GDB 포함 (xPack)',bytes:335571206,
   url:'https://github.com/xpack-dev-tools/arm-none-eabi-gcc-xpack/releases/download/v15.2.1-1.1/xpack-arm-none-eabi-gcc-15.2.1-1.1-win32-x64.zip',
   sha256:'bae6a3d1667697ce750c3b13d6d26d80973ecedc2cc87bf04869e83447fd93ea',check:'xpack-arm-none-eabi-gcc-15.2.1-1.1/bin/arm-none-eabi-gcc.exe'},
  {id:'openocd',keys:['openocd'],label:'OpenOCD 0.12.0 · ST-LINK 연결 (xPack)',bytes:3225998,
   url:'https://github.com/xpack-dev-tools/openocd-xpack/releases/download/v0.12.0-7/xpack-openocd-0.12.0-7-win32-x64.zip',
   sha256:'6bfd3c97135aafef8affc9af1acf34fd0e2b9ca26044506f6abd7f95b7630052',check:'xpack-openocd-0.12.0-7/bin/openocd.exe'},
  {id:'clangd',keys:['clangd'],label:'clangd 23.1.0 · 코드 분석',bytes:29690805,
   url:'https://github.com/clangd/clangd/releases/download/23.1.0/clangd-windows-23.1.0.zip',
   sha256:'23412a240756a162e7b98a282f36aa2a23a88db5ce16a0cbc4fef7253768c810',check:'clangd_23.1.0/bin/clangd.exe'}
];
const CUBE={id:'cube',keys:['cube'],label:'STM32CubeF4 v1.28.3 · HAL·CMSIS 드라이버',bytes:10*1024*1024,check:'STM32CubeF4/Drivers/STM32F4xx_HAL_Driver/Inc/stm32f4xx_hal.h'};
const ITEMS=[RELEASES[0],CUBE,RELEASES[1],RELEASES[2]];

const installRoot=()=>path.join(process.env.LOCALAPPDATA||os.homedir(),'STM-Simulator-Tools');
const exists=p=>fs.access(p).then(()=>true,()=>false);
const sha256=buffer=>createHash('sha256').update(buffer).digest('hex');

/** The tools that `tools` (detectTools output) still lacks, in install order. */
function installPlan(tools){
  return ITEMS.filter(item=>item.keys.some(key=>!tools[key])).map(({id,label,bytes,url})=>({id,label,bytes,source:url?new URL(url).host:'github.com/STMicroelectronics'}));
}

async function download(url,file,{fetchImpl,signal,onBytes}){
  const response=await fetchImpl(url,{signal,redirect:'follow'});
  if(!response.ok||!response.body)throw new Error(`다운로드 실패 (${response.status}): ${url}`);
  const total=Number(response.headers.get('content-length'))||0,hash=createHash('sha256'),handle=await fs.open(file,'w');let received=0;
  try{for await(const chunk of response.body){const bytes=Buffer.from(chunk);hash.update(bytes);await handle.write(bytes);received+=bytes.length;onBytes?.(received,total);}}
  finally{await handle.close();}
  return hash.digest('hex');
}
function extract(zip,into){
  // Windows 10+ ships bsdtar, which reads zip archives; elsewhere fall back to unzip.
  const [cmd,args]=process.platform==='win32'?[path.join(process.env.SystemRoot||'C:/Windows','System32','tar.exe'),['-xf',zip,'-C',into]]:['unzip',['-q','-o',zip,'-d',into]];
  return new Promise((resolve,reject)=>execFile(cmd,args,{windowsHide:true,maxBuffer:16*1024*1024},error=>error?reject(new Error('압축 해제 실패: '+error.message)):resolve()));
}
async function fresh(dir){await fs.rm(dir,{recursive:true,force:true});await fs.mkdir(dir,{recursive:true});return dir;}

async function installRelease(item,root,o){
  const zip=path.join(root,item.id+'.zip.partial'),stage=path.join(root,'.extract-'+item.id);
  try{
    const digest=await download(item.url,zip,{...o,onBytes:(received,total)=>o.onProgress({id:item.id,phase:'download',received,total:total||item.bytes})});
    if(digest!==item.sha256)throw new Error(`${item.label}: SHA-256 검증 실패 (받은 파일이 고정된 해시와 다릅니다)`);
    o.onProgress({id:item.id,phase:'extract'});await fresh(stage);await extract(zip,stage);
    const top=item.check.split('/')[0];if(!await exists(path.join(stage,item.check)))throw new Error(`${item.label}: 압축 안에 ${item.check}가 없습니다.`);
    await fs.rm(path.join(root,top),{recursive:true,force:true});await fs.rename(path.join(stage,top),path.join(root,top));
  }finally{await fs.rm(zip,{force:true});await fs.rm(stage,{recursive:true,force:true});}
}
async function installCube(root,o,manifest=MANIFEST){
  const stage=await fresh(path.join(root,'STM32CubeF4.partial')),work=path.join(root,'.extract-cube');
  const all=manifest.sources.reduce((n,s)=>n+s.files.length,0);let done=0;
  const keep=async(source,file,bytes)=>{
    if(sha256(bytes)!==file.sha256)throw new Error(`STM32CubeF4: ${file.path} 검증 실패 (${source.repo}@${source.commit.slice(0,7)})`);
    const target=path.join(stage,source.into,file.path);await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,bytes);
    o.onProgress({id:'cube',phase:'verify',received:++done,total:all});
  };
  try{
    for(const source of manifest.sources){
      if(source.archive){
        const zip=path.join(root,'cube-source.zip.partial');await fresh(work);
        await download(`https://codeload.github.com/${source.repo}/zip/${source.commit}`,zip,{...o,onBytes:received=>o.onProgress({id:'cube',phase:'download',received,total:0})});
        await extract(zip,work);await fs.rm(zip,{force:true});
        const [top]=await fs.readdir(work);
        for(const file of source.files)await keep(source,file,await fs.readFile(path.join(work,top,file.path)).catch(()=>{throw new Error(`STM32CubeF4: 압축 안에 ${file.path}가 없습니다.`);}));
      }else for(const file of source.files){
        const response=await o.fetchImpl(`https://raw.githubusercontent.com/${source.repo}/${source.commit}/${file.path}`,{signal:o.signal});
        if(!response.ok)throw new Error(`다운로드 실패 (${response.status}): ${file.path}`);
        await keep(source,file,Buffer.from(await response.arrayBuffer()));
      }
    }
    await fs.rm(path.join(root,'STM32CubeF4'),{recursive:true,force:true});await fs.rename(stage,path.join(root,'STM32CubeF4'));
  }finally{await fs.rm(stage,{recursive:true,force:true});await fs.rm(work,{recursive:true,force:true});}
}

/** Installs the given plan ids (missing ones only). onProgress({id,phase:'download'|'extract'|'verify'|'done'|'skipped',received,total}). */
async function installTools(ids,{root=installRoot(),fetchImpl=globalThis.fetch,signal,onProgress=()=>{}}={}){
  if(!Array.isArray(ids)||ids.some(id=>!ITEMS.some(item=>item.id===id)))throw new Error('설치할 도구를 확인하세요.');
  if(/[^\x00-\x7f]/.test(root))throw new Error('도구 설치 경로에 한글이 있습니다. 개발 도구 설치 스크립트로 영문 경로에 설치하세요.');
  await fs.mkdir(root,{recursive:true});const o={fetchImpl,signal,onProgress};
  for(const item of ITEMS.filter(item=>ids.includes(item.id))){
    if(await exists(path.join(root,item.check))){onProgress({id:item.id,phase:'skipped'});continue;}
    if(item===CUBE)await installCube(root,o);else await installRelease(item,root,o);
    onProgress({id:item.id,phase:'done'});
  }
  return root;
}
// installRelease/installCube take a package description so tests can use small local packages instead of the network.
module.exports={installPlan,installTools,installRoot,installRelease,installCube,RELEASES,CUBE};
