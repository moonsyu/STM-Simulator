#include "main.h"
#include <stdio.h>
// USART2 PA2(TX)/PA3(RX), 9600 baud · 별도 부품·배선 없이 하단 통신 탭 ST-LINK VCP에서 송수신·인터럽트 에코
uint8_t rx[1];
#include <stdio.h>

/* Copy this main.c into a CubeIDE STM32F446RE project with matching
 * pin / peripheral / NVIC settings and Cube-generated IRQ / MSP files.
 * Clock: HSI PLL, APB1 timer clock = 84000000 Hz.
 * printf: SWV ITM port 0 (enable SWV in the debugger). UART uses its pins.
 * With newlib-nano, enable -u _printf_float for floating-point printf. */

UART_HandleTypeDef huart2;

void SystemClock_Config(void);
void Error_Handler(void);
static void MX_GPIO_Init(void);
static void MX_USART2_UART_Init(void);

int main(void) {
  HAL_Init();
  SystemClock_Config();
  MX_GPIO_Init();
  MX_USART2_UART_Init();
  /* USER CODE BEGIN 2 */
  uint8_t message[] = "HAL UART ready\r\n";
  HAL_UART_Transmit(&huart2, message, sizeof(message)-1, 100);
  HAL_UART_Receive_IT(&huart2, rx, 1);
    /* USER CODE END 2 */
  while (1) {
    /* USER CODE BEGIN 3 */
    HAL_Delay(10);
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
  GPIO_InitStruct.Pin = GPIO_PIN_2;
  GPIO_InitStruct.Mode = GPIO_MODE_AF_PP;
  GPIO_InitStruct.Pull = GPIO_NOPULL;
  GPIO_InitStruct.Speed = GPIO_SPEED_FREQ_VERY_HIGH;
  GPIO_InitStruct.Alternate = GPIO_AF7_USART2;
  HAL_GPIO_Init(GPIOA, &GPIO_InitStruct);
  GPIO_InitStruct.Pin = GPIO_PIN_3;
  GPIO_InitStruct.Mode = GPIO_MODE_AF_PP;
  GPIO_InitStruct.Pull = GPIO_NOPULL;
  GPIO_InitStruct.Speed = GPIO_SPEED_FREQ_VERY_HIGH;
  GPIO_InitStruct.Alternate = GPIO_AF7_USART2;
  HAL_GPIO_Init(GPIOA, &GPIO_InitStruct);
  HAL_NVIC_SetPriority(USART2_IRQn, 0, 0);
  HAL_NVIC_EnableIRQ(USART2_IRQn);
}

static void MX_USART2_UART_Init(void) {
  __HAL_RCC_USART2_CLK_ENABLE();
  huart2.Instance = USART2;
  huart2.Init.BaudRate = 9600;
  huart2.Init.WordLength = UART_WORDLENGTH_8B;
  huart2.Init.StopBits = UART_STOPBITS_1;
  huart2.Init.Parity = UART_PARITY_NONE;
  huart2.Init.Mode = UART_MODE_TX_RX;
  huart2.Init.HwFlowCtl = UART_HWCONTROL_NONE;
  huart2.Init.OverSampling = UART_OVERSAMPLING_16;
  HAL_UART_Init(&huart2);
}

void HAL_UART_RxCpltCallback(UART_HandleTypeDef *huart) {
  HAL_UART_Transmit_IT(huart, rx, 1);
  HAL_UART_Receive_IT(huart, rx, 1);
}

int __io_putchar(int ch) {
  ITM_SendChar(ch);
  return ch;
}

void Error_Handler(void) {
  __disable_irq();
  while (1) { }
}
