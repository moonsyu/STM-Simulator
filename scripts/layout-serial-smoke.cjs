const {revealUiControl,clickUiControl}=require('./workbench-ui-actions.cjs');
const {openFixture,chooseHal}=require('./smoke-fixture.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {_electron}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const root=path.resolve(__dirname,'..'),out=path.join(root,'work','test-results');await fs.mkdir(out,{recursive:true});
 const env={...process.env,CIRCUIT_LAB_SMOKE:'1',CIRCUIT_LAB_TEST_PROFILE:path.join(out,'layout-serial-profile-'+Date.now())};delete env.ELECTRON_RUN_AS_NODE;
 const app=await _electron.launch({executablePath:process.env.LAB_EXE||path.join(root,'node_modules/electron/dist/electron.exe'),args:process.env.LAB_EXE?[]:[root],cwd:root,env});
 try{
  const page=await app.firstWindow(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.waitForSelector('.dock-resizer');
  await app.evaluate(({BrowserWindow})=>{const win=BrowserWindow.getAllWindows()[0];win.setSize(1540,1020);win.showInactive();});
  // The dedicated IDE suite verifies drag, keyboard resizing and persisted docking.
  const divider=page.locator('.dock-split[data-axis="x"]').last().locator(':scope > .dock-resizer');
  await divider.focus();await page.keyboard.press('Home');assert.ok((await page.locator('[data-panel="code"]').boundingBox()).width<100);
  await page.keyboard.press('End');assert.ok((await page.locator('[data-panel="simulator"]').boundingBox()).width<100);await clickUiControl(page, '#layout-reset');
  await clickUiControl(page, '#pinout-open');await page.check('[data-peripheral="USART2"]');
  const route=(id,role)=>page.locator(`[data-serial-route="${id}"][data-role="${role}"]`);
  assert.equal(await route('USART2','TX').inputValue(),'PA2');assert.equal(await route('USART2','RX').inputValue(),'PA3');assert.deepEqual(await route('USART2','TX').locator('option').evaluateAll(nodes=>nodes.filter(n=>n.value).map(n=>n.value)),['PA2']);
  await page.check('[data-peripheral="USART1"]');assert.equal(await route('USART1','TX').inputValue(),'PA9');await route('USART1','TX').selectOption('PB6');await route('USART1','RX').selectOption('PB7');assert.match(await page.locator('[data-config-pin="PA9"]').textContent(),/Reset/);
  await page.uncheck('[data-peripheral="USART1"]');assert.match(await page.locator('[data-config-pin="PB6"]').textContent(),/Reset/);
  await page.click('[data-config-pin="PB6"]');await page.selectOption('#pin-function','USART1_TX');assert.equal(await page.locator('[data-peripheral="USART1"]').isChecked(),true);assert.equal(await route('USART1','RX').inputValue(),'PA10');
  await page.check('[data-peripheral="USART3"]');await route('USART3','TX').selectOption('PC10');await route('USART3','RX').selectOption('PC11');await page.check('[data-peripheral="UART4"]');assert.equal(await route('UART4','TX').inputValue(),'PA0');assert.notEqual(await route('UART4','TX').locator('option[value="PC10"]').getAttribute('disabled'),null,await route('UART4','TX').evaluate(el=>el.outerHTML));
  await page.uncheck('[data-peripheral="USART2"]');await page.click('[data-config-pin="PA2"]');await page.selectOption('#pin-function','GPIO_Output');
  await page.locator('[data-peripheral="USART2"]').click();assert.equal(await page.locator('[data-peripheral="USART2"]').isChecked(),false);assert.match(await page.locator('#pinout-errors').textContent(),/USART2 TX.*사용 가능한 핀이 없습니다/);assert.match(await page.locator('[data-config-pin="PA2"]').textContent(),/GPIO_Output/);
  await page.check('[data-peripheral="UART5"]');await page.check('[data-peripheral="USART6"]');await page.check('[data-irq="UART4_IRQn"]');await page.screenshot({path:path.join(out,'15-uart-fixed-routes.png')});
  await page.click('#hal-generate');await page.click('#hal-replace-confirm');const source=await page.locator('#code').inputValue();assert.match(source,/huart4.Instance = UART4/);assert.match(source,/GPIO_AF8_UART4/);assert.match(source,/GPIO_AF7_USART1/);assert.match(source,/HAL_NVIC_EnableIRQ\(UART4_IRQn\)/);
  await clickUiControl(page, '#firmware-check');assert.match(await page.locator('#build-status').textContent(),/통과/);await page.click('#run');await page.waitForTimeout(100);assert.equal(await page.locator('#run-status').textContent(),'실행 중');await page.click('#run');
  assert.deepEqual(await page.locator('#serial-target option').evaluateAll(nodes=>nodes.map(n=>n.value)),['USART1','USART3','UART4','UART5','USART6']);
  await page.reload();await page.waitForSelector('.monaco-editor');await clickUiControl(page, '#pinout-open');assert.equal(await route('USART1','TX').inputValue(),'PB6');assert.equal(await route('UART4','RX').inputValue(),'PA1');await page.click('#pinout-close');
  await chooseHal(page,'uart');assert.equal(await page.locator('#serial-target').inputValue(),'USART2');
  assert.deepEqual(errors,[]);await fs.writeFile(path.join(out,'layout-serial-smoke.json'),JSON.stringify({passed:true,checks:['code and simulator shrink below former floors','layout reset','actual TX/RX choices','automatic allocation','alternate routes and release','manual pin activation','atomic pin conflict rejection','all six port configuration','AF7/AF8 generation and execution','configuration persistence','UART monitor target'],errors},null,2));console.log('Layout and serial UI smoke passed.');
 }finally{await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
