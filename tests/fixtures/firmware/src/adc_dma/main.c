/* ADC1 scan of IN0 (PA0, potentiometer) and IN1 (PA1, divider) in continuous
 * mode, DMA2 Stream0 circular into adc[2]. */
#include "fixture.h"

ADC_HandleTypeDef hadc1;
DMA_HandleTypeDef hdma_adc1;
volatile uint16_t adc[2];
volatile uint32_t halfCount, fullCount;

void Error_Handler(void) { __disable_irq(); while (1) { } }
int __io_putchar(int ch) { ITM_SendChar(ch); return ch; }
void SysTick_Handler(void) { HAL_IncTick(); }
void DMA2_Stream0_IRQHandler(void) { HAL_DMA_IRQHandler(&hdma_adc1); }
void HAL_ADC_ConvCpltCallback(ADC_HandleTypeDef *h) { (void)h; fullCount++; }
void HAL_ADC_ConvHalfCpltCallback(ADC_HandleTypeDef *h) { (void)h; halfCount++; }

void HAL_ADC_MspInit(ADC_HandleTypeDef *h) {
  GPIO_InitTypeDef g = {0};
  __HAL_RCC_ADC1_CLK_ENABLE(); __HAL_RCC_GPIOA_CLK_ENABLE(); __HAL_RCC_DMA2_CLK_ENABLE();
  g.Pin = GPIO_PIN_0 | GPIO_PIN_1; g.Mode = GPIO_MODE_ANALOG; g.Pull = GPIO_NOPULL;
  HAL_GPIO_Init(GPIOA, &g);
  hdma_adc1.Instance = DMA2_Stream0; hdma_adc1.Init.Channel = DMA_CHANNEL_0; hdma_adc1.Init.Direction = DMA_PERIPH_TO_MEMORY;
  hdma_adc1.Init.PeriphInc = DMA_PINC_DISABLE; hdma_adc1.Init.MemInc = DMA_MINC_ENABLE;
  hdma_adc1.Init.PeriphDataAlignment = DMA_PDATAALIGN_HALFWORD; hdma_adc1.Init.MemDataAlignment = DMA_MDATAALIGN_HALFWORD;
  hdma_adc1.Init.Mode = DMA_CIRCULAR; hdma_adc1.Init.Priority = DMA_PRIORITY_HIGH; hdma_adc1.Init.FIFOMode = DMA_FIFOMODE_DISABLE;
  if (HAL_DMA_Init(&hdma_adc1) != HAL_OK) Error_Handler();
  __HAL_LINKDMA(h, DMA_Handle, hdma_adc1);
  HAL_NVIC_SetPriority(DMA2_Stream0_IRQn, 0, 0); HAL_NVIC_EnableIRQ(DMA2_Stream0_IRQn);
}

int main(void) {
  HAL_Init();
  Fixture_ClockConfig();
  hadc1.Instance = ADC1;
  hadc1.Init.ClockPrescaler = ADC_CLOCK_SYNC_PCLK_DIV4; hadc1.Init.Resolution = ADC_RESOLUTION_12B;
  hadc1.Init.ScanConvMode = ENABLE; hadc1.Init.ContinuousConvMode = ENABLE; hadc1.Init.DiscontinuousConvMode = DISABLE;
  hadc1.Init.ExternalTrigConvEdge = ADC_EXTERNALTRIGCONVEDGE_NONE; hadc1.Init.ExternalTrigConv = ADC_SOFTWARE_START;
  hadc1.Init.DataAlign = ADC_DATAALIGN_RIGHT; hadc1.Init.NbrOfConversion = 2; hadc1.Init.DMAContinuousRequests = ENABLE;
  hadc1.Init.EOCSelection = ADC_EOC_SEQ_CONV;
  if (HAL_ADC_Init(&hadc1) != HAL_OK) Error_Handler();
  ADC_ChannelConfTypeDef c = {0};
  c.Channel = ADC_CHANNEL_0; c.Rank = 1; c.SamplingTime = ADC_SAMPLETIME_480CYCLES;
  if (HAL_ADC_ConfigChannel(&hadc1, &c) != HAL_OK) Error_Handler();
  c.Channel = ADC_CHANNEL_1; c.Rank = 2;
  if (HAL_ADC_ConfigChannel(&hadc1, &c) != HAL_OK) Error_Handler();
  if (HAL_ADC_Start_DMA(&hadc1, (uint32_t *)adc, 2) != HAL_OK) Error_Handler();
  while (1) {
    HAL_Delay(200);
    printf("pot=%u div=%u cycles=%lu\n", adc[0], adc[1], (unsigned long)fullCount);
  }
}
