// Machine: ELF 로드, 실행 예산, 중단점, 소스 수준 단계 실행, 레지스터·메모리 조회, 세미호스팅
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Machine } from '../../src/emu/machine.js';

const fixDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'emu');
const srcLines = readFileSync(join(fixDir, 'src', 'debuginfo.c'), 'utf8').split('\n');
const lineOf = (tag) => srcLines.findIndex((l) => l.includes(`@${tag}`)) + 1;

function load(name = 'debuginfo', opts = { semihosting: true }) {
  const m = new Machine(opts);
  const elf = m.loadElf(readFileSync(join(fixDir, `${name}.elf`)));
  return { m, elf, lt: elf.lineTable };
}
const lineAt = (m) => m.elf.lineTable.addrToLine(m.pc);

test('기본 시스템 클럭과 cycles', () => {
  const m = new Machine();
  assert.deepEqual(m.clock, { sysclk: 16e6, hclk: 16e6, pclk1: 16e6, pclk2: 16e6 });
  assert.equal(m.cycles, 0);
  assert.equal(new Machine({ sysclk: 84e6 }).clock.hclk, 84e6);
});

test('ELF 로드 후 끝까지 실행: 세미호스팅 출력과 종료 코드', () => {
  const { m } = load();
  const chunks = [];
  m.onSemihostOutput = (bytes) => chunks.push(Buffer.from(bytes).toString());
  const r = m.run(1e7);
  assert.equal(r.reason, 'exit');
  assert.equal(m.exitCode, 0);
  const expected = JSON.parse(readFileSync(join(fixDir, 'debuginfo.expected.json'), 'utf8')).output;
  assert.equal(m.semihostOutput, expected);
  assert.equal(chunks.join(''), expected);
  const g = m.elf.findSymbol('g_counter');
  const mem = m.readMemory(g.value, 4);
  assert.equal(mem[0], 3);
  assert.equal(m.describeFault(), '');
});

test('실행 예산 소진 → cycles', () => {
  const { m } = load();
  const r = m.run(10);
  assert.equal(r.reason, 'cycles');
  assert.ok(m.cycles >= 10 && m.cycles < 20);
});

test('줄 중단점 → 인자 레지스터 확인 → stepLine', () => {
  const { m, lt } = load();
  const addrs = lt.lineToAddrs('debuginfo.c', lineOf('ADD3_FIRST'));
  for (const a of addrs) m.breakpoints.add(a);
  let r = m.run(1e6);
  assert.equal(r.reason, 'breakpoint');
  assert.equal(lineAt(m).line, lineOf('ADD3_FIRST'));
  const regs = m.registers();
  assert.deepEqual(regs.r.slice(0, 3), [0, 1, 2]);
  assert.equal(regs.mode, 'thread');
  assert.equal(regs.pc, m.pc);
  r = m.stepLine();
  assert.equal(r.reason, 'step');
  assert.equal(lineAt(m).line, lineOf('ADD3_SECOND'));
  r = m.run(1e6); // 다음 호출(i=1)에서 다시 멈춤
  assert.equal(r.reason, 'breakpoint');
  assert.equal(m.registers().r[0], 1);
});

test('stepOut: 호출자로 복귀', () => {
  const { m, lt } = load();
  for (const a of lt.lineToAddrs('debuginfo.c', lineOf('ADD3_SECOND'))) m.breakpoints.add(a);
  m.run(1e6);
  m.breakpoints.clear();
  const r = m.stepOut();
  assert.equal(r.reason, 'step');
  assert.equal(m.elf.functionAt(m.pc).name, 'main');
  assert.equal(lineAt(m).line, lineOf('MAIN_CALL'));
});

test('stepOver는 호출을 건너뛰고 stepLine(into)은 들어감', () => {
  const { m, lt } = load();
  for (const a of lt.lineToAddrs('debuginfo.c', lineOf('MAIN_CALL'))) m.breakpoints.add(a);
  let r = m.run(1e6);
  assert.equal(r.reason, 'breakpoint');
  m.breakpoints.clear();
  r = m.stepOver();
  assert.equal(r.reason, 'step');
  assert.equal(lineAt(m).line, lineOf('MAIN_AFTER_CALL'));
  // 반복문 위로 돌아가 다시 호출 줄
  for (let i = 0; i < 5 && lineAt(m).line !== lineOf('MAIN_CALL'); i++) m.stepOver();
  assert.equal(lineAt(m).line, lineOf('MAIN_CALL'));
  r = m.stepLine();
  assert.equal(r.reason, 'step');
  assert.equal(m.elf.functionAt(m.pc).name, 'add3');
  // Like GDB: the prologue is skipped, so stepping in stops on the first body line and step over stays inside.
  assert.equal(lineAt(m).line, lineOf('ADD3_FIRST'));
  m.stepOver();
  assert.equal(lineAt(m).line, lineOf('ADD3_SECOND'));
});

test('stepOver는 함수 끝에서 호출자 줄로', () => {
  const { m, lt } = load();
  for (const a of lt.lineToAddrs('debuginfo.c', lineOf('SQUARE_BODY'))) m.breakpoints.add(a);
  m.run(1e6);
  m.breakpoints.clear();
  for (let i = 0; i < 4 && m.elf.functionAt(m.pc).name === 'square'; i++) m.stepOver();
  assert.equal(m.elf.functionAt(m.pc).name, 'main');
  assert.ok([lineOf('MAIN_SQUARE'), lineOf('MAIN_PRINT')].includes(lineAt(m).line));
});

test('레지스터 쓰기와 메모리 쓰기', () => {
  const { m } = load();
  m.setRegister('r5', 0x12345678);
  assert.equal(m.registers().r[5], 0x12345678);
  m.setRegister('s3', 0x3f800000);
  assert.equal(m.registers().f[3], 1);
  m.writeMemory(0x20001000, [1, 2, 3, 4]);
  assert.deepEqual([...m.readMemory(0x20001000, 4)], [1, 2, 3, 4]);
  assert.equal(m.read32(0x20001000), 0x04030201);
  // 디버거는 Flash에도 쓸 수 있음
  m.writeMemory(0x08000100, [0xaa]);
  assert.equal(m.readMemory(0x00000100, 1)[0], 0xaa);
  // 미매핑 영역은 0으로 읽힘(예외 없음)
  assert.deepEqual([...m.readMemory(0x30000000, 2)], [0, 0]);
});

test('BKPT(세미호스팅 아님)는 정지하고 재개 시 건너뜀', () => {
  const m = new Machine();
  // movs r0,#1; bkpt #3; movs r0,#2; b .
  const img = new Uint8Array(0x60);
  const dv = new DataView(img.buffer);
  dv.setUint32(0, 0x20020000, true);
  dv.setUint32(4, 0x08000051, true);
  img.set([0x01, 0x20, 0x03, 0xbe, 0x02, 0x20, 0xfe, 0xe7], 0x50);
  m.loadBinary(img);
  let r = m.run(100);
  assert.equal(r.reason, 'bkpt');
  assert.equal(r.pc, 0x08000052);
  assert.equal(m.cpu.r[0], 1);
  r = m.run(100);
  assert.equal(r.reason, 'cycles');
  assert.equal(m.cpu.r[0], 2);
});

test('nextEvent를 가진 장치는 슬립 중 빨리 감기 대상', () => {
  const m = new Machine();
  // WFI 루프: wfi; b .-2
  const img = new Uint8Array(0x60);
  const dv = new DataView(img.buffer);
  dv.setUint32(0, 0x20020000, true);
  dv.setUint32(4, 0x08000051, true);
  dv.setUint32(0x40, 0x08000059, true); // IRQ0
  img.set([0x30, 0xbf, 0xfd, 0xe7], 0x50); // wfi; b 0x50
  img.set([0x01, 0x34, 0x70, 0x47], 0x58); // adds r4,#1; bx lr
  m.loadBinary(img);
  let due = 100000;
  const dev = {
    nextEvent: () => due,
    tick: () => { if (m.cycles >= due) { m.nvic.setPending(0); due += 100000; } },
    read: () => 0, write() {},
  };
  m.map(0x40010000, 0x400, dev, 'FAKE');
  m.bus.write32(0xe000e100, 1);
  const r = m.run(1e6);
  assert.equal(r.reason, 'cycles');
  assert.equal(m.cpu.r[4], 9);
  assert.ok(m.cpu.instructions < 100);
});

test('폴트 설명(UsageFault 0 나누기)', () => {
  const { m } = load('faults');
  m.run(1e7);
  // 프로그램은 폴트를 처리하고 끝나지만 마지막 폴트 정보는 남음
  assert.ok(m.cpu.lastFault);
  assert.ok(m.describeFault().length > 0);
});
