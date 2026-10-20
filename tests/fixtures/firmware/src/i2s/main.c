#include "main.h"
#include <stdio.h>

/* Copy this main.c into a CubeIDE STM32F446RE project with matching
 * pin / peripheral / NVIC settings and Cube-generated IRQ / MSP files.
 * Clock: HSI direct (PLL off), APB1 timer clock = 16000000 Hz.
 * printf: SWV ITM port 0 (enable SWV in the debugger). UART uses its pins.
 * With newlib-nano, enable -u _printf_float for floating-point printf. */


void SystemClock_Config(void);
void Error_Handler(void);
static void MX_GPIO_Init(void);

I2S_HandleTypeDef hi2s;

int main(void) {
  HAL_Init();
  SystemClock_Config();
  MX_GPIO_Init();
  /* USER CODE BEGIN 2 */
__HAL_RCC_SPI2_CLK_ENABLE();__HAL_RCC_GPIOB_CLK_ENABLE();RCC_PeriphCLKInitTypeDef clock={0};clock.PeriphClockSelection=RCC_PERIPHCLK_I2S_APB1;clock.PLLI2S.PLLI2SN=192;clock.PLLI2S.PLLI2SR=2;clock.PLLI2S.PLLI2SQ=2;clock.PLLI2SDivQ=1;clock.I2sApb1ClockSelection=RCC_I2SAPB1CLKSOURCE_PLLI2S;HAL_RCCEx_PeriphCLKConfig(&clock);
 GPIO_InitTypeDef pins={0};pins.Pin=GPIO_PIN_12|GPIO_PIN_13|GPIO_PIN_15;pins.Mode=GPIO_MODE_AF_PP;pins.Pull=GPIO_NOPULL;pins.Speed=GPIO_SPEED_FREQ_HIGH;pins.Alternate=GPIO_AF5_SPI2;HAL_GPIO_Init(GPIOB,&pins);
 hi2s.Instance=SPI2;hi2s.Init.Mode=I2S_MODE_MASTER_TX;hi2s.Init.Standard=I2S_STANDARD_PHILIPS;hi2s.Init.DataFormat=I2S_DATAFORMAT_16B;hi2s.Init.MCLKOutput=I2S_MCLKOUTPUT_DISABLE;hi2s.Init.AudioFreq=I2S_AUDIOFREQ_16K;hi2s.Init.CPOL=I2S_CPOL_LOW;hi2s.Init.ClockSource=I2S_CLOCK_PLL;hi2s.Init.FullDuplexMode=I2S_FULLDUPLEXMODE_DISABLE;if(HAL_I2S_Init(&hi2s)!=HAL_OK)Error_Handler();
  /* USER CODE END 2 */
  while (1) {
    /* USER CODE BEGIN 3 */
uint16_t samples[64]={0};for(uint32_t frame=0;frame<32;frame++){int16_t sample=(frame%16)<8?3000:-3000;samples[frame*2]=sample;samples[frame*2+1]=sample;}HAL_I2S_Transmit(&hi2s,samples,64,100);
/* USER CODE END 3 */
  }
}

void SystemClock_Config(void) {
  RCC_OscInitTypeDef osc = {0};
  RCC_ClkInitTypeDef clk = {0};
  __HAL_RCC_PWR_CLK_ENABLE();
  __HAL_PWR_VOLTAGESCALING_CONFIG(PWR_REGULATOR_VOLTAGE_SCALE1);
  osc.OscillatorType = RCC_OSCILLATORTYPE_HSI;
  osc.HSIState = RCC_HSI_ON;
  osc.HSICalibrationValue = RCC_HSICALIBRATION_DEFAULT;
  osc.PLL.PLLState = RCC_PLL_OFF;
  if (HAL_RCC_OscConfig(&osc) != HAL_OK) Error_Handler();
  clk.ClockType = RCC_CLOCKTYPE_HCLK | RCC_CLOCKTYPE_SYSCLK | RCC_CLOCKTYPE_PCLK1 | RCC_CLOCKTYPE_PCLK2;
  clk.SYSCLKSource = RCC_SYSCLKSOURCE_HSI;
  clk.AHBCLKDivider = RCC_SYSCLK_DIV1;
  clk.APB1CLKDivider = RCC_HCLK_DIV1;
  clk.APB2CLKDivider = RCC_HCLK_DIV1;
  if (HAL_RCC_ClockConfig(&clk, FLASH_LATENCY_0) != HAL_OK) Error_Handler();
}

static void MX_GPIO_Init(void) {
  GPIO_InitTypeDef GPIO_InitStruct = {0};
}

int __io_putchar(int ch) {
  ITM_SendChar(ch);
  return ch;
}

void Error_Handler(void) {
  __disable_irq();
  while (1) { }
}
