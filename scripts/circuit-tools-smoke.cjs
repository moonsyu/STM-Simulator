const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {_electron}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {openFixture,chooseHal}=require('./smoke-fixture.cjs');
(async()=>{
 const root=path.resolve(__dirname,'..'),out=path.join(root,'test-results');await fs.mkdir(out,{recursive:true});
 const env={...process.env,CIRCUIT_LAB_SMOKE:'1',CIRCUIT_LAB_TEST_PROFILE:path.join(out,'circuit-tools-profile-'+Date.now())};delete env.ELECTRON_RUN_AS_NODE;
 const app=await _electron.launch({executablePath:process.env.LAB_EXE||path.join(root,'node_modules/electron/dist/electron.exe'),args:process.env.LAB_EXE?[]:[root],cwd:root,env});
 try{
  const page=await app.firstWindow(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.waitForSelector('#hal-example');await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].showInactive());
  const {halExample}=await import('../src/hal-examples.js'),{blankProject,validateProject}=await import('../src/project.js'),{boardPin}=await import('../src/pins.js');
  const saved=async()=>{await page.waitForTimeout(300);return page.evaluate(()=>JSON.parse(localStorage.getItem('stm32lab.project.v2')));};
  await chooseHal(page,'blink');
  await page.locator('[data-wire="w1"] .wire-hit').dispatchEvent('pointerdown',{button:0,pointerId:1});
  assert.ok(await page.locator('#net-layer [data-net-endpoint]').count()>5);
  const rect=await page.locator('#circuit').boundingBox();await page.locator('[data-wire="w1"] .wire-hit').dispatchEvent('dblclick',{clientX:rect.x+rect.width*.5,clientY:rect.y+rect.height*.35});
  assert.equal(await page.locator('[data-wire-point]').count(),3);const routed=await saved();assert.equal(routed.wires[0].points.length,3);
  // Pointer movement is dispatched through the real captured drag, independent of physical mouse drift.
  const handle=page.locator('[data-wire-point="1"]'),box=await handle.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();
  await page.locator('#circuit').dispatchEvent('pointermove',{clientX:box.x+box.width/2+35,clientY:box.y+box.height/2+20,pointerId:1});await page.locator('#circuit').dispatchEvent('pointerup',{pointerId:1});await page.mouse.up();
  const moved=await saved();assert.notDeepEqual(moved.wires[0].points,routed.wires[0].points);validateProject(moved);
  await page.click('#undo');assert.deepEqual((await saved()).wires[0].points,routed.wires[0].points);await page.click('#redo');assert.deepEqual((await saved()).wires[0].points,moved.wires[0].points);
  await openFixture(page,moved);await page.locator('[data-wire="w1"] .wire-hit').dispatchEvent('pointerdown',{button:0,pointerId:1});assert.equal(await page.locator('[data-wire-point]').count(),3);
  await page.locator('[data-wire-point="0"]').dispatchEvent('contextmenu');assert.equal((await saved()).wires[0].points.length,2);await page.click('#reset-wire-route');assert.equal((await saved()).wires[0].points,undefined);
  await chooseHal(page,'blink');
  for(const id of ['r1','led1'])await page.locator(`#part-layer [data-part="${id}"] .part-body`).dispatchEvent('pointerdown',{button:0,shiftKey:true,pointerId:1});
  assert.match(await page.locator('#inspector').textContent(),/부품 2개/);await page.keyboard.press('Control+c');await page.keyboard.press('Control+v');assert.equal((await saved()).components.length,4);await page.keyboard.press('Delete');assert.equal((await saved()).components.length,2);await page.click('#undo');assert.equal((await saved()).components.length,4);
  const short=blankProject();short.wires=[{id:'fault-wire',from:boardPin('3V3'),to:boardPin('GND'),color:'#dd654c'}];await openFixture(page,short);await page.click('[data-monitor="issues"]');assert.match(await page.locator('#circuit-issues').textContent(),/직접 연결/);await page.click('[data-issue="0"]');assert.ok(await page.locator('#net-layer path').count());await page.screenshot({path:path.join(out,'circuit-tools-diagnostics.png')});
  await chooseHal(page,'timer_capture');await page.click('[data-monitor="log"]');await page.locator('#code').focus();await page.keyboard.press('F5');await page.waitForFunction(()=>document.getElementById('console-output').textContent.includes('frequency=250 Hz'));assert.equal(await page.locator('#run-status').textContent(),'실행 중');await page.keyboard.press('F5');assert.equal(await page.locator('#run-status').textContent(),'준비됨');
  await page.keyboard.press('Control+F5');assert.equal(await page.locator('#run-status').textContent(),'준비됨');assert.equal(await page.locator('#run').getAttribute('aria-keyshortcuts'),'F5');
  await page.click('#pinout-open');assert.equal(await page.locator('[data-timer-mode="TIM4"]').inputValue(),'capture');assert.ok(await page.locator('[data-peripheral="TIM5"]').count());await page.keyboard.press('F5');assert.equal(await page.locator('#run-status').textContent(),'준비됨');await page.click('#pinout-close');
  const exportPath=path.join(out,'exported-main.c');await app.evaluate(({dialog},file)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:file});},exportPath);const source=await page.locator('#code').inputValue();await page.click('#main-export');await page.waitForFunction(()=>document.getElementById('console-output').textContent.includes('main.c를 저장했습니다.'));assert.equal(await fs.readFile(exportPath,'utf8'),source);
  await chooseHal(page,'timer_encoder');await page.click('#run');await page.locator('#part-layer [data-part="demo"] .part-body').click();await page.fill('#extra-position','3');await page.waitForFunction(()=>document.getElementById('console-output').textContent.includes('count=3 edges=12'));await page.click('#run');
  await chooseHal(page,'timer_multi');await page.click('#run');await page.waitForFunction(()=>document.getElementById('console-output').textContent.includes('TIM3 motor=75% (1000 Hz)'));await page.screenshot({path:path.join(out,'circuit-tools-timers.png')});await page.click('#run');
  assert.deepEqual(errors,[]);await fs.writeFile(path.join(out,'circuit-tools-smoke.json'),JSON.stringify({passed:true,checks:['wire waypoint add/drag/remove/reset','waypoint save/reload and undo/redo','connected net highlight','multi-selection copy/paste/delete','actionable short-circuit diagnosis','F5 in editor and modifier/modal guard','timer mode controls','real main.c export through IPC','wired input capture','hardware encoder direction/count','independent PWM timers'],errors},null,2));console.log('Circuit tools / main.c / expanded timers / F5 UI passed.');
 }finally{await app.close();}
})().catch(e=>{console.error(e);process.exit(1);});
