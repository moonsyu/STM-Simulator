#include "main.h"
#include <stdio.h>

/* Copy this main.c into a CubeIDE STM32F446RE project with matching
 * pin / peripheral / NVIC settings and Cube-generated IRQ / MSP files.
 * Clock: HSI PLL, APB1 timer clock = 84000000 Hz.
 * printf: SWV ITM port 0 (enable SWV in the debugger). UART uses its pins.
 * With newlib-nano, enable -u _printf_float for floating-point printf. */

TIM_HandleTypeDef htim4;

void SystemClock_Config(void);
void Error_Handler(void);
static void MX_GPIO_Init(void);
static void MX_TIM4_Init(void);


int main(void) {
  HAL_Init();
  SystemClock_Config();
  MX_GPIO_Init();
  MX_TIM4_Init();
  /* USER CODE BEGIN 2 */
  HAL_TIM_Encoder_Start(&htim4, TIM_CHANNEL_ALL);
    /* USER CODE END 2 */
  while (1) {
    /* USER CODE BEGIN 3 */
    int16_t edges = (int16_t)__HAL_TIM_GET_COUNTER(&htim4);
    printf("TIM4 encoder: count=%d edges=%d pressed=%u\n", edges/4, edges, !HAL_GPIO_ReadPin(GPIOA, GPIO_PIN_10));
    HAL_Delay(100);
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
  osc.PLL.PLLState = RCC_PLL_ON;
  osc.PLL.PLLSource = RCC_PLLSOURCE_HSI;
  osc.PLL.PLLM = 16;
  osc.PLL.PLLN = 336;
  osc.PLL.PLLP = RCC_PLLP_DIV4;
  osc.PLL.PLLQ = 7;
  if (HAL_RCC_OscConfig(&osc) != HAL_OK) Error_Handler();
  clk.ClockType = RCC_CLOCKTYPE_HCLK | RCC_CLOCKTYPE_SYSCLK | RCC_CLOCKTYPE_PCLK1 | RCC_CLOCKTYPE_PCLK2;
  clk.SYSCLKSource = RCC_SYSCLKSOURCE_PLLCLK;
  clk.AHBCLKDivider = RCC_SYSCLK_DIV1;
  clk.APB1CLKDivider = RCC_HCLK_DIV2;
  clk.APB2CLKDivider = RCC_HCLK_DIV1;
  if (HAL_RCC_ClockConfig(&clk, FLASH_LATENCY_2) != HAL_OK) Error_Handler();
}

static void MX_GPIO_Init(void) {
  GPIO_InitTypeDef GPIO_InitStruct = {0};
  __HAL_RCC_GPIOA_CLK_ENABLE();
  __HAL_RCC_GPIOB_CLK_ENABLE();
  GPIO_InitStruct.Pin = GPIO_PIN_10;
  GPIO_InitStruct.Mode = GPIO_MODE_INPUT;
  GPIO_InitStruct.Pull = GPIO_PULLUP;
  GPIO_InitStruct.Speed = GPIO_SPEED_FREQ_VERY_HIGH;
  HAL_GPIO_Init(GPIOA, &GPIO_InitStruct);
  GPIO_InitStruct.Pin = GPIO_PIN_6;
  GPIO_InitStruct.Mode = GPIO_MODE_AF_PP;
  GPIO_InitStruct.Pull = GPIO_NOPULL;
  GPIO_InitStruct.Speed = GPIO_SPEED_FREQ_VERY_HIGH;
  GPIO_InitStruct.Alternate = GPIO_AF2_TIM4;
  HAL_GPIO_Init(GPIOB, &GPIO_InitStruct);
  GPIO_InitStruct.Pin = GPIO_PIN_7;
  GPIO_InitStruct.Mode = GPIO_MODE_AF_PP;
  GPIO_InitStruct.Pull = GPIO_NOPULL;
  GPIO_InitStruct.Speed = GPIO_SPEED_FREQ_VERY_HIGH;
  GPIO_InitStruct.Alternate = GPIO_AF2_TIM4;
  HAL_GPIO_Init(GPIOB, &GPIO_InitStruct);
}

static void MX_TIM4_Init(void) {
  __HAL_RCC_TIM4_CLK_ENABLE();
  htim4.Instance = TIM4;
  htim4.Init.Prescaler = 0;
  htim4.Init.CounterMode = TIM_COUNTERMODE_UP;
  htim4.Init.Period = 65535;
  htim4.Init.ClockDivision = TIM_CLOCKDIVISION_DIV1;
  htim4.Init.AutoReloadPreload = TIM_AUTORELOAD_PRELOAD_DISABLE;
  TIM_Encoder_InitTypeDef encoder = {0};
  encoder.EncoderMode = TIM_ENCODERMODE_TI12;
  encoder.IC1Polarity = TIM_ICPOLARITY_RISING;
  encoder.IC1Selection = TIM_ICSELECTION_DIRECTTI;
  encoder.IC1Prescaler = TIM_ICPSC_DIV1;
  encoder.IC1Filter = 0;
  encoder.IC2Polarity = TIM_ICPOLARITY_RISING;
  encoder.IC2Selection = TIM_ICSELECTION_DIRECTTI;
  encoder.IC2Prescaler = TIM_ICPSC_DIV1;
  encoder.IC2Filter = 0;
  HAL_TIM_Encoder_Init(&htim4, &encoder);
}

void HAL_TIM_PeriodElapsedCallback(TIM_HandleTypeDef *htim) {
  /* 타이머 주기 인터럽트 */
}

int __io_putchar(int ch) {
  ITM_SendChar(ch);
  return ch;
}

void Error_Handler(void) {
  __disable_irq();
  while (1) { }
}
