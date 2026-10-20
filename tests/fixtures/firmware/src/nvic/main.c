/* Interrupt preemption: TIM2 (priority 2) busy-waits 3 ms inside its ISR;
 * TIM3 (priority 0) fires 1 ms after TIM2 and must preempt it.
 * The log shows A (TIM2 enter) B (TIM3) a (TIM2 leave). */
#include "fixture.h"

TIM_HandleTypeDef htim2, htim3, htim5;
static char log_[32];
static volatile uint32_t n;

void Error_Handler(void) { __disable_irq(); while (1) { } }
int __io_putchar(int ch) { ITM_SendChar(ch); return ch; }
void SysTick_Handler(void) { HAL_IncTick(); }
void TIM2_IRQHandler(void) { HAL_TIM_IRQHandler(&htim2); }
void TIM3_IRQHandler(void) { HAL_TIM_IRQHandler(&htim3); }
static void mark(char c) { if (n < sizeof(log_) - 1) log_[n++] = c; }

void HAL_TIM_PeriodElapsedCallback(TIM_HandleTypeDef *h) {
  if (h->Instance == TIM2) {
    mark('A');
    uint32_t start = TIM5->CNT;
    while (TIM5->CNT - start < 3000) { }
    mark('a');
  } else if (h->Instance == TIM3) {
    mark('B');
    HAL_TIM_Base_Stop_IT(&htim3);
  }
}

static void timer(TIM_HandleTypeDef *h, TIM_TypeDef *inst, uint32_t psc, uint32_t arr) {
  h->Instance = inst; h->Init.Prescaler = psc; h->Init.CounterMode = TIM_COUNTERMODE_UP; h->Init.Period = arr;
  h->Init.ClockDivision = TIM_CLOCKDIVISION_DIV1; h->Init.AutoReloadPreload = TIM_AUTORELOAD_PRELOAD_DISABLE;
  if (HAL_TIM_Base_Init(h) != HAL_OK) Error_Handler();
}

int main(void) {
  HAL_Init();
  Fixture_ClockConfig();
  HAL_NVIC_SetPriorityGrouping(NVIC_PRIORITYGROUP_4);
  __HAL_RCC_TIM2_CLK_ENABLE(); __HAL_RCC_TIM3_CLK_ENABLE(); __HAL_RCC_TIM5_CLK_ENABLE();
  timer(&htim5, TIM5, 83, 0xFFFFFFFF);      /* 1 MHz free-running time base */
  timer(&htim2, TIM2, 83, 9999);            /* 10 ms */
  timer(&htim3, TIM3, 83, 999);             /* 1 ms */
  HAL_NVIC_SetPriority(TIM2_IRQn, 2, 0); HAL_NVIC_EnableIRQ(TIM2_IRQn);
  HAL_NVIC_SetPriority(TIM3_IRQn, 0, 0); HAL_NVIC_EnableIRQ(TIM3_IRQn);
  HAL_TIM_Base_Start(&htim5);
  __HAL_TIM_CLEAR_FLAG(&htim2, TIM_FLAG_UPDATE); __HAL_TIM_CLEAR_FLAG(&htim3, TIM_FLAG_UPDATE);
  HAL_TIM_Base_Start_IT(&htim2);
  while (TIM2->CNT < 9500) { }              /* TIM2 fires at 10 ms; TIM3 then 1 ms later */
  HAL_TIM_Base_Start_IT(&htim3);
  HAL_Delay(30);
  HAL_TIM_Base_Stop_IT(&htim2);
  printf("order=%s\n", log_);
  while (1) { HAL_Delay(10); }
}
