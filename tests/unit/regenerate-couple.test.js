// Feature 52: a main.c generated as one file, then "주변장치별 .c/.h로 생성" switched on. The MX_*_Init functions, the
// handles and the prototypes the generator had written leave main.c for gpio.c / usart.c; only what the user wrote
// stays. Before, switching the setting on with 확인 (applied without generating) and generating later moved all of
// them into USER CODE sections, because the "previous default" was already made in the per-peripheral form.
// The regeneration code is in Rust (rust/stm-core/src/regen.rs).
import test from 'node:test';
import assert from 'node:assert/strict';
import {regenerateMain} from '../../src/c-source-edit.js';
import {generatorTexts} from '../../src/project-overrides.js';
import {generateHal,validateMcu,defaultMcu} from '../../src/mcu-config.js';
import {expandC} from '../../src/c-format.js';
import {peripheralFiles,halFiles} from '../../src/peripheral-files.js';
import {compileHal} from '../../src/hal-source.js';
import {validateProject} from '../../src/project.js';

const pin=(fn,extra={})=>({function:fn,pull:'NOPULL',edge:'FALLING',label:'',initial:0,...extra});
const settings=family=>validateMcu({...defaultMcu(family),pins:{PA5:pin('GPIO_Output',{label:'LD2'}),PC13:pin('GPIO_EXTI',{pull:'PULLUP'}),PA2:pin('USART2_TX'),PA3:pin('USART2_RX')},peripherals:{USART2:{enabled:true,baud:115200}},nvic:{EXTI15_10_IRQn:{enabled:true,priority:0}}});
const generate=mcu=>expandC(generateHal(mcu));
// What the Pinout dialog does when "설정으로 HAL 코드 생성" is pressed (pinout-ui.js plan()).
const press=(code,applied,next)=>regenerateMain(code,generate(next),generate(applied),[],generatorTexts(applied,next));
const definitions=code=>[...code.matchAll(/^(?:static )?void (MX_\w+_Init)\(void\)\s*\{/gm)].map(m=>m[1]);

for(const family of ['STM32F103RB','STM32F446RE'])test(`${family}: one file → per-peripheral files, whether the setting was applied first or not`,()=>{
 const one=settings(family),coupled=validateMcu({...one,coupleFiles:true});
 const mine='  user_started = 1;\n',helper='static int user_started;\nstatic void user_helper(void) { user_started++; }\n';
 // The user's main.c: generated as one file, a line in USER CODE 2 and a helper written outside the sections.
 const code=generate(one).replace('/* USER CODE BEGIN 2 */\n',()=>'/* USER CODE BEGIN 2 */\n'+mine).replace(/\nint main\(void\)/,()=>'\n'+helper+'\nint main(void)');
 assert.deepEqual(definitions(code).sort(),['MX_GPIO_Init','MX_USART2_UART_Init']);
 const expectClean=(result,how)=>{
  assert.deepEqual(definitions(result.code),[],`${how}: no MX_*_Init is defined in main.c`);
  assert.doesNotMatch(result.code,/^UART_HandleTypeDef huart2;/m,`${how}: the handle is in usart.c`);
  assert.doesNotMatch(result.code,/^static void MX_\w+_Init\(void\);/m,`${how}: no prototype of them`);
  assert.match(result.code,/#include "usart\.h"/);assert.match(result.code,/#include "gpio\.h"/);
  assert.match(result.code,/MX_GPIO_Init\(\);\s*\n\s*MX_USART2_UART_Init\(\);/,'main still calls them');
  assert.ok(result.code.includes(mine),'the USER CODE 2 line stays');
  // The user's own code outside the sections is carried into sections, and only that.
  assert.deepEqual(result.moved.sort(),['user_helper','user_started'],how);
  assert.match(result.code,/\/\* USER CODE BEGIN PV \*\/\s*static int user_started;/);
  assert.match(result.code,/\/\* USER CODE BEGIN 0 \*\/\s*static void user_helper\(void\) \{ user_started\+\+; \}/);
  assert.doesNotMatch(result.code,/USER CODE BEGIN (?:0|4|PV) \*\/[^]*?MX_GPIO_Init\(void\)\s*\{[^]*?USER CODE END (?:0|4|PV)/,'nothing of the generator in a user section');
 };
 // (a) The box ticked and the code generated at once: the applied settings are still the one-file ones.
 expectClean(press(code,one,coupled),'generated at once');
 // (b) The box ticked and applied with 확인 first, generated later: the applied settings are already per-peripheral.
 expectClean(press(code,coupled,coupled),'applied first, generated later');
 // The two ways give the same main.c, and generating once more changes nothing.
 const a=press(code,one,coupled).code,b=press(code,coupled,coupled).code;assert.equal(b,a);
 assert.equal(press(a,coupled,coupled).code,a);assert.deepEqual(press(a,coupled,coupled).moved,[]);
 // The functions are in the pairs.
 const files=peripheralFiles(coupled),text=name=>files.find(f=>f.name===name).text;
 assert.match(text('gpio.c'),/void MX_GPIO_Init\(void\)/);assert.match(text('usart.c'),/UART_HandleTypeDef huart2;[^]*void MX_USART2_UART_Init\(void\)/);
 // And the project builds for the interpreter with them.
 {const project=validateProject({format:'stm32-circuit-lab',version:2,name:'t',components:[],wires:[],boardId:family==='STM32F103RB'?'nucleo-f103rb':'nucleo-f446re',mcu:coupled,firmware:{mode:'hal',files:[]},code:a});
  assert.doesNotThrow(()=>compileHal(project.code,halFiles(project),coupled.family));}
});

test('per-peripheral files → one file: the functions come back into main.c once, the user code stays',()=>{
 const one=settings('STM32F103RB'),coupled=validateMcu({...one,coupleFiles:true});
 const code=generate(coupled).replace('/* USER CODE BEGIN 2 */\n',()=>'/* USER CODE BEGIN 2 */\n  mine();\n');
 for(const applied of [coupled,one]){
  const r=press(code,applied,one);
  assert.deepEqual(definitions(r.code).sort(),['MX_GPIO_Init','MX_USART2_UART_Init']);
  assert.equal(r.code.match(/^UART_HandleTypeDef huart2;/mg).length,1);
  assert.doesNotMatch(r.code,/#include "usart\.h"/);assert.ok(r.code.includes('  mine();\n'));assert.deepEqual(r.moved,[]);
 }
});

test('a function of the user with a name the generator does not use is never taken for generated code',()=>{
 const one=settings('STM32F103RB'),coupled=validateMcu({...one,coupleFiles:true});
 const code=generate(one).replace(/\nint main\(void\)/,()=>'\nvoid MX_Mine_Init(void) { }\n\nint main(void)');
 const r=press(code,coupled,coupled);
 assert.deepEqual(r.moved,['MX_Mine_Init']);assert.match(r.code,/USER CODE BEGIN 0 \*\/\s*void MX_Mine_Init\(void\) \{ \}/);
});
