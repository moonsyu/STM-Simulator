import {blankProject} from './project.js';
import {DEVICE_DEFS,I2C_DEVICES} from './device-defs.js';
import {defaultMcu,validateMcu,generateHal} from './mcu-config.js';
import {boardPin} from './pins.js';

export const DEVICE_EXAMPLES=Object.fromEntries(Object.entries(DEVICE_DEFS).map(([type,p])=>[type,'HAL · '+p.name]));
export const DEVICE_GUIDES={
 ldr:'3V3–LDR–PA0–10 kΩ–GND · 조도를 바꾸면 ADC 전압이 변합니다.',
 ntc:'3V3–10 kΩ–PA0–NTC–GND · ADC와 B3950 식으로 온도를 계산합니다.',
 sht31:'I2C1 PB9(SDA)/PB8(SCL), 3V3/GND · 0x44 단발 측정과 CRC 검사',
 mpu6050:'I2C1 PB9(SDA)/PB8(SCL), 3V3/GND · WHO_AM_I 확인, 절전 해제, ±2 g / ±250 °/s 읽기',
 pir:'PIR 5V/GND, OUT→PA10 EXTI · 감지 속성을 바꾸면 인터럽트 로그가 출력됩니다.',
 oled:'SSD1306 3V3/GND, PB9(SDA)/PB8(SCL), 0x3C · 페이지별 픽셀과 움직이는 막대',
 tft:'ST7735 3V3/GND, PA5(SCK)/PA7(MOSI), PB6(CS)/PB7(DC)/PC7(RST) · RGB565 컬러 바',
 matrix:'MAX7219 레벨 변환 모듈 5V/GND, PA5(CLK)/PA7(DIN)/PB6(LOAD) · 8×8 이동 패턴',
 servo:'5V/GND, TIM2 CH1 PA5 · 50 Hz, 1/1.5/2 ms 펄스 · PWM 파형 자동 활성화',
 motor:'H 브리지 5V/GND, TIM2 CH1 PA5 PWM, PB6(IN1)/PB7(IN2) · 속도·방향 전환',
 stepper:'4상 드라이버 5V/GND, PB3/PB4/PB5/PB6 · 8 ms마다 상 전환, 1.8° 스텝',
 relay:'릴레이 5V/GND, PA5(IN), COM→3V3, NO→330 Ω→LED→GND · 1초마다 접점 전환',
 joystick:'3V3/GND, X→PA0 ADC, Y→PA1 ADC, SW→PA10 PULLUP · 축과 누름 상태 조절',
 encoder:'3V3/GND, A→PA0 EXTI, B→PA1 EXTI, SW→PA10 · 위치 1칸 = 직교 펄스 4전이'
};
const pin=(fn,pull='NOPULL',initial=0)=>({function:fn,pull,initial,label:'',edge:'CHANGE'});
const adcRead=`HAL_ADC_Start(&hadc1);
    HAL_ADC_PollForConversion(&hadc1, 10);
    uint32_t raw = HAL_ADC_GetValue(&hadc1);`;
const spiHelper=`void transferByte(uint8_t data) {
  uint8_t bytes[1] = {data};
  if (HAL_SPI_Transmit(&hspi1, bytes, 1, 100) != HAL_OK) printf("SPI timeout\\n");
}
void tftCommand(uint8_t command) {
  HAL_GPIO_WritePin(GPIOB, GPIO_PIN_6, GPIO_PIN_RESET);
  HAL_GPIO_WritePin(GPIOB, GPIO_PIN_7, GPIO_PIN_RESET);
  transferByte(command);
  HAL_GPIO_WritePin(GPIOB, GPIO_PIN_7, GPIO_PIN_SET);
}
void tftEnd(void) { HAL_GPIO_WritePin(GPIOB, GPIO_PIN_6, GPIO_PIN_SET); }
`;
export function deviceExample(kind){
 const p=blankProject(),m=defaultMcu();m.pins={};m.peripherals={};m.nvic={};
 p.name=DEVICE_EXAMPLES[kind];p.simulation={stepMs:1,pwmWaveform:false};
 const def=DEVICE_DEFS[kind];p.components=[{id:'demo',name:def.prefix+'1',type:kind,x:780,y:300,rotation:0,...(['ldr','ntc'].includes(kind)?{span:70}:{}),...def.defaults}];
 let n=0;const wire=(from,to)=>p.wires.push({id:'w'+(++n),from,to,color:from===boardPin('GND')?'#4e647b':from===boardPin('3V3')||from===boardPin('5V')?'#dd654c':'#23a68a'});
 const term=(i,id='demo')=>`part:${id}:${typeof i==='number'?'p'+i:i}`;
 const connect=(signal,i,id='demo')=>wire(boardPin(signal),term(i,id));
 const output=(signal,initial=0)=>m.pins[signal]=pin('GPIO_Output','NOPULL',initial);
 const analog=(signal,ch)=>{m.pins[signal]=pin('ADC1_IN'+ch);m.peripherals.ADC1={enabled:true};};
 if(!['ldr','ntc'].includes(kind)){connect(['pir','matrix','servo','motor','stepper','relay'].includes(kind)?'5V':'3V3',1);connect('GND',2);}
 if(I2C_DEVICES.includes(kind)){m.pins.PB8=pin('I2C1_SCL');m.pins.PB9=pin('I2C1_SDA');m.peripherals.I2C1={enabled:true,clock:100000};connect('PB9',3);connect('PB8',4);}
 if(['tft','matrix'].includes(kind)){m.pins.PA5=pin('SPI1_SCK');m.pins.PA6=pin('SPI1_MISO');m.pins.PA7=pin('SPI1_MOSI');output('PB6',1);m.peripherals.SPI1={enabled:true,clock:1000000};connect('PB6',3);connect('PA5',4);connect('PA7',5);}
 if(kind==='tft'){output('PB7');output('PC7',1);connect('PB7',6);connect('PC7',7);}
 if(['ldr','ntc'].includes(kind)){
  analog('PA0',0);p.components.push({id:'r1',name:'R1',type:'resistor',value:10000,x:780,y:380,rotation:0,span:70});
  if(kind==='ldr'){connect('3V3','a');wire(term('b'),term('a','r1'));connect('PA0','b');connect('GND','b','r1');}
  else {connect('3V3','a','r1');wire(term('b','r1'),term('a'));connect('PA0','a');connect('GND','b');}
 }
 if(kind==='pir'){m.pins.PA10=pin('GPIO_EXTI');m.nvic.EXTI15_10_IRQn={enabled:true,priority:0};connect('PA10',3);}
 if(['servo','motor'].includes(kind)){m.pins.PA5=pin('TIM2_CH1');m.peripherals.TIM2={enabled:true,prescaler:83,period:kind==='servo'?19999:999};connect('PA5',3);p.simulation={stepMs:1,pwmWaveform:true};}
 if(kind==='motor'){output('PB6');output('PB7');connect('PB6',4);connect('PB7',5);}
 if(kind==='stepper')for(let i=0;i<4;i++){output('PB'+(i+3));connect('PB'+(i+3),i+3);}
 if(kind==='relay'){
  output('PA5');connect('PA5',3);connect('3V3',4);
  p.components.push({id:'r1',name:'R1',type:'resistor',value:330,x:780,y:400,rotation:0,span:70},{id:'led1',name:'LED1',type:'led',color:'green',x:875,y:400,rotation:0,span:42});
  wire(term(5),term('a','r1'));wire(term('b','r1'),term('a','led1'));connect('GND','b','led1');
 }
 if(kind==='joystick'){analog('PA0',0);analog('PA1',1);m.pins.PA10=pin('GPIO_Input','PULLUP');connect('PA0',3);connect('PA1',4);connect('PA10',5);}
 if(kind==='encoder'){for(const [i,signal]of ['PA0','PA1'].entries()){m.pins[signal]=pin('GPIO_EXTI','PULLUP');m.nvic['EXTI'+i+'_IRQn']={enabled:true,priority:0};connect(signal,i+3);}m.pins.PA10=pin('GPIO_Input','PULLUP');connect('PA10',5);}
 p.mcu=validateMcu(m);p.code=generateHal(p.mcu);let init='',loop='    HAL_Delay(100);',helpers='';
 if(kind==='ldr')loop=`    ${adcRead}
    printf("LDR ADC=%lu voltage=%.3f V\\n", raw, raw * 3.3 / 4095);
    HAL_Delay(250);`;
 if(kind==='ntc')loop=`    ${adcRead}
    if (raw > 0 && raw < 4095) {
      double resistance = 10000.0 * raw / (4095 - raw);
      double celsius = 1.0 / (1.0 / 298.15 + log(resistance / 10000) / 3950) - 273.15;
      printf("NTC=%.1f C R=%.0f ohm\\n", celsius, resistance);
    }
    HAL_Delay(250);`;
 if(kind==='sht31'){
  helpers=`uint8_t sensorCRC(uint8_t data[], int offset) {
  uint8_t crc = 255;
  for (int i = 0; i < 2; i++) {
    crc ^= data[offset+i];
    for (int bit = 0; bit < 8; bit++) crc = (crc & 128) ? (crc << 1) ^ 0x31 : crc << 1;
  }
  return crc;
}
`;
  loop=`    uint8_t command[2] = {0x24, 0x00};
    uint8_t data[6] = {0};
    HAL_StatusTypeDef status = HAL_I2C_Master_Transmit(&hi2c1, 0x44 << 1, command, 2, 100);
    HAL_Delay(16);
    if (status == HAL_OK && HAL_I2C_Master_Receive(&hi2c1, 0x44 << 1, data, 6, 100) == HAL_OK) {
      if (sensorCRC(data, 0) == data[2] && sensorCRC(data, 3) == data[5]) {
        float temperature = -45 + 175.0 * (data[0]*256+data[1]) / 65535;
        float humidity = 100.0 * (data[3]*256+data[4]) / 65535;
        printf("SHT31=%.1f C RH=%.1f %%\\n", temperature, humidity);
      } else printf("SHT31 CRC error\\n");
    } else printf("SHT31 NACK: power/address/wiring\\n");
    HAL_Delay(250);`;
 }
 if(kind==='mpu6050'){
  init=`  uint8_t identity[1] = {0}, wake[1] = {0};
  HAL_StatusTypeDef status = HAL_I2C_Mem_Read(&hi2c1, 0x68 << 1, 0x75, I2C_MEMADD_SIZE_8BIT, identity, 1, 100);
  printf("MPU6050 status=%d WHO_AM_I=0x%02X\\n", status, identity[0]);
  HAL_I2C_Mem_Write(&hi2c1, 0x68 << 1, 0x6B, I2C_MEMADD_SIZE_8BIT, wake, 1, 100);`;
  loop=`    uint8_t data[14] = {0};
    if (HAL_I2C_Mem_Read(&hi2c1, 0x68 << 1, 0x3B, I2C_MEMADD_SIZE_8BIT, data, 14, 100) == HAL_OK) {
      float ax = (int16_t)(data[0]*256+data[1]) / 16384.0;
      float ay = (int16_t)(data[2]*256+data[3]) / 16384.0;
      float az = (int16_t)(data[4]*256+data[5]) / 16384.0;
      float gx = (int16_t)(data[8]*256+data[9]) / 131.0;
      float gy = (int16_t)(data[10]*256+data[11]) / 131.0;
      float gz = (int16_t)(data[12]*256+data[13]) / 131.0;
      printf("MPU6050 g=(%.2f,%.2f,%.2f) dps=(%.1f,%.1f,%.1f)\\n", ax,ay,az,gx,gy,gz);
    } else printf("MPU6050 NACK\\n");
    HAL_Delay(250);`;
 }
 if(kind==='pir'){p.code=p.code.replace('  /* 핀 번호에 따라 인터럽트 처리를 작성하세요. */','  if (GPIO_Pin == GPIO_PIN_10) printf("PIR EXTI motion=%u\\n", HAL_GPIO_ReadPin(GPIOA, GPIO_PIN_10));');init='  printf("PIR: change motion in part properties\\n");';}
 if(kind==='oled'){
  helpers='uint8_t oledFrame = 0;\n';
  init=`  uint8_t commands[] = {0x00,0xAE,0x20,0x02,0xA8,63,0x8D,0x14,0xA4,0xA6,0xAF};
  printf("OLED init status=%d\\n", HAL_I2C_Master_Transmit(&hi2c1, 0x3C << 1, commands, sizeof(commands), 100));`;
  loop=`    int status = HAL_OK;
    for (int page = 0; page < 8; page++) {
      uint8_t address[4] = {0x00,0xB0+page,0x00,0x10};
      uint8_t pixels[129]; pixels[0] = 0x40;
      for (int x = 0; x < 128; x++) pixels[x+1] = (x < oledFrame || x == 0 || x == 127) ? 255 : (page == 0 ? 1 : (page == 7 ? 128 : 0));
      status |= HAL_I2C_Master_Transmit(&hi2c1, 0x3C << 1, address, 4, 100);
      status |= HAL_I2C_Master_Transmit(&hi2c1, 0x3C << 1, pixels, 129, 100);
    }
    printf("OLED frame=%u transfer status=%d\\n", oledFrame, status);
    oledFrame = (oledFrame + 16) % 128;
    HAL_Delay(250);`;
 }
 if(kind==='tft'){
  helpers=spiHelper;
  init=`  printf("TFT: initializing RGB565 display\\n");
  HAL_GPIO_WritePin(GPIOC, GPIO_PIN_7, GPIO_PIN_RESET);
  HAL_Delay(1);
  HAL_GPIO_WritePin(GPIOC, GPIO_PIN_7, GPIO_PIN_SET);
  HAL_Delay(120);
  tftCommand(0x11); tftEnd(); HAL_Delay(120);
  tftCommand(0x3A); transferByte(0x55); tftEnd();
  tftCommand(0x29); tftEnd();
  tftCommand(0x2A); transferByte(0); transferByte(0); transferByte(0); transferByte(127); tftEnd();
  tftCommand(0x2B); transferByte(0); transferByte(0); transferByte(0); transferByte(159); tftEnd();
  tftCommand(0x2C);
  for (int y = 0; y < 160; y++) {
    uint8_t row[256];
    for (int x = 0; x < 128; x++) {
      uint16_t color = x < 43 ? 0xF800 : (x < 86 ? 0x07E0 : 0x001F);
      row[x*2] = color >> 8; row[x*2+1] = color & 255;
    }
    HAL_SPI_Transmit(&hspi1, row, 256, 100);
    HAL_Delay(1);
  }
  tftEnd();
  printf("TFT: RGB565 color bars sent (CS/DC/RST and power required)\\n");`;
 }
 if(kind==='matrix'){
  helpers=`uint8_t matrixFrame = 0;
void matrixWrite(uint8_t reg, uint8_t value) {
  uint8_t data[2] = {reg,value};
  HAL_GPIO_WritePin(GPIOB, GPIO_PIN_6, GPIO_PIN_RESET);
  HAL_SPI_Transmit(&hspi1, data, 2, 100);
  HAL_GPIO_WritePin(GPIOB, GPIO_PIN_6, GPIO_PIN_SET);
}
`;
  init='  matrixWrite(9,0); matrixWrite(10,6); matrixWrite(11,7); matrixWrite(12,1);';
  loop=`    for (int row = 0; row < 8; row++) matrixWrite(row+1, 1 << ((row+matrixFrame)%8));
    printf("MAX7219 frame sent=%u\\n", matrixFrame);
    matrixFrame = (matrixFrame+1)%8;
    HAL_Delay(200);`;
 }
 if(['servo','motor'].includes(kind)){
  p.code=p.code.replace('HAL_TIM_Base_Init(&htim2)','HAL_TIM_PWM_Init(&htim2)');
  init=`  TIM_OC_InitTypeDef channel = {0};
  channel.OCMode = TIM_OCMODE_PWM1;
  channel.OCPolarity = TIM_OCPOLARITY_HIGH;
  channel.Pulse = ${kind==='servo'?1000:500};
  HAL_TIM_PWM_ConfigChannel(&htim2, &channel, TIM_CHANNEL_1);
  HAL_TIM_PWM_Start(&htim2, TIM_CHANNEL_1);`;
  if(kind==='servo'){helpers='uint32_t servoStep = 0;\n';loop=`    uint32_t pulse = 1000 + servoStep*500;
    __HAL_TIM_SET_COMPARE(&htim2, TIM_CHANNEL_1, pulse);
    printf("Servo command=%lu deg pulse=%lu us\\n", servoStep*90, pulse);
    servoStep = (servoStep+1)%3;
    HAL_Delay(1200);`;}
  else {helpers='int motorForward = 1;\n';loop=`    HAL_GPIO_WritePin(GPIOB, GPIO_PIN_6, motorForward);
    HAL_GPIO_WritePin(GPIOB, GPIO_PIN_7, !motorForward);
    __HAL_TIM_SET_COMPARE(&htim2, TIM_CHANNEL_1, motorForward ? 750 : 350);
    printf("DC command direction=%d duty=%d %%\\n", motorForward ? 1 : -1, motorForward ? 75 : 35);
    motorForward = !motorForward;
    HAL_Delay(1500);`;}
 }
 if(kind==='stepper'){
  helpers='int stepIndex = 0, commandedSteps = 0, stepDirection = 1;\n';
  loop=`    HAL_GPIO_WritePin(GPIOB, GPIO_PIN_3|GPIO_PIN_4|GPIO_PIN_5|GPIO_PIN_6, GPIO_PIN_RESET);
    HAL_GPIO_WritePin(GPIOB, 1 << (stepIndex+3), GPIO_PIN_SET);
    stepIndex = (stepIndex+stepDirection+4)%4;
    commandedSteps++;
    if (commandedSteps%100 == 0) { stepDirection = -stepDirection; printf("Stepper command direction=%d steps=%d\\n", stepDirection, commandedSteps); }
    HAL_Delay(8);`;
 }
 if(kind==='relay')loop=`    HAL_GPIO_TogglePin(GPIOA, GPIO_PIN_5);
    printf("Relay command=%u (NO powers LED)\\n", HAL_GPIO_ReadPin(GPIOA, GPIO_PIN_5));
    HAL_Delay(1000);`;
 if(kind==='joystick'){
  helpers=`uint32_t readAxis(uint32_t channel) {
  ADC_ChannelConfTypeDef config = {0}; config.Channel = channel; config.Rank = 1;
  HAL_ADC_ConfigChannel(&hadc1, &config); HAL_ADC_Start(&hadc1);
  HAL_ADC_PollForConversion(&hadc1, 10); return HAL_ADC_GetValue(&hadc1);
}
`;
  loop=`    uint32_t x = readAxis(ADC_CHANNEL_0), y = readAxis(ADC_CHANNEL_1);
    printf("Joystick X=%lu Y=%lu pressed=%u\\n", x, y, !HAL_GPIO_ReadPin(GPIOA, GPIO_PIN_10));
    HAL_Delay(100);`;
 }
 if(kind==='encoder'){
  helpers='volatile int encoderEdges = 0;\nuint8_t encoderPrevious = 3;\nint encoderTable[16] = {0,-1,1,0,1,0,0,-1,-1,0,0,1,0,1,-1,0};\n';
  p.code=p.code.replace('  /* 핀 번호에 따라 인터럽트 처리를 작성하세요. */',`  uint8_t current = HAL_GPIO_ReadPin(GPIOA, GPIO_PIN_0)*2 + HAL_GPIO_ReadPin(GPIOA, GPIO_PIN_1);
  encoderEdges += encoderTable[encoderPrevious*4+current];
  encoderPrevious = current;`);
  loop=`    printf("Encoder count=%d edges=%d pressed=%u\\n", encoderEdges/4, encoderEdges, !HAL_GPIO_ReadPin(GPIOA, GPIO_PIN_10));
    HAL_Delay(100);`;
 }
 const user=(section,text)=>{p.code=p.code.replace(new RegExp('/\\* USER CODE BEGIN '+section+' \\*/[\\s\\S]*?/\\* USER CODE END '+section+' \\*/'),`/* USER CODE BEGIN ${section} */\n${text}\n    /* USER CODE END ${section} */`);};
 user(2,init);user(3,loop);
 // Place helpers after generated handle declarations so this source is also valid C for Cube projects.
 p.code=p.code.replace('int main(void) {',helpers+'\nint main(void) {');
 p.code='#include "main.h"\n#include <stdio.h>\n'+(kind==='ntc'?'#include <math.h>\n':'')+'// '+DEVICE_GUIDES[kind]+'\n'+p.code.replace('#include "main.h"\n','');
 return p;
}
