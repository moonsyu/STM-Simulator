import { Peripheral, bit, field } from './core.js';
import { IRQ } from './tables.js';

// I2C1..3 master mode (RM0390 section 24): START/SB, address phase with
// ADDR or AF, TxE/BTF transmit pipelining, RxNE/BTF receive with ACK/POS,
// deferred STOP/RESTART after the byte in progress, interrupts and DMA (LAST).
// Devices are reached through soc.i2cBus(name) (session adapter over the
// existing transaction-level device models).
// Slave mode, for another emulated board's master: own address OAR1 with ACK set,
// ADDR/TRA, RxNE (bytes the program has not read yet wait, like a stretched clock),
// TxE (the master's read waits for the program to write DR), STOPF and AF.
const CR1 = 0x00, CR2 = 0x04, OAR1 = 0x08, DR = 0x10, SR1 = 0x14, SR2 = 0x18, CCR = 0x1c, TRISE = 0x20;

export class I2c extends Peripheral {
  constructor(soc, name) { super(soc, name); this.reset(); }
  reset() {
    super.reset();
    this.set(TRISE, 0x0002);
    this.event?.cancel(); this.event = null;
    this.state = 'idle'; this.shifting = false; this.txHold = null; this.rxShift = null;
    this.sr1Read = false; this.pendingStart = false; this.pendingStop = false; this.transmitter = false;
    this.device = null; this.prevAck = 1; this.lastAck = 1; this.t = 0; this.log = [];
    this.slaveState = null; this.held = []; this.stopSeen = false;
  }
  pclk() { return this.soc.clock.pclk1; }
  sclHz() {
    const ccr = this.get(CCR), value = ccr & 0xfff || 4;
    if (!bit(ccr, 15)) return this.pclk() / (2 * value);
    return this.pclk() / ((bit(ccr, 14) ? 25 : 3) * value);
  }
  bitUs() { return 1e6 / this.sclHz(); }
  pins() { return { scl: this.soc.routedPins(this.name + '_SCL')[0] ?? null, sda: this.soc.routedPins(this.name + '_SDA')[0] ?? null }; }
  afOutput(role) { return role === 'SCL' || role === 'SDA' ? { level: 1, openDrain: true } : null; }
  enabled() { return !!bit(this.get(CR1), 0); }
  // ------------------------------------------------------------ registers
  readReg(off) {
    if (off === SR1) { this.sr1Read = true; return this.get(SR1); }
    if (off === SR2) {
      const v = this.get(SR2);
      if (this.sr1Read && bit(this.get(SR1), 1)) { this.clearBits(SR1, 2); if (this.slaveState) this.slaveAddrCleared(); else this.addrCleared(); }
      this.sr1Read = false;
      return v;
    }
    if (off === DR) {
      const v = this.get(DR);
      this.clearBits(SR1, 1 << 6);
      if (this.sr1Read && bit(this.get(SR1), 2)) this.clearBits(SR1, 4);
      this.sr1Read = false;
      this.afterDrRead();
      this.update();
      return v;
    }
    return this.get(off);
  }
  writeReg(off, value, mask) {
    const old = this.get(off), v = this.merge(off, value, mask);
    switch (off) {
      case CR1: {
        if (bit(v, 15)) { this.reset(); this.set(CR1, 0x8000); return; }
        this.set(CR1, v);
        if (this.sr1Read && bit(this.get(SR1), 4)) { this.clearBits(SR1, 1 << 4); this.sr1Read = false; } // STOPF: SR1 read, then CR1 write
        if (!bit(v, 0)) { this.abortAll(); this.set(SR1, 0); this.set(SR2, 0); this.set(CR1, v & ~0x300); break; }
        if (bit(v, 8) && !bit(old, 8)) this.requestStart();
        if (bit(v, 9) && !bit(old, 9)) this.requestStop();
        break;
      }
      case SR1: this.set(SR1, old & (v | ~0xdf00)); break; // error flags rc_w0
      case DR: this.writeDr(v & 0xff); break;
      default: this.set(off, v);
    }
    this.update();
  }
  // ------------------------------------------------------------ sequencing
  abortAll() { this.event?.cancel(); this.event = null; this.state = 'idle'; this.shifting = false; this.txHold = null; this.rxShift = null; this.pendingStart = this.pendingStop = false; this.device?.stop?.(); this.device = null; }
  busy() { return this.shifting || !!this.event; }
  requestStart() {
    if (!this.enabled()) return;
    if (this.shifting) { this.pendingStart = true; return; }
    this.generateStart();
  }
  generateStart() {
    this.pendingStart = false;
    const repeated = this.state !== 'idle';
    if (repeated) this.device?.restart?.();
    this.device = this.soc.i2cBus(this.name, this.pins());
    this.wave('start', repeated);
    this.after(1, () => {
      this.clearBits(CR1, 1 << 8);
      this.setBits(SR1, 1); this.setBits(SR2, 3); // SB, MSL, BUSY
      this.state = 'address'; this.transmitter = false;
    });
  }
  requestStop() {
    if (this.state === 'idle') { this.clearBits(CR1, 1 << 9); return; }
    if (this.shifting) { this.pendingStop = true; return; }
    this.generateStop();
  }
  generateStop() {
    this.pendingStop = false;
    this.wave('stop');
    this.device?.stop?.(); this.device = null;
    this.after(1, () => {
      this.clearBits(CR1, 1 << 9); this.clearBits(SR2, 0x07); this.clearBits(SR1, 0x84);
      this.state = 'idle'; this.txHold = null; this.rxShift = null;
    });
  }
  after(bits, fn) {
    this.event?.cancel();
    this.event = this.soc.after(bits * this.bitUs(), () => { this.event = null; fn(); this.update(); });
  }
  writeDr(byte) {
    this.set(DR, byte);
    if (this.slaveState === 'tx') { if (this.sr1Read && bit(this.get(SR1), 2)) this.clearBits(SR1, 4); this.sr1Read = false; this.clearBits(SR1, 0x80); return; }
    const sr1 = this.get(SR1);
    if (this.state === 'address' && bit(sr1, 0)) { // SB cleared by SR1 read + DR write
      if (this.sr1Read) this.clearBits(SR1, 1);
      this.sr1Read = false;
      this.sendAddress(byte);
      return;
    }
    if (this.sr1Read && bit(sr1, 2)) this.clearBits(SR1, 4);
    this.sr1Read = false;
    if (this.state !== 'tx') return;
    if (!this.shifting && !bit(this.get(SR1), 1)) this.shiftOut(byte);
    else { this.txHold = byte; this.clearBits(SR1, 1 << 7); }
  }
  sendAddress(byte) {
    this.shifting = true;
    const read = byte & 1, addr = byte >> 1;
    const wire = this.corrupt(byte);
    const ack = !!this.device && wire >> 1 === addr && this.device.address(wire >> 1, !!(wire & 1));
    this.wave('byte', byte, ack);
    this.log.push({ us: this.soc.nowUs(), type: 'address', addr, read: !!read, ack });
    this.after(9, () => {
      this.shifting = false;
      if (!ack) { this.setBits(SR1, 1 << 10); this.state = 'nack'; this.afterByte(); return; }
      this.transmitter = !read;
      if (read) this.clearBits(SR2, 4); else this.setBits(SR2, 4);
      this.setBits(SR1, read ? 2 : 2 | 0x80);
      this.state = read ? 'rx-addr' : 'tx-addr';
      this.prevAck = bit(this.get(CR1), 10);
      this.afterByte();
    });
  }
  addrCleared() {
    if (this.state === 'tx-addr') { this.state = 'tx'; this.setBits(SR1, 0x80); if (this.txHold != null) { const b = this.txHold; this.txHold = null; this.shiftOut(b); } }
    else if (this.state === 'rx-addr') { this.state = 'rx'; this.receiveNext(); }
  }
  shiftOut(byte) {
    this.shifting = true; this.setBits(SR1, 0x80);
    const wire = this.corrupt(byte);
    const ack = this.device ? this.device.write(wire) !== false : false;
    this.wave('byte', byte, ack);
    this.after(9, () => {
      this.shifting = false;
      if (!ack) { this.setBits(SR1, 1 << 10); this.afterByte(); return; }
      if (this.txHold != null && !this.pendingStop && !this.pendingStart) { const b = this.txHold; this.txHold = null; this.shiftOut(b); }
      else if (this.txHold == null) { this.setBits(SR1, 0x84); } // TxE + BTF
      this.afterByte();
    });
  }
  receiveNext() {
    if (this.state !== 'rx' || this.shifting || this.pendingStop || this.pendingStart) return;
    this.shifting = true;
    this.readByte();
  }
  readByte() {
    let byte = this.device ? this.device.read() : 0xff;
    // A slave board stretching SCL: the byte is still in progress (a STOP waits for it); ask again a bit later,
    // and give up after a second like a stuck bus.
    if (byte == null) { this.stretch = (this.stretch ?? 0) + 1; if (this.stretch * this.bitUs() < 1e6) { this.after(1, () => this.readByte()); return; } byte = 0xff; }
    this.stretch = 0;
    byte = this.corrupt(byte);
    this.after(9, () => {
      this.shifting = false;
      const cr1 = this.get(CR1), pos = bit(cr1, 11);
      let ack = pos ? this.prevAck : bit(cr1, 10);
      if (bit(this.get(CR2), 12) && bit(this.get(CR2), 11) && this.soc.dmaRemaining(this.name + '_RX') <= 1) ack = 0; // LAST
      this.prevAck = bit(cr1, 10);
      this.lastAck = ack;
      this.wave('byte', byte, !!ack, true);
      if (!ack) this.device?.nack?.();
      if (!bit(this.get(SR1), 6)) { this.set(DR, byte); this.setBits(SR1, 1 << 6); }
      else { this.rxShift = byte; this.setBits(SR1, 1 << 2); }
      this.afterByte();
      if (ack && this.rxShift == null) this.receiveNext();
    });
  }
  afterDrRead() {
    if (this.slaveState === 'rx') { if (this.held.length) { this.set(DR, this.held.shift()); this.setBits(SR1, 1 << 6); } else if (this.stopSeen) this.slaveRxDone(); return; }
    if (this.state === 'rx' && this.rxShift != null) {
      this.set(DR, this.rxShift); this.rxShift = null; this.setBits(SR1, 1 << 6); this.clearBits(SR1, 4);
      if (this.lastAck) this.receiveNext();
    }
  }
  afterByte() {
    if (this.pendingStart) { this.clearBits(SR1, 0x84); this.generateStart(); return; }
    if (this.pendingStop) { this.generateStop(); }
  }
  // ------------------------------------------------------------ slave side (soc.i2cPeers on the master's board)
  slaveListens(addr) { return !this.slaveState && this.enabled() && !!bit(this.get(CR1), 10) && this.state === 'idle' && ((this.get(OAR1) >> 1) & 0x7f) === addr && !bit(this.get(OAR1), 15); }
  slaveAddress(read) {
    this.slaveState = read ? 'tx-addr' : 'rx-addr'; this.held = []; this.stopSeen = false;
    this.setBits(SR1, 2); this.setBits(SR2, read ? 6 : 2); if (!read) this.clearBits(SR2, 4);
    this.update(); return true;
  }
  slaveAddrCleared() {
    if (this.slaveState === 'tx-addr') { this.slaveState = 'tx'; this.setBits(SR1, 0x80); }
    else if (this.slaveState === 'rx-addr') { this.slaveState = 'rx'; if (this.held.length) { this.set(DR, this.held.shift()); this.setBits(SR1, 1 << 6); } else if (this.stopSeen) this.slaveRxDone(); }
  }
  slaveWrite(byte) {
    if (!this.slaveState?.startsWith('rx')) return false;
    if (this.slaveState === 'rx' && !bit(this.get(SR1), 6)) { this.set(DR, byte); this.setBits(SR1, 1 << 6); }
    else if (this.held.length < 256) this.held.push(byte); else return false;
    this.update(); return !!bit(this.get(CR1), 10);
  }
  // null: the program has not written DR yet; the master keeps the clock low and asks again.
  slaveRead() {
    if (this.slaveState !== 'tx' || bit(this.get(SR1), 7)) return null;
    const byte = this.get(DR); this.setBits(SR1, 0x80); this.update(); return byte;
  }
  slaveNack() { if (this.slaveState === 'tx') { this.setBits(SR1, 1 << 10); this.update(); } }
  // The master may finish before this board's program has read everything: STOPF comes once it has.
  slaveStop() {
    if (!this.slaveState) return;
    if (this.slaveState.startsWith('rx')) { this.stopSeen = true; if (this.slaveState === 'rx' && !this.held.length && !bit(this.get(SR1), 6)) this.slaveRxDone(); return; }
    this.slaveState = null; this.clearBits(SR2, 6); this.clearBits(SR1, 0x80); this.update();
  }
  slaveRxDone() { this.slaveState = null; this.stopSeen = false; this.setBits(SR1, 1 << 4); this.clearBits(SR2, 6); this.update(); }
  corrupt(byte) { let b = byte; for (let i = 0; i < 8; i++) if (this.soc.signals.flip() || this.soc.signals.glitch()) b ^= 1 << i; return b; }
  // ------------------------------------------------------------ waveforms
  wave(kind, value, ack, fromDevice) {
    const { scl, sda } = this.pins(); if (!scl || !sda) return;
    const sig = this.soc.signals, S = sig.line(scl), D = sig.line(sda), T = this.bitUs(), t0 = Math.max(this.soc.nowUs(), S.end, D.end);
    S.protocol = D.protocol = 'i2c';
    sig.channel(this.name, this.name, 'i2c', [{ id: sda, label: `SDA (${sda})`, role: 'sda' }, { id: scl, label: `SCL (${scl})`, role: 'scl' }]);
    if (kind === 'start') {
      if (value) { D.push(t0, 1); S.push(t0 + T * 0.25, 1); }
      D.push(t0 + T * 0.5, 0); S.push(t0 + T * 0.75, 0); S.end = D.end = t0 + T;
    } else if (kind === 'stop') {
      D.push(t0, 0); S.push(t0 + T * 0.25, 1); D.push(t0 + T * 0.5, 1); S.end = D.end = t0 + T;
    } else {
      let t = t0;
      for (let i = 7; i >= -1; i--) {
        const level = i >= 0 ? (value >> i) & 1 : (ack ? 0 : 1);
        D.push(t + T * 0.1, level); S.push(t + T * 0.5, 1); S.push(t + T, 0); t += T;
      }
      D.push(t + T * 0.05, fromDevice ? 1 : D.levelAt(t)); S.end = D.end = t;
      sig.annotate(this.name, { t: t0, protocol: 'i2c', value, ack });
    }
    for (const r of sig.receivers) r.poke(D);
  }
  // ------------------------------------------------------------ irq / dma
  update() {
    const sr1 = this.get(SR1), cr2 = this.get(CR2);
    const evt = bit(cr2, 9) && ((sr1 & 0x1f) || (bit(cr2, 10) && (sr1 & 0xc0)));
    const err = bit(cr2, 8) && (sr1 & 0xdf00);
    this.soc.irqNumber(IRQ[this.name + '_EV'], this.name, !!evt);
    this.soc.irqNumber(IRQ[this.name + '_ER'], this.name + 'er', !!err);
    const dma = bit(cr2, 11);
    this.soc.dmaLine(this.name + '_TX', !!(dma && this.state === 'tx' && bit(sr1, 7) && !bit(sr1, 2) && this.txHold == null));
    this.soc.dmaLine(this.name + '_RX', !!(dma && bit(sr1, 6)));
  }
}
