// RA6E1 (R7FA6E10F) address space: Code Flash 1 MB at 0x0000_0000, SRAM 256 KB at 0x2000_0000, Data Flash 8 KB at
// 0x0800_0000, the option-setting memory at 0x0100_A100 (erased: reads 0xFF), peripherals from 0x4000_0000.
// Cortex-M33 has no bit-band. Same interface as the STM32 Bus (fast CPU paths, slow device paths, debugger peek/poke,
// ELF loading), so the CPU, machine and debugger use it unchanged.
import { Bus, BusFaultSignal } from '../bus.js';

export const RA_FLASH_SIZE = 0x100000;
export const RA_SRAM_BASE = 0x20000000;
export const RA_SRAM_SIZE = 0x40000;
export const RA_DATA_FLASH_BASE = 0x08000000;
export const RA_DATA_FLASH_SIZE = 0x2000;
const OPTION_BASE = 0x01000000, OPTION_SIZE = 0x10000;

export class RaBus extends Bus {
  constructor() {
    super();
    const fbuf = new ArrayBuffer(RA_FLASH_SIZE + 8);
    this.flash = new Uint8Array(fbuf); this.flash.fill(0xff);
    this.flash16 = new Uint16Array(fbuf); this.flash32 = new Int32Array(fbuf); this.flashDV = new DataView(fbuf);
    const sbuf = new ArrayBuffer(RA_SRAM_SIZE + 8);
    this.sram = new Uint8Array(sbuf); this.sram16 = new Uint16Array(sbuf); this.sram32 = new Int32Array(sbuf); this.sramDV = new DataView(sbuf);
    const dbuf = new ArrayBuffer(RA_DATA_FLASH_SIZE + 8);
    this.dataFlash = new Uint8Array(dbuf); this.dataFlash.fill(0xff); this.dataFlashDV = new DataView(dbuf);
  }
  _initRom() { /* no STM32 system memory */ }
  // Normal memory of `a` as [DataView, offset, writable] or null (a peripheral or unmapped).
  region(a) {
    if ((a >>> 18) === 0x800) return [this.sramDV, a & (RA_SRAM_SIZE - 1), true];
    if (a < RA_FLASH_SIZE) return [this.flashDV, a, false];
    if ((a >>> 13) === (RA_DATA_FLASH_BASE >>> 13)) return [this.dataFlashDV, a & (RA_DATA_FLASH_SIZE - 1), false];
    return null;
  }
  read32(a) {
    a >>>= 0;
    if ((a >>> 18) === 0x800) { const o = a & 0x3ffff; return (o & 3) === 0 ? this.sram32[o >>> 2] : this.sramDV.getInt32(o, true); }
    if (a < RA_FLASH_SIZE) return (a & 3) === 0 ? this.flash32[a >>> 2] : this.flashDV.getInt32(a, true);
    return this.slowRead(a, 4) | 0;
  }
  read16(a) {
    a >>>= 0;
    if ((a >>> 18) === 0x800) { const o = a & 0x3ffff; return (o & 1) === 0 ? this.sram16[o >>> 1] : this.sramDV.getUint16(o, true); }
    if (a < RA_FLASH_SIZE) return (a & 1) === 0 ? this.flash16[a >>> 1] : this.flashDV.getUint16(a, true);
    return this.slowRead(a, 2) & 0xffff;
  }
  read8(a) {
    a >>>= 0;
    if ((a >>> 18) === 0x800) return this.sram[a & 0x3ffff];
    if (a < RA_FLASH_SIZE) return this.flash[a];
    return this.slowRead(a, 1) & 0xff;
  }
  write32(a, v) { a >>>= 0; if ((a >>> 18) === 0x800) { const o = a & 0x3ffff; if ((o & 3) === 0) this.sram32[o >>> 2] = v; else this.sramDV.setInt32(o, v | 0, true); return; } this.slowWrite(a, v >>> 0, 4); }
  write16(a, v) { a >>>= 0; if ((a >>> 18) === 0x800) { const o = a & 0x3ffff; if ((o & 1) === 0) this.sram16[o >>> 1] = v; else this.sramDV.setUint16(o, v & 0xffff, true); return; } this.slowWrite(a, v & 0xffff, 2); }
  write8(a, v) { a >>>= 0; if ((a >>> 18) === 0x800) { this.sram[a & 0x3ffff] = v; return; } this.slowWrite(a, v & 0xff, 1); }
  fetch16(a) {
    a >>>= 0;
    if (a < RA_FLASH_SIZE) return this.flash16[a >>> 1];
    if ((a >>> 18) === 0x800) return this.sram16[(a & 0x3ffff) >>> 1];
    throw new BusFaultSignal(a, false, 2, true);
  }
  slowRead(a, size) {
    a >>>= 0;
    const r = this.region(a);
    if (r) return size === 4 ? r[0].getUint32(r[1], true) : size === 2 ? r[0].getUint16(r[1], true) : r[0].getUint8(r[1]);
    if ((a >>> 16) === (OPTION_BASE >>> 16)) return size === 4 ? 0xffffffff : size === 2 ? 0xffff : 0xff;
    const e = this.find(a);
    if (e === null) throw new BusFaultSignal(a, false, size);
    if (this.onDeviceAccess !== null) this.onDeviceAccess(e.state);
    const v = e.device.read(a - e.base, size);
    return size === 4 ? v >>> 0 : size === 2 ? v & 0xffff : v & 0xff;
  }
  slowWrite(a, v, size) {
    a >>>= 0;
    if (a < RA_FLASH_SIZE || (a >>> 13) === (RA_DATA_FLASH_BASE >>> 13)) { if (this.flashWriteHook) this.flashWriteHook(a, v, size); return; }
    if ((a >>> 16) === (OPTION_BASE >>> 16)) return;
    const e = this.find(a);
    if (e === null) throw new BusFaultSignal(a, true, size);
    if (this.onDeviceAccess !== null) this.onDeviceAccess(e.state);
    e.device.write(a - e.base, v, size);
  }
  peek(a, size = 4, { allowSideEffects = true } = {}) {
    a >>>= 0;
    const r = this.region(a);
    if (r) return size === 4 ? r[0].getUint32(r[1], true) : size === 2 ? r[0].getUint16(r[1], true) : r[0].getUint8(r[1]);
    if ((a >>> 16) === (OPTION_BASE >>> 16)) return size === 4 ? 0xffffffff : size === 2 ? 0xffff : 0xff;
    const e = this.find(a);
    if (!e) return null;
    try {
      if (typeof e.device.peek === 'function') { const v = e.device.peek(a - e.base, size); return v === undefined || v === null ? null : v >>> 0; }
      if (!allowSideEffects) return null;
      return e.device.read(a - e.base, size) >>> 0;
    } catch { return null; }
  }
  poke(a, v, size = 4) {
    a >>>= 0;
    const r = this.region(a);
    if (r) { if (size === 4) r[0].setUint32(r[1], v >>> 0, true); else if (size === 2) r[0].setUint16(r[1], v & 0xffff, true); else r[0].setUint8(r[1], v & 0xff); return true; }
    try { this.slowWrite(a, size === 4 ? v >>> 0 : v & ((1 << (size * 8)) - 1), size); return true; } catch { return false; }
  }
  loadBytes(addr, bytes) {
    addr >>>= 0;
    for (let i = 0; i < bytes.length; i++) {
      const a = (addr + i) >>> 0, r = this.region(a);
      if (r) r[0].setUint8(r[1], bytes[i]);
      else if ((a >>> 16) === (OPTION_BASE >>> 16)) continue; // option settings: the emulator keeps the erased values
      else this.poke(a, bytes[i], 1);
    }
  }
  programFlash(offset, value, size) {
    const dv = this.flashDV;
    if (size === 4) dv.setUint32(offset, value >>> 0, true); else if (size === 2) dv.setUint16(offset, value & 0xffff, true); else dv.setUint8(offset, value & 0xff);
  }
  resetMemory({ keepFlash = true } = {}) {
    this.sram.fill(0);
    if (!keepFlash) { this.flash.fill(0xff); this.dataFlash.fill(0xff); }
  }
  isNormalMemory(a) { return this.region(a >>> 0) !== null; }
}
