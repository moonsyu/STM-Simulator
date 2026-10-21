import { Peripheral, bit, field } from '../stm32f446/core.js';
import { DMA1_REQUESTS, DMA1_IRQ_BASE } from './tables.js';

// DMA1 of the STM32F103 (RM0008 section 13): 7 channels, each wired to fixed requests (ORed),
// P2M / M2P / M2M, normal / circular, PSIZE/MSIZE packing, GIF/TCIF/HTIF/TEIF flags per channel.
// Same service interface as the F446 model (service / remaining) so peripherals drive both alike.
class Channel {
  constructor(n) { this.n = n; this.reset(); }
  reset() { this.ccr = 0; this.cndtr = 0; this.cpar = 0; this.cmar = 0; this.active = null; }
  get enabled() { return !!(this.ccr & 1); }
  get memToMem() { return !!bit(this.ccr, 14); }
  get toPeripheral() { return !!bit(this.ccr, 4); }
  requests() { return DMA1_REQUESTS[this.n]; }
}

export class DmaF1 extends Peripheral {
  constructor(soc, name = 'DMA1') {
    super(soc, name);
    this.channels = Array.from({ length: 7 }, (_, i) => new Channel(i));
    this.isr = 0; this.stats = { transfers: 0 };
  }
  reset() { super.reset(); this.channels?.forEach(c => c.reset()); this.isr = 0; this.channels?.forEach((c, i) => this.updateIrq(i)); }
  setFlag(n, mask) { this.isr = (this.isr | (((mask | 1) & 0xf) << (n * 4))) >>> 0; this.updateIrq(n); }
  // Debugger view of the registers (channel state lives outside the word array).
  peek(off, size) { const v = this.readReg(off & ~3); return size === 4 ? v : (v >>> ((off & 3) * 8)) & (size === 1 ? 0xff : 0xffff); }
  readReg(off) {
    if (off === 0x00) return this.isr;
    if (off === 0x04) return 0;
    const n = Math.floor((off - 0x08) / 20), c = this.channels[n], r = (off - 0x08) % 20;
    if (!c) return 0;
    if (r === 0) return c.ccr;
    if (r === 4) return c.enabled && c.active ? c.active.count : c.cndtr;
    if (r === 8) return c.cpar;
    if (r === 12) return c.cmar;
    return 0;
  }
  writeReg(off, value, mask) {
    const v = ((this.readReg(off) & ~mask) | (value & mask)) >>> 0;
    if (off === 0x04) {
      // IFCR: CGIFx clears all flags of channel x.
      let clear = value & mask;
      for (let n = 0; n < 7; n++) if ((clear >> (n * 4)) & 1) clear |= 0xf << (n * 4);
      this.isr = (this.isr & ~clear) >>> 0;
      for (let n = 0; n < 7; n++) this.updateIrq(n);
      return;
    }
    if (off < 0x08) return;
    const n = Math.floor((off - 0x08) / 20), c = this.channels[n], r = (off - 0x08) % 20;
    if (!c) return;
    if (r === 0) {
      const was = c.enabled;
      c.ccr = was ? (c.ccr & ~0xf) | (v & 0xf) : v & 0x7fff; // only EN and interrupt enables change while enabled
      if (!was && c.enabled) this.start(c);
      if (was && !c.enabled) { c.cndtr = c.active?.count ?? c.cndtr; c.active = null; }
      this.updateIrq(n);
      return;
    }
    if (c.enabled) return; // CNDTR/CPAR/CMAR are locked while the channel is enabled
    if (r === 4) c.cndtr = v & 0xffff;
    else if (r === 8) c.cpar = v;
    else if (r === 12) c.cmar = v;
  }
  start(c) {
    const psize = 1 << field(c.ccr, 8, 2), msize = 1 << field(c.ccr, 10, 2);
    c.active = { count: c.cndtr, initial: c.cndtr, psize, msize, p: 0, m: 0, half: false };
    if (c.cndtr === 0) return; // stays enabled without transferring
    if (c.memToMem) this.soc.defer(() => this.memToMem(c));
    else this.soc.dmaKick();
  }
  channelFor(name) {
    for (const c of this.channels) if (c.enabled && c.active && !c.memToMem && c.requests().includes(name)) return c;
    return null;
  }
  service(name) {
    const c = this.channelFor(name);
    if (!c || c.active.count <= 0) return false;
    this.transfer(c);
    return true;
  }
  busRead(addr, size) { const b = this.soc.bus; return size === 4 ? b.read32(addr) >>> 0 : size === 2 ? b.read16(addr) : b.read8(addr); }
  busWrite(addr, value, size) { const b = this.soc.bus; if (size === 4) b.write32(addr, value | 0); else if (size === 2) b.write16(addr, value & 0xffff); else b.write8(addr, value & 0xff); }
  // One item: the source is read at its own width and written at the destination width (RM0008 table 80).
  move(c) {
    const a = c.active, pinc = bit(c.ccr, 6), minc = bit(c.ccr, 7);
    const paddr = (c.cpar + (pinc ? a.p : 0)) >>> 0, maddr = (c.cmar + (minc ? a.m : 0)) >>> 0;
    // DIR=1 reads memory (CMAR); memory-to-memory with DIR=0 reads CPAR like a peripheral-to-memory transfer.
    if (c.toPeripheral) { const value = this.busRead(maddr, a.msize); this.busWrite(paddr, value, a.psize); }
    else { const value = this.busRead(paddr, a.psize); this.busWrite(maddr, value, a.msize); }
    a.p += a.psize; a.m += a.msize; a.count--; this.stats.transfers++;
  }
  transfer(c) {
    try { this.move(c); } catch (e) {
      if (e?.constructor?.name !== 'BusFaultSignal') throw e;
      c.ccr &= ~1; c.active = null; this.setFlag(c.n, 0x8); return;
    }
    this.progress(c);
  }
  progress(c) {
    const a = c.active;
    if (!a.half && a.count <= a.initial >> 1) { a.half = true; this.setFlag(c.n, 0x4); }
    if (a.count > 0) return;
    this.setFlag(c.n, 0x2);
    if (bit(c.ccr, 5) && !c.memToMem) { a.count = a.initial; a.p = 0; a.m = 0; a.half = false; }
    else { c.cndtr = 0; c.active = null; }
  }
  memToMem(c) {
    const a = c.active; if (!a) return;
    try { while (a.count > 0) { this.move(c); if (!a.half && a.count <= a.initial >> 1) { a.half = true; this.setFlag(c.n, 0x4); } } }
    catch (e) { if (e?.constructor?.name !== 'BusFaultSignal') throw e; c.ccr &= ~1; c.active = null; this.setFlag(c.n, 0x8); return; }
    c.cndtr = 0; c.active = null; this.setFlag(c.n, 0x2);
  }
  remaining(name) { const c = this.channelFor(name); return c?.active ? c.active.count : 0; }
  updateIrq(n) {
    const c = this.channels[n]; if (!c) return;
    const f = (this.isr >>> (n * 4)) & 0xf, cr = c.ccr;
    const on = (bit(f, 1) && bit(cr, 1)) || (bit(f, 2) && bit(cr, 2)) || (bit(f, 3) && bit(cr, 3));
    this.soc.irqNumber(DMA1_IRQ_BASE + n, `dma1c${n}`, !!on);
  }
}
