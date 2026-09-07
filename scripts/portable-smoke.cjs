const {spawn}=require('node:child_process');
const fs=require('node:fs/promises');
const path=require('node:path');
const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const root=path.resolve(__dirname,'..'),out=path.join(root,'test-results'),profile=path.join(out,'portable-profile-'+Date.now());await fs.mkdir(profile,{recursive:true});
 const env={...process.env,CIRCUIT_LAB_TEST_PROFILE:profile};delete env.ELECTRON_RUN_AS_NODE;delete env.CIRCUIT_LAB_SMOKE;
 const pkg=JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8'));
 const exe=path.join(root,'dist',pkg.build.portable.artifactName.replace('${version}',pkg.version));
 const child=spawn(exe,['--remote-debugging-port=0'],{cwd:root,env,windowsHide:true,stdio:'ignore'});let browser,page;
 try{
   let port;for(let i=0;i<160;i++){try{port=(await fs.readFile(path.join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0];break;}catch{await sleep(250);}}
   if(!port)throw new Error('Portable application did not expose its test port.');
   browser=await chromium.connectOverCDP('http://127.0.0.1:'+port);page=browser.contexts()[0].pages()[0];const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.waitForSelector('.pin-hit');
   assert.equal(await page.locator('.hole').count(),400);assert.equal(await page.locator('[data-add]').count(),16);assert.equal(await page.locator('[data-color]').count(),10);await page.locator('#pin-search').fill('PC 13');assert.equal(await page.locator('#pin-results button').count(),1);await page.locator('#pin-results button').click();assert.equal(await page.locator('#search-layer [data-selected="true"]').count(),1);await page.locator('#pin-search').fill('');await page.click('#zoom-reset');await page.click('#run');await sleep(100);assert.ok(Number.parseFloat(await page.locator('#sim-current').innerText())>3);assert.match(await page.locator('#run-status').innerText(),/실행 중/);
   await page.screenshot({path:path.join(out,'portable-app.png')});
   await page.click('#run');await page.selectOption('#extra-example','ultrasonic');await page.click('#run');await sleep(150);assert.match(await page.locator('#console-output').innerText(),/100/);assert.match(await page.locator('#run-status').innerText(),/실행 중/);
   const feature=async type=>{await page.click('#run');await page.selectOption('#feature-example',type);if(await page.locator('#replace-dialog').isVisible())await page.click('#replace-confirm');await page.click('#clear-console');await page.click('#run');await sleep(180);assert.match(await page.locator('#run-status').innerText(),/실행 중/);};
   await feature('lcd');assert.equal(await page.locator('.lcd-line[data-row="0"]').textContent(),'STM Emulator    ');
   await feature('uart');await page.click('[data-monitor="bus"]');await page.fill('#serial-input','Portable UART');await page.click('#serial-send');await sleep(180);assert.match(await page.locator('#uart-output').innerText(),/Portable UART/);
   for(const type of ['i2c','spi']){await feature(type);assert.match(await page.locator('#console-output').textContent(),/42/);}
   await feature('language');assert.match(await page.locator('#console-output').textContent(),/25/);
   await feature('dma');assert.match(await page.locator('#console-output').textContent(),/204[78]/);
   await feature('pwm');await page.click('[data-monitor="wave"]');await sleep(150);assert.equal(await page.locator('.trace-channel').count(),4);assert.ok((await page.locator('.trace-channel').first().getAttribute('d')).length>100);await page.screenshot({path:path.join(out,'portable-waveform.png')});assert.deepEqual(errors,[]);
   await page.click('#run');await page.selectOption('#hal-example','uart');if(await page.locator('#replace-dialog').isVisible())await page.click('#replace-confirm');await page.click('[data-monitor="bus"]');await page.click('#run');await sleep(120);await page.fill('#serial-input','Portable HAL');await page.click('#serial-send');await sleep(180);assert.match(await page.locator('#uart-output').textContent(),/Portable HAL/);assert.match(await page.locator('#run-status').textContent(),/실행 중/);await page.click('#run');await page.click('#pinout-open');assert.equal(await page.locator('[data-peripheral="USART2"]').isChecked(),true);await page.screenshot({path:path.join(out,'portable-hal-pinout.png')});await page.click('#pinout-close');assert.deepEqual(errors,[]);
   await fs.writeFile(path.join(out,'portable-smoke.json'),JSON.stringify({passed:true,exe,url:page.url(),checks:['portable extraction and launch','400 interactive breadboard holes','16 part types','selected search pin','LED simulation runs','HC-SR04 example runs','LCD live text','UART round trip','I2C/SPI memory read','language example','ADC DMA completion','four-channel PWM/RC waveform'],errors},null,2));
   console.log('Portable EXE passed: launch, editor, LED, HC-SR04, LCD, UART/I2C/SPI, language, DMA, PWM/RC, HAL UART interrupt and Pinout.');
 }finally{
   if(page)await page.evaluate(()=>window.close()).catch(()=>{});
   if(browser)await browser.close().catch(()=>{});
   await sleep(1500);if(child.exitCode===null)child.kill();
 }
})().catch(e=>{console.error(e);process.exit(1);});
