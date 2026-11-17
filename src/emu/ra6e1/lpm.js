// RA6E1 low power modes, as FSP r_lpm drives them (r_lpm.c; register offsets from R7FA6E10F.h R_SYSTEM_Type / R_ICU_Type):
//   R_SYSTEM  0x00C SBYCR (SSBY b15: WFI enters Software Standby, 0: Sleep)   0x092 SNZCR (SNZE b7: snooze, not modelled)
//             0x400 DPSBYCR (DEEPCUT b1:0, IOKEEP b6, DPSBY b7: with SSBY, WFI enters Deep Software Standby)
//             0x402-0x405 DPSIER0-3 (cancel source enables)   0x406-0x409 DPSIFR0-3 (cancel flags, cleared by writing 0)
//             0x40A-0x40C DPSIEGR0-2 (edge of the pin sources: 1 rising)   0x410 RSTSR0 (DPSRSTF b7, in soc.resetStatus)
//   R_ICU     0x1A0 WUPEN, 0x1A4 WUPEN1 (Software Standby wake source enables)
// The core's WFI is the entry: when it sleeps and is about to wait for the next event, the mode the registers select starts.
//   Sleep                  the CPU stops, the peripherals run; any enabled interrupt ends it (the core's own WFI rule).
//                          A watchdog with its stop control set (WDTCSTPR.SLCSTP, OFS0 IWDTSTPCTL) stops counting.
//   Software Standby       the PCLK domain stops: the GPT timers, an AGT counting PCLKB and the WDT keep their counts and
//                          go on at wake-up; the RTC, an AGT on LOCO or the sub-clock and the IWDT (without stop control)
//                          run. Only an interrupt request whose WUPEN bit is set reaches the ICU. Requests of other
//                          modules that come up meanwhile (a transfer the model had already timed) are handed over at
//                          wake-up; edges of IRQ pins that are not wake sources are not seen.
//   Deep Software Standby  everything stops but the RTC and (DEEPCUT 0, LOCO or sub-clock) the AGT. A cancel source enabled
//                          in DPSIER — an IRQn-DS pin edge (ra-config.js RA_IRQ_DS), the RTC alarm or periodic request,
//                          the AGT1 / AGT3 underflow — sets its DPSIFR flag and ends the mode with an internal reset:
//                          RSTSR0.DPSRSTF, the program starts from the reset vector. With DPSBYCR.IOKEEP the pins keep
//                          the state they had until software clears the bit (R_LPM_IoKeepClear); writes to the port
//                          registers meanwhile take effect then.
// DPSBYCR, DPSIER, DPSIFR and DPSIEGR are kept across the resets the model makes itself (the deep standby cancel, the
// watchdogs, SYSRESETREQ) and start over at power-on and at a pin reset.
// FSP's comment on lpm_power_supply_t (r_lpm_api.h): with DEEPCUT 1 or 3 the low-speed on-chip oscillator and the AGT
// are not powered in Deep Software Standby, so an RTC counting LOCO and the AGT stop there.
// Simulated time passes in every mode; the entries and wake-ups go to the run log (env.lowPower, ra-lpm.js LpmLog).
import { RA_IRQ_DS, RA_IRQ_PINS, RA_LPM_WAKE_BITS, RA_LPM_CANCEL_BITS, RA_LPM_DPSIER_MASK, RA_LPM_DPSIEGR_MASK, RA_GPT_CHANNELS, RA_AGT_CHANNELS, raDsPin } from '../../ra-config.js';
import { LpmLog, lpmWakeNames, lpmCancelNames, lpmWakeLabel, lpmCancelLabel, lpmIrqLabel, lpmReason, lpmDeepDetail } from '../../ra-lpm.js';
import { AGT_EVENT } from './agt.js';
import { RTC_EVENT } from './rtc.js';
import { GPT_EVENT_BASE } from './gpt.js';

const SBYCR = 0x0c, SNZCR = 0x92, DPSBYCR = 0x400, DPSIER = 0x402, DPSIFR = 0x406, DPSIEGR = 0x40a, WUPEN = 0x1a0, WUPEN1 = 0x1a4;
const IRQ_EVENT = n => 0x001 + n; // ELC_EVENT_ICU_IRQ0..15
// An ICU event as the vector name vector_data.h gives it (ICU_IRQ1, AGT1_INT, RTC_ALARM …), for the names in the log.
function vectorOf(event) {
  if (event >= 1 && event <= 16) return 'ICU_IRQ' + (event - 1);
  for (const ch of RA_AGT_CHANNELS) if (AGT_EVENT(ch) === event) return `AGT${ch}_INT`;
  for (const ch of RA_GPT_CHANNELS) if (GPT_EVENT_BASE[ch] + 6 === event) return `GPT${ch}_COUNTER_OVERFLOW`;
  for (const [k, v] of Object.entries(RTC_EVENT)) if (v === event) return 'RTC_' + k;
  return null;
}
// The WUPEN bit of an event, and the DPSIER bit of an event that cancels Deep Software Standby.
const wakeBit = event => (event >= 1 && event <= 16 ? event - 1 : { [RTC_EVENT.ALARM]: RA_LPM_WAKE_BITS.RTCALM, [RTC_EVENT.PERIOD]: RA_LPM_WAKE_BITS.RTCPRD, [AGT_EVENT(1)]: RA_LPM_WAKE_BITS.AGT1UD, [AGT_EVENT(3)]: RA_LPM_WAKE_BITS.AGT3UD }[event] ?? null);
const cancelBit = event => ({ [RTC_EVENT.ALARM]: RA_LPM_CANCEL_BITS.RTC_ALARM, [RTC_EVENT.PERIOD]: RA_LPM_CANCEL_BITS.RTC_INTERVAL, [AGT_EVENT(1)]: RA_LPM_CANCEL_BITS.AGT1, [AGT_EVENT(3)]: RA_LPM_CANCEL_BITS.AGT3 }[event] ?? null);
const AGTMR1 = 0x09, RCR1 = 0x22, RCR4 = 0x28;
/** Whether an AGT counts LOCO or the sub-clock (AGTMR1.TCK 4 / 6): those go on in Software Standby. */
const agtLowSpeed = agt => { const tck = (agt.b[AGTMR1] >> 4) & 7; return tck === 4 || tck === 6; };

export class LowPower {
  constructor(soc) {
    this.soc = soc;
    this.log = new LpmLog(message => soc.env.lowPower?.(message));
    this.powerOn();
  }
  /** Power-on or a pin reset: the Deep Software Standby registers start over (DPSBYCR: DEEPCUT 01b). */
  powerOn() { this.dpsbycr = 0x01; this.dpsier = 0; this.dpsifr = 0; this.dpsiegr = 0; this.hold = false; this.clear(); }
  // The mode ends: an RTC stopped for it (LOCO without its supply) counts again — it is not reset, whatever ends the mode
  // (also the pin reset, which comes here through powerOn before the reset itself).
  clear() {
    for (const [dev, how] of this.frozen ?? []) if (how === 'rtc') dev.start();
    this.mode = null; this.since = 0; this.frozen = []; this.deferred = []; this.deferredNmi = []; this.viaLpm = false; this.quiet = false;
  }
  /** An MCU reset: the mode ends (the reset cancels it), the Deep Software Standby registers and the I/O hold stay. */
  reset() { this.clear(); this.log.reset(); }
  get deepcut() { return this.dpsbycr & 3; }
  get iokeep() { return (this.dpsbycr >> 6) & 1; }
  // ------------------------------------------------------------ registers (R_SYSTEM, called by the System block)
  readByte(off) {
    if (off === DPSBYCR) return this.dpsbycr;
    if (off >= DPSIER && off < DPSIER + 4) return (this.dpsier >>> (8 * (off - DPSIER))) & 0xff;
    if (off >= DPSIFR && off < DPSIFR + 4) return (this.dpsifr >>> (8 * (off - DPSIFR))) & 0xff;
    if (off >= DPSIEGR && off < DPSIEGR + 3) return (this.dpsiegr >>> (8 * (off - DPSIEGR))) & 0xff;
    return null;
  }
  read(off, size) {
    if (off + size <= DPSBYCR || off > DPSIEGR + 2) return undefined;
    let v = 0;
    for (let i = 0; i < size; i++) v |= (this.readByte(off + i) ?? this.soc.system.get(off + i, 1)) << (8 * i);
    return v >>> 0;
  }
  write(off, size, value) {
    if (off <= SBYCR + 1 && off + size > SBYCR) this.viaLpm = true; // r_lpm has set the mode (SBYCR is written by every configure)
    if (off + size <= DPSBYCR || off > DPSIEGR + 2) return;
    for (let i = 0; i < size; i++) this.writeByte(off + i, (value >>> (8 * i)) & 0xff);
  }
  writeByte(off, b) {
    const lane = (word, base, mask) => { const sh = 8 * (off - base); return (((word & ~(0xff << sh)) | (b << sh)) & mask) >>> 0; };
    if (off === DPSBYCR) {
      this.dpsbycr = b & 0xc3;
      // IOKEEP cleared: the pins take what the port registers say now.
      if (this.hold && !(b & 0x40)) { this.hold = false; this.soc.ports.publishAll(); }
    } else if (off >= DPSIER && off < DPSIER + 4) {
      this.dpsier = lane(this.dpsier, DPSIER, RA_LPM_DPSIER_MASK);
      // A cancel source is listened to from now on: the RTC and the AGT plan their requests again.
      this.soc.rtc?.plan(); for (const ch of [1, 3]) this.soc.agts?.[ch]?.plan();
    } else if (off >= DPSIFR && off < DPSIFR + 4) {
      const sh = 8 * (off - DPSIFR); this.dpsifr = (this.dpsifr & ~((~b & 0xff) << sh)) >>> 0; // writing 0 clears a flag, 1 leaves it
    } else if (off >= DPSIEGR && off < DPSIEGR + 3) this.dpsiegr = lane(this.dpsiegr, DPSIEGR, RA_LPM_DPSIEGR_MASK);
  }
  wupen() { const icu = this.soc.icu; return [icu.get(WUPEN, 4), icu.get(WUPEN1, 4)]; }
  // ------------------------------------------------------------ events
  /** Whether a model should time `event` although no IELSR slot links it: an enabled Deep Software Standby cancel source. */
  listens(event) { const bit = cancelBit(event); return bit != null && !!((this.dpsier >>> bit) & 1); }
  /** A peripheral's event request: false when the mode keeps it from the ICU. */
  event(event) {
    const bit = cancelBit(event);
    if (bit != null && (this.dpsier >>> bit) & 1) { this.dpsifr = (this.dpsifr | (1 << bit)) >>> 0; if (this.mode === 'DEEP') { this.cancel(lpmCancelLabel(Object.keys(RA_LPM_CANCEL_BITS).find(k => RA_LPM_CANCEL_BITS[k] === bit && !/^IRQ/.test(k)))); return false; } }
    if (this.mode === 'DEEP') return false;
    if (this.mode === 'STANDBY') {
      const w = wakeBit(event), [lo, hi] = this.wupen();
      if (w != null && (w < 32 ? (lo >>> w) & 1 : (hi >>> (w - 32)) & 1)) return true;
      // Not a wake source: an IRQ pin edge is not seen; another module's request waits for the clocks.
      if (!(event >= 1 && event <= 16) && !this.deferred.includes(event)) this.deferred.push(event);
      return false;
    }
    return true;
  }
  /** A watchdog's NMI request (0 IWDT, 1 WDT): in Software Standby only the IWDT with its WUPEN bit ends the mode. */
  nmi(bit) {
    if (this.mode === 'DEEP') return false;
    if (this.mode === 'STANDBY' && !(bit === 0 && (this.wupen()[0] >>> RA_LPM_WAKE_BITS.IWDT) & 1)) { if (!this.deferredNmi.includes(bit)) this.deferredNmi.push(bit); return false; }
    return true;
  }
  /** An input pin changed level: an IRQn-DS pin with its DPSIER bit and the edge DPSIEGR selects requests the cancel. */
  pinEdge(pin, level) {
    if (!RA_IRQ_DS.includes(pin)) return;
    const ch = RA_IRQ_PINS[pin];
    if (!((this.dpsier >>> ch) & 1) || level !== ((this.dpsiegr >>> ch) & 1)) return;
    this.dpsifr = (this.dpsifr | (1 << ch)) >>> 0;
    if (this.mode === 'DEEP') this.cancel(lpmCancelLabel('IRQ' + ch));
  }
  // ------------------------------------------------------------ entry
  /** The core sleeps in WFI and waits for the next event: the mode SBYCR / DPSBYCR select begins. */
  enter() {
    const soc = this.soc, ssby = (soc.system.get(SBYCR, 2) >> 15) & 1;
    const mode = !ssby ? 'SLEEP' : this.dpsbycr & 0x80 ? 'DEEP' : 'STANDBY';
    this.mode = mode; this.since = soc.nowUs(); this.frozen = []; this.deferred = []; this.deferredNmi = [];
    this.freeze(mode);
    // A bare WFI in a program that never set a mode (no r_lpm) is the core's sleep as before: not a log entry.
    this.quiet = mode === 'SLEEP' && !this.viaLpm;
    if (this.quiet) return;
    if (mode === 'STANDBY' && soc.system.get(SNZCR, 1) & 0x80) soc.env.warn?.('[LPM] Snooze 모드는 에뮬레이터 모델에 없습니다 — Software Standby로 동작하고 스누즈 요청은 오지 않습니다.');
    const now = this.since, check = this.sources(mode);
    this.log.enter(mode, now, { sources: check.labels, detail: mode === 'DEEP' ? lpmDeepDetail(this.deepcut, this.iokeep) : '' });
    if (!check.ok) this.log.stuck(mode, check.reasons);
  }
  freeze(mode) {
    const soc = this.soc, stop = (dev, how) => this.frozen.push([dev, how]);
    const watchdog = (w, always) => { if ((always || w.cstpr & 0x80) && w.freeze()) stop(w, 'watchdog'); };
    watchdog(soc.wdt, mode !== 'SLEEP'); watchdog(soc.iwdt, mode === 'DEEP');
    if (mode === 'SLEEP') return;
    // The core's own timer counts the system clock, which stops: SysTick keeps its count and cannot end the mode.
    const scs = soc.machine.scs; if (scs && scs.stCtrl & 1) { scs.stCtrl &= ~1; stop(scs, 'systick'); }
    for (const t of Object.values(soc.gpts)) if (t.running) { t.stop(); stop(t, 'timer'); }
    for (const t of Object.values(soc.agts)) if (t.running && !(agtLowSpeed(t) && (mode === 'STANDBY' || this.deepcut === 0))) { t.stop(); stop(t, 'timer'); }
    // Deep Software Standby without the LOCO supply: an RTC that counts LOCO (RCR4.RCKSEL 1) stops.
    if (mode === 'DEEP' && this.deepcut !== 0 && soc.rtc.running && soc.rtc.b[RCR4] & 1) { soc.rtc.stop(); stop(soc.rtc, 'rtc'); }
  }
  thaw() {
    for (const [dev, how] of this.frozen) { if (how === 'watchdog') dev.thaw(); else if (how === 'systick') dev.stCtrl |= 1; else dev.start(); }
    this.frozen = [];
  }
  has(dev) { return this.frozen.some(([d]) => d === dev); }
  /** The configured sources of a mode as the log names them, and whether at least one can end it now (else why not). */
  sources(mode) {
    const soc = this.soc, nvic = soc.machine.nvic, icu = soc.icu, rtc = soc.rtc, labels = [], reasons = []; let ok = false;
    const irqOn = event => { for (let n = 0; n < 96; n++) if ((icu.ielsr(n) & 0x1ff) === event && nvic.isEnabled?.(n)) return true; return false; };
    const say = (label, why) => { if (why) reasons.push(lpmReason(label, why)); else ok = true; };
    const rtcRequest = bit => rtc.running && rtc.b[RCR1] & bit && (bit !== 4 || (rtc.b[RCR1] >> 4) >= 6);
    const agtWhy = (ch, needIrq) => { const t = soc.agts[ch]; return this.has(t) ? 'STOPPED' : !t.running ? 'IDLE' : needIrq && !irqOn(AGT_EVENT(ch)) ? 'OFF' : ''; };
    if (mode === 'SLEEP') {
      let any = false; for (let n = 0; n < 96 && !any; n++) any = !!nvic.isEnabled?.(n);
      if (any || soc.wdt.running || soc.iwdt.running) ok = true; else reasons.push('켜진 인터럽트가 없습니다');
      return { labels, reasons, ok };
    }
    if (mode === 'STANDBY') {
      const [lo, hi] = this.wupen();
      for (const name of lpmWakeNames(lo, hi)) {
        const label = lpmWakeLabel(name), irq = /^IRQ(\d+)$/.exec(name); labels.push(label);
        if (irq) say(label, irqOn(IRQ_EVENT(Number(irq[1]))) ? '' : 'OFF');
        else if (name === 'RTCALM') say(label, irqOn(RTC_EVENT.ALARM) && rtcRequest(1) ? '' : 'OFF');
        else if (name === 'RTCPRD') say(label, irqOn(RTC_EVENT.PERIOD) && rtcRequest(4) ? '' : 'OFF');
        else if (name === 'AGT1UD' || name === 'AGT3UD') say(label, agtWhy(Number(name[3]), true));
        else if (name === 'IWDT') say(label, soc.iwdt.running ? '' : 'IDLE');
        else say(label, 'UNMODELLED');
      }
      if (soc.iwdt.running) ok = true; // its reset ends the mode too
      if (!labels.length) reasons.push('설정된 소스가 없습니다');
      return { labels, reasons, ok };
    }
    for (const name of lpmCancelNames(this.dpsier)) {
      const label = lpmCancelLabel(name), irq = /^IRQ(\d+)$/.exec(name); labels.push(label);
      if (irq) say(label, raDsPin(Number(irq[1])) ? '' : 'NO_PIN');
      else if (name === 'RTC_ALARM') say(label, this.has(rtc) ? 'STOPPED' : rtcRequest(1) ? '' : 'OFF');
      else if (name === 'RTC_INTERVAL') say(label, this.has(rtc) ? 'STOPPED' : rtcRequest(4) ? '' : 'OFF');
      else if (name === 'AGT1' || name === 'AGT3') say(label, agtWhy(Number(name[3]), false));
      else say(label, 'UNMODELLED');
    }
    if (!labels.length) reasons.push('설정된 소스가 없습니다');
    return { labels, reasons, ok };
  }
  // ------------------------------------------------------------ leaving
  /** The core left WFI for exception `exc`: Sleep or Software Standby ends. (In Deep Software Standby the requests of the
   *  ICU do not reach the core and SysTick is stopped; should an exception of the core itself come all the same, the
   *  program goes on without a reset, and the log says so instead of the cancel's reset.) */
  wake(exc) {
    if (!this.mode) return;
    const soc = this.soc, mode = this.mode, deferred = this.deferred, nmis = this.deferredNmi, quiet = this.quiet, since = this.since;
    this.thaw(); this.clearMode();
    if (!quiet) {
      // The interrupt by its vector name: from the project's vector table (soc.options.vectorNames, every module), else
      // from the event number for the modules known here.
      const event = exc >= 16 ? soc.icu.ielsr(exc - 16) & 0x1ff : 0, vector = (exc >= 16 && soc.options.vectorNames?.[exc - 16]) || vectorOf(event);
      const source = exc === 2 ? 'NMI' : exc === 15 ? 'SysTick' : exc >= 16 ? (vector ? lpmIrqLabel(vector) : `ELC 이벤트 0x${event.toString(16).toUpperCase().padStart(3, '0')}`) : '이벤트(WFE)';
      this.log.wake(mode, source, soc.nowUs() - since, { core: true });
    }
    // What the stopped modules asked for meanwhile reaches the ICU now.
    for (const event of deferred) soc.icu.raise(event);
    for (const bit of nmis) soc.icu.nmi(bit);
  }
  clearMode() { this.mode = null; this.deferred = []; this.deferredNmi = []; this.quiet = false; }
  /** A Deep Software Standby cancel request: the internal reset, with the I/O hold when IOKEEP is set. */
  cancel(source) {
    const soc = this.soc, since = this.since;
    // The timers and watchdogs are reset anyway; an RTC stopped for the mode counts again.
    for (const [dev, how] of this.frozen) if (how === 'rtc') dev.start();
    this.frozen = []; this.hold = !!this.iokeep;
    this.log.wake('DEEP', source, soc.nowUs() - since, { hold: this.hold });
    this.clearMode();
    soc.systemReset('DEEP_STANDBY');
  }
}
