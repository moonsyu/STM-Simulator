import {example} from './project.js';
import {featureExample} from './feature-examples.js';
import {defaultMcu,validateMcu,generateHal} from './mcu-config.js';

export const HAL_EXAMPLES={blink:'HAL · GPIO LED',exti:'HAL · USER 버튼 EXTI',uart:'HAL · UART 수신 인터럽트',timer:'HAL · TIM2 주기 인터럽트',adc:'HAL · ADC 분압',i2c:'HAL · I²C 메모리',spi:'HAL · SPI 메모리'};
const pin=(fn,pull='NOPULL',label='')=>({function:fn,pull,label,edge:'FALLING',initial:0});
export function halExample(kind){
  if(!HAL_EXAMPLES[kind])throw new Error('HAL 예제를 확인하세요.');
  const p=['uart','i2c','spi'].includes(kind)?featureExample(kind):example(kind==='adc'?'divider':'blink');p.name=HAL_EXAMPLES[kind];p.mcu=defaultMcu();p.firmware={mode:'hal',files:[]};
  const m=p.mcu;
  if(kind==='exti'){m.pins.PC13=pin('GPIO_EXTI','PULLUP','B1');m.nvic.EXTI15_10_IRQn={enabled:true,priority:0};}
  if(kind==='uart'){m.pins.PA2=pin('USART2_TX');m.pins.PA3=pin('USART2_RX');m.peripherals.USART2={enabled:true,baud:9600};m.nvic.USART2_IRQn={enabled:true,priority:0};}
  if(kind==='timer'){m.peripherals.TIM2={enabled:true,prescaler:8399,period:999};m.nvic.TIM2_IRQn={enabled:true,priority:0};}
  if(kind==='adc'){m.pins.PA0=pin('ADC1_IN0');m.peripherals.ADC1={enabled:true};}
  if(kind==='i2c'){m.pins.PB8=pin('I2C1_SCL');m.pins.PB9=pin('I2C1_SDA');m.peripherals.I2C1={enabled:true,clock:100000};}
  if(kind==='spi'){m.pins.PA5=pin('SPI1_SCK');m.pins.PA6=pin('SPI1_MISO');m.pins.PA7=pin('SPI1_MOSI');m.pins.PB6=pin('GPIO_Output');m.pins.PB6.initial=1;m.peripherals.SPI1={enabled:true,clock:1000000};}
  p.mcu=validateMcu(m);p.code=generateHal(p.mcu);
  const user=(section,text)=>{const re=new RegExp(`/\\* USER CODE BEGIN ${section} \\*/[\\s\\S]*?/\\* USER CODE END ${section} \\*/`);p.code=p.code.replace(re,`/* USER CODE BEGIN ${section} */\n${text}\n    /* USER CODE END ${section} */`);};
  if(kind==='exti'||kind==='timer'){
    user(3,'    HAL_Delay(10);');
    p.code=p.code.replace(kind==='exti'?'  /* 핀 번호에 따라 인터럽트 처리를 작성하세요. */':'  /* TIM2 주기 인터럽트 */',kind==='exti'?'  if (GPIO_Pin == GPIO_PIN_13) HAL_GPIO_TogglePin(GPIOA, GPIO_PIN_5);':'  if (htim->Instance == TIM2) HAL_GPIO_TogglePin(GPIOA, GPIO_PIN_5);');
  }
  if(kind==='uart'){
    p.code='uint8_t rx[1];\n'+p.code;user(2,'  uint8_t message[] = "HAL UART ready\\r\\n";\n  HAL_UART_Transmit(&huart2, message, sizeof(message)-1, 100);\n  HAL_UART_Receive_IT(&huart2, rx, 1);');user(3,'    HAL_Delay(10);');
    p.code=p.code.replace('  /* HAL_UART_Receive_IT() 수신 완료 */','  HAL_UART_Transmit_IT(huart, rx, 1);\n  HAL_UART_Receive_IT(huart, rx, 1);');
  }
  if(kind==='adc')user(3,'    HAL_ADC_Start(&hadc1);\n    HAL_ADC_PollForConversion(&hadc1, 10);\n    uint32_t value = HAL_ADC_GetValue(&hadc1);\n    Serial.println(value); // 시뮬레이터 로그\n    HAL_Delay(500);');
  if(kind==='i2c')user(2,'  uint8_t tx[1] = {42};\n  uint8_t rx[1] = {0};\n  HAL_I2C_Mem_Write(&hi2c1, 0x50 << 1, 0x10, I2C_MEMADD_SIZE_8BIT, tx, 1, 100);\n  HAL_I2C_Mem_Read(&hi2c1, 0x50 << 1, 0x10, I2C_MEMADD_SIZE_8BIT, rx, 1, 100);\n  Serial.println(rx[0]); // 시뮬레이터 로그');
  if(kind==='spi'){
    // The existing SPI example uses PB6 as the software CS output.
    user(2,'  uint8_t tx[3] = {0x02, 0x10, 42};\n  uint8_t readCmd[2] = {0x03, 0x10};\n  uint8_t rx[1] = {0};\n  HAL_GPIO_WritePin(GPIOB, GPIO_PIN_6, GPIO_PIN_RESET);\n  HAL_SPI_Transmit(&hspi1, tx, 3, 100);\n  HAL_GPIO_WritePin(GPIOB, GPIO_PIN_6, GPIO_PIN_SET);\n  HAL_GPIO_WritePin(GPIOB, GPIO_PIN_6, GPIO_PIN_RESET);\n  HAL_SPI_Transmit(&hspi1, readCmd, 2, 100);\n  HAL_SPI_Receive(&hspi1, rx, 1, 100);\n  HAL_GPIO_WritePin(GPIOB, GPIO_PIN_6, GPIO_PIN_SET);\n  Serial.println(rx[0]); // 시뮬레이터 로그');user(3,'    HAL_Delay(100);');
  }
  return p;
}
