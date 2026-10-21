import test from 'node:test';
import assert from 'node:assert/strict';
import {launch} from './harness.mjs';

const code=win=>win.evaluate(()=>document.getElementById('code').value);
async function setCode(win,text){await win.evaluate(t=>{const c=document.getElementById('code');c.value=t;c.dispatchEvent(new Event('input',{bubbles:true}));},text);}

test('} entered without a } key event (Korean IME) and over-typing an auto-closed } re-indent the block',{timeout:90000},async()=>{
 const s=await launch();
 try{
  const {win}=s;
  // IME input: the character arrives as text input with keyCode 229 / key "Process", not as a } key press.
  await setCode(win,'void f(void){\nif(x){\nx=0;\n');
  await win.locator('.monaco-editor').first().click();
  await win.keyboard.press('Control+End');
  await win.keyboard.insertText('}');
  await win.waitForFunction(()=>/if \(x\) \{\n {8}x=0;\n {4}\}/.test(document.getElementById('code').value),null,{timeout:5000});
  // Monaco auto-closes { with }; typing } over it changes no text but still closes the block.
  await setCode(win,'void g(void){\n');
  await win.locator('.monaco-editor').first().click();
  await win.keyboard.press('Control+End');
  await win.keyboard.type('while(y){y--;');
  await win.keyboard.type('}');
  await win.waitForFunction(()=>/\n {4}while \(y\) \{y--;\}/.test(document.getElementById('code').value),null,{timeout:5000});
  assert.deepEqual(s.errors,[]);
 }finally{await s.close();}
});
