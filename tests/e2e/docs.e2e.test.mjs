import test from 'node:test';
import assert from 'node:assert/strict';
import {launch} from './harness.mjs';

const code=win=>win.evaluate(()=>document.getElementById('code').value);
// Edits main.c the way typing does: the textarea value changes and an input event follows.
const editCode=(win,fn)=>win.evaluate(src=>{const el=document.getElementById('code');el.value=new Function('c','return ('+src+')(c)')(el.value);el.dispatchEvent(new Event('input',{bubbles:true}));},fn.toString());
async function openDocs(win){
 await win.click('[data-activity="docs"]');if(!await win.locator('#device-docs-panel').isVisible())await win.click('[data-activity="docs"]');
 await win.waitForSelector('#docs-apply-all');
}

// New circuits start on NUCLEO-F103RB; tests of F446RE-only examples (DCMI camera, register Docs) switch first.
async function useF446(win){
 await win.evaluate(()=>document.getElementById('board-open').click());await win.click('#board-results [data-board-id="nucleo-f446re"]');
 if(await win.locator('#board-change-dialog').isVisible())await win.click('#board-change-confirm');
 await win.waitForFunction(()=>/F446RE/.test(document.getElementById('current-board-name').textContent));
}
test('Docs: apply HAL, edit inside the region, remove, undo, then apply the BareMetal example',{timeout:180000},async()=>{
 const s=await launch();
 try{
  const {win}=s;
  await useF446(win);
  // Choosing the board starts its default circuit with the board already placed.
  if(await win.locator('#empty-add-board').isVisible())await win.click('#empty-add-board');
  await win.click('[data-activity="parts"]');if(!await win.locator('#view-parts').isVisible())await win.click('[data-activity="parts"]');
  await win.fill('#part-search','빵판');await win.locator('#part-list [data-add="breadboard"]').click();
  await win.waitForFunction(()=>document.querySelectorAll('[data-hole]').length>100);
  // Clicking a part card places the part in the workspace at once.
  await win.fill('#part-search','LED');await win.locator('#part-list [data-add="ref_led_tht_2"]').click();
  await win.waitForFunction(()=>document.querySelectorAll('#part-layer [data-part]').length>=1);
  await openDocs(win);
  await win.waitForFunction(()=>/LED/.test(document.querySelector('#device-docs-panel .docs-header h2')?.textContent||''));
  const original=await code(win);

  // 1. HAL apply: GPIO setup in MX_GPIO_Init, blink in USER CODE 3, all inside STM-DOCS markers.
  await win.click('#docs-apply-all');
  await win.waitForFunction(()=>/적용 완료/.test(document.getElementById('docs-result').textContent));
  let text=await code(win);
  assert.match(text,/STM-DOCS BEGIN ref_led_tht_2:\w+ LOOP[\s\S]*HAL_GPIO_TogglePin\(GPIOA, GPIO_PIN_5\)[\s\S]*STM-DOCS END ref_led_tht_2:\w+ LOOP/);
  assert.match(text.split('static void MX_GPIO_Init(void) {')[1],/STM-DOCS BEGIN ref_led_tht_2:\w+ MX_GPIO_Init[\s\S]*HAL_GPIO_Init\(GPIOA/);
  assert.ok(await win.locator('#docs-remove-code').isVisible()&&await win.locator('#docs-remove-all').isVisible(),'remove choices shown');

  // 2. The learner edits inside the inserted region; removal still finds it by markers.
  await editCode(win,c=>c.replace(/(STM-DOCS BEGIN ref_led_tht_2:\w+ LOOP[^\n]*\n)/,'$1    int mine = 1; /* 내가 고친 줄 */\n').replace(/HAL_Delay\(500\);(\s*\/\* STM-DOCS END ref_led_tht_2)/,'HAL_Delay(250);$1'));
  assert.match(await code(win),/내가 고친 줄/);
  await win.click('#docs-remove-all');
  await win.waitForFunction(()=>/제거 완료/.test(document.getElementById('docs-result').textContent));
  text=await code(win);
  assert.doesNotMatch(text,/STM-DOCS|TogglePin|내가 고친 줄|HAL_Delay\(250\)/);
  assert.equal(text,original.replace(/(\/\* USER CODE BEGIN 3 \*\/)\s*HAL_Delay\(500\);([ \t]*\n[ \t]*)(\/\* USER CODE END 3 \*\/)/,'$1$2$3'));
  assert.ok(await win.locator('#docs-apply-all').isVisible()&&!await win.locator('#docs-remove-code').count(),'binding cleared');

  // 3. Ctrl+Z restores the removed (edited) example in one step.
  await win.click('#undo');
  await win.waitForFunction(()=>/내가 고친 줄/.test(document.getElementById('code').value));
  assert.match(await code(win),/STM-DOCS BEGIN ref_led_tht_2:\w+ LOOP/);

  // 4. BareMetal tab: "apply" inserts direct register code instead of HAL calls.
  const led=/STM-DOCS BEGIN ref_led_tht_2:(\w+) LOOP/.exec(await code(win))[1];
  await win.locator(`#part-layer [data-part="${led}"]`).first().click({force:true});
  await openDocs(win);
  await win.click('[data-docs-mode="baremetal"]');
  await win.waitForFunction(()=>/레지스터 예제/.test(document.getElementById('docs-apply-all').textContent));
  await win.click('#docs-apply-all');
  await win.waitForFunction(()=>/레지스터 예제/.test(document.getElementById('docs-result').textContent));
  text=await code(win);
  assert.match(text,/STM-DOCS BEGIN ref_led_tht_2:\w+ LOOP[\s\S]*GPIOA->BSRR[\s\S]*STM-DOCS END ref_led_tht_2:\w+ LOOP/);
  assert.match(text,/RCC->AHB1ENR\s*\|=\s*RCC_AHB1ENR_GPIOAEN/);
  assert.doesNotMatch(text,/HAL_GPIO_TogglePin|내가 고친 줄/);
  assert.equal((text.match(/STM-DOCS BEGIN ref_led_tht_2:\w+ LOOP/g)||[]).length,1,'re-apply replaced the region');
  assert.match(await win.textContent('#device-docs-panel .docs-applied'),/Bare-metal/);
  assert.deepEqual(s.errors,[]);
 }finally{await s.close();}
});
