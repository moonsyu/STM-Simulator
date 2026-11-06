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

test('ra_adc_pot: R_ADC single scan reads A0 (P000 = AN000) from the potentiometer; LED1 follows half scale',()=>{
 const {session}=open(fixture('ra_adc_pot'));
 runUntil(session,100);
 const near=(v,pin)=>Math.abs(v-Math.round(session.result.voltage('signal:'+pin)/3.3*4095))<=2;
 let v=session.readVariable('adc_value');
 assert.ok(near(v,'P000')&&Math.abs(v-2048)<60,'position 50 %: '+v);
 assert.equal(session.gpio.P000.mode,'ANALOG');
 session.project.components.find(p=>p.id==='pot').position=80;runUntil(session,200);
 v=session.readVariable('adc_value');assert.ok(near(v,'P000')&&v>3000,'80 %: '+v);
 assert.ok(session.gpio.P408.value>1.65,'LED1 on above half scale');
 assert.equal(session.readVariable('millivolts'),Math.floor(v*3300/4095));
 session.project.components.find(p=>p.id==='pot').position=10;runUntil(session,300);
 v=session.readVariable('adc_value');assert.ok(near(v,'P000')&&v<600,'10 %: '+v);assert.ok(session.gpio.P408.value<1);
 assert.ok(session.soc.adc0.scans>5,'a scan every 20 ms');
});

test('ra_agt_tick: AGT0 (LOCO, 250 ms) toggles LED1 from agt0_callback; AGT1 (PCLKB, 1 ms) ticks; LED2 every 1000 ticks',()=>{
 const {session}=open(fixture('ra_agt_tick'));
 const edges=[];let last=null;
 runUntil(session,2100,{onTick:()=>{const v=session.gpio.P408.value>1.65;if(v!==last){edges.push(Math.round(session.now/1000));last=v;}}});
 const a0=session.soc.agts[0],a1=session.soc.agts[1];
 assert.equal(a0.hz(),32768,'LOCO');assert.equal(a0.period(),8192);
 assert.equal(a1.hz(),50e6,'PCLKB 50 MHz');assert.equal(a1.period(),50000);
 assert.equal(session.readVariable('blinks'),8,'every 250 ms for 2.1 s');
 const ms=session.readVariable('ms');assert.ok(Math.abs(ms-2100)<=25,'1 ms tick: '+ms);
 assert.ok(edges.slice(1).every((t,i)=>Math.abs(t-edges[i]-250)<=20),'LED1 every 250 ms: '+edges);
 assert.ok(session.gpio.P407.value>1.65,'LED2 after 2000 ticks');
});

test('ra_iic_memory: IIC0 (P400 SCL / P401 SDA, 100 kHz) writes the I²C memory at 0x50, reads back with a repeated start; 0x51 NACKs',()=>{
 const {session,log}=open(fixture('ra_iic_memory'));
 runUntil(session,100);
 const bus=session.soc.iics[0].log;
 assert.deepEqual(bus.map(e=>e.type==='address'?`A${e.addr.toString(16)}${e.read?'R':'W'}${e.ack?'+':'-'}`:e.type==='write'?`W${e.byte.toString(16)}`:e.type==='read'?`R${e.byte.toString(16)}${e.ack?'+':'-'}`:e.type),
  ['start','A50W+','W10','W52','W41','W36','W45','stop','start','A50W+','W10','restart','A50R+','R52+','R41+','R36+','R45-','stop','start','A51R-','stop']);
 // Nine SCL periods a byte at 100 kHz (CKS 3, ICBRH 29, ICBRL 30 from PCLKB 50 MHz).
 assert.ok(Math.abs(bus[2].us-bus[1].us-90)<1,'byte time '+(bus[2].us-bus[1].us));
 assert.equal(session.readVariable('matched'),1,'RX_COMPLETE with the bytes written');
 assert.equal(session.readVariable('nack_seen'),1,'ABORTED after the NACK');
 assert.ok(session.gpio.P407.value>1.65,'LED2 on');
 assert.equal(session.gpio.P400.openDrain,true);
 assert.ok(log.trace.some(t=>/IIC0 · 0x50 WRITE 5 B · ACK/.test(t.message)));
});

test('FSP debugging: a breakpoint on main.c (built as src/hal_entry.c) stops there and the editor location is main.c',()=>{
 const code=JSON.parse(globalThis.process.getBuiltinModule('node:fs').readFileSync(new URL('../fixtures/firmware-ra6e1/ra_blink.json',import.meta.url),'utf8')).code;
 const line=code.split('\n').findIndex(l=>l.includes('R_BSP_SoftwareDelay(500'))+1;
 const {session}=open(fixture('ra_blink'),{debug:{entry:false,breakpoints:[`main.c:${line}`]}});
 runUntil(session,100);
 const rt=session.runtime;
 assert.equal(rt.debug.paused,true,'stopped at the breakpoint');
 assert.deepEqual(rt.location,{file:'main.c',line});
 assert.equal(rt.frames[0].name,'hal_entry');
 assert.equal(rt.frames[0].loc.file,'main.c');
});
