import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {launch} from './harness.mjs';

const VERSION=JSON.parse(readFileSync(new URL('../../package.json',import.meta.url),'utf8')).version;
async function applyExample(win,query){
 await win.click('[data-activity="examples"]');if(!await win.locator('#view-examples').isVisible())await win.click('[data-activity="examples"]');
 await win.fill('#hal-example-search',query);await win.locator('#hal-example-list [data-example]').first().click();
}

test('도움말 → 업데이트 로그 opens a floating window: newest first, five a page, search, moved by its title',{timeout:120000},async()=>{
 const s=await launch();
 try{
  const {win}=s;
  await win.click('.menubar-item >> nth=5');await win.click('.menu:popover-open [data-command="help.changelog"]');
  await win.waitForSelector('#update-log:not([hidden])');
  const entries=()=>win.evaluate(()=>[...document.querySelectorAll('#update-log .update-entry')].map(e=>({date:e.querySelector('time').textContent,version:e.querySelector('.update-version').textContent,items:e.querySelectorAll('li').length})));
  const first=await entries();assert.equal(first.length,5);assert.equal(first[0].version,'v'+VERSION);
  assert.ok(first.every((e,i)=>!i||e.date<=first[i-1].date),'newest first');assert.ok(first.every(e=>/^\d{4}-\d{2}-\d{2}$/.test(e.date)&&e.items>0));
  // The editor stays usable beside it (not modal) and the search box has focus.
  assert.equal(await win.evaluate(()=>document.activeElement?.id),'update-log-search');
  await win.click('#update-log-pages [aria-label="다음 페이지"]');const second=await entries();assert.equal(second.length,5);assert.ok(second[0].date<=first[4].date);
  assert.equal(await win.getAttribute('#update-log-pages [aria-current="page"]','data-page'),'2');
  await win.fill('#update-log-search','1.12.3');const found=await entries();assert.deepEqual(found.map(e=>e.version),['v1.12.3']);
  assert.match(await win.textContent('#update-log-count'),/1개 버전/);assert.ok(await win.locator('#update-log mark').count()>0);
  await win.fill('#update-log-search','없는기능검색어');assert.match(await win.textContent('#update-log-list'),/검색 결과가 없습니다/);
  // Dragged by the title bar.
  const before=await win.locator('#update-log').boundingBox(),title=await win.locator('#update-log .update-log-title h2').boundingBox();
  await win.mouse.move(title.x+10,title.y+5);await win.mouse.down();await win.mouse.move(title.x-110,title.y+65,{steps:4});await win.mouse.up();
  const after=await win.locator('#update-log').boundingBox();assert.ok(Math.abs(after.x-(before.x-120))<2&&Math.abs(after.y-(before.y+60))<2,JSON.stringify([before,after]));
  await win.focus('#update-log-search');await win.keyboard.press('Escape');assert.equal(await win.isHidden('#update-log'),true);
  assert.deepEqual(s.errors,[]);
 }finally{await s.close();}
});

test('the run target menu closes on its button, on a click elsewhere, on Esc and when the window loses focus',{timeout:120000},async()=>{
 const s=await launch();
 try{
  const {win,app}=s,open=()=>win.evaluate(()=>document.getElementById('run-target-menu').matches(':popover-open'));
  await win.click('#run-target-toggle');assert.equal(await open(),true);await win.waitForFunction(()=>document.getElementById('run-target-toggle').getAttribute('aria-expanded')==='true');
  await win.click('#run-target-toggle');assert.equal(await open(),false,'its button closes it');
  // Closed means not drawn: an author display value on the menu kept the closed popover on screen (1.12.3–1.14.1).
  const drawn=()=>win.evaluate(()=>{const m=document.getElementById('run-target-menu'),r=m.getBoundingClientRect();return r.width>0&&r.height>0;});
  assert.equal(await drawn(),false,'the closed menu is not drawn');
  // Every closed popover of the app (title bar menus, previews, this menu) is hidden.
  for(const n of [0,1,2,3,4,5]){await win.click(`.menubar-item >> nth=${n}`);await win.keyboard.press('Escape');}
  assert.deepEqual(await win.evaluate(()=>[...document.querySelectorAll('[popover]')].filter(p=>!p.matches(':popover-open')&&getComputedStyle(p).display!=='none').map(p=>p.id||p.className)),[]);
  await win.click('#run-target-toggle');await win.click('#statusbar');assert.equal(await open(),false,'a click elsewhere closes it');
  await win.click('#run-target-toggle');await win.keyboard.press('Escape');assert.equal(await open(),false,'Esc closes it');
  await win.click('#run-target-toggle');await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.executeJavaScript('dispatchEvent(new Event("blur"))'));
  assert.equal(await open(),false,'another window taking the focus closes it');
  // A double click on ▾ (a quick second press or a chattering mouse) toggles once: its second click used to reopen the
  // menu the first one closed. Sent through Electron's input path like a real mouse.
  const b=await win.locator('#run-target-toggle').boundingBox(),x=Math.round(b.x+b.width/2),y=Math.round(b.y+b.height/2);
  const double=()=>app.evaluate(({BrowserWindow},[x,y])=>{const w=BrowserWindow.getAllWindows()[0].webContents;w.sendInputEvent({type:'mouseMove',x,y});for(const n of [1,2]){w.sendInputEvent({type:'mouseDown',x,y,button:'left',clickCount:n});w.sendInputEvent({type:'mouseUp',x,y,button:'left',clickCount:n});}},[x,y]);
  await double();await win.waitForFunction(()=>document.getElementById('run-target-menu').matches(':popover-open'));
  await double();await win.waitForFunction(()=>!document.getElementById('run-target-menu').matches(':popover-open'));
  assert.deepEqual(s.errors,[]);
 }finally{await s.close();}
});

test('choosing an example while the UART example runs stops it and applies the example; the code can be edited again',{timeout:120000},async()=>{
 const s=await launch();
 try{
  const {win}=s;
  await applyExample(win,'USART2 내장 터미널');await win.waitForFunction(()=>/echoHead/.test(document.getElementById('code').value));
  await win.click('#run');await win.waitForFunction(()=>/HAL UART ready/.test(document.getElementById('console-output').textContent));
  assert.equal(await win.evaluate(()=>document.getElementById('code').readOnly),true);
  assert.match(await win.evaluate(()=>document.getElementById('code').dataset.readOnlyMessage),/실행 정지/);
  await applyExample(win,'HAL · GPIO LED');
  await win.waitForFunction(()=>!/echoHead/.test(document.getElementById('code').value)&&/TogglePin\(GPIOA, GPIO_PIN_5\)/.test(document.getElementById('code').value));
  assert.match(await win.textContent('#console-output'),/실행을 정지하고 예제를 적용합니다/);
  assert.equal(await win.evaluate(()=>document.getElementById('code').readOnly),false);assert.match(await win.textContent('#run'),/실행/);
  assert.deepEqual(s.errors,[]);
 }finally{await s.close();}
});
