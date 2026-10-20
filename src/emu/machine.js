// bus + scs + cpu 조립, 사이클 기반 실행 루프, 주변장치 tick, 이벤트 예약, 디버그 기능.

import { Bus } from './bus.js';
import { Scs, CFSR, EXC_HARDFAULT, EXC_MEMMANAGE, EXC_BUSFAULT, EXC_USAGEFAULT } from './scs.js';
import { Cpu, STOP } from './cpu.js';
import { parseElf } from './elf.js';

export { STOP };

const REASONS = {
  [STOP.CYCLES]: 'cycles',
  [STOP.SLEEP]: 'cycles',
  [STOP.BREAK]: 'breakpoint',
  [STOP.BKPT]: 'bkpt',
  [STOP.LOCKUP]: 'lockup',
  [STOP.EXIT]: 'exit',
  [STOP.RESET]: 'reset',
  [STOP.HALT]: 'halt',
};

const EXC_NAMES = {
  1: 'Reset', 2: 'NMI', 3: 'HardFault', 4: 'MemManage', 5: 'BusFault', 6: 'UsageFault',
  11: 'SVCall', 12: 'DebugMonitor', 14: 'PendSV', 15: 'SysTick',
};

export function exceptionName(n) {
  if (n >= 16) return `IRQ${n - 16}`;
  return EXC_NAMES[n] || `Exception${n}`;
}

const hex = (v) => '0x' + (v >>> 0).toString(16).toUpperCase().padStart(8, '0');

export class Machine {
  constructor({ sysclk = 16e6, semihosting = false, swv = false, sliceCycles = 64 } = {}) {
    this.clock = { sysclk, hclk: sysclk, pclk1: sysclk, pclk2: sysclk };
    this.bus = new Bus();
    this.scs = new Scs(this);
    this.nvic = this.scs.nvic;
    this.cpu = new Cpu(this.bus, this.scs, this);
    this.bus.map(0xe0000000, 0x100000, this.scs, 'PPB');
    this.bus.onDeviceAccess = (st) => this._sync(st);
    this.breakpoints = this.cpu.breakpoints;
    this.semihosting = semihosting;
    this.swv = swv;
    this.sliceCycles = sliceCycles;
    this.events = [];
    this._eventSeq = 0;
    this.semihostBytes = [];
    this.onSemihostOutput = null; // (Uint8Array, text) => void
    this.itmBytes = [];
    this.onItm = (port, byte) => { if (port === 0) this.itmBytes.push(byte); };
    this.onResetRequest = null;
    this.exitCode = null;
    this.elf = null;
    this._bkptPc = -1;
    this._resetPending = null;
    this.cpu.onBkpt = (imm) => this._onBkpt(imm);
  }

  get cycles() { return this.cpu.cycles; }
  set cycles(v) { this.cpu.cycles = v; }
  get pc() { return this.cpu.pc >>> 0; }

  map(base, size, device, name) {
    const e = this.bus.map(base, size, device, name);
    e.state.last = this.cpu.cycles;
    return e;
  }

  // ---- 주변장치 시간 동기화 ----
  _sync(st) {
    const now = this.cpu.cycles;
    const d = now - st.last;
    if (d > 0) {
      st.last = now;
      if (st.device.tick) st.device.tick(d, this);
    }
  }

  syncAll() {
    const list = this.bus.deviceStates;
    const now = this.cpu.cycles;
    for (let i = 0; i < list.length; i++) {
      const st = list[i];
      const d = now - st.last;
      if (d > 0) {
        st.last = now;
        if (st.device.tick) st.device.tick(d, this);
      }
    }
  }

  // ---- 이벤트 예약 ----
  schedule(cyclesFromNow, fn) {
    const at = this.cpu.cycles + Math.max(0, cyclesFromNow);
    const ev = { at, fn, id: ++this._eventSeq };
    const E = this.events;
    let i = E.length;
    while (i > 0 && E[i - 1].at > at) i--;
    E.splice(i, 0, ev);
    return ev.id;
  }

  cancel(id) {
    const i = this.events.findIndex((e) => e.id === id);
    if (i >= 0) this.events.splice(i, 1);
  }

  _fireEvents() {
    const E = this.events;
    while (E.length && E[0].at <= this.cpu.cycles) {
      const ev = E.shift();
      ev.fn(this);
    }
  }

  _nextDeadline() {
    let next = this.events.length ? this.events[0].at : Infinity;
    for (const st of this.bus.deviceStates) {
      const d = st.device;
      if (typeof d.nextEvent === 'function') {
        const t = d.nextEvent(this);
        if (t < next) next = t;
      }
    }
    return next;
  }

  requestReset(reason = 'request') {
    this._resetPending = reason;
    this.cpu.stop = STOP.RESET;
  }

  halt() {
    this.cpu.stop = STOP.HALT;
  }

  // ---- 로드·리셋 ----
  loadElf(bytes) {
    const elf = parseElf(bytes);
    this.bus.resetMemory({ keepFlash: false });
    for (const seg of elf.loadSegments) {
      if (seg.filesz > 0) this.bus.loadBytes(seg.paddr, seg.data);
    }
    this.elf = elf;
    this.reset();
    return elf;
  }

  loadBinary(bytes, addr = 0x08000000) {
    this.bus.resetMemory({ keepFlash: false });
    this.bus.loadBytes(addr, bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
    this.elf = null;
    this.reset();
  }

  reset() {
    this.scs.reset();
    for (const st of this.bus.deviceStates) {
      if (st.device !== this.scs && typeof st.device.reset === 'function') st.device.reset();
    }
    this.cpu.cycles = 0;
    this.cpu.instructions = 0;
    for (const st of this.bus.deviceStates) st.last = 0;
    this.events = [];
    this._bkptPc = -1;
    this._resetPending = null;
    this.exitCode = null;
    if (this.swv) this.scs.enableSwv();
    this.cpu.reset();
  }

  _result(reason) {
    return { reason, pc: this.cpu.pc >>> 0, cycles: this.cpu.cycles };
  }

  _skipBkpt() {
    const cpu = this.cpu;
    if (this._bkptPc >= 0 && cpu.pc === this._bkptPc) {
      try {
        const hw = this.bus.fetch16(cpu.pc);
        if ((hw & 0xff00) === 0xbe00) {
          cpu.pc = (cpu.pc + 2) >>> 0;
          if (cpu.it) cpu.it = (cpu.it & 7) === 0 ? 0 : (cpu.it & 0xe0) | ((cpu.it << 1) & 0x1f);
        }
      } catch { /* 무시 */ }
    }
    this._bkptPc = -1;
  }

  // 최대 maxCycles 실행. 반환 {reason, pc, cycles}
  run(maxCycles = Infinity) {
    const cpu = this.cpu;
    let target = cpu.cycles + maxCycles;
    let first = true;
    this._skipBkpt();
    for (;;) {
      this._fireEvents();
      if (cpu.cycles >= target) return this._result('cycles');
      let sliceEnd = Math.min(target, cpu.cycles + this.sliceCycles);
      if (this.events.length && this.events[0].at < sliceEnd) sliceEnd = Math.max(this.events[0].at, cpu.cycles + 1);
      const code = cpu.run(sliceEnd, first);
      first = false;
      this.syncAll();
      this._fireEvents();
      switch (code) {
        case STOP.CYCLES:
          continue;
        case STOP.SLEEP: {
          if (this.nvic.dirty) continue;
          let next = this._nextDeadline();
          if (next <= cpu.cycles) next = cpu.cycles + 1;
          if (next === Infinity || next > target) {
            cpu.cycles = Math.max(cpu.cycles, target === Infinity ? cpu.cycles : target);
            this.syncAll();
            this._fireEvents();
            if (this.nvic.dirty && target !== Infinity) continue;
            return this._result(next === Infinity && target === Infinity ? 'sleep' : 'cycles');
          }
          cpu.cycles = next;
          this.syncAll();
          continue;
        }
        case STOP.RESET: {
          const remaining = target - cpu.cycles;
          this._doReset();
          target = cpu.cycles + remaining;
          continue;
        }
        case STOP.BKPT:
          this._bkptPc = cpu.pc;
          return this._result('bkpt');
        default:
          return this._result(REASONS[code] || 'halt');
      }
    }
  }

  _doReset() {
    const reason = this._resetPending;
    const bps = this.breakpoints;
    if (this.onResetRequest) this.onResetRequest(reason);
    this.reset();
    this.cpu.breakpoints = bps;
  }

  // 명령어 하나 실행(대기 예외가 있으면 핸들러 첫 명령 위치로 진입)
  step() {
    const cpu = this.cpu;
    this._skipBkpt();
    if (cpu.sleeping) {
      // 깨울 이벤트까지 시간 진행
      for (let guard = 0; guard < 100000 && cpu.sleeping; guard++) {
        if (this.nvic.dirty) { cpu.checkExceptions(); if (!cpu.sleeping) return this._result('step'); continue; }
        let next = this._nextDeadline();
        if (next === Infinity) return this._result('sleep');
        if (next <= cpu.cycles) next = cpu.cycles + 1;
        cpu.cycles = next;
        this.syncAll();
        this._fireEvents();
      }
      if (cpu.sleeping) return this._result('sleep');
    }
    const code = cpu.stepOne();
    this.syncAll();
    this._fireEvents();
    if (code === -1 || code === STOP.SLEEP) return this._result('step');
    if (code === STOP.RESET) { this._doReset(); return this._result('reset'); }
    if (code === STOP.BKPT) { this._bkptPc = cpu.pc; return this._result('bkpt'); }
    return this._result(REASONS[code] || 'halt');
  }

  // ---- 소스 수준 단계 실행 ----
  _isCallAt(pc) {
    try {
      const hw = this.bus.fetch16(pc);
      if ((hw & 0xff87) === 0x4780) return pc + 2; // BLX Rm
      if ((hw & 0xf800) === 0xf000) {
        const hw2 = this.bus.fetch16((pc + 2) >>> 0);
        if ((hw2 & 0xd000) === 0xd000) return pc + 4; // BL
      }
    } catch { /* 무시 */ }
    return 0;
  }

  // 호출(BL/BLX)은 건너뛰며 명령어 하나 실행
  _stepInsnOver(budget) {
    const cpu = this.cpu;
    const pc = cpu.pc >>> 0;
    const ret = this._isCallAt(pc);
    const sp = cpu.r[13] >>> 0;
    const ipsr = cpu.ipsr;
    let res = this.step();
    if (res.reason !== 'step' || !ret || cpu.pc === ret) return res;
    if (cpu.ipsr !== ipsr) return res;
    const had = this.breakpoints.has(ret);
    this.breakpoints.add(ret);
    try {
      const end = cpu.cycles + budget;
      for (;;) {
        res = this.run(Math.max(1, end - cpu.cycles));
        if (res.reason !== 'breakpoint') return res;
        if (cpu.pc === ret && (cpu.r[13] >>> 0) >= sp && cpu.ipsr === ipsr) return { ...res, reason: 'step' };
        if (had) return res; // 사용자 중단점
        if (cpu.cycles >= end) return this._result('cycles');
      }
    } finally {
      if (!had) this.breakpoints.delete(ret);
    }
  }

  _lineInfo(pc) {
    return this.elf && this.elf.lineTable ? this.elf.lineTable.addrToLine(pc) : null;
  }

  _stepSource(over, maxCycles) {
    const cpu = this.cpu;
    const lt = this.elf && this.elf.lineTable;
    if (!lt || !lt.ranges || lt.ranges.length === 0) return this.step();
    const start = this._lineInfo(cpu.pc);
    const sp0 = cpu.r[13] >>> 0;
    const ipsr0 = cpu.ipsr;
    const end = cpu.cycles + maxCycles;
    let res = this._result('step');
    while (cpu.cycles < end) {
      res = over ? this._stepInsnOver(end - cpu.cycles) : this.step();
      if (res.reason !== 'step') return res;
      if (this.breakpoints.has(cpu.pc)) return { ...this._result('breakpoint') };
      const L = this._lineInfo(cpu.pc);
      if (!L || !L.isStmt || L.address !== cpu.pc) continue;
      if (over && (cpu.ipsr !== ipsr0 || (cpu.r[13] >>> 0) < sp0)) continue;
      if (start && L.line === start.line && L.file === start.file && (cpu.r[13] >>> 0) === sp0) continue;
      return this._result('step');
    }
    return this._result('cycles');
  }

  stepLine({ maxCycles = 50e6 } = {}) { return this._stepSource(false, maxCycles); }
  stepOver({ maxCycles = 500e6 } = {}) { return this._stepSource(true, maxCycles); }

  stepOut({ maxCycles = 500e6 } = {}) {
    const cpu = this.cpu;
    const fn = this.elf ? this.elf.functionAt(cpu.pc) : null;
    const sp0 = cpu.r[13] >>> 0;
    const ipsr0 = cpu.ipsr;
    const end = cpu.cycles + maxCycles;
    while (cpu.cycles < end) {
      const res = this._stepInsnOver(end - cpu.cycles);
      if (res.reason !== 'step') return res;
      if (this.breakpoints.has(cpu.pc)) return this._result('breakpoint');
      if (cpu.ipsr !== ipsr0) {
        if (ipsr0 !== 0 && cpu.nvic.active[ipsr0] === 0) return this._result('step'); // 핸들러 종료
        continue;
      }
      const sp = cpu.r[13] >>> 0;
      const here = this.elf ? this.elf.functionAt(cpu.pc) : null;
      if (sp > sp0 && (!fn || here !== fn)) return this._result('step');
      if (sp >= sp0 && fn && here && here !== fn) return this._result('step');
    }
    return this._result('cycles');
  }

  // ---- 상태 조회 ----
  registers() {
    const c = this.cpu;
    const r = [];
    for (let i = 0; i < 13; i++) r.push(c.r[i] >>> 0);
    const s = Array.from(c.s);
    const f32 = new Float32Array(new Uint32Array(s).buffer);
    return {
      r,
      sp: c.r[13] >>> 0,
      lr: c.r[14] >>> 0,
      pc: c.pc >>> 0,
      xpsr: c.getXPSR(),
      apsr: { n: c.n, z: c.z, c: c.c, v: c.v, q: c.q, ge: c.ge },
      msp: c.getMSP() >>> 0,
      psp: c.getPSP() >>> 0,
      primask: c.primask,
      basepri: c.basepri,
      faultmask: c.faultmask,
      control: c.control,
      ipsr: c.ipsr,
      mode: c.ipsr ? 'handler' : 'thread',
      fpscr: c.fpscr >>> 0,
      s,
      f: Array.from(f32),
      cycles: c.cycles,
      sleeping: c.sleeping,
      lockedUp: c.lockedUp,
    };
  }

  setRegister(name, value) {
    const c = this.cpu;
    value >>>= 0;
    const m = /^r(\d+)$/.exec(name);
    if (m) {
      const i = Number(m[1]);
      if (i === 15) { c.pc = value & ~1; return; }
      if (i === 13) { c.r[13] = value & ~3; return; }
      c.r[i] = value;
      return;
    }
    switch (name) {
      case 'sp': c.r[13] = value & ~3; return;
      case 'lr': c.r[14] = value; return;
      case 'pc': c.pc = (value & ~1) >>> 0; return;
      case 'msp': c.setMSP(value); return;
      case 'psp': c.setPSP(value); return;
      case 'xpsr': c.setAPSRnzcvq(value); c.ge = (value >>> 16) & 15; return;
      case 'primask': c.primask = value & 1; this.nvic.dirty = true; return;
      case 'basepri': c.basepri = value & 0xf0; this.nvic.dirty = true; return;
      case 'faultmask': c.faultmask = value & 1; this.nvic.dirty = true; return;
      case 'fpscr': c.fpscr = value & 0xf7c0009f; return;
      default: {
        const sm = /^s(\d+)$/.exec(name);
        if (sm) c.s[Number(sm[1])] = value;
      }
    }
  }

  readMemory(addr, length) {
    const out = new Uint8Array(length);
    for (let i = 0; i < length; i++) {
      const v = this.bus.peek((addr + i) >>> 0, 1, { allowSideEffects: false });
      out[i] = v === null ? 0 : v;
    }
    return out;
  }

  read32(addr) { return this.bus.peek(addr >>> 0, 4); }

  writeMemory(addr, bytes) {
    for (let i = 0; i < bytes.length; i++) this.bus.poke((addr + i) >>> 0, bytes[i], 1);
  }

  // ---- 세미호스팅 / BKPT ----
  _onBkpt(imm) {
    if (imm === 0xab && this.semihosting) {
      this._semihost();
      return true;
    }
    return false;
  }

  _emitSemihost(bytes) {
    for (const b of bytes) this.semihostBytes.push(b);
    if (this.onSemihostOutput) this.onSemihostOutput(Uint8Array.from(bytes));
  }

  get semihostOutput() {
    return new TextDecoder().decode(Uint8Array.from(this.semihostBytes));
  }

  get itmOutput() {
    return new TextDecoder().decode(Uint8Array.from(this.itmBytes));
  }

  _readCString(addr, max = 65536) {
    const out = [];
    for (let i = 0; i < max; i++) {
      const b = this.bus.read8((addr + i) | 0);
      if (b === 0) break;
      out.push(b);
    }
    return out;
  }

  _semihost() {
    const cpu = this.cpu;
    const bus = this.bus;
    const op = cpu.r[0] >>> 0;
    const arg = cpu.r[1] >>> 0;
    const w = (i) => bus.read32((arg + 4 * i) | 0) >>> 0;
    let ret = 0;
    switch (op) {
      case 0x01: { // SYS_OPEN
        const name = String.fromCharCode(...this._readCString(w(0), 256));
        ret = name === ':tt' ? (w(1) < 4 ? 0 : w(1) < 8 ? 1 : 2) : -1;
        break;
      }
      case 0x02: ret = 0; break;
      case 0x03: this._emitSemihost([bus.read8(arg | 0)]); break;
      case 0x04: this._emitSemihost(this._readCString(arg)); break;
      case 0x05: { // SYS_WRITE
        const h = w(0), buf = w(1), len = w(2);
        if (h === 1 || h === 2) {
          const out = [];
          for (let i = 0; i < len; i++) out.push(bus.read8((buf + i) | 0));
          this._emitSemihost(out);
        }
        ret = 0;
        break;
      }
      case 0x06: ret = w(2); break; // SYS_READ: 읽은 것 없음
      case 0x07: ret = -1; break;
      case 0x08: ret = 0; break; // SYS_ISERROR
      case 0x09: ret = 1; break; // SYS_ISTTY
      case 0x0a: ret = 0; break; // SYS_SEEK
      case 0x0c: ret = 0; break; // SYS_FLEN
      case 0x10: ret = Math.floor((cpu.cycles / this.clock.hclk) * 100); break;
      case 0x11: ret = Math.floor(Date.now() / 1000); break;
      case 0x13: ret = 0; break;
      case 0x15: { // SYS_GET_CMDLINE
        if (w(1) > 0) bus.write8(w(0) | 0, 0);
        bus.write32((arg + 4) | 0, 0);
        ret = 0;
        break;
      }
      case 0x16: { // SYS_HEAPINFO
        const p = w(0);
        for (let i = 0; i < 4; i++) bus.write32((p + 4 * i) | 0, 0);
        ret = 0;
        break;
      }
      case 0x18: // SYS_EXIT
        this.exitCode = arg === 0x20026 ? 0 : 1;
        cpu.stop = STOP.EXIT;
        break;
      case 0x20: // SYS_EXIT_EXTENDED
        this.exitCode = w(0) === 0x20026 ? w(1) | 0 : 1;
        cpu.stop = STOP.EXIT;
        break;
      default:
        ret = -1;
    }
    cpu.r[0] = ret | 0;
  }

  // ---- 폴트 설명 ----
  faultInfo() {
    const scs = this.scs;
    const cpu = this.cpu;
    return {
      cfsr: scs.cfsr >>> 0,
      hfsr: scs.hfsr >>> 0,
      mmfar: scs.mmfar >>> 0,
      bfar: scs.bfar >>> 0,
      lockedUp: cpu.lockedUp,
      lastFault: cpu.lastFault,
      lockup: cpu.lockup,
      activeException: cpu.ipsr,
    };
  }

  describeFault() {
    const scs = this.scs;
    const cpu = this.cpu;
    const cfsr = scs.cfsr >>> 0;
    const hfsr = scs.hfsr >>> 0;
    const lf = cpu.lastFault;
    if (!cfsr && !hfsr && !cpu.lockedUp && !lf) return '';
    const msgs = [];
    if (cfsr & CFSR.IACCVIOL) msgs.push('실행할 수 없는 영역에서 명령어를 가져오려 했습니다');
    if (cfsr & CFSR.DACCVIOL) msgs.push(`접근 권한이 없는 메모리에 접근했습니다${cfsr & CFSR.MMARVALID ? ' ' + hex(scs.mmfar) : ''}`);
    if (cfsr & CFSR.MSTKERR) msgs.push('예외 진입 중 스택 저장 실패(MemManage)');
    if (cfsr & CFSR.MUNSTKERR) msgs.push('예외 복귀 중 스택 복원 실패(MemManage)');
    if (cfsr & CFSR.IBUSERR) msgs.push('명령어를 가져오는 중 버스 오류가 발생했습니다');
    if (cfsr & CFSR.PRECISERR) msgs.push(`잘못된 메모리 접근 ${cfsr & CFSR.BFARVALID ? hex(scs.bfar) : ''}`.trim());
    if (cfsr & CFSR.IMPRECISERR) msgs.push('부정확한(imprecise) 버스 오류: 쓰기 주소를 확인하세요');
    if (cfsr & CFSR.STKERR) msgs.push('예외 진입 중 스택 저장 실패(스택 오버플로 가능성)');
    if (cfsr & CFSR.UNSTKERR) msgs.push('예외 복귀 중 스택 복원 실패');
    if (cfsr & CFSR.UNDEFINSTR) msgs.push('정의되지 않은 명령어를 실행했습니다');
    if (cfsr & CFSR.INVSTATE) msgs.push('잘못된 실행 상태(Thumb 비트 0): 함수 포인터를 확인하세요');
    if (cfsr & CFSR.INVPC) msgs.push('잘못된 예외 복귀 값(EXC_RETURN)');
    if (cfsr & CFSR.NOCP) msgs.push('FPU가 꺼져 있는데 부동소수점 명령을 실행했습니다(CPACR 확인)');
    if (cfsr & CFSR.UNALIGNED) msgs.push('정렬되지 않은 메모리 접근');
    if (cfsr & CFSR.DIVBYZERO) msgs.push('0으로 나누었습니다');
    if (hfsr & 2) msgs.push('벡터 테이블을 읽는 중 오류가 발생했습니다');
    if (cpu.lockup && cpu.lockup.message) msgs.push(cpu.lockup.message);
    let kind = 'HardFault';
    if (lf) {
      if (lf.target === EXC_HARDFAULT || lf.exc === EXC_HARDFAULT) kind = 'HardFault';
      else kind = exceptionName(lf.exc);
    } else if (cfsr & 0xffff0000) kind = 'UsageFault';
    else if (cfsr & 0xff00) kind = 'BusFault';
    else if (cfsr & 0xff) kind = 'MemManage';
    const sub = lf && lf.target === EXC_HARDFAULT && lf.exc !== EXC_HARDFAULT &&
      [EXC_MEMMANAGE, EXC_BUSFAULT, EXC_USAGEFAULT].includes(lf.exc) ? ` (${exceptionName(lf.exc)}에서 승격)` : '';
    let text = `${kind}${sub}: ${msgs.length ? msgs.join(', ') : '알 수 없는 폴트'}`;
    if (lf) {
      text += ` (PC=${hex(lf.pc)}`;
      const sym = this.elf ? this.elf.symbolize(lf.pc) : null;
      if (sym) text += ` ${sym.text}`;
      const line = this._lineInfo(lf.pc);
      if (line) text += ` ${line.file.split('/').pop()}:${line.line}`;
      text += ')';
    }
    if (cpu.lockedUp) text += ' — 코어가 잠금(lockup) 상태로 멈췄습니다';
    return text;
  }
}
