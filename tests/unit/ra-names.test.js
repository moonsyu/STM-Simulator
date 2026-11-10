// Error-case pass, feature 2 (FPB-RA6E1): a pin's symbolic name becomes a #define and a callback name a function of the
// generated code. A name C or the generated code already uses once went through and broke the build with an error far
// from the setting (LED named "int"); it is refused where it is typed, with the reason.
import test from 'node:test';
import assert from 'node:assert/strict';
import {raDefaultMcu,validateRaMcu,raNameProblem} from '../../src/ra-config.js';
import {RA_EXAMPLES} from '../../src/ra-examples.js';

const withLabel=name=>{const m=raDefaultMcu();m.pins.P408.label=name;return m;};
const withCallback=name=>{const m=raDefaultMcu();m.pins.P205.callback=name;return m;};

test('pin symbols: C words, library and generated names are refused; ordinary names are fine',()=>{
 for(const name of ['int','while','return','main','hal_entry','NULL','true','uint8_t','printf','errno'])assert.throws(()=>validateRaMcu(withLabel(name)),/P408: .*C나 생성 코드가 쓰는 이름입니다\. 다른 이름을 쓰세요\./,name);
 for(const name of ['R_IOPORT_PinWrite','BSP_IO_PORT_04_PIN_08','IOPORT_CFG_NAME','FSP_SUCCESS','__reserved','_Reserved'])assert.throws(()=>validateRaMcu(withLabel(name)),/FSP와 컴파일러가 씁니다/,name);
 for(const name of ['g_ioport','g_ioport_ctrl','g_external_irq1','g_uart9_cfg','g_timer6_ctrl','g_adc0_channel_cfg','g_bsp_pin_cfg'])assert.throws(()=>validateRaMcu(withLabel(name)),/생성 코드의 인스턴스 이름입니다/,name);
 for(const name of ['LED1','BBQ_LED','MOTOR','led_red','_x','g_my_led','Interrupt','r_led','mainLed','int_led'])assert.equal(validateRaMcu(withLabel(name)).pins.P408.label,name);
 assert.equal(raNameProblem('LED1'),'');assert.match(raNameProblem('int'),/int/);
});

test('callbacks: the same names are refused, and a callback cannot be called like a pin symbol',()=>{
 for(const name of ['int','main','hal_entry','printf','g_ioport','R_BSP_WarmStart'])assert.throws(()=>validateRaMcu(withCallback(name)),/P205: /,name);
 assert.throws(()=>validateRaMcu(withCallback('LED1')),/P205: 콜백 이름 LED1은\(는\) 핀 이름\(심볼\)과 같습니다/);
 assert.equal(validateRaMcu(withCallback('irq_callback')).pins.P205.callback,'irq_callback');
 // A peripheral's callback too.
 const uart=RA_EXAMPLES.find(e=>e.id==='ra_uart_echo').mcu(),id=Object.keys(uart.peripherals).find(k=>k.startsWith('SCI'));
 uart.peripherals[id].callback='main';assert.throws(()=>validateRaMcu(uart),new RegExp(`${id}: main`));
});

test('every example and the board template keep their names',()=>{
 assert.doesNotThrow(()=>validateRaMcu(raDefaultMcu()));
 for(const e of RA_EXAMPLES)assert.doesNotThrow(()=>validateRaMcu(e.mcu()),e.id);
});
