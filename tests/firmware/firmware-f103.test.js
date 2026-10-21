// NUCLEO-F103RB firmware: HAL examples ported to the STM32F103RB, compiled against STM32CubeF1
// (scripts/emu/build-f103-fixtures.mjs) and run on the F1 SoC model through FirmwareSession.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FirmwareSession } from '../../src/firmware-session.js';
import { Stm32f103 } from '../../src/emu/stm32f103/soc.js';
import { runUntil, printed, vcpText } from './helpers.mjs';

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../fixtures/firmware-f103');
function open(name) {
  const project = JSON.parse(fs.readFileSync(path.join(DIR, name + '.json'), 'utf8'));
  const log = { print: [], uart: [] };
  const session = new FirmwareSession(project, { elf: new Uint8Array(fs.readFileSync(path.join(DIR, name + '.elf'))), print: t => log.print.push(t), uart: e => log.uart.push(e), trace: () => {} });
  return { session, log, project };
}
// Register value as the CPU reads it (fixtures keep only symbols and line tables, so no C casts).
const reg = (session, name, offset) => session.soc.peripheral(name).read(offset, 4) >>> 0;

test('blink: the F1 SoC runs STM32CubeF1 startup, the HSI/2 x16 PLL at 64 MHz and toggles LD2 with HAL_Delay', () => {
  const { session, log } = open('blink');
  assert.ok(session.soc instanceof Stm32f103);
  const states = [];
  runUntil(session, 1300, { onTick: (ms, r) => states.push([ms, r.parts.led1?.on]) });
  const at = t => states.find(([ms]) => ms >= t)?.[1];
  assert.equal(at(250), true); assert.equal(at(750), false); assert.equal(at(1250), true);
  assert.deepEqual(log.print.slice(0, 3), ['PA5=1', 'PA5=0', 'PA5=1']);
  assert.deepEqual([session.soc.clock.sysclk, session.soc.clock.pclk1, session.soc.clock.pclk2], [64e6, 32e6, 64e6]);
  const cfgr = reg(session, 'RCC', 0x04);
  assert.equal(cfgr & 0xf, 0xa, 'SW = SWS = PLL'); assert.equal((cfgr >> 18) & 15, 14, 'PLLMUL x16'); assert.equal((cfgr >> 8) & 7, 4, 'APB1 /2');
  assert.equal(reg(session, 'FLASH', 0x00) & 7, 2, 'FLASH latency 2');
  assert.equal(reg(session, 'GPIOA', 0x00) >>> 20 & 0xf, 0x3, 'PA5 CRL: push-pull output, GPIO_SPEED_FREQ_HIGH (50 MHz)');
  assert.equal(reg(session, 'DBGMCU', 0x00) & 0xfff, 0x410, 'DBGMCU DEV_ID medium density');
  assert.ok(Math.abs(Number(String(session.runtime.evaluate('uwTick')).match(/^\d+/)[0]) - 1300) <= 2);
});

test('exti: PC13 is routed through AFIO_EXTICR4 and each USER press toggles the LED', () => {
  const { session, log } = open('exti');
  runUntil(session, 100);
  assert.equal((reg(session, 'AFIO', 0x14) >> 4) & 0xf, 2, 'EXTICR4 line 13 = port C');
  assert.equal(session.viewResult.parts.led1.on, false);
  session.setPressed({ USER: true }); runUntil(session, 140); session.setPressed({}); runUntil(session, 200);
  assert.equal(session.viewResult.parts.led1.on, true);
  session.setPressed({ USER: true }); runUntil(session, 240); session.setPressed({}); runUntil(session, 300);
  assert.equal(session.viewResult.parts.led1.on, false);
  assert.equal(log.print.filter(l => /EXTI PC13/.test(l)).length, 2);
});

test('uart: USART2 (PA2/PA3) at the F1 address prints to the ST-LINK VCP and echoes injected bytes', () => {
  const { session, log } = open('uart');
  runUntil(session, 100);
  assert.match(vcpText(session), /HAL UART ready\r\n/);
  assert.equal(session.inject('h', 'USART2'), 1); runUntil(session, 150);
  assert.equal(session.inject('i', 'USART2'), 1); runUntil(session, 200);
  assert.match(vcpText(session), /HAL UART ready\r\nhi$/);
  assert.deepEqual(log.uart.filter(e => e.direction === 'RX').flatMap(e => e.bytes), [104, 105]);
});

test('adc: ADC1 calibration, ADCCLK = PCLK2/6 and a single conversion of the divider', () => {
  const { session, log } = open('adc');
  runUntil(session, 600);
  assert.ok(Math.abs(session.soc.clock.adc - 64e6 / 6) < 1);
  assert.equal(reg(session, 'ADC1', 0x08) & 0xc, 0, 'RSTCAL and CAL cleared themselves');
  assert.ok(log.print.length >= 1 && log.print.every(l => /^20(4[5-9]|50)$/.test(l)), log.print.join('|'));
});

test('adc_dma_scan: scan of IN0/IN1 into a circular DMA1 channel 1 buffer', () => {
  const { session } = open('adc_dma_scan');
  runUntil(session, 300);
  const ccr1 = reg(session, 'DMA1', 0x08);
  assert.equal(ccr1 & 0x21, 0x21, 'channel 1 enabled in circular mode');
  const n = name => Number(String(session.runtime.evaluate(name)).match(/^\d+/)[0]);
  assert.ok(n('blocks') > 100, `half/full callbacks ${n('blocks')}`);
  assert.ok(Math.abs(n('avgX') - 2047) <= 3 && Math.abs(n('avgY') - 2047) <= 3);
});

test('dma_uart_echo: ReceiveToIdle on DMA1 channel 6 and the echo on channel 7', () => {
  const { session } = open('dma_uart_echo');
  runUntil(session, 50);
  assert.equal(session.inject('abc', 'USART2'), 3);
  runUntil(session, 120);
  assert.match(vcpText(session), /abc$/);
  assert.equal(Number(String(session.runtime.evaluate('echoed')).match(/^\d+/)[0]), 3);
});

test('pwm: TIM2 CH1 on PA15 (partial remap, JTAG released) produces 100 Hz 50 % edges', () => {
  const { session, project } = open('pwm');
  assert.equal(project.mcu.pins.PA15.function, 'TIM2_CH1');
  session.signals.record(['PA15']);
  runUntil(session, 300);
  assert.equal((reg(session, 'AFIO', 0x04) >> 8) & 3, 1, 'AFIO_MAPR TIM2_REMAP = partial 1');
  const edges = session.signals.samples('gpio:PA15', 100000, 300000).slice(1);
  const rises = edges.filter(e => e[1] === 1).map(e => e[0]), falls = edges.filter(e => e[1] === 0).map(e => e[0]);
  const period = (rises.at(-1) - rises[0]) / (rises.length - 1);
  assert.ok(Math.abs(period - 10000) < 5, `period ${period} µs`);
  assert.ok(Math.abs((falls.find(t => t > rises[0]) - rises[0]) / period - 0.5) < 0.01);
});

test('i2c, spi and timer input capture work at the F1 peripheral addresses', () => {
  const i2c = open('i2c'); runUntil(i2c.session, 300);
  assert.deepEqual(i2c.log.print.slice(0, 2), ['I2C write=0 read=0', '42']);
  const spi = open('spi'); runUntil(spi.session, 300);
  assert.equal(spi.log.print[0], '42');
  const cap = open('timer_capture'); runUntil(cap.session, 300);
  assert.ok(printed(cap.log, /TIM4 capture: period=400[01] us frequency=2(49|50) Hz/), cap.log.print.join('|'));
});
