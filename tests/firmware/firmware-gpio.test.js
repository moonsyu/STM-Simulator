// GPIO / timer firmware fixtures running in FirmwareSession with circuits from the app's HAL examples.
import test from 'node:test';
import assert from 'node:assert/strict';
import { open, runUntil, printed } from './helpers.mjs';

test('blink: Cube-generated main.c toggles the LED with HAL_Delay (SysTick) and prints over SWV ITM', () => {
  const { session, log } = open('blink');
  const states = [];
  runUntil(session, 1700, { onTick: (ms, r) => states.push([ms, r.parts.led1?.on]) });
  const at = t => states.find(([ms]) => ms >= t)?.[1];
  assert.equal(at(250), true);
  assert.equal(at(750), false);
  assert.equal(at(1250), true);
  assert.deepEqual(log.print.slice(0, 3), ['PA5=1', 'PA5=0', 'PA5=1']);
  assert.equal(session.soc.clock.hclk, 84e6, 'SystemClock_Config switches to the 84 MHz HSI PLL');
  assert.equal(session.runtime.gpio.PA5.mode, 'OUTPUT');
});

test('exti: USER button (PC13) falling edge raises EXTI15_10 and the callback toggles the LED', () => {
  const { session, log } = open('exti');
  runUntil(session, 100);
  assert.equal(session.viewResult.parts.led1.on, false);
  session.setPressed({ USER: true });
  runUntil(session, 140);
  session.setPressed({});
  runUntil(session, 200);
  assert.equal(session.viewResult.parts.led1.on, true);
  assert.ok(printed(log, /EXTI PC13/));
  session.setPressed({ USER: true });
  runUntil(session, 240);
  session.setPressed({});
  runUntil(session, 300);
  assert.equal(session.viewResult.parts.led1.on, false);
  assert.equal(log.print.filter(l => /EXTI PC13/.test(l)).length, 2);
});

test('pwm: TIM2 CH1 100 Hz 50 % produces real edges in PWM waveform mode and charges the RC filter', () => {
  const { session } = open('pwm');
  session.signals.record(['PA5']);
  const r = runUntil(session, 400);
  const edges = session.signals.samples('gpio:PA5', 200000, 400000).slice(1);
  const rises = edges.filter(e => e[1] === 1).map(e => e[0]), falls = edges.filter(e => e[1] === 0).map(e => e[0]);
  const period = (rises.at(-1) - rises[0]) / (rises.length - 1);
  assert.ok(Math.abs(period - 10000) < 5, `period ${period} µs`);
  const high = falls.find(t => t > rises[0]) - rises[0];
  assert.ok(Math.abs(high / period - 0.5) < 0.01, `duty ${high / period}`);
  const cap = r.parts.demo.voltage;
  assert.ok(cap > 1.2 && cap < 2.1, `RC filter voltage ${cap}`);
});

test('pwm without waveform mode drives the averaged voltage and reports the PWM frequency', () => {
  const { session } = open('pwm', {}, p => { p.simulation = { stepMs: 1, pwmWaveform: false }; });
  runUntil(session, 100);
  const g = session.runtime.gpio.PA5;
  assert.ok(Math.abs(g.value - 1.65) < 0.01, `PA5 average ${g.value}`);
  assert.ok(Math.abs(session.runtime.pwmFrequency.get('PA5') - 100) < 0.01);
});

test('timer_multi: TIM2 50 Hz servo pulse and TIM3 1 kHz motor PWM move the devices', () => {
  const { session, log } = open('timer_multi');
  const r = runUntil(session, 900);
  assert.ok(Math.abs(r.parts.servo2.pulse - 1000) < 2, `servo pulse ${r.parts.servo2.pulse}`);
  assert.ok(r.parts.demo.rpm > 500, `motor rpm ${r.parts.demo.rpm}`);
  assert.ok(printed(log, /TIM2 servo=0 deg/));
});

test('timer_capture: TIM4 input capture measures the TIM3 250 Hz signal', () => {
  const { session, log } = open('timer_capture');
  runUntil(session, 400);
  assert.ok(printed(log, /period=4000 us frequency=250 Hz/), log.print.join('\n'));
});

test('timer_encoder: rotating the encoder counts in TIM4 encoder mode (TI12)', () => {
  const { session, log } = open('timer_encoder');
  runUntil(session, 150);
  session.project.components.find(p => p.type === 'encoder').position = 3;
  runUntil(session, 450);
  assert.ok(printed(log, /count=3 edges=12/), log.print.slice(-3).join('\n'));
  session.project.components.find(p => p.type === 'encoder').position = 1;
  runUntil(session, 750);
  assert.ok(printed(log, /count=1 edges=4/), log.print.slice(-3).join('\n'));
});

test('lcd: HD44780 4-bit GPIO driver writes text to the LCD1602 model', () => {
  const { session } = open('lcd');
  const r = runUntil(session, 600);
  const lcd = r.parts.demo.lcd;
  assert.equal(lcd.visible, true);
  assert.ok(lcd.lines[0].trim().length > 0, JSON.stringify(lcd.lines));
});

test('nvic: higher-priority TIM3 preempts the running TIM2 handler', () => {
  const { session, log } = open('nvic');
  runUntil(session, 120);
  const line = printed(log, /^order=/);
  assert.ok(line?.startsWith('order=ABa'), line);
});
