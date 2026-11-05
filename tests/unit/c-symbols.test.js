// Symbols for go to definition and the Outline (src/c-symbols.js) and the STM32Cube SDK index (desktop/sdk-index.cjs).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {cSymbols,outlineLabel,pickDefinitions} from '../../src/c-symbols.js';
const require=createRequire(import.meta.url),{SdkIndex}=require('../../desktop/sdk-index.cjs');

const MAIN=`#include "main.h"
#include <stdio.h>
/* USER CODE BEGIN PV */
UART_HandleTypeDef huart2;
static uint8_t rx_buf[16] = {0, 1};
extern volatile uint32_t ticks;
/* USER CODE END PV */
static void MX_GPIO_Init(void);
typedef enum { RED = 1, GREEN, BLUE } color_t;
typedef struct { int x; } point_t;
typedef void (*handler_t)(int);
#define LED_Pin GPIO_PIN_5
#define MAX(a,b) ((a)>(b)?(a):(b))
// int fake(void) { }
int main(void)
{
  HAL_Init();
  while (1) { if (rx_buf[0]) { } }
}
static void MX_GPIO_Init(void) {
  GPIO_InitTypeDef GPIO_InitStruct = {0};
}
void USART2_IRQHandler(void) {
  HAL_UART_IRQHandler(&huart2);
}
`;

test('cSymbols finds what CubeIDE\'s Outline lists, with lines; comments and strings are not symbols',()=>{
 const s=cSymbols(MAIN),find=(name,kind)=>s.find(x=>x.name===name&&x.kind===kind);
 assert.equal(find('main.h','include').line,1);assert.equal(find('stdio.h','include').line,2);
 assert.equal(outlineLabel(find('huart2','variable')),'huart2 : UART_HandleTypeDef');assert.equal(find('huart2','variable').line,4);
 assert.equal(outlineLabel(find('rx_buf','variable')),'rx_buf[16] : uint8_t');
 assert.equal(find('ticks','declaration').line,6,'extern is a declaration');
 assert.equal(outlineLabel(find('MX_GPIO_Init','declaration')),'MX_GPIO_Init(void) : void');
 assert.equal(find('MX_GPIO_Init','function').line,20);assert.equal(outlineLabel(find('main','function')),'main(void) : int');
 assert.equal(find('USART2_IRQHandler','function').line,23);
 for(const e of ['RED','GREEN','BLUE'])assert.ok(find(e,'enum'),e);
 for(const t of ['color_t','point_t','handler_t'])assert.ok(find(t,'typedef'),t);
 assert.equal(find('LED_Pin','macro').line,12);assert.equal(outlineLabel(find('MAX','macro')),'MAX(a,b)');
 assert.equal(s.some(x=>x.name==='fake'),false,'commented out');assert.equal(s.some(x=>x.name==='HAL_Init'||x.name==='GPIO_InitStruct'),false,'calls and locals are not symbols');
 // A definition beats a prototype.
 assert.deepEqual(pickDefinitions(s.filter(x=>x.name==='MX_GPIO_Init')).map(x=>x.kind),['function']);
});

test('a declaration of several names gives one symbol per name with the shared type (not the last name only)',()=>{
 const s=cSymbols('volatile uint32_t halfCount, fullCount;\nint a = 1, *b = 0, c[2] = {1, 2};\nint f(int x, int y);\nvoid g(void) { int local, other; }\n');
 assert.deepEqual(s.filter(x=>x.kind==='variable').map(x=>[outlineLabel(x),x.line]),[['halfCount : uint32_t',1],['fullCount : uint32_t',1],['a : int',2],['b : int *',2],['c[2] : int',2]]);
 assert.equal(outlineLabel(s.find(x=>x.name==='f')),'f(int x, int y) : int','parameters are not declarators');
 assert.equal(s.some(x=>x.name==='local'||x.name==='other'),false);
});

test('extern "C" blocks and multi-line macros in headers do not hide declarations',()=>{
 const h='#ifdef __cplusplus\nextern "C" {\n#endif\n#define __HAL_LOCK(h) do{ if((h)->Lock == HAL_LOCKED) \\\n  { return HAL_BUSY; } \\\n }while (0U)\ntypedef struct __UART_HandleTypeDef\n{\n  int Lock;\n} UART_HandleTypeDef;\nHAL_StatusTypeDef HAL_UART_Init(UART_HandleTypeDef *huart);\nvoid HAL_UART_IRQHandler(UART_HandleTypeDef *huart);\n#ifdef __cplusplus\n}\n#endif\n';
 const s=cSymbols(h);
 assert.ok(s.find(x=>x.name==='UART_HandleTypeDef'&&x.kind==='typedef'&&x.line===10));
 assert.equal(outlineLabel(s.find(x=>x.name==='HAL_UART_Init')),'HAL_UART_Init(UART_HandleTypeDef *huart) : HAL_StatusTypeDef');
 assert.ok(s.find(x=>x.name==='HAL_UART_IRQHandler'&&x.kind==='declaration'));assert.ok(s.find(x=>x.name==='__HAL_LOCK'&&x.kind==='macro'));
});

const local=path.join(process.env.LOCALAPPDATA||'','STM-Simulator-Tools'),cubeF1=process.env.STM32CUBE_F1_ROOT||path.join(local,'STM32CubeF1'),cubeF4=process.env.STM32CUBE_F4_ROOT||path.join(local,'STM32CubeF4');
const has=p=>fs.access(p).then(()=>true,()=>false),sdk=await has(path.join(cubeF1,'Drivers/STM32F1xx_HAL_Driver'))&&await has(path.join(cubeF4,'Drivers/STM32F4xx_HAL_Driver'));

test('the SDK index resolves HAL functions, types, IRQ numbers and macros to the CubeF1/F4 sources, and serves only indexed files',{skip:!sdk&&'STM32CubeF1/F4 not installed'},async()=>{
 const index=new SdkIndex(),tools={cube:cubeF4,cubeF1};
 const one=async(family,name)=>(await index.definition(family,tools,name));
 const irq=await one('STM32F103RB','HAL_UART_IRQHandler');assert.equal(irq.length,1);assert.equal(irq[0].file,'Drivers/STM32F1xx_HAL_Driver/Src/stm32f1xx_hal_uart.c');assert.equal(irq[0].kind,'function');
 const f4=await one('STM32F446RE','HAL_RCC_OscConfig');assert.equal(f4[0].file,'Drivers/STM32F4xx_HAL_Driver/Src/stm32f4xx_hal_rcc.c');
 assert.equal((await one('STM32F103RB','UART_HandleTypeDef'))[0].kind,'typedef');
 assert.deepEqual((await one('STM32F103RB','USART2_IRQn')).map(d=>[d.file,d.kind]),[['Drivers/CMSIS/Device/ST/STM32F1xx/Include/stm32f103xb.h','enum']]);
 assert.equal((await one('STM32F446RE','__HAL_RCC_GPIOA_CLK_ENABLE'))[0].kind,'macro');
 assert.deepEqual(await one('STM32F103RB','no_such_symbol_xyz'),[]);assert.deepEqual(await one('STM32F103RB','bad name'),[]);
 const file=await index.file('STM32F103RB',tools,irq[0].file);assert.equal(file.sdk,'STM32CubeF1');
 const line=file.text.split(/\r?\n/)[irq[0].line-1];assert.match(line,/HAL_UART_IRQHandler/);
 // Completion by prefix (case-insensitive), functions first.
 const names=(await index.names('STM32F103RB',tools,'hal_tim_base_st')).map(n=>n.name);
 for(const n of ['HAL_TIM_Base_Start','HAL_TIM_Base_Start_IT','HAL_TIM_Base_Stop','HAL_TIM_Base_Stop_IT'])assert.ok(names.includes(n),n);
 assert.equal((await index.names('STM32F103RB',tools,'HAL_TIM_Base_Stop_IT'))[0].kind,'function');assert.deepEqual(await index.names('STM32F103RB',tools,'H'),[],'two letters at least');
 await assert.rejects(index.file('STM32F103RB',tools,'../../../Windows/win.ini'),/색인에 없는/);
 await assert.rejects(index.definition('STM32F103RB',{cube:cubeF4},'HAL_Init'),/STM32CubeF1 SDK가 없어/);
});
