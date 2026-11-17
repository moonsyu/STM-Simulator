// Renesas RA6E1 (R7FA6E10F2CFP) system-on-chip for the firmware emulator: the peripherals FSP's BSP and r_ioport /
// r_icu drive on the FPB-RA6E1, behind the same SoC interface as the STM32 models (time base, scheduler, pin states
// published to the circuit, IRQ lines, signals for the logic analyzer).
// RA6E1 Group User's Manual: Hardware R01UH0930EJ0140 Rev.1.40: 8 Clock Generation Circuit, 10 Module-stop, 13 ICU,
// 19 I/O Ports. Register offsets follow FSP's CMSIS device header R7FA6E10F.h.
import { Scheduler } from '../stm32f446/core.js';
import { BusFaultSignal } from '../bus.js';
import { Signals } from '../stm32f446/signals.js';
import { RaBus, RA_DATA_FLASH_BASE } from './bus.js';
import { Sci } from './sci.js';
import { Gpt } from './gpt.js';
import { Adc12 } from './adc.js';
import { Agt } from './agt.js';
import { Iic } from './iic.js';
import { Rspi } from './spi.js';
import { Watchdog } from './wdt.js';
import { Rtc } from './rtc.js';
import { Faci } from './flash.js';
import { LowPower } from './lpm.js';
import { EXC_NMI } from '../scs.js';
import { RA_PERIPHERAL_PINS, RA_SCI_CHANNELS, RA_GPT_CHANNELS, RA_AGT_CHANNELS, RA_IIC_CHANNELS, raPsel } from '../../ra-config.js';

export { RaBus };
export const RA_BASES = {
  SRAM: 0x40002000, BUS: 0x40003000, DTC: 0x40005400, ICU: 0x40006000, CPSCU: 0x40008000, DEBUG: 0x4001b000,
  FCACHE: 0x4001c000, SYSTEM: 0x4001e000, PORT: 0x40080000, PFS: 0x40080800, PMISC: 0x40080d00, ELC: 0x40082000,
  MSTP: 0x40084000, RTC: 0x40083000, CACHE: 0x40007000, PSCU: 0x400e0000, IWDT: 0x40083200, WDT: 0x40083400,
  FACI_CMD: 0x407e0000, FACI: 0x407fe000,
};
// ELC event numbers (FSP bsp_elc.h, RA6E1): ICU IRQ0..15 are 0x001..0x010.
export const ELC_EVENT_ICU_IRQ = n => 0x001 + n;
// RSTSR1 flag of each reset cause the models request (R7FA6E10F.h R_SYSTEM_RSTSR1_*_Pos): IWDTRF b0, WDTRF b1, SWRF b2.
const RESET_FLAGS = { IWDT: 1, WDT: 2, SYSRESETREQ: 4 };
const PORT_COUNT = 15;

// A byte-addressed register block (little-endian, any access size), for the many registers that only need to keep
// what software writes. `hooks` gives per-offset read/write behaviour.
class RegisterFile {
  constructor(soc, name, size, { reset = {}, onWrite = null, onRead = null } = {}) {
    this.soc = soc; this.name = name; this.size = size; this.resetValues = reset; this.onWrite = onWrite; this.onRead = onRead;
    this.bytes = new Uint8Array(size); this.dv = new DataView(this.bytes.buffer); this.reset();
  }
  reset() { this.bytes.fill(0); for (const [off, [v, size]] of Object.entries(this.resetValues)) this.put(Number(off), v, size); }
  get(off, size = 4) { return size === 4 ? this.dv.getUint32(off, true) : size === 2 ? this.dv.getUint16(off, true) : this.dv.getUint8(off); }
  put(off, v, size = 4) { if (size === 4) this.dv.setUint32(off, v >>> 0, true); else if (size === 2) this.dv.setUint16(off, v & 0xffff, true); else this.dv.setUint8(off, v & 0xff); }
  read(off, size) { this.soc.sync(); const v = this.onRead?.(off, size); return v ?? this.get(off, size); }
  peek(off, size) { return this.get(off, size); }
  write(off, v, size) { this.soc.sync(); const before = this.get(off, size); this.put(off, v, size); this.onWrite?.(off, size, before, v); }
}

// Clock generation (CGC), power, reset status and the register write protection (PRCR) live in R_SYSTEM.
class System extends RegisterFile {
  constructor(soc) {
    super(soc, 'SYSTEM', 0x700, {
      reset: {
        0x1c: [0xffbfffff, 4], // MSTPCRA (SRAM, DTC/DMAC running)
        0x20: [0x44044444, 4], // SCKDIVCR: every clock /16 after reset
        0x24: [0x44, 1], // SCKDIVCR2
        0x26: [0x01, 1], // SCKSCR: MOCO
        0x28: [0x1300, 2], // PLLCCR
        0x2a: [0x01, 1], // PLLCR: PLL stopped
        0x32: [0x01, 1], // MOSCCR: main oscillator stopped
        0x36: [0x00, 1], // HOCOCR (OFS1.HOCOEN = 0 after reset: running)
        0x38: [0x00, 1], // MOCOCR: running
        0x480: [0x01, 1], // SOSCCR: stopped
        0x490: [0x00, 1], // LOCOCR: running
        0x416: [0x02, 1], // FWEPROR: flash program/erase disabled (FLWE 10b) until software writes 01b
      },
      onWrite: (off, size, before, v) => { if ([0x20, 0x26, 0x28, 0x2a, 0x36].includes(off)) this.clocksChanged(); this.resetStatusWrite(off, size, v); this.soc.lpm?.write(off, size, v); },
      onRead: (off, size) => {
        if (off === 0x3c && size === 1) return this.oscsf();
        if ((off === 0xa0 || off === 0xaa) && size === 1) return this.get(off, 1) & ~0x10; // OPCMTSF / SOPCMTSF: done
        // The Deep Software Standby registers (DPSBYCR, DPSIER, DPSIFR, DPSIEGR) live in soc.lpm: a reset keeps them.
        return this.soc.lpm?.read(off, size) ?? this.resetStatusRead(off, size);
      },
    });
  }
  // Reset status (R7FA6E10F.h): RSTSR1 at 0xC0 (IWDTRF b0, WDTRF b1, SWRF b2), RSTSR0 at 0x410 (PORF b0, DPSRSTF b7),
  // RSTSR2 at 0x411 (CWSF b0). They live in the SoC (soc.resetStatus), so a reset of the register block keeps them:
  // the flags say why the MCU restarted. Flags clear by writing 0 (1 leaves them); CWSF is set by writing 1.
  resetStatusRead(off, size) {
    const s = this.soc.resetStatus; if (!s) return undefined;
    if (off === 0xc0) return size === 1 ? s.rstsr1 & 0xff : size === 2 ? s.rstsr1 : ((this.get(0xc0, 4) & 0xffff0000) | s.rstsr1) >>> 0;
    if (off === 0xc1 && size === 1) return s.rstsr1 >> 8;
    if (off === 0x410) return size === 1 ? s.rstsr0 : size === 2 ? s.rstsr0 | (s.rstsr2 << 8) : undefined;
    if (off === 0x411 && size === 1) return s.rstsr2;
    return undefined;
  }
  resetStatusWrite(off, size, v) {
    const s = this.soc.resetStatus; if (!s) return;
    if (off === 0xc0) s.rstsr1 &= size === 1 ? (v & 0xff) | 0xff00 : v & 0xffff;
    else if (off === 0xc1 && size === 1) s.rstsr1 &= ((v & 0xff) << 8) | 0xff;
    else if (off === 0x410) { s.rstsr0 &= v & 0xff; if (size >= 2) s.rstsr2 |= (v >> 8) & 1; }
    else if (off === 0x411 && size === 1) s.rstsr2 |= v & 1;
  }
  // OSCSF: HOCOSF(0), MOSCSF(3), PLLSF(5), PLL2SF(6) follow the oscillators' stop bits (stabilised at once).
  oscsf() {
    let v = 0;
    if (!(this.get(0x36, 1) & 1)) v |= 1;
    if (!(this.get(0x32, 1) & 1)) v |= 1 << 3;
    if (!(this.get(0x2a, 1) & 1)) v |= 1 << 5;
    if (!(this.get(0x4a, 1) & 1) && this.get(0x48, 2) !== 0) v |= 1 << 6;
    return v;
  }
  hocoHz() { return this.soc.options.hocoHz ?? 20e6; }
  sourceHz(sel) {
    switch (sel) {
      case 0: return this.hocoHz();
      case 1: return 8e6; // MOCO
      case 2: case 4: return 32768; // LOCO / SOSC
      case 3: return this.soc.options.mainOscHz ?? 24e6;
      case 5: { // PLL (PLLCCR type 1: PLIDIV[1:0] /1,/2,/3; PLSRCSEL bit 4; PLLMUL[13:8] = mul*2 - 1)
        const c = this.get(0x28, 2), div = [1, 2, 3, 1][c & 3], src = (c >> 4) & 1 ? this.hocoHz() : (this.soc.options.mainOscHz ?? 24e6);
        return src / div * ((((c >> 8) & 0x3f) + 1) / 2);
      }
      default: return 8e6;
    }
  }
  clocks() {
    const base = this.sourceHz(this.get(0x26, 1) & 7), d = this.get(0x20, 4), div = shift => base / (1 << ((d >>> shift) & 7));
    return { iclk: div(24), pclka: div(12), pclkb: div(8), pclkc: div(4), pclkd: div(0), fclk: div(28), bclk: div(16) };
  }
  clocksChanged() { this.soc.setClock(this.clocks()); }
}

// I/O ports: PORTn (PCNTR1..4), the pin function select registers PmnPFS and PWPR. One pin state per port bit is shared
// by both views. Renesas places the halves of a 32-bit register in "big-endian lanes": the 16-bit register at +0 is
// bits 31:16 and the one at +2 bits 15:0 (PODR/PDR, EIDR/PIDR, PORR/POSR; PmnPFS_HA at +2, PmnPFS_BY at +3).
class Ports {
  constructor(soc) { this.soc = soc; this.name = 'PORT'; this.reset(); }
  reset() {
    this.pfs = new Uint32Array(PORT_COUNT * 16);
    this.inputs = new Uint16Array(PORT_COUNT);
    this.pwpr = 0x80;
    // After reset the SWD pins P108 (SWDIO) and P300 (SWCLK) are peripheral pins (PSEL 0, PMR 1) with pull-ups.
    for (const [port, bit] of [[1, 8], [3, 0]]) this.pfs[port * 16 + bit] = (1 << 16) | (1 << 4);
    this.publishAll();
  }
  static lane(word, off, size) { const shift = (4 - (off & 3) - size) * 8; return size === 4 ? word >>> 0 : (word >>> shift) & (size === 2 ? 0xffff : 0xff); }
  static put(word, off, size, v) { if (size === 4) return v >>> 0; const shift = (4 - (off & 3) - size) * 8, mask = ((size === 2 ? 0xffff : 0xff) << shift) >>> 0; return ((word & ~mask) | ((v << shift) & mask)) >>> 0; }
  pin(port, bit) { return `P${port}${String(bit).padStart(2, '0')}`; }
  bits(port, bitNo) { let v = 0; for (let n = 0; n < 16; n++) v |= ((this.pfs[port * 16 + n] >>> bitNo) & 1) << n; return v; }
  setBits(port, bitNo, value, mask = 0xffff) {
    let changed = 0;
    for (let n = 0; n < 16; n++) if (mask & (1 << n)) { const i = port * 16 + n, old = this.pfs[i], v = ((old & ~(1 << bitNo)) | (((value >>> n) & 1) << bitNo)) >>> 0; if (v !== old) { this.pfs[i] = v; changed |= 1 << n; } }
    if (changed) this.publish(port, changed);
  }
  pidr(port) { this.soc.beforeInputRead?.(); let v = 0; for (let n = 0; n < 16; n++) v |= this.inputBit(port, n) << n; return v; }
  portWord(port, reg) {
    if (reg === 0) return ((this.bits(port, 0) << 16) | this.bits(port, 2)) >>> 0; // PCNTR1: PODR | PDR
    if (reg === 4) return this.pidr(port); // PCNTR2: EIDR (0) | PIDR
    return 0; // PCNTR3 / PCNTR4 are write-only
  }
  writePort(port, reg, word, mask) {
    if (reg === 0) { if (mask & 0xffff) this.setBits(port, 2, word & 0xffff, mask & 0xffff); if (mask >>> 16) this.setBits(port, 0, word >>> 16, mask >>> 16); return; }
    if (reg === 8) { // PCNTR3: POSR (15:0) sets, PORR (31:16) clears PODR
      const set = word & mask & 0xffff, clear = ((word & mask) >>> 16) & 0xffff;
      if (set) this.setBits(port, 0, 0xffff, set);
      if (clear) this.setBits(port, 0, 0, clear);
    }
  }
  read(off, size) {
    this.soc.sync();
    if (off < 0x200) { const port = off >> 5, reg = off & 0x1c; return Ports.lane(this.portWord(port, reg), off, size); }
    if (off >= 0x800 && off < 0x800 + PORT_COUNT * 0x40) {
      const i = (off - 0x800) >> 2, port = i >> 4, n = i & 15;
      const word = ((this.pfs[i] & ~2) | (this.inputBit(port, n) << 1)) >>> 0; // PIDR (bit 1) is the pin level
      return Ports.lane(word, off, size);
    }
    if (off === 0xd03 && size === 1) return this.pwpr;
    return 0;
  }
  peek(off, size) { return off >= 0x800 && off < 0x800 + PORT_COUNT * 0x40 ? Ports.lane(this.pfs[(off - 0x800) >> 2], off, size) : off < 0x200 && (off & 0x1c) === 0 ? Ports.lane(this.portWord(off >> 5, 0), off, size) : 0; }
  write(off, v, size) {
    this.soc.sync();
    if (off < 0x200) {
      const port = off >> 5, reg = off & 0x1c, word = Ports.put(0, off, size, v), mask = Ports.put(0, off, size, 0xffffffff);
      this.writePort(port, reg, word, mask); return;
    }
    if (off >= 0x800 && off < 0x800 + PORT_COUNT * 0x40) {
      // PFSWE in PWPR must be set (B0WI cleared first), as on hardware.
      if (!(this.pwpr & 0x40)) return;
      const i = (off - 0x800) >> 2, old = this.pfs[i], word = Ports.put(old, off, size, v) & 0x1f01fcf5;
      if (word === old) return;
      this.pfs[i] = word >>> 0;
      this.publish(i >> 4, 1 << (i & 15));
      return;
    }
    if (off === 0xd03 && size === 1) {
      // PWPR: B0WI (bit 7) must be 0 to change PFSWE (bit 6).
      if (!(this.pwpr & 0x80)) this.pwpr = v & 0xc0; else this.pwpr = (v & 0x80) | (this.pwpr & 0x40);
    }
  }
  cfg(port, n) { const w = this.pfs[port * 16 + n]; return { podr: w & 1, pdr: (w >> 2) & 1, pcr: (w >> 4) & 1, ncodr: (w >> 6) & 1, isel: (w >> 14) & 1, asel: (w >> 15) & 1, pmr: (w >> 16) & 1, psel: (w >> 24) & 31 }; }
  // Electrical description of a pin for the circuit (the interpreter's runtime.gpio entry shape).
  state(port, n) {
    const c = this.cfg(port, n), input = { mode: c.pcr ? 'INPUT_PULLUP' : 'INPUT', value: 0 };
    if (c.asel) return { mode: 'ANALOG', value: 0 };
    if (c.pmr) { const out = this.soc.peripheralOutput?.(this.pin(port, n), c.psel); return out ? { mode: 'OUTPUT', value: out.value ?? (out.level ? 3.3 : 0), openDrain: !!(c.ncodr || out.openDrain), pull: c.pcr, ...(out.pwm ? { pwm: out.pwm } : {}) } : input; }
    if (c.pdr) return { mode: 'OUTPUT', value: c.podr ? 3.3 : 0, openDrain: !!c.ncodr, pull: c.pcr };
    return input;
  }
  // After a Deep Software Standby cancel with DPSBYCR.IOKEEP the pins keep their state (soc.lpm.hold): the registers take
  // the writes, and the pins follow when the bit is cleared (lpm.js publishes all of them then).
  publish(port, mask) { if (this.soc.lpm?.hold) return; for (let n = 0; n < 16; n++) if (mask & (1 << n)) this.soc.pinState(this.pin(port, n), this.state(port, n)); }
  publishAll() { for (let p = 0; p < PORT_COUNT; p++) this.publish(p, 0xffff); }
  inputBit(port, n) {
    const c = this.cfg(port, n);
    if (c.asel) return 0;
    const level = this.soc.digitalIn(this.pin(port, n));
    if (level != null) return level;
    const s = this.state(port, n);
    if (s.mode === 'OUTPUT' && !(s.openDrain && s.value > 0)) return s.value > 1.65 ? 1 : 0;
    return c.pcr ? 1 : 0;
  }
  // After the circuit is solved again: input edges of IRQ pins go to the ICU.
  refreshInputs() {
    for (let p = 0; p < PORT_COUNT; p++) {
      let now = 0;
      for (let n = 0; n < 16; n++) now |= this.inputBit(p, n) << n;
      const changed = now ^ this.inputs[p]; this.inputs[p] = now;
      if (!changed) continue;
      for (let n = 0; n < 16; n++) if (changed & (1 << n)) {
        const pin = this.pin(p, n), level = (now >> n) & 1;
        if (this.cfg(p, n).isel) this.soc.icu.pinEdge(pin, level);
        this.soc.inputEdge?.(pin, level);
      }
    }
  }
}

// Interrupt controller unit: IRQ pin detection (IRQCRn), and the event link IELSRn that connects an event to NVIC
// input n with its status flag IR (bit 16). The IR flag holds the NVIC line until software clears it.
// The non-maskable sources (R7FA6E10F.h): NMIER 0x120 (IWDTEN b0, WDTEN b1; bits can only be set), NMICLR 0x130 (write 1
// to clear the status bit), NMISR 0x140 (IWDTST b0, WDTST b1). An enabled source pends the core's NMI exception.
class Icu extends RegisterFile {
  constructor(soc) {
    super(soc, 'ICU', 0x500, {
      onWrite: (off, size, before, v) => {
        if (off >= 0x300 && off < 0x480) this.updateLine((off - 0x300) >> 2);
        // NMIER: bits can only be set. A source whose status is already set (an underflow before the driver's Open enabled
        // it) requests the NMI when it is enabled: the request is the status ANDed with the enable.
        if (off === 0x120) { const en = (before | v) & 0xffff; this.put(0x120, en, 2); if (this.nmisr & en & ~before) this.soc.machine.nvic?.setPendingExc?.(EXC_NMI); }
        if (off === 0x130) { this.nmisr &= ~v & 0xffff; this.put(0x130, 0, 2); }
        void size;
      },
      onRead: off => (off === 0x140 ? this.nmisr : undefined),
    });
    this.nmisr = 0;
  }
  reset() { super.reset(); this.nmisr = 0; }
  nmi(bit) { this.nmisr |= 1 << bit; if (this.get(0x120, 2) & (1 << bit)) this.soc.machine.nvic?.setPendingExc?.(EXC_NMI); }
  ielsr(n) { return this.get(0x300 + n * 4, 4); }
  updateLine(n) { this.soc.irqNumber(n, 'ICU', !!(this.ielsr(n) & 0x10000)); }
  /** Whether an IELSR slot selects `event` (a peripheral schedules what only an interrupt would observe). */
  linked(event) { for (let n = 0; n < 96; n++) if ((this.ielsr(n) & 0x1ff) === event) return true; return false; }
  // An ELC event: set IR in every slot linked to it.
  raise(event) {
    for (let n = 0; n < 96; n++) { const v = this.ielsr(n); if ((v & 0x1ff) === event) { this.put(0x300 + n * 4, v | 0x10000, 4); this.updateLine(n); } }
  }
  pinEdge(pin, level) {
    const channel = this.soc.irqChannel(pin);
    if (channel == null) return;
    const mode = this.get(channel, 1) & 3; // IRQMD: 0 falling, 1 rising, 2 both, 3 low level
    if (mode === 0 && level === 0 || mode === 1 && level === 1 || mode === 2 || mode === 3 && level === 0) this.soc.raiseEvent(ELC_EVENT_ICU_IRQ(channel));
  }
}

export class Ra6e1 {
  constructor(machine, env = {}, options = {}) {
    this.machine = machine; this.bus = machine.bus; this.env = env; this.options = { ...options };
    this.scheduler = new Scheduler();
    const hz = this.resetHz;
    this.clock = { iclk: hz, pclka: hz, pclkb: hz, pclkc: hz, pclkd: hz, fclk: hz, bclk: hz, sysclk: hz, hclk: hz, pclk1: hz, pclk2: hz };
    this.segment = { cycle: 0, us: 0, hz };
    this.cycleOffset = 0;
    this.irqSources = new Map();
    this.pins = new Map();
    this.signals = new Signals(options.noise, () => this.nowUs());
    this.peripherals = new Map();
    this.usarts = {}; this.spis = {}; this.adcs = []; this.timers = {};
    this.irqPins = options.irqPins ?? {};
    if (machine.cpu) machine.cpu.branchPenalty = 1;
    this.unknown = new Map();
    // Power-on: RSTSR0.PORF set, no other reset cause yet.
    this.resetStatus = { rstsr0: 0x01, rstsr1: 0, rstsr2: 0 };
    // A reset the core asks for (SYSRESETREQ, a watchdog through systemReset) goes through prepareReset first, as on the
    // STM32 models: the cause is logged ("MCU 리셋") and kept in the reset status registers.
    machine.onResetRequest = reason => this.prepareReset(reason);
    // Low power modes (lpm.js): the core's WFI enters the mode SBYCR / DPSBYCR select, and leaving WFI ends it.
    this.lpm = new LowPower(this);
    if (machine.cpu) machine.cpu.onWake = exc => this.lpm.wake(exc);
    this.build();
  }
  get resetHz() { return 8e6; } // MOCO
  build() {
    const soc = this;
    this.system = new System(this);
    this.ports = new Ports(this);
    this.icu = new Icu(this);
    const plain = (name, size, reset) => new RegisterFile(this, name, size, { reset });
    this.scis = {};
    for (const ch of RA_SCI_CHANNELS) this.usarts['SCI' + ch] = this.scis[ch] = new Sci(this, ch); // usarts: the session's UART parts and inject()
    this.gpts = {};
    for (const ch of RA_GPT_CHANNELS) this.timers['GPT' + ch] = this.gpts[ch] = new Gpt(this, ch);
    this.adc0 = new Adc12(this); this.adcs = [this.adc0];
    this.iics = {};
    for (const ch of RA_IIC_CHANNELS) this.iics[ch] = new Iic(this, ch);
    this.i2cs = this.iics; // the name another board's I²C master looks its slaves up by (FirmwareSession.peerI2c)
    this.agts = {};
    for (const ch of RA_AGT_CHANNELS) this.timers['AGT' + ch] = this.agts[ch] = new Agt(this, ch);
    // RSPI: both channels of the chip are modelled (R_SPI0 0x4011A000, R_SPI1 0x4011A100); the configuration offers SPI1.
    this.rspis = {};
    for (const ch of [0, 1]) this.spis['SPI' + ch] = this.rspis[ch] = new Rspi(this, ch);
    this.wdt = new Watchdog(this, 'WDT'); this.iwdt = new Watchdog(this, 'IWDT');
    this.rtc = new Rtc(this);
    // Flash sequencer (FACI) and the data flash it programs (flash.js); the bus tells it when the program reads the area.
    this.dataFlash = this.bus.dataFlashStore; this.faci = new Faci(this);
    this.bus.onDataFlashRead = (offset, size) => this.faci.dataRead(offset, size);
    // A store into the data flash goes nowhere (code flash stores are ignored as before, without a note).
    this.bus.flashWriteHook = a => { if (a >= RA_DATA_FLASH_BASE) this.faci.assigned(); };
    this.bus.onDataFlashOutside = (a, size) => this.faci.outside(a, size);
    const devices = [
      [RA_BASES.SYSTEM, 0x700, this.system],
      [RA_BASES.PORT, 0x1000, this.ports],
      [RA_BASES.ICU, 0x500, this.icu],
      [RA_BASES.MSTP, 0x100, this.mstp = plain('MSTP', 0x100, { 0x4: [0xffffffff, 4], 0x8: [0xffffffff, 4], 0xc: [0xffffffff, 4], 0x10: [0xffffffff, 4] })],
      // FCACHEIV (0x104): the cache invalidation finishes at once (the bit reads back 0).
      [RA_BASES.FCACHE, 0x400, new RegisterFile(this, 'FCACHE', 0x400, { onRead: off => (off === 0x104 ? 0 : undefined) })],
      [RA_BASES.SRAM, 0x400, plain('SRAM', 0x400)],
      [RA_BASES.BUS, 0x2000, plain('BUS', 0x2000)],
      [RA_BASES.DTC, 0x400, plain('DTC', 0x400)],
      [RA_BASES.CPSCU, 0x400, plain('CPSCU', 0x400)],
      [RA_BASES.DEBUG, 0x400, plain('DEBUG', 0x400)],
      [RA_BASES.ELC, 0x400, plain('ELC', 0x400)],
      // Peripheral security attribution (the BSP writes PSARB-E / CFSAMON in every flat project; nothing else reads them).
      [RA_BASES.PSCU, 0x100, plain('PSCU', 0x100)],
      ...RA_SCI_CHANNELS.map(ch => [0x40118000 + ch * 0x100, 0x100, this.scis[ch]]),
      ...RA_GPT_CHANNELS.map(ch => [0x40169000 + ch * 0x100, 0x100, this.gpts[ch]]),
      [0x40170000, 0x200, this.adc0],
      ...RA_AGT_CHANNELS.map(ch => [0x400e8000 + ch * 0x100, 0x100, this.agts[ch]]),
      ...RA_IIC_CHANNELS.map(ch => [0x4009f000 + ch * 0x100, 0x100, this.iics[ch]]),
      ...[0, 1].map(ch => [0x4011a000 + ch * 0x100, 0x100, this.rspis[ch]]),
      // C-cache: CCAFCT (0x4), the flush r_flash_hp asks for after data flash P/E, finishes at once (reads back 0).
      [RA_BASES.CACHE, 0x400, new RegisterFile(this, 'CACHE', 0x400, { onRead: off => (off === 0x4 ? 0 : undefined) })],
      [RA_BASES.IWDT, 0x100, this.iwdt],
      [RA_BASES.WDT, 0x100, this.wdt],
      // RTC (calendar, periodic, alarm, carry; rtc.js). It keeps its time across an MCU reset.
      [RA_BASES.RTC, 0x100, this.rtc],
    ];
    for (const [base, size, dev] of devices) this.peripherals.set(dev.name, dev);
    // Everything else in the peripheral area reads 0 and keeps writes, noted once (so firmware that touches a module the
    // model does not have yet keeps running instead of faulting).
    const fallback = new Map();
    const lookup = a => { for (const [base, size, dev] of devices) if (a >= base && a < base + size) return [dev, a - base]; return null; };
    const router = {
      name: 'RA6E1',
      read(offset, size) { const a = (0x40000000 + offset) >>> 0, hit = lookup(a); if (hit) return hit[0].read(hit[1], size); soc.note(a, false); return fallback.get(a & ~3) ?? 0; },
      write(offset, value, size) { const a = (0x40000000 + offset) >>> 0, hit = lookup(a); if (hit) { hit[0].write(hit[1], value, size); return; } soc.note(a, true); fallback.set(a & ~3, value >>> 0); },
      peek(offset, size) { const a = (0x40000000 + offset) >>> 0, hit = lookup(a); return hit ? (hit[0].peek ? hit[0].peek(hit[1], size) : null) : (fallback.get(a & ~3) ?? 0); },
      // The machine asks for the next event when the core sleeps (WFI) with nothing pending: the low power mode begins there.
      // Only WFI: r_lpm enters its modes with WFI, and a WFE wait is the core's own sleep here (as __WFE() is on the
      // built-in interpreter). Not again between a cancel request and its reset (machine._resetPending).
      tick: () => soc.sync(), nextEvent: () => { const cpu = soc.machine.cpu; if (cpu?.sleeping && !cpu.sleepWfe && !soc.lpm.mode && !soc.machine._resetPending) soc.lpm.enter(); return soc.scheduler.next() + soc.cycleOffset; }, reset: () => soc.machineReset(),
    };
    this.machine.map(0x40000000, 0x400000, router, 'RA6E1 peripherals');
    // The FACI lies above the other peripherals: its registers at 0x407F_E000 and the command-issuing area at
    // 0x407E_0000. They are mapped on their own (the SoC resets the model with the other peripherals).
    const faci = this.faci; this.peripherals.set(faci.name, faci);
    this.machine.map(RA_BASES.FACI, 0x400, { name: 'FACI', read: (off, size) => (off < 0x100 ? faci.read(off, size) : 0), write: (off, v, size) => { if (off < 0x100) faci.write(off, v, size); }, peek: (off, size) => (off < 0x100 ? faci.peek(off, size) : 0) }, 'RA6E1 FACI');
    this.machine.map(RA_BASES.FACI_CMD, 0x400, { name: 'FACI_CMD', read: () => 0, write: (off, v, size) => { if (off === 0) faci.command(v, size); }, peek: () => 0 }, 'RA6E1 FACI command area');
    void BusFaultSignal;
    this.republishAll();
  }
  // A register the model does not have: noted, and said once per address in the output, so firmware that uses a module
  // the emulator only half models shows where it went past the model.
  note(address, write) {
    const key = address & ~3;
    if (!this.unknown.has(key)) { this.unknown.set(key, { address: key, write, count: 0 }); this.env.warn?.(`[RA6E1] 0x${key.toString(16).toUpperCase().padStart(8, '0')}: 이 레지스터는 아직 모델에 없습니다 (읽으면 0, 쓴 값은 보관만 합니다).`); }
    this.unknown.get(key).count++;
  }
  /** An ICU event (bsp_elc.h ELC_EVENT_*) from a peripheral model: the IELSR slots linked to it get IR. The other
   *  consumers of an event (ELC, DTC, DMAC: feature 36) attach here. */
  raiseEvent(ev) { if (this.lpm.event(ev)) this.icu.raise(ev); }
  /** An IIC channel in the module-stop state (MSTPCRB bit 9 - channel, bsp_module_stop.h; set at reset and by R_BSP_MODULE_STOP in a driver's Close). */
  iicStopped(channel) { return !!(this.mstp.peek(0x4, 4) & (1 << (9 - channel))); }
  /** FWEPROR.FLWE = 01b: flash programming and erasure are permitted (r_flash_hp flash_hp_init sets it). */
  flashWriteEnabled() { return (this.system.get(0x416, 1) & 3) === 1; }
  /** Whether anything consumes event `ev`, so a model schedules only what someone observes. */
  listens(ev) { return this.icu.linked(ev) || this.lpm.listens(ev); }
  /** An input pin changed level (Ports.refreshInputs): the IRQn-DS pins cancel Deep Software Standby. */
  inputEdge(pin, level) { this.lpm.pinEdge(pin, level); }
  peripheral(name) { return this.peripherals.get(name); }
  irqChannel(pin) { return this.irqPins[pin]; }
  // ------------------------------------------------------------ time
  now() { const c = this.machine.cycles; if (c < this.cycleOffset) this.cycleOffset = 0; return c - this.cycleOffset; }
  nowUs(cycle = this.now()) { return this.segment.us + (cycle - this.segment.cycle) * 1e6 / this.segment.hz; }
  cycleAtUs(us) { return this.segment.cycle + (us - this.segment.us) * this.segment.hz / 1e6; }
  at(cycle, fn) { return this.scheduler.at(Math.max(cycle, this.now()), fn); }
  atUs(us, fn) { return this.at(Math.ceil(this.cycleAtUs(us) - 1e-6), fn); }
  after(us, fn) { return this.atUs(this.nowUs() + Math.max(0, us), fn); }
  defer(fn) { return this.scheduler.at(this.now(), fn); }
  sync() { if (this.syncing) return; const now = this.now(); if (this.scheduler.next() > now) return; this.syncing = true; try { this.scheduler.run(now); } finally { this.syncing = false; } }
  setClock(c) {
    const clock = { ...c, sysclk: c.iclk, hclk: c.iclk, pclk1: c.pclkb, pclk2: c.pclka };
    const now = this.now();
    if (this.clock.iclk !== clock.iclk) this.segment = { cycle: now, us: this.nowUs(now), hz: clock.iclk };
    this.clock = clock;
    Object.assign(this.machine.clock, { sysclk: clock.iclk, hclk: clock.iclk, pclk1: clock.pclkb, pclk2: clock.pclka });
    this.wdt?.clockChanged(); this.iwdt?.clockChanged(); this.rtc?.clockChanged(); // the scheduler counts core cycles: plan their events again
    this.env.clockChanged?.(clock);
  }
  // ------------------------------------------------------------ reset
  prepareReset(reason) {
    this.resetReason = reason;
    const s = this.resetStatus, flag = RESET_FLAGS[reason];
    if (flag != null) s.rstsr1 |= flag;
    else if (reason === 'DEEP_STANDBY') s.rstsr0 |= 0x80; // RSTSR0.DPSRSTF: the internal reset that ends Deep Software Standby
    else if (reason === 'PIN') { s.rstsr1 = 0; s.rstsr0 = 0; this.lpm.powerOn(); } // RES# pin: the cause registers start over (no flag of its own)
    // The log entry first, while the time still reads as before the reset.
    this.usBeforeReset = this.nowUs(); this.env.onReset?.(reason); this.cycleOffset = this.machine.cycles;
  }
  machineReset() {
    const us = this.usBeforeReset ?? (this.segment ? this.nowUs() : 0);
    this.scheduler.clear?.();
    this.segment = { cycle: 0, us, hz: this.resetHz };
    if (this.machine.cycles > 0 && this.cycleOffset !== this.machine.cycles) this.cycleOffset = this.machine.cycles;
    this.usBeforeReset = undefined;
    this.irqSources.clear();
    this.lpm.reset();
    for (const dev of this.peripherals.values()) dev.reset?.();
    this.clock = { iclk: this.resetHz, pclka: this.resetHz, pclkb: this.resetHz, pclkc: this.resetHz, pclkd: this.resetHz, fclk: this.resetHz, bclk: this.resetHz, sysclk: this.resetHz, hclk: this.resetHz, pclk1: this.resetHz, pclk2: this.resetHz };
    this.wdt?.clockChanged(); // an auto-started WDT counts PCLKB from the reset clock on
    this.republishAll();
  }
  systemReset(reason) { this.lastReset = { reason, us: this.nowUs() }; this.machine.requestReset(reason); }
  // ------------------------------------------------------------ interrupts
  irqNumber(irq, key, active) {
    if (irq == null) return;
    let set = this.irqSources.get(irq);
    if (!set) { set = new Set(); this.irqSources.set(irq, set); }
    const before = set.size > 0;
    if (active) set.add(key); else set.delete(key);
    const after = set.size > 0;
    if (before !== after || active) { const nvic = this.machine.nvic; if (nvic.setLine) nvic.setLine(irq, after); else if (after) nvic.setPending(irq); }
  }
  event() { if (this.machine.cpu) this.machine.cpu.eventReg = 1; }
  /** A watchdog's NMI request (ICU NMISR bit: 0 IWDT, 1 WDT). */
  nmi(bit) { if (this.lpm.nmi(bit)) this.icu.nmi(bit); }
  // ------------------------------------------------------------ pins
  pinState(pin, state) {
    const old = this.pins.get(pin);
    if (old && old.mode === state.mode && old.value === state.value && old.openDrain === state.openDrain && old.pull === state.pull && old.pwm?.frequency === state.pwm?.frequency && old.pwm?.duty === state.pwm?.duty) return;
    this.pins.set(pin, state);
    if (state.mode === 'OUTPUT') this.signals.gpio(pin, this.nowUs(), state.openDrain && state.value > 0 ? 1 : +(state.value > 1.65));
    this.env.pinState?.(pin, state);
  }
  republishAll() { this.ports?.publishAll(); }
  digitalIn(pin) { return this.env.digitalIn ? this.env.digitalIn(pin) : null; }
  analogIn(pin) { this.env.beforeInputRead?.(); return this.env.analogIn ? this.env.analogIn(pin) : null; }
  beforeInputRead() { this.env.beforeInputRead?.(); }
  inputsUpdated() { this.ports.refreshInputs(); }
  // Pins whose PFS selects `signal` ("SCI9_TXD"): PMR = 1 and the signal's PSEL.
  routedPins(signal) {
    const pins = RA_PERIPHERAL_PINS[signal]; if (!pins || !this.ports) return [];
    const psel = raPsel(signal);
    return pins.filter(pin => { const port = Number(pin.slice(1, -2)), bit = Number(pin.slice(-2)), c = this.ports.cfg(port, bit); return c.pmr && c.psel === psel; });
  }
  signalOf(pin, psel) { return Object.entries(RA_PERIPHERAL_PINS).find(([sig, pins]) => pins.includes(pin) && raPsel(sig) === psel)?.[0] ?? null; }
  // The level a peripheral drives on a pin set to it (SCI TXD idles high while TE is set).
  peripheralOutput(pin, psel) {
    const signal = this.signalOf(pin, psel); if (!signal) return null;
    const sci = /^SCI(\d)_(TXD|RXD|SCK)$/.exec(signal); if (sci) return this.scis[sci[1]]?.output(sci[2]) ?? null;
    const spi = /^SPI(\d)_(RSPCK|MOSI|MISO|SSL0)$/.exec(signal); if (spi) return this.rspis[spi[1]]?.output(spi[2]) ?? null;
    const gpt = /^GPT(\d)_(GTIOC[AB])$/.exec(signal); if (gpt) return this.gpts[gpt[1]]?.output(gpt[2]) ?? null;
    const iic = /^IIC(\d)_(SCL|SDA)$/.exec(signal); if (iic) return this.iics[iic[1]]?.output() ?? null;
    return null;
  }
  peripheralChanged(name) { for (const signal of Object.keys(RA_PERIPHERAL_PINS)) if (signal.startsWith(name + '_')) for (const pin of this.routedPins(signal)) { const port = Number(pin.slice(1, -2)), bit = Number(pin.slice(-2)); this.ports.publish(port, 1 << bit); } }
  // GTSTR / GTSTP / GTCLR are shared by every channel: bit n acts on GPTn.
  gptRunning() { let m = 0; for (const [ch, t] of Object.entries(this.gpts)) if (t.running) m |= 1 << ch; return m >>> 0; }
  gptControl(mask, op) { for (const [ch, t] of Object.entries(this.gpts)) if (mask & (1 << ch)) { if (op === 'start') t.start(); else if (op === 'stop') t.stop(); else t.setCount(0); } }
  lineSources(pin) { return this.env.lineSources ? this.env.lineSources(pin) : []; }
  uartEvent(e) { this.env.uartEvent?.(e); }
  i2cBus(name, pins) { return this.env.i2cBus?.(name, pins) ?? null; }
  // One byte with the SPI parts on the nets of `pins` ({sck, mosi, miso, nss}); 0xFF when nothing answers.
  spiTransfer(name, pins, byte, cfg) { return this.env.spiTransfer ? this.env.spiTransfer(name, pins, byte, cfg) : 0xff; }
}
