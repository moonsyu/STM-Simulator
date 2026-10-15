// Run after publishing: the old public EXE must use its own unmodified updater.
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),net=require('node:net');
const {createHash}=require('node:crypto'),{createReadStream}=require('node:fs');
const {chromium}=require('playwright'),{launch,execute,terminate}=require('../desktop/process-tools.cjs');
const {readJson,releaseInfo,validateManifest}=require('../desktop/updater.cjs');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function hash(file){const value=createHash('sha256');for await(const chunk of createReadStream(file))value.update(chunk);return value.digest('hex');}
async function freePort(){return new Promise(resolve=>{const server=net.createServer();server.listen(0,'127.0.0.1',()=>{const port=server.address().port;server.close(()=>resolve(port));});});}
async function processes(target){
 const data=Buffer.from(target).toString('base64');
 const script=`[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false); $updateTarget=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${data}')); $updateAll=@(Get-CimInstance Win32_Process); $updateLaunchers=@($updateAll | Where-Object {$_.ExecutablePath -eq $updateTarget}); $updateRows=@($updateAll | Where-Object { $_.ExecutablePath -eq $updateTarget -or $_.ParentProcessId -in $updateLaunchers.ProcessId } | Select-Object ProcessId,ParentProcessId,ExecutablePath); ConvertTo-Json -InputObject $updateRows -Compress`;
 const result=await execute('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{timeout:30000});assert.equal(result.code,0,result.stderr);return JSON.parse(result.stdout.trim()||'[]');
}
(async()=>{
 const root=path.resolve(__dirname,'..'),out=path.join(root,'work/test-results'),pkg=require('../package.json'),baseline=JSON.parse(await fs.readFile(path.join(out,'update-release-baseline.json'),'utf8'));
 assert.equal(baseline.verified,true);assert.equal(await hash(baseline.baseExe),baseline.manifest.sha256);
 const release=await readJson('https://api.github.com/repos/moonsyu/STM-Simulator/releases/latest'),info=releaseInfo(release,baseline.manifest.version);assert.ok(info,'Publish a newer stable release before this check');assert.equal(info.version,pkg.version);const manifest=validateManifest(await readJson(info.manifestUrl),info);
 const temp=await fs.mkdtemp(path.join(out,'release-update-')),target=path.join(temp,'STM-Simulator.exe'),profile=path.join(temp,'profile');await fs.copyFile(baseline.baseExe,target);
 const env={...process.env,CIRCUIT_LAB_SMOKE:'0',CIRCUIT_LAB_TEST_PROFILE:profile};delete env.ELECTRON_RUN_AS_NODE;
 let child,browser,page;
 async function open(){const port=await freePort();child=launch(target,[`--remote-debugging-port=${port}`,'--remote-debugging-address=127.0.0.1'],{env});let ready=false;for(let i=0;i<300;i++){try{if((await fetch(`http://127.0.0.1:${port}/json/version`)).ok){ready=true;break;}}catch{}await wait(200);}assert.ok(ready,'App did not start');browser=await chromium.connectOverCDP(`http://127.0.0.1:${port}`);page=browser.contexts()[0].pages()[0];await page.waitForSelector('.monaco-editor');}
 try{
  await open();assert.equal((await page.evaluate(()=>window.appUpdates.state())).currentVersion,baseline.manifest.version);await page.evaluate(()=>window.appUpdates.configure(false));
  await page.click('#new');await page.fill('#new-project-name','Live Update Project');
  // The project is created through the actual UI; the updater and network are untouched.
  await page.click('#project-create');await page.waitForSelector('#project-dialog',{state:'hidden'});
  const marker='STM_PUBLIC_UPDATE_SURVIVES';await page.locator('#code').evaluate((el,marker)=>{el.value='// '+marker+'\nint main(void) { return 0; }\n';el.dispatchEvent(new Event('input',{bubbles:true}));},marker);
  await page.click('[data-tab="settings"]');await page.fill('#pref-fontSize','17');await page.locator('#pref-fontSize').press('Tab');await page.click('[data-tab="code"]');
  if(await page.locator('#object-scale').count()){await page.selectOption('#resize-target','surface:board');await page.fill('#object-scale','125');await page.locator('#object-scale').press('Tab');}
  else await require('./resize-gesture.cjs').resizeDevice(page,'surface:board',1.25,1.25);
  // Configure the genuine automatic scheduler; do not call manual check/download.
  await page.evaluate(()=>window.appUpdates.configure(true));
  let downloaded,lastPhase;const downloadDeadline=Date.now()+240000;
  while(Date.now()<downloadDeadline){const state=await page.evaluate(()=>window.appUpdates.state());if(state.phase!==lastPhase){console.log('Automatic updater:',state.phase);lastPhase=state.phase;}if(state.phase==='error')throw new Error(state.message);if(state.phase==='ready'){downloaded=state;break;}await wait(300);}
  assert.equal(downloaded?.phase,'ready',JSON.stringify(downloaded));assert.equal(downloaded.latestVersion,manifest.version);assert.equal(await hash(path.join(profile,'updates/pending.exe')),manifest.sha256);
  await page.click('#app-update');await page.screenshot({path:path.join(out,'public-update-ready.png')});
  await page.click('#update-install').catch(error=>{if(!/closed|disconnected/i.test(error.message))throw error;});
  let result;for(let i=0;i<600;i++){try{result=JSON.parse((await fs.readFile(path.join(profile,'updates/last-result.json'),'utf8')).replace(/^\uFEFF/,''));if(result.ok)break;throw new Error(result.message);}catch(error){if(error.code!=='ENOENT'&&!(error instanceof SyntaxError))throw error;}if((await fs.stat(target)).size===manifest.bytes&&await hash(target)===manifest.sha256){result={ok:true};break;}if(i%5===0){const state=await page.evaluate(()=>window.appUpdates.state()).catch(()=>null);if(state?.phase==='ready'&&state.message.startsWith('적용하지 못했습니다'))throw new Error(state.message);}await wait(200);}assert.equal(result?.ok,true,'Portable replacement did not finish');
  assert.equal(await hash(target),manifest.sha256);
  const asar=await import('@electron/asar');let relaunched,main,packaged;
  for(let i=0;i<90;i++){
   const rows=await processes(target);relaunched=rows.find(p=>p.ExecutablePath?.toLowerCase()===target.toLowerCase());main=rows.find(p=>p.ParentProcessId===relaunched?.ProcessId&&p.ExecutablePath!==target);
   if(main){try{packaged=JSON.parse(asar.extractFile(path.join(path.dirname(main.ExecutablePath),'resources/app.asar'),'package.json').toString());if(packaged.version===manifest.version)break;}catch{}}
   await wait(300);
  }
  assert.equal(packaged?.version,manifest.version,'The helper must launch the new packaged application');assert.ok(relaunched);await wait(1500);assert.ok((await processes(target)).some(p=>p.ProcessId===main.ProcessId),'New app must remain running');
  const restartProof={launcher:relaunched.ProcessId,main:main.ProcessId,version:packaged.version};
  if(browser)await browser.close().catch(()=>{});await terminate({pid:relaunched.ProcessId,exitCode:null});await wait(500);
  await open();const state=await page.evaluate(()=>window.appUpdates.state());assert.equal(state.currentVersion,manifest.version);assert.equal(state.automatic,true);assert.match(await page.inputValue('#code'),new RegExp(marker));assert.equal(await page.evaluate(()=>document.documentElement.dataset.colorscheme),'jellybean');assert.ok(await page.evaluate(()=>{const s=JSON.parse(localStorage.getItem('stm32lab.project.v2')).surfaces.board;return Math.abs((s.scaleX??s.scale)-1.25)<.02&&Math.abs((s.scaleY??s.scale)-1.25)<.02;}));await page.click('[data-tab="settings"]');assert.equal(await page.inputValue('#pref-fontSize'),'17');await page.screenshot({path:path.join(out,'public-update-applied.png')});
  const proof={passed:true,verifiedAt:new Date().toISOString(),from:baseline.manifest.version,to:manifest.version,sourceRelease:baseline.release,targetRelease:`https://github.com/moonsyu/STM-Simulator/releases/tag/${release.tag_name}`,beforeSha256:baseline.manifest.sha256,afterSha256:manifest.sha256,restartProof,checks:['Original publicly downloaded EXE, no updater/network mocks','Automatic scheduler discovers public latest release without manual check','Automatic download and SHA-256 verification','Save and restart button','Old EXE atomically replaced with exact public asset','Helper launches new package and keeps it running','New version and preserved source confirmed after reopening','Jellybean, font size, device scale and automatic preference preserved']};
  await fs.writeFile(path.join(out,'release-update-proof.json'),JSON.stringify(proof,null,2));console.log(`PUBLIC UPDATE PASSED: ${proof.from} -> ${proof.to}; source preserved, hash verified and new app relaunched.`);
  await page.evaluate(()=>window.close()).catch(()=>{});
 }catch(error){if(page)await page.screenshot({path:path.join(out,'public-update-failure.png'),timeout:5000}).catch(()=>{});throw error;}
 finally{if(browser)await browser.close().catch(()=>{});await terminate(child);for(const item of await processes(target).catch(()=>[]))if(item.ExecutablePath?.toLowerCase()===target.toLowerCase())await terminate({pid:item.ProcessId,exitCode:null});await wait(500);if(path.dirname(temp)!==out||!path.basename(temp).startsWith('release-update-'))throw new Error('Invalid test cleanup');await fs.rm(temp,{recursive:true,force:true,maxRetries:6,retryDelay:200});}
})().catch(error=>{console.error(error);process.exitCode=1;});
