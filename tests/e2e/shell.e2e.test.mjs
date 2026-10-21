import test from 'node:test';
import assert from 'node:assert/strict';
import {launch,visible} from './harness.mjs';

test('VS Code style workbench regions, views, toggles and persistence',{timeout:120000},async()=>{
 const s=await launch();
 try{
  const {win}=s;
  for(const id of ['#activitybar','#sidebar','#group-code','#group-circuit','#bottom-panel','#auxbar','#statusbar','#menubar'])assert.ok(await visible(win,id),id+' visible');
  // Every activity opens its own side bar view and clicking it again collapses the side bar.
  assert.equal(await win.locator('[data-activity="settings"]').count(),0,'settings moved to the 편집 menu');
  for(const view of ['explorer','parts','examples','board','debug','docs']){
   await win.click(`[data-activity="${view}"]`);
   if(!await visible(win,`#view-${view}`))await win.click(`[data-activity="${view}"]`);
   assert.ok(await visible(win,`#view-${view}`),view);
   assert.equal(await win.getAttribute(`[data-activity="${view}"]`,'aria-pressed'),'true');
  }
  await win.click('[data-activity="docs"]');
  assert.equal(await win.getAttribute('#shell','data-sidebar'),'false');
  await win.keyboard.press('Control+B');assert.equal(await win.getAttribute('#shell','data-sidebar'),'true');
  await win.locator('#circuit').click({position:{x:40,y:40}});
  await win.keyboard.press('Control+J');assert.equal(await win.getAttribute('#shell','data-panel'),'false');
  await win.keyboard.press('Control+J');assert.equal(await win.getAttribute('#shell','data-panel'),'true');
  await win.keyboard.press('Control+Alt+B');assert.equal(await win.getAttribute('#shell','data-aux'),'false');
  // Selecting a part does not reopen a properties bar the user closed.
  await win.click('#toggle-aux');assert.equal(await win.getAttribute('#shell','data-aux'),'true');
  // Command palette filters and runs commands.
  await win.keyboard.press('Control+Shift+P');
  assert.ok(await visible(win,'#command-palette'));
  await win.keyboard.type('로직 분석기');
  assert.match(await win.textContent('#command-palette-list'),/로직 분석기/);
  await win.keyboard.press('Escape');
  await win.keyboard.press('Control+Shift+P');await win.keyboard.type('회로 최대화');await win.keyboard.press('Enter');
  await win.waitForFunction(()=>document.getElementById('shell').dataset.maximized==='circuit');
  assert.equal(await visible(win,'#group-code'),false);
  await win.click('#circuit-maximize');
  await win.waitForFunction(()=>document.getElementById('shell').dataset.maximized==='');
  // Quick open lists source files.
  await win.keyboard.press('Control+P');assert.match(await win.textContent('#command-palette-list'),/main\.c/);await win.keyboard.press('Escape');
  // Menus mirror commands and keyboard navigation works.
  await win.click('.menubar-item >> nth=2');
  assert.ok(await win.locator('.menu:popover-open .menu-item').count()>10);
  await win.keyboard.press('Escape');
  // 편집 menu opens the settings and keyboard shortcut views.
  await win.click('.menubar-item >> nth=1');
  await win.click('.menu:popover-open [data-command="view.settings"]');
  assert.ok(await visible(win,'#view-settings'));
  await win.click('.menubar-item >> nth=1');
  await win.click('.menu:popover-open [data-command="view.keybindings"]');
  assert.ok(await visible(win,'#view-keybindings'));
  // Rebind "terminal" to Ctrl+Alt+T, use it, then reset it.
  const row='#view-keybindings [data-binding="view.terminal"]';
  await win.click(`${row} [data-edit]`);await win.keyboard.press('Control+Alt+T');await win.keyboard.press('Enter');
  assert.match(await win.textContent(`${row} [data-edit]`),/Ctrl\+Alt\+T/);
  await win.click('#circuit',{position:{x:30,y:30}});
  await win.keyboard.press('Control+J');assert.equal(await win.getAttribute('#shell','data-panel'),'false');
  await win.keyboard.press('Control+Alt+T');assert.equal(await win.getAttribute('#shell','data-panel'),'true');
  await win.click('.menubar-item >> nth=1');await win.click('.menu:popover-open [data-command="view.keybindings"]');
  await win.click(`${row} [data-reset]`);assert.match(await win.textContent(`${row} [data-edit]`),/Ctrl\+`/);
  // Activity tooltip appears to the right of the icon.
  await win.hover('[data-activity="parts"]');
  await win.waitForFunction(()=>!document.getElementById('activity-tip').hidden);
  const tip=await win.locator('#activity-tip').boundingBox(),icon=await win.locator('[data-activity="parts"]').boundingBox();
  assert.ok(tip.x>=icon.x+icon.width,'tooltip to the right');
  assert.ok(Math.abs((tip.y+tip.height/2)-(icon.y+icon.height/2))<4,'tooltip vertically centred');
  // Drag the docs icon to the top; the order persists.
  await win.dragAndDrop('[data-activity="docs"]','[data-activity="explorer"]',{targetPosition:{x:20,y:4}});
  assert.equal(await win.evaluate(()=>document.querySelector('#activitybar [data-activity]').dataset.activity),'docs');
  assert.equal(await win.evaluate(()=>JSON.parse(localStorage.getItem('stm32lab.shellLayout.v1')).activityOrder[0]),'docs');
  // Project name is not shown in the title bar; the update button lives in the 도움말 menu.
  assert.equal(await visible(win,'#project-name'),false);
  assert.equal(await visible(win,'#app-update'),false);
  // Swap and orientation change the editor area.
  await win.click('#group-swap');assert.equal(await win.getAttribute('#editor-area','data-swapped'),'true');
  assert.equal(await win.evaluate(()=>document.getElementById('editor-area').firstElementChild.id),'group-circuit');
  await win.click('#group-orientation');assert.equal(await win.getAttribute('#editor-area','data-orientation'),'column');
  // Sash drag changes the side bar width.
  const before=(await win.locator('#sidebar').boundingBox()).width;
  const sash=await win.locator('#sash-sidebar').boundingBox();
  await win.mouse.move(sash.x+2,sash.y+200);await win.mouse.down();await win.mouse.move(sash.x+82,sash.y+200,{steps:4});await win.mouse.up();
  const after=(await win.locator('#sidebar').boundingBox()).width;
  assert.ok(after>before+60,`sidebar resized ${before}→${after}`);
  await s.close({keep:true});
  // Layout persists across restarts.
  const again=await launch({profile:s.profile});
  try{
   assert.equal(await again.win.getAttribute('#editor-area','data-orientation'),'column');
   assert.equal(await again.win.getAttribute('#editor-area','data-swapped'),'true');
   const width=(await again.win.locator('#sidebar').boundingBox()).width;assert.ok(Math.abs(width-after)<3);
   await again.win.keyboard.press('Control+Shift+P');await again.win.keyboard.type('레이아웃 초기화');await again.win.keyboard.press('Enter');
   await again.win.waitForFunction(()=>document.getElementById('editor-area').dataset.orientation==='row');
   assert.deepEqual(again.errors,[]);
  }finally{await again.close();}
  assert.deepEqual(s.errors,[]);
 }finally{await s.close();}
});

test('empty circuit guidance adds a board and opens views',{timeout:60000},async()=>{
 const s=await launch();
 try{
  const {win}=s;
  assert.ok(await visible(win,'#canvas-empty'));
  await win.click('#empty-open-parts');assert.ok(await visible(win,'#view-parts'));
  await win.click('#empty-add-board');
  await win.waitForFunction(()=>document.getElementById('canvas-empty').hidden);
  assert.match(await win.textContent('#explorer-circuit-summary'),/NUCLEO-F446RE/);
 }finally{await s.close();}
});

test('find keys in the code editor open the app search bar, never Monaco\'s own find widget',{timeout:60000},async()=>{
 const s=await launch();
 try{
  const {win}=s;
  await win.locator('.monaco-editor').first().click();
  for(const key of ['Control+F','Control+H','F3','Shift+F3']){
   await win.keyboard.press(key);
   await win.waitForFunction(()=>!document.getElementById('code-search').hidden);
   assert.equal(await win.locator('.find-widget.visible').count(),0,key);
   await win.keyboard.press('Escape');
   await win.waitForFunction(()=>document.getElementById('code-search').hidden);
  }
  assert.deepEqual(s.errors,[]);
 }finally{await s.close();}
});

test('start-up notice lists missing real-board tools, opens the install plan, and stays off after 다시 묻지 않기',{timeout:120000},async()=>{
 const {mkdtemp}=await import('node:fs/promises');const {tmpdir}=await import('node:os');const path=await import('node:path');
 // An empty tools folder and no SDK override make STM32CubeF4 missing on any machine.
 const tools=await mkdtemp(path.join(tmpdir(),'stm-no-tools-'));
 const s=await launch({toolsNotice:true,env:{LOCALAPPDATA:tools,STM32CUBE_F4_ROOT:''}});
 try{
  const {win}=s;
  await win.waitForSelector('#tools-notice',{timeout:15000});
  assert.match(await win.textContent('#tools-notice'),/STM32CubeF4/);
  await win.click('#tools-notice [data-notice="install"]');
  await win.waitForFunction(()=>document.getElementById('native-tools-dialog').open&&!document.getElementById('native-install').hidden);
  assert.match(await win.textContent('#native-install-plan'),/STM32CubeF4 v1\.28\.3/);
  assert.match(await win.textContent('#native-install-status'),/내려받습니다/);
  assert.equal(await win.isVisible('#native-install-start'),true);
  // Nothing is downloaded until 설치 시작; 닫기 hides the plan.
  await win.click('#native-install-cancel');assert.equal(await win.isHidden('#native-install'),true);
  await win.click('#native-tools-cancel');
  // 다시 묻지 않기 is remembered across reloads.
  await win.reload();await win.waitForSelector('#tools-notice',{timeout:15000});
  await win.click('#tools-notice [data-notice="never"]');
  await win.reload();await win.waitForTimeout(4500);
  assert.equal(await win.locator('#tools-notice').count(),0);
  assert.deepEqual(s.errors,[]);
 }finally{await s.close();}
});
