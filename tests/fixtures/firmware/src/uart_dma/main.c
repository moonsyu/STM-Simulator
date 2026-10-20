/* USART2 (ST-LINK VCP) DMA transmit + DMA receive of 5 bytes, then DMA echo. */
#include "fixture.h"

UART_HandleTypeDef huart2;
DMA_HandleTypeDef hdma_usart2_tx, hdma_usart2_rx;
static uint8_t rx[5];
static volatile uint32_t txDone, rxDone;

void Error_Handler(void) { __disable_irq(); while (1) { } }
int __io_putchar(int ch) { ITM_SendChar(ch); return ch; }
void SysTick_Handler(void) { HAL_IncTick(); }
void DMA1_Stream6_IRQHandler(void) { HAL_DMA_IRQHandler(&hdma_usart2_tx); }
void DMA1_Stream5_IRQHandler(void) { HAL_DMA_IRQHandler(&hdma_usart2_rx); }
void USART2_IRQHandler(void) { HAL_UART_IRQHandler(&huart2); }
void HAL_UART_TxCpltCallback(UART_HandleTypeDef *h) { (void)h; txDone++; }
void HAL_UART_RxCpltCallback(UART_HandleTypeDef *h) { (void)h; rxDone++; }

void HAL_UART_MspInit(UART_HandleTypeDef *h) {
  GPIO_InitTypeDef g = {0};
  __HAL_RCC_GPIOA_CLK_ENABLE(); __HAL_RCC_USART2_CLK_ENABLE(); __HAL_RCC_DMA1_CLK_ENABLE();
  g.Pin = GPIO_PIN_2 | GPIO_PIN_3; g.Mode = GPIO_MODE_AF_PP; g.Pull = GPIO_PULLUP; g.Speed = GPIO_SPEED_FREQ_VERY_HIGH; g.Alternate = GPIO_AF7_USART2;
  HAL_GPIO_Init(GPIOA, &g);
  hdma_usart2_tx.Instance = DMA1_Stream6; hdma_usart2_tx.Init.Channel = DMA_CHANNEL_4; hdma_usart2_tx.Init.Direction = DMA_MEMORY_TO_PERIPH;
  hdma_usart2_tx.Init.PeriphInc = DMA_PINC_DISABLE; hdma_usart2_tx.Init.MemInc = DMA_MINC_ENABLE;
  hdma_usart2_tx.Init.PeriphDataAlignment = DMA_PDATAALIGN_BYTE; hdma_usart2_tx.Init.MemDataAlignment = DMA_MDATAALIGN_BYTE;
  hdma_usart2_tx.Init.Mode = DMA_NORMAL; hdma_usart2_tx.Init.Priority = DMA_PRIORITY_LOW; hdma_usart2_tx.Init.FIFOMode = DMA_FIFOMODE_DISABLE;
  if (HAL_DMA_Init(&hdma_usart2_tx) != HAL_OK) Error_Handler();
  __HAL_LINKDMA(h, hdmatx, hdma_usart2_tx);
  hdma_usart2_rx.Instance = DMA1_Stream5; hdma_usart2_rx.Init = hdma_usart2_tx.Init; hdma_usart2_rx.Init.Direction = DMA_PERIPH_TO_MEMORY;
  if (HAL_DMA_Init(&hdma_usart2_rx) != HAL_OK) Error_Handler();
  __HAL_LINKDMA(h, hdmarx, hdma_usart2_rx);
  HAL_NVIC_SetPriority(DMA1_Stream5_IRQn, 1, 0); HAL_NVIC_EnableIRQ(DMA1_Stream5_IRQn);
  HAL_NVIC_SetPriority(DMA1_Stream6_IRQn, 1, 0); HAL_NVIC_EnableIRQ(DMA1_Stream6_IRQn);
  HAL_NVIC_SetPriority(USART2_IRQn, 2, 0); HAL_NVIC_EnableIRQ(USART2_IRQn);
}

int main(void) {
  HAL_Init();
  Fixture_ClockConfig();
  huart2.Instance = USART2; huart2.Init.BaudRate = 115200; huart2.Init.WordLength = UART_WORDLENGTH_8B; huart2.Init.StopBits = UART_STOPBITS_1;
  huart2.Init.Parity = UART_PARITY_NONE; huart2.Init.Mode = UART_MODE_TX_RX; huart2.Init.HwFlowCtl = UART_HWCONTROL_NONE; huart2.Init.OverSampling = UART_OVERSAMPLING_16;
  if (HAL_UART_Init(&huart2) != HAL_OK) Error_Handler();
  static uint8_t hello[] = "DMA hello\r\n";
  HAL_UART_Transmit_DMA(&huart2, hello, sizeof(hello) - 1);
  while (!txDone) { }
  printf("tx done\n");
  HAL_UART_Receive_DMA(&huart2, rx, sizeof(rx));
  while (!rxDone) { }
  printf("rx=%.5s\n", rx);
  HAL_UART_Transmit_DMA(&huart2, rx, sizeof(rx));
  while (txDone < 2) { }
  printf("echo done\n");
  while (1) { HAL_Delay(10); }
}
