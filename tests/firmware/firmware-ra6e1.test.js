// FPB-RA6E1 firmware (Renesas FSP, ARM GCC) on the RA6E1 emulator: FSP's clock setup to 200 MHz, R_IOPORT pin writes,
// R_BSP_SoftwareDelay timing, and the S1 (P205 / IRQ1) interrupt through ICU IELSR → NVIC → r_icu_isr → callback.
// Fixtures: tests/fixtures/firmware-ra6e1 (node scripts/emu/build-ra6e1-fixtures.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import {open,runUntil,project} from './helpers.mjs';
import {SimulationSession} from '../../src/session.js';
import {createBoardDrivers} from '../../src/fixed-run.js';
import {connectStm32Drivers} from '../../src/stm32-boards.js';

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

test('ra_spi_memory: SPI1 (D13 RSPCK, D11 MOSI, D12 MISO, D10 SSL0, 1 MHz) writes the SPI memory and reads 0x2A back; SCI9 prints it',()=>{
 const {session,log}=open(fixture('ra_spi_memory'));
 const rspi=session.soc.rspis[1],select=rspi.selectSlave.bind(rspi),ssl=[];
 rspi.selectSlave=on=>{if(on!==rspi.ssl)ssl.push(on?'low':'high');select(on);};
 runUntil(session,100);
 const spi=rspi.log;
 assert.deepEqual(ssl,['low','high','low','high'],'SSL0 asserted for each transfer, negated when the TEI ISR clears SPE');
 assert.deepEqual(spi.map(e=>[e.tx,e.rx]),[[0x02,0],[0x10,0],[0x2a,0],[0x03,0],[0x10,0],[0x00,0x2a]],'R_SPI_Write, then R_SPI_WriteRead');
 // Eight RSPCK periods a frame at 1 MHz (PCLKA 100 MHz, SPBR 49, BRDV 0), the TXI ISR keeping the buffer full.
 assert.ok(Math.abs(spi[1].us-spi[0].us-8)<1,'frame time '+(spi[1].us-spi[0].us));
 // The two commands are two SSL0 assertions: the memory saw CS go high in between (else the read would be a write).
 assert.equal(session.readVariable('readback'),0x2a);assert.equal(session.readVariable('matched'),1,'SPI_EVENT_TRANSFER_COMPLETE with the byte written');
 assert.equal(session.buses.memory(session.project.components.find(p=>p.id==='mem')).data[0x10],0x2a);
 assert.equal(session.buses.received.get('term'),'SPI1 read 0x2A\r\n');
 assert.ok(session.gpio.P407.value>1.65,'LED2 on');
 assert.ok(session.gpio.P103.mode==='OUTPUT'&&session.gpio.P103.value>1.65,'SSL0 negated (high) after the transfers');
 assert.equal(session.gpio.P102.value,0,'RSPCK idles low (CPOL 0)');
 assert.ok(log.trace.some(t=>t.protocol==='SPI'&&/TX 00 · RX 2a/.test(t.message)));
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

// The course (Day 5 p.118, p.133): "resume 2번 눌러서 LED를 깜빡이자" — e² studio stops at the reset handler when the
// session starts and again at main(). An FSP project starts the same way; an STM32 project stops at main() only.
test('FSP debugging starts as in e² studio: the reset handler, then main(), then running — resume twice',()=>{
 const {session}=open(fixture('ra_blink'),{debug:{entry:true}});
 const rt=session.runtime;
 runUntil(session,40);
 assert.equal(rt.debug.paused,true,'stopped when the session starts');
 assert.notEqual(rt.frames[0]?.name,'main');assert.equal(session.now,0,'nothing has run yet');
 rt.resume('continue');runUntil(session,400);
 assert.equal(rt.debug.paused,true,'stopped again');assert.equal(rt.frames[0].name,'main');
 const at=session.now/1000;
 rt.resume('continue');
 const seen=new Set();runUntil(session,at+1300,{onTick:()=>seen.add(session.gpio.P408?.value>1.65)});
 assert.equal(rt.debug.paused,false,'running after the second resume');assert.deepEqual([...seen].sort(),[false,true],'LED1 blinks');
});

test('ra_wdt_reset: S1 held stops R_WDT_Refresh; the WDT underflows after 671 ms and resets the MCU once (log, RSTSR1.WDTRF → LED2 blinks)',()=>{
 const {session,log}=open(fixture('ra_wdt_reset'));
 runUntil(session,340);
 assert.equal(session.resets.length,0);assert.ok(session.gpio.P408.value>1.65,'LED1 on while refreshing');
 const cnt=session.soc.wdt.read(4,2)&0x3fff;assert.ok(cnt>16384-0.1*24414-2&&cnt<16384,'WDTSR.CNTVAL counts down after the last refresh: '+cnt);
 session.setPressed({SW1:true});runUntil(session,1000);
 assert.equal(session.resets.length,1);assert.equal(session.resets[0].reason,'WDT');
 assert.ok(Math.abs(session.resets[0].us/1000-971.3)<1,'last refresh at 300 ms + 671 ms: '+session.resets[0].us);
 assert.ok(log.trace.some(e=>e.protocol==='RESET'&&e.message==='MCU 리셋 · WDT'),'the output says it');
 assert.equal(session.soc.resetStatus.rstsr1&2,2,'RSTSR1.WDTRF');
 session.setPressed({});runUntil(session,1700);
 assert.equal(session.resets.length,1,'fed again: no second reset');
 assert.equal(session.readVariable('wdt_resets_seen'),1);assert.ok(session.readVariable('refreshes')>=2);
 const blinks=[];runUntil(session,2200,{onTick:()=>blinks.push(session.gpio.P407.value>1.65)});
 assert.ok(blinks.includes(true)&&blinks.includes(false),'LED2 blinks after the WDT reset');
});

test('ra_lpm_deep: the real r_lpm — Deep Software Standby, S1 (P205, IRQ1-DS) resets the MCU, RSTSR0.DPSRSTF lights LED2, IOKEEP keeps it',()=>{
 const {session,log}=open(fixture('ra_lpm_deep'));
 const text=()=>String.fromCharCode(...log.uart.filter(e=>e.instance==='SCI9'&&e.direction==='TX').flatMap(e=>e.bytes)),lpm=()=>log.trace.filter(e=>e.protocol==='LPM').map(e=>e.message);
 runUntil(session,900);assert.ok(session.gpio.P408.value>1.65,'LED1 on while working');assert.equal(session.soc.lpm.mode,null);
 runUntil(session,1400);
 assert.equal(session.soc.lpm.mode,'DEEP');assert.ok(session.gpio.P408.value<1,'LED1 off in the mode');assert.equal(session.machine.cpu.sleeping,true);
 assert.equal(text(),'Power-on start\r\nEntering Deep Software Standby: press S1\r\n');
 // What r_lpm.c wrote: SBYCR.SSBY, DPSBYCR = DPSBY | IOKEEP (DEEPCUT 0), DPSIER0.DIRQ1E, falling edge, WUPEN.IRQ1.
 const sys=session.soc.system,bus=session.machine.bus;
 assert.equal(sys.get(0x0c,2)&0x8000,0x8000);assert.equal(bus.read8(0x4001e400),0xc0);assert.equal(bus.read8(0x4001e402),0x02);assert.equal(bus.read8(0x4001e40a),0);assert.equal(session.soc.icu.get(0x1a0,4),2);
 assert.deepEqual(lpm(),['Deep Software Standby 진입 · DEEPCUT0, I/O 유지(IOKEEP 1) — 해제 소스: IRQ1-DS(P205)']);
 const cycles=session.machine.cpu.instructions;runUntil(session,3000);assert.equal(session.machine.cpu.instructions,cycles,'the CPU is stopped while simulated time passes');assert.equal(session.resets.length,0);
 session.setPressed({SW1:true});runUntil(session,3040);session.setPressed({});
 assert.equal(session.resets.length,1);assert.equal(session.resets[0].reason,'DEEP_STANDBY');
 assert.ok(log.trace.some(e=>e.protocol==='RESET'&&e.message==='MCU 리셋 · DEEP_STANDBY'));
 assert.match(lpm()[1],/^Deep Software Standby 해제 · IRQ1-DS\(P205\) \(\d\.\d\d s 뒤\) — MCU 리셋\(RSTSR0\.DPSRSTF = 1, I\/O는 R_LPM_IoKeepClear까지 유지\)$/);
 assert.equal(session.soc.resetStatus.rstsr0&0x80,0x80,'RSTSR0.DPSRSTF');assert.equal(bus.read8(0x4001e406)&0x02,0x02,'DPSIFR0.DIRQ1F');
 runUntil(session,3500);
 assert.equal(session.readVariable('from_deep_standby'),1);assert.ok(session.gpio.P407.value>1.65,'LED2: started from Deep Software Standby');assert.ok(session.gpio.P408.value>1.65,'LED1: working again');
 assert.match(text(),/Woke up from Deep Software Standby by S1 \(IRQ1-DS\)\r\n$/);
 // The second time LED2 stays on in the mode (the pins keep their state), and after the next wake-up too.
 runUntil(session,4500);assert.equal(session.soc.lpm.mode,'DEEP');assert.ok(session.gpio.P407.value>1.65);assert.ok(session.gpio.P408.value<1);
 session.setPressed({SW1:true});runUntil(session,4540);session.setPressed({});
 assert.equal(session.resets.length,2);assert.ok(session.gpio.P407.value>1.65,'IOKEEP: no dark moment for LED2 at the reset');
});

test('ra_rtc_clock: the real r_rtc on LOCO — set to 2025-12-31 23:59:55, the 1 s periodic interrupt prints on SCI9, the midnight alarm lights LED2',()=>{
 const {session,log}=open(fixture('ra_rtc_clock'));
 runUntil(session,5600);
 const text=String.fromCharCode(...log.uart.filter(e=>e.instance==='SCI9'&&e.direction==='TX').flatMap(e=>e.bytes));
 assert.equal(text,'2025-12-31 23:59:56\r\n2025-12-31 23:59:57\r\n2025-12-31 23:59:58\r\n2025-12-31 23:59:59\r\n2026-01-01 00:00:00 Happy New Year!\r\n');
 assert.ok(session.gpio.P407.value>1.65,'LED2: the alarm');assert.equal(session.readVariable('seconds'),5);
 // The RTC registers: running (RCR2.START), 24-hour mode, LOCO count source (RCR4.RCKSEL), PES 1 s with PIE and AIE.
 const rtc=session.soc.rtc;assert.equal(rtc.read(0x24,1)&0x41,0x41);assert.equal(rtc.read(0x28,1)&1,1);assert.equal(rtc.read(0x22,1)&0xf5,0xe5);
 assert.deepEqual([rtc.read(0x0e,2),rtc.read(0x0c,1),rtc.read(0x0a,1),rtc.read(0x08,1)],[0x26,0x01,0x01,4],'2026-01-01, a Thursday');
});

test('ra_iic_slave: IIC0 answers at 0x42 as r_iic_slave; the ESP32 sketch (I2C master) writes the LED byte and reads the counter',()=>{
 const {session,log}=open(fixture('ra_iic_slave')),board=[];
 session.circuit.drivers=createBoardDrivers(session.project,{log:s=>board.push(s)});connectStm32Drivers(session);
 runUntil(session,1300);
 assert.deepEqual(board.filter(l=>/RA /.test(l)),['[ESP32-1] RA count=0 led=1 error=0','[ESP32-1] RA count=1 led=0 error=0','[ESP32-1] RA count=2 led=1 error=0']);
 const iic=session.soc.iics[0];
 // The registers r_iic_slave leaves between transfers: the own address in SARL0 with SAR0E, RXI and TXI enabled, bus free.
 assert.equal(iic.read(0x0a,1),0x42<<1);assert.equal(iic.read(0x06,1)&1,1);assert.equal(iic.read(0x07,1),0xa0);assert.equal(iic.read(0x01,1)&0x80,0);
 assert.ok(iic.slaveListens(0x42));assert.equal(session.soc.i2cs,session.soc.iics,'found by another board\'s I2C master');
 // The first write and read, as the slave saw them on the bus.
 assert.deepEqual(iic.log.slice(0,8).map(e=>[e.type,e.byte??e.read]),[['slave-address',false],['slave-rx',1],['slave-stop',undefined],['slave-address',true],['slave-tx',0],['slave-tx',1],['slave-stop',undefined],['slave-address',false]]);
 assert.equal(session.readVariable('writes_seen'),3);assert.equal(session.readVariable('reads_answered'),3);assert.equal(session.readVariable('aborted'),0);
 assert.ok(session.gpio.P407.value>1.65,'LED2: the last byte written was 1');
 assert.ok(log.trace.some(e=>/ESP32-1 · 0x42 READ 2 B · ACK/.test(e.message)));
});

// The slave's answer to a byte is known only after its program took the byte before: six bytes into the example's
// R_IIC_SLAVE_Read(4) and Read(0) end with a NACK on both engines, and a write of no bytes (a bus scan) is ACKed.
test('ra_iic_slave: a write longer than the slave takes ends with NACK (error 2) for the ESP32 master on the emulator and on the interpreter',()=>{
 const sketch='#include <Wire.h>\nvoid setup() { Serial.begin(115200); Wire.begin(21, 22); delay(100); }\nvoid loop() {\n  Wire.beginTransmission(0x42);\n  Wire.write(1); Wire.write(2); Wire.write(3); Wire.write(4); Wire.write(5); Wire.write(6);\n  int error = Wire.endTransmission();\n  Wire.beginTransmission(0x42);\n  int scan = Wire.endTransmission();\n  Wire.beginTransmission(0x43);\n  int none = Wire.endTransmission();\n  Serial.printf("W6 error=%d scan=%d none=%d\\n", error, scan, none);\n  delay(500);\n}\n';
 const withSketch=p=>{p.components.find(c=>c.id==='esp1').code=sketch;};
 const lines={};
 {const {session}=open(fixture('ra_iic_slave'),{},withSketch),board=[];
  session.circuit.drivers=createBoardDrivers(session.project,{log:s=>board.push(s)});connectStm32Drivers(session);runUntil(session,400);
  lines.emulator=board.filter(l=>/W6/.test(l));assert.equal(session.readVariable('writes_seen'),1);assert.equal(session.readVariable('aborted'),0);assert.equal(session.readVariable('command'),1,'the first four bytes were taken');}
 {const p=project(fixture('ra_iic_slave'));withSketch(p);const board=[],session=new SimulationSession(p,{});
  session.circuit.drivers=createBoardDrivers(session.project,{log:s=>board.push(s)});session.buses.boards=()=>session.circuit.drivers;connectStm32Drivers(session);for(let t=20;t<=400;t+=20)session.tick(t);
  lines.interpreter=board.filter(l=>/W6/.test(l));assert.equal(session.readVariable('writes_seen'),1);}
 assert.deepEqual(lines,{emulator:['[ESP32-1] W6 error=2 scan=0 none=2'],interpreter:['[ESP32-1] W6 error=2 scan=0 none=2']});
});
