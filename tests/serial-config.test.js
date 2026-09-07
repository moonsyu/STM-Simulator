import test from 'node:test';
import assert from 'node:assert/strict';
import {SERIAL_IDS,SERIAL_ROUTES,serialAf,serialHandle,assignSerialPin,setSerialEnabled} from '../src/serial-config.js';
import {defaultMcu,validateMcu,configProblems,pinFunctions,importIoc,generateHal} from '../src/mcu-config.js';
import {GPIO_PINS,boardPin} from '../src/pins.js';
import {halCircuit as halExample} from './fixtures/hal.js';
import {SimulationSession} from '../src/session.js';
import {validateProject} from '../src/project.js';

const outputPin=()=>({function:'GPIO_Output',pull:'NOPULL',edge:'FALLING',initial:0,label:''});
function serialProject(id,tx=SERIAL_ROUTES[id].TX[0],rx=SERIAL_ROUTES[id].RX[0]){
  const p=halExample('uart');p.mcu=setSerialEnabled(setSerialEnabled(p.mcu,'USART2',false),id,true);
  assignSerialPin(p.mcu,id,'TX',tx);assignSerialPin(p.mcu,id,'RX',rx);
  p.mcu.peripherals[id].baud=9600;p.mcu.nvic[id+'_IRQn']={enabled:true,priority:0};
  p.code='uint8_t rx[1];\n'+generateHal(p.mcu);
  p.code=p.code.replace('  /* USER CODE END 2 */',`  HAL_UART_Receive_IT(&${serialHandle(id)}, rx, 1);\n  /* USER CODE END 2 */`);
  p.code=p.code.replace('  /* HAL_UART_Receive_IT() 수신 완료 */','  HAL_UART_Transmit_IT(huart, rx, 1);\n  HAL_UART_Receive_IT(huart, rx, 1);');
  const remap=pin=>pin===boardPin('PA2')?boardPin(tx):pin===boardPin('PA3')?boardPin(rx):pin;
  p.wires.forEach(w=>{w.from=remap(w.from);w.to=remap(w.to);});
  return validateProject(p);
}
const advance=(s,from,to)=>{for(let t=from;t<=to;t+=5)s.tick(t);};

test('F446RE LQFP64 exposes only package UART routes and correct AF numbers',()=>{
  assert.deepEqual(SERIAL_ROUTES.USART2,{TX:['PA2'],RX:['PA3']});
  assert.deepEqual(SERIAL_ROUTES.USART3,{TX:['PB10','PC10'],RX:['PC5','PC11']});
  for(const id of SERIAL_IDS)for(const [role,pins]of Object.entries(SERIAL_ROUTES[id]))for(const pin of pins){assert.ok(GPIO_PINS.includes(pin));assert.ok(pinFunctions(pin).includes(id+'_'+role));}
  assert.ok(!pinFunctions('PA5').includes('USART2_TX'));
  assert.equal(serialAf('USART1'),7);assert.equal(serialAf('UART4'),8);assert.equal(serialAf('USART6'),8);
});
test('serial activation allocates free legal pins, preserves occupied pins, and fails atomically',()=>{
  const original=defaultMcu();original.pins.PA9=outputPin();let config=setSerialEnabled(original,'USART1',true);
  assert.equal(config.pins.PB6.function,'USART1_TX');assert.equal(config.pins.PA10.function,'USART1_RX');assert.equal(config.pins.PA9.function,'GPIO_Output');assert.equal(original.peripherals.USART1,undefined);
  config.pins.PB7=outputPin();config.pins.PA10=outputPin();const before=structuredClone(config);
  assert.throws(()=>setSerialEnabled(config,'USART1',true),/RX.*사용 가능한/);assert.deepEqual(config,before);
});
test('serial route switching releases its previous pin; conflicts and impossible pins cannot overwrite',()=>{
  const config=setSerialEnabled(defaultMcu(),'USART1',true);assignSerialPin(config,'USART1','TX','PB6');
  assert.equal(config.pins.PA9.function,'Reset');assert.equal(config.pins.PB6.function,'USART1_TX');assert.deepEqual(configProblems(config),[]);
  config.pins.PB7=outputPin();const before=structuredClone(config);
  assert.throws(()=>assignSerialPin(config,'USART1','RX','PB7'),/사용 중/);assert.throws(()=>assignSerialPin(config,'USART1','TX','PA5'),/사용할 수 없는/);assert.deepEqual(config,before);
  config.nvic.USART1_IRQn={enabled:true,priority:2};const disabled=setSerialEnabled(config,'USART1',false);
  assert.equal(disabled.pins.PB6.function,'Reset');assert.equal(disabled.pins.PA10.function,'Reset');assert.equal(disabled.pins.PB7.function,'GPIO_Output');assert.equal(disabled.nvic.USART1_IRQn.enabled,false);
});
test('overlapping USART3 and UART4 routes cannot steal one another',()=>{
  let m=setSerialEnabled(defaultMcu(),'USART3',true);assignSerialPin(m,'USART3','TX','PC10');assignSerialPin(m,'USART3','RX','PC11');m=setSerialEnabled(m,'UART4',true);
  assert.equal(m.pins.PA0.function,'UART4_TX');assert.equal(m.pins.PA1.function,'UART4_RX');assert.throws(()=>assignSerialPin(m,'UART4','RX','PC11'),/USART3_RX/);assert.deepEqual(configProblems(m),[]);
});
for(const id of SERIAL_IDS)test(`${id} all TX/RX alternatives generate HAL, transmit and echo through its own NVIC`,()=>{
  for(const tx of SERIAL_ROUTES[id].TX)for(const rx of SERIAL_ROUTES[id].RX){
    const p=serialProject(id,tx,rx),s=new SimulationSession(p);assert.match(p.code,new RegExp(`GPIO_AF${serialAf(id)}_${id}`));s.tick(0);advance(s,5,30);assert.match(s.buses.received.get('demo'),/HAL ready/);
    assert.equal(s.inject('AB',id),2);advance(s,35,70);assert.match(s.buses.received.get('demo'),/AB$/);assert.equal(s.hal.uart(id).bus.uart.tx,tx);assert.equal(s.hal.uart(id).bus.uart.rx,rx);
    s.hal.call('HAL_NVIC_DisableIRQ',[id+'_IRQn'],s.runtime);assert.equal(s.inject('Z',id),1);advance(s,75,90);assert.ok(!s.buses.received.get('demo').endsWith('Z'));
    s.hal.call('HAL_NVIC_EnableIRQ',[id+'_IRQn'],s.runtime);advance(s,95,110);assert.ok(s.buses.received.get('demo').endsWith('Z'));
  }
});
test('IOC imports every serial port with its baud, pin routes and interrupt priority',()=>{
  for(const id of SERIAL_IDS){const {config,warnings}=importIoc(`Mcu.Name=STM32F446RETx\n${SERIAL_ROUTES[id].TX[0]}.Signal=${id}_TX\n${SERIAL_ROUTES[id].RX[0]}.Signal=${id}_RX\n${id}.BaudRate=57600\nNVIC.${id}_IRQn=true\\:3\\:0`);assert.deepEqual(warnings,[]);assert.equal(config.peripherals[id].baud,57600);assert.equal(config.nvic[id+'_IRQn'].priority,3);assert.deepEqual(configProblems(validateMcu(config)),[]);}
});
test('two UART instances keep buffers, busy states, NVIC events and physical terminals independent',()=>{
  const p=serialProject('USART2');p.mcu=setSerialEnabled(p.mcu,'UART4',true);p.mcu.peripherals.UART4.baud=9600;p.mcu.nvic.UART4_IRQn={enabled:true,priority:1};
  p.components.push({id:'second',type:'uart',name:'UART2',x:700,y:650,rotation:0,baud:9600});
  for(const [terminal,pin]of [[1,'3V3'],[2,'GND'],[3,'PA1'],[4,'PA0']])p.wires.push({id:'second'+terminal,from:boardPin(pin),to:`part:second:p${terminal}`,color:'#23a68a'});
  p.code='uint8_t rx2[1]; uint8_t rx4[1];\n'+generateHal(p.mcu);
  p.code=p.code.replace('  /* USER CODE END 2 */','  HAL_UART_Receive_IT(&huart2, rx2, 1);\n  HAL_UART_Receive_IT(&huart4, rx4, 1);\n  HAL_UART_Transmit_IT(&huart2, "2", 1);\n  if (HAL_UART_Transmit_IT(&huart4, "4", 1) != HAL_OK) Error_Handler();\n  /* USER CODE END 2 */');
  p.code=p.code.replace('  /* HAL_UART_Receive_IT() 수신 완료 */','  if (huart->Instance == USART2) { HAL_UART_Transmit_IT(huart, rx2, 1); HAL_UART_Receive_IT(huart, rx2, 1); }\n  if (huart->Instance == UART4) { HAL_UART_Transmit_IT(huart, rx4, 1); HAL_UART_Receive_IT(huart, rx4, 1); }');
  const s=new SimulationSession(validateProject(p));s.tick(0);advance(s,5,40);assert.equal(s.inject('ab','USART2'),2);assert.equal(s.inject('CD','UART4'),2);assert.equal(s.inject('bad','UART5'),0);advance(s,45,90);
  assert.match(s.buses.received.get('demo'),/2ab$/);assert.match(s.buses.received.get('second'),/4CD$/);assert.notEqual(s.hal.uart('USART2').bus.uart,s.hal.uart('UART4').bus.uart);
});
test('HAL rejects a serial AF or baud mismatch for non-USART2 instances',()=>{
  const p=serialProject('UART5');p.code=p.code.replaceAll('GPIO_AF8_UART5','GPIO_AF7_USART1');assert.throws(()=>new SimulationSession(p).tick(0),/Alternate/);
  const q=serialProject('USART6');q.mcu.peripherals.USART6.baud=115200;assert.throws(()=>new SimulationSession(q).tick(0),/baud rate/);
});
