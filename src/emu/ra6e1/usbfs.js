// RA6E1 USB 2.0 Full-Speed module (USBFS, R_USB_FS0 at 0x4009_0000) in peripheral (function) mode as FSP r_usb_basic
// drives it, with the PC it is plugged into (feature 41). Register offsets and bits follow FSP's R7FA6E10F.h and
// r_usb_bitdefine.h; the behaviour is what the r_usb_basic / r_usb_pcdc sources (FSP 6.6, peripheral mode, Full-Speed,
// class PCDC) need, read from those sources. The RA6E1 hardware manual's USBFS chapter could not be checked: the points
// marked "assumed" below are guesses at the hardware and are named as such.
//
// Device side (the registers the driver reaches): SYSCFG, SYSSTS0, DVSTCTR0, the FIFO ports CFIFO / D0FIFO / D1FIFO with
// their FIFOSEL / FIFOCTR, INTENB0/1, BRDYENB / NRDYENB / BEMPENB, INTSTS0/1, BRDYSTS / NRDYSTS / BEMPSTS, FRMNUM, USBADDR,
// USBREQ / USBVAL / USBINDX / USBLENG, DCPCFG / DCPMAXP / DCPCTR, PIPESEL and the pipe window (PIPECFG / PIPEMAXP / PIPEPERI),
// PIPEnCTR, PIPEnTRE / PIPEnTRN; every other offset of the 0x408-byte block keeps what is written (DPUSR0R_FS, UCKSEL …).
// Pipes 0-9: pipe 0 (DCP) has one buffer of DCPMAXP bytes, pipes 1-5 two buffers when PIPECFG.DBLB is set, pipes 6-9 one.
//   CPU side: FRDY when the current buffer can be written (transmit) or holds a packet (receive); writing MXPS bytes or
//   BVAL ends a packet; reading all of a packet (or BCLR) frees the buffer.
//   BRDYSTS bit: the CPU side's current buffer became ready (assumed: also when the CPU moves on to the other, ready
//   buffer); BEMPSTS bit: a transmit pipe's buffers all went out. INTSTS0.BRDY / NRDY / BEMP are the ORs of the status bits
//   that are enabled (assumed: r_usb_basic's handler relies on it).
//   PID BUF lets the host move a packet; a short packet on a pipe with SHTNAK, or the transaction counter (TRENB) reaching
//   0, sets PID to NAK (assumed).
// Interrupt USBFS_INT (ELC event 0x6D): a level — while an enabled status remains after a write, the event is raised again
// (the driver's handler clears one cause per entry). USBFS_RESUME (0x6E) is never raised: suspend/resume is not modelled.
// The module does nothing in the module-stop state (MSTPCRB bit 11).
//
// The host (UsbHost): VBUS is present from power-on (INTSTS0.VBSTS, VBINT). When the device turns on the D+ pull-up
// (SYSCFG.DPRPU) the host resets the bus and enumerates in a fixed order: GET_DESCRIPTOR(Device, 18), SET_ADDRESS(1)
// (answered by the hardware: USBADDR, DVSQ Address — assumed, without a control transfer interrupt), GET_DESCRIPTOR(Device,
// 18), GET_DESCRIPTOR(Configuration, 9), GET_DESCRIPTOR(Configuration, wTotalLength), SET_CONFIGURATION (DVSQ Configured at
// its status stage), SET_LINE_CODING (115200 bps, 1 stop bit, no parity, 8 data bits), SET_CONTROL_LINE_STATE (DTR, RTS).
// A STALL or a descriptor it cannot read stops it there. Then it moves the bytes the serial monitor typed into the bulk OUT
// endpoint, in packets of its maximum packet size (the last one short), takes what the device puts in the bulk IN endpoint
// (the monitor's output) and drops what comes on the interrupt IN endpoint. The endpoints are the ones the configuration
// descriptor names.
// Timing (fixed, so a run is the same each time): reset 1 ms after the pull-up, the first request 10 ms after the reset,
// 1 ms between requests, and each transaction HOST_LATENCY_US after what the device did last.

export const USBFS_EVENT = Object.freeze({ INT: 0x6d, RESUME: 0x6e });
const VBINT = 0x8000, RESM = 0x4000, SOFR = 0x2000, DVST = 0x1000, CTRT = 0x0800, BEMP = 0x0400, NRDY = 0x0200, BRDY = 0x0100, VBSTS = 0x0080, VALID = 0x0008;
const LATCHED = VBINT | RESM | SOFR | DVST | CTRT | VALID;
const PID = { NAK: 0, BUF: 1, STALL: 2 };
const HOST_LATENCY_US = 10, ATTACH_US = 1000, RESET_US = 10000, GAP_US = 1000, GIVE_UP_US = 100000;
/** Line coding the host sets: 115200 bps, 1 stop bit, no parity, 8 data bits (usb_pcdc_linecoding_t). */
export const USB_HOST_LINE_CODING = Object.freeze([0x00, 0xc2, 0x01, 0x00, 0x00, 0x00, 0x08]);

class Pipe {
  constructor(n) { this.n = n; this.cfg = 0; this.maxp = n === 0 ? 0x40 : 0; this.peri = 0; this.pid = PID.NAK; this.ctrBits = 0; this.tre = 0; this.trn = 0; this.trnLeft = 0; this.clear(); }
  clear() { this.banks = [{ data: [], valid: false, read: 0 }, { data: [], valid: false, read: 0 }]; this.cpu = 0; this.sie = 0; }
  get count() { return this.n >= 1 && this.n <= 5 && this.cfg & 0x0200 ? 2 : 1; }
  get size() { return (this.n === 0 ? this.maxp & 0x7f : this.maxp & 0x7ff) || 64; }
  get transmit() { return !!(this.cfg & 0x0010); }
  get ep() { return this.cfg & 0x000f; }
  get type() { return (this.cfg >> 14) & 3; }
  next(i) { return this.count === 2 ? i ^ 1 : 0; }
  bank(i) { return this.banks[i]; }
  anyValid() { for (let i = 0; i < this.count; i++) if (this.banks[i].valid) return true; return false; }
}

export class UsbFs {
  constructor(soc) { this.soc = soc; this.name = 'USBFS'; this.size = 0x408; this.host = new UsbHost(this); this.reset(); }
  reset() {
    this.mem = new Uint8Array(0x408); this.dv = new DataView(this.mem.buffer);
    this.syscfg = 0; this.dvstctr = 0; this.intenb0 = 0; this.brdyenb = 0; this.nrdyenb = 0; this.bempenb = 0;
    // VBUS is connected from power-on: VBSTS, and the VBINT its rise latched (assumed).
    this.latched = VBINT; this.vbus = true; this.dvsq = 0; this.ctsq = 0; this.brdysts = 0; this.nrdysts = 0; this.bempsts = 0;
    this.req = [0, 0, 0, 0]; this.usbaddr = 0; this.fifosel = [0, 0, 0]; this.pipesel = 0; this.ccpl = 0; this.dcpcfg = 0;
    this.pipes = Array.from({ length: 10 }, (_, n) => new Pipe(n));
    this.host?.reset();
  }
  stopped() { const m = this.soc.mstp; return !!m && !!(m.peek(0x4, 4) & (1 << 11)); }
  // ------------------------------------------------------------ status and the interrupt request
  intsts0() {
    let v = this.latched | (this.vbus ? VBSTS : 0) | ((this.dvsq & 7) << 4) | (this.ctsq & 7);
    if (this.brdysts & this.brdyenb) v |= BRDY;
    if (this.nrdysts & this.nrdyenb) v |= NRDY;
    if (this.bempsts & this.bempenb) v |= BEMP;
    return v;
  }
  request() { return !!(this.intsts0() & this.intenb0 & 0xff00); }
  update() { if (this.request()) this.soc.raiseEvent(USBFS_EVENT.INT); }
  setLatched(bits) { this.latched |= bits; this.update(); }
  brdy(n) { this.brdysts |= 1 << n; this.update(); }
  bemp(n) { this.bempsts |= 1 << n; this.update(); }
  // ------------------------------------------------------------ registers
  read(off, size) {
    this.soc.sync?.();
    if (this.stopped()) return 0;
    if (off >= 0x14 && off < 0x20) return this.fifoRead(((off - 0x14) >> 2), size);
    const v = this.reg(off & ~1);
    if (v === undefined) return size === 4 ? this.dv.getUint32(off, true) : size === 2 ? this.dv.getUint16(off, true) : this.dv.getUint8(off);
    if (size === 4) return (v | ((this.reg((off & ~1) + 2) ?? this.dv.getUint16(off + 2, true)) << 16)) >>> 0;
    return size === 1 ? (off & 1 ? v >> 8 : v) & 0xff : v & 0xffff;
  }
  // The debugger's view: no FIFO data is taken.
  peek(off, size) {
    if (this.stopped() || (off >= 0x14 && off < 0x20)) return 0;
    const v = this.reg(off & ~1);
    if (v === undefined) return size === 4 ? this.dv.getUint32(off, true) : size === 2 ? this.dv.getUint16(off, true) : this.dv.getUint8(off);
    return size === 1 ? (off & 1 ? v >> 8 : v) & 0xff : v & 0xffff;
  }
  write(off, value, size) {
    this.soc.sync?.();
    if (this.stopped()) return;
    if (off >= 0x14 && off < 0x20) { this.fifoWrite((off - 0x14) >> 2, value, size); this.after(); return; }
    if (size === 4) { this.write16(off, value & 0xffff); if (off + 2 < this.size) this.write16(off + 2, value >>> 16); }
    else if (size === 2) this.write16(off, value & 0xffff);
    else { const cur = this.reg(off & ~1) ?? this.dv.getUint16(off & ~1, true), v = off & 1 ? (cur & 0xff) | ((value & 0xff) << 8) : (cur & 0xff00) | (value & 0xff); this.write16(off & ~1, v); }
    this.after();
  }
  after() { this.update(); this.host.kick(); }
  pipeOf(sel) { return this.pipes[sel & 0xf] ?? null; }
  // A register's value, or undefined for one that only keeps what is written (the byte store).
  reg(off) {
    if (off >= 0x70 && off <= 0x80) return this.pipeCtr(this.pipes[((off - 0x70) >> 1) + 1]);
    if (off >= 0x90 && off < 0xa4) { const p = this.pipes[((off - 0x90) >> 2) + 1]; return off & 2 ? p.trn : p.tre; }
    switch (off) {
      case 0x00: return this.syscfg;
      case 0x04: return this.vbus && this.syscfg & 0x10 ? 1 : 0; // SYSSTS0.LNST: J state while attached (Full-Speed)
      case 0x08: return this.dvstctr;
      case 0x20: case 0x28: case 0x2c: return this.fifosel[[0x20, 0x28, 0x2c].indexOf(off)];
      case 0x22: case 0x2a: case 0x2e: return this.fifoCtr([0x22, 0x2a, 0x2e].indexOf(off));
      case 0x30: return this.intenb0;
      case 0x36: return this.brdyenb;
      case 0x38: return this.nrdyenb;
      case 0x3a: return this.bempenb;
      case 0x40: return this.intsts0();
      case 0x46: return this.brdysts;
      case 0x48: return this.nrdysts;
      case 0x4a: return this.bempsts;
      case 0x4c: return Math.floor(this.soc.nowUs() / 1000) & 0x7ff; // FRMNUM: 1 ms frames
      case 0x50: return this.usbaddr;
      case 0x54: case 0x56: case 0x58: case 0x5a: return this.req[(off - 0x54) >> 1];
      case 0x5c: return this.dcpcfg;
      case 0x5e: return this.pipes[0].maxp;
      case 0x60: return this.pipeCtr(this.pipes[0]);
      case 0x64: return this.pipesel;
      case 0x68: return this.pipesel ? this.pipes[this.pipesel].cfg : 0;
      case 0x6c: return this.pipesel ? this.pipes[this.pipesel].maxp : 0;
      case 0x6e: return this.pipesel ? this.pipes[this.pipesel].peri : 0;
      default: return undefined;
    }
  }
  // PIPEnCTR / DCPCTR: INBUFM (b14, transmit pipes: a buffer waits for the host), the bits that keep what is written
  // (ACLRM b9, SQMON b6 …), CCPL (b2, DCP) and PID. PBUSY (b5) is never set: the host's transactions take no time here.
  pipeCtr(p) { return (p.anyValid() && (p.n === 0 || p.transmit) ? 0x4000 : 0) | (p.ctrBits & 0x0640) | (p.n === 0 ? this.ccpl << 2 : 0) | p.pid; }
  write16(off, v) {
    if (off >= 0x70 && off <= 0x80) { this.writeCtr(this.pipes[((off - 0x70) >> 1) + 1], v); return; }
    if (off >= 0x90 && off < 0xa4) {
      const p = this.pipes[((off - 0x90) >> 2) + 1];
      if (off & 2) { p.trn = v; return; }
      if (v & 0x0100) p.trnLeft = 0; // TRCLR
      if (v & 0x0200 && !(p.tre & 0x0200)) p.trnLeft = p.trn; // TRENB: count the transactions from here
      p.tre = v & 0x0200; return;
    }
    switch (off) {
      case 0x00: {
        const before = this.syscfg; this.syscfg = v & 0x07f1;
        if ((before ^ v) & 0x0001 && !(v & 1)) this.detach(); // USBE cleared: the module's state starts over
        if ((before ^ v) & 0x0010) { if (v & 0x0010) this.host.pullUp(); else this.detach(); }
        return;
      }
      case 0x08: this.dvstctr = (this.dvstctr & 7) | (v & ~7); return; // RHST (b2:0) is read only
      case 0x20: case 0x28: case 0x2c: this.fifosel[[0x20, 0x28, 0x2c].indexOf(off)] = v & 0xfdef; return;
      case 0x22: case 0x2a: case 0x2e: this.fifoCtrWrite([0x22, 0x2a, 0x2e].indexOf(off), v); return;
      case 0x30: this.intenb0 = v; return;
      case 0x36: this.brdyenb = v & 0x3ff; return;
      case 0x38: this.nrdyenb = v & 0x3ff; return;
      case 0x3a: this.bempenb = v & 0x3ff; return;
      case 0x40: this.latched &= v | ~LATCHED; return; // 0 clears VBINT, RESM, SOFR, DVST, CTRT, VALID; 1 leaves them
      case 0x46: this.brdysts &= v; return;
      case 0x48: this.nrdysts &= v; return;
      case 0x4a: this.bempsts &= v; return;
      case 0x5c: this.dcpcfg = v; return;
      case 0x5e: this.pipes[0].maxp = v; return;
      case 0x60: this.writeCtr(this.pipes[0], v); return;
      case 0x64: this.pipesel = v & 0xf; return;
      case 0x68: if (this.pipesel) this.pipes[this.pipesel].cfg = v; return;
      case 0x6c: if (this.pipesel) this.pipes[this.pipesel].maxp = v; return;
      case 0x6e: if (this.pipesel) this.pipes[this.pipesel].peri = v; return;
      case 0x04: case 0x4c: case 0x50: case 0x54: case 0x56: case 0x58: case 0x5a: return; // read only
      default: this.dv.setUint16(off, v, true);
    }
  }
  writeCtr(p, v) {
    p.pid = v & 3;
    if (p.n === 0) this.ccpl = (v >> 2) & 1;
    if (v & 0x0080) p.ctrBits |= 0x0040; // SQSET: DATA1
    if (v & 0x0100) p.ctrBits &= ~0x0040; // SQCLR: DATA0
    // ACLRM (pipes 1-9): while set, the pipe's buffers are cleared.
    p.ctrBits = (p.ctrBits & ~0x0600) | (v & (p.n ? 0x0600 : 0));
    if (p.n && v & 0x0200) p.clear();
  }
  // ------------------------------------------------------------ FIFO ports (0 CFIFO, 1 D0FIFO, 2 D1FIFO)
  // Whether the CPU side of the port's pipe writes (transmit: the DCP with ISEL, another pipe with PIPECFG.DIR).
  writes(port, p) { return p.n === 0 ? !!(this.fifosel[port] & 0x20) : p.transmit; }
  fifoCtr(port) {
    const p = this.pipeOf(this.fifosel[port]), b = p.bank(p.cpu);
    if (this.writes(port, p)) return (b.valid ? 0 : 0x2000) | (b.valid ? 0 : b.data.length);
    return b.valid ? 0x2000 | (b.data.length - b.read) : 0;
  }
  fifoCtrWrite(port, v) {
    const p = this.pipeOf(this.fifosel[port]), b = p.bank(p.cpu);
    if (v & 0x4000) { // BCLR: the CPU side's buffer is emptied
      if (this.writes(port, p)) { if (!b.valid) b.data = []; }
      else if (b.valid) this.freeCpu(p);
      else b.data = [];
    }
    if (v & 0x8000 && this.writes(port, p) && !b.valid) this.endPacket(p); // BVAL: a short (or empty) packet
  }
  endPacket(p) {
    const b = p.bank(p.cpu); b.valid = true; b.read = 0; p.cpu = p.next(p.cpu);
    if (p.count === 2 && !p.bank(p.cpu).valid && p.n) this.brdy(p.n); // the other buffer can be written (assumed)
  }
  freeCpu(p) {
    const b = p.bank(p.cpu); b.valid = false; b.data = []; b.read = 0; p.cpu = p.next(p.cpu);
    if (p.count === 2 && p.bank(p.cpu).valid) this.brdy(p.n); // the next packet is ready to read
  }
  fifoWrite(port, value, size) {
    const p = this.pipeOf(this.fifosel[port]), b = p.bank(p.cpu);
    if (!this.writes(port, p) || b.valid) return;
    for (let i = 0; i < size && b.data.length < p.size; i++) b.data.push((value >>> (8 * i)) & 0xff);
    if (b.data.length >= p.size) this.endPacket(p); // a full packet goes out without BVAL
  }
  fifoRead(port, size) {
    const p = this.pipeOf(this.fifosel[port]), b = p.bank(p.cpu);
    if (this.writes(port, p) || !b.valid) return 0;
    let v = 0;
    for (let i = 0; i < size && b.read < b.data.length; i++) v |= b.data[b.read++] << (8 * i);
    if (b.read >= b.data.length) { this.freeCpu(p); this.host.kick(); }
    return v >>> 0;
  }
  // ------------------------------------------------------------ what the host does to the device
  /** The pull-up went off or USBE was cleared: the host sees the device leave; the bus state starts over. */
  detach() { this.dvsq = 0; this.ctsq = 0; this.dvstctr &= ~7; this.usbaddr = 0; this.host.detached(); }
  busReset() {
    this.dvsq = 1; this.dvstctr = (this.dvstctr & ~7) | 2; this.usbaddr = 0; this.ctsq = 0; this.ccpl = 0; this.pipes[0].pid = PID.NAK;
    this.setLatched(DVST);
  }
  setup(bytes) {
    const w = i => bytes[i] | (bytes[i + 1] << 8);
    this.req = [bytes[0] | (bytes[1] << 8), w(2), w(4), w(6)];
    const p = this.pipes[0]; p.pid = PID.NAK; this.ccpl = 0;
    this.ctsq = bytes[0] & 0x80 ? 1 : w(6) ? 3 : 5;
    this.setLatched(VALID | CTRT);
  }
  stage(ctsq) { this.ctsq = ctsq; this.setLatched(CTRT); }
  deviceState(dvsq) { this.dvsq = dvsq; this.setLatched(DVST); }
  /** The transmit pipe for endpoint `ep` (IN), or the receive pipe (OUT); pipe 0 for endpoint 0. */
  pipeFor(ep, transmit) { if (!ep) return this.pipes[0]; return this.pipes.find(p => p.n && p.cfg && p.ep === ep && p.transmit === transmit) ?? null; }
  /** An IN transaction: the packet of the pipe's next full buffer, or null (NAK; 'STALL'). */
  inPacket(p) {
    if (p.pid === PID.STALL) return 'STALL';
    if (p.pid !== PID.BUF) return null;
    const b = p.bank(p.sie); if (!b.valid) return null;
    const data = b.data; b.data = []; b.valid = false; b.read = 0; p.sie = p.next(p.sie);
    if (p.n && !p.bank(p.cpu).valid) this.brdy(p.n); // the CPU side's buffer can be written again
    if (!p.anyValid()) this.bemp(p.n);
    return data;
  }
  /** An OUT transaction: true when the pipe took the packet, null (NAK) or 'STALL'. */
  outPacket(p, data) {
    if (p.pid === PID.STALL) return 'STALL';
    if (p.pid !== PID.BUF) return null;
    const b = p.bank(p.sie); if (b.valid) return null;
    b.data = [...data]; b.valid = true; b.read = 0;
    const ready = p.sie === p.cpu; p.sie = p.next(p.sie);
    if (p.n && data.length < p.size && p.cfg & 0x0080) p.pid = PID.NAK; // SHTNAK
    if (p.n && p.tre & 0x0200 && p.trnLeft > 0 && --p.trnLeft === 0) p.pid = PID.NAK;
    if (ready) this.brdy(p.n);
    return true;
  }
}

// The PC: enumeration, then the serial monitor's bytes over the bulk endpoints (see the top of the file).
export class UsbHost {
  constructor(dev) { this.dev = dev; this.gen = 0; this.output = []; this.events = []; this.reset(); }
  // The PC's terminal (`output`) and its record of what it did (`events`) stay across a reset of the device; what it had
  // not sent yet is dropped (the device left the bus).
  reset() {
    this.gen++; this.state = 'detached'; this.pending = false; this.ctl = null; this.steps = []; this.endpoints = null; this.device = null; this.config = null;
    this.queue = [];
  }
  get soc() { return this.dev.soc; }
  later(us, fn) { const gen = this.gen; this.soc.after(us, () => { if (gen === this.gen) fn(); }); }
  log(what) { this.events.push(what); }
  /** The device turned on its D+ pull-up: reset the bus and enumerate. */
  pullUp() {
    if (this.state !== 'detached' || !this.dev.vbus) return;
    this.state = 'attached';
    this.later(ATTACH_US, () => { this.dev.busReset(); this.log('RESET'); this.state = 'reset'; this.later(RESET_US, () => this.enumerate()); });
  }
  detached() { if (this.state !== 'detached') this.log('DETACH'); this.reset(); }
  enumerate() {
    const get = (type, len) => ({ setup: [0x80, 6, 0, type, 0, 0, len & 0xff, len >> 8], name: `GET_DESCRIPTOR(${type === 1 ? 'Device' : 'Configuration'}, ${len})` });
    this.steps = [
      get(1, 18),
      { address: 1, name: 'SET_ADDRESS(1)' },
      { ...get(1, 18), done: d => { this.device = d; } },
      { ...get(2, 9), done: d => { if (d.length < 9) return false; this.steps.splice(this.at + 1, 0, { ...get(2, d[2] | (d[3] << 8)), done: c => this.configured(c) }); return true; } },
      { setup: () => [0x00, 9, this.config?.value ?? 1, 0, 0, 0, 0, 0], name: 'SET_CONFIGURATION', done: () => { this.dev.deviceState(3); this.state = 'configured'; } },
      { setup: [0x21, 0x20, 0, 0, 0, 0, 7, 0], data: USB_HOST_LINE_CODING, name: 'SET_LINE_CODING', optional: true },
      { setup: [0x21, 0x22, 3, 0, 0, 0, 0, 0], name: 'SET_CONTROL_LINE_STATE', optional: true },
    ];
    this.at = -1; this.state = 'enumerating'; this.nextStep();
  }
  // The configuration descriptor: its value and the bulk IN / OUT and interrupt IN endpoints with their packet sizes.
  configured(c) {
    if (c.length < 9) return false;
    const eps = { bulkIn: null, bulkOut: null, intIn: null };
    for (let i = c[0]; i + 1 < c.length && c[i] > 0; i += c[i]) {
      if (c[i + 1] !== 5 || i + 6 >= c.length) continue;
      const ep = { ep: c[i + 2] & 0x0f, maxp: c[i + 4] | (c[i + 5] << 8) }, type = c[i + 3] & 3, inDir = !!(c[i + 2] & 0x80);
      if (type === 2 && inDir && !eps.bulkIn) eps.bulkIn = ep;
      else if (type === 2 && !inDir && !eps.bulkOut) eps.bulkOut = ep;
      else if (type === 3 && inDir && !eps.intIn) eps.intIn = ep;
    }
    this.config = { value: c[5] }; this.endpoints = eps; return true;
  }
  nextStep() {
    this.at++;
    const step = this.steps[this.at];
    if (!step) { this.state = 'ready'; this.kick(); return; }
    if (step.address) { this.dev.usbaddr = step.address; this.dev.deviceState(2); this.log(step.name); this.later(GAP_US, () => this.nextStep()); return; }
    const setup = typeof step.setup === 'function' ? step.setup() : step.setup, length = setup[6] | (setup[7] << 8);
    this.ctl = { step, setup, length, read: !!(setup[0] & 0x80), data: [], sent: 0, phase: setup[0] & 0x80 ? 'in' : length ? 'out' : 'status' };
    this.dev.setup(setup); this.log(step.name);
    // A class request after the enumeration (SET_LINE_CODING, SET_CONTROL_LINE_STATE) the program does not answer is given
    // up after GIVE_UP_US, and the PC goes on.
    if (step.optional) { const ctl = this.ctl; this.later(GIVE_UP_US, () => { if (this.ctl === ctl) this.giveUp('TIMEOUT'); }); }
    this.kick();
  }
  /** Something changed on the device: try the transactions again HOST_LATENCY_US later. */
  kick() { if (this.pending || this.state === 'detached' || this.state === 'stalled') return; this.pending = true; this.later(HOST_LATENCY_US, () => { this.pending = false; this.pump(); }); }
  // A STALL: a request of the enumeration stops the PC; a class request after it is given up.
  stall(c) { if (c?.step.optional) return this.giveUp('STALL'); this.ctl = null; this.state = 'stalled'; this.log('STALL'); }
  // The control transfer given up leaves nothing behind: no control stage, the DCP buffer empty; the next step 1 ms later.
  giveUp(what) {
    this.log(what); this.ctl = null; this.dev.ctsq = 0; this.dev.pipes[0].clear();
    this.later(GAP_US, () => this.nextStep());
  }
  pump() {
    let moved = false;
    const c = this.ctl, dcp = this.dev.pipes[0];
    if (c) {
      if (c.phase === 'in') {
        const r = this.dev.inPacket(dcp);
        if (r === 'STALL') return this.stall(c);
        if (r) { c.data.push(...r); moved = true; if (c.data.length >= c.length || r.length < dcp.size) { c.phase = 'status'; this.dev.stage(2); } }
      } else if (c.phase === 'out') {
        const chunk = c.step.data.slice(c.sent, c.sent + dcp.size), r = this.dev.outPacket(dcp, chunk);
        if (r === 'STALL') return this.stall(c);
        if (r) { c.sent += chunk.length; moved = true; if (c.sent >= c.length) { c.phase = 'status'; this.dev.stage(4); } }
      } else if (c.phase === 'status') {
        if (dcp.pid === PID.STALL) return this.stall(c);
        if (this.dev.ccpl) {
          this.ctl = null; this.dev.ccpl = 0; moved = true;
          const ok = c.step.done?.(c.read ? c.data.slice(0, c.length) : null);
          this.dev.stage(0);
          if (ok === false) return this.stall();
          this.later(GAP_US, () => this.nextStep());
        }
      }
    }
    if ((this.state === 'configured' || this.state === 'ready' || this.state === 'enumerating') && this.endpoints && this.dev.dvsq === 3) moved = this.bulk() || moved;
    if (moved) this.kick();
  }
  // Bulk IN (and interrupt IN): everything the device has ready; bulk OUT: the next packet of the monitor's bytes.
  bulk() {
    let moved = false;
    const { bulkIn, bulkOut, intIn } = this.endpoints;
    for (const [ep, keep] of [[bulkIn, true], [intIn, false]]) {
      const p = ep && this.dev.pipeFor(ep.ep, true); if (!p) continue;
      const r = this.dev.inPacket(p);
      if (Array.isArray(r)) { moved = true; if (keep) { this.output.push(...r); if (this.output.length > 4096) this.output.splice(0, this.output.length - 4096); } }
    }
    const out = bulkOut && this.state === 'ready' && this.queue.length && this.dev.pipeFor(bulkOut.ep, false);
    if (out) {
      const size = Math.max(1, Math.min(bulkOut.maxp || out.size, out.size)), chunk = this.queue.slice(0, size);
      if (this.dev.outPacket(out, chunk) === true) { this.queue.splice(0, chunk.length); moved = true; }
    }
    return moved;
  }
  /** Bytes typed in the serial monitor for the device (host to device). */
  send(bytes) { this.queue.push(...bytes); this.kick(); return bytes.length; }
}
