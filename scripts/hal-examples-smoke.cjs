const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {_electron}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {openFixture,chooseHal}=require('./smoke-fixture.cjs');
(async()=>{
 const root=path.resolve(__dirname,'..'),out=path.join(root,'test-results');await fs.mkdir(out,{recursive:true});
 const env={...process.env,CIRCUIT_LAB_SMOKE:'1',CIRCUIT_LAB_TEST_PROFILE:path.join(out,'hal-examples-profile-'+Date.now())};delete env.ELECTRON_RUN_AS_NODE;
 const app=await _electron.launch({executablePath:process.env.LAB_EXE||path.join(root,'node_modules/electron/dist/electron.exe'),args:process.env.LAB_EXE?[]:[root],cwd:root,env});
 try{
  const page=await app.firstWindow(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.waitForSelector('#hal-example');await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].showInactive());
  const {HAL_EXAMPLES}=await import('../src/hal-examples.js'),{halCircuit}=await import('../tests/fixtures/hal.js');
  const saved=async()=>{await page.waitForTimeout(240);return page.evaluate(()=>JSON.parse(localStorage.getItem('stm32lab.project.v2')));};
  assert.equal(await page.locator('[data-example],#extra-example,#feature-example,.example-card').count(),0);assert.match(await page.locator('#connection-count').textContent(),/부품 0개 · 배선 0개/);assert.equal(await page.locator('#firmware-mode').inputValue(),'hal');assert.equal(await page.locator('#hal-example option').count(),14);
  await page.click('#run');await page.waitForTimeout(100);assert.match(await page.locator('#console-output').textContent(),/HAL ready/);await page.click('#run');
  for(const kind of Object.keys(HAL_EXAMPLES)){
    await chooseHal(page,kind);assert.doesNotMatch(await page.locator('#code').inputValue(),/\bSerial\d*\./);assert.match(await page.locator('#connection-count').textContent(),/부품 0개 · 배선 0개/);await page.click('#firmware-check');assert.match(await page.locator('#firmware-status').textContent(),/통과/);await page.click('#clear-console');await page.click('#run');await page.waitForTimeout(150);assert.equal(await page.locator('#run-status').textContent(),'실행 중',kind);assert.equal(await page.locator('#hal-example').isDisabled(),true);
    if(kind==='uart')assert.match(await page.locator('#console-output').textContent(),/\[USART2 TX\] HAL UART ready/);
    if(kind==='language')assert.match(await page.locator('#console-output').textContent(),/average=25/);
    if(kind==='i2c')assert.match(await page.locator('#console-output').textContent(),/write=1 read=1/);
    await page.click('#run');
  }
  const original=halCircuit('uart');original.name='My circuit';await openFixture(page,original);await chooseHal(page,'adc');let p=await saved();assert.deepEqual(p.components,original.components);assert.deepEqual(p.wires,original.wires);assert.equal(p.name,'My circuit');assert.match(p.code,/HAL_ADC_Start/);
  await page.click('#undo');p=await saved();assert.equal(p.code,original.code);assert.deepEqual(p.mcu,original.mcu);
  await page.selectOption('#hal-example','language');await page.click('#hal-example-cancel');assert.equal(await page.locator('#code').inputValue(),original.code);
  await page.click('[data-monitor="bus"]');await page.click('#run');await page.waitForTimeout(70);await page.fill('#serial-input','HAL log');await page.click('#serial-send');await page.waitForTimeout(100);await page.click('[data-monitor="log"]');const text=await page.locator('#console-output').textContent();assert.match(text,/\[USART2 RX\] HAL log/);assert.match(text,/\[USART2 TX\] HAL log/);assert.doesNotMatch(await page.locator('#serial-target').textContent(),/USB 콘솔|Serial1/);await page.screenshot({path:path.join(out,'hal-uart-logs.png')});
  await page.click('#clear-console');assert.equal(await page.locator('#console-output').textContent(),'');await page.click('[data-monitor="bus"]');await page.fill('#serial-input','fresh');await page.click('#serial-send');await page.waitForTimeout(80);await page.click('[data-monitor="log"]');assert.match(await page.locator('#console-output').textContent(),/fresh/);assert.doesNotMatch(await page.locator('#console-output').textContent(),/HAL log/);await page.click('#run');
  await openFixture(page,halCircuit('temperature'));await page.click('#run');await page.waitForTimeout(70);assert.match(await page.locator('#console-output').textContent(),/TMP36=25.0 C/);await page.click('#run');
  await page.click('#new');if(await page.locator('#replace-dialog').isVisible())await page.click('#replace-confirm');await chooseHal(page,'language');await page.click('#run');await page.waitForTimeout(70);await page.screenshot({path:path.join(out,'hal-code-only.png')});await page.click('#run');await page.waitForTimeout(240);await page.reload();await page.waitForSelector('#code');assert.match(await page.locator('#code').inputValue(),/average=%d/);assert.match(await page.locator('#connection-count').textContent(),/부품 0개 · 배선 0개/);
  assert.deepEqual(errors,[]);await fs.writeFile(path.join(out,'hal-examples-smoke.json'),JSON.stringify({passed:true,checks:['blank HAL startup','no legacy example menus','13 code-only HAL examples compile/run','no automatic parts/wires','preserved circuit and name','undo/cancel','printf logs','unwired UART TX log','wired UART RX/TX line grouping','log clear','measured sensor logs','new/reload persistence'],errors},null,2));console.log('HAL code-only examples and logging UI smoke passed.');
 }finally{await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
