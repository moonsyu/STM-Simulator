const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {spawnSync}=require('node:child_process'),{createHash}=require('node:crypto'),{_electron}=require('playwright');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
(async()=>{
 const root=path.resolve(__dirname,'..'),out=path.join(root,'work/test-results');await fs.mkdir(out,{recursive:true});
 const temp=await fs.mkdtemp(path.join(out,"update GUI helper long path 한글 '$ regression-")),directory=path.join(temp,'updates'),source=path.join(temp,'new.exe'),target=path.join(temp,'old.exe');await fs.mkdir(directory);await fs.writeFile(target,'MZ original');
 const code='using System.IO; using System.Reflection; class Program { static void Main() { File.WriteAllText(Assembly.GetExecutingAssembly().Location+".started", "updated"); } }';
 const script='$ErrorActionPreference="Stop"; $updateFixture=ConvertFrom-Json ([Console]::In.ReadToEnd()); Add-Type -TypeDefinition $updateFixture.code -OutputAssembly $updateFixture.output -OutputType ConsoleApplication';
 const result=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{input:JSON.stringify({code,output:source}).replace(/[^\x00-\x7f]/g,c=>'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0')),encoding:'utf8',windowsHide:true});assert.equal(result.status,0,result.stderr);
 const bytes=await fs.readFile(source),info={bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
 const env={...process.env,CIRCUIT_LAB_SMOKE:'1',CIRCUIT_LAB_TEST_PROFILE:path.join(temp,'profile')};delete env.ELECTRON_RUN_AS_NODE;
 const packaged=!!process.env.LAB_EXE,app=await _electron.launch({executablePath:process.env.LAB_EXE||path.join(root,'node_modules/electron/dist/electron.exe'),args:packaged?[]:[root],cwd:root,env});let closed=false;
 try{
  await (await app.firstWindow()).waitForSelector('.monaco-editor');
  await app.evaluate(({app},job)=>{const require=process.getBuiltinModule('module').createRequire(app.getAppPath()+'/package.json');return require('./desktop/updater.cjs').launchHelper({...job,pid:process.pid});},{directory,source,target,info});
  await app.close();closed=true;
  for(let i=0;i<150;i++){try{await fs.access(target+'.started');break;}catch{}await wait(100);}
  assert.equal(await fs.readFile(target+'.started','utf8'),'updated');assert.equal(createHash('sha256').update(await fs.readFile(target)).digest('hex'),info.sha256);
  await fs.writeFile(path.join(out,'update-gui-helper-check.json'),JSON.stringify({passed:true,packaged,checks:['Helper starts from actual Electron main process','Long Korean/space/apostrophe/dollar path','Helper survives GUI parent exit and applies/relaunches target']},null,2));console.log('Electron GUI update helper passed:',packaged?'packaged ASAR':'development');
 }finally{if(!closed)await app.close().catch(()=>{});await wait(300);if(path.dirname(temp)!==out||!path.basename(temp).startsWith('update GUI helper '))throw Error('Invalid cleanup');await fs.rm(temp,{recursive:true,force:true,maxRetries:5,retryDelay:200});}
})().catch(error=>{console.error(error);process.exitCode=1;});
