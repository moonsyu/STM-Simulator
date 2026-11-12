// Generated main.c with a CubeMX priority group, sub priorities, time base priority and an open-drain output runs in the interpreter.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {blankProject} from '../../src/project.js';
import {generateHal} from '../../src/mcu-config.js';
import {pin,run,advance} from './helpers.js';

test('NVIC group 2 / sub priority / SysTick 3 and an Open Drain PA5 run from the generated main.c',()=>{
 const p=blankProject();Object.assign(p.mcu,{nvicGroup:2,tickPriority:3});
 p.mcu.peripherals={};p.mcu.pins={PA5:pin('GPIO_Output',{outputType:'OD',initial:1}),PC13:pin('GPIO_EXTI',{pull:'PULLUP'})};p.mcu.nvic={EXTI15_10_IRQn:{enabled:true,priority:1,sub:2}};
 p.code=generateHal(p.mcu).replace('    HAL_GPIO_TogglePin(GPIOA, GPIO_PIN_5);\n','').replace('  /* USER CODE BEGIN 2 */','  /* USER CODE BEGIN 2 */\n  uint32_t pre, sub;\n  HAL_NVIC_GetPriority(EXTI15_10_IRQn, HAL_NVIC_GetPriorityGrouping(), &pre, &sub);\n  printf("group=%lu pre=%lu sub=%lu\\n", HAL_NVIC_GetPriorityGrouping(), pre, sub);');
 const {s,output}=run(p);advance(s,50);
 assert.match(output.join('\n'),/group=5 pre=1 sub=2/,'NVIC_PRIORITYGROUP_2 is register value 5');
 assert.equal(s.runtime.gpio.PA5.openDrain,true,'PA5 is an open-drain output');
 // Pinout says Open Drain: a push-pull HAL_GPIO_Init is a mismatch, as before for other modes.
 const wrong=blankProject();wrong.mcu.peripherals={};wrong.mcu.pins={PA5:pin('GPIO_Output',{outputType:'OD'})};wrong.code=generateHal(wrong.mcu).replace('GPIO_MODE_OUTPUT_OD','GPIO_MODE_OUTPUT_PP');
 assert.throws(()=>{const r=run(wrong);advance(r.s,10);},/PA5: HAL_GPIO_Init 모드\/풀 설정과 Pinout이 다릅니다/);
});
