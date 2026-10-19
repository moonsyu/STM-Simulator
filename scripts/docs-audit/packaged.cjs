const fs=require('node:fs/promises'),path=require('node:path'),net=require('node:net');
const {createHash}=require('node:crypto');
const {clickUiControl}=require('../workbench-ui-actions.cjs');
 const {chromium}=require('playwright'),{launch,terminate}=require('../../desktop/process-tools.cjs');
(async()=>{
 const {root,directory:out,version}=require('./paths.cjs'),dev=process.argv.includes('--dev'),stepSamples=process.argv.includes('--step-samples'),exe=dev?require('electron'):process.env.LAB_EXE||path.join(root,'outputs/artifact/STM-Simulator.exe');
 await fs.mkdir(out,{recursive:true});
 const {PART_LIBRARY}=await import('../../src/part-library.js'),{fixture,inputChanges,family}=await import('./runtime.mjs');
 const profile=await fs.mkdtemp(path.join(out,'packaged-'));await fs.mkdir(path.join(profile,'updates'),{recursive:true});await fs.writeFile(path.join(profile,'updates/settings.json'),JSON.stringify({automatic:false}));
 const port=await new Promise(resolve=>{const server=net.createServer();server.listen(0,'127.0.0.1',()=>{const value=server.address().port;server.close(()=>resolve(value));});});
 const env={...process.env,CIRCUIT_LAB_SMOKE:'1',CIRCUIT_LAB_TEST_PROFILE:profile};delete env.ELECTRON_RUN_AS_NODE;
 const child=launch(exe,[...(dev?[root]:[]),`--remote-debugging-port=${port}`,'--remote-debugging-address=127.0.0.1'],{env,cwd:root});let browser;
 const read=async()=>{const files=['events.previous.jsonl','events.jsonl'];return(await Promise.all(files.map(n=>fs.readFile(path.join(profile,'diagnostics',n),'utf8').catch(()=>'')))).flatMap(t=>t.trim().split('\n').filter(Boolean).map(l=>{try{return JSON.parse(l);}catch{return null;}}).filter(Boolean));};
 const rows=[];
 try{
  let ready=false;for(let i=0;i<300;i++){try{ready=(await fetch(`http://127.0.0.1:${port}/json/version`)).ok;if(ready)break;}catch{}await new Promise(r=>setTimeout(r,200));}if(!ready)throw new Error('Portable app startup failed');
  browser=await chromium.connectOverCDP(`http://127.0.0.1:${port}`);const page=browser.contexts()[0].pages()[0];page.setDefaultTimeout(12000);await page.waitForSelector('.monaco-editor');
  const state=await page.evaluate(()=>window.appUpdates.state()),errors=[];page.on('pageerror',e=>errors.push(e.message));
  page.on('console',e=>{if(e.text().includes('로컬 진단 기록 실패'))errors.push(e.text());});
  const waitSimulation=ms=>page.waitForFunction(ms=>parseFloat(document.getElementById('sim-time').textContent)*1000>=ms,ms,{polling:100,timeout:90000});
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
    if(stepSamples){
     await clickUiControl(page,'#step');
     for(const atMs of [200,500,1000,1500,2000,2500,3000,3500]){
      await page.evaluate(atMs=>{
       let count=0;
       while(parseFloat(document.getElementById('sim-time').textContent)*1000<atMs){
        if(++count>200)throw new Error('Step control did not advance simulation');
        document.getElementById('step').click();
       }
      },atMs);
      // Let the unchanged application's 2-second file logger sample each phase.
      await page.waitForTimeout(2100);
     }
    }else await page.locator('#run').dispatchEvent('click');
    result.stimuli=[];
    if(family(type)==='uart'){
     await waitSimulation(100);await page.locator('[data-monitor="bus"]').dispatchEvent('click');
     await page.evaluate(()=>{
      const select=document.getElementById('serial-target');
      if(![...select.options].some(o=>o.value==='USART2:external'))throw new Error('Missing external UART channel');
      select.value='USART2:external';select.dispatchEvent(new Event('change',{bubbles:true}));
      document.getElementById('serial-input').value='Audit42';
     });await page.locator('#serial-send').dispatchEvent('click');
     result.stimuli.push({input:'UART',text:'Audit42'});
    }
    for(const [phase,atMs] of [[1,1100],[2,2300]]){
     const changes=inputChanges(type,phase);if(!Object.keys(changes).length)continue;
     await waitSimulation(atMs);
     result.stimuli.push(await page.evaluate(({changes,atMs})=>{
      for(const [key,value] of Object.entries(changes)){
       const input=document.querySelector('[data-part-prop="'+key+'"]');
       if(!input||input.dataset.live!=='true')throw new Error('Missing live input: '+key);
       input.value=String(value);input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));
      }
      return {requestedMs:atMs,observedTime:document.getElementById('sim-time').textContent,changes,actual:Object.fromEntries(Object.keys(changes).map(key=>[key,document.querySelector('[data-part-prop="'+key+'"]').value]))};
     },{changes,atMs}));
    }
    await waitSimulation(/dht|ds18b20/.test(type)?5500:3500);
    result.runningText=await page.locator('#run').textContent();if(result.runningText.includes('정지'))await page.locator('#run').dispatchEvent('click');await page.waitForTimeout(150);
    const events=(await read()).filter(e=>e.time>=start),states=events.filter(e=>e.type==='simulation.state');
    Object.assign(result,{applied:events.some(e=>e.type==='docs.applied'),started:events.some(e=>e.type==='simulation.started'),stateEvents:states.length,simulationMs:states.at(-1)?.detail.simulationMs,console:events.filter(e=>e.type==='console').map(e=>e.detail),errors:errors.splice(0),events});
    await fs.writeFile(path.join(out,`packaged-${type}.stm32lab`),JSON.stringify(saved));
   }catch(e){result.error=e.message;}
   await fs.writeFile(path.join(out,`packaged-${type}.json`),JSON.stringify(result,null,2));const {events,console:consoleRows,...summary}=result;rows.push(summary);console.log(JSON.stringify(summary));
  }
  await fs.writeFile(path.join(out,'packaged-summary.json'),JSON.stringify({exe,profile,dev,stepSamples,version:state.currentVersion,exeSha256:createHash('sha256').update(await fs.readFile(exe)).digest('hex'),rows},null,2));
  if(rows.some(r=>r.error||r.errors?.length||r.version!==version||!r.applied||!r.started||!r.stateEvents))process.exitCode=1;
  await page.evaluate(()=>window.close()).catch(()=>{});
 }finally{if(browser)await browser.close().catch(()=>{});await terminate(child);}
})().catch(e=>{console.error(e);process.exitCode=1;});
