/* Deliberate bus fault: store to an unmapped address (FMC bank, not populated). */
#include "fixture.h"
void Error_Handler(void) { __disable_irq(); while (1) { } }
int __io_putchar(int ch) { ITM_SendChar(ch); return ch; }
void SysTick_Handler(void) { HAL_IncTick(); }
int main(void) {
  HAL_Init();
  Fixture_ClockConfig();
  printf("before fault\n");
  HAL_Delay(5);
  *(volatile uint32_t *)0x60000000 = 0x1234;
  printf("not reached\n");
  while (1) { }
}
