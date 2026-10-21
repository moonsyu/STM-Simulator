import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {launch} from './harness.mjs';

async function typeInEditor(win,text){
 await win.locator('#group-code .monaco-editor .view-lines').click();
 await win.keyboard.press('Control+End');await win.keyboard.type(text);
}
const code=win=>win.evaluate(()=>document.getElementById('code').value);

test('an edit made right after saving still asks before replacing the project',{timeout:90000},async()=>{
 const s=await launch();
 try{
  const {win,app}=s;const target=path.join(await mkdtemp(path.join(tmpdir(),'stm-save-')),'saved.stm32lab');
  await app.evaluate(({dialog},file)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:file});},target);
  await typeInEditor(win,'\n// first edit');
  await win.keyboard.press('Control+S');
  await win.waitForFunction(()=>document.getElementById('save-state').textContent.includes('파일 저장됨'));
  assert.match(await readFile(target,'utf8'),/first edit/);
  await typeInEditor(win,'\n// second edit');
  await win.evaluate(()=>document.getElementById('new').click());
  await win.waitForFunction(()=>document.getElementById('replace-dialog').open);
  await win.click('#replace-cancel');
  assert.match(await code(win),/second edit/);
  assert.deepEqual(s.errors,[]);
 }finally{await s.close();}
});

test('closing immediately after typing keeps the latest draft',{timeout:90000},async()=>{
 const s=await launch();
 const marker='AUDIT_CLOSE_'+Date.now();
 await typeInEditor(s.win,'\n// '+marker);
 await s.close({keep:true});
 const again=await launch({profile:s.profile});
 try{assert.match(await code(again.win),new RegExp(marker));}
 finally{await again.close();}
});

test('a project folder keeps main.c and the circuit file consistent',{timeout:90000},async()=>{
 const s=await launch();
 try{
  const {win,app}=s;const parent=await mkdtemp(path.join(tmpdir(),'stm-ws-'));
  await app.evaluate(({dialog},dir)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[dir]});},parent);
  await win.evaluate(()=>document.getElementById('new').click());
  await win.waitForFunction(()=>document.getElementById('project-dialog').open);
  await win.fill('#new-project-name','WsCheck');
  await win.click('#project-folder-choose');
  await win.waitForFunction(()=>document.getElementById('new-project-folder').value.length>0);
  await win.click('#project-create');
  await win.waitForFunction(()=>!document.getElementById('project-dialog').open);
  await typeInEditor(win,'\n// saved to folder');
  await win.keyboard.press('Control+S');
  await win.waitForFunction(()=>document.getElementById('save-state').textContent.includes('파일 저장됨'));
  // The autosave scheduled by the last keystroke must not replace the file-save status afterwards.
  await win.waitForTimeout(500);
  assert.match(await win.textContent('#save-state'),/파일 저장됨/);
  const dir=path.join(parent,'WsCheck');
  const files=await readdir(dir);
  assert.ok(files.includes('main.c')&&files.includes('project.stm32lab'),files.join(','));
  assert.match(await readFile(path.join(dir,'main.c'),'utf8'),/saved to folder/);
  const saved=JSON.parse(await readFile(path.join(dir,'project.stm32lab'),'utf8'));
  assert.equal(saved.code,await readFile(path.join(dir,'main.c'),'utf8'));
  assert.ok(!files.includes('.stm-save'),'no leftover recovery journal');
  assert.match(await win.textContent('#workspace-path'),/WsCheck/);
  // A new unsaved project clears the folder context used by the terminal and saving.
  await win.evaluate(()=>document.getElementById('new').click());
  await win.waitForFunction(()=>document.getElementById('project-dialog').open);
  await win.fill('#new-project-name','Loose');await win.evaluate(()=>{document.getElementById('new-project-folder').value='';});
  await win.click('#project-create');
  await win.waitForFunction(()=>document.getElementById('workspace-path').textContent.includes('미저장'));
  if(process.platform==='win32'){
   await win.keyboard.press('Control+`');await win.click('#terminal-start');
   await win.waitForFunction(()=>document.getElementById('terminal-status').textContent.includes('실행 중'));
   assert.doesNotMatch(await win.textContent('#terminal-status'),/WsCheck/);
   await win.click('#terminal-close');
  }
 }finally{await s.close();}
});
