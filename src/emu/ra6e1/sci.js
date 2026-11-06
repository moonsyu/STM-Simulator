// RA6E1 SCI in asynchronous mode (UART), as FSP's r_sci_uart drives it without FIFO or DTC (RA6E1 User's Manual
// 28 Serial Communications Interface): SMR (CHR, PE/PM, STOP, CKS), BRR, SEMR (ABCS, ABCSE, BGDM, BRME), MDDR, SCR
// (TIE, RIE, TE, RE, TEIE), SSR (TDRE, RDRF, ORER, FER, PER, TEND), TDR/RDR. TXI is requested when TDR moves to the
// shift register (TDRE = 1), TEI when the last frame has gone (TEND with TEIE), RXI when RDR fills, ERI on errors;
// each request sets the IELSR slot linked to it (ICU). Frames are drawn on the TXD pin's signal line and read from
// the lines driving RXD, the same way as the STM32 USART model (logic analyzer, UART parts, other boards).
import { UartReceiver } from '../stm32f446/signals.js';

const SMR = 0x00, BRR = 0x01, SCR = 0x02, TDR = 0x03, SSR = 0x04, RDR = 0x05, SEMR = 0x07, MDDR = 0x12;
const TDRE = 0x80, RDRF = 0x40, ORER = 0x20, FER = 0x10, PER = 0x08, TEND = 0x04;
// ELC events (FSP bsp_elc.h, RA6E1): RXI, TXI, TEI, ERI of each channel.
export const SCI_EVENTS = { 0: 0x180, 1: 0x186, 2: 0x18c, 3: 0x192, 4: 0x198, 9: 0x1b6 };

export class Sci {
  constructor(soc, channel) {
    this.soc = soc; this.channel = channel; this.name = 'SCI' + channel; this.size = 0x100;
    this.reset();
    this.receiver = new UartReceiver(soc.signals, soc, { sources: () => this.rxSources(), config: () => this.rxConfig(), onFrame: f => this.received(f) });
  }
  reset() {
    this.r = new Uint8Array(0x40); this.r[SSR] = TDRE | TEND; this.r[BRR] = 0xff; this.r[MDDR] = 0xff;
    this.txBusy = false; this.txPending = null; this.txEvent?.cancel?.(); this.txEvent = null; this.rdr = 0; this.stats = { tx: 0, rx: 0 };
  }
  scr() { return this.r[SCR]; }
  txEnabled() { return !!(this.scr() & 0x20); }
  rxEnabled() { return !!(this.scr() & 0x10); }
  // Asynchronous baud: PCLKA / (C x 2^(2n-1) x (N+1)), C = 64 (ABCS = BGDM = 0), 32 with one, 16 with both, 12 with
  // ABCSE; BRME scales by MDDR / 256.
  baud() {
    const n = this.r[SMR] & 3, N = this.r[BRR], semr = this.r[SEMR], abcs = (semr >> 4) & 1, bgdm = (semr >> 6) & 1, abcse = (semr >> 3) & 1;
    const c = abcse ? 12 : 64 >> (abcs + bgdm), pclk = this.soc.clock.pclka;
    let b = pclk / (c * 2 ** (2 * n - 1) * (N + 1));
    if ((semr >> 2) & 1) b *= this.r[MDDR] / 256;
    return b;
  }
  dataBits() { const smr = this.r[SMR]; return smr & 0x40 ? 7 : 8; }
  parity() { const smr = this.r[SMR]; return smr & 0x20 ? (smr & 0x10 ? 'odd' : 'even') : 'none'; }
  stopBits() { return this.r[SMR] & 0x08 ? 2 : 1; }
  frameBits() { return this.dataBits() + (this.parity() === 'none' ? 0 : 1); }
  frameUs() { const b = this.baud(); return b ? (1 + this.frameBits() + this.stopBits()) * 1e6 / b : 0; }
  txPins() { return this.soc.routedPins(this.name + '_TXD'); }
  rxPins() { return this.soc.routedPins(this.name + '_RXD'); }
  output(role) { return role === 'TXD' && this.txEnabled() ? { level: 1 } : null; }
  rxSources() { if (!this.rxEnabled()) return []; const [pin] = this.rxPins(); return pin ? this.soc.lineSources(pin) : []; }
  rxConfig() { const baud = this.baud(); return baud && this.rxEnabled() ? { baud, dataBits: this.frameBits(), parity: this.parity(), stopBits: this.stopBits() } : null; }
  event(k) { this.soc.icu.raise(SCI_EVENTS[this.channel] + k); } // 0 RXI, 1 TXI, 2 TEI, 3 ERI
  read(off, size) {
    this.soc.sync();
    if (size !== 1) return off === 0x0e || off === 0x10 ? (off === 0x10 ? this.readRdr() : 0) : this.r[off] | (this.r[off + 1] << 8);
    if (off === RDR) return this.readRdr();
    return this.r[off];
  }
  peek(off) { return off === RDR ? this.rdr : this.r[off]; }
  readRdr() {
    this.r[SSR] &= ~RDRF;
    if (this.lastRx !== undefined) { this.soc.uartEvent?.({ instance: this.name, direction: 'RX', bytes: [this.rdr & 0xff], micros: this.soc.nowUs() }); this.lastRx = undefined; }
    return this.rdr;
  }
  write(off, v, size) {
    this.soc.sync();
    if (size === 2 && off === 0x0e) { this.writeTdr(v & 0x1ff); return; }
    if (size !== 1) { this.r[off] = v & 0xff; this.r[off + 1] = (v >> 8) & 0xff; return; }
    const old = this.r[off];
    switch (off) {
      case TDR: this.writeTdr(v & 0xff); return;
      case SSR: { // error flags and RDRF clear by writing 0 (TDRE/TEND are read-only in this mode)
        const clearable = RDRF | ORER | FER | PER; this.r[SSR] = (old & ~clearable) | (old & v & clearable); return;
      }
      case SCR: {
        this.r[SCR] = v & 0xff;
        if (this.rxEnabled() && !(old & 0x10)) this.receiver.start(this.soc.nowUs());
        if (!this.txEnabled()) { this.r[SSR] |= TDRE | TEND; this.txPending = null; }
        // TXI is an event of the TDR → shift register transfer (r_sci_uart writes the first byte after setting TIE for
        // that reason); TEIE set after the last frame has gone requests TEI at once.
        if ((v & 0x04) && !(old & 0x04) && (this.r[SSR] & TEND) && this.txEnabled() && !this.txBusy && this.txPending == null) this.event(2);
        if ((v & 0x20) !== (old & 0x20)) this.soc.peripheralChanged?.(this.name);
        return;
      }
      default: this.r[off] = v & 0xff;
    }
  }
  writeTdr(data) {
    if (!this.txEnabled()) return;
    this.r[SSR] &= ~(TDRE | TEND);
    this.txPending = data;
    this.startTx();
  }
  startTx() {
    if (this.txBusy || this.txPending == null) return;
    const data = this.txPending, n = this.dataBits(); this.txPending = null;
    this.r[SSR] |= TDRE; this.txBusy = true;
    const baud = this.baud() || 9600, t0 = this.soc.nowUs();
    let frame = data & ((1 << n) - 1);
    if (this.parity() !== 'none') { let ones = 0; for (let i = 0; i < n; i++) ones += (frame >> i) & 1; frame |= ((this.parity() === 'even' ? ones & 1 : (ones & 1) ^ 1) << n); }
    let end = t0 + this.frameUs();
    for (const pin of this.txPins()) {
      this.soc.signals.channel(`${this.name}_TXD`, `${this.name} TXD`, 'uart', [{ id: pin, label: `TXD (${pin})`, role: 'tx' }]);
      end = Math.max(end, this.soc.signals.uartFrame(this.soc.signals.line(pin), t0, frame, { baud, dataBits: this.frameBits(), stopBits: this.stopBits(), parity: this.parity() }));
    }
    if (this.scr() & 0x80) this.event(1); // TDR → shift register: TXI
    this.txEvent = this.soc.atUs(end, () => {
      this.txEvent = null; this.txBusy = false; this.stats.tx++;
      this.soc.uartEvent?.({ instance: this.name, direction: 'TX', bytes: [data & 0xff], micros: this.soc.nowUs() });
      if (this.txPending != null) this.startTx();
      else { this.r[SSR] |= TEND; if (this.scr() & 0x04) this.event(2); }
    });
  }
  received(f) {
    if (!this.rxEnabled()) return;
    this.stats.rx++;
    if (this.r[SSR] & RDRF) { this.r[SSR] |= ORER; if (this.scr() & 0x40) this.event(3); return; }
    this.rdr = f.value & 0xff; this.lastRx = this.rdr;
    if (f.framingError) this.r[SSR] |= FER;
    if (f.parityError) this.r[SSR] |= PER;
    this.r[SSR] |= RDRF;
    if (this.scr() & 0x40) this.event(f.framingError || f.parityError ? 3 : 0);
  }
}
