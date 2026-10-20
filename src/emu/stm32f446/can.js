import { Peripheral, bit, field } from './core.js';
import { IRQ } from './tables.js';

// bxCAN1/2 (RM0390 section 30): init/normal/sleep handshake, 3 TX mailboxes,
// 2 RX FIFOs, identifier filters (32/16-bit, mask/list), loopback and silent
// test modes. In normal mode a frame is acknowledged only by another active
// CAN controller on the same bus (CAN1⇄CAN2 through the env hook); otherwise
// an ACK error is reported, as with the interpreter's catalog model.
const MCR = 0x00, MSR = 0x04, TSR = 0x08, RF0R = 0x0c, RF1R = 0x10, IER = 0x14, ESR = 0x18, BTR = 0x1c;

export class Can extends Peripheral {
  constructor(soc, name) { super(soc, name, 0x400); this.irqs = name === 'CAN1' ? [IRQ.CAN1_TX, IRQ.CAN1_RX0, IRQ.CAN1_RX1, IRQ.CAN1_SCE] : [IRQ.CAN2_TX, IRQ.CAN2_RX0, IRQ.CAN2_RX1, IRQ.CAN2_SCE]; this.reset(); }
  reset() {
    super.reset();
    this.set(MCR, 0x00010002); this.set(MSR, 0x00000c02); this.set(TSR, 0x1c000000); this.set(BTR, 0x01230000);
    if (this.name === 'CAN1') this.set(0x200, 0x2a1c0e01);
    this.fifos = [[], []]; this.events?.forEach(e => e.cancel()); this.events = []; this.sent = []; this.stats = { tx: 0, rx: 0, ackErrors: 0 };
  }
  filterBank() { return this.name === 'CAN1' ? this : this.soc.can1; }
  bitrate() { const btr = this.get(BTR), brp = field(btr, 0, 10) + 1, ts1 = field(btr, 16, 4) + 1, ts2 = field(btr, 20, 3) + 1; return this.soc.clock.pclk1 / (brp * (1 + ts1 + ts2)); }
  initMode() { return !!bit(this.get(MSR), 0); }
  readReg(off) {
    if (off === RF0R || off === RF1R) { const f = this.fifos[off === RF0R ? 0 : 1]; return (this.get(off) & 0x18) | Math.min(3, f.length); }
    if (off >= 0x1b0 && off < 0x1d0) { const f = this.fifos[off >= 0x1c0 ? 1 : 0][0]; if (!f) return 0; return [f.rir, f.rdtr, f.rdlr, f.rdhr][(off & 0xf) >> 2]; }
    return this.get(off);
  }
  writeReg(off, value, mask) {
    const old = this.get(off), v = this.merge(off, value, mask);
    if (off === MCR) {
      if (bit(v, 15)) { this.reset(); return; }
      this.set(MCR, v);
      const msr = this.get(MSR);
      const delay = bit(v, 0) ? 1 : 11 * 1e6 / Math.max(1000, this.bitrate()); // leaving init needs 11 recessive bits
      this.events.push(this.soc.after(delay, () => {
        let m = this.get(MSR);
        m = bit(this.get(MCR), 0) ? m | 1 : m & ~1;
        m = bit(this.get(MCR), 1) && !bit(this.get(MCR), 0) ? m | 2 : (bit(this.get(MCR), 1) ? m | 2 : m & ~2);
        this.set(MSR, m); this.update();
      }));
      void msr; return;
    }
    if (off === MSR) { this.set(MSR, old & ~(v & 0x1c)); this.update(); return; }
    if (off === TSR) {
      let t = old;
      for (let mb = 0; mb < 3; mb++) {
        if (bit(v, mb * 8)) t &= ~(0xf << (mb * 8)); // RQCP clears TXOK/ALST/TERR
        if (bit(v, mb * 8 + 7)) this.abort(mb);
      }
      this.set(TSR, t); this.update(); return;
    }
    if (off === RF0R || off === RF1R) {
      const n = off === RF0R ? 0 : 1, f = this.fifos[n];
      let r = this.get(off) & ~(v & 0x18);
      if (bit(v, 5) && f.length) { f.shift(); r &= ~8; }
      this.set(off, r); this.update(); return;
    }
    if (off === ESR) { this.set(ESR, (old & ~0x70) | (v & 0x70)); return; }
    if (off === BTR) { if (!this.initMode()) return; this.set(BTR, v); return; }
    this.set(off, v);
    if (off >= 0x180 && off < 0x1b0 && (off & 0xf) === 0 && bit(v, 0)) this.request((off - 0x180) >> 4);
    if (off === IER) this.update();
  }
  abort(mb) { this.clearBits(0x180 + mb * 0x10, 1); const t = this.get(TSR) | (1 << (26 + mb)) | (1 << (mb * 8)); this.set(TSR, t); }
  request(mb) {
    if (this.initMode()) return;
    this.clearBits(TSR, 1 << (26 + mb));
    const base = 0x180 + mb * 0x10, tir = this.get(base), tdtr = this.get(base + 4), dlc = Math.min(8, tdtr & 0xf);
    const frame = { tir, ide: bit(tir, 2), rtr: bit(tir, 1), stid: tir >>> 21, exid: (tir >>> 3) & 0x3ffff, dlc, tdlr: this.get(base + 8), tdhr: this.get(base + 12) };
    const us = (47 + 8 * dlc + (frame.ide ? 20 : 0)) * 1e6 / this.bitrate();
    this.events.push(this.soc.after(us, () => this.complete(mb, frame)));
  }
  complete(mb, frame) {
    const base = 0x180 + mb * 0x10;
    if (!bit(this.get(base), 0)) return;
    const btr = this.get(BTR), loop = bit(btr, 30), silent = bit(btr, 31);
    let acked = loop;
    if (!loop && !silent) acked = this.soc.canBus?.(this, frame) ?? false;
    if (loop) this.receive(frame);
    if (acked) {
      this.clearBits(base, 1);
      this.setBits(TSR, (0x3 << (mb * 8)) | (1 << (26 + mb)));
      this.stats.tx++; this.sent.push(frame);
      this.set(ESR, this.get(ESR) & ~0x70);
    } else {
      this.stats.ackErrors++;
      const tec = Math.min(255, field(this.get(ESR), 16, 8) + 8);
      this.set(ESR, (this.get(ESR) & 0xff00ff8f) | (3 << 4) | (tec << 16) | (tec > 95 ? 1 : 0) | (tec > 127 ? 2 : 0));
      this.setBits(MSR, 4);
      if (bit(this.get(MCR), 4)) { this.clearBits(base, 1); this.setBits(TSR, (1 << (mb * 8)) | (1 << (mb * 8 + 3)) | (1 << (26 + mb))); }
      else this.events.push(this.soc.after((47 + 8 * frame.dlc) * 1e6 / this.bitrate(), () => this.complete(mb, frame)));
    }
    this.update();
  }
  // Acceptance filtering (filter banks live in CAN1; CAN2 starts at CAN2SB).
  match(frame) {
    const fb = this.filterBank(), fmr = fb.get(0x200), start = field(fmr, 8, 6);
    const banks = this.name === 'CAN1' ? [0, start] : [start, 28];
    const id32 = ((frame.stid << 21) | (frame.exid << 3) | (frame.ide << 2) | (frame.rtr << 1)) >>> 0;
    const id16 = ((frame.stid << 5) | (frame.rtr << 4) | (frame.ide << 3) | ((frame.exid >> 15) & 7)) & 0xffff;
    let fmi = 0;
    for (let b = banks[0]; b < banks[1]; b++) {
      const active = bit(fb.get(0x21c), b), list = bit(fb.get(0x204), b), scale32 = bit(fb.get(0x20c), b), fifo = bit(fb.get(0x214), b);
      const r1 = fb.get(0x240 + b * 8), r2 = fb.get(0x244 + b * 8);
      if (scale32) {
        const n = list ? 2 : 1;
        if (active) {
          if (list ? (id32 === r1 || id32 === r2) : ((id32 & r2) >>> 0) === ((r1 & r2) >>> 0)) return { fifo, fmi: list && id32 === r2 ? fmi + 1 : fmi };
        }
        fmi += n;
      } else {
        const n = list ? 4 : 2;
        if (active) {
          const a = [r1 & 0xffff, r1 >>> 16, r2 & 0xffff, r2 >>> 16];
          if (list) { const i = a.indexOf(id16); if (i >= 0) return { fifo, fmi: fmi + i }; }
          else { if ((id16 & a[1]) === (a[0] & a[1])) return { fifo, fmi }; if ((id16 & a[3]) === (a[2] & a[3])) return { fifo, fmi: fmi + 1 }; }
        }
        fmi += n;
      }
    }
    return null;
  }
  receive(frame) {
    if (this.initMode()) return false;
    const m = this.match(frame); if (!m) return false;
    const f = this.fifos[m.fifo], reg = m.fifo ? RF1R : RF0R;
    if (f.length >= 3) { if (bit(this.get(MCR), 3)) { this.setBits(reg, 0x10); this.update(); return true; } f.pop(); this.setBits(reg, 0x10); }
    f.push({ rir: (frame.tir & ~1) >>> 0, rdtr: (frame.dlc | (m.fmi << 8)) >>> 0, rdlr: frame.tdlr, rdhr: frame.tdhr });
    if (f.length === 3) this.setBits(reg, 8);
    this.stats.rx++; this.update(); return true;
  }
  update() {
    const ier = this.get(IER), tsr = this.get(TSR), msr = this.get(MSR);
    const tx = bit(ier, 0) && (tsr & 0x10101);
    const rx0 = (bit(ier, 1) && this.fifos[0].length) || (bit(ier, 2) && bit(this.get(RF0R), 3)) || (bit(ier, 3) && bit(this.get(RF0R), 4));
    const rx1 = (bit(ier, 4) && this.fifos[1].length) || (bit(ier, 5) && bit(this.get(RF1R), 3)) || (bit(ier, 6) && bit(this.get(RF1R), 4));
    const sce = bit(ier, 15) && bit(msr, 2);
    [tx, rx0, rx1, sce].forEach((on, i) => this.soc.irqNumber(this.irqs[i], this.name + i, !!on));
  }
}
