import { Scheduler } from './core.js';
import { BusFaultSignal } from '../bus.js';
import { IRQ, AF_TABLE, afSignal } from './tables.js';
import { Rcc } from './rcc.js';
import { FlashInterface, Pwr, Syscfg, Exti, Dbgmcu, Crc, Iwdg, Wwdg, Rtc } from './system.js';
import { GpioPort } from './gpio.js';
import { Timer, TIMER_INFO } from './timer.js';
import { Usart } from './usart.js';
import { I2c } from './i2c.js';
import { Spi } from './spi.js';
import { Adc, AdcCommon } from './adc.js';
import { Dma } from './dma.js';
import { Dcmi } from './dcmi.js';
import { Sdio } from './sdio.js';
import { Can } from './can.js';
import { Signals } from './signals.js';

// STM32F446RE system-on-chip: maps every peripheral model onto the machine bus,
// keeps the time base (cycles ↔ µs across clock changes), the event scheduler,
// IRQ line aggregation, AF pin routing and DMA request lines.
//
// `env` connects the chip to the outside world (circuit + device models):
//   pinState(pin, state)        electrical state changed (runtime.gpio entry)
//   digitalIn(pin) / analogIn(pin) / beforeInputRead()
//   lineSources(pin)            signal Lines electrically driving `pin`
//   uartEvent(e), i2cBus(name, pins), spiTransfer(name, pins, byte, cfg),
//   usartSync(name, pins, byte), camera(), sdCard(), canBus(can, frame),
//   i2sSamples(name, samples, rate), chipSelect(name), onReset(reason)
export const BASES = {
  TIM2: 0x40000000, TIM3: 0x40000400, TIM4: 0x40000800, TIM5: 0x40000c00, TIM6: 0x40001000, TIM7: 0x40001400,
  TIM12: 0x40001800, TIM13: 0x40001c00, TIM14: 0x40002000, RTC: 0x40002800, WWDG: 0x40002c00, IWDG: 0x40003000,
  SPI2: 0x40003800, SPI3: 0x40003c00, USART2: 0x40004400, USART3: 0x40004800, UART4: 0x40004c00, UART5: 0x40005000,
  I2C1: 0x40005400, I2C2: 0x40005800, I2C3: 0x40005c00, CAN1: 0x40006400, CAN2: 0x40006800, PWR: 0x40007000,
  TIM1: 0x40010000, TIM8: 0x40010400, USART1: 0x40011000, USART6: 0x40011400, ADC1: 0x40012000, ADC2: 0x40012100,
  ADC3: 0x40012200, ADC_COMMON: 0x40012300, SDIO: 0x40012c00, SPI1: 0x40013000, SPI4: 0x40013400, SYSCFG: 0x40013800,
  EXTI: 0x40013c00, TIM9: 0x40014000, TIM10: 0x40014400, TIM11: 0x40014800,
  GPIOA: 0x40020000, GPIOB: 0x40020400, GPIOC: 0x40020800, GPIOD: 0x40020c00, GPIOE: 0x40021000, GPIOF: 0x40021400,
  GPIOG: 0x40021800, GPIOH: 0x40021c00, CRC: 0x40023000, RCC: 0x40023800, FLASH: 0x40023c00, DMA1: 0x40026000,
  DMA2: 0x40026400, DCMI: 0x50050000, DBGMCU: 0xe0042000,
};

export class Stm32f446 {
  constructor(machine, env = {}, options = {}) {
    this.machine = machine; this.bus = machine.bus; this.env = env; this.options = { pwmWaveform: false, ...options };
    this.scheduler = new Scheduler();
    this.clock = { sysclk: 16e6, hclk: 16e6, pclk1: 16e6, pclk2: 16e6, tim1: 16e6, tim2: 16e6, pll48: 0 };
    this.segment = { cycle: 0, us: 0, hz: 16e6 };
    this.cycleOffset = 0;
    this.irqSources = new Map();
    this.dmaLines = new Map(); this.kickPending = false;
    this.pins = new Map();
    this.routes = new Map();
    this.signals = new Signals(options.noise, () => this.nowUs());
    this.adcs = [];
    this.peripherals = new Map();
    this.halted = false;
    this.build();
  }
  // ------------------------------------------------------------ assembly
  build() {
    // All peripherals sit behind two router devices (APB/AHB1 window and DCMI)
    // so the machine syncs only a couple of device states per time slice.
    const pages = new Map(), small = new Map();
    const add = (name, dev, base = BASES[name], size = 0x400) => {
      this.peripherals.set(name, dev); dev.base = base;
      if (size < 0x400) small.set(base, dev); else for (let a = base; a < base + size; a += 0x400) pages.set(a >>> 10, dev);
      return dev;
    };
    const lookup = addr => { const d = small.get((addr & ~0xff) >>> 0); if (d) return [d, addr & 0xff]; const p = pages.get(addr >>> 10); return p ? [p, addr - p.base] : null; };
    const soc = this;
    const router = base => ({
      name: 'STM32F446', read(offset, size) { const hit = lookup((base + offset) >>> 0); if (!hit) throw new BusFaultSignal(base + offset, false, size); return hit[0].read(hit[1], size); },
      write(offset, value, size) { const hit = lookup((base + offset) >>> 0); if (!hit) throw new BusFaultSignal(base + offset, true, size); hit[0].write(hit[1], value, size); },
      peek(offset, size) { const hit = lookup((base + offset) >>> 0); if (!hit) return null; const d = hit[0]; return d.peek ? d.peek(hit[1], size) : (d.r ? (size === 4 ? d.r[hit[1] >> 2] : (d.r[hit[1] >> 2] >>> ((hit[1] & 3) * 8)) & (size === 1 ? 0xff : 0xffff)) : null); },
      tick: () => soc.sync(), nextEvent: () => soc.scheduler.next() + soc.cycleOffset, reset: () => soc.machineReset(),
    });
    this.machine.map(0x40000000, 0x80000, router(0x40000000), 'STM32F446 APB/AHB1');
    this.machine.map(0x50050000, 0x400, { ...router(0x50050000), tick: undefined, nextEvent: undefined, reset: undefined }, 'STM32F446 DCMI');
    this.rcc = add('RCC', new Rcc(this));
    this.flash = add('FLASH', new FlashInterface(this));
    this.pwr = add('PWR', new Pwr(this));
    this.syscfg = add('SYSCFG', new Syscfg(this));
    this.exti = add('EXTI', new Exti(this));
    this.gpio = {};
    for (const p of 'ABCDEFGH') this.gpio[p] = add('GPIO' + p, new GpioPort(this, p));
    this.timers = {};
    for (const name of Object.keys(TIMER_INFO)) this.timers[name] = add(name, new Timer(this, name));
    this.usarts = {};
    for (const name of ['USART1', 'USART2', 'USART3', 'UART4', 'UART5', 'USART6']) this.usarts[name] = add(name, new Usart(this, name));
    this.i2cs = {};
    for (const name of ['I2C1', 'I2C2', 'I2C3']) this.i2cs[name] = add(name, new I2c(this, name));
    this.spis = {};
    for (const name of ['SPI1', 'SPI2', 'SPI3', 'SPI4']) this.spis[name] = add(name, new Spi(this, name));
    this.adcCommon = new AdcCommon(this);
    for (const [i, name] of ['ADC1', 'ADC2', 'ADC3'].entries()) this.adcs.push(add(name, new Adc(this, name, i), BASES[name], 0x100));
    add('ADC_COMMON', this.adcCommon, BASES.ADC_COMMON, 0x100);
    this.dma = { DMA1: add('DMA1', new Dma(this, 'DMA1')), DMA2: add('DMA2', new Dma(this, 'DMA2')) };
    this.dcmi = add('DCMI', new Dcmi(this));
    this.sdio = add('SDIO', new Sdio(this));
    this.can1 = add('CAN1', new Can(this, 'CAN1'));
    this.can2 = add('CAN2', new Can(this, 'CAN2'));
    this.crc = add('CRC', new Crc(this));
    this.iwdg = add('IWDG', new Iwdg(this));
    this.wwdg = add('WWDG', new Wwdg(this));
    this.rtc = add('RTC', new Rtc(this));
    // DBGMCU lives inside the PPB window handled by the SCS model; it maps a
    // more specific entry when the bus allows overlapping pages.
    this.dbg = new Dbgmcu(this); this.peripherals.set('DBGMCU', this.dbg);
    this.machine.map(BASES.DBGMCU, 0x10, this.dbg, 'DBGMCU');
    // Unique ID / flash size / package in system memory (bus ROM).
    const uid = this.options.uid ?? [0x0032003b, 0x3436510b, 0x36353233], bytes = new Uint8Array(0x14);
    const dv = new DataView(bytes.buffer); dv.setUint32(0, uid[0], true); dv.setUint32(4, uid[1], true); dv.setUint32(8, uid[2], true); dv.setUint16(0x12, 512, true);
    this.bus.loadBytes?.(0x1fff7a10, bytes);
    this.bus.loadBytes?.(0x1fff7bf0, Uint8Array.from([0x00, 0x03]));
    this.machine.onResetRequest = reason => this.prepareReset(reason);
    this.republishAll();
  }
  peripheral(name) { return this.peripherals.get(name); }
  // ------------------------------------------------------------ time
  now() { const c = this.machine.cycles; if (c < this.cycleOffset) this.cycleOffset = 0; return c - this.cycleOffset; }
  nowUs(cycle = this.now()) { return this.segment.us + (cycle - this.segment.cycle) * 1e6 / this.segment.hz; }
  cycleAtUs(us) { return this.segment.cycle + (us - this.segment.us) * this.segment.hz / 1e6; }
  at(cycle, fn) { return this.scheduler.at(Math.max(cycle, this.now()), fn); }
  atUs(us, fn) { return this.at(Math.ceil(this.cycleAtUs(us) - 1e-6), fn); }
  after(us, fn) { return this.atUs(this.nowUs() + Math.max(0, us), fn); }
  defer(fn) { return this.scheduler.at(this.now(), fn); }
  sync() { if (this.syncing) return; const now = this.now(); if (this.scheduler.next() > now) return; this.syncing = true; try { this.scheduler.run(now); } finally { this.syncing = false; } }
  setClock(clock) {
    const old = this.clock;
    if (old.hclk === clock.hclk && old.pclk1 === clock.pclk1 && old.pclk2 === clock.pclk2 && old.tim1 === clock.tim1 && old.tim2 === clock.tim2) { this.clock = clock; Object.assign(this.machine.clock, { sysclk: clock.sysclk, hclk: clock.hclk, pclk1: clock.pclk1, pclk2: clock.pclk2 }); return; }
    const now = this.now();
    for (const t of Object.values(this.timers ?? {})) t.sync(now);
    this.segment = { cycle: now, us: this.nowUs(now), hz: clock.hclk };
    this.clock = clock;
    Object.assign(this.machine.clock, { sysclk: clock.sysclk, hclk: clock.hclk, pclk1: clock.pclk1, pclk2: clock.pclk2 });
    for (const t of Object.values(this.timers ?? {})) { t.c0 = now; t.schedule(); t.refreshOutputs?.(); }
    this.env.clockChanged?.(clock);
  }
  // ------------------------------------------------------------ reset
  prepareReset(reason) {
    this.resetReason = reason;
    if (this.pendingCsr === undefined && this.rcc) this.pendingCsr = (this.rcc.get(0x74) & 0xfe000000) | (1 << 26) | (reason === 'IWDG' ? 1 << 29 : reason === 'WWDG' ? 1 << 30 : 1 << 28);
    this.usBeforeReset = this.nowUs();
    this.cycleOffset = this.machine.cycles;
    this.env.onReset?.(reason);
  }
  machineReset() {
    // Called first by machine.reset(): rebase time, drop pending events.
    const us = this.usBeforeReset ?? (this.segment ? this.nowUs() : 0);
    this.scheduler.clear();
    this.segment = { cycle: 0, us, hz: 16e6 };
    if (this.machine.cycles > 0 && this.cycleOffset !== this.machine.cycles) this.cycleOffset = this.machine.cycles;
    this.usBeforeReset = undefined;
    this.irqSources.clear(); this.dmaLines.clear();
    for (const l of this.signals.lines.values()) { l.edges = l.edges.filter(e => e[0] <= us); l.end = Math.min(l.end, us); }
    for (const [name, dev] of this.peripherals) if (name !== 'DBGMCU') dev.reset?.();
    this.republishAll();
  }
  systemReset(reason) {
    this.lastReset = { reason, us: this.nowUs() };
    this.machine.requestReset(reason);
  }
  resetPeripheral(name) {
    const map = { ADC1: ['ADC1', 'ADC2', 'ADC3', 'ADC_COMMON'] };
    for (const n of map[name] ?? [name]) this.peripherals.get(n)?.reset();
    if (name.startsWith('GPIO')) this.republishAll();
  }
  // ------------------------------------------------------------ interrupts
  irqNumber(irq, key, active) {
    if (irq == null) return;
    let set = this.irqSources.get(irq);
    if (!set) { set = new Set(); this.irqSources.set(irq, set); }
    const before = set.size > 0;
    if (active) set.add(key); else set.delete(key);
    const after = set.size > 0;
    if (before !== after || active) {
      const nvic = this.machine.nvic;
      if (nvic.setLine) nvic.setLine(irq, after); else if (after) nvic.setPending(irq);
    }
  }
  irq(name, key, active) { this.irqNumber(IRQ[name], key, active); }
  event() { if (this.machine.cpu) this.machine.cpu.eventReg = 1; }
  // ------------------------------------------------------------ pins / AF
  pinState(pin, state) {
    const old = this.pins.get(pin);
    if (old && old.mode === state.mode && old.value === state.value && old.openDrain === state.openDrain && old.pull === state.pull && old.pwm?.frequency === state.pwm?.frequency && old.pwm?.duty === state.pwm?.duty) return;
    this.pins.set(pin, state);
    if (state.mode === 'OUTPUT') this.signals.gpio(pin, this.nowUs(), state.openDrain && state.value > 0 ? 1 : +(state.value > 1.65));
    this.env.pinState?.(pin, state);
  }
  digitalIn(pin) { return this.env.digitalIn ? this.env.digitalIn(pin) : null; }
  analogIn(pin) { this.env.beforeInputRead?.(); return this.env.analogIn ? this.env.analogIn(pin) : null; }
  beforeInputRead() { this.env.beforeInputRead?.(); }
  owner(signal) {
    if (!signal) return null;
    if (signal === 'MCO1' || signal === 'MCO2') return { dev: this.rcc, role: signal };
    const i = signal.indexOf('_'), name = signal.slice(0, i), role = signal.slice(i + 1);
    const dev = this.peripherals.get(name);
    return dev ? { dev, role } : null;
  }
  afOutput(signal) {
    if (signal === 'MCO1') return this.rcc.mcoHz ? { level: 1, value: 1.65, clock: this.rcc.mcoHz } : null;
    const o = this.owner(signal);
    if (!o?.dev?.afOutput) return null;
    if (o.dev.clocked && !o.dev.clocked()) return null;
    return o.dev.afOutput(o.role);
  }
  routedPins(signal) {
    let pins = this.routes.get(signal);
    if (!pins) {
      pins = [];
      for (const [pin, table] of Object.entries(AF_TABLE)) {
        if (!Object.values(table).includes(signal)) continue;
        const port = this.gpio[pin[1]], n = Number(pin.slice(2));
        if (port && port.moder(n) === 2 && afSignal(pin, port.af(n)) === signal) pins.push(pin);
      }
      this.routes.set(signal, pins);
    }
    return pins;
  }
  routingChanged() { this.routes.clear(); this.env.routingChanged?.(); }
  afChanged(signal) {
    if (!this.gpio) return;
    for (const pin of this.routedPins(signal)) { const port = this.gpio[pin[1]], n = Number(pin.slice(2)); this.pinState(pin, port.state(n)); }
  }
  republishAll() { if (!this.gpio) return; this.routes.clear(); for (const p of Object.values(this.gpio)) p.publishAll(); }
  mcoChanged() { this.afChanged('MCO1'); }
  // Circuit was re-solved: propagate input edges (EXTI, timer inputs).
  inputsUpdated() { if (!this.gpio) return; for (const p of Object.values(this.gpio)) p.refreshInputs(); }
  inputEdge(pin, level) { for (const t of Object.values(this.timers)) if (t.info.channels) t.pinEdge(pin, level); if (pin === 'PB11' || pin === 'PB15') { /* EXTI11/15 triggers via exti */ } }
  lineSources(pin) { return this.env.lineSources ? this.env.lineSources(pin) : []; }
  // ------------------------------------------------------------ DMA
  dmaLine(name, active) {
    const was = !!this.dmaLines.get(name);
    if (was === !!active) return;
    this.dmaLines.set(name, !!active);
    if (active) this.dmaKick();
  }
  dmaLineActive(name) { return !!this.dmaLines.get(name); }
  dmaKick() {
    if (this.kickPending) return;
    this.kickPending = true;
    this.defer(() => { this.kickPending = false; this.serviceDma(); });
  }
  serviceDma() {
    for (let guard = 0; guard < 200000; guard++) {
      let progress = false;
      for (const [name, active] of this.dmaLines) if (active && (this.dma.DMA1.service(name) || this.dma.DMA2.service(name))) progress = true;
      if (!progress) break;
    }
  }
  dmaPulse(name) { this.dma.DMA1.service(name) || this.dma.DMA2.service(name); }
  dmaRemaining(name) { return Math.max(this.dma.DMA1.remaining(name), this.dma.DMA2.remaining(name)); }
  requestAddress(name) {
    const m = /^(USART\d|UART\d|SPI\d|I2C\d|ADC\d|DCMI|SDIO)(?:_(TX|RX))?$/.exec(name); if (!m) return null;
    const base = BASES[m[1]];
    if (m[1].includes('USART') || m[1].includes('UART')) return base + 4;
    if (m[1].startsWith('SPI')) return base + 0x0c;
    if (m[1].startsWith('I2C')) return base + 0x10;
    if (m[1].startsWith('ADC')) return base + 0x4c;
    if (m[1] === 'DCMI') return base + 0x28;
    if (m[1] === 'SDIO') return base + 0x80;
    return null;
  }
  requestOf(dma, stream) { return stream.requests()[0] ?? null; }
  // ------------------------------------------------------------ triggers
  trigger(name) { for (const a of this.adcs) a.trigger(name); if (name === 'EXTI11' || name === 'EXTI15') return; }
  triggerWanted(name) { return this.adcs.some(a => a.wants(name)); }
  triggersChanged() { for (const t of Object.values(this.timers)) t.schedule(); }
  // ------------------------------------------------------------ env bridges
  uartEvent(e) { this.env.uartEvent?.(e); }
  i2cBus(name, pins) { return this.env.i2cBus?.(name, pins) ?? null; }
  spiTransfer(name, pins, byte, cfg) { return this.env.spiTransfer ? this.env.spiTransfer(name, pins, byte, cfg) : 0xff; }
  usartSync(name, pins, byte) { return this.env.usartSync ? this.env.usartSync(name, pins, byte) : 0xff; }
  camera() { return this.env.camera?.() ?? null; }
  sdCard() { return this.env.sdCard?.() ?? null; }
  canBus(can, frame) {
    // CAN1 and CAN2 share the bus when both are in normal mode and running.
    const other = can === this.can1 ? this.can2 : this.can1;
    const btr = other.get(0x1c);
    if (other.clocked() && !other.initMode() && !(btr & (3 << 30)) && this.env.canConnected?.() !== false && this.env.canPeer?.() !== false && other.get(0) !== 0x00010002) {
      other.receive(frame); return true;
    }
    return this.env.canBus?.(can, frame) ?? false;
  }
  i2sSamples(name, samples, rate) { this.env.i2sSamples?.(name, samples, rate); }
  i2sClock() { const cfg = this.rcc.get(0x84), n = (cfg >> 6) & 0x1ff, m = cfg & 0x3f || 1, r = (cfg >> 28) & 7 || 2; return (this.rcc.get(0x04) & (1 << 22) ? 8e6 : 16e6) / m * n / r; }
  chipSelect(name) { return this.env.chipSelect?.(name) ?? null; }
}
