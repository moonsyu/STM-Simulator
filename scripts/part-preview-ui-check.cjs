const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs/promises'),{_electron}=require('playwright');
const {openFixture,chooseHal}=require('./smoke-fixture.cjs');
(async()=>{
 const root=path.resolve(__dirname,'..'),out=path.join(root,'work/test-results');await fs.mkdir(out,{recursive:true});const profile=await fs.mkdtemp(path.join(out,'part-preview-'));
 const env={...process.env,CIRCUIT_LAB_SMOKE:'1',CIRCUIT_LAB_TEST_PROFILE:profile};delete env.ELECTRON_RUN_AS_NODE;
 const app=await _electron.launch({executablePath:process.env.LAB_EXE||path.join(root,'node_modules/electron/dist/electron.exe'),args:process.env.LAB_EXE?[]:[root],cwd:root,env});let page;
 try{
  const {PART_LIBRARY}=await import('../src/part-library.js'),{circuitFixture}=await import('../tests/fixtures/circuits.js');
  page=await app.firstWindow();const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.waitForSelector('.monaco-editor');await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];w.setContentSize(1540,1020);w.showInactive();});
  assert.equal(await page.locator('.part-thumbnail').count(),114);assert.equal(await page.locator('.hole').count(),400);assert.equal(await page.locator('[data-part]').count(),0);
  const preview=page.locator('#part-model-preview');
  async function hover(type){await page.mouse.move(900,40);await page.fill('#part-search',type);await page.locator(`[data-add="${type}"]`).hover();try{await page.waitForFunction(type=>{const p=document.getElementById('part-model-preview'),img=p.querySelector('img');return !p.hidden&&p.dataset.type===type&&img.complete&&img.naturalWidth>0;},type);}catch(error){throw new Error(`Preview failed: ${type}`,{cause:error});}}
  for(const [i,part]of PART_LIBRARY.entries()){
   await hover(part.type);const img=page.locator(`[data-add="${part.type}"] .part-thumbnail`);await img.evaluate(img=>img.decode());
   assert.equal(await img.getAttribute('src'),await preview.locator('img').getAttribute('src'));assert.equal(await preview.locator('strong').textContent(),part.name);
   const source=decodeURIComponent((await img.getAttribute('src')).split(',').slice(1).join(','));assert.match(source,/<svg/);assert.ok(!source.includes('class="pin-hit'));assert.ok(!source.includes('<script'));
   if((i+1)%25===0)console.log('Model previews checked:',i+1);
  }
  assert.equal(await page.locator('[data-part]').count(),0,'hover must not add devices or pollute circuit selectors');assert.equal(await page.locator('.hole').count(),400);
  await hover('lcd');await page.screenshot({path:path.join(out,'part-preview-desktop.png')});await preview.hover();await page.waitForTimeout(250);assert.equal(await preview.isVisible(),true,'hoverable preview');
  await page.fill('#part-search','not-a-device-xyz');assert.equal(await preview.isVisible(),false);assert.equal(await page.locator('#part-no-results').isVisible(),true);
  await openFixture(page,circuitFixture());await page.locator('[data-part="led1"] .part-body').click();await page.fill('#part-search','button');await page.locator('[data-add="button"]').focus();await page.waitForFunction(()=>!document.getElementById('part-model-preview').hidden);await page.keyboard.press('Escape');assert.equal(await preview.isVisible(),false);assert.equal(await page.locator('[data-part]').count(),2,'Escape only dismisses preview');
  await page.click('[data-add="button"]');assert.equal(await page.locator('[data-part]').count(),3);assert.equal(await preview.isVisible(),false);
  await chooseHal(page,'uart');await page.click('#run');await hover('button');assert.equal(await page.locator('[data-add="button"]').isDisabled(),true);assert.equal(await preview.isVisible(),true);await page.click('#run');
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setContentSize(1024,640));await hover('breadboard');const box=await preview.boundingBox();assert.ok(box.x>=0&&box.y>=0&&box.x+box.width<=1024&&box.y+box.height<=640);await page.screenshot({path:path.join(out,'part-preview-compact.png')});
  await page.locator('#part-list').evaluate(el=>el.dispatchEvent(new Event('scroll')));assert.equal(await preview.isVisible(),false);
  await page.click('[data-tab="settings"]');await page.selectOption('#pref-appearance','light');await page.selectOption('#pref-theme','github-light');await hover('button');assert.equal(await preview.evaluate(el=>getComputedStyle(el).backgroundColor),await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--ide-chrome').trim()).then(value=>page.evaluate(value=>{const el=document.createElement('div');el.style.backgroundColor=value;document.body.append(el);const result=getComputedStyle(el).backgroundColor;el.remove();return result;},value)));await page.screenshot({path:path.join(out,'part-preview-light.png')});assert.deepEqual(errors,[]);
  await fs.writeFile(path.join(out,'part-preview-ui.json'),JSON.stringify({passed:true,deviceCount:114,checks:['every thumbnail matches expanded model image','all images decode','no circuit selector pollution or hover mutations','pointer and keyboard preview','Escape dismissal preserves circuit','search and scroll dismiss','add behavior preserved','disabled parts still preview','compact viewport bounds'],errors},null,2));console.log('All 114 model previews and search interactions passed.');
 }catch(error){if(page)await page.screenshot({path:path.join(out,'part-preview-failure.png')}).catch(()=>{});throw error;}
 finally{await app.close();if(path.dirname(profile)!==out||!path.basename(profile).startsWith('part-preview-'))throw Error('Invalid profile cleanup');await fs.rm(profile,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
