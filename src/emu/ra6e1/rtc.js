// RA6E1 RTC in calendar count mode, as FSP r_rtc and the BSP drive it (offsets from R7FA6E10F.h R_RTC_Type):
//   0x00 R64CNT, 0x02 RSECCNT, 0x04 RMINCNT, 0x06 RHRCNT, 0x08 RWKCNT, 0x0A RDAYCNT, 0x0C RMONCNT (BCD), 0x0E RYRCNT (16-bit BCD)
//   0x10-0x1E the alarm registers (RSECAR … RYRAR, RYRAREN; ENB b7), 0x22 RCR1 (AIE b0, CIE b1, PIE b2, PES b7:4),
//   0x24 RCR2 (START b0, RESET b1, ADJ30 b2, HR24 b6, CNTMD b7), 0x28 RCR4 (RCKSEL), 0x2A/0x2C RFRH/RFRL, 0x2E RADJ,
//   0x40.. RTCCRn (time capture control: kept, capture not modelled).
// The calendar is a count of seconds since START was last set (the 1 Hz prescaler starts again there), so the
// seconds carry, the periodic interrupt (PES 6 = 1/256 s … 15 = 2 s, from the same prescaler) and the alarm come at
// the same instants as on the chip. The events (bsp_elc.h): RTC_ALARM 0x54, RTC_PERIOD 0x55, RTC_CARRY 0x56, raised
// only while an IELSR slot listens.
// Power-on: the counters hold 2000-01-01 00:00:00 (a Saturday) and count — or, with the RTC stack's start time
// "HOST_TIME", the PC's local time, as if a battery had kept the RTC running (soc.options.rtcStart / hostTime). The RTC is
// in its own power domain: an MCU reset (watchdog, SYSRESETREQ) keeps the calendar and the registers.
export const RTC_EVENT = Object.freeze({ ALARM: 0x54, PERIOD: 0x55, CARRY: 0x56 });
const PERIOD_S = { 6: 1 / 256, 7: 1 / 128, 8: 1 / 64, 9: 1 / 32, 10: 1 / 16, 11: 1 / 8, 12: 1 / 4, 13: 1 / 2, 14: 1, 15: 2 };
const bcd = n => ((Math.floor(n / 10) << 4) | (n % 10)), unbcd = n => ((n >> 4) & 15) * 10 + (n & 15);
const RCR1 = 0x22, RCR2 = 0x24;
const CENTURY_0 = Date.UTC(2000, 0, 1) / 1000, CENTURY_S = 36525 * 86400;
/** Calendar seconds (Date.UTC based, no time zone) of a date and time. */
export const rtcSeconds = (y, mon, d, h, m, s) => Date.UTC(y, mon - 1, d, h, m, s) / 1000;
/** The power-on calendar of a start mode: 2000-01-01 00:00:00, or the local time of `hostMs` (Date.now()). */
export function rtcPowerOn(start, hostMs = Date.now()) {
  if (start !== 'HOST_TIME') return rtcSeconds(2000, 1, 1, 0, 0, 0);
  const d = new Date(hostMs);
  return rtcSeconds(d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds());
}

export class Rtc {
  constructor(soc) {
    this.soc = soc; this.name = 'RTC'; this.size = 0x100; this.b = new Uint8Array(0x100);
    // The counters as written ({y, mon, day, h, m, s, wd}), valid at `anchor` (µs); while counting the calendar runs on
    // from them. Kept as fields, not seconds: FSP writes them one by one, and a day of 31 set before the month must stay.
    const d = new Date(rtcPowerOn(soc.options?.rtcStart, soc.options?.hostTime) * 1000);
    this.f = { y: d.getUTCFullYear(), mon: d.getUTCMonth() + 1, day: d.getUTCDate(), h: d.getUTCHours(), m: d.getUTCMinutes(), s: d.getUTCSeconds(), wd: d.getUTCDay() };
    this.anchor = 0; this.running = true;
    this.b[RCR2] = 0x41; this.matched = false; this.tick = null; this.periodic = null;
  }
  // An MCU reset: the RTC keeps its time and settings; only the scheduled events (cleared with the scheduler) start again.
  reset() { this.tick = null; this.periodic = null; this.plan(); }
  now() { return this.soc.nowUs(); }
  // The calendar now: the written fields, plus the whole seconds counted since START (the day of week counts with the days).
  fields() {
    const f = this.f;
    if (!this.running) return { ...f };
    const n = Math.floor((this.now() - this.anchor) / 1e6 + 1e-9);
    if (!n) return { ...f };
    // The year counter is two BCD digits and every fourth year is a leap year: after 99 comes 00, a leap year again, so
    // the calendar is the one of 2000-2099 repeated (36525 days), not the Gregorian 2100.
    const base = rtcSeconds(f.y, f.mon, f.day, f.h, f.m, f.s), days = Math.floor((base + n) / 86400) - Math.floor(base / 86400);
    const d = new Date((CENTURY_0 + ((base + n - CENTURY_0) % CENTURY_S + CENTURY_S) % CENTURY_S) * 1000);
    return { y: d.getUTCFullYear(), mon: d.getUTCMonth() + 1, day: d.getUTCDate(), h: d.getUTCHours(), m: d.getUTCMinutes(), s: d.getUTCSeconds(), wd: (f.wd + days) % 7 };
  }
  start() { if (this.running) return; this.running = true; this.anchor = this.now(); this.matched = this.alarmMatch(); this.plan(); }
  stop() { if (!this.running) return; this.f = this.fields(); this.running = false; this.plan(); }
  // A counter written: the field takes the value (while counting, the prescaler starts the second again).
  setField(off, v) {
    if (this.running) { this.f = this.fields(); this.anchor = this.now(); }
    const f = this.f;
    if (off === 0x02) f.s = unbcd(v & 0x7f); else if (off === 0x04) f.m = unbcd(v & 0x7f); else if (off === 0x06) f.h = unbcd(v & 0x3f);
    else if (off === 0x08) f.wd = v & 7; else if (off === 0x0a) f.day = unbcd(v & 0x3f); else if (off === 0x0c) f.mon = unbcd(v & 0x1f); else if (off === 0x0e) f.y = 2000 + unbcd(v & 0xff);
  }
  counter(off) {
    const f = this.fields();
    switch (off) {
      case 0x00: return this.running ? Math.floor(((this.now() - this.anchor) % 1e6) / 1e6 * 128) & 0x7f : 0;
      case 0x02: return bcd(f.s);
      case 0x04: return bcd(f.m);
      case 0x06: return bcd(f.h);
      case 0x08: return f.wd;
      case 0x0a: return bcd(f.day);
      case 0x0c: return bcd(f.mon);
      case 0x0e: return bcd(f.y % 100);
      default: return 0;
    }
  }
  // Alarm: every field with ENB set must match (24-hour mode, as FSP sets HR24).
  alarmMatch() {
    const f = this.fields(), b = this.b, on = off => b[off] & 0x80;
    if (![0x10, 0x12, 0x14, 0x16, 0x18, 0x1a].some(on) && !on(0x1e)) return false;
    if (on(0x10) && unbcd(b[0x10] & 0x7f) !== f.s) return false;
    if (on(0x12) && unbcd(b[0x12] & 0x7f) !== f.m) return false;
    if (on(0x14) && unbcd(b[0x14] & 0x3f) !== f.h) return false;
    if (on(0x16) && (b[0x16] & 7) !== f.wd) return false;
    if (on(0x18) && unbcd(b[0x18] & 0x3f) !== f.day) return false;
    if (on(0x1a) && unbcd(b[0x1a] & 0x1f) !== f.mon) return false;
    if (on(0x1e) && unbcd(b[0x1c]) !== f.y % 100) return false;
    return true;
  }
  // The 1 Hz work (carry, alarm) and the periodic interrupt, scheduled only while someone listens.
  plan() { this.planTick(); this.planPeriodic(); }
  // Each chain plans only itself, so one firing does not drop the other's event due at the same instant.
  planTick() {
    this.tick?.cancel?.(); this.tick = null;
    const rcr1 = this.b[RCR1], soc = this.soc;
    if (!this.running || !((rcr1 & 1 && soc.listens(RTC_EVENT.ALARM)) || (rcr1 & 2 && soc.listens(RTC_EVENT.CARRY)))) return;
    const k = Math.floor((this.now() - this.anchor) / 1e6 + 1e-9) + 1, at = this.anchor + k * 1e6;
    this.tick = soc.atUs(at, () => { this.tick = null; this.second(); this.planTick(); });
  }
  planPeriodic() {
    this.periodic?.cancel?.(); this.periodic = null;
    const rcr1 = this.b[RCR1], p = PERIOD_S[rcr1 >> 4];
    if (!this.running || !(rcr1 & 4) || !p || !this.soc.listens(RTC_EVENT.PERIOD)) return;
    const us = p * 1e6, k = Math.floor((this.now() - this.anchor) / us + 1e-9) + 1, at = this.anchor + k * us;
    this.periodic = this.soc.atUs(at, () => { this.periodic = null; this.soc.raiseEvent(RTC_EVENT.PERIOD); this.planPeriodic(); });
  }
  second() {
    const rcr1 = this.b[RCR1];
    if (rcr1 & 2) this.soc.raiseEvent(RTC_EVENT.CARRY);
    const match = this.alarmMatch();
    if (rcr1 & 1 && match && !this.matched) this.soc.raiseEvent(RTC_EVENT.ALARM);
    this.matched = match;
  }
  clockChanged() { this.plan(); }
  readByte(off) {
    if (off <= 0x0f) return off & 1 ? 0 : this.counter(off) & 0xff; // the counters are bytes (RYRCNT's high byte reads 0)
    if (off === RCR2) return (this.b[RCR2] & ~0x07) | (this.running ? 1 : 0);
    return this.b[off];
  }
  read(off, size) {
    this.soc.sync?.();
    let v = 0; for (let i = 0; i < size; i++) v |= this.readByte(off + i) << (8 * i);
    return v >>> 0;
  }
  peek(off, size) { return this.read(off, size); }
  write(off, value, size) {
    this.soc.sync?.();
    if (off === 0x0e && size >= 2) { this.setField(0x0e, value & 0xff); return; }
    if (size !== 1) { for (let i = 0; i < size; i++) this.write(off + i, (value >>> (8 * i)) & 0xff, 1); return; }
    const v = value & 0xff;
    if (off >= 0x02 && off <= 0x0e && !(off & 1)) { this.setField(off, v); this.matched = this.alarmMatch(); this.plan(); return; }
    if (off === RCR2) {
      // RESET: the prescaler and the alarm registers. The calendar keeps what it has counted (the second starts again).
      if (v & 2) { if (this.running) this.f = this.fields(); this.b.fill(0, 0x10, 0x20); this.anchor = this.now(); this.matched = false; }
      this.b[RCR2] = v & ~0x07;
      if (v & 1) this.start(); else this.stop();
      this.plan(); return;
    }
    this.b[off] = v;
    if (off === RCR1 || (off >= 0x10 && off < 0x20)) { if (off !== RCR1) this.matched = this.alarmMatch(); this.plan(); }
  }
}
