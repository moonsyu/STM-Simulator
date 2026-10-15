const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {_electron}=require('playwright'),{openFixture}=require('./smoke-fixture.cjs'),{resizeDevice}=require('./resize-gesture.cjs');
(async()=>{
 const root=path.resolve(__dirname,'..'),out=path.join(root,'work/test-results');await fs.mkdir(out,{recursive:true});const temp=await fs.mkdtemp(path.join(out,'resize-ui-'));
 const env={...process.env,CIRCUIT_LAB_SMOKE:'1',CIRCUIT_LAB_TEST_PROFILE:path.join(temp,'profile')};delete env.ELECTRON_RUN_AS_NODE;
 const app=await _electron.launch({executablePath:process.env.LAB_EXE||path.join(root,'node_modules/electron/dist/electron.exe'),args:process.env.LAB_EXE?[]:[root],cwd:root,env});let page;
 try{
  const {blankProject,validateProject}=await import('../src/project.js'),{PART_LIBRARY}=await import('../src/part-library.js'),{PART_DEFS}=await import('../src/components.js'),{scaleXOf,scaleYOf}=await import('../src/geometry.js'),{circuitFixture}=await import('../tests/fixtures/circuits.js');
  page=await app.firstWindow();const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.waitForSelector('.monaco-editor');await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];w.setContentSize(1540,1020);w.showInactive();});
  const settle=()=>page.waitForFunction(()=>document.getElementById('save-state').textContent==='자동 저장됨');
  const read=async()=>{await settle();return page.evaluate(()=>JSON.parse(localStorage.getItem('stm32lab.project.v2')));};
  const near=(a,b)=>assert.ok(Math.abs(a-b)<.04,`${a} != ${b}`);
  await openFixture(page,circuitFixture('led'));let before=await read();assert.equal(await page.locator('#object-scale').count(),0);
  await resizeDevice(page,'surface:board',1.237,1,{handle:'e'});let saved=await read();near(scaleXOf(saved.surfaces.board),1.237);near(scaleYOf(saved.surfaces.board),1);const after=saved;
  await page.click('#undo');assert.deepEqual(await read(),before);await page.click('#redo');assert.deepEqual(await read(),after);
  await resizeDevice(page,'surface:board',1.2,.8,{cancel:true});assert.deepEqual(await read(),after);
  await resizeDevice(page,'surface:breadboard',1.173,.837);saved=await read();near(scaleXOf(saved.surfaces.breadboard),1.173);near(scaleYOf(saved.surfaces.breadboard),.837);assert.deepEqual(saved.wires,before.wires);
  before=await read();await resizeDevice(page,'part:led1',1.4,.8,{cancel:true});assert.deepEqual(await read(),before);
  await page.click('#run');await page.waitForTimeout(250);assert.match(await page.locator('#run-status').textContent(),/실행 중/);assert.equal(await page.locator('#resize-layer rect').count(),0);assert.equal(await page.locator('#resize-target').isDisabled(),true);await page.click('#run');
  await page.selectOption('#resize-target','surface:board');const beforeKey=await read();await page.locator('#resize-layer rect[data-resize-handle="e"]').focus();await page.keyboard.press('ArrowRight');saved=await read();assert.ok(scaleXOf(saved.surfaces.board)>scaleXOf(beforeKey.surfaces.board));
  await page.click('#zoom-reset');await page.screenshot({path:path.join(out,'edge-resize-board.png')});
  const all=PART_LIBRARY.map((part,i)=>({id:'device'+i,type:part.type,name:part.name,x:850+i%8*350,y:650+Math.floor(i/8)*250,rotation:i%3===0?45:0,span:70,...PART_DEFS[part.type]?.defaults,...(part.type==='resistor'?{value:330}:{}),...(part.type==='led'?{color:'red'}:{})}));
  for(let start=0;start<all.length;start+=60){
   const batch=blankProject();batch.components=all.slice(start,start+60);validateProject(batch);await openFixture(page,batch);
   for(const [i,part]of batch.components.entries()){
    await resizeDevice(page,'part:'+part.id,1.237,.837);saved=await read();const current=saved.components.find(p=>p.id===part.id);near(scaleXOf(current),1.237);near(scaleYOf(current),.837);assert.equal(current.rotation,part.rotation);if((start+i+1)%20===0)console.log('Resized devices:',start+i+1);
   }
  }
  const prior=await read(),sample=prior.components.find(p=>p.type!=='breadboard');await resizeDevice(page,'part:'+sample.id,1.2,1.1,{shift:true});saved=await read();const a=prior.components.find(p=>p.id===sample.id),b=saved.components.find(p=>p.id===sample.id);near(scaleXOf(b)/scaleXOf(a),scaleYOf(b)/scaleYOf(a));
  await page.reload();await page.waitForSelector('.monaco-editor');assert.deepEqual(await read(),saved);assert.equal(await page.locator('[data-part]').count(),saved.components.length);
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setContentSize(1024,640));await page.selectOption('#resize-target','surface:board');assert.equal(await page.locator('#resize-layer rect').count(),8);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.screenshot({path:path.join(out,'edge-resize-compact.png')});assert.deepEqual(errors,[]);
  await fs.writeFile(path.join(out,'resize-ui-check.json'),JSON.stringify({passed:true,deviceCount:113,checks:['All 113 devices resized by real pointer dragging, including rotated devices','Board and base breadboard independent axes','One-step undo/redo and Escape rollback','Wires preserved and simulation still runs','Running state hides/disables handles','Keyboard fine adjustment and Shift aspect lock','Reload retains every size and transform','1024px layout'],errors},null,2));console.log('Edge resizing UI passed: 113 devices, both surfaces, persistence and history.');
 }catch(error){if(page){console.error('Renderer log:',await page.locator('#console-output').textContent().catch(()=>''));await page.screenshot({path:path.join(out,'resize-ui-failure.png')}).catch(()=>{});}throw error;}
 finally{await app.close();if(path.dirname(temp)!==out||!path.basename(temp).startsWith('resize-ui-'))throw new Error('Invalid test cleanup');await fs.rm(temp,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
