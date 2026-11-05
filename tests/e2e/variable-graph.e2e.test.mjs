// 변수 그래프 tab (STM Studio style): add globals, run, see their values and lines over time; the list is saved in
// the project; works for the interpreter and for an ELF on the firmware emulator.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {launch,root} from './harness.mjs';

const shot=async(win,name)=>{if(process.env.VG_SHOT_DIR)await win.screenshot({path:path.join(process.env.VG_SHOT_DIR,name)});};
async function addVariable(win,name){await win.fill('#vg-name',name);await win.keyboard.press('Enter');await win.waitForSelector(`[data-vg-remove="${name}"]`);}
const chipValue=(win,name)=>win.evaluate(n=>document.querySelector(`[data-vg-value="${CSS.escape(n)}"]`)?.textContent,name);

test('the interpreter run graphs a counter the code raises; the list is kept in the project; × removes a variable',{timeout:120000},async()=>{
 const s=await launch();
 try{
  const {win}=s;
  await win.evaluate(()=>{const c=document.getElementById('code');c.value=c.value.replace('int main(void)','volatile uint16_t value = 240;\nint main(void)').replace('/* USER CODE BEGIN 3 */','/* USER CODE BEGIN 3 */\n        value++;\n        HAL_Delay(100);');c.dispatchEvent(new Event('input',{bubbles:true}));});
  await win.click('[data-monitor="vars"]');
  assert.equal(await win.isVisible('#vg-empty'),true);
  // Suggestions come from the globals of main.c.
  await win.focus('#vg-name');assert.ok(await win.$$eval('#vg-names option',o=>o.map(x=>x.value).includes('value')));
  await addVariable(win,'value');await addVariable(win,'value * 2');
  await win.keyboard.press('Control+F5');
  await win.waitForFunction(()=>document.getElementById('shell').dataset.running==='true');
  await win.waitForFunction(()=>Number(document.querySelector('[data-vg-value="value"]')?.textContent)>=245,null,{timeout:30000});
  await win.waitForFunction(()=>document.querySelectorAll('#vg-view polyline.vg-line').length===2);
  const v=Number(await chipValue(win,'value')),twice=Number(await chipValue(win,'value * 2'));
  assert.ok(Math.abs(twice-2*v)<=4,`${v} and ${twice}`);
  assert.match(await win.textContent('#vg-view'),/Value/);
  await shot(win,'variable-graph-interpreter.png');
  await win.keyboard.press('Control+F2');
  await win.waitForFunction(()=>document.getElementById('shell').dataset.running==='false');
  // After the run the record stays on screen; × removes a line.
  await win.click('[data-vg-remove="value * 2"]');
  await win.waitForFunction(()=>document.querySelectorAll('#vg-view polyline.vg-line').length===1);
  assert.equal(await win.locator('[data-vg-remove]').count(),1);
  // A name that is not a global shows why it cannot be read.
  await addVariable(win,'nothing_here');
  await win.keyboard.press('Control+F5');
  await win.waitForFunction(()=>/읽기 실패/.test(document.querySelector('[data-vg-value="nothing_here"]')?.textContent||''),null,{timeout:30000});
  assert.match(await win.textContent('#vg-view .vg-error'),/nothing_here/);
  await win.keyboard.press('Control+F2');
  assert.deepEqual(s.errors,[]);
 }finally{await s.close();}
});

test('an ELF on the firmware emulator graphs globals read from emulated RAM (DMA callback counter, ADC value)',{timeout:120000},async()=>{
 const s=await launch();
 try{
  const {win,app}=s,fixture=name=>path.join(root,'tests/fixtures/firmware',name);
  await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},fixture('adc_dma.json'));
  await win.evaluate(()=>document.getElementById('open').click());
  await win.waitForFunction(()=>/회로를 열었습니다/.test(document.getElementById('console-output').textContent));
  await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},fixture('adc_dma.elf'));
  await win.keyboard.press('Control+Shift+P');await win.keyboard.type('펌웨어 ELF 열기');await win.keyboard.press('Enter');
  await win.waitForFunction(()=>/펌웨어 ELF를 열었습니다/.test(document.getElementById('console-output').textContent));
  await win.click('[data-monitor="vars"]');
  await addVariable(win,'fullCount');await addVariable(win,'adc[0]');
  await win.keyboard.press('Control+F5');
  await win.waitForFunction(()=>/펌웨어 에뮬레이터를 시작했습니다/.test(document.getElementById('console-output').textContent),null,{timeout:30000});
  await win.waitForFunction(()=>Number(document.querySelector('[data-vg-value="fullCount"]')?.textContent)>5,null,{timeout:30000});
  await win.waitForFunction(()=>document.querySelectorAll('#vg-view polyline.vg-line').length===2,null,{timeout:10000});
  const adc=Number(await chipValue(win,'adc[0]'));assert.ok(adc>=0&&adc<=4095,'ADC '+adc);
  await shot(win,'variable-graph-emulator.png');
  await win.keyboard.press('Control+F2');
  await win.waitForFunction(()=>document.getElementById('shell').dataset.running==='false');
  assert.deepEqual(s.errors,[]);
 }finally{await s.close();}
});
