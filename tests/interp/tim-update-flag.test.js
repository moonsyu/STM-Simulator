// Polling the timer update flag (no interrupt): __HAL_TIM_GET_FLAG / __HAL_TIM_CLEAR_FLAG / __HAL_TIM_CLEAR_IT with
// TIM_FLAG_UPDATE on the built-in interpreter. Found by probing HAL calls of tutorial code.
import test from 'node:test';
import assert from 'node:assert/strict';
import {blankProject} from '../../src/project.js';
import {generateHal,validateMcu} from '../../src/mcu-config.js';
import {SimulationSession} from '../../src/session.js';

function run(body,loop='',ms=400){
 const p=blankProject();
 // 16 MHz / 16000 = 1 kHz counter, period 100 → an update every 100 ms.
 p.mcu.pins={};p.mcu.peripherals={TIM2:{enabled:true,prescaler:15999,period:99}};p.mcu=validateMcu(p.mcu);
 p.code=generateHal(p.mcu,{minimal:true}).replace('/* USER CODE BEGIN 0 */','/* USER CODE BEGIN 0 */\nstatic int ticks;').replace('  /* USER CODE BEGIN 2 */','  /* USER CODE BEGIN 2 */\n  '+body).replace('    /* USER CODE BEGIN 3 */','    /* USER CODE BEGIN 3 */\n    '+loop);
 const out=[],s=new SimulationSession(p,{print:x=>out.push(x),warn:()=>{}});s.tick(0);for(let t=10;t<=ms;t+=10)s.tick(t);return out;
}
const r=String.raw;

test('the update flag rises once per period and stays until it is cleared',()=>{
 const out=run(r`HAL_TIM_Base_Start(&htim2); printf("start %d\n", __HAL_TIM_GET_FLAG(&htim2, TIM_FLAG_UPDATE) != RESET);`,
  r`if (__HAL_TIM_GET_FLAG(&htim2, TIM_FLAG_UPDATE) != RESET) { __HAL_TIM_CLEAR_FLAG(&htim2, TIM_FLAG_UPDATE); printf("update %d at %lu\n", ++ticks, HAL_GetTick() / 100); } HAL_Delay(1);`,450);
 assert.deepEqual(out,['start 0','update 1 at 1','update 2 at 2','update 3 at 3','update 4 at 4']);
 // Not cleared: it stays set, and __HAL_TIM_CLEAR_IT clears it too.
 assert.deepEqual(run(r`HAL_TIM_Base_Start(&htim2); HAL_Delay(250); int a = __HAL_TIM_GET_FLAG(&htim2, TIM_FLAG_UPDATE) != RESET; int b = __HAL_TIM_GET_FLAG(&htim2, TIM_FLAG_UPDATE) != RESET; __HAL_TIM_CLEAR_IT(&htim2, TIM_IT_UPDATE); printf("%d %d %d %lu\n", a, b, __HAL_TIM_GET_FLAG(&htim2, TIM_FLAG_UPDATE) != RESET, __HAL_TIM_GET_COUNTER(&htim2));`),['1 1 0 50']);
});

test('a timer that is not running raises no flag; other flags are refused with the reason',()=>{
 assert.deepEqual(run(r`HAL_Delay(250); printf("%d\n", __HAL_TIM_GET_FLAG(&htim2, TIM_FLAG_UPDATE) != RESET);`),['0']);
 assert.throws(()=>run(r`HAL_TIM_Base_Start(&htim2); __HAL_TIM_GET_FLAG(&htim2, TIM_FLAG_CC1);`),/Update 플래그\(TIM_FLAG_UPDATE \/ TIM_IT_UPDATE\)만 지원/);
});
