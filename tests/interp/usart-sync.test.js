import test from 'node:test';
import assert from 'node:assert/strict';
import {pin,run,advance} from './helpers.js';
import {deviceExample} from '../../src/device-examples.js';
import {boardPin} from '../../src/pins.js';
import {validateMcu,generateHal,pinFunctions,configProblems,USART_CK_ROUTES} from '../../src/mcu-config.js';

// MAX7219 (16-bit shift register + LOAD latch) driven by USART2 in synchronous mode: CK=PA4, TX=PA2.
export function usartMatrix({lastBit=1,cpol=0,cpha=0}={}){
 const p=deviceExample('matrix');p.wires.find(w=>w.to==='part:demo:p4').from=boardPin('PA4');p.wires.find(w=>w.to==='part:demo:p5').from=boardPin('PA2');
 p.mcu.pins={PA2:pin('USART2_TX'),PA3:pin('USART2_RX'),PA4:pin('USART2_CK'),PB6:pin('GPIO_Output',{initial:1})};p.mcu.peripherals={USART2:{enabled:true,baud:100000,mode:'synchronous',cpol,cpha,lastBit}};p.mcu.nvic={};p.mcu=validateMcu(p.mcu);
 p.code=generateHal(p.mcu,{minimal:true}).replace('int main(void) {',`uint8_t reverse8(uint8_t v){ uint8_t r=0; for(int i=0;i<8;i++){ r=(r<<1)|(v&1); v>>=1; } return r; }
void matrixWrite(uint8_t reg, uint8_t value){
  uint8_t frame[2]={reverse8(reg), reverse8(value)};
  HAL_GPIO_WritePin(GPIOB, GPIO_PIN_6, GPIO_PIN_RESET);
  HAL_USART_Transmit(&husart2, frame, 2, 10);
  HAL_GPIO_WritePin(GPIOB, GPIO_PIN_6, GPIO_PIN_SET);
}
int main(void) {`).replace('  /* USER CODE BEGIN 2 */','  /* USER CODE BEGIN 2 */\n  matrixWrite(12,1); matrixWrite(11,7); matrixWrite(9,0); matrixWrite(1,0xA5); matrixWrite(2,0x3C);');
 return p;
}
test('CK pin options and synchronous configuration follow the F446RE LQFP64 AF table',()=>{
 assert.deepEqual(USART_CK_ROUTES,{USART1:['PA8'],USART2:['PA4'],USART3:['PB12','PC12'],USART6:['PC8']});
 for(const [id,pins]of Object.entries(USART_CK_ROUTES))for(const p of pins)assert.ok(pinFunctions(p).includes(id+'_CK'));
 const m=validateMcu({family:'STM32F446RE',pins:{PA2:pin('USART2_TX'),PA3:pin('USART2_RX')},peripherals:{USART2:{enabled:true,baud:9600,mode:'synchronous'}},nvic:{}});assert.match(configProblems(m).join(),/CK 핀/);
 assert.throws(()=>validateMcu({...m,peripherals:{UART4:{enabled:true,mode:'synchronous'}}}),/USART1\/2\/3\/6/);
 const code=generateHal(usartMatrix().mcu);assert.match(code,/USART_HandleTypeDef husart2;/);assert.match(code,/husart2\.Init\.CLKLastBit = USART_LASTBIT_ENABLE;/);assert.match(code,/GPIO_AF7_USART2/);
});
test('HAL_USART_Transmit clocks a MAX7219 shift register through CK/TX and LOAD latches the rows',()=>{
 const {s,output}=run(usartMatrix());advance(s,5);const d=s.result.parts.demo;
 assert.equal(d.on,true);assert.equal(d.device.ram[0],0xA5);assert.equal(d.device.ram[1],0x3C);
 const ch=s.signals.channels().find(c=>c.id==='USART2.SYNC');assert.equal(ch.protocol,'usart-sync');assert.deepEqual(ch.lines.map(l=>l.label),['CK','TX','RX']);
 const frames=s.signals.decode('USART2.SYNC').map(f=>f.value);assert.ok(frames.includes(0x30)&&frames.includes(0xA5),JSON.stringify(frames));
 const ck=s.signals.samples('USART2.SYNC.CK',0,1e6);assert.ok(ck.length>16*5);
});
test('LastBit disabled drops the MSB clock pulse, so the shift register loses alignment',()=>{
 // The misaligned 16-bit words reach unsupported MAX7219 registers (the device model reports them).
 assert.throws(()=>{const {s}=run(usartMatrix({lastBit:0}));advance(s,5);},/MAX7219/);
});
test('USART TransmitReceive in loopback returns the sent bytes; IT variant raises TxRxCpltCallback',()=>{
 const p=usartMatrix();p.wires.push({id:'loop',from:boardPin('PA2'),to:boardPin('PA3'),color:'#102030'});p.mcu.nvic={USART2_IRQn:{enabled:true,priority:0}};p.mcu=validateMcu(p.mcu);
 p.code=p.code.replace('  matrixWrite(12,1);','  HAL_NVIC_EnableIRQ(USART2_IRQn);\n  uint8_t a[3]={1,2,3}, b[3]={0};\n  HAL_USART_TransmitReceive(&husart2, a, b, 3, 10);\n  printf("rx %u %u %u\\n", b[0], b[1], b[2]);\n  HAL_USART_TransmitReceive_IT(&husart2, a, b, 3);\n  matrixWrite(12,1);')+'\nvoid HAL_USART_TxRxCpltCallback(USART_HandleTypeDef *h){printf("it done\\n");}\n';
 const {s,output}=run(p);advance(s,5);assert.deepEqual(output,['rx 1 2 3','it done']);
});
