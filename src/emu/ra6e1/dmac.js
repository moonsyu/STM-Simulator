// RA6E1 DMA Controller (DMAC, 8 channels) as FSP r_dmac drives it (RA6E1 User's Manual 16 DMA Controller; offsets from
// R7FA6E10F.h R_DMAC0_Type / R_DMA_Type). Channel n at 0x40005000 + 0x40 n: DMSAR 0x00, DMDAR 0x04, DMCRA 0x08 (DMCRAL
// b15:0, DMCRAH b25:16), DMCRB 0x0C, DMTMD 0x10 (DCTG b1:0, SZ b9:8, DTS b13:12, MD b15:14), DMINT 0x13 (DTIE b4, ESIE b3,
// RPTIE b2), DMAMD 0x14 (DM b7:6, SM b15:14), DMOFR 0x18, DMCNT 0x1C (DTE), DMREQ 0x1D (SWREQ b0, CLRS b4), DMSTS 0x1E
// (ESIF b0, DTIF b4, ACT b7), DMSRR/DMDRR/DMSBS/DMDBS/DMBWR kept as written. DMAST (DMST) at 0x40005200.
// The activation event of channel n is ICU DELSRn (0x40006280 + 4n: the RA6E1 has no DELSR in the DMA block,
// BSP_FEATURE_DMAC_HAS_DELSR 0).
//
// A request (the DELSR event with DCTG = 01b, or DMREQ.SWREQ with DCTG = 00b) moves:
//   normal: one unit, DMCRA counts down; at 0 the transfer ends;
//   repeat: one unit, DMCRAL counts down; at 0 it reloads from DMCRAH, the repeat area (DTS) goes back to its start and
//           DMCRB counts down (the end at 0); with RPTIE each repeat-size end stops the channel (DTE 0, ESIF) and interrupts;
//   block:  DMCRAH units per request, the block area back after each block, DMCRB counts the blocks; RPTIE as above.
// The end clears DTE, sets DTIF and, with DTIE, raises DMACn_INT (event 0x20 + n). A software start with CLRS = 1
// (TRANSFER_START_MODE_REPEAT) keeps requesting until the channel stops. Transfers take no time. Repeat-block mode
// (MD 11b) is not modelled (nothing moves). Address modes: fixed, offset (DMOFR), increment, decrement.
import { BusFaultSignal } from '../bus.js';

export const DMAC_EVENT = n => 0x20 + n;
const MAX_UNITS = 1 << 20;

export class Dmac {
  constructor(soc) { this.soc = soc; this.name = 'DMAC'; this.size = 0x300; this.reset(); }
  reset() {
    this.ch = Array.from({ length: 8 }, () => { const bytes = new Uint8Array(0x40); return { bytes, dv: new DataView(bytes.buffer) }; });
    this.dmast = 0; this.common = new Uint8Array(0x100); this.transfers = 0;
  }
  reg(n, off, size = 4) { const dv = this.ch[n].dv; return size === 4 ? dv.getUint32(off, true) : size === 2 ? dv.getUint16(off, true) : dv.getUint8(off); }
  put(n, off, v, size = 4) { const dv = this.ch[n].dv; if (size === 4) dv.setUint32(off, v >>> 0, true); else if (size === 2) dv.setUint16(off, v & 0xffff, true); else dv.setUint8(off, v & 0xff); }
  delsr(n) { return this.soc.icu.get(0x280 + n * 4, 4) & 0x1ff; }
  active(n) { return !!(this.dmast & 1) && !!(this.reg(n, 0x1c, 1) & 1); }
  /** Whether a channel waits for `event` (DELSR with DCTG = 01b and DTE set). */
  listens(event) { for (let n = 0; n < 8; n++) if (this.active(n) && (this.reg(n, 0x10, 2) & 3) === 1 && this.delsr(n) === event) return true; return false; }
  event(event) { for (let n = 0; n < 8; n++) if (this.active(n) && (this.reg(n, 0x10, 2) & 3) === 1 && this.delsr(n) === event) this.request(n); }
  read(off, size) {
    this.soc.sync();
    if (off >= 0x200) { if (off === 0x200) return this.dmast; return this.common[off - 0x200] ?? 0; }
    const n = off >> 6, r = off & 0x3f;
    if (r === 0x1e) return this.reg(n, 0x1e, 1) & 0x11; // DMSTS: ACT reads 0 (a transfer takes no time)
    return this.reg(n, r, size);
  }
  peek(off, size) { return this.read(off, size); }
  write(off, v, size) {
    this.soc.sync();
    if (off >= 0x200) { if (off === 0x200) { this.dmast = v & 1; this.soc.listenersChanged?.(); } else this.common[off - 0x200] = v & 0xff; return; }
    const n = off >> 6, r = off & 0x3f;
    if (size === 4 && (r === 0x1c)) { this.write(off, v & 0xff, 1); this.write(off + 1, (v >>> 8) & 0xff, 1); this.write(off + 2, (v >>> 16) & 0xff, 1); return; }
    if (r === 0x1e) { const old = this.reg(n, 0x1e, 1); this.put(n, 0x1e, old & v & 0x11, 1); return; } // flags clear by writing 0
    this.put(n, r, v, size);
    if (r === 0x1c) this.soc.listenersChanged?.();
    if (r === 0x1d && (v & 1)) this.software(n);
  }
  access(fn) {
    try { return fn(); } catch (error) {
      if (!(error instanceof BusFaultSignal)) throw error;
      return null;
    }
  }
  // DMREQ.SWREQ with DCTG = 00b: one request, or (CLRS) requests until the channel stops.
  software(n) {
    if (!this.active(n) || (this.reg(n, 0x10, 2) & 3) !== 0) return;
    const repeat = !!(this.reg(n, 0x1d, 1) & 0x10);
    let units = 0;
    do { units += this.request(n); } while (repeat && this.active(n) && (this.reg(n, 0x1d, 1) & 1) && units < MAX_UNITS);
    if (!repeat || !this.active(n)) this.put(n, 0x1d, this.reg(n, 0x1d, 1) & ~1, 1);
  }
  // One request on channel n; returns the units moved.
  request(n) {
    const bus = this.soc.bus, tmd = this.reg(n, 0x10, 2), amd = this.reg(n, 0x14, 2), md = (tmd >> 14) & 3, sz = (tmd >> 8) & 3, dts = (tmd >> 12) & 3;
    if (md === 3 || sz === 3) return 0;
    const bytes = 1 << sz, sm = (amd >> 14) & 3, dm = (amd >> 6) & 3, ofr = this.reg(n, 0x18) | 0;
    const step = m => (m === 1 ? ofr : m === 2 ? bytes : m === 3 ? -bytes : 0);
    let sar = this.reg(n, 0x00), dar = this.reg(n, 0x04), units = 0, stop = false;
    const move = () => {
      const s = sar >>> 0, d = dar >>> 0;
      const v = this.access(() => (bytes === 1 ? bus.read8(s) : bytes === 2 ? bus.read16(s) : bus.read32(s)));
      if (v == null || this.access(() => { if (bytes === 1) bus.write8(d, v); else if (bytes === 2) bus.write16(d, v); else bus.write32(d, v); return true; }) == null) { stop = true; return; }
      sar = (sar + step(sm)) >>> 0; dar = (dar + step(dm)) >>> 0; units++; this.transfers++;
    };
    const cra = this.reg(n, 0x08), crah = (cra >>> 16) & 0x3ff, size = crah || 1024;
    const back = (address, mode) => (address - step(mode) * size) >>> 0;
    let end = false, escape = false;
    if (md === 0) {
      move();
      const c = ((cra & 0x3ffffff) - 1) >>> 0; this.put(n, 0x08, c & 0x3ffffff); end = (c & 0x3ffffff) === 0;
    } else {
      const crb = this.reg(n, 0x0c) & 0xffff;
      let cral = cra & 0xffff, blocksLeft = crb || 0x10000, wrapped = false;
      if (md === 1) { move(); cral = (cral || size) - 1; if (cral === 0) { cral = crah; wrapped = true; } }
      else { for (let i = 0; i < size && !stop; i++) move(); wrapped = true; }
      if (wrapped) {
        if (dts === 1) sar = back(sar, sm); else if (dts === 0) dar = back(dar, dm);
        blocksLeft--; this.put(n, 0x0c, blocksLeft & 0xffff, 4);
        if (blocksLeft === 0) end = true; else if (this.reg(n, 0x13, 1) & 0x04) escape = true;
      }
      this.put(n, 0x08, ((crah << 16) | (cral & 0xffff)) >>> 0);
    }
    this.put(n, 0x00, sar); this.put(n, 0x04, dar);
    if (stop) { this.put(n, 0x1c, 0, 1); return units; }
    const dmint = this.reg(n, 0x13, 1);
    if (end) { this.put(n, 0x1c, 0, 1); this.put(n, 0x1e, this.reg(n, 0x1e, 1) | 0x10, 1); if (dmint & 0x10) this.soc.raiseEvent(DMAC_EVENT(n)); }
    else if (escape) { this.put(n, 0x1c, 0, 1); this.put(n, 0x1e, this.reg(n, 0x1e, 1) | 0x01, 1); this.soc.raiseEvent(DMAC_EVENT(n)); }
    return units;
  }
}
