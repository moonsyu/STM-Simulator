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

int auditUserKeep(void);
unsigned int auditUserCycles = 0;

/* STM DEVICE DOCS HEADERS BEGIN */
#include <stdio.h>
#include <math.h>
ADC_HandleTypeDef hadc1;
UART_HandleTypeDef huart2;
TIM_HandleTypeDef htim2;
/* STM DEVICE DOCS HEADERS END */
int main(void) {
/* STM DEVICE DOCS DECLARATIONS BEGIN */
    uint8_t STM_D2_rx[1];
    uint32_t STM_D3_servoStep = 0;
/* STM DEVICE DOCS DECLARATIONS END */

  HAL_Init();
  SystemClock_Config();
  MX_GPIO_Init();
  /* USER CODE BEGIN 2 */
/* STM DEVICE DOCS INIT BEGIN */
    {
        
        __HAL_RCC_ADC1_CLK_ENABLE();
        hadc1.Instance = ADC1;
        hadc1.Init.ClockPrescaler = ADC_CLOCK_SYNC_PCLK_DIV4;
        hadc1.Init.Resolution = ADC_RESOLUTION_12B;
        hadc1.Init.ScanConvMode = DISABLE;
        hadc1.Init.ContinuousConvMode = DISABLE;
        hadc1.Init.DiscontinuousConvMode = DISABLE;
        hadc1.Init.ExternalTrigConvEdge = ADC_EXTERNALTRIGCONVEDGE_NONE;
        hadc1.Init.ExternalTrigConv = ADC_SOFTWARE_START;
        hadc1.Init.DataAlign = ADC_DATAALIGN_RIGHT;
        hadc1.Init.NbrOfConversion = 1;
        hadc1.Init.DMAContinuousRequests = DISABLE;
        hadc1.Init.EOCSelection = ADC_EOC_SINGLE_CONV;
        HAL_ADC_Init(&hadc1);
        ADC_ChannelConfTypeDef sConfig = {0};
        sConfig.Channel = ADC_CHANNEL_0;
        sConfig.Rank = 1;
        sConfig.SamplingTime = ADC_SAMPLETIME_480CYCLES;
        HAL_ADC_ConfigChannel(&hadc1, &sConfig);
        
    }
    {
        
        __HAL_RCC_USART2_CLK_ENABLE();
        huart2.Instance = USART2;
        huart2.Init.BaudRate = 9600;
        huart2.Init.WordLength = UART_WORDLENGTH_8B;
        huart2.Init.StopBits = UART_STOPBITS_1;
        huart2.Init.Parity = UART_PARITY_NONE;
        huart2.Init.Mode = UART_MODE_TX_RX;
        huart2.Init.HwFlowCtl = UART_HWCONTROL_NONE;
        huart2.Init.OverSampling = UART_OVERSAMPLING_16;
        HAL_UART_Init(&huart2);
        
    }
    {
        
        __HAL_RCC_TIM2_CLK_ENABLE();
        htim2.Instance = TIM2;
        htim2.Init.Prescaler = 15;
        htim2.Init.CounterMode = TIM_COUNTERMODE_UP;
        htim2.Init.Period = 19999;
        htim2.Init.ClockDivision = TIM_CLOCKDIVISION_DIV1;
        htim2.Init.AutoReloadPreload = TIM_AUTORELOAD_PRELOAD_DISABLE;
        HAL_TIM_PWM_Init(&htim2);
        TIM_OC_InitTypeDef channel = {0};
        channel.OCMode = TIM_OCMODE_PWM1;
        channel.OCPolarity = TIM_OCPOLARITY_HIGH;
        channel.Pulse = 0;
        channel.OCFastMode = TIM_OCFAST_DISABLE;
        HAL_TIM_PWM_ConfigChannel(&htim2, &channel, TIM_CHANNEL_1);
        
    }
    {
        
    }
    {
        
    }
    {
        uint8_t message[] = "HAL UART ready\r\n";
        HAL_UART_Transmit((&huart2), message, (sizeof(message) - 1), 100);
    }
    {
        TIM_OC_InitTypeDef channel = {0};
        (channel.OCMode = TIM_OCMODE_PWM1);
        (channel.OCPolarity = TIM_OCPOLARITY_HIGH);
        (channel.Pulse = 1000);
        HAL_TIM_PWM_ConfigChannel((&htim2), (&channel), TIM_CHANNEL_1);
        HAL_TIM_PWM_Start((&htim2), TIM_CHANNEL_1);
    }
/* STM DEVICE DOCS INIT END */

  printf("USER_KEEP_four-device-mix=%d\n", auditUserKeep());
  /* USER CODE END 2 */
  while (1) {
    /* USER CODE BEGIN 3 */
/* STM DEVICE DOCS STEP BEGIN */
        {
            HAL_GPIO_WritePin(GPIOA, GPIO_PIN_5, GPIO_PIN_SET);
        }
        {
            ADC_ChannelConfTypeDef docsChannel = {0}; docsChannel.Channel = ADC_CHANNEL_0; docsChannel.Rank = 1; docsChannel.SamplingTime = ADC_SAMPLETIME_3CYCLES; HAL_ADC_ConfigChannel(&hadc1, &docsChannel);
            HAL_ADC_Start((&hadc1));
            HAL_ADC_PollForConversion((&hadc1), 10);
            uint32_t raw = HAL_ADC_GetValue((&hadc1));
            printf("ADC=%lu, voltage=%.3f V\n", raw, ((raw * 3.3) / 4095));
            HAL_Delay(200);
        }
        {
            if ((HAL_UART_Receive((&huart2), STM_D2_rx, 1, 10) == HAL_OK)) {
                HAL_UART_Transmit((&huart2), STM_D2_rx, 1, 100);
            }
        }
        {
            uint32_t pulse = (1000 + (STM_D3_servoStep * 500));
            __HAL_TIM_SET_COMPARE((&htim2), TIM_CHANNEL_1, pulse);
            printf("Servo command=%lu deg pulse=%lu us\n", (STM_D3_servoStep * 90), pulse);
            (STM_D3_servoStep = ((STM_D3_servoStep + 1) % 3));
            HAL_Delay(1200);
        }
/* STM DEVICE DOCS STEP END */

    auditUserCycles++;
    HAL_Delay(137);
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
  __HAL_RCC_GPIOB_CLK_ENABLE();
  HAL_GPIO_WritePin(GPIOB, GPIO_PIN_12, GPIO_PIN_SET);
  GPIO_InitStruct.Pin = GPIO_PIN_12;
  GPIO_InitStruct.Mode = GPIO_MODE_OUTPUT_PP;
  GPIO_InitStruct.Pull = GPIO_NOPULL;
  GPIO_InitStruct.Speed = GPIO_SPEED_FREQ_VERY_HIGH;
  HAL_GPIO_Init(GPIOB, &GPIO_InitStruct);

/* STM DEVICE DOCS MX_GPIO_Init BEGIN */
{

  GPIO_InitTypeDef GPIO_InitStruct = {0};
  __HAL_RCC_GPIOA_CLK_ENABLE();
  HAL_GPIO_WritePin(GPIOA, GPIO_PIN_5, GPIO_PIN_RESET);
  GPIO_InitStruct.Pin = GPIO_PIN_5;
  GPIO_InitStruct.Mode = GPIO_MODE_OUTPUT_PP;
  GPIO_InitStruct.Pull = GPIO_NOPULL;
  GPIO_InitStruct.Speed = GPIO_SPEED_FREQ_VERY_HIGH;
  HAL_GPIO_Init(GPIOA, &GPIO_InitStruct);
  GPIO_InitStruct.Pin = GPIO_PIN_0;
  GPIO_InitStruct.Mode = GPIO_MODE_ANALOG;
  GPIO_InitStruct.Pull = GPIO_NOPULL;
  GPIO_InitStruct.Speed = GPIO_SPEED_FREQ_VERY_HIGH;
  HAL_GPIO_Init(GPIOA, &GPIO_InitStruct);
  GPIO_InitStruct.Pin = GPIO_PIN_2;
  GPIO_InitStruct.Mode = GPIO_MODE_AF_PP;
  GPIO_InitStruct.Pull = GPIO_NOPULL;
  GPIO_InitStruct.Speed = GPIO_SPEED_FREQ_VERY_HIGH;
  GPIO_InitStruct.Alternate = GPIO_AF7_USART2;
  HAL_GPIO_Init(GPIOA, &GPIO_InitStruct);
  GPIO_InitStruct.Pin = GPIO_PIN_3;
  GPIO_InitStruct.Mode = GPIO_MODE_AF_PP;
  GPIO_InitStruct.Pull = GPIO_NOPULL;
  GPIO_InitStruct.Speed = GPIO_SPEED_FREQ_VERY_HIGH;
  GPIO_InitStruct.Alternate = GPIO_AF7_USART2;
  HAL_GPIO_Init(GPIOA, &GPIO_InitStruct);
  GPIO_InitStruct.Pin = GPIO_PIN_15;
  GPIO_InitStruct.Mode = GPIO_MODE_AF_PP;
  GPIO_InitStruct.Pull = GPIO_NOPULL;
  GPIO_InitStruct.Speed = GPIO_SPEED_FREQ_VERY_HIGH;
  GPIO_InitStruct.Alternate = GPIO_AF1_TIM2;
  HAL_GPIO_Init(GPIOA, &GPIO_InitStruct);
  HAL_NVIC_SetPriority(USART2_IRQn, 0, 0);
  HAL_NVIC_EnableIRQ(USART2_IRQn);

}
/* STM DEVICE DOCS MX_GPIO_Init END */
}

int __io_putchar(int ch) {
  ITM_SendChar(ch);
  return ch;
}

void Error_Handler(void) {
  __disable_irq();
  while (1) { }
}

int auditUserKeep(void) { return 42; }
