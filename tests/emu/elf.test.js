// ELF 파서와 DWARF .debug_line(v2~v5) 테스트
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseElf, fileMatches } from '../../src/emu/elf.js';

const fixDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'emu');
const srcLines = readFileSync(join(fixDir, 'src', 'debuginfo.c'), 'utf8').split('\n');
const lineOf = (tag) => srcLines.findIndex((l) => l.includes(`@${tag}`)) + 1;

const VARIANTS = [
  ['debuginfo', 5], ['debuginfo_gas5', 5], ['debuginfo_dw4', 4], ['debuginfo_dw3', 3], ['debuginfo_dw2', 2],
];

function lineVersion(elf) {
  const s = elf.sectionByName('.debug_line');
  return new DataView(s.data.buffer, s.data.byteOffset).getUint16(4, true);
}

test('ELF 헤더·세그먼트·섹션', () => {
  const elf = parseElf(readFileSync(join(fixDir, 'debuginfo.elf')));
  assert.equal(elf.header.machine, 40, 'EM_ARM');
  assert.ok(elf.loadSegments.length >= 1);
  const text = elf.sectionByName('.text');
  assert.ok(text && text.size > 0);
  for (const seg of elf.loadSegments) assert.equal(seg.data.length, seg.filesz);
  // .data의 LMA는 Flash, VMA는 RAM
  const data = elf.loadSegments.find((s) => s.vaddr >= 0x20000000 && s.filesz > 0);
  if (data) assert.ok(data.paddr < 0x20000000);
  assert.equal(elf.entry & ~1, elf.findSymbol('Reset_Handler').value & ~1);
});

test('ArrayBuffer 입력과 잘못된 입력', () => {
  const buf = readFileSync(join(fixDir, 'hello.elf'));
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  assert.ok(parseElf(ab).symbols.length > 0);
  assert.throws(() => parseElf(new Uint8Array(64)), /ELF/);
});

test('심볼: 함수·객체·바인딩·크기', () => {
  const elf = parseElf(readFileSync(join(fixDir, 'debuginfo.elf')));
  const add3 = elf.findSymbol('add3');
  assert.equal(add3.type, 'FUNC');
  assert.equal(add3.bind, 'GLOBAL');
  assert.equal(add3.value & 1, 1, 'Thumb 비트');
  assert.ok(add3.size > 0);
  const sq = elf.findSymbol('square');
  assert.equal(sq.bind, 'LOCAL');
  const g = elf.findSymbol('g_counter');
  assert.equal(g.type, 'OBJECT');
  assert.ok(g.value >= 0x20000000);
  const f = elf.functionAt((add3.value & ~1) + 4);
  assert.equal(f.name, 'add3');
  assert.equal(elf.symbolize((add3.value & ~1) + 4).text, 'add3+0x4');
});

for (const [name, ver] of VARIANTS) {
  test(`DWARF v${ver} 줄 번호 표: ${name}`, () => {
    const elf = parseElf(readFileSync(join(fixDir, `${name}.elf`)));
    assert.equal(lineVersion(elf), ver);
    const lt = elf.lineTable;
    assert.equal(lt.error, undefined);
    assert.ok(lt.files.some((f) => f.endsWith('debuginfo.c')));
    const add3 = elf.findSymbol('add3').value & ~1;
    const at = lt.addrToLine(add3);
    assert.ok(at.file.endsWith('tests/fixtures/emu/src/debuginfo.c'), at.file);
    assert.ok(at.line === lineOf('ADD3_FIRST') - 2 || at.line === lineOf('ADD3_FIRST') - 1, `함수 시작 줄 ${at.line}`);
    for (const tag of ['ADD3_FIRST', 'ADD3_SECOND', 'ADD3_RETURN', 'SQUARE_BODY', 'MAIN_FIRST', 'MAIN_CALL', 'MAIN_AFTER_CALL', 'MAIN_SQUARE', 'MAIN_PRINT']) {
      const line = lineOf(tag);
      const addrs = lt.lineToAddrs('debuginfo.c', line);
      assert.ok(addrs.length >= 1, `${tag}(${line}) 주소 없음`);
      for (const a of addrs) assert.equal(lt.addrToLine(a).line, line);
      // 전체 경로·다른 구분자·대소문자로도 찾기
      assert.deepEqual(lt.lineToAddrs('tests\\fixtures\\emu\\src\\debuginfo.c', line), addrs);
      assert.deepEqual(lt.lineToAddrs('/somewhere/else/DebugInfo.c', line), addrs);
    }
    // 코드가 없는 줄 → resolveBreakpoint가 다음 줄로
    const r = lt.resolveBreakpoint('debuginfo.c', 1);
    assert.ok(r && r.line > 1 && r.addrs.length);
    assert.equal(lt.addrToLine(0xfffffff0), null);
    assert.deepEqual(lt.lineToAddrs('nope.c', 9), []);
  });
}

test('줄 번호 표: 모든 변형이 같은 add3 줄 주소를 냄', () => {
  const ref = parseElf(readFileSync(join(fixDir, 'debuginfo.elf'))).lineTable.lineToAddrs('debuginfo.c', lineOf('ADD3_SECOND'));
  for (const [name] of VARIANTS) {
    const lt = parseElf(readFileSync(join(fixDir, `${name}.elf`))).lineTable;
    assert.deepEqual(lt.lineToAddrs('debuginfo.c', lineOf('ADD3_SECOND')), ref, name);
  }
});

test('큰 프로그램(newlib 포함) 줄 번호 표', () => {
  const elf = parseElf(readFileSync(join(fixDir, 'printf.elf')));
  const main = elf.findSymbol('main').value & ~1;
  const L = elf.lineTable.addrToLine(main);
  assert.ok(L && L.file.endsWith('printf.c'));
});

test('fileMatches', () => {
  assert.ok(fileMatches('/a/b/main.c', 'main.c'));
  assert.ok(fileMatches('/a/b/main.c', 'b/main.c'));
  assert.ok(fileMatches('C:\\proj\\Core\\Src\\main.c', 'Core/Src/main.c'));
  assert.ok(!fileMatches('/a/b/main.c', 'gpio.c'));
});
