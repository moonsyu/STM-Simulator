import test from 'node:test';
import assert from 'node:assert/strict';
import {familyProfile,routesOf,irqNamesOf,remapFor,FAMILIES} from '../../src/mcu-family.js';
import {defaultMcu,validateMcu,configProblems,pinFunctions,ROUTES,IRQ_NAMES} from '../../src/mcu-config.js';

const pin=fn=>({function:fn,pull:'NOPULL',edge:'FALLING',initial:0,label:''});
const F1='STM32F103RB';

test('the default family is still the STM32F446RE with its original routes and IRQs',()=>{
 assert.equal(defaultMcu().family,'STM32F446RE');
 assert.deepEqual(ROUTES,routesOf('STM32F446RE'));
 assert.deepEqual(IRQ_NAMES,irqNamesOf('STM32F446RE'));
 assert.ok(ROUTES.SDIO&&ROUTES.DCMI&&ROUTES.UART4&&ROUTES.TIM5);
});

test('STM32F103RB profile: peripherals, GPIO set, clocks and IRQs of the F103 medium-density part',()=>{
 const f=familyProfile(F1),routes=routesOf(F1);
 assert.deepEqual(Object.keys(routes).sort(),['ADC1','I2C1','SPI1','TIM2','TIM3','TIM4','USART1','USART2','USART3']);
 for(const missing of ['SDIO','DCMI','UART4','UART5','USART6','TIM5'])assert.ok(!routes[missing],missing);
 assert.ok(f.gpioPins.includes('PB11')&&f.gpioPins.includes('PD0')&&!f.gpioPins.includes('PH0'));
 assert.equal(defaultMcu(F1).timerClockHz,8000000);
 assert.ok(f.clock.valid(64000000)&&!f.clock.valid(72000000)&&!f.clock.valid(10000000));
 assert.equal(f.timerMax('TIM2'),65535);
 assert.ok(irqNamesOf(F1).includes('ADC1_2_IRQn')&&irqNamesOf(F1).includes('DMA1_Channel7_IRQn')&&!irqNamesOf(F1).includes('DMA1_Stream0_IRQn'));
 assert.deepEqual(f.dmaRequests.USART2_RX,[['DMA1_Channel6',null]]);
 assert.deepEqual(Object.keys(FAMILIES),['STM32F446RE',F1]);
});

test('F1 alternate functions follow AFIO remap groups: signals move together',()=>{
 assert.equal(remapFor(F1,'USART1',{TX:'PB6',RX:'PB7'}).macro,'__HAL_AFIO_REMAP_USART1_ENABLE');
 assert.equal(remapFor(F1,'USART1',{TX:'PA9',RX:'PA10'}).macro,undefined);
 assert.equal(remapFor(F1,'USART1',{TX:'PB6',RX:'PA10'}),null);
 assert.equal(remapFor(F1,'TIM2',{CH1:'PA15',CH3:'PA2'}).macro,'__HAL_AFIO_REMAP_TIM2_PARTIAL_1');
 // USART1_CK stays on PA8 whichever TX/RX pins are used.
 assert.ok(remapFor(F1,'USART1',{TX:'PB6',RX:'PB7',CK:'PA8'}));
 const base=defaultMcu(F1);
 const mixed={...base,pins:{PB6:pin('USART1_TX'),PA10:pin('USART1_RX')},peripherals:{USART1:{enabled:true,baud:115200}}};
 assert.match(configProblems(validateMcu(mixed)).join('\n'),/USART1: TX=PB6, RX=PA10 조합은 STM32F103RB에서 쓸 수 없습니다/);
 const remapped={...base,pins:{PB6:pin('USART1_TX'),PB7:pin('USART1_RX')},peripherals:{USART1:{enabled:true,baud:115200}}};
 assert.deepEqual(configProblems(validateMcu(remapped)),[]);
 assert.ok(!pinFunctions('PA5',F1).includes('TIM2_CH1'),'PA5 has no timer channel on the F103');
 assert.throws(()=>validateMcu({...base,pins:{PH0:pin('GPIO_Output')}}),/PH0/);
 assert.throws(()=>validateMcu({...base,peripherals:{SDIO:{enabled:true}}}),/SDIO: STM32F103RB에서 지원하지 않는/);
});

test('the board being edited decides header pin names: NUCLEO-F103RB has PD0/PD1 and PB11, switching back restores PH0',async()=>{
 const {setActiveBoard,PIN_BY_ID,searchPins,endpointInfo}=await import('../../src/pins.js');
 setActiveBoard('nucleo-f103rb');
 assert.equal(PIN_BY_ID.get('board:CN7:29').signal,'PD0');assert.equal(PIN_BY_ID.get('board:CN10:18').signal,'PB11');
 assert.match(endpointInfo('board:CN10:18').label,/PB11/);assert.equal(searchPins('PB11')[0]?.id,'board:CN10:18');
 setActiveBoard('nucleo-f446re');
 assert.equal(PIN_BY_ID.get('board:CN7:29').signal,'PH0');assert.equal(PIN_BY_ID.get('board:CN10:18').signal,'NC');assert.equal(searchPins('PB11').length,0);
});

test('the F446RE timer clock the Pinout accepts is exactly what main.c generation can build',async()=>{
 const {familyProfile}=await import('../../src/mcu-family.js'),{clockPlan}=await import('../../src/hal-generator.js');
 const valid=familyProfile('STM32F446RE').clock.valid;
 for(const hz of [8e6,12e6,12.5e6,16e6,25e6,42e6,84e6,90e6,100e6,180e6,84123456]){let builds=true;try{clockPlan(hz);}catch{builds=false;}assert.equal(valid(hz),builds,`${hz/1e6} MHz`);}
});

test('F1 USART enable picks a whole AFIO remap group and keeps the one the user picked',async()=>{
 const {setSerialEnabled,assignSerialPin}=await import('../../src/serial-config.js');
 const f=familyProfile(F1),c=defaultMcu(F1);c.pins.PA9=pin('GPIO_Output');
 const on=setSerialEnabled(c,'USART1',true,f.serial,f.remaps.USART1);
 assert.equal(on.pins.PB6.function,'USART1_TX');assert.equal(on.pins.PB7.function,'USART1_RX','RX follows the TX remap, not PA10');
 const picked=defaultMcu(F1);assignSerialPin(picked,'USART1','TX','PB6',f.serial);
 const kept=setSerialEnabled(picked,'USART1',true,f.serial,f.remaps.USART1);
 assert.equal(kept.pins.PB6.function,'USART1_TX');assert.equal(kept.pins.PB7.function,'USART1_RX');assert.notEqual(kept.pins.PA9?.function,'USART1_TX');
 const full=defaultMcu(F1);full.pins.PA9=pin('GPIO_Output');full.pins.PB7=pin('GPIO_Output');
 assert.throws(()=>setSerialEnabled(full,'USART1',true,f.serial,f.remaps.USART1),/TX\/RX 핀 묶음/);
});

test('F1 PD0/PD1 GPIO gets the PD01 remap; SWD pins PA13/PA14 cannot be reconfigured',async()=>{
 const {generateHal}=await import('../../src/mcu-config.js');
 const c=defaultMcu(F1);c.pins.PD0=pin('GPIO_Output');
 assert.match(generateHal(c),/__HAL_RCC_AFIO_CLK_ENABLE\(\);[\s\S]*__HAL_AFIO_REMAP_PD01_ENABLE\(\);[\s\S]*GPIO_PIN_0/);
 for(const family of [F1,'STM32F446RE']){const d=defaultMcu(family);d.pins.PA13=pin('GPIO_Output');assert.ok(configProblems(d).some(e=>/PA13: SWD/.test(e)),family);}
});
