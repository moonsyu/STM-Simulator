// Register-level tests of the STM32F446 peripheral models on a bare machine (no firmware).
import test from 'node:test';
import assert from 'node:assert/strict';
import { Machine } from '../../src/emu/machine.js';
import { Stm32f446 } from '../../src/emu/stm32f446/soc.js';
import { Signals, decodeUart, Line } from '../../src/emu/stm32f446/signals.js';
import { formatFat32, addFile, readFile, listFiles } from '../../src/emu/stm32f446/fat.js';
import { SdCard } from '../../src/emu/stm32f446/sdcard.js';
import { afSignal, afNumber } from '../../src/emu/stm32f446/tables.js';

function chip(envOverrides = {}, options = {}) {
  const pins = {}, levels = {}, analog = {};
  const env = { pinState: (pin, s) => { pins[pin] = s; }, digitalIn: pin => levels[pin] ?? null, analogIn: pin => analog[pin] ?? null, ...envOverrides };
  const machine = new Machine();
  const soc = new Stm32f446(machine, env, options);
  const w = (a, v) => machine.bus.write32(a, v), r = a => machine.bus.read32(a) >>> 0;
  const advance = us => { machine.cycles += Math.ceil(us * soc.clock.hclk / 1e6); soc.sync(); };
  return { machine, soc, pins, levels, analog, w, r, advance };
}
const RCC = 0x40023800, GPIOA = 0x40020000, TIM3 = 0x40000400, USART2 = 0x40004400;

test('RCC: HSE/PLL ready flags, SYSCLK switch and bus clocks', () => {
  const { soc, w, r, advance } = chip();
  assert.equal(r(RCC) & 3, 3, 'HSION + HSIRDY after reset');
  w(RCC, r(RCC) | (1 << 16));
  assert.equal(r(RCC) & (1 << 17), 0);
  advance(200);
  assert.ok(r(RCC) & (1 << 17), 'HSERDY');
  w(RCC + 0x04, (8) | (360 << 6) | (0 << 16) | (1 << 22) | (7 << 24) | (2 << 28)); // HSE/8*360/2 = 180 MHz
  w(RCC, r(RCC) | (1 << 24)); advance(200);
  assert.ok(r(RCC) & (1 << 25), 'PLLRDY');
  w(RCC + 0x08, (2) | (5 << 10) | (4 << 13)); // PLL, APB1 /4, APB2 /2
  assert.equal((r(RCC + 0x08) >> 2) & 3, 2, 'SWS = PLL');
  assert.deepEqual([soc.clock.hclk, soc.clock.pclk1, soc.clock.pclk2, soc.clock.tim1, soc.clock.tim2], [180e6, 45e6, 90e6, 90e6, 180e6]);
});

test('GPIO: clock gating, MODER/BSRR to the circuit, IDR from circuit levels', () => {
  const { w, r, pins, levels } = chip();
  w(GPIOA + 0x18, 1 << 5);
  assert.equal(r(GPIOA + 0x14), 0, 'unclocked GPIOA ignores writes');
  w(RCC + 0x30, 1);
  w(GPIOA + 0x00, (r(GPIOA) & ~(3 << 10)) | (1 << 10));
  w(GPIOA + 0x18, 1 << 5);
  assert.deepEqual(pins.PA5, { mode: 'OUTPUT', value: 3.3, openDrain: false, pull: 0 });
  w(GPIOA + 0x18, 1 << 21);
  assert.equal(pins.PA5.value, 0);
  w(GPIOA + 0x0c, 1 << 20); // PA10 pull-up input
  assert.equal(pins.PA10.mode, 'INPUT_PULLUP');
  levels.PA10 = 1; assert.equal((r(GPIOA + 0x10) >> 10) & 1, 1);
  levels.PA10 = 0; assert.equal((r(GPIOA + 0x10) >> 10) & 1, 0);
  assert.equal(afSignal('PA2', 7), 'USART2_TX'); assert.equal(afNumber('PB9', 'I2C1_SDA'), 4);
});

test('TIM3 PWM mode 1 on PA6 (AF2): averaged output, update interrupt line, counter', () => {
  const { machine, soc, w, r, pins, advance } = chip();
  w(RCC + 0x30, 1); w(RCC + 0x40, 2);
  w(GPIOA + 0x00, (r(GPIOA) & ~(3 << 12)) | (2 << 12)); w(GPIOA + 0x20, 2 << 24);
  w(TIM3 + 0x28, 15); w(TIM3 + 0x2c, 999); w(TIM3 + 0x34, 250);
  w(TIM3 + 0x18, (6 << 4) | (1 << 3)); w(TIM3 + 0x20, 1); w(TIM3 + 0x14, 1); w(TIM3 + 0x10, 0);
  w(TIM3 + 0x0c, 1); w(TIM3 + 0x00, 1);
  assert.ok(Math.abs(pins.PA6.value - 0.825) < 1e-9, `PA6 ${pins.PA6.value}`);
  assert.ok(Math.abs(pins.PA6.pwm.frequency - 1000) < 1e-9);
  advance(500);
  assert.ok(Math.abs(r(TIM3 + 0x24) - 500) <= 1, `CNT ${r(TIM3 + 0x24)}`);
  advance(600);
  assert.equal(r(TIM3 + 0x10) & 1, 1, 'UIF'); assert.equal(machine.nvic.lines[29], 1, 'TIM3 IRQ line');
  w(TIM3 + 0x10, 0); assert.equal(machine.nvic.lines[29], 0);
  soc.options.pwmWaveform = true; w(TIM3 + 0x34, 250);
  advance(10);
});

test('USART2: frame timing, TXE/TC flags, waveform decodes back, VCP-style receiver loopback', () => {
  const sources = [];
  const { soc, w, r, advance } = chip({ lineSources: () => sources });
  w(RCC + 0x30, 1); w(RCC + 0x40, 1 << 17);
  w(GPIOA + 0x00, (r(GPIOA) & ~(0xf << 4)) | (0xa << 4)); w(GPIOA + 0x20, 0x7700);
  w(USART2 + 0x08, 16e6 / 115200 | 0); w(USART2 + 0x0c, (1 << 13) | (1 << 3) | (1 << 2));
  advance(200);
  sources.push(soc.signals.line('PA2')); // TX wired to RX
  w(USART2 + 0x04, 0x41);
  assert.equal(r(USART2) & 0x40, 0, 'TC cleared while sending');
  advance(100);
  assert.ok(r(USART2) & 0x40, 'TC after ~87 µs');
  assert.ok(r(USART2) & 0x20, 'RXNE: loopback frame received');
  assert.equal(r(USART2 + 0x04), 0x41);
  assert.deepEqual(decodeUart(soc.signals.line('PA2'), { baud: 115200 }).map(f => f.value), [0x41]);
});

test('EXTI: PC13 falling edge sets PR and the EXTI15_10 line', () => {
  const { machine, soc, w, r, levels } = chip();
  w(RCC + 0x30, 4); w(RCC + 0x44, 1 << 14);
  levels.PC13 = 1; soc.inputsUpdated();
  w(0x40013800 + 0x14, 2 << 4); // EXTICR4: EXTI13 = port C
  w(0x40013c00 + 0x00, 1 << 13); w(0x40013c00 + 0x0c, 1 << 13);
  levels.PC13 = 0; soc.inputsUpdated();
  assert.ok(r(0x40013c14) & (1 << 13)); assert.equal(machine.nvic.lines[40], 1);
  w(0x40013c14, 1 << 13); assert.equal(machine.nvic.lines[40], 0);
});

test('DMA2 memory-to-memory copy with TC flag', () => {
  const { machine, w, r, advance } = chip();
  w(RCC + 0x30, 1 << 22);
  for (let i = 0; i < 16; i++) machine.bus.write8(0x20000100 + i, i * 3);
  const S0 = 0x40026400 + 0x10;
  w(S0 + 0x04, 4); w(S0 + 0x08, 0x20000100); w(S0 + 0x0c, 0x20000200);
  w(S0, (2 << 6) | (1 << 9) | (1 << 10) | (2 << 11) | (2 << 13) | 1);
  advance(1);
  assert.equal(r(0x40026400) & (1 << 5), 1 << 5, 'TCIF0');
  assert.deepEqual([...machine.readMemory(0x20000200, 16)], Array.from({ length: 16 }, (_, i) => i * 3));
});

test('ADC1 single conversion samples the pin voltage; internal VREFINT', () => {
  const { w, r, analog, advance } = chip();
  w(RCC + 0x44, 1 << 8); analog.PA1 = 2.5;
  w(0x40012000 + 0x34, 1); w(0x40012000 + 0x08, 1); w(0x40012000 + 0x08, 1 | (1 << 30));
  advance(20);
  assert.ok(r(0x40012000) & 2, 'EOC');
  assert.equal(r(0x40012000 + 0x4c), Math.round(2.5 / 3.3 * 4095));
  w(0x40012300 + 0x04, 1 << 23); w(0x40012000 + 0x34, 17); w(0x40012000 + 0x08, 1 | (1 << 30)); advance(20);
  assert.equal(r(0x40012000 + 0x4c), Math.round(1.21 / 3.3 * 4095));
});

test('CRC unit, DBGMCU IDCODE, flash size and unique ID', () => {
  const { w, r, machine } = chip();
  w(RCC + 0x30, 1 << 12); w(0x40023000 + 0x08, 1); w(0x40023000, 0x12345678);
  assert.equal(r(0x40023000), 0xdf8a8a2b);
  assert.equal(machine.bus.read32(0xe0042000) >>> 0, 0x10006421);
  assert.equal(machine.bus.read16(0x1fff7a22), 512);
  assert.notEqual(machine.bus.read32(0x1fff7a10) >>> 0, 0xffffffff);
});

test('signals: noise is deterministic, decoders read the waveform', () => {
  const run = () => { const s = new Signals({ enabled: true, bitErrorRate: 0.3, seed: 7 }); const l = s.line('TX'); let t = 0; for (const c of 'HELLO') t = s.uartFrame(l, t, c.charCodeAt(0), { baud: 9600 }); return decodeUart(l, { baud: 9600 }).map(f => f.value); };
  assert.deepEqual(run(), run());
  assert.notEqual(String.fromCharCode(...run()), 'HELLO');
  const clean = new Signals(), l = clean.line('TX'); let t = 0; for (const c of 'OK') t = clean.uartFrame(l, t, c.charCodeAt(0), { baud: 9600 });
  assert.equal(String.fromCharCode(...decodeUart(l, { baud: 9600 }).map(f => f.value)), 'OK');
  const line = new Line('x'); line.push(10, 0); line.push(20, 1);
  assert.deepEqual(line.samples(5, 30), [[5, 1], [10, 0], [20, 1]]);
});

test('FAT32 image tools and SD card command set', () => {
  const img = formatFat32(34 * 1024 * 1024);
  addFile(img, 'A.TXT', 'x'.repeat(1500));
  assert.equal(readFile(img, 'a.txt').length, 1500);
  assert.deepEqual(listFiles(img), [{ name: 'A.TXT', size: 1500, dir: false }]);
  const card = new SdCard(img);
  assert.equal(card.command(8, 0x1aa).resp[0], 0x1aa);
  card.command(55, 0); card.command(41, 0x40100000); card.command(55, 0);
  assert.ok(card.command(41, 0x40100000).resp[0] & 0x80000000, 'ready after ACMD41 polls');
  assert.equal(card.command(2, 0).type, 'r2');
  const spi = new SdCard(new Uint8Array(1 << 20));
  for (const b of [0x40, 0, 0, 0, 0, 0x95]) spi.spiByte(b);
  assert.deepEqual([spi.spiByte(0xff), spi.spiByte(0xff)], [0xff, 0x01]);
});
