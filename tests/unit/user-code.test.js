// Regenerating main.c from the pin settings keeps the code between USER CODE BEGIN and END.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {keepUserCode} from '../../src/c-source-edit.js';
import {generateHal,defaultMcu,validateMcu} from '../../src/mcu-config.js';
import {expandC} from '../../src/c-format.js';

const pin=fn=>({function:fn,pull:'NOPULL',initial:0,label:'',edge:'RISING'});
const uartMcu=()=>{const m=defaultMcu();m.pins={PA5:pin('GPIO_Output'),PA2:pin('USART2_TX'),PA3:pin('USART2_RX')};m.peripherals.USART2={enabled:true,baud:9600};m.nvic.USART2_IRQn={enabled:true,priority:0};return validateMcu(m);};
const gpioMcu=()=>{const m=defaultMcu();m.pins={PA5:pin('GPIO_Output'),PA6:pin('GPIO_Input')};return validateMcu(m);};
const generate=mcu=>expandC(generateHal(mcu));
const section=(code,tag)=>code.match(new RegExp(`/\\* USER CODE BEGIN ${tag} \\*/([\\s\\S]*?)/\\* USER CODE END ${tag} \\*/`))?.[1];

test('the generator marks the places for user code: includes, variables, functions, main and callbacks',()=>{
 const code=generate(uartMcu());
 for(const tag of ['Includes','PV','0','2','3','UART_RxCplt','4'])assert.notEqual(section(code,tag),undefined,tag);
});

test('turning a pin off and generating again keeps every edited USER CODE section',()=>{
 const before=generate(uartMcu());
 const edited=before.replace('/* USER CODE BEGIN PV */','/* USER CODE BEGIN PV */\nint counter = 0;').replace(/(\/\* USER CODE BEGIN 3 \*\/)[\s\S]*?(\/\* USER CODE END 3 \*\/)/,'$1\n    counter++;\n    HAL_Delay(100);\n    $2').replace('/* HAL_UART_Receive_IT() 수신 완료 */','counter = 0;');
 const after=keepUserCode(edited,generate(gpioMcu()),before);
 assert.match(section(after,'PV'),/int counter = 0;/);assert.match(section(after,'3'),/counter\+\+;\n\s*HAL_Delay\(100\);/);
 assert.doesNotMatch(section(after,'3'),/TogglePin/,'the generated default does not come back');
 // The UART callback is gone: its code is kept, switched off, in section 4.
 assert.match(section(after,'4'),/USER CODE UART_RxCplt[\s\S]*#if 0\s*counter = 0;\s*#endif/);
 // Section 2 still held the generated "HAL ready" message for USART2: untouched, it follows the new settings.
 assert.doesNotMatch(after,/huart2/);
 assert.match(after,/static void MX_GPIO_Init/);assert.doesNotMatch(after,/MX_USART2_UART_Init/);
});

test('code outside the sections follows the new settings, and a source without sections gets the generated text',()=>{
 const after=keepUserCode('int main(void){ while(1){} }',generate(gpioMcu()));
 assert.equal(after,generate(gpioMcu()));
 const twice=keepUserCode(keepUserCode(generate(uartMcu()),generate(gpioMcu())),generate(gpioMcu()));assert.equal((twice.match(/#if 0/g)||[]).length,(keepUserCode(generate(uartMcu()),generate(gpioMcu())).match(/#if 0/g)||[]).length,'kept code is not copied again');
});

test('turning USART2 on turns its NVIC line on, and main.c gets USART2_IRQHandler like the CubeMX stm32xxxx_it.c',async()=>{
 const {setSerialEnabled}=await import('../../src/serial-config.js');
 for(const family of ['STM32F446RE','STM32F103RB']){
  const on=setSerialEnabled(defaultMcu(family),'USART2',true);assert.deepEqual(on.nvic.USART2_IRQn,{priority:0,enabled:true},family);
  const code=generate(validateMcu(on));
  assert.match(code,/void USART2_IRQHandler\(void\)\s*\{\s*\/\* USER CODE BEGIN USART2_IRQn 0 \*\/\s*\/\* USER CODE END USART2_IRQn 0 \*\/\s*HAL_UART_IRQHandler\(&huart2\);/,family);
  assert.match(code,/HAL_NVIC_EnableIRQ\(USART2_IRQn\);/);
  // NVIC Settings can turn it off again; then there is no handler, as in CubeMX.
  on.nvic.USART2_IRQn.enabled=false;const off=setSerialEnabled(on,'USART2',true);assert.equal(off.nvic.USART2_IRQn.enabled,false,'stays off while USART2 stays on');
  assert.doesNotMatch(generate(validateMcu(off)),/USART2_IRQHandler/);
 }
 // Timers, EXTI lines and DMA streams get theirs too; the minimal skeleton has none.
 const m=defaultMcu();m.pins={PC13:pin('GPIO_EXTI')};m.nvic.EXTI15_10_IRQn={enabled:true,priority:0};
 const exti=generate(validateMcu(m));assert.match(exti,/void EXTI15_10_IRQHandler\(void\)[\s\S]*?HAL_GPIO_EXTI_IRQHandler\(GPIO_PIN_13\);/);
 assert.doesNotMatch(expandC(generateHal(validateMcu(m),{minimal:true})),/IRQHandler/);
});

test('a handler the user wrote (in USER CODE 4 or another source) replaces the generated one instead of defining it twice',async()=>{
 const {dropShadowedHandlers}=await import('../../src/c-source-edit.js');
 const own='void USART2_IRQHandler(void) {\n    HAL_UART_IRQHandler(&huart2);\n}\n';
 const before=generate(gpioMcu()).replace('/* USER CODE END 4 */',own+'/* USER CODE END 4 */');
 const after=dropShadowedHandlers(keepUserCode(before,generate(uartMcu()),generate(gpioMcu())));
 assert.equal((after.match(/void USART2_IRQHandler/g)||[]).length,1);assert.match(section(after,'4'),/void USART2_IRQHandler/);assert.doesNotMatch(after,/USER CODE BEGIN USART2_IRQn 0/);
 assert.match(after,/\}\n\nvoid HAL_UART_RxCpltCallback/,'the surrounding code keeps its layout');
 const imported=dropShadowedHandlers(generate(uartMcu()),['#include "main.h"\nextern UART_HandleTypeDef huart2;\n'+own]);
 assert.doesNotMatch(imported,/USART2_IRQHandler/);
 assert.equal(dropShadowedHandlers(generate(uartMcu())),generate(uartMcu()),'nothing to drop');
});
