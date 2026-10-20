// QEMU(mps2-an386)에서 얻은 기대 출력과 에뮬레이터 출력을 바이트 단위로 비교하는 차등 테스트.
// 픽스처 재생성: node scripts/emu/build-cpu-fixtures.mjs --qemu
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { Machine } from '../../src/emu/machine.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixDir = join(here, '..', 'fixtures', 'emu');
const QEMU = process.env.QEMU_ARM || '/home/claude/tools/xpack-qemu-arm-9.2.4-1/bin/qemu-system-arm';

const fixtures = readdirSync(fixDir)
  .filter((f) => f.endsWith('.expected.json'))
  .map((f) => f.replace('.expected.json', ''))
  .sort();

export function runFixture(name, { maxCycles = 4e9 } = {}) {
  const m = new Machine({ semihosting: true });
  m.loadElf(readFileSync(join(fixDir, `${name}.elf`)));
  const res = m.run(maxCycles);
  return { machine: m, res, output: m.semihostOutput };
}

test('픽스처 목록이 비어 있지 않음', () => {
  assert.ok(fixtures.length >= 10, `fixtures: ${fixtures.join(', ')}`);
});

for (const name of fixtures) {
  test(`QEMU 차등 비교: ${name}`, () => {
    const expected = JSON.parse(readFileSync(join(fixDir, `${name}.expected.json`), 'utf8'));
    const { machine, res, output } = runFixture(name);
    if (output !== expected.output) {
      const a = expected.output.split('\n');
      const b = output.split('\n');
      const diffs = [];
      for (let i = 0; i < Math.max(a.length, b.length) && diffs.length < 10; i++) {
        if (a[i] !== b[i]) diffs.push(`  line ${i + 1}: qemu=${JSON.stringify(a[i])} emu=${JSON.stringify(b[i])}`);
      }
      assert.fail(`${name}: 출력 불일치 (stop=${res.reason} ${machine.describeFault()})\n${diffs.join('\n')}`);
    }
    assert.equal(res.reason, 'exit', `${name}: ${machine.describeFault()}`);
    assert.equal(machine.exitCode, expected.exitCode);
  });
}

const haveQemu = existsSync(QEMU);
test('QEMU 실시간 재실행(도구가 있을 때만)', { skip: !haveQemu && 'qemu-system-arm 없음' }, () => {
  for (const name of ['alu', 'exceptions', 'faults']) {
    const r = spawnSync(QEMU, [
      '-machine', 'mps2-an386', '-icount', 'shift=0', '-nographic', '-monitor', 'none', '-serial', 'none',
      '-semihosting-config', 'enable=on,target=native', '-kernel', join(fixDir, `${name}.elf`),
    ], { encoding: 'latin1', timeout: 60000 });
    const live = Buffer.from((r.stdout || '') + (r.stderr || ''), 'latin1').toString('utf8');
    const { output } = runFixture(name);
    assert.equal(output, live, `${name}: 실시간 QEMU 출력과 다름`);
  }
});
