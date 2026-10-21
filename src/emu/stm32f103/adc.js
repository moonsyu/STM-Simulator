import { bit, field } from '../stm32f446/core.js';
import { Adc, ADC_PINS } from '../stm32f446/adc.js';

// ADC1/2 of the STM32F103 (RM0008 section 11). Same register offsets as the F446 ADC, but a fixed 12-bit
// resolution, (sample + 12.5) ADC cycles per conversion with ADCCLK = PCLK2 / ADCPRE (RCC), the CR2 control
// bits of the F1 (ADON restarts a conversion, SWSTART/JSWSTART need EXTTRIG/JEXTTRIG with EXTSEL = 111),
// self-clearing RSTCAL/CAL, and the temperature sensor / VREFINT on channels 16 / 17 (TSVREFE).
const SR = 0x00, CR1 = 0x04, CR2 = 0x08, SMPR1 = 0x0c, SMPR2 = 0x10;
const SAMPLE = [1.5, 7.5, 13.5, 28.5, 41.5, 55.5, 71.5, 239.5];
const EXTSEL = ['TIM1_CC1', 'TIM1_CC2', 'TIM1_CC3', 'TIM2_CC2', 'TIM3_TRGO', 'TIM4_CC4', 'EXTI11', 'SWSTART'];
const JEXTSEL = ['TIM1_TRGO', 'TIM1_CC4', 'TIM2_TRGO', 'TIM2_CC1', 'TIM3_CC4', 'TIM4_TRGO', 'EXTI15', 'JSWSTART'];

export class AdcF1 extends Adc {
  adcclk() { return this.soc.clock.adc || this.soc.clock.pclk2 / 2; }
  resolution() { return 12; }
  sampleCycles(ch) { const reg = ch >= 10 ? SMPR1 : SMPR2, n = ch >= 10 ? ch - 10 : ch; return SAMPLE[field(this.get(reg), n * 3, 3)]; }
  conversionUs(ch) { return (this.sampleCycles(ch) + 12.5) / this.adcclk() * 1e6; }
  voltage(ch) {
    const tsvrefe = bit(this.get(CR2), 23);
    if (this.index === 0 && ch === 16) return tsvrefe ? 1.43 - 0.0043 * ((this.soc.options.temperature ?? 25) - 25) : 0;
    if (this.index === 0 && ch === 17) return tsvrefe ? 1.2 : 0;
    const pin = ADC_PINS[ch]; if (!pin) return 0;
    return this.soc.analogIn(pin) ?? 0;
  }
  writeReg(off, value, mask) {
    const old = this.get(off), v = this.merge(off, value, mask);
    if (off === SR) { this.set(SR, old & (v | ~0x1f)); this.updateIrq(); return; }
    if (off !== CR2) { this.set(off, v); if (off === CR1) this.updateIrq(); return; }
    const wasOn = bit(old, 0);
    this.set(CR2, v & ~((1 << 22) | (1 << 21)));
    if (!bit(v, 0)) { this.event?.cancel(); this.event = null; this.seq = null; this.inj = null; this.clearBits(SR, 0x18); this.clearBits(CR2, 0xc); }
    // Calibration: RSTCAL and CAL clear themselves (CAL takes 83 ADC cycles).
    if (bit(v, 3) && !bit(old, 3)) this.soc.after(2 / this.adcclk() * 1e6, () => this.clearBits(CR2, 1 << 3));
    if (bit(v, 2) && !bit(old, 2)) this.soc.after(83 / this.adcclk() * 1e6, () => this.clearBits(CR2, 1 << 2));
    // Writing ADON=1 again while on starts a regular conversion (software start without EXTTRIG).
    if (wasOn && (mask & 1) && (value & 1) && (v & ~1) === (old & ~1)) this.startRegular();
    if (bit(v, 22) && bit(v, 20) && field(v, 17, 3) === 7 && this.on()) this.startRegular();
    if (bit(v, 21) && bit(v, 15) && field(v, 12, 3) === 7 && this.on()) this.startInjected();
    if (bit(old, 8) && !bit(v, 8)) this.soc.dmaLine(this.name, false);
    this.soc.triggersChanged?.();
  }
  trigger(name) {
    const cr2 = this.get(CR2); if (!this.on()) return;
    if (bit(cr2, 20) && EXTSEL[field(cr2, 17, 3)] === name) this.startRegular();
    if (bit(cr2, 15) && JEXTSEL[field(cr2, 12, 3)] === name) this.startInjected();
  }
  wants(name) {
    const cr2 = this.get(CR2); if (!this.on()) return false;
    return (bit(cr2, 20) && EXTSEL[field(cr2, 17, 3)] === name) || (bit(cr2, 15) && JEXTSEL[field(cr2, 12, 3)] === name);
  }
}
