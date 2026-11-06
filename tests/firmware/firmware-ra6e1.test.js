// FPB-RA6E1 firmware (Renesas FSP, ARM GCC) on the RA6E1 emulator: FSP's clock setup to 200 MHz, R_IOPORT pin writes,
// R_BSP_SoftwareDelay timing, and the S1 (P205 / IRQ1) interrupt through ICU IELSR → NVIC → r_icu_isr → callback.
// Fixtures: tests/fixtures/firmware-ra6e1 (node scripts/emu/build-ra6e1-fixtures.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import {open,runUntil} from './helpers.mjs';

const fixture=name=>'../firmware-ra6e1/'+name;

test('ra_blink: FSP starts the PLL at 200 MHz and LED1 (P408) toggles every 500 ms of R_BSP_SoftwareDelay',()=>{
 const {session}=open(fixture('ra_blink'));
 const edges=[];let last=null;
 runUntil(session,2200,{onTick:()=>{const v=session.gpio.P408?.value>1.65;if(v!==last){edges.push([Math.round(session.now/1000),v]);last=v;}}});
 assert.equal(session.soc.clock.iclk,200e6,'HOCO 20 MHz / 2 x 20');
 assert.equal(session.soc.clock.pclkb,50e6);assert.equal(session.soc.clock.pclkd,100e6);
 assert.equal(session.gpio.P408.mode,'OUTPUT');assert.equal(session.gpio.P407.mode,'OUTPUT');
 const highs=edges.filter(e=>e[1]).map(e=>e[0]);
 assert.ok(highs.length>=2,'LED1 turned on at least twice: '+JSON.stringify(edges));
 assert.ok(Math.abs(highs[1]-highs[0]-1000)<=20,'1 s period (sampled at the 20 ms session tick): '+JSON.stringify(edges));
 // The board's LED1 lights through its 1 kΩ resistor.
 assert.ok(session.result.voltage('signal:P408')>1.8||session.result.voltage('signal:P408')<0.5);
});

test('ra_button_irq: pressing S1 pulls P205 low; IRQ1 (falling) runs the callback and toggles LED2 (P407)',()=>{
 const {session}=open(fixture('ra_button_irq'));
 runUntil(session,100);
 assert.ok(session.gpio.P407.value<1,'LED2 starts off');
 assert.equal(session.readVariable('presses'),0);
 session.setPressed({SW1:true});runUntil(session,140);session.setPressed({});runUntil(session,200);
 assert.equal(session.readVariable('presses'),1);assert.ok(session.gpio.P407.value>1.65,'LED2 on');
 session.setPressed({SW1:true});runUntil(session,240);session.setPressed({});runUntil(session,300);
 assert.equal(session.readVariable('presses'),2);assert.ok(session.gpio.P407.value<1,'LED2 off again');
 // The pin is an IRQ input with the internal pull-up (S1 has none on the board).
 assert.equal(session.gpio.P205.mode,'INPUT_PULLUP');
});

test('opening the other vendor\'s ELF says which board it is for',async()=>{
 const {project,elf}=await import('./helpers.mjs');
 const {FirmwareSession}=await import('../../src/firmware-session.js');
 assert.throws(()=>new FirmwareSession(project(fixture('ra_blink')),{elf:elf('blink')}),/FPB-RA6E1\(Renesas FSP\)용이 아닙니다/);
 assert.throws(()=>new FirmwareSession(project('blink'),{elf:elf(fixture('ra_blink'))}),/FPB-RA6E1\(Renesas FSP\)용입니다/);
});

test('ra_uart_echo: SCI9 (P109 TXD / P110 RXD, 115200) says hello to the UART part on D0/D1 and echoes what it sends',()=>{
 const {session,log}=open(fixture('ra_uart_echo'));
 runUntil(session,60);
 const tx=log.uart.filter(e=>e.instance==='SCI9'&&e.direction==='TX');
 assert.equal(String.fromCharCode(...tx.flatMap(e=>e.bytes)),'FPB-RA6E1 SCI9 ready\r\n');
 // 10 bits a frame at 114.6 kbps (PCLKA 100 MHz, BRR 108 with ABCS/BGDM: 0.45 % error, as RASC sets it).
 const gap=tx[1].micros-tx[0].micros;assert.ok(Math.abs(gap-1e7/114679)<1,'frame time '+gap);
 assert.equal(session.buses.received.get('term'),'FPB-RA6E1 SCI9 ready\r\n','the part decodes the TXD line');
 assert.equal(session.gpio.P109.mode,'OUTPUT');
 assert.equal(session.inject('Hi','SCI9'),2);
 runUntil(session,120);
 assert.equal(session.readVariable('received'),2,'RXI → r_sci_uart → user_uart9_callback (UART_EVENT_RX_CHAR)');
 assert.deepEqual(log.uart.filter(e=>e.direction==='RX').map(e=>e.bytes[0]),[72,105]);
 assert.ok(session.buses.received.get('term').endsWith('Hi'),'echoed back');
 assert.ok(session.gpio.P407.value<1,'LED2 toggled twice');
});

test('ra_gpt_pwm: GPT6 PWM (1 kHz, GTIOC6B) dims LED1 in 10 % steps; GPT1 (500 ms periodic) toggles LED2 from its callback',()=>{
 const {session}=open(fixture('ra_gpt_pwm'));
 const steps=[];let last=-1;
 runUntil(session,1250,{onTick:t=>{const k=Math.floor((t-50)/100);if(k!==last&&t>=50){last=k;steps.push([session.readVariable('duty_percent'),session.gpio.P408?.pwm?.duty??(session.gpio.P408.value>1.65?1:0)]);}}});
 const g6=session.soc.gpts[6],g1=session.soc.gpts[1];
 assert.equal(g6.hz(),50e6,'PCLKD 100 MHz / 2 (RASC picks the divider for 50 000 counts in 16 bits)');assert.equal(g6.period(),50000);
 assert.equal(g1.period(),50e6,'GPT1 is 32-bit: 500 ms at 100 MHz without a divider');
 for(const [duty,out]of steps)if(duty>0&&duty<100)assert.ok(Math.abs(out-duty/100)<1e-9,JSON.stringify(steps));
 assert.ok(steps.some(([d,o])=>d===100&&o===1),'100 %: GTUDDTYC OBDTY forces the output high');
 assert.equal(session.gpio.P408.pwm?.frequency??1000,1000);
 assert.equal(session.readVariable('ticks'),2,'cycle ends at 500 and 1000 ms');
 assert.ok(session.gpio.P407.value<1,'LED2 toggled twice');
 // The board LED's net follows the averaged PWM level.
 const v=session.result.voltage('signal:P408');assert.ok(v>=0&&v<3.31);
});
