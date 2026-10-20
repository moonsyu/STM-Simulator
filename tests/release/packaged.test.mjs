import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {_electron,chromium} from 'playwright';
import {root,windows,wait,compileFixture,specialTemp} from './helpers.mjs';
const require=createRequire(import.meta.url);
const pkg=require(path.join(root,'package.json'));
const unpacked=path.join(root,'work/build/win-unpacked/STM Simulator.exe');
const portable=path.join(root,'outputs/artifact',pkg.build.portable.artifactName);
const exists=p=>fs.access(p).then(()=>true,()=>false);

test('packaged app opens the workbench and runs an example in the circuit simulator',{skip:!windows&&'Windows only',timeout:180000},async t=>{
 if(!await exists(unpacked)){if(process.env.CI)assert.fail('packaged app missing: '+unpacked);return t.skip('run npm run build first');}
 const temp=await specialTemp('packaged');
 const app=await _electron.launch({executablePath:unpacked,args:[],env:{...process.env,CIRCUIT_LAB_TEST_PROFILE:path.join(temp.dir,'profile')}});
 try{
  const win=await app.firstWindow();await win.waitForSelector('html[data-shell="vscode"]');await win.waitForSelector('.monaco-editor');
  await win.click('[data-activity="examples"]');await win.fill('#hal-example-search','5mm 단색 LED');await win.locator('#hal-example-list [data-example]').first().click();
  await win.keyboard.press('Control+F5');await win.waitForFunction(()=>/PA5=1/.test(document.getElementById('console-output').textContent),null,{timeout:20000});
  await win.keyboard.press('Control+F2');
  for(const target of ['simulator','emulator','arm','host'])assert.ok(await win.locator(`#native-target option[value="${target}"]`).count(),target);
 }finally{await app.close().catch(()=>{});await temp.cleanup();}
});

test('update helper runs from the packaged Electron main process and survives its exit',{skip:!windows&&'Windows only',timeout:180000},async t=>{
 if(!await exists(unpacked)){if(process.env.CI)assert.fail('packaged app missing: '+unpacked);return t.skip('run npm run build first');}
 const temp=await specialTemp('update GUI helper');
 const directory=path.join(temp.dir,'updates'),source=path.join(temp.dir,'new.exe'),target=path.join(temp.dir,'old.exe');await fs.mkdir(directory);await fs.writeFile(target,'MZ original');
 compileFixture(source);const bytes=await fs.readFile(source),info={bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
 const app=await _electron.launch({executablePath:unpacked,args:[],env:{...process.env,CIRCUIT_LAB_SMOKE:'1',CIRCUIT_LAB_TEST_PROFILE:path.join(temp.dir,'profile')}});let closed=false;
 try{
  await (await app.firstWindow()).waitForSelector('.monaco-editor');
  await app.evaluate(({app},job)=>{const require=process.getBuiltinModule('module').createRequire(app.getAppPath()+'/package.json');return require('./desktop/updater.cjs').launchHelper({...job,pid:process.pid});},{directory,source,target,info});
  await app.close();closed=true;
  let text=null;for(let i=0;i<150&&!text;i++){text=await fs.readFile(target+'.started','utf8').catch(()=>null);if(!text)await wait(100);}
  assert.equal(text,'updated');assert.equal(createHash('sha256').update(await fs.readFile(target)).digest('hex'),info.sha256);
 }finally{if(!closed)await app.close().catch(()=>{});await wait(300);await temp.cleanup();}
});

test('the single portable EXE starts with the updater enabled for its version',{skip:!windows&&'Windows only',timeout:240000},async t=>{
 if(!await exists(portable)){if(process.env.CI)assert.fail('portable EXE missing: '+portable);return t.skip('run npm run build:artifact first');}
 const {launch,terminate}=require(path.join(root,'desktop/process-tools.cjs'));
 const temp=await specialTemp('update-portable');
 const port=await new Promise(resolve=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});});
 const env={...process.env,CIRCUIT_LAB_SMOKE:'0',CIRCUIT_LAB_TEST_PROFILE:path.join(temp.dir,'profile')};delete env.ELECTRON_RUN_AS_NODE;
 const child=launch(portable,[`--remote-debugging-port=${port}`,'--remote-debugging-address=127.0.0.1'],{env});let browser;
 try{
  let ready=false;for(let i=0;i<300&&!ready;i++){try{ready=(await fetch(`http://127.0.0.1:${port}/json/version`)).ok;}catch{}if(!ready)await wait(200);}assert.ok(ready,'portable app did not start');
  browser=await chromium.connectOverCDP(`http://127.0.0.1:${port}`);const page=browser.contexts()[0].pages()[0];await page.waitForSelector('html[data-shell="vscode"]');
  const state=await page.evaluate(()=>window.appUpdates.state());assert.equal(state.currentVersion,pkg.version);assert.notEqual(state.phase,'unsupported');
  await page.evaluate(()=>window.appUpdates.configure(false));
  const result=await page.evaluate(()=>window.appUpdates.check());assert.ok(['current','available','error'].includes(result.phase),JSON.stringify(result));
  assert.equal(JSON.parse(await fs.readFile(path.join(temp.dir,'profile/updates/settings.json'),'utf8')).automatic,false);
  await page.evaluate(()=>window.close()).catch(()=>{});
 }finally{if(browser)await browser.close().catch(()=>{});await terminate(child);await temp.cleanup();}
});
