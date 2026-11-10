// Regenerating main.c (Pinout code button, .ioc import) never loses user code: functions, globals and #includes outside
// the USER CODE sections are moved into sections first (c-source-edit.js adoptOutsideCode / regenerateMain), and the
// examples already keep theirs inside sections.
import test from 'node:test';
import assert from 'node:assert/strict';
import {regenerateMain,adoptOutsideCode,topLevelItems,cFunctions} from '../../src/c-source-edit.js';
import {generateHal,defaultMcu} from '../../src/mcu-config.js';
import {halExampleFor,applyHalExample,allHalExamples} from '../../src/hal-examples.js';
import {blankProject,projectForBoard} from '../../src/project.js';
import {expandC} from '../../src/c-format.js';

const pin=fn=>({function:fn,pull:'NOPULL',edge:'RISING',label:'',initial:0});
const sectionOf=(code,name)=>{const at=code.indexOf(name),open=code.lastIndexOf('/* USER CODE BEGIN ',at),close=code.lastIndexOf('/* USER CODE END ',at);return open>close?/BEGIN (.+?) \*\//.exec(code.slice(open))[1]:null;};

test('user code outside the sections moves into them: #include → Includes, globals / types → PV, functions → 0 or 4',()=>{
 const mcu={...defaultMcu(),pins:{PA5:pin('GPIO_Output')}},old=expandC(generateHal(mcu));
 const edited=old.replace('#include "main.h"','#include "main.h"\n#include <string.h>').replace('int main(void) {','// OLED 한 바이트 보내기\nstatic void oledSend(uint8_t value) {\n  HAL_GPIO_WritePin(GPIOA, GPIO_PIN_5, value ? GPIO_PIN_SET : GPIO_PIN_RESET);\n}\ntypedef struct { int total; int count; } Reading;\nvolatile uint32_t ticks = 0, other;\n#define OLED_WIDTH 128\nint main(void) {')
  +'\nvoid HAL_UART_ErrorCallback(UART_HandleTypeDef *huart) {\n  (void)huart;\n  ticks++;\n}\n';
 const next={...mcu,pins:{PA5:pin('GPIO_Output'),PA6:pin('GPIO_Output')}},generated=expandC(generateHal(next));
 const {code,moved}=regenerateMain(edited,generated,old);
 assert.deepEqual(moved.sort(),['#include <string.h>','#define OLED_WIDTH 128','HAL_UART_ErrorCallback','Reading','oledSend','ticks'].sort());
 assert.equal(sectionOf(code,'#include <string.h>'),'Includes');assert.equal(sectionOf(code,'static void oledSend'),'0');assert.equal(sectionOf(code,'volatile uint32_t ticks'),'PV');
 assert.equal(sectionOf(code,'typedef struct'),'PV');assert.equal(sectionOf(code,'#define OLED_WIDTH'),'PV');assert.equal(sectionOf(code,'void HAL_UART_ErrorCallback'),'4');
 assert.ok(code.includes('// OLED 한 바이트 보내기\nstatic void oledSend'),'the comment above stays with its function');
 assert.match(code,/GPIO_InitStruct\.Pin = GPIO_PIN_6;/);
 // Doing it again changes nothing.
 const again=regenerateMain(code,generated,generated);assert.deepEqual(again.moved,[]);assert.equal(again.code,code);
 // Generated code that was edited in place (not user code) is generated again, as CubeMX does.
 const touched=regenerateMain(old.replace('HAL_Init();','HAL_Init(); /* edited */'),generated,old);assert.deepEqual(touched.moved,[]);assert.ok(!touched.code.includes('/* edited */'));
});

test('a user callback moved into a section replaces the generated one of the same name; a hand-written main.c is left alone',()=>{
 const mcu={...defaultMcu(),pins:{PA2:pin('USART2_TX'),PA3:pin('USART2_RX')},peripherals:{USART2:{enabled:true,baud:115200}}},old=expandC(generateHal(mcu));
 const mine='void HAL_UART_RxCpltCallback(UART_HandleTypeDef *huart) {\n  mine(huart);\n}\n';
 const start=old.indexOf('void HAL_UART_RxCpltCallback'),end=old.indexOf('\n}\n',start)+3,edited=old.slice(0,start)+old.slice(end)+mine;
 const {code}=regenerateMain(edited,old,'');
 assert.equal(cFunctions(code).filter(f=>f.name==='HAL_UART_RxCpltCallback').length,1);assert.ok(code.includes('mine(huart);'));
 const plain='#include "main.h"\nint helper(void) { return 1; }\nint main(void) { while (1) {} }\n';
 assert.deepEqual(adoptOutsideCode(plain,old,old),{source:plain,moved:[]});
});

test('topLevelItems: functions, declarations with initializers, directives with continuation lines; user sections are skipped',()=>{
 const items=topLevelItems('#define A(x) \\\n  ((x) + 1)\nstatic const uint8_t font[2][2] = {{1, 2}, {3, 4}};\nstruct P { int x; };\n/* USER CODE BEGIN 0 */\nint hidden(void) { return 0; }\n/* USER CODE END 0 */\nint (*table[2])(void);\nchar *name(void) { return "}"; }\n');
 assert.deepEqual(items.map(k=>[k.kind,k.name]),[['directive','#define A(x) \\ ((x) + 1)'],['declaration','font'],['declaration','P'],['declaration','table'],['function','name']]);
});

test('every HAL example keeps all of its functions when main.c is regenerated (both boards), and applied examples have none outside the sections',()=>{
 let checked=0;
 for(const board of ['nucleo-f446re','nucleo-f103rb'])for(const kind of Object.keys(allHalExamples())){
  let p,generated;try{p=halExampleFor(kind,board);generated=expandC(generateHal(p.mcu));}catch{continue;}
  const code=expandC(p.code);if(!code.includes('/* USER CODE BEGIN '))continue;checked++;
  const {code:next}=regenerateMain(code,generated,generated,(p.firmware?.files||[]).map(f=>f.text));
  const after=new Set(cFunctions(next).map(f=>f.name));
  assert.deepEqual(cFunctions(code).map(f=>f.name).filter(n=>!after.has(n)),[],`${board} ${kind}`);
 }
 assert.ok(checked>200,`${checked} examples checked`);
 for(const [base,kind]of [[blankProject(),'uart'],[projectForBoard('nucleo-f103rb'),'ultrasonic'],[blankProject(),'language']]){
  const p=applyHalExample(base,kind),generated=expandC(generateHal(p.mcu));
  assert.deepEqual(adoptOutsideCode(p.code,generated,generated).moved,[],kind);
 }
});
