// System Control Space 레지스터 수준 테스트(NVIC, SCB, SysTick, DWT, ITM, FPU 제어)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Machine } from '../../src/emu/machine.js';

function mk(opts) {
  const m = new Machine(opts);
  return { m, rd: (a) => m.bus.read32(a) >>> 0, wr: (a, v) => m.bus.write32(a, v), rd8: (a) => m.bus.read8(a), wr8: (a, v) => m.bus.write8(a, v) };
}

test('SCB ID/기본값', () => {
  const { rd } = mk();
  assert.equal(rd(0xe000ed00), 0x410fc241, 'CPUID');
  assert.equal(rd(0xe000ed14), 0x200, 'CCR.STKALIGN');
  assert.equal(rd(0xe000ef34), 0xc0000000, 'FPCCR ASPEN|LSPEN');
  assert.equal(rd(0xe000ef40), 0x10110021, 'MVFR0');
  assert.equal(rd(0xe000ef44), 0x11000011, 'MVFR1');
  assert.equal(rd(0xe000e004), 2, 'ICTR: 96 IRQ');
  assert.equal(rd(0xe000ed0c) >>> 16, 0xfa05, 'AIRCR VECTKEYSTAT');
});

test('ICSR PendSV/SysTick 설정·해제, VECTPENDING, ISRPENDING', () => {
  const { m, rd, wr } = mk();
  wr(0xe000ed04, 1 << 28);
  assert.equal(m.nvic.pending[14], 1);
  assert.ok(rd(0xe000ed04) & (1 << 28));
  assert.equal((rd(0xe000ed04) >>> 12) & 0x1ff, 14);
  wr(0xe000ed04, 1 << 27);
  assert.equal(m.nvic.pending[14], 0);
  wr(0xe000ed04, 1 << 26);
  assert.ok(rd(0xe000ed04) & (1 << 26));
  wr(0xe000ed04, 1 << 25);
  assert.equal(rd(0xe000ed04) & (1 << 26), 0);
  wr(0xe000e200, 1 << 7); // ISPR
  assert.ok(rd(0xe000ed04) & (1 << 22), 'ISRPENDING');
});

test('AIRCR: 키 없으면 무시, PRIGROUP, SYSRESETREQ', () => {
  const { m, rd, wr } = mk();
  wr(0xe000ed0c, 0x00000500);
  assert.equal((rd(0xe000ed0c) >>> 8) & 7, 0);
  wr(0xe000ed0c, 0x05fa0500);
  assert.equal((rd(0xe000ed0c) >>> 8) & 7, 5);
  assert.equal(m.nvic.groupPri(0x50), 0x40);
  let req = null;
  m.requestReset = (why) => { req = why; };
  wr(0xe000ed0c, 0x05fa0004);
  assert.equal(req, 'SYSRESETREQ');
});

test('NVIC: ISER/ICER/ISPR/ICPR/IABR/IPR/STIR', () => {
  const { m, rd, wr, rd8, wr8 } = mk();
  wr(0xe000e100, 0x81);
  wr(0xe000e104, 1 << 3); // IRQ35
  assert.equal(rd(0xe000e100), 0x81);
  assert.equal(rd(0xe000e180), 0x81, 'ICER 읽기 = 활성 상태');
  assert.equal(m.nvic.isEnabled(35), true);
  wr(0xe000e180, 0x01);
  assert.equal(rd(0xe000e100), 0x80);
  wr(0xe000e200, 0x10);
  assert.equal(rd(0xe000e280), 0x10);
  wr(0xe000e280, 0x10);
  assert.equal(rd(0xe000e200), 0);
  wr8(0xe000e400 + 5, 0xff);
  assert.equal(rd8(0xe000e400 + 5), 0xf0, '상위 4비트만 구현');
  assert.equal((rd(0xe000e404) >>> 8) & 0xff, 0xf0);
  wr(0xe000ef00, 95);
  assert.equal(m.nvic.isPending(95), true);
  assert.equal(rd(0xe000e208) >>> 31, 1);
  m.nvic.activate(16 + 2);
  assert.equal(rd(0xe000e300), 4, 'IABR');
});

test('레벨 신호: ICPR로 지워도 신호가 남아 있으면 대기 유지', () => {
  const { m, wr } = mk();
  m.nvic.setLine(9, true);
  assert.equal(m.nvic.isPending(9), true);
  wr(0xe000e280, 1 << 9);
  assert.equal(m.nvic.isPending(9), true);
  m.nvic.setLine(9, false);
  wr(0xe000e280, 1 << 9);
  assert.equal(m.nvic.isPending(9), false);
  m.nvic.setPending(10);
  assert.equal(m.nvic.isPending(10), true);
});

test('SHPR/SHCSR/CFSR(W1C)/HFSR/VTOR/CPACR/CCR', () => {
  const { m, rd, wr, wr8, rd8 } = mk();
  wr8(0xe000ed23, 0xff); // SysTick 우선순위
  assert.equal(rd8(0xe000ed23), 0xf0);
  assert.equal(m.nvic.prio[15], 0xf0);
  wr(0xe000ed1c, 0x80000000); // SVCall
  assert.equal(m.nvic.prio[11], 0x80);
  wr(0xe000ed24, 0x70000);
  assert.equal(rd(0xe000ed24) & 0x70000, 0x70000);
  assert.equal(m.nvic.enabled[4] + m.nvic.enabled[5] + m.nvic.enabled[6], 3);
  m.scs.cfsr = 0x02008200;
  wr(0xe000ed28, 0x00000200);
  assert.equal(rd(0xe000ed28), 0x02008000);
  m.bus.write8(0xe000ed2b, 0x02); // UFSR 상위 바이트만
  assert.equal(rd(0xe000ed28), 0x00008000);
  m.scs.hfsr = 0x40000000;
  wr(0xe000ed2c, 0x40000000);
  assert.equal(rd(0xe000ed2c), 0);
  wr(0xe000ed08, 0x08004123);
  assert.equal(rd(0xe000ed08), 0x08004100);
  wr(0xe000ed88, 0xffffffff);
  assert.equal(rd(0xe000ed88), 0x00f00000);
  wr(0xe000ed14, 0x18);
  assert.equal(m.scs.div0Trp, true);
  assert.equal(m.scs.unalignTrp, true);
});

test('SysTick: 감소·재적재·COUNTFLAG(읽으면 해제)·TICKINT·HCLK/8', () => {
  const { m, rd, wr } = mk();
  const scs = m.scs;
  wr(0xe000e014, 99);
  wr(0xe000e018, 1234); // 쓰면 0
  assert.equal(rd(0xe000e018), 0);
  wr(0xe000e010, 0x5); // 프로세서 클럭, 인터럽트 없음
  scs.tick(1); // 0 → 재적재
  assert.equal(scs.stVal, 99);
  scs.tick(99);
  assert.equal(scs.stVal, 0);
  assert.ok(rd(0xe000e010) & 0x10000, 'COUNTFLAG');
  assert.equal(rd(0xe000e010) & 0x10000, 0, '읽으면 해제');
  assert.equal(m.nvic.pending[15], 0);
  wr(0xe000e010, 0x7);
  scs.tick(100 * 7 + 1);
  assert.equal(m.nvic.pending[15], 1, 'TICKINT');
  assert.equal(scs.stVal, 99);
  // HCLK/8
  m.nvic.pending[15] = 0;
  wr(0xe000e018, 0);
  wr(0xe000e010, 0x3);
  scs.tick(8);
  assert.equal(scs.stVal, 99);
  scs.tick(8 * 50);
  assert.equal(scs.stVal, 49);
  assert.equal(scs.nextEvent({ cycles: 1000 }), 1000 + 49 * 8);
  assert.equal(rd(0xe000e01c) >>> 30, 1, 'CALIB NOREF=0,SKEW=1');
});

test('DWT CYCCNT는 TRCENA와 CYCCNTENA가 모두 켜졌을 때만 증가', () => {
  const { m, rd, wr } = mk();
  wr(0xe0001000, 1);
  m.scs.tick(100);
  assert.equal(rd(0xe0001004), 0);
  wr(0xe000edfc, 1 << 24);
  m.scs.tick(100);
  assert.equal(rd(0xe0001004), 100);
  wr(0xe0001004, 5);
  m.scs.tick(10);
  assert.equal(rd(0xe0001004), 15);
  assert.equal(rd(0xe0001000) >>> 28, 4, 'NUMCOMP');
});

test('ITM: TCR.ITMENA와 TER가 켜진 포트만 onItm으로 전달', () => {
  const { m, rd, wr } = mk();
  const got = [];
  m.onItm = (p, b) => got.push([p, b]);
  m.bus.write8(0xe0000000, 0x41);
  assert.equal(got.length, 0);
  wr(0xe0000e80, 1);
  wr(0xe0000e00, 0x3);
  m.bus.write8(0xe0000000, 0x41);
  m.bus.write8(0xe0000004, 0x42);
  m.bus.write8(0xe0000008, 0x43); // 포트 2 비활성
  wr(0xe0000000, 0x34333231);
  assert.deepEqual(got, [[0, 0x41], [1, 0x42], [0, 0x31], [0, 0x32], [0, 0x33], [0, 0x34]]);
  assert.equal(rd(0xe0000000), 1, 'FIFOREADY');
});

test('swv 옵션은 리셋 시 ITM 포트 0을 켬(디버거 흉내)', () => {
  const m = new Machine({ swv: true });
  m.loadBinary(new Uint8Array([0, 0, 2, 0x20, 0x09, 0, 0, 8, 0xfe, 0xe7]));
  assert.equal(m.scs.itmTcr & 1, 1);
  assert.equal(m.scs.itmTer & 1, 1);
});
