// 손으로 조립한 작은 프로그램으로 플래그·IT·나눗셈·예외·슬립·주변장치 인터페이스를 검사합니다.
// 바이트열은 arm-none-eabi-as로 조립한 결과입니다(벡터 테이블 0x08000000, 리셋 0x08000050).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Machine } from '../../src/emu/machine.js';

const hex = (s) => Uint8Array.from(s.match(/../g).map((x) => parseInt(x, 16)));

// reset: movs r0,#0; mvns r0,r0; lsrs r0,r0,#1; movs r1,#1; adds r2,r0,r1; bkpt 1; subs r3,r1,r1; bkpt 2;
// movs r4,#0; subs r4,r4,r1; bkpt 3; cmp r1,r1; ite eq; moveq r5,#1; movne r5,#2; cmp r1,r0; it mi; addmi r6,r1,r1; bkpt 4;
// lsls r7,r0,#1; adcs r7,r7; mov r8,#0x80000000; mov r9,#-1; sdiv r10,r8,r9; movs r11,#7; movs r12,#0; udiv r11,r11,r12; bkpt 5
const P1 = '00000220510000089700000897000008970000089700000897000008000000000000000000000000000000009700000800000000000000009700000897000008970000089700000897000008970000080020c04340080121421801be4b1a02be0024641a03be89420cbf01250225814248bf4e1804be47007f414ff000484ff0ff3998fbf9fa5ff0070b5ff0000cbbfbfcfb05befee7eebefde7';
// reset: ldr r0,=0x30000000; ldr r1,[r0]; bkpt 1 / HardFault: ldr r0,=0x30000004; ldr r1,[r0]; bkpt 2
const P2 = '00000220510000086500000859000008650000086500000865000008000000000000000000000000000000006500000800000000000000006500000865000008650000086500000865000008650000084ff04050016801be0148016802be000004000030eebefde7';
// SysTick LOAD=999, CTRL=7; loop: wfi; cmp r7,#5; bne loop; CTRL=0; bkpt 1 / SysTick: adds r7,#1; bx lr
const P3 = '0000022051000008790000087900000879000008790000087900000800000000000000000000000000000000790000080000000000000000790000086f000008790000087900000879000008790000080027084840f2e7314160002181600721016030bf052ffcd10021016001be01377047000010e000e0eebefde7';
// ISER0 = 1<<3; loop until r7==3; bkpt 1 / IRQ3: r7++; [0x40000000]++
const P4 = '000002205100000871000008710000087100000871000008710000080000000000000000000000000000000071000008000000000000000071000008710000087100000871000008710000085f0000080648082101600027032ffdd101be01374ff08040016801310160704700e100e0eebefde7';
// 주변장치 읽기 2회(bkpt 1), 비트밴드(bkpt 2), ITM·DWT(bkpt 3), BusFault(bkpt 5)
const P5 = '0000022051000008cd000008cd000008cd000008af000008cd00000800000000000000000000000000000000cd0000080000000000000000cd000008cd000008cd000008cd000008cd000008cd0000081748016800bf00bf00bf00bf026801be144801210160144b1c6805681348016002be4ff060404121017011484ff0807101601048016841f001010160426800bf00bf00bf00bf00bf00bf436803be0a484ff4003101604ff04050016a04be05be040000400c2000220001002014010042fced00e0001000e024ed00e0eebefde7';
// AIRCR = 0x05FA0004 (SYSRESETREQ)
const P6 = '0000022051000008650000086500000865000008650000086500000800000000000000000000000000000000650000080000000000000000650000086500000865000008650000086500000865000008024803490160bff34f8ffee70ced00e00400fa05eebefde7';
// IRQ0(0x80): r6=1, r7==1이 될 때까지 대기 후 r7++ / IRQ1(0x20): r7++ / main: r7==2면 bkpt 1
const P7 = '000002205100000881000008810000088100000881000008810000080000000000000000000000000000000081000008000000000000000081000008810000086b0000087500000881000008810000080948802101702021417008480321016000260027022ffdd101be0126012ffdd1013770470137704700e400e000e100e0eebefde7';

function boot(code, opts = {}) {
  const m = new Machine(opts);
  m.loadBinary(hex(code), 0x08000000);
  return m;
}

const R = (m, i) => m.cpu.r[i] >>> 0;

test('리셋: 벡터 0에서 SP, 벡터 1에서 PC', () => {
  const m = boot(P1);
  assert.equal(R(m, 13), 0x20020000);
  assert.equal(m.pc, 0x08000050);
  assert.equal(m.cpu.r[14], -1);
});

test('플래그: ADDS 오버플로, SUBS 0/차용, IT 블록, ADC, SDIV/UDIV 경계', () => {
  const m = boot(P1);
  let r = m.run(1000);
  assert.equal(r.reason, 'bkpt');
  assert.equal(r.pc, 0x0800005a);
  assert.equal(R(m, 0), 0x7fffffff);
  assert.equal(R(m, 2), 0x80000000);
  assert.deepEqual([m.cpu.n, m.cpu.z, m.cpu.c, m.cpu.v], [1, 0, 0, 1]);
  r = m.run(1000);
  assert.equal(r.pc, 0x0800005e);
  assert.equal(R(m, 3), 0);
  assert.deepEqual([m.cpu.n, m.cpu.z, m.cpu.c, m.cpu.v], [0, 1, 1, 0]);
  r = m.run(1000);
  assert.equal(R(m, 4), 0xffffffff);
  assert.deepEqual([m.cpu.n, m.cpu.z, m.cpu.c, m.cpu.v], [1, 0, 0, 0]);
  r = m.run(1000);
  assert.equal(r.pc, 0x08000074);
  assert.equal(R(m, 5), 1, 'ITE EQ: then 경로');
  assert.equal(R(m, 6), 2, 'IT MI 실행');
  assert.deepEqual([m.cpu.n, m.cpu.z, m.cpu.c, m.cpu.v], [1, 0, 0, 0], 'IT 안의 16비트 ADD는 플래그 유지');
  r = m.run(1000);
  assert.equal(R(m, 7), 0xfffffffc);
  assert.equal(m.cpu.c, 1);
  assert.equal(R(m, 10), 0x80000000, 'INT_MIN / -1 = INT_MIN');
  assert.equal(R(m, 11), 0, 'x / 0 = 0 (DIV_0_TRP 꺼짐)');
});

test('단계 실행과 중단점', () => {
  const m = boot(P1);
  const s = m.step();
  assert.equal(s.reason, 'step');
  assert.equal(m.pc, 0x08000052);
  m.breakpoints.add(0x08000058);
  let r = m.run(1000);
  assert.equal(r.reason, 'breakpoint');
  assert.equal(r.pc, 0x08000058);
  r = m.run(1000); // 같은 주소에서 재개하면 통과
  assert.equal(r.reason, 'bkpt');
  assert.equal(r.pc, 0x0800005a);
});

test('HardFault 안에서 다시 폴트 → lockup, 한국어 설명', () => {
  const m = boot(P2);
  const r = m.run(10000);
  assert.equal(r.reason, 'lockup');
  assert.equal(m.cpu.lockedUp, true);
  const d = m.describeFault();
  assert.match(d, /HardFault/);
  assert.match(d, /잘못된 메모리 접근 0x3000000/);
  assert.match(d, /잠금/);
  assert.equal(m.scs.hfsr & 0x40000000, 0x40000000, 'FORCED');
});

test('WFI 슬립 빨리 감기 + SysTick 인터럽트', () => {
  const m = boot(P3);
  const r = m.run(1e6);
  assert.equal(r.reason, 'bkpt');
  assert.equal(R(m, 7), 5);
  assert.ok(m.cycles >= 5000 && m.cycles < 5400, `cycles=${m.cycles}`);
  assert.ok(m.cpu.instructions < 200, `잠자는 동안 명령을 실행하지 않음: ${m.cpu.instructions}`);
});

test('레벨형 인터럽트(setLine)와 주변장치 read/write', () => {
  const m = boot(P4);
  let count = 0;
  const dev = {
    read(off) { return off === 0 ? count : 0; },
    write(off, v) { if (off === 0) { count = v; if (v >= 3) m.nvic.setLine(3, false); } },
  };
  m.map(0x40000000, 0x400, dev, 'TEST');
  m.run(50); // 초기화(r7=0) 후 신호 올림
  m.nvic.setLine(3, true);
  const r = m.run(1e5);
  assert.equal(r.reason, 'bkpt');
  assert.equal(R(m, 7), 3, '신호가 유지되는 동안 핸들러 재진입');
  assert.equal(count, 3);
  assert.equal(m.nvic.isPending(3), false);
});

test('주변장치 접근 직전 tick 동기화, 비트밴드, ITM, DWT, BusFault', () => {
  const m = boot(P5, { swv: true });
  let total = 0;
  let readAt = [];
  let word8 = 0;
  const writes = [];
  const dev = {
    tick(c) { total += c; },
    read(off) { if (off === 4) { readAt.push(m.cycles); return total; } if (off === 8) return word8; return 0; },
    write(off, v) { writes.push([off, v]); if (off === 8) word8 = v; },
  };
  m.map(0x40000000, 0x400, dev, 'TIMER');
  const itm = [];
  m.onItm = (port, b) => itm.push([port, b]);
  let r = m.run(1e5);
  assert.equal(r.reason, 'bkpt');
  assert.equal(R(m, 1), readAt[0], '첫 읽기 시점까지 진행');
  assert.equal(R(m, 2), readAt[1]);
  assert.ok(R(m, 2) - R(m, 1) >= 5 && R(m, 2) - R(m, 1) <= 8);
  r = m.run(1e5);
  assert.equal(R(m, 4), 8, 'SRAM 비트밴드 쓰기');
  assert.equal(R(m, 5), 1, 'SRAM 비트밴드 읽기');
  assert.deepEqual(writes.at(-1), [8, 0x20], '주변장치 비트밴드 RMW');
  r = m.run(1e5);
  assert.deepEqual(itm, [[0, 0x41]]);
  const d = R(m, 3) - R(m, 2);
  assert.ok(d >= 6 && d <= 10, `CYCCNT 차이 ${d}`);
  r = m.run(1e5);
  assert.equal(r.reason, 'bkpt');
  assert.equal(m.bus.fetch16(r.pc), 0xbe05, 'BusFault 핸들러');
  assert.equal(m.scs.cfsr, 0x8200);
  assert.equal(m.scs.bfar, 0x30000020);
  assert.match(m.describeFault(), /BusFault: 잘못된 메모리 접근 0x30000020/);
});

test('AIRCR.SYSRESETREQ → 시스템 리셋', () => {
  const m = boot(P6);
  let resets = 0;
  m.onResetRequest = (why) => { assert.equal(why, 'SYSRESETREQ'); resets++; };
  m.run(200);
  assert.ok(resets >= 2, `resets=${resets}`);
});

test('선점: 낮은 우선순위 핸들러 실행 중 높은 우선순위 인터럽트', () => {
  const m = boot(P7);
  m.run(100);
  m.nvic.setPending(0);
  m.run(200);
  assert.equal(R(m, 6), 1, 'IRQ0 핸들러 진입');
  assert.equal(m.cpu.ipsr, 16);
  assert.equal(R(m, 7), 0);
  m.nvic.setPending(1);
  const r = m.run(1000);
  assert.equal(r.reason, 'bkpt');
  assert.equal(R(m, 7), 2);
  assert.equal(m.cpu.ipsr, 0);
});

test('machine.schedule: 지정 사이클에 실행', () => {
  const m = boot(P7); // 무한 대기 루프
  const fired = [];
  m.schedule(10, () => fired.push(m.cycles));
  m.schedule(3, () => fired.push(m.cycles));
  m.run(5);
  assert.equal(fired.length, 1);
  m.run(100);
  assert.equal(fired.length, 2);
  assert.ok(fired[0] >= 3 && fired[0] <= 5, `${fired}`);
  assert.ok(fired[1] >= 10 && fired[1] <= 12, `${fired}`);
});

test('미매핑 명령어 페치 → 폴트, CFSR IBUSERR', () => {
  const m = new Machine();
  const img = new Uint8Array(0x60);
  const dv = new DataView(img.buffer);
  dv.setUint32(0, 0x20020000, true);
  dv.setUint32(4, 0x30000001, true); // 리셋 벡터가 미매핑 영역
  dv.setUint32(12, 0x08000051, true); // HardFault
  img.set([0xfe, 0xe7], 0x50); // b .
  m.loadBinary(img);
  m.run(100);
  assert.equal(m.pc, 0x08000050);
  assert.equal(m.cpu.ipsr, 3);
  assert.equal(m.scs.cfsr & 0x100, 0x100);
});
