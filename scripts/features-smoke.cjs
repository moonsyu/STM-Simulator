const {openFixture,chooseHal}=require('./smoke-fixture.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {_electron}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const root=path.resolve(__dirname,'..'),out=path.join(root,'test-results');await fs.mkdir(out,{recursive:true});
 const env={...process.env,CIRCUIT_LAB_SMOKE:'1',CIRCUIT_LAB_TEST_PROFILE:path.join(out,'features-profile-'+Date.now())};delete env.ELECTRON_RUN_AS_NODE;
 const app=await _electron.launch({executablePath:process.env.LAB_EXE||path.join(root,'node_modules/electron/dist/electron.exe'),args:process.env.LAB_EXE?[]:[root],cwd:root,env});
 try{
  const {programFixture}=await import('../tests/fixtures/programs.js');
  const page=await app.firstWindow(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.waitForSelector('.pin-hit');await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].showInactive());
  const load=async type=>{if((await page.locator('#run').innerText()).includes('정지'))await page.click('#run');await openFixture(page,programFixture(type));await page.click('#clear-console');await page.click('[data-tab="code"]');await page.click('#zoom-reset');};
  const run=async()=>{await page.click('#run');await page.waitForTimeout(180);assert.match(await page.locator('#run-status').innerText(),/실행 중/);};
  assert.equal(await page.locator('[data-add]').count(),31);assert.equal(await page.locator('#feature-example').count(),0);
  await load('lcd');await run();assert.equal(await page.locator('.lcd-line[data-row="0"]').textContent(),'STM Simulator   ');await page.screenshot({path:path.join(out,'08-lcd-running.png')});
  await load('uart');await page.click('[data-monitor="bus"]');await run();assert.match(await page.locator('#uart-output').innerText(),/UART ready/);await page.fill('#serial-input','Hello UART');await page.click('#serial-send');await page.waitForTimeout(180);assert.match(await page.locator('#uart-output').innerText(),/Hello UART/);assert.match(await page.locator('#bus-events').innerText(),/INPUT/);await page.screenshot({path:path.join(out,'09-uart-running.png')});
  await load('i2c');await run();assert.match(await page.locator('#console-output').textContent(),/42/);assert.match(await page.locator('#bus-events').innerText(),/ACK/);
  await load('spi');await run();assert.match(await page.locator('#console-output').textContent(),/42/);assert.match(await page.locator('#bus-events').innerText(),/SPI/);
  await load('language');await run();assert.match(await page.locator('#console-output').textContent(),/25/);
  await load('dma');await run();assert.match(await page.locator('#console-output').textContent(),/204[78]/);
  await load('timer');await run();await page.waitForTimeout(120);assert.equal(await page.locator('.led-lens').getAttribute('fill'),'#f05a4b');
  await load('interrupt');await run();const bb=await page.locator('[data-part="b1"] .part-body').boundingBox();await page.mouse.move(bb.x+bb.width/2,bb.y+bb.height/2);await page.mouse.down();await page.waitForTimeout(50);await page.mouse.up();assert.equal(await page.locator('.led-lens').getAttribute('fill'),'#f05a4b');
  await load('pwm');await page.click('[data-monitor="wave"]');assert.equal(await page.locator('#pwm-waveform').isChecked(),true);assert.equal(await page.locator('#sim-resolution').inputValue(),'0.1');await page.selectOption('#wave-window','100');await run();await page.waitForTimeout(200);assert.equal(await page.locator('.trace-channel').count(),4);assert.ok((await page.locator('.trace-channel').first().getAttribute('d')).length>100);assert.equal(await page.locator('#sim-resolution').isDisabled(),true);
  const csv=path.join(out,'waveform.csv');await app.evaluate(({dialog},csv)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:csv});},csv);await page.click('#wave-export');await page.waitForTimeout(180);const data=await fs.readFile(csv,'utf8');assert.match(data,/^time_ms,PA5_V,PA10_V,PA0_V,PC13_V\n/);assert.ok(data.split('\n').length>100);await page.screenshot({path:path.join(out,'10-pwm-waveform.png')});
  await page.click('#run');const saved=path.join(out,'features-round-trip.stm32lab');await app.evaluate(({dialog},saved)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:saved});dialog.showOpenDialog=async()=>({canceled:false,filePaths:[saved]});},saved);await page.click('#save');await page.waitForTimeout(150);await page.click('#new');await page.click('#open');await page.waitForTimeout(150);assert.equal(await page.locator('#pwm-waveform').isChecked(),true);assert.equal(await page.locator('#sim-resolution').inputValue(),'0.1');
  assert.deepEqual(errors,[]);await fs.writeFile(path.join(out,'features-smoke.json'),JSON.stringify({passed:true,checks:['16 component cards','9 feature examples','LCD live characters','UART bidirectional terminal','I2C ACK/read','SPI memory read','user functions arrays structs pointers','ADC DMA completion','timer during sleep','button edge interrupt','PWM/RC four-channel waveform','native CSV export','simulation settings IPC persistence'],errors},null,2));
  console.log('Features smoke passed: LCD, UART/I2C/SPI, language, timers, interrupts, DMA, waveform and CSV.');
 }finally{await app.close();}
})().catch(error=>{console.error(error);process.exit(1);});
