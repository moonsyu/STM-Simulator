const {chooseHal,openFixture}=require('./smoke-fixture.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {_electron}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const root=path.resolve(__dirname,'..'),out=path.join(root,'work/test-results');await fs.mkdir(out,{recursive:true});
 const env={...process.env,CIRCUIT_LAB_SMOKE:'1',CIRCUIT_LAB_TEST_PROFILE:path.join(out,'uart-vcp-profile-'+Date.now())};delete env.ELECTRON_RUN_AS_NODE;
 const app=await _electron.launch({executablePath:process.env.LAB_EXE||path.join(root,'node_modules/electron/dist/electron.exe'),args:process.env.LAB_EXE?['--force-device-scale-factor=1']:[root,'--force-device-scale-factor=1'],cwd:root,env});
 try{
  const page=await app.firstWindow(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.waitForSelector('.monaco-editor');
  await app.evaluate(({BrowserWindow})=>{const win=BrowserWindow.getAllWindows()[0];win.setSize(1440,960);win.showInactive();});
  const {halExample}=await import('../src/hal-examples.js');
  const output=pattern=>page.waitForFunction(pattern=>new RegExp(pattern).test(document.getElementById('uart-output').textContent),pattern);
  const send=async text=>{await page.fill('#serial-input',text);await page.click('#serial-send');};
  await chooseHal(page,'uart');assert.match(await page.locator('#connection-count').textContent(),/부품 0개 · 배선 0개/);
  assert.equal(await page.locator('#serial-target').inputValue(),'USART2');await page.click('[data-monitor="bus"]');await page.click('#run');await output('ST-LINK VCP.*USART2[\\s\\S]*HAL UART ready');
  await send('Internal echo');await output('Internal echo');
  await page.selectOption('#serial-target','USART2:external');await send('No part');assert.match(await page.locator('#serial-feedback').textContent(),/외부 UART 장치/);assert.equal(await page.locator('#uart-output').textContent(),'');
  await page.selectOption('#serial-target','USART2');await send('VCP again');await output('VCP again');assert.equal(await page.locator('#serial-feedback').textContent(),'');
  await page.screenshot({path:path.join(out,'uart-vcp.png')});await page.click('#run');
  await chooseHal(page,'uart_external');assert.equal(await page.locator('#serial-target').inputValue(),'USART2:external');await page.click('#run');await output('UART1: HAL UART ready');await send('External echo');await output('External echo');await page.click('#run');
  const broken=halExample('uart_external');broken.components[0].baud=115200;await openFixture(page,broken);await page.click('[data-monitor="bus"]');await page.selectOption('#serial-target','USART2:external');await page.click('#run');await send('Wrong baud');assert.match(await page.locator('#serial-feedback').textContent(),/통신 속도/);assert.equal(await page.locator('#uart-output').textContent(),'');
  await page.selectOption('#serial-target','USART2');await send('Independent VCP');await output('Independent VCP');await page.click('#run');
  await chooseHal(page,'ref_uart_cable_6');assert.equal(await page.locator('#serial-target').inputValue(),'USART2:external');await page.click('#run');await output('HAL UART ready');await send('Six pins');await output('Six pins');await page.click('#run');
  await chooseHal(page,'uart');assert.equal(await page.locator('#serial-target').inputValue(),'USART2');
  assert.deepEqual(errors,[]);const metadata=await app.evaluate(({app})=>({version:app.getVersion(),packaged:app.isPackaged}));
  await fs.writeFile(path.join(out,'uart-vcp-ui.json'),JSON.stringify({passed:true,...metadata,checks:['no-part USART2 TX/RX','external route has no VCP fallback','feedback clears on success','external example route and echo','baud mismatch rejection','6-pin external variant','default example restores VCP'],errors},null,2));console.log('UART VCP UI passed',metadata);
 }finally{await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
