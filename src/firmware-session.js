import { CatalogSingleWire } from './catalog-singlewire.js';
import { CatalogMotion } from './catalog-motion.js';
import { physicalToModel, physicalResult } from './catalog-model.js';
import { MotionDevices } from './device-motion.js';
import { PassiveBuzzers } from './passive-buzzer.js';
import { CircuitSimulation } from './engine.js';
import { UltrasonicSignals } from './sensors.js';
import { LCDController } from './lcd.js';
import { BusDevices } from './buses.js';
import { WaveRecorder } from './trace.js';
import { I2C_DEVICES, SPI_DEVICES } from './device-defs.js';
import { familyProfile } from './mcu-family.js';
import { Machine } from './emu/machine.js';
import { Stm32f446 } from './emu/stm32f446/soc.js';
import { Stm32f103 } from './emu/stm32f103/soc.js';
import { UartReceiver, Line } from './emu/stm32f446/signals.js';
import { Camera, frameToRgba } from './emu/stm32f446/dcmi.js';
import { SdCard } from './emu/stm32f446/sdcard.js';
import { openImage, listFiles, readFile as readCardFile, SD_DEFAULT_MB } from './sdcard.js';

// Runs a compiled ARM ELF on the emulated NUCLEO-F446RE / NUCLEO-F103RB (by the project's MCU family) and connects its pins
// to the same circuit engine and device models used by SimulationSession.
// Drop-in for SimulationSession from app.js's point of view.
const STATIC_TYPES = new Set(['resistor', 'led', 'button', 'potentiometer', 'rgb', 'sevenseg', 'diode', 'ldr', 'ntc', 'slide', 'i2c', 'spi', 'uart', 'lcd', 'sht31', 'mpu6050', 'oled', 'tft', 'matrix', 'joystick', 'relay', 'temperature', 'buzzer', 'pir', 'catalog_i2c', 'catalog_spi', 'catalog_analog', 'catalog_switch', 'breadboard', 'catalog_can', 'catalog_i2s']);
const WALL_BUDGET_MS = 28;
const VECTOR_TABLE_BYTES = { STM32F446RE: 452, STM32F103RB: 268 }, BOARD_OF = { STM32F446RE: 'NUCLEO-F446RE', STM32F103RB: 'NUCLEO-F103RB' };
const basename = f => String(f || '').split(/[\\/]/).pop();
const hex = v => '0x' + (v >>> 0).toString(16).toUpperCase().padStart(8, '0');
const reverse8 = b => { let r = 0; for (let i = 0; i < 8; i++) r |= ((b >> i) & 1) << (7 - i); return r; };

export class FirmwareSession {
  constructor(project, { elf, print = () => {}, trace = () => {}, uart = () => {}, channels, debug, sdImage, camera, noise, clock } = {}) {
    if (!elf) throw new Error('펌웨어 ELF가 필요합니다. ARM GCC로 먼저 빌드하세요.');
    project = physicalToModel(project);
    this.project = project; this.print = print; this.traceCb = trace; this.uartCb = uart;
    this.pressed = {}; this.result = null; this.time = 0; this.integrated = -1; this.stepMs = project.simulation?.stepMs ?? 1;
    this.circuit = new CircuitSimulation(); this.motion = new MotionDevices(); this.catalogMotion = new CatalogMotion(); this.singleWire = new CatalogSingleWire();
    this.sensors = new UltrasonicSignals(); this.lcds = new Map(); this.passiveBuzzers = new PassiveBuzzers(); this.wave = new WaveRecorder(channels);
    this.serial = []; this.gpio = {}; this.dirty = true; this.solves = 0; this.solveBudget = 4000; this.realtimeRatio = 1; this.resets = [];
    this.buses = new BusDevices(project, () => this.result, trace);
    this.buses.uart.baud = 115200; this.buses.clocks = new Map();
    this.dynamic = project.components.some(p => !STATIC_TYPES.has(p.type)) || project.components.some(p => p.type === 'catalog_singlewire');
    // The SD module's card is the same FAT image the interpreter uses (part.cardImage), so files persist in the project.
    const sdPart = project.components.find(p => p.catalogVariant === 'sd-storage-board');
    this.sdPart = sdPart; this.sdDisk = !sdImage && sdPart ? openImage(sdPart.cardImage || '', sdPart.sizeMB || SD_DEFAULT_MB) : null;
    this.sdcard = sdImage ? new SdCard(sdImage) : this.sdDisk ? new SdCard(this.sdDisk) : null;
    this.cameraModel = camera ? (camera instanceof Camera ? camera : new Camera(camera === true ? {} : camera)) : null;
    this.itmLine = '';
    this.pwmMap = new Map(); this.pwmFrequency = new Map(); this.eventCount = 0;
    this.machine = new Machine({ swv: true });
    this.pins = familyProfile(project.mcu?.family).gpioPins;
    const Soc = project.mcu?.family === 'STM32F103RB' ? Stm32f103 : Stm32f446;
    this.soc = new Soc(this.machine, this.env(), { pwmWaveform: project.simulation?.pwmWaveform ?? false, noise: noise ?? project.simulation?.noise, ...(clock || {}) });
    this.signals = this.signalsApi();
    this.machine.onItm = (port, byte) => this.itm(port, byte);
    this.elf = this.machine.loadElf(elf instanceof Uint8Array ? elf : new Uint8Array(elf));
    // The vector table size tells the STM32 startup file the ELF was linked with; an ELF for the other board would
    // fault at the first peripheral access with no hint, so say which board it is for.
    const vectors = this.elf.sectionByName?.('.isr_vector')?.size, family = project.mcu?.family ?? 'STM32F446RE';
    const owner = Object.entries(VECTOR_TABLE_BYTES).find(([, size]) => size === vectors)?.[0];
    if (owner && owner !== family) throw new Error(`이 ELF는 ${BOARD_OF[owner]}(${owner})용입니다. 프로젝트 보드를 ${BOARD_OF[owner]}로 바꾸거나 ${BOARD_OF[family] ?? family}용으로 빌드한 ELF를 여세요.`);
    this.receivers = this.listeners();
    this.runtime = this.createRuntime(debug);
  }
  // ------------------------------------------------------------ environment for the SoC
  env() {
    return {
      pinState: (pin, state) => this.pinChanged(pin, state),
      digitalIn: pin => this.digitalIn(pin),
      analogIn: pin => { this.solveIfDirty(); const v = this.result?.voltage('signal:' + pin); return v == null ? null : v; },
      beforeInputRead: () => this.solveIfDirty(),
      lineSources: pin => this.lineSources(pin),
      uartEvent: e => { this.uartCb(e); if (e.direction === 'TX' && e.instance === 'USART2') this.buses.uart.baud = Math.round(this.soc?.usarts.USART2.baud() || 115200); },
      i2cBus: (name, pins) => this.i2cBus(name, pins),
      spiTransfer: (name, pins, byte, cfg) => this.spiTransfer(name, pins, byte, cfg),
      usartSync: (name, pins, byte) => reverse8(this.spiTransfer(name, { sck: pins.ck, mosi: pins.tx, miso: pins.rx }, reverse8(byte), { cpol: pins.cpol, cpha: pins.cpha })),
      camera: () => this.camera(),
      sdCard: () => this.sdcard,
      i2sSamples: (name, samples, rate) => this.i2sSamples(name, samples, rate),
      chipSelect: () => null,
      onReset: reason => { this.resets.push({ reason, us: this.soc?.nowUs() ?? 0 }); this.traceCb({ micros: this.soc?.nowUs() ?? 0, protocol: 'RESET', message: `MCU 리셋 · ${reason}` }); },
      clockChanged: () => this.updateMco(),
      routingChanged: () => this.updateMco(),
    };
  }
  get now() { return this.soc ? this.soc.nowUs() : 0; }
  // ------------------------------------------------------------ circuit
  pinChanged(pin, state) {
    const old = this.gpio[pin];
    this.gpio[pin] = state;
    if (state.pwm) { this.pwmMap.set(pin, state.pwm); this.pwmFrequency.set(pin, state.pwm.frequency); } else { this.pwmMap.delete(pin); this.pwmFrequency.delete(pin); }
    if (!this.soc || !this.pins.includes(pin)) return;
    if (old && old.mode === state.mode && old.value === state.value && old.openDrain === state.openDrain && old.pull === state.pull) return;
    if (pin === 'PA8') this.updateMco();
    if (!this.connected || this.connected.has(pin) || this.wave.channels.includes(pin)) {
      this.dirty = true;
      if (this.solves < this.solveBudget) this.changed(this.now);
    }
  }
  updateMco() {
    if (!this.soc) return;
    const routed = this.soc.routedPins('MCO1').includes('PA8') && this.soc.rcc.mcoHz;
    if (routed) this.buses.clocks.set('PA8', this.soc.rcc.mcoHz); else this.buses.clocks.delete('PA8');
  }
  digitalIn(pin) {
    const g = this.gpio[pin];
    if (this.connected && !this.connected.has(pin) && g?.mode === 'OUTPUT' && !(g.openDrain && g.value > 0)) return g.value > 1.65 ? 1 : 0;
    this.solveIfDirty();
    const v = this.result?.voltage('signal:' + pin);
    return v == null ? null : v >= 1.65 ? 1 : 0;
  }
  solveIfDirty() { if (this.dirty && this.soc && !this.solving) this.changed(this.now); }
  computeConnected() {
    const r = this.result; if (!r?.uf?.parent) { this.connected = null; return; }
    const roots = new Set(), count = new Map();
    for (const key of r.uf.parent.keys()) if (key.startsWith('part:')) roots.add(r.uf.find(key));
    for (const s of ['3V3', '5V', 'GND']) roots.add(r.uf.find('signal:' + s));
    for (const p of this.pins) { const root = r.uf.find('signal:' + p); count.set(root, (count.get(root) || 0) + 1); }
    this.connected = new Set(this.pins.filter(p => { const root = r.uf.find('signal:' + p); return roots.has(root) || count.get(root) > 1 || p === 'PC13'; }));
  }
  enrich(micros) {
    this.singleWire.update(this.project, this.result, micros, this.runtime);
    this.passiveBuzzers.update(this.project, this.result, micros);
    if (!this.result || this.result.fault) return;
    this.sensors.update(this.project, this.result, micros);
    for (const p of this.project.components.filter(p => p.type === 'lcd')) { if (!this.lcds.has(p.id)) this.lcds.set(p.id, new LCDController()); const lcd = this.lcds.get(p.id).update(p, this.result, micros); this.result.parts[p.id] = { ...this.result.parts[p.id], lcd }; }
    this.motion.update(this.project, this.result, micros, this.runtime, us => this.changed(us));
    this.buses.update(this.result); this.catalogMotion.update(this.project, this.result, micros, this.runtime); this.wave.record(micros, this.result);
    for (const p of this.project.components) if (p.type === 'catalog_singlewire' && p.catalogState) this.singleWireDrive(p);
  }
  singleWireDrive() { /* catalog single-wire devices pull the line through catalogState; the engine reads it */ }
  solve(next) {
    this.solves++;
    return this.circuit.solve(this.project, this.gpio, this.pressed, next, this.sensors.echoHigh(next * 1000), this.motion.signals);
  }
  advance(micros) {
    const target = micros / 1000; if (target < this.integrated) return;
    if (this.integrated < 0) { this.result = this.solve(0); this.integrated = 0; this.computeConnected(); this.enrich(0); }
    let count = 0;
    while (target - this.integrated > 1e-8) {
      if (++count > 20000) throw new Error('회로 시간 간격이 너무 큽니다.');
      const next = Math.min(target, this.integrated + this.stepMs);
      this.result = this.solve(next); this.integrated = next; this.enrich(next * 1000);
      if (this.result.fault) throw new Error(this.result.warnings[0] || '회로 해석 오류');
    }
    this.time = Math.max(this.time, target);
  }
  changed(micros = this.now) {
    if (this.solving) { this.dirty = true; return this.result; }
    this.solving = true;
    try {
      this.advance(micros);
      this.solves++;
      this.result = this.circuit.hold(this.project, this.gpio, this.pressed, this.sensors.echoHigh(micros), this.motion.signals);
      this.dirty = false;
      this.enrich(micros);
      if (this.result.fault) throw new Error(this.result.warnings[0] || '회로 해석 오류');
    } finally { this.solving = false; }
    this.soc?.inputsUpdated();
    return this.result;
  }
  get viewResult() { return physicalResult(this.result, this.project); }
  // UI helpers for the SD card (same shape as the interpreter's session.storage).
  get storage() {
    if (!this.sdDisk) return null;
    const self = this, image = () => self.sdDisk.encode();
    return {
      cards: () => [{ partId: self.sdPart.id, name: self.sdPart.name, sizeMB: self.sdDisk.sizeMB, dirty: !!self.sdcard.dirty }],
      image: () => image(), files: () => listFiles(image()), readFile: (_id, path) => readCardFile(image(), path),
      applyTo: project => { const target = project.components.find(q => q.id === self.sdPart.id); if (target && self.sdcard.dirty) target.cardImage = image(); return project; }
    };
  }
  // Latest camera frame for UI previews.
  cameraFrame() { const f = this.lastFrame; if (!f) return null; const rgba = this.frameRgba(); return rgba ? { width: f.width, height: f.height, format: f.format, rgba } : null; }
  // ------------------------------------------------------------ serial lines
  lineSources(pin) {
    const r = this.result, out = [];
    const root = r?.uf ? r.uf.find('signal:' + pin) : null;
    for (const [name, line] of this.soc.signals.lines) {
      if (line.protocol !== 'uart' || name === pin) continue;
      let endpoint = null;
      if (/^P[A-H]\d+$/.test(name)) endpoint = 'signal:' + name;
      else if (name.startsWith('uart:')) endpoint = `part:${name.slice(5)}:p3`;
      else if (name === 'vcp') { if (pin === 'PA3') out.push(line); continue; }
      if (endpoint && root && r.uf.find(endpoint) === root) out.push(line);
    }
    return out;
  }
  listeners() {
    const list = [];
    const sig = this.soc.signals;
    // ST-LINK VCP receives PA2 at the USART2 configuration.
    list.push(new UartReceiver(sig, this.soc, {
      sources: () => { const l = sig.lines.get('PA2'); return l ? [l] : []; },
      config: () => { const u = this.soc.usarts.USART2, b = u.baud(); return b && u.txEnabled() ? { baud: b, dataBits: u.frameBits(), parity: u.parity(), stopBits: u.stopBits() } : null; },
      onFrame: f => { const v = f.value & 0xff; this.buses.vcpOutput = ((this.buses.vcpOutput || '') + String.fromCharCode(v)).slice(-512); this.buses.uart.baud = Math.round(this.soc.usarts.USART2.baud()); this.buses.uart.ready = true; this.buses.uart.instance = 'USART2'; },
    }));
    for (const p of this.project.components.filter(p => p.type === 'uart')) {
      list.push(new UartReceiver(sig, this.soc, {
        sources: () => { const r = this.result; if (!r?.uf || !this.buses.powered(p)) return []; const root = r.uf.find(`part:${p.id}:p4`), out = []; for (const [name, line] of sig.lines) if (line.protocol === 'uart' && /^P[A-H]\d+$/.test(name) && r.uf.find('signal:' + name) === root) out.push(line); return out; },
        config: () => ({ baud: p.baud, dataBits: 8, parity: 'none', stopBits: 1 }),
        onFrame: f => { if (!f.framingError) this.buses.received.set(p.id, ((this.buses.received.get(p.id) || '') + String.fromCharCode(f.value & 0xff)).slice(-512)); },
      }));
    }
    return list;
  }
  inject(text, target = 'Serial1') {
    const bytes = [...String(text)].slice(0, 256).map(c => c.charCodeAt(0) & 255);
    if (!bytes.length) return 0;
    const external = target.endsWith(':external'), id = external ? target.slice(0, -9) : target === 'Serial1' || target === 'Serial' ? 'USART2' : target;
    const usart = this.soc.usarts[id]; if (!usart) return 0;
    const sig = this.soc.signals, t0 = this.now;
    if (!external && id === 'USART2') {
      if (!usart.rxEnabled() || !usart.baud()) return 0;
      const line = sig.line('vcp'); line.protocol = 'uart';
      sig.channel('VCP_TX', 'ST-LINK VCP → USART2 RX', 'uart', [{ id: 'vcp', label: 'VCP TX → PA3', role: 'tx' }]);
      let t = Math.max(t0, line.end); const cfg = { baud: usart.baud(), dataBits: usart.frameBits(), stopBits: usart.stopBits(), parity: usart.parity() };
      for (const b of bytes) t = sig.uartFrame(line, t, this.parityFrame(b, cfg), cfg);
      return bytes.length;
    }
    const rx = usart.rxPins()[0]; if (!rx) return 0;
    const r = this.result, parts = this.project.components.filter(p => p.type === 'uart' && this.buses.powered(p) && r?.uf && r.uf.find(`part:${p.id}:p3`) === r.uf.find('signal:' + rx));
    if (!parts.length) return 0;
    for (const p of parts) {
      const line = sig.line('uart:' + p.id); line.protocol = 'uart';
      sig.channel('uart:' + p.id, `${p.name} TX`, 'uart', [{ id: 'uart:' + p.id, label: `${p.name} TX → ${rx}`, role: 'tx' }]);
      let t = Math.max(t0, line.end);
      for (const b of bytes) t = sig.uartFrame(line, t, b, { baud: p.baud, dataBits: 8, stopBits: 1 });
    }
    return bytes.length;
  }
  parityFrame(b, cfg) {
    if (cfg.parity === 'none') return b;
    const n = cfg.dataBits - 1, payload = b & ((1 << n) - 1); let ones = 0; for (let i = 0; i < n; i++) ones += (payload >> i) & 1;
    return payload | (((cfg.parity === 'even' ? ones & 1 : (ones & 1) ^ 1)) << n);
  }
  // ------------------------------------------------------------ I²C / SPI adapters
  i2cBus(name, pins) {
    const session = this, buses = this.buses;
    if (!pins.sda || !pins.scl) return null;
    let part = null, writing = [], reader = null, addr = 0;
    const report = (msg) => this.traceCb({ micros: this.now, protocol: 'I²C', message: `${name} · ${msg}` });
    const commit = () => {
      if (!part || !writing.length) { writing = []; return; }
      const bytes = writing; writing = [];
      let ok = true;
      try {
        if (part.type === 'i2c') { const m = buses.memory(part); m.address = bytes[0]; for (const v of bytes.slice(1)) { m.data[m.address] = v; m.address = (m.address + 1) & 255; } }
        else ok = buses.devices.writeI2c(part, bytes, session.now, session.result) !== false;
      } catch (e) { ok = false; report(e.message); }
      report(`0x${addr.toString(16)} WRITE ${bytes.length} B · ${ok ? 'ACK' : 'NACK'}`);
    };
    return {
      address(a, read) {
        commit(); session.solveIfDirty();
        const r = session.result; addr = a; reader = null;
        const sda = r?.voltage('signal:' + pins.sda), scl = r?.voltage('signal:' + pins.scl);
        const candidates = session.project.components.filter(p => ['i2c', ...I2C_DEVICES].includes(p.type) && p.address === a && buses.powered(p) && buses.same(buses.terminal(p, 3), buses.pin(pins.sda)) && buses.same(buses.terminal(p, 4), buses.pin(pins.scl)));
        part = candidates.length === 1 && sda > 2 && scl > 2 ? candidates[0] : null;
        if (!part) { report(`0x${a.toString(16)} ${read ? 'READ' : 'WRITE'} · NACK`); return false; }
        if (!read) return true;
        if (part.type === 'i2c') { const m = buses.memory(part); reader = () => { const v = m.data[m.address]; m.address = (m.address + 1) & 255; return v; }; }
        else if (part.type === 'sht31') { const bytes = buses.devices.readI2c(part, 6, session.now); if (!bytes) { report(`0x${a.toString(16)} READ · NACK (측정 중)`); return false; } let i = 0; reader = () => bytes[i++ % 6]; }
        else if (part.catalogVariant === 'ads1115-10') { const bytes = buses.devices.readI2c(part, 2, session.now); if (!bytes) return false; let i = 0; reader = () => bytes[i++ % 2]; }
        else reader = () => (buses.devices.readI2c(part, 1, session.now) ?? [0xff])[0];
        report(`0x${a.toString(16)} READ · ACK`);
        return true;
      },
      write(byte) { if (!part) return false; writing.push(byte & 0xff); return true; },
      read() { return reader ? reader() & 0xff : 0xff; },
      nack() {},
      restart() { commit(); },
      stop() { commit(); part = null; reader = null; },
    };
  }
  spiTransfer(name, pins, byte, cfg = {}) {
    const buses = this.buses;
    if (!pins.sck || !pins.mosi) return 0xff;
    this.solveIfDirty();
    const r = this.result;
    // SPI SD module backed by the session's card image.
    if (this.sdcard) for (const p of this.project.components.filter(p => p.catalogVariant === 'sd-storage-board')) {
      if (!buses.powered(p) && !buses.same(buses.terminal(p, 1), 'signal:3V3')) continue;
      const cs = r?.voltage(buses.terminal(p, 3));
      if (buses.same(buses.terminal(p, 4), buses.pin(pins.sck)) && buses.same(buses.terminal(p, 5), buses.pin(pins.mosi))) {
        if (cs != null && cs < .8) { this.sdSelected = true; return this.sdcard.spiByte(byte); }
        if (this.sdSelected) { this.sdcard.deselect(); this.sdSelected = false; }
      }
    }
    buses.spi = { mosi: pins.mosi, miso: pins.miso || pins.mosi, sck: pins.sck, clock: Math.round(cfg.hz || 1e6), ready: true };
    const fake = { microTime: this.now, pin: p => p, api: {} };
    try { return buses.call('SPI.transfer', [byte], fake) & 0xff; }
    catch (e) { this.traceCb({ micros: this.now, protocol: 'SPI', message: `${name} · ${e.message}` }); return 0xff; }
  }
  camera() {
    const part = this.project.components.find(p => p.catalogVariant === 'ov2640-camera');
    if (part) { if (!this.buses.powered(part)) return null; return this.cameraModel ??= new Camera(); }
    return this.cameraModel;
  }
  get lastFrame() { return this.soc.dcmi.lastFrame; }
  frameRgba() { return this.lastFrame ? frameToRgba(this.lastFrame) : null; }
  i2sSamples(name, raw, rate) {
    const p = this.project.components.find(p => p.type === 'catalog_i2s' && this.buses.powered(p)); if (!p) return;
    const signed = n => (n & 0x8000 ? n - 65536 : n), samples = [];
    for (let i = 0; i + 1 < raw.length; i += 2) samples.push(Math.round((signed(raw[i]) + signed(raw[i + 1])) / 2));
    const crossings = samples.reduce((n, v, i) => n + (i > 0 && Math.sign(v) !== Math.sign(samples[i - 1]) ? 1 : 0), 0);
    Object.assign(p.catalogState, { samples, rate, frames: (p.catalogState.frames || 0) + samples.length, at: this.now, until: this.now + samples.length / rate * 1e6, frequency: rate * crossings / 2 / samples.length, rms: Math.sqrt(samples.reduce((s, n) => s + n * n, 0) / samples.length) / 32768 });
  }
  // ------------------------------------------------------------ SWV ITM printf
  itm(port, byte) {
    if (port !== 0) return;
    if (byte === 10) { this.print(this.itmLine.replace(/\r$/, '')); this.itmLine = ''; return; }
    this.itmLine += String.fromCharCode(byte);
    if (this.itmLine.length >= 512) { this.print(this.itmLine); this.itmLine = ''; }
  }
  // ------------------------------------------------------------ execution
  tick(timeMs) {
    const rt = this.runtime, targetUs = timeMs * 1000, wallStart = performanceNow();
    this.syncBreakpoints();
    if (rt.debug.paused) return this.viewResult ?? physicalResult(this.changed(this.now), this.project);
    if (this.integrated < 0) this.changed(0);
    this.solves = 0;
    if (this.pendingStep) { this.debugStep(this.pendingStep); this.pendingStep = null; return this.finishTick(); }
    if (rt.debug.enabled && rt.debug.mode === 'into' && !this.started) { this.debugStep('entry'); return this.finishTick(); }
    this.started = true;
    if (rt.debug.enabled && rt.debug.mode === 'into') { this.debugStep('into'); return this.finishTick(); }
    const startUs = this.now;
    while (this.now < targetUs - 1e-6 && !rt.debug.paused && !rt.finished) {
      const hz = this.soc.clock.hclk, chunkUs = Math.min(targetUs - this.now, this.dynamic ? this.stepMs * 1000 : 5000);
      const cycles = Math.max(1, Math.ceil(chunkUs * hz / 1e6));
      const res = this.machine.run(cycles);
      this.afterRun(res);
      if (this.dynamic) this.advance(this.now);
      if (this.dirty) this.changed(this.now);
      if (performanceNow() - wallStart > WALL_BUDGET_MS) break;
    }
    const wall = performanceNow() - wallStart;
    if (wall > 0) this.realtimeRatio = Math.min(1e3, (this.now - startUs) / 1000 / Math.max(wall, 20));
    return this.finishTick();
  }
  finishTick() { return physicalResult(this.changed(this.now), this.project); }
  afterRun(res) {
    const rt = this.runtime, cpu = this.machine.cpu;
    if (res.reason === 'breakpoint' || res.reason === 'bkpt') { if (this.entryBreak !== undefined && ((res.pc ?? this.machine.cpu.pc) & ~1) === this.entryBreak) { this.machine.breakpoints.delete(this.entryBreak); this.entryBreak = undefined; } this.pause(); return; }
    if (res.reason === 'exit') { rt.finished = true; return; }
    if (res.reason === 'lockup') throw new Error('펌웨어가 멈췄습니다: ' + (this.machine.describeFault() || '코어 lockup'));
    if (cpu.lastFault && cpu.lastFault !== this.reportedFault && cpu.ipsr === 3) {
      this.reportedFault = cpu.lastFault;
      const message = this.machine.describeFault() || 'HardFault';
      this.fault = message;
      throw new Error('HardFault 발생: ' + message);
    }
  }
  pause() { const rt = this.runtime; rt.debug.paused = true; rt.debug.enabled = true; this.updateLocation(); }
  debugStep(mode) {
    const m = this.machine;
    let res;
    if (mode === 'entry') {
      const main = this.elf.findSymbol('main');
      this.started = true;
      // Run to main through the normal tick loop (chunked) so start-up code never blocks the UI.
      if (main) { const addr = (main.value & ~1) >>> 0; if (!m.breakpoints.has(addr)) { m.breakpoints.add(addr); this.entryBreak = addr; } const rt = this.runtime; rt.debug.paused = false; rt.debug.mode = 'continue'; return; }
    } else if (mode === 'over') res = m.stepOver({ maxCycles: 40e6 });
    else if (mode === 'out') res = m.stepOut({ maxCycles: 40e6 });
    else res = m.stepLine({ maxCycles: 40e6 });
    // A step that doesn't finish quickly (e.g. over a busy-wait) keeps running instead of freezing the UI.
    if (res?.reason === 'cycles') { this.print('\n[디버그] 한 줄 실행이 길어져 계속 실행합니다. 일시정지(F6)로 멈출 수 있습니다.\n'); const rt = this.runtime; rt.debug.paused = false; rt.debug.mode = 'continue'; return; }
    if (res && !['step', 'breakpoint', 'bkpt', 'cycles'].includes(res.reason)) this.afterRun(res);
    this.runtime.debug.mode = 'continue';
    this.pause();
  }
  syncBreakpoints() {
    const set = this.runtime.debug.breakpoints, keys = [...(set || [])].map(b => typeof b === 'string' ? b : `${b.file}:${b.line}`), sig = keys.join('|');
    if (sig === this.bpSignature) return;
    this.bpSignature = sig;
    for (const a of this.bpAddrs || []) this.machine.breakpoints.delete(a);
    this.bpAddrs = [];
    const lt = this.elf.lineTable;
    for (const key of keys) {
      const i = key.lastIndexOf(':'), file = key.slice(0, i), line = Number(key.slice(i + 1));
      const hit = lt.resolveBreakpoint(file, line, 20);
      if (hit) for (const a of hit.addrs.slice(0, 1)) { this.machine.breakpoints.add(a); this.bpAddrs.push(a); }
    }
  }
  updateLocation() {
    const rt = this.runtime, pc = this.machine.pc, line = this.elf.lineTable.addrToLine(pc);
    rt.location = line ? { file: basename(line.file), line: line.line } : null;
    rt.frames = this.callStack();
    rt.depth = rt.frames.length;
  }
  // Frame-pointer-less unwinding: current function, LR, then return addresses found on the stack.
  callStack() {
    const m = this.machine, elf = this.elf, lt = elf.lineTable, frames = [];
    const push = (pc) => { const f = elf.functionAt(pc), l = lt.addrToLine(pc); if (!f) return false; if (frames.length && frames.at(-1).name === f.name && frames.at(-1).pc === pc) return false; frames.push({ name: f.name, pc, loc: l ? { file: basename(l.file), line: l.line } : null }); return true; };
    const peek = (a, n) => m.bus.peek(a >>> 0, n, { allowSideEffects: false });
    // A stack word is a return address only if the instruction before it is a call to the frame found so far:
    // BL is decoded and must target that function; BLX <reg> (function pointers) cannot be checked.
    const callTarget = ra => {
      const h1 = peek(ra - 4, 2), h2 = peek(ra - 2, 2);
      if (h1 != null && h2 != null && (h1 & 0xf800) === 0xf000 && (h2 & 0xd000) === 0xd000) {
        const S = (h1 >> 10) & 1, I1 = 1 - (((h2 >> 13) & 1) ^ S), I2 = 1 - (((h2 >> 11) & 1) ^ S);
        let off = (S << 24) | (I1 << 23) | (I2 << 22) | ((h1 & 0x3ff) << 12) | ((h2 & 0x7ff) << 1); if (S) off -= 1 << 25;
        return { kind: 'bl', target: (ra + off) >>> 0 };
      }
      return h2 != null && (h2 & 0xff87) === 0x4780 ? { kind: 'blx' } : null;
    };
    const returnsInto = (w, callee) => {
      if (!(w & 1)) return false; const ra = (w & ~1) >>> 0; if (!elf.functionAt(ra)) return false;
      const call = callTarget(ra); if (!call) return false;
      return call.kind === 'blx' || !callee || elf.functionAt(call.target)?.name === callee;
    };
    const isExcReturn = w => (w >>> 0) >= 0xffffffe0;
    let sp = m.cpu.r[13] >>> 0;
    // An exception frame (r0-r3, r12, lr, pc, xpsr; 26 words with FP state) sits where EXC_RETURN was pushed.
    const exception = (frame, exc) => {
      const pc = peek(frame + 24, 4), lr = peek(frame + 20, 4), xpsr = peek(frame + 28, 4);
      if (pc == null) return frame;
      push(pc & ~1); if (returnsInto(lr, frames.at(-1)?.name)) push(((lr & ~1) - 2) >>> 0);
      return frame + ((exc & 0x10) ? 32 : 104) + ((xpsr >>> 9) & 1) * 4;
    };
    push(m.pc);
    const lr = m.cpu.r[14] >>> 0;
    if (isExcReturn(lr)) sp = exception(sp, lr);
    else if (returnsInto(lr, frames.at(-1)?.name)) push(((lr & ~1) - 2) >>> 0);
    for (let i = 0; i < 512 && frames.length < 16; i++, sp += 4) {
      const w = peek(sp, 4); if (w == null) break;
      if (isExcReturn(w)) { sp = exception(sp + 4, w) - 4; continue; }
      if (returnsInto(w, frames.at(-1)?.name)) { const f = elf.functionAt((w & ~1) >>> 0); if (frames.at(-1)?.name !== f?.name) push(((w & ~1) - 2) >>> 0); }
      if (frames.at(-1)?.name === 'main') break;
    }
    return frames.filter((f, i) => i === 0 || f.name !== frames[i - 1].name).map(f => ({ name: f.name, loc: f.loc }));
  }
  globalsList() {
    const out = [];
    for (const s of this.elf.symbols) {
      if (s.type !== 'OBJECT' || !s.name || s.value < 0x20000000 || s.value >= 0x20020000 || s.name.startsWith('_') || s.name.includes('.')) continue;
      out.push({ name: s.name, type: s.size <= 4 ? `${s.size * 8}-bit` : `${s.size} B`, value: this.formatSymbol(s) });
      if (out.length >= 200) break;
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }
  // The ELF has no type info: a global's C type (and whether it is an array) comes from its declaration in the sources.
  declaredType(name) {
    const sources = [this.project.code || '', ...(this.project.firmware?.files || []).map(f => f.text || '')].join('\n');
    const m = new RegExp(`\\b(u?int(?:8|16|32|64)_t|(?:unsigned\\s+|signed\\s+)?(?:char|short|int|long)|unsigned|float|double)\\s+(?:\\w+\\s*(?:\\[[^\\]]*\\])?\\s*(?:=[^,;]*)?,\\s*)*${name}\\s*(\\[)?`).exec(sources);
    if (!m) return null;
    const type = m[1], size = /64|double/.test(type) ? 8 : /8_t|char/.test(type) ? 1 : /16|short/.test(type) ? 2 : 4;
    return { size, array: !!m[2], float: /float|double/.test(type), signed: !/^u|unsigned/.test(type) && type !== 'char' /* char is unsigned on ARM */ };
  }
  elementSize(name) { return this.declaredType(name)?.size ?? null; }
  // One value of `type` (from declaredType) read at `addr`, as the C program sees it.
  formatValue(addr, type) {
    const m = this.machine, size = type.size;
    if (size === 8) { const bytes = m.readMemory(addr, 8); if (type.float) return String(new Float64Array(new Uint8Array(bytes).buffer)[0]); const n = [...bytes].reduceRight((v, b) => v * 256n + BigInt(b), 0n); return String(type.signed ? BigInt.asIntN(64, n) : n); }
    const v = m.bus.peek(addr, size, { allowSideEffects: false });
    if (v == null) return '읽을 수 없음';
    if (type.float) return String(new Float32Array(new Uint32Array([v]).buffer)[0]);
    return String(type.signed ? (size === 4 ? v | 0 : v >= 1 << (size * 8 - 1) ? v - (1 << (size * 8)) : v) : v >>> 0);
  }
  formatSymbol(s) {
    const size = s.size, m = this.machine, type = this.declaredType(s.name);
    if (type && (type.array || size !== type.size) && size % type.size === 0) { const n = size / type.size, shown = Math.min(n, 16); return '{' + Array.from({ length: shown }, (_, i) => this.formatValue(s.value + i * type.size, type)).join(', ') + (n > shown ? ', …' : '') + '}'; }
    if (type && size === type.size) { const text = this.formatValue(s.value, type); if (type.float) return text; const raw = m.bus.peek(s.value, size, { allowSideEffects: false }) ?? 0; return `${text} (0x${(raw >>> 0).toString(16)})`; }
    if ([1, 2, 4].includes(size)) { const v = m.bus.peek(s.value, size, { allowSideEffects: false }) ?? 0, signed = size === 4 ? v | 0 : v >= 1 << (size * 8 - 1) ? v - (1 << (size * 8)) : v; return `${v >>> 0} (${signed}, ${'0x' + (v >>> 0).toString(16)})`; }
    const bytes = m.readMemory(s.value, Math.min(size, 16));
    return '[' + [...bytes].map(b => b.toString(16).padStart(2, '0')).join(' ') + (size > 16 ? ' …' : '') + ']';
  }
  registersList() {
    const r = this.machine.registers();
    return [...r.r.map((v, i) => ({ name: 'r' + i, value: hex(v) })), { name: 'sp', value: hex(r.sp) }, { name: 'lr', value: hex(r.lr) }, { name: 'pc', value: hex(r.pc) }, { name: 'xpsr', value: hex(r.xpsr) }, { name: 'primask', value: String(r.primask) }, { name: 'basepri', value: hex(r.basepri) }, { name: 'cycles', value: String(r.cycles) }];
  }
  evaluate(expression) {
    const text = String(expression).trim(), m = this.machine, regs = m.registers();
    const reg = { sp: regs.sp, lr: regs.lr, pc: regs.pc, xpsr: regs.xpsr, msp: regs.msp, psp: regs.psp }; regs.r.forEach((v, i) => { reg['r' + i] = v; });
    if (Object.hasOwn(reg, text.toLowerCase())) return hex(reg[text.toLowerCase()]);
    const deref = /^\*\s*\(\s*(volatile\s+)?(u?int(8|16|32)_t|float|char|unsigned|int|short)\s*\*\s*\)\s*(0x[0-9a-f]+|\d+|&?\w+)\s*$/i.exec(text);
    if (deref) {
      const type = deref[2].toLowerCase(), size = /8|char/.test(type) ? 1 : /16|short/.test(type) ? 2 : 4;
      let addr = /^0x|^\d/i.test(deref[4]) ? Number(deref[4]) : this.elf.findSymbol(deref[4].replace('&', ''))?.value;
      if (addr == null) throw new Error('주소를 찾을 수 없습니다: ' + deref[4]);
      const v = m.bus.peek(addr >>> 0, size, { allowSideEffects: false });
      if (v == null) throw new Error('읽을 수 없는 주소: ' + hex(addr));
      if (type === 'float') return String(new Float32Array(new Uint32Array([v]).buffer)[0]);
      const signed = !type.startsWith('u') && type !== 'unsigned' ? (size === 4 ? v | 0 : v >= 1 << (size * 8 - 1) ? v - (1 << (size * 8)) : v) : v >>> 0;
      return `${signed} (0x${(v >>> 0).toString(16)})`;
    }
    const idx = /^(\w+)\s*\[\s*(\d+)\s*\]$/.exec(text);
    const sym = this.elf.findSymbol(idx ? idx[1] : text.replace(/^&/, ''));
    if (sym && text.startsWith('&')) return hex(sym.value);
    if (sym && idx) {
      // The ELF has no type info: the element size comes from the array's declaration in the project sources.
      const total = sym.size, i = Number(idx[2]), elem = this.elementSize(idx[1]) ?? ([4, 2, 1].find(e => total % e === 0) ?? 1);
      if (i * elem + elem > total) throw new Error(`${idx[1]}의 범위를 벗어난 인덱스입니다 (요소 ${total / elem}개).`);
      return this.formatValue(sym.value + i * elem, this.declaredType(idx[1]) ?? { size: elem, signed: false, float: false });
    }
    if (sym) return this.formatSymbol(sym);
    throw new Error('알 수 없는 식: ' + text);
  }
  createRuntime(debug) {
    const session = this;
    const bp = new Set((debug?.breakpoints || []).map(b => typeof b === 'string' ? b : `${b.file}:${b.line}`));
    const globals = { cells: Object.create(null), alive: true };
    const rt = {
      program: { globals: [], functions: {} }, scopes: [globals], globals,
      get gpio() { return session.gpio; },
      get microTime() { return session.now; },
      get time() { return session.now / 1000; },
      debug: { enabled: !!debug, paused: false, mode: debug?.entry ? 'into' : 'continue', depth: 0, breakpoints: bp },
      location: null, finished: false, frames: [], depth: 0,
      pwm: session.pwmMap, pwmFrequency: session.pwmFrequency,
      get events() { return { length: session.eventCount }; },
      event(atMs, fn) { session.eventCount++; session.soc.atUs(atMs * 1000, () => { session.eventCount--; fn(); }); },
      pollInterrupts() { session.soc.inputsUpdated(); },
      resume(mode = 'continue') {
        if (!['continue', 'into', 'over', 'out', undefined].includes(mode)) throw new Error('디버그 명령이 올바르지 않습니다.');
        this.debug.mode = mode ?? 'continue'; this.debug.paused = false;
        session.pendingStep = mode && mode !== 'continue' ? mode : null;
      },
      inspect() {
        session.updateLocation();
        return { location: rt.location, locals: [], globals: session.globalsList(), frames: rt.frames, registers: session.registersList() };
      },
      evaluate: expression => session.evaluate(expression),
      memory: (address, count) => session.machine.readMemory(address >>> 0, Math.max(0, Math.min(65536, count | 0))),
      registers: () => session.machine.registers(),
    };
    return rt;
  }
  setPressed(pressed) { this.pressed = pressed; this.changed(this.now); this.computeConnected(); this.soc.inputsUpdated(); }
  // ------------------------------------------------------------ logic analyzer API (UI contract)
  signalsApi() {
    const sig = this.soc.signals;
    return {
      channels: () => sig.channels(),
      samples: (lineId, fromUs = 0, toUs = this.now, cap = 20000) => sig.samples(lineId, fromUs, toUs, cap),
      decode: (channelId, opts) => sig.decode(channelId, opts),
      noise: () => sig.noise(),
      setNoise: cfg => sig.setNoise(cfg),
      now: () => this.now,
      record: pins => sig.record(pins),
      lines: sig.lines, raw: sig,
    };
  }
}

function performanceNow() { return typeof performance !== 'undefined' ? performance.now() : Date.now(); }
export { Line };
