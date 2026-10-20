// ARM Cortex-M4(ARMv7E-M) 코어: Thumb/Thumb-2 전체, DSP 확장, FPv4-SP, 예외 모델.
// 순수 JavaScript. 레지스터는 Int32Array에 int32로 보관하고 필요할 때만 >>> 0으로 변환합니다.

import { BusFaultSignal } from './bus.js';
import {
  EXC_NMI, EXC_HARDFAULT, EXC_MEMMANAGE, EXC_BUSFAULT, EXC_USAGEFAULT, EXC_SVCALL, CFSR,
} from './scs.js';

export class FaultSignal {
  constructor(exc, bits, addr) {
    this.exc = exc;
    this.bits = bits >>> 0;
    this.addr = addr;
  }
}

export const STOP = { CYCLES: 0, SLEEP: 1, BREAK: 2, BKPT: 3, LOCKUP: 4, EXIT: 5, RESET: 6, HALT: 7 };

const f32 = new Float32Array(2);
const u32 = new Uint32Array(f32.buffer);
const f64 = new Float64Array(1);
const u64 = new Uint32Array(f64.buffer); // [lo, hi] (LE)

function b2f(b) { u32[0] = b; return f32[0]; }
function f2b(f) { f32[0] = f; return u32[0]; }

const DEFAULT_NAN = 0x7fc00000;
const FLT_MIN = 1.1754943508222875e-38;
const FPSCR_IOC = 1, FPSCR_DZC = 2, FPSCR_OFC = 4, FPSCR_UFC = 8, FPSCR_IXC = 0x10, FPSCR_IDC = 0x80;
const FPSCR_FZ = 1 << 24, FPSCR_DN = 1 << 25;

function isNaNb(b) { return (b & 0x7fffffff) > 0x7f800000; }
function isSNaNb(b) { return (b & 0x7fffffff) > 0x7f800000 && (b & 0x400000) === 0; }

function rbit(v) {
  v = ((v >>> 1) & 0x55555555) | ((v & 0x55555555) << 1);
  v = ((v >>> 2) & 0x33333333) | ((v & 0x33333333) << 2);
  v = ((v >>> 4) & 0x0f0f0f0f) | ((v & 0x0f0f0f0f) << 4);
  v = ((v >>> 8) & 0x00ff00ff) | ((v & 0x00ff00ff) << 8);
  return (v >>> 16) | (v << 16);
}

function rev(v) {
  return ((v >>> 24) | ((v >>> 8) & 0xff00) | ((v & 0xff00) << 8) | (v << 24)) | 0;
}

function popcount(v) {
  v = v - ((v >>> 1) & 0x55555555);
  v = (v & 0x33333333) + ((v >>> 2) & 0x33333333);
  return (((v + (v >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
}

function ror(v, k) {
  k &= 31;
  return k === 0 ? v : (v >>> k) | (v << (32 - k));
}

export class Cpu {
  constructor(bus, scs, machine) {
    this.bus = bus;
    this.scs = scs;
    this.nvic = scs.nvic;
    this.machine = machine;
    scs.cpu = this;
    this.nvic.cpu = this;
    this.r = new Int32Array(16);
    const fb = new ArrayBuffer(32 * 4);
    this.s = new Uint32Array(fb);
    this.breakpoints = new Set();
    this.cycles = 0;
    this.instructions = 0;
    this.onBkpt = null; // (imm) => true(계속) | false(정지)
    this.lastFault = null;
    this.lockup = null;
    this._clearState();
  }

  _clearState() {
    this.r.fill(0);
    this.n = 0; this.z = 0; this.c = 0; this.v = 0; this.q = 0; this.ge = 0;
    this.sc = 0;
    this.it = 0;
    this.ipsr = 0;
    this.tbit = 1;
    this.primask = 0;
    this.faultmask = 0;
    this.basepri = 0;
    this.control = 0;
    this.spIsPsp = false;
    this.msp = 0;
    this.psp = 0;
    this.s.fill(0);
    this.fpscr = 0;
    this.eventReg = 0;
    this.sleeping = false;
    this.sleepWfe = false;
    this.lockedUp = false;
    this.excRet = 0;
    this.exAddr = -1;
    this.stop = 0;
    this.pc = 0;
    this.npc = 0;
    this.lastPc = 0;
    this.lastFault = null;
    this.lockup = null;
    this.retCycles = -1;
  }

  scsChanged() {}

  // ---- 리셋 ----
  reset() {
    this._clearState();
    const vtor = this.scs.vtor >>> 0;
    try {
      const sp = this.bus.read32(vtor);
      const pc = this.bus.read32((vtor + 4) >>> 0);
      this.msp = sp & ~3;
      this.r[13] = this.msp;
      this.r[14] = -1;
      this.pc = (pc & ~1) >>> 0;
      this.tbit = pc & 1;
    } catch (e) {
      if (!(e instanceof BusFaultSignal)) throw e;
      this._enterLockup('리셋 벡터를 읽을 수 없습니다', EXC_HARDFAULT);
    }
    this.nvic.dirty = true;
  }

  // ---- 상태 ----
  get privileged() { return this.ipsr !== 0 || (this.control & 1) === 0; }

  getAPSR() {
    return ((this.n << 31) | (this.z << 30) | (this.c << 29) | (this.v << 28) | (this.q << 27) | (this.ge << 16)) >>> 0;
  }

  getXPSR() {
    const it = this.it;
    return (this.getAPSR() | this.ipsr | (this.tbit << 24) | ((it & 3) << 25) | ((it >>> 2) << 10)) >>> 0;
  }

  setAPSRnzcvq(v) {
    this.n = (v >>> 31) & 1; this.z = (v >>> 30) & 1; this.c = (v >>> 29) & 1; this.v = (v >>> 28) & 1; this.q = (v >>> 27) & 1;
  }

  getMSP() { return this.spIsPsp ? this.msp : this.r[13] >>> 0; }
  getPSP() { return this.spIsPsp ? this.r[13] >>> 0 : this.psp; }
  setMSP(v) { v = (v & ~3) >>> 0; if (this.spIsPsp) this.msp = v; else this.r[13] = v; }
  setPSP(v) { v = (v & ~3) >>> 0; if (this.spIsPsp) this.r[13] = v; else this.psp = v; }

  _selectSP(usePsp) {
    if (usePsp === this.spIsPsp) return;
    if (this.spIsPsp) { this.psp = this.r[13] >>> 0; this.r[13] = this.msp; }
    else { this.msp = this.r[13] >>> 0; this.r[13] = this.psp; }
    this.spIsPsp = usePsp;
  }

  execPriority() {
    let p = this.nvic.activeGroupPri();
    if (this.primask && p > 0) p = 0;
    if (this.basepri) {
      const b = this.nvic.groupPri(this.basepri);
      if (b < p) p = b;
    }
    if (this.faultmask && p > -1) p = -1;
    return p;
  }

  _execPriorityNoPrimask() {
    let p = this.nvic.activeGroupPri();
    if (this.basepri) {
      const b = this.nvic.groupPri(this.basepri);
      if (b < p) p = b;
    }
    if (this.faultmask && p > -1) p = -1;
    return p;
  }

  // ---- 실행 루프 ----
  // endCycles까지 실행. 반환: STOP 코드
  run(endCycles, ignoreBpOnce = false) {
    const nv = this.nvic;
    const bps = this.breakpoints;
    const useBp = bps.size > 0;
    let skip = ignoreBpOnce;
    for (;;) {
      try {
        while (this.cycles < endCycles) {
          if (nv.dirty) this.checkExceptions();
          if (this.sleeping) return STOP.SLEEP;
          if (this.lockedUp) return STOP.LOCKUP;
          if (useBp && !skip && bps.has(this.pc)) return STOP.BREAK;
          skip = false;
          this.step();
          if (this.stop !== 0) {
            const s = this.stop;
            this.stop = 0;
            return s;
          }
        }
        return STOP.CYCLES;
      } catch (e) {
        skip = false;
        this.handleSignal(e);
        if (this.lockedUp) return STOP.LOCKUP;
        if (this.stop !== 0) {
          const s = this.stop;
          this.stop = 0;
          return s;
        }
      }
    }
  }

  // 명령어 하나(또는 대기 중인 예외 진입 하나) 실행. 반환: STOP 코드 또는 -1(정상)
  stepOne() {
    try {
      if (this.nvic.dirty && this.checkExceptions()) return -1;
      if (this.sleeping) return STOP.SLEEP;
      if (this.lockedUp) return STOP.LOCKUP;
      this.step();
    } catch (e) {
      this.handleSignal(e);
    }
    if (this.lockedUp) return STOP.LOCKUP;
    if (this.stop !== 0) {
      const s = this.stop;
      this.stop = 0;
      return s;
    }
    return -1;
  }

  step() {
    const pc = this.pc;
    if (this.tbit === 0) throw new FaultSignal(EXC_USAGEFAULT, CFSR.INVSTATE);
    const bus = this.bus;
    const hw = bus.fetch16(pc);
    this.lastPc = pc;
    this.r[15] = pc + 4;
    const itb = this.it;
    this.cycles += 1;
    this.instructions++;
    if (hw >= 0xe800) {
      const hw2 = bus.fetch16((pc + 2) >>> 0);
      this.npc = pc + 4;
      if (itb === 0 || this.cond(itb >>> 4)) this.exec32(hw, hw2);
    } else {
      this.npc = pc + 2;
      if (itb === 0 || this.cond(itb >>> 4)) this.exec16(hw);
    }
    this.pc = this.npc;
    if (itb !== 0) this.it = (itb & 7) === 0 ? 0 : (itb & 0xe0) | ((itb << 1) & 0x1f);
    if (this.excRet !== 0) {
      const v = this.excRet;
      this.excRet = 0;
      this.exceptionReturn(v);
    }
  }

  cond(c) {
    switch (c) {
      case 0: return this.z === 1;
      case 1: return this.z === 0;
      case 2: return this.c === 1;
      case 3: return this.c === 0;
      case 4: return this.n === 1;
      case 5: return this.n === 0;
      case 6: return this.v === 1;
      case 7: return this.v === 0;
      case 8: return this.c === 1 && this.z === 0;
      case 9: return this.c === 0 || this.z === 1;
      case 10: return this.n === this.v;
      case 11: return this.n !== this.v;
      case 12: return this.z === 0 && this.n === this.v;
      case 13: return this.z === 1 || this.n !== this.v;
      default: return true;
    }
  }

  // ---- ALU 도우미 ----
  add(a, b, s) {
    const r = (a + b) | 0;
    if (s) {
      this.n = r >>> 31;
      this.z = r === 0 ? 1 : 0;
      this.c = (a >>> 0) + (b >>> 0) > 0xffffffff ? 1 : 0;
      this.v = ((a ^ r) & (b ^ r)) >>> 31;
    }
    return r;
  }

  sub(a, b, s) {
    const r = (a - b) | 0;
    if (s) {
      this.n = r >>> 31;
      this.z = r === 0 ? 1 : 0;
      this.c = (a >>> 0) >= (b >>> 0) ? 1 : 0;
      this.v = ((a ^ b) & (a ^ r)) >>> 31;
    }
    return r;
  }

  adc(a, b, s) {
    const sum = (a >>> 0) + (b >>> 0) + this.c;
    const r = sum | 0;
    if (s) {
      this.n = r >>> 31;
      this.z = r === 0 ? 1 : 0;
      this.c = sum > 0xffffffff ? 1 : 0;
      this.v = ((a ^ r) & (b ^ r)) >>> 31;
    }
    return r;
  }

  nz(r) {
    this.n = r >>> 31;
    this.z = r === 0 ? 1 : 0;
  }

  shiftC(v, type, amt) {
    if (amt === 0) { this.sc = this.c; return v; }
    switch (type) {
      case 0:
        if (amt < 32) { this.sc = (v >>> (32 - amt)) & 1; return v << amt; }
        this.sc = amt === 32 ? v & 1 : 0;
        return 0;
      case 1:
        if (amt < 32) { this.sc = (v >>> (amt - 1)) & 1; return (v >>> amt) | 0; }
        this.sc = amt === 32 ? v >>> 31 : 0;
        return 0;
      case 2:
        if (amt < 32) { this.sc = (v >> (amt - 1)) & 1; return v >> amt; }
        this.sc = v >>> 31;
        return v >> 31;
      default: {
        const k = amt & 31;
        if (k === 0) { this.sc = v >>> 31; return v; }
        const r = (v >>> k) | (v << (32 - k));
        this.sc = r >>> 31;
        return r;
      }
    }
  }

  shiftImm(v, type, imm5) {
    switch (type) {
      case 0: return this.shiftC(v, 0, imm5);
      case 1: return this.shiftC(v, 1, imm5 === 0 ? 32 : imm5);
      case 2: return this.shiftC(v, 2, imm5 === 0 ? 32 : imm5);
      default:
        if (imm5 === 0) {
          this.sc = v & 1;
          return (this.c << 31) | (v >>> 1);
        }
        return this.shiftC(v, 3, imm5);
    }
  }

  // ---- 메모리 도우미 ----
  ld32(a) {
    if ((a & 3) !== 0 && this.scs.unalignTrp) throw new FaultSignal(EXC_USAGEFAULT, CFSR.UNALIGNED);
    return this.bus.read32(a);
  }
  ld16(a) {
    if ((a & 1) !== 0 && this.scs.unalignTrp) throw new FaultSignal(EXC_USAGEFAULT, CFSR.UNALIGNED);
    return this.bus.read16(a);
  }
  st32(a, v) {
    if ((a & 3) !== 0 && this.scs.unalignTrp) throw new FaultSignal(EXC_USAGEFAULT, CFSR.UNALIGNED);
    this.bus.write32(a, v);
  }
  st16(a, v) {
    if ((a & 1) !== 0 && this.scs.unalignTrp) throw new FaultSignal(EXC_USAGEFAULT, CFSR.UNALIGNED);
    this.bus.write16(a, v);
  }
  ld32a(a) {
    if ((a & 3) !== 0) throw new FaultSignal(EXC_USAGEFAULT, CFSR.UNALIGNED);
    return this.bus.read32(a);
  }
  st32a(a, v) {
    if ((a & 3) !== 0) throw new FaultSignal(EXC_USAGEFAULT, CFSR.UNALIGNED);
    this.bus.write32(a, v);
  }

  udf() {
    throw new FaultSignal(EXC_USAGEFAULT, CFSR.UNDEFINSTR);
  }

  // ---- PC 쓰기 ----
  branchTo(v) {
    this.npc = (v & ~1) >>> 0;
    this.cycles += 2;
  }

  bxWritePC(v) {
    if (this.ipsr !== 0 && (v >>> 28) === 0xf) {
      this.excRet = v | 0;
      this.npc = (v & ~1) >>> 0;
      return;
    }
    if ((v & 1) === 0) this.tbit = 0;
    this.npc = (v & ~1) >>> 0;
    this.cycles += 2;
  }

  setSP(v) {
    this.r[13] = v & ~3;
  }

  // =====================================================================
  // 16비트 명령어
  // =====================================================================
  exec16(hw) {
    const r = this.r;
    switch (hw >>> 11) {
      case 0: { // LSL imm
        const imm = (hw >>> 6) & 31, m = (hw >>> 3) & 7, d = hw & 7, s = this.it === 0;
        const v = r[m];
        let res;
        if (imm === 0) res = v;
        else { if (s) this.c = (v >>> (32 - imm)) & 1; res = v << imm; }
        r[d] = res;
        if (s) this.nz(res);
        return;
      }
      case 1: { // LSR imm
        const imm = (hw >>> 6) & 31, m = (hw >>> 3) & 7, d = hw & 7, s = this.it === 0;
        const v = r[m];
        let res;
        if (imm === 0) { if (s) this.c = v >>> 31; res = 0; }
        else { if (s) this.c = (v >>> (imm - 1)) & 1; res = (v >>> imm) | 0; }
        r[d] = res;
        if (s) this.nz(res);
        return;
      }
      case 2: { // ASR imm
        const imm = (hw >>> 6) & 31, m = (hw >>> 3) & 7, d = hw & 7, s = this.it === 0;
        const v = r[m];
        let res;
        if (imm === 0) { if (s) this.c = v >>> 31; res = v >> 31; }
        else { if (s) this.c = (v >> (imm - 1)) & 1; res = v >> imm; }
        r[d] = res;
        if (s) this.nz(res);
        return;
      }
      case 3: { // ADD/SUB reg/imm3
        const op = (hw >>> 9) & 3, x = (hw >>> 6) & 7, n = (hw >>> 3) & 7, d = hw & 7, s = this.it === 0;
        const b = op & 2 ? x : r[x];
        r[d] = op & 1 ? this.sub(r[n], b, s) : this.add(r[n], b, s);
        return;
      }
      case 4: { // MOV imm8
        const d = (hw >>> 8) & 7, imm = hw & 0xff;
        r[d] = imm;
        if (this.it === 0) { this.n = 0; this.z = imm === 0 ? 1 : 0; }
        return;
      }
      case 5: this.sub(r[(hw >>> 8) & 7], hw & 0xff, true); return; // CMP imm8
      case 6: { const d = (hw >>> 8) & 7; r[d] = this.add(r[d], hw & 0xff, this.it === 0); return; }
      case 7: { const d = (hw >>> 8) & 7; r[d] = this.sub(r[d], hw & 0xff, this.it === 0); return; }
      case 8:
        if ((hw & 0x400) === 0) this.dp16(hw);
        else this.special16(hw);
        return;
      case 9: { // LDR literal
        const t = (hw >>> 8) & 7;
        r[t] = this.ld32((((this.pc + 4) & ~3) + ((hw & 0xff) << 2)) | 0);
        this.cycles++;
        return;
      }
      case 10: case 11: { // load/store register offset
        const op = (hw >>> 9) & 7, m = (hw >>> 6) & 7, n = (hw >>> 3) & 7, t = hw & 7;
        const a = (r[n] + r[m]) | 0;
        switch (op) {
          case 0: this.st32(a, r[t]); break;
          case 1: this.st16(a, r[t]); break;
          case 2: this.bus.write8(a, r[t]); break;
          case 3: r[t] = (this.bus.read8(a) << 24) >> 24; this.cycles++; break;
          case 4: r[t] = this.ld32(a); this.cycles++; break;
          case 5: r[t] = this.ld16(a); this.cycles++; break;
          case 6: r[t] = this.bus.read8(a); this.cycles++; break;
          default: r[t] = (this.ld16(a) << 16) >> 16; this.cycles++; break;
        }
        return;
      }
      case 12: { const n = (hw >>> 3) & 7; this.st32((r[n] + (((hw >>> 6) & 31) << 2)) | 0, r[hw & 7]); return; }
      case 13: { const n = (hw >>> 3) & 7; r[hw & 7] = this.ld32((r[n] + (((hw >>> 6) & 31) << 2)) | 0); this.cycles++; return; }
      case 14: { const n = (hw >>> 3) & 7; this.bus.write8((r[n] + ((hw >>> 6) & 31)) | 0, r[hw & 7]); return; }
      case 15: { const n = (hw >>> 3) & 7; r[hw & 7] = this.bus.read8((r[n] + ((hw >>> 6) & 31)) | 0); this.cycles++; return; }
      case 16: { const n = (hw >>> 3) & 7; this.st16((r[n] + (((hw >>> 6) & 31) << 1)) | 0, r[hw & 7]); return; }
      case 17: { const n = (hw >>> 3) & 7; r[hw & 7] = this.ld16((r[n] + (((hw >>> 6) & 31) << 1)) | 0); this.cycles++; return; }
      case 18: this.st32((r[13] + ((hw & 0xff) << 2)) | 0, r[(hw >>> 8) & 7]); return;
      case 19: r[(hw >>> 8) & 7] = this.ld32((r[13] + ((hw & 0xff) << 2)) | 0); this.cycles++; return;
      case 20: r[(hw >>> 8) & 7] = (((this.pc + 4) & ~3) + ((hw & 0xff) << 2)) | 0; return; // ADR
      case 21: r[(hw >>> 8) & 7] = (r[13] + ((hw & 0xff) << 2)) | 0; return; // ADD Rd, SP, imm
      case 22: case 23: this.misc16(hw); return;
      case 24: { // STM
        const n = (hw >>> 8) & 7, list = hw & 0xff;
        let a = r[n];
        if (a & 3) throw new FaultSignal(EXC_USAGEFAULT, CFSR.UNALIGNED);
        for (let i = 0; i < 8; i++) {
          if (list & (1 << i)) { this.bus.write32(a, r[i]); a = (a + 4) | 0; this.cycles++; }
        }
        r[n] = a;
        return;
      }
      case 25: { // LDM
        const n = (hw >>> 8) & 7, list = hw & 0xff;
        let a = r[n];
        if (a & 3) throw new FaultSignal(EXC_USAGEFAULT, CFSR.UNALIGNED);
        const bus = this.bus;
        const vals = [];
        for (let i = 0; i < 8; i++) {
          if (list & (1 << i)) { vals.push(bus.read32(a)); a = (a + 4) | 0; this.cycles++; }
        }
        if (!(list & (1 << n))) r[n] = a;
        let k = 0;
        for (let i = 0; i < 8; i++) if (list & (1 << i)) r[i] = vals[k++];
        return;
      }
      case 26: case 27: { // B<c> / UDF / SVC
        const c = (hw >>> 8) & 15;
        if (c === 14) this.udf();
        if (c === 15) { this.svc(); return; }
        if (this.cond(c)) {
          this.npc = (this.pc + 4 + ((hw << 24) >> 23)) >>> 0;
          this.cycles += 2;
        }
        return;
      }
      case 28: // B
        this.npc = (this.pc + 4 + ((hw << 21) >> 20)) >>> 0;
        this.cycles += 2;
        return;
      default:
        this.udf();
    }
  }

  dp16(hw) {
    const r = this.r;
    const op = (hw >>> 6) & 15, m = (hw >>> 3) & 7, d = hw & 7, s = this.it === 0;
    let res;
    switch (op) {
      case 0: res = r[d] & r[m]; r[d] = res; if (s) this.nz(res); return;
      case 1: res = r[d] ^ r[m]; r[d] = res; if (s) this.nz(res); return;
      case 2: case 3: case 4: case 7: {
        const type = op === 2 ? 0 : op === 3 ? 1 : op === 4 ? 2 : 3;
        res = this.shiftC(r[d], type, r[m] & 0xff);
        r[d] = res;
        if (s) { this.nz(res); this.c = this.sc; }
        return;
      }
      case 5: r[d] = this.adc(r[d], r[m], s); return;
      case 6: r[d] = this.adc(r[d], ~r[m], s); return;
      case 8: this.nz(r[d] & r[m]); return;
      case 9: r[d] = this.sub(0, r[m], s); return;
      case 10: this.sub(r[d], r[m], true); return;
      case 11: this.add(r[d], r[m], true); return;
      case 12: res = r[d] | r[m]; r[d] = res; if (s) this.nz(res); return;
      case 13: res = Math.imul(r[d], r[m]); r[d] = res; if (s) this.nz(res); return;
      case 14: res = r[d] & ~r[m]; r[d] = res; if (s) this.nz(res); return;
      default: res = ~r[m]; r[d] = res; if (s) this.nz(res); return;
    }
  }

  special16(hw) {
    const r = this.r;
    const op = (hw >>> 8) & 3;
    const m = (hw >>> 3) & 15;
    const d = ((hw >>> 4) & 8) | (hw & 7);
    switch (op) {
      case 0: { // ADD (high)
        const res = (r[d] + r[m]) | 0;
        if (d === 15) this.branchTo(res);
        else if (d === 13) this.setSP(res);
        else r[d] = res;
        return;
      }
      case 1: this.sub(r[d], r[m], true); return;
      case 2: // MOV (high)
        if (d === 15) this.branchTo(r[m]);
        else if (d === 13) this.setSP(r[m]);
        else r[d] = r[m];
        return;
      default: { // BX / BLX
        const target = r[m];
        if (hw & 0x80) r[14] = (this.pc + 2) | 1;
        this.bxWritePC(target);
      }
    }
  }

  misc16(hw) {
    const r = this.r;
    switch ((hw >>> 8) & 15) {
      case 0: {
        const imm = (hw & 0x7f) << 2;
        r[13] = hw & 0x80 ? r[13] - imm : r[13] + imm;
        return;
      }
      case 1: case 3: case 9: case 11: { // CBZ/CBNZ
        const n = hw & 7;
        const imm = (((hw >>> 3) & 0x1f) << 1) | ((hw & 0x200) >>> 3);
        const nonzero = (hw & 0x800) !== 0;
        if ((r[n] !== 0) === nonzero) {
          this.npc = (this.pc + 4 + imm) >>> 0;
          this.cycles += 2;
        }
        return;
      }
      case 2: {
        const m = (hw >>> 3) & 7, d = hw & 7, v = r[m];
        switch ((hw >>> 6) & 3) {
          case 0: r[d] = (v << 16) >> 16; return;
          case 1: r[d] = (v << 24) >> 24; return;
          case 2: r[d] = v & 0xffff; return;
          default: r[d] = v & 0xff; return;
        }
      }
      case 4: case 5: { // PUSH
        const list = (hw & 0xff) | (hw & 0x100 ? 0x4000 : 0);
        this.pushList(list);
        return;
      }
      case 6: { // CPS
        if ((hw & 0xffe8) !== 0xb660) this.udf();
        if (!this.privileged) return;
        const im = (hw >>> 4) & 1;
        if (hw & 2) this.primask = im;
        if (hw & 1) {
          if (im) { if (this.execPriority() > -1) this.faultmask = 1; }
          else this.faultmask = 0;
        }
        this.nvic.dirty = true;
        return;
      }
      case 10: {
        const m = (hw >>> 3) & 7, d = hw & 7, v = r[m];
        switch ((hw >>> 6) & 3) {
          case 0: r[d] = rev(v); return;
          case 1: r[d] = ((v >>> 8) & 0x00ff00ff) | ((v & 0x00ff00ff) << 8); return;
          case 3: r[d] = (((v & 0xff) << 24) >> 16) | ((v >>> 8) & 0xff); return;
          default: this.udf();
        }
        return;
      }
      case 12: case 13: { // POP
        const list = (hw & 0xff) | (hw & 0x100 ? 0x8000 : 0);
        this.popList(list);
        return;
      }
      case 14: // BKPT
        this.bkpt(hw & 0xff);
        return;
      case 15: {
        if (hw & 15) { // IT
          this.it = hw & 0xff;
          return;
        }
        this.hint((hw >>> 4) & 15);
        return;
      }
      default:
        this.udf();
    }
  }

  pushList(list) {
    const r = this.r;
    const cnt = popcount(list);
    let a = (r[13] - 4 * cnt) | 0;
    const start = a;
    if (a & 3) throw new FaultSignal(EXC_USAGEFAULT, CFSR.UNALIGNED);
    const bus = this.bus;
    for (let i = 0; i < 16; i++) {
      if (list & (1 << i)) { bus.write32(a, r[i]); a = (a + 4) | 0; }
    }
    r[13] = start;
    this.cycles += cnt;
  }

  popList(list) {
    const r = this.r;
    let a = r[13];
    if (a & 3) throw new FaultSignal(EXC_USAGEFAULT, CFSR.UNALIGNED);
    const bus = this.bus;
    const vals = new Int32Array(16);
    for (let i = 0; i < 16; i++) {
      if (list & (1 << i)) { vals[i] = bus.read32(a); a = (a + 4) | 0; }
    }
    r[13] = a;
    for (let i = 0; i < 15; i++) if (list & (1 << i)) r[i] = vals[i];
    this.cycles += popcount(list);
    if (list & 0x8000) this.bxWritePC(vals[15]);
  }

  hint(h) {
    switch (h) {
      case 2: // WFE
        if (this.eventReg) this.eventReg = 0;
        else { this.sleeping = true; this.sleepWfe = true; this.nvic.dirty = true; }
        return;
      case 3: // WFI
        this.sleeping = true;
        this.sleepWfe = false;
        this.nvic.dirty = true;
        return;
      case 4: // SEV
        this.eventReg = 1;
        return;
      default:
        return; // NOP, YIELD
    }
  }

  bkpt(imm) {
    if (this.onBkpt && this.onBkpt(imm)) return;
    // 정지: PC는 BKPT 명령에 머무름
    this.npc = this.pc;
    this.stop = STOP.BKPT;
  }

  svc() {
    this.raiseSync(EXC_SVCALL, 0);
  }

  // =====================================================================
  // 32비트 명령어
  // =====================================================================
  exec32(hw1, hw2) {
    const op1 = (hw1 >>> 11) & 3;
    if (op1 === 1) {
      if (hw1 & 0x400) return this.coproc(hw1, hw2);
      if (hw1 & 0x200) return this.dpShiftReg(hw1, hw2);
      if (hw1 & 0x40) return this.lsDualEx(hw1, hw2);
      return this.lsMultiple(hw1, hw2);
    }
    if (op1 === 2) {
      if (hw2 & 0x8000) return this.branchMisc(hw1, hw2);
      if (hw1 & 0x200) return this.dpPlainImm(hw1, hw2);
      return this.dpModImm(hw1, hw2);
    }
    // op1 === 3
    if (hw1 & 0x400) return this.coproc(hw1, hw2);
    const top = hw1 & 0xff00;
    if ((hw1 & 0xfe00) === 0xf800) return this.lsSingle(hw1, hw2);
    if (top === 0xfa00) return this.dpReg(hw1, hw2);
    if (top === 0xfb00) {
      if (hw1 & 0x80) return this.longMul(hw1, hw2);
      return this.mul32(hw1, hw2);
    }
    this.udf();
  }

  lsMultiple(hw1, hw2) {
    const r = this.r;
    const n = hw1 & 15, L = hw1 & 0x10, W = hw1 & 0x20, op = (hw1 >>> 7) & 3;
    if (op === 0 || op === 3) this.udf();
    const list = hw2 & (L ? 0xdfff : 0x5fff);
    const cnt = popcount(list);
    let a = op === 1 ? r[n] : (r[n] - 4 * cnt) | 0;
    const wb = op === 1 ? (r[n] + 4 * cnt) | 0 : a;
    if (a & 3) throw new FaultSignal(EXC_USAGEFAULT, CFSR.UNALIGNED);
    const bus = this.bus;
    this.cycles += cnt;
    if (L) {
      const vals = new Int32Array(16);
      for (let i = 0; i < 16; i++) {
        if (list & (1 << i)) { vals[i] = bus.read32(a); a = (a + 4) | 0; }
      }
      if (W && !(list & (1 << n))) r[n] = wb;
      for (let i = 0; i < 15; i++) if (list & (1 << i)) { if (i === 13) this.setSP(vals[i]); else r[i] = vals[i]; }
      if (list & 0x8000) this.bxWritePC(vals[15]);
    } else {
      for (let i = 0; i < 16; i++) {
        if (list & (1 << i)) { bus.write32(a, r[i]); a = (a + 4) | 0; }
      }
      if (W) r[n] = wb;
    }
  }

  lsDualEx(hw1, hw2) {
    const r = this.r;
    const op1 = (hw1 >>> 7) & 3, op2 = (hw1 >>> 4) & 3, n = hw1 & 15, t = hw2 >>> 12;
    if ((op1 & 2) || (op2 & 2)) { // LDRD/STRD
      const P = hw1 & 0x100, U = hw1 & 0x80, W = hw1 & 0x20, L = hw1 & 0x10;
      const t2 = (hw2 >>> 8) & 15, imm = (hw2 & 0xff) << 2;
      const base = n === 15 ? (this.pc + 4) & ~3 : r[n];
      const off = (U ? base + imm : base - imm) | 0;
      const a = P ? off : base;
      this.cycles += 2;
      if (L) {
        const v1 = this.ld32a(a);
        const v2 = this.ld32a((a + 4) | 0);
        if (W) r[n] = off;
        r[t] = v1;
        r[t2] = v2;
      } else {
        this.st32a(a, r[t]);
        this.st32a((a + 4) | 0, r[t2]);
        if (W) r[n] = off;
      }
      return;
    }
    if (op1 === 0) {
      const a = (r[n] + ((hw2 & 0xff) << 2)) | 0;
      if (op2 === 0) { // STREX
        const d = (hw2 >>> 8) & 15;
        if (a & 3) throw new FaultSignal(EXC_USAGEFAULT, CFSR.UNALIGNED);
        if (this.exAddr === (a >>> 0)) { this.bus.write32(a, r[t]); r[d] = 0; }
        else r[d] = 1;
        this.exAddr = -1;
      } else { // LDREX
        const v = this.ld32a(a);
        this.exAddr = a >>> 0;
        r[t] = v;
        this.cycles++;
      }
      return;
    }
    // op1 === 1
    const op3 = (hw2 >>> 4) & 15;
    if (op2 === 0) { // STREXB/H
      const d = hw2 & 15, a = r[n];
      if (op3 === 4) {
        if (this.exAddr === (a >>> 0)) { this.bus.write8(a, r[t]); r[d] = 0; } else r[d] = 1;
      } else if (op3 === 5) {
        if (a & 1) throw new FaultSignal(EXC_USAGEFAULT, CFSR.UNALIGNED);
        if (this.exAddr === (a >>> 0)) { this.bus.write16(a, r[t]); r[d] = 0; } else r[d] = 1;
      } else this.udf();
      this.exAddr = -1;
      return;
    }
    const m = hw2 & 15;
    switch (op3) {
      case 0: { // TBB
        const off = this.bus.read8((r[n] + r[m]) | 0);
        this.npc = (this.pc + 4 + off * 2) >>> 0;
        this.cycles += 3;
        return;
      }
      case 1: { // TBH
        const off = this.ld16((r[n] + (r[m] << 1)) | 0);
        this.npc = (this.pc + 4 + off * 2) >>> 0;
        this.cycles += 3;
        return;
      }
      case 4: { const a = r[n]; const v = this.bus.read8(a); this.exAddr = a >>> 0; r[t] = v; this.cycles++; return; }
      case 5: {
        const a = r[n];
        if (a & 1) throw new FaultSignal(EXC_USAGEFAULT, CFSR.UNALIGNED);
        const v = this.bus.read16(a); this.exAddr = a >>> 0; r[t] = v; this.cycles++; return;
      }
      default: this.udf();
    }
  }

  // 공통 데이터 처리(op: 0 AND,1 BIC,2 ORR,3 ORN,4 EOR,8 ADD,10 ADC,11 SBC,13 SUB,14 RSB)
  dpOp(op, s, n, d, b, carry) {
    const r = this.r;
    let res;
    switch (op) {
      case 0: res = r[n] & b; break;
      case 1: res = r[n] & ~b; break;
      case 2: res = n === 15 ? b : r[n] | b; break;
      case 3: res = n === 15 ? ~b : r[n] | ~b; break;
      case 4: res = r[n] ^ b; break;
      case 8: res = this.add(r[n], b, s); if (d !== 15 || !s) this.wr(d, res); return;
      case 10: res = this.adc(r[n], b, s); this.wr(d, res); return;
      case 11: res = this.adc(r[n], ~b, s); this.wr(d, res); return;
      case 13: res = this.sub(r[n], b, s); if (d !== 15 || !s) this.wr(d, res); return;
      case 14: res = this.sub(b, r[n], s); this.wr(d, res); return;
      default: this.udf();
    }
    if (s) { this.n = res >>> 31; this.z = res === 0 ? 1 : 0; this.c = carry; }
    if (!(d === 15 && s && (op === 0 || op === 4))) this.wr(d, res);
  }

  wr(d, v) {
    if (d === 13) this.r[13] = v & ~3;
    else if (d === 15) this.udf();
    else this.r[d] = v;
  }

  dpShiftReg(hw1, hw2) {
    const op = (hw1 >>> 5) & 15, s = (hw1 >>> 4) & 1, n = hw1 & 15, d = (hw2 >>> 8) & 15, m = hw2 & 15;
    const imm5 = ((hw2 >>> 10) & 0x1c) | ((hw2 >>> 6) & 3), type = (hw2 >>> 4) & 3;
    if (op === 6) { // PKHBT/PKHTB
      const r = this.r;
      const tb = (hw2 >>> 5) & 1;
      const sh = this.shiftImm(r[m], tb ? 2 : 0, imm5);
      r[d] = tb ? (r[n] & 0xffff0000) | (sh & 0xffff) : (sh & 0xffff0000) | (r[n] & 0xffff);
      return;
    }
    const b = this.shiftImm(this.r[m], type, imm5);
    this.dpOp(op, s, n, d, b, this.sc);
  }

  dpModImm(hw1, hw2) {
    const op = (hw1 >>> 5) & 15, s = (hw1 >>> 4) & 1, n = hw1 & 15, d = (hw2 >>> 8) & 15;
    const imm12 = ((hw1 & 0x400) << 1) | ((hw2 >>> 4) & 0x700) | (hw2 & 0xff);
    let imm, carry = this.c;
    if ((imm12 & 0xc00) === 0) {
      const b = imm12 & 0xff;
      switch ((imm12 >>> 8) & 3) {
        case 0: imm = b; break;
        case 1: imm = (b << 16) | b; break;
        case 2: imm = (b << 24) | (b << 8); break;
        default: imm = (b << 24) | (b << 16) | (b << 8) | b; break;
      }
    } else {
      const unrot = 0x80 | (imm12 & 0x7f);
      const rot = (imm12 >>> 7) & 31;
      imm = (unrot >>> rot) | (unrot << (32 - rot));
      carry = imm >>> 31;
    }
    this.dpOp(op, s, n, d, imm, carry);
  }

  dpPlainImm(hw1, hw2) {
    const r = this.r;
    const op = (hw1 >>> 4) & 0x1f, n = hw1 & 15, d = (hw2 >>> 8) & 15;
    const imm12 = ((hw1 & 0x400) << 1) | ((hw2 >>> 4) & 0x700) | (hw2 & 0xff);
    const imm5 = ((hw2 >>> 10) & 0x1c) | ((hw2 >>> 6) & 3);
    switch (op) {
      case 0x00: { const base = n === 15 ? (this.pc + 4) & ~3 : r[n]; this.wr(d, (base + imm12) | 0); return; }
      case 0x0a: { const base = n === 15 ? (this.pc + 4) & ~3 : r[n]; this.wr(d, (base - imm12) | 0); return; }
      case 0x04: r[d] = ((hw1 & 15) << 12) | imm12; return;
      case 0x0c: r[d] = (r[d] & 0xffff) | (((hw1 & 15) << 12) | imm12) << 16; return;
      case 0x10: case 0x12: { // SSAT / SSAT16
        const sat = (hw2 & 31) + 1;
        if (op === 0x12 && imm5 === 0) {
          const lo = this.ssat((r[n] << 16) >> 16, sat), hi = this.ssat(r[n] >> 16, sat);
          r[d] = (lo & 0xffff) | (hi << 16);
          return;
        }
        const v = op === 0x12 ? r[n] >> imm5 : r[n] << imm5;
        r[d] = this.ssat(v, sat);
        return;
      }
      case 0x18: case 0x1a: { // USAT / USAT16
        const sat = hw2 & 31;
        if (op === 0x1a && imm5 === 0) {
          const lo = this.usat((r[n] << 16) >> 16, sat), hi = this.usat(r[n] >> 16, sat);
          r[d] = (lo & 0xffff) | (hi << 16);
          return;
        }
        const v = op === 0x1a ? r[n] >> imm5 : r[n] << imm5;
        r[d] = this.usat(v, sat);
        return;
      }
      case 0x14: { // SBFX
        const w = (hw2 & 31) + 1;
        if (imm5 + w > 32) this.udf();
        r[d] = (r[n] << (32 - imm5 - w)) >> (32 - w);
        return;
      }
      case 0x1c: { // UBFX
        const w = (hw2 & 31) + 1;
        if (imm5 + w > 32) this.udf();
        r[d] = w === 32 ? r[n] : (r[n] >>> imm5) & ((1 << w) - 1);
        return;
      }
      case 0x16: { // BFI/BFC
        const msb = hw2 & 31, lsb = imm5;
        if (msb < lsb) this.udf();
        const w = msb - lsb + 1;
        const mask = w === 32 ? -1 : ((1 << w) - 1) << lsb;
        const src = n === 15 ? 0 : r[n] << lsb;
        r[d] = (r[d] & ~mask) | (src & mask);
        return;
      }
      default: this.udf();
    }
  }

  ssat(v, bits) {
    const max = 2 ** (bits - 1) - 1, min = -(2 ** (bits - 1));
    if (v > max) { this.q = 1; return max | 0; }
    if (v < min) { this.q = 1; return min | 0; }
    return v;
  }

  usat(v, bits) {
    const max = 2 ** bits - 1;
    if (v < 0) { if (v !== 0) this.q = 1; return 0; }
    if (v > max) { this.q = 1; return max | 0; }
    return v;
  }

  sat32(v) { // 무한 정밀도 정수 → 포화 int32
    if (v > 0x7fffffff) { this.q = 1; return 0x7fffffff; }
    if (v < -0x80000000) { this.q = 1; return -0x80000000; }
    return v;
  }

  branchMisc(hw1, hw2) {
    const r = this.r;
    const op1 = (hw2 >>> 12) & 7;
    if (op1 & 1) { // B.W / BL
      const S = (hw1 >>> 10) & 1, J1 = (hw2 >>> 13) & 1, J2 = (hw2 >>> 11) & 1;
      const I1 = (~(J1 ^ S)) & 1, I2 = (~(J2 ^ S)) & 1;
      const imm = ((S ? 0xff000000 : 0) | (I1 << 23) | (I2 << 22) | ((hw1 & 0x3ff) << 12) | ((hw2 & 0x7ff) << 1)) | 0;
      if (op1 & 4) r[14] = (this.pc + 4) | 1;
      this.npc = (this.pc + 4 + imm) >>> 0;
      this.cycles += 2;
      return;
    }
    if (op1 & 4) this.udf(); // BLX imm: M 프로파일에 없음
    const op = (hw1 >>> 4) & 0x7f;
    if ((op & 0x38) !== 0x38) { // B<c>.W
      const c = (hw1 >>> 6) & 15;
      if (this.cond(c)) {
        const S = (hw1 >>> 10) & 1, J1 = (hw2 >>> 13) & 1, J2 = (hw2 >>> 11) & 1;
        let imm = (S << 20) | (J2 << 19) | (J1 << 18) | ((hw1 & 0x3f) << 12) | ((hw2 & 0x7ff) << 1);
        imm = (imm << 11) >> 11;
        this.npc = (this.pc + 4 + imm) >>> 0;
        this.cycles += 2;
      }
      return;
    }
    switch (op) {
      case 0x38: case 0x39: this.msr(hw1 & 15, (hw2 >>> 10) & 3, hw2 & 0xff); return;
      case 0x3a:
        if ((hw2 & 0x700) !== 0) this.udf();
        if ((hw2 & 0xff) < 5) this.hint(hw2 & 0xff);
        return;
      case 0x3b:
        switch ((hw2 >>> 4) & 15) {
          case 2: this.exAddr = -1; return; // CLREX
          case 4: case 5: case 6: return; // DSB DMB ISB
          default: this.udf();
        }
        return;
      case 0x3e: case 0x3f: r[(hw2 >>> 8) & 15] = this.mrs(hw2 & 0xff); return;
      default: this.udf();
    }
  }

  mrs(sysm) {
    switch (sysm >>> 3) {
      case 0: {
        let v = 0;
        if (sysm & 1) v |= this.ipsr;
        if (!(sysm & 4)) v |= this.getAPSR();
        return v | 0;
      }
      case 1:
        if (!this.privileged) return 0;
        if (sysm === 8) return this.getMSP() | 0;
        if (sysm === 9) return this.getPSP() | 0;
        return 0;
      case 2:
        switch (sysm & 7) {
          case 0: return this.primask;
          case 1: case 2: return this.basepri;
          case 3: return this.faultmask;
          case 4: return this.control & 7;
          default: return 0;
        }
      default: return 0;
    }
  }

  msr(n, mask, sysm) {
    const v = this.r[n];
    switch (sysm >>> 3) {
      case 0:
        if (!(sysm & 4)) {
          if (mask & 2) this.setAPSRnzcvq(v);
          if (mask & 1) this.ge = (v >>> 16) & 15;
        }
        return;
      case 1:
        if (!this.privileged) return;
        if (sysm === 8) this.setMSP(v);
        else if (sysm === 9) this.setPSP(v);
        return;
      case 2:
        if (!this.privileged) return;
        switch (sysm & 7) {
          case 0: this.primask = v & 1; break;
          case 1: this.basepri = v & 0xf0; break;
          case 2: {
            const b = v & 0xf0;
            if (b !== 0 && (b < this.basepri || this.basepri === 0)) this.basepri = b;
            break;
          }
          case 3: if (this.execPriority() > -1) this.faultmask = v & 1; break;
          case 4: {
            let c = (this.control & ~1) | (v & 1);
            if (this.ipsr === 0) {
              c = (c & ~2) | (v & 2);
              this._selectSP((c & 2) !== 0);
            }
            c = (c & ~4) | (v & 4);
            this.control = c;
            break;
          }
          default: break;
        }
        this.nvic.dirty = true;
        return;
      default:
    }
  }

  lsSingle(hw1, hw2) {
    const r = this.r;
    const L = hw1 & 0x10, size = (hw1 >>> 5) & 3, sgn = hw1 & 0x100, n = hw1 & 15, t = hw2 >>> 12;
    if (size === 3) this.udf();
    let a, wb = false, wbA = 0;
    if (n === 15) {
      if (!L) this.udf();
      const base = (this.pc + 4) & ~3;
      a = (hw1 & 0x80 ? base + (hw2 & 0xfff) : base - (hw2 & 0xfff)) | 0;
    } else if (hw1 & 0x80) {
      a = (r[n] + (hw2 & 0xfff)) | 0;
    } else if (hw2 & 0x800) {
      const imm = hw2 & 0xff, P = hw2 & 0x400, U = hw2 & 0x200, W = hw2 & 0x100;
      const off = (U ? r[n] + imm : r[n] - imm) | 0;
      if (!P && !W) this.udf();
      a = P ? off : r[n];
      if (W && (hw2 & 0xf00) !== 0xe00) { wb = true; wbA = off; }
    } else if ((hw2 & 0xfc0) === 0) {
      a = (r[n] + (r[hw2 & 15] << ((hw2 >>> 4) & 3))) | 0;
    } else {
      this.udf();
    }
    if (L) {
      if (t === 15 && size !== 2) return; // PLD/PLI/힌트
      let v;
      if (size === 2) { if (sgn) this.udf(); v = this.ld32(a); }
      else if (size === 1) v = sgn ? (this.ld16(a) << 16) >> 16 : this.ld16(a);
      else v = sgn ? (this.bus.read8(a) << 24) >> 24 : this.bus.read8(a);
      if (wb) r[n] = wbA;
      this.cycles++;
      if (t === 15) this.bxWritePC(v);
      else if (t === 13) this.setSP(v);
      else r[t] = v;
    } else {
      if (sgn) this.udf();
      const v = r[t];
      if (size === 2) this.st32(a, v);
      else if (size === 1) this.st16(a, v);
      else this.bus.write8(a, v);
      if (wb) r[n] = wbA;
    }
  }

  dpReg(hw1, hw2) {
    const r = this.r;
    const op1 = (hw1 >>> 4) & 15, op2 = (hw2 >>> 4) & 15, n = hw1 & 15, d = (hw2 >>> 8) & 15, m = hw2 & 15;
    if (op1 < 8) {
      if (op2 === 0) { // 레지스터 시프트
        const s = op1 & 1;
        const res = this.shiftC(r[n], op1 >>> 1, r[m] & 0xff);
        this.wr(d, res);
        if (s) { this.nz(res); this.c = this.sc; }
        return;
      }
      if (op2 & 8) { // 확장
        const v = ror(r[m], ((hw2 >>> 4) & 3) * 8);
        const add = n !== 15;
        const rn = add ? r[n] : 0;
        switch (op1) {
          case 0: r[d] = (rn + ((v << 16) >> 16)) | 0; return;
          case 1: r[d] = (rn + (v & 0xffff)) | 0; return;
          case 2: {
            const lo = (v << 24) >> 24, hi = (v << 8) >> 24;
            r[d] = (((rn & 0xffff) + lo) & 0xffff) | ((((rn >>> 16) + hi) & 0xffff) << 16);
            return;
          }
          case 3: {
            const lo = v & 0xff, hi = (v >>> 16) & 0xff;
            r[d] = (((rn & 0xffff) + lo) & 0xffff) | ((((rn >>> 16) + hi) & 0xffff) << 16);
            return;
          }
          case 4: r[d] = (rn + ((v << 24) >> 24)) | 0; return;
          case 5: r[d] = (rn + (v & 0xff)) | 0; return;
          default: this.udf();
        }
      }
      this.udf();
    }
    if ((op2 & 0xc) === 0 || (op2 & 0xc) === 4) { // 병렬 덧셈/뺄셈
      const kind = op2 & 3;
      if (kind === 3) this.udf();
      r[d] = this.parallel(op1 & 7, kind, (op2 & 4) !== 0, r[n], r[m]);
      return;
    }
    if ((op2 & 0xc) === 8 && (op1 & 0xc) === 8) {
      const a = op1 & 3, b = op2 & 3;
      if (a === 0) { // QADD 계열: 피연산자 Rm, Rn
        const rm = r[m], rn = r[n];
        switch (b) {
          case 0: r[d] = this.sat32(rm + rn); return;
          case 1: r[d] = this.sat32(rm + this.sat32(2 * rn)); return;
          case 2: r[d] = this.sat32(rm - rn); return;
          default: r[d] = this.sat32(rm - this.sat32(2 * rn)); return;
        }
      }
      if (a === 1) {
        const v = r[m];
        switch (b) {
          case 0: r[d] = rev(v); return;
          case 1: r[d] = ((v >>> 8) & 0x00ff00ff) | ((v & 0x00ff00ff) << 8); return;
          case 2: r[d] = rbit(v); return;
          default: r[d] = (((v & 0xff) << 24) >> 16) | ((v >>> 8) & 0xff); return;
        }
      }
      if (a === 2 && b === 0) { // SEL
        const ge = this.ge, rn = r[n], rm = r[m];
        let res = 0;
        for (let i = 0; i < 4; i++) {
          const mask = 0xff << (8 * i);
          res |= ((ge >>> i) & 1 ? rn : rm) & mask;
        }
        r[d] = res;
        return;
      }
      if (a === 3 && b === 0) { r[d] = Math.clz32(r[m]); return; }
    }
    this.udf();
  }

  // op: 0 ADD8, 1 ADD16, 2 ASX, 4 SUB8, 5 SUB16, 6 SAX; kind: 0 기본(GE), 1 포화, 2 반감
  parallel(op, kind, uns, a, b) {
    if (op === 0 || op === 4) {
      let res = 0, ge = 0;
      for (let i = 0; i < 4; i++) {
        let x = (a >>> (8 * i)) & 0xff, y = (b >>> (8 * i)) & 0xff;
        if (!uns) { x = (x << 24) >> 24; y = (y << 24) >> 24; }
        const v = op === 0 ? x + y : x - y;
        let o;
        if (kind === 0) {
          o = v;
          if (uns ? (op === 0 ? v >= 0x100 : v >= 0) : v >= 0) ge |= 1 << i;
        } else if (kind === 1) {
          o = uns ? (v < 0 ? 0 : v > 255 ? 255 : v) : (v < -128 ? -128 : v > 127 ? 127 : v);
        } else o = v >> 1;
        res |= (o & 0xff) << (8 * i);
      }
      if (kind === 0) this.ge = ge;
      return res;
    }
    if (op === 3 || op === 7) this.udf();
    let a0 = a & 0xffff, a1 = a >>> 16, b0 = b & 0xffff, b1 = b >>> 16;
    if (!uns) { a0 = (a0 << 16) >> 16; a1 = a >> 16; b0 = (b0 << 16) >> 16; b1 = b >> 16; }
    let r0, r1, add0, add1;
    switch (op) {
      case 1: r0 = a0 + b0; r1 = a1 + b1; add0 = true; add1 = true; break;
      case 5: r0 = a0 - b0; r1 = a1 - b1; add0 = false; add1 = false; break;
      case 2: r0 = a0 - b1; r1 = a1 + b0; add0 = false; add1 = true; break;
      default: r0 = a0 + b1; r1 = a1 - b0; add0 = true; add1 = false; break;
    }
    if (kind === 0) {
      let ge = 0;
      if (uns) {
        if (add0 ? r0 >= 0x10000 : r0 >= 0) ge |= 3;
        if (add1 ? r1 >= 0x10000 : r1 >= 0) ge |= 12;
      } else {
        if (r0 >= 0) ge |= 3;
        if (r1 >= 0) ge |= 12;
      }
      this.ge = ge;
    } else if (kind === 1) {
      if (uns) {
        r0 = r0 < 0 ? 0 : r0 > 0xffff ? 0xffff : r0;
        r1 = r1 < 0 ? 0 : r1 > 0xffff ? 0xffff : r1;
      } else {
        r0 = r0 < -32768 ? -32768 : r0 > 32767 ? 32767 : r0;
        r1 = r1 < -32768 ? -32768 : r1 > 32767 ? 32767 : r1;
      }
    } else {
      r0 >>= 1;
      r1 >>= 1;
    }
    return (r0 & 0xffff) | (r1 << 16);
  }

  // 32x32 → 64 (unsigned): this.plo, this.phi (int32)
  umul64(a, b) {
    a >>>= 0;
    b >>>= 0;
    const a0 = a & 0xffff, a1 = a >>> 16, b0 = b & 0xffff, b1 = b >>> 16;
    const p00 = a0 * b0, p01 = a0 * b1, p10 = a1 * b0, p11 = a1 * b1;
    const mid = (p00 >>> 16) + (p01 & 0xffff) + (p10 & 0xffff);
    this.plo = ((mid & 0xffff) << 16) | (p00 & 0xffff);
    this.phi = (p11 + (p01 >>> 16) + (p10 >>> 16) + (mid >>> 16)) | 0;
  }

  smul64(a, b) {
    this.umul64(a, b);
    this.phi = (this.phi - (a < 0 ? b : 0) - (b < 0 ? a : 0)) | 0;
  }

  add64(hi, lo) { // this.phi:plo += hi:lo
    const l = (this.plo >>> 0) + (lo >>> 0);
    this.phi = (this.phi + hi + (l > 0xffffffff ? 1 : 0)) | 0;
    this.plo = l | 0;
  }

  mul32(hw1, hw2) {
    const r = this.r;
    const op1 = (hw1 >>> 4) & 7, op2 = (hw2 >>> 4) & 3, n = hw1 & 15, a = hw2 >>> 12, d = (hw2 >>> 8) & 15, m = hw2 & 15;
    const hasA = a !== 15;
    switch (op1) {
      case 0:
        if (op2 === 0) r[d] = hasA ? (Math.imul(r[n], r[m]) + r[a]) | 0 : Math.imul(r[n], r[m]);
        else if (op2 === 1) r[d] = (r[a] - Math.imul(r[n], r[m])) | 0;
        else this.udf();
        if (hasA) this.cycles++;
        return;
      case 1: { // SMLAxy / SMULxy
        const x = (hw2 >>> 5) & 1, y = (hw2 >>> 4) & 1;
        const on = x ? r[n] >> 16 : (r[n] << 16) >> 16;
        const om = y ? r[m] >> 16 : (r[m] << 16) >> 16;
        const p = on * om;
        if (!hasA) { r[d] = p | 0; return; }
        const res = p + r[a];
        if (res !== (res | 0)) this.q = 1;
        r[d] = res | 0;
        return;
      }
      case 2: case 4: { // SMLAD/SMUAD, SMLSD/SMUSD
        if (op2 & 2) this.udf();
        const X = op2 & 1;
        const rm = X ? ror(r[m], 16) : r[m];
        const p1 = ((r[n] << 16) >> 16) * ((rm << 16) >> 16);
        const p2 = (r[n] >> 16) * (rm >> 16);
        let res = op1 === 2 ? p1 + p2 : p1 - p2;
        if (hasA) res += r[a];
        if (res !== (res | 0)) this.q = 1;
        r[d] = res | 0;
        return;
      }
      case 3: { // SMLAWy / SMULWy
        if (op2 & 2) this.udf();
        const om = op2 & 1 ? r[m] >> 16 : (r[m] << 16) >> 16;
        const p = Math.floor((r[n] * om) / 65536);
        if (!hasA) { r[d] = p | 0; return; }
        const res = p + r[a];
        if (res !== (res | 0)) this.q = 1;
        r[d] = res | 0;
        return;
      }
      case 5: case 6: { // SMMLA/SMMUL, SMMLS
        if (op2 & 2) this.udf();
        const R = op2 & 1;
        this.smul64(r[n], r[m]);
        if (op1 === 6) { // Ra:0 - P
          const lo = ~this.plo, hi = ~this.phi;
          this.plo = lo; this.phi = hi;
          this.add64(0, 1);
          this.add64(r[a], 0);
        } else if (hasA) this.add64(r[a], 0);
        if (R) this.add64(0, 0x80000000);
        r[d] = this.phi;
        return;
      }
      case 7: { // USAD8/USADA8
        if (op2 !== 0) this.udf();
        let sum = 0;
        const x = r[n], y = r[m];
        for (let i = 0; i < 32; i += 8) sum += Math.abs(((x >>> i) & 0xff) - ((y >>> i) & 0xff));
        r[d] = hasA ? (sum + r[a]) | 0 : sum;
        return;
      }
      default: this.udf();
    }
  }

  longMul(hw1, hw2) {
    const r = this.r;
    const op1 = (hw1 >>> 4) & 7, op2 = (hw2 >>> 4) & 15, n = hw1 & 15, m = hw2 & 15, lo = hw2 >>> 12, hi = (hw2 >>> 8) & 15;
    switch (op1) {
      case 0: if (op2 !== 0) this.udf(); this.smul64(r[n], r[m]); break;
      case 2: if (op2 !== 0) this.udf(); this.umul64(r[n], r[m]); break;
      case 1: case 3: { // SDIV / UDIV
        if (op2 !== 15) this.udf();
        const dv = r[m];
        let res;
        if (dv === 0) {
          if (this.scs.div0Trp) throw new FaultSignal(EXC_USAGEFAULT, CFSR.DIVBYZERO);
          res = 0;
        } else if (op1 === 1) res = (r[n] / dv) | 0;
        else res = ((r[n] >>> 0) / (dv >>> 0)) >>> 0;
        const lz = Math.clz32(dv) - Math.clz32(r[n]);
        this.cycles += Math.min(11, 1 + Math.max(0, lz >> 2));
        r[hi] = res;
        return;
      }
      case 4: {
        if (op2 === 0) { this.smul64(r[n], r[m]); this.add64(r[hi], r[lo]); }
        else if ((op2 & 0xc) === 8) {
          const on = op2 & 2 ? r[n] >> 16 : (r[n] << 16) >> 16;
          const om = op2 & 1 ? r[m] >> 16 : (r[m] << 16) >> 16;
          const p = on * om;
          this.phi = r[hi]; this.plo = r[lo];
          this.add64(p < 0 ? -1 : 0, p);
        } else if ((op2 & 0xe) === 0xc) {
          const rm = op2 & 1 ? ror(r[m], 16) : r[m];
          const p = ((r[n] << 16) >> 16) * ((rm << 16) >> 16) + (r[n] >> 16) * (rm >> 16);
          this.phi = r[hi]; this.plo = r[lo];
          this.add64(p < 0 ? -1 : Math.floor(p / 4294967296), p | 0);
        } else this.udf();
        break;
      }
      case 5: {
        if ((op2 & 0xe) !== 0xc) this.udf();
        const rm = op2 & 1 ? ror(r[m], 16) : r[m];
        const p = ((r[n] << 16) >> 16) * ((rm << 16) >> 16) - (r[n] >> 16) * (rm >> 16);
        this.phi = r[hi]; this.plo = r[lo];
        this.add64(Math.floor(p / 4294967296) | 0, p | 0);
        break;
      }
      case 6:
        if (op2 === 0) { this.umul64(r[n], r[m]); this.add64(r[hi], r[lo]); }
        else if (op2 === 6) { this.umul64(r[n], r[m]); this.add64(0, r[hi]); this.add64(0, r[lo]); }
        else this.udf();
        break;
      default: this.udf();
    }
    r[lo] = this.plo;
    r[hi] = this.phi;
  }

  // =====================================================================
  // 코프로세서 / FPv4-SP
  // =====================================================================
  coproc(hw1, hw2) {
    const cp = (hw2 >>> 8) & 15;
    if ((cp & 0xe) !== 0xa || hw1 >= 0xf000) throw new FaultSignal(EXC_USAGEFAULT, CFSR.NOCP);
    this.fpCheck();
    if ((hw1 & 0x0f00) === 0x0e00) {
      if (hw2 & 0x10) return this.fpXfer(hw1, hw2);
      return this.fpData(hw1, hw2);
    }
    if ((hw1 & 0x0e00) === 0x0c00) return this.fpLdSt(hw1, hw2);
    this.udf();
  }

  fpCheck() {
    const cp = (this.scs.cpacr >>> 20) & 3;
    if (cp === 0 || cp === 2 || (cp === 1 && !this.privileged)) throw new FaultSignal(EXC_USAGEFAULT, CFSR.NOCP);
    if ((this.control & 4) === 0 && (this.scs.fpccr & 0x80000000)) {
      this.fpscr = this.scs.fpdscr & 0x07c00000;
      this.control |= 4;
    }
  }

  fpXfer(hw1, hw2) {
    const r = this.r, S = this.s;
    const L = hw1 & 0x10, C = hw2 & 0x100, A = (hw1 >>> 5) & 7, t = hw2 >>> 12;
    if (!C) {
      if (A === 0) {
        const n = ((hw1 & 15) << 1) | ((hw2 >>> 7) & 1);
        if (L) r[t] = S[n] | 0;
        else S[n] = r[t];
        return;
      }
      if (A === 7) {
        const reg = hw1 & 15;
        if (L) {
          let v = 0;
          if (reg === 1) v = this.fpscr;
          else if (reg === 6) v = 0x10110021;
          else if (reg === 7) v = 0x11000011;
          else if (reg === 0) v = 0x410430f0;
          if (t === 15) {
            this.n = (v >>> 31) & 1; this.z = (v >>> 30) & 1; this.c = (v >>> 29) & 1; this.v = (v >>> 28) & 1;
          } else r[t] = v | 0;
        } else if (reg === 1) {
          this.fpscr = (r[t] & 0xf7c0009f) >>> 0;
        }
        return;
      }
      this.udf();
    }
    // VMOV.32 Dd[x] <-> Rt
    if ((hw1 & 0x40) || (hw2 & 0x60)) this.udf();
    const dd = ((hw2 >>> 3) & 0x10) | (hw1 & 15);
    if (dd >= 16) this.udf();
    const si = dd * 2 + ((hw1 >>> 5) & 1);
    if (L) r[t] = S[si] | 0;
    else S[si] = r[t];
  }

  fpLdSt(hw1, hw2) {
    const r = this.r, S = this.s;
    const P = hw1 & 0x100, U = hw1 & 0x80, D = (hw1 >>> 6) & 1, W = hw1 & 0x20, L = hw1 & 0x10, n = hw1 & 15;
    const Vd = (hw2 >>> 12) & 15, dbl = hw2 & 0x100, imm8 = hw2 & 0xff;
    if (!P && !U) {
      if ((hw1 & 0x1e0) !== 0x40) this.udf();
      // 64비트 전송: VMOV Rt, Rt2 <-> Sm,Sm+1 / Dm
      const t2 = hw1 & 15, t = hw2 >>> 12, M = (hw2 >>> 5) & 1, Vm = hw2 & 15;
      let s0;
      if (dbl) { const dm = (M << 4) | Vm; if (dm >= 16) this.udf(); s0 = dm * 2; }
      else { s0 = (Vm << 1) | M; if (s0 === 31) this.udf(); }
      if (L) { r[t] = S[s0] | 0; r[t2] = S[s0 + 1] | 0; }
      else { S[s0] = r[t]; S[s0 + 1] = r[t2]; }
      return;
    }
    const first = dbl ? ((D << 4) | Vd) * 2 : (Vd << 1) | D;
    let a, count, wb = false, wbA = 0;
    if (P && !W) {
      const base = n === 15 ? (this.pc + 4) & ~3 : r[n];
      a = (U ? base + imm8 * 4 : base - imm8 * 4) | 0;
      count = dbl ? 2 : 1;
    } else {
      if ((P !== 0) === (U !== 0)) this.udf();
      count = dbl ? imm8 & ~1 : imm8;
      a = U ? r[n] : (r[n] - imm8 * 4) | 0;
      if (W) { wb = true; wbA = (U ? r[n] + imm8 * 4 : r[n] - imm8 * 4) | 0; }
    }
    if (count === 0 || first + count > 32) this.udf();
    if (a & 3) throw new FaultSignal(EXC_USAGEFAULT, CFSR.UNALIGNED);
    const bus = this.bus;
    if (L) {
      for (let i = 0; i < count; i++) S[first + i] = bus.read32((a + 4 * i) | 0);
    } else {
      for (let i = 0; i < count; i++) bus.write32((a + 4 * i) | 0, S[first + i] | 0);
    }
    if (wb) r[n] = wbA;
    this.cycles += count;
  }

  fpData(hw1, hw2) {
    const S = this.s;
    const D = (hw1 >>> 6) & 1, Vn = hw1 & 15, Vd = (hw2 >>> 12) & 15, sz = (hw2 >>> 8) & 1;
    const N = (hw2 >>> 7) & 1, op = (hw2 >>> 6) & 1, M = (hw2 >>> 5) & 1, Vm = hw2 & 15;
    const opc1 = (hw1 >>> 4) & 0xb;
    const d = (Vd << 1) | D, n = (Vn << 1) | N, m = (Vm << 1) | M;
    if (sz) this.udf();
    switch (opc1) {
      case 0: { // VMLA/VMLS
        const p = this.fmul(S[n], S[m]);
        S[d] = this.fadd(S[d], op ? (p ^ 0x80000000) >>> 0 : p);
        this.cycles += 2;
        return;
      }
      case 1: { // VNMLS(op=0)/VNMLA(op=1)
        const p = this.fmul(S[n], S[m]);
        S[d] = this.fadd((S[d] ^ 0x80000000) >>> 0, op ? (p ^ 0x80000000) >>> 0 : p);
        this.cycles += 2;
        return;
      }
      case 2: { const p = this.fmul(S[n], S[m]); S[d] = op ? (p ^ 0x80000000) >>> 0 : p; return; }
      case 3: S[d] = op ? this.fsub(S[n], S[m]) : this.fadd(S[n], S[m]); return;
      case 8: if (op) this.udf(); S[d] = this.fdiv(S[n], S[m]); this.cycles += 13; return;
      case 9: // VFNMS(op=0) / VFNMA(op=1)
        S[d] = this.fma((S[d] ^ 0x80000000) >>> 0, op ? (S[n] ^ 0x80000000) >>> 0 : S[n], S[m]);
        this.cycles += 2;
        return;
      case 10: // VFMA(op=0) / VFMS(op=1)
        S[d] = this.fma(S[d], op ? (S[n] ^ 0x80000000) >>> 0 : S[n], S[m]);
        this.cycles += 2;
        return;
      case 11: return this.fpOther(hw1, hw2, d, m);
      default: this.udf();
    }
  }

  fpOther(hw1, hw2, d, m) {
    const S = this.s;
    const opc2 = hw1 & 15, opc3 = (hw2 >>> 6) & 3;
    if ((opc3 & 1) === 0) { // VMOV imm
      const imm8 = ((hw1 & 15) << 4) | (hw2 & 15);
      const b6 = (imm8 >>> 6) & 1;
      const exp = ((b6 ^ 1) << 7) | (b6 ? 0x7c : 0) | ((imm8 >>> 4) & 3);
      S[d] = (((imm8 >>> 7) << 31) | (exp << 23) | ((imm8 & 15) << 19)) >>> 0;
      return;
    }
    const hi = (hw2 >>> 7) & 1;
    switch (opc2) {
      case 0: S[d] = hi ? S[m] & 0x7fffffff : S[m]; return; // VMOV / VABS
      case 1: // VNEG / VSQRT
        if (hi) { S[d] = this.fsqrt(S[m]); this.cycles += 13; }
        else S[d] = (S[m] ^ 0x80000000) >>> 0;
        return;
      case 2: S[d] = this.f16to32(hi ? S[m] >>> 16 : S[m] & 0xffff); return;
      case 3: {
        const h = this.f32to16(S[m]);
        S[d] = hi ? ((S[d] & 0xffff) | (h << 16)) >>> 0 : ((S[d] & 0xffff0000) | h) >>> 0;
        return;
      }
      case 4: this.fcmp(S[d], S[m], hi); return;
      case 5: this.fcmp(S[d], 0, hi); return;
      case 8: S[d] = this.intToF(S[m], hi === 1); return;
      case 10: case 11: case 14: case 15: { // VCVT 고정소수점
        const sx = (hw2 >>> 7) & 1;
        const size = sx ? 32 : 16;
        const frac = size - (((hw2 & 15) << 1) | ((hw2 >>> 5) & 1));
        if (frac < 0) this.udf();
        const uns = opc2 & 1;
        if (opc2 & 4) S[d] = this.fToFixed(S[d], size, frac, uns) >>> 0;
        else S[d] = this.fixedToF(S[d], size, frac, uns);
        return;
      }
      case 12: case 13: S[d] = this.fToInt(S[m], (opc2 & 1) === 1, hi === 1) >>> 0; return;
      default: this.udf();
    }
  }

  // ---- FP 연산 (비트 패턴 입출력) ----
  fpIn(b) {
    if ((this.fpscr & FPSCR_FZ) && (b & 0x7f800000) === 0 && (b & 0x7fffff) !== 0) {
      this.fpscr |= FPSCR_IDC;
      return (b & 0x80000000) >>> 0;
    }
    return b;
  }

  nan2(a, b) {
    const sa = isSNaNb(a), sb = isSNaNb(b);
    let res;
    if (sa) res = a | 0x400000;
    else if (sb) res = b | 0x400000;
    else if (isNaNb(a)) res = a;
    else res = b;
    if (sa || sb) this.fpscr |= FPSCR_IOC;
    if (this.fpscr & FPSCR_DN) return DEFAULT_NAN;
    return res >>> 0;
  }

  nan1(a) {
    let res = a;
    if (isSNaNb(a)) { this.fpscr |= FPSCR_IOC; res = a | 0x400000; }
    if (this.fpscr & FPSCR_DN) return DEFAULT_NAN;
    return res >>> 0;
  }

  invalid() {
    this.fpscr |= FPSCR_IOC;
    return DEFAULT_NAN;
  }

  // 배정밀도 값 x(+오차 err)를 FPSCR 모드로 단정밀도 비트로 반올림
  roundF(x, err = 0) {
    const mode = (this.fpscr >>> 22) & 3;
    // 정확한 값 = x + err. 부호 비교용
    const errSame = err !== 0 && (err > 0) === (x > 0);
    const ax = Math.abs(x);
    if ((this.fpscr & FPSCR_FZ) && x !== 0 && (ax < FLT_MIN || (ax === FLT_MIN && err !== 0 && !errSame))) {
      this.fpscr |= FPSCR_UFC;
      return x < 0 ? 0x80000000 : 0;
    }
    let xr = x;
    if (err !== 0 && mode === 0) {
      // round-to-odd 보정 후 RNE
      f64[0] = x;
      if ((u64[0] & 1) === 0) {
        let lo = u64[0], hi = u64[1];
        if (errSame) { lo = (lo + 1) >>> 0; if (lo === 0) hi = (hi + 1) >>> 0; }
        else { if (lo === 0) hi = (hi - 1) >>> 0; lo = (lo - 1) >>> 0; }
        u64[0] = lo; u64[1] = hi;
        xr = f64[0];
      }
    }
    let f = Math.fround(xr);
    const inexact = f !== x || err !== 0;
    if (inexact) {
      if (mode !== 0) {
        const diff = f !== x ? x - f : err; // 정확한 값 - f 의 부호
        let b = f2b(f);
        if (mode === 1) { // +inf 방향
          if (diff > 0) b = f === 0 ? 1 : f > 0 ? b + 1 : b - 1;
        } else if (mode === 2) { // -inf 방향
          if (diff < 0) b = f === 0 ? 0x80000001 : f > 0 ? b - 1 : b + 1;
        } else if ((diff < 0 && f > 0) || (diff > 0 && f < 0)) b = b - 1; // 0 방향
        f = b2f(b >>> 0);
      }
      this.fpscr |= FPSCR_IXC;
      let thr, incl;
      if (mode === 0) { thr = 3.4028235677973366e38; incl = true; }
      else if ((mode === 1 && x > 0) || (mode === 2 && x < 0)) { thr = 3.4028234663852886e38; incl = false; }
      else { thr = 3.402823669209385e38; incl = true; }
      const ovf = ax > thr || (ax === thr && (errSame || (incl && err === 0)));
      if (ovf) this.fpscr |= FPSCR_OFC;
      else if (ax < FLT_MIN || (ax === FLT_MIN && err !== 0 && !errSame)) this.fpscr |= FPSCR_UFC;
    }
    return f2b(f);
  }

  zeroSign(x, y) { // x + y가 정확히 0인 경우의 결과 부호
    if (x === 0 && y === 0) {
      const nx = Object.is(x, -0), ny = Object.is(y, -0);
      if (nx && ny) return 0x80000000;
      if (!nx && !ny) return 0;
    }
    return ((this.fpscr >>> 22) & 3) === 2 ? 0x80000000 : 0;
  }

  fadd(a, b) {
    a = this.fpIn(a); b = this.fpIn(b);
    if (isNaNb(a) || isNaNb(b)) return this.nan2(a, b);
    const x = b2f(a), y = b2f(b);
    if (x === Infinity && y === -Infinity) return this.invalid();
    if (x === -Infinity && y === Infinity) return this.invalid();
    const s = x + y;
    if (s === 0) return this.zeroSign(x, y);
    const bb = s - x;
    const err = (x - (s - bb)) + (y - bb);
    return this.roundF(s, isFinite(s) ? err : 0);
  }

  fsub(a, b) {
    a = this.fpIn(a); b = this.fpIn(b);
    if (isNaNb(a) || isNaNb(b)) return this.nan2(a, b);
    return this.fadd(a, (b ^ 0x80000000) >>> 0);
  }

  fmul(a, b) {
    a = this.fpIn(a); b = this.fpIn(b);
    if (isNaNb(a) || isNaNb(b)) return this.nan2(a, b);
    const x = b2f(a), y = b2f(b);
    if ((x === 0 && !isFinite(y)) || (y === 0 && !isFinite(x))) return this.invalid();
    return this.roundF(x * y);
  }

  fdiv(a, b) {
    a = this.fpIn(a); b = this.fpIn(b);
    if (isNaNb(a) || isNaNb(b)) return this.nan2(a, b);
    const x = b2f(a), y = b2f(b);
    if ((x === 0 && y === 0) || (!isFinite(x) && !isFinite(y))) return this.invalid();
    if (y === 0 && isFinite(x)) {
      this.fpscr |= FPSCR_DZC;
      return (((a ^ b) & 0x80000000) | 0x7f800000) >>> 0;
    }
    return this.roundF(x / y);
  }

  fsqrt(a) {
    a = this.fpIn(a);
    if (isNaNb(a)) return this.nan1(a);
    const x = b2f(a);
    if (x === 0) return a;
    if (x < 0) return this.invalid();
    return this.roundF(Math.sqrt(x));
  }

  // FPMulAdd(addend, op1, op2)
  fma(a, b, c) {
    const na = isNaNb(a), nb = isNaNb(b), nc = isNaNb(c);
    a = this.fpIn(a); b = this.fpIn(b); c = this.fpIn(c);
    const y = b2f(b), z = b2f(c);
    const infZero = (y === 0 && !nc && !isFinite(z)) || (z === 0 && !nb && !isFinite(y));
    if (na || nb || nc) {
      const sa = na && isSNaNb(a), sb = nb && isSNaNb(b), sc = nc && isSNaNb(c);
      if (!sa && !sb && !sc && na && infZero && !nb && !nc) return this.invalid();
      let res;
      if (sa) res = a | 0x400000;
      else if (sb) res = b | 0x400000;
      else if (sc) res = c | 0x400000;
      else if (na) res = a;
      else if (nb) res = b;
      else res = c;
      if (sa || sb || sc) this.fpscr |= FPSCR_IOC;
      if (this.fpscr & FPSCR_DN) return DEFAULT_NAN;
      return res >>> 0;
    }
    const x = b2f(a);
    if (infZero) return this.invalid();
    const p = y * z; // 정확
    const signP = ((b ^ c) >>> 31) & 1;
    if (!isFinite(x) && !isFinite(p) && (x < 0) !== (signP === 1)) return this.invalid();
    if (!isFinite(x)) return a;
    if (!isFinite(p)) return signP ? 0xff800000 : 0x7f800000;
    if (x === 0 && p === 0) {
      const sA = (a >>> 31) & 1;
      if (sA === signP) return sA ? 0x80000000 : 0;
      return ((this.fpscr >>> 22) & 3) === 2 ? 0x80000000 : 0;
    }
    const s = x + p;
    if (s === 0) return ((this.fpscr >>> 22) & 3) === 2 ? 0x80000000 : 0;
    const bb = s - x;
    const err = (x - (s - bb)) + (p - bb);
    return this.roundF(s, isFinite(s) ? err : 0);
  }

  fcmp(a, b, e) {
    let nzcv;
    if (isNaNb(a) || isNaNb(b)) {
      nzcv = 3;
      if (e || isSNaNb(a) || isSNaNb(b)) this.fpscr |= FPSCR_IOC;
    } else {
      const x = b2f(this.fpIn(a)), y = b2f(this.fpIn(b));
      nzcv = x === y ? 6 : x < y ? 8 : 2;
    }
    this.fpscr = ((this.fpscr & 0x0fffffff) | (nzcv << 28)) >>> 0;
  }

  roundInt(x, mode) {
    switch (mode) {
      case 0: {
        const f = Math.floor(x);
        const dd = x - f;
        if (dd > 0.5) return f + 1;
        if (dd < 0.5) return f;
        return f % 2 === 0 ? f : f + 1;
      }
      case 1: return Math.ceil(x);
      case 2: return Math.floor(x);
      default: return Math.trunc(x);
    }
  }

  fToInt(a, signed, rz) {
    if (isNaNb(a)) { this.fpscr |= FPSCR_IOC; return 0; }
    a = this.fpIn(a);
    const x = b2f(a);
    const ri = this.roundInt(x, rz ? 3 : (this.fpscr >>> 22) & 3);
    const max = signed ? 2147483647 : 4294967295, min = signed ? -2147483648 : 0;
    if (ri > max) { this.fpscr |= FPSCR_IOC; return max | 0; }
    if (ri < min) { this.fpscr |= FPSCR_IOC; return min; }
    if (ri !== x) this.fpscr |= FPSCR_IXC;
    return ri | 0;
  }

  intToF(v, signed) {
    const x = signed ? v | 0 : v >>> 0;
    return this.roundF(x);
  }

  fToFixed(a, size, frac, uns) {
    if (isNaNb(a)) { this.fpscr |= FPSCR_IOC; return 0; }
    a = this.fpIn(a);
    const x = b2f(a) * 2 ** frac;
    const ri = Math.trunc(x);
    const max = uns ? 2 ** size - 1 : 2 ** (size - 1) - 1, min = uns ? 0 : -(2 ** (size - 1));
    let res;
    if (ri > max) { this.fpscr |= FPSCR_IOC; res = max; }
    else if (ri < min) { this.fpscr |= FPSCR_IOC; res = min; }
    else { res = ri; if (ri !== x) this.fpscr |= FPSCR_IXC; }
    if (size === 16) return uns ? res & 0xffff : (res << 16) >> 16;
    return res | 0;
  }

  fixedToF(v, size, frac, uns) {
    let x;
    if (size === 16) x = uns ? v & 0xffff : (v << 16) >> 16;
    else x = uns ? v >>> 0 : v | 0;
    // 고정소수점 → 부동소수점 변환은 항상 최근접 반올림(FPSCR.RMode 무시)
    const saved = this.fpscr;
    this.fpscr &= ~0x00c00000;
    const res = this.roundF(x / 2 ** frac);
    this.fpscr = (this.fpscr & ~0x00c00000) | (saved & 0x00c00000);
    return res;
  }

  f16to32(h) {
    const sign = (h & 0x8000) << 16;
    const e = (h >>> 10) & 31, m = h & 0x3ff;
    if (e === 31) {
      if (m === 0) return (sign | 0x7f800000) >>> 0;
      if (!(m & 0x200)) this.fpscr |= FPSCR_IOC;
      if (this.fpscr & FPSCR_DN) return DEFAULT_NAN;
      return (sign | 0x7fc00000 | (m << 13)) >>> 0;
    }
    if (e === 0) {
      if (m === 0) return sign >>> 0;
      const f = m * 2 ** -24;
      return (sign | f2b(f)) >>> 0;
    }
    return (sign | ((e - 15 + 127) << 23) | (m << 13)) >>> 0;
  }

  f32to16(b) {
    const sign = (b >>> 16) & 0x8000;
    if (isNaNb(b)) {
      if (isSNaNb(b)) this.fpscr |= FPSCR_IOC;
      if (this.fpscr & FPSCR_DN) return 0x7e00;
      return sign | 0x7e00 | ((b >>> 13) & 0x1ff);
    }
    b = this.fpIn(b);
    const exp = (b >>> 23) & 0xff;
    const mant = b & 0x7fffff;
    if (exp === 255) return sign | 0x7c00;
    if (exp === 0 && mant === 0) return sign;
    const mode = (this.fpscr >>> 22) & 3;
    const m = exp ? mant | 0x800000 : mant;
    const e = (exp ? exp : 1) - 127 + 15;
    const shift = e >= 1 ? 13 : 13 + (1 - e);
    let q, rem, half;
    if (shift >= 32) { q = 0; rem = m; half = Infinity; }
    else { q = m >>> shift; rem = m - q * 2 ** shift; half = 2 ** (shift - 1); }
    if (rem !== 0) {
      let up = false;
      if (mode === 0) up = rem > half || (rem === half && (q & 1) === 1);
      else if (mode === 1) up = !sign;
      else if (mode === 2) up = !!sign;
      if (up) q++;
      this.fpscr |= FPSCR_IXC;
    }
    let h = e >= 1 ? ((e - 1) << 10) + q : q;
    if (h >= 0x7c00) {
      this.fpscr |= FPSCR_OFC | FPSCR_IXC;
      if (mode === 0 || (mode === 1 && !sign) || (mode === 2 && sign)) h = 0x7c00;
      else h = 0x7bff;
    } else if (rem !== 0 && (e < 1 || h < 0x400)) {
      this.fpscr |= FPSCR_UFC;
    }
    return sign | h;
  }

  // =====================================================================
  // 예외
  // =====================================================================
  handleSignal(e) {
    if (e instanceof FaultSignal) {
      this.raiseFault(e.exc, e.bits, e.addr);
      return;
    }
    if (e instanceof BusFaultSignal) {
      if (e.ifetch) {
        const a = e.address;
        const xn = (a >>> 29) === 2 || a >= 0xa0000000;
        if (xn) this.raiseFault(EXC_MEMMANAGE, CFSR.IACCVIOL, a);
        else this.raiseFault(EXC_BUSFAULT, CFSR.IBUSERR, a);
      } else {
        this.raiseFault(EXC_BUSFAULT, CFSR.PRECISERR | CFSR.BFARVALID, e.address);
      }
      return;
    }
    throw e;
  }

  // 동기 예외(SVC/fault): 현재 우선순위로 받을 수 없으면 HardFault로 승격
  raiseSync(exc, bits) {
    this.raiseFault(exc, bits, undefined);
  }

  raiseFault(exc, bits, addr) {
    const scs = this.scs, nv = this.nvic;
    if (bits) {
      scs.cfsr = (scs.cfsr | bits) >>> 0;
      if (bits & CFSR.BFARVALID) scs.bfar = addr >>> 0;
      if (bits & CFSR.MMARVALID) scs.mmfar = addr >>> 0;
    }
    this.sleeping = false;
    const ep = this.execPriority();
    let target = exc;
    if (exc !== EXC_HARDFAULT && exc !== EXC_NMI) {
      if (!nv.enabled[exc] || nv.groupPri(nv.prio[exc]) >= ep) {
        target = EXC_HARDFAULT;
        scs.hfsr = (scs.hfsr | 0x40000000) >>> 0; // FORCED
      }
    }
    this.lastFault = { exc, target, bits: bits >>> 0, addr: addr === undefined ? null : addr >>> 0, pc: this.pc >>> 0 };
    if (target === EXC_HARDFAULT && ep <= -1) {
      this._enterLockup(null, exc);
      return;
    }
    nv.setPendingExc(target);
  }

  _enterLockup(message, exc) {
    this.lockedUp = true;
    this.lockup = { message, exc, pc: this.pc >>> 0, ipsr: this.ipsr };
    this.pc = 0xfffffffe;
  }

  // 대기 중 예외 검사·진입. 진입했으면 true
  checkExceptions() {
    const nv = this.nvic;
    nv.dirty = false;
    if (this.lockedUp) return false;
    const n = nv.bestPending();
    let p = 1000;
    if (n !== 0) p = nv.groupPri(nv.prio[n]);
    if (this.sleeping) {
      if (n !== 0 && p < this._execPriorityNoPrimask()) this.sleeping = false;
      else if (this.sleepWfe && this.eventReg) { this.sleeping = false; this.eventReg = 0; }
      else return false;
    }
    if (n !== 0 && p < this.execPriority()) {
      this.takeException(n);
      return true;
    }
    return false;
  }

  takeException(n) {
    const tail = this.retCycles === this.cycles;
    let stackErr = false;
    try {
      this.pushStack(this.pc);
    } catch (e) {
      if (!(e instanceof BusFaultSignal)) throw e;
      stackErr = true;
    }
    this.exceptionTaken(n);
    this.cycles += tail ? 6 : 12;
    if (stackErr) this.raiseFault(EXC_BUSFAULT, CFSR.STKERR, undefined);
  }

  pushStack(retAddr) {
    const fp = (this.control & 4) !== 0;
    const frameSize = fp ? 0x68 : 0x20;
    const thread = this.ipsr === 0;
    const usePsp = this.spIsPsp;
    const r = this.r;
    const sp0 = r[13];
    const align = (sp0 >>> 2) & 1;
    const fpPtr = ((sp0 - frameSize) & ~4) | 0;
    r[13] = fpPtr;
    const xpsr = (this.getXPSR() & ~0x200) | (align << 9);
    const bus = this.bus;
    let lr;
    try {
      bus.write32(fpPtr, r[0]);
      bus.write32(fpPtr + 4, r[1]);
      bus.write32(fpPtr + 8, r[2]);
      bus.write32(fpPtr + 12, r[3]);
      bus.write32(fpPtr + 16, r[12]);
      bus.write32(fpPtr + 20, r[14]);
      bus.write32(fpPtr + 24, retAddr & ~1);
      bus.write32(fpPtr + 28, xpsr | 0);
      if (fp) {
        const S = this.s;
        for (let i = 0; i < 16; i++) bus.write32(fpPtr + 0x20 + 4 * i, S[i] | 0);
        bus.write32(fpPtr + 0x60, this.fpscr | 0);
        this.scs.fpcar = (fpPtr + 0x20) >>> 0;
      }
    } finally {
      lr = fp ? 0xffffffe1 : 0xfffffff1;
      if (thread) lr |= 8;
      if (usePsp) lr |= 4;
      r[14] = lr | 0;
    }
  }

  exceptionTaken(n) {
    const scs = this.scs;
    let vec;
    try {
      vec = this.bus.read32((scs.vtor + 4 * n) >>> 0);
    } catch (e) {
      if (!(e instanceof BusFaultSignal)) throw e;
      scs.hfsr = (scs.hfsr | 2) >>> 0; // VECTTBL
      if (n === EXC_HARDFAULT || this.execPriority() <= -1) {
        this._enterLockup('벡터 테이블을 읽을 수 없습니다', n);
        return;
      }
      this.nvic.activate(n);
      this.ipsr = n;
      this.nvic.setPendingExc(EXC_HARDFAULT);
      return;
    }
    this._selectSP(false);
    this.ipsr = n;
    this.it = 0;
    this.tbit = vec & 1;
    this.pc = (vec & ~1) >>> 0;
    this.control &= ~6; // SPSEL=0, FPCA=0
    this.nvic.activate(n);
    this.exAddr = -1;
    this.eventReg = 1;
  }

  exceptionReturn(excRet) {
    const nv = this.nvic;
    const scs = this.scs;
    const n = this.ipsr;
    const low = excRet & 0xf;
    const invpc = () => {
      // 복귀 실패: 반환 명령 위치에서 UsageFault
      this.pc = this.lastPc;
      throw new FaultSignal(EXC_USAGEFAULT, CFSR.INVPC);
    };
    if (((excRet >>> 5) & 0x7ffffff) !== 0x7ffffff) invpc();
    if (!nv.active[n]) invpc();
    const nested = nv.activeCount;
    const nonBase = (scs.ccr & 1) !== 0;
    let toThread, usePsp;
    if (low === 1) {
      if (nested === 1 && !nonBase) invpc();
      toThread = false; usePsp = false;
    } else if (low === 9) {
      if (nested !== 1 && !nonBase) invpc();
      toThread = true; usePsp = false;
    } else if (low === 0xd) {
      if (nested !== 1 && !nonBase) invpc();
      toThread = true; usePsp = true;
    } else invpc();

    nv.deactivate(n);
    if (n !== EXC_NMI) this.faultmask = 0;

    // 스택 선택
    if (this.spIsPsp) this.psp = this.r[13] >>> 0; else this.msp = this.r[13] >>> 0;
    const frame = usePsp ? this.psp : this.msp;
    const ext = (excRet & 0x10) === 0;
    const bus = this.bus;
    const r = this.r;
    let pc, psr;
    try {
      r[0] = bus.read32(frame);
      r[1] = bus.read32(frame + 4);
      r[2] = bus.read32(frame + 8);
      r[3] = bus.read32(frame + 12);
      r[12] = bus.read32(frame + 16);
      r[14] = bus.read32(frame + 20);
      pc = bus.read32(frame + 24);
      psr = bus.read32(frame + 28);
      if (ext) {
        const S = this.s;
        for (let i = 0; i < 16; i++) S[i] = bus.read32(frame + 0x20 + 4 * i);
        this.fpscr = bus.read32(frame + 0x60) >>> 0;
      }
    } catch (e) {
      if (!(e instanceof BusFaultSignal)) throw e;
      this.ipsr = toThread ? 0 : this.ipsr;
      this.raiseFault(EXC_BUSFAULT, CFSR.UNSTKERR, undefined);
      return;
    }
    const newSp = ((frame + (ext ? 0x68 : 0x20)) | (((psr >>> 9) & 1) << 2)) >>> 0;
    if (usePsp) this.psp = newSp; else this.msp = newSp;
    this.control = (this.control & ~4) | (ext ? 4 : 0);
    if (toThread) this.control = (this.control & ~2) | (usePsp ? 2 : 0);
    this.spIsPsp = toThread && usePsp;
    r[13] = this.spIsPsp ? this.psp : this.msp;

    this.setAPSRnzcvq(psr);
    this.ge = (psr >>> 16) & 15;
    this.ipsr = psr & 0x1ff;
    this.it = ((psr >>> 25) & 3) | (((psr >>> 10) & 0x3f) << 2);
    this.tbit = (psr >>> 24) & 1;
    this.pc = (pc & ~1) >>> 0;
    this.exAddr = -1;
    this.eventReg = 1;
    this.cycles += 10;
    this.retCycles = this.cycles;

    if (toThread && this.ipsr !== 0) {
      this.ipsr = 0;
      this.pc = this.lastPc;
      throw new FaultSignal(EXC_USAGEFAULT, CFSR.INVPC);
    }
    if (!toThread && this.ipsr === 0) {
      throw new FaultSignal(EXC_USAGEFAULT, CFSR.INVPC);
    }
    if (toThread && scs.sleepOnExit) {
      this.sleeping = true;
      this.sleepWfe = false;
    }
    nv.dirty = true;
  }
}
