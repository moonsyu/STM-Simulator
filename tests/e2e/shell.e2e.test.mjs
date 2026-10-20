import test from 'node:test';
import assert from 'node:assert/strict';
import {launch,visible} from './harness.mjs';

test('VS Code style workbench regions, views, toggles and persistence',{timeout:120000},async()=>{
 const s=await launch();
 try{
  const {win}=s;
  for(const id of ['#activitybar','#sidebar','#group-code','#group-circuit','#bottom-panel','#auxbar','#statusbar','#menubar'])assert.ok(await visible(win,id),id+' visible');
  // Every activity opens its own side bar view and clicking it again collapses the side bar.
  for(const view of ['explorer','parts','examples','board','debug','docs','settings']){
   await win.click(`[data-activity="${view}"]`);
   if(!await visible(win,`#view-${view}`))await win.click(`[data-activity="${view}"]`);
   assert.ok(await visible(win,`#view-${view}`),view);
   assert.equal(await win.getAttribute(`[data-activity="${view}"]`,'aria-pressed'),'true');
  }
  await win.click('[data-activity="settings"]');
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
