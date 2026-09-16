const assert = require('node:assert/strict');
const fs = require('node:fs/promises'), path = require('node:path');
const {_electron} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const {openFixture,saveProject,openProject} = require('./smoke-fixture.cjs');
(async () => {
  const root = path.resolve(__dirname,'..'), out = path.join(root,'work','test-results');
  await fs.mkdir(out,{recursive:true});
  const env = {...process.env,CIRCUIT_LAB_SMOKE:'1',CIRCUIT_LAB_TEST_PROFILE:path.join(out,'editor-tools-profile-'+Date.now())};
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await _electron.launch({executablePath:process.env.LAB_EXE||path.join(root,'node_modules/electron/dist/electron.exe'),args:process.env.LAB_EXE?[]:[root],cwd:root,env});
  let page;
  try {
    page = await app.firstWindow();const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.waitForSelector('#code');await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].showInactive());
    const {blankProject}=await import('../src/project.js');
    const p=blankProject();p.code+='\n// led led LED\n// a.b $& 한글 😀\n'+Array.from({length:90},(_,i)=>'// line '+i).join('\n')+'\n// '+ 'x'.repeat(180)+' far_target';
    p.firmware.files=[{name:'user.h',text:'// led only in this header\n'}];
    await openFixture(page,p);
    const code=page.locator('#code'),find=page.locator('#code-find'),value=()=>code.inputValue();
    const selected=()=>code.evaluate(el=>el.value.slice(el.selectionStart,el.selectionEnd));
    const select=async word=>code.evaluate((el,word)=>{el.focus();const start=el.value.indexOf(word);el.setSelectionRange(start,start+word.length);},word);
    await select('led');await page.keyboard.press('Control+f');
    assert.equal(await find.inputValue(),'led');assert.equal(await page.locator('#code-find-count').textContent(),'1 / 2');
    await find.press('Enter');assert.equal(await page.locator('#code-find-count').textContent(),'2 / 2');
    await find.press('Enter');assert.equal(await page.locator('#code-find-count').textContent(),'1 / 2');
    await find.press('Shift+Enter');assert.equal(await page.locator('#code-find-count').textContent(),'2 / 2');
    await page.locator('#code-find-case').uncheck();assert.match(await page.locator('#code-find-count').textContent(),/\/ 3$/);await page.locator('#code-find-case').check();
    await find.fill('a.b');assert.equal(await selected(),'a.b');assert.equal(await page.locator('#code-find-count').textContent(),'1 / 1');
    await find.fill('far_target');assert.equal(await selected(),'far_target');assert.ok(await code.evaluate(el=>el.scrollTop>500&&el.scrollLeft>0));
    await find.fill('missing');assert.equal(await page.locator('#code-find-next').isDisabled(),true);assert.equal(await page.locator('#code-find-count').textContent(),'일치 없음');
    await find.fill('');assert.equal(await page.locator('#code-find-count').textContent(),'0 / 0');
    await find.press('Escape');assert.equal(await code.evaluate(el=>el===document.activeElement),true);
    await code.evaluate(el=>el.setSelectionRange(0,0));await page.keyboard.press('Control+r');
    assert.equal(await page.locator('#code-replace-row').isVisible(),true);assert.equal(await value(),p.code,'Ctrl+R cannot reload the source');
    await find.fill('led');await page.fill('#code-replacement','red');await page.click('#code-replace-one');assert.match(await value(),/\/\/ red led LED/);
    await page.fill('#code-replacement','blue');await page.click('#code-replace-all');assert.match(await value(),/\/\/ red blue LED/);
    await code.focus();await page.keyboard.press('Control+z');assert.match(await value(),/\/\/ red led LED/);
    await page.keyboard.press('Control+z');assert.equal(await value(),p.code);await page.keyboard.press('Control+y');assert.match(await value(),/\/\/ red led LED/);
    // Replacement strings are literal, and an empty replacement deletes.
    await find.fill('a.b');await page.fill('#code-replacement','$&');await page.click('#code-replace-all');assert.match(await value(),/\/\/ \$& \$& 한글/);
    await find.fill('$&');await page.fill('#code-replacement','');await page.click('#code-replace-all');assert.match(await value(),/\/\/   한글/);
    // Only the selected source changes; native save/open retains all sources.
    const main=await value();await page.selectOption('#source-file','user.h');await find.fill('led');await page.fill('#code-replacement','header_led');await page.click('#code-replace-one');assert.equal(await value(),'// header_led only in this header\n');
    await page.selectOption('#source-file','main.c');assert.equal(await value(),main);
    const saved=path.join(out,'editor-tools.stm32lab');await app.evaluate(({dialog},saved)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:saved});dialog.showOpenDialog=async()=>({canceled:false,filePaths:[saved]});},saved);
    await saveProject(page);const disk=JSON.parse(await fs.readFile(saved,'utf8'));assert.equal(disk.code,main);assert.match(disk.firmware.files[0].text,/header_led/);
    await openProject(page);assert.equal(await value(),main);
    await code.focus();await page.keyboard.press('Control+r');await find.fill('HAL');await page.keyboard.press('F5');assert.equal(await code.getAttribute('readonly'),'');
    assert.equal(await page.locator('#code-replace-one').isDisabled(),true);assert.equal(await page.locator('#code-replace-all').isDisabled(),true);assert.equal(await page.locator('#code-find-next').isDisabled(),false);
    await find.press('Enter');await page.keyboard.press('F5');assert.equal(await page.locator('#code-replace-all').isDisabled(),false);
    await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1120,760));await page.screenshot({path:path.join(out,'editor-find-replace.png')});
    assert.ok(await page.locator('#code-search').evaluate(el=>el.getBoundingClientRect().right<=innerWidth));assert.ok(await code.evaluate(el=>el.clientHeight>=100));
    // Real pointer double-click and drag, rather than dispatching a synthetic dblclick.
    const wireProject=blankProject();wireProject.wires=[{id:'route',from:'bb:a:10',to:'bb:j:20',color:'#23a68a'}];await openFixture(page,wireProject);await page.click('#zoom-reset');
    const point=async(x,y)=>page.evaluate(({x,y})=>{const svg=document.getElementById('circuit'),p=svg.createSVGPoint();p.x=x;p.y=y;const s=p.matrixTransform(svg.getScreenCTM());return {x:s.x,y:s.y};},{x,y});
    const {wirePoints}=await import('../src/circuit-edit.js');const route=wirePoints(wireProject,wireProject.wires[0]);const corner={x:(route[0].x+route[1].x)/2,y:route[0].y};
    const click=await point(corner.x,corner.y);await page.mouse.dblclick(click.x,click.y);
    assert.equal(await page.locator('[data-wire-point]').count(),3,'a real double click adds a waypoint');
    const handle=page.locator('[data-wire-point="0"]');const box=await handle.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+40,box.y+box.height/2-30,{steps:8});await page.mouse.up();
    const expectedPoint=await handle.evaluate(el=>({x:Number(el.getAttribute('cx')),y:Number(el.getAttribute('cy'))}));
    await page.waitForFunction(expected=>{const point=JSON.parse(localStorage.getItem('stm32lab.project.v2')).wires[0].points?.[0];return point?.x===expected.x&&point?.y===expected.y;},expectedPoint);
    const moved=await page.evaluate(()=>JSON.parse(localStorage.getItem('stm32lab.project.v2')));assert.notDeepEqual(moved.wires[0].points[0],corner);assert.equal(moved.wires[0].from,wireProject.wires[0].from);assert.equal(moved.wires[0].to,wireProject.wires[0].to);
    await page.click('#undo');await page.click('#redo');await saveProject(page);assert.deepEqual(JSON.parse(await fs.readFile(saved,'utf8')).wires,moved.wires);await openProject(page);assert.equal(await page.locator('[data-wire="route"]').count(),1);
    const restored=moved.wires[0],shown=await point((restored.points[0].x+restored.points[1].x)/2,(restored.points[0].y+restored.points[1].y)/2);
    await page.mouse.click(shown.x,shown.y);await page.locator('[data-wire-point="0"]').click({button:'right'});assert.equal(await page.locator('[data-wire-point]').count(),2);await page.click('#undo');
    await page.mouse.click(shown.x,shown.y);assert.equal(await page.locator('[data-wire-point]').count(),3);
    await page.screenshot({path:path.join(out,'wire-waypoint-edit.png')});
    await page.keyboard.press('F5');await page.mouse.dblclick(shown.x,shown.y);await page.keyboard.press('F5');assert.equal(await page.locator('[data-wire-point]').count(),3,'running cannot change the route');assert.deepEqual(errors,[]);
    await fs.writeFile(path.join(out,'editor-tools-smoke.json'),JSON.stringify({passed:true,checks:['Ctrl+F / Ctrl+R without reload','literal search, case option, count and wrapped navigation','scroll to distant match','single/all/delete replacements with undo/redo','current file isolation and save/open','find while running with replacement locked','compact editor layout','real wire double click and drag with persistent endpoints'],errors},null,2));
    console.log('Editor tools UI passed: find/replace and real wire waypoint editing.');
  } catch(error) {if(page)await page.screenshot({path:path.join(out,'editor-tools-failure.png')}).catch(()=>{});throw error;}
  finally {await app.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
