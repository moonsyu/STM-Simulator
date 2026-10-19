const {revealUiControl,clickUiControl}=require('./workbench-ui-actions.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {openFixture,fillCode}=require('./smoke-fixture.cjs');
async function exercise(page,{out,resizeWindow}){
 const {blankProject}=await import('../src/project.js'),{circuitFixture}=await import('../tests/fixtures/circuits.js'),{boardPin,endpointInfo}=await import('../src/pins.js'),{surfaceOrigin}=await import('../src/geometry.js');
 const errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(15000);await page.waitForSelector('.monaco-editor');
 const state=()=>page.evaluate(()=>({mode:document.documentElement.dataset.ideTheme,appearance:document.documentElement.dataset.appearance,code:document.documentElement.dataset.colorscheme,ui:getComputedStyle(document.documentElement).getPropertyValue('--ide-panel'),editor:getComputedStyle(document.querySelector('.monaco-editor')).backgroundColor}));
 const read=async()=>{await page.waitForTimeout(260);return page.evaluate(()=>JSON.parse(localStorage.getItem('stm32lab.project.v2')));};
 const screen=p=>page.locator('#circuit').evaluate((svg,p)=>{const q=new DOMPoint(p.x,p.y).matrixTransform(svg.getScreenCTM());return {x:q.x,y:q.y};},p);
 const floor=async(x,y,options)=>{const p=await screen({x,y});await page.mouse.click(p.x,p.y,options);};
 const drag=async(p,delta,cancel=false)=>{const a=await screen(p),b=await screen({x:p.x+delta.x,y:p.y+delta.y});await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:6});if(cancel)await page.keyboard.press('Escape');await page.mouse.up();};
 const close=(a,b)=>assert.ok(Math.abs(a-b)<1,`${a} != ${b}`);
 await page.emulateMedia({colorScheme:'dark'});await page.waitForFunction(()=>document.documentElement.dataset.ideTheme==='dark');
 assert.equal((await state()).appearance,'system');assert.equal((await state()).code,'jellybean');assert.equal((await state()).editor,'rgb(21, 21, 21)');
 await page.emulateMedia({colorScheme:'light'});await page.waitForFunction(()=>document.documentElement.dataset.ideTheme==='light');assert.equal((await state()).code,'github-light');assert.equal((await state()).editor,'rgb(255, 255, 255)');
 await page.click('#appearance-toggle');assert.equal((await state()).appearance,'dark');await page.emulateMedia({colorScheme:'dark'});await page.emulateMedia({colorScheme:'light'});assert.equal((await state()).mode,'dark');
 const ui=(await state()).ui;await page.click('[data-tab="settings"]');await page.selectOption('#pref-theme','github-light');assert.equal((await state()).ui,ui);assert.equal((await state()).mode,'dark');assert.equal((await state()).editor,'rgb(255, 255, 255)');
 await page.selectOption('#pref-theme','jellybean');await page.click('#appearance-system');await page.waitForFunction(()=>document.documentElement.dataset.ideTheme==='light');assert.equal((await state()).code,'github-light');
 await page.reload();await page.waitForSelector('.monaco-editor');assert.equal((await state()).appearance,'system');assert.equal((await state()).code,'github-light');
 await page.click('[data-tab="code"]');await fillCode(page,'int main(void) {\n\n}\n');await page.locator('#code').evaluate(el=>{el.focus();el.setSelectionRange(17,17);});await page.keyboard.press('Tab');assert.equal((await page.locator('#code').inputValue()).split('\n')[1],'    ');
 await openFixture(page,circuitFixture('led'));
 for(const mode of ['dark','light']){
  await page.click('[data-tab="settings"]');await page.selectOption('#pref-appearance',mode);await page.click('[data-tab="code"]');await resizeWindow(1540,1020);await page.screenshot({path:path.join(out,'appearance-canvas-'+mode+'.png')});
  await clickUiControl(page, '#pinout-open');await page.selectOption('#pin-function','GPIO_Output');await page.screenshot({path:path.join(out,'appearance-canvas-'+mode+'-pinout.png')});await page.click('#pinout-close');
  await resizeWindow(1024,640);await page.click('[data-tab="settings"]');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.ok(await page.locator('#appearance-toggle').isVisible());await page.screenshot({path:path.join(out,'appearance-canvas-'+mode+'-compact.png')});
 }
 await resizeWindow(1540,1020);await page.click('[data-tab="code"]');
 const fixture=circuitFixture('led');fixture.wires[2].points=[{x:890,y:330}];await openFixture(page,fixture);await page.selectOption('#resize-target','surface:board');
 let before=await read(),origin=surfaceOrigin('board',before.surfaces);await drag({x:origin.x+210,y:origin.y+360},{x:60,y:30});let moved=await read();close(moved.surfaces.board.x,origin.x+60);close(moved.surfaces.board.y,origin.y+30);
 const id=boardPin('D13'),pin=endpointInfo(id,moved.components,moved.surfaces);close(Number(await page.locator(`[data-endpoint="${id}"]`).getAttribute('cx')),pin.x);
 await page.click('#undo');assert.deepEqual((await read()).surfaces,before.surfaces);await page.click('#redo');close((await read()).surfaces.board.x,origin.x+60);
 await page.selectOption('#resize-target','surface:breadboard');before=await read();origin=surfaceOrigin('breadboard',before.surfaces);await drag({x:origin.x+170,y:origin.y+30},{x:-80,y:50});moved=await read();close(moved.surfaces.breadboard.x,origin.x-80);close(moved.components[0].x,before.components[0].x-80);close(moved.components[0].y,before.components[0].y+50);close(moved.wires[2].points[0].x,810);
 before=await read();origin=surfaceOrigin('breadboard',before.surfaces);await drag({x:origin.x+170,y:origin.y+30},{x:70,y:30},true);assert.deepEqual(await read(),before);
 await page.reload();await page.waitForSelector('.monaco-editor');assert.deepEqual((await read()).surfaces,before.surfaces);
 await openFixture(page,fixture);await page.click('#zoom-reset');
 for(const onPin of [false,true]){
  await page.locator(`[data-endpoint="${boardPin('PA8')}"]`).click();await floor(540,620);await floor(580,650);await page.mouse.move(...Object.values(await screen({x:600,y:660})));assert.ok(await page.locator('#preview-layer path').count());
  if(onPin)await page.locator(`[data-endpoint="${boardPin('PA8')}"]`).click({button:'right'});else await floor(580,650,{button:'right'});
  assert.equal(await page.locator('#preview-layer path').count(),0);assert.equal(await page.locator('#pinout-dialog').isVisible(),false);assert.deepEqual((await read()).wires,fixture.wires);
 }
 await page.locator(`[data-endpoint="${boardPin('PA8')}"]`).click();await floor(550,620);await page.locator('[data-endpoint="bb:a:2"]').click();moved=await read();assert.equal(moved.wires.length,fixture.wires.length+1);assert.equal(moved.wires.at(-1).points.length,1);
 const far=blankProject();far.surfaces={board:{x:-8500,y:-8000},breadboard:{x:9000,y:8000}};await openFixture(page,far);
 let view=await page.locator('#circuit').getAttribute('viewBox');assert.ok(Number(view.split(' ')[0])<-8500);assert.ok(Number(view.split(' ')[2])>17000);
 await page.selectOption('#resize-target','surface:board');await drag({x:-8290,y:-7640},{x:-120,y:-60});close((await read()).surfaces.board.x,-8620);
 await page.fill('#part-search','button');await page.click('[data-add="button"]');moved=await read();assert.ok(moved.components[0].x<-6000&&moved.components[0].y<0);
 await page.selectOption('#resize-target','surface:breadboard');await drag({x:9170,y:8030},{x:120,y:60});close((await read()).surfaces.breadboard.x,9120);
 const box=await page.locator('#circuit').boundingBox();await page.mouse.move(box.x+box.width*.7,box.y+box.height*.6);await page.mouse.down({button:'middle'});await page.mouse.move(box.x+box.width*.6,box.y+box.height*.5,{steps:4});await page.mouse.up({button:'middle'});
 const v=(await page.locator('#circuit').getAttribute('viewBox')).split(' ').map(Number);await page.fill('#part-search','resistor');await page.click('[data-add="resistor"]');await floor(v[0]+v[2]*.86,v[1]+v[3]*.88);moved=await read();assert.ok(moved.components.at(-1).x>6000&&moved.components.at(-1).y>6000);
 await page.click('#zoom-reset');await page.reload();await page.waitForSelector('.monaco-editor');assert.deepEqual((await read()).components,moved.components);assert.deepEqual((await read()).surfaces,moved.surfaces);
 await openFixture(page,circuitFixture('led'));assert.deepEqual(errors,[]);
 const proof={passed:true,checks:['System media updates and persistent manual Dark/White override','Independent editor themes and four-space keyboard Tab','Dark/White desktop, Pinout and compact UI','Actual body drag for both base surfaces, mounted parts and wire paths','Undo, redo, Escape cancellation and reload','Right click on floor and GPIO cancels only unfinished routed wiring','Negative and beyond-6000 placement, middle-button pan, fit-all and persistence'],errors};await fs.writeFile(path.join(out,'appearance-canvas-ui.json'),JSON.stringify(proof,null,2));return proof;
}
module.exports={exercise};
async function main(){
 const {_electron}=require('playwright'),root=path.resolve(__dirname,'..'),out=path.join(root,'work/test-results');await fs.mkdir(out,{recursive:true});const profile=await fs.mkdtemp(path.join(out,'appearance-canvas-')),env={...process.env,CIRCUIT_LAB_SMOKE:'1',CIRCUIT_LAB_TEST_PROFILE:profile};delete env.ELECTRON_RUN_AS_NODE;
 const app=await _electron.launch({executablePath:path.join(root,'node_modules/electron/dist/electron.exe'),args:[root],cwd:root,env});let page;
 try{page=await app.firstWindow();const resizeWindow=(width,height)=>app.evaluate(({BrowserWindow},{width,height})=>{const w=BrowserWindow.getAllWindows()[0];w.setContentSize(width,height);w.showInactive();},{width,height});await resizeWindow(1540,1020);await exercise(page,{out,resizeWindow});
  // Exercise Electron's native preference notifications without changing Windows settings.
  await page.emulateMedia({colorScheme:null});await page.click('#appearance-system');const nativeStates=[];
  for(const mode of ['dark','light','dark']){
   await app.evaluate(({nativeTheme},mode)=>{nativeTheme.themeSource=mode;},mode);
   await page.waitForFunction(mode=>document.documentElement.dataset.ideTheme===mode,mode);
   const state=await page.evaluate(()=>({appearance:document.documentElement.dataset.appearance,mode:document.documentElement.dataset.ideTheme,code:document.documentElement.dataset.colorscheme,panel:getComputedStyle(document.documentElement).getPropertyValue('--ide-panel').trim()}));
   assert.deepEqual(state,{appearance:'system',mode,code:mode==='dark'?'jellybean':'github-light',panel:mode==='dark'?'#272727':'#fafafa'});nativeStates.push(state);
  }
  await page.click('#appearance-toggle');await app.evaluate(({nativeTheme})=>{nativeTheme.themeSource='dark';});assert.equal(await page.evaluate(()=>document.documentElement.dataset.ideTheme),'light');
  await page.click('#appearance-system');await page.waitForFunction(()=>document.documentElement.dataset.ideTheme==='dark');
  await fs.writeFile(path.join(out,'appearance-native-theme.json'),JSON.stringify({passed:true,nativeStates,manualOverridePreserved:true,windowsSettingsChanged:false},null,2));
  console.log('Appearance, native System theme events and unlimited canvas UI passed.');}
 catch(error){if(page)await page.screenshot({path:path.join(out,'appearance-canvas-failure.png')}).catch(()=>{});throw error;}
 finally{await app.evaluate(({nativeTheme})=>{nativeTheme.themeSource='system';}).catch(()=>{});await app.close();if(path.dirname(profile)!==out||!path.basename(profile).startsWith('appearance-canvas-'))throw Error('Invalid cleanup');await fs.rm(profile,{recursive:true,force:true});}
}
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
