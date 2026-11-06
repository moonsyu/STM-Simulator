// RA6E1 AGT0-5 (16-bit Low Power Asynchronous General Purpose Timer) in timer mode, as FSP r_agt drives it:
// R_AGT_Open (AGTCR = 0 and wait for TCSTF = 0, AGTMR1 count source TCK, AGTMR2 LOCO divider, AGT = period - 1),
// R_AGT_Start (AGTCR = 0xF1, wait for TCSTF = 1), R_AGT_Stop (AGTCR = 0xF0).
//
// The counter counts down from the reload value (the AGT register) and underflows to it again; each underflow sets
// TUNDF and raises AGTn_INT. Underflows are scheduled only while the ICU links that event (the count is computed when
// read otherwise).
const AGT = 0x00, AGTCMA = 0x02, AGTCMB = 0x04, AGTCR = 0x08, AGTMR1 = 0x09, AGTMR2 = 0x0a;
const LOCO_HZ = 32768;
export const AGT_EVENT = ch => 0x40 + 3 * ch; // ELC_EVENT_AGTn_INT (bsp_elc.h)

export class Agt {
  constructor(soc, channel) { this.soc = soc; this.channel = channel; this.name = 'AGT' + channel; this.size = 0x100; this.reset(); }
  reset() {
    this.ev?.cancel?.(); this.ev = null;
    this.reload = 0xffff; this.counter = 0xffff; this.cma = 0xffff; this.cmb = 0xffff;
    this.b = new Uint8Array(16); this.running = false; this.t0 = 0; this.underflows = 0;
  }
  hz() {
    const tck = (this.b[AGTMR1] >> 4) & 7, cks = this.b[AGTMR2] & 7, pclkb = this.soc.clock.pclkb;
    if (tck === 0) return pclkb;
    if (tck === 1) return pclkb / 8;
    if (tck === 3) return pclkb / 2;
    if (tck === 4 || tck === 6) return LOCO_HZ / 2 ** cks; // AGTLCLK (LOCO) / AGTSCLK (sub-clock, 32.768 kHz)
    return 0; // event and underflow counting are not modelled
  }
  period() { return this.reload + 1; }
  count() {
    if (!this.running || !this.hz()) return this.counter;
    const n = Math.floor((this.soc.nowUs() - this.t0) * this.hz() / 1e6 + 1e-6), p = this.period();
    return (this.counter - (n % p) + p) % p;
  }
  start() {
    if (this.running) return;
    this.running = true; this.t0 = this.soc.nowUs(); this.plan();
  }
  stop() { if (!this.running) return; this.counter = this.count(); this.running = false; this.ev?.cancel?.(); this.ev = null; }
  plan() {
    if (!this.running || this.ev || !this.hz() || !this.soc.icu.linked(AGT_EVENT(this.channel))) return;
    const c = this.count(), now = this.soc.nowUs(), hz = this.hz();
    this.counter = c; this.t0 = now;
    const at = now + (c + 1) * 1e6 / hz;
    this.ev = this.soc.atUs(at, () => this.underflow(at));
  }
  underflow(at) {
    this.ev = null; this.underflows++;
    this.counter = this.reload; this.t0 = at;
    this.b[AGTCR] |= 0x20; // TUNDF
    this.soc.icu.raise(AGT_EVENT(this.channel));
    this.plan();
  }
  read(off, size) {
    this.soc.sync();
    if (off === AGT && size >= 2) return size === 4 ? (this.count() | (this.cma << 16)) >>> 0 : this.count();
    if (off === AGTCMA && size === 2) return this.cma;
    if (off === AGTCMB && size === 2) return this.cmb;
    if (off === AGTCR) { const v = (this.b[AGTCR] & 0xf0) | (this.running ? 3 : 0); return size === 1 ? v : v | (this.b[AGTMR1] << 8); }
    if (size === 1) return off < 8 ? ([this.count(), this.cma, this.cmb, 0][off >> 1] >> ((off & 1) * 8)) & 0xff : this.b[off];
    return this.read(off, 1) | (this.read(off + 1, 1) << 8);
  }
  peek(off, size) { return this.read(off, size); }
  write(off, value, size) {
    this.soc.sync();
    if (off === AGT && size >= 2) { const was = this.running; this.stop(); this.reload = this.counter = value & 0xffff; if (was) this.start(); return; }
    if (off === AGTCMA && size === 2) { this.cma = value & 0xffff; return; }
    if (off === AGTCMB && size === 2) { this.cmb = value & 0xffff; return; }
    if (size !== 1) { for (let i = 0; i < size; i++) this.write(off + i, (value >>> (8 * i)) & 0xff, 1); return; }
    if (off === AGTCR) {
      const v = value & 0xff, old = this.b[AGTCR];
      if (v & 0x04) { this.stop(); this.counter = this.reload; this.b[AGTCR] = 0; return; } // TSTOP: forced stop
      this.b[AGTCR] = (old & v & 0xf0); // status flags clear by writing 0
      if (v & 1) this.start(); else this.stop();
      return;
    }
    const was = this.running && (off === AGTMR1 || off === AGTMR2);
    if (was) this.stop();
    this.b[off] = value & 0xff;
    if (was) this.start();
  }
}
