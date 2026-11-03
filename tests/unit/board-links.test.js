import {test,describe} from 'node:test';
import assert from 'node:assert/strict';
import {SimulationSession} from '../../src/session.js';
import {SketchDriver} from '../../src/esp32-sketch.js';
import {createStm32Drivers,connectStm32Drivers} from '../../src/stm32-boards.js';
import {applyLectureExample} from '../../src/lecture-examples.js';
import {projectForBoard} from '../../src/project.js';

function run(project,ms){
 const out=[],session=new SimulationSession(project,{print:t=>out.push('main: '+t),uart:e=>{if(e.direction==='TX')out.push('main tx: '+String.fromCharCode(...e.bytes));}});
 session.circuit.drivers=createStm32Drivers(project,{log:t=>out.push(t)});session.buses.boards=()=>session.circuit.drivers;connectStm32Drivers(session);let result=session.tick(0);
 for(let t=50;t<=ms;t+=50)result=session.tick(t);return {session,result,out,driver:session.circuit.drivers[0]};
}
const text=out=>out.join('');

describe('boards on wires',()=>{
 test('I²C: a master on one STM32 drives a slave on the other, which answers',()=>{
  const {project}=applyLectureExample('wired-i2c-stm32'),{result,out,session}=run(project,1500);
  assert.ok(!result.fault,result.warnings?.join());
  assert.match(text(out),/sent ON/);assert.match(text(out),/sent OFF/);assert.match(text(out),/ack/);assert.doesNotMatch(text(out),/no answer/);
  assert.ok(session.circuit.drivers[0].session.runtime.gpio.PA5,'the slave set its LD2 pin');
 });
 test('I²C without the pull-ups, or without a slave on the address, gets no answer',()=>{
  const {project}=applyLectureExample('wired-i2c-stm32');project.wires=project.wires.filter(w=>!/part:r[12]:/.test(w.from+w.to));
  assert.match(text(run(project,700).out),/no answer/);
  const other=applyLectureExample('wired-i2c-stm32').project;other.components.find(p=>p.id==='stm2').code=other.components.find(p=>p.id==='stm2').code.replace('0x20 << 1','0x21 << 1');
  assert.match(text(run(other,700).out),/no answer/);
 });
 test('SPI: master and slave exchange a byte in each direction',()=>{
  const {project}=applyLectureExample('wired-spi-stm32'),{result,out}=run(project,1000);
  assert.ok(!result.fault,result.warnings?.join());
  assert.match(text(out),/slave answered/);assert.match(text(out),/byte in/);
 });
 test('SPI: a slave pin left unwired stops the exchange reaching the slave',()=>{
  const {project}=applyLectureExample('wired-spi-stm32');project.wires=project.wires.filter(w=>!w.from.endsWith('CN10:15'));
  const {out}=run(project,600);assert.doesNotMatch(text(out),/byte in/);
 });
 test('a slave with an interrupt reception runs its callback; the master can send to the main board from another board',()=>{
  const {project}=applyLectureExample('wired-i2c-stm32'),board=project.components.find(p=>p.id==='stm2');
  // The other board is the master this time, the main board the slave with HAL_I2C_Slave_Receive_IT.
  [project.code,board.code]=[board.code,project.code];[project.mcu,board.mcu]=[board.mcu,project.mcu];
  project.mcu={...project.mcu,nvic:{I2C1_EV_IRQn:{enabled:true,priority:5,subPriority:0}}};
  project.code=project.code.replace(/(\/\* USER CODE BEGIN 3 \*\/)[\s\S]*?(\/\* USER CODE END 3 \*\/)/,(_,a,b)=>a+'\n  HAL_Delay(1);\n'+b).replace('/* USER CODE BEGIN 2 */','/* USER CODE BEGIN 2 */\n  HAL_NVIC_EnableIRQ(I2C1_EV_IRQn);\n  HAL_I2C_Slave_Receive_IT(&hi2c1, &cmd, 1);').replace('int main(void)','void HAL_I2C_SlaveRxCpltCallback(I2C_HandleTypeDef *h) {\n  HAL_GPIO_WritePin(GPIOA, GPIO_PIN_5, cmd ? GPIO_PIN_SET : GPIO_PIN_RESET);\n  uartSend("irq\\r\\n");\n  HAL_I2C_Slave_Receive_IT(&hi2c1, &cmd, 1);\n}\nint main(void)');
  const {out}=run(project,1000);assert.match(text(out),/irq/,text(out).slice(0,400));
 });
});
describe('serial monitor input',()=>{
 test('an ESP32 sketch reads what the monitor sends on Serial',()=>{
  const part={id:'e1',type:'devboard',model:'esp32-nodemcu-32s',name:'ESP32-1',x:0,y:0,rotation:0,code:'void setup(){pinMode(2,OUTPUT);}\nvoid loop(){while(Serial.available()>0){int c=Serial.read();Serial.printf("got %c\\n",c);if(c==49)digitalWrite(2,HIGH);}delay(5);}'};
  const project=projectForBoard('nucleo-f103rb');project.components.push(part);
  const driver=new SketchDriver(part,{project});assert.equal(driver.acceptsInput,true);
  driver.observe?.({voltage:()=>0});assert.equal(driver.receive('1'),1);
  driver.advance?.(50);assert.match(driver.output,/got 1/);
 });
 test('another STM32 board receives on its USART2',()=>{
  const {project}=applyLectureExample('wired-spi-stm32'),board=project.components.find(p=>p.id==='stm2');
  board.code=board.code.replace(/(\/\* USER CODE BEGIN 3 \*\/)[\s\S]*?(\/\* USER CODE END 3 \*\/)/,(_,a,b)=>a+'\n  uint8_t c = 0;\n  if (HAL_UART_Receive(&huart2, &c, 1, 5) == HAL_OK) uartSend("echo\\r\\n");\n'+b);
  const r=run(project,200);assert.equal(r.driver.acceptsInput,true);assert.ok(r.driver.receive('x')>0);
  for(let t=250;t<=400;t+=50)r.session.tick(t);assert.match(text(r.out),/echo/);
 });
});
