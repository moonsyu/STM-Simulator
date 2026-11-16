// RA6E1 RIIC (IIC0/IIC1) in master mode, as FSP r_iic_master drives it from its four interrupts:
//   R_IIC_MASTER_Write/Read → ICCR2.ST → START (ERI: STIE) and TDRE (TXI) → the ISR writes the address to ICDRT, then the
//   data bytes; the last byte's TEND (TEI, TEIE) → ICCR2.SP → STOP (ERI: SPIE) → TX_COMPLETE / RX_COMPLETE callback.
//   Receive: after the address with R/W = 1, RDRF (RXI) asks for a dummy ICDRR read, which starts each next byte; ACKBT
//   (written with ACKWP) answers the last byte with NACK; a NACK from the slave sets NACKF (ERI: NAKIE).
// Bytes reach the parts on the SDA/SCL nets through the session's I²C adapter (soc.i2cBus: the same devices the STM32
// I2C model talks to). Each byte takes nine SCL periods of the ICBRH/ICBRL/CKS setting.
//
// Slave mode, as FSP r_iic_slave drives it (ICSER.SAR0E with the own address in SARL0, ICIER = RXI | TXI after Open).
// The master is another board: its I²C adapter calls the slave interface below (the one the STM32 I2C model has:
// slaveListens / slaveAddress / slaveWrite / slaveRead / slaveNack / slaveStop), and the bus events it stands for are
// played to the registers one at a time, each when the program has taken the one before:
//   address + W → AAS0, START, RDRF with the address byte (RXI: the driver's dummy read), then RDRF per data byte
//     (RXI: RX_REQUEST callback at the first, the byte into the buffer; SCL is held while RDRF is set, ICMR3.WAIT);
//     the ACK of a byte is ICMR3.ACKBT as it stands when the byte arrives.
//   address + R → AAS0, START, TRS and TDRE (TXI: TX_REQUEST callback, ICDRT); ICDRT moves to the shift register at
//     once (TDRE again: one byte ahead), the master's ACK moves the next one, or sets TEND when there is none (TEI:
//     TX_MORE_REQUEST); its NACK sets NACKF (ERI) and, with ICDRT empty, TEND.
//   STOP (or a repeated START, which the adapter reports the same way) → STOP flag (ERI: RX_COMPLETE / TX_COMPLETE).
//   SCL held longer than the time-out (ICFER.TMOE, 2^16 reference clocks in long mode) → TMOF (ERI: ABORTED).
const ICCR1 = 0x00, ICCR2 = 0x01, ICMR1 = 0x02, ICMR2 = 0x03, ICMR3 = 0x04, ICFER = 0x05, ICSER = 0x06, ICIER = 0x07, ICSR1 = 0x08, ICSR2 = 0x09, SARL0 = 0x0a, SARU0 = 0x0b, ICBRL = 0x10, ICBRH = 0x11, ICDRT = 0x12, ICDRR = 0x13;
const TDRE = 0x80, TEND = 0x40, RDRF = 0x20, ERR_FLAGS = 0x1f, NACKF = 0x10, STOP = 0x08, START = 0x04, TMOF = 0x01;
const SLAVE_GAP_US = 10, SLAVE_FORCE_TRIES = 200, SLAVE_QUEUE = 512;
export const IIC_EVENT_BASE = Object.freeze({ 0: 0x73, 1: 0x78 }); // + 0 RXI, 1 TXI, 2 TEI, 3 ERI (bsp_elc.h)

export class Iic {
  constructor(soc, channel) { this.soc = soc; this.channel = channel; this.name = 'IIC' + channel; this.size = 0x100; this.reset(); }
  reset() {
    this.r = new Uint8Array(0x20); this.r[ICBRL] = this.r[ICBRH] = 0xff; this.r[ICMR1] = 0x08;
    this.log = []; this.internalReset();
  }
  // ICCR1.IICRST with ICE = 1: the bus state, the status flags and the shift registers start over; the settings stay.
  internalReset() {
    for (const e of [this.ev, this.condition, this.pumpEv, this.holdEv]) e?.cancel?.();
    this.r[ICSR1] = 0; this.r[ICSR2] = 0; this.r[ICCR2] = 0; this.r[ICMR3] &= ~0x04;
    this.state = 'idle'; this.device = null; this.tx = null; this.rx = 0xff; this.shifting = false; this.ev = null; this.condition = null;
    this.addressPhase = false; this.reading = false; this.dummy = false; this.pendingStop = false;
    this.slaveState = null; this.ops = []; this.pumpEv = null; this.holdEv = null; this.lastOp = -Infinity;
    this.txShift = null; this.txHold = null; this.outstanding = false;
  }
  // ------------------------------------------------------------ timing and events
  bitUs() { const ref = this.soc.clock.pclkb / 2 ** ((this.r[ICMR1] >> 4) & 7); return ((this.r[ICBRH] & 31) + (this.r[ICBRL] & 31) + 2) / ref * 1e6 + 0.24; }
  raise(k) { this.soc.raiseEvent(IIC_EVENT_BASE[this.channel] + k); }
  setStatus(bits) {
    const old = this.r[ICSR2], ier = this.r[ICIER]; this.r[ICSR2] |= bits;
    const rise = bits & ~old;
    if (rise & TDRE && ier & 0x80) this.raise(1);
    if (rise & RDRF && ier & 0x20) this.raise(0);
    if (rise & TEND && ier & 0x40) this.raise(2);
    if (rise & ERR_FLAGS & ier) this.raise(3);
  }
  clearStatus(bits) { this.r[ICSR2] &= ~bits; }
  pins() { const [scl] = this.soc.routedPins(this.name + '_SCL'), [sda] = this.soc.routedPins(this.name + '_SDA'); return { scl, sda }; }
  after(us, fn) { return this.soc.after(us, fn); }
  // ------------------------------------------------------------ bus conditions
  start(repeated) {
    this.condition?.cancel?.();
    this.condition = this.after(this.bitUs(), () => {
      this.condition = null;
      if (repeated) this.device?.restart?.();
      this.device = this.soc.i2cBus(this.name, this.pins());
      this.state = 'active'; this.addressPhase = true; this.reading = false; this.dummy = false; this.tx = null;
      this.r[ICCR2] = (this.r[ICCR2] & ~0x06) | 0xe0; // BBSY, MST, TRS
      this.clearStatus(TEND | RDRF);
      this.setStatus(START | TDRE);
      this.log.push({ us: this.soc.nowUs(), type: repeated ? 'restart' : 'start' });
    });
  }
  stop() {
    this.pendingStop = false; this.state = 'stopping';
    this.condition?.cancel?.();
    this.condition = this.after(this.bitUs(), () => {
      this.condition = null;
      this.device?.stop?.(); this.device = null;
      this.state = 'idle'; this.r[ICCR2] &= ~0xe8; // BBSY, MST, TRS, SP
      this.clearStatus(TDRE | TEND);
      this.setStatus(STOP);
      this.log.push({ us: this.soc.nowUs(), type: 'stop' });
    });
  }
  // ------------------------------------------------------------ transmit
  shiftOut() {
    if (this.shifting || this.tx == null || this.state !== 'active') return;
    const byte = this.tx; this.tx = null; this.shifting = true;
    this.setStatus(TDRE); // ICDRT → ICDRS: the next byte can be written
    this.ev = this.after(9 * this.bitUs(), () => this.sent(byte));
  }
  sent(byte) {
    this.ev = null; this.shifting = false;
    let ack;
    if (this.addressPhase) {
      this.addressPhase = false; this.reading = !!(byte & 1);
      ack = !!this.device && this.device.address(byte >> 1, this.reading) !== false;
      this.log.push({ us: this.soc.nowUs(), type: 'address', addr: byte >> 1, read: this.reading, ack });
    } else {
      ack = !!this.device && this.device.write(byte) !== false;
      this.log.push({ us: this.soc.nowUs(), type: 'write', byte, ack });
    }
    this.r[ICMR3] = (this.r[ICMR3] & ~0x04) | (ack ? 0 : 0x04); // ACKBR
    if (!ack) { this.tx = null; this.setStatus(NACKF); }
    else if (this.reading) { this.r[ICCR2] &= ~0x20; this.dummy = true; this.clearStatus(TDRE); this.setStatus(RDRF); } // receive mode: dummy read first
    else if (this.tx != null) this.shiftOut();
    else this.setStatus(TEND);
    if (this.pendingStop) this.stop();
  }
  // ------------------------------------------------------------ receive
  shiftIn() {
    if (this.shifting || this.state !== 'active') return;
    this.shifting = true;
    this.ev = this.after(9 * this.bitUs(), () => {
      this.ev = null; this.shifting = false;
      const v = this.device ? this.device.read() & 0xff : 0xff, nack = !!(this.r[ICMR3] & 0x08);
      if (nack) this.device?.nack?.();
      this.rx = v; this.log.push({ us: this.soc.nowUs(), type: 'read', byte: v, ack: !nack });
      this.setStatus(RDRF);
      if (this.pendingStop) this.stop();
    });
  }
  // ------------------------------------------------------------ slave side (the master is another board's I²C adapter)
  slaveAddressValue() { return this.r[SARL0] >> 1; }
  slaveListens(addr) {
    // A stopped module (R_IIC_SLAVE_Close ends with R_BSP_MODULE_STOP) has no clock: it does not answer its address.
    return !this.soc.iicStopped?.(this.channel) && (this.r[ICCR1] & 0xc0) === 0x80 && !!(this.r[ICSER] & 1) && !(this.r[SARU0] & 1) && this.slaveAddressValue() === addr && this.state === 'idle' && !(this.r[ICCR2] & 0x40);
  }
  /** {address, sda, scl} while this channel answers as a slave (for a master that asks once per transfer). */
  slaveInfo() { const a = this.slaveAddressValue(); if (!this.slaveListens(a)) return null; const p = this.pins(); return p.sda && p.scl ? { address: a, ...p } : null; }
  slaveBusy() { return !!this.slaveState || this.ops.length > 0; }
  /** The program has taken every byte the master sent so far (or the transfer is gone): the next byte's ACK is known. */
  slaveSettled() { return !this.ops.length && !(this.slaveState === 'rx' && this.r[ICSR2] & RDRF); }
  slaveAddress(read) { this.ops.push({ t: 'addr', read: !!read }); this.pump(); return true; }
  // The ACK of a byte is ACKBT as it stands now; a byte the slave answers with NACK is still received (RDRF).
  slaveWrite(byte) {
    if (this.slaveState !== 'rx' && !this.ops.some(o => o.t === 'addr' && !o.read)) return false;
    if (this.ops.length >= SLAVE_QUEUE) return false;
    const ack = !(this.r[ICMR3] & 0x08);
    this.ops.push({ t: 'byte', byte: byte & 0xff }); this.pump(); return ack;
  }
  // null: no byte in the shift register yet (the program has not written ICDRT) — SCL is held, the master asks again.
  slaveRead() {
    if (this.ops.length) { this.pump(); if (this.ops.length) return null; }
    if (this.slaveState !== 'tx') return 0xff;
    if (this.outstanding) { // the master took the last byte and wants another: that was its ACK
      this.outstanding = false; this.r[ICMR3] &= ~0x04; this.txShift = null;
      if (this.txHold != null) { this.txShift = this.txHold; this.txHold = null; this.setStatus(TDRE); }
      else { this.setStatus(TEND); this.holdStart(); }
    }
    if (this.txShift == null) return null;
    this.outstanding = true; this.log.push({ us: this.soc.nowUs(), type: 'slave-tx', byte: this.txShift });
    return this.txShift;
  }
  slaveNack() {
    if (this.slaveState !== 'tx' || !this.outstanding) return;
    this.outstanding = false; this.txShift = null; this.nacked = true; this.r[ICMR3] |= 0x04; this.holdEnd();
    this.setStatus(this.txHold == null ? NACKF | TEND : NACKF);
  }
  slaveStop() { if (!this.slaveBusy()) return; this.ops.push({ t: 'stop' }); this.pump(); }
  // The next bus event goes to the registers when the program has dealt with the one before it.
  pump() {
    this.pumpEv?.cancel?.(); this.pumpEv = null;
    while (this.ops.length) {
      const op = this.ops[0], s = this.r[ICSR2], ier = this.r[ICIER], forced = (op.tries ?? 0) > SLAVE_FORCE_TRIES;
      let ready, poll = true;
      if (op.t === 'addr') ready = !this.slaveState && (!(s & ier & STOP) || forced);
      else if (!this.slaveState) { this.ops.shift(); continue; } // the transfer was reset under the master (time-out)
      else if (this.slaveState === 'rx') { ready = !(s & RDRF); poll = false; } // waits for the read of ICDRR
      else ready = op.t === 'stop' ? !(s & ier & NACKF) || forced : true;
      if (ready && this.soc.nowUs() - this.lastOp < SLAVE_GAP_US) { ready = false; poll = true; }
      if (!ready) { if (poll) { op.tries = (op.tries ?? 0) + 1; this.pumpEv = this.after(SLAVE_GAP_US, () => this.pump()); } return; }
      this.ops.shift(); this.lastOp = this.soc.nowUs(); this.slaveApply(op);
    }
  }
  slaveApply(op) {
    const us = this.soc.nowUs();
    if (op.t === 'addr') {
      if ((this.r[ICCR1] & 0xc0) !== 0x80 || !(this.r[ICSER] & 1)) { this.ops = this.ops.filter(o => o.t === 'addr'); return; } // closed meanwhile
      this.r[ICSR1] |= 1; this.txShift = this.txHold = null; this.outstanding = false; this.nacked = false;
      this.log.push({ us, type: 'slave-address', addr: this.slaveAddressValue(), read: op.read });
      if (op.read) { this.slaveState = 'tx'; this.r[ICCR2] = (this.r[ICCR2] & ~0x40) | 0xa0; this.clearStatus(RDRF | TEND); this.setStatus(START); this.r[ICSR2] &= ~TDRE; this.setStatus(TDRE); }
      else { this.slaveState = 'rx'; this.r[ICCR2] = (this.r[ICCR2] & ~0x60) | 0x80; this.clearStatus(TDRE | TEND); this.setStatus(START); this.rx = this.r[SARL0] & 0xfe; this.setStatus(RDRF); }
      this.holdStart();
    } else if (op.t === 'byte') {
      this.rx = op.byte; this.log.push({ us, type: 'slave-rx', byte: op.byte }); this.setStatus(RDRF); this.holdStart();
    } else {
      this.slaveState = null; this.txShift = this.txHold = null; this.outstanding = false; this.holdEnd();
      this.r[ICCR2] &= ~0xa0; this.r[ICSR1] &= ~1; this.clearStatus(TDRE | TEND);
      this.log.push({ us, type: 'slave-stop' }); this.setStatus(STOP);
    }
  }
  // SCL held by the slave (a byte not read, or nothing to send): the time-out function counts it.
  timeoutUs() { return (this.r[ICMR2] & 1 ? 16384 : 65536) * 2 ** ((this.r[ICMR1] >> 4) & 7) / this.soc.clock.pclkb * 1e6; }
  holdStart() {
    this.holdEv?.cancel?.();
    this.holdEv = this.after(this.timeoutUs(), () => {
      this.holdEv = null; if (!this.slaveState) return;
      const held = this.slaveState === 'rx' ? !!(this.r[ICSR2] & RDRF) : this.txShift == null && !this.nacked;
      if (!held) return;
      if (this.r[ICFER] & 1) { this.log.push({ us: this.soc.nowUs(), type: 'slave-timeout' }); this.setStatus(TMOF); } else this.holdStart();
    });
  }
  holdEnd() { this.holdEv?.cancel?.(); this.holdEv = null; }
  // ------------------------------------------------------------ registers
  read(off, size) {
    this.soc.sync();
    if (size !== 1) { let v = 0; for (let i = 0; i < size; i++) v |= this.read(off + i, 1) << (8 * i); return v >>> 0; }
    if (off === ICCR1) return (this.r[ICCR1] & 0xfc) | 3; // SCLI, SDAI: lines released high
    if (off === ICDRR && (this.slaveState || this.ops.length)) {
      const v = this.rx; this.clearStatus(RDRF);
      if (this.slaveState === 'rx') { this.holdEnd(); if (this.ops.length && !this.pumpEv) this.pumpEv = this.after(SLAVE_GAP_US, () => this.pump()); }
      return v;
    }
    if (off === ICDRR) {
      const dummy = this.dummy, v = dummy ? 0xff : this.rx; this.clearStatus(RDRF);
      if (this.state === 'active' && this.reading) { this.dummy = false; this.shiftIn(); }
      return v;
    }
    return this.r[off] ?? 0;
  }
  peek(off) { return off === ICDRR ? this.rx : this.r[off] ?? 0; }
  write(off, value, size) {
    this.soc.sync();
    if (size !== 1) { for (let i = 0; i < size; i++) this.write(off + i, (value >>> (8 * i)) & 0xff, 1); return; }
    const v = value & 0xff;
    switch (off) {
      case ICCR1:
        // IICRST: with ICE = 0 every register goes back to its reset value; with ICE = 1 (internal reset) the settings stay.
        if (v & 0x40) { if (v & 0x80) this.internalReset(); else { const log = this.log; this.reset(); this.log = log; } }
        this.r[ICCR1] = v;
        return;
      case ICCR2:
        if (v & 0x02 && !(this.r[ICCR2] & 0x80)) { this.r[ICCR2] |= 0x02; this.start(false); }
        else if (v & 0x04 && this.state === 'active') { this.r[ICCR2] |= 0x04; this.start(true); }
        if (v & 0x08 && this.state === 'active') { this.r[ICCR2] |= 0x08; if (this.shifting) this.pendingStop = true; else this.stop(); }
        return;
      case ICMR3: { // ACKBT changes only while ACKWP is written 1 in the same write
        const ackbt = v & 0x10 ? v & 0x08 : this.r[ICMR3] & 0x08;
        this.r[ICMR3] = (v & ~0x0c) | ackbt | (this.r[ICMR3] & 0x04);
        return;
      }
      case ICIER: {
        const old = this.r[ICIER]; this.r[ICIER] = v; const on = v & ~old, s = this.r[ICSR2];
        if (on & 0x40 && s & TEND) this.raise(2);
        if (on & 0x80 && s & TDRE) this.raise(1);
        // Slave: a status already set asks for its interrupt when the driver enables it (the requests are levels).
        if (this.slaveState) { if (on & 0x20 && s & RDRF) this.raise(0); if (on & s & ERR_FLAGS) this.raise(3); }
        if (this.ops.length && !this.pumpEv) this.pumpEv = this.after(SLAVE_GAP_US, () => this.pump());
        return;
      }
      case ICSR2:
        this.r[ICSR2] = (this.r[ICSR2] & ~ERR_FLAGS) | (this.r[ICSR2] & v & ERR_FLAGS);
        if (this.ops.length && !this.pumpEv) this.pumpEv = this.after(SLAVE_GAP_US, () => this.pump());
        return;
      case ICDRT:
        if (this.slaveState === 'tx') { // slave transmit: one byte ahead of the shift register
          this.r[ICDRT] = v; this.clearStatus(TDRE | TEND); this.holdEnd();
          if (this.txShift == null && !this.nacked) { this.txShift = v; this.setStatus(TDRE); } else this.txHold = v;
          return;
        }
        this.r[ICDRT] = v; this.tx = v; this.clearStatus(TDRE | TEND); this.shiftOut();
        return;
      default: this.r[off] = v;
    }
  }
  output() { return { level: 1, openDrain: true }; } // SCL/SDA are released between transfers (the bus pull-ups hold them high)
}
