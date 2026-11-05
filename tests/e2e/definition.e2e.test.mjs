// Go to definition as in CubeIDE: F12 / Ctrl+click on a HAL call in main.c opens the STM32Cube SDK source as a
// read-only tab (the file tree keeps the project files), with its SDK path, the Outline, Alt+← back, and × to close.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {launch} from './harness.mjs';

const local=path.join(process.env.LOCALAPPDATA||'','STM-Simulator-Tools');
const cubeF4=process.env.STM32CUBE_F4_ROOT||path.join(local,'STM32CubeF4'),cubeF1=process.env.STM32CUBE_F1_ROOT||path.join(local,'STM32CubeF1');
// The UART terminal example has no circuit parts: wait for its code instead (as in sim-gcc.e2e).
async function applyExample(win,query){
 await win.click('[data-activity="examples"]');if(!await win.locator('#view-examples').isVisible())await win.click('[data-activity="examples"]');
 await win.fill('#hal-example-search',query);await win.locator('#hal-example-list [data-example]').first().click();
 await win.waitForFunction(()=>document.getElementById('code').value.includes('HAL_UART_IRQHandler(&huart2)'));
}
const exists=p=>fs.access(p).then(()=>true,()=>false);
const sdk=await exists(path.join(cubeF1,'Drivers/STM32F1xx_HAL_Driver/Src/stm32f1xx_hal_uart.c'))&&await exists(path.join(cubeF4,'Drivers/STM32F4xx_HAL_Driver/Src/stm32f4xx_hal_uart.c'));

test('F12 and Ctrl+click on HAL calls open the SDK source read only; Outline, Alt+← and × work; the file tree is unchanged',{skip:!sdk&&!process.env.CI_REQUIRE_TOOLCHAIN&&'STM32CubeF1/F4 not installed',timeout:180000},async()=>{
 const s=await launch();
 await fs.writeFile(path.join(s.profile,'native-tools.json'),JSON.stringify({armGcc:'',cube:cubeF4,cubeF1,armGdb:'',hostGcc:'',hostGdb:'',clangd:'',openocd:'',buildRoot:''}));
 try{
  const {win}=s,code=()=>win.evaluate(()=>document.getElementById('code').value);
  await applyExample(win,'USART2 내장 터미널');
  const tree=await win.$$eval('#file-tree [data-source]',b=>b.map(x=>x.dataset.source));
  // F12 with the cursor on HAL_UART_IRQHandler (in USART2_IRQHandler).
  await win.evaluate(()=>{const c=document.getElementById('code'),i=c.value.indexOf('HAL_UART_IRQHandler(&huart2)')+3;c.setSelectionRange(i,i);c.focus();});
  await win.keyboard.press('F12');
  await win.waitForSelector('[data-sdk-file$="_hal_uart.c"]',{timeout:30000});
  assert.equal(await win.isVisible('#source-path'),true);assert.match(await win.textContent('#source-path'),/STM32Cube.*Drivers.*_HAL_Driver.*Src.*_hal_uart\.c/);
  assert.match(await win.textContent('#outline-list'),/HAL_UART_IRQHandler\(UART_HandleTypeDef \*huart\) : void/,'the Outline shows the SDK file');
  assert.match(await win.textContent('#outline-file'),/_hal_uart\.c/);
  await win.waitForFunction(()=>/void\s*HAL_UART_IRQHandler\s*\(UART_HandleTypeDef/.test(document.querySelector('#group-code .monaco-editor .view-lines').textContent.replace(/ /g,' ')),null,{timeout:10000});
  // Read only: typing does not change main.c (or anything).
  const before=await code();await win.keyboard.type('zz');assert.equal(await code(),before);
  assert.deepEqual(await win.$$eval('#file-tree [data-source]',b=>b.map(x=>x.dataset.source)),tree,'the file tree keeps the project files only');
  // Alt+← goes back to main.c at the call.
  await win.keyboard.press('Alt+ArrowLeft');
  await win.waitForFunction(()=>document.getElementById('source-path').hidden);
  assert.match(await win.textContent('#outline-file'),/main\.c/);assert.match(await win.textContent('#outline-list'),/main\(void\) : int/);
  // Ctrl+click on HAL_Init opens stm32f1xx_hal.c (or f4) too.
  await win.evaluate(()=>{const c=document.getElementById('code'),i=c.value.indexOf('HAL_Init();');c.setSelectionRange(i,i);});
  const word=win.locator('#group-code .view-line span',{hasText:/^HAL_Init$/}).first();await word.waitFor({timeout:10000});
  // As a user does it: hold Ctrl, point at the name (Monaco underlines it), then click.
  const box=await word.boundingBox();await win.keyboard.down('Control');await win.mouse.move(box.x+box.width/2,box.y+box.height/2);await win.waitForTimeout(300);
  await win.mouse.click(box.x+box.width/2,box.y+box.height/2);await win.keyboard.up('Control');
  await win.waitForSelector('[data-sdk-file$="_hal.c"]',{timeout:30000});
  // A project tab brings main.c back; × closes an SDK tab.
  await win.click('#source-tabs [data-source="main.c"]');assert.equal(await win.evaluate(()=>document.getElementById('source-path').hidden),true);
  await win.click('[data-sdk-close$="_hal_uart.c"]');assert.equal(await win.locator('[data-sdk-file$="_hal_uart.c"]').count(),0);
  // Core · Startup (closed by default): what the ARM build adds, read only, in CubeIDE's file names.
  assert.equal(await win.evaluate(()=>document.getElementById('build-files').open),false);
  await win.click('[data-activity="explorer"]');if(!await win.locator('#build-files summary').isVisible())await win.click('[data-activity="explorer"]');
  await win.click('#build-files summary');
  const rows=await win.$$eval('#build-file-list [data-build-file]',b=>b.map(x=>x.textContent));
  for(const name of [/_it\.c/,/syscalls\.c/,/sysmem\.c/,/system_stm32f[14]xx\.c/,/startup_stm32f(103xb|446xx)\.s/])assert.ok(rows.some(r=>name.test(r)),String(name));
  await win.click('#build-file-list [data-build-file$="_it.c"]');await win.waitForSelector('[data-sdk-file$="_it.c"]');
  assert.match(await win.textContent('#source-path'),/STM Simulator 빌드.*Core.*Src.*_it\.c/);
  await win.waitForFunction(()=>/SysTick_Handler/.test(document.querySelector('#group-code .monaco-editor .view-lines').textContent));
  assert.match(await win.textContent('#outline-list'),/SysTick_Handler\(void\) : void/);
  await win.click('#build-file-list [data-build-file$=".s"]');await win.waitForSelector('[data-sdk-file$=".s"]');
  await win.waitForFunction(()=>/Reset_Handler/.test(document.querySelector('#group-code .monaco-editor .view-lines').textContent),null,{timeout:10000});
  assert.match(await win.textContent('#source-path'),/STM32Cube.*Templates.*gcc.*startup_stm32f/);
  const files=await win.$$eval('#file-tree [data-source]',b=>b.map(x=>x.dataset.source));assert.deepEqual(files,tree,'the project file list is unchanged');
  assert.equal(await code(),before,'main.c is unchanged');
  assert.deepEqual(s.errors,[]);
 }finally{await s.close();}
});
