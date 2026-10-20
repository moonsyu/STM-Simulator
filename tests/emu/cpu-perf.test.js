// 성능: CPU 부하 픽스처의 MIPS를 측정해 보고합니다(CI에서 속도로 실패시키지 않도록 하한은 5 MIPS).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Machine } from '../../src/emu/machine.js';

const fixDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'emu');

test('성능: perf.elf MIPS 측정', (t) => {
  const elf = readFileSync(join(fixDir, 'perf.elf'));
  // 워밍업(JIT)
  const warm = new Machine({ semihosting: true });
  warm.loadElf(elf);
  warm.run(5e6);
  const m = new Machine({ semihosting: true });
  m.loadElf(elf);
  const t0 = performance.now();
  const res = m.run(1e9);
  const ms = performance.now() - t0;
  assert.equal(res.reason, 'exit');
  const mips = m.cpu.instructions / ms / 1000;
  const mhz = m.cycles / ms / 1000;
  const msg = `perf: ${m.cpu.instructions} 명령어, ${m.cycles} 사이클, ${ms.toFixed(0)} ms → ${mips.toFixed(1)} MIPS (${mhz.toFixed(1)} 에뮬레이션 MHz)`;
  t.diagnostic(msg);
  console.log(msg);
  assert.ok(mips > 5, msg);
});
