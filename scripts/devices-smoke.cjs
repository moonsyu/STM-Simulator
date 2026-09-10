const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {_electron}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {chooseHal}=require('./smoke-fixture.cjs');
(async()=>{
 const root=path.resolve(__dirname,'..'),out=path.join(root,'test-results');await fs.mkdir(out,{recursive:true});
 const env={...process.env,CIRCUIT_LAB_SMOKE:'1',CIRCUIT_LAB_TEST_PROFILE:path.join(out,'devices-profile-'+Date.now())};delete env.ELECTRON_RUN_AS_NODE;
 const app=await _electron.launch({executablePath:process.env.LAB_EXE||path.join(root,'node_modules/electron/dist/electron.exe'),args:process.env.LAB_EXE?[]:[root],cwd:root,env});
 try{
  const page=await app.firstWindow(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.waitForSelector('#hal-example');await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].showInactive());
  const {DEVICE_DEFS}=await import('../src/device-defs.js');
  const select=async()=>{await page.locator('#part-layer [data-part="demo"]').click({position:{x:35,y:25}});};
  const logs=()=>page.locator('#console-output').innerText();
  const expectLog=async text=>page.waitForFunction(text=>document.getElementById('console-output').textContent.includes(text),text,{timeout:30000});
  const begin=async kind=>{if((await page.locator('#run').textContent()).includes('정지'))await page.click('#run');await chooseHal(page,kind);assert.equal(await page.locator('dialog[open]').count(),0);await page.click('#clear-console');await page.click('#zoom-reset');await select();await page.click('#run');};
  const live=async(key,value)=>{const input=page.locator('#extra-'+key);if(await input.evaluate(x=>x.tagName==='SELECT'))await input.selectOption(String(value));else if(await input.getAttribute('type')==='range')await input.evaluate((x,v)=>{x.value=v;x.dispatchEvent(new Event('input',{bubbles:true}));x.dispatchEvent(new Event('change',{bubbles:true}));},String(value));else await input.fill(String(value));};
  for(const type of Object.keys(DEVICE_DEFS)){await page.fill('#part-search',type);assert.ok(await page.locator(`[data-add="${type}"]:visible`).count());await chooseHal(page,type);assert.ok(await page.locator('#part-layer [data-part="demo"]').count());await page.click('#firmware-check');assert.match(await page.locator('#firmware-status').innerText(),/통과/);}
  await page.fill('#part-search','');assert.equal(await page.locator('[data-add]:visible').count(),31);assert.equal(await page.locator('#hal-example option').count(),31);
  await begin('sht31');await expectLog('25.0 C RH=50.0');await live('temperature',40);await live('humidity',80);await expectLog('40.0 C RH=80.0');await page.screenshot({path:path.join(out,'devices-sht31.png')});
  await begin('ntc');await live('temperature',60);await expectLog('NTC=60.');
  await begin('mpu6050');await live('ax',-1);await live('gz',90);await expectLog('g=(-1.00,0.00,1.00) dps=(0.0,0.0,90.0)');
  await begin('pir');await live('motion',1);await expectLog('PIR EXTI motion=1');await live('motion',0);await expectLog('PIR EXTI motion=0');
  await begin('joystick');await live('axisX',25);await live('axisY',75);await live('switch',1);await expectLog('pressed=1');assert.match(await logs(),/X=102[34] Y=307[01] pressed=1/);
  await begin('encoder');await live('position',3);await expectLog('count=3 edges=12');await live('position',1);await expectLog('count=1 edges=4');await page.screenshot({path:path.join(out,'devices-encoder.png')});
  const pixel=async(x,y)=>page.locator('.device-screen').evaluate((c,{x,y})=>[...c.getContext('2d').getImageData(x,y,1,1).data],{x,y});
  await begin('oled');await expectLog('OLED frame=16');assert.notDeepEqual(await pixel(1,1),await pixel(100,20));await page.screenshot({path:path.join(out,'devices-oled.png')});
  await begin('tft');await expectLog('color bars sent');assert.deepEqual(await pixel(10,150),[255,0,0,255]);assert.deepEqual(await pixel(60,150),[0,255,0,255]);assert.deepEqual(await pixel(100,150),[0,0,255,255]);await page.screenshot({path:path.join(out,'devices-tft.png')});
  await begin('matrix');await expectLog('MAX7219 frame sent');assert.ok(await page.locator('.device-screen').evaluate(c=>{const p=c.getContext('2d').getImageData(0,0,8,8).data;return Array.from({length:64},(_,i)=>p[i*4]).filter(n=>n>150).length===8;}));await page.screenshot({path:path.join(out,'devices-matrix.png')});
  await begin('servo');await page.waitForFunction(()=>document.getElementById('part-live').textContent.includes('펄스 1000'),{timeout:30000});assert.match(await page.locator('.device-rotor').getAttribute('transform'),/rotate/);await page.screenshot({path:path.join(out,'devices-servo.png')});
  await begin('motor');await page.waitForFunction(()=>document.getElementById('part-live').textContent.includes('정회전'));await page.screenshot({path:path.join(out,'devices-motor.png')});
  await begin('stepper');await expectLog('Stepper command direction');assert.match(await page.locator('#part-live').innerText(),/스텝/);
  await begin('relay');await expectLog('Relay command=1');assert.equal(await page.locator('.relay-contact').getAttribute('d'),'M15 0L29 -13');assert.equal(await page.locator('[data-part="led1"] .led-lens').getAttribute('fill'),'#65c668');
  await page.click('#run');await chooseHal(page,'sht31');await select();await live('temperature',35);await live('humidity',65);await page.waitForTimeout(300);await page.reload();await page.waitForSelector('#code');await select();assert.equal(await page.locator('#extra-temperature').inputValue(),'35');assert.equal(await page.locator('#extra-humidity').inputValue(),'65');
  assert.deepEqual(errors,[]);await fs.writeFile(path.join(out,'devices-smoke.json'),JSON.stringify({passed:true,checks:['31 searchable parts','14 new HAL examples compile and install circuits immediately','live SHT31/NTC/MPU6050 measurements','PIR EXTI rising and falling','joystick ADC channels and switch','encoder timed quadrature and EXTI in both directions','OLED framebuffer rendering','TFT RGB565 exact canvas pixels','MAX7219 eight illuminated pixels','servo pulse and angle view','DC motor direction and speed view','stepper phase view','relay contact and load LED','environment properties survive reload'],errors},null,2));console.log('New device UI smoke passed.');
 }finally{await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
