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
