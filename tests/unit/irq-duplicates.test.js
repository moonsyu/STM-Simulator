// A handler main.c defines for an enabled NVIC line runs in the simulator but is a "multiple definition" link error
// in CubeIDE, which writes the same handler into stm32xxxx_it.c: the 문제 tab says so and names the HAL callback.
import test from 'node:test';
import assert from 'node:assert/strict';
import {cubeIdeHandlerDuplicates,duplicateMessage,halCallbackFor} from '../../src/irq-duplicates.js';
import {circuitDiagnostics} from '../../src/circuit-diagnostics.js';
import {projectForBoard,validateProject} from '../../src/project.js';
import {generateHal} from '../../src/mcu-config.js';

const f103=()=>{const p=projectForBoard('nucleo-f103rb');p.mcu.nvic={...(p.mcu.nvic||{}),ADC1_2_IRQn:{enabled:true,priority:0,subPriority:0}};return validateProject(p);};
const withCode=(p,code)=>{p.code=p.code.replace('/* USER CODE BEGIN 4 */',`/* USER CODE BEGIN 4 */\n${code}`);return p;};

test('a handler main.c writes for an enabled NVIC line is reported with its line and HAL callback',()=>{
 const p=withCode(f103(),'void ADC1_2_IRQHandler(void)\n{\n  HAL_ADC_IRQHandler(&hadc1);\n}');
 const [d,...rest]=cubeIdeHandlerDuplicates(p);
 assert.equal(rest.length,0);
 assert.equal(d.name,'ADC1_2_IRQHandler');assert.equal(d.file,'main.c');assert.equal(d.itFile,'stm32f1xx_it.c');
 assert.equal(p.code.split('\n')[d.line-1].trim(),'void ADC1_2_IRQHandler(void)','line of the definition');
 assert.match(duplicateMessage(d),/CubeIDE는 같은 핸들러를 Core\/Src\/stm32f1xx_it\.c에 만들어 "multiple definition"/);
 assert.match(duplicateMessage(d),/HAL_ADC_ConvCpltCallback\(\)/);
 const issue=circuitDiagnostics(p).find(i=>i.id==='irq-duplicate:ADC1_2_IRQHandler');
 assert.deepEqual(issue.target,{type:'code',file:'main.c',line:d.line});assert.equal(issue.severity,'warning');
});

test('not reported: NVIC line off, comments and #if 0, the generated CubeMX form, imported it.c, RA projects',()=>{
 const off=projectForBoard('nucleo-f103rb');withCode(off,'void ADC1_2_IRQHandler(void) { }');
 assert.deepEqual(cubeIdeHandlerDuplicates(validateProject(off)),[],'CubeIDE does not generate a handler for a line that is off');
 assert.deepEqual(cubeIdeHandlerDuplicates(withCode(f103(),'/* void ADC1_2_IRQHandler(void) { } */\n#if 0\nvoid ADC1_2_IRQHandler(void) { }\n#endif')),[]);
 const button=projectForBoard('nucleo-f446re');button.mcu.pins.PC13={function:'GPIO_EXTI',pull:'NOPULL',edge:'FALLING',label:'B1',initial:0};button.mcu.nvic={EXTI15_10_IRQn:{enabled:true,priority:0,subPriority:0}};
 const clean=validateProject(button);clean.code=generateHal(clean.mcu);
 assert.match(clean.code,/void EXTI15_10_IRQHandler\(void\)/,'generated main.c carries the handler');
 assert.deepEqual(cubeIdeHandlerDuplicates(clean),[],'its CubeMX USER CODE sections mark it as generated');
 const it=f103();it.firmware={...(it.firmware||{}),files:[{name:'stm32f1xx_it.c',text:'void ADC1_2_IRQHandler(void) { HAL_ADC_IRQHandler(&hadc1); }'}]};
 assert.deepEqual(cubeIdeHandlerDuplicates(it),[],'an imported it.c is CubeIDE\'s own file');
 assert.deepEqual(cubeIdeHandlerDuplicates(projectForBoard('fpb-ra6e1')),[]);
});

test('SysTick_Handler is always generated in it.c; callbacks per peripheral',()=>{
 const [d]=cubeIdeHandlerDuplicates(withCode(f103(),'void SysTick_Handler(void) { HAL_IncTick(); }'));
 assert.equal(d.name,'SysTick_Handler');assert.match(d.callback,/SysTick_IRQn 1/);
 assert.match(halCallbackFor('TIM2_IRQHandler'),/HAL_TIM_PeriodElapsedCallback/);
 assert.match(halCallbackFor('USART2_IRQHandler'),/HAL_UART_RxCpltCallback/);
 assert.match(halCallbackFor('EXTI15_10_IRQHandler'),/HAL_GPIO_EXTI_Callback/);
 assert.match(halCallbackFor('DMA1_Channel1_IRQHandler'),/완료 콜백/);
});

// Found by probing the notice with odd sources.
test('a handler after a string that holds // or /* is still reported; conditions on macros of the file are followed',()=>{
 const names=code=>cubeIdeHandlerDuplicates(withCode(f103(),code)).map(d=>d.name);
 assert.deepEqual(names('const char *u = "http://x"; void ADC1_2_IRQHandler(void) { }\n'),['ADC1_2_IRQHandler']);
 assert.deepEqual(names('const char *u = "/* not a comment";\nvoid ADC1_2_IRQHandler(void) { }\n/* real */\n'),['ADC1_2_IRQHandler']);
 assert.deepEqual(names("char q = '\"'; void ADC1_2_IRQHandler(void) { } // \"\n"),['ADC1_2_IRQHandler']);
 // The text of a string is not code.
 assert.deepEqual(names('const char *t = "void ADC1_2_IRQHandler(void) {";\n'),[]);
 assert.deepEqual(names('#define SIM 0\n#if SIM == 1\nvoid ADC1_2_IRQHandler(void) { }\n#endif\n'),[]);
 assert.deepEqual(names('#define SIM 1\n#if SIM == 1\nvoid ADC1_2_IRQHandler(void) { }\n#endif\n'),['ADC1_2_IRQHandler']);
 assert.deepEqual(names('#define MODE 2\n#if MODE == 1\nint a;\n#elif MODE == 2\nvoid ADC1_2_IRQHandler(void) { }\n#else\nint b;\n#endif\n'),['ADC1_2_IRQHandler']);
 assert.deepEqual(names('#define MODE 1\n#if MODE == 1\nint a;\n#elif MODE == 2\nvoid ADC1_2_IRQHandler(void) { }\n#endif\n'),[]);
 assert.deepEqual(names('#define OWN\n#ifndef OWN\nvoid ADC1_2_IRQHandler(void) { }\n#endif\n'),[]);
 // A macro from another header cannot be decided here: the block counts.
 assert.deepEqual(names('#ifdef USE_SOMETHING\nvoid ADC1_2_IRQHandler(void) { }\n#endif\n'),['ADC1_2_IRQHandler']);
});

test('RTC and watchdog handlers name their HAL callback',()=>{
 assert.match(halCallbackFor('RTC_Alarm_IRQHandler'),/HAL_RTC_AlarmAEventCallback/);
 assert.match(halCallbackFor('RTC_WKUP_IRQHandler'),/HAL_RTCEx_WakeUpTimerEventCallback/);
 assert.match(halCallbackFor('RTC_IRQHandler'),/HAL_RTCEx_RTCEventCallback/);
 assert.match(halCallbackFor('WWDG_IRQHandler'),/HAL_WWDG_EarlyWakeupCallback/);
});
