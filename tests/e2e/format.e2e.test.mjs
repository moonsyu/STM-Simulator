import test from 'node:test';
import assert from 'node:assert/strict';
import {launch} from './harness.mjs';

const code=win=>win.evaluate(()=>document.getElementById('code').value);
async function setCode(win,text){await win.evaluate(t=>{const c=document.getElementById('code');c.value=t;c.dispatchEvent(new Event('input',{bubbles:true}));},text);}

test('typing } re-indents the closed block and 편집 → 코드 정렬 formats the file without clangd',{timeout:90000},async()=>{
 const s=await launch();
 try{
  const {win}=s;
  await setCode(win,'int x;\nvoid blink(void){\nif(x){\nx=0;\n');
  await win.locator('.monaco-editor').first().click();
  await win.keyboard.press('Control+End');
  await win.keyboard.type('}');
  await win.waitForFunction(()=>/if \(x\) \{\n {8}x=0;\n {4}\}/.test(document.getElementById('code').value));
  assert.match(await code(win),/void blink\(void\)\{\n {4}if \(x\) \{/,'only the closed block is touched');
  // Default shortcut Alt+Shift+F formats the whole file.
  await setCode(win,'void a(void){\nint y=f(1,2);\nwhile(y){\ny--;\n}\n}\n');
  await win.locator('.monaco-editor').first().click();
  await win.keyboard.press('Alt+Shift+F');
  await win.waitForFunction(()=>document.getElementById('code').value==='void a(void) {\n    int y=f(1, 2);\n    while (y) {\n        y--;\n    }\n}\n');
  // The 편집 menu lists the command with its shortcut.
  await win.click('.menubar-item >> nth=1');
  assert.match(await win.textContent('.menu:popover-open [data-command="edit.format"]'),/코드 정렬\s*Alt\+Shift\+F/);
  await win.keyboard.press('Escape');
  assert.deepEqual(s.errors,[]);
 }finally{await s.close();}
});
