// GPIO settings as CubeMX's GPIO table shows them: GPIO mode (push-pull / open-drain output), pull and maximum
// output speed. Defaults follow CubeMX (db GPIO-STM32F446/F103 modes): outputs and timer channels Low,
// communication pins (USART/SPI/I2C/SDIO) Very High (F1: High, its top speed).
import {serialFunction} from './serial-config.js';
export const GPIO_SPEEDS=['LOW','MEDIUM','HIGH','VERY_HIGH'];
export const speedsOf=f1=>f1?GPIO_SPEEDS.slice(0,3):GPIO_SPEEDS;
export const SPEED_NAMES={LOW:'Low',MEDIUM:'Medium',HIGH:'High',VERY_HIGH:'Very High'};
export const defaultSpeed=(fn,f1)=>fn==='GPIO_Output'||/^TIM\d+_CH\d$/.test(fn)?'LOW':f1?'HIGH':'VERY_HIGH';
export const pinSpeed=(p,f1)=>p.speed??defaultSpeed(p.function,f1);
// HAL GPIO_MODE_x of a configured pin (without the GPIO_MODE_ prefix).
export function gpioMode(p,config,f1){
  if(p.function==='GPIO_Output')return p.outputType==='OD'?'OUTPUT_OD':'OUTPUT_PP';
  if(p.function==='GPIO_EXTI')return `IT_${p.edge==='CHANGE'?'RISING_FALLING':p.edge}`;
  if(p.function==='Analog'||p.function.startsWith('ADC1_')||p.function.startsWith('DAC_'))return 'ANALOG';
  // F1 peripheral inputs (UART RX, SPI MISO, timer capture/encoder channels) are plain inputs.
  const afInput=f1&&(/_RX$|^SPI[123]_MISO$/.test(p.function)||/^TIM\d_CH\d$/.test(p.function)&&['capture','encoder'].includes(config.peripherals[p.function.split('_')[0]]?.mode));
  if(p.function==='GPIO_Input'||afInput)return 'INPUT';
  return /^I2C[123]_/.test(p.function)?'AF_OD':'AF_PP';
}
// CubeMX writes Speed only for outputs and alternate functions.
export const hasSpeed=mode=>mode.startsWith('OUTPUT')||mode.startsWith('AF_');
// CubeMX signal names for the pin click menu and the pin tiles.
export const signalName=(fn,pin)=>fn==='Reset'?'Reset_State':fn==='Analog'?'GPIO_Analog':fn==='GPIO_EXTI'?'GPIO_EXTI'+Number(pin.slice(2)):fn;
export const isCommSignal=fn=>!!serialFunction(fn)||/^(I2C[123]|SPI[123]|SDIO)_/.test(fn);
