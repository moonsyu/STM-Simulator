import { Peripheral, bit, field } from './core.js';

// RCC (RM0390 section 6). Oscillator ready flags follow ON bits after short
// delays, SYSCLK switches only to a ready source, and every bus frequency change
// updates machine.clock and the SoC time base.
export const HSI_HZ = 16e6, HSE_HZ = 8e6, LSE_HZ = 32768, LSI_HZ = 32000;

const ENABLE_BITS = {
  0x30: { GPIOA: 0, GPIOB: 1, GPIOC: 2, GPIOD: 3, GPIOE: 4, GPIOF: 5, GPIOG: 6, GPIOH: 7, CRC: 12, BKPSRAM: 18, DMA1: 21, DMA2: 22, OTGHS: 29 },
  0x34: { DCMI: 0, OTGFS: 7 },
  0x38: { FMC: 0, QSPI: 1 },
  0x40: { TIM2: 0, TIM3: 1, TIM4: 2, TIM5: 3, TIM6: 4, TIM7: 5, TIM12: 6, TIM13: 7, TIM14: 8, WWDG: 11, SPI2: 14, SPI3: 15, SPDIFRX: 16, USART2: 17, USART3: 18, UART4: 19, UART5: 20, I2C1: 21, I2C2: 22, I2C3: 23, FMPI2C1: 24, CAN1: 25, CAN2: 26, CEC: 27, PWR: 28, DAC: 29 },
  0x44: { TIM1: 0, TIM8: 1, USART1: 4, USART6: 5, ADC1: 8, ADC2: 9, ADC3: 10, SDIO: 11, SPI1: 12, SPI4: 13, SYSCFG: 14, TIM9: 16, TIM10: 17, TIM11: 18, SAI1: 22, SAI2: 23 },
};
const RESET_OFFSET = { 0x30: 0x10, 0x34: 0x14, 0x38: 0x18, 0x40: 0x20, 0x44: 0x24 };
export const PERIPHERAL_BUS = {};
for (const [off, bits] of Object.entries(ENABLE_BITS)) for (const name of Object.keys(bits)) PERIPHERAL_BUS[name] = { 0x30: 'AHB1', 0x34: 'AHB2', 0x38: 'AHB3', 0x40: 'APB1', 0x44: 'APB2' }[off];
const LOCATION = {};
for (const [off, bits] of Object.entries(ENABLE_BITS)) for (const [name, n] of Object.entries(bits)) LOCATION[name] = { off: Number(off), n };
// Peripherals that share an enable bit with another register block.
const ALIAS = { ADC: 'ADC1', ADC_COMMON: 'ADC1' };
const ALWAYS = new Set(['RCC', 'FLASH', 'EXTI', 'DBGMCU', 'IWDG', 'RTC', 'SYSTEM', 'SCHED']);

const AHB_DIV = [1, 1, 1, 1, 1, 1, 1, 1, 2, 4, 8, 16, 64, 128, 256, 512];
const APB_DIV = [1, 1, 1, 1, 2, 4, 8, 16];

export class Rcc extends Peripheral {
  constructor(soc) { super(soc, 'RCC'); this.timers = {}; this.reset(); }
  reset() {
    super.reset();
    this.set(0x00, 0x00000083 | (0x10 << 8));
    this.set(0x04, 0x24003010);
    this.set(0x30, 0x00100000);
    this.set(0x50, 0x7e6791ff); this.set(0x54, 0x000000f1); this.set(0x58, 0x00000003);
    this.set(0x60, 0x3fffcdff); this.set(0x64, 0x00cf7f33);
    this.set(0x74, this.soc.pendingCsr ?? 0x0e000000); this.soc.pendingCsr = undefined;
    this.set(0x84, 0x24003010); this.set(0x88, 0x04003010);
    this.mcoHz = 0;
    for (const t of Object.values(this.timers)) t.cancel();
    this.timers = {};
    this.updateClocks();
  }
  clockEnabled(name) {
    if (ALWAYS.has(name)) return true;
    const loc = LOCATION[ALIAS[name] ?? name];
    if (!loc) return true;
    return !!bit(this.get(loc.off), loc.n);
  }
  // Ready flag `readyBit` follows `onBit` of register `off` after `us` microseconds.
  follow(off, onBit, readyBit, us) {
    const key = `${off}:${readyBit}`, on = bit(this.get(off), onBit), ready = bit(this.get(off), readyBit);
    if (on === ready) { this.timers[key]?.cancel(); delete this.timers[key]; return; }
    if (this.timers[key]?.target === on) return;
    this.timers[key]?.cancel();
    const event = this.soc.after(us, () => {
      delete this.timers[key];
      if (bit(this.get(off), onBit) !== on) return;
      if (on && !this.sourceAvailable(off, onBit)) return;
      if (on) this.setBits(off, 1 << readyBit); else this.clearBits(off, 1 << readyBit);
      this.readyInterrupt(off, readyBit, on);
      this.updateClocks();
    });
    event.target = on; this.timers[key] = event;
  }
  sourceAvailable(off, onBit) {
    if (off === 0 && onBit === 16) return this.soc.options.hse !== false; // HSE present (ST-LINK MCO 8 MHz)
    if (off === 0 && (onBit === 24 || onBit === 26 || onBit === 28)) {
      const src = bit(this.get(0x04), 22) ? 0x00020000 : 0x00000002; // PLL source must be ready
      return !!(this.get(0x00) & src);
    }
    return true;
  }
  readyInterrupt(off, readyBit, on) {
    if (!on) return;
    const flag = off === 0 ? { 1: 2, 17: 3, 25: 4, 27: 5, 29: 6 }[readyBit] : off === 0x70 ? (readyBit === 1 ? 1 : null) : off === 0x74 ? (readyBit === 1 ? 0 : null) : null;
    if (flag == null) return;
    this.setBits(0x0c, 1 << flag);
    if (bit(this.get(0x0c), flag + 8)) this.soc.irq('RCC', 'rcc', true);
  }
  writeReg(off, value, mask) {
    const old = this.get(off), v = this.merge(off, value, mask);
    switch (off) {
      case 0x00: {
        const ro = 0x2a02ff02; // ready flags + HSICAL are read only
        let next = (v & ~ro) | (old & ro);
        if (!bit(next, 0) && this.sysclkSource() === 0) next |= 1; // HSI kept while it clocks the core
        if (!bit(next, 16) && this.sysclkSource() === 1) next |= 1 << 16;
        if (!bit(next, 24) && [2, 3].includes(this.sysclkSource())) next |= 1 << 24;
        this.set(0, next);
        this.follow(0, 0, 1, 2); this.follow(0, 16, 17, 100); this.follow(0, 24, 25, 100);
        this.follow(0, 26, 27, 100); this.follow(0, 28, 29, 100);
        break;
      }
      case 0x04: if (bit(this.get(0), 24)) return; this.set(off, v); break; // PLLCFGR locked while PLL on
      case 0x84: if (bit(this.get(0), 26)) return; this.set(off, v); break;
      case 0x88: if (bit(this.get(0), 28)) return; this.set(off, v); break;
      case 0x08: {
        let next = (v & ~0x0c) | (old & 0x0c);
        const sw = next & 3, ready = [bit(this.get(0), 1), bit(this.get(0), 17), bit(this.get(0), 25), bit(this.get(0), 25)][sw];
        if (ready) next = (next & ~0x0c) | (sw << 2);
        this.set(off, next);
        this.updateClocks();
        break;
      }
      case 0x0c: {
        const flags = this.get(off) & 0xff, clear = (v >> 16) & 0xbf;
        this.set(off, (flags & ~clear) | (v & 0x3f00));
        const pending = (this.get(off) & 0x3f) & ((this.get(off) >> 8) & 0x3f);
        this.soc.irq('RCC', 'rcc', !!pending || !!(this.get(off) & 0x80));
        break;
      }
      case 0x10: case 0x14: case 0x18: case 0x20: case 0x24: {
        this.set(off, v);
        const enOff = Object.keys(RESET_OFFSET).find(k => RESET_OFFSET[k] === off);
        for (const [name, n] of Object.entries(ENABLE_BITS[enOff])) if (bit(v, n) && !bit(old, n)) this.soc.resetPeripheral(name);
        break;
      }
      case 0x70: {
        // BDCR: LSE ready follows LSEON, RTC enable/selection.
        let next = (v & ~0x2) | (old & 0x2);
        if (bit(next, 16)) { next = 0x00010000; this.soc.resetPeripheral('RTC'); }
        this.set(off, next);
        this.follow(0x70, 0, 1, 10000);
        break;
      }
      case 0x74: {
        let next = (v & ~0x2) | (old & 0x2);
        if (bit(v, 24)) next &= 0x00ffffff; // RMVF clears reset flags
        this.set(off, next & ~(1 << 24));
        this.follow(0x74, 0, 1, 40);
        break;
      }
      default: this.set(off, v);
    }
    if (off === 0x08 || off === 0x8c || off === 0x04) this.updateClocks();
  }
  sysclkSource() { return field(this.get(0x08), 2, 2); }
  pllInput(cfg = this.get(0x04)) { return bit(this.get(0x04), 22) ? HSE_HZ : HSI_HZ; }
  pllVco(cfg) { const m = field(cfg, 0, 6) || 1, n = field(cfg, 6, 9); return this.pllInput() / m * n; }
  pllP() { const cfg = this.get(0x04); return this.pllVco(cfg) / ((field(cfg, 16, 2) + 1) * 2); }
  pllQ() { const cfg = this.get(0x04); return this.pllVco(cfg) / (field(cfg, 24, 4) || 1); }
  pllR() { const cfg = this.get(0x04); return this.pllVco(cfg) / (field(cfg, 28, 3) || 2); }
  sysclk() { return [HSI_HZ, HSE_HZ, this.pllP(), this.pllR()][this.sysclkSource()]; }
  updateClocks() {
    const cfgr = this.get(0x08), sysclk = this.sysclk();
    const hclk = sysclk / AHB_DIV[field(cfgr, 4, 4)];
    const apb1 = APB_DIV[field(cfgr, 10, 3)], apb2 = APB_DIV[field(cfgr, 13, 3)];
    const pclk1 = hclk / apb1, pclk2 = hclk / apb2, timpre = bit(this.get(0x8c), 24);
    const tim = (div, pclk) => timpre ? (div <= 4 ? hclk : pclk * 4) : (div === 1 ? pclk : pclk * 2);
    const clock = { sysclk, hclk, pclk1, pclk2, tim1: tim(apb1, pclk1), tim2: tim(apb2, pclk2), pll48: this.pllQ() };
    // MCO1 (PA8): HSI / LSE / HSE / PLL with prescaler 1..5.
    const mcoSrc = field(cfgr, 21, 2), pre = field(cfgr, 24, 3), div = pre < 4 ? 1 : pre - 2;
    const src = [bit(this.get(0), 1) ? HSI_HZ : 0, bit(this.get(0x70), 1) ? LSE_HZ : 0, bit(this.get(0), 17) ? HSE_HZ : 0, bit(this.get(0), 25) ? this.pllP() : 0][mcoSrc];
    const mco = src / div; if (mco !== this.mcoHz) { this.mcoHz = mco; this.soc.mcoChanged?.(); }
    this.soc.setClock(clock);
  }
}
