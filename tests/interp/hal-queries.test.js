// Small HAL / CMSIS calls of everyday code that the interpreter refused (found by probing 45 calls): clock queries and
// SystemCoreClock, HAL_GetTickFreq, assert_param, device identity, peripheral state, HAL_I2C_IsDeviceReady, __WFI.
import test from 'node:test';
import assert from 'node:assert/strict';
import {blankProject} from '../../src/project.js';
import {generateHal,validateMcu} from '../../src/mcu-config.js';
import {SimulationSession} from '../../src/session.js';

const pin=fn=>({function:fn,pull:'NOPULL',edge:'FALLING',label:'',initial:0});
function run(body,family){
 const p=blankProject(family);if(family==='STM32F103RB')p.boardId='nucleo-f103rb';
 p.mcu.pins={PA2:pin('USART2_TX'),PA3:pin('USART2_RX'),PA0:pin('ADC1_IN0'),PB8:pin('I2C1_SCL'),PB9:pin('I2C1_SDA')};
 p.mcu.peripherals={USART2:{enabled:true},ADC1:{enabled:true},I2C1:{enabled:true}};p.mcu=validateMcu(p.mcu);
 p.code=generateHal(p.mcu,{minimal:true}).replace('  /* USER CODE BEGIN 2 */','  /* USER CODE BEGIN 2 */\n  '+body);
 const out=[],s=new SimulationSession(p,{print:x=>out.push(x),warn:()=>{}});s.tick(0);for(let t=10;t<=100;t+=10)s.tick(t);return out;
}
const r=String.raw;

test('clock queries agree with each other and with SystemCoreClock',()=>{
 for(const family of ['STM32F446RE','STM32F103RB']){
  const [line]=run(r`printf("%lu %lu %lu %lu %lu\n", SystemCoreClock, HAL_RCC_GetHCLKFreq(), HAL_RCC_GetSysClockFreq(), HAL_RCC_GetPCLK1Freq(), HAL_RCC_GetPCLK2Freq());`,family);
  const [core,hclk,sys,p1,p2]=line.split(' ').map(Number);
  assert.equal(core,hclk,family);assert.ok(core>=1e6&&sys>=hclk&&hclk>=p1&&hclk>=p2&&p1>0,family+' '+line);
 }
});

test('HAL_GetTickFreq, assert_param, device identity, peripheral state',()=>{
 assert.deepEqual(run(r`assert_param(1); printf("%d %d %d %d %d\n", HAL_GetTickFreq(), HAL_GetUIDw0() != HAL_GetUIDw1(), HAL_GetDEVID() == 0x421, HAL_UART_GetState(&huart2) == HAL_UART_STATE_READY, (int)HAL_ADC_GetState(&hadc1) == HAL_ADC_STATE_READY);`),['1 1 1 1 1']);
 assert.deepEqual(run(r`printf("%d\n", HAL_GetDEVID() == 0x410);`,'STM32F103RB'),['1']);
});

test('HAL_I2C_IsDeviceReady reports an address nobody answers; __WFI and Sleep mode return within a tick',()=>{
 assert.deepEqual(run(r`printf("%d\n", HAL_I2C_IsDeviceReady(&hi2c1, 0x50 << 1, 1, 10) == HAL_OK);`),['0']);
 assert.throws(()=>run(r`HAL_I2C_IsDeviceReady(&hi2c1, 0x51, 1, 10);`),/7비트 주소를 왼쪽으로 1비트/);
 assert.deepEqual(run(r`uint32_t t0 = HAL_GetTick(); for (int i = 0; i < 5; i++) __WFI(); HAL_PWR_EnterSLEEPMode(PWR_MAINREGULATOR_ON, PWR_SLEEPENTRY_WFI); uint32_t d = HAL_GetTick() - t0; printf("%d\n", d >= 5 && d <= 8);`),['1']);
});
