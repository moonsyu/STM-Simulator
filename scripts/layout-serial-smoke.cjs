const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {_electron}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const root=path.resolve(__dirname,'..'),out=path.join(root,'test-results');await fs.mkdir(out,{recursive:true});
 const env={...process.env,CIRCUIT_LAB_SMOKE:'1',CIRCUIT_LAB_TEST_PROFILE:path.join(out,'layout-serial-profile-'+Date.now())};delete env.ELECTRON_RUN_AS_NODE;
 const app=await _electron.launch({executablePath:process.env.LAB_EXE||path.join(root,'node_modules/electron/dist/electron.exe'),args:process.env.LAB_EXE?[]:[root],cwd:root,env});
 try{
  const page=await app.firstWindow(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.waitForSelector('#editor-resizer');
  await app.evaluate(({BrowserWindow})=>{const win=BrowserWindow.getAllWindows()[0];win.setSize(1540,1020);win.showInactive();});
  const width=async()=>Math.round((await page.locator('.editor-panel').boundingBox()).width);
  const drag=async delta=>{const box=await page.locator('#editor-resizer').boundingBox();await page.mouse.move(box.x+box.width/2,box.y+180);await page.mouse.down();await page.mouse.move(box.x+box.width/2-delta,box.y+180,{steps:12});await page.mouse.up();};
  assert.equal(await width(),440);await drag(160);await page.waitForTimeout(80);assert.equal(await width(),600);
  await page.click('[data-tab="inspect"]');assert.equal(await width(),600);await drag(-60);assert.equal(await width(),540);
  await page.reload();await page.waitForSelector('#editor-resizer');assert.equal(await width(),540);
  await page.locator('#editor-resizer').focus();await page.keyboard.press('ArrowLeft');assert.equal(await width(),560);
  await page.keyboard.press('Home');assert.equal(await width(),300);await page.keyboard.press('End');
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1120,760));await page.waitForTimeout(100);
  const layout=await page.evaluate(()=>({scroll:document.querySelector('.app-shell').scrollWidth,width:document.querySelector('.app-shell').clientWidth,workbench:document.querySelector('.workbench').getBoundingClientRect().width,editor:document.querySelector('.editor-panel').getBoundingClientRect().width,run:document.querySelector('#run').getBoundingClientRect().right,edge:document.querySelector('.workbench').getBoundingClientRect().right}));
  assert.ok(layout.scroll<=layout.width+1);assert.ok(layout.workbench>=470);assert.ok(layout.editor>=300);assert.ok(layout.run<=layout.edge,'run controls remain accessible at minimum workspace width');
  await page.screenshot({path:path.join(out,'13-editor-min-window.png')});
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1540,1020));await page.waitForTimeout(100);await page.locator('#editor-resizer').dblclick();assert.equal(await width(),440);await drag(200);await page.screenshot({path:path.join(out,'14-resizable-editor.png')});
  await page.click('#pinout-open');await page.check('[data-peripheral="USART2"]');
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
  await page.click('#firmware-check');assert.match(await page.locator('#firmware-status').textContent(),/통과/);await page.click('#run');await page.waitForTimeout(100);assert.equal(await page.locator('#run-status').textContent(),'실행 중');await page.click('#run');
  assert.deepEqual(await page.locator('#serial-target option').evaluateAll(nodes=>nodes.map(n=>n.value)),['Serial','USART1','USART3','UART4','UART5','USART6']);
  await page.reload();await page.waitForSelector('#pinout-open');await page.click('#pinout-open');assert.equal(await route('USART1','TX').inputValue(),'PB6');assert.equal(await route('UART4','RX').inputValue(),'PA1');await page.click('#pinout-close');
  await page.selectOption('#hal-example','uart');if(await page.locator('#replace-dialog').isVisible())await page.click('#replace-confirm');assert.equal(await page.locator('#serial-target').inputValue(),'USART2');
  assert.deepEqual(errors,[]);await fs.writeFile(path.join(out,'layout-serial-smoke.json'),JSON.stringify({passed:true,checks:['pointer resize across code/properties','keyboard and persisted width','minimum window bounds','default width reset','actual TX/RX choices','automatic allocation','alternate routes and release','manual pin activation','atomic pin conflict rejection','all six port configuration','AF7/AF8 generation and execution','configuration persistence','UART monitor target'],errors},null,2));console.log('Layout and serial UI smoke passed.');
 }finally{await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
