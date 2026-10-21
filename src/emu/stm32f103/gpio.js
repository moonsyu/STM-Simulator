import { Peripheral, bit, field } from '../stm32f446/core.js';

// GPIO port of the STM32F103 (RM0008 9.2): 4-bit CNF/MODE fields in CRL/CRH, pull direction from ODR,
// IDR/ODR/BSRR/BRR/LCKR. Alternate-function outputs carry whichever peripheral the AFIO remap routes
// to the pin; inputs (including peripheral inputs such as USART RX) are always connected on the F1.
// Pin states use the same shape as the F446 model so the circuit bridge is shared.
export class GpioPortF1 extends Peripheral {
  constructor(soc, port) {
    super(soc, 'GPIO' + port);
    this.port = port; this.index = 'ABCDE'.indexOf(port);
    this.inputs = 0; this.lock = { state: 0, value: 0 };
    this.reset();
  }
  reset() {
    super.reset();
    this.set(0x00, 0x44444444); this.set(0x04, 0x44444444); // floating inputs
    this.lock = { state: 0, value: 0 };
    this.publishAll();
  }
  pin(n) { return `P${this.port}${n}`; }
  cfg(n) { return field(this.get(n < 8 ? 0x00 : 0x04), (n & 7) * 4, 4); }
  // F4-style view used by shared code: 0 input, 1 output, 2 alternate function, 3 analog.
  moder(n) { const c = this.cfg(n), mode = c & 3, cnf = c >> 2; return mode === 0 ? (cnf === 0 ? 3 : 0) : cnf >= 2 ? 2 : 1; }
  pupd(n) { const c = this.cfg(n); return (c & 3) === 0 && c >> 2 === 2 ? (this.outputBit(n) ? 1 : 2) : 0; }
  af() { return 0; }
  // The routed signal driving an alternate-function output: the first remap candidate whose peripheral drives it.
  signal(n) {
    if (this.moder(n) !== 2) return null;
    const candidates = this.soc.pinSignals(this.pin(n));
    return candidates.find(s => this.soc.afOutput(s)) ?? candidates[0] ?? null;
  }
  outputBit(n) { return (this.get(0x0c) >> n) & 1; }
  state(n) {
    const c = this.cfg(n), mode = c & 3, cnf = c >> 2, pull = this.pupd(n);
    if (mode === 0) {
      if (cnf === 0) return { mode: 'ANALOG', value: 0 };
      return { mode: pull === 1 ? 'INPUT_PULLUP' : pull === 2 ? 'INPUT_PULLDOWN' : 'INPUT', value: 0 };
    }
    const openDrain = !!(cnf & 1);
    if (cnf < 2) return { mode: 'OUTPUT', value: this.outputBit(n) ? 3.3 : 0, openDrain, pull: 0 };
    const out = this.soc.afOutput(this.signal(n), this.pin(n));
    if (!out) return { mode: 'INPUT', value: 0 };
    return { mode: 'OUTPUT', value: out.value ?? (out.level ? 3.3 : 0), openDrain: openDrain || !!out.openDrain, pull: 0, ...(out.pwm ? { pwm: out.pwm } : {}), ...(out.clock ? { clock: out.clock } : {}) };
  }
  publish(mask) { for (let n = 0; n < 16; n++) if (mask & (1 << n)) this.soc.pinState(this.pin(n), this.state(n)); }
  publishAll() { this.publish(0xffff); }
  inputBit(n) {
    if (this.moder(n) === 3) return 0;
    const level = this.soc.digitalIn(this.pin(n));
    if (level != null) return level;
    const s = this.state(n);
    if (s.mode === 'OUTPUT' && !(s.openDrain && s.value > 0)) return s.value > 1.65 ? 1 : 0;
    return this.pupd(n) === 1 ? 1 : 0;
  }
  idr() { let v = 0; for (let n = 0; n < 16; n++) v |= this.inputBit(n) << n; return v; }
  readReg(off) {
    if (off === 0x08) { this.soc.beforeInputRead?.(); return this.idr(); }
    if (off === 0x10 || off === 0x14) return 0;
    return this.get(off);
  }
  setOutputs(next) {
    const before = this.get(0x0c); this.set(0x0c, next & 0xffff);
    const changed = before ^ this.get(0x0c);
    if (changed) this.outputsChanged(changed);
  }
  writeReg(off, value, mask) {
    if (off === 0x10) { // BSRR: set wins over reset
      const set = value & 0xffff & (mask & 0xffff), clear = (value >>> 16) & (mask >>> 16);
      this.setOutputs((this.get(0x0c) & ~clear) | set);
      return;
    }
    if (off === 0x14) { this.setOutputs(this.get(0x0c) & ~(value & mask & 0xffff)); return; }
    if (off === 0x08) return;
    if (off === 0x18) { this.lockWrite(this.merge(off, value, mask)); return; }
    let v = this.merge(off, value, mask);
    const old = this.get(off);
    if (off <= 0x04 && (this.lock.value >> 16) & 1) {
      const locked = this.get(0x18) & 0xffff;
      let wide = 0;
      for (let i = 0; i < 8; i++) if ((locked >> ((off === 0 ? 0 : 8) + i)) & 1) wide |= 0xf << (i * 4);
      v = ((old & wide) | (v & ~wide)) >>> 0;
    }
    if (off === 0x0c) { this.setOutputs(v); return; }
    this.set(off, v);
    const diff = (old ^ v) >>> 0;
    if (!diff || off > 0x04) return;
    let pins = 0;
    for (let i = 0; i < 8; i++) if ((diff >>> (i * 4)) & 15) pins |= 1 << ((off === 0 ? 0 : 8) + i);
    this.publish(pins); this.soc.routingChanged(this, pins);
  }
  // ODR drives general-purpose outputs and selects pull-up/pull-down of pulled inputs.
  outputsChanged(mask) {
    let pins = 0;
    for (let n = 0; n < 16; n++) if (mask & (1 << n)) { const c = this.cfg(n); if (((c & 3) && c >> 2 < 2) || ((c & 3) === 0 && c >> 2 === 2)) pins |= 1 << n; }
    if (pins) this.publish(pins);
  }
  lockWrite(v) {
    // LCKR key sequence: LCKK=1, LCKK=0, LCKK=1 with the same LCK[15:0], then read.
    const lckk = (v >> 16) & 1, keys = v & 0xffff, s = this.lock;
    if ((s.value >> 16) & 1) return;
    if (s.state === 0 && lckk) { s.state = 1; s.keys = keys; }
    else if (s.state === 1 && !lckk && keys === s.keys) s.state = 2;
    else if (s.state === 2 && lckk && keys === s.keys) { s.state = 0; s.value = 0x10000 | keys; this.set(0x18, s.value); return; }
    else s.state = 0;
    this.set(0x18, keys);
  }
  refreshInputs() {
    const now = this.idr(), changed = now ^ this.inputs;
    this.inputs = now;
    if (!changed) return;
    for (let n = 0; n < 16; n++) if (changed & (1 << n)) {
      const level = (now >> n) & 1;
      this.soc.exti.gpioInput(this.index, n, level);
      this.soc.inputEdge(this.pin(n), level);
    }
  }
}

// AFIO (RM0008 9.4): MAPR selects pin remaps, EXTICR1..4 the port of each EXTI line.
// Stands in for the F4 SYSCFG so the shared EXTI model finds the routing (`extiPort`).
export class Afio extends Peripheral {
  constructor(soc) { super(soc, 'AFIO'); this.reset(); }
  writeReg(off, value, mask) {
    const v = this.merge(off, value, mask);
    if (off === 0x04) {
      const old = this.get(4);
      this.set(4, v & ~0x07000000); // SWJ_CFG is write-only
      if ((old ^ this.get(4)) & 0x0000ffff) { this.soc.routingChanged(); this.soc.republishAll(); }
      return;
    }
    this.set(off, v);
    if (off >= 0x08 && off <= 0x14) this.soc.exti?.routingChanged();
  }
  readReg(off) { return this.get(off); }
  get mapr() { return this.get(4); }
  extiPort(n) { return field(this.get(0x08 + (n >> 2) * 4), (n & 3) * 4, 4); }
}

// FLASH interface (RM0008 3.3.3): ACR latency / prefetch; programming of the array is not modeled.
export class FlashF1 extends Peripheral {
  constructor(soc) { super(soc, 'FLASH'); this.reset(); }
  reset() { super.reset(); this.set(0x00, 0x30); this.set(0x10, 0x80); this.set(0x1c, 0x03fffffc); this.set(0x20, 0xffffffff); this.keys = []; }
  writeReg(off, value, mask) {
    const v = this.merge(off, value, mask);
    if (off === 0x00) { this.set(0, (v & 0x1f) | (bit(v, 4) << 5)); return; } // PRFTBS follows PRFTBE
    if (off === 0x04) { this.keys.push(v); this.keys = this.keys.slice(-2); if (this.keys[0] === 0x45670123 && this.keys[1] === 0xcdef89ab) this.clearBits(0x10, 0x80); return; }
    if (off === 0x0c) { this.set(0x0c, this.get(0x0c) & ~(v & 0x34)); return; }
    if (off === 0x10) { if (bit(this.get(0x10), 7)) return; this.set(0x10, v); return; }
    if (off === 0x1c || off === 0x20) return;
    this.set(off, v);
  }
  get latency() { return this.get(0) & 7; }
}

// DBGMCU of the medium-density F1: IDCODE (DEV_ID 0x410) and peripheral freeze bits in CR.
export class DbgmcuF1 extends Peripheral {
  constructor(soc) { super(soc, 'DBGMCU', 0x10); this.reset(); }
  reset() { super.reset(); this.set(0, 0x20036410); }
  writeReg(off, value, mask) { if (off !== 0) this.set(off, this.merge(off, value, mask)); }
  frozen(name) { const cr = this.get(0x04); return ({ IWDG: bit(cr, 8), WWDG: bit(cr, 9), TIM1: bit(cr, 10), TIM2: bit(cr, 11), TIM3: bit(cr, 12), TIM4: bit(cr, 13) })[name] ?? 0; }
}

// PWR: backup domain access (DBP) and the PVD; the F1 has no voltage scaling.
export class PwrF1 extends Peripheral {
  constructor(soc) { super(soc, 'PWR'); this.reset(); }
  writeReg(off, value, mask) {
    const v = this.merge(off, value, mask);
    if (off === 0x00) { if (bit(v, 2)) this.clearBits(0x04, 1); if (bit(v, 3)) this.clearBits(0x04, 2); this.set(0, v & ~0xc); return; }
    if (off === 0x04) { this.set(4, (this.get(4) & ~0x100) | (v & 0x100)); return; }
    this.set(off, v);
  }
  get backupAccess() { return !!bit(this.get(0), 8); }
}
