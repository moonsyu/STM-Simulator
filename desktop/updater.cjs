const {EventEmitter}=require('node:events');
const https=require('node:https');
const fs=require('node:fs/promises');
const {createReadStream,createWriteStream}=require('node:fs');
const {createHash,randomUUID}=require('node:crypto');
const {Transform}=require('node:stream');
const {pipeline}=require('node:stream/promises');
const {spawn}=require('node:child_process');
const path=require('node:path');

const REPOSITORY='moonsyu/STM-Simulator';
const RELEASES=`https://github.com/${REPOSITORY}/releases`;
const LATEST=`https://api.github.com/repos/${REPOSITORY}/releases/latest`;
const LIMIT=400*1024*1024;
const VERSION=/^(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})$/;
function compareVersions(a,b){
  if(!VERSION.test(a)||!VERSION.test(b))throw new Error('정식 버전 번호가 올바르지 않습니다.');
  const left=a.split('.').map(Number),right=b.split('.').map(Number);
  for(let i=0;i<3;i++)if(left[i]!==right[i])return Math.sign(left[i]-right[i]);
  return 0;
}
function allowedUrl(value){
  const url=new URL(value);
  if(url.protocol!=='https:'||url.username||url.password||url.port)throw new Error('허용하지 않는 업데이트 주소입니다.');
  const allowed=url.hostname==='api.github.com'&&url.pathname===`/repos/${REPOSITORY}/releases/latest`
    ||url.hostname==='github.com'&&url.pathname.startsWith(`/${REPOSITORY}/releases/download/`)
    ||['release-assets.githubusercontent.com','objects.githubusercontent.com'].includes(url.hostname);
  if(!allowed)throw new Error('공식 GitHub 배포 주소만 사용할 수 있습니다.');
  return url;
}
async function response(url,signal,redirects=0){
  allowedUrl(url);
  if(redirects>5)throw new Error('업데이트 다운로드의 리디렉션이 너무 많습니다.');
  const result=await new Promise((resolve,reject)=>{
    const request=https.get(url,{signal,headers:{'User-Agent':'STM-Simulator-Updater','Accept':'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'}},resolve);
    request.setTimeout(30000,()=>request.destroy(new Error('업데이트 서버 응답 시간이 초과되었습니다.')));
    request.on('error',reject);
  });
  if([301,302,303,307,308].includes(result.statusCode)){
    result.resume();return response(new URL(result.headers.location,url).href,signal,redirects+1);
  }
  if(result.statusCode!==200){result.resume();throw new Error(result.statusCode===403||result.statusCode===429?'GitHub 요청 한도에 도달했습니다. 잠시 후 다시 확인하세요.':`업데이트 서버에 연결하지 못했습니다 (HTTP ${result.statusCode}).`);}
  return result;
}
async function readJson(url,{signal}={}){
  const stream=await response(url,signal),chunks=[];let size=0;
  for await(const chunk of stream){size+=chunk.length;if(size>2*1024*1024){stream.destroy();throw new Error('업데이트 정보가 너무 큽니다.');}chunks.push(chunk);}
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
function releaseInfo(release,current){
  if(release.draft||release.prerelease)throw new Error('정식 릴리스만 업데이트할 수 있습니다.');
  const version=String(release.tag_name||'').replace(/^v/,'');
  if(compareVersions(version,current)<=0)return null;
  const filename=`STM-Simulator-${version}-win-x64.exe`;
  const find=name=>{
    const rows=(release.assets||[]).filter(asset=>asset.name===name&&asset.state==='uploaded');
    if(rows.length!==1)throw new Error('릴리스 파일 게시가 완료되지 않았습니다. 잠시 후 다시 확인하세요.');
    const asset=rows[0],expected=`https://github.com/${REPOSITORY}/releases/download/${release.tag_name}/${name}`;
    if(asset.browser_download_url!==expected)throw new Error('릴리스 파일 주소가 올바르지 않습니다.');
    return asset;
  };
  const exe=find(filename),manifest=find('update-manifest.json');
  if(!Number.isSafeInteger(exe.size)||exe.size<2||exe.size>LIMIT)throw new Error('실행 파일 크기가 올바르지 않습니다.');
  return {version,filename,bytes:exe.size,url:exe.browser_download_url,manifestUrl:manifest.browser_download_url};
}
function validateManifest(manifest,info){
  if(manifest.schemaVersion!==1||manifest.version!==info.version||manifest.filename!==info.filename||manifest.bytes!==info.bytes||!/^[a-f0-9]{64}$/i.test(manifest.sha256))throw new Error('업데이트 검증 정보가 릴리스와 일치하지 않습니다.');
  return {...info,sha256:manifest.sha256.toLowerCase()};
}
async function verifyFile(filename,info){
  const stat=await fs.lstat(filename);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.size!==info.bytes)throw new Error('업데이트 파일 크기가 일치하지 않습니다.');
  const hash=createHash('sha256');let header=Buffer.alloc(0);
  for await(const chunk of createReadStream(filename)){if(header.length<2)header=Buffer.concat([header,chunk]).subarray(0,2);hash.update(chunk);}
  if(header.toString()!=='MZ'||hash.digest('hex')!==info.sha256)throw new Error('업데이트 파일 검증에 실패했습니다. 다시 다운로드해 주세요.');
}
async function downloadFile(info,filename,{signal,onProgress=()=>{}}={}){
  const stream=await response(info.url,signal);let bytes=0,last=0;
  const counter=new Transform({transform(chunk,_encoding,done){bytes+=chunk.length;if(bytes>info.bytes)return done(new Error('다운로드 파일이 예상 크기를 초과했습니다.'));const now=Date.now();if(now-last>200){onProgress(bytes);last=now;}done(null,chunk);}});
  await pipeline(stream,counter,createWriteStream(filename,{flags:'wx'}),{signal});
  await verifyFile(filename,info);onProgress(bytes);
}
async function launchHelper({directory,source,target,info,pid=process.pid}){
  const jobDirectory=await fs.mkdtemp(path.join(directory,'apply-'));
  const config=path.join(jobDirectory,'job.json'),script=path.join(jobDirectory,'apply.ps1');
  await fs.copyFile(path.join(__dirname,'apply-update.ps1'),script);
  const ready=path.join(jobDirectory,'ready'),cancel=path.join(jobDirectory,'cancel'),result=path.join(directory,'last-result.json');
  await fs.rm(result,{force:true});
  await fs.writeFile(config,JSON.stringify({source,target,sha256:info.sha256,bytes:info.bytes,pid,token:randomUUID(),result,ready,cancel}));
  const powershell=path.join(process.env.SystemRoot||'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe');
  const command=`& '${script.replaceAll("'","''")}' -ConfigPath '${config.replaceAll("'","''")}'`;
  const launch=Buffer.from(JSON.stringify({powershell,command:Buffer.from(command,'utf16le').toString('base64'),log:path.join(directory,'helper.log'),error:path.join(directory,'helper-error.log')})).toString('base64');
  // Start-Process gives the helper its own hidden console. Node detached PowerShell
  // exits without running in disconnected Windows sessions; an attached child dies with the app.
  const bootstrap=`$ErrorActionPreference='Stop'; $updateLaunch=ConvertFrom-Json ([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${launch}'))); Start-Process -FilePath $updateLaunch.powershell -ArgumentList @('-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-EncodedCommand',$updateLaunch.command) -WindowStyle Hidden -RedirectStandardOutput $updateLaunch.log -RedirectStandardError $updateLaunch.error`;
  const child=spawn(powershell,['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(bootstrap,'utf16le').toString('base64')],{stdio:'ignore',windowsHide:true});
  await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject);});
  // Keep the app open unless the helper has validated/staged the replacement.
  for(let i=0;i<150;i++){
    try{await fs.access(ready);child.unref();return;}catch{}
    try{const failure=JSON.parse((await fs.readFile(result,'utf8')).replace(/^\uFEFF/,''));if(!failure.ok)throw new Error('교체 도우미가 파일을 준비하지 못했습니다: '+failure.message);}catch(error){if(error.code!=='ENOENT'&&!(error instanceof SyntaxError))throw error;}
    if(child.exitCode!==null&&child.exitCode!==0)throw new Error(`업데이트 도우미를 실행하지 못했습니다 (${child.exitCode}). updates/helper-error.log를 확인하세요.`);
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  await fs.writeFile(cancel,'cancel').catch(()=>{});throw new Error('업데이트 도우미 준비 시간이 초과되었습니다. 앱은 종료하지 않았습니다.');
}
class PortableUpdater extends EventEmitter{
  constructor({version,directory,target,enabled=false,read=readJson,download=downloadFile,apply=launchHelper}){
    super();this.version=version;this.directory=directory;this.target=target;this.enabled=enabled;this.read=read;this.transfer=download;this.apply=apply;this.automatic=true;this.info=null;this.pending=null;this.timer=null;this.controller=null;this.closed=false;
    this.state={phase:enabled?'idle':'unsupported',currentVersion:version,automatic:true,message:enabled?'새 버전을 자동으로 확인합니다.':'자동 업데이트는 Windows 포터블 배포 EXE에서 사용할 수 있습니다.'};
  }
  snapshot(){return {...this.state,automatic:this.automatic};}
  set(phase,extra={}){this.state={...this.state,phase,...extra};this.emit('state',this.snapshot());return this.snapshot();}
  async init(){
    await fs.mkdir(this.directory,{recursive:true});
    try{const saved=JSON.parse(await fs.readFile(path.join(this.directory,'settings.json'),'utf8'));this.automatic=saved.automatic!==false;}catch{}
    try{const result=JSON.parse((await fs.readFile(path.join(this.directory,'last-result.json'),'utf8')).replace(/^\uFEFF/,''));if(result.ok===false)this.set('error',{message:'이전 업데이트를 적용하지 못했습니다. 파일 권한과 EXE 폴더의 백업 파일을 확인하세요.'});await fs.unlink(path.join(this.directory,'last-result.json'));}catch{}
    this.schedule(8000);return this.snapshot();
  }
  schedule(delay=6*60*60*1000){clearTimeout(this.timer);if(this.closed||!this.enabled||!this.automatic)return;this.timer=setTimeout(()=>{void this.check(true).finally(()=>this.schedule());},delay);this.timer.unref?.();}
  async configure(automatic){
    if(typeof automatic!=='boolean')throw new Error('업데이트 설정이 올바르지 않습니다.');
    await fs.writeFile(path.join(this.directory,'settings.json'),JSON.stringify({automatic}));this.automatic=automatic;this.schedule(1000);this.emit('state',this.snapshot());return this.snapshot();
  }
  check(auto=false){
    if(!this.enabled||this.closed)return Promise.resolve(this.snapshot());
    if(this.pending)return this.pending;
    if(this.state.phase==='ready'||this.state.phase==='installing')return Promise.resolve(this.snapshot());
    this.pending=this.doCheck(auto).finally(()=>{this.pending=null;});return this.pending;
  }
  async doCheck(auto){
    this.controller=new AbortController();const signal=this.controller.signal;
    try{
      this.set('checking',{message:'GitHub에서 새 버전을 확인하고 있습니다.',progress:0});
      const info=releaseInfo(await this.read(LATEST,{signal}),this.version);
      if(!info){this.info=null;return this.set('current',{message:'최신 버전을 사용하고 있습니다.',latestVersion:null});}
      this.info=validateManifest(await this.read(info.manifestUrl,{signal}),info);
      this.set('available',{latestVersion:info.version,message:`새 버전 ${info.version}을 사용할 수 있습니다.`});
      if(auto&&this.automatic)return await this.doDownload(signal);
      return this.snapshot();
    }catch(error){if(this.closed)return this.snapshot();return this.set('error',{message:error.message});}
  }
  download(){
    if(this.pending)return this.pending;
    if(!this.info||this.closed||!this.enabled||this.state.phase==='ready'||this.state.phase==='installing')return Promise.resolve(this.snapshot());
    this.controller=new AbortController();this.pending=this.doDownload(this.controller.signal).catch(error=>this.closed?this.snapshot():this.set('error',{message:error.message})).finally(()=>{this.pending=null;});return this.pending;
  }
  async doDownload(signal){
    const info=this.info,destination=path.join(this.directory,'pending.exe'),partial=path.join(this.directory,`download-${randomUUID()}.part`);
    this.set('downloading',{progress:0,message:`버전 ${info.version}을 다운로드하고 있습니다.`});
    try{
      try{await verifyFile(destination,info);return this.set('ready',{progress:100,message:`버전 ${info.version} 준비 완료. 재시작하면 적용됩니다.`});}catch{}
      await this.transfer(info,partial,{signal,onProgress:bytes=>this.set('downloading',{progress:Math.min(100,Math.floor(bytes/info.bytes*100))})});
      await verifyFile(partial,info);
      await fs.rm(destination,{force:true});await fs.rename(partial,destination);
      return this.set('ready',{progress:100,message:`버전 ${info.version} 준비 완료. 재시작하면 적용됩니다.`});
    }finally{await fs.rm(partial,{force:true}).catch(()=>{});}
  }
  async install(){
    if(this.closed||!this.enabled||this.pending||this.state.phase!=='ready'||!this.info)throw new Error('먼저 업데이트 다운로드를 완료하세요.');
    this.set('installing',{message:'작업을 저장했습니다. 업데이트를 적용합니다.'});
    try{
      const source=path.join(this.directory,'pending.exe');await verifyFile(source,this.info);
      if(!path.isAbsolute(this.target)||path.extname(this.target).toLowerCase()!=='.exe')throw new Error('포터블 EXE 경로를 확인하지 못했습니다.');
      const stat=await fs.lstat(this.target);if(!stat.isFile()||stat.isSymbolicLink())throw new Error('포터블 EXE가 실제 파일이 아닙니다.');
      const probe=path.join(path.dirname(this.target),`.stm-update-${randomUUID()}.tmp`);
      await fs.writeFile(probe,'',{flag:'wx'});await fs.unlink(probe);
      await this.apply({directory:this.directory,source,target:this.target,info:this.info});return true;
    }catch(error){this.set('ready',{message:`적용하지 못했습니다: ${error.message} EXE 폴더의 쓰기 권한을 확인하세요.`});throw error;}
  }
  close(){this.closed=true;clearTimeout(this.timer);this.controller?.abort();}
}
module.exports={PortableUpdater,compareVersions,allowedUrl,releaseInfo,validateManifest,verifyFile,downloadFile,readJson,launchHelper,RELEASES};
