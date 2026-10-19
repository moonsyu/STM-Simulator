const {revealUiControl,clickUiControl}=require('./workbench-ui-actions.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {execFileSync}=require('node:child_process'),{createHash}=require('node:crypto');
const {_electron}=require('playwright');
const {saveProject,openProject}=require('./smoke-fixture.cjs');
(async()=>{
 const root=path.resolve(__dirname,'..'),version=require('../package.json').version,runId=new Date().toISOString().replace(/[:.]/g,'-');
 const out=path.resolve(root,process.env.MCU_DEFAULTS_OUT||`work/test-results/mcu-defaults-${version}-${runId}`);await fs.mkdir(out,{recursive:true});
 const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
 const sourceFiles=['src/pinout-ui.js','src/mcu-config.js','src/hal-generator.js','src/hal.js','src/hal-timers.js'];
 const sourceHashes=Object.fromEntries(await Promise.all(sourceFiles.map(async file=>[file,createHash('sha256').update(await fs.readFile(path.join(root,file))).digest('hex')])));
 const evidence={passed:false,version,appVersion:null,packaged:!!process.env.LAB_EXE,runId,startedAt:new Date().toISOString(),sourceCommit:git('rev-parse','HEAD'),sourceDirty:!!git('status','--porcelain'),sourceHashes};
 const profile=await fs.mkdtemp(path.join(out,'mcu-defaults-profile-')),env={...process.env,CIRCUIT_LAB_SMOKE:'1',CIRCUIT_LAB_TEST_PROFILE:profile};delete env.ELECTRON_RUN_AS_NODE;
 const app=await _electron.launch({executablePath:process.env.LAB_EXE||path.join(root,'node_modules/electron/dist/electron.exe'),args:process.env.LAB_EXE?[]:[root],cwd:root,env});
 try{
  const page=await app.firstWindow(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.waitForSelector('.monaco-editor');await app.evaluate(({BrowserWindow})=>{const window=BrowserWindow.getAllWindows()[0];window.showInactive();window.setIgnoreMouseEvents(true);});
  evidence.appVersion=await app.evaluate(({app})=>app.getVersion());assert.equal(evidence.appVersion,version,'MCU audit must record the version actually executed');
  await clickUiControl(page, '#pinout-open');assert.equal(await page.inputValue('#timer-clock'),'16000000');assert.equal(await page.locator('[data-peripheral]:checked').count(),0);assert.equal(await page.locator('[data-irq]:checked').count(),0);
  for(const id of ['TIM2','TIM3','TIM4','TIM5']){
    assert.equal(await page.inputValue(`[data-peripheral-value="${id}"][data-key="prescaler"]`),'0');
    assert.equal(await page.inputValue(`[data-peripheral-value="${id}"][data-key="period"]`),['TIM2','TIM5'].includes(id)?'4294967295':'65535');
  }
  for(const id of ['TIM2','TIM3','TIM4','TIM5'])await page.check(`[data-peripheral="${id}"]`);
  await page.click('[data-config-pin="PA6"]');await page.selectOption('#pin-function','TIM3_CH1');await page.check('[data-peripheral="TIM3"]');await page.selectOption('[data-timer-mode="TIM3"]','pwm');
  const field=key=>`[data-peripheral-value="TIM3"][data-key="${key}"]`;
  assert.equal(await page.inputValue(field('pulse')),'0');assert.equal(await page.getAttribute(field('period'),'max'),'65535');
  const card=page.locator('.peripheral-card').filter({has:page.locator('[data-peripheral="TIM3"]')});assert.match(await card.textContent(),/초기 ARR/);assert.doesNotMatch(await card.textContent(),/ARR=0: 카운터 정지/);
  await page.fill(field('period'),'0');await page.locator(field('period')).press('Tab');assert.match(await card.textContent(),/ARR=0: 카운터 정지/);
  for(const [key,value]of [['prescaler','15'],['period','999'],['pulse','250']]){await page.fill(field(key),value);await page.locator(field(key)).press('Tab');}
  assert.doesNotMatch(await card.textContent(),/ARR=0: 카운터 정지/);
  await page.screenshot({path:path.join(out,'mcu-defaults-desktop.png')});
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1024,640));await page.screenshot({path:path.join(out,'mcu-defaults-compact.png')});
  await page.click('#hal-generate');await page.click('#hal-replace-confirm');const code=await page.inputValue('#code');assert.match(code,/RCC_PLL_OFF/);assert.match(code,/htim3.Init.Prescaler = 15/);assert.match(code,/htim3.Init.Period = 999/);assert.match(code,/channel.Pulse = 250/);
  await clickUiControl(page, '#firmware-check');assert.match(await page.locator('#build-status').textContent(),/통과/);await page.click('#run');await page.waitForFunction(()=>document.getElementById('run-status').textContent==='실행 중');await page.click('#run');
  const saved=path.join(out,'mcu-defaults-round-trip.stm32lab');await app.evaluate(({dialog},file)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:file});dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},saved);
  await saveProject(page);const doc=JSON.parse(await fs.readFile(saved,'utf8'));assert.equal(doc.mcu.timerClockHz,16000000);assert.equal(doc.mcu.peripherals.TIM3.pulse,250);assert.equal(doc.mcu.peripherals.TIM3.period,999);
  await openProject(page);await clickUiControl(page, '#pinout-open');assert.equal(await page.inputValue(field('pulse')),'250');await page.click('#pinout-close');
  await (await revealUiControl(page, '#hal-example')).selectOption('timer');await clickUiControl(page, '#pinout-open');assert.equal(await page.inputValue('#timer-clock'),'84000000');assert.equal(await page.inputValue('[data-peripheral-value="TIM2"][data-key="prescaler"]'),'8399');assert.equal(await page.inputValue('[data-peripheral-value="TIM2"][data-key="period"]'),'999');assert.deepEqual(errors,[]);
  evidence.passed=true;evidence.checks=['CubeMX fields, disabled peripherals/IRQs and activation','PWM initial pulse input','ARR zero helper updates','HSI HAL generation and simulator run','configured values persist on reopen','84 MHz example remains explicit'];console.log('MCU defaults UI passed');
 }catch(error){evidence.error=error.stack;throw error;}
 finally{await app.close();evidence.finishedAt=new Date().toISOString();await fs.writeFile(path.join(out,'mcu-defaults-smoke.json'),JSON.stringify(evidence,null,2));for(const name of ['events.jsonl','events.previous.jsonl'])await fs.copyFile(path.join(profile,'diagnostics',name),path.join(out,name)).catch(error=>{if(error.code!=='ENOENT')throw error;});const rel=path.relative(out,profile);if(!rel.startsWith('..')&&!path.isAbsolute(rel)&&path.basename(profile).startsWith('mcu-defaults-profile-'))await fs.rm(profile,{recursive:true,force:true});console.log('MCU defaults evidence: '+out);}
})().catch(e=>{console.error(e);process.exitCode=1;});
