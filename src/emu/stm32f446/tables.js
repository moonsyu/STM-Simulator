// STM32F446RE (LQFP64) constant tables: IRQ numbers (CMSIS stm32f446xx.h),
// alternate functions (DS10693 Table 11) and DMA request mapping (RM0390 9.3.3).

export const IRQ = Object.freeze({
  WWDG: 0, PVD: 1, TAMP_STAMP: 2, RTC_WKUP: 3, FLASH: 4, RCC: 5, EXTI0: 6, EXTI1: 7, EXTI2: 8, EXTI3: 9, EXTI4: 10,
  DMA1_Stream0: 11, DMA1_Stream1: 12, DMA1_Stream2: 13, DMA1_Stream3: 14, DMA1_Stream4: 15, DMA1_Stream5: 16, DMA1_Stream6: 17,
  ADC: 18, CAN1_TX: 19, CAN1_RX0: 20, CAN1_RX1: 21, CAN1_SCE: 22, EXTI9_5: 23, TIM1_BRK_TIM9: 24, TIM1_UP_TIM10: 25,
  TIM1_TRG_COM_TIM11: 26, TIM1_CC: 27, TIM2: 28, TIM3: 29, TIM4: 30, I2C1_EV: 31, I2C1_ER: 32, I2C2_EV: 33, I2C2_ER: 34,
  SPI1: 35, SPI2: 36, USART1: 37, USART2: 38, USART3: 39, EXTI15_10: 40, RTC_Alarm: 41, OTG_FS_WKUP: 42,
  TIM8_BRK_TIM12: 43, TIM8_UP_TIM13: 44, TIM8_TRG_COM_TIM14: 45, TIM8_CC: 46, DMA1_Stream7: 47, FMC: 48, SDIO: 49,
  TIM5: 50, SPI3: 51, UART4: 52, UART5: 53, TIM6_DAC: 54, TIM7: 55, DMA2_Stream0: 56, DMA2_Stream1: 57, DMA2_Stream2: 58,
  DMA2_Stream3: 59, DMA2_Stream4: 60, CAN2_TX: 63, CAN2_RX0: 64, CAN2_RX1: 65, CAN2_SCE: 66, OTG_FS: 67,
  DMA2_Stream5: 68, DMA2_Stream6: 69, DMA2_Stream7: 70, USART6: 71, I2C3_EV: 72, I2C3_ER: 73, DCMI: 78, FPU: 81,
  SPI4: 84, SAI1: 87, SAI2: 91, QUADSPI: 92, CEC: 93, SPDIF_RX: 94, FMPI2C1_EV: 95, FMPI2C1_ER: 96,
});

// pin -> {af: signal}. Signals use `<PERIPH>_<ROLE>` names.
const AF = {
  PA0: { 1: 'TIM2_CH1', 2: 'TIM5_CH1', 3: 'TIM8_ETR', 7: 'USART2_CTS', 8: 'UART4_TX' },
  PA1: { 1: 'TIM2_CH2', 2: 'TIM5_CH2', 5: 'SPI4_MOSI', 7: 'USART2_RTS', 8: 'UART4_RX' },
  PA2: { 1: 'TIM2_CH3', 2: 'TIM5_CH3', 3: 'TIM9_CH1', 7: 'USART2_TX' },
  PA3: { 1: 'TIM2_CH4', 2: 'TIM5_CH4', 3: 'TIM9_CH2', 7: 'USART2_RX' },
  PA4: { 5: 'SPI1_NSS', 6: 'SPI3_NSS', 7: 'USART2_CK', 13: 'DCMI_HSYNC' },
  PA5: { 1: 'TIM2_CH1', 3: 'TIM8_CH1N', 5: 'SPI1_SCK' },
  PA6: { 1: 'TIM1_BKIN', 2: 'TIM3_CH1', 3: 'TIM8_BKIN', 5: 'SPI1_MISO', 9: 'TIM13_CH1', 13: 'DCMI_PIXCLK' },
  PA7: { 1: 'TIM1_CH1N', 2: 'TIM3_CH2', 3: 'TIM8_CH1N', 5: 'SPI1_MOSI', 9: 'TIM14_CH1' },
  PA8: { 0: 'MCO1', 1: 'TIM1_CH1', 4: 'I2C3_SCL', 7: 'USART1_CK' },
  PA9: { 1: 'TIM1_CH2', 5: 'SPI2_SCK', 7: 'USART1_TX', 13: 'DCMI_D0' },
  PA10: { 1: 'TIM1_CH3', 7: 'USART1_RX', 13: 'DCMI_D1' },
  PA11: { 1: 'TIM1_CH4', 7: 'USART1_CTS', 9: 'CAN1_RX' },
  PA12: { 1: 'TIM1_ETR', 7: 'USART1_RTS', 9: 'CAN1_TX' },
  PA13: { 0: 'SWDIO' }, PA14: { 0: 'SWCLK' },
  PA15: { 0: 'JTDI', 1: 'TIM2_CH1', 5: 'SPI1_NSS', 6: 'SPI3_NSS', 8: 'UART4_RTS' },
  PB0: { 1: 'TIM1_CH2N', 2: 'TIM3_CH3', 3: 'TIM8_CH2N', 8: 'UART4_CTS' },
  PB1: { 1: 'TIM1_CH3N', 2: 'TIM3_CH4', 3: 'TIM8_CH3N' },
  PB2: { 7: 'SPI3_MOSI' },
  PB3: { 0: 'SWO', 1: 'TIM2_CH2', 4: 'I2C2_SDA', 5: 'SPI1_SCK', 6: 'SPI3_SCK' },
  PB4: { 0: 'NJTRST', 2: 'TIM3_CH1', 4: 'I2C3_SDA', 5: 'SPI1_MISO', 6: 'SPI3_MISO', 7: 'SPI2_NSS' },
  PB5: { 2: 'TIM3_CH2', 4: 'I2C1_SMBA', 5: 'SPI1_MOSI', 6: 'SPI3_MOSI', 9: 'CAN2_RX', 13: 'DCMI_D10' },
  PB6: { 2: 'TIM4_CH1', 4: 'I2C1_SCL', 7: 'USART1_TX', 9: 'CAN2_TX', 13: 'DCMI_D5' },
  PB7: { 2: 'TIM4_CH2', 4: 'I2C1_SDA', 7: 'USART1_RX', 13: 'DCMI_VSYNC' },
  PB8: { 2: 'TIM4_CH3', 3: 'TIM10_CH1', 4: 'I2C1_SCL', 9: 'CAN1_RX', 12: 'SDIO_D4', 13: 'DCMI_D6' },
  PB9: { 2: 'TIM4_CH4', 3: 'TIM11_CH1', 4: 'I2C1_SDA', 5: 'SPI2_NSS', 9: 'CAN1_TX', 12: 'SDIO_D5', 13: 'DCMI_D7' },
  PB10: { 1: 'TIM2_CH3', 4: 'I2C2_SCL', 5: 'SPI2_SCK', 7: 'USART3_TX' },
  PB12: { 1: 'TIM1_BKIN', 4: 'I2C2_SMBA', 5: 'SPI2_NSS', 6: 'SPI4_NSS', 7: 'SPI3_SCK', 9: 'CAN2_RX' },
  PB13: { 1: 'TIM1_CH1N', 5: 'SPI2_SCK', 6: 'SPI4_SCK', 9: 'CAN2_TX' },
  PB14: { 1: 'TIM1_CH2N', 3: 'TIM8_CH2N', 5: 'SPI2_MISO', 9: 'TIM12_CH1' },
  PB15: { 1: 'TIM1_CH3N', 3: 'TIM8_CH3N', 5: 'SPI2_MOSI', 9: 'TIM12_CH2' },
  PC1: { 5: 'SPI2_MOSI', 7: 'SPI3_MOSI' },
  PC2: { 5: 'SPI2_MISO' },
  PC3: { 5: 'SPI2_MOSI' },
  PC4: { 7: 'USART3_TX' }, PC5: { 7: 'USART3_RX' },
  PC6: { 2: 'TIM3_CH1', 3: 'TIM8_CH1', 8: 'USART6_TX', 12: 'SDIO_D6', 13: 'DCMI_D0' },
  PC7: { 2: 'TIM3_CH2', 3: 'TIM8_CH2', 5: 'SPI2_SCK', 8: 'USART6_RX', 12: 'SDIO_D7', 13: 'DCMI_D1' },
  PC8: { 2: 'TIM3_CH3', 3: 'TIM8_CH3', 8: 'USART6_CK', 12: 'SDIO_D0', 13: 'DCMI_D2' },
  PC9: { 0: 'MCO2', 2: 'TIM3_CH4', 3: 'TIM8_CH4', 4: 'I2C3_SDA', 12: 'SDIO_D1', 13: 'DCMI_D3' },
  PC10: { 6: 'SPI3_SCK', 7: 'USART3_TX', 8: 'UART4_TX', 12: 'SDIO_D2', 13: 'DCMI_D8' },
  PC11: { 6: 'SPI3_MISO', 7: 'USART3_RX', 8: 'UART4_RX', 12: 'SDIO_D3', 13: 'DCMI_D4' },
  PC12: { 6: 'SPI3_MOSI', 7: 'USART3_CK', 8: 'UART5_TX', 12: 'SDIO_CK', 13: 'DCMI_D9' },
  PD2: { 2: 'TIM3_ETR', 8: 'UART5_RX', 12: 'SDIO_CMD', 13: 'DCMI_D11' },
};
export const afSignal = (pin, af) => AF[pin]?.[af] ?? null;
export function afNumber(pin, signal) {
  const table = AF[pin]; if (!table) return null;
  for (const [n, s] of Object.entries(table)) if (s === signal) return Number(n);
  return null;
}
export const AF_TABLE = AF;

// [controller][stream][channel] -> request names (several requests may share one slot).
export const DMA_REQUESTS = {
  DMA1: [
    ['SPI3_RX', 'I2C1_RX', 'TIM4_CH1', 'I2S3_EXT_RX', 'UART5_RX', 'UART8_TX', 'TIM5_CH3 TIM5_UP', ''],
    ['SPDIFRX_DT', 'I2C3_RX', '', 'TIM2_UP TIM2_CH3', 'USART3_RX', 'UART7_TX', 'TIM5_CH4 TIM5_TRIG', 'TIM6_UP'],
    ['SPI3_RX', 'TIM7_UP', 'I2S3_EXT_RX', 'I2C3_RX', 'UART4_RX', 'TIM3_CH4 TIM3_UP', 'TIM5_CH1', 'I2C2_RX'],
    ['SPI2_RX', '', 'TIM4_CH2', 'I2S2_EXT_RX', 'USART3_TX', 'UART7_RX', 'TIM5_CH4 TIM5_TRIG', 'I2C2_RX'],
    ['SPI2_TX', 'TIM7_UP', 'I2S2_EXT_TX', 'I2C3_TX', 'UART4_TX', 'TIM3_CH1 TIM3_TRIG', 'TIM5_CH2', 'USART3_TX'],
    ['SPI3_TX', 'I2C1_RX', 'I2S3_EXT_TX', 'TIM2_CH1', 'USART2_RX', 'TIM3_CH2', '', 'DAC1'],
    ['SPDIFRX_CS', 'I2C1_TX', 'TIM4_UP', 'TIM2_CH2 TIM2_CH4', 'USART2_TX', 'UART8_RX', 'TIM5_UP', 'DAC2'],
    ['SPI3_TX', 'I2C1_TX', 'TIM4_CH3', 'TIM2_UP TIM2_CH4', 'UART5_TX', 'TIM3_CH3', '', 'I2C2_TX'],
  ],
  DMA2: [
    ['ADC1', '', 'ADC3', 'SPI1_RX', 'SPI4_RX', '', 'TIM1_TRIG', ''],
    ['SAI1_A', 'DCMI', 'ADC3', '', 'SPI4_TX', 'USART6_RX', 'TIM1_CH1', 'TIM8_UP'],
    ['TIM8_CH1 TIM8_CH2 TIM8_CH3', 'ADC2', '', 'SPI1_RX', 'USART1_RX', 'USART6_RX', 'TIM1_CH2', 'TIM8_CH1'],
    ['SAI1_A', 'ADC2', '', 'SPI1_TX', 'SDIO', 'SPI4_RX', 'TIM1_CH1', 'TIM8_CH2'],
    ['ADC1', 'SAI1_B', '', 'SAI2_A', '', 'SPI4_TX', 'TIM1_CH4 TIM1_TRIG TIM1_COM', 'TIM8_CH3'],
    ['SAI1_B', '', '', 'SPI1_TX', 'USART1_RX', '', 'TIM1_UP', ''],
    ['TIM1_CH1 TIM1_CH2 TIM1_CH3', '', '', 'SAI2_B', 'SDIO', 'USART6_TX', 'TIM1_CH3', ''],
    ['SAI2_B', 'DCMI', '', 'QUADSPI', 'USART1_TX', 'USART6_TX', '', 'TIM8_CH4 TIM8_TRIG TIM8_COM'],
  ],
};

// Board-level GPIO list (all 16 pins of A..C, PD2, PH0/1 exist on LQFP64).
export const PORTS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
export const pinName = (port, n) => `P${port}${n}`;
export function parsePin(pin) { const m = /^P([A-H])(\d+)$/.exec(pin); return m ? { port: m[1], n: Number(m[2]) } : null; }
