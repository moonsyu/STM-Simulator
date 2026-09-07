import {blankProject} from './project.js';
import {defaultMcu,validateMcu,generateHal} from './mcu-config.js';
import {configureHalCircuit} from './hal-circuits.js';

export const HAL_EXAMPLES={blink:'HAL · GPIO LED',button:'HAL · GPIO 버튼 입력',exti:'HAL · USER 버튼 EXTI',uart:'HAL · UART 수신 인터럽트',timer:'HAL · TIM2 주기 인터럽트',adc:'HAL · ADC 입력',temperature:'HAL · TMP36 온도',samples:'HAL · ADC 배열 샘플링',i2c:'HAL · I²C 메모리',spi:'HAL · SPI 메모리',language:'HAL · 함수·배열·구조체',pwm:'HAL · TIM2 PWM',ultrasonic:'HAL · 초음파 거리 측정'};
export const HAL_GUIDES={blink:'PA5 → 330 Ω → LED → GND · 500 ms 점멸',button:'PA10 입력(PULLUP)–버튼–GND · 누르는 동안 PA5 LED 점등',exti:'보드 USER(PC13) → EXTI15_10_IRQn · 누를 때마다 PA5 LED 전환',uart:'USART2 PA2(TX)/PA3(RX), 9600 baud · 전원과 교차 배선이 연결된 터미널에서 송수신',timer:'TIM2 100 ms 인터럽트 · PA5 → 330 Ω → LED → GND',adc:'3V3–10 kΩ–PA0–10 kΩ–GND · 약 1.65 V, ADC 2048',temperature:'TMP36 VOUT→PA0, VCC→3V3, GND · 센서 속성에서 온도 조절',samples:'PA0에 연결된 10 kΩ / 10 kΩ 분압 · HAL polling으로 8개 값을 배열에 저장',i2c:'I2C1 PB8(SCL)/PB9(SDA) · 주소 0x50 메모리, 3V3/GND와 모듈 내부 10 kΩ 풀업',spi:'SPI1 PA5(SCK)/PA6(MISO)/PA7(MOSI), PB6(CS) · 3V3/GND 메모리',language:'외부 부품 없이 printf 로그로 평균값 확인',pwm:'TIM2 CH1 PA5 → 1 kΩ / 10 µF RC 필터 → PA0 · 100 Hz, 50%; PWM 파형 자동 활성화',ultrasonic:'HC-SR04 TRIG→PC7, ECHO→1 kΩ / 2 kΩ 분압→PA9, 5V/GND · TIM2 1 MHz, 0.1 ms 폴링'};
const pin=(fn,pull='NOPULL',label='')=>({function:fn,pull,label,edge:'FALLING',initial:0});
export function halExample(kind){
  if(!HAL_EXAMPLES[kind])throw new Error('HAL 예제를 확인하세요.');
  const p=blankProject();p.name=HAL_EXAMPLES[kind];p.mcu=defaultMcu();if(!['blink','button','exti','timer'].includes(kind))p.mcu.pins={};
  const m=p.mcu;
  if(kind==='exti'){m.pins.PC13=pin('GPIO_EXTI','PULLUP','B1');m.nvic.EXTI15_10_IRQn={enabled:true,priority:0};}
  if(kind==='button')m.pins.PA10=pin('GPIO_Input','PULLUP','BUTTON');
  if(kind==='uart'){m.pins.PA2=pin('USART2_TX');m.pins.PA3=pin('USART2_RX');m.peripherals.USART2={enabled:true,baud:9600};m.nvic.USART2_IRQn={enabled:true,priority:0};}
  if(kind==='timer'){m.peripherals.TIM2={enabled:true,prescaler:8399,period:999};m.nvic.TIM2_IRQn={enabled:true,priority:0};}
  if(['adc','temperature','samples'].includes(kind)){m.pins.PA0=pin('ADC1_IN0');m.peripherals.ADC1={enabled:true};}
  if(kind==='i2c'){m.pins.PB8=pin('I2C1_SCL');m.pins.PB9=pin('I2C1_SDA');m.peripherals.I2C1={enabled:true,clock:100000};}
  if(kind==='spi'){m.pins.PA5=pin('SPI1_SCK');m.pins.PA6=pin('SPI1_MISO');m.pins.PA7=pin('SPI1_MOSI');m.pins.PB6=pin('GPIO_Output');m.pins.PB6.initial=1;m.peripherals.SPI1={enabled:true,clock:1000000};}
  if(kind==='pwm'){m.pins.PA5=pin('TIM2_CH1');m.pins.PA0=pin('GPIO_Input');m.peripherals.TIM2={enabled:true,prescaler:839,period:999};}
  if(kind==='ultrasonic'){m.pins.PC7=pin('GPIO_Output');m.pins.PA9=pin('GPIO_Input');m.peripherals.TIM2={enabled:true,prescaler:83,period:4294967295};}
  p.mcu=validateMcu(m);p.code=generateHal(p.mcu);
  const user=(section,text)=>{const re=new RegExp(`/\\* USER CODE BEGIN ${section} \\*/[\\s\\S]*?/\\* USER CODE END ${section} \\*/`);p.code=p.code.replace(re,`/* USER CODE BEGIN ${section} */\n${text}\n    /* USER CODE END ${section} */`);};
  if(kind==='blink')user(3,'    HAL_GPIO_TogglePin(GPIOA, GPIO_PIN_5);\n    printf("PA5=%u\\n", HAL_GPIO_ReadPin(GPIOA, GPIO_PIN_5));\n    HAL_Delay(500);');
  if(kind==='button')user(3,'    GPIO_PinState pressed = HAL_GPIO_ReadPin(GPIOA, GPIO_PIN_10) == GPIO_PIN_RESET;\n    HAL_GPIO_WritePin(GPIOA, GPIO_PIN_5, pressed);\n    printf("button=%u\\n", pressed);\n    HAL_Delay(100);');
  if(kind==='exti'||kind==='timer'){
    user(3,'    HAL_Delay(10);');
    p.code=p.code.replace(kind==='exti'?'  /* 핀 번호에 따라 인터럽트 처리를 작성하세요. */':'  /* TIM2 주기 인터럽트 */',kind==='exti'?'  if (GPIO_Pin == GPIO_PIN_13) { HAL_GPIO_TogglePin(GPIOA, GPIO_PIN_5); printf("EXTI PC13\\n"); }':'  if (htim->Instance == TIM2) { HAL_GPIO_TogglePin(GPIOA, GPIO_PIN_5); printf("TIM2 tick=%lu\\n", HAL_GetTick()); }');
  }
  if(kind==='uart'){
    p.code='uint8_t rx[1];\n'+p.code;user(2,'  uint8_t message[] = "HAL UART ready\\r\\n";\n  HAL_UART_Transmit(&huart2, message, sizeof(message)-1, 100);\n  HAL_UART_Receive_IT(&huart2, rx, 1);');user(3,'    HAL_Delay(10);');
    p.code=p.code.replace('  /* HAL_UART_Receive_IT() 수신 완료 */','  HAL_UART_Transmit_IT(huart, rx, 1);\n  HAL_UART_Receive_IT(huart, rx, 1);');
  }
  if(['adc','temperature'].includes(kind))user(3,'    HAL_ADC_Start(&hadc1);\n    HAL_ADC_PollForConversion(&hadc1, 10);\n    uint32_t value = HAL_ADC_GetValue(&hadc1);\n'+(kind==='temperature'?'    float celsius = (value * 3.3 / 4095 - 0.5) * 100;\n    printf("TMP36=%.1f C\\n", celsius);':'    printf("%lu\\n", value);')+'\n    HAL_Delay(500);');
  if(kind==='samples')user(3,'    uint16_t values[8];\n    for (int i = 0; i < 8; i++) {\n      HAL_ADC_Start(&hadc1);\n      HAL_ADC_PollForConversion(&hadc1, 10);\n      values[i] = HAL_ADC_GetValue(&hadc1);\n      printf("sample[%d]=%u\\n", i, values[i]);\n      HAL_Delay(10);\n    }\n    HAL_Delay(500);');
  if(kind==='i2c')user(2,'  uint8_t tx[1] = {42};\n  uint8_t rx[1] = {0};\n  HAL_StatusTypeDef writeStatus = HAL_I2C_Mem_Write(&hi2c1, 0x50 << 1, 0x10, I2C_MEMADD_SIZE_8BIT, tx, 1, 100);\n  HAL_StatusTypeDef readStatus = HAL_I2C_Mem_Read(&hi2c1, 0x50 << 1, 0x10, I2C_MEMADD_SIZE_8BIT, rx, 1, 100);\n  printf("I2C write=%d read=%d\\n", writeStatus, readStatus);\n  printf("%u\\n", rx[0]);');
  if(kind==='spi'){
    user(2,'  uint8_t tx[3] = {0x02, 0x10, 42};\n  uint8_t readCmd[2] = {0x03, 0x10};\n  uint8_t rx[1] = {0};\n  HAL_GPIO_WritePin(GPIOB, GPIO_PIN_6, GPIO_PIN_RESET);\n  HAL_SPI_Transmit(&hspi1, tx, 3, 100);\n  HAL_GPIO_WritePin(GPIOB, GPIO_PIN_6, GPIO_PIN_SET);\n  HAL_GPIO_WritePin(GPIOB, GPIO_PIN_6, GPIO_PIN_RESET);\n  HAL_SPI_Transmit(&hspi1, readCmd, 2, 100);\n  HAL_SPI_Receive(&hspi1, rx, 1, 100);\n  HAL_GPIO_WritePin(GPIOB, GPIO_PIN_6, GPIO_PIN_SET);\n  printf("%u\\n", rx[0]);');user(3,'    HAL_Delay(100);');
  }
  if(kind==='language'){p.code='struct Reading { int total; int count; };\nint average(int data[], int count) {\n  struct Reading result = {0, count};\n  struct Reading *p = &result;\n  for (int i = 0; i < count; i++) p->total += data[i];\n  return result.total / result.count;\n}\n'+p.code;user(2,'  int samples[] = {10, 20, 30, 40};\n  printf("average=%d\\n", average(samples, 4));');}
  if(kind==='pwm'){p.code=p.code.replace('HAL_TIM_Base_Init(&htim2)','HAL_TIM_PWM_Init(&htim2)');user(2,'  TIM_OC_InitTypeDef channel = {0};\n  channel.OCMode = TIM_OCMODE_PWM1;\n  channel.Pulse = 500;\n  channel.OCPolarity = TIM_OCPOLARITY_HIGH;\n  HAL_TIM_PWM_ConfigChannel(&htim2, &channel, TIM_CHANNEL_1);\n  HAL_TIM_PWM_Start(&htim2, TIM_CHANNEL_1);\n  printf("TIM2 PWM: 100 Hz, duty 50%%\\n");');}
  if(kind==='ultrasonic'){
    p.code='uint32_t phase = 0, started = 0, echoStarted = 0;\n'+p.code;
    user(2,'  HAL_TIM_Base_Start(&htim2);');
    user(3,'    uint32_t now = __HAL_TIM_GET_COUNTER(&htim2);\n    if (phase == 0) { HAL_GPIO_WritePin(GPIOC, GPIO_PIN_7, GPIO_PIN_SET); started = now; phase = 1; }\n    else if (phase == 1 && (uint32_t)(now - started) >= 10) { HAL_GPIO_WritePin(GPIOC, GPIO_PIN_7, GPIO_PIN_RESET); started = now; phase = 2; }\n    else if (phase == 2) {\n      if (HAL_GPIO_ReadPin(GPIOA, GPIO_PIN_9) == GPIO_PIN_SET) { echoStarted = now; phase = 3; }\n      else if ((uint32_t)(now - started) >= 30000) { printf("HC-SR04 timeout\\n"); phase = 4; }\n    }\n    else if (phase == 3) {\n      if (HAL_GPIO_ReadPin(GPIOA, GPIO_PIN_9) == GPIO_PIN_RESET) { printf("distance=%.1f cm\\n", (uint32_t)(now - echoStarted) / 58.0); phase = 4; }\n      else if ((uint32_t)(now - started) >= 30000) { printf("HC-SR04 timeout\\n"); phase = 4; }\n    }\n    else if (phase == 4 && (uint32_t)(now - started) >= 60000) phase = 0;');
  }
  p.code='#include "main.h"\n#include <stdio.h>\n// '+HAL_GUIDES[kind]+'\n'+p.code.replace('#include "main.h"\n','');
  return configureHalCircuit(p,kind);
}

export function applyHalExample(project,kind){
  const sample=halExample(kind);
  return {...sample,name:project.name};
}
