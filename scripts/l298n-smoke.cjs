const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {spawn}=require('node:child_process');
const {_electron,chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {chooseHal,openFixture}=require('./smoke-fixture.cjs');
(async()=>{
 const root=path.resolve(__dirname,'..'),out=path.join(root,'work','test-results'),profile=path.join(out,'l298n-profile-'+Date.now());
 await fs.mkdir(out,{recursive:true});
 const env={...process.env,CIRCUIT_LAB_SMOKE:'1',CIRCUIT_LAB_TEST_PROFILE:profile};delete env.ELECTRON_RUN_AS_NODE;
 let app,child,page;const portable=process.env.LAB_PORTABLE_EXE,renderer=portable?'portable':'electron';
 try{
  if(portable){
   delete env.CIRCUIT_LAB_SMOKE;child=spawn(portable,['--remote-debugging-port=0'],{cwd:root,env,windowsHide:true,stdio:'ignore'});
   let launchError;child.on('error',e=>launchError=e);let port;
   for(let i=0;i<160;i++){if(launchError)throw launchError;try{port=(await fs.readFile(path.join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0];break;}catch{await new Promise(r=>setTimeout(r,250));}}
   if(!port)throw Error('Portable application did not start.');app=await chromium.connectOverCDP('http://127.0.0.1:'+port);page=app.contexts()[0].pages()[0];
  }else{
   app=await _electron.launch({executablePath:path.join(root,'node_modules/electron/dist/electron.exe'),args:[root],cwd:root,env});page=await app.firstWindow();
   await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].showInactive());
  }
  const errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(20000);await page.waitForSelector('.monaco-editor');
  for(const [query,type]of [['L298N','l298n'],['DC 모터','dc_motor'],['외부 전원','dc_supply']]){
   await page.fill('#part-search',query);assert.equal(await page.locator(`[data-add="${type}"]:visible`).count(),1);
   await page.click(`[data-add="${type}"]`);
   const spot=await page.locator('#circuit').evaluate(svg=>{const pt=svg.createSVGPoint();pt.x=580;pt.y=160;const v=pt.matrixTransform(svg.getScreenCTM());return {x:v.x,y:v.y};});
   if(type!=='l298n')await page.mouse.click(spot.x,spot.y);assert.match(await page.locator('#inspect-panel h2').innerText(),new RegExp(type==='l298n'?'L298N':type==='dc_motor'?'DCM':'PSU'));
   await page.click('#undo');
  }
  await page.fill('#part-search','');await chooseHal(page,'l298n');
  assert.equal(await page.locator('#connection-count').innerText(),'부품 4개 · 배선 14개');assert.equal(await page.locator('[data-part="driver"] [data-endpoint]').count(),13);
  assert.equal(await page.locator('#pwm-waveform').isChecked(),true);await page.click('#firmware-check');assert.match(await page.locator('#firmware-status').innerText(),/통과/);
  await page.locator('[data-part="motorA"] .part-body').click();await page.click('#run');
  const log=text=>page.waitForFunction(text=>document.getElementById('console-output').textContent.includes(text),text,{timeout:45000});
  await log('A forward 75%');await page.waitForFunction(()=>document.getElementById('part-live').textContent.includes('정회전'));
  assert.equal(await page.locator('.l298-power').getAttribute('fill'),'#82eaa5');
  await page.screenshot({path:path.join(out,'l298n-'+renderer+'.png')});
  await log('A reverse 50%');await page.waitForFunction(()=>document.getElementById('part-live').textContent.includes('역회전'));
  await log('brake (EN HIGH');await log('coast (EN LOW)');await page.click('#run');
  await page.locator('[data-part="supply"] .part-body').click();await page.fill('#extra-voltage','9');await page.locator('#extra-voltage').blur();
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('stm32lab.project.v2')).components.find(p=>p.type==='dc_supply').voltage===9);
  await page.reload();await page.waitForSelector('[data-part="supply"]');await page.locator('[data-part="supply"] .part-body').click();assert.equal(await page.locator('#extra-voltage').inputValue(),'9');
  const {halExample}=await import('../src/hal-examples.js');const broken=halExample('l298n');broken.wires=broken.wires.filter(w=>w.id!=='l298-wire-3');
  await openFixture(page,broken);await page.locator('[data-part="driver"] .part-body').first().click();await page.click('#run');
  await log('A forward 75%');assert.equal(await page.locator('.l298-power').getAttribute('fill'),'#68443e');assert.match(await page.locator('#part-live').innerText(),/VM·5V·공통 GND/);
  await page.click('#run');assert.deepEqual(errors,[]);
  await fs.writeFile(path.join(out,'l298n-'+renderer+'-smoke.json'),JSON.stringify({passed:true,checks:['three searchable and placeable parts','13 distinct module terminals','HAL example circuit and firmware check','two-channel PWM with direction reversal, brake and coast','motor speed and driver power views','supply setting persists','missing logic supply disables driver'],errors},null,2));
  console.log('L298N '+renderer+' smoke passed.');
 }finally{
  if(portable&&page)await page.evaluate(()=>window.close()).catch(()=>{});
  if(app)await app.close().catch(()=>{});
  if(child&&child.exitCode===null){await new Promise(r=>setTimeout(r,1000));if(child.exitCode===null)child.kill();}
  // Only this test's generated profile, resolved under work/test-results.
  if(path.dirname(path.resolve(profile))!==path.resolve(out))throw Error('Unexpected test profile path');
  await fs.rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200});
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
