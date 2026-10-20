#include "main.h"
#include <stdio.h>
// I2C1 PB9(SDA)/PB8(SCL), 3V3/GND · 0x44 단발 측정과 CRC 검사
#include <stdio.h>

/* Copy this main.c into a CubeIDE STM32F446RE project with matching
 * pin / peripheral / NVIC settings and Cube-generated IRQ / MSP files.
 * Clock: HSI PLL, APB1 timer clock = 84000000 Hz.
 * printf: SWV ITM port 0 (enable SWV in the debugger). UART uses its pins.
 * With newlib-nano, enable -u _printf_float for floating-point printf. */

I2C_HandleTypeDef hi2c1;

void SystemClock_Config(void);
void Error_Handler(void);
static void MX_GPIO_Init(void);
static void MX_I2C1_Init(void);

uint8_t sensorCRC(uint8_t data[], int offset) {
  uint8_t crc = 255;
  for (int i = 0; i < 2; i++) {
    crc ^= data[offset+i];
    for (int bit = 0; bit < 8; bit++) crc = (crc & 128) ? (crc << 1) ^ 0x31 : crc << 1;
  }
  return crc;
}

int main(void) {
  HAL_Init();
  SystemClock_Config();
  MX_GPIO_Init();
  MX_I2C1_Init();
  /* USER CODE BEGIN 2 */

    /* USER CODE END 2 */
  while (1) {
    /* USER CODE BEGIN 3 */
    uint8_t command[2] = {0x24, 0x00};
    uint8_t data[6] = {0};
    HAL_StatusTypeDef status = HAL_I2C_Master_Transmit(&hi2c1, 0x44 << 1, command, 2, 100);
    HAL_Delay(16);
    if (status == HAL_OK && HAL_I2C_Master_Receive(&hi2c1, 0x44 << 1, data, 6, 100) == HAL_OK) {
      if (sensorCRC(data, 0) == data[2] && sensorCRC(data, 3) == data[5]) {
        float temperature = -45 + 175.0 * (data[0]*256+data[1]) / 65535;
        float humidity = 100.0 * (data[3]*256+data[4]) / 65535;
        printf("SHT31=%.1f C RH=%.1f %%\n", temperature, humidity);
      } else printf("SHT31 CRC error\n");
    } else printf("SHT31 NACK: power/address/wiring\n");
    HAL_Delay(250);
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
  __HAL_RCC_GPIOB_CLK_ENABLE();
  GPIO_InitStruct.Pin = GPIO_PIN_8;
  GPIO_InitStruct.Mode = GPIO_MODE_AF_OD;
  GPIO_InitStruct.Pull = GPIO_NOPULL;
  GPIO_InitStruct.Speed = GPIO_SPEED_FREQ_VERY_HIGH;
  GPIO_InitStruct.Alternate = GPIO_AF4_I2C1;
  HAL_GPIO_Init(GPIOB, &GPIO_InitStruct);
  GPIO_InitStruct.Pin = GPIO_PIN_9;
  GPIO_InitStruct.Mode = GPIO_MODE_AF_OD;
  GPIO_InitStruct.Pull = GPIO_NOPULL;
  GPIO_InitStruct.Speed = GPIO_SPEED_FREQ_VERY_HIGH;
  GPIO_InitStruct.Alternate = GPIO_AF4_I2C1;
  HAL_GPIO_Init(GPIOB, &GPIO_InitStruct);
}

static void MX_I2C1_Init(void) {
  __HAL_RCC_I2C1_CLK_ENABLE();
  hi2c1.Instance = I2C1;
  hi2c1.Init.ClockSpeed = 100000;
  hi2c1.Init.DutyCycle = I2C_DUTYCYCLE_2;
  hi2c1.Init.OwnAddress1 = 0;
  hi2c1.Init.AddressingMode = I2C_ADDRESSINGMODE_7BIT;
  hi2c1.Init.DualAddressMode = I2C_DUALADDRESS_DISABLE;
  hi2c1.Init.OwnAddress2 = 0;
  hi2c1.Init.GeneralCallMode = I2C_GENERALCALL_DISABLE;
  hi2c1.Init.NoStretchMode = I2C_NOSTRETCH_DISABLE;
  HAL_I2C_Init(&hi2c1);
}

int __io_putchar(int ch) {
  ITM_SendChar(ch);
  return ch;
}

void Error_Handler(void) {
  __disable_irq();
  while (1) { }
}
