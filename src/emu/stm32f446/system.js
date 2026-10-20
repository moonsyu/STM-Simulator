import { Peripheral, bit, field } from './core.js';
import { IRQ } from './tables.js';

// FLASH interface registers (RM0390 3.8). Program/erase of the main array is not modeled.
export class FlashInterface extends Peripheral {
  constructor(soc) { super(soc, 'FLASH'); this.reset(); }
  reset() { super.reset(); this.set(0x10, 0x80000000); this.set(0x14, 0x0fffaaed); this.keys = []; this.optKeys = []; }
  writeReg(off, value, mask) {
    const v = this.merge(off, value, mask);
    if (off === 0x00) { this.set(0, v & 0x1f0f & ~0x1800); return; } // ACR: ICRST/DCRST self-clear
    if (off === 0x04) { this.keys.push(v); this.keys = this.keys.slice(-2); if (this.keys[0] === 0x45670123 && this.keys[1] === 0xcdef89ab) this.clearBits(0x10, 0x80000000); return; }
    if (off === 0x08) { this.optKeys.push(v); this.optKeys = this.optKeys.slice(-2); if (this.optKeys[0] === 0x08192a3b && this.optKeys[1] === 0x4c5d6e7f) this.clearBits(0x14, 1); return; }
    if (off === 0x0c) { this.set(0x0c, this.get(0x0c) & ~(v & 0xf3)); return; } // SR: write 1 to clear
    if (off === 0x10) { if (this.get(0x10) & 0x80000000) return; this.set(0x10, v & ~0x10000); if (bit(v, 16)) this.soc.after(10, () => this.setBits(0x0c, 1)); return; }
    if (off === 0x14) { if (this.get(0x14) & 1 && !bit(v, 1)) { this.set(0x14, (this.get(0x14) & 1) | (v & ~3)); return; } this.set(0x14, v & ~2); return; }
    this.set(off, v);
  }
  get latency() { return this.get(0) & 0xf; }
}

// PWR (RM0390 5.4): VOS, backup access, over-drive ready handshake.
export class Pwr extends Peripheral {
  constructor(soc) { super(soc, 'PWR'); this.reset(); }
  reset() { super.reset(); this.set(0x00, 0x0000c000); this.set(0x04, 0x00004000); }
  writeReg(off, value, mask) {
    const v = this.merge(off, value, mask);
    if (off === 0x00) {
      const old = this.get(0);
      if (bit(v, 2)) this.clearBits(0x04, 1);
      if (bit(v, 3)) this.clearBits(0x04, 2);
      this.set(0, v & ~0xc);
      if (bit(v, 16) !== bit(old, 16)) {
        if (bit(v, 16)) this.soc.after(20, () => { if (bit(this.get(0), 16)) this.setBits(0x04, 1 << 16); });
        else this.clearBits(0x04, (1 << 16) | (1 << 17));
      }
      if (bit(v, 17) !== bit(old, 17)) {
        if (bit(v, 17)) this.soc.after(20, () => { if (bit(this.get(0), 17) && bit(this.get(0x04), 16)) this.setBits(0x04, 1 << 17); });
        else this.clearBits(0x04, 1 << 17);
      }
      return;
    }
    if (off === 0x04) { this.set(4, (this.get(4) & ~0x300) | (v & 0x300) | (bit(v, 9) ? 0 : 0)); return; }
    this.set(off, v);
  }
  get backupAccess() { return !!bit(this.get(0), 8); }
}

// SYSCFG: memory remap, EXTI port selection, compensation cell.
export class Syscfg extends Peripheral {
  constructor(soc) { super(soc, 'SYSCFG'); this.reset(); }
  writeReg(off, value, mask) {
    const v = this.merge(off, value, mask);
    if (off === 0x20) { this.set(off, (v & 1) | (bit(v, 0) ? 0x100 : 0)); return; }
    this.set(off, v);
    if (off >= 0x08 && off <= 0x14) this.soc.exti?.routingChanged();
  }
  readReg(off) { return this.get(off); }
  // Port index (0=A) routed to EXTI line n.
  extiPort(n) { return field(this.get(0x08 + (n >> 2) * 4), (n & 3) * 4, 4); }
}

const EXTI_IRQ = n => n < 5 ? IRQ['EXTI' + n] : n < 10 ? IRQ.EXTI9_5 : n < 16 ? IRQ.EXTI15_10 : { 16: IRQ.PVD, 17: IRQ.RTC_Alarm, 18: IRQ.OTG_FS_WKUP, 21: IRQ.TAMP_STAMP, 22: IRQ.RTC_WKUP }[n];

// EXTI controller (RM0390 10.3): edge detection on GPIO lines selected by SYSCFG.
export class Exti extends Peripheral {
  constructor(soc) { super(soc, 'EXTI'); this.levels = new Array(23).fill(0); this.log = []; this.reset(); }
  reset() { super.reset(); this.updateIrq(); }
  writeReg(off, value, mask) {
    const v = this.merge(off, value, mask) & 0x7fffff;
    if (off === 0x14) { this.set(0x14, this.get(0x14) & ~v); this.set(0x10, this.get(0x10) & ~v); this.updateIrq(); return; }
    if (off === 0x10) {
      const rising = v & ~this.get(0x10);
      this.set(0x10, v);
      const set = rising & this.get(0x00);
      if (set) { this.setBits(0x14, set); this.updateIrq(); }
      return;
    }
    this.set(off, v);
    if (off === 0x00) this.updateIrq();
  }
  // A selected input changed level at the current time.
  input(line, level, source = '') {
    const old = this.levels[line]; this.levels[line] = level;
    if (old === level) return;
    const m = 1 << line, edge = level ? this.get(0x08) & m : this.get(0x0c) & m;
    if (!edge) return;
    if (this.get(0x04) & m) this.soc.event?.();
    if (!(this.get(0x00) & m)) return;
    this.setBits(0x14, m);
    if (this.log.length < 200) this.log.push({ line, level, us: this.soc.nowUs(), source });
    this.updateIrq();
  }
  // GPIO pin (port index, number) changed. Only the port selected in EXTICR drives the line.
  gpioInput(portIndex, n, level) {
    if (this.soc.syscfg.extiPort(n) !== portIndex) return;
    this.input(n, level, `P${'ABCDEFGH'[portIndex]}${n}`);
  }
  routingChanged() {
    for (let n = 0; n < 16; n++) {
      const port = this.soc.gpio['ABCDEFGH'[this.soc.syscfg.extiPort(n)]];
      if (port) this.levels[n] = port.inputBit(n);
    }
  }
  updateIrq() {
    const active = this.get(0x14) & this.get(0x00), groups = new Map();
    for (let n = 0; n < 23; n++) { const irq = EXTI_IRQ(n); if (irq == null) continue; groups.set(irq, (groups.get(irq) || 0) | (active >> n & 1)); }
    for (const [irq, on] of groups) this.soc.irqNumber(irq, 'exti', !!on);
  }
}

// DBGMCU (0xE0042000) device identification.
export class Dbgmcu extends Peripheral {
  constructor(soc) { super(soc, 'DBGMCU', 0x10); this.reset(); }
  reset() { super.reset(); this.set(0, 0x10006421); }
  writeReg(off, value, mask) { if (off !== 0) this.set(off, this.merge(off, value, mask)); }
  frozen(name) { const apb1 = this.get(0x08), apb2 = this.get(0x0c); return ({ TIM2: bit(apb1, 0), TIM3: bit(apb1, 1), TIM4: bit(apb1, 2), TIM5: bit(apb1, 3), IWDG: bit(apb1, 12), WWDG: bit(apb1, 11), TIM1: bit(apb2, 0), TIM8: bit(apb2, 1) })[name] ?? 0; }
}

// System memory window at 0x1FFF7800: OTP (erased), unique ID, flash size, package.
export class SystemMemory {
  constructor(soc) { this.soc = soc; this.name = 'SYSTEM'; const uid = soc.options.uid ?? [0x0032003b, 0x3436510b, 0x36353233]; this.data = new Uint8Array(0x400).fill(0xff); const dv = new DataView(this.data.buffer); dv.setUint32(0x210, uid[0], true); dv.setUint32(0x214, uid[1], true); dv.setUint32(0x218, uid[2], true); dv.setUint16(0x222, 512, true); dv.setUint16(0x3f0, 0x0300, true); this.dv = dv; }
  read(offset, size) { return size === 1 ? this.data[offset] : size === 2 ? this.dv.getUint16(offset, true) : this.dv.getUint32(offset, true); }
  write() {}
}

// CRC calculation unit: CRC-32/MPEG-2 polynomial 0x04C11DB7 over 32-bit words.
export class Crc extends Peripheral {
  constructor(soc) { super(soc, 'CRC'); this.reset(); }
  reset() { super.reset(); this.set(0, 0xffffffff); }
  writeReg(off, value, mask) {
    if (off === 0x00) { let crc = this.get(0) ^ (value >>> 0); for (let i = 0; i < 32; i++) crc = crc & 0x80000000 ? ((crc << 1) ^ 0x04c11db7) >>> 0 : (crc << 1) >>> 0; this.set(0, crc); return; }
    if (off === 0x04) { this.set(4, this.merge(4, value, mask) & 0xff); return; }
    if (off === 0x08) { if (value & 1) this.set(0, 0xffffffff); return; }
  }
}

// Independent watchdog: LSI 32 kHz / prescaler, reload counter, reset on expiry.
export class Iwdg extends Peripheral {
  constructor(soc) { super(soc, 'IWDG'); this.reset(); }
  reset() { super.reset(); this.set(0x08, 0xfff); this.unlocked = false; this.running = false; this.event?.cancel(); this.event = null; }
  writeReg(off, value) {
    if (off === 0x00) {
      const key = value & 0xffff;
      if (key === 0x5555) this.unlocked = true;
      else if (key === 0xcccc) { this.running = true; this.unlocked = false; this.reload(); }
      else if (key === 0xaaaa) { this.unlocked = false; this.reload(); }
      else this.unlocked = false;
      return;
    }
    if (!this.unlocked) return;
    if (off === 0x04) { this.set(4, value & 7); this.busy(1); }
    if (off === 0x08) { this.set(8, value & 0xfff); this.busy(2); }
    if (off === 0x10) { this.set(0x10, value & 0xfff); this.busy(4); }
  }
  busy(bits) { this.setBits(0x0c, bits); this.soc.after(150, () => { this.clearBits(0x0c, bits); }); }
  periodUs() { return (this.get(0x08) + 1) * 4 * (1 << this.get(0x04)) / 32000 * 1e6; }
  reload() {
    if (!this.running) return;
    this.event?.cancel();
    this.event = this.soc.after(this.periodUs(), () => { this.event = null; if (!this.soc.dbg?.frozen('IWDG')) this.soc.systemReset('IWDG'); });
  }
}

// Window watchdog: 7-bit down counter at PCLK1/4096/2^WDGTB.
export class Wwdg extends Peripheral {
  constructor(soc) { super(soc, 'WWDG'); this.reset(); }
  reset() { super.reset(); this.set(0, 0x7f); this.set(4, 0x7f); this.base = { value: 0x7f, us: 0 }; this.events?.forEach(e => e.cancel()); this.events = []; }
  tickUs() { return 4096 * (1 << field(this.get(4), 7, 2)) / this.soc.clock.pclk1 * 1e6; }
  counter() {
    if (!bit(this.get(0), 7)) return this.get(0) & 0x7f;
    const steps = Math.floor((this.soc.nowUs() - this.base.us) / this.tickUs());
    return Math.max(0, this.base.value - steps) & 0x7f;
  }
  readReg(off) { if (off === 0) return (this.get(0) & 0x80) | this.counter(); return this.get(off); }
  writeReg(off, value, mask) {
    const v = this.merge(off, value, mask);
    if (off === 0) {
      const active = bit(this.get(0), 7) || bit(v, 7);
      if (active && bit(this.get(0), 7) && this.counter() > (this.get(4) & 0x7f)) { this.soc.systemReset('WWDG'); return; }
      this.set(0, (this.get(0) & 0x80) | (v & 0xff)); this.base = { value: v & 0x7f, us: this.soc.nowUs() }; this.schedule(); return;
    }
    if (off === 8) { this.set(8, this.get(8) & (v & 1)); this.soc.irq('WWDG', 'wwdg', false); return; }
    this.set(off, v & 0x3ff);
  }
  schedule() {
    this.events.forEach(e => e.cancel()); this.events = [];
    if (!bit(this.get(0), 7)) return;
    const value = this.base.value, t = this.tickUs();
    if (value >= 0x40) {
      if (bit(this.get(4), 9)) this.events.push(this.soc.atUs(this.base.us + (value - 0x40) * t, () => { this.setBits(8, 1); this.soc.irq('WWDG', 'wwdg', true); }));
      this.events.push(this.soc.atUs(this.base.us + (value - 0x3f) * t, () => this.soc.systemReset('WWDG')));
    } else this.soc.systemReset('WWDG');
  }
}

const bcd = n => ((Math.floor(n / 10) << 4) | (n % 10));
const unbcd = n => (n >> 4) * 10 + (n & 15);
// RTC calendar (RM0390 22): time/date counters with init mode, shadow registers and wakeup timer.
export class Rtc extends Peripheral {
  constructor(soc) { super(soc, 'RTC'); this.reset(); }
  reset() {
    super.reset();
    this.set(0x04, 0x00002101); this.set(0x0c, 0x00000007); this.set(0x10, 0x007f00ff); this.set(0x14, 0xffff);
    this.epoch = { seconds: Date.UTC(2000, 0, 1) / 1000, us: 0 };
    this.unlock = 0; this.wakeup?.cancel(); this.wakeup = null;
  }
  running() { return bit(this.soc.rcc.get(0x70), 15) && !bit(this.get(0x0c), 7); }
  seconds() { return this.epoch.seconds + (this.running() ? Math.floor((this.soc.nowUs() - this.epoch.us) / 1e6) : 0); }
  calendar() {
    const d = new Date(this.seconds() * 1000);
    const tr = (bcd(d.getUTCHours()) << 16) | (bcd(d.getUTCMinutes()) << 8) | bcd(d.getUTCSeconds());
    const wd = d.getUTCDay() || 7, dr = (bcd(d.getUTCFullYear() % 100) << 16) | (wd << 13) | (bcd(d.getUTCMonth() + 1) << 8) | bcd(d.getUTCDate());
    return { tr, dr };
  }
  readReg(off) {
    if (off === 0x00) return this.calendar().tr;
    if (off === 0x04) return this.calendar().dr;
    if (off === 0x28) { const prediv = this.get(0x10) & 0x7fff, frac = this.running() ? ((this.soc.nowUs() - this.epoch.us) % 1e6) / 1e6 : 0; return Math.floor(prediv - frac * (prediv + 1)) & 0xffff; }
    return this.get(off);
  }
  locked() { return this.unlock < 2; }
  writeReg(off, value, mask) {
    const v = this.merge(off, value, mask);
    if (off === 0x24) { const k = v & 0xff; this.unlock = k === 0xca ? 1 : k === 0x53 && this.unlock === 1 ? 2 : 0; return; }
    if (off >= 0x50 && off < 0xa0) { this.set(off, v); return; } // backup registers
    if (this.locked()) return;
    if (off === 0x0c) {
      let isr = this.get(0x0c);
      isr = (isr & ~0x80) | (v & 0x80); // INIT
      if (bit(v, 7)) isr |= 0x40; else isr &= ~0x40; // INITF
      isr &= ~(~v & 0x3f20); // flags: write 0 to clear (RSF, ALRAF, ALRBF, WUTF, TSF...)
      if (!bit(v, 5)) this.soc.after(30, () => this.setBits(0x0c, 0x20)); // RSF after shadow sync
      this.set(0x0c, isr);
      if (!bit(v, 7) && this.pending) { this.epoch = { seconds: this.pending, us: this.soc.nowUs() }; this.pending = null; }
      if (!(isr & 0x0100)) this.soc.exti?.input(17, 0);
      if (!(isr & 0x0400)) this.soc.exti?.input(22, 0);
      return;
    }
    if (off === 0x00 || off === 0x04) {
      if (!bit(this.get(0x0c), 6)) return;
      const cal = this.calendar(), tr = off === 0 ? v : cal.tr, dr = off === 4 ? v : cal.dr;
      const year = 2000 + unbcd(dr >> 16 & 0xff), month = unbcd(dr >> 8 & 0x1f) - 1, day = unbcd(dr & 0x3f);
      let hours = unbcd(tr >> 16 & 0x3f);
      if (bit(this.get(0x08), 6)) hours = hours % 12 + (bit(tr, 22) ? 12 : 0); // 12-hour format
      this.pending = Date.UTC(year, month, day, hours, unbcd(tr >> 8 & 0x7f), unbcd(tr & 0x7f)) / 1000;
      this.epoch = { seconds: this.pending, us: this.soc.nowUs() };
      return;
    }
    if (off === 0x08) {
      const old = this.get(0x08); this.set(0x08, v);
      if (!bit(v, 10)) this.setBits(0x0c, 0x04); else this.clearBits(0x0c, 0x04); // WUTWF
      if (bit(v, 10) !== bit(old, 10)) this.scheduleWakeup();
      return;
    }
    this.set(off, v);
  }
  scheduleWakeup() {
    this.wakeup?.cancel(); this.wakeup = null;
    if (!bit(this.get(0x08), 10)) return;
    const sel = this.get(0x08) & 7, reload = (this.get(0x14) & 0xffff) + 1;
    const hz = sel < 4 ? 32768 / (16 >> sel) : 1;
    const period = reload / hz * 1e6;
    this.wakeup = this.soc.after(period, () => { this.setBits(0x0c, 0x400); if (bit(this.get(0x08), 14)) this.soc.exti?.input(22, 1); this.scheduleWakeup(); });
  }
}
