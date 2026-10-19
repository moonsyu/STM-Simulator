const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),{_electron}=require('playwright');
const {openFixture,fillCode}=require('./smoke-fixture.cjs');
async function exercise(page,profile){
 const {blankProject}=await import('../src/project.js'),{boardPin}=await import('../src/pins.js'),{createHash}=require('node:crypto');
 const p=blankProject();p.components=[{id:'bb',type:'breadboard',name:'BB1',x:803,y:337,rotation:0},{id:'led',type:'led',name:'LED1',x:750,y:357,rotation:90,span:70,color:'red',attachB:'breadboard:bb:bb:d:19'}];
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.waitForSelector('.monaco-editor');await openFixture(page,p);
 const events=async()=>{try{return (await fs.readFile(path.join(profile,'diagnostics/events.jsonl'),'utf8')).trim().split('\n').map(JSON.parse);}catch{return [];}};
 const until=async predicate=>{for(let i=0;i<100;i++){const rows=await events();if(predicate(rows))return rows;await page.waitForTimeout(100);}throw new Error('Expected diagnostic event was not recorded');};
 async function apply(){await page.selectOption('#resize-target','part:led');await page.click('[data-tab="docs"]');const card=page.locator('.docs-function').filter({has:page.locator('[data-docs-apply="HAL_GPIO_WritePin"]')});await card.locator('summary').click();assert.match(await card.locator('pre').textContent(),/GPIO_PIN_SET/);await card.locator('button').click();await page.waitForFunction(()=>document.getElementById('docs-result').textContent.includes('적용 완료'));}
 await apply();const rows=await until(rows=>rows.some(e=>e.type==='docs.applied')),event=rows.find(e=>e.type==='docs.applied');
 const read=async()=>JSON.parse(await fs.readFile(path.join(profile,'diagnostics/latest-project.stm32lab'),'utf8'));
 let saved=await read();assert.match(saved.code,/HAL_GPIO_WritePin\(GPIOA, GPIO_PIN_5, GPIO_PIN_SET\)/);assert.equal(saved.mcu.pins.PA5.function,'GPIO_Output');assert.deepEqual(saved.firmware.files,p.firmware.files);
 assert.equal(event.projectSha256,createHash('sha256').update(JSON.stringify(saved)).digest('hex'));
 await page.click('#run');await until(rows=>rows.some(e=>e.type==='simulation.state'&&e.detail.parts.led?.on===true));await page.click('#run');
 const ground=saved.wires.find(w=>w.from===boardPin('GND')||w.to===boardPin('GND'));assert.ok(ground);
 saved.wires=saved.wires.filter(w=>w.id!==ground.id);await openFixture(page,saved);await apply();await until(rows=>rows.filter(e=>e.type==='docs.applied').length===2);
 const repaired=await read();assert.ok(repaired.wires.length>saved.wires.length);assert.ok((await events()).filter(e=>e.type==='docs.applied').at(-1).detail.report.addedWires>=1);assert.ok(repaired.wires.every(w=>!w.from.startsWith('part:')&&!w.to.startsWith('part:')));
 await page.click('[data-tab="code"]');await fillCode(page,repaired.code.replace(/GPIO_PIN_5, GPIO_PIN_SET/g,'GPIO_PIN_5, GPIO_PIN_RESET'));
 await page.waitForTimeout(300);const before=(await events()).length;await page.click('#run');await until(rows=>rows.slice(before).some(e=>e.type==='simulation.state'&&e.detail.parts.led?.on===false));await page.click('#run');
 assert.deepEqual(errors,[]);return {passed:true,checks:['WritePin card inserts SET directly in main','Persisted Docs event matches circuit hash','Runtime log proves LED is on','Missing GND repaired on reapply','RESET turns LED off','No new files or user profile changes'],errors};
}
module.exports={exercise};
if(require.main===module)(async()=>{const root=path.resolve(__dirname,'..'),out=path.join(root,'work/test-results');await fs.mkdir(out,{recursive:true});const profile=await fs.mkdtemp(path.join(out,'docs-writepin-')),env={...process.env,CIRCUIT_LAB_SMOKE:'1',CIRCUIT_LAB_TEST_PROFILE:profile};delete env.ELECTRON_RUN_AS_NODE;const app=await _electron.launch({executablePath:process.env.LAB_EXE||path.join(root,'node_modules/electron/dist/electron.exe'),args:process.env.LAB_EXE?[]:[root],cwd:root,env});try{const page=await app.firstWindow();page.setDefaultTimeout(15000);const proof=await exercise(page,profile);await fs.writeFile(path.join(out,'docs-writepin-check.json'),JSON.stringify({...proof,profile},null,2));console.log(JSON.stringify(proof));}finally{await app.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
