// A project's Pinout settings (`mcu`): the tables of the Pinout screen, the check that makes a clean copy
// (validateMcu), the problems CubeMX would mark (configProblems) and reading a CubeMX .ioc.
// The code is in Rust (rust/stm-core/src/mcuconfig.rs, ioc.rs, pfiles.rs; feature 62): this file is what the JavaScript
// callers import.
import {DMA_REQUESTS} from './hal-dma.js';
import {familyProfile,routesOf,irqNamesOf,DEFAULT_FAMILY} from './mcu-family.js';
import {rustFn,rustPure,rustTable} from './rust-core.js';

const T=rustTable('mcu_tables');
// Synchronous USART clock outputs on F446RE LQFP64 (DS10693 table 11): AF7 USART1/2/3, AF8 USART6.
export const USART_CK_ROUTES=familyProfile(DEFAULT_FAMILY).usartCk;
export const usartCkRoutesOf=family=>familyProfile(family).usartCk;
export const DMA_MODES=T.dmaModes,DMA_PRIORITIES=T.dmaPriorities;
const peripheralOf=rustPure('dma_peripheral'),directionOf=rustPure('dma_direction'),extiOf=rustPure('irq_for_pin'),functionsOf=rustPure('pin_functions'),samplingMacroOf=rustPure('adc_sampling_macro');
// Peripheral of each DMA request (used to require that peripheral to be enabled).
export const dmaPeripheral=request=>peripheralOf(request);
export const dmaDirection=request=>directionOf(request);

// Routes and IRQs of the default (F446RE) family; per-family versions come from mcu-family.js.
// Peripheral alternatives are explicit; choosing a peripheral never assigns an arbitrary GPIO as an alternate function.
export const ROUTES=routesOf(DEFAULT_FAMILY);
export const IRQ_NAMES=irqNamesOf(DEFAULT_FAMILY);
export const dmaRequestsOf=family=>familyProfile(family).dmaRequests??DMA_REQUESTS;
export const MODES=T.modes;
export const irqForPin=pin=>extiOf(pin);
/** Every function a pin can have: the GPIO modes, the signals routed to it and the USART clocks (a new array). */
export function pinFunctions(pin,family=DEFAULT_FAMILY){return [...functionsOf(pin,familyProfile(family).id)];}
// ADC1 Rank 1 Sampling Time in ADC clock cycles (CubeMX ADC_SAMPLETIME_*). The app has always generated the longest one, so
// that stays the default when none is stored; CubeMX's own default is the shortest (3 / 1.5 cycles).
export const ADC_SAMPLING=T.adcSampling;
export const adcSamplingDefault=family=>ADC_SAMPLING[family].at(-1);
export const adcSamplingOf=config=>config.peripherals?.ADC1?.samplingTime??adcSamplingDefault(config.family);
/** HAL macro of a sampling time: 480 → ADC_SAMPLETIME_480CYCLES, 239.5 → ADC_SAMPLETIME_239CYCLES_5, 1.5 → ADC_SAMPLETIME_1CYCLE_5. */
// undefined and NaN are not numbers to send: they are asked for as "no value".
export const adcSamplingMacro=cycles=>cycles===undefined||Number.isNaN(cycles)?samplingMacroOf():samplingMacroOf(cycles);
/** The Pinout settings a family starts from (a new object; see rust-core.js newProjectMcu for a new project). */
export function defaultMcu(family=DEFAULT_FAMILY){return rustFn('default_mcu',familyProfile(family).id);}
/** SPI Parameter Settings (CubeMX Full-Duplex Master): clock polarity/phase (SPI mode 0-3), data size, first bit. */
// direction TX_ONLY: CubeMX's "Transmit Only Master" — SCK and MOSI, no MISO pin (displays, DACs, shift registers).
export const SPI_PARAMS=T.spiParams;
/** PWM channel settings: CH Polarity and PWM mode (the first value is CubeMX's default). */
export const TIM_CHANNEL_PARAMS=T.timChannelParams;
/** Output Compare CHn modes (CubeMX OCMode_n; Frozen = TIMING is its default). */
export const TIM_OC_MODES=T.timOcModes;
export const timChannelParams=mode=>mode==='oc'?{...TIM_CHANNEL_PARAMS,ocMode:TIM_OC_MODES}:TIM_CHANNEL_PARAMS;
/** Counter Settings › Counter Mode (CubeMX CounterMode; Up is its default). */
export const TIM_COUNTER_MODES=T.timCounterModes;
/** UART Parameter Settings (CubeMX Asynchronous mode): the first value of each list is CubeMX's default. */
export const UART_PARAMS=T.uartParams;
/** A clean copy of a project's Pinout settings, or throws with the first thing that is wrong with them. */
export const validateMcu=value=>rustFn('validate_mcu',value??null);
/** What CubeMX would mark in these settings: pins without their peripheral, missing pins, clashes, limits. */
export const configProblems=config=>rustFn('config_problems',config);
// CubeMX keeps parameter expressions as typed ("84-1", "1000*2"): + - * / and parentheses on integers only.
export const evalIocNumber=raw=>rustFn('eval_ioc_number',String(raw));
/** The settings a CubeMX .ioc describes: {config, warnings}. What the model cannot take over is left out with a note. */
export function importIoc(text){
 if(typeof text!=='string'||text.length>500000)throw new Error('.ioc 파일은 500 KB 이하로 선택하세요.');
 return rustFn('import_ioc',text);
}
/** The pins a user set up, without the UART console a new project starts with (USART2 on PA2 / PA3 at 115200). */
export function userPins(mcu){
 const pins=mcu?.pins||{};
 return Object.fromEntries(rustFn('user_pins',{pins,peripherals:{USART2:mcu?.peripherals?.USART2}}).map(pin=>[pin,pins[pin]]));
}
/** An example's console: USART2 on PA2 / PA3 (the ST-LINK virtual COM port, 115200 8N1) unless the example already
 * uses USART2 or one of the two pins. The generated code then sends printf there (hal-generator.js stdioUart).
 * Changes `mcu` and returns it. */
export function consoleUart(mcu){
 const add=rustFn('console_uart',{family:mcu.family,pins:{PA2:mcu.pins.PA2,PA3:mcu.pins.PA3},peripherals:Object.fromEntries(Object.entries(mcu.peripherals).map(([id,p])=>[id,id==='USART2'?p:true]))});
 if(!add)return mcu;
 Object.assign(mcu.pins,add.pins);
 // In the order an .ioc import gives (the serial ports first, in the family's order), so export and import agree.
 mcu.peripherals=Object.fromEntries(add.order.map(id=>[id,id==='USART2'?add.usart:mcu.peripherals[id]]));
 return mcu;
}
/** The main.c of a project's settings: checked first (the problems are the error), split into main.c and the
 *  per-peripheral pairs' main when the settings ask for that. */
export const generateHal=(config,options)=>rustFn('generate_hal',config??null,!!options?.minimal,!!options?.legacyGpio);
