import { Peripheral, bit, field } from './core.js';
import { DMA_REQUESTS, IRQ } from './tables.js';

// DMA1/DMA2 (RM0390 section 9): 8 streams x 8 channels, request mapping,
// P2M / M2P / M2M, normal / circular / double buffer, data width packing
// through a byte FIFO, HT/TC/TE/FE flags and stream interrupts.
const FLAG_SHIFT = [0, 6, 16, 22];

class Stream {
  constructor(dma, n) { this.dma = dma; this.n = n; this.reset(); }
  reset() { this.cr = 0; this.ndtr = 0; this.par = 0; this.m0ar = 0; this.m1ar = 0; this.fcr = 0x21; this.active = null; this.fifo = []; }
  get enabled() { return !!(this.cr & 1); }
  get dir() { return field(this.cr, 6, 2); }
  get chsel() { return field(this.cr, 25, 3); }
  requests() { return (DMA_REQUESTS[this.dma.name][this.n][this.chsel] || '').split(' ').filter(Boolean); }
}

export class Dma extends Peripheral {
  constructor(soc, name) {
    super(soc, name);
    this.streams = Array.from({ length: 8 }, (_, i) => new Stream(this, i));
    this.isr = [0, 0];
    this.stats = { transfers: 0 };
  }
  reset() { super.reset(); this.streams?.forEach(s => s.reset()); this.isr = [0, 0]; this.streams?.forEach((s, i) => this.updateIrq(i)); }
  flags(n) { return (this.isr[n >> 2] >>> FLAG_SHIFT[n & 3]) & 0x3d; }
  setFlag(n, mask) { this.isr[n >> 2] = (this.isr[n >> 2] | (mask << FLAG_SHIFT[n & 3])) >>> 0; this.updateIrq(n); }
  readReg(off) {
    if (off === 0x00) return this.isr[0];
    if (off === 0x04) return this.isr[1];
    if (off === 0x08 || off === 0x0c) return 0;
    const n = Math.floor((off - 0x10) / 0x18), s = this.streams[n], r = (off - 0x10) % 0x18;
    if (!s) return 0;
    switch (r) {
      case 0x00: return s.cr;
      case 0x04: return s.enabled && s.active ? s.active.count : s.ndtr;
      case 0x08: return s.par;
      case 0x0c: return s.m0ar;
      case 0x10: return s.m1ar;
      case 0x14: return (s.fcr & ~0x38) | ((s.fifo.length === 0 ? 4 : s.fifo.length >= 16 ? 5 : Math.min(3, s.fifo.length >> 2)) << 3);
    }
    return 0;
  }
  writeReg(off, value, mask) {
    const v = ((this.readReg(off) & ~mask) | (value & mask)) >>> 0;
    if (off === 0x08 || off === 0x0c) {
      const reg = off === 0x08 ? 0 : 1;
      this.isr[reg] = (this.isr[reg] & ~(value & mask)) >>> 0;
      for (let i = 0; i < 4; i++) this.updateIrq(reg * 4 + i);
      return;
    }
    if (off < 0x10) return;
    const n = Math.floor((off - 0x10) / 0x18), s = this.streams[n], r = (off - 0x10) % 0x18;
    if (!s) return;
    if (r === 0x00) {
      const was = s.enabled;
      if (was) { // only EN, CT (when DBM) and interrupt enables may change while enabled
        s.cr = (s.cr & ~0x1f) | (v & 0x1f);
        if (bit(s.cr, 18)) s.cr = (s.cr & ~(1 << 19)) | (v & (1 << 19));
      } else s.cr = v;
      if (!was && s.enabled) this.start(s);
      if (was && !s.enabled) { this.flushFifo(s); s.ndtr = s.active?.count ?? s.ndtr; s.active = null; }
      this.updateIrq(n);
      return;
    }
    if (s.enabled && r !== 0x10 && !(r === 0x0c && bit(s.cr, 18))) return; // registers locked while enabled
    if (r === 0x04) s.ndtr = v & 0xffff;
    else if (r === 0x08) s.par = v;
    else if (r === 0x0c) s.m0ar = v;
    else if (r === 0x10) s.m1ar = v;
    else if (r === 0x14) s.fcr = (s.fcr & 0x38) | (v & 0x87);
  }
  start(s) {
    const psize = 1 << field(s.cr, 11, 2), msize = 1 << field(s.cr, 13, 2);
    s.active = { count: s.ndtr, initial: s.ndtr, psize, msize, p: 0, m: 0, half: false };
    s.fifo = [];
    if (s.ndtr === 0 && s.dir !== 2) { s.cr &= ~1; this.setFlag(s.n, 0x08); return; }
    if (s.dir === 2) this.soc.defer(() => this.memToMem(s));
    else this.soc.dmaKick();
  }
  // Which enabled stream serves request `name`?
  streamFor(name) {
    for (const s of this.streams) if (s.enabled && s.active && s.dir !== 2 && s.requests().includes(name)) return s;
    const addr = this.soc.requestAddress(name);
    if (addr != null) for (const s of this.streams) if (s.enabled && s.active && s.dir !== 2 && s.par >>> 0 === addr >>> 0) return s;
    return null;
  }
  // One request: transfer a single peripheral-sized item. Returns true if work was done.
  service(name) {
    const s = this.streamFor(name);
    if (!s || !s.active || s.active.count <= 0) return false;
    this.transfer(s);
    return true;
  }
  memAddr(s) { return (bit(s.cr, 18) && bit(s.cr, 19) ? s.m1ar : s.m0ar) >>> 0; }
  busRead(addr, size) { const b = this.soc.bus; return size === 4 ? b.read32(addr) >>> 0 : size === 2 ? b.read16(addr) : b.read8(addr); }
  busWrite(addr, value, size) { const b = this.soc.bus; if (size === 4) b.write32(addr, value | 0); else if (size === 2) b.write16(addr, value & 0xffff); else b.write8(addr, value & 0xff); }
  transfer(s) {
    const a = s.active, pinc = bit(s.cr, 9), minc = bit(s.cr, 10);
    const paddr = (s.par + (pinc ? a.p : 0)) >>> 0;
    try {
      if (s.dir === 0) { // peripheral -> memory
        const value = this.busRead(paddr, a.psize);
        for (let i = 0; i < a.psize; i++) s.fifo.push((value >>> (8 * i)) & 0xff);
        while (s.fifo.length >= a.msize) {
          let v = 0; for (let i = 0; i < a.msize; i++) v |= s.fifo.shift() << (8 * i);
          this.busWrite((this.memAddr(s) + (minc ? a.m : 0)) >>> 0, v >>> 0, a.msize); a.m += a.msize;
        }
      } else { // memory -> peripheral
        while (s.fifo.length < a.psize) {
          const v = this.busRead((this.memAddr(s) + (minc ? a.m : 0)) >>> 0, a.msize); a.m += a.msize;
          for (let i = 0; i < a.msize; i++) s.fifo.push((v >>> (8 * i)) & 0xff);
        }
        let v = 0; for (let i = 0; i < a.psize; i++) v |= s.fifo.shift() << (8 * i);
        this.busWrite(paddr, v >>> 0, a.psize);
      }
    } catch (e) {
      if (e?.constructor?.name !== 'BusFaultSignal') throw e;
      s.cr &= ~1; s.active = null; this.setFlag(s.n, 0x08); return;
    }
    a.p += a.psize; a.count--; this.stats.transfers++;
    this.progress(s);
  }
  progress(s) {
    const a = s.active;
    if (!a.half && a.count <= a.initial >> 1) { a.half = true; this.setFlag(s.n, 0x10); }
    if (a.count > 0) return;
    this.flushFifo(s);
    this.setFlag(s.n, 0x20);
    const name = this.soc.requestOf?.(this, s);
    if (bit(s.cr, 8) || bit(s.cr, 18)) { // circular / double buffer: reload
      if (bit(s.cr, 18)) s.cr ^= 1 << 19;
      a.count = a.initial; a.p = 0; a.m = 0; a.half = false;
    } else { s.cr &= ~1; s.ndtr = 0; s.active = null; }
    if (name) this.soc.dmaEot?.(name);
  }
  flushFifo(s) {
    const a = s.active; if (!a || !s.fifo.length || s.dir !== 0) { s.fifo = []; return; }
    const minc = bit(s.cr, 10);
    while (s.fifo.length) { const b = s.fifo.shift(); this.busWrite((this.memAddr(s) + (minc ? a.m : 0)) >>> 0, b, 1); a.m++; }
  }
  memToMem(s) {
    const a = s.active; if (!a) return;
    const pinc = bit(s.cr, 9), minc = bit(s.cr, 10);
    try {
      while (a.count > 0) {
        const v = this.busRead((s.par + (pinc ? a.p : 0)) >>> 0, a.psize);
        for (let i = 0; i < a.psize; i++) s.fifo.push((v >>> (8 * i)) & 0xff);
        while (s.fifo.length >= a.msize) { let w = 0; for (let i = 0; i < a.msize; i++) w |= s.fifo.shift() << (8 * i); this.busWrite((s.m0ar + (minc ? a.m : 0)) >>> 0, w >>> 0, a.msize); a.m += a.msize; }
        a.p += a.psize; a.count--;
        if (!a.half && a.count <= a.initial >> 1) { a.half = true; this.setFlag(s.n, 0x10); }
      }
    } catch (e) { if (e?.constructor?.name !== 'BusFaultSignal') throw e; s.cr &= ~1; s.active = null; this.setFlag(s.n, 0x08); return; }
    this.flushFifo(s);
    s.cr &= ~1; s.ndtr = 0; s.active = null; this.setFlag(s.n, 0x20);
  }
  remaining(name) { const s = this.streamFor(name); return s?.active ? s.active.count : 0; }
  updateIrq(n) {
    const s = this.streams[n]; if (!s) return;
    const f = this.flags(n), cr = s.cr;
    const on = (bit(f, 5) && bit(cr, 4)) || (bit(f, 4) && bit(cr, 3)) || (bit(f, 3) && bit(cr, 2)) || (bit(f, 2) && bit(cr, 1)) || (bit(f, 0) && bit(s.fcr, 7));
    const irq = IRQ[`${this.name}_Stream${n}`];
    this.soc.irqNumber(irq, `${this.name}s${n}`, !!on);
  }
}
