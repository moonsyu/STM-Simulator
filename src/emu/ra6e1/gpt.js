// RA6E1 GPT (General PWM Timer): GPT1/2 (32-bit) and GPT4-7 (16-bit) in saw-wave up-count mode, as FSP r_gpt drives them
// (R_GPT_Open → GTCR/GTPR/GTCCRC·E/GTIOR/GTBER, R_GPT_Start → GTSTR, R_GPT_DutyCycleSet → GTCCRC/E + GTUDDTYC).
//
// The counter is kept as a start time and a start count (GTCNT is computed when read). An overflow (cycle end) is
// scheduled only when something depends on it: the ICU links the channel's overflow event, a buffer register (GTCCRC → A,
// GTCCRE → B, GTPBR → GTPR) waits for its transfer, or the timer runs one-shot. GTIOCnA/B drive the pins set to them
// (PSEL 00011b) with the averaged PWM level and its duty/frequency, the way the circuit reads STM32 timer outputs.
import { RA_GPT_32BIT } from '../../ra-config.js';

const GTWP = 0x00, GTSTR = 0x04, GTSTP = 0x08, GTCLR = 0x0c, GTCR = 0x2c, GTUDDTYC = 0x30, GTIOR = 0x34, GTST = 0x3c, GTBER = 0x40, GTCNT = 0x48, GTCCR = 0x4c, GTPR = 0x64, GTPBR = 0x68;
const CCRA = 0, CCRB = 1, CCRC = 2, CCRE = 3;
/** ELC event of each channel's capture/compare A (B … F follow, +6 overflow, +7 underflow; bsp_elc.h). */
export const GPT_EVENT_BASE = Object.freeze({ 1: 0xc9, 2: 0xd2, 4: 0xe4, 5: 0xed, 6: 0xf6, 7: 0xff });

export class Gpt {
  constructor(soc, channel) {
    this.soc = soc; this.channel = channel; this.name = 'GPT' + channel; this.size = 0x100;
    this.max = RA_GPT_32BIT.includes(channel) ? 0xffffffff : 0xffff;
    this.reset();
  }
  reset() {
    this.ev?.cancel?.();
    this.r = new Uint32Array(0x40);
    this.r[GTUDDTYC >> 2] = 1;
    this.r[GTPR >> 2] = this.r[GTPBR >> 2] = this.max;
    for (let i = 0; i < 6; i++) this.r[(GTCCR >> 2) + i] = this.max;
    this.running = false; this.t0 = 0; this.c0 = 0; this.ev = null; this.overflows = 0;
  }
  reg(off) { return this.r[off >> 2] >>> 0; }
  ccr(i) { return this.r[(GTCCR >> 2) + i] >>> 0; }
  hz() { return this.soc.clock.pclkd / 2 ** ((this.reg(GTCR) >> 23) & 0xf); }
  period() { return this.reg(GTPR) + 1; }
  oneShot() { return ((this.reg(GTCR) >> 16) & 7) === 1; }
  count() {
    if (!this.running) return this.reg(GTCNT);
    const n = Math.floor((this.soc.nowUs() - this.t0) * this.hz() / 1e6 + 1e-6);
    return (this.c0 + n) % this.period();
  }
  setCount(v) { const running = this.running; if (running) this.halt(); this.r[GTCNT >> 2] = v & this.max; if (running) this.start(); }
  // ------------------------------------------------------------ run control
  start() {
    if (this.running) return;
    this.running = true; this.r[GTCR >> 2] |= 1; this.t0 = this.soc.nowUs(); this.c0 = this.reg(GTCNT) % this.period();
    this.plan(); this.changed();
  }
  stop() { if (!this.running) return; this.halt(); this.changed(); }
  halt() { this.r[GTCNT >> 2] = this.count(); this.running = false; this.r[GTCR >> 2] &= ~1; this.ev?.cancel?.(); this.ev = null; }
  buffered() {
    const ber = this.reg(GTBER);
    return ((ber >> 16) & 3) && this.ccr(CCRC) !== this.ccr(CCRA) || ((ber >> 18) & 3) && this.ccr(CCRE) !== this.ccr(CCRB) || ((ber >> 20) & 3) && this.reg(GTPBR) !== this.reg(GTPR);
  }
  needsCycle() { return this.oneShot() || this.buffered() || this.soc.icu.linked(GPT_EVENT_BASE[this.channel] + 6); }
  // Schedule the next cycle end while the timer runs and something waits for it.
  plan() {
    if (!this.running || this.ev || !this.needsCycle()) return;
    const c = this.count(), now = this.soc.nowUs();
    this.t0 = now - c * 1e6 / this.hz() + 1e-9; this.c0 = 0;
    const at = this.t0 + this.period() * 1e6 / this.hz();
    this.ev = this.soc.atUs(at, () => this.overflow(at));
  }
  overflow(at) {
    this.ev = null; this.overflows++;
    this.t0 = at; this.c0 = 0;
    this.r[GTST >> 2] |= 1 << 6; // TCFPO
    const before = this.outputKey();
    this.transfer(false);
    this.soc.icu.raise(GPT_EVENT_BASE[this.channel] + 6);
    if (this.oneShot()) { this.r[GTCNT >> 2] = 0; this.running = false; this.r[GTCR >> 2] &= ~1; this.changed(); return; }
    if (this.outputKey() !== before) this.changed();
    this.plan();
  }
  // Buffer operation (GTBER CCRA/CCRB/PR single buffer): at the cycle end, or at once for CCRSWT (compare registers only).
  transfer(force) {
    const ber = this.reg(GTBER), r = this.r, base = GTCCR >> 2;
    if ((ber >> 16) & 3) r[base + CCRA] = r[base + CCRC];
    if ((ber >> 18) & 3) r[base + CCRB] = r[base + CCRE];
    if (!force && (ber >> 20) & 3) r[GTPR >> 2] = r[GTPBR >> 2];
  }
  // ------------------------------------------------------------ outputs
  // Level of GTIOCnA/B: the cycle-end and compare-match settings of GTIOA/GTIOB (01 low, 10 high, 11 toggle), the
  // 0 %/100 % duty modes of GTUDDTYC, and the stop level (xDFLT) while the count is stopped.
  output(role) {
    const b = role === 'GTIOCB', gtior = this.reg(GTIOR), sh = b ? 16 : 0;
    if (!((gtior >> (sh + 8)) & 1)) return null; // OAE / OBE
    if (!this.running) return { level: (gtior >> (sh + 6)) & 1 };
    const gtio = (gtior >> sh) & 0x1f, end = (gtio >> 2) & 3, match = gtio & 3, frequency = this.hz() / this.period();
    const lv = s => (s === 2 ? 1 : 0);
    const forced = (this.reg(GTUDDTYC) >> (b ? 24 : 16)) & 3;
    if (forced === 2) return { level: lv(match) };
    if (forced === 3) return { level: lv(end) };
    if (match === 3 && (end === 0 || end === 3)) return { level: 1, value: 1.65, pwm: { duty: 0.5, frequency: frequency / 2 } };
    if (end === match || !end || !match) return { level: lv(end || match || ((gtio >> 4) & 1 ? 2 : 1)) };
    const first = Math.min(1, (this.ccr(b ? CCRB : CCRA) + 1) / this.period()), duty = lv(end) ? first : 1 - first;
    if (duty <= 0 || duty >= 1) return { level: duty >= 1 ? 1 : 0 };
    return { level: duty >= 0.5 ? 1 : 0, value: 3.3 * duty, pwm: { duty, frequency } };
  }
  outputKey() { return JSON.stringify([this.output('GTIOCA'), this.output('GTIOCB')]); }
  changed() { this.soc.peripheralChanged?.(this.name); }
  // ------------------------------------------------------------ registers
  read(off, size) {
    this.soc.sync();
    const word = off & ~3;
    let v;
    if (word === GTCNT) v = this.count();
    else if (word === GTSTR || word === GTSTP) v = this.soc.gptRunning();
    else if (word === GTST) v = this.reg(GTST) | (1 << 15); // TUCF: up-counting
    else if (word === GTCR) v = (this.reg(GTCR) & ~1) | (this.running ? 1 : 0);
    else v = this.reg(word);
    const sh = (off & 3) * 8;
    return size === 4 ? v >>> 0 : (v >>> sh) & (size === 2 ? 0xffff : 0xff);
  }
  peek(off, size) { return this.read(off, size); }
  write(off, value, size) {
    this.soc.sync();
    const word = off & ~3, sh = (off & 3) * 8, mask = size === 4 ? 0xffffffff : ((size === 2 ? 0xffff : 0xff) << sh) >>> 0;
    const old = word === GTCNT ? this.count() : this.reg(word), v = size === 4 ? value >>> 0 : ((old & ~mask) | ((value << sh) & mask)) >>> 0;
    switch (word) {
      case GTSTR: this.soc.gptControl(v, 'start'); return;
      case GTSTP: this.soc.gptControl(v, 'stop'); return;
      case GTCLR: this.soc.gptControl(v, 'clear'); return;
      case GTCNT: this.setCount(v); return;
      case GTST: this.r[GTST >> 2] = old & v; return; // flags clear by writing 0
      case GTCR: {
        const was = this.running, tpcs = (old >> 23) & 0xf;
        if (was && ((v >> 23) & 0xf) !== tpcs) this.halt();
        this.r[GTCR >> 2] = v & ~1;
        if (v & 1) { if (!this.running) this.start(); else this.r[GTCR >> 2] |= 1; } else if (this.running || was) this.stop();
        return;
      }
      case GTBER:
        this.r[GTBER >> 2] = v & ~(1 << 22);
        if (v & (1 << 22)) this.transfer(true);
        break;
      case GTWP: this.r[GTWP >> 2] = v & 0xffff; return;
      default:
        if (word >= GTCCR && word < GTCCR + 24 || word === GTPR || word === GTPBR) {
          if (word === GTPR && this.running) { const c = this.count(); this.r[GTPR >> 2] = v & this.max; this.ev?.cancel?.(); this.ev = null; this.t0 = this.soc.nowUs(); this.c0 = c % this.period(); this.plan(); this.changed(); return; }
          this.r[word >> 2] = v & this.max;
        } else this.r[word >> 2] = v;
    }
    if (this.running) this.plan();
    this.changed();
  }
}
