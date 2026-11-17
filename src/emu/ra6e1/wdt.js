// RA6E1 watchdog timers as FSP r_wdt / r_iwdt drive them (registers from R7FA6E10F.h R_WDT_Type / R_IWDT_Type, the
// field codes from r_wdt.c / r_iwdt.c):
//   +0x00 WDTRR   refresh: 0x00 then 0xFF
//   +0x02 WDTCR   TOPS b1:0, CKS b7:4, RPES b9:8 (window end), RPSS b13:12 (window start)
//   +0x04 WDTSR   CNTVAL b13:0 (the down-counter), UNDFF b14, REFEF b15 (cleared by writing 0)
//   +0x06 WDTRCR  RSTIRQS b7: 1 reset, 0 NMI
//   +0x08 WDTCSTPR SLCSTP b7: stop while sleeping
// The WDT counts PCLKB / CKS; the IWDT its own 15 kHz clock (BSP_FEATURE_IWDT_CLOCK_FREQUENCY). Register-start mode
// (WDT only on the RA6E1: BSP_FEATURE_IWDT_SUPPORTS_REGISTER_START_MODE 0) takes the settings from the registers and
// starts at the first refresh; auto-start mode (OFS0 WDTSTRT b17 / IWDTSTRT b1 = 0) takes them from OFS0 and counts
// from the reset on. An underflow, or a refresh outside the window, sets UNDFF / REFEF and then resets the MCU
// (RSTSR1 WDTRF / IWDTRF) or, with RSTIRQS 0, raises the NMI (ICU NMISR WDTST b1 / IWDTST b0).
// Not modelled: the sleep-mode stop (SLCSTP: the CPU's WFI does not stop the clocks here) and the debugger stop
// (DBGSTOPCR: time does not pass while the debugger holds the core anyway).
const RR = 0x00, CR = 0x02, SR = 0x04, RCR = 0x06, CSTPR = 0x08;
// CKS code → divider (wdt_clock_division_t: the hardware field values).
export const WDT_CKS = Object.freeze({ 0: 1, 1: 4, 2: 16, 3: 32, 4: 64, 15: 128, 5: 256, 6: 512, 7: 2048, 8: 8192 });
// TOPS code → timeout in clocks.
export const WDT_TOPS = Object.freeze({ WDT: [1024, 4096, 8192, 16384], IWDT: [128, 512, 1024, 2048] });
// RPSS code → window start (% of the count left), RPES code → window end.
const WINDOW_START = [25, 50, 75, 100], WINDOW_END = [75, 50, 25, 0];
export const IWDT_HZ = 15000;
// OFS0 fields of each watchdog: [start-bit, field base]. The WDT's fields are the IWDT's moved up by 16.
const OFS = { IWDT: 0, WDT: 16 };

export class Watchdog {
  constructor(soc, kind) { this.soc = soc; this.kind = kind; this.name = kind; this.size = 0x100; this.reset(); }
  reset() {
    this.ev?.cancel?.(); this.ev = null;
    this.cr = 0x33f3; this.rcr = 0x80; this.cstpr = 0x80; this.flags = 0; this.armed = false; this.step = 0;
    this.running = false; this.count = 0; this.t0 = 0; this.hz0 = 0;
    // Auto-start: the settings come from OFS0, and the counter runs from the reset on.
    const ofs = (this.soc.bus?.ofs0 ?? 0xffffffff) >>> 0, s = OFS[this.kind];
    this.auto = !((ofs >>> (s + 1)) & 1);
    if (this.auto) {
      const f = ofs >>> s;
      this.cr = ((f >>> 2) & 3) | (((f >>> 4) & 15) << 4) | (((f >>> 8) & 3) << 8) | (((f >>> 10) & 3) << 12);
      this.rcr = ((f >>> 12) & 1) << 7; this.cstpr = ((f >>> 14) & 1) << 7;
      this.restart();
    }
  }
  timeout() { return WDT_TOPS[this.kind][this.cr & 3]; }
  hz() { return (this.kind === 'IWDT' ? IWDT_HZ : this.soc.clock.pclkb) / (WDT_CKS[(this.cr >> 4) & 15] ?? 8192); }
  // The counter now: it counts down from timeout - 1 at hz, and stops at 0 once it has underflowed.
  counter() {
    if (!this.running) return this.count;
    const n = Math.floor((this.soc.nowUs() - this.t0) * this.hz0 / 1e6 + 1e-6);
    return Math.max(0, this.count - n);
  }
  restart() {
    this.ev?.cancel?.(); this.running = true; this.count = this.timeout() - 1; this.t0 = this.soc.nowUs(); this.hz0 = this.hz(); this.plan();
  }
  plan() {
    this.ev?.cancel?.(); this.ev = null;
    if (!this.running || !this.hz0) return;
    const at = this.t0 + (this.count + 1) * 1e6 / this.hz0;
    this.ev = this.soc.atUs(at, () => { this.ev = null; this.expire(0x4000, '시간 초과(언더플로)'); });
  }
  // The core clock changed (the BSP's clock set-up): the scheduler counts core cycles, so the underflow is planned again.
  // For the WDT PCLKB changed too: the count so far stays, the rest goes at the new rate.
  clockChanged() {
    if (!this.running) return;
    if (this.kind === 'WDT') { const c = this.counter(); this.count = c; this.t0 = this.soc.nowUs(); this.hz0 = this.hz(); }
    this.plan();
  }
  expire(flag, why) {
    this.count = 0; this.running = false; this.flags |= flag; this.ev?.cancel?.(); this.ev = null;
    if (this.rcr & 0x80) {
      this.soc.env?.warn?.(`[${this.kind}] ${why} — MCU를 리셋합니다(RSTSR1.${this.kind}RF).`);
      this.soc.systemReset(this.kind);
    } else this.soc.nmi?.(this.kind === 'IWDT' ? 0 : 1);
  }
  refresh() {
    // Register-start mode: the first refresh starts the counter (and locks the settings); after an NMI underflow a
    // refresh starts it again. The IWDT has no register-start mode on the RA6E1: stopped by OFS0, it stays stopped.
    if (!this.running) { if (!this.auto) { if (this.kind === 'IWDT') return; this.armed = true; } this.restart(); return; }
    // Refresh-permitted window: the count left must be between the end and the start position; the end position itself
    // (counter 0x2FF of 1024 clocks at 75 %) is inside.
    const left = (this.counter() + 1) / this.timeout() * 100, start = WINDOW_START[(this.cr >> 12) & 3], end = WINDOW_END[(this.cr >> 8) & 3];
    if (left > start + 1e-9 || (end > 0 && left < end - 1e-9)) { this.expire(0x8000, `창 밖에서 새로 고침(남은 카운트 ${left.toFixed(1)} %, 허용 ${end}~${start} %)`); return; }
    this.restart();
  }
  read(off, size) {
    this.soc.sync?.();
    if (off === SR) return size === 1 ? this.counter() & 0xff : (this.counter() & 0x3fff) | this.flags;
    if (off === SR + 1 && size === 1) return ((this.counter() & 0x3fff) | this.flags) >> 8;
    if (off === CR) return size === 1 ? this.cr & 0xff : this.cr;
    if (off === CR + 1) return this.cr >> 8;
    if (off === RCR) return this.rcr;
    if (off === CSTPR) return this.cstpr;
    if (off === RR) return 0xff;
    return 0;
  }
  peek(off, size) { return this.read(off, size); }
  write(off, value, size) {
    this.soc.sync?.();
    if (off === RR && size === 1) {
      const v = value & 0xff;
      if (v === 0x00) this.step = 1;
      else if (v === 0xff && this.step === 1) { this.step = 0; this.refresh(); }
      else this.step = 0;
      return;
    }
    if (off === SR) { this.flags &= (size === 1 ? 0xffff : value) & 0xc000; return; }
    if (off === SR + 1 && size === 1) { this.flags &= (value << 8) & 0xc000; return; }
    // The settings take effect only before the counter first starts (register-start mode), as on the chip.
    if (this.auto || this.armed || this.kind === 'IWDT') return;
    if (off === CR && size >= 2) this.cr = value & 0x33f3; // TOPS b1:0, CKS b7:4 (four bits: /8192 is 8, /128 is 15), RPES b9:8, RPSS b13:12
    else if (off === RCR) this.rcr = value & 0x80;
    else if (off === CSTPR) this.cstpr = value & 0x80;
  }
}
