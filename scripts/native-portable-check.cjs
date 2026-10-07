// NSIS portable launchers do not forward the inspector stderr used by _electron.launch.
// Connect to their child application's explicit loopback CDP port instead.
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),net=require('node:net'),assert=require('node:assert/strict');
const {chromium}=require('playwright'),{launch,terminate}=require('../desktop/process-tools.cjs'),{toolSettings,waitUntil}=require('./native-ide-check.cjs');
(async()=>{
 const root=path.resolve(__dirname,'..'),pkg=require('../package.json'),profile=await fs.mkdtemp(path.join(os.tmpdir(),'stm-portable-native-'));
 const port=await new Promise(resolve=>{const server=net.createServer();server.listen(0,'127.0.0.1',()=>{const p=server.address().port;server.close(()=>resolve(p));});});
 const exe=path.join(root,`outputs/artifact/STM-Simulator-${pkg.version}-win-x64.exe`),env={...process.env,CIRCUIT_LAB_SMOKE:'0',CIRCUIT_LAB_TEST_PROFILE:profile};delete env.ELECTRON_RUN_AS_NODE;
 const child=launch(exe,[`--remote-debugging-port=${port}`,'--remote-debugging-address=127.0.0.1'],{env});child.on('error',e=>console.error(e));let browser;
 try{
  await waitUntil(async()=>{try{return (await fetch(`http://127.0.0.1:${port}/json/version`)).ok;}catch{return false;}},'portable renderer startup',60000);
  browser=await chromium.connectOverCDP(`http://127.0.0.1:${port}`);const page=browser.contexts()[0].pages()[0];await page.waitForSelector('.monaco-editor');
  await page.click('#pinout-open');assert.equal(await page.inputValue('#timer-clock'),'16000000');
  for(const id of ['TIM2','TIM3','TIM4','TIM5']){
    assert.equal(await page.inputValue(`[data-peripheral-value="${id}"][data-key="prescaler"]`),'0');
    assert.equal(await page.inputValue(`[data-peripheral-value="${id}"][data-key="period"]`),['TIM2','TIM5'].includes(id)?'4294967295':'65535');
  }
  assert.equal(await page.locator('[data-peripheral]:checked').count(),0);await page.click('#pinout-close');assert.match(await page.inputValue('#code'),/RCC_PLL_OFF/);
  await page.evaluate(tools=>window.nativeIde.configure(tools),await toolSettings());
  await page.click('#new');await page.selectOption('#new-project-template','native-host');await page.click('#project-create');await page.waitForSelector('#project-dialog',{state:'hidden'});
  await page.click('#ide-build');await page.waitForFunction(()=>document.getElementById('build-status').textContent==='GCC 빌드 성공');
  await page.click('#debug-start');await page.waitForFunction(()=>document.getElementById('debug-location').textContent.includes('GDB · main'));assert.ok(await page.locator('#native-registers tr').count()>5);
  await page.click('#run');await page.waitForFunction(()=>!document.getElementById('code').readOnly);await page.click('#run');await page.waitForFunction(()=>document.getElementById('native-output').textContent.includes('Hello from STM Simulator: 42'));await page.waitForFunction(()=>!document.getElementById('code').readOnly);
  await fs.writeFile(path.join(root,'work/test-results/native-portable-check.json'),JSON.stringify({passed:true,version:pkg.version,executable:exe,checks:['actual NSIS portable EXE extracted and started','Monaco initialized','HSI 16 MHz, PSC zero and full-width ARR in fresh project','GCC compiled from packaged app','GDB paused at main with registers','debugger exit unlocks project','native executable printed 42']},null,2));console.log('Portable EXE MCU defaults and actual GCC/GDB/run passed');
 }finally{if(browser)await browser.close();await terminate(child);}
})().catch(e=>{console.error(e);process.exitCode=1;});
