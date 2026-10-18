// Regression checks for storage, close and workspace transitions. Isolated profiles only.
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {_electron}=require('playwright');
const {createWorkspace,saveWorkspace,openWorkspace}=require('../desktop/workspace.cjs');
const {fillCode,newProject}=require('./smoke-fixture.cjs');
(async()=>{
 const root=path.resolve(__dirname,'..'),out=path.join(root,'work/test-results');await fs.mkdir(out,{recursive:true});
 const temp=await fs.mkdtemp(path.join(out,'non-device-audit-')),profile=path.join(temp,'profile');
 const {blankProject}=await import('../src/project.js');const findings=[];
 let app,page;
 const env={...process.env,CIRCUIT_LAB_SMOKE:'1',CIRCUIT_LAB_TEST_PROFILE:profile};delete env.ELECTRON_RUN_AS_NODE;
 const launch=async()=>{app=await _electron.launch({executablePath:path.join(root,'node_modules/electron/dist/electron.exe'),args:[root],cwd:root,env});page=await app.firstWindow();await page.waitForSelector('.monaco-editor');};
 try{
  const old=blankProject();old.code='int main(void) { return 1; }\n';
  const state=await createWorkspace(temp,'partial-save',JSON.stringify(old)),updated=structuredClone(old);updated.code='int main(void) { return 2; }\n';
  const rename=fs.rename;let injected=false;
  try{fs.rename=async(from,to)=>{if(to===path.join(state.directory,'main.c')&&!injected){injected=true;throw Object.assign(new Error('Injected locked main.c'),{code:'EACCES'});}return rename(from,to);};await assert.rejects(saveWorkspace(state,JSON.stringify(updated)),/Injected/);}finally{fs.rename=rename;}
  const jsonCode=JSON.parse(await fs.readFile(path.join(state.directory,'project.stm32lab'),'utf8')).code;
  const sourceCode=await fs.readFile(path.join(state.directory,'main.c'),'utf8');assert.equal(jsonCode,old.code);assert.equal(sourceCode,old.code);
  let retryError;try{await saveWorkspace(state,JSON.stringify(updated));}catch(error){retryError=error.message;}assert.equal(retryError,undefined);
  assert.equal(JSON.parse((await openWorkspace(state.directory)).text).code,updated.code);
  findings.push({id:'A01',passed:true,rolledBack:true,retrySavedNewCode:true});console.log('A01: rollback and retry passed.');

  const workspace=await createWorkspace(temp,'workspace-a',JSON.stringify(old));await launch();
  await app.evaluate(({dialog},directory)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[directory]});},workspace.directory);
  await page.click('#workspace-open');await page.waitForFunction(()=>document.getElementById('workspace-path').textContent.includes('workspace-a'));
  // One normal save, followed by another edit within the typing checkpoint window.
  const codeA='int main(void) { return 31; }\n',codeB='int main(void) { return 32; }\n';
  await fillCode(page,codeA);await page.locator('#save').evaluate(el=>el.click());await page.waitForFunction(()=>document.getElementById('console-output').textContent.includes('회로 파일을 저장했습니다.'));
  await fillCode(page,codeB);await page.locator('#new').evaluate(el=>el.click());
  const replaceVisible=await page.locator('#replace-dialog').isVisible(),createVisible=await page.locator('#project-dialog').isVisible();
  assert.equal(replaceVisible,true);assert.equal(createVisible,false);await page.click('#replace-cancel');assert.equal(await page.locator('#code').inputValue(),codeB);await page.click('#new');await page.click('#replace-confirm');assert.equal(await fs.readFile(path.join(workspace.directory,'main.c'),'utf8'),codeA);
  await page.selectOption('#new-project-template','blank');await page.click('#project-create');await page.waitForSelector('#project-dialog',{state:'hidden'});assert.notEqual(await page.locator('#code').inputValue(),codeB);
  findings.push({id:'A02',passed:true,unsavedWarningShown:true,cancelPreservedCode:true});console.log('A02: quick edit protection passed.');

  assert.equal(await page.locator('#workspace-path').textContent(),'미저장 프로젝트');await page.click('[data-monitor="native"]');await page.click('#terminal-start');
  await page.waitForFunction(()=>!document.getElementById('terminal-close').disabled);await page.fill('#native-input','cd');await page.locator('#native-input-form button').click();
  await page.waitForFunction(()=>document.getElementById('native-output').textContent.includes('chcp')||document.getElementById('native-output').textContent.includes('Windows'));await page.waitForTimeout(400);const terminalOutput=await page.locator('#native-output').innerText();assert.ok(terminalOutput.toLowerCase().includes(profile.toLowerCase()));assert.ok(!terminalOutput.toLowerCase().includes(workspace.directory.toLowerCase()));findings.push({id:'A04',passed:true,terminalUsesNewProfile:true,terminalOutput});console.log('A04: terminal cwd cleared.');await page.click('#terminal-close');await newProject(page);

  const persisted='int main(void) { return 101; }\n',lastEdit='int main(void) { return 102; }\n';await fillCode(page,persisted);await page.waitForFunction(()=>document.getElementById('save-state').textContent==='자동 저장됨');
  const closed=app.waitForEvent('close');await page.evaluate(code=>{const el=document.getElementById('code');el.value=code;el.dispatchEvent(new Event('input',{bubbles:true}));window.close();},lastEdit).catch(error=>{if(!/closed/i.test(error.message))throw error;});await closed;app=null;
  await launch();const restored=await page.locator('#code').inputValue();assert.equal(restored,lastEdit);
  findings.push({id:'A03',passed:true,lastEditRestored:true});console.log('A03: close flush passed.');
  await fs.writeFile(path.join(out,'storage-recovery.json'),JSON.stringify({passed:true,date:new Date().toISOString(),findings},null,2));
 }finally{if(app)await app.close();if(path.dirname(temp)!==out||!path.basename(temp).startsWith('non-device-audit-'))throw Error('Unsafe cleanup path');await fs.rm(temp,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
