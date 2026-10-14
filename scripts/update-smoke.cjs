const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {_electron}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const root=path.resolve(__dirname,'..'),out=path.join(root,'work','test-results');await fs.mkdir(out,{recursive:true});
 const temp=await fs.mkdtemp(path.join(out,'update-ui-')),profile=path.join(temp,'profile'),parent=path.join(temp,'projects');await fs.mkdir(parent);
 const env={...process.env,CIRCUIT_LAB_SMOKE:'1',CIRCUIT_LAB_TEST_PROFILE:profile};delete env.ELECTRON_RUN_AS_NODE;
 const app=await _electron.launch({executablePath:path.join(root,'node_modules/electron/dist/electron.exe'),args:[root],cwd:root,env});let page;
 try{
  page=await app.firstWindow();const errors=[];page.on('pageerror',error=>errors.push(error.message));await page.waitForSelector('.monaco-editor');await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].showInactive());
  await page.click('#app-update');assert.match(await page.locator('#update-status').textContent(),/포터블/);assert.equal(await page.locator('#update-check').isDisabled(),true);await page.click('#update-close');
  await page.click('#new');await page.fill('#new-project-name','Update Test');await app.evaluate(({dialog},directory)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[directory]});},parent);await page.click('#project-folder-choose');await page.click('#project-create');await page.waitForSelector('#project-dialog',{state:'hidden'});
  await page.locator('.monaco-editor .inputarea').focus();await page.keyboard.press('Control+a');await page.keyboard.insertText('int update_saved = 42;\nint main(void) { return update_saved; }\n');
  // Substitute IPC responses only inside this test; no production test feed or executable is used.
  await app.evaluate(({ipcMain,BrowserWindow})=>{
   const state={phase:'ready',currentVersion:'0.16.0',latestVersion:'0.17.0',automatic:true,message:'새 버전 준비 완료',progress:100};
   for(const name of ['state','install','configure'])ipcMain.removeHandler('update:'+name);
   ipcMain.handle('update:state',()=>state);
   ipcMain.handle('update:install',()=>{throw new Error('TEST: keep app open');});
   ipcMain.handle('update:configure',(_event,value)=>({...state,automatic:value}));
   BrowserWindow.getAllWindows()[0].webContents.send('update:state',state);
  });
  await page.click('#app-update');await page.waitForSelector('#update-install:visible');await page.click('#update-automatic');assert.equal(await page.locator('#update-automatic').isChecked(),false);
  await page.screenshot({path:path.join(out,'update-ready.png')});
  await page.click('#update-install');await page.waitForFunction(()=>document.getElementById('update-error').textContent.includes('TEST: keep app open'));
  assert.match(await page.evaluate(()=>localStorage.getItem('stm32lab.project.v2')),/update_saved/);
  assert.match(await fs.readFile(path.join(parent,'Update Test','main.c'),'utf8'),/update_saved/);
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setContentSize(1024,640));assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:path.join(out,'update-compact.png')});
  assert.deepEqual(errors,[]);
  await fs.writeFile(path.join(out,'update-ui-check.json'),JSON.stringify({passed:true,checks:['Development build disables automatic updates','Ready state via IPC, preference and dialog','Synchronous project cache and workspace sources saved before install','Installation errors retain the open app','1024px layout without horizontal overflow'],errors},null,2));
  console.log('Update UI passed: status, preferences, save-before-restart, errors and compact layout.');
 }catch(error){if(page)await page.screenshot({path:path.join(out,'update-ui-failure.png')}).catch(()=>{});throw error;}
 finally{await app.close();if(path.dirname(temp)!==out||!path.basename(temp).startsWith('update-ui-'))throw new Error('Invalid test cleanup path');await fs.rm(temp,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
