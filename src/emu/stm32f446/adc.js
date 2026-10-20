import { Peripheral, bit, field } from './core.js';
import { IRQ } from './tables.js';

// ADC1/2/3 + common registers (RM0390 section 13): single / continuous / scan,
// regular and injected sequences, software and timer triggers, EOC/EOCS,
// overrun, analog watchdog, DMA (DDS) and internal temperature / VREFINT.
const SR = 0x00, CR1 = 0x04, CR2 = 0x08, SMPR1 = 0x0c, SMPR2 = 0x10, HTR = 0x24, LTR = 0x28, SQR1 = 0x2c, SQR2 = 0x30, SQR3 = 0x34, JSQR = 0x38, DR = 0x4c;
export const ADC_PINS = ['PA0', 'PA1', 'PA2', 'PA3', 'PA4', 'PA5', 'PA6', 'PA7', 'PB0', 'PB1', 'PC0', 'PC1', 'PC2', 'PC3', 'PC4', 'PC5'];
const SAMPLE = [3, 15, 28, 56, 84, 112, 144, 480];
const EXTSEL = ['TIM1_CC1', 'TIM1_CC2', 'TIM1_CC3', 'TIM2_CC2', 'TIM2_CC3', 'TIM2_CC4', 'TIM2_TRGO', 'TIM3_CC1', 'TIM3_TRGO', 'TIM4_CC4', 'TIM5_CC1', 'TIM5_CC2', 'TIM5_CC3', 'TIM8_CC1', 'TIM8_TRGO', 'EXTI11'];
const JEXTSEL = ['TIM1_CC4', 'TIM1_TRGO', 'TIM2_CC1', 'TIM2_TRGO', 'TIM3_CC2', 'TIM3_CC4', 'TIM4_CC1', 'TIM4_CC2', 'TIM4_CC3', 'TIM4_TRGO', 'TIM5_CC4', 'TIM5_TRGO', 'TIM8_CC2', 'TIM8_CC3', 'TIM8_CC4', 'EXTI15'];

export class AdcCommon extends Peripheral {
  constructor(soc) { super(soc, 'ADC_COMMON', 0x100); this.reset(); }
  readReg(off) {
    if (off === 0x00) { let v = 0; this.soc.adcs.forEach((a, i) => { v |= (a.get(SR) & 0x3f) << (i * 8); }); return v; }
    if (off === 0x08) return (this.soc.adcs[0].get(DR) & 0xffff) | ((this.soc.adcs[1].get(DR) & 0xffff) << 16);
    return this.get(off);
  }
  prescaler() { return (field(this.get(0x04), 16, 2) + 1) * 2; }
}

export class Adc extends Peripheral {
  constructor(soc, name, index) { super(soc, name, 0x100); this.index = index; this.reset(); }
  reset() {
    super.reset(); this.set(HTR, 0xfff);
    this.event?.cancel(); this.event = null; this.seq = null; this.inj = null; this.stats = { conversions: 0, last: [] };
    this.updateIrq();
  }
  adcclk() { return this.soc.clock.pclk2 / this.soc.adcCommon.prescaler(); }
  resolution() { return [12, 10, 8, 6][field(this.get(CR1), 24, 2)]; }
  on() { return !!bit(this.get(CR2), 0); }
  sampleCycles(ch) { const reg = ch >= 10 ? SMPR1 : SMPR2, n = ch >= 10 ? ch - 10 : ch; return SAMPLE[field(this.get(reg), n * 3, 3)]; }
  conversionUs(ch) { return (this.sampleCycles(ch) + this.resolution()) / this.adcclk() * 1e6; }
  sequence() {
    const len = field(this.get(SQR1), 20, 4) + 1, scan = bit(this.get(CR1), 8), out = [];
    for (let i = 0; i < (scan ? len : 1); i++) { const reg = i < 6 ? SQR3 : i < 12 ? SQR2 : SQR1; out.push(field(this.get(reg), (i % 6) * 5, 5)); }
    return out;
  }
  injectedSequence() { const j = this.get(JSQR), len = field(j, 20, 2) + 1, out = []; for (let i = 4 - len; i < 4; i++) out.push(field(j, i * 5, 5)); return out; }
  // Analog input voltage for channel ch at the current time.
  voltage(ch) {
    const ccr = this.soc.adcCommon.get(0x04);
    if (this.index === 0 && (ch === 16 || ch === 18) && bit(ccr, 23) && !(ch === 18 && bit(ccr, 22))) return 0.76 + 0.0025 * ((this.soc.options.temperature ?? 25) - 25);
    if (this.index === 0 && ch === 18 && bit(ccr, 22)) return (this.soc.options.vbat ?? 3.3) / 4;
    if (this.index === 0 && ch === 17 && bit(ccr, 23)) return 1.21;
    const pin = ADC_PINS[ch]; if (!pin) return 0;
    if (this.index === 2 && ((ch >= 4 && ch <= 9) || ch >= 14)) return 0; // ADC3 IN4-9/14/15 are on port F (absent on LQFP64)
    return this.soc.analogIn(pin) ?? 0;
  }
  convert(ch) {
    const v = Math.max(0, Math.min(3.3, this.voltage(ch))), bits = this.resolution();
    let value = Math.round(v / 3.3 * 4095) >> (12 - bits);
    const noise = this.soc.options.adcNoise ?? 0;
    if (noise) value = Math.max(0, Math.min((1 << bits) - 1, value + Math.round((this.soc.signals.random() - .5) * 2 * noise)));
    return value;
  }
  align(value, offset = 0) { let v = value - offset; if (bit(this.get(CR2), 11)) { v = (v << (16 - this.resolution())) & 0xffff; if (this.resolution() === 6) v = (v >> 8) & 0xff; } return v & 0xffff; }
  // ------------------------------------------------------------ registers
  readReg(off) {
    if (off === DR) { this.clearBits(SR, 2); this.updateIrq(); this.soc.dmaLine(this.name, false); return this.get(DR); }
    if (off >= 0x3c && off <= 0x48) return this.get(off);
    return this.get(off);
  }
  writeReg(off, value, mask) {
    const old = this.get(off), v = this.merge(off, value, mask);
    if (off === SR) { this.set(SR, old & (v | ~0x3f)); this.updateIrq(); return; }
    if (off === CR2) {
      this.set(CR2, v & ~((1 << 30) | (1 << 22)));
      if (!bit(v, 0)) { this.event?.cancel(); this.event = null; this.seq = null; this.inj = null; this.clearBits(SR, 0x18); }
      if (bit(v, 30) && this.on()) this.startRegular();
      if (bit(v, 22) && this.on()) this.startInjected();
      if (bit(old, 8) && !bit(v, 8)) this.soc.dmaLine(this.name, false);
      this.soc.triggersChanged?.();
      return;
    }
    this.set(off, v);
    if (off === CR1) this.updateIrq();
  }
  // ------------------------------------------------------------ conversions
  startRegular() {
    if (this.seq) return; // already converting
    this.setBits(SR, 0x10); // STRT
    this.seq = { list: this.sequence(), i: 0 };
    this.next();
  }
  startInjected() {
    if (this.inj) return;
    this.setBits(SR, 0x08); this.inj = { list: this.injectedSequence(), i: 0 };
    if (!this.event) this.next();
  }
  next() {
    const job = this.inj ?? this.seq; if (!job || !this.on()) return;
    const ch = job.list[job.i];
    this.event = this.soc.after(this.conversionUs(ch), () => { this.event = null; this.finish(job, ch); });
  }
  finish(job, ch) {
    const value = this.convert(ch); this.stats.conversions++; this.stats.last[ch] = value;
    if (job === this.inj) {
      const slot = 4 - job.list.length + job.i; this.set(0x3c + slot * 4, this.align(value, this.get(0x14 + slot * 4) & 0xfff));
      job.i++;
      if (job.i >= job.list.length) { this.setBits(SR, 4); this.inj = null; }
      this.updateIrq(); this.next(); return;
    }
    const cr1 = this.get(CR1), cr2 = this.get(CR2);
    if (bit(cr1, 23) && (!bit(cr1, 9) || field(cr1, 0, 5) === ch) && (value > (this.get(HTR) & 0xfff) || value < (this.get(LTR) & 0xfff))) this.setBits(SR, 1);
    const dma = bit(cr2, 8), eoc = bit(this.get(SR), 1);
    if (dma && this.dmaPending) { this.setBits(SR, 0x20); this.seq = null; this.updateIrq(); return; } // OVR
    if (!dma && bit(cr2, 10) && eoc && bit(cr1, 26)) { this.setBits(SR, 0x20); }
    this.set(DR, this.align(value));
    job.i++;
    const last = job.i >= job.list.length;
    if (bit(cr2, 10) || last) this.setBits(SR, 2);
    if (dma) {
      const remaining = this.soc.dmaRemaining(this.name);
      if (bit(cr2, 9) || remaining > 0) this.soc.dmaLine(this.name, true);
    }
    if (last) {
      if (bit(cr2, 1)) { job.i = 0; job.list = this.sequence(); }
      else { this.seq = null; }
      if (bit(cr1, 10) && this.injectedSequence().length) this.startInjected();
    }
    this.updateIrq();
    if (this.seq || this.inj) this.next();
  }
  get dmaPending() { return this.soc.dmaLineActive(this.name); }
  trigger(name) {
    const cr2 = this.get(CR2); if (!this.on()) return;
    if (field(cr2, 28, 2) && EXTSEL[field(cr2, 24, 4)] === name) this.startRegular();
    if (field(cr2, 20, 2) && JEXTSEL[field(cr2, 16, 4)] === name) this.startInjected();
  }
  wants(name) {
    const cr2 = this.get(CR2); if (!this.on()) return false;
    return (field(cr2, 28, 2) && EXTSEL[field(cr2, 24, 4)] === name) || (field(cr2, 20, 2) && JEXTSEL[field(cr2, 16, 4)] === name);
  }
  updateIrq() { this.soc.irqNumber(IRQ.ADC, this.name, !!this.irqActive()); }
  irqActive() { const sr = this.get(SR), cr1 = this.get(CR1); return (bit(sr, 1) && bit(cr1, 5)) || (bit(sr, 2) && bit(cr1, 7)) || (bit(sr, 0) && bit(cr1, 6)) || (bit(sr, 5) && bit(cr1, 26)); }
}
