import { BusFaultSignal } from '../bus.js';
import { Stm32f446 } from '../stm32f446/soc.js';
import { Exti, Crc, Iwdg, Wwdg } from '../stm32f446/system.js';
import { Timer, TIMER_INFO } from '../stm32f446/timer.js';
import { Usart } from '../stm32f446/usart.js';
import { I2c } from '../stm32f446/i2c.js';
import { Spi } from '../stm32f446/spi.js';
import { Can } from '../stm32f446/can.js';
import { BASES, signalPins, pinSignals } from './tables.js';
import { RccF1 } from './rcc.js';
import { GpioPortF1, Afio, FlashF1, DbgmcuF1, PwrF1 } from './gpio.js';
import { DmaF1 } from './dma.js';
import { AdcF1 } from './adc.js';

export { BASES };

// STM32F103RB system-on-chip (NUCLEO-F103RB). Time base, scheduler, IRQ aggregation and the circuit
// bridge come from the STM32F446 model; the blocks that differ on the F1 (RCC, FLASH, GPIO CRL/CRH,
// AFIO remap and EXTI routing, DMA1 channels, ADC) have their own models, and the rest (USART, I2C,
// SPI, TIM1-4, EXTI, CAN, CRC, IWDG, WWDG) is shared at the F1 register addresses.
// Memory stays the F446 bus (512 KB / 128 KB); an F103RB image uses the first 128 KB / 20 KB of it.
export class Stm32f103 extends Stm32f446 {
  get resetHz() { return 8e6; }
  build() {
    const pages = new Map();
    const add = (name, dev, base = BASES[name], size = 0x400) => {
      this.peripherals.set(name, dev); dev.base = base;
      for (let a = base; a < base + size; a += 0x400) pages.set(a >>> 10, dev);
      return dev;
    };
    const lookup = addr => { const p = pages.get(addr >>> 10); return p ? [p, addr - p.base] : null; };
    const soc = this;
    this.machine.map(0x40000000, 0x80000, {
      name: 'STM32F103',
      read(offset, size) { const hit = lookup((0x40000000 + offset) >>> 0); if (!hit) throw new BusFaultSignal(0x40000000 + offset, false, size); return hit[0].read(hit[1], size); },
      write(offset, value, size) { const hit = lookup((0x40000000 + offset) >>> 0); if (!hit) throw new BusFaultSignal(0x40000000 + offset, true, size); hit[0].write(hit[1], value, size); },
      peek(offset, size) { const hit = lookup((0x40000000 + offset) >>> 0); if (!hit) return null; const d = hit[0], o = hit[1]; if (d.peek) return d.peek(o, size); return d.r ? (size === 4 ? d.r[o >> 2] : (d.r[o >> 2] >>> ((o & 3) * 8)) & (size === 1 ? 0xff : 0xffff)) : null; },
      tick: () => soc.sync(), nextEvent: () => soc.scheduler.next() + soc.cycleOffset, reset: () => soc.machineReset(),
    }, 'STM32F103 APB/AHB');
    this.rcc = add('RCC', new RccF1(this));
    this.flash = add('FLASH', new FlashF1(this));
    this.pwr = add('PWR', new PwrF1(this));
    this.afio = this.syscfg = add('AFIO', new Afio(this));
    this.exti = add('EXTI', new Exti(this));
    this.gpio = {};
    for (const p of 'ABCDE') this.gpio[p] = add('GPIO' + p, new GpioPortF1(this, p));
    this.timers = {};
    for (const name of ['TIM1', 'TIM2', 'TIM3', 'TIM4']) {
      const t = new Timer(this, name);
      if (name === 'TIM2') { t.info = { ...TIMER_INFO.TIM2, bits: 16 }; t.max = 0xffff; t.reset(); } // all F1 timers are 16-bit
      this.timers[name] = add(name, t);
    }
    this.usarts = {};
    for (const name of ['USART1', 'USART2', 'USART3']) this.usarts[name] = add(name, new Usart(this, name));
    this.i2cs = {};
    for (const name of ['I2C1', 'I2C2']) this.i2cs[name] = add(name, new I2c(this, name));
    this.spis = {};
    for (const name of ['SPI1', 'SPI2']) this.spis[name] = add(name, new Spi(this, name));
    for (const [i, name] of ['ADC1', 'ADC2'].entries()) this.adcs.push(add(name, new AdcF1(this, name, i)));
    this.dma = { DMA1: add('DMA1', new DmaF1(this, 'DMA1')) };
    this.can1 = add('CAN1', new Can(this, 'CAN1'));
    this.crc = add('CRC', new Crc(this));
    this.iwdg = add('IWDG', new Iwdg(this));
    this.wwdg = add('WWDG', new Wwdg(this));
    this.dbg = new DbgmcuF1(this); this.peripherals.set('DBGMCU', this.dbg);
    this.machine.map(BASES.DBGMCU, 0x10, this.dbg, 'DBGMCU');
    // Flash size (KB) and unique ID in system memory.
    const uid = this.options.uid ?? [0x0668ff54, 0x49498786, 0x67173544], bytes = new Uint8Array(0x14);
    const dv = new DataView(bytes.buffer); dv.setUint16(0, 128, true); dv.setUint32(8, uid[0], true); dv.setUint32(12, uid[1], true); dv.setUint32(16, uid[2], true);
    this.bus.loadBytes?.(0x1ffff7e0, bytes);
    this.machine.onResetRequest = reason => this.prepareReset(reason);
    this.republishAll();
  }
  resetPeripheral(name) {
    this.peripherals.get(name)?.reset();
    if (name.startsWith('GPIO') || name === 'AFIO') this.republishAll();
  }
  // ------------------------------------------------------------ pins (AFIO remap)
  pinSignals(pin) { return pinSignals(this.afio?.mapr ?? 0, pin); }
  routedPins(signal) {
    let pins = this.routes.get(signal);
    if (!pins) {
      pins = [];
      const pin = signalPins(this.afio?.mapr ?? 0)[signal], port = pin && this.gpio[pin[1]];
      // On the F1 a peripheral reaches its pin as an alternate-function output or through any input mode.
      if (port) { const mode = port.moder(Number(pin.slice(2))); if (mode === 2 || mode === 0) pins.push(pin); }
      this.routes.set(signal, pins);
    }
    return pins;
  }
  // ------------------------------------------------------------ DMA1 only
  serviceDma() {
    for (let guard = 0; guard < 200000; guard++) {
      let progress = false;
      for (const [name, active] of this.dmaLines) if (active && this.dma.DMA1.service(name)) progress = true;
      if (!progress) break;
    }
  }
  dmaPulse(name) { this.dma.DMA1.service(name); }
  dmaRemaining(name) { return this.dma.DMA1.remaining(name); }
  requestAddress(name) {
    const m = /^(USART\d|SPI\d|I2C\d|ADC\d)(?:_(TX|RX))?$/.exec(name); if (!m) return null;
    return BASES[m[1]] + ({ U: 4, S: 0x0c, I: 0x10, A: 0x4c })[m[1][0]];
  }
  canBus(can, frame) { return this.env.canBus?.(can, frame) ?? false; }
  i2sClock() { return this.clock.pclk1; }
}
