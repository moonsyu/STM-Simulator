// Pinout TIM6 card (NUCLEO-F446RE): the basic timer has no mode or Counter Mode choice, only PSC / ARR and TRGO Trigger
// Event Selection; its NVIC line is TIM6_DAC_IRQn. "설정으로 HAL 코드 생성" writes MX_TIM6_Init with the TRGO master
// configuration, HAL_TIM_Base_Start_IT and TIM6_DAC_IRQHandler, and the run calls HAL_TIM_PeriodElapsedCallback.
import test from 'node:test';
import assert from 'node:assert/strict';
import {launch} from './harness.mjs';

// New circuits start on NUCLEO-F103RB, which has no TIM6/TIM7.
async function useF446(win){
 await win.evaluate(()=>document.getElementById('board-open').click());await win.click('#board-results [data-board-id="nucleo-f446re"]');
 if(await win.locator('#board-change-dialog').isVisible())await win.click('#board-change-confirm');
 await win.waitForFunction(()=>/F446RE/.test(document.getElementById('current-board-name').textContent));
}

test('Pinout TIM6: TRGO, TIM6_DAC_IRQn, generated main.c runs the update interrupt',{timeout:120000},async()=>{
 const s=await launch();
 try{
  const {win}=s,code=()=>win.evaluate(()=>document.getElementById('code').value);
  await useF446(win);
  await win.evaluate(()=>document.getElementById('pinout-open').click());await win.waitForSelector('#pinout-dialog[open]');
  const card='#pinout-peripherals section.peripheral-card:has([data-peripheral="TIM6"])';
  await win.check('[data-peripheral="TIM6"]');await win.waitForSelector('[data-timer-trgo="TIM6"]');
  assert.equal(await win.locator(`${card} [data-timer-mode], ${card} [data-timer-counter]`).count(),0,'no mode / Counter Mode choice');
  assert.match(await win.textContent(card),/기본 타이머\(채널·핀 없음, Up 카운터, 인터럽트 TIM6_DAC_IRQn\)/);
  assert.equal(await win.inputValue('[data-timer-trgo="TIM6"]'),'RESET','CubeMX default: Reset');
  await win.selectOption('[data-timer-trgo="TIM6"]','UPDATE');
  // 16 MHz / 16000 = 1 kHz, ARR 99 → 100 ms.
  await win.fill('[data-peripheral-value="TIM6"][data-key="prescaler"]','15999');await win.dispatchEvent('[data-peripheral-value="TIM6"][data-key="prescaler"]','change');
  await win.fill('[data-peripheral-value="TIM6"][data-key="period"]','99');await win.dispatchEvent('[data-peripheral-value="TIM6"][data-key="period"]','change');
  assert.match(await win.textContent(`${card} .card-nvic`),/TIM6 global interrupt, DAC1 and DAC2 underrun error interrupts/);
  await win.check(`${card} [data-card-irq="TIM6_DAC_IRQn"]`);
  assert.equal(await win.inputValue('[data-timer-trgo="TIM6"]'),'UPDATE');
  await win.evaluate(()=>document.getElementById('hal-generate').click());
  if(await win.evaluate(()=>document.getElementById('hal-replace-dialog').open))await win.click('#hal-replace-confirm');
  await win.waitForFunction(()=>/htim6\.Init\.Prescaler = 15999;[\s\S]*htim6\.Init\.Period = 99;[\s\S]*sMasterConfig\.MasterOutputTrigger = TIM_TRGO_UPDATE;[\s\S]*void TIM6_DAC_IRQHandler\(void\)/.test(document.getElementById('code').value),null,{timeout:10000})
   .catch(async e=>{throw new Error(e.message+'\n'+(await code()).split('\n').filter(l=>/htim6|sMaster|TIM6/.test(l)).join('\n'));});
  // The project's own USER CODE 2 section stays on regeneration: start TIM6 there and count its updates in the callback.
  await win.evaluate(()=>{const c=document.getElementById('code');c.value=c.value.replace('int main(void) {','volatile uint32_t updates;\nint main(void) {').replace(/\/\* USER CODE BEGIN 2 \*\/\n/,m=>m+'    HAL_TIM_Base_Start_IT(&htim6);\n').replace('/* 타이머 주기 인터럽트 */','  if (htim->Instance == TIM6 && ++updates % 5 == 0) printf("TIM6 updates=%lu\\n", updates);');c.dispatchEvent(new Event('input',{bubbles:true}));});
  await win.keyboard.press('Control+F5');
  await win.waitForFunction(()=>/TIM6 updates=10\b/.test(document.getElementById('console-output').textContent),null,{timeout:20000})
   .catch(async e=>{throw new Error(e.message+'\n'+await win.textContent('#console-output'));});
  await win.keyboard.press('Shift+F5');
  assert.deepEqual(s.errors,[]);
 }finally{await s.close();}
});
