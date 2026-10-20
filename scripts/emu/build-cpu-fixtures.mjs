#!/usr/bin/env node
// CPU 에뮬레이터 테스트 픽스처 빌드.
//   node scripts/emu/build-cpu-fixtures.mjs           # ELF 빌드
//   node scripts/emu/build-cpu-fixtures.mjs --qemu    # ELF 빌드 + QEMU(mps2-an386) 실행 결과를 기대값으로 저장
//   node scripts/emu/build-cpu-fixtures.mjs hello alu # 일부만
// 환경 변수: ARM_GCC(arm-none-eabi-gcc 경로 또는 bin 디렉터리), QEMU_ARM(qemu-system-arm 경로)
import { spawnSync } from 'node:child_process';
import { existsSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const fixDir = join(root, 'tests', 'fixtures', 'emu');
const srcDir = join(fixDir, 'src');

export const DEFAULT_GCC = '/home/claude/tools/xpack-arm-none-eabi-gcc-14.2.1-1.1/bin/arm-none-eabi-gcc';
export const DEFAULT_QEMU = '/home/claude/tools/xpack-qemu-arm-9.2.4-1/bin/qemu-system-arm';

export function findGcc() {
  let g = process.env.ARM_GCC || DEFAULT_GCC;
  if (existsSync(g) && statSync(g).isDirectory()) g = join(g, 'arm-none-eabi-gcc');
  return g;
}

export function findQemu() {
  return process.env.QEMU_ARM || DEFAULT_QEMU;
}

const CPU = ['-mcpu=cortex-m4', '-mthumb', '-mfloat-abi=hard', '-mfpu=fpv4-sp-d16'];
const COMMON = ['common/startup.c', 'common/tlib.c'];

// name: 출력 파일 이름, src: 소스, opt: 최적화, extra: 추가 플래그
export const FIXTURES = [
  { name: 'hello', src: ['hello.c'] },
  { name: 'alu', src: ['alu.c'] },
  { name: 'muldiv', src: ['muldiv.c'] },
  { name: 'dsp', src: ['dsp.c'] },
  { name: 'bitops', src: ['bitops.c'] },
  { name: 'loadstore', src: ['loadstore.c'] },
  { name: 'control', src: ['control.c'] },
  { name: 'control_os', src: ['control.c'], opt: '-Os' },
  { name: 'fpu', src: ['fpu.c'], extra: ['-mfp16-format=ieee', '-fno-math-errno'] },
  { name: 'printf', src: ['printf.c'], extra: ['-u', '_printf_float'] },
  { name: 'exceptions', src: ['exceptions.c'] },
  { name: 'faults', src: ['faults.c'], extra: ['-Wno-div-by-zero'] },
  { name: 'perf', src: ['perf.c'] },
  // 줄 번호 표 형식별: GCC 생성 DWARF 5(line_strp), gas 생성 DWARF 5, DWARF 4, gas 기본(DWARF 3), DWARF 2
  { name: 'debuginfo', src: ['debuginfo.c'], opt: '-O0', extra: ['-gno-as-loc-support'] },
  { name: 'debuginfo_gas5', src: ['debuginfo.c'], opt: '-O0', extra: ['-Wa,--gdwarf-5'] },
  { name: 'debuginfo_dw4', src: ['debuginfo.c'], opt: '-O0', extra: ['-gdwarf-4', '-gno-as-loc-support'] },
  { name: 'debuginfo_dw3', src: ['debuginfo.c'], opt: '-O0' },
  { name: 'debuginfo_dw2', src: ['debuginfo.c'], opt: '-O0', extra: ['-gdwarf-2', '-gno-as-loc-support'] },
];

function build(fx, gcc) {
  const out = join(fixDir, `${fx.name}.elf`);
  const args = [
    ...CPU, fx.opt || '-O2', '-g', '-ffunction-sections', '-fdata-sections', '-fno-common',
    '-Wall', '-Wno-unused-function',
    ...(fx.extra || []),
    '-I', srcDir,
    ...[...COMMON, ...fx.src].map((s) => join(srcDir, s)),
    '-nostartfiles', '-specs=nano.specs', '-specs=nosys.specs',
    '-T', join(srcDir, 'common', 'link.ld'), '-Wl,--gc-sections', '-lm',
    '-o', out,
  ];
  const r = spawnSync(gcc, args, { encoding: 'utf8' });
  if (r.status !== 0) {
    process.stderr.write(r.stdout + r.stderr);
    throw new Error(`빌드 실패: ${fx.name}`);
  }
  if (r.stderr) process.stderr.write(r.stderr);
  return out;
}

export function runQemu(elf, { qemu = findQemu(), timeout = 60000 } = {}) {
  const r = spawnSync(qemu, [
    '-machine', 'mps2-an386', '-cpu', 'cortex-m4', '-nographic', '-monitor', 'none', '-serial', 'none',
    '-semihosting-config', 'enable=on,target=native', '-icount', 'shift=0', '-kernel', elf,
  ], { encoding: 'latin1', timeout, maxBuffer: 64 << 20 });
  if (r.error) throw r.error;
  // QEMU는 stdout이 tty가 아니면 세미호스팅 출력을 stderr로 보냅니다.
  const text = (r.stdout || '') + (r.stderr || '');
  return { output: Buffer.from(text, 'latin1').toString('utf8'), exitCode: r.status };
}

function main() {
  const argv = process.argv.slice(2);
  const withQemu = argv.includes('--qemu');
  const names = argv.filter((a) => !a.startsWith('--'));
  const gcc = findGcc();
  if (!existsSync(gcc)) {
    console.error(`arm-none-eabi-gcc를 찾을 수 없습니다: ${gcc} (ARM_GCC 환경 변수로 지정)`);
    process.exit(1);
  }
  mkdirSync(fixDir, { recursive: true });
  for (const fx of FIXTURES) {
    if (names.length && !names.includes(fx.name)) continue;
    const elf = build(fx, gcc);
    let line = `built ${fx.name}.elf`;
    if (withQemu) {
      const res = runQemu(elf);
      writeFileSync(join(fixDir, `${fx.name}.expected.json`), JSON.stringify({
        source: 'qemu-system-arm 9.2.4 -M mps2-an386 (semihosting)',
        exitCode: res.exitCode,
        output: res.output,
      }, null, 2) + '\n');
      line += ` → qemu exit ${res.exitCode}, ${res.output.length} bytes`;
    }
    console.log(line);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
