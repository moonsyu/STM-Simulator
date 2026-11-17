// RA6E1 flash sequencer (FACI, "flash HP") as FSP r_flash_hp drives it for the data flash (feature 39).
// Registers (R7FA6E10F.h R_FACI_HP_Type at 0x407F_E000; the command-issuing area R_FACI_HP_CMD at 0x407E_0000):
//   0x10 FASTAT  CFAE b7, CMDLK b4 (read-only: the command-locked state), DFAE b3 (cleared by writing 0)
//   0x14 FAEINT  CFAEIE b7, CMDLKIE b4, DFAEIE b3      0x18 FRDYIE  FRDYIE b0
//   0x30 FSADDR  0x34 FEADDR   start / end address of a command
//   0x80 FSTATR  FRDY b15, ILGLERR b14, ERSERR b13, PRGERR b12, DBFULL b10 (never set here), FLWEERR b6
//   0x84 FENTRYR key 0xAA in b15:8; FENTRYD b7 (data flash P/E mode), FENTRYC b0 (code flash P/E mode)
//   0xD0 FBCCNT  0xD4 FBCSTAT (BCST b0: 1 = not blank)  0xD8 FBCADDR/FPSADDR  0xE0 FCPSR  0xE4 FPCKAR (key 0x1E)
// Commands, as bytes written to the command area in data flash P/E mode (r_flash_hp.c FLASH_HP_FACI_CMD_*):
//   0xE8, N (= 2 words), N data words (16-bit writes), 0xD0   program 4 bytes at FSADDR
//   0x20, 0xD0                                                erase the 64-byte block at FSADDR
//   0x71, 0xD0                                                blank check FSADDR … FEADDR
//   0xB3  forced stop      0x50  status clear
// A command runs for its time (ra-data-flash.js RA_DF_TIME_US) with FRDY 0; when FRDY returns to 1 the flash-ready
// event FCU_FRDYI (0x31) is raised if FRDYIE is set. An error sets its FSTATR flag and the command-locked state
// (FASTAT.CMDLK), in which only status clear and forced stop are accepted; FASTAT ANDed with FAEINT raises the flash
// access error event FCU_FIFERR (0x30). Programming a unit that is not blank ends with PRGERR, as FSP documents for
// R_FLASH_HP_Write ("FSP_ERR_WRITE_FAILED … may be returned if the requested Flash area is not blank").
// Not checked against the hardware manual (it was not at hand), chosen as the simplest reading that makes FSP's own
// sequences work, and listed in the feature's report: forced stop also clears the FSTATR error flags (FSP issues only
// that after a failed command and then expects the next one to work); the data of a command takes effect when the
// command starts (a reset during it does not leave it half-done); commands written in read mode, or while FRDY is 0,
// are ignored with a note; the reset values of FAEINT (0x98) and FMEPROT (0x0001).
// Not modelled: code flash programming (commands in code flash P/E mode end in the command-locked state with a note —
// the ELF's code flash never changes), P/E suspend and resume, the configuration-set and lock-bit commands, ECC errors.
import { RA_DF_BASE, RA_DF_SIZE, RA_DF_BLOCK, RA_DF_UNIT, RA_DF_TIME_US } from '../../ra-data-flash.js';

export const FCU_EVENT = Object.freeze({ FIFERR: 0x30, FRDYI: 0x31 });
export const FACI = Object.freeze({ FASTAT: 0x10, FAEINT: 0x14, FRDYIE: 0x18, FSADDR: 0x30, FEADDR: 0x34, FMEPROT: 0x44, FSTATR: 0x80, FENTRYR: 0x84, FSUINITR: 0x8c, FCMDR: 0xa0, FBCCNT: 0xd0, FBCSTAT: 0xd4, FBCADDR: 0xd8, FCPSR: 0xe0, FPCKAR: 0xe4 });
export const FSTATR = Object.freeze({ FRDY: 0x8000, ILGLERR: 0x4000, ERSERR: 0x2000, PRGERR: 0x1000, FLWEERR: 0x40 });
export const FASTAT_CMDLK = 0x10;
const FASTAT_ACCESS = 0x88, FAEINT_MASK = 0x98, ERRORS = FSTATR.ILGLERR | FSTATR.ERSERR | FSTATR.PRGERR | FSTATR.FLWEERR;
const hex = v => '0x' + (v >>> 0).toString(16).toUpperCase().padStart(8, '0');

export class Faci {
  /** `soc`: nowUs(), after(us, fn), raiseEvent(event), flashWriteEnabled(), dataFlash (RaDataFlash), env.warn, sync(). */
  constructor(soc) { this.soc = soc; this.name = 'FACI'; this.size = 0x100; this.reset(); }
  get store() { return this.soc.dataFlash; }
  reset() {
    this.ev?.cancel?.(); this.ev = null; this.op = null; this.seq = null; this.errLine = false;
    this.fastat = 0; this.faeint = FAEINT_MASK; this.frdyie = 0; this.fsaddr = 0; this.feaddr = 0; this.errors = 0; this.fentryr = 0;
    this.fbccnt = 0; this.fbcstat = 0; this.fbcaddr = 0; this.fcpsr = 0; this.fpckar = 0; this.fmeprot = 1; this.fsuinitr = 0; this.fcmdr = 0xffff;
  }
  warn(message) { this.soc.env?.warn?.('[FLASH] ' + message); }
  /** µs until FRDY returns to 1 (0 when the sequencer is ready). */
  busyUs() { this.settle(); return this.op ? Math.max(0, this.op.until - this.soc.nowUs()) : 0; }
  settle() { if (this.op && this.soc.nowUs() >= this.op.until - 1e-6) this.complete(); }
  start(us, result) {
    const op = { until: this.soc.nowUs() + us, result }; this.op = op;
    this.ev = this.soc.after(us, () => { if (this.op === op) this.complete(); });
  }
  complete() {
    const op = this.op; this.op = null; this.ev?.cancel?.(); this.ev = null;
    op.result?.();
    // FRDY 0 → 1: the flash-ready interrupt, then the access-error one when the command ended in an error.
    if (this.frdyie & 1) this.soc.raiseEvent(FCU_EVENT.FRDYI);
    this.errorLine();
  }
  lock(bits) { this.errors |= bits; this.fastat |= FASTAT_CMDLK; this.seq = null; }
  errorLine() { const line = !!(this.fastat & this.faeint & FAEINT_MASK); if (line && !this.errLine) this.soc.raiseEvent(FCU_EVENT.FIFERR); this.errLine = line; }
  illegal(why) { this.warn(`${why} — 명령 잠금 상태(FASTAT.CMDLK, FSTATR.ILGLERR)가 됩니다.`); this.lock(FSTATR.ILGLERR); this.errorLine(); }
  // ------------------------------------------------------------ the command-issuing area
  command(value, size) {
    this.soc.sync?.(); this.settle();
    const v = value & (size === 1 ? 0xff : 0xffff);
    if (size === 1) this.fcmdr = ((v << 8) | (this.fcmdr >> 8)) & 0xffff;
    if (!(this.fentryr & 0x81)) { this.warn(`P/E 모드가 아닐 때 FACI 명령 영역에 쓴 값(0x${v.toString(16).toUpperCase()})은 받아들이지 않습니다. FENTRYR로 P/E 모드에 먼저 들어가세요.`); return; }
    // Forced stop: whatever runs ends at once; the command-locked state and the error flags are cleared.
    if (size === 1 && v === 0xb3) {
      const running = !!this.op; this.op = null; this.ev?.cancel?.(); this.ev = null; this.seq = null;
      this.errors = 0; this.fastat &= ~FASTAT_CMDLK; this.errorLine();
      if (running && (this.frdyie & 1)) this.soc.raiseEvent(FCU_EVENT.FRDYI);
      return;
    }
    if (this.op) { this.warn('명령이 끝나기 전(FSTATR.FRDY 0)에 쓴 FACI 명령은 받아들이지 않습니다.'); return; }
    // Status clear: ILGLERR and the command-locked state stay while an access violation flag (CFAE / DFAE) is set.
    if (size === 1 && v === 0x50 && !this.seq) {
      this.errors &= this.fastat & FASTAT_ACCESS ? FSTATR.ILGLERR : 0;
      if (!(this.errors & ERRORS)) this.fastat &= ~FASTAT_CMDLK;
      this.errorLine(); return;
    }
    if (this.fastat & FASTAT_CMDLK) return; // command-locked: nothing but status clear and forced stop
    if ((this.fentryr & 0x81) !== 0x80) { this.illegal('코드 플래시 프로그래밍(코드 플래시 P/E 모드의 FACI 명령)은 시뮬레이터가 지원하지 않습니다'); return; }
    const seq = this.seq;
    if (!seq) {
      if (size === 1 && v === 0xe8) this.seq = { kind: 'program', count: -1, words: [] };
      else if (size === 1 && v === 0x20) this.seq = { kind: 'erase' };
      else if (size === 1 && v === 0x71) this.seq = { kind: 'blank' };
      else this.illegal(`FACI 명령 0x${v.toString(16).toUpperCase()}는 이 모델에 없습니다(프로그램 0xE8 · 블록 지우기 0x20 · 블랭크 체크 0x71 · 강제 정지 0xB3 · 상태 지우기 0x50만 됩니다)`);
      return;
    }
    if (seq.kind === 'program') {
      if (seq.count < 0) { if (size !== 1 || v !== RA_DF_UNIT / 2) this.illegal(`데이터 플래시 프로그램 명령의 워드 수는 ${RA_DF_UNIT / 2}(4바이트)입니다`); else seq.count = v; return; }
      if (seq.words.length < seq.count) { if (size !== 2) this.illegal('프로그램 명령의 데이터는 16비트로 씁니다'); else seq.words.push(v); return; }
    }
    if (size !== 1 || v !== 0xd0) { this.illegal('FACI 명령의 마지막 바이트(0xD0)가 아닙니다'); return; }
    this.seq = null; this.execute(seq);
  }
  offset(address, length = 1) { const o = (address >>> 0) - RA_DF_BASE; return o >= 0 && o + length <= RA_DF_SIZE ? o : -1; }
  execute(seq) {
    if (seq.kind === 'blank') {
      const from = this.offset(this.fsaddr), to = this.offset(this.feaddr);
      if (from < 0 || to < from) { this.illegal(`블랭크 체크 범위(${hex(this.fsaddr)}~${hex(this.feaddr)})가 데이터 플래시(${hex(RA_DF_BASE)}~${hex(RA_DF_BASE + RA_DF_SIZE - 1)}) 밖입니다`); return; }
      const first = this.store.firstProgrammed(from, to - from + 1), units = (to >> 2) - (from >> 2) + 1;
      this.start(RA_DF_TIME_US.blankCheck * units, () => { this.fbcstat = first < 0 ? 0 : 1; this.fbcaddr = first < 0 ? 0 : RA_DF_BASE + first; });
      return;
    }
    // Program and erase need the flash P/E protect register opened (R_SYSTEM->FWEPROR = 1, flash_hp_init).
    if (!this.soc.flashWriteEnabled()) { this.warn('FWEPROR.FLWE가 01이 아니라 프로그램·지우기를 할 수 없습니다(FSTATR.FLWEERR).'); this.lock(FSTATR.FLWEERR); this.errorLine(); return; }
    if (seq.kind === 'erase') {
      const at = this.offset(this.fsaddr);
      if (at < 0) { this.illegal(`지울 주소 ${hex(this.fsaddr)}가 데이터 플래시 밖입니다`); return; }
      this.store.erase(at); this.start(RA_DF_TIME_US.erase, null);
      return;
    }
    const at = this.offset(this.fsaddr, RA_DF_UNIT);
    if (at < 0 || at % RA_DF_UNIT) { this.illegal(`프로그램할 주소 ${hex(this.fsaddr)}가 데이터 플래시의 4바이트 경계가 아닙니다`); return; }
    const ok = this.store.program(at, seq.words.flatMap(w => [w & 0xff, w >> 8]));
    this.start(RA_DF_TIME_US.write, ok ? null : () => {
      this.warn(`${hex(this.fsaddr)}: 지우지 않은(이미 쓴) 곳에 다시 썼습니다 — 프로그램 오류(FSTATR.PRGERR)이고 이 4바이트의 내용은 보장되지 않습니다. 쓰기 전에 그 블록(${RA_DF_BLOCK}바이트)을 R_FLASH_HP_Erase로 지우세요.`);
      this.lock(FSTATR.PRGERR);
    });
  }
  // A read of the data flash area by the program (the bus calls this; a debugger's peek does not).
  dataRead(offset, size) {
    this.settle();
    if (this.fentryr & 0x80) { this.warn('데이터 플래시 P/E 모드(쓰기·지우기·블랭크 체크가 진행 중)에서 데이터 플래시를 읽었습니다 — 실제 칩에서는 읽은 값이 보장되지 않습니다. 동작이 끝난 뒤(BGO면 콜백 뒤)에 읽으세요.'); return; }
    if (this.blankNoted) return; // said once in a run: a copy of a blank block would say it for every unit
    for (let u = offset >> 2, last = (offset + size - 1) >> 2; u <= last; u++) if (this.store.blank[u]) {
      this.blankNoted = true;
      this.warn(`지운(빈) 데이터 플래시 ${hex(RA_DF_BASE + u * RA_DF_UNIT)}를 읽었습니다 — 실제 칩에서는 지운 곳을 읽은 값이 정해지지 않습니다(시뮬레이터는 0xFF). 비었는지는 R_FLASH_HP_BlankCheck로 확인하세요.`);
      return;
    }
  }
  // A store by the program into the data flash area (`*p = v` through a pointer): the flash is not written by a bus
  // write on the chip either, so the value goes nowhere. Said once (both engines: the interpreter calls this too).
  assigned() {
    if (this.assignNoted) return;
    this.assignNoted = true;
    this.warn('데이터 플래시에 대입(버스 쓰기)한 값은 쓰이지 않고 무시됩니다 — 실제 칩도 같습니다. R_FLASH_HP_Erase로 블록을 지운 뒤 R_FLASH_HP_Write로 쓰세요.');
  }
  // ------------------------------------------------------------ registers
  word(base) {
    switch (base) {
      case FACI.FASTAT: return this.fastat;
      case FACI.FAEINT: return this.faeint;
      case FACI.FRDYIE: return this.frdyie;
      case FACI.FSADDR: return this.fsaddr;
      case FACI.FEADDR: return this.feaddr;
      case FACI.FMEPROT: return this.fmeprot;
      case FACI.FSTATR: return (this.op ? 0 : FSTATR.FRDY) | this.errors;
      case FACI.FENTRYR: return this.fentryr;
      case FACI.FSUINITR: return this.fsuinitr;
      case FACI.FCMDR: return this.fcmdr;
      case FACI.FBCCNT: return this.fbccnt;
      case FACI.FBCSTAT: return this.fbcstat;
      case FACI.FBCADDR: return this.fbcaddr;
      case FACI.FCPSR: return this.fcpsr;
      case FACI.FPCKAR: return this.fpckar;
      default: return 0;
    }
  }
  read(off, size) {
    this.soc.sync?.(); this.settle();
    const v = this.word(off & ~3) >>> ((off & 3) * 8);
    return size === 4 ? v >>> 0 : size === 2 ? v & 0xffff : v & 0xff;
  }
  peek(off, size) { const v = this.word(off & ~3) >>> ((off & 3) * 8); return size === 4 ? v >>> 0 : size === 2 ? v & 0xffff : v & 0xff; }
  write(off, value, size) {
    this.soc.sync?.(); this.settle();
    if (off & 3) return; // every register starts a 4-byte slot and FSP writes each at its start
    const v = size === 4 ? value >>> 0 : size === 2 ? value & 0xffff : value & 0xff, key = (v >> 8) & 0xff;
    switch (off) {
      case FACI.FASTAT: this.fastat &= v | ~FASTAT_ACCESS; this.errorLine(); break;
      case FACI.FAEINT: this.faeint = v & FAEINT_MASK; this.errorLine(); break;
      case FACI.FRDYIE: this.frdyie = v & 1; break;
      case FACI.FSADDR: this.fsaddr = value >>> 0; break;
      case FACI.FEADDR: this.feaddr = value >>> 0; break;
      case FACI.FMEPROT: if (key === 0xd9) this.fmeprot = v & 1; break;
      case FACI.FENTRYR: this.entry(v, key); break;
      case FACI.FBCCNT: this.fbccnt = v & 1; break;
      case FACI.FCPSR: this.fcpsr = v & 1; break;
      case FACI.FPCKAR: if (key === 0x1e) this.fpckar = v & 0xff; break;
      default: break;
    }
  }
  // FENTRYR (key 0xAA): read mode ↔ one of the P/E modes; from one P/E mode to the other only through read mode.
  entry(v, key) {
    if (key !== 0xaa) return;
    if (this.op) { this.warn('명령이 끝나기 전(FSTATR.FRDY 0)에는 FENTRYR를 바꿀 수 없습니다.'); return; }
    const mode = v & 0x81;
    if (mode === 0) { this.fentryr = 0; this.seq = null; }
    else if (this.fentryr === 0 && (mode === 0x80 || mode === 0x01)) { this.fentryr = mode; this.seq = null; }
  }
}
