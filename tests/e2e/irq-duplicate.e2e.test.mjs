// A handler main.c writes for an enabled NVIC line (EXTI15_10_IRQHandler with the B1 interrupt on): the 문제 tab says
// CubeIDE would also generate it in stm32xxxx_it.c (a "multiple definition" link error), and the notice opens the line.
import test from 'node:test';
import assert from 'node:assert/strict';
import {launch} from './harness.mjs';

test('문제 tab: a main.c IRQ handler CubeIDE also generates in it.c, with the HAL callback; clicking goes to its line',{timeout:120000},async()=>{
 const s=await launch();
 try{
  const {win}=s;
  // The project as saved, with PC13 as an EXTI input, its NVIC line on and the handler in main.c (kept over the app's own save on reload).
  await win.evaluate(()=>{
   window.dispatchEvent(new Event('beforeunload'));const p=JSON.parse(localStorage.getItem('stm32lab.project.v2'));
   p.mcu.pins.PC13={function:'GPIO_EXTI',pull:'NOPULL',edge:'FALLING',label:'B1',initial:0};p.mcu.nvic={...(p.mcu.nvic||{}),EXTI15_10_IRQn:{enabled:true,priority:0,subPriority:0}};
   p.code=p.code.replace('/* USER CODE BEGIN 4 */','/* USER CODE BEGIN 4 */\nvoid EXTI15_10_IRQHandler(void)\n{\n  HAL_GPIO_EXTI_IRQHandler(GPIO_PIN_13);\n}');
   const text=JSON.stringify(p);localStorage.setItem('stm32lab.project.v2',text);window.addEventListener('beforeunload',()=>localStorage.setItem('stm32lab.project.v2',text));
  });
  await win.reload();
  await win.waitForFunction(()=>/EXTI15_10_IRQHandler\(\): 시뮬레이터에서는 동작하지만/.test(document.getElementById('circuit-issues')?.textContent||''),null,{timeout:30000});
  const text=await win.textContent('#circuit-issues');
  assert.match(text,/Core\/Src\/stm32f[14]xx_it\.c에 만들어 "multiple definition"/);assert.match(text,/HAL_GPIO_EXTI_Callback\(\)/);
  const line=Number(/main\.c (\d+)행 EXTI15_10_IRQHandler/.exec(text)[1]);
  assert.equal(await win.evaluate(()=>/^문제 \(\d+\)$/.test(document.querySelector('[data-monitor="issues"]').textContent)),true);
  await win.evaluate(()=>[...document.querySelectorAll('#circuit-issues [data-issue]')].find(b=>/EXTI15_10_IRQHandler/.test(b.textContent)).click());
  await win.waitForFunction(l=>document.getElementById('cursor-position').textContent.startsWith(`줄 ${l},`),line,{timeout:10000});
  assert.deepEqual(s.errors,[]);
 }finally{await s.close();}
});
