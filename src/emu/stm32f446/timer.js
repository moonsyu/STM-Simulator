import { Peripheral, bit, field } from './core.js';
import { IRQ } from './tables.js';

// General-purpose / advanced / basic timers (RM0390 sections 12-16).
// The counter is evaluated lazily in "phase" space u ∈ [0, L):
//   up: CNT = u, down: CNT = ARR - u, center: CNT = u ≤ ARR ? u : 2·ARR - u.
// Events (update, compare) are scheduled only when something observes them.
export const TIMER_INFO = {
  TIM1: { channels: 4, bits: 16, advanced: true, apb: 2, irq: { up: IRQ.TIM1_UP_TIM10, cc: IRQ.TIM1_CC, brk: IRQ.TIM1_BRK_TIM9, trg: IRQ.TIM1_TRG_COM_TIM11 } },
  TIM8: { channels: 4, bits: 16, advanced: true, apb: 2, irq: { up: IRQ.TIM8_UP_TIM13, cc: IRQ.TIM8_CC, brk: IRQ.TIM8_BRK_TIM12, trg: IRQ.TIM8_TRG_COM_TIM14 } },
  TIM2: { channels: 4, bits: 32, apb: 1, irq: IRQ.TIM2 }, TIM5: { channels: 4, bits: 32, apb: 1, irq: IRQ.TIM5 },
  TIM3: { channels: 4, bits: 16, apb: 1, irq: IRQ.TIM3 }, TIM4: { channels: 4, bits: 16, apb: 1, irq: IRQ.TIM4 },
  TIM6: { channels: 0, bits: 16, basic: true, apb: 1, irq: IRQ.TIM6_DAC }, TIM7: { channels: 0, bits: 16, basic: true, apb: 1, irq: IRQ.TIM7 },
  TIM9: { channels: 2, bits: 16, upOnly: true, apb: 2, irq: IRQ.TIM1_BRK_TIM9 }, TIM12: { channels: 2, bits: 16, upOnly: true, apb: 1, irq: IRQ.TIM8_BRK_TIM12 },
  TIM10: { channels: 1, bits: 16, upOnly: true, apb: 2, irq: IRQ.TIM1_UP_TIM10 }, TIM11: { channels: 1, bits: 16, upOnly: true, apb: 2, irq: IRQ.TIM1_TRG_COM_TIM11 },
  TIM13: { channels: 1, bits: 16, upOnly: true, apb: 1, irq: IRQ.TIM8_UP_TIM13 }, TIM14: { channels: 1, bits: 16, upOnly: true, apb: 1, irq: IRQ.TIM8_TRG_COM_TIM14 },
};
const EPS = 1e-6;
const CR1 = 0x00, CR2 = 0x04, SMCR = 0x08, DIER = 0x0c, SR = 0x10, EGR = 0x14, CCMR1 = 0x18, CCMR2 = 0x1c, CCER = 0x20,
  CNT = 0x24, PSC = 0x28, ARR = 0x2c, RCR = 0x30, CCR = [0x34, 0x38, 0x3c, 0x40], BDTR = 0x44, DCR = 0x48, DMAR = 0x4c;

export class Timer extends Peripheral {
  constructor(soc, name) {
    super(soc, name);
    this.info = TIMER_INFO[name];
    this.max = this.info.bits === 32 ? 0xffffffff : 0xffff;
    this.reset();
  }
  reset() {
    super.reset();
    this.event?.cancel(); this.event = null;
    this.arr = this.max; this.set(ARR, this.max);
    this.psc = 0; this.rcr = 0; this.repetition = 0;
    this.ccr = [0, 0, 0, 0];
    this.c0 = this.soc.now(); this.u0 = 0; this.down = false;
    this.ocref = [0, 0, 0, 0]; this.icCount = [0, 0, 0, 0]; this.ti = [0, 0, 0, 0];
    this.burst = 0; this.outputs = [null, null, null, null];
    this.stats = { updates: 0, captures: 0 };
    this.refreshOutputs();
  }
  // ---------------------------------------------------------------- clocking
  timclk() { return this.info.apb === 1 ? this.soc.clock.tim1 : this.soc.clock.tim2; }
  rate() { return this.timclk() / (this.soc.clock.hclk * (this.psc + 1)); }
  center() { return this.info.upOnly || this.info.basic ? 0 : field(this.get(CR1), 5, 2); }
  dirDown() { return !this.info.upOnly && !this.info.basic && !this.center() && bit(this.get(CR1), 4); }
  slaveMode() { return this.info.basic || this.info.channels < 2 ? 0 : field(this.get(SMCR), 0, 3); }
  encoder() { const s = this.slaveMode(); return s >= 1 && s <= 3; }
  externalClock() { return this.slaveMode() === 7 || bit(this.get(SMCR), 14); }
  gated() { return this.slaveMode() === 5; }
  running() {
    if (!bit(this.get(CR1), 0) || this.encoder() || this.externalClock()) return false;
    if (this.soc.dbg?.frozen(this.name) && this.soc.halted) return false;
    if (this.gated() && !this.triggerLevel()) return false;
    return true;
  }
  L() { const arr = Math.max(1, this.arr); return this.center() ? 2 * arr : this.arr + 1; }
  cntOf(u) {
    if (this.encoder() || this.externalClock()) return Math.floor(u); // DIR is a status bit here
    if (this.center()) return u <= this.arr ? Math.floor(u) : Math.ceil(2 * this.arr - u);
    return this.dirDown() ? this.arr - Math.floor(u) : Math.floor(u);
  }
  uOf(cnt, down = this.down) {
    if (this.encoder() || this.externalClock()) return cnt;
    if (this.center()) return down && cnt > 0 ? 2 * this.arr - cnt : cnt;
    return this.dirDown() ? this.arr - cnt : cnt;
  }
  counter() { this.sync(); return this.cntOf(this.u0) & this.max; }
  // Update-event positions in phase space within one cycle (ascending, end inclusive).
  updatePositions() { return this.center() ? [this.arr, 2 * this.arr] : [this.L()]; }
  matchPositions(ch) {
    const c = this.ccr[ch];
    if (this.center()) return c > this.arr ? [] : c === 0 ? [2 * this.arr] : [c, 2 * this.arr - c];
    if (c > this.arr) return [];
    return [this.dirDown() ? (this.arr - c === 0 ? this.L() : this.arr - c) : (c === 0 ? this.L() : c)];
  }
  outputCompare(ch) { return ch < this.info.channels && field(this.get(ch < 2 ? CCMR1 : CCMR2), (ch & 1) * 8, 2) === 0; }
  ocMode(ch) { const r = this.get(ch < 2 ? CCMR1 : CCMR2), s = (ch & 1) * 8; return field(r, s + 4, 3) | (bit(r, s + 16) << 3); }
  // ------------------------------------------------------------- simulation
  sync(now = this.soc.now()) {
    if (now <= this.c0) { this.c0 = Math.max(this.c0, now); return; }
    if (!this.running()) { this.c0 = now; return; }
    let rate = this.rate(), u = this.u0 + (now - this.c0) * rate, guard = 0;
    this.c0 = now;
    for (;;) {
      const pos = this.updatePositions().find(p => p > this.u0);
      if (pos === undefined || u + EPS < pos) break;
      this.matches(this.u0, pos);
      const cyclesLeft = Math.max(0, (u - pos) / rate);
      const wrap = pos >= this.L();
      this.u0 = wrap ? 0 : pos;
      this.down = this.center() ? !wrap : this.dirDown();
      this.updateEvent(false);
      if (!bit(this.get(CR1), 0)) { u = this.u0; break; } // one-pulse stop
      rate = this.rate();
      u = this.u0 + cyclesLeft * rate;
      // Fast-forward whole periods when nothing changes between them.
      const L = this.L();
      if (u - this.u0 > 2 * L && ++guard > 4 && !this.preloadPending()) {
        const periods = Math.floor((u - this.u0) / L) - 1;
        const perPeriod = this.center() ? 2 : 1;
        this.repeatUpdates(periods * perPeriod);
        u -= periods * L;
      }
      if (guard > 1e6) break;
    }
    this.matches(this.u0, u);
    // Snap onto an event position reached within rounding error.
    for (const p of [...this.updatePositions(), ...[0, 1, 2, 3].flatMap(ch => ch < this.info.channels ? this.matchPositions(ch) : [])]) if (p > u && p - u < EPS && p < this.L()) u = p;
    this.u0 = Math.max(this.u0, u);
    if (this.center()) this.down = u > this.arr;
  }
  preloadPending() { return this.pendingArr !== undefined || this.pendingPsc !== undefined || this.pendingCcr?.some(v => v !== undefined); }
  repeatUpdates(count) {
    if (count <= 0) return;
    if (this.info.advanced) {
      const per = this.rcr + 1, total = this.repetition + count;
      if (total >= per) { this.setFlag(0); this.stats.updates += Math.floor(total / per); }
      this.repetition = total % per;
    } else { this.setFlag(0); this.stats.updates += count; }
    for (let ch = 0; ch < this.info.channels; ch++) if (this.outputCompare(ch) && this.matchPositions(ch).length) this.setFlag(ch + 1);
  }
  // Compare matches strictly after a, up to and including b (same period).
  matches(a, b) {
    for (let ch = 0; ch < this.info.channels; ch++) {
      if (!this.outputCompare(ch)) continue;
      for (const p of this.matchPositions(ch)) if (p > a && p <= b + EPS) this.compareMatch(ch);
    }
  }
  compareMatch(ch) {
    this.setFlag(ch + 1);
    const mode = this.ocMode(ch);
    if (mode === 1) this.ocref[ch] = 1; else if (mode === 2) this.ocref[ch] = 0; else if (mode === 3) this.ocref[ch] ^= 1;
    if (bit(this.get(DIER), 9 + ch) && !bit(this.get(CR2), 3)) this.soc.defer(() => this.soc.dmaPulse(`${this.name}_CH${ch + 1}`));
    this.soc.defer(() => this.soc.trigger(`${this.name}_CC${ch + 1}`));
  }
  updateEvent(software) {
    if (this.info.advanced && !software) {
      if (this.repetition < this.rcr) { this.repetition++; this.applyPreload(false); return; }
      this.repetition = 0; this.rcr = this.get(RCR) & 0xff;
    }
    this.applyPreload(true);
    const urs = bit(this.get(CR1), 2);
    if (!(software && urs)) {
      this.setFlag(0); this.stats.updates++;
      if (bit(this.get(DIER), 8) || (bit(this.get(CR2), 3) && (this.get(DIER) & 0x1e00))) this.soc.defer(() => {
        if (bit(this.get(DIER), 8)) this.soc.dmaPulse(`${this.name}_UP`);
        if (bit(this.get(CR2), 3)) for (let ch = 0; ch < 4; ch++) if (bit(this.get(DIER), 9 + ch)) this.soc.dmaPulse(`${this.name}_CH${ch + 1}`);
      });
    }
    if (field(this.get(CR2), 4, 3) === 2) this.soc.defer(() => this.soc.trigger(`${this.name}_TRGO`));
    if (bit(this.get(CR1), 3) && !software) this.clearBits(CR1, 1); // OPM
  }
  applyPreload(full) {
    if (this.pendingArr !== undefined) { this.arr = this.pendingArr; this.pendingArr = undefined; }
    if (!full) return;
    if (this.pendingPsc !== undefined) { this.psc = this.pendingPsc; this.pendingPsc = undefined; }
    if (this.pendingCcr) for (let ch = 0; ch < 4; ch++) if (this.pendingCcr[ch] !== undefined) { this.ccr[ch] = this.pendingCcr[ch]; this.pendingCcr[ch] = undefined; }
  }
  setFlag(n) { if (!bit(this.get(SR), n)) { this.setBits(SR, 1 << n); this.irqChanged = true; } }
  // -------------------------------------------------------------- registers
  readReg(off) {
    this.sync();
    if (off === CNT) return this.cntOf(this.u0) & this.max;
    if (off === SR) { this.updateIrq(); return this.get(SR); }
    if (CCR.includes(off)) { const ch = CCR.indexOf(off); if (!this.outputCompare(ch)) this.clearBits(SR, 1 << (ch + 1)); return this.outputCompare(ch) ? (this.pendingCcr?.[ch] ?? this.ccr[ch]) : this.get(off); }
    if (off === ARR) return this.get(ARR);
    if (off === DMAR) { const reg = this.burstRegister(); return this.readReg(reg); }
    if (off === EGR) return 0;
    return this.get(off);
  }
  writeReg(off, value, mask) {
    this.sync();
    const old = this.get(off);
    let v = this.merge(off, value, mask);
    switch (off) {
      case CR1: {
        if (bit(old, 4) !== bit(v, 4) && this.center()) v = (v & ~0x10) | (old & 0x10); // DIR read-only in center mode
        this.set(CR1, v);
        if (bit(v, 0) && !bit(old, 0)) this.c0 = this.soc.now();
        break;
      }
      case SR: this.set(SR, old & v); this.updateIrq(); return; // rc_w0
      case EGR: this.generate(v); break;
      case CNT: {
        const cnt = v & this.max;
        this.u0 = Math.min(this.uOf(cnt), this.L() - 1e-9); this.c0 = this.soc.now();
        this.set(CNT, cnt); break;
      }
      case PSC: this.set(PSC, v & 0xffff); this.pendingPsc = v & 0xffff; break;
      case ARR: {
        v &= this.max; this.set(ARR, v);
        if (bit(this.get(CR1), 7)) this.pendingArr = v;
        else { this.arr = v; if (this.u0 >= this.L()) this.u0 = 0; }
        break;
      }
      case RCR: this.set(RCR, v & 0xff); break;
      case DMAR: { const reg = this.burstRegister(); this.writeReg(reg, value, mask); return; }
      case CCMR1: case CCMR2: this.set(off, v); break;
      case CCER: this.set(off, v); break;
      default:
        if (CCR.includes(off)) {
          const ch = CCR.indexOf(off);
          if (!this.outputCompare(ch)) return; // read-only in capture mode
          v &= this.max; this.set(off, v);
          const pe = bit(this.get(ch < 2 ? CCMR1 : CCMR2), (ch & 1) * 8 + 3);
          if (pe) { this.pendingCcr ??= [undefined, undefined, undefined, undefined]; this.pendingCcr[ch] = v; }
          else this.ccr[ch] = v;
          break;
        }
        this.set(off, v);
    }
    if (off === DCR) this.burst = 0;
    if (off === SMCR && this.encoder()) this.encoderPrev = this.encoderInputs();
    this.refreshOutputs();
    this.updateIrq();
    this.schedule();
  }
  burstRegister() {
    const dcr = this.get(DCR), base = field(dcr, 0, 5), len = field(dcr, 8, 5) + 1;
    const reg = (base + this.burst) * 4; this.burst = (this.burst + 1) % len; return reg;
  }
  generate(v) {
    if (bit(v, 0)) { // UG: reinitialize counter
      this.u0 = 0; this.down = false; this.c0 = this.soc.now(); this.repetition = 0;
      this.rcr = this.get(RCR) & 0xff;
      this.updateEvent(true);
    }
    for (let ch = 0; ch < this.info.channels; ch++) if (bit(v, ch + 1)) {
      if (this.outputCompare(ch)) this.compareMatch(ch); else this.capture(ch);
    }
    if (bit(v, 5)) this.setFlag(5);
    if (bit(v, 6)) this.setFlag(6);
    if (bit(v, 7)) { this.setFlag(7); if (this.info.advanced && !bit(this.get(BDTR), 14)) this.clearBits(BDTR, 1 << 15); }
  }
  // ---------------------------------------------------------------- outputs
  outputEnabled(ch, complementary = false) {
    const ccer = this.get(CCER);
    if (!bit(ccer, ch * 4 + (complementary ? 2 : 0))) return false;
    if (this.info.advanced && !bit(this.get(BDTR), 15)) return false;
    return true;
  }
  // PWM duty of OCxREF (0..1) for averaged output, or null for non-PWM modes.
  pwmDuty(ch) {
    const mode = this.ocMode(ch); if (mode !== 6 && mode !== 7) return null;
    const c = this.ccr[ch], period = this.center() ? 2 * this.arr : this.arr + 1;
    let high = this.center() ? Math.min(2 * c, period) : Math.min(c, period);
    if (this.dirDown() && !this.center()) high = Math.min(c + 1, period);
    let duty = period ? high / period : 0;
    if (mode === 7) duty = 1 - duty;
    return duty;
  }
  refValue(ch) {
    const mode = this.ocMode(ch), cnt = this.cntOf(this.u0), c = this.ccr[ch];
    if (mode === 4) return 0;
    if (mode === 5) return 1;
    if (mode === 6 || mode === 7) {
      const down = this.center() ? this.down : this.dirDown();
      let active = down ? cnt <= c : cnt < c;
      if (c > this.arr) active = true;
      return mode === 6 ? +active : +!active;
    }
    return this.ocref[ch];
  }
  pwmFrequency() { const period = this.center() ? 2 * this.arr : this.arr + 1; return this.timclk() / (this.psc + 1) / Math.max(1, period); }
  // AF output state for signal TIMx_CHy / TIMx_CHyN, or null when the channel is an input.
  afOutput(role) {
    const m = /^CH(\d)(N?)$/.exec(role); if (!m) return null;
    const ch = Number(m[1]) - 1, comp = m[2] === 'N';
    if (ch >= this.info.channels || !this.outputCompare(ch)) return null;
    return this.outputs[ch]?.[comp ? 1 : 0] ?? { level: 0 };
  }
  outputState(ch, comp) {
    const pol = bit(this.get(CCER), ch * 4 + (comp ? 3 : 1));
    if (!this.outputEnabled(ch, comp)) {
      const idle = this.info.advanced ? bit(this.get(CR2), 8 + ch * 2 + (comp ? 1 : 0)) : 0;
      return { level: idle };
    }
    const waveform = this.soc.options.pwmWaveform;
    const duty = this.pwmDuty(ch);
    if (duty !== null && !waveform && bit(this.get(CR1), 0) && duty > 0 && duty < 1) {
      const d = (comp ? 1 - duty : duty), eff = pol ? 1 - d : d;
      return { level: eff >= .5 ? 1 : 0, value: 3.3 * eff, pwm: { duty: eff, frequency: this.pwmFrequency() } };
    }
    if (this.ocMode(ch) === 3 && !waveform && bit(this.get(CR1), 0) && this.matchPositions(ch).length) {
      return { level: 1, value: 1.65, pwm: { duty: .5, frequency: this.pwmFrequency() / 2 } };
    }
    let ref = this.refValue(ch);
    if (duty !== null && !bit(this.get(CR1), 0)) ref = this.refValue(ch);
    if (comp) ref ^= 1;
    return { level: ref ^ pol };
  }
  refreshOutputs() {
    for (let ch = 0; ch < this.info.channels; ch++) {
      const next = [this.outputState(ch, false), this.info.advanced ? this.outputState(ch, true) : null];
      const prev = this.outputs[ch];
      this.outputs[ch] = next;
      const same = (a, b) => (!a && !b) || (a && b && a.level === b.level && a.value === b.value);
      if (!prev || !same(prev[0], next[0])) this.soc.afChanged(`${this.name}_CH${ch + 1}`);
      if (this.info.advanced && (!prev || !same(prev[1], next[1]))) this.soc.afChanged(`${this.name}_CH${ch + 1}N`);
    }
  }
  // ----------------------------------------------------------- scheduling
  needUpdateEvent() {
    const dier = this.get(DIER), cr2 = this.get(CR2);
    if (dier & 0x101) return true;
    if (bit(this.get(CR1), 3)) return true;
    if (this.preloadPending()) return true;
    if (field(cr2, 4, 3) === 2 && this.soc.triggerWanted(`${this.name}_TRGO`)) return true;
    if (this.soc.options.pwmWaveform) for (let ch = 0; ch < this.info.channels; ch++) if (this.outputCompare(ch) && this.outputEnabled(ch) && [6, 7].includes(this.ocMode(ch))) return true;
    return false;
  }
  needCompareEvent(ch) {
    if (!this.outputCompare(ch)) return false;
    const dier = this.get(DIER), mode = this.ocMode(ch);
    if (bit(dier, ch + 1) || bit(dier, ch + 9)) return true;
    if (this.soc.triggerWanted(`${this.name}_CC${ch + 1}`)) return true;
    if ((mode === 1 || mode === 2) && this.outputEnabled(ch)) return true;
    if (this.soc.options.pwmWaveform && (mode === 3 || mode === 6 || mode === 7) && (this.outputEnabled(ch) || this.outputEnabled(ch, true))) return true;
    return false;
  }
  schedule() {
    this.event?.cancel(); this.event = null;
    if (!this.running()) return;
    let next = Infinity;
    const L = this.L();
    const consider = p => { let q = p; while (q <= this.u0) q += L; next = Math.min(next, q); };
    if (this.needUpdateEvent()) for (const p of this.updatePositions()) consider(p);
    for (let ch = 0; ch < this.info.channels; ch++) if (this.needCompareEvent(ch)) for (const p of this.matchPositions(ch)) consider(p);
    if (next === Infinity) return;
    const cycle = Math.max(this.soc.now() + 1, Math.ceil(this.c0 + (next - this.u0) / this.rate() - 1e-6));
    this.event = this.soc.at(cycle, () => this.onEvent());
  }
  onEvent() {
    this.event = null;
    this.sync();
    this.refreshOutputs();
    this.updateIrq();
    this.schedule();
  }
  updateIrq() {
    const active = this.get(SR) & this.get(DIER) & 0xff;
    const irq = this.info.irq;
    if (typeof irq === 'number') this.soc.irqNumber(irq, this.name, !!active);
    else {
      this.soc.irqNumber(irq.up, this.name, !!(active & 1));
      this.soc.irqNumber(irq.cc, this.name, !!(active & 0x1e));
      this.soc.irqNumber(irq.trg, this.name, !!(active & 0x60));
      this.soc.irqNumber(irq.brk, this.name, !!(active & 0x80));
    }
  }
  // ----------------------------------------------------------------- inputs
  channelPin(ch) { return this.soc.routedPins(`${this.name}_CH${ch + 1}`)[0] ?? null; }
  tiLevel(ch) { const pin = this.channelPin(ch); return pin ? (this.soc.digitalIn(pin) ?? 0) : 0; }
  triggerLevel() {
    const ts = field(this.get(SMCR), 4, 3);
    return ts === 5 ? this.tiLevel(0) ^ bit(this.get(CCER), 1) : ts === 6 ? this.tiLevel(1) ^ bit(this.get(CCER), 5) : 1;
  }
  encoderInputs() { return [this.tiLevel(0) ^ bit(this.get(CCER), 1), this.tiLevel(1) ^ bit(this.get(CCER), 5)]; }
  // Edge on a GPIO pin; dispatch to capture / encoder / slave logic.
  pinEdge(pin, level) {
    let hit = false;
    for (let ch = 0; ch < this.info.channels; ch++) if (this.channelPin(ch) === pin) { hit = true; this.tiEdge(ch, level); }
    if (hit) { this.refreshOutputs(); this.updateIrq(); this.schedule(); }
  }
  tiEdge(ti, level) {
    this.sync();
    this.ti[ti] = level;
    if (this.encoder() && ti < 2) { this.encoderStep(ti); return; }
    // Slave mode controller (TS = TI1FP1 / TI2FP2 / TI1F_ED).
    const ts = field(this.get(SMCR), 4, 3), sms = this.slaveMode();
    const polarity = bit(this.get(CCER), ti * 4 + 1);
    const effective = level ^ polarity;
    const trig = (ts === 5 && ti === 0 && effective) || (ts === 6 && ti === 1 && effective) || (ts === 4 && ti === 0);
    // Capture channels: direct (CCxS=01) uses TIx, indirect (10) uses the paired input.
    for (let ch = 0; ch < this.info.channels; ch++) {
      const ccs = field(this.get(ch < 2 ? CCMR1 : CCMR2), (ch & 1) * 8, 2);
      if (ccs === 0 || !bit(this.get(CCER), ch * 4)) continue;
      const source = ccs === 1 ? ch : ccs === 2 ? (ch ^ 1) : -1;
      if (source !== ti) continue;
      const p = bit(this.get(CCER), ch * 4 + 1), np = bit(this.get(CCER), ch * 4 + 3);
      const rising = level === 1, ok = p && np ? true : p ? !rising : rising;
      if (!ok) continue;
      const psc = 1 << field(this.get(ch < 2 ? CCMR1 : CCMR2), (ch & 1) * 8 + 2, 2);
      if (++this.icCount[ch] % psc) continue;
      this.capture(ch);
    }
    if (trig && sms) {
      this.setFlag(6);
      if (sms === 4) { this.u0 = 0; this.c0 = this.soc.now(); this.applyPreload(true); if (!bit(this.get(CR1), 2)) this.setFlag(0); }
      if (sms === 6 && !bit(this.get(CR1), 0)) { this.setBits(CR1, 1); this.c0 = this.soc.now(); }
      if (sms === 7) this.externalTick();
    }
    if (this.gated()) this.c0 = this.soc.now();
  }
  capture(ch) {
    const value = this.cntOf(this.u0) & this.max;
    if (bit(this.get(SR), ch + 1)) this.setBits(SR, 1 << (ch + 9));
    this.set(CCR[ch], value); this.setFlag(ch + 1); this.stats.captures++;
    if (bit(this.get(DIER), ch + 9)) this.soc.defer(() => this.soc.dmaPulse(`${this.name}_CH${ch + 1}`));
  }
  externalTick() {
    const cnt = this.cntOf(this.u0);
    if (cnt >= this.arr) { this.u0 = 0; this.updateEvent(false); } else this.u0 = this.uOf(cnt + 1);
  }
  encoderStep(ti) {
    const sms = this.slaveMode(), [a, b] = this.encoderInputs(), prev = this.encoderPrev ?? [a, b];
    this.encoderPrev = [a, b];
    if (ti === 0 && prev[0] === a) return;
    if (ti === 1 && prev[1] === b) return;
    if ((sms === 1 && ti !== 1) || (sms === 2 && ti !== 0)) return;
    // RM0390 Table 76 (counting direction versus encoder signals).
    let up;
    if (ti === 0) up = b ? !a : !!a; else up = a ? !!b : !b;
    const cnt = this.cntOf(this.u0) & this.max;
    let next;
    if (up) { next = cnt >= this.arr ? 0 : cnt + 1; if (cnt >= this.arr) this.updateEvent(false); }
    else { next = cnt === 0 ? this.arr : cnt - 1; if (cnt === 0) this.updateEvent(false); }
    if (up) this.clearBits(CR1, 0x10); else this.setBits(CR1, 0x10);
    this.u0 = next; // encoder mode uses up-counting phase (DIR only reports direction)
  }
  // Encoder mode keeps CNT directly in u0 regardless of DIR.
  get encoderCount() { return this.cntOf(this.u0); }
}
