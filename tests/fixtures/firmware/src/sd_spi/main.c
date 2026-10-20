#include "main.h"
#include <stdio.h>

/* Copy this main.c into a CubeIDE STM32F446RE project with matching
 * pin / peripheral / NVIC settings and Cube-generated IRQ / MSP files.
 * Clock: HSI direct (PLL off), APB1 timer clock = 16000000 Hz.
 * printf: SWV ITM port 0 (enable SWV in the debugger). UART uses its pins.
 * With newlib-nano, enable -u _printf_float for floating-point printf. */

SPI_HandleTypeDef hspi1;

void SystemClock_Config(void);
void Error_Handler(void);
static void MX_GPIO_Init(void);
static void MX_SPI1_Init(void);


uint8_t sdByte(uint8_t value){uint8_t tx[1]={value},rx[1]={255};HAL_SPI_TransmitReceive(&hspi1,tx,rx,1,100);return rx[0];}
void sdEnd(void){HAL_GPIO_WritePin(GPIOB,GPIO_PIN_6,GPIO_PIN_SET);sdByte(255);}
uint8_t sdCommand(uint8_t command,uint32_t argument,uint8_t crc){HAL_GPIO_WritePin(GPIOB,GPIO_PIN_6,GPIO_PIN_RESET);sdByte(255);sdByte(0x40|command);sdByte(argument>>24);sdByte(argument>>16);sdByte(argument>>8);sdByte(argument);sdByte(crc);uint8_t result=255;for(uint32_t i=0;i<10;i++){result=sdByte(255);if(!(result&128))break;}return result;}
int main(void) {
  HAL_Init();
  SystemClock_Config();
  MX_GPIO_Init();
  MX_SPI1_Init();
  /* USER CODE BEGIN 2 */
HAL_Delay(10);HAL_GPIO_WritePin(GPIOB,GPIO_PIN_6,GPIO_PIN_SET);for(uint32_t i=0;i<10;i++)sdByte(255);
  /* USER CODE END 2 */
  while (1) {
    /* USER CODE BEGIN 3 */
uint8_t r=sdCommand(0,0,0x95);sdEnd();if(r==1){r=sdCommand(8,0x1AA,0x87);uint8_t r7[4]={0};for(uint32_t i=0;i<4;i++)r7[i]=sdByte(255);sdEnd();uint32_t ready=0;for(uint32_t n=0;n<100&&!ready;n++){sdCommand(55,0,1);sdEnd();ready=sdCommand(41,0x40000000,1)==0;sdEnd();HAL_Delay(10);}if(ready){r=sdCommand(58,0,1);uint8_t ocr[4]={0};for(uint32_t i=0;i<4;i++)ocr[i]=sdByte(255);sdEnd();printf("SD OCR=%02x%02x%02x%02x\n",ocr[0],ocr[1],ocr[2],ocr[3]);}else printf("SD init timeout\n");}else printf("SD no card / CMD0 timeout\n");HAL_Delay(1000);
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
  osc.PLL.PLLState = RCC_PLL_OFF;
  if (HAL_RCC_OscConfig(&osc) != HAL_OK) Error_Handler();
  clk.ClockType = RCC_CLOCKTYPE_HCLK | RCC_CLOCKTYPE_SYSCLK | RCC_CLOCKTYPE_PCLK1 | RCC_CLOCKTYPE_PCLK2;
  clk.SYSCLKSource = RCC_SYSCLKSOURCE_HSI;
  clk.AHBCLKDivider = RCC_SYSCLK_DIV1;
  clk.APB1CLKDivider = RCC_HCLK_DIV1;
  clk.APB2CLKDivider = RCC_HCLK_DIV1;
  if (HAL_RCC_ClockConfig(&clk, FLASH_LATENCY_0) != HAL_OK) Error_Handler();
}

static void MX_GPIO_Init(void) {
  GPIO_InitTypeDef GPIO_InitStruct = {0};
  __HAL_RCC_GPIOA_CLK_ENABLE();
  __HAL_RCC_GPIOB_CLK_ENABLE();
  __HAL_RCC_GPIOC_CLK_ENABLE();
  GPIO_InitStruct.Pin = GPIO_PIN_7;
  GPIO_InitStruct.Mode = GPIO_MODE_AF_PP;
  GPIO_InitStruct.Pull = GPIO_NOPULL;
  GPIO_InitStruct.Speed = GPIO_SPEED_FREQ_VERY_HIGH;
  GPIO_InitStruct.Alternate = GPIO_AF5_SPI1;
  HAL_GPIO_Init(GPIOA, &GPIO_InitStruct);
  GPIO_InitStruct.Pin = GPIO_PIN_5;
  GPIO_InitStruct.Mode = GPIO_MODE_AF_PP;
  GPIO_InitStruct.Pull = GPIO_NOPULL;
  GPIO_InitStruct.Speed = GPIO_SPEED_FREQ_VERY_HIGH;
  GPIO_InitStruct.Alternate = GPIO_AF5_SPI1;
  HAL_GPIO_Init(GPIOA, &GPIO_InitStruct);
  GPIO_InitStruct.Pin = GPIO_PIN_6;
  GPIO_InitStruct.Mode = GPIO_MODE_AF_PP;
  GPIO_InitStruct.Pull = GPIO_NOPULL;
  GPIO_InitStruct.Speed = GPIO_SPEED_FREQ_VERY_HIGH;
  GPIO_InitStruct.Alternate = GPIO_AF5_SPI1;
  HAL_GPIO_Init(GPIOA, &GPIO_InitStruct);
  HAL_GPIO_WritePin(GPIOB, GPIO_PIN_6, GPIO_PIN_SET);
  GPIO_InitStruct.Pin = GPIO_PIN_6;
  GPIO_InitStruct.Mode = GPIO_MODE_OUTPUT_PP;
  GPIO_InitStruct.Pull = GPIO_NOPULL;
  GPIO_InitStruct.Speed = GPIO_SPEED_FREQ_VERY_HIGH;
  HAL_GPIO_Init(GPIOB, &GPIO_InitStruct);
  GPIO_InitStruct.Pin = GPIO_PIN_7;
  GPIO_InitStruct.Mode = GPIO_MODE_INPUT;
  GPIO_InitStruct.Pull = GPIO_PULLUP;
  GPIO_InitStruct.Speed = GPIO_SPEED_FREQ_VERY_HIGH;
  HAL_GPIO_Init(GPIOC, &GPIO_InitStruct);
}

static void MX_SPI1_Init(void) {
  __HAL_RCC_SPI1_CLK_ENABLE();
  hspi1.Instance = SPI1;
  hspi1.Init.Mode = SPI_MODE_MASTER;
  hspi1.Init.Direction = SPI_DIRECTION_2LINES;
  hspi1.Init.DataSize = SPI_DATASIZE_8BIT;
  hspi1.Init.CLKPolarity = SPI_POLARITY_LOW;
  hspi1.Init.CLKPhase = SPI_PHASE_1EDGE;
  hspi1.Init.NSS = SPI_NSS_SOFT;
  hspi1.Init.BaudRatePrescaler = SPI_BAUDRATEPRESCALER_64;
  hspi1.Init.FirstBit = SPI_FIRSTBIT_MSB;
  hspi1.Init.TIMode = SPI_TIMODE_DISABLE;
  hspi1.Init.CRCCalculation = SPI_CRCCALCULATION_DISABLE;
  hspi1.Init.CRCPolynomial = 10;
  HAL_SPI_Init(&hspi1);
}

int __io_putchar(int ch) {
  ITM_SendChar(ch);
  return ch;
}

void Error_Handler(void) {
  __disable_irq();
  while (1) { }
}
