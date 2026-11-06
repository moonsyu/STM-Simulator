// CubeIDE's "Use float with printf" in the IDE toolbar: a new project has it off, a run whose printf uses %f says why
// the number is missing, and turning it on is kept in the project.
import test from 'node:test';
import assert from 'node:assert/strict';
import {launch} from './harness.mjs';

test('printf float: off in a new project, the run explains an empty %f, the toolbar switch turns it on',{timeout:180000},async()=>{
 const s=await launch();
 try{
  const {win}=s;
  assert.equal(await win.evaluate(()=>document.getElementById('printf-float').checked),false,'CubeIDE default: off');
  await win.evaluate(()=>{const c=document.getElementById('code');c.value=c.value.replace('printf("HAL ready\\n");','printf("t=%.1f\\n", 21.5);');c.dispatchEvent(new Event('input',{bubbles:true}));});
  await win.keyboard.press('Control+F5');
  await win.waitForFunction(()=>/printf의 %f·%e·%g\(실수\) 출력이 꺼져/.test(document.getElementById('console-output').textContent),null,{timeout:120000})
   .catch(async e=>{throw new Error(e.message+'\n'+(await win.textContent('#console-output')).slice(-1200));});
  await win.keyboard.press('Control+F2');
  await win.waitForFunction(()=>document.getElementById('shell').dataset.running==='false');
  await win.evaluate(()=>{const c=document.getElementById('printf-float');c.checked=true;c.dispatchEvent(new Event('change',{bubbles:true}));});
  await win.waitForFunction(()=>/printf float를 켰습니다/.test(document.getElementById('console-output').textContent));
  assert.equal(await win.evaluate(()=>document.getElementById('printf-float').checked),true);
  assert.deepEqual(s.errors,[]);
 }finally{await s.close();}
});
