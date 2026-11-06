// RA6E1 ADC12 unit 0 (S12AD0) as FSP r_adc drives it: R_ADC_Open (ADCSR mode, ADCER resolution/alignment),
// R_ADC_ScanCfg (ADANSA channel mask), R_ADC_ScanStart (ADCSR.ADST = 1 for a software trigger), R_ADC_StatusGet
// (ADST), R_ADC_Read (ADDRn).
//
// Channels AN000-AN008, AN012, AN013 (BSP_FEATURE_ADC_UNIT_0_CHANNELS_MASK 0x31FF) read the voltage the circuit puts on
// their pin, against VREFH0 = 3.3 V on the FPB-RA6E1. A single scan takes `SCAN_US_PER_CHANNEL` per selected channel,
// then stores every result, clears ADST and raises ADC0_SCAN_END (the scan end interrupt has no enable bit on the RA;
// r_adc links it in the ICU when a callback is set). Continuous scan keeps ADST set: ADDRn reads the pin when read, and
// the scan end event repeats only while the ICU links it.
const ADCSR = 0x00, ADANSA0 = 0x04, ADANSA1 = 0x06, ADCER = 0x0e, ADTSDR = 0x1a, ADOCDR = 0x1c, ADDR = 0x20;
export const ADC_CHANNEL_PINS = Object.freeze({ 0: 'P000', 1: 'P001', 2: 'P002', 3: 'P003', 4: 'P004', 5: 'P005', 6: 'P006', 7: 'P007', 8: 'P008', 12: 'P014', 13: 'P015' });
export const ADC0_SCAN_END = 0x160;
const SCAN_US_PER_CHANNEL = 1;
const VREF = 3.3;

export class Adc12 {
  constructor(soc) { this.soc = soc; this.name = 'ADC0'; this.size = 0x200; this.reset(); }
  reset() { this.ev?.cancel?.(); this.ev = null; this.r = new Uint16Array(0x100); this.scans = 0; }
  get(off) { return this.r[off >> 1]; }
  channels() { const m = this.get(ADANSA0) | (this.get(ADANSA1) << 16); return Object.keys(ADC_CHANNEL_PINS).map(Number).filter(ch => m & (1 << ch)); }
  continuous() { return ((this.get(ADCSR) >> 13) & 3) === 2; }
  bits() { return [12, 10, 8][(this.get(ADCER) >> 1) & 3] ?? 12; }
  // A conversion result as ADDRn holds it (resolution, then right or left alignment).
  code(ch) {
    const pin = ADC_CHANNEL_PINS[ch], v = pin ? this.soc.analogIn(pin) ?? 0 : 0, bits = this.bits();
    const n = Math.max(0, Math.min((1 << bits) - 1, Math.round(Math.max(0, v) / VREF * ((1 << bits) - 1))));
    return (this.get(ADCER) >> 15) & 1 ? (n << (16 - bits)) & 0xffff : n;
  }
  scanUs() { return Math.max(1, this.channels().length) * SCAN_US_PER_CHANNEL; }
  start() {
    this.ev?.cancel?.(); this.ev = null;
    if (this.continuous() && !this.soc.icu.linked(ADC0_SCAN_END)) return; // results are read live
    const at = this.soc.nowUs() + this.scanUs();
    this.ev = this.soc.atUs(at, () => this.finish());
  }
  finish() {
    this.ev = null; this.scans++;
    for (const ch of this.channels()) this.r[(ADDR >> 1) + ch] = this.code(ch);
    if (!this.continuous()) this.r[ADCSR >> 1] &= ~0x8000;
    this.soc.icu.raise(ADC0_SCAN_END);
    if (this.continuous() && this.get(ADCSR) & 0x8000) this.start();
  }
  read(off, size) {
    this.soc.sync();
    const word = off & ~1;
    let v = this.get(word);
    if (word >= ADDR && word < ADDR + 58 && this.continuous() && this.get(ADCSR) & 0x8000) { const ch = (word - ADDR) >> 1; v = this.code(ch); this.r[word >> 1] = v; }
    if (word === ADOCDR) v = Math.round(1.18 / VREF * 4095); // internal reference voltage (1.18 V typ.)
    if (word === ADTSDR) v = 0x800;
    if (size === 1) return (v >> ((off & 1) * 8)) & 0xff;
    if (size === 4) return (v | (this.read(word + 2, 2) << 16)) >>> 0;
    return v;
  }
  peek(off, size) { const word = off & ~1, v = this.get(word); return size === 1 ? (v >> ((off & 1) * 8)) & 0xff : v; }
  write(off, value, size) {
    this.soc.sync();
    if (size === 4) { this.write(off, value & 0xffff, 2); this.write(off + 2, value >>> 16, 2); return; }
    const word = off & ~1, old = this.get(word), v = size === 1 ? (off & 1 ? (old & 0xff) | ((value & 0xff) << 8) : (old & 0xff00) | (value & 0xff)) : value & 0xffff;
    this.r[word >> 1] = v;
    if (word === ADCSR) {
      if ((v & 0x8000) && !(old & 0x8000)) this.start();
      else if (!(v & 0x8000)) { this.ev?.cancel?.(); this.ev = null; }
    }
  }
}
