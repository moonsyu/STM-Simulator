// RA6E1 CAN module (R_CAN0 at 0x400A_8000) in normal mailbox mode, as FSP r_can drives it, with a virtual CAN node on the
// bus (feature 40). Register offsets and bits follow FSP's R7FA6E10F.h (R_CAN0_Type); the behaviour is what r_can.c (FSP
// 6.6) needs, read from that source. The RA6E1 hardware manual's CAN chapter could not be checked: the points marked
// "assumed" below are guesses at the hardware and are named as such.
//
// Registers: the mailboxes MB0-31 (ID, DL, D0-7, TS), MKR0-7, FIDCR0-1, MKIVLR, MIER, MCTL_TX / MCTL_RX 0-31 (one byte each),
// CTLR, STR (read only), BCR, RFCR / RFPCR / TFCR / TFPCR (kept as written: the FIFO is not modelled), EIER, EIFR, RECR /
// TECR (0: no bus errors here), ECSR, CSSR, MSSR (read only) / MSMR, TSR, AFSR (kept), TCR.
//   CTLR.CANM / SLPM take effect at once (STR's RSTST / HLTST / SLPST follow; assumed: no wait for the bus to go idle),
//   TSRC reads back 0 (the time stamp counter restarts). SLPM is ignored in CAN operation mode (assumed).
//   Entering CAN reset mode clears every MCTL (requests and flags; a frame waiting to go is dropped), EIFR, MSMR, ECSR's
//   error flags and the time stamp counter (assumed); TCR keeps its value (assumed: r_can keeps its own copy of the test
//   mode across a reset-mode transition).
//   MCTL: bit 0 (NEWDATA / SENTDATA) and bit 2 (MSGLOST / TRMABT) are cleared by writing 0, a 1 leaves them; SENTDATA is not
//   cleared by the write that also clears TRMREQ (r_can's transmit ISR writes 0 twice for that); RECREQ, TRMREQ and ONESHOT
//   keep what is written. A mailbox with RECREQ is a receive mailbox.
//   MSSR: the lowest mailbox found by MSMR's mode — 0 receive (NEWDATA), 1 transmit (SENTDATA), 2 message lost (MSGLOST),
//   3 channel search (the lowest set bit of CSSR); SEST (b7) when none.
// The bus (one frame at a time; fixed frame lengths without bit stuffing — standard data frame 47 + 8 × DLC bits with the
// interframe space, extended 67 + 8 × DLC, a remote frame without data; the bit time from BCR and PCLKB):
//   In CAN operation mode a mailbox with TRMREQ goes out, the lowest ID first (CTLR.TPM: the lowest mailbox first); the
//   virtual node's frames take part in the same arbitration. At the end of the frame: SENTDATA, the transmit interrupt
//   (event CAN0_MAILBOX_TX 0xA5 when MIER enables the mailbox). The virtual node is always on the bus and acknowledges, so
//   a frame never fails: TECR / RECR stay 0 and EIFR has only the overrun flag.
//   Reception (the node's frames, and the board's own with a loopback test mode): the receive mailboxes in number order;
//   the first whose IDE (by CTLR.IDFM: standard only, extended only, or the mailbox's IDE in mixed mode — assumed) and RTR
//   match and whose ID matches under the mask (MKR of the mailbox's group of four, all bits when MKIVLR invalidates the
//   mailbox's mask) takes the frame: NEWDATA and the receive interrupt (CAN0_MAILBOX_RX 0xA4). If NEWDATA was still set,
//   MSGLOST (STR.NMLST): with CTLR.MLM 0 (overwrite) the new frame replaces the old and the receive interrupt comes again,
//   with MLM 1 (overrun) the new frame is dropped and EIFR.ORIF raises the error interrupt (CAN0_ERROR 0xA1) when EIER.ORIE
//   is set. In overwrite mode the error interrupt is not raised (r_can.c's error ISR says the hardware fires it for a lost
//   message only in overrun mode; assumed).
//   The receive interrupt is raised before the transmit interrupt of a looped-back frame (both at its end).
//   Test modes (TCR, written in CAN halt mode): internal loopback (TSTM 11b) — the board acknowledges its own frames, takes
//   them into its receive mailboxes and neither sends them to the node nor hears the node; external loopback (10b) — its
//   frames go to the node and into its own receive mailboxes, and it hears the node; listen only (01b) — it hears the node
//   and sends nothing (a transmit request stays pending). The three are assumed (not checked against the manual).
//   CAN halt, reset and sleep modes neither send nor receive; a frame already on the bus ends as if the mode had not changed
//   (assumed); transmit requests wait for CAN operation mode again (CAN reset mode clears them, above).
// The module does nothing in the module-stop state (MSTPCRB bit 2): reads 0, writes are ignored, the node's frames are lost.

export const CAN_EVENT = Object.freeze({ ERROR: 0xa1, FIFO_RX: 0xa2, FIFO_TX: 0xa3, MAILBOX_RX: 0xa4, MAILBOX_TX: 0xa5 });
const SIZE = 0x85c, MB = 0x200, MKR = 0x400, MKIVLR = 0x428, MIER = 0x42c, MCTL = 0x820;
const CTLR = 0x840, STR = 0x842, BCR = 0x844, EIER = 0x84c, EIFR = 0x84d, RECR = 0x84e, TECR = 0x84f, ECSR = 0x850, CSSR = 0x851, MSSR = 0x852, MSMR = 0x853, TSR = 0x854, TCR = 0x858;
const CTLR_RESET = 0x0500; // CANM 01b (reset), SLPM 1 (sleep)
const OUTPUT_LINES = 1000;

/** Bits a frame takes on the bus, with the interframe space and without stuff bits. */
export const canFrameBits = f => (f.extended ? 67 : 47) + (f.remote ? 0 : 8 * Math.min(8, f.dlc));
// The arbitration field as a number: the lower wins (base ID, then a standard data frame before a standard remote frame
// before an extended frame, then the extended ID, then data before remote).
const arbitration = f => { const sid = f.extended ? (f.id >>> 18) & 0x7ff : f.id & 0x7ff; return ((sid * 4 + (f.extended ? 2 : f.remote ? 1 : 0)) * 0x40000 + (f.extended ? f.id & 0x3ffff : 0)) * 2 + (f.extended && f.remote ? 1 : 0); };

/** A line the serial monitor sends to the virtual CAN node as a frame, or null when it is not one: hexadecimal tokens —
 *  the ID (an extended 29-bit ID when written with 4 or more digits or above 0x7FF), then 0-8 data bytes, or R and the
 *  DLC (0-8) for a remote frame. A 0x prefix is allowed, letters in either case; the line's CR / LF are ignored. */
export function parseCanLine(text) {
  const tokens = String(text).replace(/[\r\n]+/g, ' ').trim().split(/\s+/).filter(Boolean);
  const hexOf = t => { const m = /^(?:0x)?([0-9a-f]+)$/i.exec(t); return m ? { digits: m[1].length, value: parseInt(m[1], 16) } : null; };
  if (!tokens.length) return null;
  const id = hexOf(tokens[0]); if (!id || id.digits > 8 || id.value > 0x1fffffff) return null;
  const extended = id.digits >= 4 || id.value > 0x7ff, rest = tokens.slice(1);
  if (rest.length && /^r$/i.test(rest[0])) {
    if (rest.length !== 2 || !/^[0-8]$/.test(rest[1])) return null;
    return { id: id.value, extended, remote: true, dlc: Number(rest[1]), data: [] };
  }
  if (rest.length > 8) return null;
  const data = [];
  for (const t of rest) { const b = hexOf(t); if (!b || b.digits > 2) return null; data.push(b.value); }
  return { id: id.value, extended, remote: false, dlc: data.length, data };
}
/** A frame as the virtual node shows it: "123 [3] 01 02 03", "1ABCDEF0 [0]", "123 [4] R". */
export function formatCanFrame(f) {
  const id = f.id.toString(16).toUpperCase().padStart(f.extended ? 8 : 3, '0');
  return `${id} [${f.dlc}]${f.remote ? ' R' : f.data.slice(0, Math.min(8, f.dlc)).map(b => ' ' + b.toString(16).toUpperCase().padStart(2, '0')).join('')}`;
}

export class Can {
  constructor(soc) { this.soc = soc; this.name = 'CAN0'; this.size = SIZE; this.node = new CanNode(this); this.gen = 0; this.reset(); }
  reset() {
    this.mem = new Uint8Array(SIZE); this.dv = new DataView(this.mem.buffer);
    this.ctlr = CTLR_RESET; this.eifr = 0; this.ecsr = 0; this.msmr = 0; this.tcr = 0; this.tsBase = 0;
    this.mctl = Array.from({ length: 32 }, () => ({ flag: 0, lost: 0, oneshot: 0, recreq: 0, trmreq: 0, active: 0 }));
    this.gen++; this.busy = null; this.node?.reset();
  }
  stopped() { const m = this.soc.mstp; return !!m && !!(m.peek(0x4, 4) & (1 << 2)); }
  // ------------------------------------------------------------ state
  get canm() { return (this.ctlr >> 8) & 3; }
  get sleeping() { return !!(this.ctlr & 0x400) && this.canm !== 0; }
  /** 'operation', 'halt', 'reset' or 'sleep'. */
  get mode() { if (this.sleeping) return 'sleep'; const m = this.canm; return m === 0 ? 'operation' : m === 2 ? 'halt' : 'reset'; }
  /** The test mode TCR selects: 'normal', 'listen', 'external' (loopback) or 'internal' (loopback). */
  get test() { return this.tcr & 1 ? ['normal', 'listen', 'external', 'internal'][(this.tcr >> 1) & 3] : 'normal'; }
  get idfm() { return (this.ctlr >> 1) & 3; }
  /** Whether the board takes the node's frames now (CAN operation mode, not internal loopback, the module running). */
  hearsBus() { return !this.stopped() && this.mode === 'operation' && this.test !== 'internal'; }
  str() {
    let v = 0;
    for (const m of this.mctl) {
      if (m.flag) v |= m.recreq ? 0x0001 : 0x0002;
      if (m.lost) v |= m.recreq ? 0x0010 : 0x0040;
    }
    const mode = this.mode, under = this.canm === 2 ? 'halt' : 'reset';
    if (mode === 'reset' || mode === 'sleep' && under === 'reset') v |= 0x0100;
    if (mode === 'halt' || mode === 'sleep' && under === 'halt') v |= 0x0200;
    if (mode === 'sleep') v |= 0x0400;
    if (this.busy?.from === 'board') v |= 0x2000;
    if (this.busy?.from === 'node' && this.hearsBus()) v |= 0x4000;
    return v;
  }
  mctlByte(j) { const m = this.mctl[j]; return m.flag | (m.recreq ? 0 : m.active << 1) | (m.lost << 2) | (m.oneshot << 4) | (m.recreq << 6) | (m.trmreq << 7); }
  search() {
    const mode = this.msmr & 3;
    if (mode === 3) { const c = this.mem[CSSR]; for (let i = 0; i < 8; i++) if (c & (1 << i)) return i; return 0x80; }
    for (let j = 0; j < 32; j++) {
      const m = this.mctl[j];
      if (mode === 0 && m.recreq && m.flag || mode === 1 && !m.recreq && m.flag || mode === 2 && m.recreq && m.lost) return j;
    }
    return 0x80;
  }
  bitUs() {
    const bcr = this.dv.getUint32(BCR, true), hz = bcr & 1 ? 0 : this.soc.clock?.pclkb; // CANMCLK: the board has no main crystal
    if (!hz) return 0;
    const brp = ((bcr >>> 16) & 0x3ff) + 1, tq = 1 + ((bcr >>> 28) & 0xf) + 1 + ((bcr >>> 8) & 7) + 1;
    return brp * tq * 1e6 / hz;
  }
  tsr() { const bit = this.bitUs(); if (!bit) return 0; const div = 1 << ((this.ctlr >> 6) & 3); return Math.floor((this.soc.nowUs() - this.tsBase) / bit / div) & 0xffff; }
  // ------------------------------------------------------------ registers
  byte(a) {
    if (a >= MCTL && a < MCTL + 32) return this.mctlByte(a - MCTL);
    switch (a) {
      case CTLR: return this.ctlr & 0xff; case CTLR + 1: return this.ctlr >> 8;
      case STR: return this.str() & 0xff; case STR + 1: return this.str() >> 8;
      case EIFR: return this.eifr; case RECR: case TECR: return 0; case ECSR: return this.ecsr;
      case MSSR: return this.search(); case MSMR: return this.msmr;
      case TSR: return this.tsr() & 0xff; case TSR + 1: return this.tsr() >> 8;
      case TCR: return this.tcr;
      default: return this.mem[a];
    }
  }
  read(off, size) {
    this.soc.sync?.();
    if (this.stopped() || off < 0 || off + size > SIZE) return 0;
    let v = 0; for (let i = 0; i < size; i++) v |= this.byte(off + i) << (8 * i);
    return v >>> 0;
  }
  // The debugger's view (no time passes).
  peek(off, size) { if (this.stopped() || off < 0 || off + size > SIZE) return 0; let v = 0; for (let i = 0; i < size; i++) v |= this.byte(off + i) << (8 * i); return v >>> 0; }
  write(off, value, size) {
    this.soc.sync?.();
    if (this.stopped() || off < 0 || off + size > SIZE) return;
    const before = this.ctlr;
    for (let i = 0; i < size; i++) this.writeByte(off + i, (value >>> (8 * i)) & 0xff);
    if (off < CTLR + 2 && off + size > CTLR) this.ctlrWritten(before);
    this.kick();
  }
  writeByte(a, b) {
    if (a >= MCTL && a < MCTL + 32) { this.mctlWrite(a - MCTL, b); return; }
    switch (a) {
      case CTLR: this.ctlr = (this.ctlr & 0xff00) | b; return;
      case CTLR + 1: this.ctlr = (this.ctlr & 0x00ff) | (b << 8); return;
      case STR: case STR + 1: case RECR: case TECR: case MSSR: case TSR: case TSR + 1: return; // read only
      case EIFR: this.eifr &= b; return; // a 0 clears a flag, a 1 leaves it (assumed)
      case ECSR: this.ecsr = (this.ecsr & b & 0x7f) | (b & 0x80); return; // error flags: 0 clears; EDPM as written
      case MSMR: this.msmr = b & 3; return;
      case TCR: this.tcr = b & 7; return;
      default: this.mem[a] = b;
    }
  }
  ctlrWritten(before) {
    if (this.ctlr & 0x20) { this.ctlr &= ~0x20; this.tsBase = this.soc.nowUs(); } // TSRC: the counter restarts, the bit reads 0
    if (this.ctlr & 0x400 && this.canm === 0) this.ctlr &= ~0x400; // SLPM in CAN operation mode: ignored (assumed)
    const wasReset = (before >> 8) & 1, isReset = this.canm & 1;
    if (isReset && !wasReset) this.enterReset();
  }
  enterReset() {
    for (const m of this.mctl) Object.assign(m, { flag: 0, lost: 0, oneshot: 0, recreq: 0, trmreq: 0, active: 0 });
    if (this.busy?.from === 'board') this.busy.dropped = true;
    this.eifr = 0; this.msmr = 0; this.ecsr &= 0x80; this.tsBase = this.soc.nowUs();
  }
  mctlWrite(j, b) {
    const m = this.mctl[j], hadTrm = m.trmreq;
    if (!(b & 1) && (m.recreq || !hadTrm)) m.flag = 0;
    if (!(b & 4)) m.lost = 0;
    m.oneshot = (b >> 4) & 1; m.recreq = (b >> 6) & 1; m.trmreq = m.recreq ? 0 : (b >> 7) & 1;
  }
  // ------------------------------------------------------------ the bus
  frameOf(j) {
    const id = this.dv.getUint32(MB + 16 * j, true), idfm = this.idfm, extended = idfm === 1 || idfm === 2 && !!(id >>> 31);
    // A remote frame carries no data.
    const remote = !!(id & 0x40000000), dlc = this.mem[MB + 16 * j + 4] & 0xf, data = remote ? [] : [...this.mem.subarray(MB + 16 * j + 6, MB + 16 * j + 6 + Math.min(8, dlc))];
    return { id: extended ? id & 0x1fffffff : (id >>> 18) & 0x7ff, extended, remote, dlc, data };
  }
  /** The transmit mailbox that wins the bus next, or -1. */
  nextMailbox() {
    let best = -1, key = Infinity;
    for (let j = 0; j < 32; j++) {
      const m = this.mctl[j]; if (!m.trmreq || m.recreq || m.flag || m.active) continue;
      const k = this.ctlr & 0x10 ? j : arbitration(this.frameOf(j));
      if (k < key) { key = k; best = j; }
    }
    return best;
  }
  /** Starts the next frame when the bus is free: the board's best mailbox or the node's next frame, by arbitration. */
  kick() {
    if (this.busy) return;
    const bit = this.bitUs();
    if (!bit) return;
    const sends = !this.stopped() && this.mode === 'operation' && this.test !== 'listen';
    const j = sends ? this.nextMailbox() : -1, board = j >= 0 ? this.frameOf(j) : null, node = this.node.queue[0] ?? null;
    let pick = null;
    if (board && (!node || arbitration(board) <= arbitration(node))) pick = { from: 'board', mailbox: j, frame: board };
    else if (node) { this.node.queue.shift(); pick = { from: 'node', frame: node }; }
    if (!pick) return;
    if (pick.from === 'board') this.mctl[j].active = 1;
    const gen = this.gen; this.busy = pick;
    this.soc.after(canFrameBits(pick.frame) * bit, () => { if (gen === this.gen && this.busy === pick) this.finish(pick); });
  }
  finish(f) {
    this.busy = null;
    // The mailbox is no longer on the bus, whether or not the module was stopped meanwhile.
    if (f.from === 'board') this.mctl[f.mailbox].active = 0;
    if (f.from === 'board' && !f.dropped && !this.stopped()) {
      const m = this.mctl[f.mailbox];
      const test = this.test;
      if (test === 'internal' || test === 'external') this.receive(f.frame);
      if (test !== 'internal') this.node.heard(f.frame);
      if (m.trmreq) { m.flag = 1; if (this.mier(f.mailbox)) this.soc.raiseEvent(CAN_EVENT.MAILBOX_TX); }
    } else if (f.from === 'node' && this.hearsBus()) this.receive(f.frame);
    this.kick();
  }
  mier(j) { return !!(this.dv.getUint32(MIER, true) & (1 << j)); }
  /** A frame on the bus at its end: into the first receive mailbox that accepts it. */
  receive(f) {
    const idfm = this.idfm, mkivlr = this.dv.getUint32(MKIVLR, true);
    for (let j = 0; j < 32; j++) {
      const m = this.mctl[j]; if (!m.recreq) continue;
      const reg = this.dv.getUint32(MB + 16 * j, true), ext = idfm === 1 || idfm === 2 && !!(reg >>> 31);
      if (ext !== f.extended || !!(reg & 0x40000000) !== f.remote) continue;
      const mask = mkivlr & (1 << j) ? 0x1fffffff : this.dv.getUint32(MKR + 4 * (j >> 2), true) & 0x1fffffff;
      const rx = f.extended ? f.id & 0x1fffffff : (f.id & 0x7ff) << 18, own = ext ? reg & 0x1fffffff : reg & 0x1ffc0000;
      if (((rx ^ own) & (f.extended ? mask : mask & 0x1ffc0000)) !== 0) continue;
      if (m.flag) {
        m.lost = 1;
        if (this.ctlr & 0x08) { this.eifr |= 0x20; if (this.mem[EIER] & 0x20) this.soc.raiseEvent(CAN_EVENT.ERROR); return j; } // overrun: dropped
      }
      this.store(j, f); m.flag = 1;
      if (this.mier(j)) this.soc.raiseEvent(CAN_EVENT.MAILBOX_RX);
      return j;
    }
    return -1;
  }
  store(j, f) {
    const base = MB + 16 * j, idfm = this.idfm;
    const id = (f.extended ? f.id & 0x1fffffff : (f.id & 0x7ff) << 18) | (f.remote ? 0x40000000 : 0) | (idfm === 2 && f.extended ? 0x80000000 : 0);
    this.dv.setUint32(base, id >>> 0, true); this.dv.setUint16(base + 4, f.dlc & 0xf, true);
    // (a remote frame: the ID and the DLC only, the data bytes stay as they were)
    if (!f.remote) f.data.slice(0, 8).forEach((b, i) => { this.mem[base + 6 + i] = b; });
    this.dv.setUint16(base + 14, this.tsr(), true);
  }
}

// The other node on the bus: it acknowledges every frame, keeps what the board sent as lines for the serial monitor, and
// puts the frames typed there on the bus. Its bit rate is the board's. What it shows stays across a reset of the board;
// what it had not sent yet is dropped.
export class CanNode {
  constructor(can) { this.can = can; this.output = []; this.queue = []; }
  reset() { this.queue = []; }
  heard(f) { this.output.push(formatCanFrame(f)); if (this.output.length > OUTPUT_LINES) this.output.splice(0, this.output.length - OUTPUT_LINES); }
  /** A line typed in the serial monitor: the frame goes on the bus (lost when the board does not hear the bus); 0 when the
   *  line is not a frame, else the line's length. */
  send(text) {
    const f = parseCanLine(text); if (!f) return 0;
    // At most OUTPUT_LINES frames wait (the oldest goes first).
    if (this.can.hearsBus()) { this.queue.push(f); if (this.queue.length > OUTPUT_LINES) this.queue.splice(0, this.queue.length - OUTPUT_LINES); this.can.kick(); }
    return String(text).length;
  }
}
