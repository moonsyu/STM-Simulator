import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FirmwareSession } from '../../src/firmware-session.js';

export const FIXTURE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../fixtures/firmware');
export const project = name => JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, name + '.json'), 'utf8'));
export const elf = name => new Uint8Array(fs.readFileSync(path.join(FIXTURE_DIR, name + '.elf')));

// Create a FirmwareSession for fixture `name` and collect everything it reports.
export function open(name, options = {}, mutate) {
  const p = options.project ?? project(name);
  mutate?.(p);
  const log = { print: [], uart: [], trace: [] };
  const session = new FirmwareSession(p, {
    elf: elf(name), print: t => log.print.push(t), uart: e => log.uart.push(e), trace: e => log.trace.push(e), ...options,
  });
  return { session, log };
}
// Drive the session the way app.js does (tick every 20 ms of simulated time),
// until `ms`; tick() may lag behind under its wall-clock budget, so loop until
// the simulated clock really reaches the target.
export function runUntil(session, ms, { onTick } = {}) {
  let result;
  for (let guard = 0; guard < 100000; guard++) {
    const next = Math.min(ms, Math.floor(session.now / 1000 / 20) * 20 + 20);
    result = session.tick(next);
    onTick?.(session.now / 1000, result);
    if (session.now >= ms * 1000 - 1 || session.runtime.debug.paused || session.runtime.finished) break;
  }
  return result;
}
export const printed = (log, pattern) => log.print.find(line => pattern.test(line));
export const vcpText = session => session.buses.vcpOutput || '';
