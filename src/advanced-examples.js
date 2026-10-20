import {exampleProject} from './project.js';
import {halExample as baseExample} from './hal-examples.js';
import {deviceExample} from './device-examples.js';
import {validateMcu,generateHal} from './mcu-config.js';
import {boardPin} from './pins.js';
import {EXAMPLE_TIMER_CLOCK_HZ} from './mcu-defaults.js';
// HAL interpreter examples for NVIC preemption, DMA, synchronous USART, camera, SD card and wire noise.
export const ADVANCED_EXAMPLES={dma_uart_echo:'HAL · DMA UART 에코 (ReceiveToIdle)',adc_dma_scan:'HAL · ADC DMA 2채널 스캔',nvic_preemption:'HAL · NVIC 선점 우선순위 데모',
 usart_sync_matrix:'HAL · USART 동기 모드 → MAX7219 시프트 레지스터',camera_tft:'HAL · 카메라 캡처 → TFT 표시 (DCMI DMA)',sd_logger:'HAL · SD 카드 데이터 로거 (FatFs)',noise_errors:'HAL · 통신 노이즈와 오류 처리'};
export const ADVANCED_GUIDES={
 dma_uart_echo:'USART2 PA2/PA3 115200 baud, RX DMA1 Stream5 순환 + IDLE 감지, TX DMA1 Stream6 · 하단 통신 탭(ST-LINK VCP)에서 보낸 문자열을 DMA로 에코 · HAL_UARTEx_RxEventCallback',
 adc_dma_scan:'조이스틱 X→PA0(IN0), Y→PA1(IN1) · ADC1 스캔 2채널 연속 변환, DMA2 Stream0 순환 · HAL_ADC_ConvHalfCpltCallback/ConvCpltCallback으로 평균 계산',
 nvic_preemption:'PA5 LED, USER 버튼 PC13 EXTI(우선순위 0) · TIM2 주기 인터럽트(우선순위 3)의 긴 반복을 버튼 인터럽트가 중간에 선점 · SysTick 우선순위 확인',
 usart_sync_matrix:'USART2 동기: CK PA4 → CLK, TX PA2 → DIN, PB6 → LOAD · 5V/GND · LSB 우선 USART를 비트 반전해 MSB 우선 MAX7219에 전송, CPOL/CPHA/LastBit 실습',
 camera_tft:'OV2640: 3V3/GND, SCCB PB8/PB9, RESET PC8, PWDN PC6, XCLK PA8(MCO) · ST7735: PA5/PA7 SPI, PB6 CS, PB7 DC, PC7 RST · DCMI DMA 스냅샷(QQVGA RGB565) → SPI DMA로 화면 표시',
 sd_logger:'Micro SD 보드: 3V3/GND, PA5 CLK, PA7 CMD(MOSI), PA6 D0(MISO), PB6 D3(CS) · FatFs f_mount/f_open/f_printf/f_gets로 LOG.TXT 기록 · 카드 이미지는 프로젝트에 저장',
 noise_errors:'project.simulation.noise 활성 · USART2 수신 오류(FE/PE/NE) HAL_UART_ErrorCallback, I²C 메모리(0x50) NACK 재시도 · 신호 분석기에서 깨진 비트 확인'};
const pin=(fn,extra={})=>({function:fn,pull:'NOPULL',edge:'FALLING',initial:0,label:'',...extra});
const section=(code,n,text)=>code.replace(new RegExp(`/\\* USER CODE BEGIN ${n} \\*/[\\s\\S]*?/\\* USER CODE END ${n} \\*/`),`/* USER CODE BEGIN ${n} */\n${text}\n    /* USER CODE END ${n} */`);
function finish(p,kind,{globals='',init='',loop='    HAL_Delay(10);',callbacks=''}){
 p.name=ADVANCED_EXAMPLES[kind];p.mcu=validateMcu(p.mcu);
 let code=generateHal(p.mcu,{minimal:true}).replace('int main(void) {',globals+'\nint main(void) {');code=section(section(code,2,init),3,loop);
 p.code='#include "main.h"\n#include <stdio.h>\n// '+ADVANCED_GUIDES[kind]+'\n'+code.replace('#include "main.h"\n','')+(callbacks?'\n'+callbacks+'\n':'');
 p.firmware={mode:'hal',files:[]};return p;
}
const TFT_HELPERS=`void transferByte(uint8_t data) {
  uint8_t bytes[1] = {data};
  HAL_SPI_Transmit(&hspi1, bytes, 1, 100);
}
void tftCommand(uint8_t command) {
  HAL_GPIO_WritePin(GPIOB, GPIO_PIN_6, GPIO_PIN_RESET);
  HAL_GPIO_WritePin(GPIOB, GPIO_PIN_7, GPIO_PIN_RESET);
  transferByte(command);
  HAL_GPIO_WritePin(GPIOB, GPIO_PIN_7, GPIO_PIN_SET);
}
void tftEnd(void) { HAL_GPIO_WritePin(GPIOB, GPIO_PIN_6, GPIO_PIN_SET); }
void tftWindow(uint8_t width, uint8_t height) {
  tftCommand(0x2A); transferByte(0); transferByte(0); transferByte(0); transferByte(width - 1); tftEnd();
  tftCommand(0x2B); transferByte(0); transferByte(0); transferByte(0); transferByte(height - 1); tftEnd();
}`;
export function advancedExample(kind){
 if(!ADVANCED_EXAMPLES[kind])throw new Error('HAL 예제를 확인하세요.');
 if(kind==='dma_uart_echo'){
  const p=exampleProject();p.components=[];p.wires=[];p.simulation={stepMs:1,pwmWaveform:false};p.mcu.timerClockHz=EXAMPLE_TIMER_CLOCK_HZ;
  Object.assign(p.mcu,{pins:{PA2:pin('USART2_TX'),PA3:pin('USART2_RX')},peripherals:{USART2:{enabled:true,baud:115200}},nvic:{USART2_IRQn:{enabled:true,priority:1}},dma:{USART2_RX:{mode:'circular',priority:'high'},USART2_TX:{}}});
  return finish(p,kind,{globals:'uint8_t rxBuf[32];\nuint8_t txBuf[32];\nvolatile uint16_t lastPos = 0;\nvolatile uint32_t echoed = 0;',
   init:'  HAL_UARTEx_ReceiveToIdle_DMA(&huart2, rxBuf, 32);\n  __HAL_DMA_DISABLE_IT(&hdma_usart2_rx, DMA_IT_HT);\n  printf("DMA UART echo ready (USART2 115200)\\n");',
   loop:'    HAL_Delay(100);',
   callbacks:`void HAL_UARTEx_RxEventCallback(UART_HandleTypeDef *huart, uint16_t size) {
  uint16_t end = size % 32, n = 0;
  while (lastPos != end && n < 32) { txBuf[n++] = rxBuf[lastPos]; lastPos = (lastPos + 1) % 32; }
  if (n > 0 && HAL_UART_Transmit_DMA(&huart2, txBuf, n) == HAL_OK) echoed += n;
  printf("RX event: %u bytes (DMA counter=%lu)\\n", n, __HAL_DMA_GET_COUNTER(huart->hdmarx));
}
void HAL_UART_TxCpltCallback(UART_HandleTypeDef *huart) {
  printf("TX DMA done, total echoed=%lu\\n", echoed);
}`});
 }
 if(kind==='adc_dma_scan'){
  const p=deviceExample('joystick');p.mcu.timerClockHz=EXAMPLE_TIMER_CLOCK_HZ;p.mcu.peripherals={ADC1:{enabled:true}};p.mcu.dma={ADC1:{mode:'circular',priority:'high'}};p.mcu.nvic={};
  const out=finish(p,kind,{globals:'uint16_t adc[64];  /* X,Y,X,Y,... */\nvolatile uint32_t avgX = 0, avgY = 0, blocks = 0;\nvoid average(int from) {\n  uint32_t x = 0, y = 0;\n  for (int i = from; i < from + 32; i += 2) { x += adc[i]; y += adc[i + 1]; }\n  avgX = x / 16; avgY = y / 16;\n}',
   init:'  HAL_ADC_Start_DMA(&hadc1, (uint32_t*)adc, 64);\n  printf("ADC DMA scan: IN0(X), IN1(Y), 32 samples per channel\\n");',
   loop:'    HAL_Delay(500);\n    printf("X=%lu Y=%lu (DMA blocks=%lu)\\n", avgX, avgY, blocks);',
   callbacks:`void HAL_ADC_ConvHalfCpltCallback(ADC_HandleTypeDef *hadc) {
  average(0);   /* first half is stable while DMA fills the second half */
}
void HAL_ADC_ConvCpltCallback(ADC_HandleTypeDef *hadc) {
  average(32); blocks++;
}`});
  out.code=out.code.replace('hadc1.Init.ScanConvMode = DISABLE;','hadc1.Init.ScanConvMode = ENABLE;').replace('hadc1.Init.ContinuousConvMode = DISABLE;','hadc1.Init.ContinuousConvMode = ENABLE;').replace('hadc1.Init.NbrOfConversion = 1;','hadc1.Init.NbrOfConversion = 2;').replace('hadc1.Init.DMAContinuousRequests = DISABLE;','hadc1.Init.DMAContinuousRequests = ENABLE;').replace('hadc1.Init.ClockPrescaler = ADC_CLOCK_SYNC_PCLK_DIV4;','hadc1.Init.ClockPrescaler = ADC_CLOCK_SYNC_PCLK_DIV8;')
   .replace('  HAL_ADC_ConfigChannel(&hadc1, &sConfig);','  HAL_ADC_ConfigChannel(&hadc1, &sConfig);\n  sConfig.Channel = ADC_CHANNEL_1;\n  sConfig.Rank = 2;\n  HAL_ADC_ConfigChannel(&hadc1, &sConfig);');
  return out;
 }
 if(kind==='nvic_preemption'){
  const p=baseExample('exti');p.mcu.peripherals.TIM2={enabled:true,prescaler:8399,period:999};p.mcu.nvic={EXTI15_10_IRQn:{enabled:true,priority:0},TIM2_IRQn:{enabled:true,priority:3}};
  return finish(p,kind,{globals:'volatile uint32_t timerBusy = 0, preempted = 0, ticks = 0;',
   init:'  HAL_TIM_Base_Start_IT(&htim2);\n  printf("TIM2 priority 3, EXTI15_10 priority 0, SysTick priority %lu\\n", (uint32_t)TICK_INT_PRIORITY);',
   loop:'    HAL_Delay(50);',
   callbacks:`void HAL_TIM_PeriodElapsedCallback(TIM_HandleTypeDef *htim) {
  if (htim->Instance != TIM2) return;
  timerBusy = 1; ticks++;
  printf("TIM2 #%lu: long work start\\n", ticks);
  for (volatile uint32_t i = 0; i < 300000; i++) {
    if ((i & 0xFFFF) == 0) HAL_GPIO_TogglePin(GPIOA, GPIO_PIN_5);
  }
  timerBusy = 0;
  printf("TIM2 #%lu: long work end (preempted=%lu)\\n", ticks, preempted);
}
void HAL_GPIO_EXTI_Callback(uint16_t GPIO_Pin) {
  if (GPIO_Pin != GPIO_PIN_13) return;
  if (timerBusy) preempted++;
  printf("EXTI PC13: %s\\n", timerBusy ? "TIM2 callback preempted" : "idle");
}`});
 }
 if(kind==='usart_sync_matrix'){
  const p=deviceExample('matrix');p.wires.find(w=>w.to==='part:demo:p4').from=boardPin('PA4');p.wires.find(w=>w.to==='part:demo:p5').from=boardPin('PA2');p.mcu.timerClockHz=EXAMPLE_TIMER_CLOCK_HZ;
  p.mcu.pins={PA2:pin('USART2_TX'),PA3:pin('USART2_RX'),PA4:pin('USART2_CK'),PB6:pin('GPIO_Output',{initial:1})};p.mcu.peripherals={USART2:{enabled:true,baud:100000,mode:'synchronous',cpol:0,cpha:0,lastBit:1}};p.mcu.nvic={};
  return finish(p,kind,{globals:`uint32_t matrixFrame = 0;
uint8_t reverse8(uint8_t v) { uint8_t r = 0; for (int i = 0; i < 8; i++) { r = (r << 1) | (v & 1); v >>= 1; } return r; }
void matrixWrite(uint8_t reg, uint8_t value) {
  uint8_t frame[2] = {reverse8(reg), reverse8(value)};  /* USART: LSB first, MAX7219: MSB first */
  HAL_GPIO_WritePin(GPIOB, GPIO_PIN_6, GPIO_PIN_RESET);
  HAL_USART_Transmit(&husart2, frame, 2, 10);
  HAL_GPIO_WritePin(GPIOB, GPIO_PIN_6, GPIO_PIN_SET);   /* LOAD rising edge latches 16 bits */
}`,init:'  matrixWrite(12,1); matrixWrite(11,7); matrixWrite(10,4); matrixWrite(9,0);\n  printf("USART2 synchronous: CK=PA4 100 kHz, CPOL=0 CPHA=0 LastBit=1\\n");',
   loop:'    for (int row = 0; row < 8; row++) matrixWrite(row + 1, 0x81 | (1 << ((row + matrixFrame) % 8)));\n    matrixFrame = (matrixFrame + 1) % 8;\n    HAL_Delay(200);'});
 }
 if(kind==='camera_tft'){
  const p=baseExample('ref_ov2640_camera'),tft=deviceExample('tft');p.mcu.timerClockHz=EXAMPLE_TIMER_CLOCK_HZ;
  p.components[0].id='cam';p.wires.forEach(w=>{w.to=w.to.replace('part:demo:','part:cam:');w.id='c'+w.id;});p.wires.find(w=>w.to==='part:cam:p17').from=boardPin('PC8');
  const t=tft.components[0];t.id='tft';t.y=120;p.components.push(t);for(const w of tft.wires)p.wires.push({...w,id:'t'+w.id,to:w.to.replace('part:demo:','part:tft:')});
  p.mcu.pins={PB8:pin('I2C1_SCL'),PB9:pin('I2C1_SDA'),PC8:pin('GPIO_Output'),PC6:pin('GPIO_Output'),PA8:pin('Reserved'),PA5:pin('SPI1_SCK'),PA6:pin('SPI1_MISO'),PA7:pin('SPI1_MOSI'),PB6:pin('GPIO_Output',{initial:1}),PB7:pin('GPIO_Output'),PC7:pin('GPIO_Output',{initial:1})};
  p.mcu.peripherals={I2C1:{enabled:true,clock:100000},SPI1:{enabled:true,clock:10500000},DCMI:{enabled:true}};p.mcu.dma={DCMI:{mode:'normal',priority:'high'},SPI1_TX:{}};p.mcu.nvic={DCMI_IRQn:{enabled:true,priority:2}};
  return finish(p,kind,{globals:`uint32_t frame[9600];  /* 160 x 120 RGB565 = 38400 bytes */
volatile uint8_t frameReady = 0, sending = 0;
volatile uint32_t frames = 0, shown = 0;
${TFT_HELPERS}
void sccb(uint8_t reg, uint8_t value) {
  uint8_t v[1] = {value};
  if (HAL_I2C_Mem_Write(&hi2c1, 0x30 << 1, reg, I2C_MEMADD_SIZE_8BIT, v, 1, 100) != HAL_OK) printf("SCCB 0x%02x failed\\n", reg);
}`,init:`  HAL_GPIO_WritePin(GPIOC, GPIO_PIN_7, GPIO_PIN_RESET); HAL_Delay(1); HAL_GPIO_WritePin(GPIOC, GPIO_PIN_7, GPIO_PIN_SET); HAL_Delay(120);
  tftCommand(0x11); tftEnd(); HAL_Delay(120);
  tftCommand(0x3A); transferByte(0x55); tftEnd();
  tftCommand(0x36); transferByte(0x20); tftEnd();   /* MV: 160 x 128 landscape */
  tftCommand(0x29); tftEnd();
  HAL_RCC_MCOConfig(RCC_MCO1, RCC_MCO1SOURCE_HSI, RCC_MCODIV_1);  /* XCLK on PA8 */
  HAL_GPIO_WritePin(GPIOC, GPIO_PIN_6, GPIO_PIN_RESET);
  HAL_GPIO_WritePin(GPIOC, GPIO_PIN_8, GPIO_PIN_RESET); HAL_Delay(10);
  HAL_GPIO_WritePin(GPIOC, GPIO_PIN_8, GPIO_PIN_SET); HAL_Delay(20);
  sccb(0xFF, 0x00);   /* DSP bank */
  sccb(0xDA, 0x08);   /* IMAGE_MODE: RGB565 */
  sccb(0x5A, 160 / 4); sccb(0x5B, 120 / 4); sccb(0x5C, 0x00);  /* output 160 x 120 (QQVGA) */
  printf("OV2640: QQVGA RGB565, DCMI snapshot start\\n");
  HAL_DCMI_Start_DMA(&hdcmi, DCMI_MODE_SNAPSHOT, (uint32_t)frame, 9600);`,
   loop:`    if (frameReady && !sending) {
      frameReady = 0; sending = 1;
      tftWindow(160, 120);
      tftCommand(0x2C);
      HAL_SPI_Transmit_DMA(&hspi1, (uint8_t*)frame, 38400);
    }
    HAL_Delay(5);`,
   callbacks:`void HAL_DCMI_FrameEventCallback(DCMI_HandleTypeDef *hdcmi) {
  frames++; frameReady = 1;
}
void HAL_SPI_TxCpltCallback(SPI_HandleTypeDef *hspi) {
  tftEnd(); sending = 0; shown++;
  printf("frame %lu shown on TFT\\n", shown);
  HAL_DCMI_Start_DMA(&hdcmi, DCMI_MODE_SNAPSHOT, (uint32_t)frame, 9600);
}`});
 }
 if(kind==='sd_logger'){
  const p=baseExample('ref_sd_storage_board');p.mcu.timerClockHz=EXAMPLE_TIMER_CLOCK_HZ;p.mcu.peripherals.SPI1.clock=10500000;
  return finish(p,kind,{globals:'uint32_t samples = 0;\nchar line[64];',
   init:`  MX_FATFS_Init();
  FRESULT res = f_mount(&SDFatFS, SDPath, 1);
  if (res != FR_OK) printf("f_mount failed: %d\\n", res);
  DWORD freeClusters = 0; FATFS *fs;
  if (f_getfree(SDPath, &freeClusters, &fs) == FR_OK) printf("SD free: %lu KB\\n", freeClusters * fs->csize / 2);`,
   loop:`    if (f_open(&SDFile, "LOG.TXT", FA_OPEN_APPEND | FA_WRITE) == FR_OK) {
      f_printf(&SDFile, "t=%lu sample=%lu\\n", HAL_GetTick(), samples++);
      f_close(&SDFile);
    }
    if (samples % 5 == 0 && f_open(&SDFile, "LOG.TXT", FA_READ) == FR_OK) {
      printf("LOG.TXT size=%lu\\n", f_size(&SDFile));
      if (f_gets(line, sizeof(line), &SDFile)) printf("first line: %s", line);
      f_close(&SDFile);
    }
    HAL_Delay(500);`});
 }
 if(kind==='noise_errors'){
  const p=baseExample('i2c');p.mcu.pins.PA2=pin('USART2_TX');p.mcu.pins.PA3=pin('USART2_RX');p.mcu.peripherals.USART2={enabled:true,baud:9600};p.mcu.nvic={USART2_IRQn:{enabled:true,priority:1}};
  p.simulation={...(p.simulation||{stepMs:1,pwmWaveform:false}),noise:{enabled:true,bitErrorRate:.003,glitchRate:.01,jitterNs:200}};
  return finish(p,kind,{globals:'uint8_t rx[1];\nvolatile uint32_t uartErrors = 0, i2cRetries = 0, i2cOk = 0;',
   init:'  HAL_UART_Receive_IT(&huart2, rx, 1);\n  printf("noise: BER=0.003 glitch=0.01 jitter=200 ns\\n");',
   loop:`    uint8_t tx[4] = {0x11, 0x22, 0x33, 0x44}, back[4] = {0};
    int tries = 0;
    while (tries < 3) {
      tries++;
      if (HAL_I2C_Mem_Write(&hi2c1, 0x50 << 1, 0x00, I2C_MEMADD_SIZE_8BIT, tx, 4, 100) == HAL_OK &&
          HAL_I2C_Mem_Read(&hi2c1, 0x50 << 1, 0x00, I2C_MEMADD_SIZE_8BIT, back, 4, 100) == HAL_OK &&
          back[0] == 0x11 && back[3] == 0x44) { i2cOk++; break; }
      i2cRetries++;
    }
    printf("I2C ok=%lu retries=%lu, UART errors=%lu\\n", i2cOk, i2cRetries, uartErrors);
    HAL_Delay(500);`,
   callbacks:`void HAL_UART_RxCpltCallback(UART_HandleTypeDef *huart) {
  HAL_UART_Transmit_IT(huart, rx, 1);
  HAL_UART_Receive_IT(huart, rx, 1);
}
void HAL_UART_ErrorCallback(UART_HandleTypeDef *huart) {
  uartErrors++;
  printf("UART error:%s%s%s%s\\n", (huart->ErrorCode & HAL_UART_ERROR_FE) ? " FE" : "", (huart->ErrorCode & HAL_UART_ERROR_PE) ? " PE" : "",
         (huart->ErrorCode & HAL_UART_ERROR_NE) ? " NE" : "", (huart->ErrorCode & HAL_UART_ERROR_ORE) ? " ORE" : "");
}`});
 }
}
