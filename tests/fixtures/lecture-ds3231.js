// The lecture project of feature 43: a DS3231 on I2C1 (PB8 / PB9) with USART2, and its main.c as CubeMX writes it with
// "Generate peripheral initialization as a pair of '.c/.h' files per peripheral" — no handle and no MX_*_Init in main.c.
import {catalogExample} from '../../src/catalog-examples.js';
import {catalogType} from '../../src/catalog-defs.js';
import {validateProject,projectForBoard} from '../../src/project.js';

const pin=fn=>({function:fn,pull:'NOPULL',edge:'FALLING',label:'',initial:0});
// The DS3231 part example (I2C1 on PB8 / PB9) with USART2 added, as in the lecture project.
export function lectureProject(boardId='nucleo-f446re'){
 let p=catalogExample(catalogType('ds3231-zs042-10'),()=>{throw new Error('own example');});
 // The same circuit on the other NUCLEO-64 (the header pins are the same): I2C1 on PB8 / PB9 is the remapped pair there.
 if(boardId!=='nucleo-f446re'){const other=projectForBoard(boardId);other.components=p.components;other.wires=p.wires;other.surfaces=p.surfaces;other.mcu.pins={...p.mcu.pins};other.mcu.peripherals={...p.mcu.peripherals};p=other;}
 Object.assign(p.mcu.pins,{PA2:pin('USART2_TX'),PA3:pin('USART2_RX')});p.mcu.peripherals.USART2={enabled:true,baud:115200};
 return validateProject(p);
}
// A main.c as CubeMX writes it with the option on: no handle, no MX_*_Init definition, only the headers.
export const LECTURE_MAIN=`/* USER CODE BEGIN Header */
/* USER CODE END Header */
#include "main.h"
#include "i2c.h"
#include "usart.h"
#include "gpio.h"

/* USER CODE BEGIN Includes */
#include <stdio.h>
/* USER CODE END Includes */

void SystemClock_Config(void);

/* USER CODE BEGIN 0 */
int _write(int file, char *ptr, int len)
{
  HAL_UART_Transmit(&huart2, (uint8_t *)ptr, len, 100);
  return len;
}
/* USER CODE END 0 */

int main(void)
{
  HAL_Init();
  SystemClock_Config();
  MX_GPIO_Init();
  MX_I2C1_Init();
  MX_USART2_UART_Init();
  /* USER CODE BEGIN 2 */
  uint8_t sec_addr = 0x00;
  uint8_t sec = 0;
  /* USER CODE END 2 */
  while (1)
  {
    /* USER CODE BEGIN 3 */
    HAL_I2C_Master_Transmit(&hi2c1, 0x68 << 1, &sec_addr, 1, 10);
    HAL_I2C_Master_Receive(&hi2c1, 0x68 << 1, &sec, 1, 10);
    printf("%d sec\\r\\n", (sec >> 4) * 10 + (sec & 0x0F));
    HAL_Delay(500);
    /* USER CODE END 3 */
  }
}

void SystemClock_Config(void)
{
  RCC_OscInitTypeDef RCC_OscInitStruct = {0};
  RCC_ClkInitTypeDef RCC_ClkInitStruct = {0};
  RCC_OscInitStruct.OscillatorType = RCC_OSCILLATORTYPE_HSI;
  RCC_OscInitStruct.HSIState = RCC_HSI_ON;
  RCC_OscInitStruct.HSICalibrationValue = RCC_HSICALIBRATION_DEFAULT;
  RCC_OscInitStruct.PLL.PLLState = RCC_PLL_NONE;
  if (HAL_RCC_OscConfig(&RCC_OscInitStruct) != HAL_OK)
  {
    Error_Handler();
  }
  RCC_ClkInitStruct.ClockType = RCC_CLOCKTYPE_HCLK|RCC_CLOCKTYPE_SYSCLK|RCC_CLOCKTYPE_PCLK1|RCC_CLOCKTYPE_PCLK2;
  RCC_ClkInitStruct.SYSCLKSource = RCC_SYSCLKSOURCE_HSI;
  RCC_ClkInitStruct.AHBCLKDivider = RCC_SYSCLK_DIV1;
  RCC_ClkInitStruct.APB1CLKDivider = RCC_HCLK_DIV1;
  RCC_ClkInitStruct.APB2CLKDivider = RCC_HCLK_DIV1;
  if (HAL_RCC_ClockConfig(&RCC_ClkInitStruct, FLASH_LATENCY_0) != HAL_OK)
  {
    Error_Handler();
  }
}

void Error_Handler(void)
{
  __disable_irq();
  while (1)
  {
  }
}
`;
