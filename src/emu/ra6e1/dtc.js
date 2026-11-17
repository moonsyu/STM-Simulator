// RA6E1 Data Transfer Controller (DTC) as FSP r_dtc drives it (RA6E1 User's Manual 17 Data Transfer Controller; offsets
// from R7FA6E10F.h R_DTC_Type): DTCCR (RRS b4) 0x00, DTCVBR 0x04, DTCADMOD 0x08, DTCST (b0) 0x0C, DTCSTS 0x0E (the DTC is
// never seen busy: a transfer runs within the event). r_dtc in a flat (secure) project writes DTCCR_SEC 0x10 and
// DTCVBR_SEC 0x14: the same registers here (one vector table; TrustZone attribution is not modelled).
//
// An ICU slot n whose IELSRn.DTCE (b24) is set hands its event to the DTC instead of the CPU: the DTC reads the address of
// the transfer information from the vector table (DTCVBR + 4n) and runs it. The transfer information in memory is what
// FSP's transfer_info_t is: word 0 = MRA (b31:24: MD b7:6, SZ b5:4, SM b3:2) and MRB (b23:16: CHNE b7, CHNS b6, DISEL b5,
// DTS b4, DM b3:2), then SAR, DAR, CRB (+12) and CRA (+14). After the transfer SAR, DAR, CRA and CRB are written back.
//   normal: one unit per activation, CRA counts down (0 = 65536); at 0 the transfer ends.
//   repeat: one unit, CRAL counts down; at 0 it reloads from CRAH and the repeat area's address (DTS: source or
//           destination) goes back to where it started. A repeat transfer never ends.
//   block:  CRAH units (0 = 256) per activation, the block area's address back after each block, CRB counts the blocks.
// Chain (CHNE): the next information (+16) runs in the same activation, every time (CHNS 0) or when the counter reached 0
// (CHNS 1).
// The CPU gets the interrupt (IR stays set) when an information with DISEL set ran, or when a normal or block transfer
// ended; an end without DISEL also clears DTCE. (Assumption: for a chain the rule is applied to each information that ran
// — the manual's wording for chains could not be checked.)
// Transfer sizes 1, 2 and 4 bytes; an access the bus refuses stops the transfer and is said once.
import { BusFaultSignal } from '../bus.js';

const MD = { NORMAL: 0, REPEAT: 1, BLOCK: 2 };

export class Dtc {
  constructor(soc) { this.soc = soc; this.name = 'DTC'; this.size = 0x400; this.warned = new Set(); this.reset(); }
  reset() { this.dtccr = 0x08; this.dtcvbr = 0; this.dtcadmod = 0; this.dtcst = 0; this.transfers = 0; this.activations = 0; }
  enabled() { return !!(this.dtcst & 1); }
  read(off, size) {
    this.soc.sync();
    if (off >= 0x10 && off < 0x18) off -= 0x10;
    if (off === 0x00) return this.dtccr;
    if (off === 0x04) return size === 4 ? this.dtcvbr >>> 0 : (this.dtcvbr >>> ((off & 3) * 8)) & (size === 2 ? 0xffff : 0xff);
    if (off === 0x08) return this.dtcadmod;
    if (off === 0x0c) return this.dtcst;
    return 0; // DTCSTS (0x0E): not active; the other registers read 0
  }
  peek(off, size) { return this.read(off, size); }
  write(off, v, size) {
    this.soc.sync();
    // A flat project on the RA6E1 (TrustZone part, secure build) writes the secure registers DTCCR_SEC (0x10) and
    // DTCVBR_SEC (0x14): one DTC here, so they are the same registers.
    if (off >= 0x10 && off < 0x18) off -= 0x10;
    if (off === 0x00) this.dtccr = v & 0x18;
    else if (off >= 0x04 && off < 0x08) { const sh = (off & 3) * 8, mask = (size === 4 ? 0xffffffff : size === 2 ? 0xffff : 0xff) * 2 ** sh; this.dtcvbr = ((this.dtcvbr & ~mask) | ((v * 2 ** sh) & mask)) >>> 0; }
    else if (off === 0x08) this.dtcadmod = v & 1;
    else if (off === 0x0c) this.dtcst = v & 1;
  }
  warn(key, text) { if (this.warned.has(key)) return; this.warned.add(key); this.soc.env.warn?.(text); }
  access(fn) {
    try { return fn(); } catch (error) {
      if (!(error instanceof BusFaultSignal)) throw error;
      this.warn('bus:' + error.address, `[DTC] 0x${(error.address >>> 0).toString(16).toUpperCase().padStart(8, '0')}: DTC가 접근할 수 없는 주소라 전송을 멈춥니다(전송 정보의 p_src · p_dest를 확인하세요).`);
      return null;
    }
  }
  /** An activation from ICU slot `slot`. Returns {cpu, clearDtce}: whether the IR flag is set for the CPU, and DTCE cleared. */
  activate(slot) {
    const bus = this.soc.bus;
    this.activations++;
    const vector = this.access(() => bus.read32((this.dtcvbr + slot * 4) >>> 0));
    if (vector == null) return { cpu: true, clearDtce: false };
    if (!vector) { this.warn('null:' + slot, `[DTC] 벡터 ${slot}의 전송 정보 주소가 0입니다(R_DTC_Open 전에 DTCE가 켜졌습니다). 인터럽트를 CPU로 넘깁니다.`); return { cpu: true, clearDtce: false }; }
    let addr = vector >>> 0, cpu = false, clearDtce = false;
    for (let n = 0; n < 64; n++) {
      const r = this.run(addr);
      if (!r) return { cpu: true, clearDtce: false };
      if (r.disel) cpu = true;
      if (r.ended) { cpu = true; if (!r.disel) clearDtce = true; }
      if (!r.chne || (r.chns && !r.zero)) break;
      addr = (addr + 16) >>> 0;
    }
    return { cpu, clearDtce };
  }
  // One transfer information at `addr`: the transfer of this activation and the write-back.
  run(addr) {
    const bus = this.soc.bus;
    const word = this.access(() => bus.read32(addr));
    if (word == null) return null;
    const mra = (word >>> 24) & 0xff, mrb = (word >>> 16) & 0xff;
    const md = (mra >> 6) & 3, sz = (mra >> 4) & 3, sm = (mra >> 2) & 3, dm = (mrb >> 2) & 3, dts = (mrb >> 4) & 1;
    const info = { chne: !!(mrb & 0x80), chns: !!(mrb & 0x40), disel: !!(mrb & 0x20) };
    if (sz === 3) { this.warn('sz8', '[DTC] 8바이트 전송은 RA6E1에 없습니다(BSP_FEATURE_DTC_SUPPORT_TRANSFER_8_BYTE 0).'); return null; }
    if (md === 3) { this.warn('md3', '[DTC] MRA.MD = 11b는 정의되지 않은 모드입니다.'); return null; }
    const bytes = 1 << sz, step = m => (m === 2 ? bytes : m === 3 ? -bytes : 0);
    let sar = this.access(() => bus.read32(addr + 4)), dar = this.access(() => bus.read32(addr + 8));
    const crb0 = this.access(() => bus.read16(addr + 12)), cra0 = this.access(() => bus.read16(addr + 14));
    if (sar == null || dar == null || crb0 == null || cra0 == null) return null;
    const move = () => {
      const s = sar >>> 0, d = dar >>> 0;
      const v = this.access(() => (bytes === 1 ? bus.read8(s) : bytes === 2 ? bus.read16(s) : bus.read32(s)));
      if (v == null) return false;
      if (this.access(() => { if (bytes === 1) bus.write8(d, v); else if (bytes === 2) bus.write16(d, v); else bus.write32(d, v); return true; }) == null) return false;
      sar = (sar + step(sm)) >>> 0; dar = (dar + step(dm)) >>> 0; this.transfers++;
      return true;
    };
    let cra = cra0, crb = crb0, ended = false, zero = false;
    if (md === MD.NORMAL) {
      if (!move()) return null;
      const c = (cra || 0x10000) - 1; cra = c & 0xffff; ended = zero = c === 0;
    } else {
      const crah = (cra >> 8) & 0xff, size = crah || 256;
      const back = (address, mode) => (address - step(mode) * size) >>> 0;
      if (md === MD.REPEAT) {
        if (!move()) return null;
        const cral = ((cra & 0xff) || 256) - 1;
        if (cral === 0) { zero = true; cra = (crah << 8) | crah; if (dts) sar = back(sar, sm); else dar = back(dar, dm); } else cra = (crah << 8) | cral;
      } else {
        for (let i = 0; i < size; i++) if (!move()) return null;
        if (dts) sar = back(sar, sm); else dar = back(dar, dm);
        const c = (crb || 0x10000) - 1; crb = c & 0xffff; ended = zero = c === 0;
      }
    }
    const ok = this.access(() => { bus.write32(addr + 4, sar); bus.write32(addr + 8, dar); bus.write16(addr + 12, crb); bus.write16(addr + 14, cra); return true; });
    if (ok == null) return null;
    return { ...info, ended, zero };
  }
}
