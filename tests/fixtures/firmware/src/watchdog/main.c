/* IWDG: refresh three times, then stop refreshing; the watchdog resets the
 * MCU and the reset flag is reported after the reboot. */
#include "fixture.h"

IWDG_HandleTypeDef hiwdg;
void Error_Handler(void) { __disable_irq(); while (1) { } }
int __io_putchar(int ch) { ITM_SendChar(ch); return ch; }
void SysTick_Handler(void) { HAL_IncTick(); }

int main(void) {
  HAL_Init();
  Fixture_ClockConfig();
  if (__HAL_RCC_GET_FLAG(RCC_FLAG_IWDGRST)) { printf("IWDG reset detected\n"); __HAL_RCC_CLEAR_RESET_FLAGS(); while (1) { HAL_Delay(10); } }
  printf("boot\n");
  hiwdg.Instance = IWDG; hiwdg.Init.Prescaler = IWDG_PRESCALER_4; hiwdg.Init.Reload = 400; /* (400+1)*4/32000 = 50 ms */
  if (HAL_IWDG_Init(&hiwdg) != HAL_OK) Error_Handler();
  for (int i = 0; i < 3; i++) { HAL_Delay(30); HAL_IWDG_Refresh(&hiwdg); printf("refresh %d\n", i); }
  printf("stop refreshing\n");
  while (1) { }
}
