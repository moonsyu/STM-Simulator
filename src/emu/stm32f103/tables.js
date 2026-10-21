// STM32F103RB (medium-density, LQFP64) constant tables: register block addresses (RM0008 3.3),
// AFIO pin remapping (RM0008 9.3) and DMA1 request mapping (RM0008 table 78).
// The IRQ numbers of the peripherals modeled here are the same as on the STM32F446, so the shared
// peripheral models keep using the F4 IRQ table; only DMA1 channels map to their own lines.

export const BASES = {
  TIM2: 0x40000000, TIM3: 0x40000400, TIM4: 0x40000800, RTC: 0x40002800, WWDG: 0x40002c00, IWDG: 0x40003000,
  SPI2: 0x40003800, USART2: 0x40004400, USART3: 0x40004800, I2C1: 0x40005400, I2C2: 0x40005800, CAN1: 0x40006400,
  BKP: 0x40006c00, PWR: 0x40007000, AFIO: 0x40010000, EXTI: 0x40010400,
  GPIOA: 0x40010800, GPIOB: 0x40010c00, GPIOC: 0x40011000, GPIOD: 0x40011400, GPIOE: 0x40011800,
  ADC1: 0x40012400, ADC2: 0x40012800, TIM1: 0x40012c00, SPI1: 0x40013000, USART1: 0x40013800,
  DMA1: 0x40020000, RCC: 0x40021000, FLASH: 0x40022000, CRC: 0x40023000, DBGMCU: 0xe0042000,
};
export const DMA1_IRQ_BASE = 11; // DMA1_Channel1_IRQn

// MAPR field -> option -> {signal: pin}. Options a 64-pin package cannot route (port D/E) are left out,
// so selecting them disconnects the signals as on a board without those pins.
const REMAPS = [
  { shift: 0, width: 1, options: [{ SPI1_NSS: 'PA4', SPI1_SCK: 'PA5', SPI1_MISO: 'PA6', SPI1_MOSI: 'PA7' }, { SPI1_NSS: 'PA15', SPI1_SCK: 'PB3', SPI1_MISO: 'PB4', SPI1_MOSI: 'PB5' }] },
  { shift: 1, width: 1, options: [{ I2C1_SCL: 'PB6', I2C1_SDA: 'PB7', I2C1_SMBA: 'PB5' }, { I2C1_SCL: 'PB8', I2C1_SDA: 'PB9', I2C1_SMBA: 'PB5' }] },
  { shift: 2, width: 1, options: [{ USART1_TX: 'PA9', USART1_RX: 'PA10' }, { USART1_TX: 'PB6', USART1_RX: 'PB7' }] },
  { shift: 3, width: 1, options: [{ USART2_CTS: 'PA0', USART2_RTS: 'PA1', USART2_TX: 'PA2', USART2_RX: 'PA3', USART2_CK: 'PA4' }, {}] },
  { shift: 4, width: 2, options: [{ USART3_TX: 'PB10', USART3_RX: 'PB11', USART3_CK: 'PB12', USART3_CTS: 'PB13', USART3_RTS: 'PB14' }, { USART3_TX: 'PC10', USART3_RX: 'PC11', USART3_CK: 'PC12', USART3_CTS: 'PB13', USART3_RTS: 'PB14' }, {}, {}] },
  { shift: 6, width: 2, options: [
    { TIM1_ETR: 'PA12', TIM1_CH1: 'PA8', TIM1_CH2: 'PA9', TIM1_CH3: 'PA10', TIM1_CH4: 'PA11', TIM1_BKIN: 'PB12', TIM1_CH1N: 'PB13', TIM1_CH2N: 'PB14', TIM1_CH3N: 'PB15' },
    { TIM1_ETR: 'PA12', TIM1_CH1: 'PA8', TIM1_CH2: 'PA9', TIM1_CH3: 'PA10', TIM1_CH4: 'PA11', TIM1_BKIN: 'PA6', TIM1_CH1N: 'PA7', TIM1_CH2N: 'PB0', TIM1_CH3N: 'PB1' }, {}, {}] },
  { shift: 8, width: 2, options: [
    { TIM2_CH1: 'PA0', TIM2_ETR: 'PA0', TIM2_CH2: 'PA1', TIM2_CH3: 'PA2', TIM2_CH4: 'PA3' }, { TIM2_CH1: 'PA15', TIM2_ETR: 'PA15', TIM2_CH2: 'PB3', TIM2_CH3: 'PA2', TIM2_CH4: 'PA3' },
    { TIM2_CH1: 'PA0', TIM2_ETR: 'PA0', TIM2_CH2: 'PA1', TIM2_CH3: 'PB10', TIM2_CH4: 'PB11' }, { TIM2_CH1: 'PA15', TIM2_ETR: 'PA15', TIM2_CH2: 'PB3', TIM2_CH3: 'PB10', TIM2_CH4: 'PB11' }] },
  { shift: 10, width: 2, options: [
    { TIM3_CH1: 'PA6', TIM3_CH2: 'PA7', TIM3_CH3: 'PB0', TIM3_CH4: 'PB1' }, {},
    { TIM3_CH1: 'PB4', TIM3_CH2: 'PB5', TIM3_CH3: 'PB0', TIM3_CH4: 'PB1' }, { TIM3_CH1: 'PC6', TIM3_CH2: 'PC7', TIM3_CH3: 'PC8', TIM3_CH4: 'PC9' }] },
  { shift: 12, width: 1, options: [{ TIM4_CH1: 'PB6', TIM4_CH2: 'PB7', TIM4_CH3: 'PB8', TIM4_CH4: 'PB9' }, {}] },
  { shift: 13, width: 2, options: [{ CAN1_RX: 'PA11', CAN1_TX: 'PA12' }, {}, { CAN1_RX: 'PB8', CAN1_TX: 'PB9' }, { CAN1_RX: 'PD0', CAN1_TX: 'PD1' }] },
];
// Signals without a remap option.
const FIXED = {
  MCO1: 'PA8', USART1_CK: 'PA8', USART1_CTS: 'PA11', USART1_RTS: 'PA12', TIM3_ETR: 'PD2',
  SPI2_NSS: 'PB12', SPI2_SCK: 'PB13', SPI2_MISO: 'PB14', SPI2_MOSI: 'PB15', I2C2_SCL: 'PB10', I2C2_SDA: 'PB11', I2C2_SMBA: 'PB12',
};
/** {signal: pin} for the current AFIO_MAPR value. */
export function signalPins(mapr) {
  const out = { ...FIXED };
  for (const r of REMAPS) Object.assign(out, r.options[(mapr >>> r.shift) & ((1 << r.width) - 1)] ?? {});
  return out;
}
/** Signals that can reach `pin` with the current MAPR, in table order. */
export function pinSignals(mapr, pin) { return Object.entries(signalPins(mapr)).filter(([, p]) => p === pin).map(([s]) => s); }

// Requests wired to each DMA1 channel (index 0 = channel 1); requests on one channel are ORed.
export const DMA1_REQUESTS = [
  ['ADC1', 'TIM2_CH3', 'TIM4_CH1'],
  ['SPI1_RX', 'USART3_TX', 'TIM1_CH1', 'TIM2_UP', 'TIM3_CH3'],
  ['SPI1_TX', 'USART3_RX', 'TIM1_CH2', 'TIM3_CH4', 'TIM3_UP'],
  ['SPI2_RX', 'USART1_TX', 'I2C2_TX', 'TIM1_CH4', 'TIM1_TRIG', 'TIM1_COM', 'TIM4_CH2'],
  ['SPI2_TX', 'USART1_RX', 'I2C2_RX', 'TIM1_UP', 'TIM2_CH1', 'TIM4_CH3'],
  ['USART2_RX', 'I2C1_TX', 'TIM1_CH3', 'TIM3_CH1', 'TIM3_TRIG'],
  ['USART2_TX', 'I2C1_RX', 'TIM2_CH2', 'TIM2_CH4', 'TIM4_UP'],
];
