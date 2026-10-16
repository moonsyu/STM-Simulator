const fs=require('node:fs/promises'),path=require('node:path'),net=require('node:net');
 const {chromium}=require('playwright'),{launch,terminate}=require('../../desktop/process-tools.cjs');
(async()=>{
 const root=path.resolve(__dirname,'../..'),out=path.join(root,'work/test-results/docs-audit'),exe=process.env.LAB_EXE||path.join(root,'outputs/artifact/STM-Simulator.exe');
 const {PART_LIBRARY}=await import('../../src/part-library.js'),{fixture}=await import('./runtime.mjs');
 const profile=await fs.mkdtemp(path.join(out,'packaged-'));await fs.mkdir(path.join(profile,'updates'),{recursive:true});await fs.writeFile(path.join(profile,'updates/settings.json'),JSON.stringify({automatic:false}));
 const port=await new Promise(resolve=>{const server=net.createServer();server.listen(0,'127.0.0.1',()=>{const value=server.address().port;server.close(()=>resolve(value));});});
 const env={...process.env,CIRCUIT_LAB_SMOKE:'1',CIRCUIT_LAB_TEST_PROFILE:profile};delete env.ELECTRON_RUN_AS_NODE;
 const child=launch(exe,[`--remote-debugging-port=${port}`,'--remote-debugging-address=127.0.0.1'],{env});let browser;
 const read=async()=>{const files=['events.previous.jsonl','events.jsonl'];return(await Promise.all(files.map(n=>fs.readFile(path.join(profile,'diagnostics',n),'utf8').catch(()=>'')))).flatMap(t=>t.trim().split('\n').filter(Boolean).map(l=>{try{return JSON.parse(l);}catch{return null;}}).filter(Boolean));};
 const rows=[];
 try{
  let ready=false;for(let i=0;i<300;i++){try{ready=(await fetch(`http://127.0.0.1:${port}/json/version`)).ok;if(ready)break;}catch{}await new Promise(r=>setTimeout(r,200));}if(!ready)throw new Error('Portable app startup failed');
  browser=await chromium.connectOverCDP(`http://127.0.0.1:${port}`);const page=browser.contexts()[0].pages()[0];page.setDefaultTimeout(12000);await page.waitForSelector('.monaco-editor');
  const state=await page.evaluate(()=>window.appUpdates.state()),errors=[];page.on('pageerror',e=>errors.push(e.message));
  for(const {type}of PART_LIBRARY.filter(p=>!process.env.DOCS_AUDIT_TYPES||process.env.DOCS_AUDIT_TYPES.split(',').includes(p.type))){
   let start=new Date().toISOString(),result={type,version:state.currentVersion};
   try{
    const initial=fixture(type).project;if(type==='board')initial.surfaces.board.hidden=false;
    if((await page.locator('#run').textContent()).includes('정지'))await page.locator('#run').dispatchEvent('click');
    await page.locator('#file-input').setInputFiles({name:'fixture.stm32lab',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(initial))});
    await page.waitForFunction(code=>document.getElementById('code').value===code,initial.code);
    await page.selectOption('#resize-target',type==='board'?'surface:board':'part:selected');await page.locator('[data-tab="docs"]').dispatchEvent('click');await page.locator('#docs-apply-all').dispatchEvent('click');
    await page.waitForFunction(()=>document.getElementById('docs-result').textContent.includes('적용 완료'));
    await page.waitForTimeout(250);const saved=JSON.parse(await fs.readFile(path.join(profile,'diagnostics/latest-project.stm32lab'),'utf8'));
    await page.locator('#run').dispatchEvent('click');await page.waitForTimeout(/dht/.test(type)?6000:4200);
    result.runningText=await page.locator('#run').textContent();if(result.runningText.includes('정지'))await page.locator('#run').dispatchEvent('click');await page.waitForTimeout(150);
    const events=(await read()).filter(e=>e.time>=start),states=events.filter(e=>e.type==='simulation.state');
    Object.assign(result,{applied:events.some(e=>e.type==='docs.applied'),started:events.some(e=>e.type==='simulation.started'),stateEvents:states.length,simulationMs:states.at(-1)?.detail.simulationMs,console:events.filter(e=>e.type==='console').map(e=>e.detail),errors:errors.splice(0),events});
    await fs.writeFile(path.join(out,`packaged-${type}.stm32lab`),JSON.stringify(saved));
   }catch(e){result.error=e.message;}
   await fs.writeFile(path.join(out,`packaged-${type}.json`),JSON.stringify(result,null,2));const {events,console:consoleRows,...summary}=result;rows.push(summary);console.log(JSON.stringify(summary));
  }
  await fs.writeFile(path.join(out,'packaged-summary.json'),JSON.stringify({exe,profile,version:state.currentVersion,rows},null,2));await page.evaluate(()=>window.close()).catch(()=>{});
 }finally{if(browser)await browser.close().catch(()=>{});await terminate(child);}
})().catch(e=>{console.error(e);process.exitCode=1;});
