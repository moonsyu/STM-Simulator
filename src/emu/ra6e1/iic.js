// RA6E1 RIIC (IIC0/IIC1) in master mode, as FSP r_iic_master drives it from its four interrupts:
//   R_IIC_MASTER_Write/Read → ICCR2.ST → START (ERI: STIE) and TDRE (TXI) → the ISR writes the address to ICDRT, then the
//   data bytes; the last byte's TEND (TEI, TEIE) → ICCR2.SP → STOP (ERI: SPIE) → TX_COMPLETE / RX_COMPLETE callback.
//   Receive: after the address with R/W = 1, RDRF (RXI) asks for a dummy ICDRR read, which starts each next byte; ACKBT
//   (written with ACKWP) answers the last byte with NACK; a NACK from the slave sets NACKF (ERI: NAKIE).
// Bytes reach the parts on the SDA/SCL nets through the session's I²C adapter (soc.i2cBus: the same devices the STM32
// I2C model talks to). Each byte takes nine SCL periods of the ICBRH/ICBRL/CKS setting.
const ICCR1 = 0x00, ICCR2 = 0x01, ICMR1 = 0x02, ICMR3 = 0x04, ICIER = 0x07, ICSR2 = 0x09, ICBRL = 0x10, ICBRH = 0x11, ICDRT = 0x12, ICDRR = 0x13;
const TDRE = 0x80, TEND = 0x40, RDRF = 0x20, ERR_FLAGS = 0x1f, NACKF = 0x10, STOP = 0x08, START = 0x04;
export const IIC_EVENT_BASE = Object.freeze({ 0: 0x73, 1: 0x78 }); // + 0 RXI, 1 TXI, 2 TEI, 3 ERI (bsp_elc.h)

export class Iic {
  constructor(soc, channel) { this.soc = soc; this.channel = channel; this.name = 'IIC' + channel; this.size = 0x100; this.reset(); }
  reset() {
    for (const e of [this.ev, this.condition]) e?.cancel?.();
    this.r = new Uint8Array(0x20); this.r[ICBRL] = this.r[ICBRH] = 0xff; this.r[ICMR1] = 0x08;
    this.state = 'idle'; this.device = null; this.tx = null; this.rx = 0xff; this.shifting = false; this.ev = null; this.condition = null;
    this.addressPhase = false; this.reading = false; this.dummy = false; this.pendingStop = false; this.log = [];
  }
  // ------------------------------------------------------------ timing and events
  bitUs() { const ref = this.soc.clock.pclkb / 2 ** ((this.r[ICMR1] >> 4) & 7); return ((this.r[ICBRH] & 31) + (this.r[ICBRL] & 31) + 2) / ref * 1e6 + 0.24; }
  raise(k) { this.soc.icu.raise(IIC_EVENT_BASE[this.channel] + k); }
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
  // ------------------------------------------------------------ registers
  read(off, size) {
    this.soc.sync();
    if (size !== 1) { let v = 0; for (let i = 0; i < size; i++) v |= this.read(off + i, 1) << (8 * i); return v >>> 0; }
    if (off === ICCR1) return (this.r[ICCR1] & 0xfc) | 3; // SCLI, SDAI: lines released high
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
        this.r[ICCR1] = v;
        if (v & 0x40) { const keep = this.r.slice(ICCR1, ICCR1 + 1); this.reset(); this.r[ICCR1] = keep[0]; } // IICRST
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
        return;
      }
      case ICSR2: this.r[ICSR2] = (this.r[ICSR2] & ~ERR_FLAGS) | (this.r[ICSR2] & v & ERR_FLAGS); return;
      case ICDRT:
        this.r[ICDRT] = v; this.tx = v; this.clearStatus(TDRE | TEND); this.shiftOut();
        return;
      default: this.r[off] = v;
    }
  }
  output() { return { level: 1, openDrain: true }; } // SCL/SDA are released between transfers (the bus pull-ups hold them high)
}
