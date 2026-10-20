import { Peripheral, bit, field } from './core.js';
import { UartReceiver } from './signals.js';
import { IRQ } from './tables.js';

// USART1/2/3/6 and UART4/5 (RM0390 section 25): asynchronous frames with
// baud from BRR and the APB clock, status flags, interrupts, DMA requests and
// synchronous master mode (CLKEN) clocking a CK pin.
const SR = 0x00, DR = 0x04, BRR = 0x08, CR1 = 0x0c, CR2 = 0x10, CR3 = 0x14, GTPR = 0x18;
const APB2 = new Set(['USART1', 'USART6']);

export class Usart extends Peripheral {
  constructor(soc, name) {
    super(soc, name);
    this.synchronous = name.startsWith('USART');
    this.reset();
    this.receiver = new UartReceiver(soc.signals, soc, {
      sources: () => this.rxSources(),
      config: () => this.rxConfig(),
      onFrame: f => this.received(f),
      onIdle: () => { if (this.rxEnabled()) { this.setBits(SR, 1 << 4); this.updateIrq(); } },
    });
  }
  reset() {
    super.reset();
    this.set(SR, 0x00c0);
    this.txBusy = false; this.txPending = null; this.txEvent?.cancel(); this.txEvent = null;
    this.rdr = 0; this.srRead = false; this.stats = { tx: 0, rx: 0, errors: 0 };
    this.publishTx();
  }
  pclk() { return APB2.has(this.name) ? this.soc.clock.pclk2 : this.soc.clock.pclk1; }
  baud() {
    const brr = this.get(BRR) & 0xffff; if (!brr) return 0;
    if (bit(this.get(CR1), 15)) { const div = (brr >> 4) + (brr & 7) / 8; return this.pclk() / (8 * div); }
    return this.pclk() / brr;
  }
  frameBits() { return bit(this.get(CR1), 12) ? 9 : 8; }
  stopBits() { return [1, 0.5, 2, 1.5][field(this.get(CR2), 12, 2)]; }
  parity() { return bit(this.get(CR1), 10) ? (bit(this.get(CR1), 9) ? 'odd' : 'even') : 'none'; }
  enabled() { return !!bit(this.get(CR1), 13); }
  txEnabled() { return this.enabled() && !!bit(this.get(CR1), 3); }
  rxEnabled() { return this.enabled() && !!bit(this.get(CR1), 2); }
  syncMode() { return this.synchronous && !!bit(this.get(CR2), 11); }
  frameUs() { const b = this.baud(); return b ? (1 + this.frameBits() + this.stopBits()) * 1e6 / b : 0; }
  // ------------------------------------------------------------- pins
  txPins() { return this.soc.routedPins(this.name + '_TX'); }
  rxPins() { return this.soc.routedPins(this.name + '_RX'); }
  afOutput(role) {
    if (role === 'TX') return this.txEnabled() ? { level: 1 } : null;
    if (role === 'CK') return this.syncMode() && this.txEnabled() ? { level: bit(this.get(CR2), 10) } : null;
    if (role === 'RTS') return this.enabled() ? { level: 0 } : null;
    return null;
  }
  publishTx() { this.soc.afChanged?.(this.name + '_TX'); this.soc.afChanged?.(this.name + '_CK'); }
  rxSources() {
    if (!this.rxEnabled() || this.syncMode()) return [];
    const pins = this.rxPins(); if (!pins.length) return [];
    return this.soc.lineSources(pins[0]);
  }
  rxConfig() {
    const baud = this.baud(); if (!baud || !this.rxEnabled()) return null;
    return { baud, dataBits: this.frameBits(), parity: this.parity(), stopBits: this.stopBits() };
  }
  // ------------------------------------------------------------- registers
  readReg(off) {
    if (off === SR) { this.srRead = true; return this.get(SR); }
    if (off === DR) {
      const sr = this.get(SR);
      // Reading DR clears RXNE; after an SR read it also clears PE/FE/NF/ORE/IDLE.
      let clear = 1 << 5; if (this.srRead) clear |= 0x1f;
      this.set(SR, sr & ~clear); this.srRead = false;
      this.updateIrq(); this.dmaLines();
      if (this.lastRx !== undefined) { this.soc.uartEvent?.({ instance: this.name, direction: 'RX', bytes: [this.rdr & 0xff], micros: this.soc.nowUs() }); this.lastRx = undefined; }
      return this.rdr;
    }
    return this.get(off);
  }
  writeReg(off, value, mask) {
    const old = this.get(off), v = this.merge(off, value, mask);
    switch (off) {
      case SR: { // rc_w0 for CTS, LBD, TC, RXNE
        const clearable = 0x0360, keep = (old & ~clearable) | (old & v & clearable);
        this.set(SR, keep); this.updateIrq(); this.dmaLines(); return;
      }
      case DR: {
        this.srRead = false;
        if (!this.txEnabled()) return;
        this.clearBits(SR, 0xc0);
        this.txPending = v & 0x1ff;
        this.startTx();
        this.updateIrq(); this.dmaLines(); return;
      }
      case CR1: {
        this.set(CR1, v);
        const teOn = bit(v, 3) && bit(v, 13), wasOn = bit(old, 3) && bit(old, 13);
        if (teOn && !wasOn && !this.txBusy) this.idlePreamble();
        if (bit(v, 0) && !bit(old, 0)) this.sendBreak();
        if (!this.rxEnabled()) { this.clearBits(SR, 0x3f); }
        else if (!(bit(old, 2) && bit(old, 13))) this.receiver.start(this.soc.nowUs());
        this.publishTx(); break;
      }
      case CR2: this.set(CR2, v); this.publishTx(); break;
      default: this.set(off, v);
    }
    this.updateIrq(); this.dmaLines();
  }
  // ------------------------------------------------------------- transmit
  idlePreamble() {
    this.txBusy = true;
    this.txEvent = this.soc.after(this.frameUs() || 1, () => { this.txBusy = false; this.txEvent = null; this.startTx(); if (this.txPending == null) { this.setBits(SR, 0x40); this.updateIrq(); } });
  }
  sendBreak() {
    if (!this.txEnabled()) return;
    const t = this.soc.nowUs(), bitUs = 1e6 / (this.baud() || 9600);
    for (const pin of this.txPins()) { const line = this.soc.signals.line(pin); line.protocol ??= 'uart'; this.soc.signals.drive(line, t, [[bitUs * (this.frameBits() + 1), 0], [bitUs, 1]], { noisy: false }); }
    this.soc.after(bitUs * (this.frameBits() + 2), () => { this.clearBits(CR1, 1); });
  }
  startTx() {
    if (this.txBusy || this.txPending == null) return;
    const data = this.txPending; this.txPending = null;
    this.setBits(SR, 0x80); // DR -> shift register: TXE
    this.txBusy = true;
    const baud = this.baud() || 9600, t0 = this.soc.nowUs(), n = this.frameBits();
    // Frame bits: with parity enabled the MSB of the frame is the parity bit.
    let frame = data & ((1 << n) - 1);
    if (this.parity() !== 'none') {
      const dataBits = n - 1, payload = data & ((1 << dataBits) - 1);
      let ones = 0; for (let i = 0; i < dataBits; i++) ones += (payload >> i) & 1;
      const p = this.parity() === 'even' ? ones & 1 : (ones & 1) ^ 1;
      frame = payload | (p << dataBits);
    }
    const end = this.syncMode() ? this.syncTransfer(frame, t0, baud) : this.asyncTransfer(frame, t0, baud);
    this.txEvent = this.soc.atUs(end, () => {
      this.txEvent = null; this.txBusy = false; this.stats.tx++;
      const byte = this.parity() !== 'none' ? frame & ((1 << (n - 1)) - 1) : frame & 0xff;
      this.soc.uartEvent?.({ instance: this.name, direction: 'TX', bytes: [byte & 0xff], micros: this.soc.nowUs() });
      if (this.txPending != null) this.startTx();
      else this.setBits(SR, 0x40); // TC
      this.updateIrq(); this.dmaLines();
    });
    this.updateIrq(); this.dmaLines();
  }
  asyncTransfer(frame, t0, baud) {
    let end = t0 + (1 + this.frameBits() + this.stopBits()) * 1e6 / baud;
    for (const pin of this.txPins()) {
      this.soc.signals.channel(`${this.name}_TX`, `${this.name} TX`, 'uart', [{ id: pin, label: `TX (${pin})`, role: 'tx' }]);
      end = Math.max(end, this.soc.signals.uartFrame(this.soc.signals.line(pin), t0, frame, { baud, dataBits: this.frameBits(), stopBits: this.stopBits(), parity: this.parity() }));
    }
    return end;
  }
  // Synchronous master: CK pulses for each data bit (LBCL adds the last one);
  // the connected device answers through the env hook, data is LSB first.
  syncTransfer(frame, t0, baud) {
    const n = this.frameBits(), bitUs = 1e6 / baud, cpol = bit(this.get(CR2), 10), cpha = bit(this.get(CR2), 9), lbcl = bit(this.get(CR2), 8);
    const sig = this.soc.signals, [txPin] = this.txPins(), [ckPin] = this.soc.routedPins(this.name + '_CK'), [rxPin] = this.rxPins();
    let answer = this.soc.usartSync?.(this.name, { tx: txPin, rx: rxPin, ck: ckPin, cpol, cpha }, frame & 0xff) ?? 0xff;
    let rxValue = 0;
    for (let i = 0; i < 8; i++) { let b = (answer >> i) & 1; if (sig.flip()) b ^= 1; rxValue |= b << i; }
    if (txPin) sig.uartFrame(sig.line(txPin), t0, frame, { baud, dataBits: n, stopBits: this.stopBits() });
    if (ckPin) {
      const ck = sig.line(ckPin, cpol); ck.protocol ??= 'usart-sync';
      const cells = [[bitUs * (cpha ? 1 : 1.5), cpol]];
      for (let i = 0; i < n; i++) { const last = i === n - 1; if (last && !lbcl) { cells.push([bitUs, cpol]); break; } cells.push([bitUs / 2, cpol ^ 1], [bitUs / 2, cpol]); }
      sig.drive(ck, t0, cells, { noisy: false });
    }
    if (rxPin) { const rx = sig.line(rxPin + ':miso'); rx.protocol ??= 'usart-sync'; sig.uartFrame(rx, t0, rxValue, { baud, dataBits: 8, stopBits: 1 }); }
    if (this.rxEnabled()) this.soc.atUs(t0 + (1 + n) * bitUs, () => this.storeRx(rxValue, {}));
    sig.channel(this.name + '_SYNC', this.name + ' 동기', 'usart-sync', [{ id: ckPin, label: `CK (${ckPin})`, role: 'ck' }, { id: txPin, label: `TX (${txPin})`, role: 'tx' }, { id: rxPin ? rxPin + ':miso' : null, label: `RX (${rxPin})`, role: 'rx' }], { cpol, cpha, bits: 8, lsbFirst: true });
    return t0 + (1 + n + this.stopBits()) * bitUs;
  }
  // ------------------------------------------------------------- receive
  received(f) {
    if (!this.rxEnabled()) return;
    const n = this.frameBits();
    let value = f.value & ((1 << n) - 1);
    if (this.parity() !== 'none') value &= (1 << (n - 1)) - 1;
    this.storeRx(value, f);
  }
  storeRx(value, f) {
    const sr = this.get(SR);
    if (bit(sr, 5)) { this.setBits(SR, 1 << 3); this.stats.errors++; this.updateIrq(); return; } // ORE: data lost
    this.rdr = value; this.lastRx = value; this.stats.rx++;
    let flags = 1 << 5;
    if (f.parityError) flags |= 1; if (f.framingError) flags |= 2; if (f.noise) flags |= 4;
    if (flags & 7) this.stats.errors++;
    this.setBits(SR, flags);
    this.updateIrq(); this.dmaLines();
  }
  // ------------------------------------------------------------- irq / dma
  updateIrq() {
    const sr = this.get(SR), cr1 = this.get(CR1), cr3 = this.get(CR3);
    const on = (bit(cr1, 7) && bit(sr, 7)) || (bit(cr1, 6) && bit(sr, 6)) || (bit(cr1, 5) && (bit(sr, 5) || bit(sr, 3))) ||
      (bit(cr1, 4) && bit(sr, 4)) || (bit(cr1, 8) && bit(sr, 0)) || (bit(cr3, 0) && bit(cr3, 6) && (sr & 0x0e));
    this.soc.irqNumber(IRQ[this.name], this.name, !!on);
  }
  dmaLines() {
    const sr = this.get(SR), cr3 = this.get(CR3);
    this.soc.dmaLine(this.name + '_TX', !!(bit(cr3, 7) && bit(sr, 7) && this.txEnabled()));
    this.soc.dmaLine(this.name + '_RX', !!(bit(cr3, 6) && bit(sr, 5)));
  }
}
