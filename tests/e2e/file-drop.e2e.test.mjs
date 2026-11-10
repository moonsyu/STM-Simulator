// Dropping files on the window (feature 12): .c / .h files are added to the project's sources, a file of the same name is
// replaced, and nothing is accepted while the program runs. The drop is a synthetic DataTransfer with real File objects.
import test from 'node:test';
import assert from 'node:assert/strict';
import {launch} from './harness.mjs';

const drop=(win,files)=>win.evaluate(list=>{
 const dt=new DataTransfer();for(const [name,text]of list)dt.items.add(new File([text],name,{type:'text/plain'}));
 const fire=type=>document.body.dispatchEvent(new DragEvent(type,{bubbles:true,cancelable:true,dataTransfer:dt}));
 fire('dragenter');const shown=document.body.classList.contains('file-drop-target');fire('dragover');fire('drop');return shown;
},files);
const tree=win=>win.evaluate(()=>[...document.querySelectorAll('#file-tree [data-source]')].map(b=>b.dataset.source));
const consoleText=win=>win.textContent('#console-output');

test('dropped sources are added, replaced when dropped again, and refused while running',{timeout:120000},async()=>{
 const s=await launch();
 try{
  const {win}=s;
  assert.equal(await drop(win,[['oled.h','#pragma once\nint oled_width(void);\n'],['oled.c','#include "oled.h"\nint oled_width(void) { return 128; }\n'],['readme.txt','not a source']]),true,'the drop target is shown while dragging');
  await win.waitForFunction(()=>document.querySelectorAll('#file-tree [data-source]').length===3);
  assert.deepEqual((await tree(win)).sort(),['main.c','oled.c','oled.h']);
  assert.match(await consoleText(win),/소스에 추가했습니다: oled\.h, oled\.c/);assert.equal(await win.evaluate(()=>document.body.classList.contains('file-drop-target')),false);
  await drop(win,[['oled.c','#include "oled.h"\nint oled_width(void) { return 64; }\n']]);
  await win.waitForFunction(()=>/같은 이름의 파일을 놓은 내용으로 바꿨습니다: oled\.c/.test(document.getElementById('console-output').textContent));
  assert.deepEqual((await tree(win)).sort(),['main.c','oled.c','oled.h']);
  await win.evaluate(()=>document.querySelector('#file-tree [data-source="oled.c"]').click());
  await win.waitForFunction(()=>/return 64;/.test(document.getElementById('code').value));
  // While running nothing is taken.
  await win.keyboard.press('Control+F5');await win.waitForTimeout(800);
  await drop(win,[['late.c','int late;\n']]);
  await win.waitForFunction(()=>/실행 중에는 파일을 놓을 수 없습니다/.test(document.getElementById('console-output').textContent),null,{timeout:10000}).catch(async e=>{throw new Error(e.message+'\n'+await consoleText(win));});
  assert.ok(!(await tree(win)).includes('late.c'));
  await win.click('#run');
  assert.deepEqual(s.errors,[]);
 }finally{await s.close();}
});
