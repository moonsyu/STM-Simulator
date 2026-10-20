import { Peripheral, field } from './core.js';
import { afSignal } from './tables.js';

const RESET = {
  A: { 0x00: 0xa8000000, 0x08: 0x0c000000, 0x0c: 0x64000000 },
  B: { 0x00: 0x00000280, 0x08: 0x000000c0, 0x0c: 0x00000100 },
};

// GPIO port (RM0390 7.4). The effective electrical state of each pin is
// published to the circuit as the interpreter's runtime.gpio entry shape:
// {mode:'OUTPUT'|'INPUT'|'INPUT_PULLUP'|'INPUT_PULLDOWN'|'ANALOG', value, openDrain, pull}.
export class GpioPort extends Peripheral {
  constructor(soc, port) {
    super(soc, 'GPIO' + port);
    this.port = port; this.index = 'ABCDEFGH'.indexOf(port);
    this.inputs = 0; this.lock = { state: 0, value: 0 };
    this.reset();
  }
  reset() {
    super.reset();
    for (const [off, v] of Object.entries(RESET[this.port] || {})) this.set(Number(off), v);
    this.lock = { state: 0, value: 0 };
    this.publishAll();
  }
  pin(n) { return `P${this.port}${n}`; }
  moder(n) { return field(this.get(0x00), n * 2, 2); }
  pupd(n) { return field(this.get(0x0c), n * 2, 2); }
  af(n) { return field(this.get(n < 8 ? 0x20 : 0x24), (n & 7) * 4, 4); }
  signal(n) { return this.moder(n) === 2 ? afSignal(this.pin(n), this.af(n)) : null; }
  outputBit(n) { return (this.get(0x14) >> n) & 1; }
  // Electrical description of pin n for the circuit solver.
  state(n) {
    const mode = this.moder(n), pull = this.pupd(n), openDrain = !!((this.get(0x04) >> n) & 1);
    const input = { mode: pull === 1 ? 'INPUT_PULLUP' : pull === 2 ? 'INPUT_PULLDOWN' : 'INPUT', value: 0 };
    if (mode === 0) return input;
    if (mode === 3) return { mode: 'ANALOG', value: 0 };
    if (mode === 1) return { mode: 'OUTPUT', value: this.outputBit(n) ? 3.3 : 0, openDrain, pull: pull === 3 ? 0 : pull };
    const out = this.soc.afOutput(this.signal(n), this.pin(n));
    if (!out) return input;
    return { mode: 'OUTPUT', value: out.value ?? (out.level ? 3.3 : 0), openDrain: openDrain || !!out.openDrain, pull: pull === 3 ? 0 : pull, ...(out.pwm ? { pwm: out.pwm } : {}), ...(out.clock ? { clock: out.clock } : {}) };
  }
  publish(mask) {
    for (let n = 0; n < 16; n++) if (mask & (1 << n)) this.soc.pinState(this.pin(n), this.state(n));
  }
  publishAll() { this.publish(0xffff); }
  // Current input data bit (circuit level, digital Schmitt input).
  inputBit(n) {
    const mode = this.moder(n);
    if (mode === 3) return 0;
    const level = this.soc.digitalIn(this.pin(n));
    if (level != null) return level;
    const s = this.state(n);
    if (s.mode === 'OUTPUT' && !(s.openDrain && s.value > 0)) return s.value > 1.65 ? 1 : 0;
    return this.pupd(n) === 1 || (s.mode === 'OUTPUT' && s.pull === 1) ? 1 : 0;
  }
  idr() { let v = 0; for (let n = 0; n < 16; n++) v |= this.inputBit(n) << n; return v; }
  readReg(off) {
    if (off === 0x10) { this.soc.beforeInputRead?.(); return this.idr(); }
    if (off === 0x18) return 0;
    return this.get(off);
  }
  locked(n) { return (this.lock.value >> 16) & 1 && (this.get(0x1c) >> n) & 1; }
  writeReg(off, value, mask) {
    if (off === 0x18) { // BSRR: set wins over reset
      const set = value & 0xffff & (mask & 0xffff), clear = (value >>> 16) & (mask >>> 16);
      const before = this.get(0x14);
      this.set(0x14, ((before & ~clear) | set) & 0xffff);
      const changed = before ^ this.get(0x14);
      if (changed) this.outputsChanged(changed);
      return;
    }
    if (off === 0x10) return;
    if (off === 0x1c) { this.lockWrite(this.merge(off, value, mask)); return; }
    let v = this.merge(off, value, mask);
    const old = this.get(off);
    if ((this.lock.value >> 16) & 1 && off <= 0x0c) {
      const lockMask = this.get(0x1c) & 0xffff;
      const wide = off === 0x04 ? lockMask : lockMask.toString(2).split('').reverse().reduce((m, b, i) => b === '1' ? m | (3 << i * 2) : m, 0) >>> 0;
      v = ((old & wide) | (v & ~wide)) >>> 0;
    }
    if (off === 0x14) v &= 0xffff;
    this.set(off, v);
    const diff = (old ^ v) >>> 0;
    if (!diff) return;
    if (off === 0x14) { this.outputsChanged(diff); return; }
    let pins = 0;
    if (off === 0x04) pins = diff & 0xffff;
    else if (off <= 0x0c) { for (let n = 0; n < 16; n++) if ((diff >>> (n * 2)) & 3) pins |= 1 << n; }
    else if (off === 0x20 || off === 0x24) { const base = off === 0x20 ? 0 : 8; for (let i = 0; i < 8; i++) if ((diff >>> (i * 4)) & 15) pins |= 1 << (base + i); }
    if (pins) { this.publish(pins); this.soc.routingChanged(this, pins); }
  }
  outputsChanged(mask) {
    let pins = 0;
    for (let n = 0; n < 16; n++) if (mask & (1 << n) && this.moder(n) === 1) pins |= 1 << n;
    if (pins) this.publish(pins);
  }
  lockWrite(v) {
    // LCKR key sequence: write LCKK=1, LCKK=0, LCKK=1 (same LCK[15:0]), then read.
    const lckk = (v >> 16) & 1, keys = v & 0xffff, s = this.lock;
    if ((s.value >> 16) & 1) return;
    if (s.state === 0 && lckk) { s.state = 1; s.keys = keys; }
    else if (s.state === 1 && !lckk && keys === s.keys) s.state = 2;
    else if (s.state === 2 && lckk && keys === s.keys) { s.state = 0; s.value = 0x10000 | keys; this.set(0x1c, s.value); return; }
    else s.state = 0;
    this.set(0x1c, keys);
  }
  // Called after the circuit is re-solved: detect input edges for EXTI and timers.
  refreshInputs() {
    const now = this.idrSilent(), changed = now ^ this.inputs;
    this.inputs = now;
    if (!changed) return;
    for (let n = 0; n < 16; n++) if (changed & (1 << n)) {
      const level = (now >> n) & 1;
      this.soc.exti.gpioInput(this.index, n, level);
      this.soc.inputEdge(this.pin(n), level);
    }
  }
  idrSilent() { let v = 0; for (let n = 0; n < 16; n++) v |= this.inputBit(n) << n; return v; }
}
