import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {launch,root,applyExample} from './harness.mjs';

const fixture=name=>path.join(root,'tests/fixtures/firmware',name);
const gcc=process.env.ARM_GCC||'/home/claude/tools/xpack-arm-none-eabi-gcc-14.2.1-1.1/bin/arm-none-eabi-gcc'+(process.platform==='win32'?'.exe':'');
const cube=process.env.STM32CUBE_F4_ROOT||'/home/claude/tools/cubef4';
const exists=p=>fs.access(p).then(()=>true,()=>false);
const toolchain=await exists(gcc)&&await exists(path.join(cube,'Drivers/STM32F4xx_HAL_Driver/Inc/stm32f4xx_hal.h'));

async function openFixture(s,name){
 await s.app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},fixture(name+'.json'));
 await s.win.evaluate(()=>document.getElementById('open').click());
 await s.win.waitForFunction(()=>/회로를 열었습니다/.test(document.getElementById('console-output').textContent));
 await s.app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},fixture(name+'.elf'));
 await s.win.keyboard.press('Control+Shift+P');await s.win.keyboard.type('펌웨어 ELF 열기');await s.win.keyboard.press('Enter');
 await s.win.waitForFunction(()=>/펌웨어 ELF를 열었습니다/.test(document.getElementById('console-output').textContent));
}

test('an opened ELF runs on the Cortex-M4 emulator and drives the breadboard',{timeout:120000},async()=>{
 const s=await launch();
 try{
  const {win}=s;
  await openFixture(s,'blink');
  assert.equal(await win.inputValue('#native-target'),'emulator');
  assert.match(await win.textContent('.statusbar'),/펌웨어 에뮬레이터/);
  await win.keyboard.press('F5');
  await win.waitForFunction(()=>/펌웨어 에뮬레이터를 시작했습니다/.test(document.getElementById('console-output').textContent));
  await win.waitForFunction(()=>document.getElementById('shell').dataset.running==='true');
  // The firmware's LED current shows up in the circuit model.
  await win.waitForFunction(()=>parseFloat(document.getElementById('sim-time').textContent)>0.5,null,{timeout:30000});
  await win.waitForFunction(()=>document.getElementById('sim-current').textContent!=='—');
  await win.keyboard.press('F5');
  await win.waitForFunction(()=>document.getElementById('shell').dataset.running==='false');
  assert.deepEqual(s.errors,[]);
 }finally{await s.close();}
});

test('UART firmware echoes through the serial monitor and the logic analyzer decodes the frames',{timeout:120000},async()=>{
 const s=await launch();
 try{
  const {win}=s;
  await openFixture(s,'uart');
  await win.keyboard.press('F5');
  await win.waitForFunction(()=>document.getElementById('shell').dataset.running==='true');
  await win.waitForTimeout(1500);
  await win.click('[data-monitor="bus"]');
  // One byte: the example re-arms Receive_IT while the previous Transmit_IT may be busy, as on hardware.
  await win.uncheck('#serial-newline');await win.fill('#serial-input','A');await win.click('#serial-send');
  await win.waitForFunction(()=>/\[USART2 RX\] A/.test(document.getElementById('console-output').textContent),null,{timeout:20000});
  await win.waitForFunction(()=>/\[USART2 TX\] A/.test(document.getElementById('console-output').textContent),null,{timeout:20000});
  await win.click('[data-monitor="signals"]');
  await win.waitForFunction(()=>!document.getElementById('la-view').hidden,null,{timeout:20000});
  await win.waitForFunction(()=>document.querySelectorAll('#la-svg .la-trace').length>0);
  assert.ok(await win.locator('#la-frames tbody tr').count()>0,'decoded frames listed');
  await win.keyboard.press('F5');
  assert.deepEqual(s.errors,[]);
 }finally{await s.close();}
});

test('source breakpoints, registers and memory in the emulator debugger',{timeout:120000},async()=>{
 const s=await launch();
 try{
  const {win}=s;
  await openFixture(s,'blink');
  const line=await win.evaluate(()=>document.getElementById('code').value.split('\n').findIndex(l=>/HAL_GPIO_(Toggle|Write)Pin/.test(l))+1);
  assert.ok(line>0);
  await win.evaluate(l=>document.dispatchEvent(new CustomEvent('ide-open-source',{detail:{file:'main.c',line:l}})),line);
  await win.keyboard.press('F9');
  await win.click('[data-activity="debug"]');if(!await win.locator('#view-debug').isVisible())await win.click('[data-activity="debug"]');
  await win.click('.debug-toolbar [data-debug="start"]');
  await win.waitForFunction(()=>/일시정지/.test(document.getElementById('debug-location').textContent),null,{timeout:30000});
  await win.click('.debug-toolbar [data-debug="continue"]');
  await win.waitForFunction(l=>new RegExp('main\\.c:'+l).test(document.getElementById('debug-location').textContent),line,{timeout:30000});
  await win.waitForFunction(()=>/pc/i.test(document.getElementById('native-registers').textContent));
  await win.locator('#native-debug-details summary').click();
  await win.fill('#native-memory-address','0x08000000');await win.click('#native-memory-form button');
  await win.waitForFunction(()=>/^0x08000000/.test(document.getElementById('native-memory-output').textContent));
  await win.click('.debug-toolbar [data-debug="over"]');
  await win.waitForFunction(l=>!new RegExp('main\\.c:'+l+'\\b').test(document.getElementById('debug-location').textContent)||/일시정지/.test(document.getElementById('debug-location').textContent),line);
  await win.click('.debug-toolbar [data-debug="stop"]');
  await win.waitForFunction(()=>document.getElementById('shell').dataset.running==='false');
  assert.deepEqual(s.errors,[]);
 }finally{await s.close();}
});

test('emulator target builds the project with ARM GCC and runs it',{skip:!toolchain&&!process.env.CI_REQUIRE_TOOLCHAIN&&'ARM GCC / STM32CubeF4 not installed',timeout:240000},async()=>{
 const s=await launch();
 await fs.writeFile(path.join(s.profile,'native-tools.json'),JSON.stringify({armGcc:gcc,cube,armGdb:'',hostGcc:'',hostGdb:'',clangd:'',openocd:'',buildRoot:''}));
 try{
  const {win}=s;
  await applyExample(win,'5mm 단색 LED');
  await win.selectOption('#native-target','emulator');
  await win.keyboard.press('F5');
  await win.waitForFunction(()=>/펌웨어 ELF 준비 완료/.test(document.getElementById('console-output').textContent),null,{timeout:180000});
  await win.waitForFunction(()=>/PA5=1/.test(document.getElementById('console-output').textContent),null,{timeout:30000});
  await win.waitForFunction(()=>/PA5=0/.test(document.getElementById('console-output').textContent),null,{timeout:30000});
  await win.keyboard.press('F5');
  assert.deepEqual(s.errors,[]);
 }finally{await s.close();}
});
