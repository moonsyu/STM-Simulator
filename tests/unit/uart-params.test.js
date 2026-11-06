// USART Parameter Settings (CubeMX Asynchronous mode): Word Length, Parity, Stop Bits, Data Direction, Over Sampling in
// the Pinout configuration, the generated MX_USARTx_UART_Init, .ioc import, and the interpreter's 8N1 limit.
import test from 'node:test';
import assert from 'node:assert/strict';
import {applyHalExample} from '../../src/hal-examples.js';
import {blankProject,projectForBoard} from '../../src/project.js';
import {validateMcu,generateHal,importIoc,UART_PARAMS} from '../../src/mcu-config.js';
import {SimulationSession} from '../../src/session.js';

const uart=(base=blankProject(),params={})=>{const p=applyHalExample(base,'uart');Object.assign(p.mcu.peripherals.USART2,params);return p;};

test('UART parameters: CubeMX defaults are not stored, other values are validated and generated',()=>{
 assert.deepEqual(UART_PARAMS.parity,['NONE','EVEN','ODD']);
 const v=validateMcu(uart(blankProject(),{wordLength:9,parity:'EVEN',stopBits:2,direction:'TX',overSampling:8}).mcu).peripherals.USART2;
 assert.deepEqual([v.wordLength,v.parity,v.stopBits,v.direction,v.overSampling],[9,'EVEN',2,'TX',8]);
 const d=validateMcu(uart(blankProject(),{wordLength:8,parity:'NONE',stopBits:1,direction:'TX_RX',overSampling:16}).mcu).peripherals.USART2;
 assert.deepEqual(Object.keys(d).sort(),['baud','enabled'],'defaults are not kept');
 const src=generateHal(uart(blankProject(),{wordLength:9,parity:'ODD',stopBits:2,direction:'RX',overSampling:8}).mcu);
 for(const line of ['huart2.Init.WordLength = UART_WORDLENGTH_9B;','huart2.Init.StopBits = UART_STOPBITS_2;','huart2.Init.Parity = UART_PARITY_ODD;','huart2.Init.Mode = UART_MODE_RX;','huart2.Init.OverSampling = UART_OVERSAMPLING_8;'])assert.ok(src.includes(line),line);
 assert.match(generateHal(uart().mcu),/huart2\.Init\.WordLength = UART_WORDLENGTH_8B;[\s\S]*huart2\.Init\.Parity = UART_PARITY_NONE;[\s\S]*huart2\.Init\.OverSampling = UART_OVERSAMPLING_16;/);
 assert.throws(()=>validateMcu(uart(blankProject(),{parity:'MARK'}).mcu),/USART2\.parity: NONE \/ EVEN \/ ODD/);
 assert.throws(()=>validateMcu(uart(blankProject(),{stopBits:1.5}).mcu),/stopBits/);
 assert.throws(()=>validateMcu(uart(projectForBoard('nucleo-f103rb'),{overSampling:8}).mcu),/Over Sampling 16만/);
 assert.match(generateHal(uart(projectForBoard('nucleo-f103rb'),{parity:'EVEN'}).mcu),/huart2\.Init\.Parity = UART_PARITY_EVEN;/);
});

test('a CubeMX .ioc with USART2 parameters keeps them; the interpreter says to use the ARM GCC simulator for them',()=>{
 const ioc='Mcu.Family=STM32F4\nMcu.UserName=STM32F446RETx\nMcu.IP0=USART2\nPA2.Signal=USART2_TX\nPA2.Mode=Asynchronous\nPA3.Signal=USART2_RX\nPA3.Mode=Asynchronous\nUSART2.BaudRate=57600\nUSART2.WordLength=WORDLENGTH_9B\nUSART2.Parity=PARITY_EVEN\nUSART2.StopBits=STOPBITS_2\nUSART2.Mode=MODE_TX\nUSART2.OverSampling=UART_OVERSAMPLING_8\nUSART2.IPParameters=BaudRate,WordLength,Parity,StopBits,Mode,OverSampling\n';
 const c=importIoc(ioc).config.peripherals.USART2;
 assert.deepEqual([c.baud,c.wordLength,c.parity,c.stopBits,c.direction,c.overSampling],[57600,9,'EVEN',2,'TX',8]);
 const p=uart(blankProject(),{parity:'EVEN',wordLength:9});p.code=generateHal(p.mcu);
 assert.throws(()=>{const s=new SimulationSession(p,{print(){},warn(){}});for(let t=10;t<=50;t+=10)s.tick(t);},/ARM GCC 시뮬레이터로 실행하세요/);
});
