// System Control Space와 Private Peripheral Bus(0xE000_0000..0xE00F_FFFF).
// NVIC(예외 상태), SCB, SysTick, DWT, ITM, CoreDebug, FPU 제어 레지스터.

export const EXC_RESET = 1;
export const EXC_NMI = 2;
export const EXC_HARDFAULT = 3;
export const EXC_MEMMANAGE = 4;
export const EXC_BUSFAULT = 5;
export const EXC_USAGEFAULT = 6;
export const EXC_SVCALL = 11;
export const EXC_DEBUGMON = 12;
export const EXC_PENDSV = 14;
export const EXC_SYSTICK = 15;
export const NUM_IRQ = 96;
export const NUM_EXC = 16 + NUM_IRQ;
export const PRIO_BITS = 4;
const PRIO_MASK = (0xff << (8 - PRIO_BITS)) & 0xff;

// CFSR 비트
export const CFSR = {
  IACCVIOL: 1 << 0, DACCVIOL: 1 << 1, MUNSTKERR: 1 << 3, MSTKERR: 1 << 4, MLSPERR: 1 << 5, MMARVALID: 1 << 7,
  IBUSERR: 1 << 8, PRECISERR: 1 << 9, IMPRECISERR: 1 << 10, UNSTKERR: 1 << 11, STKERR: 1 << 12, LSPERR: 1 << 13, BFARVALID: 1 << 15,
  UNDEFINSTR: 1 << 16, INVSTATE: 1 << 17, INVPC: 1 << 18, NOCP: 1 << 19, UNALIGNED: 1 << 24, DIVBYZERO: 1 << 25,
};

// 예외 활성/대기/우선순위 상태. 번호는 예외 번호(IRQn + 16).
export class Nvic {
  constructor() {
    this.pending = new Uint8Array(NUM_EXC);
    this.active = new Uint8Array(NUM_EXC);
    this.enabled = new Uint8Array(NUM_EXC);
    this.prio = new Int16Array(NUM_EXC);
    this.lines = new Uint8Array(NUM_IRQ);
    this.prigroup = 0;
    this.groupMask = 0xfe;
    this.dirty = true;
    this.activeCount = 0;
    this._activeGroup = 256;
    this.cpu = null;
    this.sevOnPend = false;
    this.reset();
  }

  reset() {
    this.pending.fill(0);
    this.active.fill(0);
    this.enabled.fill(0);
    this.prio.fill(0);
    this.lines.fill(0);
    this.prio[EXC_RESET] = -3;
    this.prio[EXC_NMI] = -2;
    this.prio[EXC_HARDFAULT] = -1;
    for (const n of [EXC_NMI, EXC_HARDFAULT, EXC_SVCALL, EXC_PENDSV, EXC_SYSTICK]) this.enabled[n] = 1;
    this.setPriGroup(0);
    this.activeCount = 0;
    this._activeGroup = 256;
    this.dirty = true;
    this.sevOnPend = false;
  }

  setPriGroup(g) {
    this.prigroup = g & 7;
    this.groupMask = (0xff << (this.prigroup + 1)) & 0xff;
    this._recomputeActive();
    this.dirty = true;
  }

  groupPri(p) {
    return p < 0 ? p : p & this.groupMask;
  }

  // ---- 주변장치용 API ----
  setPending(irq) {
    if (irq >= 0 && irq < NUM_IRQ) this.setPendingExc(irq + 16);
  }

  clearPending(irq) {
    if (irq >= 0 && irq < NUM_IRQ) this.clearPendingExc(irq + 16);
  }

  setLine(irq, active) {
    if (irq < 0 || irq >= NUM_IRQ) return;
    const on = active ? 1 : 0;
    if (this.lines[irq] === on) return;
    this.lines[irq] = on;
    if (on && !this.active[irq + 16]) this.setPendingExc(irq + 16);
  }

  isPending(irq) { return !!this.pending[irq + 16]; }
  isActive(irq) { return !!this.active[irq + 16]; }
  isEnabled(irq) { return !!this.enabled[irq + 16]; }

  setPendingExc(n) {
    if (this.pending[n]) return;
    this.pending[n] = 1;
    this.dirty = true;
    if (this.sevOnPend && n >= 16 && this.cpu) this.cpu.eventReg = 1;
  }

  clearPendingExc(n) {
    if (!this.pending[n]) return;
    if (n >= 16 && this.lines[n - 16] && !this.active[n]) return; // 레벨 신호 유지 중
    this.pending[n] = 0;
    this.dirty = true;
  }

  setEnabled(n, on) {
    on = on ? 1 : 0;
    if (this.enabled[n] !== on) {
      this.enabled[n] = on;
      this.dirty = true;
    }
  }

  setPriority(n, p) {
    if (n <= EXC_HARDFAULT) return;
    this.prio[n] = p & PRIO_MASK;
    if (this.active[n]) this._recomputeActive();
    this.dirty = true;
  }

  activate(n) {
    this.pending[n] = 0;
    if (!this.active[n]) {
      this.active[n] = 1;
      this.activeCount++;
    }
    const g = this.groupPri(this.prio[n]);
    if (g < this._activeGroup) this._activeGroup = g;
    this.dirty = true;
  }

  deactivate(n) {
    if (this.active[n]) {
      this.active[n] = 0;
      this.activeCount--;
    }
    if (n >= 16 && this.lines[n - 16]) this.pending[n] = 1; // 레벨형: 신호가 남아 있으면 다시 대기
    this._recomputeActive();
    this.dirty = true;
  }

  _recomputeActive() {
    let g = 256;
    let c = 0;
    for (let n = 1; n < NUM_EXC; n++) {
      if (this.active[n]) {
        c++;
        const p = this.groupPri(this.prio[n]);
        if (p < g) g = p;
      }
    }
    this._activeGroup = g;
    this.activeCount = c;
  }

  activeGroupPri() {
    return this._activeGroup;
  }

  // 가장 우선순위가 높은 대기 예외(활성화된 것만). 없으면 0.
  bestPending(includeDisabled = false) {
    let best = 0;
    let bp = 1000;
    const P = this.pending;
    const E = this.enabled;
    const pr = this.prio;
    for (let n = 1; n < NUM_EXC; n++) {
      if (P[n] && (includeDisabled || E[n])) {
        const p = pr[n];
        if (p < bp) {
          bp = p;
          best = n;
        }
      }
    }
    return best;
  }

  anyExternalPending() {
    for (let n = 16; n < NUM_EXC; n++) if (this.pending[n]) return true;
    return false;
  }
}

const SYST_CSR = 0xe010;
const ITM_BASE = 0x0000;
const DWT_BASE = 0x1000;
const SCS_BASE = 0xe000;

// PPB 장치: bus.map(0xE0000000, 0x100000, scs, 'PPB')
export class Scs {
  constructor(machine) {
    this.machine = machine;
    this.nvic = new Nvic();
    this.cpu = null;
    this.reset();
  }

  reset() {
    this.nvic.reset();
    // SCB
    this.vtor = 0;
    this.aircr = 0; // PRIGROUP만 의미 있음
    this.scr = 0;
    this.ccr = 0x200; // STKALIGN
    this.shcsrBits = 0; // MEMFAULTENA 등 enable 비트만 보관
    this.cfsr = 0;
    this.hfsr = 0;
    this.dfsr = 0;
    this.mmfar = 0;
    this.bfar = 0;
    this.afsr = 0;
    this.actlr = 0;
    this.cpacr = 0;
    this.fpccr = 0xc0000000; // ASPEN | LSPEN
    this.fpcar = 0;
    this.fpdscr = 0;
    // SysTick
    this.stCtrl = 0;
    this.stLoad = 0;
    this.stVal = 0;
    this.stDiv = 0;
    // DWT
    this.dwtCtrl = 0x40000000;
    this.cyccnt = 0;
    this.dwtRegs = new Map();
    // ITM
    this.itmTer = 0;
    this.itmTpr = 0;
    this.itmTcr = 0;
    // CoreDebug
    this.dhcsr = 0;
    this.demcr = 0;
    this.dcrdr = 0;
    // MPU (강제 없이 값만 보관)
    this.mpuCtrl = 0;
    this.mpuRnr = 0;
    this.mpuRbar = new Uint32Array(8);
    this.mpuRasr = new Uint32Array(8);
    this.misc = new Map();
    this.unalignTrp = false;
    this.div0Trp = false;
    if (this.cpu) this.cpu.scsChanged();
  }

  get sleepOnExit() { return (this.scr & 2) !== 0; }
  get sevOnPend() { return (this.scr & 0x10) !== 0; }

  // ---- SysTick ----
  tick(cycles) {
    if (this.dwtCtrl & 1 && this.demcr & (1 << 24)) this.cyccnt = (this.cyccnt + cycles) >>> 0;
    if (!(this.stCtrl & 1)) return;
    let n;
    if (this.stCtrl & 4) n = cycles;
    else {
      this.stDiv += cycles;
      n = Math.floor(this.stDiv / 8);
      this.stDiv -= n * 8;
    }
    if (n <= 0) return;
    this._systickCount(n);
  }

  _systickCount(n) {
    let val = this.stVal;
    const load = this.stLoad;
    while (n > 0) {
      if (val === 0) {
        if (load === 0) break; // RVR=0이면 정지
        val = load; // 0 다음 클럭에서 재적재
        n--;
        continue;
      }
      if (n < val) {
        val -= n;
        break;
      }
      n -= val;
      val = 0;
      this._systickWrap();
      const period = load + 1;
      if (n >= period && load > 0) {
        n -= Math.floor(n / period) * period;
        this._systickWrap();
      }
    }
    this.stVal = val;
  }

  _systickWrap() {
    this.stCtrl |= 0x10000;
    if (this.stCtrl & 2) this.nvic.setPendingExc(15);
  }

  // 다음 SysTick 인터럽트까지 남은 코어 사이클(절대값)
  nextEvent(machine) {
    if ((this.stCtrl & 3) !== 3) return Infinity;
    let counts = this.stVal === 0 ? this.stLoad + 1 : this.stVal;
    if (this.stLoad === 0 && this.stVal === 0) return Infinity;
    let cyc = (this.stCtrl & 4) ? counts : counts * 8 - this.stDiv;
    return machine.cycles + Math.max(1, cyc);
  }

  // ---- 버스 인터페이스 ----
  read(offset, size) {
    const al = offset & ~3;
    const v = this.read32(al) >>> 0;
    if (size === 4) return v;
    const sh = (offset & 3) * 8;
    return (v >>> sh) & (size === 2 ? 0xffff : 0xff);
  }

  peek(offset, size) {
    const al = offset & ~3;
    let v;
    if (al === SYST_CSR) v = this.stCtrl;
    else v = this.read32(al);
    v >>>= 0;
    if (size === 4) return v;
    const sh = (offset & 3) * 8;
    return (v >>> sh) & (size === 2 ? 0xffff : 0xff);
  }

  write(offset, value, size) {
    const al = offset & ~3;
    const sh = (offset & 3) * 8;
    const mask = size === 4 ? 0xffffffff : ((size === 2 ? 0xffff : 0xff) << sh) >>> 0;
    const v = size === 4 ? value >>> 0 : ((value << sh) & mask) >>> 0;
    this.write32(al, v, mask >>> 0, size);
  }

  _icsr() {
    const cpu = this.cpu;
    const nv = this.nvic;
    let v = 0;
    const ipsr = cpu ? cpu.ipsr : 0;
    v |= ipsr & 0x1ff;
    // RETTOBASE: 현재 예외 외 활성 예외 없음
    if (ipsr !== 0 && nv.activeCount <= 1) v |= 1 << 11;
    const vp = nv.bestPending(false);
    v |= (vp & 0x1ff) << 12;
    if (nv.anyExternalPending()) v |= 1 << 22;
    if (nv.pending[EXC_SYSTICK]) v |= 1 << 26;
    if (nv.pending[EXC_PENDSV]) v |= 1 << 28;
    if (nv.pending[EXC_NMI]) v |= 1 << 31;
    return v >>> 0;
  }

  _shcsr() {
    const nv = this.nvic;
    let v = 0;
    if (nv.active[EXC_MEMMANAGE]) v |= 1 << 0;
    if (nv.active[EXC_BUSFAULT]) v |= 1 << 1;
    if (nv.active[EXC_USAGEFAULT]) v |= 1 << 3;
    if (nv.active[EXC_SVCALL]) v |= 1 << 7;
    if (nv.active[EXC_DEBUGMON]) v |= 1 << 8;
    if (nv.active[EXC_PENDSV]) v |= 1 << 10;
    if (nv.active[EXC_SYSTICK]) v |= 1 << 11;
    if (nv.pending[EXC_USAGEFAULT]) v |= 1 << 12;
    if (nv.pending[EXC_MEMMANAGE]) v |= 1 << 13;
    if (nv.pending[EXC_BUSFAULT]) v |= 1 << 14;
    if (nv.pending[EXC_SVCALL]) v |= 1 << 15;
    if (nv.enabled[EXC_MEMMANAGE]) v |= 1 << 16;
    if (nv.enabled[EXC_BUSFAULT]) v |= 1 << 17;
    if (nv.enabled[EXC_USAGEFAULT]) v |= 1 << 18;
    return v >>> 0;
  }

  read32(off) {
    const nv = this.nvic;
    // ITM
    if (off < 0x1000) {
      if (off < 0x80) return 1; // FIFOREADY
      switch (off) {
        case 0xe00: return this.itmTer;
        case 0xe40: return this.itmTpr;
        case 0xe80: return this.itmTcr;
        case 0xfb4: return 0x3;
        default: return 0;
      }
    }
    if (off >= DWT_BASE && off < 0x2000) {
      const o = off - DWT_BASE;
      if (o === 0) return this.dwtCtrl;
      if (o === 4) return this.cyccnt;
      if (o === 0xfb4) return 0x3;
      return this.dwtRegs.get(o) || 0;
    }
    if (off < SCS_BASE || off >= 0xf000) return 0;
    const o = off - SCS_BASE;
    if (o >= 0x100 && o < 0x500) {
      if (o < 0x180) return this._bits(nv.enabled, (o - 0x100) >> 2);
      if (o < 0x200) return this._bits(nv.enabled, (o - 0x180) >> 2);
      if (o < 0x280) return this._bits(nv.pending, (o - 0x200) >> 2);
      if (o < 0x300) return this._bits(nv.pending, (o - 0x280) >> 2);
      if (o < 0x380) return this._bits(nv.active, (o - 0x300) >> 2);
      if (o >= 0x400 && o < 0x400 + NUM_IRQ) {
        const n = 16 + (o - 0x400);
        return (nv.prio[n] | (nv.prio[n + 1] << 8) | (nv.prio[n + 2] << 16) | (nv.prio[n + 3] << 24)) >>> 0;
      }
      return 0;
    }
    switch (o) {
      case 0x004: return (NUM_IRQ / 32) - 1;
      case 0x008: return this.actlr;
      case 0x010: { const v = this.stCtrl; this.stCtrl &= ~0x10000; return v; }
      case 0x014: return this.stLoad;
      case 0x018: return this.stVal;
      case 0x01c: return this._calib();
      case 0xd00: return 0x410fc241;
      case 0xd04: return this._icsr();
      case 0xd08: return this.vtor;
      case 0xd0c: return (0xfa050000 | (nv.prigroup << 8)) >>> 0;
      case 0xd10: return this.scr;
      case 0xd14: return this.ccr;
      case 0xd18: return this._prio4(4);
      case 0xd1c: return this._prio4(8);
      case 0xd20: return this._prio4(12);
      case 0xd24: return this._shcsr();
      case 0xd28: return this.cfsr;
      case 0xd2c: return this.hfsr;
      case 0xd30: return this.dfsr;
      case 0xd34: return this.mmfar;
      case 0xd38: return this.bfar;
      case 0xd3c: return this.afsr;
      case 0xd40: return 0x00000030;
      case 0xd44: return 0x00000200;
      case 0xd48: return 0x00100000;
      case 0xd4c: return 0;
      case 0xd50: return 0x00100030;
      case 0xd54: return 0;
      case 0xd58: return 0x01000000;
      case 0xd5c: return 0;
      case 0xd60: return 0x01101110;
      case 0xd64: return 0x02111000;
      case 0xd68: return 0x21112231;
      case 0xd6c: return 0x01111110;
      case 0xd70: return 0x01310132;
      case 0xd88: return this.cpacr;
      case 0xd90: return 0x800;
      case 0xd94: return this.mpuCtrl;
      case 0xd98: return this.mpuRnr;
      case 0xd9c: case 0xda4: case 0xdac: case 0xdb4:
        return ((this.mpuRbar[this.mpuRnr & 7] & ~0x1f) | (this.mpuRnr & 7)) >>> 0;
      case 0xda0: case 0xda8: case 0xdb0: case 0xdb8:
        return this.mpuRasr[this.mpuRnr & 7];
      case 0xdf0: return (this.dhcsr & 0x2f) | (1 << 16) | (this.cpu && this.cpu.sleeping ? 1 << 18 : 0) | (this.cpu && this.cpu.lockedUp ? 1 << 19 : 0);
      case 0xdf4: return 0;
      case 0xdf8: return this.dcrdr;
      case 0xdfc: return this.demcr;
      case 0xf34: return this.fpccr;
      case 0xf38: return this.fpcar;
      case 0xf3c: return this.fpdscr;
      case 0xf40: return 0x10110021;
      case 0xf44: return 0x11000011;
      default:
        return this.misc.get(o) || 0;
    }
  }

  _calib() {
    const hclk = (this.machine && this.machine.clock && this.machine.clock.hclk) || 16e6;
    const tenms = Math.max(1, Math.round(hclk / 8 / 100)) - 1;
    return (0x40000000 | (tenms & 0xffffff)) >>> 0;
  }

  _bits(arr, word) {
    let v = 0;
    const base = 16 + word * 32;
    for (let i = 0; i < 32; i++) {
      const n = base + i;
      if (n < NUM_EXC && arr[n]) v |= 1 << i;
    }
    return v >>> 0;
  }

  _prio4(n0) {
    const p = this.nvic.prio;
    let v = 0;
    for (let i = 0; i < 4; i++) {
      const n = n0 + i;
      const pv = n <= 3 ? 0 : p[n] & 0xff;
      v |= pv << (8 * i);
    }
    return v >>> 0;
  }

  write32(off, v, mask, size) {
    const nv = this.nvic;
    if (off < 0x1000) {
      if (off < 0x80) {
        const port = off >> 2;
        if ((this.itmTcr & 1) && ((this.itmTer >>> port) & 1)) {
          const m = this.machine;
          if (m && typeof m.onItm === 'function') {
            const sh = 31 - Math.clz32(mask & -mask); // 가장 낮은 바이트 위치
            for (let i = 0; i < size; i++) m.onItm(port, (v >>> (sh + 8 * i)) & 0xff);
          }
        }
        return;
      }
      if (off === 0xe00) this.itmTer = this._merge(this.itmTer, v, mask);
      else if (off === 0xe40) this.itmTpr = this._merge(this.itmTpr, v, mask);
      else if (off === 0xe80) this.itmTcr = this._merge(this.itmTcr, v, mask);
      return;
    }
    if (off >= DWT_BASE && off < 0x2000) {
      const o = off - DWT_BASE;
      if (o === 0) this.dwtCtrl = (this._merge(this.dwtCtrl, v, mask) & 0x0fffffff) | 0x40000000;
      else if (o === 4) this.cyccnt = this._merge(this.cyccnt, v, mask);
      else this.dwtRegs.set(o, this._merge(this.dwtRegs.get(o) || 0, v, mask));
      return;
    }
    if (off < SCS_BASE || off >= 0xf000) return;
    const o = off - SCS_BASE;
    if (o >= 0x100 && o < 0x500) {
      if (o < 0x180) return this._setBits(v, (o - 0x100) >> 2, (n) => nv.setEnabled(n, 1));
      if (o < 0x200) return this._setBits(v, (o - 0x180) >> 2, (n) => nv.setEnabled(n, 0));
      if (o < 0x280) return this._setBits(v, (o - 0x200) >> 2, (n) => nv.setPendingExc(n));
      if (o < 0x300) return this._setBits(v, (o - 0x280) >> 2, (n) => nv.clearPendingExc(n));
      if (o >= 0x400 && o < 0x400 + NUM_IRQ) {
        for (let i = 0; i < 4; i++) {
          if ((mask >>> (8 * i)) & 0xff) {
            const n = 16 + (o - 0x400) + i;
            if (n < NUM_EXC) nv.setPriority(n, (v >>> (8 * i)) & 0xff);
          }
        }
      }
      return;
    }
    switch (o) {
      case 0x008: this.actlr = this._merge(this.actlr, v, mask); return;
      case 0x010: {
        const nvv = this._merge(this.stCtrl, v, mask);
        this.stCtrl = (this.stCtrl & 0x10000) | (nvv & 7);
        return;
      }
      case 0x014: this.stLoad = this._merge(this.stLoad, v, mask) & 0xffffff; return;
      case 0x018: this.stVal = 0; this.stCtrl &= ~0x10000; this.stDiv = 0; return;
      case 0xd04: {
        if (v & (1 << 31)) nv.setPendingExc(EXC_NMI);
        if (v & (1 << 28)) nv.setPendingExc(EXC_PENDSV);
        else if (v & (1 << 27)) nv.clearPendingExc(EXC_PENDSV);
        if (v & (1 << 26)) nv.setPendingExc(EXC_SYSTICK);
        else if (v & (1 << 25)) nv.clearPendingExc(EXC_SYSTICK);
        return;
      }
      case 0xd08: this.vtor = this._merge(this.vtor, v, mask) & 0x3fffff80; return;
      case 0xd0c: {
        if (size !== 4 || ((v >>> 16) & 0xffff) !== 0x05fa) return;
        nv.setPriGroup((v >>> 8) & 7);
        if (v & 4 && this.machine && this.machine.requestReset) this.machine.requestReset('SYSRESETREQ');
        return;
      }
      case 0xd10:
        this.scr = this._merge(this.scr, v, mask) & 0x16;
        nv.sevOnPend = (this.scr & 0x10) !== 0;
        return;
      case 0xd14:
        this.ccr = (this._merge(this.ccr, v, mask) & 0x31b) | 0x200;
        this.unalignTrp = (this.ccr & 8) !== 0;
        this.div0Trp = (this.ccr & 0x10) !== 0;
        return;
      case 0xd18: case 0xd1c: case 0xd20: {
        const n0 = 4 + (o - 0xd18);
        for (let i = 0; i < 4; i++) {
          if ((mask >>> (8 * i)) & 0xff) nv.setPriority(n0 + i, (v >>> (8 * i)) & 0xff);
        }
        return;
      }
      case 0xd24: {
        const nvv = this._merge(this._shcsr(), v, mask);
        nv.setEnabled(EXC_MEMMANAGE, nvv & (1 << 16));
        nv.setEnabled(EXC_BUSFAULT, nvv & (1 << 17));
        nv.setEnabled(EXC_USAGEFAULT, nvv & (1 << 18));
        const setP = (bit, n) => {
          if (nvv & (1 << bit)) nv.setPendingExc(n);
          else if (nv.pending[n]) { nv.pending[n] = 0; nv.dirty = true; }
        };
        setP(12, EXC_USAGEFAULT); setP(13, EXC_MEMMANAGE); setP(14, EXC_BUSFAULT); setP(15, EXC_SVCALL);
        return;
      }
      case 0xd28: this.cfsr = (this.cfsr & ~(v & mask)) >>> 0; return;
      case 0xd2c: this.hfsr = (this.hfsr & ~(v & mask)) >>> 0; return;
      case 0xd30: this.dfsr = (this.dfsr & ~(v & mask)) >>> 0; return;
      case 0xd34: this.mmfar = this._merge(this.mmfar, v, mask); return;
      case 0xd38: this.bfar = this._merge(this.bfar, v, mask); return;
      case 0xd3c: this.afsr = (this.afsr & ~(v & mask)) >>> 0; return;
      case 0xd88:
        this.cpacr = this._merge(this.cpacr, v, mask) & 0x00f00000;
        if (this.cpu) this.cpu.scsChanged();
        return;
      case 0xd94: this.mpuCtrl = this._merge(this.mpuCtrl, v, mask) & 7; return;
      case 0xd98: this.mpuRnr = this._merge(this.mpuRnr, v, mask) & 0xff; return;
      case 0xd9c: case 0xda4: case 0xdac: case 0xdb4: {
        const nvv = this._merge(this.mpuRbar[this.mpuRnr & 7], v, mask);
        if (nvv & 0x10) this.mpuRnr = nvv & 7;
        this.mpuRbar[this.mpuRnr & 7] = nvv & ~0x1f;
        return;
      }
      case 0xda0: case 0xda8: case 0xdb0: case 0xdb8:
        this.mpuRasr[this.mpuRnr & 7] = this._merge(this.mpuRasr[this.mpuRnr & 7], v, mask);
        return;
      case 0xdf0:
        if (((v >>> 16) & 0xffff) === 0xa05f) this.dhcsr = v & 0x2f;
        return;
      case 0xdf8: this.dcrdr = this._merge(this.dcrdr, v, mask); return;
      case 0xdfc:
        this.demcr = this._merge(this.demcr, v, mask) & 0x010f07f1;
        nv.setEnabled(EXC_DEBUGMON, this.demcr & (1 << 16));
        return;
      case 0xf00:
        if ((v & 0x1ff) < NUM_IRQ) nv.setPendingExc(16 + (v & 0x1ff));
        return;
      case 0xf34:
        this.fpccr = (this._merge(this.fpccr, v, mask) & 0xc00001fb) >>> 0;
        return;
      case 0xf38: this.fpcar = this._merge(this.fpcar, v, mask) & ~7; return;
      case 0xf3c: this.fpdscr = this._merge(this.fpdscr, v, mask) & 0x07c00000; return;
      default:
        this.misc.set(o, this._merge(this.misc.get(o) || 0, v, mask));
    }
  }

  _merge(old, v, mask) {
    return ((old & ~mask) | (v & mask)) >>> 0;
  }

  _setBits(v, word, fn) {
    const base = 16 + word * 32;
    for (let i = 0; i < 32; i++) {
      if ((v >>> i) & 1) {
        const n = base + i;
        if (n < NUM_EXC) fn(n);
      }
    }
  }

  // ITM을 SWV 디버거처럼 활성화(디버거 연결 흉내)
  enableSwv() {
    this.demcr |= 1 << 24;
    this.itmTcr |= 1;
    this.itmTer |= 1;
  }
}
