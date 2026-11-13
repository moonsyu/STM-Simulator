// RA6E1 RSPI (SPI0/SPI1) as a master, as FSP's r_spi drives it without DTC (registers from R7FA6E10F.h R_SPI0_Type):
//   R_SPI_Open writes SPCR (SPRIE, SPTIE, SPEIE, MSTR, SPMS), SSLP, SPBR, SPCMD0 (CPHA, CPOL, BRDV, SSLA, SSLKP, LSBF),
//   SPCR2 (SCKASE) and SPCR3 (CENDIE); R_SPI_Write/Read/WriteRead set the frame length (SPDCR SPBYT/SPLW, SPCMD0.SPB) and
//   then SPCR |= SPTIE | SPE, which requests TXI with the transmit buffer empty (SPTEF). The TXI ISR writes SPDR; the buffer
//   moves to the shift register at once when it is idle (SPTEF again: TXI for the next frame), each finished frame fills the
//   receive buffer (SPRF, RXI), and when the last frame is out with nothing buffered the communication ends (CENDF, TEI).
//   The TEI ISR checks SPSR.IDLNF = 0 and clears SPE.
// Each frame is exchanged with the SPI parts on the RSPCK/MOSI/MISO nets through soc.spiTransfer (the same devices the
// STM32 SPI model reaches, byte by byte, MSB byte first) and drawn on the logic analyzer. In SPI operation (SPMS = 0)
// SSL0 is driven active from the first frame and, with SSLKP set as r_spi does in master mode, kept until SPE is cleared.
// The frame length comes from SPCMD0.SPB alone; SPDCR (SPBYT/SPLW) only says which SPDR access width software uses.
const SPCR = 0x00, SSLP = 0x01, SPSR = 0x03, SPDR = 0x04, SPBR = 0x0a, SPCR2 = 0x0f, SPCMD0 = 0x10, SPCR3 = 0x21;
const OVRF = 0x01, IDLNF = 0x02, SPTEF = 0x20, CENDF = 0x40, SPRF = 0x80;
const SPE = 0x40, SPTIE = 0x20, SPRIE = 0x80, SPEIE = 0x10, MSTR = 0x08, TXMD = 0x02, SPMS = 0x01;
// ELC events (FSP bsp_elc.h, RA6E1): + 0 RXI, 1 TXI, 2 IDLE, 3 ERI, 4 TEI.
export const SPI_EVENT_BASE = Object.freeze({ 0: 0x1c4, 1: 0x1c9 });
const reverse = (v, bits) => { let r = 0; for (let i = 0; i < bits; i++) r |= ((v >>> i) & 1) << (bits - 1 - i); return r >>> 0; };

/** Draws one frame on the logic analyzer lines (SCK, MOSI, MISO) and names the channel, like the STM32 SPI model. */
export function spiWave(soc, name, t0, tx, rx, bits, us, cfg) {
  const { sck, mosi, miso, nss } = cfg.pins; if (!sck) return;
  const sig = soc.signals, S = sig.line(sck, cfg.cpol), half = us / bits / 2;
  S.protocol = 'spi';
  const M = mosi ? sig.line(mosi) : null, I = miso ? sig.line(miso) : null;
  if (M) M.protocol = 'spi'; if (I) I.protocol = 'spi';
  const start = Math.max(t0, S.end ?? 0);
  for (let i = 0; i < bits; i++) {
    const k = cfg.lsbFirst ? i : bits - 1 - i, t = start + i * 2 * half, setup = cfg.cpha ? t + half * 0.05 : t - half * 0.1;
    if (cfg.cpha) S.push(t, cfg.cpol ^ 1);
    M?.push(setup, (tx >>> k) & 1); I?.push(setup, (rx >>> k) & 1);
    if (cfg.cpha) S.push(t + half, cfg.cpol); else { S.push(t + half, cfg.cpol ^ 1); S.push(t + 2 * half, cfg.cpol); }
  }
  S.end = start + us; if (M) M.end = S.end; if (I) I.end = S.end;
  sig.channel(name, name, 'spi', [{ id: sck, label: `SCK (${sck})`, role: 'sck' }, { id: mosi, label: `MOSI (${mosi})`, role: 'mosi' }, { id: miso, label: `MISO (${miso})`, role: 'miso' }, { id: nss ?? null, label: `NSS (${nss ?? '-'})`, role: 'nss' }], { cpol: cfg.cpol, cpha: cfg.cpha, bits, lsbFirst: cfg.lsbFirst });
  sig.annotate(name, { t: start, protocol: 'spi', mosi: tx, miso: rx });
}

/** One frame of `bits` (8/16/20/24/32) through byte-wide devices: MSB byte first on the wire, bits reversed for LSB first. */
export function exchangeFrame(soc, name, pins, value, bits, cfg) {
  const wire = cfg.lsbFirst ? reverse(value, bits) : value, bytes = Math.ceil(bits / 8);
  let rx = 0;
  for (let b = bytes - 1; b >= 0; b--) rx = (rx * 256 + ((soc.spiTransfer(name, pins, (wire >>> (b * 8)) & 0xff, cfg) ?? 0xff) & 0xff)) >>> 0;
  if (bits % 8) rx &= (2 ** bits - 1);
  return cfg.lsbFirst ? reverse(rx, bits) : rx;
}

export class Rspi {
  constructor(soc, channel) { this.soc = soc; this.channel = channel; this.name = 'SPI' + channel; this.size = 0x100; this.reset(); }
  reset() {
    this.frame?.cancel?.();
    this.r = new Uint8Array(0x40); this.r[SPSR] = SPTEF; this.r[SPBR] = 0xff; this.r[SPCMD0] = 0x0d; this.r[SPCMD0 + 1] = 0x07;
    this.tx = null; this.rxBuf = 0; this.frame = null; this.ssl = false; this.log = []; this.stats = { frames: 0 };
  }
  // ------------------------------------------------------------ settings
  spcr() { return this.r[SPCR]; }
  spcmd() { return this.r[SPCMD0] | (this.r[SPCMD0 + 1] << 8); }
  enabled() { return !!(this.spcr() & SPE); }
  master() { return !!(this.spcr() & MSTR); }
  // SPB: 0100-0111 = 8 bits, 1000-1111 = 9-16 bits, 0000 = 20, 0001 = 24, 0010/0011 = 32 (what r_spi writes for 8/16/32).
  bits() { const spb = (this.spcmd() >> 8) & 15; return spb >= 8 ? spb + 1 : spb >= 4 ? 8 : [20, 24, 32, 32][spb]; }
  hz() { return this.soc.clock.pclka / (2 * (this.r[SPBR] + 1) * 2 ** ((this.spcmd() >> 2) & 3)); }
  config() { const c = this.spcmd(); return { cpha: c & 1, cpol: (c >> 1) & 1, lsbFirst: !!(c & 0x1000), hz: this.hz(), pins: this.pins() }; }
  pins() {
    const one = role => this.soc.routedPins(`${this.name}_${role}`)[0];
    return { sck: one('RSPCK'), mosi: one('MOSI'), miso: one('MISO'), nss: this.spcr() & SPMS ? undefined : one('SSL0') };
  }
  slaveSelected() { return false; } // master only (the session asks every SPI of a peer board)
  raise(k) { this.soc.icu.raise(SPI_EVENT_BASE[this.channel] + k); }
  // The level the module drives on its pins: RSPCK idles at CPOL, SSL0 is active (SSLP) while selected; MISO is an input.
  output(role) {
    if (!this.master()) return null;
    if (role === 'RSPCK') return { level: (this.spcmd() >> 1) & 1 };
    if (role === 'MOSI') return { level: 0 };
    if (role === 'SSL0' && !(this.spcr() & SPMS)) { const active = this.r[SSLP] & 1; return { level: this.ssl ? active : active ^ 1 }; }
    return null;
  }
  selectSlave(on) { if (this.ssl === on) return; this.ssl = on; this.soc.peripheralChanged?.(this.name); }
  // ------------------------------------------------------------ registers
  read(off, size) {
    this.soc.sync();
    if (off >= SPDR && off < SPDR + 4) { this.r[SPSR] &= ~SPRF; return size === 4 ? this.rxBuf >>> 0 : size === 2 ? this.rxBuf & 0xffff : this.rxBuf & 0xff; }
    return this.peek(off, size);
  }
  peek(off, size = 1) {
    if (off >= SPDR && off < SPDR + 4) return this.rxBuf;
    const byte = o => (o === SPSR ? (this.r[SPSR] & ~IDLNF) | (this.frame ? IDLNF : 0) : this.r[o]);
    let v = 0; for (let i = size - 1; i >= 0; i--) v = v * 256 + byte(off + i);
    return v >>> 0;
  }
  write(off, v, size) {
    this.soc.sync();
    if (off >= SPDR && off < SPDR + 4) { this.writeData(size === 4 ? v >>> 0 : v & (size === 2 ? 0xffff : 0xff)); return; }
    for (let i = 0; i < size; i++) this.writeByte(off + i, (v >>> (8 * i)) & 0xff);
  }
  writeByte(off, v) {
    const old = this.r[off];
    if (off === SPSR) { this.r[SPSR] = (old & (SPTEF | SPRF)) | (old & v & ~(SPTEF | SPRF | IDLNF)); return; } // flags clear by writing 0
    this.r[off] = v;
    if (off !== SPCR) { if (off === SPCMD0 || off === SSLP) this.soc.peripheralChanged?.(this.name); return; }
    const both = SPE | SPTIE;
    if (!(v & SPE)) {
      // SPE = 0 stops the module: the buffers empty and SSL is negated.
      this.frame?.cancel?.(); this.frame = null; this.tx = null; this.r[SPSR] |= SPTEF; this.selectSlave(false);
    } else if ((v & both) === both && (old & both) !== both && (this.r[SPSR] & SPTEF)) this.raise(1); // transmit buffer empty
    if ((v ^ old) & (SPE | MSTR | SPMS)) this.soc.peripheralChanged?.(this.name);
  }
  writeData(value) {
    if (!this.enabled() || !this.master()) return;
    const bits = this.bits();
    this.tx = bits >= 32 ? value >>> 0 : value & (2 ** bits - 1);
    this.r[SPSR] &= ~SPTEF;
    if (!this.frame) this.startFrame();
  }
  // ------------------------------------------------------------ transfer
  startFrame() {
    const send = this.tx; this.tx = null;
    this.r[SPSR] = (this.r[SPSR] | SPTEF) & ~CENDF;
    if (!(this.spcr() & SPMS)) this.selectSlave(true);
    if (this.spcr() & SPTIE) this.raise(1); // the buffer moved to the shift register: TXI for the next frame
    const bits = this.bits(), cfg = this.config(), us = bits * 1e6 / cfg.hz, t0 = this.soc.nowUs();
    const rx = exchangeFrame(this.soc, this.name, cfg.pins, send, bits, cfg);
    spiWave(this.soc, this.name, t0, send, rx, bits, us, cfg);
    this.log.push({ us: t0, tx: send, rx, bits });
    this.frame = this.soc.after(us, () => this.endFrame(rx));
  }
  endFrame(rx) {
    this.frame = null; this.stats.frames++;
    const spcr = this.spcr();
    if (!(spcr & TXMD)) {
      if (this.r[SPSR] & SPRF) { this.r[SPSR] |= OVRF; if (spcr & SPEIE) this.raise(3); }
      else { this.rxBuf = rx; this.r[SPSR] |= SPRF; if (spcr & SPRIE) this.raise(0); }
    }
    if (this.tx != null) { this.startFrame(); return; }
    // Communication end: nothing left in the transmit buffer.
    this.r[SPSR] |= CENDF;
    if (this.r[SPCR3] & 0x10) this.raise(4);
    if (this.r[SPCR2] & 0x04) this.raise(2);
    if (!(this.spcmd() & 0x80)) this.selectSlave(false); // SSLKP = 0: SSL is negated after the transfer
  }
}
