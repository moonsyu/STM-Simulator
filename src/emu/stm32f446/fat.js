// Minimal FAT32 disk image tools (super-floppy layout, 512-byte sectors) for the
// SD card model: create a formatted image, add files to the root directory and
// read files back (e.g. files written by FatFs running in the firmware).
const SECTOR = 512;

export function formatFat32(sizeBytes = 40 * 1024 * 1024, { label = 'STMSIM', sectorsPerCluster = 1 } = {}) {
  const total = Math.floor(sizeBytes / SECTOR), img = new Uint8Array(total * SECTOR), dv = new DataView(img.buffer);
  const rsvd = 32, fats = 2, spc = sectorsPerCluster;
  const fatSz = Math.ceil((total - rsvd) / ((256 * spc + fats) / 2));
  const clusters = Math.floor((total - rsvd - fats * fatSz) / spc);
  if (clusters < 65526) throw new Error('FAT32 이미지는 약 33 MB 이상이어야 합니다.');
  img.set([0xeb, 0x58, 0x90], 0); img.set([...'MSWIN4.1'].map(c => c.charCodeAt(0)), 3);
  dv.setUint16(11, SECTOR, true); img[13] = spc; dv.setUint16(14, rsvd, true); img[16] = fats;
  img[21] = 0xf8; dv.setUint16(24, 63, true); dv.setUint16(26, 255, true); dv.setUint32(32, total, true);
  dv.setUint32(36, fatSz, true); dv.setUint32(44, 2, true); dv.setUint16(48, 1, true); dv.setUint16(50, 6, true);
  img[64] = 0x80; img[66] = 0x29; dv.setUint32(67, 0x12345678, true);
  img.set([...label.padEnd(11).slice(0, 11)].map(c => c.charCodeAt(0)), 71); img.set([...'FAT32   '].map(c => c.charCodeAt(0)), 82);
  dv.setUint16(510, 0xaa55, true);
  img.copyWithin(6 * SECTOR, 0, SECTOR); // backup boot sector
  const fsinfo = SECTOR; dv.setUint32(fsinfo, 0x41615252, true); dv.setUint32(fsinfo + 484, 0x61417272, true); dv.setUint32(fsinfo + 488, 0xffffffff, true); dv.setUint32(fsinfo + 492, 0xffffffff, true); dv.setUint32(fsinfo + 508, 0xaa550000, true);
  for (let f = 0; f < fats; f++) { const base = (rsvd + f * fatSz) * SECTOR; dv.setUint32(base, 0x0ffffff8, true); dv.setUint32(base + 4, 0x0fffffff, true); dv.setUint32(base + 8, 0x0fffffff, true); }
  return img;
}

function layout(img) {
  const dv = new DataView(img.buffer, img.byteOffset, img.byteLength);
  const bps = dv.getUint16(11, true), spc = img[13], rsvd = dv.getUint16(14, true), fats = img[16];
  const fatSz = dv.getUint16(22, true) || dv.getUint32(36, true), root = dv.getUint32(44, true);
  if (bps !== SECTOR || dv.getUint16(510, true) !== 0xaa55) throw new Error('FAT 부트 섹터가 아닙니다.');
  return { dv, spc, rsvd, fats, fatSz, root, data: rsvd + fats * fatSz, clusterBytes: spc * SECTOR };
}
const fatGet = (L, c) => L.dv.getUint32(L.rsvd * SECTOR + c * 4, true) & 0x0fffffff;
const fatSet = (L, c, v) => { for (let f = 0; f < L.fats; f++) L.dv.setUint32((L.rsvd + f * L.fatSz) * SECTOR + c * 4, v, true); };
const clusterOffset = (L, c) => (L.data + (c - 2) * L.spc) * SECTOR;
function chain(L, start) { const out = []; let c = start; while (c >= 2 && c < 0x0ffffff8 && out.length < 1e6) { out.push(c); c = fatGet(L, c); } return out; }
function shortName(name) {
  const [base, ext = ''] = name.toUpperCase().split('.');
  return (base.slice(0, 8).padEnd(8) + ext.slice(0, 3).padEnd(3));
}
function entries(img, L) {
  const out = [];
  for (const c of chain(L, L.root)) {
    const off = clusterOffset(L, c);
    for (let o = off; o < off + L.clusterBytes; o += 32) {
      if (img[o] === 0) return out;
      if (img[o] === 0xe5 || img[o + 11] === 0x0f || img[o + 11] & 0x08) continue;
      const raw = String.fromCharCode(...img.subarray(o, o + 11));
      const name = raw.slice(0, 8).trimEnd() + (raw.slice(8).trim() ? '.' + raw.slice(8).trim() : '');
      out.push({ name, offset: o, cluster: (L.dv.getUint16(o + 20, true) << 16) | L.dv.getUint16(o + 26, true), size: L.dv.getUint32(o + 28, true), dir: !!(img[o + 11] & 0x10) });
    }
  }
  return out;
}
export function listFiles(img) { const L = layout(img); return entries(img, L).map(({ name, size, dir }) => ({ name, size, dir })); }
export function readFile(img, name) {
  const L = layout(img), e = entries(img, L).find(x => x.name === name.toUpperCase());
  if (!e) return null;
  const out = new Uint8Array(e.size); let pos = 0;
  for (const c of chain(L, e.cluster)) { if (pos >= e.size) break; const n = Math.min(L.clusterBytes, e.size - pos); out.set(img.subarray(clusterOffset(L, c), clusterOffset(L, c) + n), pos); pos += n; }
  return out;
}
export function addFile(img, name, data) {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data, L = layout(img);
  const total = Math.floor((img.length / SECTOR - L.data) / L.spc) + 2;
  const alloc = () => { for (let c = 3; c < total; c++) if (fatGet(L, c) === 0) { fatSet(L, c, 0x0fffffff); img.fill(0, clusterOffset(L, c), clusterOffset(L, c) + L.clusterBytes); return c; } throw new Error('디스크가 가득 찼습니다.'); };
  let first = 0, prev = 0;
  for (let pos = 0; pos < bytes.length; pos += L.clusterBytes) {
    const c = alloc(); if (prev) fatSet(L, prev, c); else first = c; prev = c;
    img.set(bytes.subarray(pos, pos + L.clusterBytes), clusterOffset(L, c));
  }
  // free directory slot (extend the root chain when full)
  let slot = -1;
  for (const c of chain(L, L.root)) { const off = clusterOffset(L, c); for (let o = off; o < off + L.clusterBytes; o += 32) if (img[o] === 0 || img[o] === 0xe5) { slot = o; break; } if (slot >= 0) break; }
  if (slot < 0) { const last = chain(L, L.root).at(-1), c = alloc(); fatSet(L, last, c); slot = clusterOffset(L, c); }
  img.fill(0, slot, slot + 32);
  img.set([...shortName(name)].map(ch => ch.charCodeAt(0)), slot);
  img[slot + 11] = 0x20;
  const date = ((2025 - 1980) << 9) | (1 << 5) | 1;
  L.dv.setUint16(slot + 16, date, true); L.dv.setUint16(slot + 18, date, true); L.dv.setUint16(slot + 24, date, true);
  L.dv.setUint16(slot + 20, first >> 16, true); L.dv.setUint16(slot + 26, first & 0xffff, true); L.dv.setUint32(slot + 28, bytes.length, true);
  return img;
}
