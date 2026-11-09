import { Peripheral, bit, field } from './core.js';

// DAC1 with two 12-bit channels (RM0390 14): OUT1 on PA4, OUT2 on PA5, VREF+ = 3.3 V.
// CR holds per channel (channel 2 shifted by 16): EN 0, BOFF 1, TEN 2, TSEL 5:3, WAVE 7:6, MAMP 11:8, DMAEN 12.
// Data written to a DHR register reaches DOR (and the pin) at once without a trigger (TEN = 0), or at the selected
// trigger: TIM6/8/7/5/2/4 TRGO, EXTI line 9 or SWTRIGR. A triggered conversion may add the noise (LFSR) or triangle
// wave and asks DMA (DAC1 = DMA1 stream 5, DAC2 = stream 6, channel 7) for the next DHR value.
const TSEL = ['TIM6_TRGO', 'TIM8_TRGO', 'TIM7_TRGO', 'TIM5_TRGO', 'TIM2_TRGO', 'TIM4_TRGO', 'EXTI9', 'SWTRIG'];
const PINS = ['PA4', 'PA5'];
export class Dac extends Peripheral {
  constructor(soc) { super(soc, 'DAC'); this.reset(); }
  reset() {
    super.reset();
    this.dhr = [0, 0]; this.dor = [0, 0]; this.lfsr = [0xaaa, 0xaaa]; this.tri = [{ v: 0, up: true }, { v: 0, up: true }];
    this.publish();
  }
  cfg(ch) { const cr = this.get(0) >>> (16 * ch); return { en: bit(cr, 0), ten: bit(cr, 2), tsel: field(cr, 3, 3), wave: field(cr, 6, 2), mamp: field(cr, 8, 4), dmaen: bit(cr, 12) }; }
  readReg(off) {
    if (off === 0x2c) return this.dor[0];
    if (off === 0x30) return this.dor[1];
    return this.get(off);
  }
  writeReg(off, value, mask) {
    const v = this.merge(off, value, mask);
    switch (off) {
      case 0x00: {
        const old = this.get(0); this.set(0, v & 0x3fff3fff);
        for (const ch of [0, 1]) if (bit(v, 16 * ch) && !bit(old, 16 * ch)) { this.tri[ch] = { v: 0, up: true }; if (!this.cfg(ch).ten) this.dor[ch] = this.dhr[ch]; }
        this.publish(); this.soc.triggersChanged?.();
        return;
      }
      case 0x04: for (const ch of [0, 1]) { const c = this.cfg(ch); if (bit(v, ch) && c.en && c.ten && c.tsel === 7) this.convert(ch); } return; // SWTRIGR clears itself
      case 0x08: this.load(0, v & 0xfff, off, v); return;               // DHR12R1
      case 0x0c: this.load(0, (v >>> 4) & 0xfff, off, v); return;       // DHR12L1
      case 0x10: this.load(0, (v & 0xff) << 4, off, v); return;         // DHR8R1
      case 0x14: this.load(1, v & 0xfff, off, v); return;               // DHR12R2
      case 0x18: this.load(1, (v >>> 4) & 0xfff, off, v); return;       // DHR12L2
      case 0x1c: this.load(1, (v & 0xff) << 4, off, v); return;         // DHR8R2
      case 0x20: this.load(0, v & 0xfff, off, v); this.load(1, (v >>> 16) & 0xfff); return;               // DHR12RD
      case 0x24: this.load(0, (v >>> 4) & 0xfff, off, v); this.load(1, (v >>> 20) & 0xfff); return;      // DHR12LD
      case 0x28: this.load(0, (v & 0xff) << 4, off, v); this.load(1, ((v >>> 8) & 0xff) << 4); return;    // DHR8RD
      case 0x34: this.set(0x34, this.get(0x34) & ~v); return;           // DMAUDR flags: write 1 to clear
      default: this.set(off, v);
    }
  }
  load(ch, val, off, raw) {
    if (off !== undefined) this.set(off, raw);
    this.dhr[ch] = val;
    if (this.cfg(ch).en && !this.cfg(ch).ten) { this.dor[ch] = val; this.publish(); }
  }
  convert(ch) {
    const c = this.cfg(ch), mask = (1 << (c.mamp + 1)) - 1;
    let v = this.dhr[ch];
    if (c.wave === 1) {
      // 12-bit LFSR X^12 + X^6 + X^4 + X + 1, preloaded with 0xAAA; MAMP unmasks bits 0..n.
      const l = this.lfsr[ch], fb = ((l >> 11) ^ (l >> 5) ^ (l >> 3) ^ l) & 1;
      this.lfsr[ch] = ((l << 1) | fb) & 0xfff; v = Math.min(0xfff, v + (this.lfsr[ch] & mask));
    } else if (c.wave >= 2) {
      // Triangle: a counter added to DHR goes 0 → 2^(n+1)-1 → 0, one step per trigger.
      const t = this.tri[ch]; v = Math.min(0xfff, v + t.v);
      if (t.up) { if (t.v >= mask) { t.up = false; t.v--; } else t.v++; } else if (t.v <= 0) { t.up = true; t.v++; } else t.v--;
    }
    this.dor[ch] = v; this.publish();
    if (c.dmaen) this.soc.defer(() => this.soc.dmaPulse(ch ? 'DAC2' : 'DAC1'));
  }
  trigger(name) { for (const ch of [0, 1]) { const c = this.cfg(ch); if (c.en && c.ten && TSEL[c.tsel] === name) this.convert(ch); } }
  wants(name) { return [0, 1].some(ch => { const c = this.cfg(ch); return c.en && c.ten && TSEL[c.tsel] === name; }); }
  // Output voltage on PA4 / PA5 while the channel is on (null: not driven by the DAC).
  output(pin) { const ch = PINS.indexOf(pin); return ch >= 0 && this.cfg(ch).en ? this.dor[ch] / 4095 * 3.3 : null; }
  publish() { this.soc.gpio?.A?.publish((1 << 4) | (1 << 5)); }
}
