// SDHC card model backed by a disk image (Uint8Array, 512-byte blocks).
// Used by the SDIO host (SD bus mode) and by SPI SD modules (SPI mode).
const STATE = { idle: 0, ready: 1, ident: 2, stby: 3, tran: 4, data: 5, rcv: 6, prg: 7 };

export class SdCard {
  constructor(image, { rca = 0x1234 } = {}) {
    this.image = image instanceof Uint8Array ? image : new Uint8Array(image || 8 * 1024 * 1024);
    this.blocks = Math.floor(this.image.length / 512);
    this.rcaValue = rca; this.reset(); this.stats = { reads: 0, writes: 0, commands: 0 };
  }
  reset() { this.state = 'idle'; this.app = false; this.rca = 0; this.busyPolls = 2; this.blockLen = 512; this.width = 1; this.eraseStart = 0; this.eraseEnd = 0; this.spi = { mode: false, cmd: [], out: [], read: null, write: null, crc: false, multi: false }; }
  status() { return (STATE[this.state] << 9) | (this.state === 'tran' || this.state === 'stby' ? 0x100 : 0x100) | (this.app ? 0x20 : 0); }
  cid() { return [0x03534453, 0x494d3136, 0x47805a1b, 0x3c0145ff]; }
  csd() {
    // CSD v2.0: C_SIZE = blocks/1024 - 1, READ_BL_LEN 9, TRAN_SPEED 0x32 (25 MHz).
    const cSize = Math.max(0, Math.floor(this.blocks / 1024) - 1);
    const bits = new Uint8Array(16);
    bits[0] = 0x40; bits[1] = 0x0e; bits[2] = 0x00; bits[3] = 0x32; bits[4] = 0x5b; bits[5] = 0x59; bits[6] = 0x00;
    bits[7] = (cSize >> 16) & 0x3f; bits[8] = (cSize >> 8) & 0xff; bits[9] = cSize & 0xff;
    bits[10] = 0x7f; bits[11] = 0x80; bits[12] = 0x0a; bits[13] = 0x40; bits[14] = 0x00; bits[15] = 0x01;
    return [0, 4, 8, 12].map(i => ((bits[i] << 24) | (bits[i + 1] << 16) | (bits[i + 2] << 8) | bits[i + 3]) >>> 0);
  }
  csdBytes() { const w = this.csd(), b = []; for (const v of w) b.push(v >>> 24, (v >> 16) & 255, (v >> 8) & 255, v & 255); return b; }
  cidBytes() { const w = this.cid(), b = []; for (const v of w) b.push(v >>> 24, (v >> 16) & 255, (v >> 8) & 255, v & 255); return b; }
  scr() { return Uint8Array.from([0x02, 0x35, 0x80, 0x00, 0, 0, 0, 0]); } // SD 3.0, 1+4 bit bus
  readBlock(n) { this.stats.reads++; if (n >= this.blocks) return null; return this.image.slice(n * 512, n * 512 + 512); }
  writeBlock(n, data) { this.stats.writes++; if (n >= this.blocks) return false; this.image.set(data.subarray(0, 512), n * 512); return true; }
  // SD bus command. Returns {type:'none'|'r1'|'r1b'|'r2'|'r3'|'r6'|'r7', resp:[...], data?:{dir:'read'|'write', blocks:[start,count]|bytes}}.
  command(index, arg) {
    this.stats.commands++;
    const app = this.app; this.app = false;
    const r1 = (extra = 0) => ({ type: 'r1', resp: [this.status() | extra] });
    if (app) {
      switch (index) {
        case 41: if (this.state === 'idle' || this.state === 'ready') { if (--this.busyPolls <= 0) this.state = 'ready'; } return { type: 'r3', resp: [(this.state === 'ready' ? 0x80000000 : 0) | 0x40000000 | 0x00ff8000] };
        case 6: this.width = (arg & 3) === 2 ? 4 : 1; return r1(0x20);
        case 51: return { ...r1(0x20), data: { dir: 'read', bytes: this.scr() } };
        case 13: return { ...r1(0x20), data: { dir: 'read', bytes: new Uint8Array(64) } };
        case 22: return { ...r1(0x20), data: { dir: 'read', bytes: Uint8Array.from([0, 0, 0, 0]) } };
        case 23: case 42: return r1(0x20);
      }
    }
    switch (index) {
      case 0: this.reset(); return { type: 'none', resp: [] };
      case 2: if (this.state !== 'ready') return null; this.state = 'ident'; return { type: 'r2', resp: this.cid() };
      case 3: this.state = 'stby'; this.rca = this.rcaValue; return { type: 'r6', resp: [((this.rca << 16) | 0x0500) >>> 0] };
      case 6: return { ...r1(), data: { dir: 'read', bytes: new Uint8Array(64) } };
      case 7: if ((arg >>> 16) === this.rca) { this.state = 'tran'; return { type: 'r1b', resp: [this.status()] }; } this.state = 'stby'; return { type: 'none', resp: [] };
      case 8: return { type: 'r7', resp: [arg & 0xfff] };
      case 9: return { type: 'r2', resp: this.csd() };
      case 10: return { type: 'r2', resp: this.cid() };
      case 12: this.state = 'tran'; return { type: 'r1b', resp: [this.status()] };
      case 13: return r1();
      case 16: this.blockLen = arg || 512; return r1();
      case 17: case 18: if (arg >= this.blocks) return { type: 'r1', resp: [this.status() | 0x40000000] }; this.state = 'data'; return { ...r1(), data: { dir: 'read', start: arg, count: index === 17 ? 1 : Infinity } };
      case 24: case 25: if (arg >= this.blocks) return { type: 'r1', resp: [this.status() | 0x40000000] }; this.state = 'rcv'; return { ...r1(), data: { dir: 'write', start: arg, count: index === 24 ? 1 : Infinity } };
      case 32: this.eraseStart = arg; return r1();
      case 33: this.eraseEnd = arg; return r1();
      case 38: for (let b = this.eraseStart; b <= this.eraseEnd && b < this.blocks; b++) this.image.fill(0, b * 512, b * 512 + 512); return { type: 'r1b', resp: [this.status()] };
      case 55: this.app = true; return r1(0x20);
      case 58: return { type: 'r3', resp: [0xc0ff8000] };
      case 59: return r1();
    }
    return { type: 'r1', resp: [this.status() | 0x00400000] }; // ILLEGAL_COMMAND
  }
  // ------------------------------------------------------------ SPI mode
  // One full-duplex byte exchange while CS is low.
  spiByte(value) {
    const s = this.spi;
    if (s.write && !s.out.length) return this.spiWriteByte(value);
    if (!s.cmd.length && !s.write && (value & 0xc0) === 0x40) { const b = s.out.length ? s.out.shift() : 0xff; s.out = []; s.cmd = [value]; return b; }
    if (!s.cmd.length) {
      if (s.out.length) { const b = s.out.shift(); if (!s.out.length && s.read?.more) this.queueRead(); return b; }
      return 0xff;
    }
    s.cmd.push(value);
    if (s.cmd.length < 6) return 0xff;
    const [c, a, b, cc, d] = s.cmd, cmd = c & 0x3f, arg = ((a << 24) | (b << 16) | (cc << 8) | d) >>> 0; s.cmd = [];
    const r1 = () => (this.spi.ready ? 0 : 1);
    s.out = [0xff]; // NCR
    if (cmd === 12) { s.read = null; s.out.push(0x00); return 0xff; } // stop byte + R1
    if (cmd === 0) { this.reset(); this.spi.mode = true; this.spi.out = [0xff, 0x01]; return 0xff; }
    if (this.app) {
      this.app = false;
      if (cmd === 41) { if (--this.busyPolls <= 0) { this.spi.ready = true; this.state = 'tran'; } s.out.push(r1()); return 0xff; }
      if (cmd === 13) { s.out.push(r1(), 0x00); return 0xff; }
      if (cmd === 51) { s.out.push(r1()); this.queueData(this.scr()); return 0xff; }
      if (cmd === 23) { s.out.push(r1()); return 0xff; }
    }
    switch (cmd) {
      case 1: if (--this.busyPolls <= 0) { this.spi.ready = true; this.state = 'tran'; } s.out.push(r1()); break;
      case 8: s.out.push(r1(), 0x00, 0x00, (arg >> 8) & 0x0f, arg & 0xff); break;
      case 9: s.out.push(r1()); this.queueData(Uint8Array.from(this.csdBytes())); break;
      case 10: s.out.push(r1()); this.queueData(Uint8Array.from(this.cidBytes())); break;
      case 13: s.out.push(r1(), 0x00); break;
      case 16: s.out.push(r1()); break;
      case 17: case 18: if (arg >= this.blocks) { s.out.push(0x40); break; } s.out.push(r1()); s.read = { block: arg, more: cmd === 18 }; this.queueRead(); break;
      case 24: case 25: if (arg >= this.blocks) { s.out.push(0x40); break; } s.out.push(r1()); s.write = { block: arg, multi: cmd === 25, phase: 'token', data: [] }; break;
      case 55: this.app = true; s.out.push(r1()); break;
      case 58: s.out.push(r1(), this.spi.ready ? 0xc0 : 0x40, 0xff, 0x80, 0x00); break;
      case 59: s.out.push(r1()); break;
      default: s.out.push(r1() | 0x04);
    }
    return 0xff;
  }
  queueData(bytes) { this.spi.out.push(0xff, 0xfe, ...bytes, 0xff, 0xff); }
  queueRead() {
    const s = this.spi; if (!s.read) return;
    const data = this.readBlock(s.read.block++);
    if (!data) { s.out.push(0x09); s.read = null; return; }
    this.queueData(data);
    if (!s.read.more) s.read = null;
  }
  spiWriteByte(value) {
    const w = this.spi.write;
    if (w.phase === 'token') {
      if (value === 0xfd && w.multi) { this.spi.write = null; this.spi.out.push(0x00, 0xff); return 0xff; }
      if (value === 0xfe || value === 0xfc) { w.phase = 'data'; w.data = []; }
      return 0xff;
    }
    if (w.phase === 'data') { w.data.push(value); if (w.data.length === 514) { this.writeBlock(w.block++, Uint8Array.from(w.data.slice(0, 512))); w.phase = w.multi ? 'token' : 'done'; this.spi.out.push(0x05 | 0xe0, 0x00, 0x00); if (!w.multi) this.spi.write = null; return 0xff; } return 0xff; }
    return 0xff;
  }
  deselect() { const s = this.spi; s.cmd = []; if (!s.write) { s.out = []; } }
}
