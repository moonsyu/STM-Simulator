import { prng } from './core.js';

// Bit-level logic timelines for protocol pins (UART TX/RX, I²C SDA/SCL,
// SPI SCK/MOSI/MISO/NSS, USART CK) plus optional GPIO recording.
//
//   session.signals.channels()                     -> [{name, protocol, pins}]
//   session.signals.samples(channel, fromUs, toUs) -> [[us, level], ...]
//   session.signals.decode(channel, protocol, opts)-> decoded frames
//   project.simulation.noise = {enabled, bitErrorRate, glitchRate, jitterNs, seed}
//
// Noise is applied to the produced waveforms, and receivers decode those
// waveforms, so corrupted bits really reach the firmware (framing / parity
// errors, wrong I²C addresses → NACK, flipped SPI data).

export class Line {
  constructor(name, idle = 1, limit = 50000) { this.name = name; this.idle = idle; this.edges = []; this.limit = limit; this.end = 0; this.protocol = null; this.dropped = 0; }
  // Append a level from time t (µs). Edges must be appended in time order;
  // an edge earlier than the last one truncates the future (re-drive).
  push(t, level) {
    const e = this.edges;
    while (e.length && e[e.length - 1][0] > t) e.pop();
    const last = e.length ? e[e.length - 1][1] : this.idle;
    if (last === level) return;
    e.push([t, level]);
    if (e.length > this.limit) { const n = Math.floor(this.limit / 5); e.splice(0, n); this.dropped += n; }
  }
  levelAt(t) {
    const e = this.edges;
    let lo = 0, hi = e.length - 1, ans = -1;
    while (lo <= hi) { const mid = (lo + hi) >> 1; if (e[mid][0] <= t) { ans = mid; lo = mid + 1; } else hi = mid - 1; }
    if (ans >= 0) return e[ans][1];
    return e.length ? e[0][1] ^ 1 : this.idle;
  }
  // First edge with time > t.
  nextEdgeAfter(t) {
    const e = this.edges;
    let lo = 0, hi = e.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (e[mid][0] <= t) lo = mid + 1; else hi = mid; }
    return e[lo] ?? null;
  }
  samples(from = -Infinity, to = Infinity) {
    const out = [[from === -Infinity ? 0 : from, this.levelAt(from === -Infinity ? 0 : from)]];
    for (const [t, l] of this.edges) if (t > from && t <= to) out.push([t, l]);
    return out;
  }
}

const DEFAULT_NOISE = { enabled: false, bitErrorRate: 0, glitchRate: 0, jitterNs: 0, seed: 1 };
const clamp01 = v => Math.max(0, Math.min(1, Number(v) || 0));
export function normalizeNoise(cfg = {}) {
  const c = { ...DEFAULT_NOISE, ...(cfg || {}) };
  return { enabled: !!c.enabled, bitErrorRate: clamp01(c.bitErrorRate), glitchRate: clamp01(c.glitchRate), jitterNs: Math.max(0, Number(c.jitterNs) || 0), seed: (Number(c.seed) >>> 0) || 1 };
}

// UI contract (logic analyzer):
//   channels() -> [{id,label,protocol,lines:[{id,label}]}]
//   samples(lineId, fromUs, toUs) -> [[fromUs, level], ...edges] (≤ 20000 points)
//   decode(channelId) -> [{startUs, endUs, label, error?}]
//   noise() / setNoise(cfg) / now() / record(pins)
export class Signals {
  constructor(noise = {}, now = () => 0) {
    this.lines = new Map(); this.receivers = new Set(); this.channelMap = new Map(); this.frames = new Map();
    this.nowFn = now; this.recording = new Set(); this.stats = { corruptedBits: 0, glitches: 0 };
    this.setNoise(noise);
  }
  setNoise(cfg = {}) { this.noiseCfg = normalizeNoise(cfg); this.random = prng(this.noiseCfg.seed); const { seed, ...rest } = this.noiseCfg; return { ...rest }; }
  configure(cfg) { return this.setNoise(cfg); }
  noise() { const { seed, ...rest } = this.noiseCfg; return { ...rest }; }
  now() { return this.nowFn(); }
  line(name, idle = 1) { let l = this.lines.get(name); if (!l) { l = new Line(name, idle); this.lines.set(name, l); } return l; }
  get active() { return this.noiseCfg.enabled; }
  flip() { if (!this.active) return false; const p = this.noiseCfg.bitErrorRate; if (p > 0 && this.random() < p) { this.stats.corruptedBits++; return true; } return false; }
  glitch() { if (!this.active) return false; const p = this.noiseCfg.glitchRate; if (p > 0 && this.random() < p) { this.stats.glitches++; return true; } return false; }
  jitter() { if (!this.active || !this.noiseCfg.jitterNs) return 0; const u = this.random() + this.random() + this.random() - 1.5; return u * 2 * this.noiseCfg.jitterNs / 1000; }
  // Drive a sequence of [durationUs, level] bit cells from t0, with noise.
  drive(line, t0, cells, { noisy = true } = {}) {
    let t = t0;
    for (const [duration, level0] of cells) {
      let level = level0;
      if (noisy && this.flip()) level ^= 1;
      line.push(t + (noisy ? this.jitter() : 0), level);
      if (noisy && this.glitch()) { // short opposite pulse around the cell centre
        const w = duration * 0.3, c = t + duration * (0.35 + 0.3 * this.random());
        line.push(c, level ^ 1); line.push(c + w, level);
      }
      t += duration;
    }
    line.end = Math.max(line.end, t);
    for (const r of this.receivers) r.poke(line);
    return t;
  }
  // UART frame: start, data LSB first (parity already inside `value`), stop.
  uartFrame(line, t0, value, { baud, dataBits = 8, stopBits = 1, parity = 'none' }) {
    const bit = 1e6 / baud, cells = [[bit, 0]];
    for (let i = 0; i < dataBits; i++) cells.push([bit, (value >> i) & 1]);
    cells.push([bit * stopBits, 1]);
    line.protocol ??= 'uart';
    line.uart = { baud, dataBits: parity !== 'none' ? dataBits - 1 : dataBits, parity, stopBits };
    return this.drive(line, t0, cells);
  }
  annotate(name, frame) { let list = this.frames.get(name); if (!list) { list = []; this.frames.set(name, list); } list.push(frame); if (list.length > 4000) list.splice(0, 1000); }
  // Register / refresh a logic-analyzer channel.
  channel(id, label, protocol, lines, opts = {}) {
    const old = this.channelMap.get(id);
    if (old && old.lines.length === lines.length && old.lines.every((l, i) => l.id === lines[i].id)) { Object.assign(old.opts, opts); return old; }
    const ch = { id, label, protocol, lines: lines.filter(l => l.id), opts: { ...opts } };
    this.channelMap.set(id, ch); return ch;
  }
  // GPIO-level recording for arbitrary pins (logic analyzer 'gpio' channels).
  record(pins = []) {
    this.recording = new Set(pins);
    for (const pin of pins) this.channel('gpio:' + pin, pin, 'gpio', [{ id: 'gpio:' + pin, label: pin }]);
    return [...this.recording];
  }
  gpio(pin, us, level) { if (this.recording.has(pin)) { const l = this.line('gpio:' + pin, level); l.protocol ??= 'gpio'; l.push(us, level); } }
  channels() { return [...this.channelMap.values()].map(c => ({ id: c.id, label: c.label, protocol: c.protocol, lines: c.lines.map(l => ({ id: l.id, label: l.label })) })); }
  samples(lineId, fromUs = 0, toUs = Infinity, cap = 20000) {
    const out = this.line(lineId).samples(fromUs, toUs);
    return out.length > cap ? out.slice(0, cap) : out;
  }
  decode(channelId, opts = {}) {
    const ch = this.channelMap.get(channelId);
    if (!ch) return [];
    const o = { ...ch.opts, ...opts }, L = role => { const l = ch.lines.find(x => x.role === role) ?? null; return l ? this.line(l.id) : null; };
    if (ch.protocol === 'uart') {
      const line = this.line(ch.lines[0].id), cfg = { ...(line.uart || {}), ...o };
      const bitUs = 1e6 / (cfg.baud || 115200), n = (cfg.dataBits ?? 8) + (cfg.parity && cfg.parity !== 'none' ? 1 : 0);
      return decodeUart(line, cfg).map(f => ({ startUs: f.t, endUs: f.t + (n + 2) * bitUs, label: (f.char ? `${f.char} ` : '') + `(0x${f.value.toString(16).padStart(2, '0').toUpperCase()})`, value: f.value, ...(f.framingError ? { error: '프레이밍 오류' } : f.parityError ? { error: '패리티 오류' } : f.noise ? { error: '잡음 감지' } : {}) }));
    }
    if (ch.protocol === 'i2c') {
      const out = [];
      for (const f of decodeI2c(L('sda'), L('scl'))) {
        if (f.type === 'stop') { out.push({ startUs: f.t, endUs: f.t, label: 'STOP' }); continue; }
        out.push({ startUs: f.t, endUs: f.t, label: 'START' });
        f.bytes.forEach((b, i) => {
          const label = i === 0 ? `0x${(b.value >> 1).toString(16).padStart(2, '0')} ${b.value & 1 ? 'R' : 'W'} ${b.ack ? 'ACK' : 'NACK'}` : `0x${b.value.toString(16).padStart(2, '0')} ${b.ack ? 'ACK' : 'NACK'}`;
          out.push({ startUs: b.start, endUs: b.t, label, value: b.value, ...(i === 0 && !b.ack ? { error: '주소 NACK' } : {}) });
        });
      }
      return out;
    }
    if (ch.protocol === 'spi' || ch.protocol === 'usart-sync') {
      const sync = ch.protocol === 'usart-sync';
      return decodeSpi(L(sync ? 'ck' : 'sck'), L(sync ? 'tx' : 'mosi'), L(sync ? 'rx' : 'miso'), L('nss'), { ...o, lsbFirst: sync ? true : o.lsbFirst }).map(f => ({ startUs: f.t, endUs: f.end, label: `MOSI 0x${f.mosi.toString(16).padStart(2, '0').toUpperCase()} / MISO 0x${f.miso.toString(16).padStart(2, '0').toUpperCase()}`, mosi: f.mosi, miso: f.miso }));
    }
    if (ch.protocol === 'gpio') { const e = this.line(ch.lines[0].id).edges; return e.map(([t, l], i) => ({ startUs: t, endUs: e[i + 1]?.[0] ?? t, label: l ? 'HIGH' : 'LOW' })); }
    return [];
  }
}

// ----------------------------------------------------------------- decoders
function majority(line, t) { const a = line.levelAt(t[0]), b = line.levelAt(t[1]), c = line.levelAt(t[2]); return { level: a + b + c >= 2 ? 1 : 0, noise: !(a === b && b === c) }; }
// Decode one UART frame starting at falling edge t0 on `level(t)`.
export function sampleUartFrame(levelAt, t0, { baud, dataBits = 8, parity = 'none', stopBits = 1 }) {
  const bit = 1e6 / baud, at = (i, f) => t0 + (i + f) * bit;
  const s3 = i => { const a = levelAt(at(i, 7 / 16)), b = levelAt(at(i, 8 / 16)), c = levelAt(at(i, 9 / 16)); return { level: a + b + c >= 2 ? 1 : 0, noise: !(a === b && b === c) }; };
  const start = s3(0);
  if (start.level) return { falseStart: true, end: at(0, 0.5) };
  let value = 0, noise = start.noise, ones = 0;
  for (let i = 0; i < dataBits; i++) { const s = s3(i + 1); value |= s.level << i; noise ||= s.noise; ones += s.level; }
  const stop = s3(dataBits + 1); noise ||= stop.noise;
  let parityError = false;
  if (parity !== 'none') { parityError = parity === 'even' ? (ones & 1) === 1 : (ones & 1) === 0; }
  return { value, framingError: !stop.level, parityError, noise, end: at(dataBits + 1, 0.5), stopEnd: t0 + (dataBits + 1 + stopBits) * bit };
}
export function decodeUart(line, { baud = 115200, dataBits = 8, parity = 'none', stopBits = 1, from = -Infinity, to = Infinity } = {}) {
  const out = []; let t = from === -Infinity ? -1 : from;
  for (let guard = 0; guard < 100000; guard++) {
    let edge = line.nextEdgeAfter(t);
    while (edge && edge[1] !== 0) edge = line.nextEdgeAfter(edge[0]);
    if (!edge || edge[0] > to) break;
    const f = sampleUartFrame(x => line.levelAt(x), edge[0], { baud, dataBits: dataBits + (parity !== 'none' ? 1 : 0), parity, stopBits });
    if (f.falseStart) { t = f.end; continue; }
    const value = parity !== 'none' ? f.value & ((1 << dataBits) - 1) : f.value;
    out.push({ t: edge[0], value, char: value >= 32 && value < 127 ? String.fromCharCode(value) : null, framingError: f.framingError, parityError: f.parityError, noise: f.noise });
    t = f.end;
  }
  return out;
}
export function decodeI2c(sda, scl) {
  const times = [...new Set([...sda.edges.map(e => e[0]), ...scl.edges.map(e => e[0])])].sort((a, b) => a - b);
  const out = []; let bits = [], frame = null, prevSda = sda.idle, prevScl = scl.idle;
  for (const t of times) {
    const d = sda.levelAt(t), c = scl.levelAt(t);
    if (prevScl && c && prevSda && !d) { frame = { t, type: 'start', bytes: [] }; out.push(frame); bits = []; }
    else if (prevScl && c && !prevSda && d) { out.push({ t, type: 'stop' }); frame = null; bits = []; }
    else if (!prevScl && c && frame) {
      if (!bits.length) frame.byteStart = t;
      bits.push(d);
      if (bits.length === 9) { const value = bits.slice(0, 8).reduce((v, b) => (v << 1) | b, 0); frame.bytes.push({ start: frame.byteStart, t, value, ack: bits[8] === 0 }); bits = []; }
    }
    prevSda = d; prevScl = c;
  }
  return out;
}
export function decodeSpi(sck, mosi, miso, nss, { cpol = 0, cpha = 0, bits = 8, lsbFirst = false } = {}) {
  const out = []; let a = 0, b = 0, n = 0, prev = sck ? sck.idle : 0, start = null;
  if (!sck || !mosi) return out;
  const sampleRising = (cpol ^ cpha) === 0;
  for (const [t, level] of sck.edges) {
    if (nss && nss.levelAt(t) === 1) { prev = level; n = 0; a = b = 0; continue; }
    const rising = !prev && level, falling = prev && !level; prev = level;
    if ((sampleRising && rising) || (!sampleRising && falling)) {
      if (n === 0) start = t;
      const mo = mosi.levelAt(t), mi = miso ? miso.levelAt(t) : 1;
      if (lsbFirst) { a |= mo << n; b |= mi << n; } else { a = (a << 1) | mo; b = (b << 1) | mi; }
      if (++n === bits) { out.push({ t: start, end: t, mosi: a, miso: b }); n = 0; a = b = 0; }
    }
  }
  return out;
}

// Asynchronous receiver that decodes frames from a set of source lines.
// `sources()` returns the lines electrically connected to its input.
export class UartReceiver {
  constructor(signals, scheduler, { sources, config, onFrame, onIdle }) {
    this.signals = signals; this.scheduler = scheduler; this.sources = sources; this.config = config; this.onFrame = onFrame; this.onIdle = onIdle;
    this.scanFrom = 0; this.pending = null; this.enabled = true; this.idleEvent = null;
    signals.receivers.add(this);
  }
  dispose() { this.signals.receivers.delete(this); this.pending?.cancel(); this.idleEvent?.cancel(); }
  level(lines, t) { for (const l of lines) if (!l.levelAt(t)) return 0; return 1; }
  start(fromUs) { this.scanFrom = Math.max(this.scanFrom, fromUs); this.scan(); }
  poke(line) { if (!this.enabled || this.pending) return; const lines = this.sources(); if (lines.includes(line)) this.scan(lines); }
  scan(lines = this.sources()) {
    if (!this.enabled || this.pending || !lines.length) return;
    const cfg = this.config(); if (!cfg) return;
    let t = this.scanFrom, edge = null;
    for (let guard = 0; guard < 10000; guard++) {
      let next = null;
      for (const l of lines) { const e = l.nextEdgeAfter(t); if (e && (!next || e[0] < next)) next = e[0]; }
      if (next == null) break;
      if (this.level(lines, next) === 0 && this.level(lines, next - 1e-6) === 1) { edge = next; break; }
      t = next;
    }
    if (edge == null) { this.scanFrom = Math.max(this.scanFrom, t); return; }
    const bit = 1e6 / cfg.baud, n = cfg.dataBits, decodeAt = edge + (n + 1 + 9 / 16) * bit + 1e-3;
    this.pending = this.scheduler.atUs(decodeAt, () => {
      this.pending = null;
      const lines2 = this.sources(), c = this.config();
      if (!c) return;
      const f = sampleUartFrame(x => this.level(lines2, x), edge, c);
      this.scanFrom = f.end;
      if (!f.falseStart) {
        this.onFrame(f, edge);
        this.idleEvent?.cancel();
        if (this.onIdle) this.idleEvent = this.scheduler.atUs(f.stopEnd + (n + 2) * bit, () => { this.idleEvent = null; let busy = false; for (const l of this.sources()) { const e = l.nextEdgeAfter(f.end); if (e && e[0] < f.stopEnd + (n + 2) * bit) busy = true; } if (!busy) this.onIdle(); });
      }
      this.scan();
    });
  }
}
