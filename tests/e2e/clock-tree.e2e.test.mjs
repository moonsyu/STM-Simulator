// Pinout & Configuration › Clock (CubeMX Clock Configuration) on the default NUCLEO-F103RB project: turning the tree on,
// the HSE 72 MHz preset, a limit shown in red while choosing, and SystemClock_Config generated from it.
import test from 'node:test';
import assert from 'node:assert/strict';
import {launch} from './harness.mjs';

const text=(win,sel)=>win.evaluate(s=>document.querySelector(s)?.textContent||'',sel);
test('Clock tab: tree on, HSE 72 MHz preset, APB1 limit in red, generated SystemClock_Config, kept in the project',{timeout:120000},async()=>{
 const s=await launch();
 try{
  const {win}=s;
  await win.evaluate(()=>document.getElementById('pinout-open').click());await win.waitForSelector('#pinout-dialog[open]');
  assert.match(await text(win,'#pinout-dialog'),/STM32F103RB/);
  await win.evaluate(()=>document.getElementById('pinout-tab-clock').click());
  await win.waitForSelector('#pinout-clock-panel:not([hidden]) #clock-tree-on');
  await win.evaluate(()=>document.getElementById('clock-tree-on').click());
  await win.waitForSelector('.clock-table');
  assert.match(await text(win,'.clock-table'),/SYSCLK8 MHz/,'HSI 8 MHz from the single setting');
  assert.equal(await win.evaluate(()=>document.getElementById('timer-clock').disabled),true,'the APB1 timer clock follows the tree');
  await win.evaluate(()=>document.querySelector('[data-clock-preset="max"]').click());
  await win.waitForFunction(()=>/SYSCLK72 MHz/.test(document.querySelector('.clock-table')?.textContent||''));
  assert.match(await text(win,'.clock-table'),/APB1 \(PCLK1\)36 MHz최대 36 MHz/);
  assert.match(await text(win,'.clock-table'),/Flash latency2 WS/);
  await win.selectOption('[data-clock-field="apb1"]','1');
  await win.waitForFunction(()=>/APB1\(PCLK1\) 72 MHz: 최대 36 MHz/.test(document.getElementById('clock-problems')?.textContent||''));
  assert.equal(await win.evaluate(()=>document.querySelector('.clock-table tr.clock-over th')?.textContent),'APB1 (PCLK1)');
  assert.match(await text(win,'#pinout-errors'),/APB1\(PCLK1\) 72 MHz/);
  await win.selectOption('[data-clock-field="apb1"]','2');
  await win.waitForFunction(()=>!document.getElementById('clock-problems')?.textContent);
  assert.equal(await win.inputValue('#timer-clock'),'72000000');
  await win.evaluate(()=>document.getElementById('hal-generate').click());
  if(await win.evaluate(()=>document.getElementById('hal-replace-dialog').open))await win.click('#hal-replace-confirm');
  await win.waitForFunction(()=>/osc\.HSEState = RCC_HSE_BYPASS;/.test(document.getElementById('code').value),null,{timeout:10000});
  const code=await win.evaluate(()=>document.getElementById('code').value);
  for(const line of ['osc.PLL.PLLSource = RCC_PLLSOURCE_HSE;','osc.PLL.PLLMUL = RCC_PLL_MUL9;','clk.APB1CLKDivider = RCC_HCLK_DIV2;','FLASH_LATENCY_2'])assert.ok(code.includes(line),line);
  await win.evaluate(()=>document.getElementById('pinout-open').click());await win.waitForSelector('#pinout-dialog[open]');
  await win.evaluate(()=>document.getElementById('pinout-tab-clock').click());
  await win.waitForSelector('#pinout-clock-panel:not([hidden]) .clock-table');
  assert.equal(await win.evaluate(()=>document.getElementById('clock-tree-on').checked),true,'kept in the project');
  assert.match(await text(win,'.clock-table'),/SYSCLK72 MHz/);
  assert.deepEqual(s.errors,[]);
 }finally{await s.close();}
});
