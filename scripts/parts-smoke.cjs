const {openFixture}=require('./smoke-fixture.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {_electron}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const root=path.resolve(__dirname,'..'),out=path.join(root,'test-results');await fs.mkdir(out,{recursive:true});
 const env={...process.env,CIRCUIT_LAB_SMOKE:'1',CIRCUIT_LAB_TEST_PROFILE:path.join(out,'parts-profile-'+Date.now())};delete env.ELECTRON_RUN_AS_NODE;
 const app=await _electron.launch({executablePath:process.env.LAB_EXE||path.join(root,'node_modules/electron/dist/electron.exe'),args:process.env.LAB_EXE?[]:[root],cwd:root,env});
 try{
 const {deviceFixture}=await import('../tests/fixtures/devices.js');
 const page=await app.firstWindow(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.waitForSelector('.pin-hit');await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].showInactive());
 const snapshot=async()=>{await page.waitForTimeout(230);return page.evaluate(()=>JSON.parse(localStorage.getItem('stm32lab.project.v2')));};
 const clickXY=async(x,y)=>{const p=await page.evaluate(({x,y})=>{const svg=document.getElementById('circuit'),q=svg.createSVGPoint();q.x=x;q.y=y;const r=q.matrixTransform(svg.getScreenCTM());return {x:r.x,y:r.y};},{x,y});await page.mouse.click(p.x,p.y);};
 const load=async type=>{await openFixture(page,deviceFixture(type));await page.click('#zoom-reset');};
 const selectDemo=async()=>{const p=(await snapshot()).components[0];await clickXY(p.x,p.y);};
 const setRange=async(id,n)=>{await page.locator(id).focus();await page.keyboard.press('Home');for(let i=0;i<n;i++)await page.keyboard.press('ArrowRight');};
 const visibleParts=()=>page.locator('#part-list [data-add]:visible').evaluateAll(buttons=>buttons.map(button=>button.dataset.add));
 assert.equal(await page.locator('[data-add]').count(),31);assert.equal(await page.locator('#extra-example,#extra-parts').count(),0);assert.equal((await visibleParts()).length,31);assert.equal(await page.locator('#part-count').textContent(),'31 / 31');
 // Only the part list scrolls; the search and pin configuration remain reachable.
 const scrollState=()=>page.locator('#part-list').evaluate(list=>({top:list.scrollTop,height:list.clientHeight,content:list.scrollHeight,overflow:getComputedStyle(list).overflowY}));
 let scrolling=await scrollState();assert.ok(scrolling.content>scrolling.height);assert.equal(scrolling.overflow,'auto');
 const searchBefore=await page.locator('#part-search').boundingBox(),pinoutBefore=await page.locator('#pinout-open').boundingBox();await page.locator('#part-list').hover();await page.mouse.wheel(0,900);await page.waitForTimeout(150);assert.ok((await scrollState()).top>0);assert.deepEqual(await page.locator('#part-search').boundingBox(),searchBefore);assert.deepEqual(await page.locator('#pinout-open').boundingBox(),pinoutBefore);
 for(const [query,expected] of [['저항',['resistor','ldr','potentiometer']],['ReSiStOr',['resistor','ldr','potentiometer']],['LeD',['led','oled','matrix','rgb']],['TMP36',['temperature']],['  HC-SR04  ',['ultrasonic']],['I2C',['sht31','mpu6050','oled','i2c']],['16핀',['lcd']],['공통 음극',['rgb','sevenseg']]]){
   await page.fill('#part-search',query);assert.deepEqual(await visibleParts(),expected,query);assert.equal((await scrollState()).top,0);
 }
 await page.fill('#part-search','없는 부품 xyz');assert.deepEqual(await visibleParts(),[]);assert.equal(await page.locator('#part-no-results').isVisible(),true);assert.equal(await page.locator('#part-count').textContent(),'0 / 31');
 await page.fill('#part-search','  ');assert.equal((await visibleParts()).length,31);assert.equal(await page.locator('#part-no-results').isVisible(),false);await page.fill('#part-search','');
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1120,760));await page.waitForTimeout(80);const compact=await page.evaluate(()=>({viewport:innerHeight,list:document.getElementById('part-list').getBoundingClientRect().height,help:document.getElementById('help').getBoundingClientRect().bottom,library:document.querySelector('.library').scrollTop}));assert.ok(compact.list>=92);assert.ok(compact.help<=compact.viewport);assert.equal(compact.library,0);await page.screenshot({path:path.join(out,'parts-search-compact.png')});await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1540,1020));
 // Selected physical header pin is distinct even when both match the same GPIO.
 await page.fill('#pin-search','PA 8');await page.click('[data-search-pin="board:CN10:23"]');
 assert.equal(await page.locator('#search-layer [data-selected="true"]').getAttribute('data-search-highlight'),'board:CN10:23');
 assert.equal(await page.locator('#pin-results [aria-pressed="true"]').getAttribute('data-search-pin'),'board:CN10:23');
 await page.click('[data-search-pin="board:CN9:8"]');assert.equal(await page.locator('#search-layer [data-selected="true"]').count(),1);assert.equal(await page.locator('#search-layer [data-selected="true"]').getAttribute('data-search-highlight'),'board:CN9:8');
 assert.match(await page.locator('#search-layer [data-selected="true"] text').textContent(),/CN9-8 · PA8/);
 await page.screenshot({path:path.join(out,'05-selected-pin.png')});await page.fill('#pin-search','PC13');assert.equal(await page.locator('#search-layer [data-selected="true"]').count(),0);await page.locator('#pin-search').press('Escape');
 // Add each new model through its library card and persist it in one project.
 await page.click('#new');const types=['potentiometer','slide','rgb','capacitor','diode','buzzer','sevenseg','temperature','ultrasonic'];
 for(let i=0;i<types.length;i++){const type=types[i];await page.fill('#part-search',type);await page.click(`[data-add="${type}"]`);if(['capacitor','diode','buzzer'].includes(type))await clickXY(530,200+i*35);assert.equal((await snapshot()).components.at(-1).type,type);}await page.fill('#part-search','');
 const saved=path.join(out,'nine-parts.stm32lab');await app.evaluate(({dialog},saved)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:saved});dialog.showOpenDialog=async()=>({canceled:false,filePaths:[saved]});},saved);
 await page.click('#save');await page.waitForTimeout(200);const persisted=JSON.parse(await fs.readFile(saved,'utf8'));assert.equal(persisted.components.length,9);await page.click('#new');await page.click('#open');assert.deepEqual(await snapshot(),persisted);
 // Live potentiometer change persists through keyboard interaction and changes ADC result.
 await load('potentiometer');await selectDemo();await page.click('#run');await page.waitForTimeout(80);assert.match(await page.locator('#console-output').innerText(),/204[78]/);await page.fill('#part-search','uart');assert.equal(await page.locator('[data-add="uart"]').isVisible(),true);assert.equal(await page.locator('[data-add="uart"]').isDisabled(),true);await page.fill('#part-search','');assert.equal(await page.locator('[data-add]:disabled').count(),31);
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
 assert.deepEqual(errors,[]);await fs.writeFile(path.join(out,'parts-smoke.json'),JSON.stringify({passed:true,checks:['all 31 parts shown for empty search','Korean/English/type/hint search and empty results','independent vertical part list scrolling','search and configuration reachable at minimum window size','adding filtered parts','running state disables all add buttons','selected physical pin and list highlight','all 9 part cards and IPC persistence','live potentiometer ADC','latched switch GPIO','RGB mixed colors','8 display segments','RC simulation','diode current','buzzer visual and WebAudio graph','TMP36 temperature output','HC-SR04 trigger and pulseIn distance'],errors},null,2));
 console.log('Parts smoke passed: searchable scroll list, selected pin, all nine parts, live controls, WebAudio and file persistence.');
 }finally{await app.close();}
})().catch(e=>{console.error(e);process.exit(1);});
