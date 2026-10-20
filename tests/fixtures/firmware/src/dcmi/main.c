/* DCMI snapshot of one 160x120 RGB565 frame via DMA2 Stream1 channel 1. */
#include "fixture.h"

DCMI_HandleTypeDef hdcmi;
DMA_HandleTypeDef hdma_dcmi;
#define WIDTH 160
#define HEIGHT 120
static uint32_t frame[WIDTH * HEIGHT / 2];
static volatile uint32_t frames, lines, vsyncs;

void Error_Handler(void) { __disable_irq(); while (1) { } }
int __io_putchar(int ch) { ITM_SendChar(ch); return ch; }
void SysTick_Handler(void) { HAL_IncTick(); }
void DMA2_Stream1_IRQHandler(void) { HAL_DMA_IRQHandler(&hdma_dcmi); }
void DCMI_IRQHandler(void) { HAL_DCMI_IRQHandler(&hdcmi); }
void HAL_DCMI_FrameEventCallback(DCMI_HandleTypeDef *h) { (void)h; frames++; }
void HAL_DCMI_LineEventCallback(DCMI_HandleTypeDef *h) { (void)h; lines++; }
void HAL_DCMI_VsyncEventCallback(DCMI_HandleTypeDef *h) { (void)h; vsyncs++; }

void HAL_DCMI_MspInit(DCMI_HandleTypeDef *h) {
  GPIO_InitTypeDef g = {0};
  __HAL_RCC_DCMI_CLK_ENABLE(); __HAL_RCC_DMA2_CLK_ENABLE();
  __HAL_RCC_GPIOA_CLK_ENABLE(); __HAL_RCC_GPIOB_CLK_ENABLE(); __HAL_RCC_GPIOC_CLK_ENABLE();
  g.Mode = GPIO_MODE_AF_PP; g.Pull = GPIO_PULLUP; g.Speed = GPIO_SPEED_FREQ_VERY_HIGH; g.Alternate = GPIO_AF13_DCMI;
  g.Pin = GPIO_PIN_4 | GPIO_PIN_6; HAL_GPIO_Init(GPIOA, &g);                         /* HSYNC, PIXCLK */
  g.Pin = GPIO_PIN_6 | GPIO_PIN_7 | GPIO_PIN_8 | GPIO_PIN_9; HAL_GPIO_Init(GPIOB, &g); /* D5, VSYNC, D6, D7 */
  g.Pin = GPIO_PIN_6 | GPIO_PIN_7 | GPIO_PIN_8 | GPIO_PIN_9 | GPIO_PIN_11; HAL_GPIO_Init(GPIOC, &g); /* D0-D4 */
  hdma_dcmi.Instance = DMA2_Stream1; hdma_dcmi.Init.Channel = DMA_CHANNEL_1; hdma_dcmi.Init.Direction = DMA_PERIPH_TO_MEMORY;
  hdma_dcmi.Init.PeriphInc = DMA_PINC_DISABLE; hdma_dcmi.Init.MemInc = DMA_MINC_ENABLE;
  hdma_dcmi.Init.PeriphDataAlignment = DMA_PDATAALIGN_WORD; hdma_dcmi.Init.MemDataAlignment = DMA_MDATAALIGN_WORD;
  hdma_dcmi.Init.Mode = DMA_NORMAL; hdma_dcmi.Init.Priority = DMA_PRIORITY_HIGH; hdma_dcmi.Init.FIFOMode = DMA_FIFOMODE_ENABLE;
  hdma_dcmi.Init.FIFOThreshold = DMA_FIFO_THRESHOLD_FULL; hdma_dcmi.Init.MemBurst = DMA_MBURST_SINGLE; hdma_dcmi.Init.PeriphBurst = DMA_PBURST_SINGLE;
  if (HAL_DMA_Init(&hdma_dcmi) != HAL_OK) Error_Handler();
  __HAL_LINKDMA(h, DMA_Handle, hdma_dcmi);
  HAL_NVIC_SetPriority(DMA2_Stream1_IRQn, 1, 0); HAL_NVIC_EnableIRQ(DMA2_Stream1_IRQn);
  HAL_NVIC_SetPriority(DCMI_IRQn, 2, 0); HAL_NVIC_EnableIRQ(DCMI_IRQn);
}

int main(void) {
  HAL_Init();
  Fixture_ClockConfig();
  hdcmi.Instance = DCMI; hdcmi.Init.SynchroMode = DCMI_SYNCHRO_HARDWARE; hdcmi.Init.PCKPolarity = DCMI_PCKPOLARITY_RISING;
  hdcmi.Init.VSPolarity = DCMI_VSPOLARITY_LOW; hdcmi.Init.HSPolarity = DCMI_HSPOLARITY_LOW; hdcmi.Init.CaptureRate = DCMI_CR_ALL_FRAME;
  hdcmi.Init.ExtendedDataMode = DCMI_EXTEND_DATA_8B; hdcmi.Init.JPEGMode = DCMI_JPEG_DISABLE;
  if (HAL_DCMI_Init(&hdcmi) != HAL_OK) Error_Handler();
  if (HAL_DCMI_Start_DMA(&hdcmi, DCMI_MODE_SNAPSHOT, (uint32_t)frame, WIDTH * HEIGHT / 2) != HAL_OK) Error_Handler();
  while (!frames) { }
  uint32_t sum = 0;
  const uint8_t *bytes = (const uint8_t *)frame;
  for (uint32_t i = 0; i < sizeof(frame); i++) sum = sum * 31 + bytes[i];
  printf("frame done lines=%lu checksum=%08lx first=%02x%02x\n", (unsigned long)lines, (unsigned long)sum, bytes[0], bytes[1]);
  while (1) { HAL_Delay(10); }
}
