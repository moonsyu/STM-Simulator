import { Peripheral, bit, field } from './core.js';
import { IRQ } from './tables.js';

// SDIO host (RM0390 section 29): command path state machine with short/long
// responses and timeouts, data path with 32-word FIFO, block transfers,
// polling / interrupt / DMA (DMA2 stream 3/6 channel 4).
const POWER = 0x00, CLKCR = 0x04, ARG = 0x08, CMD = 0x0c, RESPCMD = 0x10, RESP1 = 0x14, DTIMER = 0x24, DLEN = 0x28, DCTRL = 0x2c, DCOUNT = 0x30, STA = 0x34, ICR = 0x38, MASK = 0x3c, FIFOCNT = 0x48;

export class Sdio extends Peripheral {
  constructor(soc) { super(soc, 'SDIO'); this.reset(); }
  reset() { super.reset(); this.fifo = []; this.xfer = null; this.pendingData = null; this.event?.cancel(); this.event = null; this.log = []; }
  card() { return this.soc.sdCard?.() ?? null; }
  clockHz() { const c = this.get(CLKCR); return bit(c, 10) ? 48e6 : 48e6 / (field(c, 0, 8) + 2); }
  width() { return [1, 4, 8][field(this.get(CLKCR), 11, 2)] ?? 1; }
  afOutput(role) { return role === 'CK' && field(this.get(POWER), 0, 2) === 3 ? { level: 0, value: 1.65 } : role.startsWith('D') || role === 'CMD' ? { level: 1, openDrain: false } : null; }
  readReg(off) {
    if (off >= 0x80 && off < 0x100) return this.fifoRead();
    if (off === STA) return this.status();
    if (off === FIFOCNT) return this.xfer ? Math.ceil(this.xfer.remaining / 4) : 0;
    if (off === DCOUNT) return this.xfer ? this.xfer.remaining : 0;
    return this.get(off);
  }
  status() {
    let s = this.get(STA) & 0x00c007ff;
    const x = this.xfer;
    if (x?.dir === 'read') { if (this.fifo.length) s |= (1 << 21) | (1 << 13); if (this.fifo.length >= 8) s |= 1 << 15; if (this.fifo.length >= 32) s |= 1 << 17; if (!this.fifo.length) s |= 1 << 19; }
    else if (x?.dir === 'write') { s |= (1 << 12) | (1 << 14) | (1 << 18); }
    else s |= (1 << 18) | (1 << 19);
    if (this.event && this.cmdActive) s |= 1 << 11;
    return s >>> 0;
  }
  writeReg(off, value, mask) {
    const v = this.merge(off, value, mask);
    if (off >= 0x80 && off < 0x100) { this.fifoWrite(v); return; }
    if (off === ICR) { this.set(STA, this.get(STA) & ~(v & 0x00c007ff)); this.update(); return; }
    this.set(off, v);
    if (off === CMD && bit(v, 10)) this.sendCommand(v & 0x3f, this.get(ARG), field(v, 6, 2));
    if (off === DCTRL) {
      if (bit(v, 0)) this.dataEnabled();
      else if (this.xfer && !bit(v, 0)) { /* keep running until DATAEND */ }
    }
    if (off === MASK) this.update();
  }
  sendCommand(index, arg, waitResp) {
    const card = field(this.get(POWER), 0, 2) === 3 ? this.card() : null;
    const cmdUs = 48 * 1e6 / this.clockHz() + 2;
    this.cmdActive = true;
    this.event?.cancel();
    this.event = this.soc.after(cmdUs + (waitResp ? cmdUs : 0), () => {
      this.event = null; this.cmdActive = false;
      const r = card ? card.command(index, arg) : null;
      this.log.push({ index, arg, type: r?.type ?? 'timeout' });
      if (this.log.length > 200) this.log.shift();
      if (!waitResp) { this.setBits(STA, 1 << 7); }
      else if (!r || r.type === 'none') this.setBits(STA, 1 << 2);
      else {
        const long = waitResp === 3;
        this.set(RESPCMD, long ? 0x3f : index);
        if (long) r.resp.forEach((w, i) => this.set(RESP1 + i * 4, w));
        else this.set(RESP1, r.resp[0] >>> 0);
        this.setBits(STA, r.type === 'r3' ? 1 : 1 << 6); // R3 has no CRC: CCRCFAIL
      }
      if (r?.data) { this.pendingData = { ...r.data, card }; this.dataEnabled(); }
      this.update();
    });
  }
  dataEnabled() {
    if (!this.pendingData || !bit(this.get(DCTRL), 0)) return;
    const d = this.pendingData; this.pendingData = null;
    const dir = bit(this.get(DCTRL), 1) ? 'read' : 'write', len = this.get(DLEN) & 0x1ffffff;
    const blockSize = 1 << field(this.get(DCTRL), 4, 4);
    this.xfer = { dir, remaining: len, total: len, card: d.card, block: d.start ?? 0, bytes: d.bytes ?? null, offset: 0, wbuf: [], blockSize };
    this.clearBits(DCTRL, 1);
    if (dir === 'read') this.fill();
    this.update();
  }
  // Card → FIFO (read). Data arrives as fast as the FIFO drains (flow control).
  fill() {
    const x = this.xfer; if (!x || x.dir !== 'read') return;
    while (this.fifo.length < 32 && x.offset < x.total) {
      let word = 0;
      for (let i = 0; i < 4; i++) {
        let byte;
        if (x.bytes) byte = x.bytes[x.offset] ?? 0;
        else { if (!x.buf || x.bufPos >= 512) { x.buf = x.card.readBlock(x.block++); x.bufPos = 0; if (!x.buf) { this.setBits(STA, 1 << 3); this.xfer = null; this.update(); return; } } byte = x.buf[x.bufPos++]; }
        word |= byte << (8 * i); x.offset++;
      }
      this.fifo.push(word >>> 0);
      if (x.offset % x.blockSize === 0) this.setBits(STA, 1 << 10);
    }
    if (x.offset >= x.total) { this.setBits(STA, 1 << 8); }
  }
  fifoRead() {
    const v = this.fifo.shift() ?? 0;
    if (this.xfer?.dir === 'read') { this.xfer.remaining = Math.max(0, this.xfer.remaining - 4); this.fill(); if (!this.fifo.length && this.xfer.offset >= this.xfer.total) this.finishRead(); }
    this.update();
    return v;
  }
  finishRead() { const card = this.xfer.card; this.xfer = null; if (card.state === 'data') card.state = 'tran'; }
  fifoWrite(v) {
    const x = this.xfer; if (!x || x.dir !== 'write') return;
    for (let i = 0; i < 4; i++) x.wbuf.push((v >>> (8 * i)) & 0xff);
    x.remaining = Math.max(0, x.remaining - 4);
    if (x.wbuf.length >= 512) { x.card.writeBlock(x.block++, Uint8Array.from(x.wbuf.splice(0, 512))); this.setBits(STA, 1 << 10); }
    if (x.remaining === 0) { this.setBits(STA, 1 << 8); if (x.card.state === 'rcv') x.card.state = 'tran'; this.xfer = null; }
    this.update();
  }
  update() {
    const sta = this.status(), m = this.get(MASK);
    this.soc.irqNumber(IRQ.SDIO, 'SDIO', !!(sta & m));
    const dma = bit(this.get(DCTRL), 3);
    this.soc.dmaLine('SDIO', !!(dma && this.xfer && (this.xfer.dir === 'write' ? this.xfer.remaining > 0 : this.fifo.length > 0)));
  }
}
