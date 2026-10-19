const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {_electron}=require('playwright');
const {checkEditorTheme}=require('./editor-theme-check.cjs');
(async()=>{
 const root=path.resolve(__dirname,'..'),out=path.join(root,'work/test-results');await fs.mkdir(out,{recursive:true});const profile=await fs.mkdtemp(path.join(out,'colorscheme-'));
 const env={...process.env,CIRCUIT_LAB_SMOKE:'1',CIRCUIT_LAB_TEST_PROFILE:profile};delete env.ELECTRON_RUN_AS_NODE;
 const app=await _electron.launch({executablePath:process.env.LAB_EXE||path.join(root,'node_modules/electron/dist/electron.exe'),args:process.env.LAB_EXE?[]:[root],cwd:root,env});
 try{
  const page=await app.firstWindow(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.waitForSelector('.monaco-editor');
  await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];w.setContentSize(1440,950);w.showInactive();});
  await page.click('[data-tab="settings"]');await page.selectOption('#pref-appearance','light');await checkEditorTheme(page,'github-light');
  // Seed the exact previously shipped preference payload, then reload through
  // the ordinary startup path to test an existing installation's migration.
  const legacy=JSON.parse(await fs.readFile(path.join(root,'tests/fixtures/github-light-legacy.json'),'utf8'));
  await page.evaluate(legacy=>{const key='stm32lab.idePreferences.v1',prefs=JSON.parse(localStorage.getItem(key));prefs.themes=prefs.themes.map(theme=>theme.id==='github-light'?legacy:theme);localStorage.setItem(key,JSON.stringify(prefs));},legacy);
  await page.reload();await page.waitForSelector('.monaco-editor');await checkEditorTheme(page,'github-light');
  await page.click('[data-tab="settings"]');await page.selectOption('#pref-appearance','dark');await checkEditorTheme(page,'jellybean');
  await page.click('[data-tab="settings"]');await page.selectOption('#pref-appearance','dark');assert.match(await page.locator('#colorscheme-source').textContent(),/nanotech\/jellybeans.vim.*ef83bf4/);
  const prefs=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('stm32lab.idePreferences.v1')));
  await page.locator('#colorscheme-file').setInputFiles(path.join(root,'src/themes/jellybeans/jellybeans.vim'));await page.waitForFunction(()=>document.getElementById('ide-settings-status').textContent==='Colorscheme 등록 및 적용 완료');
  let state=await prefs();assert.equal(state.themes.at(-1).editor.rules.find(r=>r.token==='comment').fontStyle,'italic');
  const theme={name:'Imported Violet',base:'vs-dark',inherit:true,rules:[{token:'comment',foreground:'bb88dd',fontStyle:'italic'},{token:'function',foreground:'ffaa00'}],colors:{'editor.background':'#201030','editor.foreground':'#fff0ff','editor.selectionBackground':'#604080'}};
  await page.locator('#colorscheme-file').setInputFiles({name:'violet.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(theme))});await page.waitForFunction(()=>document.querySelector('#theme-name').value==='Imported Violet');
  assert.equal(await page.locator('.monaco-editor').first().evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(32, 16, 48)');const selected=(await prefs()).theme;
  const exported=path.join(profile,'colorscheme.json');await app.evaluate(({dialog},file)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:file});},exported);await page.click('#colorscheme-export');await page.waitForFunction(()=>document.getElementById('ide-settings-status').textContent==='테마 JSON 내보내기 완료');assert.equal(JSON.parse(await fs.readFile(exported,'utf8')).rules[0].fontStyle,'italic');
  await page.reload();await page.waitForSelector('.monaco-editor');assert.equal(await page.evaluate(()=>document.documentElement.dataset.colorscheme),selected);await page.click('[data-tab="settings"]');
  await page.locator('#colorscheme-file').setInputFiles({name:'unsafe.vim',mimeType:'text/plain',buffer:Buffer.from('!calc.exe')});await page.waitForFunction(()=>document.getElementById('ide-settings-error').textContent.includes('동적'));assert.equal((await prefs()).theme,selected);
  await page.locator('#colorscheme-file').setInputFiles({name:'snow.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({name:'Snow',type:'light',colors:{'editor.background':'#f0f0f0'},tokenColors:[{scope:'keyword',settings:{foreground:'#ff0000'}}]}))});await page.waitForFunction(()=>document.getElementById('theme-name').value==='Snow');
  await page.selectOption('#pref-theme','jellybean');assert.equal(await page.locator('.monaco-editor').first().evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(21, 21, 21)');
  await page.click('#theme-add');await page.fill('#color-function','#11ccff');await page.locator('#color-function').dispatchEvent('change');await page.click('[data-tab="code"]');
  await page.locator('#code').evaluate(el=>{el.value='int main(void) {\n  // Imported theme\n  return 0;\n}';el.dispatchEvent(new Event('input',{bubbles:true}));});
  await page.waitForFunction(()=>[...document.querySelectorAll('.view-line span')].some(el=>el.textContent==='main'&&getComputedStyle(el).color==='rgb(17, 204, 255)'));
  await page.waitForFunction(()=>[...document.querySelectorAll('.view-line span')].some(el=>el.textContent.includes('Imported')&&getComputedStyle(el).fontStyle==='italic'));
  await page.click('[data-tab="settings"]');await page.locator('#ide-settings-panel').evaluate(el=>{el.scrollTop=0;});await page.screenshot({path:path.join(out,'colorscheme-registration.png')});assert.deepEqual(errors,[]);await fs.writeFile(path.join(out,'colorscheme-smoke.json'),JSON.stringify({passed:true,checks:['Pinned Vim registration','Monaco JSON registration and actual editor color','VS Code mapping','Theme export','Reload and theme switch','Invalid Vim refusal without mutation','User syntax overrides and upstream italic'],errors},null,2));console.log('Colorscheme registration UI passed.');
 }finally{await app.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
