// Pinout IWDG / WWDG cards (NUCLEO-F103RB, the start board): the cards show the timeout, enabling the WWDG early wakeup
// turns WWDG_IRQn on, "설정으로 HAL 코드 생성" writes MX_IWDG_Init / MX_WWDG_Init and the callback, and the run restarts
// when the project's own loop does not refresh the IWDG, reading RCC_FLAG_IWDGRST after the restart.
import test from 'node:test';
import assert from 'node:assert/strict';
import {launch} from './harness.mjs';

test('Pinout IWDG / WWDG: timing notes, generated init code, an unrefreshed IWDG restarts the run',{timeout:150000},async()=>{
 const s=await launch();
 try{
  const {win}=s,code=()=>win.evaluate(()=>document.getElementById('code').value);
  await win.evaluate(()=>document.getElementById('pinout-open').click());await win.waitForSelector('#pinout-dialog[open]');
  await win.check('[data-peripheral="IWDG"]');await win.waitForSelector('[data-wdg="IWDG"][data-key="reload"]');
  const iwdg='#pinout-peripherals section.peripheral-card:has([data-peripheral="IWDG"])',wwdg='#pinout-peripherals section.peripheral-card:has([data-peripheral="WWDG"])';
  assert.match(await win.textContent(iwdg),/LSI 40 kHz \/ 4 · \(4095 \+ 1\) 카운트 = 409\.6 ms/);
  await win.selectOption('[data-wdg="IWDG"][data-key="prescaler"]','32');await win.waitForFunction(()=>document.querySelector('[data-wdg="IWDG"][data-key="prescaler"]')?.value==='32');
  await win.fill('[data-wdg="IWDG"][data-key="reload"]','99');await win.dispatchEvent('[data-wdg="IWDG"][data-key="reload"]','change');
  await win.waitForFunction(sel=>/= 80 ms 안에 HAL_IWDG_Refresh/.test(document.querySelector(sel).textContent),iwdg);
  await win.fill('[data-wdg="IWDG"][data-key="reload"]','5000');await win.dispatchEvent('[data-wdg="IWDG"][data-key="reload"]','change');
  await win.waitForFunction(sel=>/0~4095 범위의 정수를 입력하세요/.test(document.querySelector(sel).textContent),iwdg);
  await win.fill('[data-wdg="IWDG"][data-key="reload"]','99');await win.dispatchEvent('[data-wdg="IWDG"][data-key="reload"]','change');
  await win.waitForFunction(sel=>/= 80 ms 안에/.test(document.querySelector(sel).textContent),iwdg);
  await win.check('[data-peripheral="WWDG"]');await win.waitForSelector('[data-wdg="WWDG"][data-key="counter"]');
  await win.selectOption('[data-wdg="WWDG"][data-key="prescaler"]','8');await win.waitForFunction(()=>document.querySelector('[data-wdg="WWDG"][data-key="prescaler"]')?.value==='8');
  await win.fill('[data-wdg="WWDG"][data-key="counter"]','127');await win.dispatchEvent('[data-wdg="WWDG"][data-key="counter"]','change');
  await win.waitForFunction(()=>document.querySelector('[data-wdg="WWDG"][data-key="counter"]')?.value==='127');
  await win.selectOption('[data-wdg="WWDG"][data-key="ewi"]','1');
  await win.waitForFunction(sel=>/WWDG_IRQn → HAL_WWDG_EarlyWakeupCallback/.test(document.querySelector(sel).textContent),wwdg);
  assert.match(await win.textContent(wwdg),/PCLK1 [\d.]+ MHz \/ 4096 \/ 8 = 1카운트/);
  await win.evaluate(()=>document.getElementById('hal-generate').click());
  if(await win.evaluate(()=>document.getElementById('hal-replace-dialog').open))await win.click('#hal-replace-confirm');
  await win.waitForFunction(()=>/hiwdg\.Init\.Prescaler = IWDG_PRESCALER_32;\n\s*hiwdg\.Init\.Reload = 99;[\s\S]*hwwdg\.Init\.Counter = 127;\n\s*hwwdg\.Init\.EWIMode = WWDG_EWI_ENABLE;[\s\S]*void WWDG_IRQHandler\(void\)[\s\S]*HAL_WWDG_Refresh\(hwwdg\);/.test(document.getElementById('code').value),null,{timeout:10000})
   .catch(async e=>{throw new Error(e.message+'\n'+(await code()).split('\n').filter(l=>/wdg|WDG/.test(l)).join('\n'));});
  assert.match(await code(),/HAL_NVIC_EnableIRQ\(WWDG_IRQn\);/);
  // The project's own USER CODE sections stay: its loop does not refresh the IWDG, so the run restarts every 80 ms.
  await win.evaluate(()=>{const c=document.getElementById('code');c.value=c.value.replace(/\/\* USER CODE BEGIN 2 \*\/\n/,m=>m+'  printf("IWDGRST=%d\\n", (int)__HAL_RCC_GET_FLAG(RCC_FLAG_IWDGRST));\n').replace(/HAL_IWDG_Refresh\(&hiwdg\);/g,'');c.dispatchEvent(new Event('input',{bubbles:true}));});
  await win.keyboard.press('Control+F5');
  await win.waitForFunction(()=>/IWDGRST=0[\s\S]*\[IWDG\][\s\S]*워치독 리셋[\s\S]*IWDGRST=1/.test(document.getElementById('console-output').textContent),null,{timeout:25000})
   .catch(async e=>{throw new Error(e.message+'\n'+await win.textContent('#console-output'));});
  await win.click('#run');
  assert.deepEqual(s.errors,[]);
 }finally{await s.close();}
});
