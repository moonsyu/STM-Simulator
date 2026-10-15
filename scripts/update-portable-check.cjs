const fs=require('node:fs/promises'),path=require('node:path'),net=require('node:net'),assert=require('node:assert/strict');
const {chromium}=require('playwright'),{launch,terminate}=require('../desktop/process-tools.cjs');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
(async()=>{
 const root=path.resolve(__dirname,'..'),out=path.join(root,'work/test-results'),pkg=require('../package.json');await fs.mkdir(out,{recursive:true});
 const profile=await fs.mkdtemp(path.join(out,'update-portable-'));
 const port=await new Promise(resolve=>{const server=net.createServer();server.listen(0,'127.0.0.1',()=>{const port=server.address().port;server.close(()=>resolve(port));});});
 const exe=path.join(root,'outputs','artifact',pkg.build.portable.artifactName),env={...process.env,CIRCUIT_LAB_SMOKE:'0',CIRCUIT_LAB_TEST_PROFILE:profile};delete env.ELECTRON_RUN_AS_NODE;
 const child=launch(exe,[`--remote-debugging-port=${port}`,'--remote-debugging-address=127.0.0.1'],{env});let browser;
 try{
  let ready=false;for(let i=0;i<300;i++){try{ready=(await fetch(`http://127.0.0.1:${port}/json/version`)).ok;if(ready)break;}catch{}await wait(200);}assert.ok(ready,'Portable app did not start');
  browser=await chromium.connectOverCDP(`http://127.0.0.1:${port}`);const page=browser.contexts()[0].pages()[0];await page.waitForSelector('.monaco-editor');
  const initial=await page.evaluate(()=>window.appUpdates.state());assert.equal(initial.currentVersion,pkg.version);assert.notEqual(initial.phase,'unsupported');
  await page.evaluate(()=>window.appUpdates.configure(false));await page.click('#app-update');await page.waitForFunction(()=>!document.getElementById('update-automatic').checked);assert.equal(await page.locator('#update-automatic').isDisabled(),false);
  const result=await page.evaluate(()=>window.appUpdates.check());assert.ok(['current','available','error'].includes(result.phase),JSON.stringify(result));
  assert.equal(JSON.parse(await fs.readFile(path.join(profile,'updates/settings.json'),'utf8')).automatic,false);
  await page.screenshot({path:path.join(out,'update-portable.png')});
  await fs.writeFile(path.join(out,'update-portable-check.json'),JSON.stringify({passed:true,version:pkg.version,exe,checks:['Actual single portable EXE extracts and starts','Packaged updater is enabled with the correct version','Automatic preference persists in main process','Manual check completes, with offline handling'],serverCheck:result},null,2));
  console.log('Portable updater passed:',result.phase,result.message);
  await page.evaluate(()=>window.close()).catch(()=>{});
 }finally{if(browser)await browser.close().catch(()=>{});await terminate(child);if(path.dirname(profile)!==out||!path.basename(profile).startsWith('update-portable-'))throw new Error('Invalid test cleanup path');await fs.rm(profile,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
