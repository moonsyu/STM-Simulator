import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultMcu,validateMcu,configProblems,importIoc,generateHal} from '../src/mcu-config.js';
import {compileHal} from '../src/hal-source.js';
import {Runtime} from '../src/runtime.js';
import {HAL_CONSTANTS} from '../src/hal.js';
import {HAL_EXAMPLES} from '../src/hal-examples.js';
import {halCircuit as halExample} from './fixtures/hal.js';
import {SimulationSession} from '../src/session.js';
import {validateProject} from '../src/project.js';
import {circuitFixture as example} from './fixtures/circuits.js';
import {importFirmware} from '../src/firmware-import.js';
const start=(p)=>{const output=[];const s=new SimulationSession(p,{print:x=>output.push(x)});s.tick(0);return {s,output};};

test('all generated HAL examples parse, persist and run against their circuit',()=>{
  for(const name of Object.keys(HAL_EXAMPLES)){const p=validateProject(halExample(name));assert.equal(p.firmware.mode,'hal');const {s}=start(p);for(let t=20;t<=120;t+=20)s.tick(t);assert.equal(s.result.fault,false,name);}
});
test('HAL main, GPIO initialization, writes and delay drive the external LED',()=>{
  const {s}=start(halExample('blink'));assert.equal(s.result.parts.led1.on,true);s.tick(501);assert.equal(s.result.parts.led1.on,false);
});
test('EXTI uses pin mask callback and NVIC while main waits',()=>{
  const {s}=start(halExample('exti'));assert.equal(s.result.parts.led1.on,false);s.setPressed({USER:true});s.tick(20);assert.equal(s.result.parts.led1.on,true);s.tick(40);assert.equal(s.result.parts.led1.on,true);
});
test('disabled NVIC retains EXTI pending until enabled and IRQ masks work',()=>{
  const p=halExample('exti');p.code=p.code.replace('/* USER CODE BEGIN 2 */','/* USER CODE BEGIN 2 */\n HAL_NVIC_DisableIRQ(EXTI15_10_IRQn);');const {s}=start(p);s.setPressed({USER:true});s.tick(20);assert.equal(s.result.parts.led1.on,false);s.hal.call('HAL_NVIC_EnableIRQ',['EXTI15_10_IRQn'],s.runtime);s.tick(40);assert.equal(s.result.parts.led1.on,true);
});
test('UART receives timed bytes and rearms a one-byte interrupt buffer',()=>{
  const {s}=start(halExample('uart'));s.tick(30);assert.match(s.buses.received.get('demo'),/HAL UART ready/);assert.equal(s.inject('ok'),2);for(let t=40;t<=80;t+=10)s.tick(t);assert.match(s.buses.received.get('demo'),/ok$/);
});
test('UART polling receive times out and rejects dangling RX buffers',()=>{
  let p=halExample('uart');p.code=p.code.replace('HAL_UART_Receive_IT(&huart2, rx, 1);','Serial.println(HAL_UART_Receive(&huart2, rx, 1, 5));');const {s,output}=start(p);s.tick(40);assert.ok(output.includes('3'));
  p=halExample('uart');p.code=p.code.replace('HAL_UART_Receive_IT(&huart2, rx, 1);','{ uint8_t local[1]; HAL_UART_Receive_IT(&huart2, local, 1); }');const x=start(p);x.s.tick(30);x.s.inject('x');assert.throws(()=>x.s.tick(40),/유효기간/);
});
test('TIM2 callback timing follows prescaler ARR and input clock',()=>{
  const {s}=start(halExample('timer'));s.tick(99);assert.equal(s.result.parts.led1.on,false);s.tick(100);assert.equal(s.result.parts.led1.on,true);s.tick(200);assert.equal(s.result.parts.led1.on,false);
});
test('HAL ADC measures the actual divider; I2C and SPI exchange memory data',()=>{
  const {output}=start(halExample('adc'));assert.ok(Math.abs(Number(output[0])-2048)<=1);
  for(const kind of ['i2c','spi']){const {s,output}=start(halExample(kind));s.tick(20);assert.ok(output.includes('42'),kind+': '+output);}
});
test('pin function, EXTI line, signal duplicate and missing route conflicts are detected',()=>{
  const m=defaultMcu();m.pins.PA2={...m.pins.PA5,function:'USART2_TX'};m.peripherals.USART2={enabled:true};assert.match(configProblems(m).join(),/RX/);
  m.pins.PA2.function='SPI1_SCK';assert.throws(()=>validateMcu(m),/지원하지 않는/);
  m.pins.PA2.function='GPIO_EXTI';m.pins.PC2={...m.pins.PA2};assert.match(configProblems(m).join(),/EXTI2/);
});
test('mismatched configuration and unsupported HAL fail explicitly',()=>{
  const p=halExample('blink');p.mcu.pins.PA5.function='GPIO_Input';assert.throws(()=>start(p),/GPIO_Output|Pinout/);
  const q=halExample('uart');q.code=q.code.replace('UART_PARITY_NONE','UART_PARITY_EVEN');assert.throws(()=>start(q),/8N1/);
  const r=halExample('blink');r.code=r.code.replace('HAL_Init();','HAL_CAN_Start(0);');assert.throws(()=>start(r),/지원하지 않는 HAL/);
});
test('Cube IOC imports GPIO EXTI UART and disabled NVIC without changing original project',()=>{
  const text='Mcu.Name=STM32F446R(C-E)Tx\nPA5.Signal=GPIO_Output\nPC13.Signal=GPXTI13\nPC13.GPIO_PuPd=GPIO_PULLUP\nPC13.GPIO_ModeDefaultEXTI=GPIO_MODE_IT_FALLING\nPA2.Signal=USART2_TX\nPA3.Signal=USART2_RX\nUSART2.BaudRate=9600\nNVIC.EXTI15_10_IRQn=true\\:2\\:0\nNVIC.USART2_IRQn=false\\:0\\:0';
  const {config,warnings}=importIoc(text);assert.deepEqual(warnings,[]);assert.equal(config.pins.PC13.function,'GPIO_EXTI');assert.equal(config.nvic.EXTI15_10_IRQn.priority,2);assert.equal(config.nvic.USART2_IRQn.enabled,false);
  const original=example(),next=importFirmware(original,[{name:'test.ioc',text},{name:'main.c',text:generateHal(config)}]).project;assert.equal(original.mcu,undefined);assert.equal(next.firmware.mode,'hal');assert.equal(next.mcu.peripherals.USART2.baud,9600);
});
test('IOC never silently activates unsupported peripherals; malformed data rejected',()=>{
  const {config,warnings}=importIoc('Mcu.Name=STM32F446RETx\nMcu.IP0=CAN1\nPB8.Signal=CAN1_RX');assert.equal(config.pins.PB8.function,'Reserved');assert.ok(warnings.some(w=>w.includes('CAN1')));
  assert.throws(()=>importIoc('Mcu.Name=STM32H743'),/STM32F446RE/);
  assert.throws(()=>importFirmware(example(),[{name:'x.c',text:'void x() {}'}]),/main.c/);
});
test('Cube multi-file include guards extern declarations prototypes RCC and casts compile',()=>{
  const source='#include "main.h"\n#include "gpio.h"\nint main(void){HAL_Init(); SystemClock_Config(); MX_GPIO_Init(); uint8_t message[]="OK"; Serial.println(sizeof(message)); while(1){HAL_Delay(10);}}\nvoid SystemClock_Config(void){RCC_OscInitTypeDef osc={0};osc.PLL.PLLN=336;HAL_RCC_OscConfig(&osc);}';
  const files=[{name:'main.h',text:'#ifndef MAIN_H\n#define MAIN_H\n#include "stm32f4xx_hal.h"\nvoid SystemClock_Config(void);\n#endif'}, {name:'gpio.h',text:'#ifndef GPIO_H\n#define GPIO_H\n#include "main.h"\nvoid MX_GPIO_Init(void);\n#endif'}, {name:'gpio.c',text:'#include "gpio.h"\nvoid MX_GPIO_Init(void){}'}];
  const p=example();p.code=source;p.mcu=defaultMcu();p.firmware={mode:'hal',files};assert.deepEqual(start(p).output,['3']);
});
test('HAL integer assignment division casts and static scalar follow C-like values',()=>{
  const out=[],program=compileHal('int next(void){static uint8_t c=254; c++; return c;} int main(void){int a=5/2; uint8_t b=255;b++;float c=5.0/2;Serial.println(a);Serial.println(b);Serial.println(c);Serial.println(next());Serial.println(next());return 0;}');const r=new Runtime(program,{constants:HAL_CONSTANTS,print:x=>out.push(x)});r.tick(0);assert.deepEqual(out,['2','0','2.5','255','0']);
});
test('HAL cooperative main can wait for an interrupt without delay; inner runaway stays bounded',()=>{
  const p=halExample('exti');p.code=p.code.replace('    HAL_Delay(10);','');const {s}=start(p);s.setPressed({USER:true});s.tick(20);assert.equal(s.result.parts.led1.on,true);
  const code='void spin(void){while(1){}} int main(void){spin();}';const r=new Runtime(compileHal(code));assert.throws(()=>r.tick(0),/실행 한도/);
});
test('preprocessor rejects unknown includes and unsafe or unsupported constructs',()=>{
  assert.throws(()=>compileHal('#include "missing.h"\nint main(void){}'),/헤더/);
  assert.throws(()=>compileHal('#define X(a) a\nint main(void){}'),/함수형/);
  assert.throws(()=>compileHal('#if VALUE == 2\nint main(void){}\n#endif'),/#if/);
});
test('HAL I2C/SPI timeout and UART busy return explicit status without buffer writes',()=>{
  for(const kind of ['i2c','spi']){const p=halExample(kind);p.code=p.code.replace(kind==='i2c'?'HAL_I2C_Mem_Read(&hi2c1, 0x50 << 1, 0x10, I2C_MEMADD_SIZE_8BIT, rx, 1, 100);':'HAL_SPI_Receive(&hspi1, rx, 1, 100);',kind==='i2c'?'Serial.println(HAL_I2C_Mem_Read(&hi2c1, 0x50 << 1, 0x10, I2C_MEMADD_SIZE_8BIT, rx, 1, 0));':'Serial.println(HAL_SPI_Receive(&hspi1, rx, 1, 0));');const {output}=start(p);assert.deepEqual(output.filter(x=>/^\d+$/.test(x)),['3','0']);}
  const p=halExample('uart');p.code=p.code.replace('HAL_UART_Receive_IT(&huart2, rx, 1);','HAL_UART_Receive_IT(&huart2, rx, 1);Serial.println(HAL_UART_Receive_IT(&huart2, rx, 1));');const {s,output}=start(p);s.tick(30);assert.ok(output.includes('2'));
});
test('shared EXTI handler only calls the callback for pending masks',()=>{
  const p=halExample('exti');p.code+='\nvoid EXTI15_10_IRQHandler(void){HAL_GPIO_EXTI_IRQHandler(GPIO_PIN_12);HAL_GPIO_EXTI_IRQHandler(GPIO_PIN_13);}\n';p.code=p.code.replace('printf("EXTI PC13\\n");','printf("%u\\n", GPIO_Pin);');const {s,output}=start(p);s.setPressed({USER:true});s.tick(20);assert.deepEqual(output,['8192']);
});
test('PWM configured through HAL produces the requested average voltage',()=>{
  const p=halExample('timer');p.mcu.pins.PA5.function='TIM2_CH1';p.code=generateHal(p.mcu).replace('HAL_TIM_Base_Init(&htim2);','HAL_TIM_PWM_Init(&htim2); TIM_OC_InitTypeDef oc={0}; oc.OCMode=TIM_OCMODE_PWM1; oc.Pulse=250; HAL_TIM_PWM_ConfigChannel(&htim2,&oc,TIM_CHANNEL_1);');p.code=p.code.replace('HAL_TIM_Base_Start_IT(&htim2);','HAL_TIM_PWM_Start(&htim2,TIM_CHANNEL_1);');const {s}=start(p);assert.ok(Math.abs(s.runtime.gpio.PA5.value-.825)<.01);
});
