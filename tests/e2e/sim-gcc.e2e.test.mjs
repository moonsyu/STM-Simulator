// The simulator target builds with the real board's ARM GCC: any header and C library function works, and missing
// tools are offered for installation (or the run falls back to the built-in interpreter).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {launch} from './harness.mjs';

const local=path.join(process.env.LOCALAPPDATA||'','STM-Simulator-Tools');
const gcc=process.env.ARM_GCC||path.join(local,'xpack-arm-none-eabi-gcc-15.2.1-1.1/bin/arm-none-eabi-gcc'+(process.platform==='win32'?'.exe':''));
const cube=process.env.STM32CUBE_F4_ROOT||path.join(local,'STM32CubeF4');
const exists=p=>fs.access(p).then(()=>true,()=>false);
const toolchain=await exists(gcc)&&await exists(path.join(cube,'Drivers/STM32F4xx_HAL_Driver/Inc/stm32f4xx_hal.h'));
async function applyExample(win,query){
 await win.click('[data-activity="examples"]');if(!await win.locator('#view-examples').isVisible())await win.click('[data-activity="examples"]');
 await win.fill('#hal-example-search',query);await win.locator('#hal-example-list [data-example]').first().click();
 await win.waitForFunction(()=>/echoHead/.test(document.getElementById('code').value));
}
const setCode=(win,edit)=>win.evaluate(src=>{const c=document.getElementById('code');c.value=new Function('c','return ('+src+')(c)')(c.value);c.dispatchEvent(new Event('input',{bubbles:true}));},edit.toString());
const consoleText=win=>win.textContent('#console-output');

test('the simulator builds with ARM GCC: <stdlib.h>, <ctype.h> and snprintf work as on the real board',{skip:!toolchain&&!process.env.CI_REQUIRE_TOOLCHAIN&&'ARM GCC / STM32CubeF4 not installed',timeout:300000},async()=>{
 const s=await launch({simEngine:'gcc'});
 await fs.writeFile(path.join(s.profile,'native-tools.json'),JSON.stringify({armGcc:gcc,cube,armGdb:'',hostGcc:'',hostGdb:'',clangd:'',openocd:'',buildRoot:''}));
 try{
  const {win}=s;
  await applyExample(win,'USART2 내장 터미널');
  // Headers and functions the built-in interpreter does not have.
  await setCode(win,c=>c.replace('#include <stdio.h>','#include <stdio.h>\n#include <stdlib.h>\n#include <ctype.h>').replace('/* USER CODE BEGIN 2 */','/* USER CODE BEGIN 2 */\n  char text[16];\n  snprintf(text, sizeof(text), "n=%d %c", atoi("42") + 1, toupper(\'a\'));\n  printf("%s\\n", text);'));
  assert.equal(await win.evaluate(()=>document.getElementById('sim-engine').value),'gcc');
  await win.keyboard.press('Control+F5');
  await win.waitForFunction(()=>/시뮬레이터\(ARM GCC 빌드\)를 시작했습니다/.test(document.getElementById('console-output').textContent),null,{timeout:240000});
  await win.waitForFunction(()=>/n=43 A/.test(document.getElementById('console-output').textContent),null,{timeout:30000});
  await win.waitForFunction(()=>/HAL UART ready/.test(document.getElementById('console-output').textContent),null,{timeout:30000});
  await win.keyboard.press('Control+F2');
  assert.deepEqual(s.errors,[]);
 }finally{await s.close();}
});

test('without ARM GCC the simulator offers to install it; cancel stops, the interpreter choice runs and is kept',{timeout:180000},async t=>{
 // A PC without the tools: an empty tools folder.
 const empty=await fs.mkdtemp(path.join(tmpdir(),'stm-no-tools-'));
 const s=await launch({simEngine:'gcc',env:{LOCALAPPDATA:empty}});
 try{
  const {win}=s;
  await applyExample(win,'USART2 내장 터미널');
  await win.keyboard.press('Control+F5');
  const offered=await win.waitForSelector('#sim-tools-dialog[open]',{timeout:15000}).then(()=>true,()=>false);
  if(!offered){t.skip('ARM GCC is found outside the tools folder on this PC');return;}
  assert.match(await win.textContent('#sim-tools-plan'),/ARM GCC/);assert.match(await win.textContent('#sim-tools-plan'),/STM32Cube/);
  assert.match(await win.textContent('#sim-tools-status'),/MB를 내려받습니다/);
  await win.click('#sim-tools-cancel');assert.equal(await win.evaluate(()=>document.getElementById('sim-tools-dialog').open),false);
  assert.match(await win.textContent('#run'),/실행/);assert.doesNotMatch(await consoleText(win),/HAL 프로그램을 시작했습니다/);
  await win.keyboard.press('Control+F5');await win.waitForSelector('#sim-tools-dialog[open]');
  await win.click('#sim-tools-interpreter');
  await win.waitForFunction(()=>/HAL UART ready/.test(document.getElementById('console-output').textContent),null,{timeout:30000});
  assert.match(await consoleText(win),/HAL 프로그램을 시작했습니다/);
  assert.equal(await win.evaluate(()=>[document.getElementById('sim-engine').value,localStorage.getItem('stm32lab.simEngine')].join()),'interpreter,interpreter');
  await win.keyboard.press('Control+F2');
  assert.deepEqual(s.errors,[]);
 }finally{await s.close();await fs.rm(empty,{recursive:true,force:true});}
});
