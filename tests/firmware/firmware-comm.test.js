// UART / USART / I²C / SPI firmware fixtures connected to the existing device models.
import test from 'node:test';
import assert from 'node:assert/strict';
import { open, runUntil, printed, vcpText } from './helpers.mjs';

test('uart: USART2 ST-LINK VCP output and interrupt-driven echo of injected bytes', () => {
  const { session, log } = open('uart');
  runUntil(session, 100);
  assert.match(vcpText(session), /HAL UART ready\r\n/);
  assert.equal(session.buses.uart.baud, 9600);
  // One byte at a time: the example re-arms Receive_IT from the RX callback while
  // Transmit_IT of the previous echo may still be busy (as on hardware).
  assert.equal(session.inject('h', 'USART2'), 1);
  runUntil(session, 150);
  assert.equal(session.inject('i', 'USART2'), 1);
  runUntil(session, 200);
  assert.match(vcpText(session), /HAL UART ready\r\nhi$/);
  const rx = log.uart.filter(e => e.direction === 'RX').flatMap(e => e.bytes);
  assert.deepEqual(rx, [104, 105]);
  assert.ok(log.uart.some(e => e.instance === 'USART2' && e.direction === 'TX'));
});

test('uart_dma: HAL_UART_Transmit_DMA / Receive_DMA (DMA1 streams 6/5) end to end', () => {
  const { session, log } = open('uart_dma');
  runUntil(session, 60);
  assert.ok(printed(log, /^tx done$/));
  assert.equal(session.inject('abcde', 'USART2'), 5);
  runUntil(session, 160);
  assert.ok(printed(log, /^rx=abcde$/), log.print.join('|'));
  assert.ok(printed(log, /^echo done$/));
  assert.equal(vcpText(session), 'DMA hello\r\nabcde');
  // Logic analyzer view of the same traffic.
  const ids = session.signals.channels().map(c => c.id);
  assert.ok(ids.includes('USART2_TX') && ids.includes('VCP_TX'));
  assert.equal(session.signals.decode('USART2_TX').map(f => String.fromCharCode(f.value)).join(''), 'DMA hello\r\nabcde');
  const first = session.signals.samples('PA2', 0, 1e9);
  assert.equal(first[0][1], 1, 'idle high');
});

test('uart noise model corrupts received frames (framing / noise errors reach the firmware)', () => {
  const { session, log } = open('uart_dma');
  runUntil(session, 60);
  assert.deepEqual(session.signals.setNoise({ enabled: true, bitErrorRate: 0.25, glitchRate: 0, jitterNs: 0 }), { enabled: true, bitErrorRate: 0.25, glitchRate: 0, jitterNs: 0 });
  session.inject('abcdeabcde', 'USART2');
  runUntil(session, 200);
  const usart = session.soc.usarts.USART2;
  const line = printed(log, /^rx=/);
  assert.ok(usart.stats.errors > 0 || (line && line !== 'rx=abcde'), `errors=${usart.stats.errors} ${line}`);
  assert.ok(session.signals.decode('VCP_TX').some(f => f.error), 'decoder flags the corrupted frames');
});

test('usart_sync: USART1 synchronous master clocks an SPI memory through CK/TX/RX', () => {
  const { session, log } = open('usart_sync');
  runUntil(session, 80);
  assert.ok(printed(log, /^sync read=0x5A$/), log.print.join('|'));
  assert.equal(session.buses.memory(session.project.components.find(p => p.type === 'spi')).data[0x10], 0x5a);
  const frames = session.signals.decode('USART1_SYNC');
  assert.ok(frames.length >= 6, 'CK/TX waveform decodes as synchronous frames');
  const ck = session.signals.samples('PA8', 0, 1e9);
  assert.ok(ck.length > 16, 'CK pin toggles');
});

test('i2c: HAL_I2C_Mem_Write / Mem_Read against the 0x50 I²C memory model', () => {
  const { session, log } = open('i2c');
  runUntil(session, 100);
  assert.ok(printed(log, /I2C write=0 read=0/));
  assert.ok(printed(log, /^42$/));
  const decoded = session.signals.decode('I2C1').map(f => f.label);
  assert.ok(decoded.includes('0x50 W ACK') && decoded.includes('0x50 R ACK'), decoded.join(' '));
});

test('sht31: single-shot measurement over I²C follows the sensor properties', () => {
  const { session, log } = open('sht31');
  runUntil(session, 300);
  assert.ok(printed(log, /SHT31=25\.0 C RH=50\.0 %/));
  const part = session.project.components.find(p => p.type === 'sht31');
  part.temperature = 31.5; part.humidity = 40;
  const before = log.print.length;
  runUntil(session, 2300);
  assert.ok(log.print.slice(before).some(l => /SHT31=31\.5 C RH=40\.0 %/.test(l)), log.print.slice(before).join('|'));
});

test('mpu6050: WHO_AM_I and accelerometer registers', () => {
  const { session, log } = open('mpu6050');
  runUntil(session, 300);
  assert.ok(printed(log, /WHO_AM_I=0x68/));
  assert.ok(printed(log, /g=\(0\.00,0\.00,1\.00\)/));
});

test('i2c address NACK when the sensor is unpowered', () => {
  const { session, log } = open('sht31', {}, p => { p.wires = p.wires.filter(w => w.to !== 'rail:L:+:1'); });
  runUntil(session, 300);
  assert.ok(log.trace.some(t => /NACK/.test(t.message)));
  assert.ok(session.signals.decode('I2C1').some(f => f.error === '주소 NACK'));
});

test('spi: SPI1 memory write/read with software chip select', () => {
  const { session, log } = open('spi');
  runUntil(session, 100);
  assert.ok(printed(log, /^42$/));
  const frames = session.signals.decode('SPI1');
  assert.deepEqual(frames.slice(0, 3).map(f => f.mosi), [0x02, 0x10, 42]);
  assert.equal(frames.at(-1).miso, 42);
});

test('matrix: MAX7219 over SPI receives the frame', () => {
  const { session } = open('matrix');
  const r = runUntil(session, 300);
  const device = r.parts.demo.device;
  assert.equal(device.display, true);
  assert.ok([...Object.values(device.ram)].some(v => v), 'frame rows written');
});

test('sd_spi: SPI-mode SD card answers CMD0/8/55/41/58', () => {
  const { session, log } = open('sd_spi');
  runUntil(session, 400);
  assert.ok(printed(log, /SD OCR=c0ff8000/i), log.print.join('|'));
});
