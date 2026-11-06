// 5 V wired straight to PA0 (A0), which is not 5 V tolerant on the NUCLEO-F103RB: the 문제 tab shows the pin
// over-voltage error, and a run says it once in the output tab.
import test from 'node:test';
import assert from 'node:assert/strict';
import {launch} from './harness.mjs';

test('pin over-voltage: 5 V on a TT pin in the 문제 tab and, while running, once in the output tab',{timeout:180000},async()=>{
 const s=await launch();
 try{
  const {win}=s;
  await win.evaluate(()=>{
   window.dispatchEvent(new Event('beforeunload'));const p=JSON.parse(localStorage.getItem('stm32lab.project.v2'));
   if(p.mcu.family!=='STM32F103RB')throw new Error('default board: '+p.mcu.family);p.surfaces={...p.surfaces,board:{...(p.surfaces?.board||{}),hidden:false}};p.wires=[{id:'w1',from:'board:CN6:5',to:'board:CN8:1',color:'#d04040'}];
   const text=JSON.stringify(p);localStorage.setItem('stm32lab.project.v2',text);window.addEventListener('beforeunload',()=>localStorage.setItem('stm32lab.project.v2',text));
  });
  await win.reload();
  await win.waitForFunction(()=>/PA0\(A0\): 5\.00 V가 걸려 있습니다\. 5 V 비허용\(TT\) 핀/.test(document.getElementById('circuit-issues')?.textContent||''),null,{timeout:30000})
   .catch(async e=>{throw new Error(e.message+'\n'+await win.textContent('#circuit-issues'));});
  assert.equal(await win.evaluate(()=>[...document.querySelectorAll('#circuit-issues .circuit-issue')].some(b=>b.classList.contains('error')&&/PA0\(A0\)/.test(b.textContent))),true);
  await win.keyboard.press('Control+F5');
  await win.waitForFunction(()=>/핀 과전압: PA0\(A0\): 5\.00 V/.test(document.getElementById('console-output').textContent),null,{timeout:120000})
   .catch(async e=>{throw new Error(e.message+'\n'+(await win.textContent('#console-output')).slice(-1200));});
  await win.waitForTimeout(1500);
  assert.equal(await win.evaluate(()=>document.getElementById('console-output').textContent.match(/핀 과전압: PA0/g).length),1,'once per run');
  await win.keyboard.press('Control+F2');
  assert.deepEqual(s.errors,[]);
 }finally{await s.close();}
});
