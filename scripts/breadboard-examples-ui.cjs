const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {launchWorkbenchRuntime}=require('./workbench-electron-runtime.cjs');
const {openFixture,chooseHal}=require('./smoke-fixture.cjs');
const {clickUiControl}=require('./workbench-ui-actions.cjs');
(async()=>{
 const root=path.resolve(__dirname,'..'),out=path.join(root,'work/test-results/breadboard-layout/ui');await fs.mkdir(out,{recursive:true});
 const profile=await fs.mkdtemp(path.join(out,'profile-')),execution={},app=await launchWorkbenchRuntime({root,profile,execution,env:{...process.env,CIRCUIT_LAB_SMOKE:'1',CIRCUIT_LAB_TEST_PROFILE:profile}}),rows=[],errors=[];
 const events=async()=>{const text=await fs.readFile(path.join(profile,'diagnostics/events.jsonl'),'utf8');return text.split('\n').filter(Boolean).map(x=>JSON.parse(x));};
 let page;
 try{
  page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));await page.waitForSelector('.monaco-editor');
  await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];w.setContentSize(1500,1000);w.showInactive();w.setIgnoreMouseEvents(true);});
  const {fixture}=await import('./docs-audit/runtime.mjs');
  for(const type of ['led','potentiometer','lcd','ultrasonic','sevenseg','ref_motor_driver_hat']){
   const started=new Date().toISOString(),{project}=fixture(type);await openFixture(page,project);await page.selectOption('#resize-target','part:selected');await page.click('[data-tab="docs"]');
   if(type==='led'){const card=page.locator('.docs-function').filter({has:page.locator('[data-docs-apply="HAL_GPIO_WritePin"]')});await card.locator('summary').click();await card.locator('[data-docs-apply]').click();}else await page.click('#docs-apply-all');
   const message=await page.locator('#docs-result').textContent();assert.match(message,/적용 완료/,type+' '+message);
   await page.waitForFunction(()=>document.getElementById('save-state').dataset.state==='saved');
   const p=await page.evaluate(()=>JSON.parse(localStorage.getItem('stm32lab.project.v2')));await fs.writeFile(path.join(out,type+'.stm32lab'),JSON.stringify(p,null,2));
   await page.click('[data-panel="simulator"] .dock-maximize');await clickUiControl(page,'#zoom-reset');await page.click('#run');
   await page.waitForFunction(()=>parseFloat(document.getElementById('sim-time').textContent)>=3.1,undefined,{timeout:30000});
   await page.screenshot({path:path.join(out,type+'.png')});await page.click('#run');await page.waitForTimeout(250);
   const log=(await events()).filter(e=>e.time>=started),states=log.filter(e=>e.type==='simulation.state');assert.ok(states.length,type+' logged state');assert.ok(states.every(e=>!e.detail.fault),type+' no circuit fault');assert.ok(log.some(e=>e.type==='docs.applied'));assert.ok(log.some(e=>e.type==='simulation.started'));
   if(type==='led')assert.ok(states.some(e=>e.detail.parts.selected?.on));
   await fs.writeFile(path.join(out,type+'.jsonl'),log.map(e=>JSON.stringify(e)).join('\n')+'\n');rows.push({type,applied:message,states:states.length,last:states.at(-1).detail,passed:true});
   await page.click('[data-panel="simulator"] .dock-maximize');console.log(type+' passed');
  }
  await chooseHal(page,'timer_capture');await page.waitForFunction(()=>document.getElementById('save-state').dataset.state==='saved');const loopback=await page.evaluate(()=>JSON.parse(localStorage.getItem('stm32lab.project.v2')));assert.equal(loopback.wires.length,2);assert.ok(loopback.wires.every(w=>w.from.includes('bb:')||w.to.includes('bb:')));await page.click('#run');await page.waitForFunction(()=>parseFloat(document.getElementById('sim-time').textContent)>=1);await page.click('#run');
  assert.deepEqual(errors,[]);
 }finally{await fs.writeFile(path.join(out,'summary.json'),JSON.stringify({version:require('../package.json').version,execution,profile,rows,errors},null,2));await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
