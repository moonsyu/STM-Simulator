import { Peripheral, bit, field } from '../stm32f446/core.js';

// RCC of the STM32F103 (RM0008 section 7). HSI 8 MHz, HSE 8 MHz (ST-LINK MCO on NUCLEO-64),
// PLL = HSI/2 or HSE(/2) x 2..16, SYSCLK switches only to a ready source, APB timers run at x2
// when their bus is divided, and the ADC clock is PCLK2 / ADCPRE.
export const HSI_HZ = 8e6, HSE_HZ = 8e6, LSE_HZ = 32768, LSI_HZ = 40000;

const ENABLE_BITS = {
  0x14: { DMA1: 0, DMA2: 1, SRAM: 2, FLITF: 4, CRC: 6 },
  0x18: { AFIO: 0, GPIOA: 2, GPIOB: 3, GPIOC: 4, GPIOD: 5, GPIOE: 6, ADC1: 9, ADC2: 10, TIM1: 11, SPI1: 12, USART1: 14 },
  0x1c: { TIM2: 0, TIM3: 1, TIM4: 2, WWDG: 11, SPI2: 14, USART2: 17, USART3: 18, I2C1: 21, I2C2: 22, USB: 23, CAN1: 25, BKP: 27, PWR: 28 },
};
const RESET_REG = { 0x0c: 0x18, 0x10: 0x1c };
const LOCATION = {};
for (const [off, bits] of Object.entries(ENABLE_BITS)) for (const [name, n] of Object.entries(bits)) LOCATION[name] = { off: Number(off), n };
const ALWAYS = new Set(['RCC', 'FLASH', 'EXTI', 'DBGMCU', 'IWDG', 'RTC', 'SYSTEM', 'SCHED']);
const AHB_DIV = [1, 1, 1, 1, 1, 1, 1, 1, 2, 4, 8, 16, 64, 128, 256, 512];
const APB_DIV = [1, 1, 1, 1, 2, 4, 8, 16];

export class RccF1 extends Peripheral {
  constructor(soc) { super(soc, 'RCC'); this.timers = {}; this.reset(); }
  reset() {
    super.reset();
    this.set(0x00, 0x00000083 | (0x80 << 8)); // HSION, HSIRDY, HSITRIM=16, factory HSICAL
    this.set(0x14, 0x00000014); // SRAM and FLITF clocks on during sleep
    this.set(0x24, this.soc.pendingCsr ?? 0x0c000000); this.soc.pendingCsr = undefined;
    this.mcoHz = 0;
    for (const t of Object.values(this.timers)) t.cancel();
    this.timers = {};
    this.updateClocks();
  }
  clockEnabled(name) {
    if (ALWAYS.has(name)) return true;
    const loc = LOCATION[name];
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
    if (off === 0 && onBit === 16) return this.soc.options.hse !== false;
    if (off === 0 && onBit === 24) return !!(this.get(0) & (bit(this.get(0x04), 16) ? 1 << 17 : 1 << 1));
    return true;
  }
  readyInterrupt(off, readyBit, on) {
    if (!on) return;
    const flag = off === 0 ? { 1: 2, 17: 3, 25: 4 }[readyBit] : off === 0x20 ? (readyBit === 1 ? 1 : null) : off === 0x24 ? (readyBit === 1 ? 0 : null) : null;
    if (flag == null) return;
    this.setBits(0x08, 1 << flag);
    if (bit(this.get(0x08), flag + 8)) this.soc.irq('RCC', 'rcc', true);
  }
  writeReg(off, value, mask) {
    const old = this.get(off), v = this.merge(off, value, mask);
    switch (off) {
      case 0x00: {
        const ro = 0x0202ff02; // ready flags + HSICAL
        let next = (v & ~ro) | (old & ro);
        const sw = this.sysclkSource();
        if (!bit(next, 0) && sw === 0) next |= 1; // the running source stays on
        if (!bit(next, 16) && sw === 1) next |= 1 << 16;
        if (!bit(next, 24) && sw === 2) next |= 1 << 24;
        this.set(0, next);
        this.follow(0, 0, 1, 2); this.follow(0, 16, 17, 100); this.follow(0, 24, 25, 100);
        break;
      }
      case 0x04: {
        // SWS is read only; PLLSRC/PLLXTPRE/PLLMUL only change while the PLL is off.
        let next = (v & ~0x0c) | (old & 0x0c);
        if (bit(this.get(0), 24)) next = (next & ~0x003f0000) | (old & 0x003f0000);
        const sw = next & 3, ready = [bit(this.get(0), 1), bit(this.get(0), 17), bit(this.get(0), 25), 0][sw];
        if (ready) next = (next & ~0x0c) | (sw << 2);
        this.set(off, next);
        break;
      }
      case 0x08: {
        const flags = this.get(off) & 0x9f, clear = (v >> 16) & 0x9f;
        this.set(off, (flags & ~clear) | (v & 0x1f00));
        const pending = (this.get(off) & 0x1f) & ((this.get(off) >> 8) & 0x1f);
        this.soc.irq('RCC', 'rcc', !!pending);
        break;
      }
      case 0x0c: case 0x10: {
        this.set(off, v);
        for (const [name, n] of Object.entries(ENABLE_BITS[RESET_REG[off]])) if (bit(v, n) && !bit(old, n)) this.soc.resetPeripheral(name);
        break;
      }
      case 0x20: {
        let next = (v & ~0x2) | (old & 0x2);
        if (bit(next, 16)) { next = 0x00010000; this.soc.resetPeripheral('RTC'); }
        this.set(off, next);
        this.follow(0x20, 0, 1, 10000);
        break;
      }
      case 0x24: {
        let next = (v & ~0x2) | (old & 0x2);
        if (bit(v, 24)) next &= 0x00ffffff; // RMVF clears the reset flags
        this.set(off, next & ~(1 << 24));
        this.follow(0x24, 0, 1, 40);
        break;
      }
      default: this.set(off, v);
    }
    if (off === 0x00 || off === 0x04) this.updateClocks();
  }
  sysclkSource() { return field(this.get(0x04), 2, 2); }
  pll() {
    const cfgr = this.get(0x04), mul = Math.min(16, field(cfgr, 18, 4) + 2);
    const input = bit(cfgr, 16) ? HSE_HZ / (bit(cfgr, 17) ? 2 : 1) : HSI_HZ / 2;
    return input * mul;
  }
  sysclk() { return [HSI_HZ, HSE_HZ, this.pll(), HSI_HZ][this.sysclkSource()]; }
  updateClocks() {
    const cfgr = this.get(0x04), sysclk = this.sysclk();
    const hclk = sysclk / AHB_DIV[field(cfgr, 4, 4)];
    const apb1 = APB_DIV[field(cfgr, 8, 3)], apb2 = APB_DIV[field(cfgr, 11, 3)];
    const pclk1 = hclk / apb1, pclk2 = hclk / apb2;
    const clock = { sysclk, hclk, pclk1, pclk2, tim1: apb1 === 1 ? pclk1 : pclk1 * 2, tim2: apb2 === 1 ? pclk2 : pclk2 * 2, pll48: 0, adc: pclk2 / ((field(cfgr, 14, 2) + 1) * 2) };
    // MCO (PA8): 100 SYSCLK, 101 HSI, 110 HSE, 111 PLL/2.
    const mco = field(cfgr, 24, 3), on = bit(this.get(0), 1), hse = bit(this.get(0), 17), pll = bit(this.get(0), 25);
    const hz = mco === 4 ? sysclk : mco === 5 && on ? HSI_HZ : mco === 6 && hse ? HSE_HZ : mco === 7 && pll ? this.pll() / 2 : 0;
    if (hz !== this.mcoHz) { this.mcoHz = hz; this.soc.mcoChanged?.(); }
    this.soc.setClock(clock);
  }
}
