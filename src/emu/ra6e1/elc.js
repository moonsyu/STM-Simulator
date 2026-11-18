// RA6E1 Event Link Controller (ELC) as FSP r_elc drives it (RA6E1 User's Manual 18 Event Link Controller; register
// offsets from R7FA6E10F.h R_ELC_Type): ELCR (ELCON b7) at 0x00, ELSEGR0/1 (software events: WI b7, WE b6, SEG b0) at 0x02 /
// 0x04, ELSRn (ELS b8:0, one per elc_peripheral_t) at 0x10 + 4n.
//
// An event a peripheral raises (soc.raiseEvent) reaches the ELSRn slots that select it while ELCON is set. The modelled
// consumer is ADC0 (ELSR8, ELC_PERIPHERAL_ADC0: the group A start trigger ADSTRGR.TRSA = ELC_AD0); a link to another
// peripheral (GPT start/stop, ADC group B, DAC, I/O ports) is kept as written and does nothing.
// R_ELC_SoftwareEventGenerate writes ELSEGRn 0x00 → 0x40 → 0x41: the SEG write with WE set raises
// ELC_SOFTWARE_EVENT_n (0xB5 + n), which goes to every consumer of events (ICU, DTC, DMAC, other ELC links).
export const ELC_SOFTWARE_EVENT = n => 0xb5 + n;
const ELSR_COUNT = 23;

export class Elc {
  constructor(soc) { this.soc = soc; this.name = 'ELC'; this.size = 0x80; this.reset(); }
  reset() { this.elcr = 0; this.elsegr = [0, 0]; this.elsr = new Uint16Array(ELSR_COUNT); this.links = 0; }
  enabled() { return !!(this.elcr & 0x80); }
  /** Whether a link takes `event` (a model schedules an event only when something consumes it). */
  listens(event) { return this.enabled() && this.elsr.includes(event); }
  event(event) {
    if (!this.enabled()) return;
    for (let n = 0; n < ELSR_COUNT; n++) if (this.elsr[n] === event) this.deliver(n);
  }
  deliver(n) {
    this.links++;
    if (n === 8) this.soc.adc0.elcTrigger('A');
  }
  read(off, size) {
    this.soc.sync();
    if (off === 0x00) return this.elcr;
    if (off === 0x02 || off === 0x04) return this.elsegr[(off - 2) >> 1];
    if (off >= 0x10 && off < 0x10 + ELSR_COUNT * 4) { const v = (off & 3) === 0 ? this.elsr[(off - 0x10) >> 2] : 0; return size === 1 ? v & 0xff : v; }
    return 0;
  }
  peek(off, size) { return this.read(off, size); }
  write(off, v, size) {
    this.soc.sync();
    if (off === 0x00) { this.elcr = v & 0x80; this.soc.listenersChanged?.(); return; }
    if (off === 0x02 || off === 0x04) {
      // WE can be changed only while WI is written 0; SEG takes a 1 only while WE is already set (r_elc's three writes).
      const n = (off - 2) >> 1, old = this.elsegr[n];
      if (v & 0x80) return;
      const generate = (v & 0x40) && (old & 0x40) && (v & 1);
      this.elsegr[n] = v & 0x40;
      if (generate) this.soc.raiseEvent(ELC_SOFTWARE_EVENT(n));
      return;
    }
    if (off >= 0x10 && off < 0x10 + ELSR_COUNT * 4 && (off & 3) === 0) { this.elsr[(off - 0x10) >> 2] = v & 0x1ff; this.soc.listenersChanged?.(); }
    void size;
  }
}
