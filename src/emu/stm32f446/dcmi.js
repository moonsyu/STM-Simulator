import { Peripheral, bit, field } from './core.js';
import { IRQ } from './tables.js';

// OV2640/OV7670-like parallel camera: generates RGB565 frames (moving color
// bars, or an RGBA image supplied by the UI) for the DCMI.
export class Camera {
  constructor({ width = 160, height = 120, fps = 30, pattern = 'bars' } = {}) {
    this.width = width; this.height = height; this.fps = fps; this.pattern = pattern; this.frame = 0; this.image = null;
  }
  setImage(rgba, width, height) { this.image = rgba ? { rgba, width, height } : null; }
  rgb565(r, g, b) { return ((r & 0xf8) << 8) | ((g & 0xfc) << 3) | (b >> 3); }
  pixel(x, y) {
    if (this.image) {
      const { rgba, width, height } = this.image, sx = Math.floor(x * width / this.width), sy = Math.floor(y * height / this.height), i = (sy * width + sx) * 4;
      return this.rgb565(rgba[i], rgba[i + 1], rgba[i + 2]);
    }
    const bars = [[255, 255, 255], [255, 255, 0], [0, 255, 255], [0, 255, 0], [255, 0, 255], [255, 0, 0], [0, 0, 255], [0, 0, 0]];
    const shift = (this.frame * 4) % this.width;
    const [r, g, b] = bars[Math.floor(((x + shift) % this.width) * 8 / this.width)];
    const shade = y * 255 / Math.max(1, this.height - 1);
    return this.rgb565(Math.min(255, r * 0.75 + shade * 0.25), Math.min(255, g * 0.75 + shade * 0.25), Math.min(255, b * 0.75 + shade * 0.25));
  }
  // One line as bytes in sensor output order (RGB565, high byte first).
  line(y) {
    const out = new Uint8Array(this.width * 2);
    for (let x = 0; x < this.width; x++) { const p = this.pixel(x, y); out[x * 2] = p >> 8; out[x * 2 + 1] = p & 0xff; }
    return out;
  }
}

// DCMI (RM0390 section 15): 8-bit embedded / hardware sync capture, snapshot
// or continuous, crop window, frame rate control, FIFO → DMA (DMA2 S1/S7 ch1).
const CR = 0x00, SR = 0x04, RIS = 0x08, IER = 0x0c, MIS = 0x10, ICR = 0x14, CWSTRT = 0x20, CWSIZE = 0x24, DR = 0x28;

export class Dcmi extends Peripheral {
  constructor(soc) { super(soc, 'DCMI'); this.reset(); }
  reset() {
    super.reset();
    this.events?.forEach(e => e.cancel()); this.events = [];
    this.fifo = []; this.frameIndex = 0; this.lastFrame = null; this.captured = null; this.capturing = false; this.stats = { frames: 0, lines: 0, overruns: 0 };
  }
  readReg(off) {
    if (off === DR) { const v = this.fifo.shift() ?? 0; if (!this.fifo.length) { this.clearBits(SR, 4); this.soc.dmaLine('DCMI', false); } return v; }
    if (off === MIS) return this.get(RIS) & this.get(IER);
    return this.get(off);
  }
  writeReg(off, value, mask) {
    const old = this.get(off), v = this.merge(off, value, mask);
    if (off === ICR) { this.set(RIS, this.get(RIS) & ~(v & 0x1f)); this.updateIrq(); return; }
    if (off === RIS || off === MIS || off === SR) return;
    this.set(off, v);
    if (off === CR) {
      if (!bit(v, 14)) { this.stop(); return; }
      if (bit(v, 0) && !bit(old, 0) || (bit(v, 14) && !bit(old, 14) && bit(v, 0))) this.startCapture();
      if (!bit(v, 0) && bit(old, 0) && !bit(v, 1)) this.stopAfterFrame = true;
    }
    if (off === IER) this.updateIrq();
  }
  stop() { this.events.forEach(e => e.cancel()); this.events = []; this.capturing = false; this.fifo = []; this.clearBits(SR, 4); this.soc.dmaLine('DCMI', false); }
  startCapture() {
    if (this.capturing) return;
    const camera = this.soc.camera();
    if (!camera) return; // no powered sensor: VSYNC never comes
    this.capturing = true; this.stopAfterFrame = false;
    const frameUs = 1e6 / camera.fps;
    // Next frame starts at the next VSYNC.
    const next = Math.ceil(this.soc.nowUs() / frameUs + 1e-9) * frameUs;
    this.events.push(this.soc.atUs(next, () => this.frameStart(camera, frameUs)));
  }
  frameStart(camera, frameUs) {
    if (!this.capturing || !bit(this.get(CR), 14)) return;
    const fcrc = field(this.get(CR), 8, 2), skip = [1, 2, 4, 1][fcrc];
    const use = this.frameIndex++ % skip === 0;
    camera.frame++;
    this.setBits(RIS, 1 << 3); // VSYNC
    this.updateIrq();
    const lineUs = frameUs * 0.8 / camera.height, crop = bit(this.get(CR), 2);
    const cw = this.get(CWSTRT), cs = this.get(CWSIZE);
    const vst = field(cw, 16, 13), hoff = field(cw, 0, 14), vlines = field(cs, 16, 14) + 1, cap = field(cs, 0, 14) + 1;
    if (use) this.captured = { width: camera.width, height: 0, bytes: [], frame: camera.frame };
    const lines = [];
    for (let y = 0; y < camera.height; y++) if (!crop || (y >= vst && y < vst + vlines)) lines.push(y);
    lines.forEach((y, i) => this.events.push(this.soc.atUs(this.soc.nowUs() + (i + 1) * lineUs, () => {
      if (!this.capturing || !use) return;
      let data = camera.line(y);
      if (crop) data = data.slice(hoff, hoff + cap);
      this.pushLine(data);
      this.setBits(RIS, 1 << 4); this.stats.lines++;
      this.updateIrq();
      if (i === lines.length - 1) this.frameEnd(camera, frameUs);
    })));
    if (!use) this.events.push(this.soc.atUs(this.soc.nowUs() + frameUs, () => this.frameStart(camera, frameUs)));
  }
  pushLine(bytes) {
    if (this.fifo.length > 4096) { this.setBits(RIS, 2); this.stats.overruns++; this.fifo = []; }
    // Bytes are packed little-endian into 32-bit words (first byte in bits 7:0).
    for (let i = 0; i + 3 < bytes.length; i += 4) this.fifo.push((bytes[i] | (bytes[i + 1] << 8) | (bytes[i + 2] << 16) | (bytes[i + 3] << 24)) >>> 0);
    if (this.captured) { this.captured.bytes.push(bytes); this.captured.height++; this.captured.width = bytes.length / 2; }
    this.setBits(SR, 4);
    if (bit(this.get(CR), 0)) this.soc.dmaLine('DCMI', true);
  }
  frameEnd(camera, frameUs) {
    this.soc.serviceDma(); // the FIFO is drained before the frame-end flag is raised
    this.stats.frames++;
    this.setBits(RIS, 1);
    if (this.captured) {
      const total = this.captured.bytes.reduce((n, b) => n + b.length, 0), data = new Uint8Array(total);
      let o = 0; for (const b of this.captured.bytes) { data.set(b, o); o += b.length; }
      this.lastFrame = { width: this.captured.width, height: this.captured.height, format: 'rgb565', frame: this.captured.frame, data, us: this.soc.nowUs() };
      this.captured = null;
    }
    this.updateIrq();
    if (bit(this.get(CR), 1) || this.stopAfterFrame) { this.clearBits(CR, 1); this.capturing = false; return; } // snapshot
    this.events = this.events.filter(e => !e.cancelled);
    this.events.push(this.soc.atUs(this.soc.nowUs() + frameUs * 0.2, () => this.frameStart(camera, frameUs)));
  }
  updateIrq() { this.soc.irqNumber(IRQ.DCMI, 'DCMI', !!(this.get(RIS) & this.get(IER) & 0x1f)); }
}

// RGB565 big-endian frame bytes → RGBA (for UI preview / tests).
export function frameToRgba(frame) {
  const out = new Uint8ClampedArray(frame.width * frame.height * 4);
  for (let i = 0; i < frame.width * frame.height; i++) {
    const p = (frame.data[i * 2] << 8) | frame.data[i * 2 + 1];
    out[i * 4] = (p >> 11) * 255 / 31; out[i * 4 + 1] = ((p >> 5) & 63) * 255 / 63; out[i * 4 + 2] = (p & 31) * 255 / 31; out[i * 4 + 3] = 255;
  }
  return out;
}
