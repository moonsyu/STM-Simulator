// Text dragged over in the 문제 / 출력 panels is copied by Ctrl+C (the circuit's Ctrl+C copies parts only without a
// text selection), and Ctrl+A there selects that panel's text.
import test from 'node:test';
import assert from 'node:assert/strict';
import {launch} from './harness.mjs';

test('Ctrl+C copies text selected in 문제 and 출력; Ctrl+A selects the panel; without text the circuit keeps Ctrl+C',{timeout:120000},async()=>{
 const s=await launch();
 try{
  const {win,app}=s,clipboard=()=>app.evaluate(({clipboard})=>clipboard.readText());
  const drag=async selector=>{const b=await win.locator(selector).first().boundingBox();await win.mouse.move(b.x+2,b.y+b.height/2);await win.mouse.down();await win.mouse.move(b.x+b.width-4,b.y+b.height/2,{steps:8});await win.mouse.up();return win.evaluate(()=>window.getSelection().toString());};
  for(const [tab,selector] of [['log','#console-output .log-line'],['issues','#circuit-issues p']]){
   await win.click(`[data-monitor="${tab}"]`);
   await app.evaluate(({clipboard})=>clipboard.writeText('before'));
   const picked=await drag(selector);assert.ok(picked.trim().length>5,tab+' selection');
   await win.keyboard.press('Control+C');
   await win.waitForFunction(async()=>true);assert.equal((await clipboard()).trim(),picked.trim(),tab+' copied');
  }
  // Ctrl+A with the selection in the 출력 panel selects its whole text, not the circuit.
  await win.click('[data-monitor="log"]');await drag('#console-output .log-line');
  await win.keyboard.press('Control+A');
  assert.match(await win.evaluate(()=>window.getSelection().toString()),/회로를 연결하고 실행/);
  // No text selected: Ctrl+C belongs to the circuit (copy parts), as before.
  await win.evaluate(()=>window.getSelection().removeAllRanges());
  assert.equal(await win.evaluate(()=>{const e=new KeyboardEvent('keydown',{key:'c',ctrlKey:true,bubbles:true,cancelable:true});window.dispatchEvent(e);return e.defaultPrevented;}),true);
  assert.deepEqual(s.errors,[]);
 }finally{await s.close();}
});

test('a run whose code check fails reports it in 출력 and stays on the current tab (no jump to 빌드)',{timeout:120000},async()=>{
 const s=await launch();
 try{
  const {win}=s;
  await win.evaluate(()=>{const c=document.getElementById('code');c.value=c.value.replace('int main(void)','int main(void) { int x = ; }\nint unused(void)');c.dispatchEvent(new Event('input',{bubbles:true}));});
  await win.click('[data-monitor="issues"]');
  await win.keyboard.press('Control+F5');
  await win.waitForFunction(()=>/코드 검사에 실패해 실행하지 않았습니다/.test(document.getElementById('console-output').textContent),null,{timeout:15000});
  assert.equal(await win.evaluate(()=>document.getElementById('build-panel').hidden),true);
  assert.equal(await win.evaluate(()=>document.getElementById('issues-panel').hidden),false,'문제 stays on screen');
 }finally{await s.close();}
});
