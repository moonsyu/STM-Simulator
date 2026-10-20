/* 분기·IT 블록·TBB/TBH·CBZ/CBNZ·재귀·함수 포인터 */
#include "common/tlib.h"

static uint32_t h;
#define HR(x) h = t_mix(h, (uint32_t)(x))

__attribute__((noinline)) static int sw_dense(int x)
{
  switch (x) {
    case 0: return 11; case 1: return 23; case 2: return 37; case 3: return 41; case 4: return 59;
    case 5: return 61; case 6: return 73; case 7: return 89; case 8: return 97; case 9: return 101;
    case 10: return x * 3; case 11: return x ^ 0x55; case 12: return 7; case 14: return 1000; default: return -1;
  }
}

/* 큰 분기 거리 → TBH */
__attribute__((noinline)) static uint32_t sw_big(uint32_t x, uint32_t y)
{
  switch (x & 15) {
#define C(n) case n: y = y * (n + 3) + (y >> (n % 7 + 1)); y ^= y << 5; y += 0x1000 * n; y = (y >> 3) | (y << 29); y *= 0x9e37 + n; break;
    C(0) C(1) C(2) C(3) C(4) C(5) C(6) C(7) C(8) C(9) C(10) C(11) C(12) C(13) C(14)
    default: y = ~y;
  }
  return y;
}

__attribute__((noinline)) static uint32_t tbb_asm(uint32_t i)
{
  uint32_t r;
  __asm volatile(
    "tbb [pc, %1]\n"
    "1: .byte (2f-1b)/2, (3f-1b)/2, (4f-1b)/2, (5f-1b)/2\n"
    "2: movs %0, #10\n\tb 6f\n"
    "3: movs %0, #20\n\tb 6f\n"
    "4: movs %0, #30\n\tb 6f\n"
    "5: movs %0, #40\n"
    "6:\n" : "=l"(r) : "r"(i & 3));
  return r;
}

__attribute__((noinline)) static uint32_t tbh_asm(uint32_t i)
{
  uint32_t r, base;
  __asm volatile(
    "adr.w %1, 1f\n\t"
    "tbh [%1, %2, lsl #1]\n"
    "1: .hword (2f-1b)/2, (3f-1b)/2, (4f-1b)/2\n\t.align 1\n"
    "2: movs %0, #1\n\tb 6f\n"
    "3: movs %0, #2\n\tb 6f\n"
    "4: movs %0, #3\n"
    "6:\n" : "=&l"(r), "=&r"(base) : "r"(i % 3));
  return r;
}

/* IT 블록: 플래그 갱신 규칙 포함 */
__attribute__((noinline)) static uint32_t it_test(uint32_t a, uint32_t b)
{
  uint32_t r0 = a, r1 = b, p;
  __asm volatile(
    "cmp %[x], %[y]\n\t"
    "itete hi\n\t"
    "addhi %[x], %[x], #1\n\t"     /* IT 안의 16비트 ADD는 플래그를 바꾸지 않음 */
    "subls %[x], %[x], #1\n\t"
    "eorhi %[x], %[x], %[y]\n\t"
    "orrls %[x], %[x], %[y]\n\t"
    "it eq\n\t"
    "addseq.w %[x], %[x], %[y]\n\t" /* 32비트 S 형식은 IT 안에서도 플래그 갱신 */
    "ittt mi\n\t"
    "lslmi %[x], %[x], #3\n\t"
    "rsbmi %[y], %[y], #0\n\t"
    "movmi %[y], %[y], ror #7\n\t"
    "mrs %[p], apsr\n\t"
    : [x] "+l"(r0), [y] "+l"(r1), [p] "=&r"(p) :: "cc");
  return t_mix(t_mix(r0, r1), p & 0xf8000000u);
}

__attribute__((noinline)) static uint32_t it_cond_all(uint32_t fl)
{
  uint32_t r = 0;
  __asm volatile(
    "msr apsr_nzcvq, %[fl]\n\t"
    "it eq\n\t orreq %[r], %[r], #1\n\t"
    "it ne\n\t orrne %[r], %[r], #2\n\t"
    "it cs\n\t orrcs %[r], %[r], #4\n\t"
    "it cc\n\t orrcc %[r], %[r], #8\n\t"
    "it mi\n\t orrmi %[r], %[r], #16\n\t"
    "it pl\n\t orrpl %[r], %[r], #32\n\t"
    "it vs\n\t orrvs %[r], %[r], #64\n\t"
    "it vc\n\t orrvc %[r], %[r], #128\n\t"
    "it hi\n\t orrhi %[r], %[r], #256\n\t"
    "it ls\n\t orrls %[r], %[r], #512\n\t"
    "it ge\n\t orrge %[r], %[r], #1024\n\t"
    "it lt\n\t orrlt %[r], %[r], #2048\n\t"
    "it gt\n\t orrgt %[r], %[r], #4096\n\t"
    "it le\n\t orrle %[r], %[r], #8192\n\t"
    "itttt eq\n\t addeq %[r], #1\n\t addeq %[r], #2\n\t addeq %[r], #4\n\t addeq %[r], #8\n\t"
    "iteee ne\n\t addne %[r], #16\n\t addeq %[r], #32\n\t addeq %[r], #64\n\t addeq %[r], #128\n\t"
    : [r] "+l"(r) : [fl] "r"(fl) : "cc");
  return r;
}

__attribute__((noinline)) static uint32_t cbz_count(const uint8_t *p)
{
  uint32_t n = 0;
  __asm volatile(
    "1: ldrb r3, [%1], #1\n\t"
    "cbz r3, 2f\n\t"
    "adds %0, #1\n\t"
    "cbnz r3, 3f\n\t"
    "b 2f\n"
    "3: b 1b\n"
    "2:\n" : "+l"(n), "+l"(p) :: "r3", "cc", "memory");
  return n;
}

__attribute__((noinline)) static uint32_t fib(uint32_t n) { return n < 2 ? n : fib(n - 1) + fib(n - 2); }
__attribute__((noinline)) static int ack(int m, int n)
{
  if (m == 0) return n + 1;
  if (n == 0) return ack(m - 1, 1);
  return ack(m - 1, ack(m, n - 1));
}

static uint32_t f_a(uint32_t x) { return x * 3 + 1; }
static uint32_t f_b(uint32_t x) { return x >> 1; }
static uint32_t f_c(uint32_t x) { return x ^ 0xdeadbeef; }
static uint32_t (*const tab[3])(uint32_t) = { f_a, f_b, f_c };

static int cmp_int(const void *a, const void *b) { int x = *(const int *)a, y = *(const int *)b; return (x > y) - (x < y); }
#include <stdlib.h>

int main(void)
{
  for (int i = -2; i < 18; i++) HR(sw_dense(i));
  t_kv("sw_dense", h);
  h = 0;
  for (uint32_t i = 0; i < 64; i++) HR(sw_big(i, i * 0x10001));
  t_kv("sw_big", h);
  h = 0;
  for (uint32_t i = 0; i < 8; i++) { HR(tbb_asm(i)); HR(tbh_asm(i)); }
  t_kv("tb_asm", h);
  h = 0;
  t_srand(5);
  for (int i = 0; i < 300; i++) {
    uint32_t a = t_rand(), b = t_rand();
    if (i % 5 == 0) b = a;
    if (i % 7 == 0) a = 0x80000000u;
    HR(it_test(a, b));
  }
  t_kv("it_test", h);
  h = 0;
  for (uint32_t f = 0; f < 32; f++) HR(it_cond_all(f << 27));
  t_kv("it_cond", h);
  static const uint8_t str[] = "the quick brown fox jumps over the lazy dog";
  t_kv("cbz", cbz_count(str));
  t_kv("fib20", fib(20));
  t_kv("ack23", ack(2, 3));
  h = 0;
  uint32_t x = 7;
  for (int i = 0; i < 100; i++) { x = tab[x % 3](x); HR(x); }
  t_kv("fptr", h);
  /* 정렬(qsort: 함수 포인터 콜백) */
  static int arr[200];
  t_srand(77);
  for (int i = 0; i < 200; i++) arr[i] = (int)(t_rand() % 20001) - 10000;
  qsort(arr, 200, sizeof arr[0], cmp_int);
  h = 0;
  for (int i = 0; i < 200; i++) HR(arr[i]);
  t_kv("qsort", h);
  /* 조건 연산 다수(IT 생성 유도) */
  h = 0;
  int32_t acc = 0;
  for (int i = 0; i < 1000; i++) {
    int32_t v = (int32_t)t_rand();
    acc += v > 0 ? v >> 3 : -(v >> 5);
    acc = acc < -100000 ? -100000 : acc > 100000 ? 100000 : acc;
    uint32_t u = (uint32_t)v;
    HR(acc); HR(u > 0x80000000u ? u % 13 : u % 17);
    HR(__builtin_clz(u | 1) < 3 ? 1 : (u & 1) ? 2 : 3);
  }
  t_kv("cond", h);
  return 0;
}
