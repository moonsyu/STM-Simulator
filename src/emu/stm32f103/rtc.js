import { Peripheral, bit } from '../stm32f446/core.js';
import { LSE_HZ, LSI_HZ } from './rcc.js';

// STM32F1 RTC (RM0008 18): a 32-bit seconds counter clocked by RTCCLK / (PRL + 1), with an alarm compare and the
// second / overflow / alarm flags. The HAL keeps the calendar date in the handle and the time of day in CNT.
// Registers are 16 bits wide on a 4-byte pitch: CRH 00, CRL 04, PRLH/L 08/0C, DIVH/L 10/14, CNTH/L 18/1C, ALRH/L 20/24.
// CRL: SECF 0, ALRF 1, OWF 2 (cleared by writing 0), RSF 3, CNF 4 (configuration mode), RTOFF 5 (always done here).
// The RTC sits in the backup domain: writes need PWR_CR.DBP, and it counts only with RCC_BDCR.RTCEN and a ready clock.
export class RtcF1 extends Peripheral {
  constructor(soc) { super(soc, 'RTC'); this.reset(); }
  reset() {
    super.reset();
    this.set(0x04, 0x0020); this.set(0x0c, 0x8000); // RTOFF; PRL = 0x8000
    this.prl = 0x8000; this.anchor = { count: 0, us: this.soc.nowUs?.() ?? 0, t: 0 }; this.alr = 0xffffffff;
    this.timers?.forEach(t => t?.cancel()); this.timers = [];
  }
  bdcr() { return this.soc.rcc.get(0x20); }
  // RTCCLK from RTCSEL (01 LSE, 10 LSI, 11 HSE/128) when that oscillator is ready; 0 = stopped.
  clockHz() {
    const bd = this.bdcr(), sel = (bd >> 8) & 3;
    if (!bit(bd, 15)) return 0;
    if (sel === 1) return bit(bd, 1) ? LSE_HZ : 0;
    if (sel === 2) return bit(this.soc.rcc.get(0x24), 1) ? LSI_HZ : 0;
    if (sel === 3) return 8e6 / 128;
    return 0;
  }
  tickUs() { const hz = this.clockHz(); return hz ? (this.prl + 1) / hz * 1e6 : 0; }
  configuring() { return bit(this.get(0x04), 4); }
  // Counter value now: the base count plus whole ticks since it was set (the counter is frozen in configuration mode).
  // The base keeps the tick length it counts with; a clock that starts, stops or changes (RTCEN, LSERDY, RTCSEL, PRL)
  // starts a new base at the current count, so no time jumps in.
  count(us = this.soc.nowUs()) {
    const t = this.anchor.t;
    return (t && !this.configuring() ? this.anchor.count + Math.floor((us - this.anchor.us) / t) : this.anchor.count) >>> 0;
  }
  rebase() { const t = this.tickUs(); if (t !== this.anchor.t) this.anchor = { count: this.count(), us: this.soc.nowUs(), t }; }
  freeze() { this.anchor = { count: this.count(), us: this.soc.nowUs(), t: this.tickUs() }; }
  readReg(off) {
    this.rebase();
    const cnt = this.count();
    if (off === 0x18) return cnt >>> 16;
    if (off === 0x1c) return cnt & 0xffff;
    if (off === 0x10 || off === 0x14) {
      const t = this.anchor.t, frac = t ? ((this.soc.nowUs() - this.anchor.us) % t) / t : 0, div = Math.floor(this.prl - frac * (this.prl + 1)) >>> 0;
      return off === 0x10 ? (div >>> 16) & 0xf : div & 0xffff;
    }
    if (off === 0x20) return (this.alr >>> 16) & 0xffff;
    if (off === 0x24) return this.alr & 0xffff;
    return this.get(off);
  }
  writeReg(off, value, mask) {
    if (!this.soc.pwr?.backupAccess) return; // backup domain write protection (PWR_CR.DBP)
    this.rebase();
    const v = this.merge(off, value, mask) & 0xffff;
    if (off === 0x00) { this.set(0, v & 7); this.updateIrq(); this.schedule(); return; }
    if (off === 0x04) {
      const old = this.get(0x04), flags = old & v & 0x7, enter = bit(v, 4) && !bit(old, 4), leave = !bit(v, 4) && bit(old, 4);
      if (enter) this.freeze();
      let next = (old & ~0x1f) | flags | (v & 0x10) | 0x20;
      if (!bit(v, 3)) { next &= ~0x8; this.soc.after(30, () => this.setBits(0x04, 0x8)); } // RSF set again at the next APB1 sync
      else next |= old & 0x8;
      this.set(0x04, next);
      if (leave) this.anchor = { count: this.anchor.count, us: this.soc.nowUs(), t: this.tickUs() };
      if (!bit(next, 1)) this.soc.exti?.input(17, 0);
      this.updateIrq(); this.schedule();
      return;
    }
    // PRL, CNT and ALR are written in configuration mode (CNF = 1).
    if (!this.configuring()) return;
    if (off === 0x08) { this.prl = ((v & 0xf) << 16) | (this.prl & 0xffff); this.set(off, v & 0xf); return; }
    if (off === 0x0c) { this.prl = (this.prl & 0xf0000) | v; this.set(off, v); return; }
    if (off === 0x18) { this.anchor = { ...this.anchor, count: ((v << 16) | (this.anchor.count & 0xffff)) >>> 0 }; return; }
    if (off === 0x1c) { this.anchor = { ...this.anchor, count: ((this.anchor.count & 0xffff0000) | v) >>> 0 }; return; }
    if (off === 0x20) { this.alr = ((v << 16) | (this.alr & 0xffff)) >>> 0; return; }
    if (off === 0x24) { this.alr = ((this.alr & 0xffff0000) | v) >>> 0; return; }
  }
  // RTC global interrupt (vector 3, RTC_IRQn): SECF & SECIE, ALRF & ALRIE, OWF & OWIE.
  updateIrq() { const crh = this.get(0), crl = this.get(0x04); this.soc.irq('RTC_WKUP', 'rtc', !!(crh & crl & 7)); }
  // Next events: the second tick (when SECIE asks for it) and the tick where CNT reaches ALR (alarm, EXTI line 17).
  schedule() {
    this.timers.forEach(t => t?.cancel()); this.timers = [];
    this.rebase();
    const t = this.anchor.t; if (!t || this.configuring()) return;
    const now = this.soc.nowUs(), cnt = this.count(now), into = (now - this.anchor.us) % t, toNext = t - into + 1;
    if (bit(this.get(0), 0)) this.timers.push(this.soc.after(toNext, () => { this.setBits(0x04, 1); this.updateIrq(); this.schedule(); }));
    const ahead = (this.alr - cnt) >>> 0;
    if (ahead >= 1 && ahead < 400 * 86400) this.timers.push(this.soc.after(toNext + (ahead - 1) * t, () => {
      this.setBits(0x04, 2); this.soc.exti?.input(17, 1, 'RTC alarm'); this.updateIrq(); this.schedule();
    }));
  }
}

// Backup registers (RM0008 5): DR1-DR10 (16 bits) at 04-28, RTCCR 2C, CR 30, CSR 34; writable with PWR_CR.DBP.
export class BkpF1 extends Peripheral {
  constructor(soc) { super(soc, 'BKP'); this.reset(); }
  writeReg(off, value, mask) {
    if (!this.soc.pwr?.backupAccess) return;
    const v = this.merge(off, value, mask);
    if (off >= 0x04 && off <= 0x28) this.set(off, v & 0xffff);
    else if (off === 0x2c) this.set(off, v & 0x3ff);
    else if (off === 0x30) this.set(off, v & 3);
    else if (off === 0x34) this.set(off, v & 0x4);
  }
}
