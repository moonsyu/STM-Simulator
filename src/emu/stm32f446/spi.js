import { Peripheral, bit, field } from './core.js';
import { IRQ } from './tables.js';

// SPI1..4 (RM0390 section 26): master full duplex / receive-only, 8/16-bit
// frames at PCLK/2^(BR+1), CPOL/CPHA, LSB first, hardware NSS output,
// TXE/RXNE/BSY/OVR/MODF flags, interrupts and DMA. I2S master transmit
// (SPI2/SPI3 I2SMOD) produces audio samples for a connected I2S amplifier.
const CR1 = 0x00, CR2 = 0x04, SR = 0x08, DR = 0x0c, CRCPR = 0x10, RXCRCR = 0x14, TXCRCR = 0x18, I2SCFGR = 0x1c, I2SPR = 0x20;
const APB2 = new Set(['SPI1', 'SPI4']);

function crcStep(crc, data, poly, bits) {
  const top = 1 << (bits - 1), mask = (1 << bits) - 1;
  for (let i = bits - 1; i >= 0; i--) { const b = ((data >> i) & 1) ^ ((crc & top) ? 1 : 0); crc = ((crc << 1) & mask) ^ (b ? poly : 0); }
  return crc & mask;
}

export class Spi extends Peripheral {
  constructor(soc, name) { super(soc, name); this.reset(); }
  reset() {
    super.reset();
    this.set(SR, 0x0002); this.set(CRCPR, 7); this.set(I2SPR, 2);
    this.txBuf = null; this.rxBuf = 0; this.busy = false; this.event?.cancel(); this.event = null;
    this.i2sBlock = []; this.stats = { frames: 0 };
    this.soc.afChanged?.(this.name + '_NSS');
  }
  pclk() { return APB2.has(this.name) ? this.soc.clock.pclk2 : this.soc.clock.pclk1; }
  i2s() { return !!bit(this.get(I2SCFGR), 11); }
  master() { return !!bit(this.get(CR1), 2); }
  enabled() { return this.i2s() ? !!bit(this.get(I2SCFGR), 10) : !!bit(this.get(CR1), 6); }
  bits() { return bit(this.get(CR1), 11) ? 16 : 8; }
  sckHz() { return this.pclk() / (2 << field(this.get(CR1), 3, 3)); }
  receiveOnly() { const c = this.get(CR1); return bit(c, 10) || (bit(c, 15) && !bit(c, 14)); }
  pins() { const p = r => this.soc.routedPins(`${this.name}_${r}`)[0] ?? null; return { sck: p('SCK'), mosi: p('MOSI'), miso: p('MISO'), nss: p('NSS') }; }
  afOutput(role) {
    const c = this.get(CR1);
    if (role === 'SCK') return this.master() && (this.enabled() || this.i2s()) ? { level: this.i2s() ? bit(this.get(I2SCFGR), 3) : bit(c, 1) } : null;
    if (role === 'MOSI') return this.master() && this.enabled() && !this.receiveOnly() ? { level: 1 } : null;
    if (role === 'NSS') return this.master() && bit(this.get(CR2), 2) && this.enabled() ? { level: 0 } : null;
    if (role === 'MISO') return null;
    return null;
  }
  readReg(off) {
    if (off === DR) {
      const v = this.rxBuf;
      this.clearBits(SR, 1);
      this.updateIrq(); this.dmaLines();
      if (this.receiveOnly() && this.master() && this.enabled() && !this.busy) this.startFrame(0xffff);
      return v;
    }
    if (off === SR) { this.srRead = true; return this.get(SR); }
    return this.get(off);
  }
  writeReg(off, value, mask) {
    const old = this.get(off), v = this.merge(off, value, mask);
    switch (off) {
      case DR: {
        if (this.i2s()) { this.i2sWrite(v & 0xffff); return; }
        if (!this.enabled()) { this.txBuf = v & 0xffff; this.clearBits(SR, 2); return; }
        this.txBuf = (mask === 0xff ? v & 0xff : v & 0xffff);
        this.clearBits(SR, 2);
        if (!this.busy) this.startFrame();
        break;
      }
      case SR: this.set(SR, (old & ~0x10) | (old & v & 0x10)); break; // CRCERR rc_w0
      case CR1: {
        this.set(CR1, v);
        // MODF: master with software NSS and SSI = 0.
        if (bit(v, 2) && bit(v, 9) && !bit(v, 8) && bit(v, 6)) { this.setBits(SR, 1 << 5); this.clearBits(CR1, 0x44); }
        if (bit(v, 13) && !bit(old, 13)) { this.set(TXCRCR, 0); this.set(RXCRCR, 0); }
        if (bit(v, 6) && !bit(old, 6)) {
          if (this.txBuf != null && !this.busy) this.startFrame();
          else if (this.receiveOnly() && this.master()) this.startFrame(0xffff);
        }
        if (!bit(v, 6)) { this.event?.cancel(); this.event = null; this.busy = false; this.clearBits(SR, 0x80); this.setBits(SR, 2); this.txBuf = null; }
        this.publish();
        break;
      }
      case CR2: this.set(CR2, v); this.publish(); break;
      case I2SCFGR: {
        this.set(I2SCFGR, v);
        if (bit(v, 11) && bit(v, 10) && !bit(old, 10)) this.setBits(SR, 2);
        this.publish(); break;
      }
      default: this.set(off, v);
    }
    this.updateIrq(); this.dmaLines();
  }
  publish() { for (const r of ['SCK', 'MOSI', 'NSS']) this.soc.afChanged(`${this.name}_${r}`); }
  startFrame(dummy) {
    if (!this.master() || !this.enabled()) return;
    const tx = this.txBuf != null ? this.txBuf : dummy;
    if (tx == null) return;
    this.txBuf = null;
    this.setBits(SR, 0x82); // TXE (buffer moved to shift register) + BSY
    this.busy = true;
    const bits = this.bits(), cfg = this.config(), us = bits * 1e6 / this.sckHz();
    const t0 = this.soc.nowUs();
    let rx = 0;
    const send = this.receiveOnly() ? 0xffff : tx;
    // Byte-oriented device models: 16-bit frames are exchanged MSB byte first.
    if (bits === 16) rx = ((this.exchange(send >> 8 & 0xff, cfg) << 8) | this.exchange(send & 0xff, cfg)) & 0xffff;
    else rx = this.exchange(send & 0xff, cfg);
    this.wave(t0, send, rx, bits, us, cfg);
    if (bit(this.get(CR1), 13)) { const poly = this.get(CRCPR) & 0xffff; this.set(TXCRCR, crcStep(this.get(TXCRCR), send, poly, bits)); this.set(RXCRCR, crcStep(this.get(RXCRCR), rx, poly, bits)); }
    this.updateIrq(); this.dmaLines();
    this.event = this.soc.after(us, () => {
      this.event = null; this.busy = false; this.stats.frames++;
      if (bit(this.get(SR), 0)) this.setBits(SR, 1 << 6); // OVR: data lost
      else { this.rxBuf = rx; this.setBits(SR, 1); }
      if (this.txBuf != null) this.startFrame();
      else if (this.receiveOnly() && this.enabled() && !bit(this.get(SR), 0)) this.startFrame(0xffff);
      else this.clearBits(SR, 0x80);
      this.updateIrq(); this.dmaLines();
    });
  }
  config() { const c = this.get(CR1); return { cpol: bit(c, 1), cpha: bit(c, 0), lsbFirst: !!bit(c, 7), hz: this.sckHz(), pins: this.pins() }; }
  exchange(byte, cfg) {
    let wire = byte;
    for (let i = 0; i < 8; i++) if (this.soc.signals.flip()) wire ^= 1 << i;
    let rx = this.soc.spiTransfer(this.name, cfg.pins, wire, cfg) ?? 0xff;
    for (let i = 0; i < 8; i++) if (this.soc.signals.flip()) rx ^= 1 << i;
    return rx & 0xff;
  }
  wave(t0, tx, rx, bits, us, cfg) {
    const { sck, mosi, miso, nss } = cfg.pins; if (!sck) return;
    const sig = this.soc.signals, S = sig.line(sck, cfg.cpol), half = us / bits / 2;
    S.protocol = 'spi';
    const M = mosi ? sig.line(mosi) : null, I = miso ? sig.line(miso + (mosi === miso ? ':miso' : '')) : null;
    if (M) M.protocol = 'spi'; if (I) I.protocol = 'spi';
    const start = Math.max(t0, S.end);
    for (let i = 0; i < bits; i++) {
      const k = cfg.lsbFirst ? i : bits - 1 - i, t = start + i * 2 * half;
      const setup = cfg.cpha ? t + half * 0.05 : t - half * 0.1;
      if (cfg.cpha) S.push(t, cfg.cpol ^ 1);
      M?.push(setup + (cfg.cpha ? 0 : 0), (tx >> k) & 1); I?.push(setup, (rx >> k) & 1);
      if (cfg.cpha) S.push(t + half, cfg.cpol); else { S.push(t + half, cfg.cpol ^ 1); S.push(t + 2 * half, cfg.cpol); }
    }
    S.end = start + us; if (M) M.end = S.end; if (I) I.end = S.end;
    const misoId = miso ? miso + (mosi === miso ? ':miso' : '') : null, cs = nss ?? this.soc.chipSelect?.(this.name) ?? null;
    sig.channel(this.name, this.name, 'spi', [{ id: sck, label: `SCK (${sck})`, role: 'sck' }, { id: mosi, label: `MOSI (${mosi})`, role: 'mosi' }, { id: misoId, label: `MISO (${miso})`, role: 'miso' }, { id: cs, label: `NSS (${cs?.replace('gpio:', '')})`, role: 'nss' }], { cpol: cfg.cpol, cpha: cfg.cpha, bits, lsbFirst: cfg.lsbFirst });
    sig.annotate(this.name, { t: start, protocol: 'spi', mosi: tx, miso: rx });
  }
  // ------------------------------------------------------------ I2S master TX
  i2sRate() {
    const pr = this.get(I2SPR), div = pr & 0xff, odd = bit(pr, 8), chlen = bit(this.get(I2SCFGR), 0) ? 32 : 16;
    const clk = this.soc.i2sClock?.() ?? this.soc.clock.pclk1;
    return clk / ((chlen * 2) * ((2 * div) + odd) * (bit(pr, 9) ? 8 / (chlen / 16) : 1));
  }
  i2sWrite(sample) {
    this.clearBits(SR, 2);
    this.i2sBlock.push(sample);
    const halfUs = 1e6 / this.i2sRate() / 2;
    this.busy = true;
    this.event?.cancel();
    this.event = this.soc.after(halfUs, () => {
      this.event = null; this.busy = false; this.setBits(SR, 2);
      this.toggleChannel = !this.toggleChannel; if (this.toggleChannel) this.setBits(SR, 4); else this.clearBits(SR, 4);
      if (this.i2sBlock.length >= 128) { this.soc.i2sSamples?.(this.name, this.i2sBlock, this.i2sRate()); this.i2sBlock = []; }
      this.updateIrq(); this.dmaLines();
    });
  }
  // ------------------------------------------------------------ irq / dma
  updateIrq() {
    const sr = this.get(SR), cr2 = this.get(CR2);
    const on = (bit(cr2, 7) && bit(sr, 1)) || (bit(cr2, 6) && bit(sr, 0)) || (bit(cr2, 5) && (sr & 0x160));
    this.soc.irqNumber(IRQ[this.name], this.name, !!on);
  }
  dmaLines() {
    const sr = this.get(SR), cr2 = this.get(CR2);
    this.soc.dmaLine(this.name + '_TX', !!(bit(cr2, 1) && bit(sr, 1) && this.enabled() && (this.i2s() || !this.receiveOnly())));
    this.soc.dmaLine(this.name + '_RX', !!(bit(cr2, 0) && bit(sr, 0)));
  }
}
