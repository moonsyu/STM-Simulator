// Cortex-M4 / STM32F446 주소 공간.
// Flash 512 KB(0x0800_0000, 0x0000_0000 별칭), SRAM 128 KB(0x2000_0000),
// 시스템 메모리·OTP·옵션 바이트(읽기 전용), 비트밴드 별칭, 주변장치 디코딩.
// 순수 JavaScript, Node/브라우저 공용. 호스트는 little-endian이라고 가정합니다(x86/ARM 공통).

export const FLASH_BASE = 0x08000000;
export const FLASH_SIZE = 0x80000;
export const SRAM_BASE = 0x20000000;
export const SRAM_SIZE = 0x20000;
export const ROM_BASE = 0x1fff0000;
export const ROM_SIZE = 0x10000;
export const SRAM_BB_BASE = 0x22000000;
export const PERIPH_BASE = 0x40000000;
export const PERIPH_BB_BASE = 0x42000000;

const PAGE_SHIFT = 10;
const LARGE_LIMIT = 4 * 1024 * 1024;

// 매핑되지 않은 주소 접근. CPU가 잡아서 BusFault로 바꿉니다.
export class BusFaultSignal {
  constructor(address, write, size, ifetch = false) {
    this.address = address >>> 0;
    this.write = !!write;
    this.size = size;
    this.ifetch = ifetch;
  }
}

export class Bus {
  constructor() {
    const fbuf = new ArrayBuffer(FLASH_SIZE + 8);
    this.flash = new Uint8Array(fbuf);
    this.flash.fill(0xff);
    this.flash16 = new Uint16Array(fbuf);
    this.flash32 = new Int32Array(fbuf);
    this.flashDV = new DataView(fbuf);

    const sbuf = new ArrayBuffer(SRAM_SIZE + 8);
    this.sram = new Uint8Array(sbuf);
    this.sram16 = new Uint16Array(sbuf);
    this.sram32 = new Int32Array(sbuf);
    this.sramDV = new DataView(sbuf);

    const rbuf = new ArrayBuffer(ROM_SIZE + 8);
    this.rom = new Uint8Array(rbuf);
    this.romDV = new DataView(rbuf);
    this._initRom();

    this.pages = new Map();
    this.large = [];
    this.mappings = [];
    this.deviceStates = [];
    this._stateByDevice = new Map();
    // 주변장치 접근 직전에 호출됩니다(machine이 해당 장치를 현재 사이클까지 진행시킴).
    this.onDeviceAccess = null;
    // CPU가 Flash에 쓸 때 호출됩니다. FLASH 컨트롤러 모델이 설정할 수 있습니다.
    // (offset, value, size) → 기본값(null)은 쓰기 무시.
    this.flashWriteHook = null;
  }

  _initRom() {
    // 0x1FFF0000..0x1FFF77FF: 시스템 메모리(부트로더) → 0
    // 0x1FFF7800..0x1FFF7A0F: OTP → 0xFF
    // 0x1FFFC000..: 옵션 바이트(RDP=0xAA, USER=0xEC, WRP=0x0FFF)
    this.rom.fill(0);
    this.rom.fill(0xff, 0x7800, 0x7a10);
    this.rom.fill(0xff, 0xc000, 0xc010);
    this.romDV.setUint16(0xc000, 0xaaec, true);
    this.romDV.setUint16(0xc002, 0x5513, true);
    this.romDV.setUint16(0xc008, 0x0fff, true);
    this.romDV.setUint16(0xc00a, 0xf000, true);
  }

  // ---- 주변장치 등록 ----
  map(base, size, device, name = '') {
    base >>>= 0;
    size >>>= 0;
    let state = this._stateByDevice.get(device);
    if (!state) {
      state = { device, last: 0, name };
      this._stateByDevice.set(device, state);
      this.deviceStates.push(state);
    }
    const entry = { base, size, end: base + size, device, name, state };
    this.mappings.push(entry);
    if (size > LARGE_LIMIT) {
      this.large.unshift(entry);
      return entry;
    }
    const first = base >>> PAGE_SHIFT;
    const last = (base + size - 1) >>> PAGE_SHIFT;
    const full = (base & 1023) === 0 && (size & 1023) === 0;
    for (let p = first; p <= last; p++) {
      if (full) {
        this.pages.set(p, entry);
      } else {
        const prev = this.pages.get(p);
        if (prev === undefined) this.pages.set(p, [entry]);
        else if (Array.isArray(prev)) prev.unshift(entry);
        else this.pages.set(p, [entry, prev]);
      }
    }
    return entry;
  }

  unmap(device) {
    const keep = this.mappings.filter((m) => m.device !== device);
    this.pages.clear();
    this.large = [];
    this.mappings = [];
    const st = this._stateByDevice.get(device);
    if (st) {
      this._stateByDevice.delete(device);
      this.deviceStates = this.deviceStates.filter((s) => s !== st);
    }
    for (const m of keep) this.map(m.base, m.size, m.device, m.name);
  }

  find(a) {
    a >>>= 0;
    const v = this.pages.get(a >>> PAGE_SHIFT);
    if (v !== undefined) {
      if (!Array.isArray(v)) return v;
      for (let i = 0; i < v.length; i++) {
        const e = v[i];
        if (a >= e.base && a < e.end) return e;
      }
    }
    const L = this.large;
    for (let i = 0; i < L.length; i++) {
      const e = L[i];
      if (a >= e.base && a - e.base < e.size) return e;
    }
    return null;
  }

  // ---- 빠른 경로: CPU용 ----
  // read32 → int32, read16/read8 → unsigned
  read32(a) {
    if ((a >>> 17) === 0x1000) {
      const o = a & 0x1ffff;
      return (o & 3) === 0 ? this.sram32[o >>> 2] : this.sramDV.getInt32(o, true);
    }
    const hi = a >>> 19;
    if (hi === 0x100 || hi === 0) {
      const o = a & 0x7ffff;
      return (o & 3) === 0 ? this.flash32[o >>> 2] : this.flashDV.getInt32(o, true);
    }
    return this.slowRead(a, 4) | 0;
  }

  read16(a) {
    if ((a >>> 17) === 0x1000) {
      const o = a & 0x1ffff;
      return (o & 1) === 0 ? this.sram16[o >>> 1] : this.sramDV.getUint16(o, true);
    }
    const hi = a >>> 19;
    if (hi === 0x100 || hi === 0) {
      const o = a & 0x7ffff;
      return (o & 1) === 0 ? this.flash16[o >>> 1] : this.flashDV.getUint16(o, true);
    }
    return this.slowRead(a, 2) & 0xffff;
  }

  read8(a) {
    if ((a >>> 17) === 0x1000) return this.sram[a & 0x1ffff];
    const hi = a >>> 19;
    if (hi === 0x100 || hi === 0) return this.flash[a & 0x7ffff];
    return this.slowRead(a, 1) & 0xff;
  }

  write32(a, v) {
    if ((a >>> 17) === 0x1000) {
      const o = a & 0x1ffff;
      if ((o & 3) === 0) this.sram32[o >>> 2] = v;
      else this.sramDV.setInt32(o, v | 0, true);
      return;
    }
    this.slowWrite(a, v >>> 0, 4);
  }

  write16(a, v) {
    if ((a >>> 17) === 0x1000) {
      const o = a & 0x1ffff;
      if ((o & 1) === 0) this.sram16[o >>> 1] = v;
      else this.sramDV.setUint16(o, v & 0xffff, true);
      return;
    }
    this.slowWrite(a, v & 0xffff, 2);
  }

  write8(a, v) {
    if ((a >>> 17) === 0x1000) {
      this.sram[a & 0x1ffff] = v;
      return;
    }
    this.slowWrite(a, v & 0xff, 1);
  }

  // 명령어 페치(짝수 주소). 실패 시 BusFaultSignal.
  fetch16(a) {
    const hi = a >>> 19;
    if (hi === 0x100 || hi === 0) return this.flash16[(a & 0x7ffff) >>> 1];
    if ((a >>> 17) === 0x1000) return this.sram16[(a & 0x1ffff) >>> 1];
    if ((a >>> 16) === 0x1fff) return this.romDV.getUint16(a & 0xffff, true);
    throw new BusFaultSignal(a, false, 2, true);
  }

  // ---- 느린 경로 ----
  slowRead(a, size) {
    a >>>= 0;
    const top = a >>> 25;
    if (top === 0x11) return this._bitbandRead(a, SRAM_BASE + ((a - SRAM_BB_BASE) >>> 5), size);
    if (top === 0x21) return this._bitbandRead(a, PERIPH_BASE + ((a - PERIPH_BB_BASE) >>> 5), size);
    if ((a >>> 16) === 0x1fff) return this._romRead(a & 0xffff, size);
    const e = this.find(a);
    if (e === null) throw new BusFaultSignal(a, false, size);
    if (this.onDeviceAccess !== null) this.onDeviceAccess(e.state);
    const v = e.device.read(a - e.base, size);
    return size === 4 ? v >>> 0 : size === 2 ? v & 0xffff : v & 0xff;
  }

  slowWrite(a, v, size) {
    a >>>= 0;
    const hi = a >>> 19;
    if (hi === 0x100 || hi === 0) {
      if (this.flashWriteHook) this.flashWriteHook(a & 0x7ffff, v, size);
      return;
    }
    const top = a >>> 25;
    if (top === 0x11) return this._bitbandWrite(a, SRAM_BASE + ((a - SRAM_BB_BASE) >>> 5), v);
    if (top === 0x21) return this._bitbandWrite(a, PERIPH_BASE + ((a - PERIPH_BB_BASE) >>> 5), v);
    if ((a >>> 16) === 0x1fff) return; // 읽기 전용(쓰기 무시)
    const e = this.find(a);
    if (e === null) throw new BusFaultSignal(a, true, size);
    if (this.onDeviceAccess !== null) this.onDeviceAccess(e.state);
    e.device.write(a - e.base, v, size);
  }

  _romRead(o, size) {
    if (size === 4) return this.romDV.getUint32(o, true);
    if (size === 2) return this.romDV.getUint16(o, true);
    return this.rom[o];
  }

  _bitbandRead(alias, byteAddr, size) {
    byteAddr >>>= 0;
    const bit = (alias >>> 2) & 7;
    void size;
    if ((byteAddr >>> 17) === 0x1000) return (this.sram[byteAddr & 0x1ffff] >>> bit) & 1;
    const word = byteAddr & ~3;
    const wbit = ((byteAddr & 3) << 3) + bit;
    return (this.slowRead(word >>> 0, 4) >>> wbit) & 1;
  }

  _bitbandWrite(alias, byteAddr, v) {
    byteAddr >>>= 0;
    const bit = (alias >>> 2) & 7;
    if ((byteAddr >>> 17) === 0x1000) {
      const o = byteAddr & 0x1ffff;
      if (v & 1) this.sram[o] |= 1 << bit;
      else this.sram[o] &= ~(1 << bit);
      return;
    }
    // 주변장치: 워드 단위 read-modify-write
    const word = byteAddr & ~3;
    const wbit = ((byteAddr & 3) << 3) + bit;
    const cur = this.slowRead(word, 4);
    const nv = v & 1 ? cur | (1 << wbit) : cur & ~(1 << wbit);
    this.slowWrite(word, nv >>> 0, 4);
  }

  // ---- 디버거/로더용 ----
  // 부작용 없이 읽기(가능한 경우). 주변장치는 device.peek가 있으면 사용합니다.
  peek(a, size = 4, { allowSideEffects = true } = {}) {
    a >>>= 0;
    const hi = a >>> 19;
    let dv = null;
    let o = 0;
    if ((a >>> 17) === 0x1000) { dv = this.sramDV; o = a & 0x1ffff; }
    else if (hi === 0x100 || hi === 0) { dv = this.flashDV; o = a & 0x7ffff; }
    else if ((a >>> 16) === 0x1fff) { dv = this.romDV; o = a & 0xffff; }
    if (dv) return size === 4 ? dv.getUint32(o, true) : size === 2 ? dv.getUint16(o, true) : dv.getUint8(o);
    const top = a >>> 25;
    if (top === 0x11) {
      const b = this.peek(SRAM_BASE + ((a - SRAM_BB_BASE) >>> 5), 1);
      return b === null ? null : (b >>> ((a >>> 2) & 7)) & 1;
    }
    const e = this.find(a);
    if (!e) return null;
    try {
      if (typeof e.device.peek === 'function') {
        const v = e.device.peek(a - e.base, size);
        return v === undefined || v === null ? null : v >>> 0;
      }
      if (!allowSideEffects) return null;
      return e.device.read(a - e.base, size) >>> 0;
    } catch {
      return null;
    }
  }

  peek8(a) { return this.peek(a, 1); }
  peek16(a) { return this.peek(a, 2); }
  peek32(a) { return this.peek(a, 4); }

  // 디버거 쓰기: Flash도 직접 수정합니다.
  poke(a, v, size = 4) {
    a >>>= 0;
    const hi = a >>> 19;
    let dv = null;
    let o = 0;
    if ((a >>> 17) === 0x1000) { dv = this.sramDV; o = a & 0x1ffff; }
    else if (hi === 0x100 || hi === 0) { dv = this.flashDV; o = a & 0x7ffff; }
    if (dv) {
      if (size === 4) dv.setUint32(o, v >>> 0, true);
      else if (size === 2) dv.setUint16(o, v & 0xffff, true);
      else dv.setUint8(o, v & 0xff);
      return true;
    }
    try {
      this.slowWrite(a, size === 4 ? v >>> 0 : v & ((1 << (size * 8)) - 1), size);
      return true;
    } catch {
      return false;
    }
  }

  // ELF 로더용 바이트 복사.
  loadBytes(addr, bytes) {
    addr >>>= 0;
    for (let i = 0; i < bytes.length; i++) {
      const a = (addr + i) >>> 0;
      const hi = a >>> 19;
      if (hi === 0x100 || hi === 0) this.flash[a & 0x7ffff] = bytes[i];
      else if ((a >>> 17) === 0x1000) this.sram[a & 0x1ffff] = bytes[i];
      else if ((a >>> 16) === 0x1fff) this.rom[a & 0xffff] = bytes[i];
      else this.poke(a, bytes[i], 1);
    }
  }

  // FLASH 컨트롤러 모델이 실제 프로그래밍 결과를 반영할 때 사용합니다.
  programFlash(offset, value, size) {
    offset &= 0x7ffff;
    if (size === 4) this.flashDV.setUint32(offset, value >>> 0, true);
    else if (size === 2) this.flashDV.setUint16(offset, value & 0xffff, true);
    else this.flash[offset] = value & 0xff;
  }

  eraseFlash(offset = 0, length = FLASH_SIZE) {
    this.flash.fill(0xff, offset & 0x7ffff, Math.min(FLASH_SIZE, (offset & 0x7ffff) + length));
  }

  resetMemory({ keepFlash = true } = {}) {
    this.sram.fill(0);
    if (!keepFlash) this.flash.fill(0xff);
  }

  isNormalMemory(a) {
    a >>>= 0;
    const hi = a >>> 19;
    return hi === 0x100 || hi === 0 || (a >>> 17) === 0x1000 || (a >>> 16) === 0x1fff;
  }
}
