const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),{_electron}=require('playwright');
// Measure rendered HTML text, including placeholders and translucent ancestors.
// Device SVGs, Monaco source tokens and the exact colorscheme sample are excluded.
function inspectContrast(){
 const rgba=value=>{const n=value.match(/[\d.]+/g)?.map(Number);return n?[...n.slice(0,3),n[3]??1]:[0,0,0,0];};
 const over=(front,back)=>[0,1,2].map(i=>front[i]*front[3]+back[i]*(1-front[3]));
 const luminance=color=>color.slice(0,3).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
 const ratio=(a,b)=>{const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
 const visible=el=>el.getClientRects().length&&getComputedStyle(el).visibility==='visible'&&!el.closest('[hidden],.monaco-editor,svg,.theme-preview,#tooltip,.monaco-ready #code');
 function pixels(el,foreground){let ink=foreground,bg=[0,0,0,0];for(let node=el;node;node=node.parentElement){const style=getComputedStyle(node),fill=rgba(style.backgroundColor);ink=[...over(ink,fill),ink[3]+fill[3]*(1-ink[3])];bg=[...over(bg,fill),bg[3]+fill[3]*(1-bg[3])];ink[3]*=Number(style.opacity);bg[3]*=Number(style.opacity);}return {ink:over(ink,[255,255,255,1]),bg:over(bg,[255,255,255,1])};}
 const findings=[];let checked=0;
 function inspect(el,text,pseudo){if(!visible(el)||!text.trim())return;const style=getComputedStyle(el,pseudo),pair=pixels(el,rgba(style.color)),contrast=ratio(pair.ink,pair.bg);checked++;if(contrast<4.5-.01)findings.push({selector:el.id?'#'+el.id:el.tagName.toLowerCase()+'.'+[...el.classList].join('.'),text:text.trim().slice(0,55),pseudo,contrast:Number(contrast.toFixed(2)),foreground:style.color,background:pair.bg.map(Math.round),disabled:el.matches(':disabled')||Boolean(el.closest('button:disabled'))});}
 for(const el of document.querySelectorAll('body *')){if(!visible(el))continue;const text=[...el.childNodes].filter(n=>n.nodeType===Node.TEXT_NODE).map(n=>n.textContent).join('');inspect(el,text);if(el.matches('input:not([type=checkbox]):not([type=radio]):not([type=color]):not([type=range]),textarea'))inspect(el,el.value||el.placeholder,el.value?null:'::placeholder');if(el.matches('select'))inspect(el,el.selectedOptions[0]?.textContent||'');}
 return {checked,findings};
}
module.exports={inspectContrast};
async function main(){
 const root=path.resolve(__dirname,'..'),out=path.join(root,'work/test-results');await fs.mkdir(out,{recursive:true});const profile=await fs.mkdtemp(path.join(out,'ui-contrast-'));
 const env={...process.env,CIRCUIT_LAB_SMOKE:'1',CIRCUIT_LAB_TEST_PROFILE:profile};delete env.ELECTRON_RUN_AS_NODE;
 const app=await _electron.launch({executablePath:process.env.LAB_EXE||path.join(root,'node_modules/electron/dist/electron.exe'),args:process.env.LAB_EXE?[]:[root],cwd:root,env});const results=[],errors=[];let page;
 try{
  page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));await page.waitForSelector('.monaco-editor');await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];w.setContentSize(1540,1020);w.showInactive();});
  const {exampleProject}=await import('../src/project.js');await require('./smoke-fixture.cjs').openFixture(page,exampleProject());
  const scan=async(name,shot=false)=>{await page.waitForTimeout(50);const result=await page.evaluate(inspectContrast);results.push({name,...result});if(shot&&!process.argv.includes('--record-before'))await page.screenshot({path:path.join(out,'contrast-'+name+'.png')});console.log(name+': '+result.checked+' text checks, '+result.findings.length+' low contrast');};
  for(const theme of ['jellybean','github-light']){
   await page.click('[data-tab="settings"]');await page.selectOption('#pref-appearance',theme==='jellybean'?'dark':'light');await page.selectOption('#pref-theme',theme);await scan(theme+'-settings');await page.click('[data-tab="code"]');
   await page.locator('#open').hover();await scan(theme+'-toolbar-hover',true);await page.mouse.move(900,40);
   await page.locator('.board-card').hover();await scan(theme+'-board-card-hover');
   await page.fill('#pin-search','PA5');await page.locator('#pin-results button').first().hover();await scan(theme+'-pin-results-hover');await page.locator('#pin-results button').first().click();await scan(theme+'-pin-results-selected');await page.fill('#pin-search','');
   await page.fill('#part-search','lcd');await page.locator('[data-add="lcd"]').hover();await page.waitForFunction(()=>{const p=document.getElementById('part-model-preview'),img=p.querySelector('img');return !p.hidden&&img.complete&&img.naturalWidth>0;});await scan(theme+'-part-preview');await page.keyboard.press('Escape');
   await page.mouse.move(900,40);await page.locator('[data-add="lcd"]').focus();await page.waitForFunction(()=>!document.getElementById('part-model-preview').hidden);await scan(theme+'-part-keyboard');await page.keyboard.press('Escape');
   await page.fill('#part-search','resistor');await page.locator('[data-add="resistor"]').click();await page.mouse.move(900,40);assert.ok(await page.locator('[data-add="resistor"]').evaluate(el=>el.classList.contains('active')));await scan(theme+'-part-active');await page.keyboard.press('Escape');await page.fill('#part-search','');
   await page.click('#pinout-open');await page.selectOption('#pin-function','GPIO_Output');await scan(theme+'-pinout',true);assert.ok(await page.locator('.pin-tile.enabled').count()>0);await page.locator('.pin-tile').first().hover();await scan(theme+'-pinout-hover');await page.click('#pinout-close');
   await page.click('[data-tab="code"]');await page.locator('.monaco-editor .inputarea').focus();await page.keyboard.press('Control+r');await page.fill('#code-find','HAL');await scan(theme+'-find-replace');await page.click('#code-search-close');
   for(const monitor of ['wave','bus','debug','build','native']){await page.click(`[data-monitor="${monitor}"]`);await scan(theme+'-'+monitor);}
   for(const [opener,dialog,closer]of [['#new','#project-dialog','#project-cancel'],['#native-tools','#native-tools-dialog','#native-tools-cancel'],['#app-update','#update-dialog','#update-close'],['#help','#help-dialog','.dialog-close']]){await page.click(opener);await page.waitForSelector(dialog+'[open]');await scan(theme+'-'+dialog.slice(1));await page.locator(dialog).locator(closer).click();}
   await page.click('.board-card');await scan(theme+'-board-dialog');await page.locator('.board-option').hover();await scan(theme+'-board-option-hover');await page.locator('#board-dialog .dialog-close').click();
   await page.click('[data-tab="docs"]');await scan(theme+'-docs');
   await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setContentSize(1024,640));await page.click('#pinout-open');await scan(theme+'-compact-pinout',true);await page.click('#pinout-close');await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setContentSize(1540,1020));
   await page.click('[data-tab="code"]');const source=await page.locator('#code').inputValue();const {fillCode,openFixture}=require('./smoke-fixture.cjs');await fillCode(page,'int main(void) { int broken = ; }');await page.click('#ide-build');assert.match(await page.locator('#build-status').textContent(),/실패/);await scan(theme+'-build-error');
   await page.selectOption('#native-target','host');await scan(theme+'-native-build-controls');const project=exampleProject();project.code=source;await openFixture(page,project);
  }
  await fs.writeFile(path.join(out,process.argv.includes('--record-before')?'ui-contrast-before.json':'ui-contrast.json'),JSON.stringify({passed:results.every(r=>!r.findings.length)&&!errors.length,results,errors},null,2));
  assert.deepEqual(errors,[]);if(!process.argv.includes('--record-before'))assert.deepEqual(results.filter(r=>r.findings.length),[],'UI text must have at least 4.5:1 contrast');
 }finally{await app.close();if(path.dirname(profile)!==out||!path.basename(profile).startsWith('ui-contrast-'))throw Error('Invalid cleanup path');await fs.rm(profile,{recursive:true,force:true});}
}
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
