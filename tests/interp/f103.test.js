import test from 'node:test';
import assert from 'node:assert/strict';
import {advance} from './helpers.js';
import {generateHal,defaultMcu} from '../../src/mcu-config.js';
import {projectForBoard,validateProject} from '../../src/project.js';
import {SimulationSession} from '../../src/session.js';

const pin=(fn,extra={})=>({function:fn,pull:'NOPULL',edge:'FALLING',initial:0,label:'',...extra});
// NUCLEO-F103RB project: LD2, USART2 VCP, I2C1 remapped to PB8/PB9, ADC1 on PA0 at a 64 MHz SYSCLK.
function f103(edit=code=>code){
 const p=projectForBoard('nucleo-f103rb'),c=defaultMcu('STM32F103RB');c.timerClockHz=64000000;
 Object.assign(c.pins,{PA5:pin('GPIO_Output',{label:'LD2'}),PA2:pin('USART2_TX'),PA3:pin('USART2_RX'),PB8:pin('I2C1_SCL'),PB9:pin('I2C1_SDA'),PA0:pin('ADC1_IN0')});
 c.peripherals={USART2:{enabled:true,baud:115200},I2C1:{enabled:true,clock:100000},ADC1:{enabled:true}};p.mcu=c;
 p.code=edit(generateHal(c).replace('    HAL_Delay(500);','    HAL_ADC_Start(&hadc1);\n    HAL_ADC_PollForConversion(&hadc1, 10);\n    printf("PA5=%u adc=%lu tick=%lu\\n", HAL_GPIO_ReadPin(GPIOA, GPIO_PIN_5), HAL_ADC_GetValue(&hadc1), HAL_GetTick());\n    HAL_Delay(500);'));
 return validateProject(p);
}
const start=p=>{const output=[],s=new SimulationSession(p,{print:x=>output.push(x)});s.tick(0);return {s,output};};

test('generated STM32F103 HAL code (AFIO remap, F1 clock, ADC prescaler) runs in the circuit simulator',()=>{
 const p=f103();
 assert.match(p.code,/RCC_PLLSOURCE_HSI_DIV2[\s\S]*RCC_PLL_MUL16[\s\S]*FLASH_LATENCY_2/);
 assert.match(p.code,/__HAL_RCC_AFIO_CLK_ENABLE\(\);\s*__HAL_AFIO_REMAP_I2C1_ENABLE\(\);/);
 assert.match(p.code,/RCC_ADCPCLK2_DIV6[\s\S]*ADC_SAMPLETIME_239CYCLES_5[\s\S]*HAL_ADCEx_Calibration_Start/);
 assert.doesNotMatch(p.code,/Alternate|VERY_HIGH|PWR_REGULATOR|ClockPrescaler/);
 const {s,output}=start(p);advance(s,1600,5);
 assert.deepEqual(output.slice(0,4).map(l=>l.replace(/ adc=\d+/,'')),['PA5=1 tick=0','PA5=0 tick=501','PA5=1 tick=1001','PA5=0 tick=1501']);
 assert.match(s.buses.vcpOutput,/^HAL ready\r\n/);
});

test('F1 rules: remapped pins need their AFIO remap, F4-only HAL names do not exist, ADC clock stays at or below 14 MHz',()=>{
 assert.throws(()=>start(f103(c=>c.replace('  __HAL_AFIO_REMAP_I2C1_ENABLE();\n',''))),/PB8: I2C1 신호가 리맵 핀에 있습니다\. __HAL_AFIO_REMAP_I2C1_ENABLE\(\)/);
 assert.throws(()=>start(f103(c=>c.replace('  HAL_GPIO_Init(GPIOA, &GPIO_InitStruct);','  GPIO_InitStruct.Alternate = 7;\n  HAL_GPIO_Init(GPIOA, &GPIO_InitStruct);'))),/Alternate/);
 assert.throws(()=>start(f103(c=>c.replace('  osc.OscillatorType','  __HAL_PWR_VOLTAGESCALING_CONFIG(PWR_REGULATOR_VOLTAGE_SCALE1);\n  osc.OscillatorType'))),/PWR_REGULATOR_VOLTAGE_SCALE1/);
 assert.throws(()=>start(f103(c=>c.replace('RCC_ADCPCLK2_DIV6','RCC_ADCPCLK2_DIV2'))),/ADC 클록 32 MHz가 14 MHz를 넘습니다/);
 assert.throws(()=>start(f103(c=>c.replace('  __HAL_RCC_GPIOA_CLK_ENABLE();','  __HAL_RCC_GPIOH_CLK_ENABLE();\n  __HAL_RCC_GPIOA_CLK_ENABLE();'))),/GPIOH/);
});

test('an F1 project cannot carry an F4 pin configuration (board and MCU must match)',()=>{
 const p=projectForBoard('nucleo-f103rb');p.mcu=defaultMcu('STM32F446RE');
 assert.throws(()=>validateProject(p),/NUCLEO-F103RB 보드에는 STM32F103RB 핀 설정이 필요합니다/);
});
