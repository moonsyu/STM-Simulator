// Per-MCU-family profiles. `mcu.family` in a project selects one; the F4 profile is the original
// STM32F446RE model and the F1 profile describes the STM32F103RB (NUCLEO-F103RB).
// Everything that differs between the two (pin routes, how a pin gets an alternate function, IRQ names and
// numbers, DMA units, clocks, GPIO set) lives here so the Pinout, validator, generator and interpreter share it.
import {SERIAL_ROUTES} from './serial-config.js';
import {TIMER_ROUTES} from './timer-config.js';
import {GPIO_PINS} from './pins.js';

const adcRoutes=pins=>Object.fromEntries(pins.map((p,i)=>['IN'+i,[p]]));
const ADC_PINS=['PA0','PA1','PA2','PA3','PA4','PA5','PA6','PA7','PB0','PB1','PC0','PC1','PC2','PC3','PC4','PC5'];
const EXTI_IRQS=['EXTI0_IRQn','EXTI1_IRQn','EXTI2_IRQn','EXTI3_IRQn','EXTI4_IRQn','EXTI9_5_IRQn','EXTI15_10_IRQn'];
const channelsOf=(unit,n)=>Array.from({length:n},(_,i)=>`${unit}_Channel${i+1}`);

// ---------- STM32F446RE (DS10693 / RM0390) ----------
const F4_DMA_STREAMS=['DMA1','DMA2'].flatMap(d=>Array.from({length:8},(_,i)=>`${d}_Stream${i}`));
const F4={
  id:'STM32F446RE',series:'STM32F4',core:'Cortex-M4',fpu:true,flashKB:512,ramKB:128,
  serial:SERIAL_ROUTES,
  usartCk:{USART1:['PA8'],USART2:['PA4'],USART3:['PB12','PC12'],USART6:['PC8']},
  timers:TIMER_ROUTES,
  extra:{I2C1:{SCL:['PB6','PB8'],SDA:['PB7','PB9']},SDIO:{D0:['PC8'],D1:['PC9'],D2:['PC10'],D3:['PC11'],CK:['PC12'],CMD:['PD2']},DCMI:{},
    SPI1:{SCK:['PA5','PB3'],MISO:['PA6','PB4'],MOSI:['PA7','PB5']},ADC1:adcRoutes(ADC_PINS)},
  // Alternate functions are selected per pin with GPIO_InitStruct.Alternate.
  pinMux:'af',
  timerMax:id=>['TIM2','TIM5'].includes(id)?4294967295:65535,
  dmaUnits:F4_DMA_STREAMS,
  irqExtra:['ADC_IRQn','SPI1_IRQn','I2C1_EV_IRQn','I2C1_ER_IRQn','DCMI_IRQn','SDIO_IRQn',...F4_DMA_STREAMS.map(s=>s+'_IRQn')],
  gpioPins:GPIO_PINS,ports:['A','B','C','D','H'],
  // HSI 16 MHz without PLL; examples run the timers at 84 MHz through the PLL.
  clock:{defaultHz:16000000,exampleHz:84000000,minHz:1000000,maxHz:180000000,label:'1~180 MHz',valid:hz=>Number.isInteger(hz)&&hz>=1000000&&hz<=180000000},
  hal:{prefix:'stm32f4xx',define:'STM32F446xx'}
};

// ---------- STM32F103RB (DS5319 / RM0008) ----------
// The F1 has no per-pin AF selector: each peripheral uses its default pins or one AFIO remap that moves its
// signals together. A configuration is valid only when every signal of a peripheral matches one remap option.
const F1_REMAPS={
  USART1:[{pins:{TX:'PA9',RX:'PA10'}},{macro:'__HAL_AFIO_REMAP_USART1_ENABLE',pins:{TX:'PB6',RX:'PB7'}}],
  USART3:[{pins:{TX:'PB10',RX:'PB11',CK:'PB12'}},{macro:'__HAL_AFIO_REMAP_USART3_PARTIAL',pins:{TX:'PC10',RX:'PC11',CK:'PC12'}}],
  I2C1:[{pins:{SCL:'PB6',SDA:'PB7'}},{macro:'__HAL_AFIO_REMAP_I2C1_ENABLE',pins:{SCL:'PB8',SDA:'PB9'}}],
  SPI1:[{pins:{SCK:'PA5',MISO:'PA6',MOSI:'PA7'}},{macro:'__HAL_AFIO_REMAP_SPI1_ENABLE',pins:{SCK:'PB3',MISO:'PB4',MOSI:'PB5'}}],
  TIM2:[{pins:{CH1:'PA0',CH2:'PA1',CH3:'PA2',CH4:'PA3'}},{macro:'__HAL_AFIO_REMAP_TIM2_PARTIAL_1',pins:{CH1:'PA15',CH2:'PB3',CH3:'PA2',CH4:'PA3'}},
    {macro:'__HAL_AFIO_REMAP_TIM2_PARTIAL_2',pins:{CH1:'PA0',CH2:'PA1',CH3:'PB10',CH4:'PB11'}},{macro:'__HAL_AFIO_REMAP_TIM2_ENABLE',pins:{CH1:'PA15',CH2:'PB3',CH3:'PB10',CH4:'PB11'}}],
  TIM3:[{pins:{CH1:'PA6',CH2:'PA7',CH3:'PB0',CH4:'PB1'}},{macro:'__HAL_AFIO_REMAP_TIM3_PARTIAL',pins:{CH1:'PB4',CH2:'PB5',CH3:'PB0',CH4:'PB1'}},
    {macro:'__HAL_AFIO_REMAP_TIM3_ENABLE',pins:{CH1:'PC6',CH2:'PC7',CH3:'PC8',CH4:'PC9'}}],
  TIM4:[{pins:{CH1:'PB6',CH2:'PB7',CH3:'PB8',CH4:'PB9'}}],
  USART2:[{pins:{TX:'PA2',RX:'PA3',CK:'PA4'}}]
};
const routesFromRemaps=id=>{const out={};for(const option of F1_REMAPS[id])for(const [signal,pin]of Object.entries(option.pins))if(signal!=='CK')(out[signal]??=[]).includes(pin)||out[signal].push(pin);return out;};
// RM0008 table 78: each request is wired to one DMA1 channel; memory-to-memory may use any channel.
const F1_DMA_CHANNELS=channelsOf('DMA1',7);
const F1_DMA_REQUESTS={
  ADC1:1,TIM2_CH3:1,TIM4_CH1:1,SPI1_RX:2,USART3_TX:2,TIM3_CH3:2,SPI1_TX:3,USART3_RX:3,TIM3_CH4:3,USART1_TX:4,TIM4_CH2:4,
  USART1_RX:5,TIM2_CH1:5,TIM4_CH3:5,USART2_RX:6,I2C1_TX:6,TIM3_CH1:6,USART2_TX:7,I2C1_RX:7,TIM2_CH2:7,TIM2_CH4:7
};
// F103 vector table (RM0008 table 63) for the peripherals the simulator models.
const F1_IRQ_NUMBERS={WWDG_IRQn:0,PVD_IRQn:1,TAMPER_IRQn:2,RTC_IRQn:3,FLASH_IRQn:4,RCC_IRQn:5,EXTI0_IRQn:6,EXTI1_IRQn:7,EXTI2_IRQn:8,EXTI3_IRQn:9,EXTI4_IRQn:10,
  ...Object.fromEntries(F1_DMA_CHANNELS.map((c,i)=>[c+'_IRQn',11+i])),ADC1_2_IRQn:18,USB_HP_CAN1_TX_IRQn:19,USB_LP_CAN1_RX0_IRQn:20,CAN1_RX1_IRQn:21,CAN1_SCE_IRQn:22,EXTI9_5_IRQn:23,
  TIM1_BRK_IRQn:24,TIM1_UP_IRQn:25,TIM1_TRG_COM_IRQn:26,TIM1_CC_IRQn:27,TIM2_IRQn:28,TIM3_IRQn:29,TIM4_IRQn:30,I2C1_EV_IRQn:31,I2C1_ER_IRQn:32,I2C2_EV_IRQn:33,I2C2_ER_IRQn:34,
  SPI1_IRQn:35,SPI2_IRQn:36,USART1_IRQn:37,USART2_IRQn:38,USART3_IRQn:39,EXTI15_10_IRQn:40,RTC_Alarm_IRQn:41,USBWakeUp_IRQn:42};
const F1={
  id:'STM32F103RB',series:'STM32F1',core:'Cortex-M3',fpu:false,flashKB:128,ramKB:20,
  serial:{USART1:routesFromRemaps('USART1'),USART2:routesFromRemaps('USART2'),USART3:routesFromRemaps('USART3')},
  usartCk:{USART1:['PA8'],USART2:['PA4'],USART3:['PB12','PC12']},
  timers:{TIM2:routesFromRemaps('TIM2'),TIM3:routesFromRemaps('TIM3'),TIM4:routesFromRemaps('TIM4')},
  extra:{I2C1:routesFromRemaps('I2C1'),SPI1:routesFromRemaps('SPI1'),ADC1:adcRoutes(ADC_PINS)},
  pinMux:'remap',remaps:F1_REMAPS,
  // PA15/PB3/PB4 are JTAG pins after reset; using them needs __HAL_AFIO_REMAP_SWJ_NOJTAG() (SWD stays on).
  jtagPins:['PA15','PB3','PB4'],
  timerMax:()=>65535,
  dmaUnits:F1_DMA_CHANNELS,dmaRequests:{...Object.fromEntries(Object.entries(F1_DMA_REQUESTS).map(([r,c])=>[r,[[`DMA1_Channel${c}`,null]]])),MEMTOMEM:F1_DMA_CHANNELS.map(c=>[c,null])},
  irqExtra:['ADC1_2_IRQn','SPI1_IRQn','I2C1_EV_IRQn','I2C1_ER_IRQn',...F1_DMA_CHANNELS.map(c=>c+'_IRQn')],irqNumbers:F1_IRQ_NUMBERS,
  // Same MB1136 board: CN7-29/31 carry PD0/PD1 (no port H) and CN10-18 is PB11.
  gpioPins:[...GPIO_PINS.filter(p=>!/^PH/.test(p)),'PB11','PD0','PD1'].sort(),ports:['A','B','C','D'],
  // HSI 8 MHz without PLL; with the PLL, SYSCLK = HSI/2 × PLLMUL (2..16) = 8..64 MHz in 4 MHz steps.
  // APB1 is limited to 36 MHz, so above that it runs at SYSCLK/2 and the timers get ×2: timer clock = SYSCLK.
  clock:{defaultHz:8000000,exampleHz:64000000,minHz:8000000,maxHz:64000000,label:'8~64 MHz (4 MHz 단위)',valid:hz=>Number.isInteger(hz)&&hz>=8000000&&hz<=64000000&&hz%4000000===0},
  hal:{prefix:'stm32f1xx',define:'STM32F103xB'}
};

export const FAMILIES=Object.freeze({[F4.id]:F4,[F1.id]:F1});
export const DEFAULT_FAMILY=F4.id;
export function familyProfile(id=DEFAULT_FAMILY){const f=FAMILIES[id];if(!f)throw new Error(`지원하지 않는 MCU입니다: ${id}`);return f;}
const cache=new Map();
/** Pin routes of every peripheral of a family, as {PERIPHERAL:{SIGNAL:[pins]}}. */
export function routesOf(id=DEFAULT_FAMILY){
  if(!cache.has(id)){const f=familyProfile(id);cache.set(id,Object.freeze({...f.serial,...f.extra,...f.timers}));}
  return cache.get(id);
}
export const serialIdsOf=id=>Object.keys(familyProfile(id).serial);
export const timerIdsOf=id=>Object.keys(familyProfile(id).timers);
export const irqNamesOf=id=>{const f=familyProfile(id);return [...EXTI_IRQS,...serialIdsOf(id).map(s=>s+'_IRQn'),...timerIdsOf(id).map(t=>t+'_IRQn'),...f.irqExtra];};
/** F1: the remap option a peripheral's assigned signals select, or null when the pins mix options. */
export function remapFor(id,peripheral,assigned){
  const f=familyProfile(id);if(f.pinMux!=='remap'||!f.remaps[peripheral])return f.remaps?.[peripheral]?.[0]??null;
  // A signal the option does not list (USART1_CK on PA8) is not moved by that remap.
  return f.remaps[peripheral].find(o=>Object.entries(assigned).every(([signal,pin])=>!(signal in o.pins)||o.pins[signal]===pin))??null;
}
