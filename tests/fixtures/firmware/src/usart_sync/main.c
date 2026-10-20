/* USART1 synchronous master (PA8 CK, PA9 TX, PA10 RX) talking to an SPI memory.
 * USART shifts LSB first, so bytes are bit-reversed for the MSB-first device. */
#include "fixture.h"

USART_HandleTypeDef husart1;
void Error_Handler(void) { __disable_irq(); while (1) { } }
int __io_putchar(int ch) { ITM_SendChar(ch); return ch; }
void SysTick_Handler(void) { HAL_IncTick(); }
static uint8_t rev(uint8_t b) { return (uint8_t)(__RBIT(b) >> 24); }

void HAL_USART_MspInit(USART_HandleTypeDef *h) {
  (void)h; GPIO_InitTypeDef g = {0};
  __HAL_RCC_GPIOA_CLK_ENABLE(); __HAL_RCC_GPIOB_CLK_ENABLE(); __HAL_RCC_USART1_CLK_ENABLE();
  g.Pin = GPIO_PIN_8 | GPIO_PIN_9 | GPIO_PIN_10; g.Mode = GPIO_MODE_AF_PP; g.Pull = GPIO_NOPULL; g.Speed = GPIO_SPEED_FREQ_VERY_HIGH; g.Alternate = GPIO_AF7_USART1;
  HAL_GPIO_Init(GPIOA, &g);
}

static void cs(int level) { HAL_GPIO_WritePin(GPIOB, GPIO_PIN_6, level ? GPIO_PIN_SET : GPIO_PIN_RESET); }

int main(void) {
  HAL_Init();
  Fixture_ClockConfig();
  __HAL_RCC_GPIOB_CLK_ENABLE();
  GPIO_InitTypeDef g = {0};
  HAL_GPIO_WritePin(GPIOB, GPIO_PIN_6, GPIO_PIN_SET);
  g.Pin = GPIO_PIN_6; g.Mode = GPIO_MODE_OUTPUT_PP; g.Pull = GPIO_NOPULL; g.Speed = GPIO_SPEED_FREQ_LOW;
  HAL_GPIO_Init(GPIOB, &g);
  husart1.Instance = USART1; husart1.Init.BaudRate = 500000; husart1.Init.WordLength = USART_WORDLENGTH_8B; husart1.Init.StopBits = USART_STOPBITS_1;
  husart1.Init.Parity = USART_PARITY_NONE; husart1.Init.Mode = USART_MODE_TX_RX; husart1.Init.CLKPolarity = USART_POLARITY_LOW;
  husart1.Init.CLKPhase = USART_PHASE_1EDGE; husart1.Init.CLKLastBit = USART_LASTBIT_ENABLE;
  if (HAL_USART_Init(&husart1) != HAL_OK) Error_Handler();
  uint8_t write[3] = { rev(0x02), rev(0x10), rev(0x5A) };
  cs(0); HAL_USART_Transmit(&husart1, write, 3, 100); cs(1);
  uint8_t cmd[3] = { rev(0x03), rev(0x10), 0xFF }, answer[3] = {0};
  __HAL_USART_CLEAR_OREFLAG(&husart1); /* drop the byte received during the write */
  cs(0); HAL_USART_TransmitReceive(&husart1, cmd, answer, 3, 100); cs(1);
  printf("sync read=0x%02X\n", rev(answer[2]));
  while (1) { HAL_Delay(10); }
}
