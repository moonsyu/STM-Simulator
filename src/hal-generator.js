import {SERIAL_IDS,isSerial,serialAf,serialHandle,serialFunction} from './serial-config.js';
import {TIMER_IDS,isTimer,timerAf} from './timer-config.js';

export function clockPlan(hz){
  // HSI removes any dependency on the Nucleo ST-LINK MCO / HSE jumper.
  // APB1=/2, TIMx=HCLK, APB2=/1; F446 APB1 is limited to 45 MHz.
  for(const divider of [4,2,6,8]){const n=hz*divider/1000000;if(hz<=90000000&&Number.isInteger(n)&&n>=100&&n<=432)return {n,divider,latency:Math.ceil(hz/30000000)-1};}
  throw new Error('main.c 생성: HSI PLL로 만들 수 있는 APB1 타이머 클록(12.5~90 MHz)을 사용하세요. 기본값은 84 MHz입니다.');
}
export function generateMain(config){
  const clock=clockPlan(config.timerClockHz),lines=['#include "main.h"','#include <stdio.h>','',
    '/* Copy this main.c into a CubeIDE STM32F446RE project with matching',
    ' * pin / peripheral / NVIC settings and Cube-generated IRQ / MSP files.',
    ' * Clock: HSI PLL, APB1 timer clock = '+config.timerClockHz+' Hz.',
    ' * printf: SWV ITM port 0 (enable SWV in the debugger). UART uses its pins.',
    ' * With newlib-nano, enable -u _printf_float for floating-point printf. */',''];
  for(const [pin,p]of Object.entries(config.pins))if(p.label)lines.push(`#ifndef ${p.label}_Pin`,`#define ${p.label}_Pin GPIO_PIN_${pin.slice(2)}`,'#endif',`#ifndef ${p.label}_GPIO_Port`,`#define ${p.label}_GPIO_Port GPIO${pin[1]}`,'#endif');
  const handles={...Object.fromEntries(SERIAL_IDS.map(id=>[id,['UART',serialHandle(id)]])),I2C1:['I2C','hi2c1'],SPI1:['SPI','hspi1'],ADC1:['ADC','hadc1'],...Object.fromEntries(TIMER_IDS.map(id=>[id,['TIM','htim'+id.slice(3)]]))};
  const active=Object.entries(config.peripherals).filter(([,p])=>p.enabled),serials=active.filter(([id])=>isSerial(id)),timers=active.filter(([id])=>isTimer(id));
  for(const [id]of active){const [type,name]=handles[id];lines.push(`${type}_HandleTypeDef ${name};`);}
  const initName=id=>`MX_${id}${isSerial(id)?'_UART':''}_Init`;
  lines.push('','void SystemClock_Config(void);','void Error_Handler(void);','static void MX_GPIO_Init(void);',...active.map(([id])=>`static void ${initName(id)}(void);`),'',
    'int main(void) {','  HAL_Init();','  SystemClock_Config();','  MX_GPIO_Init();',...active.map(([id])=>`  ${initName(id)}();`),'  /* USER CODE BEGIN 2 */');
  for(const [id,p]of timers){const h=handles[id][1];
    if(p.mode==='encoder')lines.push(`  HAL_TIM_Encoder_Start(&${h}, TIM_CHANNEL_ALL);`);
    else if(['pwm','capture'].includes(p.mode)){for(const value of Object.values(config.pins)){const match=new RegExp('^'+id+'_CH([1-4])$').exec(value.function);if(match)lines.push(`  HAL_TIM_${p.mode==='pwm'?'PWM_Start':'IC_Start'+(config.nvic[id+'_IRQn']?.enabled?'_IT':'')}(&${h}, TIM_CHANNEL_${match[1]});`);}}
    else if(config.nvic[id+'_IRQn']?.enabled)lines.push(`  HAL_TIM_Base_Start_IT(&${h});`);
  }
  if(serials.length){lines.push('  uint8_t message[] = "HAL ready\\r\\n";');for(const [id]of serials)lines.push(`  HAL_UART_Transmit(&${serialHandle(id)}, message, sizeof(message)-1, 100);`);}
  lines.push('  /* USER CODE END 2 */','  while (1) {','    /* USER CODE BEGIN 3 */');
  const output=Object.entries(config.pins).find(([,p])=>p.function==='GPIO_Output');if(output)lines.push(`    HAL_GPIO_TogglePin(GPIO${output[0][1]}, GPIO_PIN_${output[0].slice(2)});`);
  lines.push('    HAL_Delay(500);','    /* USER CODE END 3 */','  }','}','',
    'void SystemClock_Config(void) {','  RCC_OscInitTypeDef osc = {0};','  RCC_ClkInitTypeDef clk = {0};',
    '  __HAL_RCC_PWR_CLK_ENABLE();','  __HAL_PWR_VOLTAGESCALING_CONFIG(PWR_REGULATOR_VOLTAGE_SCALE1);',
    '  osc.OscillatorType = RCC_OSCILLATORTYPE_HSI;','  osc.HSIState = RCC_HSI_ON;','  osc.HSICalibrationValue = RCC_HSICALIBRATION_DEFAULT;',
    '  osc.PLL.PLLState = RCC_PLL_ON;','  osc.PLL.PLLSource = RCC_PLLSOURCE_HSI;','  osc.PLL.PLLM = 16;',`  osc.PLL.PLLN = ${clock.n};`,`  osc.PLL.PLLP = RCC_PLLP_DIV${clock.divider};`,'  osc.PLL.PLLQ = 7;',
    '  if (HAL_RCC_OscConfig(&osc) != HAL_OK) Error_Handler();',
    '  clk.ClockType = RCC_CLOCKTYPE_HCLK | RCC_CLOCKTYPE_SYSCLK | RCC_CLOCKTYPE_PCLK1 | RCC_CLOCKTYPE_PCLK2;',
    '  clk.SYSCLKSource = RCC_SYSCLKSOURCE_PLLCLK;','  clk.AHBCLKDivider = RCC_SYSCLK_DIV1;',
    '  clk.APB1CLKDivider = RCC_HCLK_DIV2;','  clk.APB2CLKDivider = RCC_HCLK_DIV1;',
    `  if (HAL_RCC_ClockConfig(&clk, FLASH_LATENCY_${clock.latency}) != HAL_OK) Error_Handler();`,'}',
    '', 'static void MX_GPIO_Init(void) {','  GPIO_InitTypeDef GPIO_InitStruct = {0};');
  for(const port of new Set(Object.keys(config.pins).map(p=>p[1])))lines.push(`  __HAL_RCC_GPIO${port}_CLK_ENABLE();`);
  for(const [pin,p]of Object.entries(config.pins)){
    if(['Reset','Reserved'].includes(p.function))continue;
    if(p.function==='GPIO_Output')lines.push(`  HAL_GPIO_WritePin(GPIO${pin[1]}, GPIO_PIN_${pin.slice(2)}, GPIO_PIN_${p.initial?'SET':'RESET'});`);
    const mode=p.function==='GPIO_Output'?'OUTPUT_PP':p.function==='GPIO_EXTI'?`IT_${p.edge==='CHANGE'?'RISING_FALLING':p.edge}`:p.function==='Analog'||p.function.startsWith('ADC1_')?'ANALOG':p.function==='GPIO_Input'?'INPUT':p.function.startsWith('I2C1_')?'AF_OD':'AF_PP';
    lines.push(`  GPIO_InitStruct.Pin = GPIO_PIN_${pin.slice(2)};`,`  GPIO_InitStruct.Mode = GPIO_MODE_${mode};`,`  GPIO_InitStruct.Pull = GPIO_${p.pull};`,'  GPIO_InitStruct.Speed = GPIO_SPEED_FREQ_VERY_HIGH;');
    if(mode.startsWith('AF_')){const serial=serialFunction(p.function),timer=p.function.split('_')[0],af=serial?`GPIO_AF${serialAf(serial)}_${serial}`:p.function.startsWith('I2C1_')?'GPIO_AF4_I2C1':p.function.startsWith('SPI1_')?'GPIO_AF5_SPI1':`GPIO_AF${timerAf(timer)}_${timer}`;lines.push(`  GPIO_InitStruct.Alternate = ${af};`);}
    lines.push(`  HAL_GPIO_Init(GPIO${pin[1]}, &GPIO_InitStruct);`);
  }
  for(const [irq,p]of Object.entries(config.nvic))if(p.enabled)lines.push(`  HAL_NVIC_SetPriority(${irq}, ${p.priority}, 0);`,`  HAL_NVIC_EnableIRQ(${irq});`);
  lines.push('}');
  for(const [id,p]of active){const [type,name]=handles[id];lines.push('',`static void ${initName(id)}(void) {`,`  __HAL_RCC_${id}_CLK_ENABLE();`,`  ${name}.Instance = ${id};`);
    const set=(key,value)=>lines.push(`  ${name}.Init.${key} = ${value};`);
    if(isSerial(id))for(const [k,v]of Object.entries({BaudRate:p.baud,WordLength:'UART_WORDLENGTH_8B',StopBits:'UART_STOPBITS_1',Parity:'UART_PARITY_NONE',Mode:'UART_MODE_TX_RX',HwFlowCtl:'UART_HWCONTROL_NONE',OverSampling:'UART_OVERSAMPLING_16'}))set(k,v);
    if(id==='I2C1')for(const [k,v]of Object.entries({ClockSpeed:p.clock,DutyCycle:'I2C_DUTYCYCLE_2',OwnAddress1:0,AddressingMode:'I2C_ADDRESSINGMODE_7BIT',DualAddressMode:'I2C_DUALADDRESS_DISABLE',OwnAddress2:0,GeneralCallMode:'I2C_GENERALCALL_DISABLE',NoStretchMode:'I2C_NOSTRETCH_DISABLE'}))set(k,v);
    if(id==='SPI1')for(const [k,v]of Object.entries({Mode:'SPI_MODE_MASTER',Direction:'SPI_DIRECTION_2LINES',DataSize:'SPI_DATASIZE_8BIT',CLKPolarity:'SPI_POLARITY_LOW',CLKPhase:'SPI_PHASE_1EDGE',NSS:'SPI_NSS_SOFT',BaudRatePrescaler:'SPI_BAUDRATEPRESCALER_'+Math.min(256,2**Math.max(1,Math.ceil(Math.log2(config.timerClockHz/p.clock)))),FirstBit:'SPI_FIRSTBIT_MSB',TIMode:'SPI_TIMODE_DISABLE',CRCCalculation:'SPI_CRCCALCULATION_DISABLE',CRCPolynomial:10}))set(k,v);
    if(id==='ADC1')for(const [k,v]of Object.entries({ClockPrescaler:'ADC_CLOCK_SYNC_PCLK_DIV4',Resolution:'ADC_RESOLUTION_12B',ScanConvMode:'DISABLE',ContinuousConvMode:'DISABLE',DiscontinuousConvMode:'DISABLE',ExternalTrigConvEdge:'ADC_EXTERNALTRIGCONVEDGE_NONE',ExternalTrigConv:'ADC_SOFTWARE_START',DataAlign:'ADC_DATAALIGN_RIGHT',NbrOfConversion:1,DMAContinuousRequests:'DISABLE',EOCSelection:'ADC_EOC_SINGLE_CONV'}))set(k,v);
    if(isTimer(id))for(const [k,v]of Object.entries({Prescaler:p.prescaler,CounterMode:'TIM_COUNTERMODE_UP',Period:p.period,ClockDivision:'TIM_CLOCKDIVISION_DIV1',AutoReloadPreload:'TIM_AUTORELOAD_PRELOAD_DISABLE'}))set(k,v);
    if(isTimer(id)&&p.mode==='encoder'){
      lines.push('  TIM_Encoder_InitTypeDef encoder = {0};','  encoder.EncoderMode = TIM_ENCODERMODE_TI12;');
      for(const n of [1,2])lines.push(`  encoder.IC${n}Polarity = TIM_ICPOLARITY_RISING;`,`  encoder.IC${n}Selection = TIM_ICSELECTION_DIRECTTI;`,`  encoder.IC${n}Prescaler = TIM_ICPSC_DIV1;`,`  encoder.IC${n}Filter = 0;`);
      lines.push(`  HAL_TIM_Encoder_Init(&${name}, &encoder);`);
    }else lines.push(`  HAL_${type}${isTimer(id)?p.mode==='pwm'?'_PWM':p.mode==='capture'?'_IC':'_Base':''}_Init(&${name});`);
    if(id==='ADC1'){const channel=Object.values(config.pins).find(p=>p.function.startsWith('ADC1_IN')).function.slice(7);lines.push('  ADC_ChannelConfTypeDef sConfig = {0};',`  sConfig.Channel = ADC_CHANNEL_${channel};`,'  sConfig.Rank = 1;','  sConfig.SamplingTime = ADC_SAMPLETIME_480CYCLES;','  HAL_ADC_ConfigChannel(&hadc1, &sConfig);');}
    if(isTimer(id)&&['pwm','capture'].includes(p.mode)){
      lines.push(`  ${p.mode==='pwm'?'TIM_OC_InitTypeDef':'TIM_IC_InitTypeDef'} channel = {0};`);
      if(p.mode==='pwm')lines.push('  channel.OCMode = TIM_OCMODE_PWM1;','  channel.OCPolarity = TIM_OCPOLARITY_HIGH;',`  channel.Pulse = ${Math.floor((p.period+1)/2)};`,'  channel.OCFastMode = TIM_OCFAST_DISABLE;');
      else lines.push('  channel.ICPolarity = TIM_ICPOLARITY_RISING;','  channel.ICSelection = TIM_ICSELECTION_DIRECTTI;','  channel.ICPrescaler = TIM_ICPSC_DIV1;','  channel.ICFilter = 0;');
      for(const value of Object.values(config.pins)){const m=new RegExp('^'+id+'_CH([1-4])$').exec(value.function);if(m)lines.push(`  HAL_TIM_${p.mode==='pwm'?'PWM':'IC'}_ConfigChannel(&${name}, &channel, TIM_CHANNEL_${m[1]});`);}
    }
    lines.push('}');
  }
  if(Object.values(config.pins).some(p=>p.function==='GPIO_EXTI'))lines.push('','void HAL_GPIO_EXTI_Callback(uint16_t GPIO_Pin) {','  /* 핀 번호에 따라 인터럽트 처리를 작성하세요. */','}');
  if(serials.length)lines.push('','void HAL_UART_RxCpltCallback(UART_HandleTypeDef *huart) {','  /* HAL_UART_Receive_IT() 수신 완료 */','}');
  if(timers.length)lines.push('','void HAL_TIM_PeriodElapsedCallback(TIM_HandleTypeDef *htim) {','  /* 타이머 주기 인터럽트 */','}');
  if(timers.some(([,p])=>p.mode==='capture'))lines.push('','void HAL_TIM_IC_CaptureCallback(TIM_HandleTypeDef *htim) {','  /* Read HAL_TIM_ReadCapturedValue(htim, TIM_CHANNEL_1). */','}');
  lines.push('','int __io_putchar(int ch) {','  ITM_SendChar(ch);','  return ch;','}','',
    'void Error_Handler(void) {','  __disable_irq();','  while (1) { }','}');
  return lines.join('\n')+'\n';
}
