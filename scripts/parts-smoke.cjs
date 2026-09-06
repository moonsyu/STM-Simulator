const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {_electron}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const root=path.resolve(__dirname,'..'),out=path.join(root,'test-results');await fs.mkdir(out,{recursive:true});
 const env={...process.env,CIRCUIT_LAB_SMOKE:'1',CIRCUIT_LAB_TEST_PROFILE:path.join(out,'parts-profile-'+Date.now())};delete env.ELECTRON_RUN_AS_NODE;
 const app=await _electron.launch({executablePath:process.env.LAB_EXE||path.join(root,'node_modules/electron/dist/electron.exe'),args:process.env.LAB_EXE?[]:[root],cwd:root,env});
 try{
 const page=await app.firstWindow(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.waitForSelector('.pin-hit');await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].showInactive());
 const snapshot=async()=>{await page.waitForTimeout(230);return page.evaluate(()=>JSON.parse(localStorage.getItem('stm32lab.project.v2')));};
 const clickXY=async(x,y)=>{const p=await page.evaluate(({x,y})=>{const svg=document.getElementById('circuit'),q=svg.createSVGPoint();q.x=x;q.y=y;const r=q.matrixTransform(svg.getScreenCTM());return {x:r.x,y:r.y};},{x,y});await page.mouse.click(p.x,p.y);};
 const load=async type=>{await page.selectOption('#extra-example',type);if(await page.locator('#replace-dialog').isVisible())await page.click('#replace-confirm');await page.click('#zoom-reset');};
 const selectDemo=async()=>{const p=(await snapshot()).components[0];await clickXY(p.x,p.y);};
 const setRange=async(id,n)=>{await page.locator(id).focus();await page.keyboard.press('Home');for(let i=0;i<n;i++)await page.keyboard.press('ArrowRight');};
 assert.equal(await page.locator('[data-add]').count(),16);assert.equal(await page.locator('#extra-example option').count(),13);
 // Selected physical header pin is distinct even when both match the same GPIO.
 await page.fill('#pin-search','PA 8');await page.click('[data-search-pin="board:CN10:23"]');
 assert.equal(await page.locator('#search-layer [data-selected="true"]').getAttribute('data-search-highlight'),'board:CN10:23');
 assert.equal(await page.locator('#pin-results [aria-pressed="true"]').getAttribute('data-search-pin'),'board:CN10:23');
 await page.click('[data-search-pin="board:CN9:8"]');assert.equal(await page.locator('#search-layer [data-selected="true"]').count(),1);assert.equal(await page.locator('#search-layer [data-selected="true"]').getAttribute('data-search-highlight'),'board:CN9:8');
 assert.match(await page.locator('#search-layer [data-selected="true"] text').textContent(),/CN9-8 · PA8/);
 await page.screenshot({path:path.join(out,'05-selected-pin.png')});await page.fill('#pin-search','PC13');assert.equal(await page.locator('#search-layer [data-selected="true"]').count(),0);await page.locator('#pin-search').press('Escape');
 // Add each new model through its library card and persist it in one project.
 await page.click('#new');const types=['potentiometer','slide','rgb','capacitor','diode','buzzer','sevenseg','temperature','ultrasonic'];
 for(let i=0;i<types.length;i++){const type=types[i];await page.click(`[data-add="${type}"]`);if(['capacitor','diode','buzzer'].includes(type))await clickXY(530,200+i*35);assert.equal((await snapshot()).components.at(-1).type,type);}
 const saved=path.join(out,'nine-parts.stm32lab');await app.evaluate(({dialog},saved)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:saved});dialog.showOpenDialog=async()=>({canceled:false,filePaths:[saved]});},saved);
 await page.click('#save');await page.waitForTimeout(200);const persisted=JSON.parse(await fs.readFile(saved,'utf8'));assert.equal(persisted.components.length,9);await page.click('#new');await page.click('#open');assert.deepEqual(await snapshot(),persisted);
 // Live potentiometer change persists through keyboard interaction and changes ADC result.
 await load('potentiometer');await selectDemo();await page.click('#run');await page.waitForTimeout(80);assert.match(await page.locator('#console-output').innerText(),/204[78]/);
 await setRange('#extra-position',25);assert.equal(await page.locator('#extra-position').inputValue(),'25');await page.waitForTimeout(240);assert.match(await page.locator('#part-live').innerText(),/0.825 V/);assert.equal((await snapshot()).components[0].position,25);await page.click('#run');
 await load('slide');await page.click('#run');await selectDemo();await page.waitForTimeout(80);assert.equal((await snapshot()).components[0].position,1);assert.equal(await page.locator('#builtin-led').getAttribute('fill'),'#64e66b');await page.click('#run');
 await load('rgb');await page.click('#run');const colors=new Set();for(let i=0;i<10;i++){colors.add(await page.locator('.rgb-lens').getAttribute('fill'));await page.waitForTimeout(220);}assert.ok(colors.size>=4);await page.screenshot({path:path.join(out,'06-rgb-running.png')});await page.click('#run');
 await load('sevenseg');await page.click('#run');await page.waitForTimeout(80);assert.equal(await page.locator('[data-segment][fill="#ff594b"]').count(),8);await page.click('#run');
 await load('capacitor');await selectDemo();await page.click('#run');await page.waitForTimeout(300);assert.ok(Number.parseFloat(await page.locator('#sim-current').innerText())>.01);assert.match(await page.locator('#run-status').innerText(),/실행 중/);await page.click('#run');
 await load('diode');await page.click('#run');await page.waitForTimeout(100);assert.ok(Number.parseFloat(await page.locator('#sim-current').innerText())>6);await page.click('#run');
 await load('buzzer');await page.click('#run');await page.waitForTimeout(100);assert.equal(await page.locator('.buzzer-wave').getAttribute('opacity'),'1');
 const cdp=await page.context().newCDPSession(page);await cdp.send('WebAudio.enable');const contexts=[];cdp.on('WebAudio.contextCreated',e=>contexts.push(e.context));await page.click('#sound');await page.waitForTimeout(80);assert.equal(await page.locator('#sound').getAttribute('aria-pressed'),'true');assert.ok(contexts.length>0);await page.click('#sound');await page.click('#run');await cdp.detach();
 await load('temperature');await selectDemo();await page.click('#run');await setRange('#extra-temperature',90); // -40 + 90 = 50°C.
 await page.waitForTimeout(240);assert.match(await page.locator('#part-live').innerText(),/1.000 V/);assert.equal((await snapshot()).components[0].temperature,50);await page.click('#run');
 await load('ultrasonic');await selectDemo();await page.click('#run');await page.waitForTimeout(100);assert.match(await page.locator('#console-output').innerText(),/100/);await setRange('#extra-distance',148);await page.waitForTimeout(240);assert.match(await page.locator('#console-output').innerText(),/150/);assert.equal((await snapshot()).components[0].distance,150);await page.screenshot({path:path.join(out,'07-ultrasonic-running.png')});await page.click('#run');
 assert.deepEqual(errors,[]);await fs.writeFile(path.join(out,'parts-smoke.json'),JSON.stringify({passed:true,checks:['selected physical pin and list highlight','all 9 part cards and IPC persistence','live potentiometer ADC','latched switch GPIO','RGB mixed colors','8 display segments','RC simulation','diode current','buzzer visual and WebAudio graph','TMP36 temperature output','HC-SR04 trigger and pulseIn distance'],errors},null,2));
 console.log('Parts smoke passed: selected pin, all nine parts, live controls, circuit examples, WebAudio and file persistence.');
 }finally{await app.close();}
})().catch(e=>{console.error(e);process.exit(1);});
