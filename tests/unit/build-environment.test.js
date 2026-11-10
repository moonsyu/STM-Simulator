// What the ARM build adds (src/build-environment.js): one text for __stm_environment.c and the same code as
// CubeIDE's Core/Src files for the read-only views.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildEnvironment,prefixOf,startupOf} from '../../src/build-environment.js';
import {defaultMcu,validateMcu} from '../../src/mcu-config.js';

const pin=fn=>({function:fn,pull:'NOPULL',edge:'RISING',initial:0,label:''});
const project=(family,code='int main(void) { while (1) { } }\n',extra=[])=>{const m=defaultMcu(family);m.pins={PA2:pin('USART2_TX'),PA3:pin('USART2_RX')};m.peripherals.USART2={enabled:true,baud:115200};m.nvic.USART2_IRQn={enabled:true,priority:0};return {code,mcu:validateMcu(m),firmware:{mode:'hal',files:extra}};};

test('the build text has the handlers, system calls and heap; the views split it into CubeIDE file names',()=>{
 for(const [family,p]of [['STM32F103RB','stm32f1xx'],['STM32F446RE','stm32f4xx']]){
  const env=buildEnvironment(project(family));
  assert.equal(prefixOf(family),p);assert.match(startupOf(family),/^startup_stm32f(103xb|446xx)\.s$/);
  for(const part of ['void SysTick_Handler(void) { HAL_IncTick(); }','void USART2_IRQHandler(void)','HAL_UART_IRQHandler(&huart2);','void *_sbrk(ptrdiff_t increment)','int _write(int file, char *ptr, int len)','int _read(int file, char *ptr, int len)'])assert.ok(env.text.includes(part),family+' '+part);
  assert.deepEqual(env.files.map(f=>f.file),[`Core/Src/${p}_it.c`,'Core/Src/syscalls.c','Core/Src/sysmem.c','Core/Inc/main.h',p==='stm32f1xx'?'STM32F103RBTX_FLASH.ld':'STM32F446RETX_FLASH.ld']);
  const [it,sys,mem]=env.files.map(f=>f.text);
  assert.match(it,/SysTick_Handler[\s\S]*USART2_IRQHandler/);assert.match(it,/Default_Handler/);assert.doesNotMatch(it,/_sbrk/);
  assert.match(sys,/_write[\s\S]*_kill/);assert.doesNotMatch(sys,/SysTick/);assert.match(mem,/_sbrk/);
 }
});

test('handlers the project defines are left out of the build and named in the it.c view',()=>{
 const own=project('STM32F103RB','int main(void) { while (1) { } }\nvoid USART2_IRQHandler(void) {\n  HAL_UART_IRQHandler(&huart2);\n}\n',[{name:'stm32f1xx_it.c',text:'void SysTick_Handler(void)\n{\n  HAL_IncTick();\n}\n'}]);
 const env=buildEnvironment(own);
 assert.doesNotMatch(env.text,/void (SysTick|USART2_IRQ)Handler\(void\) \{/);
 assert.match(env.files[0].text,/SysTick_Handler\(\) — stm32f1xx_it\.c/);assert.match(env.files[0].text,/USART2_IRQHandler\(\) — main\.c/);
 // A handler only inside #if 0 or a comment still gets the generated one.
 const off=buildEnvironment(project('STM32F103RB','#if 0\nvoid USART2_IRQHandler(void) { }\n#endif\n/* void SysTick_Handler(void) { } */\n'));
 assert.match(off.text,/void USART2_IRQHandler\(void\)/);assert.match(off.text,/void SysTick_Handler\(void\)/);
});
