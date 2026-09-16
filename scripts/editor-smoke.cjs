const {openFixture,chooseHal,saveProject,openProject}=require('./smoke-fixture.cjs');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {_electron}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const root=path.resolve(__dirname,'..'),out=path.join(root,'work','test-results');await fs.mkdir(out,{recursive:true});
 const env={...process.env,CIRCUIT_LAB_SMOKE:'1',CIRCUIT_LAB_TEST_PROFILE:path.join(out,'editor-profile-'+Date.now())};delete env.ELECTRON_RUN_AS_NODE;
 const app=await _electron.launch({executablePath:process.env.LAB_EXE||path.join(root,'node_modules/electron/dist/electron.exe'),args:process.env.LAB_EXE?[]:[root],cwd:root,env});
 try{
 const {circuitFixture}=await import('../tests/fixtures/circuits.js');
 const page=await app.firstWindow(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.waitForSelector('.pin-hit');
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].showInactive());
 await openFixture(page,circuitFixture());
 const client=async(x,y)=>page.evaluate(({x,y})=>{const svg=document.getElementById('circuit'),p=svg.createSVGPoint();p.x=x;p.y=y;const q=p.matrixTransform(svg.getScreenCTM());return {x:q.x,y:q.y};},{x,y});
 const clickXY=async(x,y)=>{const p=await client(x,y);await page.mouse.click(p.x,p.y);};
 const snapshot=async()=>{await page.waitForTimeout(240);return page.evaluate(()=>JSON.parse(localStorage.getItem('stm32lab.project.v2')));};
 const lastPart=async()=>(await snapshot()).components.at(-1);
 const dragPart=async(id,x,y,expected)=>{
   const part=(await snapshot()).components.find(p=>p.id===id),a=await client(part.x,part.y),b=await client(x,y);
   await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:10});
   assert.equal(await page.locator('#preview-layer circle').count(),expected,'mount preview contacts');await page.mouse.up();
   assert.equal(Number(await page.locator(`[data-part="${id}"]`).getAttribute('data-mounted')),expected);
 };
 const aligned=async id=>page.evaluate(id=>{
   const p=JSON.parse(localStorage.getItem('stm32lab.project.v2')).components.find(p=>p.id===id),map=p.attachments||{a:p.attachA,b:p.attachB};
   return Object.entries(map).every(([key,hole])=>{const a=document.querySelector(`[data-endpoint="part:${id}:${key}"]`),b=document.querySelector(`[data-endpoint="${hole}"]`);return a.getAttribute('cx')===b.getAttribute('cx')&&a.getAttribute('cy')===b.getAttribute('cy');});
 },id);
 await page.click('#new');assert.equal(await page.locator('[data-part]').count(),0);
 assert.equal(await page.locator('[data-color]').count(),10);
 // Two-point placement; the body lies directly over c10 and must win hit testing.
 await page.click('[data-add="resistor"]');await page.click('[data-endpoint="bb:b:10"]');await page.click('[data-endpoint="bb:d:10"]');
 const resistor=await lastPart();assert.equal(resistor.span,28);assert.ok(await aligned(resistor.id));
 const hit=await client(746,254);assert.equal(await page.evaluate(p=>document.elementFromPoint(p.x,p.y).closest('[data-part]')?.dataset.part,hit),resistor.id);
 await clickXY(746,254);await page.keyboard.press('Escape');assert.equal(await page.locator('[data-part]').count(),0);await page.click('#undo');
 await clickXY(746,254);
 for(let i=1;i<=8;i++){await page.keyboard.press('r');assert.equal(Number(await page.locator(`[data-part="${resistor.id}"]`).getAttribute('data-rotation')),(i*45)%360);}
 await page.click('[data-add="led"]');await page.click('[data-endpoint="bb:h:18"]');await page.click('[data-endpoint="bb:h:22"]');const led=await lastPart();
 await dragPart(led.id,844.7,326.5,2);await snapshot();assert.ok(await aligned(led.id));
 // Pending-wire Escape cancels; selected-wire Escape deletes. All ten colors are persisted.
 await page.click('[data-endpoint="bb:a:25"]');await page.keyboard.press('Escape');assert.equal((await snapshot()).wires.length,0);
 await page.click('[data-endpoint="bb:a:25"]');await page.click('[data-endpoint="bb:f:25"]');
 const colors=await page.locator('[data-color]').evaluateAll(bs=>bs.map(b=>b.dataset.color));
 for(const color of colors){await clickXY(795,464);await page.locator(`[data-color="${color}"]`).click();assert.equal((await snapshot()).wires[0].color,color);}
 await clickXY(795,464);await page.keyboard.press('Escape');assert.equal((await snapshot()).wires.length,0);await page.click('#undo');assert.equal((await snapshot()).wires.length,1);
 // Multi-pin models exist immediately, drag all contacts into holes, then detach off-board.
 await page.click('[data-add="button"]');let button=await lastPart();assert.equal(button.type,'button');assert.equal(await page.locator(`[data-part="${button.id}"] .part-pin`).count(),4);
 await dragPart(button.id,795.6,394.4,4);await snapshot();assert.ok(await aligned(button.id));
 await dragPart(button.id,540,610,0);await page.keyboard.press('r');assert.equal(Number(await page.locator(`[data-part="${button.id}"]`).getAttribute('data-rotation')),45);
 await page.keyboard.press('r');await page.keyboard.press('r');await page.keyboard.press('r');await page.keyboard.press('r');await page.keyboard.press('r');await page.keyboard.press('r');await page.keyboard.press('r');
 await dragPart(button.id,795,394,4);
 await page.click('[data-add="lcd"]');const lcd=await lastPart();assert.equal(lcd.type,'lcd');assert.equal(await page.locator(`[data-part="${lcd.id}"] .part-pin`).count(),16);
 await page.keyboard.press('r');await page.click('#rotate');assert.equal(Number(await page.locator(`[data-part="${lcd.id}"]`).getAttribute('data-rotation')),90);
 await dragPart(lcd.id,918.7,303.7,16);await snapshot();assert.ok(await aligned(lcd.id));
 await page.click('[data-endpoint="part:'+lcd.id+':p1"]');await page.click('[data-endpoint="rail:R:-:25"]');assert.equal((await snapshot()).wires.length,2);
 // Verify persisted rotation, span and every multi-pin attachment through native IPC.
 const saved=path.join(out,'editor-round-trip.stm32lab');
 await app.evaluate(({dialog},saved)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:saved});dialog.showOpenDialog=async()=>({canceled:false,filePaths:[saved]});},saved);
 await saveProject(page);const before=JSON.parse(await fs.readFile(saved,'utf8'));assert.equal(before.version,2);
 await page.click('#new');await openProject(page);assert.deepEqual(await snapshot(),before);
 await page.locator('#pin-search').fill('pC 13');assert.equal(await page.locator('#pin-results button').count(),1);assert.equal(await page.locator('#search-layer g').count(),1);
 await page.locator('#pin-search').press('Enter');assert.match(await page.locator('#inspector').innerText(),/PC13/);assert.equal((await snapshot()).wires.length,2);
 await page.locator('#pin-search').fill('PA 8');assert.equal(await page.locator('#pin-results button').count(),2);assert.equal(await page.locator('#search-layer g').count(),2);
 await page.click('#zoom-reset');await page.screenshot({path:path.join(out,'04-editor-updates.png')});
 await page.locator('#pin-search').press('Escape');assert.equal(await page.locator('#search-layer g').count(),0);
 assert.deepEqual(errors,[]);
 await fs.writeFile(path.join(out,'editor-smoke.json'),JSON.stringify({passed:true,checks:['two-pin exact placement','body hit priority over covered hole','45-degree rotation and wrap','10 persisted wire colors','Escape cancel versus delete and undo','LED drag snap','4-pin button drag mount and detach','16-pin LCD rotation and drag mount','LCD terminal wiring','schema 2 IPC round trip','case/space-insensitive pin search and alias highlighting'],errors},null,2));
 console.log('Editor smoke passed: all seven requested changes, mounted contacts, file round trip, no renderer errors.');
 }finally{await app.close();}
})().catch(e=>{console.error(e);process.exit(1);});
