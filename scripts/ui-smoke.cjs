const {openFixture,chooseHal}=require('./smoke-fixture.cjs');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {_electron}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const root=path.resolve(__dirname,'..'),out=path.join(root,'test-results');await fs.mkdir(out,{recursive:true});
 const env={...process.env,CIRCUIT_LAB_SMOKE:'1',CIRCUIT_LAB_TEST_PROFILE:path.join(out,'profile-'+Date.now())};delete env.ELECTRON_RUN_AS_NODE;
 const app=await _electron.launch({executablePath:process.env.LAB_EXE||path.join(root,'node_modules/electron/dist/electron.exe'),args:process.env.LAB_EXE?[]:[root],cwd:root,env});
 try{
 const {circuitFixture}=await import('../tests/fixtures/circuits.js');
 const page=await app.firstWindow(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.waitForSelector('[data-endpoint="board:CN5:6"]');
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].showInactive());
 assert.equal(await page.locator('[data-example],#extra-example,#feature-example').count(),0);await openFixture(page,circuitFixture());
 assert.equal(await page.locator('.hole').count(),400);assert.equal(await page.locator('.pin-hit').count(),512);
 await page.screenshot({path:path.join(out,'01-workspace.png')});
 await page.click('#run');await page.waitForTimeout(100);
 assert.match(await page.locator('#run-status').innerText(),/실행 중/);
 const currents=[];for(let i=0;i<5;i++){currents.push(await page.locator('#sim-current').innerText());await page.waitForTimeout(230);}
 assert.ok(currents.some(s=>Number.parseFloat(s)>3));assert.ok(currents.some(s=>Number.parseFloat(s)<0.1));
 await page.screenshot({path:path.join(out,'02-running.png')});await page.click('#run');
 // Create and remove a wire using actual hit targets, then undo it.
 await page.locator('[data-endpoint="bb:a:25"]').click();await page.locator('[data-endpoint="bb:f:25"]').click();
 assert.match(await page.locator('#connection-count').innerText(),/배선 4개/);
 await page.click('#undo');assert.match(await page.locator('#connection-count').innerText(),/배선 3개/);
 await page.click('#redo');assert.match(await page.locator('#connection-count').innerText(),/배선 4개/);await page.click('#undo');
 // Place a new LED by selecting two breadboard holes.
 await page.locator('[data-add="led"]').click();await page.locator('[data-endpoint="bb:b:22"]').click();await page.locator('[data-endpoint="bb:b:24"]').click();
 assert.match(await page.locator('#connection-count').innerText(),/부품 3개/);await page.click('#remove-part');assert.match(await page.locator('#connection-count').innerText(),/부품 2개/);
 // Button example, including pointer capture and release during live re-render.
 await openFixture(page,circuitFixture('button'));if(await page.locator('#replace-dialog').isVisible())await page.click('#replace-confirm');
 await page.click('#run');await page.waitForTimeout(120);assert.ok(Number.parseFloat(await page.locator('#sim-current').innerText())<0.1);
 const bb=await page.locator('[data-part="b1"] .part-body').boundingBox();await page.mouse.move(bb.x+bb.width/2,bb.y+bb.height/2);await page.mouse.down();await page.waitForTimeout(150);assert.ok(Number.parseFloat(await page.locator('#sim-current').innerText())>3);await page.mouse.up();await page.waitForTimeout(100);assert.ok(Number.parseFloat(await page.locator('#sim-current').innerText())<0.1);await page.click('#run');
 // Real renderer uses the divider output in Serial.
 await openFixture(page,circuitFixture('divider'));await page.click('#run');await page.waitForTimeout(100);assert.match(await page.locator('#console-output').innerText(),/204[78]/);await page.click('#run');
 // Invalid code must stop without hanging the renderer.
 await page.locator('[data-tab="code"]').click();await page.locator('#code').fill('void loop() { while (true) { } }');await page.click('#run');await page.waitForTimeout(100);assert.match(await page.locator('#run-status').innerText(),/오류/);
 // Save and open via actual IPC handlers, substituting only native picker paths.
 const saved=path.join(out,'round-trip.stm32lab');
 await app.evaluate(({dialog},saved)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:saved});dialog.showOpenDialog=async()=>({canceled:false,filePaths:[saved]});},saved);
 await page.click('#save');await page.waitForTimeout(200);const data=JSON.parse(await fs.readFile(saved,'utf8'));assert.equal(data.format,'stm32-circuit-lab');
 await page.click('#new');await page.click('#open');await page.waitForTimeout(150);assert.equal(await page.locator('#project-name').inputValue(),data.name);
 // Return to the clean useful first example for the screenshot.
 await openFixture(page,circuitFixture('blink'));await page.locator('[data-tab="code"]').click();await page.click('#run');await page.waitForTimeout(100);
 await page.screenshot({path:path.join(out,'03-final-app.png')});await page.click('#run');
 assert.deepEqual(errors,[]);await fs.writeFile(path.join(out,'ui-smoke.json'),JSON.stringify({passed:true,checks:['400 holes','blink high/low','wire create undo redo','LED mount delete','button press release','ADC serial','busy loop stop','desktop save/open IPC'],errors},null,2));
 console.log('UI smoke passed: wiring, parts, simulation, button input, interpreter limits, desktop file save/open.');
 }finally{await app.close();}
})().catch(e=>{console.error(e);process.exit(1);});
