// Watchdogs on the built-in interpreter with the MX_IWDG_Init / MX_WWDG_Init the Pinout generates: an IWDG that is not
// refreshed in time restarts the program and RCC_FLAG_IWDGRST tells why; the WWDG resets on a refresh above the window
// and on a late one, and its early wakeup interrupt can keep it alive.
import test from 'node:test';
import assert from 'node:assert/strict';
import {halProject,run,advance} from './helpers.js';
import {blankProject} from '../../src/project.js';
import {generateHal} from '../../src/mcu-config.js';
import {wwdgTiming,iwdgTimeoutMs} from '../../src/wdg-config.js';

const boot='  printf("boot iwdg=%d wwdg=%d sft=%d por=%d\\n", (int)__HAL_RCC_GET_FLAG(RCC_FLAG_IWDGRST), (int)__HAL_RCC_GET_FLAG(RCC_FLAG_WWDGRST), (int)__HAL_RCC_GET_FLAG(RCC_FLAG_SFTRST), (int)__HAL_RCC_GET_FLAG(RCC_FLAG_PORRST));\n  __HAL_RCC_CLEAR_RESET_FLAGS();';
const withCode=(p,{globals='',init='',loop='',extra=''})=>{p.code=generateHal(p.mcu,{minimal:true}).replace('int main(void) {',globals+'\nint main(void) {').replace('  /* USER CODE BEGIN 2 */','  /* USER CODE BEGIN 2 */\n'+init).replace('    /* USER CODE BEGIN 3 */','    /* USER CODE BEGIN 3 */\n'+loop)+'\n'+extra+'\n';return p;};

test('IWDG: three refreshes, then the timeout restarts the program with RCC_FLAG_IWDGRST (F446RE 100 ms, F103RB 80 ms)',()=>{
 for(const family of ['STM32F446RE','STM32F103RB']){
  const p=blankProject(family);if(family==='STM32F103RB')p.boardId='nucleo-f103rb';p.mcu.peripherals.IWDG={enabled:true,prescaler:32,reload:99};
  const timeout=iwdgTimeoutMs(p.mcu.peripherals.IWDG,family);assert.equal(timeout,family==='STM32F103RB'?80:100);
  withCode(p,{globals:'uint32_t n;',init:boot,loop:'    if (n++ < 3) HAL_IWDG_Refresh(&hiwdg);\n    HAL_Delay(50);'});
  assert.match(p.code,/static void MX_IWDG_Init\(void\) \{\n  hiwdg\.Instance = IWDG;\n  hiwdg\.Init\.Prescaler = IWDG_PRESCALER_32;\n  hiwdg\.Init\.Reload = 99;/);assert.ok(!p.code.includes('__HAL_RCC_IWDG_CLK_ENABLE'));
  const {s,output,warnings}=run(p);advance(s,100+timeout-1,1);
  assert.deepEqual(output,['boot iwdg=0 wwdg=0 sft=0 por=1'],family);assert.deepEqual(warnings,[]);
  advance(s,100+timeout+1,1);
  assert.deepEqual(output,['boot iwdg=0 wwdg=0 sft=0 por=1','boot iwdg=1 wwdg=0 sft=0 por=0'],family);
  assert.match(warnings[0],/^\[IWDG\] .* ms 안에 HAL_IWDG_Refresh가 없었습니다 — 워치독 리셋/);
  advance(s,2*(100+timeout)+1,1);assert.equal(output.length,3,family);
 }
});

test('WWDG: a refresh inside the window keeps running, one above the window or a late one resets with RCC_FLAG_WWDGRST',()=>{
 const wwdg={enabled:true,prescaler:1,window:80,counter:127},make=loop=>halProject({peripherals:{WWDG:wwdg},init:boot,loop});
 const p=make('    HAL_Delay(14);\n    HAL_WWDG_Refresh(&hwwdg);'),t=wwdgTiming(wwdg,p.mcu);
 assert.ok(t.openMs<14&&14<t.resetMs,`window ${t.openMs}~${t.resetMs} ms`);
 assert.match(p.code,/static void MX_WWDG_Init\(void\) \{\n  __HAL_RCC_WWDG_CLK_ENABLE\(\);\n  hwwdg\.Instance = WWDG;\n  hwwdg\.Init\.Prescaler = WWDG_PRESCALER_1;\n  hwwdg\.Init\.Window = 80;\n  hwwdg\.Init\.Counter = 127;\n  hwwdg\.Init\.EWIMode = WWDG_EWI_DISABLE;/);
 let r=run(p);advance(r.s,1000,1);assert.deepEqual(r.output,['boot iwdg=0 wwdg=0 sft=0 por=1']);assert.deepEqual(r.warnings,[]);
 r=run(make('    HAL_Delay(5);\n    HAL_WWDG_Refresh(&hwwdg);'));advance(r.s,8,1);
 assert.deepEqual(r.output,['boot iwdg=0 wwdg=0 sft=0 por=1','boot iwdg=0 wwdg=1 sft=0 por=0']);assert.match(r.warnings[0],/^\[WWDG\] 카운터 0x[0-9A-F]+가 Window 0x50보다 클 때 HAL_WWDG_Refresh를 불렀습니다/);
 r=run(make('    HAL_Delay(200);'));advance(r.s,Math.ceil(t.resetMs)+1,1);
 assert.deepEqual(r.output,['boot iwdg=0 wwdg=0 sft=0 por=1','boot iwdg=0 wwdg=1 sft=0 por=0']);assert.match(r.warnings[0],/^\[WWDG\] 카운터가 0x40 아래로 내려갔습니다/);
});

test('WWDG early wakeup interrupt: HAL_WWDG_EarlyWakeupCallback refreshes at 0x40, so the program is never reset; NVIC_SystemReset sets SFTRST',()=>{
 const wwdg={enabled:true,prescaler:8,window:127,counter:127,ewi:true};
 const p=halProject({peripherals:{WWDG:wwdg},nvic:{WWDG_IRQn:{enabled:true,priority:0}},globals:'volatile uint32_t early;',init:boot,loop:'    HAL_Delay(100);',
  extra:'void HAL_WWDG_EarlyWakeupCallback(WWDG_HandleTypeDef *h) { early++; HAL_WWDG_Refresh(h); }\nvoid WWDG_IRQHandler(void) { HAL_WWDG_IRQHandler(&hwwdg); }'});
 assert.match(p.code,/hwwdg\.Init\.EWIMode = WWDG_EWI_ENABLE;/);
 const full=generateHal(p.mcu);assert.match(full,/void WWDG_IRQHandler\(void\) \{[\s\S]*HAL_WWDG_IRQHandler\(&hwwdg\);[\s\S]*void HAL_WWDG_EarlyWakeupCallback\(WWDG_HandleTypeDef \*hwwdg\) \{[\s\S]*HAL_WWDG_Refresh\(hwwdg\);/);
 const {s,output,warnings}=run(p),t=wwdgTiming(wwdg,p.mcu);advance(s,1000,1);
 assert.deepEqual(output,['boot iwdg=0 wwdg=0 sft=0 por=1']);assert.deepEqual(warnings,[]);
 const early=s.runtime.globals.cells.early.value,expected=Math.floor(1000/(t.resetMs-t.tickMs));assert.ok(Math.abs(early-expected)<=1,`${early} early wakeups, expected ${expected}`);
 const q=halProject({init:'  int again = __HAL_RCC_GET_FLAG(RCC_FLAG_SFTRST);\n'+boot+'\n  HAL_Delay(5);\n  if (!again) NVIC_SystemReset();'}),r=run(q);advance(r.s,30,1);
 assert.deepEqual(r.output,['boot iwdg=0 wwdg=0 sft=0 por=1','boot iwdg=0 wwdg=0 sft=1 por=0']);
});

test('misuse is reported: refresh before init, a watchdog that is off in the Pinout, the IWDG clock macro',()=>{
 const fails=(p,pattern)=>assert.throws(()=>{const {s}=run(p);advance(s,20,1);},pattern);
 fails(halProject({peripherals:{IWDG:{enabled:true}},code:'#include "main.h"\nIWDG_HandleTypeDef hiwdg;\nint main(void) { hiwdg.Instance = IWDG; HAL_IWDG_Refresh(&hiwdg); while (1) {} }\n'}),/IWDG: HAL_IWDG_Init이 필요합니다/);
 fails(halProject({code:'#include "main.h"\nIWDG_HandleTypeDef hiwdg;\nint main(void) { hiwdg.Instance = IWDG; hiwdg.Init.Prescaler = IWDG_PRESCALER_4; hiwdg.Init.Reload = 4095; HAL_IWDG_Init(&hiwdg); while (1) {} }\n'}),/System Core에서 IWDG를 활성화하세요/);
 fails(halProject({peripherals:{IWDG:{enabled:true}},code:'#include "main.h"\nint main(void) { __HAL_RCC_IWDG_CLK_ENABLE(); while (1) {} }\n'}),/IWDG는 LSI로 돌아/);
});

test('a watchdog whose timeout is shorter than the start-up code stops the run with an explanation instead of restarting forever',()=>{
 const storm=p=>assert.throws(()=>{const {s}=run(p);advance(s,60,1);},/워치독 리셋이 계속 반복됩니다[\s\S]*타임아웃이 초기화 코드보다 짧습니다/);
 storm(halProject({peripherals:{IWDG:{enabled:true,prescaler:4,reload:0}},loop:'    HAL_Delay(10);'}));
 storm(halProject({peripherals:{WWDG:{enabled:true,prescaler:1,window:64,counter:64}},loop:'    HAL_Delay(10);'}));
});
