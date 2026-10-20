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
  const c0 = process.cpuUsage();
  const res = m.run(1e9);
  const cpu = process.cpuUsage(c0);
  const ms = performance.now() - t0;
  const cpuMs = (cpu.user + cpu.system) / 1000;
  assert.equal(res.reason, 'exit');
  const n = m.cpu.instructions;
  const mips = n / cpuMs / 1000; // 병렬 테스트 부하의 영향을 줄이려고 CPU 시간 기준
  const msg = `perf: ${n} 명령어, ${m.cycles} 사이클 → ${mips.toFixed(1)} MIPS (CPU ${cpuMs.toFixed(0)} ms), ` +
    `벽시계 ${(n / ms / 1000).toFixed(1)} MIPS, 에뮬레이션 ${(m.cycles / cpuMs / 1000).toFixed(1)} MHz`;
  t.diagnostic(msg);
  console.log(msg);
  assert.ok(mips > 5, msg);
});
