#include "main.h"
#include <stdio.h>
// I2C1 PB9(SDA)/PB8(SCL), 3V3/GND · WHO_AM_I 확인, 절전 해제, ±2 g / ±250 °/s 읽기
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


int main(void) {
  HAL_Init();
  SystemClock_Config();
  MX_GPIO_Init();
  MX_I2C1_Init();
  /* USER CODE BEGIN 2 */
  uint8_t identity[1] = {0}, wake[1] = {0};
  HAL_StatusTypeDef status = HAL_I2C_Mem_Read(&hi2c1, 0x68 << 1, 0x75, I2C_MEMADD_SIZE_8BIT, identity, 1, 100);
  printf("MPU6050 status=%d WHO_AM_I=0x%02X\n", status, identity[0]);
  HAL_I2C_Mem_Write(&hi2c1, 0x68 << 1, 0x6B, I2C_MEMADD_SIZE_8BIT, wake, 1, 100);
    /* USER CODE END 2 */
  while (1) {
    /* USER CODE BEGIN 3 */
    uint8_t data[14] = {0};
    if (HAL_I2C_Mem_Read(&hi2c1, 0x68 << 1, 0x3B, I2C_MEMADD_SIZE_8BIT, data, 14, 100) == HAL_OK) {
      float ax = (int16_t)(data[0]*256+data[1]) / 16384.0;
      float ay = (int16_t)(data[2]*256+data[3]) / 16384.0;
      float az = (int16_t)(data[4]*256+data[5]) / 16384.0;
      float gx = (int16_t)(data[8]*256+data[9]) / 131.0;
      float gy = (int16_t)(data[10]*256+data[11]) / 131.0;
      float gz = (int16_t)(data[12]*256+data[13]) / 131.0;
      printf("MPU6050 g=(%.2f,%.2f,%.2f) dps=(%.1f,%.1f,%.1f)\n", ax,ay,az,gx,gy,gz);
    } else printf("MPU6050 NACK\n");
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
