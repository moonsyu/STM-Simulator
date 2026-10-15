import test from 'node:test';
import assert from 'node:assert/strict';
import {halExample} from '../src/hal-examples.js';
import {SimulationSession} from '../src/session.js';
import {blankProject} from '../src/project.js';
import {setSerialEnabled} from '../src/serial-config.js';
import {generateHal} from '../src/mcu-config.js';
import {deviceDocs} from '../src/device-docs-data.js';

const start=p=>{const s=new SimulationSession(p);s.tick(0);s.tick(30);return s;};
test('enabling USART2 and generating HAL connects the onboard VCP without a part',()=>{
  const p=blankProject();p.mcu=setSerialEnabled(p.mcu,'USART2',true);p.code=generateHal(p.mcu);
  const s=new SimulationSession(p);assert.equal(s.inject('before init','USART2'),0);s.tick(0);s.tick(30);
  assert.deepEqual(p.components,[]);assert.deepEqual(p.wires,[]);assert.match(s.buses.vcpOutput,/HAL ready/);
  assert.equal(s.inject('A','USART2'),1);assert.equal(s.buses.uart.queue[0].value,65);
  assert.equal(s.inject('B','USART2:external'),0);assert.equal(s.inject('B','USART3'),0);
  s.buses.uart.ready=false;assert.equal(s.inject('after stop','USART2'),0);
});
test('default UART example echoes through VCP with no components or fabricated RX',()=>{
  const p=halExample('uart'),s=start(p);assert.deepEqual(p.components,[]);assert.deepEqual(p.wires,[]);
  assert.equal(s.buses.uart.queue.length,0);assert.equal(s.buses.received.size,0);
  assert.equal(s.inject('VCP\r\n','USART2'),5);s.tick(60);
  assert.equal(s.buses.vcpOutput,'HAL UART ready\r\nVCP\r\n');assert.equal(s.buses.received.size,0);
});
test('external UART selection cannot bypass missing power, TX wiring or mismatched baud via VCP',()=>{
  for(const broken of ['missing','power','ground','tx','baud']){
    const p=halExample('uart_external');
    if(broken==='missing'){p.components=[];p.wires=[];}
    else if(broken==='baud')p.components[0].baud=115200;
    else {const terminal={power:1,ground:2,tx:3}[broken];p.wires=p.wires.filter(w=>w.from!==`part:demo:p${terminal}`&&w.to!==`part:demo:p${terminal}`);}
    const s=start(p);assert.equal(s.inject('bad','USART2:external'),0,broken);
    assert.equal(s.inject('ok','USART2'),2,broken);s.tick(60);assert.match(s.buses.vcpOutput,/ok$/);
  }
});
test('external UART and 4/6-pin Docs retain working crossed wires and independent power checks',()=>{
  for(const type of ['uart','ref_uart_cable_4','ref_uart_cable_6']){
    const p=deviceDocs(type).sample,s=start(p);assert.ok(p.components.length);assert.ok(p.wires.length>=4);
    assert.match(s.buses.received.get('demo'),/HAL UART ready/);assert.equal(s.inject('external','USART2:external'),8);s.tick(60);
    assert.match(s.buses.received.get('demo'),/external$/);
  }
});
test('other HAL UART instances do not get an onboard VCP without an external device',()=>{
  const p=blankProject();p.mcu=setSerialEnabled(p.mcu,'USART1',true);p.code=generateHal(p.mcu);
  const s=start(p);assert.equal(s.inject('A','USART1'),0);assert.equal(s.inject('A','USART2'),0);
  assert.equal(s.hal.uart('USART1').bus.hasVcp(),false);assert.equal(s.buses.vcpOutput,'');
});
