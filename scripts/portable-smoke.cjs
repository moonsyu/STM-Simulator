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
   browser=await chromium.connectOverCDP('http://127.0.0.1:'+port);page=browser.contexts()[0].pages()[0];await page.waitForSelector('.pin-hit');
   assert.equal(await page.locator('.hole').count(),400);assert.equal(await page.locator('[data-add]').count(),13);assert.equal(await page.locator('[data-color]').count(),10);await page.locator('#pin-search').fill('PC 13');assert.equal(await page.locator('#pin-results button').count(),1);await page.locator('#pin-results button').click();assert.equal(await page.locator('#search-layer [data-selected="true"]').count(),1);await page.locator('#pin-search').fill('');await page.click('#zoom-reset');await page.click('#run');await sleep(100);assert.ok(Number.parseFloat(await page.locator('#sim-current').innerText())>3);assert.match(await page.locator('#run-status').innerText(),/실행 중/);
   await page.screenshot({path:path.join(out,'portable-app.png')});
   await page.click('#run');await page.selectOption('#extra-example','ultrasonic');await page.click('#run');await sleep(150);assert.match(await page.locator('#console-output').innerText(),/100/);assert.match(await page.locator('#run-status').innerText(),/실행 중/);
   await fs.writeFile(path.join(out,'portable-smoke.json'),JSON.stringify({passed:true,exe,url:page.url(),checks:['portable extraction and launch','400 interactive breadboard holes','13 part types','selected search pin','LED simulation runs','HC-SR04 example runs']},null,2));
   console.log('Portable EXE passed: extraction, launch, 400 holes, LED simulation.');
 }finally{
   if(page)await page.evaluate(()=>window.close()).catch(()=>{});
   if(browser)await browser.close().catch(()=>{});
   await sleep(1500);if(child.exitCode===null)child.kill();
 }
})().catch(e=>{console.error(e);process.exit(1);});
