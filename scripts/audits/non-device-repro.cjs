// Manual audit probes for known, unfixed issues. This is deliberately not a CI
// pass/fail regression suite: assertions confirm the recorded faulty behavior.
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {_electron}=require('playwright');
const {createWorkspace,saveWorkspace,openWorkspace}=require('../../desktop/workspace.cjs');
const {fillCode,newProject}=require('../smoke-fixture.cjs');
(async()=>{
 const root=path.resolve(__dirname,'../..'),out=path.join(root,'work/test-results');await fs.mkdir(out,{recursive:true});
 const temp=await fs.mkdtemp(path.join(out,'non-device-audit-')),profile=path.join(temp,'profile');
 const {blankProject}=await import('../../src/project.js');const findings=[];
 let app,page;
 const env={...process.env,CIRCUIT_LAB_SMOKE:'1',CIRCUIT_LAB_TEST_PROFILE:profile};delete env.ELECTRON_RUN_AS_NODE;
 const launch=async()=>{app=await _electron.launch({executablePath:path.join(root,'node_modules/electron/dist/electron.exe'),args:[root],cwd:root,env});page=await app.firstWindow();await page.waitForSelector('.monaco-editor');};
 try{
  const old=blankProject();old.code='int main(void) { return 1; }\n';
  const state=await createWorkspace(temp,'partial-save',JSON.stringify(old)),updated=structuredClone(old);updated.code='int main(void) { return 2; }\n';
  const rename=fs.rename;let injected=false;
  try{fs.rename=async(from,to)=>{if(to===path.join(state.directory,'main.c')&&!injected){injected=true;throw Object.assign(new Error('Injected locked main.c'),{code:'EACCES'});}return rename(from,to);};await assert.rejects(saveWorkspace(state,JSON.stringify(updated)),/Injected/);}finally{fs.rename=rename;}
  const jsonCode=JSON.parse(await fs.readFile(path.join(state.directory,'project.stm32lab'),'utf8')).code;
  const sourceCode=await fs.readFile(path.join(state.directory,'main.c'),'utf8');assert.equal(jsonCode,updated.code);assert.equal(sourceCode,old.code);
  let retryError;try{await saveWorkspace(state,JSON.stringify(updated));}catch(error){retryError=error.message;}assert.match(retryError,/앱 밖에서 변경/);
  assert.equal(JSON.parse((await openWorkspace(state.directory)).text).code,old.code);
  findings.push({id:'AUDIT-01',confirmed:true,method:'Injected one EACCES on main.c rename in an isolated workspace',projectJsonContainsNewCode:true,mainCContainsOldCode:true,retryError,reopenedCodeIsOld:true});console.log('AUDIT-01: partial save, blocked retry and old source on reopen reproduced.');

  const workspace=await createWorkspace(temp,'workspace-a',JSON.stringify(old));await launch();
  await app.evaluate(({dialog},directory)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[directory]});},workspace.directory);
  await page.click('#workspace-open');await page.waitForFunction(()=>document.getElementById('workspace-path').textContent.includes('workspace-a'));
  // One normal save, followed by another edit within the typing checkpoint window.
  const codeA='int main(void) { return 31; }\n',codeB='int main(void) { return 32; }\n';
  await fillCode(page,codeA);await page.locator('#save').evaluate(el=>el.click());await page.waitForFunction(()=>document.getElementById('console-output').textContent.includes('회로 파일을 저장했습니다.'));
  await fillCode(page,codeB);await page.locator('#new').evaluate(el=>el.click());
  const replaceVisible=await page.locator('#replace-dialog').isVisible(),createVisible=await page.locator('#project-dialog').isVisible();
  assert.equal(replaceVisible,false);assert.equal(createVisible,true);assert.equal(await fs.readFile(path.join(workspace.directory,'main.c'),'utf8'),codeA);
  await page.selectOption('#new-project-template','blank');await page.click('#project-create');await page.waitForSelector('#project-dialog',{state:'hidden'});assert.notEqual(await page.locator('#code').inputValue(),codeB);
  findings.push({id:'AUDIT-02',confirmed:true,method:'Edit, save, edit again within 1 second, New Project',unsavedWarningShown:replaceVisible,fileContainsEarlierCode:true,laterEditDiscarded:true});console.log('AUDIT-02: edit after quick save bypasses unsaved-change warning.');

  assert.equal(await page.locator('#workspace-path').textContent(),'미저장 프로젝트');await page.click('[data-monitor="native"]');await page.click('#terminal-start');
  await page.waitForFunction(()=>!document.getElementById('terminal-close').disabled);await page.fill('#native-input','cd');await page.locator('#native-input-form button').click();
  await page.waitForFunction(directory=>document.getElementById('native-output').textContent.toLowerCase().includes(directory.toLowerCase()),workspace.directory);
  findings.push({id:'AUDIT-03',confirmed:true,method:'Open workspace A, create unsaved project B, start terminal, run cd',uiWorkspace:'미저장 프로젝트',terminalStillUsesPreviousWorkspace:true,terminalOutput:await page.locator('#native-output').innerText()});
  console.log('AUDIT-03: new project terminal still uses workspace A.');await page.click('#terminal-close');await newProject(page);

  const persisted='int main(void) { return 101; }\n',lastEdit='int main(void) { return 102; }\n';await fillCode(page,persisted);await page.waitForFunction(()=>document.getElementById('save-state').textContent==='자동 저장됨');
  const closed=app.waitForEvent('close');await page.evaluate(code=>{const el=document.getElementById('code');el.value=code;el.dispatchEvent(new Event('input',{bubbles:true}));window.close();},lastEdit).catch(error=>{if(!/closed/i.test(error.message))throw error;});await closed;app=null;
  await launch();const restored=await page.locator('#code').inputValue();assert.equal(restored,persisted);
  findings.push({id:'AUDIT-04',confirmed:true,method:'Close normal app window immediately after edit, reopen the same isolated profile',previousAutosaveRestored:true,lastEditLost:true});console.log('AUDIT-04: closing before the 200 ms autosave loses last edit.');
  await fs.writeFile(path.join(out,'non-device-audit.json'),JSON.stringify({date:'2026-10-15',purpose:'Known issue reproduction; these findings remain unfixed',findings},null,2));
 }finally{if(app)await app.close();if(path.dirname(temp)!==out||!path.basename(temp).startsWith('non-device-audit-'))throw Error('Unsafe cleanup path');await fs.rm(temp,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
