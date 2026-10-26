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
  await win.click('#circuit-maximize');
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
  // 편집 → 설정 opens one floating window; its 단축키 tab holds the keybindings (also Ctrl+K Ctrl+S).
  await win.click('.menubar-item >> nth=1');
  await win.click('.menu:popover-open [data-command="view.settings"]');
  assert.ok(await visible(win,'#settings-dialog #ide-settings-panel'));
  await win.click('[data-settings-tab="keys"]');
  assert.ok(await visible(win,'#settings-dialog #view-keybindings'));
  // Rebind "terminal" to Ctrl+Alt+T, use it, then reset it.
  const row='#view-keybindings [data-binding="view.terminal"]';
  await win.click(`${row} [data-edit]`);await win.keyboard.press('Control+Alt+T');await win.keyboard.press('Enter');
  assert.match(await win.textContent(`${row} [data-edit]`),/Ctrl\+Alt\+T/);
  await win.click('#settings-dialog-close');
  await win.click('#circuit',{position:{x:30,y:30}});
  await win.keyboard.press('Control+J');assert.equal(await win.getAttribute('#shell','data-panel'),'false');
  await win.keyboard.press('Control+Alt+T');assert.equal(await win.getAttribute('#shell','data-panel'),'true');
  await win.keyboard.press('Control+K');await win.keyboard.press('Control+S');
  assert.ok(await visible(win,'#settings-dialog #view-keybindings'));
  await win.click(`${row} [data-reset]`);assert.match(await win.textContent(`${row} [data-edit]`),/Ctrl\+`/);
  await win.click('#settings-dialog-close');
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
  // Title bar: name and menus, a command search box without text, run; the project name is in the explorer and the
  // update button appears only when there is an update.
  assert.ok(await visible(win,'.brand strong'));assert.equal(await win.textContent('#command-palette-open'),'');
  await win.click('[data-activity="explorer"]');if(!await visible(win,'#view-explorer'))await win.click('[data-activity="explorer"]');
  assert.ok(await visible(win,'#view-explorer #project-name'));assert.equal(await visible(win,'#app-update'),false);
  // When the updater reports a new version (update-ui.js unhides the button), it shows left of the theme toggle.
  const shown=await win.evaluate(()=>{const b=document.getElementById('app-update');b.hidden=false;b.textContent='업데이트 적용';const r=b.getBoundingClientRect(),t=document.querySelector('.appearance-switch')?.getBoundingClientRect();const out={display:getComputedStyle(b).display,width:r.width,left:t?r.right<=t.left+1:true};b.hidden=true;return out;});
  assert.notEqual(shown.display,'none');assert.ok(shown.width>40&&shown.left,JSON.stringify(shown));
  // 도움말 → 버전 정보 shows the running version in the menu and opens the version / update status window.
  const version=JSON.parse(await import('node:fs').then(fs=>fs.readFileSync(new URL('../../package.json',import.meta.url),'utf8'))).version;
  await win.locator('.menubar-item',{hasText:'도움말'}).click();
  assert.match(await win.locator('[data-command="help.about"]').innerText(),new RegExp('버전 정보.*\\(v'+version.replaceAll('.','\\.')+'\\)'));
  await win.locator('[data-command="help.about"]').click();await win.waitForSelector('#update-dialog[open]');
  assert.equal(await win.textContent('#update-current'),version);assert.ok((await win.textContent('#update-phase')).length>0);assert.ok((await win.textContent('#update-checked')).length>0);
  await win.click('#update-close');
  for(const id of ['ide-build','debug-start','tool-select'])assert.equal(await visible(win,'#'+id),false,id);
  // A panel's grip dragged onto another region swaps the two (a synthetic drop: Playwright cannot drive HTML5 drag in Electron).
  const drop=(unit,region)=>win.evaluate(([unit,region])=>{const dt=new DataTransfer(),grip=document.querySelector(`[data-unit="${unit}"] .dock-grip`),target=document.getElementById(region);grip.dispatchEvent(new DragEvent('dragstart',{dataTransfer:dt,bubbles:true}));target.dispatchEvent(new DragEvent('dragover',{dataTransfer:dt,bubbles:true,cancelable:true}));target.dispatchEvent(new DragEvent('drop',{dataTransfer:dt,bubbles:true,cancelable:true}));grip.dispatchEvent(new DragEvent('dragend',{dataTransfer:dt,bubbles:true}));},[unit,region]);
  const unitIn=region=>win.evaluate(r=>document.getElementById(r).querySelector(':scope>.dock-unit')?.dataset.unit,region);
  await drop('code','auxbar');assert.equal(await unitIn('auxbar'),'code');assert.equal(await unitIn('group-code'),'aux');
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
   assert.equal(await again.win.evaluate(()=>document.getElementById('auxbar').querySelector(':scope>.dock-unit').dataset.unit),'code');
   const width=(await again.win.locator('#sidebar').boundingBox()).width;assert.ok(Math.abs(width-after)<3);
   await again.win.click('.menubar-item >> nth=1');await again.win.click('.menu:popover-open [data-command="view.settings"]');
   await again.win.click('[data-settings-tab="layout"]');await again.win.click('#settings-layout-reset');
   await again.win.waitForFunction(()=>document.getElementById('auxbar').querySelector(':scope>.dock-unit').dataset.unit==='aux');
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

test('a panel opens in its own window, keeps working there and comes back when the window closes',{timeout:90000},async()=>{
 const s=await launch();
 try{
  const {app,win}=s;
  const opened=app.waitForEvent('window');await win.click('[data-unit="code"] .dock-popout');const child=await opened;
  await child.waitForSelector('.monaco-editor');
  assert.equal(await win.evaluate(()=>!!document.querySelector('#group-code .dock-placeholder')),true,'placeholder in the old place');
  // The editor in the other window still edits the project, and the app finds its elements.
  await child.locator('.monaco-editor .view-lines').first().click();await child.keyboard.type('// POPOUT');
  await win.waitForFunction(()=>document.getElementById('code').value.includes('// POPOUT'));
  await child.close();
  await win.waitForFunction(()=>document.getElementById('group-code').querySelector(':scope>.dock-unit')?.dataset.unit==='code');
  assert.equal(await win.evaluate(()=>!!document.querySelector('#group-code .dock-placeholder')),false);
  assert.deepEqual(s.errors,[]);
 }finally{await s.close();}
});

test('hovering a HAL example shows a preview of its part layout',{timeout:60000},async()=>{
 const s=await launch();
 try{
  const {win}=s;
  await win.click('[data-activity="examples"]');if(!await visible(win,'#view-examples'))await win.click('[data-activity="examples"]');
  await win.fill('#hal-example-search','GPIO LED');
  await win.hover('#hal-example-list [data-example="blink"]');
  await win.waitForFunction(()=>!document.getElementById('example-layout-preview').hidden);
  assert.equal(await win.textContent('#example-layout-preview .part-preview-name'),'GPIO LED');
  // The preview draws the example's own circuit: the board, a breadboard and its parts and wires.
  assert.ok(await win.evaluate(()=>{const svg=document.querySelector('#example-layout-preview svg');return !!svg&&svg.querySelectorAll('[data-part]').length>=2&&svg.querySelectorAll('path').length>0&&!svg.querySelector('#part-layer');}));
  await win.mouse.move(900,600);await win.waitForFunction(()=>document.getElementById('example-layout-preview').hidden);
  assert.deepEqual(s.errors,[]);
 }finally{await s.close();}
});
