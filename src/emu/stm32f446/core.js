// Shared building blocks for the STM32F446 peripheral models.
// Register files are word arrays; byte / half-word accesses are merged so that
// HAL's 8-bit DR accesses and bit-band read-modify-writes behave like hardware.

export const bit = (value, n) => (value >>> n) & 1;
export const field = (value, shift, width) => (value >>> shift) & ((width >= 32 ? 0xffffffff : (1 << width) - 1) >>> 0);

export class Peripheral {
  constructor(soc, name, size = 0x400) {
    this.soc = soc;
    this.name = name;
    this.size = size;
    this.r = new Uint32Array(size >> 2);
  }
  // Clock gating: an unclocked peripheral reads as 0 and ignores writes (RM0390 6.3).
  clocked() { return this.soc.rcc ? this.soc.rcc.clockEnabled(this.name) : true; }
  read(offset, size = 4) {
    this.soc.sync();
    if (!this.clocked()) return 0;
    const reg = offset & ~3, shift = (offset & 3) * 8;
    const value = this.readReg(reg, size, shift) >>> 0;
    if (size === 4) return value;
    return (value >>> shift) & (size === 1 ? 0xff : 0xffff);
  }
  write(offset, value, size = 4) {
    this.soc.sync();
    if (!this.clocked()) return;
    const reg = offset & ~3, shift = (offset & 3) * 8;
    if (size === 4) { this.writeReg(reg, value >>> 0, 0xffffffff, size); return; }
    const mask = (((size === 1 ? 0xff : 0xffff) << shift) >>> 0);
    this.writeReg(reg, ((value << shift) >>> 0) & mask, mask, size);
  }
  readReg(off) { return this.r[off >> 2]; }
  writeReg(off, value, mask) { this.r[off >> 2] = this.merge(off, value, mask); }
  merge(off, value, mask) { return ((this.r[off >> 2] & ~mask) | (value & mask)) >>> 0; }
  get(off) { return this.r[off >> 2]; }
  set(off, value) { this.r[off >> 2] = value >>> 0; }
  setBits(off, bits) { this.r[off >> 2] = (this.r[off >> 2] | bits) >>> 0; }
  clearBits(off, bits) { this.r[off >> 2] = (this.r[off >> 2] & ~bits) >>> 0; }
  reset() { this.r.fill(0); }
}

// Binary heap of timed callbacks keyed by absolute core cycle.
export class Scheduler {
  constructor() { this.heap = []; this.seq = 0; }
  get size() { return this.heap.length; }
  at(cycle, fn, label = '') {
    const event = { at: Math.max(0, cycle), seq: this.seq++, fn, label, cancelled: false, cancel() { this.cancelled = true; } };
    const h = this.heap; h.push(event);
    let i = h.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (this.less(h[p], h[i])) break; [h[p], h[i]] = [h[i], h[p]]; i = p; }
    return event;
  }
  less(a, b) { return a.at < b.at || (a.at === b.at && a.seq < b.seq); }
  peek() {
    const h = this.heap;
    while (h.length && h[0].cancelled) this.pop();
    return h[0];
  }
  next() { return this.peek()?.at ?? Infinity; }
  pop() {
    const h = this.heap, top = h[0], last = h.pop();
    if (h.length) {
      h[0] = last; let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1; let m = i;
        if (l < h.length && this.less(h[l], h[m])) m = l;
        if (r < h.length && this.less(h[r], h[m])) m = r;
        if (m === i) break; [h[m], h[i]] = [h[i], h[m]]; i = m;
      }
    }
    return top;
  }
  // Fire every event due at or before `cycle`, in time order. Callbacks may schedule more.
  run(cycle, limit = 1e6) {
    let count = 0;
    for (;;) {
      const top = this.peek();
      if (!top || top.at > cycle) break;
      this.pop();
      if (++count > limit) throw new Error('주변장치 이벤트가 너무 많습니다.');
      top.fn(top.at);
    }
    return count;
  }
  clear() { this.heap = []; }
}

// Deterministic PRNG (mulberry32) for reproducible noise.
export function prng(seed = 1) {
  let a = seed >>> 0 || 1;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
