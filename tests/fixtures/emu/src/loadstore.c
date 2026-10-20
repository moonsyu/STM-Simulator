/* 로드/스토어 주소 지정, LDM/STM, LDRD/STRD, 배타 접근, 비정렬 접근, 문자열 함수 */
#include "common/tlib.h"
#include <string.h>

static uint8_t buf[256] __attribute__((aligned(8)));
static uint32_t h;

static void fill(void) { for (int i = 0; i < 256; i++) buf[i] = (uint8_t)(i * 37 + 11); }
static void hbuf(void) { for (int i = 0; i < 256; i += 4) h = t_mix(h, *(uint32_t *)&buf[i]); }
#define HR(x) h = t_mix(h, (uint32_t)(x))

int main(void)
{
  uint32_t r0, r1, r2, r3, base;
  fill();
  /* 즉치 오프셋 형태 */
  base = (uint32_t)&buf[64];
  __asm volatile("ldr.w %0, [%4, #12]\n\tldr %1, [%4, #-8]\n\tldrb.w %2, [%4, #255-64]\n\tldrsb %3, [%4, #-3]"
                 : "=&r"(r0), "=&r"(r1), "=&r"(r2), "=&r"(r3) : "r"(base)); HR(r0); HR(r1); HR(r2); HR(r3);
  __asm volatile("ldrh.w %0, [%4, #6]\n\tldrsh %1, [%4, #-6]\n\tldrsh.w %2, [%4, #100]\n\tldrsb.w %3, [%4, #101]"
                 : "=&r"(r0), "=&r"(r1), "=&r"(r2), "=&r"(r3) : "r"(base)); HR(r0); HR(r1); HR(r2); HR(r3);
  /* 사전/사후 인덱스, 쓰기 되돌림 */
  base = (uint32_t)&buf[100];
  __asm volatile("ldr %0, [%2, #4]!\n\tldr %1, [%2], #-12" : "=&r"(r0), "=&r"(r1), "+r"(base)); HR(r0); HR(r1); HR(base - (uint32_t)buf);
  __asm volatile("ldrb %0, [%2, #-1]!\n\tldrh %1, [%2], #7" : "=&r"(r0), "=&r"(r1), "+r"(base)); HR(r0); HR(r1); HR(base - (uint32_t)buf);
  __asm volatile("ldrsb %0, [%2], #3\n\tldrsh %1, [%2, #-2]!" : "=&r"(r0), "=&r"(r1), "+r"(base)); HR(r0); HR(r1); HR(base - (uint32_t)buf);
  r0 = 0xdeadbeef;
  __asm volatile("str %1, [%0, #8]!\n\tstrh %1, [%0], #-3\n\tstrb %1, [%0, #-1]!" : "+r"(base) : "r"(r0) : "memory");
  HR(base - (uint32_t)buf); hbuf();
  /* 레지스터 오프셋 */
  base = (uint32_t)&buf[0];
  for (uint32_t i = 0; i < 16; i++) {
    __asm volatile("ldr.w %0, [%3, %4, lsl #2]\n\tldrh.w %1, [%3, %4, lsl #1]\n\tldrsb.w %2, [%3, %4]"
                   : "=&r"(r0), "=&r"(r1), "=&r"(r2) : "r"(base), "r"(i)); HR(r0); HR(r1); HR(r2);
    __asm volatile("ldr %0, [%3, %4]\n\tldrsh %1, [%3, %4]\n\tldrb %2, [%3, %4]"
                   : "=&r"(r0), "=&r"(r1), "=&r"(r2) : "r"(base), "r"(i * 3)); HR(r0); HR(r1); HR(r2);
    __asm volatile("str.w %1, [%0, %2, lsl #3]" :: "r"(base + 128), "r"(i * 0x01010101u), "r"(i) : "memory");
  }
  hbuf();
  /* LDRD/STRD */
  base = (uint32_t)&buf[32];
  __asm volatile("ldrd %0, %1, [%2, #8]!" : "=&r"(r0), "=&r"(r1), "+r"(base)); HR(r0); HR(r1); HR(base - (uint32_t)buf);
  __asm volatile("ldrd %0, %1, [%2], #-16" : "=&r"(r0), "=&r"(r1), "+r"(base)); HR(r0); HR(r1); HR(base - (uint32_t)buf);
  __asm volatile("strd %1, %2, [%0, #-8]!" : "+r"(base) : "r"(0x11223344u), "r"(0x55667788u) : "memory"); HR(base - (uint32_t)buf);
  __asm volatile("strd %1, %2, [%0], #24" : "+r"(base) : "r"(0x99aabbccu), "r"(0xddeeff00u) : "memory"); HR(base - (uint32_t)buf);
  __asm volatile("ldrd %0, %1, [%2, #-4]" : "=&r"(r0), "=&r"(r1) : "r"(base)); HR(r0); HR(r1);
  hbuf();
  /* LDM/STM */
  base = (uint32_t)&buf[64];
  __asm volatile("ldmia %4!, {r1, r2, r3, r4}\n\tmov %0, r1\n\tmov %1, r2\n\tmov %2, r3\n\tmov %3, r4"
                 : "=r"(r0), "=r"(r1), "=r"(r2), "=r"(r3), "+r"(base) :: "r1", "r2", "r3", "r4", "memory");
  HR(r0); HR(r1); HR(r2); HR(r3); HR(base - (uint32_t)buf);
  __asm volatile("ldmdb %4!, {r1, r2, r3, r4}\n\tmov %0, r1\n\tmov %1, r2\n\tmov %2, r3\n\tmov %3, r4"
                 : "=r"(r0), "=r"(r1), "=r"(r2), "=r"(r3), "+r"(base) :: "r1", "r2", "r3", "r4", "memory");
  HR(r0); HR(r1); HR(r2); HR(r3); HR(base - (uint32_t)buf);
  __asm volatile("mov r4, #4\n\tmov r5, #5\n\tmov r6, #6\n\tstmdb %0!, {r4-r6}\n\tstmia.w %0, {r4, r6}\n\tstm %0!, {r5}"
                 : "+r"(base) :: "r4", "r5", "r6", "memory"); HR(base - (uint32_t)buf);
  __asm volatile("mov r0, %0\n\tmovs r1, #9\n\tmovs r2, #10\n\tmovs r3, #11\n\tstmia r0!, {r1-r3}\n\tsubs r0, #12\n\tldmia r0, {r0, r1}\n\tmov %1, r0\n\tmov %2, r1"
                 : "+r"(base), "=r"(r2), "=r"(r3) :: "r0", "r1", "r2", "r3", "memory"); HR(r2); HR(r3);
  hbuf();
  /* PUSH/POP, 높은 레지스터 */
  __asm volatile("mov r8, #0x88\n\tmov r9, #0x99\n\tmov r10, #0xaa\n\tpush {r8-r10}\n\tmov r8, #0\n\tmov r9, #0\n\tpop {r8, r9, r10}\n\t"
                 "add %0, r8, r9\n\tadd %0, %0, r10" : "=r"(r0) :: "r8", "r9", "r10", "memory"); HR(r0);
  __asm volatile("push {r4, r5}\n\tmovs r4, #1\n\tmovs r5, #2\n\tpush {r4, r5}\n\tpop {r5}\n\tpop {r4}\n\tsub %0, r5, r4\n\tpop {r4, r5}"
                 : "=r"(r0) :: "memory"); HR(r0);
  /* 리터럴 풀, ADR */
  __asm volatile("ldr %0, =0x12345678\n\tadr %1, 1f\n\tb 2f\n\t.align 2\n1: .word 0xcafef00d\n2: ldr %1, [%1]" : "=r"(r0), "=r"(r1)); HR(r0); HR(r1);
  /* 비정렬 접근(일반 메모리 허용) */
  for (int i = 0; i < 8; i++) {
    volatile uint32_t *pw = (volatile uint32_t *)&buf[1 + i * 9];
    volatile uint16_t *ph = (volatile uint16_t *)&buf[3 + i * 7];
    uint32_t w, hw;
    __asm volatile("ldr %0, [%1]" : "=r"(w) : "r"(pw)); HR(w);
    __asm volatile("ldrh %0, [%1]" : "=r"(hw) : "r"(ph)); HR(hw);
    __asm volatile("ldrsh.w %0, [%1, #0]" : "=r"(hw) : "r"(ph)); HR(hw);
    __asm volatile("str %0, [%1, #2]" :: "r"(0xa5a50000u + i), "r"(pw) : "memory");
    __asm volatile("strh %0, [%1, #1]" :: "r"(0x1234u + i), "r"(ph) : "memory");
  }
  hbuf();
  t_kv("addrmodes", h);
  /* 배타 접근 */
  h = 0;
  static volatile uint32_t ex32 = 5;
  static volatile uint16_t ex16 = 7;
  static volatile uint8_t ex8 = 9;
  uint32_t st;
  __asm volatile("ldrex %0, [%2]\n\tadd %0, #1\n\tstrex %1, %0, [%2]" : "=&r"(r0), "=&r"(st) : "r"(&ex32) : "memory"); HR(r0); HR(st); HR(ex32);
  __asm volatile("ldrex %0, [%2]\n\tclrex\n\tadd %0, #1\n\tstrex %1, %0, [%2]" : "=&r"(r0), "=&r"(st) : "r"(&ex32) : "memory"); HR(st); HR(ex32);
  __asm volatile("strex %1, %0, [%2]" : "=&r"(r0), "=&r"(st) : "r"(&ex32) : "memory"); HR(st);
  __asm volatile("ldrexh %0, [%2]\n\tadd %0, #1\n\tstrexh %1, %0, [%2]" : "=&r"(r0), "=&r"(st) : "r"(&ex16) : "memory"); HR(r0); HR(st); HR(ex16);
  __asm volatile("ldrexb %0, [%2]\n\tadd %0, #1\n\tstrexb %1, %0, [%2]" : "=&r"(r0), "=&r"(st) : "r"(&ex8) : "memory"); HR(r0); HR(st); HR(ex8);
  __asm volatile("ldrex %0, [%2, #0]\n\tstrex %1, %0, [%2, #0]\n\tstrex %1, %0, [%2, #0]" : "=&r"(r0), "=&r"(st) : "r"(&ex32) : "memory"); HR(st);
  t_kv("exclusive", h);
  /* 문자열/메모리 함수(newlib 최적화 루틴) */
  h = 0;
  static char s1[96], s2[96];
  for (int off = 0; off < 8; off++) {
    for (int n = 0; n < 40; n += 3) {
      memset(s1, 0, sizeof s1);
      for (int i = 0; i < 64; i++) s2[i] = (char)('A' + (i * 7 + off) % 26);
      s2[64] = 0;
      memcpy(s1 + off, s2 + (n & 7), n);
      HR(strlen(s1 + off));
      memmove(s1 + 1, s1, 30);
      HR(memcmp(s1, s2, 20) > 0);
      memset(s1 + off, 'z', n / 2);
      HR(strcmp(s1, s2) < 0);
      for (int i = 0; i < 96; i += 4) HR(*(uint32_t *)&s1[i]);
    }
  }
  t_kv("strings", h);
  return 0;
}
