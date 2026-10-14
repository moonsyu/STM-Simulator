// Exercise the actual Windows helper with locked EXEs and invalid replacements.
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {spawn,spawnSync}=require('node:child_process'),{createHash}=require('node:crypto');
const {launchHelper}=require('../desktop/updater.cjs');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
(async()=>{
 if(process.platform!=='win32')throw new Error('This check requires Windows.');
 const root=path.resolve(__dirname,'..'),out=path.join(root,'work','test-results');await fs.mkdir(out,{recursive:true});
 const temp=await fs.mkdtemp(path.join(out,"update helper 한글 '$ test-"));
 const template=path.join(temp,'fixture.exe'),childProcesses=[];
 try{
  const source='using System; using System.IO; using System.Reflection; using System.Threading; class Program { static void Main(string[] args) { if(args.Length>0) { Thread.Sleep(1600); return; } File.WriteAllText(Assembly.GetExecutingAssembly().Location+".started", "updated"); } }';
  const script='$ErrorActionPreference="Stop"; $updateFixture=ConvertFrom-Json ([Console]::In.ReadToEnd()); Add-Type -TypeDefinition $updateFixture.source -OutputAssembly $updateFixture.output -OutputType ConsoleApplication';
  const compile=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{input:JSON.stringify({source,output:template}).replace(/[^\x00-\x7f]/g,c=>'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0')),encoding:'utf8',windowsHide:true});
  assert.equal(compile.status,0,compile.stderr);
  const valid=await fs.readFile(template);
  const checks=[];
  for(const failure of [false,true]){
   const directory=path.join(temp,failure?'failure':'success');await fs.mkdir(directory);
   const target=path.join(directory,'STM 한글 custom.exe'),source=path.join(directory,'pending.exe');
   await fs.copyFile(template,target);const bytes=failure?Buffer.from('MZ invalid executable'):valid;await fs.writeFile(source,bytes);
   const old=spawn(target,['--hold'],{stdio:'ignore',windowsHide:true});childProcesses.push(old);await new Promise((resolve,reject)=>{old.once('spawn',resolve);old.once('error',reject);});
   try{await launchHelper({directory,source,target,pid:old.pid,info:{sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length}});}
   catch(error){console.error(await fs.readFile(path.join(directory,'helper.log'),'utf8').catch(()=>''));console.error(await fs.readdir(directory));console.error(await fs.readFile(path.join(directory,'last-result.json'),'utf8').catch(()=>''));throw error;}
   let result;const deadline=Date.now()+25000;
   while(Date.now()<deadline){try{result=JSON.parse((await fs.readFile(path.join(directory,'last-result.json'),'utf8')).replace(/^\uFEFF/,''));break;}catch{}await wait(150);}
   assert.ok(result,'Helper did not produce a result');assert.equal(result.ok,!failure,JSON.stringify(result));
   if(failure)assert.deepEqual(await fs.readFile(target),valid,'Failed startup must restore the original EXE');
   else {for(let i=0;i<60;i++){try{await fs.access(target+'.started');break;}catch{}await wait(100);}assert.equal(await fs.readFile(target+'.started','utf8'),'updated');}
   checks.push(failure?'Invalid executable restores old EXE':'Wait for locked EXE, atomically replace, relaunch');
  }
  const directory=path.join(temp,'parent-exit');await fs.mkdir(directory);
  const target=path.join(directory,'STM after parent.exe'),incoming=path.join(directory,'pending.exe');await fs.copyFile(template,target);await fs.copyFile(template,incoming);
  const runner=path.join(temp,'runner.cjs');
  // The actual updater parent exits, so the helper must survive with its own handles.
  await fs.writeFile(runner,`const {launchHelper}=require(${JSON.stringify(path.join(root,'desktop/updater.cjs'))});const job=JSON.parse(process.argv[2]);launchHelper(job).then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1);});`);
  const parent=spawn(process.execPath,[runner,JSON.stringify({directory,source:incoming,target,info:{sha256:createHash('sha256').update(valid).digest('hex'),bytes:valid.length}})],{stdio:['ignore','pipe','pipe'],windowsHide:true});childProcesses.push(parent);let parentLog='';parent.stderr.on('data',chunk=>parentLog+=chunk);assert.equal(await new Promise(resolve=>parent.on('exit',resolve)),0,parentLog);
  for(let i=0;i<150;i++){try{await fs.access(target+'.started');break;}catch{}await wait(100);}
  try{assert.equal(await fs.readFile(target+'.started','utf8'),'updated');}catch(error){console.error('Parent exit helper log:',await fs.readFile(path.join(directory,'helper.log'),'utf8').catch(()=>''));console.error('Parent exit result:',await fs.readFile(path.join(directory,'last-result.json'),'utf8').catch(()=>''));console.error(await fs.readdir(directory));throw error;}checks.push('Updater survives its parent process exit and launches replacement');
  await fs.writeFile(path.join(out,'update-apply-check.json'),JSON.stringify({passed:true,checks:[...checks,'Paths with Korean, spaces, apostrophe and dollar sign']},null,2));
  console.log('Windows update helper passed: locked EXE replacement, relaunch, rollback and special-character paths.');
 }finally{
  for(const child of childProcesses)if(child.exitCode===null)child.kill();
  await wait(500);
  if(path.dirname(temp)!==out||!path.basename(temp).startsWith('update helper '))throw new Error('Invalid test cleanup path');
  await fs.rm(temp,{recursive:true,force:true});
 }
})().catch(error=>{console.error(error);process.exitCode=1;});
