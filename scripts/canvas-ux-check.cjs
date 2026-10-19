const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const net=require('node:net');
const {createHash}=require('node:crypto');
const {_electron,chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {launch,terminate}=require('../desktop/process-tools.cjs');
const {openFixture}=require('./smoke-fixture.cjs');
const {resizeDevice}=require('./resize-gesture.cjs');
const {inspectContrast}=require('./ui-contrast-check.cjs');

// Exercise production event handlers in an isolated Electron profile. All
// documents enter through the ordinary file input; no app state is exposed.
async function main(){
 const root=path.resolve(__dirname,'..'),portable=Boolean(process.env.LAB_PORTABLE_EXE);
 const out=path.resolve(root,process.env.CANVAS_UX_OUT||'work/test-results/'+(portable?'canvas-ux-portable':'canvas-ux'));
 await fs.mkdir(out,{recursive:true});
 const profile=await fs.mkdtemp(path.join(out,'profile-'));
 const env={...process.env,CIRCUIT_LAB_SMOKE:'1',CIRCUIT_LAB_TEST_PROFILE:profile};delete env.ELECTRON_RUN_AS_NODE;
 delete env.PORTABLE_EXECUTABLE_FILE;delete env.PORTABLE_EXECUTABLE_DIR;
 const executable=portable?path.resolve(process.env.LAB_PORTABLE_EXE):process.env.LAB_EXE||path.join(root,'node_modules/electron/dist/electron.exe');
 const execution={mode:portable?'portable-exe-cdp':'electron',viewportKind:portable?'renderer CSS viewport':'BrowserWindow content size'};
 const checks=[],errors=[],contrastResults=[];let app,browser,child,page;
 const record=(name,detail={})=>{checks.push({name,passed:true,...detail});console.log('PASS '+name);};
 try{
  if(portable){
   await fs.mkdir(path.join(profile,'updates'),{recursive:true});await fs.writeFile(path.join(profile,'updates/settings.json'),JSON.stringify({automatic:false}));
   const port=await new Promise((resolve,reject)=>{const server=net.createServer();server.once('error',reject);server.listen(0,'127.0.0.1',()=>{const value=server.address().port;server.close(error=>error?reject(error):resolve(value));});});
   let startupError;child=launch(executable,[`--remote-debugging-port=${port}`,'--remote-debugging-address=127.0.0.1'],{env,cwd:root,stdio:'ignore'});child.once('error',error=>{startupError=error;});
   let ready=false;for(let i=0;i<300;i++){if(startupError)throw startupError;try{ready=(await fetch(`http://127.0.0.1:${port}/json/version`,{signal:AbortSignal.timeout(1000)})).ok;if(ready)break;}catch{}await new Promise(resolve=>setTimeout(resolve,200));}
   assert.ok(ready,'Portable executable must expose its isolated renderer');browser=await chromium.connectOverCDP(`http://127.0.0.1:${port}`);page=browser.contexts()[0].pages()[0];
   execution.exeSha256=createHash('sha256').update(await fs.readFile(executable)).digest('hex');
  }else{
   app=await _electron.launch({executablePath:executable,args:process.env.LAB_EXE?[]:[root],cwd:root,env});page=await app.firstWindow();
  }
  const {blankFixture,circuitFixture}=await import('../tests/fixtures/circuits.js');
  const {boardPin,endpointInfo}=await import('../src/pins.js');
  const {validateProject}=await import('../src/project.js');
  page.on('pageerror',error=>errors.push(error.message));
  await page.waitForSelector('.monaco-editor');
  execution.version=(await page.evaluate(()=>window.appUpdates.state())).currentVersion;
  if(portable)assert.equal(execution.version,require('../package.json').version,'Portable version must match the checked-out release');
  const size=async(width,height)=>{if(portable)await page.setViewportSize({width,height});else await app.evaluate(({BrowserWindow},s)=>{const w=BrowserWindow.getAllWindows()[0];w.setContentSize(s.width,s.height);w.showInactive();},{width,height});await page.waitForTimeout(80);};
  await size(1366,768);
  const contrast=async name=>{await page.waitForTimeout(50);const result=await page.evaluate(inspectContrast);contrastResults.push({name,...result});assert.deepEqual(result.findings,[],name+' text must have at least 4.5:1 contrast');return result.checked;};
  const snapshot=async()=>{await page.waitForFunction(()=>document.getElementById('save-state').textContent==='자동 저장됨');return page.evaluate(()=>JSON.parse(localStorage.getItem('stm32lab.project.v2')));};
  const client=async(x,y)=>page.evaluate(({x,y})=>{const svg=document.getElementById('circuit'),p=svg.createSVGPoint();p.x=x;p.y=y;const q=p.matrixTransform(svg.getScreenCTM());return {x:q.x,y:q.y};},{x,y});
  const at=async(p)=>page.evaluate(({x,y})=>{const svg=document.getElementById('circuit'),p=svg.createSVGPoint();p.x=x;p.y=y;const q=p.matrixTransform(svg.getScreenCTM().inverse());return {x:q.x,y:q.y};},p);
  const view=()=>page.locator('#circuit').evaluate(el=>{const v=el.viewBox.baseVal;return {x:v.x,y:v.y,w:v.width,h:v.height};});
  const clickXY=async(x,y)=>{const p=await client(x,y);await page.mouse.click(p.x,p.y);};
  const dragXY=async(a,b,{shift=false,button='left',preview=false}={})=>{
   const from=await client(a.x,a.y),to=await client(b.x,b.y);
   await page.mouse.move(from.x,from.y);if(shift)await page.keyboard.down('Shift');await page.mouse.down({button});
   await page.mouse.move(to.x,to.y,{steps:5});
   if(preview){assert.equal(await page.locator('#preview-layer .marquee-box').count(),1);assert.equal(await page.locator('.marquee-box').getAttribute('vector-effect'),'non-scaling-stroke');}
   await page.mouse.up({button});if(shift)await page.keyboard.up('Shift');
  };
  const selected=()=>page.evaluate(()=>({parts:[...document.querySelectorAll('[data-part].part-selected')].map(e=>e.dataset.part).sort(),wires:[...document.querySelectorAll('[data-wire].wire-selected')].map(e=>e.dataset.wire).sort()}));
  const focusCanvas=()=>page.locator('#circuit').focus();
  let fixtureSequence=0;
  const load=async project=>{const fixture=validateProject({...project,name:project.name+' / '+(++fixtureSequence)});await openFixture(page,fixture);await page.waitForFunction(name=>document.getElementById('project-name').value===name,fixture.name);await page.click('#zoom-reset');await snapshot();};
  const selectWire=async id=>{
   const p=await page.evaluate(id=>{
    const path=document.querySelector(`[data-wire="${id}"] .wire-hit`);if(!path)return null;
    for(const fraction of [.5,.25,.75,.1,.9,.35,.65]){
     const q=path.getPointAtLength(path.getTotalLength()*fraction),screen=q.matrixTransform(path.getScreenCTM());
     if(document.elementFromPoint(screen.x,screen.y)?.closest('[data-wire]')?.dataset.wire===id)return {x:screen.x,y:screen.y};
    }return null;
   },id);
   assert.ok(p,'wire must have a real unobscured hit point: '+id);await page.mouse.click(p.x,p.y);
   await page.waitForSelector('#wire-voltage');
  };
  const selectEndpoint=async id=>{
   const point=await page.evaluate(id=>{
    const el=document.querySelector(`[data-endpoint="${id}"]`),svg=document.getElementById('circuit');if(!el)return null;
    for(const [dx,dy]of [[0,0],[4.8,0],[-4.8,0],[0,4.8],[0,-4.8],[3.8,3.8],[-3.8,-3.8]]){
     const p=svg.createSVGPoint();p.x=Number(el.getAttribute('cx'))+dx;p.y=Number(el.getAttribute('cy'))+dy;
     const q=p.matrixTransform(el.getScreenCTM());if(document.elementFromPoint(q.x,q.y)?.closest('[data-endpoint]')?.dataset.endpoint===id)return {x:q.x,y:q.y};
    }return null;
   },id);
   assert.ok(point,'endpoint must have an unobscured hit point: '+id);await page.mouse.click(point.x,point.y);await page.waitForSelector('#endpoint-voltage');
  };
  const run=async()=>{await page.click('#run');await page.waitForFunction(()=>document.getElementById('run-status').textContent==='실행 중');};
  const stop=async()=>{if((await page.locator('#run-status').textContent())==='실행 중')await page.click('#run');};
  const base=blankFixture();base.name='Canvas UX regression';base.code='void setup() {}\nvoid loop() { delay(20); }';
  base.surfaces={board:{hidden:true},breadboard:{hidden:true}};
  base.components=[
   {id:'led1',type:'led',name:'LED1',color:'red',x:200,y:250,rotation:0,span:70},
   {id:'r1',type:'resistor',name:'R1',value:10000,x:350,y:250,rotation:0,span:70},
   {id:'r2',type:'resistor',name:'R2',value:10000,x:550,y:450,rotation:0,span:70},
   {id:'bb1',type:'breadboard',name:'BB1',x:1150,y:400,rotation:0}
  ];
  base.wires=[{id:'inside',from:'part:led1:a',to:'part:r1:a',color:'#23a68a',points:[{x:240,y:170}]},{id:'outside',from:'part:r1:b',to:'part:r2:a',color:'#dd654c',points:[{x:700,y:600}]}];
  await load(base);

  const zoomChecks=[];
  for(const ctrlKey of [false,true])for(const deltaY of [-120,120]){
   const box=await page.locator('#circuit').boundingBox(),screen={x:Math.round(box.x+box.width*.29),y:Math.round(box.y+box.height*.38)},before=await at(screen),v0=await view();
   await page.locator('#circuit').dispatchEvent('wheel',{clientX:screen.x,clientY:screen.y,deltaY,ctrlKey,bubbles:true,cancelable:true});
   const after=await at(screen),v1=await view(),error=Math.hypot(before.x-after.x,before.y-after.y);
   assert.ok(error<1e-3,`cursor anchor drift ${error}`);assert.ok(deltaY<0?v1.w<v0.w:v1.w>v0.w);
   assert.ok(Math.abs(v1.w/v0.w-(deltaY>0?(ctrlKey?1.04:1.08):1/(ctrlKey?1.04:1.08)))<1e-6);
   zoomChecks.push({ctrlKey,deltaY,error});
  }
  const zero=await view();await page.locator('#circuit').dispatchEvent('wheel',{deltaY:0});assert.deepEqual(await view(),zero);
  for(const button of ['#zoom-in','#zoom-out']){const a=await view();await page.click(button);const b=await view();assert.ok(Math.hypot(a.x+a.w/2-b.x-b.w/2,a.y+a.h/2-b.y-b.h/2)<1e-3);}
  record('Cursor wheel/pinch anchor, fine pinch step, zero delta and toolbar center zoom',{samples:zoomChecks});

  await page.click('#zoom-reset');await clickXY(550,450);
  const beforeMarquee=await view();await dragXY({x:120,y:120},{x:440,y:330},{shift:true,preview:true});
  assert.deepEqual(await selected(),{parts:['led1','r1','r2'],wires:['inside']});assert.deepEqual(await view(),beforeMarquee);
  assert.equal(await page.locator('.marquee-box').count(),0);
  record('Shift blank drag adds parts and fully contained wire to prior selection');
  await focusCanvas();await page.keyboard.press('Escape');let saved=await snapshot();
  assert.deepEqual(saved.components.map(p=>p.id),['bb1']);assert.equal(saved.wires.length,0);
  await page.keyboard.press('Control+z');saved=await snapshot();assert.deepEqual(saved.components,validateProject(base).components);assert.deepEqual(saved.wires,base.wires);
  await page.keyboard.press('Control+a');assert.deepEqual(await selected(),{parts:['bb1','led1','r1','r2'],wires:['inside','outside']});
  await page.keyboard.press('Control+d');saved=await snapshot();assert.equal(saved.components.length,8);assert.equal(saved.wires.length,4);
  const duplicates=await selected();assert.equal(duplicates.parts.length,4);assert.equal(duplicates.wires.length,2);assert.ok(duplicates.parts.every(id=>!base.components.some(p=>p.id===id)));
  await page.keyboard.press('Control+z');saved=await snapshot();assert.equal(saved.components.length,4);assert.equal(saved.wires.length,2);
  record('Group Escape deletes with undo; Ctrl+A selects all and Ctrl+D duplicates in one undo step');

  await load(base);await clickXY(200,250);await page.keyboard.down('Shift');await clickXY(350,250);await page.keyboard.up('Shift');
  const movingSelection=await selected(),moveStart=await client(200,250),moveMiddle=await client(220,270),moveEnd=await client(240,290);
  await page.mouse.move(moveStart.x,moveStart.y);await page.mouse.down();await page.mouse.move(moveMiddle.x,moveMiddle.y,{steps:3});
  await page.keyboard.press('Control+d');assert.deepEqual(await selected(),movingSelection,'duplicate shortcut must not replace an active group drag');
  assert.equal(await page.locator('[data-part]').count(),4,'no duplicate models during active drag');
  await page.keyboard.press('Control+a');assert.deepEqual(await selected(),movingSelection,'select-all must not replace an active group drag');
  await page.mouse.move(moveEnd.x,moveEnd.y,{steps:3});await page.mouse.up();saved=await snapshot();
  assert.equal(saved.components.length,4);assert.equal(saved.wires.length,2);assert.deepEqual(await selected(),movingSelection);
  for(const part of saved.components){const source=base.components.find(p=>p.id===part.id),offset=['led1','r1'].includes(part.id)?40:0;assert.ok(Math.abs(part.x-source.x-offset)<.01);assert.ok(Math.abs(part.y-source.y-offset)<.01);}
  await page.keyboard.press('Control+z');saved=await snapshot();assert.deepEqual(saved.components,validateProject(base).components);assert.deepEqual(saved.wires,base.wires);
  record('Ctrl+A/D during a live group drag preserves selection and models; continuation and one-step undo remain correct');

  await clickXY(550,450);const cancelSelection=await selected(),cancelView=await view(),cancelProject=await snapshot();
  const boxStart=await client(120,120),boxEnd=await client(440,330);
  await page.mouse.move(boxStart.x,boxStart.y);await page.keyboard.down('Shift');await page.mouse.down();await page.mouse.move(boxEnd.x,boxEnd.y,{steps:3});
  assert.equal(await page.locator('.marquee-box').count(),1);await page.keyboard.press('Escape');
  assert.equal(await page.locator('.marquee-box').count(),0);await page.mouse.up();await page.keyboard.up('Shift');
  assert.deepEqual(await selected(),cancelSelection);assert.deepEqual(await view(),cancelView);assert.deepEqual(await snapshot(),cancelProject);
  record('Escape cancels an active marquee while preserving the previous selection and circuit');

  await clickXY(200,250);await page.locator('#part-search').focus();
  const inputSelection=await selected(),beforeInput=await snapshot();await page.keyboard.press('Control+a');await page.keyboard.press('Control+d');await page.keyboard.press('Escape');
  assert.deepEqual(await selected(),inputSelection);assert.deepEqual(await snapshot(),beforeInput);
  await page.click('[data-tab="code"]');await page.locator('.monaco-editor .inputarea').focus();
  await page.keyboard.press('Control+a');assert.deepEqual(await selected(),inputSelection);
  await load(base);await focusCanvas();await page.keyboard.press('Control+a');await run();
  const runningBefore=await snapshot();await focusCanvas();await page.keyboard.press('Control+a');await page.keyboard.press('Control+d');await page.keyboard.press('Escape');await page.keyboard.press('Delete');
  await dragXY({x:100,y:90},{x:440,y:330},{shift:true});assert.equal(await page.locator('.marquee-box').count(),0);
  assert.deepEqual(await snapshot(),runningBefore);await stop();
  record('Text/Monaco input focus and running-state guards preserve circuit structure');

  await load(base);await clickXY(200,250);
  await page.locator('[data-part="bb1"]').evaluate(el=>{window.__canvasUxBreadboard=el;});
  await dragXY({x:200,y:250},{x:220,y:290});
  assert.equal(await page.locator('[data-part="bb1"]').evaluate(el=>el===window.__canvasUxBreadboard),true);
  await page.keyboard.down('Shift');await clickXY(350,250);await page.keyboard.up('Shift');
  await dragXY({x:220,y:290},{x:240,y:310});
  assert.equal(await page.locator('[data-part="bb1"]').evaluate(el=>el===window.__canvasUxBreadboard),true);
  await page.selectOption('#resize-target','part:bb1');
  const boardBefore=await page.locator('[data-part="bb1"]').getAttribute('transform');
  await page.fill('#part-name','Breadboard renamed');await page.locator('#part-name').press('Tab');
  assert.match(await page.locator('[data-part="bb1"]').textContent(),/Breadboard renamed/);
  await focusCanvas();await page.keyboard.press('r');
  assert.equal(await page.locator('[data-part="bb1"]').getAttribute('data-rotation'),'45');
  assert.notEqual(await page.locator('[data-part="bb1"]').getAttribute('transform'),boardBefore);
  await resizeDevice(page,'part:bb1',1.2,1.2);
  saved=await snapshot();const bb=saved.components.find(p=>p.id==='bb1');assert.ok(Math.abs((bb.scaleX??bb.scale)-1.2)<.03);
  const holeId='breadboard:bb1:bb:a:1',expectedHole=endpointInfo(holeId,saved.components,saved.surfaces);
  assert.ok(Math.abs(Number(await page.locator(`[data-endpoint="${holeId}"]`).getAttribute('cx'))-expectedHole.x)<1e-6);
  assert.ok(Math.abs(Number(await page.locator(`[data-endpoint="${holeId}"]`).getAttribute('cy'))-expectedHole.y)<1e-6);
  await focusCanvas();await page.keyboard.press('Escape');assert.equal(await page.locator('[data-part="bb1"]').count(),0);
  await page.keyboard.press('Control+z');assert.equal(await page.locator('[data-part="bb1"]').count(),1);
  record('Additional breadboard DOM cached during ordinary/group movement; rename/rotate/resize/delete/undo invalidate correctly');

  const divider=circuitFixture('divider');divider.wires.push({id:'floating',from:'bb:a:25',to:'bb:f:25',color:'#8064d8'});
  await load(divider);await selectWire('w1');
  assert.equal(await page.locator('#inspector [data-wire-color]').count(),20);
  const original=(await snapshot()).wires.find(w=>w.id==='w1').color;
  await page.locator('#inspector [data-wire-color="#f4a6a6"]').click();assert.equal((await snapshot()).wires.find(w=>w.id==='w1').color,'#f4a6a6');
  await page.locator('#inspector [data-wire-color="#f4a6a6"]').hover();await contrast('wire-palette-active-hover');
  await page.locator('#inspector [data-wire-color="#a9d6ed"]').focus();await contrast('wire-palette-keyboard-focus');
  await focusCanvas();await page.keyboard.press('Control+z');assert.equal((await snapshot()).wires.find(w=>w.id==='w1').color,original);
  await run();await selectWire('w1');
  assert.equal(await page.locator('#inspector [data-wire-color]:disabled').count(),20);
  await page.locator('#inspector [data-wire-color="#a9d6ed"]').evaluate(el=>el.click());assert.equal((await snapshot()).wires.find(w=>w.id==='w1').color,original);
  record('Inspector has all 20 wire colors, mutation is undoable, palette disabled while running');
  const signals=[];
  for(const [id,label,voltage]of [['w1','HIGH',3.3],['w2','LOW',0],['w3','ANALOG',1.65],['floating','부유',null]]){
   await selectWire(id);await page.waitForFunction(label=>document.getElementById('wire-signal').textContent===label,label);
   const text=await page.locator('#wire-voltage').textContent();if(voltage!==null)assert.ok(Math.abs(parseFloat(text)-voltage)<.01);else assert.equal(text,'—');
   assert.ok(Number(await page.locator('#wire-connected').textContent())>=2);signals.push({id,label,text});
  }
  for(const [id,label]of [[boardPin('3V3'),'HIGH'],[boardPin('GND'),'LOW'],[boardPin('A0'),'ANALOG'],['bb:a:25','부유']]){
   await selectEndpoint(id);await page.waitForFunction(label=>document.getElementById('endpoint-signal')?.textContent===label,label);
   assert.ok(Number(await page.locator('#endpoint-connected').textContent())>=1);
  }
  record('Running wire and endpoint badges report HIGH/LOW/ANALOG/floating with live voltage',{signals});
  await stop();

  await load(circuitFixture());await run();await selectWire('w1');
  await page.locator('#wire-voltage').evaluate(el=>{window.__canvasUxWireVoltage=el;});
  const wireStart=await page.locator('#wire-signal').textContent();
  await page.waitForFunction(label=>document.getElementById('wire-signal').textContent!==label,wireStart);
  assert.equal(await page.locator('#wire-voltage').evaluate(el=>el===window.__canvasUxWireVoltage),true);
  const wireChanged=await page.locator('#wire-signal').textContent();assert.ok(['HIGH','LOW'].includes(wireChanged));
  await selectEndpoint(boardPin('D13'));
  await page.locator('#endpoint-voltage').evaluate(el=>{window.__canvasUxEndpointVoltage=el;});
  const endpointStart=await page.locator('#endpoint-signal').textContent();
  await page.waitForFunction(label=>document.getElementById('endpoint-signal').textContent!==label,endpointStart);
  assert.equal(await page.locator('#endpoint-voltage').evaluate(el=>el===window.__canvasUxEndpointVoltage),true);
  const endpointChanged=await page.locator('#endpoint-signal').textContent();assert.ok(['HIGH','LOW'].includes(endpointChanged));
  await clickXY(795,226);await page.waitForSelector('#part-power');
  assert.match(await page.locator('#part-power').textContent(),/mW/);
  record('Running GPIO changes patch wire/endpoint voltages and badges in existing nodes; resistor power is present',{wireStart,wireChanged,endpointStart,endpointChanged});
  await stop();

  const pot=blankFixture();pot.name='Inspector live stability';pot.code='void setup() {}\nvoid loop() { delay(20); }';
  pot.components=[{id:'vr1',type:'potentiometer',name:'VR1',x:560,y:380,rotation:0,value:10000,position:50}];
  pot.wires=[{id:'gnd',from:boardPin('GND'),to:'part:vr1:p1',color:'#4e647b'},{id:'vcc',from:boardPin('3V3'),to:'part:vr1:p3',color:'#dd654c'}];
  await load(pot);await run();await clickXY(560,380);await page.locator('#extra-position').focus();
  const stable=await page.evaluate(()=>{
   const panel=document.getElementById('inspect-panel'),slider=document.getElementById('extra-position');
   window.__canvasUxInspector={slider,name:document.getElementById('part-name'),first:document.getElementById('inspector').firstChild,voltage:document.getElementById('part-voltage')};
   panel.scrollTop=Math.min(45,panel.scrollHeight-panel.clientHeight);return {scrollTop:panel.scrollTop,time:document.getElementById('sim-time').textContent};
  });
  await page.waitForTimeout(650);
  const stability=await page.evaluate(()=>{
   const refs=window.__canvasUxInspector,panel=document.getElementById('inspect-panel');return {
    sameSlider:refs.slider===document.getElementById('extra-position'),sameName:refs.name===document.getElementById('part-name'),sameFirst:refs.first===document.getElementById('inspector').firstChild,sameVoltage:refs.voltage===document.getElementById('part-voltage'),focused:document.activeElement===refs.slider,scrollTop:panel.scrollTop,time:document.getElementById('sim-time').textContent
   };
  });
  for(const key of ['sameSlider','sameName','sameFirst','sameVoltage','focused'])assert.equal(stability[key],true,key);
  assert.equal(stability.scrollTop,stable.scrollTop);assert.notEqual(stability.time,stable.time);
  await page.locator('#extra-position').press('ArrowRight');
  await page.waitForFunction(()=>document.getElementById('output-position').textContent==='51');
  await page.waitForFunction(()=>document.getElementById('part-live').textContent.includes('1.683 V'));
  assert.equal(await page.locator('#extra-position').evaluate(el=>el===window.__canvasUxInspector.slider),true);
  await contrast('live-slider-input-focus');
  record('Simulation patches readouts without replacing inspector controls, focus or scroll; live slider changes actual voltage',{stability});
  await stop();

  const screenshots=[];
  for(const theme of ['dark','light'])for(const [width,height]of [[1366,768],[1024,640]]){
   await size(width,height);await page.click('[data-tab="settings"]');await page.selectOption('#pref-appearance',theme);
   await load(divider);await run();
   for(const [id,label]of [['w1','HIGH'],['w2','LOW'],['floating','부유'],['w3','ANALOG']]){
    await selectWire(id);await page.waitForFunction(label=>document.getElementById('wire-signal')?.textContent===label,label);
    await contrast(`${theme}-${width}x${height}-wire-${label}`);
   }
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'no horizontal document overflow');
   const name=`canvas-${theme}-${width}x${height}.png`;await page.screenshot({path:path.join(out,name)});screenshots.push(name);await stop();
  }
  record('Dark/White running inspector screenshots at 1366x768 and 1024x640',{screenshots});
  record('Inspector palette hover/focus, live input focus and all running signal badges meet 4.5:1 contrast',{states:contrastResults.length,textChecks:contrastResults.reduce((sum,result)=>sum+result.checked,0)});
  assert.deepEqual(errors,[]);
  await fs.writeFile(path.join(out,'summary.json'),JSON.stringify({passed:true,execution,checks,contrastResults,errors},null,2));
  console.log(`Canvas UX passed: ${checks.length} integration checks, ${screenshots.length} screenshots.`);
 }catch(error){
  if(page)await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});
  await fs.writeFile(path.join(out,'summary.json'),JSON.stringify({passed:false,execution,checks,contrastResults,errors,error:error.stack},null,2));throw error;
 }finally{
  if(app)await app.close();
  else{if(page)await page.evaluate(()=>window.close()).catch(()=>{});if(browser)await browser.close().catch(()=>{});if(child)await terminate(child);}
  await fs.copyFile(path.join(profile,'diagnostics/events.jsonl'),path.join(out,'runtime-events.jsonl')).catch(error=>{if(error.code!=='ENOENT')throw error;});
  if(path.dirname(profile)!==out||!path.basename(profile).startsWith('profile-'))throw Error('Invalid test profile cleanup');await fs.rm(profile,{recursive:true,force:true});
 }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
