const {revealUiControl,clickUiControl}=require('./workbench-ui-actions.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),{_electron}=require('playwright');
const {openFixture,newProject}=require('./smoke-fixture.cjs');
async function exercise(page,{out}){
 const {blankProject}=await import('../src/project.js'),{cFunctions}=await import('../src/c-source-edit.js'),{boardPin}=await import('../src/pins.js');
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.waitForSelector('.monaco-editor');
 const read=async()=>{await page.waitForTimeout(250);return page.evaluate(()=>JSON.parse(localStorage.getItem('stm32lab.project.v2')));};
 await newProject(page);
 assert.equal(await page.locator('#endpoint-layer circle').count(),0);assert.equal(await page.locator('#circuit .board').isVisible(),false);assert.equal(await page.locator('[data-surface="breadboard"]').isVisible(),false);
 assert.equal(await page.locator('#surface > text').count(),0);assert.equal(await page.locator('#resize-target option').count(),0);
 await page.screenshot({path:path.join(out,'empty-workspace.png')});
 await page.fill('#part-search','stm32 f446re');await page.click('[data-add="board"]');await page.click('[data-add="board"]');
 assert.equal(await page.locator('[data-endpoint^="board:"]').count(),108);assert.equal((await read()).components.length,0);
 await clickUiControl(page, '#pinout-open');await page.selectOption('#pin-function','GPIO_Output');await page.click('#pinout-apply');const configured=(await read()).mcu;
 await page.fill('#part-search','빵판');await page.click('[data-add="breadboard"]');await page.click('[data-add="breadboard"]');
 let p=await read();assert.equal(p.components.filter(c=>c.type==='breadboard').length,2);assert.equal(await page.locator('#breadboard-layer .hole').count(),800);
 const first=p.components[0],hole='breadboard:'+first.id+':bb:a:8';
 await page.locator('#circuit').focus();await page.keyboard.press('w');await page.locator(`[data-endpoint="${boardPin('PA5')}"]`).click();await page.locator(`[data-endpoint="${hole}"]`).click();
 assert.equal((await read()).wires.length,1);await page.click('#tool-select');const hit=await page.locator('[data-wire] path').first().evaluate(path=>{const p=path.getPointAtLength(path.getTotalLength()*.5),q=new DOMPoint(p.x,p.y).matrixTransform(path.getScreenCTM());return {x:q.x,y:q.y};});await page.mouse.click(hit.x,hit.y);
 assert.equal(await page.locator('[data-color]').count(),20);assert.equal(await page.locator('[data-palette="pastel"]').count(),10);
 for(const swatch of await page.locator('[data-color]').all()){await revealUiControl(page,'#wire-palette');await swatch.click();assert.equal((await read()).wires[0].color,await swatch.getAttribute('data-color'));}
 await page.selectOption('#resize-target','surface:board');await page.locator('#circuit').focus();await page.keyboard.press('Delete');
 p=await read();assert.equal(p.surfaces.board.hidden,true);assert.equal(p.wires.length,0);assert.deepEqual(p.mcu,configured);
 await page.click('#undo');assert.equal((await read()).wires.length,1);assert.equal(await page.locator('[data-endpoint^="board:"]').count(),108);
 await page.reload();await page.waitForSelector('.monaco-editor');assert.equal((await read()).components.length,2);
 const doc=blankProject();doc.components=[{id:'selected',type:'lcd',name:'LCD',x:790,y:350,rotation:0}];await openFixture(page,doc);
 await page.selectOption('#resize-target','part:selected');await page.click('[data-tab="docs"]');
 assert.equal(cFunctions(await page.locator('#docs-full-source').textContent()).length,0);await page.click('#docs-apply-all');
 await page.waitForFunction(()=>document.getElementById('docs-result').textContent.includes('적용 완료'));
 p=await read();assert.deepEqual(cFunctions(p.code).map(f=>f.name),cFunctions(doc.code).map(f=>f.name));assert.deepEqual(p.firmware.files,[]);assert.equal(p.surfaces.board.hidden,false);
 await page.click('#run');await page.waitForTimeout(300);assert.equal(await page.locator('#run-status').textContent(),'실행 중');await page.click('#run');
 await page.click('#zoom-reset');await page.screenshot({path:path.join(out,'inline-docs-workspace.png')});
 await (await revealUiControl(page, '#pin-search')).fill('PA5');await page.locator('[data-search-pin]').first().click();await newProject(page);assert.equal(await page.locator('#endpoint-layer circle').count(),0);
 assert.deepEqual(errors,[]);const proof={passed:true,checks:['Empty physical canvas and no default labels','Search adds only one MCU and multiple isolated breadboards','Existing Pinout behavior preserved','20 selectable wire colors','Board removal, undo and reload','Docs adds statements in main and updates existing initializers without new functions/files','LCD example runs'],errors};
 await fs.writeFile(path.join(out,'empty-workspace-ui.json'),JSON.stringify(proof,null,2));return proof;
}
module.exports={exercise};
if(require.main===module)(async()=>{const root=path.resolve(__dirname,'..'),out=path.join(root,'work/test-results');await fs.mkdir(out,{recursive:true});const profile=await fs.mkdtemp(path.join(out,'empty-workspace-')),env={...process.env,CIRCUIT_LAB_SMOKE:'1',CIRCUIT_LAB_TEST_PROFILE:profile};delete env.ELECTRON_RUN_AS_NODE;const app=await _electron.launch({executablePath:path.join(root,'node_modules/electron/dist/electron.exe'),args:[root],cwd:root,env});try{const page=await app.firstWindow();page.setDefaultTimeout(15000);await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];w.setContentSize(1540,1020);w.showInactive();});await exercise(page,{out});console.log('Empty canvas, single board, breadboards, 20 colors and inline Docs passed.');}finally{await app.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
