// I2C2 / I2C3 / SPI2 / SPI3 settings (bus-config.js): routes per board, alternate functions (ST open pin data), the
// same parameter rules as I2C1 / SPI1, generated handles and interrupt handlers, .ioc import.
import test from 'node:test';
import assert from 'node:assert/strict';
import {validateMcu,generateHal,importIoc,configProblems,defaultMcu} from '../../src/mcu-config.js';
import {routesOf,irqNamesOf} from '../../src/mcu-family.js';
import {busAf} from '../../src/bus-config.js';
import {afNumber} from '../../src/emu/stm32f446/tables.js';

const pin=fn=>({function:fn,pull:'NOPULL',edge:'RISING',label:'',initial:0});

test('routes: F446RE I2C1-3 / SPI1-3, F103RB I2C1-2 / SPI1-2; AF numbers match the emulator pin table',()=>{
 const f4=routesOf('STM32F446RE'),f1=routesOf('STM32F103RB');
 assert.deepEqual(f4.I2C2,{SCL:['PB10'],SDA:['PB3','PC12']});assert.deepEqual(f4.I2C3,{SCL:['PA8'],SDA:['PC9','PB4']});
 assert.deepEqual(f1.I2C2,{SCL:['PB10'],SDA:['PB11']});assert.deepEqual(f1.SPI2,{SCK:['PB13'],MISO:['PB14'],MOSI:['PB15']});
 assert.ok(!f1.I2C3&&!f1.SPI3);
 for(const id of ['I2C2','I2C3','SPI2','SPI3'])for(const [signal,pins]of Object.entries(f4[id]))for(const p of pins)assert.equal(busAf(`${id}_${signal}`,p),afNumber(p,`${id}_${signal}`),`${id}_${signal} on ${p}`);
 assert.equal(busAf('SPI2_MOSI','PC1'),7);assert.equal(busAf('SPI3_MOSI','PC1'),5);assert.equal(busAf('SPI3_MOSI','PB0'),7);assert.equal(busAf('SPI3_SCK','PB3'),6);
 for(const irq of ['I2C2_EV_IRQn','I2C2_ER_IRQn','I2C3_EV_IRQn','SPI2_IRQn','SPI3_IRQn'])assert.ok(irqNamesOf('STM32F446RE').includes(irq),irq);
 assert.ok(irqNamesOf('STM32F103RB').includes('SPI2_IRQn')&&!irqNamesOf('STM32F103RB').includes('SPI3_IRQn'));
});

test('the I2C1 / SPI1 rules apply to every instance; missing pins and an instance the board lacks are reported',()=>{
 const c=validateMcu({...defaultMcu(),pins:{PB10:pin('I2C2_SCL'),PB3:pin('I2C2_SDA')},peripherals:{I2C2:{enabled:true,clock:400000,ownAddress:0x30,dutyCycle:'16_9',noStretch:true},SPI3:{enabled:true,cpol:'HIGH',dataSize:16}}});
 assert.deepEqual(c.peripherals.I2C2,{enabled:true,clock:400000,ownAddress:0x30,dutyCycle:'16_9',noStretch:true});
 assert.deepEqual(c.peripherals.SPI3,{enabled:true,clock:1000000,cpol:'HIGH',dataSize:16});
 assert.deepEqual(configProblems(c),['SPI3: SCK 핀을 활성화하세요.','SPI3: MISO 핀을 활성화하세요.','SPI3: MOSI 핀을 활성화하세요.']);
 assert.throws(()=>validateMcu({...defaultMcu(),peripherals:{I2C3:{enabled:true,dutyCycle:'16_9'}}}),/I2C3: Fast Mode Duty Cycle 16\/9는 100 kHz보다 빠를 때만/);
 assert.throws(()=>validateMcu({...defaultMcu('STM32F103RB'),peripherals:{SPI3:{enabled:true}}}),/SPI3: STM32F103RB에서 지원하지 않는 주변장치입니다/);
 assert.deepEqual(configProblems(validateMcu({...defaultMcu(),pins:{PB10:pin('I2C2_SCL')},peripherals:{}})),['PB10: I2C2 주변장치를 활성화하세요.']);
});

test('generated code: hi2c2 / hspi3 handles, open-drain I2C pins, per-pin AF, interrupt handlers',()=>{
 const code=generateHal({...defaultMcu(),pins:{PB10:pin('I2C2_SCL'),PC12:pin('I2C2_SDA'),PB3:pin('SPI3_SCK'),PB4:pin('SPI3_MISO'),PC1:pin('SPI3_MOSI')},
  peripherals:{I2C2:{enabled:true,clock:100000},SPI3:{enabled:true,clock:1000000}},nvic:{I2C2_EV_IRQn:{enabled:true,priority:1},SPI3_IRQn:{enabled:true,priority:2}}});
 assert.match(code,/I2C_HandleTypeDef hi2c2;\nSPI_HandleTypeDef hspi3;/);
 assert.match(code,/GPIO_InitStruct\.Pin = GPIO_PIN_12;\n  GPIO_InitStruct\.Mode = GPIO_MODE_AF_OD;\n[\s\S]*?GPIO_InitStruct\.Alternate = GPIO_AF4_I2C2;/);
 assert.match(code,/GPIO_InitStruct\.Pin = GPIO_PIN_3;\n  GPIO_InitStruct\.Mode = GPIO_MODE_AF_PP;\n[\s\S]*?GPIO_InitStruct\.Alternate = GPIO_AF6_SPI3;/);
 assert.match(code,/GPIO_InitStruct\.Pin = GPIO_PIN_1;\n  GPIO_InitStruct\.Mode = GPIO_MODE_AF_PP;\n[\s\S]*?GPIO_InitStruct\.Alternate = GPIO_AF5_SPI3;/);
 assert.match(code,/static void MX_SPI3_Init\(void\) \{\n  __HAL_RCC_SPI3_CLK_ENABLE\(\);\n  hspi3\.Instance = SPI3;\n  hspi3\.Init\.Mode = SPI_MODE_MASTER;/);
 assert.match(code,/HAL_NVIC_EnableIRQ\(I2C2_EV_IRQn\);[\s\S]*HAL_NVIC_EnableIRQ\(SPI3_IRQn\);/);
 // F103RB: SPI2 MISO is a plain input, no AFIO remap for I2C2 / SPI2.
 const f1=generateHal({...defaultMcu('STM32F103RB'),pins:{PB10:pin('I2C2_SCL'),PB11:pin('I2C2_SDA'),PB13:pin('SPI2_SCK'),PB14:pin('SPI2_MISO'),PB15:pin('SPI2_MOSI')},peripherals:{I2C2:{enabled:true,clock:100000},SPI2:{enabled:true,clock:1000000}}});
 assert.match(f1,/GPIO_InitStruct\.Pin = GPIO_PIN_14;\n  GPIO_InitStruct\.Mode = GPIO_MODE_INPUT;/);assert.ok(!/__HAL_AFIO_REMAP_(I2C|SPI)/.test(f1));
 assert.match(f1,/hi2c2\.Instance = I2C2;[\s\S]*hspi2\.Instance = SPI2;/);
});

test('.ioc import: I2C2 / SPI2 pins and parameters',()=>{
 const {config,warnings}=importIoc(['Mcu.Name=STM32F446R(C-E)Tx','Mcu.CPN=STM32F446RET6','Mcu.IP0=I2C2','Mcu.IP1=RCC','Mcu.IP2=SPI2','Mcu.IP3=SYS','PB10.Signal=I2C2_SCL','PB3.Signal=I2C2_SDA',
  'PB13.Signal=SPI2_SCK','PB14.Signal=SPI2_MISO','PB15.Signal=SPI2_MOSI','I2C2.I2C_Mode=I2C_Fast','I2C2.ClockSpeed=400000','I2C2.DutyCycle=I2C_DUTYCYCLE_16_9','I2C2.OwnAddress=96',
  'SPI2.Mode=SPI_MODE_MASTER','SPI2.CLKPolarity=SPI_POLARITY_HIGH','SPI2.CLKPhase=SPI_PHASE_2EDGE','SPI2.CalculateBaudRate=2.0 MBits/s','SPI2.BaudRatePrescaler=SPI_BAUDRATEPRESCALER_8'].join('\n'));
 assert.deepEqual(config.peripherals.I2C2,{enabled:true,clock:400000,ownAddress:0x30,dutyCycle:'16_9'});
 assert.deepEqual(config.peripherals.SPI2,{enabled:true,clock:2000000,cpol:'HIGH',cpha:'2EDGE'});
 assert.equal(config.pins.PB3.function,'I2C2_SDA');assert.deepEqual(warnings,[]);
});
