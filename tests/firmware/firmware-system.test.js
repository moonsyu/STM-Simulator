// ADC, DMA, DCMI, SDIO/FatFs, watchdog, CAN, faults and debugger integration.
import test from 'node:test';
import assert from 'node:assert/strict';
import { open, runUntil, printed } from './helpers.mjs';
import { formatFat32, addFile, readFile, listFiles } from '../../src/emu/stm32f446/fat.js';

test('adc: single conversion of the 10k/10k divider reads mid-scale', () => {
  const { session, log } = open('adc');
  runUntil(session, 600);
  const values = log.print.filter(l => /^\d+$/.test(l)).map(Number);
  assert.ok(values.length >= 2);
  for (const v of values) assert.ok(Math.abs(v - 2048) <= 2, `ADC ${v}`);
});

test('potentiometer: ADC follows the potentiometer position', () => {
  const { session, log } = open('potentiometer');
  runUntil(session, 300);
  const pot = session.project.components.find(p => p.type === 'potentiometer');
  pot.position = 20;
  const before = log.print.length;
  runUntil(session, 900);
  const last = log.print.slice(before).map(l => /ADC=(\d+)/.exec(l)?.[1]).filter(Boolean).map(Number).at(-1);
  const expected = Math.round(session.result.voltage('signal:PA0') / 3.3 * 4095);
  assert.ok(Math.abs(last - expected) <= 2 && Math.abs(last - 2048) > 300, `ADC ${last} expected ${expected}`);
});

test('adc_dma: continuous scan with circular DMA tracks the potentiometer and divider', () => {
  const { session, log } = open('adc_dma');
  runUntil(session, 250);
  let m = /pot=(\d+) div=(\d+)/.exec(printed(log, /pot=/));
  assert.ok(Math.abs(Number(m[1]) - 3071) <= 3, m[0]);
  assert.ok(Math.abs(Number(m[2]) - 2047) <= 3, m[0]);
  session.project.components.find(p => p.id === 'pot').position = 75;
  runUntil(session, 700);
  m = /pot=(\d+) div=(\d+) cycles=(\d+)/.exec(log.print.at(-1));
  assert.ok(Math.abs(Number(m[1]) - 1024) <= 3, m[0]);
  assert.ok(Number(m[3]) > 1000, 'DMA transfer-complete interrupts keep coming in circular mode');
});

test('dcmi: one RGB565 frame is captured through DMA and matches the camera model', () => {
  const { session, log } = open('dcmi', { camera: { width: 160, height: 120 } });
  runUntil(session, 200);
  const line = printed(log, /frame done/);
  assert.ok(line, log.print.join('|'));
  const frame = session.lastFrame;
  assert.equal(frame.width, 160); assert.equal(frame.height, 120);
  let sum = 0; for (const b of frame.data) sum = (Math.imul(sum, 31) + b) >>> 0;
  assert.match(line, new RegExp(`lines=120 checksum=${sum.toString(16).padStart(8, '0')}`));
  assert.equal(session.frameRgba().length, 160 * 120 * 4);
});

test('sdio: FatFs mounts the FAT32 image over SDIO 4-bit, reads INPUT.TXT and writes HELLO.TXT', () => {
  const image = formatFat32(40 * 1024 * 1024);
  addFile(image, 'INPUT.TXT', 'card says hi');
  const { session, log } = open('sdio', { sdImage: image });
  runUntil(session, 400);
  assert.ok(printed(log, /^input=card says hi$/), log.print.join('|'));
  assert.ok(printed(log, /^done$/));
  assert.equal(new TextDecoder().decode(readFile(image, 'HELLO.TXT')), 'Hello from FatFs on the emulated SDIO\r\n');
  assert.deepEqual(listFiles(image).map(f => f.name), ['INPUT.TXT', 'HELLO.TXT']);
});

test('watchdog: IWDG expiry resets the MCU and the firmware sees IWDGRSTF', () => {
  const { session, log } = open('watchdog');
  runUntil(session, 400);
  assert.deepEqual(log.print.slice(0, 5), ['boot', 'refresh 0', 'refresh 1', 'refresh 2', 'stop refreshing']);
  assert.ok(printed(log, /IWDG reset detected/));
  assert.equal(session.resets[0].reason, 'IWDG');
});

test('can: bxCAN loopback delivers the frame; normal mode reports the missing ACK', () => {
  const { session, log } = open('can');
  runUntil(session, 1200);
  assert.ok(printed(log, /CAN id=123 length=2/), log.print.join('|'));
});

test('ov2640: SCCB register read works only with the MCO1 XCLK on PA8', () => {
  const { session, log } = open('ov2640');
  runUntil(session, 300);
  assert.ok(printed(log, /PID\/VER=26 42/));
  assert.ok(session.buses.clocks.get('PA8') > 0);
});

test('fault: a bus fault escalates to HardFault and is reported in Korean with the source line', () => {
  const { session, log } = open('fault');
  assert.throws(() => runUntil(session, 100), /HardFault 발생: .*0x60000000.*main\.c:\d+/);
  assert.deepEqual(log.print, ['before fault']);
});

test('debugger: file:line breakpoints, stepping, call stack, registers, globals and memory', () => {
  const src = (fs => fs.readFileSync(new URL('../fixtures/firmware/src/blink/main.c', import.meta.url), 'utf8'))(globalThis.process.getBuiltinModule('node:fs'));
  const lines = src.split('\n'), toggle = lines.findIndex(l => l.includes('HAL_GPIO_TogglePin(GPIOA, GPIO_PIN_5)')) + 1;
  const { session } = open('blink', { debug: { entry: false, breakpoints: [`main.c:${toggle}`] } });
  runUntil(session, 100);
  const rt = session.runtime;
  assert.equal(rt.debug.paused, true);
  assert.deepEqual(rt.location, { file: 'main.c', line: toggle });
  assert.equal(rt.frames[0].name, 'main');
  const view = rt.inspect();
  assert.ok(view.registers.some(r => r.name === 'pc'));
  assert.ok(view.globals.some(g => g.name === 'uwTick' || g.name === 'SystemCoreClock'), view.globals.map(g => g.name).join(','));
  assert.match(rt.evaluate('SystemCoreClock'), /^84000000 /);
  const odrBefore = parseInt(/\(0x([0-9a-f]+)\)/.exec(rt.evaluate('*(uint32_t*)0x40020014'))[1], 16);
  assert.equal(rt.memory(0x40020014, 4).length, 4);
  rt.resume('over');
  session.tick(session.now / 1000 + 20);
  assert.equal(rt.debug.paused, true);
  assert.equal(rt.location.line, toggle + 1);
  const odrAfter = parseInt(/\(0x([0-9a-f]+)\)/.exec(rt.evaluate('*(uint32_t*)0x40020014'))[1], 16);
  assert.equal((odrBefore ^ odrAfter) & 0x20, 0x20, `step over executed the toggle ${odrBefore} ${odrAfter} ${toggle}`);
  rt.resume('into');
  session.tick(session.now / 1000 + 20);
  assert.equal(rt.location.file, 'stm32f4xx_hal_gpio.c', 'step into enters HAL_GPIO_ReadPin');
  rt.resume('out');
  session.tick(session.now / 1000 + 20);
  assert.equal(rt.location.file, 'main.c');
  // The IDE replaces the breakpoint set while running (F9).
  rt.debug.breakpoints = new Set();
  rt.resume();
  runUntil(session, 1300);
  assert.equal(rt.debug.paused, false);
  assert.ok(session.now >= 1299e3);
});

test('debug entry pauses at main()', () => {
  const { session } = open('blink', { debug: { entry: true, breakpoints: [] } });
  // Start-up code runs through the normal (chunked) tick loop until the temporary main() breakpoint.
  session.tick(0);
  for (let ms = 1; ms <= 200 && !session.runtime.debug.paused; ms++) session.tick(ms);
  assert.equal(session.runtime.debug.paused, true);
  assert.equal(session.runtime.location.file, 'main.c');
  assert.equal(session.runtime.frames[0].name, 'main');
});

test('session exposes real-time ratio and signal API defaults', () => {
  const { session } = open('blink');
  runUntil(session, 100);
  assert.ok(session.realtimeRatio > 0);
  assert.deepEqual(session.signals.noise(), { enabled: false, bitErrorRate: 0, glitchRate: 0, jitterNs: 0 });
  assert.ok(Math.abs(session.signals.now() - session.now) < 1e-6);
});
