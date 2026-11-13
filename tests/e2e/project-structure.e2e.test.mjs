// Feature 14: the explorer shows the project as CubeIDE lays it out (the .ioc, Core/Inc, Core/Src, Core/Startup,
// Drivers, the linker script); the project's own files and what the build provides sit in one tree, and a provided
// file — also the startup code and the linker script — becomes a project file with "프로젝트로 복사해 수정".
import test from 'node:test';
import assert from 'node:assert/strict';
import {launch} from './harness.mjs';
async function editShown(win,file){await win.waitForFunction(leaf=>!document.getElementById('source-path').hidden&&document.getElementById('source-path').textContent.includes(leaf),file.split('/').at(-1),{timeout:15000});await win.evaluate(()=>document.getElementById('code').focus());await win.keyboard.press('Control+End');await win.keyboard.type('\n/* edited */');await win.waitForFunction(f=>!!document.querySelector(`#file-tree [data-source="${f}"]`),file,{timeout:10000});}

test('the CubeIDE tree lists the whole project; startup code and the linker script can be copied in and edited',{timeout:150000},async()=>{
 const s=await launch();
 try{
  const {win}=s;
  await win.click('[data-activity="explorer"]');if(!await win.locator('#build-files > summary').isVisible())await win.click('[data-activity="explorer"]');
  assert.equal(await win.textContent('#build-files-title'),'프로젝트 구조 (CubeIDE)');
  await win.click('#build-files > summary');
  const folders=()=>win.$$eval('#build-file-list [data-tree-folder]',d=>d.map(x=>x.dataset.treeFolder));
  for(const f of ['Core','Core/Inc','Core/Src','Core/Startup','Drivers','Drivers/STM32F1xx_HAL_Driver/Src','Drivers/CMSIS/Device/ST/STM32F1xx/Include'])assert.ok((await folders()).includes(f),f);
  // Core is open, Drivers folded; the project's main.c is in Core/Src next to what the build adds.
  assert.equal(await win.$eval('#build-file-list [data-tree-folder="Core/Src"]',d=>d.open),true);
  assert.equal(await win.$eval('#build-file-list [data-tree-folder="Drivers"]',d=>d.open),false);
  const inSrc=await win.$$eval('#build-file-list [data-tree-folder="Core/Src"] > .tree-children > button',b=>b.map(x=>x.textContent.replace(/^[A-Z]/,'')));
  assert.deepEqual(inSrc.sort(),['main.c','stm32f1xx_it.c','syscalls.c','sysmem.c','system_stm32f1xx.c']);
  assert.equal(await win.$eval('#build-file-list [data-tree-source="main.c"]',b=>b.classList.contains('tree-own')),true);
  const top=await win.$$eval('#build-file-list > button',b=>b.map(x=>x.textContent.replace(/^[A-Z]/,'')));
  assert.ok(top.some(n=>/\.ioc$/.test(n))&&top.includes('STM32F103RBTX_FLASH.ld'),top.join(' '));
  // The .ioc of the current Pinout: shown read only (it is changed through the Pinout).
  await win.click('#build-file-list > button[data-build-file$=".ioc"]');
  await win.waitForFunction(()=>/Mcu\.UserName=STM32F103RBTx/.test(document.querySelector('#group-code .monaco-editor .view-lines')?.textContent||''));
  assert.match(await win.textContent('#source-path'),/읽기 전용/);
  // The linker script and the startup file become project files when they are edited (feature 45).
  await win.click('#build-file-list > button[data-build-file$=".ld"]');assert.match(await win.textContent('#source-path'),/한 번 만드는 파일 · 고친 내용 유지 · ARM GCC 빌드에서만 쓰임/);await editShown(win,'STM32F103RBTX_FLASH.ld');
  await win.click('#build-file-list [data-build-file$="startup_stm32f103xb.s"]');await editShown(win,'Core/Startup/startup_stm32f103xb.s');
  // In the tree they are the project's now, and the provided ones are gone.
  assert.equal(await win.locator('#build-file-list [data-build-file$=".ld"]').count(),0);assert.equal(await win.locator('#build-file-list [data-build-file$="startup_stm32f103xb.s"]').count(),0);
  assert.equal(await win.locator('#build-file-list [data-tree-source="STM32F103RBTX_FLASH.ld"]').count(),1);
  assert.equal(await win.locator('#build-file-list [data-tree-folder="Core/Startup"] [data-tree-source="Core/Startup/startup_stm32f103xb.s"]').count(),1);
  // Editable like any source, opened from the tree.
  await win.click('#build-file-list [data-tree-source="STM32F103RBTX_FLASH.ld"]');
  await win.waitForFunction(()=>/ENTRY\(Reset_Handler\)/.test(document.getElementById('code').value));
  await win.evaluate(()=>{const c=document.getElementById('code');c.value=c.value+'\n/* my section */\n';c.dispatchEvent(new Event('input',{bubbles:true}));});
  await win.click('#build-file-list [data-tree-source="main.c"]');await win.click('#build-file-list [data-tree-source="STM32F103RBTX_FLASH.ld"]');
  await win.waitForFunction(()=>/my section/.test(document.getElementById('code').value));
  // A folder the user opened stays open when the tree is drawn again.
  await win.click('#build-file-list [data-tree-folder="Drivers"] > summary');
  await win.click('#build-file-list [data-tree-source="main.c"]');
  assert.equal(await win.$eval('#build-file-list [data-tree-folder="Drivers"]',d=>d.open),true);
  assert.deepEqual(s.errors,[]);
 }finally{await s.close();}
});

// Feature 20: an FSP project in the layout of the e² studio project explorer.
test('an FPB-RA6E1 project shows src, ra_gen, ra_cfg, script and ra; hal_entry.c is the project\'s, the rest opens read only',{timeout:150000},async()=>{
 const s=await launch();
 try{
  const {win}=s;
  await win.evaluate(()=>document.getElementById('new').click());if(await win.evaluate(()=>document.getElementById('replace-dialog').open))await win.click('#replace-confirm');
  await win.waitForSelector('#project-dialog[open]');await win.selectOption('#new-project-board','fpb-ra6e1');await win.selectOption('#new-project-template','ra_button_irq_rising');
  await win.click('#project-create');await win.waitForFunction(()=>!document.getElementById('project-dialog').open);
  await win.click('[data-activity="explorer"]');if(!await win.locator('#build-files > summary').isVisible())await win.click('[data-activity="explorer"]');
  assert.equal(await win.textContent('#build-files-title'),'프로젝트 구조 (e² studio)');
  await win.click('#build-files > summary');
  const folders=await win.$$eval('#build-file-list [data-tree-folder]',d=>d.map(x=>x.dataset.treeFolder));
  for(const f of ['src','ra_gen','ra_cfg','ra_cfg/fsp_cfg/bsp','script','ra','ra/fsp/src/bsp/mcu/all','ra/fsp/src/r_icu','ra/fsp/inc/api','ra/board/ra6e1_fpb'])assert.ok(folders.includes(f),f);
  // This project has an IRQ stack and no UART: r_icu is listed, r_sci_uart is not.
  assert.ok(!folders.includes('ra/fsp/src/r_sci_uart'));
  // src holds the user's hal_entry.c; ra_gen/main.c is the generated one that calls it.
  assert.deepEqual(await win.$$eval('#build-file-list [data-tree-folder="src"] > .tree-children > button',b=>b.map(x=>[x.textContent.replace(/^[A-Z]/,''),x.classList.contains('tree-own')])),[['hal_entry.c',true]]);
  await win.click('#build-file-list [data-build-file="ra_gen/main.c"]');
  await win.waitForFunction(()=>/hal_entry\(\)/.test(document.querySelector('#group-code .monaco-editor .view-lines')?.textContent||''));
  // An FSP project's generated files stay read only, with the reason (e² studio writes them again).
  assert.match(await win.textContent('#source-path'),/읽기 전용/);
  await win.evaluate(()=>document.getElementById('code').focus());await win.keyboard.type('zz');await win.waitForTimeout(200);
  assert.doesNotMatch(await win.evaluate(()=>document.querySelector('#group-code .monaco-editor .view-lines').textContent),/zz/);
  // The pin names of the course: ra_cfg/fsp_cfg/bsp/bsp_pin_cfg.h; the delay function: ra/fsp/src/bsp/mcu/all/bsp_delay.c.
  await win.click('#build-file-list [data-tree-folder="ra_cfg"] > summary');await win.click('#build-file-list [data-tree-folder="ra_cfg/fsp_cfg"] > summary');await win.click('#build-file-list [data-tree-folder="ra_cfg/fsp_cfg/bsp"] > summary');
  await win.click('#build-file-list [data-build-file="ra_cfg/fsp_cfg/bsp/bsp_pin_cfg.h"]');
  await win.waitForFunction(()=>/LED1/.test(document.querySelector('#group-code .monaco-editor .view-lines')?.textContent||''));
  for(const f of ['ra','ra/fsp','ra/fsp/src','ra/fsp/src/bsp','ra/fsp/src/bsp/mcu','ra/fsp/src/bsp/mcu/all'])await win.click(`#build-file-list [data-tree-folder="${f}"] > summary`);
  await win.click('#build-file-list [data-build-file="ra/fsp/src/bsp/mcu/all/bsp_delay.c"]');
  // The file opens as a read-only SDK tab (its first screen is the licence header).
  await win.waitForSelector('[data-sdk-file$="bsp_delay.c"]',{timeout:15000});assert.match(await win.textContent('#source-path'),/bsp_delay.c/);
  // Back to the user's file from the tree.
  await win.click('#build-file-list [data-tree-source="main.c"]');
  await win.waitForFunction(()=>/irq_callback/.test(document.getElementById('code').value));
  assert.deepEqual(s.errors,[]);
 }finally{await s.close();}
});

// Feature 27: every level of the explorer trees is one 12 px step in — the top level from the section title, a
// folder's files from the folder — and the Developer Assistance tree uses the same steps.
test('the project tree and Developer Assistance indent one step per level',{timeout:150000},async()=>{
 const s=await launch();
 try{
  const {win}=s;
  await win.click('[data-activity="explorer"]');if(!await win.locator('#build-files > summary').isVisible())await win.click('[data-activity="explorer"]');
  await win.click('#build-files > summary');
  const left=selector=>win.$eval(selector,e=>e.getBoundingClientRect().left);
  // Within a pixel: the window's scale rounds the border and the paddings.
  const near=(actual,expected,message)=>assert.ok(Math.abs(actual-expected)<=1,`${message}: ${actual} for ${expected}`);
  const step=12,title=await left('#build-files > summary'),core=await left('#build-file-list [data-tree-folder="Core"] > summary');
  // The title's text starts 12 px in (its padding); the top-level folder one step further.
  // The title's arrow starts at its 12 px padding; the top-level rows start one step to the right of it.
  near(core-title,12+step,'the top-level folder is one step in from the title');
  const src=await left('#build-file-list [data-tree-folder="Core/Src"] > summary');near(src-core,step,'Core → Core/Src');
  const file=await left('#build-file-list [data-tree-folder="Core/Src"] > .tree-children > button');near(file-src,step,'Core/Src → its files');
  // A file and a folder of one level start at the same place (the file leaves the arrow's width empty).
  near(await left('#build-file-list > button'),core,'a file beside a folder');
  // Three levels down the step is still the same.
  for(const f of ['Drivers','Drivers/STM32F1xx_HAL_Driver'])await win.click(`#build-file-list [data-tree-folder="${f}"] > summary`);
  const drivers=await left('#build-file-list [data-tree-folder="Drivers"] > summary'),hal=await left('#build-file-list [data-tree-folder="Drivers/STM32F1xx_HAL_Driver"] > summary'),inc=await left('#build-file-list [data-tree-folder="Drivers/STM32F1xx_HAL_Driver/Src"] > summary');
  near(drivers-core,0,'Drivers beside Core');near(hal-drivers,step,'Drivers → HAL driver');near(inc-hal,step,'HAL driver → Src');
  // The note beside the title sits on its own line and does not wrap.
  assert.equal(await win.$eval('#build-files > summary small',e=>getComputedStyle(e).display+' '+getComputedStyle(e).whiteSpace),'block nowrap');
  // Developer Assistance (an FSP project): the same rules.
  await win.evaluate(()=>document.getElementById('new').click());if(await win.evaluate(()=>document.getElementById('replace-dialog').open))await win.click('#replace-confirm');
  await win.waitForSelector('#project-dialog[open]');await win.selectOption('#new-project-board','fpb-ra6e1');await win.selectOption('#new-project-template','ra-minimal');
  await win.click('#project-create');await win.waitForFunction(()=>!document.getElementById('project-dialog').open);
  await win.click('[data-activity="explorer"]');if(!await win.locator('#ra-assist > summary').isVisible())await win.click('[data-activity="explorer"]');
  await win.click('#ra-assist > summary');
  const root=await left('#ra-assist-list > .tree-folder > summary'),group=await left('#ra-assist-list [data-assist="g_ioport"] > summary'),item=await left('#ra-assist-list [data-assist="g_ioport"] [data-assist-item]');
  near(root-await left('#ra-assist > summary'),12+step,'assistance: top level');near(group-root,step,'assistance: group');near(item-group,step,'assistance: item');
  assert.equal(await win.$eval('#ra-assist-list [data-assist-item]',e=>getComputedStyle(e).backgroundColor),'rgba(0, 0, 0, 0)','the items are tree rows, not default buttons');
  assert.deepEqual(s.errors,[]);
 }finally{await s.close();}
});

// Feature 28: "소스 파일" is a tree too — a file kept in a folder sits under that folder, one step in per level, and a
// folder the user folded stays folded when the list is drawn again.
test('the source file list shows folders as a tree; folding is kept; files open from inside a folder',{timeout:150000},async()=>{
 const s=await launch();
 try{
  const {win}=s;
  await win.click('[data-activity="explorer"]');if(!await win.locator('#build-files > summary').isVisible())await win.click('[data-activity="explorer"]');
  await win.click('#build-files > summary');
  // Two project files in folders (the startup file and a header) and one at the top (the linker script).
  for(const [file,name]of [['startup_stm32f103xb.s','Core/Startup/startup_stm32f103xb.s'],['main.h','Core/Inc/main.h']]){await win.click(`#build-file-list [data-build-file$="${file}"]`);await editShown(win,name);}
  await win.click('#build-file-list > button[data-build-file$=".ld"]');await editShown(win,'STM32F103RBTX_FLASH.ld');
  assert.deepEqual(await win.$$eval('#file-tree [data-src-folder]',d=>d.map(x=>x.dataset.srcFolder).sort()),['Core','Core/Inc','Core/Startup']);
  // Files sit in their folders; main.c and the linker script are at the top.
  assert.deepEqual(await win.$$eval('#file-tree [data-src-folder="Core/Startup"] > .tree-children > [data-source]',b=>b.map(x=>x.dataset.source)),['Core/Startup/startup_stm32f103xb.s']);
  assert.deepEqual(await win.$$eval('#file-tree [data-src-folder="Core/Inc"] > .tree-children > [data-source]',b=>b.map(x=>x.dataset.source)),['Core/Inc/main.h']);
  assert.deepEqual(await win.$$eval('#file-tree > [data-source]',b=>b.map(x=>x.dataset.source)),['main.c','STM32F103RBTX_FLASH.ld']);
  assert.deepEqual(await win.$$eval('#file-tree [data-source] .file-kind',k=>k.map(x=>x.textContent).sort()),['C','H','L','S']);
  // One step (12 px) per level, as in the project structure tree.
  const left=selector=>win.$eval(selector,e=>e.getBoundingClientRect().left),near=(a,b,m)=>assert.ok(Math.abs(a-b)<=1,`${m}: ${a} for ${b}`);
  const core=await left('#file-tree [data-src-folder="Core"] > summary > *, #file-tree [data-src-folder="Core"] > summary').catch(()=>left('#file-tree [data-src-folder="Core"] > summary'));
  const arrow=selector=>win.$eval(selector,e=>e.getBoundingClientRect().left+parseFloat(getComputedStyle(e).paddingLeft));
  const coreArrow=await arrow('#file-tree [data-src-folder="Core"] > summary'),incArrow=await arrow('#file-tree [data-src-folder="Core/Inc"] > summary');
  near(incArrow-coreArrow,12,'Core → Core/Inc');void core;
  const header=await win.$eval('#file-tree [data-src-folder="Core/Inc"] [data-source] .file-kind',e=>e.getBoundingClientRect().left);
  near(header-incArrow,12+14,'a file is one step in from its folder, after the arrow column');
  // Open a file from inside a folder; fold Core; the fold stays when the list is drawn again.
  await win.click('#file-tree [data-source="Core/Inc/main.h"]');
  await win.waitForFunction(()=>document.querySelector('#file-tree [data-source="Core/Inc/main.h"]')?.classList.contains('active'));
  await win.click('#file-tree [data-src-folder="Core"] > summary');
  assert.equal(await win.$eval('#file-tree [data-src-folder="Core"]',d=>d.open),false);
  await win.click('#file-tree [data-source="main.c"]');
  await win.waitForFunction(()=>document.querySelector('#file-tree [data-source="main.c"]')?.classList.contains('active'));
  assert.equal(await win.$eval('#file-tree [data-src-folder="Core"]',d=>d.open),false,'still folded after the list was drawn again');
  assert.equal(await win.$eval('#file-tree [data-src-folder="Core/Inc"]',d=>d.open),true,'a folder inside keeps its own state');
  assert.deepEqual(s.errors,[]);
 }finally{await s.close();}
});
