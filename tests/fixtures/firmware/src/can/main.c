#include "main.h"
#include <stdio.h>

/* Copy this main.c into a CubeIDE STM32F446RE project with matching
 * pin / peripheral / NVIC settings and Cube-generated IRQ / MSP files.
 * Clock: HSI direct (PLL off), APB1 timer clock = 16000000 Hz.
 * printf: SWV ITM port 0 (enable SWV in the debugger). UART uses its pins.
 * With newlib-nano, enable -u _printf_float for floating-point printf. */


void SystemClock_Config(void);
void Error_Handler(void);
static void MX_GPIO_Init(void);

CAN_HandleTypeDef hcan;

int main(void) {
  HAL_Init();
  SystemClock_Config();
  MX_GPIO_Init();
  /* USER CODE BEGIN 2 */
__HAL_RCC_CAN1_CLK_ENABLE();__HAL_RCC_GPIOB_CLK_ENABLE();GPIO_InitTypeDef pins={0};pins.Pin=GPIO_PIN_8|GPIO_PIN_9;pins.Mode=GPIO_MODE_AF_PP;pins.Pull=GPIO_NOPULL;pins.Speed=GPIO_SPEED_FREQ_VERY_HIGH;pins.Alternate=GPIO_AF9_CAN1;HAL_GPIO_Init(GPIOB,&pins);
 hcan.Instance=CAN1;hcan.Init.Prescaler=HAL_RCC_GetPCLK1Freq()/8000000U;hcan.Init.Mode=CAN_MODE_LOOPBACK; // Internal loopback: use CAN_MODE_NORMAL with a real second CAN node.
hcan.Init.SyncJumpWidth=CAN_SJW_1TQ;hcan.Init.TimeSeg1=CAN_BS1_13TQ;hcan.Init.TimeSeg2=CAN_BS2_2TQ;hcan.Init.AutoRetransmission=DISABLE;
 if(HAL_CAN_Init(&hcan)!=HAL_OK)Error_Handler();CAN_FilterTypeDef filter={0};filter.FilterBank=0;filter.FilterMode=CAN_FILTERMODE_IDMASK;filter.FilterScale=CAN_FILTERSCALE_32BIT;filter.FilterFIFOAssignment=CAN_RX_FIFO0;filter.FilterActivation=ENABLE;filter.SlaveStartFilterBank=14;HAL_CAN_ConfigFilter(&hcan,&filter);HAL_CAN_Start(&hcan);
  /* USER CODE END 2 */
  while (1) {
    /* USER CODE BEGIN 3 */
CAN_TxHeaderTypeDef header={0};header.StdId=0x123;header.IDE=CAN_ID_STD;header.RTR=CAN_RTR_DATA;header.DLC=2;uint8_t tx[2]={0x53,0x54};uint32_t mailbox=0;
 if(HAL_CAN_GetTxMailboxesFreeLevel(&hcan)>0)HAL_CAN_AddTxMessage(&hcan,&header,tx,&mailbox);
 if(HAL_CAN_GetRxFifoFillLevel(&hcan,CAN_RX_FIFO0)>0){CAN_RxHeaderTypeDef received={0};uint8_t bytes[8]={0};HAL_CAN_GetRxMessage(&hcan,CAN_RX_FIFO0,&received,bytes);printf("CAN id=%lx length=%lu\n",received.StdId,received.DLC);}
 printf("CAN errors=%lu (loopback=0; normal mode needs a peer ACK)\n",HAL_CAN_GetError(&hcan));HAL_Delay(1000);
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
}

int __io_putchar(int ch) {
  ITM_SendChar(ch);
  return ch;
}

void Error_Handler(void) {
  __disable_irq();
  while (1) { }
}
