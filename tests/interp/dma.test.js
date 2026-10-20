import test from 'node:test';
import assert from 'node:assert/strict';
import {halProject,run,advance,pin} from './helpers.js';
import {halExample} from '../../src/hal-examples.js';
import {boardPin} from '../../src/pins.js';
import {validateMcu,generateHal,configProblems} from '../../src/mcu-config.js';

const uartDma=(rxMode,extra,init='  HAL_UART_Receive_DMA(&huart2, rx, 8);',more={})=>halProject({pins:{PA2:pin('USART2_TX'),PA3:pin('USART2_RX')},peripherals:{USART2:{enabled:true,baud:115200}},nvic:{USART2_IRQn:{enabled:true,priority:1}},
 dma:{USART2_RX:{mode:rxMode},USART2_TX:{}},globals:"uint8_t rx[8];\nuint8_t tx[8]={'a','b','c','d','e','f','g','h'};",init,extra,...more});
test('CubeMX MX_DMA_Init + __HAL_LINKDMA code parses; UART RX DMA circular fills the buffer progressively with half/full callbacks',()=>{
 const p=uartDma('circular','void HAL_UART_RxHalfCpltCallback(UART_HandleTypeDef *h){printf("half %c\\n", rx[3]);}\nvoid HAL_UART_RxCpltCallback(UART_HandleTypeDef *h){printf("full %c\\n", rx[7]);}');
 assert.match(p.code,/MX_DMA_Init\(\)/);assert.match(p.code,/__HAL_LINKDMA\(&huart2, hdmarx, hdma_usart2_rx\);/);
 const {s,output}=run(p);advance(s,2);s.inject('ABCDEFGHIJKL','USART2');
 s.tick(2.2);const partial=s.runtime.vars.rx.cells.map(c=>c.value);assert.ok(partial[0]===65&&partial[7]===0,'bytes arrive one by one at baud rate');
 assert.equal(s.hal.call('__HAL_DMA_GET_COUNTER',[{kind:'pointer',cell:s.runtime.globals.cells.hdma_usart2_rx}],s.runtime),8-partial.filter(Boolean).length);
 advance(s,6);assert.deepEqual(output,['half D','full H','half L']);assert.equal(String.fromCharCode(...s.runtime.vars.rx.cells.map(c=>c.value)),'IJKLEFGH');
});
test('UART TX DMA streams bytes at baud rate; normal mode completes through the USART TC interrupt',()=>{
 const p=uartDma('normal','void HAL_UART_TxCpltCallback(UART_HandleTypeDef *h){printf("tx done %lu\\n", HAL_GetTick());}\nvoid HAL_UART_TxHalfCpltCallback(UART_HandleTypeDef *h){printf("tx half\\n");}',`  HAL_UART_Transmit_DMA(&huart2, tx, 8);\n  printf("busy=%d\\n", HAL_UART_Transmit_DMA(&huart2, tx, 8));`,{loop:'    HAL_Delay(1);'});
 const {s,output}=run(p);assert.equal(s.buses.vcpOutput,'a');advance(s,3);assert.equal(s.buses.vcpOutput,'abcdefgh');assert.deepEqual(output,['busy=2','tx half','tx done 0']);
 const q=uartDma('normal','',`  HAL_UART_Transmit_DMA(&huart2, (uint8_t*)"hi", 2);`,{nvic:{}});const r=run(q);advance(r.s,3);assert.match(r.warnings.join(),/USART2_IRQn/);
});
test('ReceiveToIdle DMA reports IDLE events with the received size; DMAStop/Pause/Resume control the stream',()=>{
 const p=uartDma('circular','void HAL_UARTEx_RxEventCallback(UART_HandleTypeDef *h, uint16_t size){printf("event %u type %lu\\n", size, h->RxEventType);}','  HAL_UARTEx_ReceiveToIdle_DMA(&huart2, rx, 8);\n  __HAL_DMA_DISABLE_IT(&hdma_usart2_rx, DMA_IT_HT);');
 const {s,output}=run(p);advance(s,1);s.inject('abc','USART2');advance(s,3);s.inject('defgh','USART2');advance(s,5);
 assert.deepEqual(output,['event 3 type 2','event 8 type 0']);
 s.hal.call('HAL_UART_DMAPause',[{kind:'pointer',cell:s.runtime.globals.cells.huart2}],s.runtime);s.inject('XY','USART2');advance(s,7);assert.equal(s.runtime.vars.rx.cells[0].value,97);
 s.hal.call('HAL_UART_DMAResume',[{kind:'pointer',cell:s.runtime.globals.cells.huart2}],s.runtime);advance(s,8);assert.equal(s.runtime.vars.rx.cells[0].value,88);
 s.hal.call('HAL_UART_DMAStop',[{kind:'pointer',cell:s.runtime.globals.cells.huart2}],s.runtime);s.inject('Z','USART2');advance(s,10);assert.equal(s.runtime.vars.rx.cells[2].value,99);
});
test('ADC scan with DMA converts several ranks into an array with realistic conversion time and callbacks',()=>{
 const p=halExample('joystick');p.mcu.peripherals.ADC1={enabled:true};p.mcu.dma={ADC1:{mode:'circular'}};p.mcu.nvic={};p.mcu=validateMcu(p.mcu);
 p.code=generateHal(p.mcu,{minimal:true}).replace("hadc1.Init.ScanConvMode = DISABLE;","hadc1.Init.ScanConvMode = ENABLE;").replace("hadc1.Init.NbrOfConversion = 1;","hadc1.Init.NbrOfConversion = 2;")
  .replace('HAL_ADC_ConfigChannel(&hadc1, &sConfig);','HAL_ADC_ConfigChannel(&hadc1, &sConfig);\n  sConfig.Channel = ADC_CHANNEL_1;\n  sConfig.Rank = 2;\n  HAL_ADC_ConfigChannel(&hadc1, &sConfig);')
  .replace('int main(void) {','uint16_t adc[6];\nvolatile uint32_t done=0;\nint main(void) {').replace('  /* USER CODE BEGIN 2 */','  /* USER CODE BEGIN 2 */\n  HAL_ADC_Start_DMA(&hadc1, (uint32_t*)adc, 6);')
  +'\nvoid HAL_ADC_ConvCpltCallback(ADC_HandleTypeDef *h){done++;}\nvoid HAL_ADC_ConvHalfCpltCallback(ADC_HandleTypeDef *h){printf("half\\n");}\n';
 const joystick=p.components.find(c=>c.type==='joystick');joystick.axisX=100;joystick.axisY=0;
 const {s,output}=run(p);advance(s,1);const v=s.runtime.vars.adc.cells.map(c=>c.value);assert.ok(v[0]>3500&&v[1]<500&&v[2]===0,JSON.stringify(v));
 assert.equal(s.runtime.vars.done,0,'non-continuous scan stops after one sequence');assert.ok(s.hal.adcConversionUs(7)>20);
 p.code=p.code.replace('hadc1.Init.ContinuousConvMode = DISABLE;','hadc1.Init.ContinuousConvMode = ENABLE;');const c=run(p);c.s.tick(.05);const early=c.s.runtime.vars.adc.cells.filter(x=>x.value).length;advance(c.s,2);
 const w=c.s.runtime.vars.adc.cells.map(x=>x.value);assert.ok(early<6,'conversions take time');assert.ok(w[4]>3500&&w[5]<500);assert.ok(c.s.runtime.vars.done>=1);assert.ok(c.output.includes('half'));
});
test('SPI TransmitReceive DMA (MOSI-MISO loopback) and I2C Mem_Write/Mem_Read DMA with completion callbacks',()=>{
 const p=halExample('spi');p.mcu.dma={SPI1_RX:{},SPI1_TX:{}};p.mcu=validateMcu(p.mcu);p.wires=p.wires.filter(w=>!/part:demo:p6/.test(w.to));p.wires.push({id:'loop',from:boardPin('PA7'),to:boardPin('PA6'),color:'#123456'});
 p.code=generateHal(p.mcu,{minimal:true}).replace('int main(void) {','uint8_t out[4]={1,2,3,4}, in[4];\nint main(void) {').replace('  /* USER CODE BEGIN 2 */','  /* USER CODE BEGIN 2 */\n  HAL_SPI_TransmitReceive_DMA(&hspi1, out, in, 4);')+'\nvoid HAL_SPI_TxRxCpltCallback(SPI_HandleTypeDef *h){printf("spi %u %u\\n", in[0], in[3]);}\n';
 const a=run(p);advance(a.s,2);assert.deepEqual(a.output,['spi 1 4']);assert.ok(a.s.signals.decode('SPI1').some(f=>f.label==='MOSI 0x03 / MISO 0x03'));
 const q=halExample('i2c');q.mcu.dma={I2C1_TX:{},I2C1_RX:{}};q.mcu.nvic={I2C1_ER_IRQn:{enabled:true,priority:0}};q.mcu=validateMcu(q.mcu);
 q.code=generateHal(q.mcu,{minimal:true}).replace('int main(void) {','uint8_t w[3]={7,8,9}, r[3];\nint main(void) {').replace('  /* USER CODE BEGIN 2 */','  /* USER CODE BEGIN 2 */\n  HAL_I2C_Mem_Write_DMA(&hi2c1, 0x50<<1, 0x20, I2C_MEMADD_SIZE_8BIT, w, 3);')
  +'\nvoid HAL_I2C_MemTxCpltCallback(I2C_HandleTypeDef *h){printf("written\\n"); HAL_I2C_Mem_Read_DMA(&hi2c1, 0x50<<1, 0x20, I2C_MEMADD_SIZE_8BIT, r, 3);}\nvoid HAL_I2C_MemRxCpltCallback(I2C_HandleTypeDef *h){printf("read %u %u %u\\n", r[0], r[1], r[2]);}\nvoid HAL_I2C_ErrorCallback(I2C_HandleTypeDef *h){printf("err %lu\\n", h->ErrorCode);}\n';
 const b=run(q);advance(b.s,5);assert.deepEqual(b.output,['written','read 7 8 9']);
 const c=run({...q,code:q.code.replace('0x50<<1, 0x20, I2C_MEMADD_SIZE_8BIT, w','0x51<<1, 0x20, I2C_MEMADD_SIZE_8BIT, w')});advance(c.s,5);assert.deepEqual(c.output,['err 4']);
});
test('memory-to-memory DMA: HAL_DMA_Start + PollForTransfer and Start_IT with XferCpltCallback',()=>{
 const p=halProject({dma:{MEMTOMEM:{stream:'DMA2_Stream0',channel:0}},globals:'void copied(DMA_HandleTypeDef *h);\nuint32_t src[64], dst[64];\nvolatile uint32_t irq=0;',init:`  for(int i=0;i<64;i++) src[i]=i*3;
  hdma_memtomem.Init.PeriphDataAlignment = DMA_PDATAALIGN_WORD; hdma_memtomem.Init.MemDataAlignment = DMA_MDATAALIGN_WORD; HAL_DMA_Init(&hdma_memtomem);
  HAL_DMA_Start(&hdma_memtomem, (uint32_t)src, (uint32_t)dst, 64);
  printf("mid=%lu\\n", dst[63]);
  printf("poll=%d last=%lu\\n", HAL_DMA_PollForTransfer(&hdma_memtomem, HAL_DMA_FULL_TRANSFER, 10), dst[63]);
  hdma_memtomem.XferCpltCallback = copied;
  HAL_DMA_Start_IT(&hdma_memtomem, (uint32_t)dst, (uint32_t)src, 32);`,loop:'    HAL_Delay(1);',extra:'void copied(DMA_HandleTypeDef *h){ irq++; printf("irq src0=%lu\\n", src[0]); }'});
 const {s,output}=run(p);advance(s,10);assert.deepEqual(output,['mid=0','poll=0 last=189','irq src0=0']);
 assert.throws(()=>validateMcu({...p.mcu,dma:{MEMTOMEM:{stream:'DMA1_Stream0',channel:0}}}),/사용할 수 없습니다/);
});
test('wrong DMA stream/channel for a request and missing __HAL_LINKDMA are reported in Korean',()=>{
 const p=uartDma('normal','');p.code=p.code.replace('hdma_usart2_rx.Init.Channel = DMA_CHANNEL_4;','hdma_usart2_rx.Init.Channel = DMA_CHANNEL_3;');assert.throws(()=>run(p),/USART2_RX: DMA1_Stream5 채널 3/);
 const q=uartDma('normal','');q.code=q.code.replace('__HAL_LINKDMA(&huart2, hdmarx, hdma_usart2_rx);','');assert.throws(()=>run(q),/__HAL_LINKDMA/);
 const m=validateMcu({...q.mcu,peripherals:{},pins:{},dma:{USART2_RX:{}}});assert.match(configProblems(m).join(),/USART2_RX DMA: USART2/);
});
test('DMA stream IRQ handlers written by CubeMX route through HAL_DMA_IRQHandler',()=>{
 const p=uartDma('normal','void DMA1_Stream5_IRQHandler(void){ printf("dma irq\\n"); HAL_DMA_IRQHandler(&hdma_usart2_rx); }\nvoid HAL_UART_RxCpltCallback(UART_HandleTypeDef *h){printf("rx %c\\n", rx[7]);}');
 const {s,output}=run(p);s.inject('12345678','USART2');advance(s,3);assert.deepEqual(output,['dma irq','dma irq','rx 8']);
});
test('TIM PWM DMA plays a WS2812 duty sequence into a NeoPixel and finishes with PulseFinishedCallback',()=>{
 const p=halExample('ref_rgb_neopixel_4');p.mcu.pins={PA7:pin('TIM3_CH2')};p.mcu.peripherals={TIM3:{enabled:true,prescaler:0,period:104,mode:'pwm'}};p.mcu.dma={TIM3_CH2:{}};p.mcu.timerClockHz=84000000;p.mcu=validateMcu(p.mcu);
 p.code=generateHal(p.mcu,{minimal:true}).replace('int main(void) {','uint16_t bits[26];\nint main(void) {').replace('  /* USER CODE BEGIN 2 */',`  /* USER CODE BEGIN 2 */
  uint32_t grb = (0x10u << 16) | (0x80u << 8) | 0x04u;
  for (int i = 0; i < 24; i++) bits[i] = (grb & (1u << (23 - i))) ? 67 : 34;
  bits[24] = 0; bits[25] = 0;
  HAL_TIM_PWM_Start_DMA(&htim3, TIM_CHANNEL_2, (uint32_t*)bits, 26);`)+'\nvoid HAL_TIM_PWM_PulseFinishedCallback(TIM_HandleTypeDef *h){ HAL_TIM_PWM_Stop_DMA(h, TIM_CHANNEL_2); printf("sent ch=%lu\\n", h->Channel); }\n';
 const {s,output}=run(p);advance(s,5);assert.deepEqual(output,['sent ch=2']);assert.deepEqual(s.result.parts.demo.device.color,[0x80,0x10,0x04]);
 assert.ok(s.signals.samples('TIM3.CH2',0,1e7).length>40);
});
test('CubeMX multi-file layout: DMA set up in HAL_UART_MspInit (msp.c) and IRQ handlers in stm32f4xx_it.c',()=>{
 const p=halProject({pins:{PA2:pin('USART2_TX'),PA3:pin('USART2_RX')},peripherals:{USART2:{enabled:true,baud:115200}},nvic:{USART2_IRQn:{enabled:true,priority:0}},globals:'DMA_HandleTypeDef hdma_usart2_rx;\nuint8_t rx[4];',
  init:'  __HAL_RCC_DMA1_CLK_ENABLE();\n  HAL_NVIC_SetPriority(DMA1_Stream5_IRQn, 0, 0);\n  HAL_NVIC_EnableIRQ(DMA1_Stream5_IRQn);\n  HAL_UART_Receive_DMA(&huart2, rx, 4);',extra:'void HAL_UART_RxCpltCallback(UART_HandleTypeDef *huart){ printf("got %c%c%c%c\\n", rx[0], rx[1], rx[2], rx[3]); }'});
 p.code=p.code.replace('#include "main.h"','#include "main.h"\n#include "stm32f4xx_it.h"');
 p.firmware.files=[{name:'stm32f4xx_hal_msp.c',text:`#include "main.h"
extern DMA_HandleTypeDef hdma_usart2_rx;
void HAL_UART_MspInit(UART_HandleTypeDef* huart)
{
  if(huart->Instance==USART2)
  {
    hdma_usart2_rx.Instance = DMA1_Stream5;
    hdma_usart2_rx.Init.Channel = DMA_CHANNEL_4;
    hdma_usart2_rx.Init.Direction = DMA_PERIPH_TO_MEMORY;
    hdma_usart2_rx.Init.PeriphInc = DMA_PINC_DISABLE;
    hdma_usart2_rx.Init.MemInc = DMA_MINC_ENABLE;
    hdma_usart2_rx.Init.PeriphDataAlignment = DMA_PDATAALIGN_BYTE;
    hdma_usart2_rx.Init.MemDataAlignment = DMA_MDATAALIGN_BYTE;
    hdma_usart2_rx.Init.Mode = DMA_NORMAL;
    hdma_usart2_rx.Init.Priority = DMA_PRIORITY_LOW;
    hdma_usart2_rx.Init.FIFOMode = DMA_FIFOMODE_DISABLE;
    if (HAL_DMA_Init(&hdma_usart2_rx) != HAL_OK)
    {
      Error_Handler();
    }
    __HAL_LINKDMA(huart,hdmarx,hdma_usart2_rx);
  }
}
`},{name:'stm32f4xx_it.c',text:`#include "main.h"
#include "stm32f4xx_it.h"
extern DMA_HandleTypeDef hdma_usart2_rx;
extern UART_HandleTypeDef huart2;
void DMA1_Stream5_IRQHandler(void)
{
  HAL_DMA_IRQHandler(&hdma_usart2_rx);
}
void USART2_IRQHandler(void)
{
  HAL_UART_IRQHandler(&huart2);
}
`}];
 const {s,output}=run(p);s.inject('wxyz','USART2');advance(s,3);assert.deepEqual(output,['got wxyz']);
});
