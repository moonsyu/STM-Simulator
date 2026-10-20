/* SDIO 4-bit + FatFs: read INPUT.TXT provided in the card image, then write
 * HELLO.TXT and read it back. */
#include "fixture.h"
#include "ff.h"

SD_HandleTypeDef hsd;
static FATFS fs;
void Error_Handler(void) { __disable_irq(); while (1) { } }
int __io_putchar(int ch) { ITM_SendChar(ch); return ch; }
void SysTick_Handler(void) { HAL_IncTick(); }

void HAL_SD_MspInit(SD_HandleTypeDef *h) {
  (void)h; GPIO_InitTypeDef g = {0};
  __HAL_RCC_SDIO_CLK_ENABLE(); __HAL_RCC_GPIOC_CLK_ENABLE(); __HAL_RCC_GPIOD_CLK_ENABLE();
  g.Mode = GPIO_MODE_AF_PP; g.Pull = GPIO_PULLUP; g.Speed = GPIO_SPEED_FREQ_VERY_HIGH; g.Alternate = GPIO_AF12_SDIO;
  g.Pin = GPIO_PIN_8 | GPIO_PIN_9 | GPIO_PIN_10 | GPIO_PIN_11 | GPIO_PIN_12; HAL_GPIO_Init(GPIOC, &g);
  g.Pin = GPIO_PIN_2; HAL_GPIO_Init(GPIOD, &g);
}

int main(void) {
  HAL_Init();
  Fixture_ClockConfig();
  hsd.Instance = SDIO; hsd.Init.ClockEdge = SDIO_CLOCK_EDGE_RISING; hsd.Init.ClockBypass = SDIO_CLOCK_BYPASS_DISABLE;
  hsd.Init.ClockPowerSave = SDIO_CLOCK_POWER_SAVE_DISABLE; hsd.Init.BusWide = SDIO_BUS_WIDE_1B;
  hsd.Init.HardwareFlowControl = SDIO_HARDWARE_FLOW_CONTROL_DISABLE; hsd.Init.ClockDiv = 2;
  if (HAL_SD_Init(&hsd) != HAL_OK) { printf("SD init failed err=%lx\n", (unsigned long)hsd.ErrorCode); while (1) { } }
  if (HAL_SD_ConfigWideBusOperation(&hsd, SDIO_BUS_WIDE_4B) != HAL_OK) printf("4-bit failed\n");
  printf("SD blocks=%lu\n", (unsigned long)hsd.SdCard.BlockNbr);
  FRESULT r = f_mount(&fs, "", 1);
  if (r != FR_OK) { printf("mount failed %d\n", r); while (1) { } }
  FIL f; UINT n; char buf[64] = {0};
  if (f_open(&f, "INPUT.TXT", FA_READ) == FR_OK) { f_read(&f, buf, sizeof(buf) - 1, &n); f_close(&f); printf("input=%s\n", buf); }
  else printf("input missing\n");
  r = f_open(&f, "HELLO.TXT", FA_WRITE | FA_CREATE_ALWAYS);
  if (r != FR_OK) { printf("open failed %d\n", r); while (1) { } }
  const char *text = "Hello from FatFs on the emulated SDIO\r\n";
  f_write(&f, text, strlen(text), &n);
  f_close(&f);
  memset(buf, 0, sizeof(buf));
  f_open(&f, "HELLO.TXT", FA_READ); f_read(&f, buf, sizeof(buf) - 1, &n); f_close(&f);
  printf("readback %u bytes\n", n);
  printf("done\n");
  while (1) { HAL_Delay(10); }
}
