// Features 25 and 26: editor tabs can be closed — one by its ×, the others or the ones to the right from the tab's
// context menu, all of them from the menu, the ⋯ button or Ctrl+K W — and a closed file opens again from the explorer.
import test from 'node:test';
import assert from 'node:assert/strict';
import {launch} from './harness.mjs';

test('tabs close one by one, all but one, to the right and all at once; the explorer opens a file again; an editor with no tab says so',{timeout:150000},async()=>{
 const s=await launch();
 try{
  const {win}=s;
  const tabs=()=>win.$$eval('#source-tabs [data-tab-id]',e=>e.map(x=>x.dataset.tabId));
  const active=()=>win.$$eval('#source-tabs [data-tab-id].active',e=>e.map(x=>x.dataset.tabId));
  const empty=()=>win.evaluate(()=>({flag:document.getElementById('code-panel').classList.contains('no-tabs'),shown:getComputedStyle(document.getElementById('editor-empty')).display!=='none'}));
  const menuItem=async(tab,action)=>{await win.click(`#source-tabs [data-tab-id="${tab}"]`,{button:'right'});await win.waitForSelector('#tab-menu:not([hidden])');await win.click(`#tab-menu [data-tab-action="${action}"]`);};
  // Three project files: main.c and, copied into the project, the linker script and the startup file.
  await win.click('[data-activity="explorer"]');if(!await win.locator('#build-files > summary').isVisible())await win.click('[data-activity="explorer"]');
  await win.click('#build-files > summary');
  await win.click('#build-file-list > button[data-build-file$=".ld"]');await win.waitForSelector('#copy-to-project');await win.click('#copy-to-project');
  await win.waitForFunction(()=>!!document.querySelector('#file-tree [data-source="STM32F103RBTX_FLASH.ld"]'));
  await win.click('#build-file-list [data-build-file$="startup_stm32f103xb.s"]');await win.waitForSelector('#copy-to-project');await win.click('#copy-to-project');
  const LD='STM32F103RBTX_FLASH.ld',ST='Core/Startup/startup_stm32f103xb.s';
  await win.waitForFunction(st=>!!document.querySelector(`#file-tree [data-source="${st}"]`),ST);
  assert.deepEqual(await tabs(),['main.c',LD,ST]);
  // Every tab has its close button; the row ends with the ⋯ menu.
  assert.equal(await win.locator('#source-tabs [data-tab-close]').count(),3);assert.equal(await win.locator('#tabs-more').count(),1);
  // The menu of a tab: four entries.
  await win.click(`#source-tabs [data-tab-id="${LD}"]`,{button:'right'});await win.waitForSelector('#tab-menu:not([hidden])');
  assert.deepEqual(await win.$$eval('#tab-menu button',b=>b.map(x=>x.childNodes[0].textContent)),['닫기','다른 탭 닫기','오른쪽 탭 닫기','모두 닫기']);
  await win.keyboard.press('Escape');assert.equal(await win.$eval('#tab-menu',m=>m.hidden),true);
  // 26: the others are closed; the right-clicked tab is the one on screen.
  await win.click('#source-tabs [data-source="main.c"]');
  await menuItem(LD,'others');
  assert.deepEqual(await tabs(),[LD]);assert.deepEqual(await active(),[LD]);
  await win.waitForFunction(()=>/ENTRY\(Reset_Handler\)/.test(document.getElementById('code').value));
  // The explorer opens closed files again, at their place in the row.
  await win.click('#file-tree [data-source="main.c"]');await win.click(`#file-tree [data-source="${ST}"]`);
  assert.deepEqual(await tabs(),['main.c',LD,ST]);assert.deepEqual(await active(),[ST]);
  // Closing the tab on screen shows its neighbour; closing another one changes nothing on screen.
  await win.click(`#source-tabs [data-tab-close="${ST}"]`);assert.deepEqual(await tabs(),['main.c',LD]);assert.deepEqual(await active(),[LD]);
  await win.click('#file-tree [data-source="main.c"]');await win.click(`#file-tree [data-source="${ST}"]`);await win.click('#source-tabs [data-source="main.c"]');
  await win.click(`#source-tabs [data-tab-close="${ST}"]`);assert.deepEqual(await active(),['main.c']);
  // Tabs to the right.
  await win.click(`#file-tree [data-source="${ST}"]`);await menuItem('main.c','right');assert.deepEqual(await tabs(),['main.c']);assert.deepEqual(await active(),['main.c']);
  // 25: all of them — from the ⋯ button. The editor says that nothing is open; the files are still in the project.
  await win.click('#tabs-more');await win.waitForSelector('#tab-menu:not([hidden])');
  assert.deepEqual(await win.$$eval('#tab-menu button',b=>b.map(x=>x.dataset.tabAction)),['all']);
  await win.click('#tab-menu [data-tab-action="all"]');
  assert.deepEqual(await tabs(),[]);assert.deepEqual(await empty(),{flag:true,shown:true});
  assert.match(await win.textContent('#editor-empty'),/열린 파일이 없습니다[\s\S]*탐색기에서 파일을 눌러 여세요/);
  assert.equal(await win.locator('#file-tree [data-source]').count(),3);
  await win.click(`#file-tree [data-source="${LD}"]`);
  assert.deepEqual(await tabs(),[LD]);assert.deepEqual(await empty(),{flag:false,shown:false});
  // A read-only generated file has a tab too, and "모두 닫기" (Ctrl+K W) closes it with the others.
  await win.click('#build-file-list > button[data-build-file$=".ioc"]');
  await win.waitForFunction(()=>document.querySelectorAll('#source-tabs [data-tab-id^="sdk:"]').length===1);
  assert.equal((await tabs()).length,2);
  await win.locator('#circuit').click({position:{x:30,y:30}});
  await win.keyboard.press('Control+K');await win.keyboard.press('W');
  await win.waitForFunction(()=>document.querySelectorAll('#source-tabs [data-tab-id]').length===0,null,{timeout:8000})
   .catch(async()=>{throw new Error('Ctrl+K W left: '+JSON.stringify(await tabs())+' active '+JSON.stringify(await active())+' '+JSON.stringify(await empty()));});
  assert.deepEqual(await empty(),{flag:true,shown:true});
  // A new project starts with its tabs again.
  await win.evaluate(()=>document.getElementById('new').click());if(await win.evaluate(()=>document.getElementById('replace-dialog').open))await win.click('#replace-confirm');
  await win.waitForSelector('#project-dialog[open]');await win.click('#project-create');await win.waitForFunction(()=>!document.getElementById('project-dialog').open);
  assert.deepEqual((await tabs()).slice(0,1),['main.c']);assert.deepEqual(await empty(),{flag:false,shown:false});
  assert.deepEqual(s.errors,[]);
 }finally{await s.close();}
});
