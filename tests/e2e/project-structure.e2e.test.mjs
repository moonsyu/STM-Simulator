// Feature 14: the explorer shows the project as CubeIDE lays it out (the .ioc, Core/Inc, Core/Src, Core/Startup,
// Drivers, the linker script); the project's own files and what the build provides sit in one tree, and a provided
// file — also the startup code and the linker script — becomes a project file with "프로젝트로 복사해 수정".
import test from 'node:test';
import assert from 'node:assert/strict';
import {launch} from './harness.mjs';

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
  // The .ioc of the current Pinout: shown, not copied (it is changed through the Pinout).
  await win.click('#build-file-list > button[data-build-file$=".ioc"]');
  await win.waitForFunction(()=>/Mcu\.UserName=STM32F103RBTx/.test(document.querySelector('#group-code .monaco-editor .view-lines')?.textContent||''));
  assert.equal(await win.locator('#copy-to-project').count(),0);
  // The linker script and the startup file become project files.
  await win.click('#build-file-list > button[data-build-file$=".ld"]');await win.waitForSelector('#copy-to-project');await win.click('#copy-to-project');
  await win.waitForFunction(()=>!!document.querySelector('#file-tree [data-source="STM32F103RBTX_FLASH.ld"]'));
  await win.click('#build-file-list [data-build-file$="startup_stm32f103xb.s"]');await win.waitForSelector('#copy-to-project');await win.click('#copy-to-project');
  await win.waitForFunction(()=>!!document.querySelector('#file-tree [data-source="Core/Startup/startup_stm32f103xb.s"]'));
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
  assert.match(await win.textContent('#source-path'),/읽기 전용/);assert.equal(await win.locator('#copy-to-project').count(),0);
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
