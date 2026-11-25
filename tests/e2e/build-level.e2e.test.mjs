// Feature 54: 편집 → 설정 → "빌드 수준" — CubeIDE's Optimization level for the Debug and the Release build of the open
// project. Both start at None (-O0); a choice is stored in the project and can be undone.
import test from 'node:test';
import assert from 'node:assert/strict';
import {launch,visible} from './harness.mjs';

const saved=win=>win.evaluate(()=>JSON.parse(localStorage.getItem('stm32lab.project.v2')||'{}').ide?.native??null);
const openSettings=async win=>{await win.click('.menubar-item >> nth=1');await win.click('.menu:popover-open [data-command="view.settings"]');await win.waitForSelector('#settings-dialog[open]');};

test('the 빌드 수준 tab lists CubeIDE\'s levels for Debug and Release, starts at -O0 and keeps a choice in the project',{timeout:120000},async()=>{
 const s=await launch();
 try{
  const {win}=s;
  await openSettings(win);
  assert.deepEqual(await win.$$eval('[data-settings-tab]',tabs=>tabs.map(t=>t.textContent)),['화면 · 편집기','단축키','빌드 수준','업데이트','레이아웃']);
  await win.click('[data-settings-tab="build"]');
  assert.ok(await visible(win,'#settings-pane-build'));assert.match(await win.textContent('#settings-pane-build h3'),/^빌드 수준$/);
  for(const configuration of ['Debug','Release']){
   const select=`#build-level-${configuration}`;
   assert.deepEqual(await win.$$eval(select+' option',o=>o.map(x=>x.textContent)),['None (-O0)','Optimize for Debug (-Og)','Optimize (-O1)','Optimize more (-O2)','Optimize most (-O3)','Optimize for size (-Os)','Optimize for speed (-Ofast)']);
   assert.equal(await win.inputValue(select),'-O0',configuration+' starts without optimisation');
   assert.match(await win.textContent(`label:has(${select})`),new RegExp('^'+configuration+' · Optimization level'));
  }
  // A choice is stored in the project, per configuration.
  await win.selectOption('#build-level-Release','-Os');
  await win.waitForFunction(()=>JSON.parse(localStorage.getItem('stm32lab.project.v2')||'{}').ide?.native?.optimization?.Release==='-Os');
  assert.deepEqual((await saved(win)).optimization,{Release:'-Os'});
  await win.selectOption('#build-level-Debug','-Og');
  await win.waitForFunction(()=>JSON.parse(localStorage.getItem('stm32lab.project.v2')||'{}').ide?.native?.optimization?.Debug==='-Og');
  assert.deepEqual((await saved(win)).optimization,{Debug:'-Og',Release:'-Os'});
  // Closing and opening the window shows the stored levels; the toolbar's Debug / Release choice does not change them.
  await win.click('#settings-dialog-close');
  await openSettings(win);await win.click('[data-settings-tab="build"]');
  assert.equal(await win.inputValue('#build-level-Debug'),'-Og');assert.equal(await win.inputValue('#build-level-Release'),'-Os');
  // None (-O0) takes the stored level out again.
  await win.selectOption('#build-level-Debug','-O0');
  await win.waitForFunction(()=>!JSON.parse(localStorage.getItem('stm32lab.project.v2')||'{}').ide?.native?.optimization?.Debug);
  assert.deepEqual((await saved(win)).optimization,{Release:'-Os'});
  await win.click('#settings-dialog-close');
  // Ctrl+Z gives the level back (the choice is an edit of the project).
  await win.click('#undo');
  await win.waitForFunction(()=>JSON.parse(localStorage.getItem('stm32lab.project.v2')||'{}').ide?.native?.optimization?.Debug==='-Og');
  await openSettings(win);await win.click('[data-settings-tab="build"]');
  assert.equal(await win.inputValue('#build-level-Debug'),'-Og');
  await win.click('#settings-dialog-close');
  // The same tab on an FPB-RA6E1 project: a new project starts at -O0 again.
  assert.deepEqual(s.errors,[]);
 }finally{await s.close();}
});
