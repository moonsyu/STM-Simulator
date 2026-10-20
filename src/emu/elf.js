// ELF32 little-endian 파서: 세그먼트, 섹션, 심볼, DWARF .debug_line(v2~v5).

const PT_LOAD = 1;
const SHT_SYMTAB = 2;
const SHT_NOBITS = 8;

const SYM_TYPES = ['NOTYPE', 'OBJECT', 'FUNC', 'SECTION', 'FILE', 'COMMON', 'TLS'];
const SYM_BINDS = ['LOCAL', 'GLOBAL', 'WEAK'];

function toBytes(input) {
  if (input instanceof Uint8Array) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  if (ArrayBuffer.isView(input)) return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  throw new TypeError('parseElf: ArrayBuffer 또는 Uint8Array가 필요합니다');
}

function cstr(bytes, off) {
  let end = off;
  while (end < bytes.length && bytes[end] !== 0) end++;
  return utf8(bytes.subarray(off, end));
}

let decoder = null;
function utf8(b) {
  if (decoder === null && typeof TextDecoder !== 'undefined') decoder = new TextDecoder('utf-8');
  if (decoder) return decoder.decode(b);
  let s = '';
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return s;
}

export function normalizePath(p) {
  if (!p) return '';
  let s = String(p).replace(/\\/g, '/');
  // a/./b, a/b/../c 정리
  const parts = [];
  const abs = s.startsWith('/');
  for (const part of s.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..' && parts.length && parts[parts.length - 1] !== '..') parts.pop();
    else parts.push(part);
  }
  s = parts.join('/');
  return abs ? '/' + s : s;
}

function basename(p) {
  const s = normalizePath(p);
  const i = s.lastIndexOf('/');
  return i >= 0 ? s.slice(i + 1) : s;
}

function joinPath(dir, name) {
  if (!dir) return normalizePath(name);
  if (name.startsWith('/') || /^[A-Za-z]:[\\/]/.test(name)) return normalizePath(name);
  return normalizePath(dir.replace(/\\/g, '/') + '/' + name);
}

// 파일 이름 비교: 전체 경로, 경로 접미사, basename 순서로 허용
export function fileMatches(candidate, query) {
  const a = normalizePath(candidate).toLowerCase();
  const b = normalizePath(query).toLowerCase();
  if (!b) return false;
  if (a === b) return true;
  if (a.endsWith('/' + b) || b.endsWith('/' + a)) return true;
  return basename(a) === basename(b);
}

class Reader {
  constructor(bytes, off = 0) {
    this.b = bytes;
    this.dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    this.off = off;
  }
  u8() { return this.b[this.off++]; }
  i8() { const v = this.dv.getInt8(this.off); this.off += 1; return v; }
  u16() { const v = this.dv.getUint16(this.off, true); this.off += 2; return v; }
  u32() { const v = this.dv.getUint32(this.off, true); this.off += 4; return v; }
  u64() { const lo = this.u32(); const hi = this.u32(); return hi * 4294967296 + lo; }
  uleb() {
    let result = 0, shift = 0, byte;
    do {
      byte = this.b[this.off++];
      result += (byte & 0x7f) * 2 ** shift;
      shift += 7;
    } while (byte & 0x80);
    return result;
  }
  sleb() {
    let result = 0, shift = 0, byte;
    do {
      byte = this.b[this.off++];
      result += (byte & 0x7f) * 2 ** shift;
      shift += 7;
    } while (byte & 0x80);
    if (byte & 0x40) result -= 2 ** shift;
    return result;
  }
  cstr() {
    const start = this.off;
    while (this.off < this.b.length && this.b[this.off] !== 0) this.off++;
    const s = utf8(this.b.subarray(start, this.off));
    this.off++;
    return s;
  }
}

export function parseElf(input) {
  const bytes = toBytes(input);
  if (bytes.length < 52 || bytes[0] !== 0x7f || bytes[1] !== 0x45 || bytes[2] !== 0x4c || bytes[3] !== 0x46) {
    throw new Error('ELF 파일이 아닙니다');
  }
  if (bytes[4] !== 1) throw new Error('32비트 ELF만 지원합니다');
  if (bytes[5] !== 1) throw new Error('little-endian ELF만 지원합니다');
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u16 = (o) => dv.getUint16(o, true);
  const u32 = (o) => dv.getUint32(o, true);

  const header = {
    type: u16(16), machine: u16(18), version: u32(20), entry: u32(24), phoff: u32(28), shoff: u32(32),
    flags: u32(36), ehsize: u16(40), phentsize: u16(42), phnum: u16(44), shentsize: u16(46), shnum: u16(48), shstrndx: u16(50),
  };

  const segments = [];
  for (let i = 0; i < header.phnum; i++) {
    const o = header.phoff + i * header.phentsize;
    const seg = {
      type: u32(o), offset: u32(o + 4), vaddr: u32(o + 8), paddr: u32(o + 12),
      filesz: u32(o + 16), memsz: u32(o + 20), flags: u32(o + 24), align: u32(o + 28),
    };
    seg.data = bytes.subarray(seg.offset, seg.offset + seg.filesz);
    segments.push(seg);
  }

  const sections = [];
  for (let i = 0; i < header.shnum; i++) {
    const o = header.shoff + i * header.shentsize;
    sections.push({
      nameOff: u32(o), type: u32(o + 4), flags: u32(o + 8), addr: u32(o + 12), offset: u32(o + 16),
      size: u32(o + 20), link: u32(o + 24), info: u32(o + 28), addralign: u32(o + 32), entsize: u32(o + 36), name: '',
    });
  }
  if (header.shstrndx < sections.length) {
    const strtab = sections[header.shstrndx];
    for (const s of sections) s.name = cstr(bytes, strtab.offset + s.nameOff);
  }
  for (const s of sections) {
    s.data = s.type === SHT_NOBITS ? new Uint8Array(0) : bytes.subarray(s.offset, s.offset + s.size);
  }
  const sectionByName = (name) => sections.find((s) => s.name === name) || null;

  // 심볼
  const symbols = [];
  for (const s of sections) {
    if (s.type !== SHT_SYMTAB) continue;
    const strtab = sections[s.link];
    const count = Math.floor(s.size / 16);
    for (let i = 1; i < count; i++) {
      const o = s.offset + i * 16;
      const info = bytes[o + 12];
      const sym = {
        name: cstr(bytes, strtab.offset + u32(o)),
        value: u32(o + 4),
        size: u32(o + 8),
        type: SYM_TYPES[info & 15] || String(info & 15),
        bind: SYM_BINDS[info >> 4] || String(info >> 4),
        shndx: u16(o + 14),
      };
      symbols.push(sym);
    }
  }

  const funcs = symbols
    .filter((s) => s.type === 'FUNC' && s.name)
    .map((s) => ({ name: s.name, start: (s.value & ~1) >>> 0, end: ((s.value & ~1) >>> 0) + Math.max(s.size, 2), sym: s }))
    .sort((a, b) => a.start - b.start);

  let lineTable;
  try {
    lineTable = parseDebugLine(sectionByName('.debug_line'), sectionByName('.debug_line_str'), sectionByName('.debug_str'));
  } catch (e) {
    lineTable = emptyLineTable();
    lineTable.error = String(e && e.message ? e.message : e);
  }

  const symbolByName = new Map();
  for (const s of symbols) {
    if (!s.name) continue;
    const prev = symbolByName.get(s.name);
    if (!prev || (prev.bind === 'LOCAL' && s.bind !== 'LOCAL')) symbolByName.set(s.name, s);
  }

  function functionAt(addr) {
    addr >>>= 0;
    let lo = 0, hi = funcs.length - 1, best = null;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (funcs[mid].start <= addr) { best = mid; lo = mid + 1; } else hi = mid - 1;
    }
    for (let i = best; i !== null && i >= 0 && i > best - 4; i--) {
      const f = funcs[i];
      if (addr >= f.start && addr < f.end) return f;
    }
    return null;
  }

  return {
    header,
    entry: header.entry,
    segments,
    loadSegments: segments.filter((s) => s.type === PT_LOAD),
    sections,
    sectionByName,
    symbols,
    functions: funcs,
    lineTable,
    findSymbol(name) { return symbolByName.get(name) || null; },
    functionAt,
    symbolize(addr) {
      const f = functionAt(addr);
      if (!f) return null;
      const off = (addr >>> 0) - f.start;
      return { name: f.name, offset: off, text: off ? `${f.name}+0x${off.toString(16)}` : f.name };
    },
  };
}

function emptyLineTable() {
  return {
    rows: [],
    files: [],
    addrToLine() { return null; },
    lineToAddrs() { return []; },
    resolveBreakpoint() { return null; },
  };
}

function readForm(r, form, ctx) {
  switch (form) {
    case 0x08: return r.cstr(); // string
    case 0x1f: { const o = ctx.off64 ? r.u64() : r.u32(); return ctx.lineStr ? cstr(ctx.lineStr, o) : ''; } // line_strp
    case 0x0e: { const o = ctx.off64 ? r.u64() : r.u32(); return ctx.str ? cstr(ctx.str, o) : ''; } // strp
    case 0x0f: return r.uleb(); // udata
    case 0x0d: return r.sleb(); // sdata
    case 0x0b: return r.u8(); // data1
    case 0x05: return r.u16(); // data2
    case 0x06: return r.u32(); // data4
    case 0x07: return r.u64(); // data8
    case 0x1e: { const v = r.b.subarray(r.off, r.off + 16); r.off += 16; return v; } // data16
    case 0x09: { const n = r.uleb(); const v = r.b.subarray(r.off, r.off + n); r.off += n; return v; } // block
    case 0x0a: { const n = r.u8(); r.off += n; return null; } // block1
    case 0x03: { const n = r.u16(); r.off += n; return null; } // block2
    case 0x04: { const n = r.u32(); r.off += n; return null; } // block4
    case 0x0c: return r.u8(); // flag
    case 0x19: return 1; // flag_present
    case 0x1a: return r.uleb(); // strx (해석 불가: 인덱스만)
    case 0x25: return r.u8();
    case 0x26: return r.u16();
    case 0x27: { const v = r.u16() + (r.u8() << 16); return v; }
    case 0x28: return r.u32();
    default: throw new Error(`지원하지 않는 DWARF form 0x${form.toString(16)}`);
  }
}

function parseEntryFormats(r) {
  const count = r.u8();
  const fmts = [];
  for (let i = 0; i < count; i++) fmts.push([r.uleb(), r.uleb()]);
  return fmts;
}

export function parseDebugLine(sec, lineStrSec, strSec) {
  if (!sec || !sec.data || sec.data.length === 0) return emptyLineTable();
  const data = sec.data;
  const r = new Reader(data);
  const rows = []; // {address, file, line, column, isStmt, end, seq}
  const fileSet = new Set();
  let seqId = 0;
  while (r.off < data.length) {
    const unitStart = r.off;
    let unitLength = r.u32();
    let off64 = false;
    if (unitLength === 0xffffffff) { unitLength = r.u64(); off64 = true; }
    if (unitLength === 0) break;
    const unitEnd = r.off + unitLength;
    const version = r.u16();
    if (version < 2 || version > 5) { r.off = unitEnd; continue; }
    let addrSize = 4;
    if (version >= 5) { addrSize = r.u8(); r.u8(); }
    const headerLength = off64 ? r.u64() : r.u32();
    const progStart = r.off + headerLength;
    const minInst = r.u8();
    const maxOps = version >= 4 ? r.u8() : 1;
    void maxOps;
    const defaultIsStmt = r.u8() !== 0;
    const lineBase = r.i8();
    const lineRange = r.u8();
    const opcodeBase = r.u8();
    const stdLens = [0];
    for (let i = 1; i < opcodeBase; i++) stdLens.push(r.u8());
    const dirs = [];
    const files = [];
    const ctx = { off64, lineStr: lineStrSec ? lineStrSec.data : null, str: strSec ? strSec.data : null };
    if (version >= 5) {
      const dfmt = parseEntryFormats(r);
      const dcount = r.uleb();
      for (let i = 0; i < dcount; i++) {
        let path = '';
        for (const [ct, form] of dfmt) {
          const v = readForm(r, form, ctx);
          if (ct === 1) path = String(v);
        }
        dirs.push(path);
      }
      const ffmt = parseEntryFormats(r);
      const fcount = r.uleb();
      for (let i = 0; i < fcount; i++) {
        let name = '', dir = 0;
        for (const [ct, form] of ffmt) {
          const v = readForm(r, form, ctx);
          if (ct === 1) name = String(v);
          else if (ct === 2) dir = Number(v);
        }
        files.push(joinPath(dirs[dir] || '', name));
      }
    } else {
      dirs.push('');
      for (;;) {
        const d = r.cstr();
        if (!d) break;
        dirs.push(d);
      }
      files.push(''); // 1부터 시작
      for (;;) {
        const name = r.cstr();
        if (!name) break;
        const dir = r.uleb();
        r.uleb();
        r.uleb();
        files.push(joinPath(dirs[dir] || '', name));
      }
    }
    for (const f of files) if (f) fileSet.add(f);
    r.off = progStart;

    // 상태 머신
    let address = 0, file = 1, line = 1, column = 0, isStmt = defaultIsStmt;
    const reset = () => { address = 0; file = 1; line = 1; column = 0; isStmt = defaultIsStmt; };
    const fileName = (i) => files[i] || '';
    const emit = (end) => {
      rows.push({ address: address >>> 0, file: fileName(file), line, column, isStmt, end, seq: seqId });
      if (end) seqId++;
    };
    while (r.off < unitEnd) {
      const op = r.u8();
      if (op >= opcodeBase) {
        const adj = op - opcodeBase;
        address += Math.floor(adj / lineRange) * minInst;
        line += lineBase + (adj % lineRange);
        emit(false);
      } else if (op === 0) {
        const len = r.uleb();
        const next = r.off + len;
        const sub = r.u8();
        if (sub === 1) { emit(true); reset(); }
        else if (sub === 2) address = addrSize === 8 ? r.u64() : r.u32();
        else if (sub === 3) {
          const name = r.cstr();
          const dir = r.uleb();
          r.uleb(); r.uleb();
          files.push(joinPath(dirs[dir] || '', name));
        }
        r.off = next;
      } else {
        switch (op) {
          case 1: emit(false); break;
          case 2: address += r.uleb() * minInst; break;
          case 3: line += r.sleb(); break;
          case 4: file = r.uleb(); break;
          case 5: column = r.uleb(); break;
          case 6: isStmt = !isStmt; break;
          case 7: break;
          case 8: address += Math.floor((255 - opcodeBase) / lineRange) * minInst; break;
          case 9: address += r.u16(); break;
          case 10: case 11: break;
          case 12: r.uleb(); break;
          default:
            for (let i = 0; i < stdLens[op]; i++) r.uleb();
        }
      }
    }
    r.off = unitEnd;
    void unitStart;
  }
  return buildLineTable(rows, [...fileSet]);
}

function buildLineTable(rows, files) {
  // 시퀀스별 주소 구간 생성
  const bySeq = new Map();
  for (const row of rows) {
    let arr = bySeq.get(row.seq);
    if (!arr) { arr = []; bySeq.set(row.seq, arr); }
    arr.push(row);
  }
  const ranges = []; // {start, end, file, line, column, isStmt, address}
  const entries = []; // 줄 진입 지점(중단점 후보)
  for (const seq of bySeq.values()) {
    seq.sort((a, b) => a.address - b.address || (a.end ? 1 : 0) - (b.end ? 1 : 0));
    let prevLine = -1, prevFile = null;
    for (let i = 0; i < seq.length; i++) {
      const row = seq[i];
      if (row.end) break;
      const next = seq[i + 1];
      if (next && next.address > row.address) {
        ranges.push({ start: row.address, end: next.address, file: row.file, line: row.line, column: row.column, isStmt: row.isStmt });
      }
      if (row.isStmt && row.line > 0 && (row.line !== prevLine || row.file !== prevFile)) {
        entries.push({ address: row.address, file: row.file, line: row.line });
      }
      if (row.isStmt) { prevLine = row.line; prevFile = row.file; }
    }
  }
  ranges.sort((a, b) => a.start - b.start);

  function addrToLine(addr) {
    addr >>>= 0;
    let lo = 0, hi = ranges.length - 1, best = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (ranges[mid].start <= addr) { best = mid; lo = mid + 1; } else hi = mid - 1;
    }
    if (best < 0) return null;
    const rg = ranges[best];
    if (addr >= rg.end || rg.line === 0) return null;
    return { file: rg.file, line: rg.line, column: rg.column, address: rg.start, end: rg.end, isStmt: rg.isStmt };
  }

  function lineToAddrs(file, line) {
    const out = new Set();
    for (const e of entries) if (e.line === line && fileMatches(e.file, file)) out.add(e.address);
    return [...out].sort((a, b) => a - b);
  }

  function resolveBreakpoint(file, line, maxForward = 50) {
    for (let l = line; l <= line + maxForward; l++) {
      const addrs = lineToAddrs(file, l);
      if (addrs.length) return { line: l, addrs };
    }
    return null;
  }

  return { rows, files, ranges, entries, addrToLine, lineToAddrs, resolveBreakpoint };
}
