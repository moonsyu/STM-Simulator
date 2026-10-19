const {revealUiControl,clickUiControl}=require('./workbench-ui-actions.cjs');
const fs=require('node:fs/promises'),path=require('node:path'),net=require('node:net'),assert=require('node:assert/strict');
const {createHash}=require('node:crypto'),{chromium}=require('playwright'),{launch,terminate}=require('../desktop/process-tools.cjs');
(async()=>{
 const shard=process.env.RESET_AUDIT_SHARD?.split('/').map(Number);
 if(shard)assert.ok(shard.length===2&&shard.every(Number.isInteger)&&shard[1]>0&&shard[0]>=0&&shard[0]<shard[1],'RESET_AUDIT_SHARD must be index/count');
 const root=path.resolve(__dirname,'..'),out=path.join(root,'work/test-results'),exe=process.env.LAB_EXE||require('electron');await fs.mkdir(out,{recursive:true});
 const profile=await fs.mkdtemp(path.join(out,'reset-profile-')),errors=[];await fs.mkdir(path.join(profile,'updates'));await fs.writeFile(path.join(profile,'updates/settings.json'),'{"automatic":false}');
 const port=await new Promise(resolve=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const port=s.address().port;s.close(()=>resolve(port));});});
 const env={...process.env,CIRCUIT_LAB_SMOKE:'1',CIRCUIT_LAB_TEST_PROFILE:profile};delete env.ELECTRON_RUN_AS_NODE;
 const child=launch(exe,[...(process.env.LAB_EXE?[]:[root]),`--remote-debugging-port=${port}`,'--remote-debugging-address=127.0.0.1','--disable-background-timer-throttling','--disable-renderer-backgrounding'],{env,cwd:root});let browser;
 try{
  for(let i=0;i<300;i++){try{if((await fetch(`http://127.0.0.1:${port}/json/version`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,200));}
  browser=await chromium.connectOverCDP(`http://127.0.0.1:${port}`);const page=browser.contexts()[0].pages()[0];page.setDefaultTimeout(15000);await page.waitForSelector('.monaco-editor');page.on('pageerror',e=>errors.push(e.message));
  const {fixture}=await import('./docs-audit/runtime.mjs'),{applyDeviceExample}=await import('../src/device-assistance.js'),{resetMainCode}=await import('../src/code-reset.js');
  const {resetAuditCases,assertMinimal}=await import('./reset-audit-cases.mjs');
  const f=fixture('led');f.project.mcu.pins.PA5={function:'GPIO_Output',pull:'NOPULL',edge:'FALLING',initial:0,label:'keep'};
  f.project.code='#ifndef LD2_Pin\n#define LD2_Pin GPIO_PIN_5\n#endif\n#ifndef LD2_GPIO_Port\n#define LD2_GPIO_Port GPIOA\n#endif\n'+f.project.code;
  f.project.firmware.files=[{name:'notes.h',text:'#pragma once\n// keep this file\n'}];
  const applied=applyDeviceExample(f.project,f.target,{api:'HAL_GPIO_WritePin'}),p=applied.project,expected=resetMainCode(p);
  const click=selector=>clickUiControl(page,selector);
  const events=async()=>JSON.parse(JSON.stringify((await fs.readFile(path.join(profile,'diagnostics/events.jsonl'),'utf8')).trim().split('\n').filter(Boolean).map(JSON.parse)));
  const saved=async()=>{await page.waitForTimeout(300);return JSON.parse(await fs.readFile(path.join(profile,'diagnostics/latest-project.stm32lab'),'utf8'));};
  await page.locator('#file-input').setInputFiles({name:'reset.stm32lab',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(p))});await page.waitForFunction(code=>document.getElementById('code').value===code,p.code);
  await page.selectOption('#resize-target','part:selected');await click('[data-tab="docs"]');
  const pin=applied.binding.pins.PA5,card=page.locator('.docs-function').filter({has:page.locator('button[data-docs-apply="HAL_GPIO_WritePin"]')});
  assert.ok((await card.locator('pre').textContent()).includes(`GPIO${pin[1]}, GPIO_PIN_${Number(pin.slice(2))}, GPIO_PIN_SET`));
  await click('[data-tab="code"]');await page.selectOption('#source-file','notes.h');
  await click('#code-reset');assert.equal(await page.locator('#code-reset-dialog').isVisible(),true);assert.equal(await page.evaluate(()=>document.activeElement.id),'code-reset-cancel');
  await click('#code-reset-cancel');assert.equal((await saved()).code,p.code);
  await click('#code-reset');await page.locator('#code-reset-cancel').press('Escape');assert.equal(await page.locator('#code-reset-dialog').isVisible(),false);assert.equal((await saved()).code,p.code);
  await click('#code-reset');await click('#code-reset-confirm');assert.equal(await page.locator('#code-reset-dialog').isVisible(),false);
  let next=await saved();assert.equal(next.code,expected.code);for(const key of ['components','wires','mcu','surfaces','firmware'])assert.deepEqual(next[key],p[key],key);assert.equal(next.deviceDocs,undefined);assert.equal(await page.locator('#source-file').inputValue(),'main.c');
  assertMinimal(next);assert.doesNotMatch(next.code,/\bLD2_(?:Pin|GPIO_Port)\b/);assert.equal(next.mcu.pins[pin].label,'LD2');
  await click('#undo');assert.equal((await saved()).code,p.code);await click('#redo');assert.equal((await saved()).code,expected.code);
  const run=async(ms=200,acceptState)=>{
   const firstEvent=(await events()).length;
   const states=async()=>{const rows=(await events()).slice(firstEvent),start=rows.findIndex(e=>e.type==='simulation.started');return start<0?[]:rows.slice(start+1).filter(e=>e.type==='simulation.state');};
   await click('#run');await page.waitForFunction(ms=>parseFloat(document.getElementById('sim-time').textContent)*1000>=ms,ms,{polling:25});assert.equal(await page.locator('#code-reset').isDisabled(),true);
   let accepted;
   if(acceptState){
    const deadline=Date.now()+15000;let observed=[];
    do{observed=await states();accepted=observed.find(e=>e.detail.simulationMs>=ms&&acceptState(e));if(accepted)break;await page.waitForTimeout(100);}while(Date.now()<deadline);
    assert.ok(accepted,'Expected motor phase was not recorded in this run: '+JSON.stringify(observed.map(e=>({simulationMs:e.detail.simulationMs,parts:e.detail.parts}))));
   }
   await click('#run');await page.waitForTimeout(200);return accepted||(await states()).at(-1);
  };
  const off=await run();assert.equal(off.detail.parts.selected.on,false);
  await page.selectOption('#resize-target','part:selected');await click('[data-tab="docs"]');await click('[data-docs-apply="HAL_GPIO_WritePin"]');await page.waitForFunction(()=>document.getElementById('docs-result').textContent.includes('적용 완료'));
  next=await saved();assert.deepEqual(next.components,p.components);assert.deepEqual(next.wires,p.wires);
  assert.doesNotMatch(next.code,/\bLD2_(?:Pin|GPIO_Port)\b/);
  const on=await run();assert.equal(on.detail.parts.selected.on,true);
  const remapped=[];
  for(const type of ['stepper','l298n']){
   const {project}=fixture(type),occupied=type==='stepper'?'PB3':'PB4';project.mcu.pins[occupied]={function:'GPIO_Output',pull:'NOPULL',edge:'FALLING',initial:0,label:'keep'};
   await page.locator('#file-input').setInputFiles({name:type+'.stm32lab',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(project))});await page.waitForFunction(code=>document.getElementById('code').value===code,project.code);
   await page.selectOption('#resize-target','part:selected');await click('[data-tab="docs"]');await click('#docs-apply-all');await page.waitForFunction(()=>document.getElementById('docs-result').textContent.includes('적용 완료'));
   const reverseMotors=event=>{const parts=event.detail.parts,motors=Object.values(parts).filter(p=>'rpm'in p);return motors.some(p=>p.rpm>500)&&motors.some(p=>p.rpm< -500)&&parts.selected.channels?.A.mode==='reverse'&&parts.selected.channels?.B.mode==='forward';};
   const circuit=await saved(),state=await run(type==='l298n'?3500:2500,type==='l298n'?reverseMotors:undefined);assert.notEqual(circuit.deviceDocs.bindings[0].pins[occupied][1],'B');
   if(type==='stepper'){assert.ok(state.detail.parts.selected.steps>0);assert.match(await page.locator('#console-output').textContent(),/direction=-1/);assert.match(await page.locator('#console-output').textContent(),/direction=1/);}
   else{const motors=Object.values(state.detail.parts).filter(p=>'rpm'in p);assert.ok(motors.some(p=>p.rpm>500));assert.ok(motors.some(p=>p.rpm< -500));assert.equal(state.detail.parts.selected.channels.A.mode,'reverse');assert.equal(state.detail.parts.selected.channels.B.mode,'forward');}
   remapped.push({type,circuit,state});
  }
  await click('#new');if(await page.locator('#replace-dialog').isVisible())await click('#replace-confirm');
  await page.waitForSelector('#project-dialog[open]');await page.fill('#new-project-name','No unused pin aliases');await page.selectOption('#new-project-template','blink');await click('#project-create');await page.waitForSelector('#project-dialog',{state:'hidden'});
  const created=await saved();assert.equal(created.mcu.pins.PA5.label,'LD2');
  for(const source of [created.code,...created.firmware.files.map(f=>f.text)])assert.doesNotMatch(source,/\bLD2_(?:Pin|GPIO_Port)\b/);
  const recorded=await events(),reset=recorded.find(e=>e.type==='code.reset');assert.ok(reset);assert.equal(reset.detail.preservedWires,p.wires.length);assert.equal(recorded.filter(e=>e.type==='code.reset').length,1);assert.deepEqual(errors,[]);
  const resetAudit=[];
  if(process.argv.includes('--all-resets'))for(const [id,source]of resetAuditCases().filter((_,i)=>!shard||i%shard[1]===shard[0])){
   await page.locator('#file-input').setInputFiles({name:id+'.stm32lab',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(source))});await page.waitForFunction(code=>document.getElementById('code').value===code,source.code);
   await click('#code-reset');await click('#code-reset-confirm');const clean=await saved();assertMinimal(clean);
   for(const key of ['mcu','components','wires','firmware','surfaces'])assert.deepEqual(clean[key],source[key],id+': '+key);
   const state=await run(100);assert.ok(state);assert.equal(state.detail.fault,false,id);
   const resetEvent=(await events()).filter(e=>e.type==='code.reset').at(-1);assert.ok(resetEvent);
   resetAudit.push({id,passed:true,code:clean.code,mcu:clean.mcu,state,resetEvent});
   console.log('PASS reset '+id);
  }
  assert.deepEqual(errors,[]);
  const version=(await page.evaluate(()=>window.appUpdates.state())).currentVersion;
  const report={passed:true,version,exeSha256:createHash('sha256').update(await fs.readFile(exe)).digest('hex'),packaged:!!process.env.LAB_EXE,checks:['remapped Docs preview','cancel and Escape preserve code','default focus on Cancel','main reset from helper tab','unused aliases removed while pin labels preserved','circuit/config/files preserved','undo/redo','disabled during execution','LED off after reset','reapply without duplicate parts/wires or aliases','LED on after Docs apply','persisted code.reset and simulation.state','split-port stepper and L298N motion','new project main.c and main.h contain no unused aliases'],reset,off,on,remapped,created,resetAudit,errors,events:recorded};
  const reportName=(process.env.LAB_EXE?'code-reset-public':'code-reset-dev')+(shard?'-'+shard[0]:'')+'.json';
  await fs.writeFile(path.join(out,reportName),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:true,version,checks:report.checks,ledOff:off.detail.parts.selected,ledOn:on.detail.parts.selected}));
 }finally{await browser?.close().catch(()=>{});await terminate(child);}
})().catch(e=>{console.error(e);process.exitCode=1;});
