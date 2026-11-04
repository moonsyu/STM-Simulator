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
