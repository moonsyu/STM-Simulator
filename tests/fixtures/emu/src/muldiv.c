/* 곱셈·나눗셈 */
#include "common/tlib.h"

typedef void (*fn)(uint32_t a, uint32_t b, uint32_t c, uint32_t d, uint32_t fl, uint32_t out[3]);

/* 결과 2개(r0 = lo/d, r1 = hi) + APSR */
#define M(name, insn)                                                                     \
  static void name(uint32_t a, uint32_t b, uint32_t c, uint32_t d, uint32_t fl, uint32_t out[3]) { \
    uint32_t lo = c, hi = d, p;                                                           \
    __asm volatile("msr apsr_nzcvqg, %[fl]\n\t" insn "\n\tmrs %[p], apsr"                 \
                   : [lo] "+&r"(lo), [hi] "+&r"(hi), [p] "=&r"(p)                         \
                   : [a] "r"(a), [b] "r"(b), [fl] "r"(fl) : "cc");                        \
    out[0] = lo; out[1] = hi; out[2] = p; }

M(f_mul, "mul %[lo], %[a], %[b]")
M(f_mla, "mla %[lo], %[a], %[b], %[hi]")
M(f_mls, "mls %[lo], %[a], %[b], %[hi]")
M(f_umull, "umull %[lo], %[hi], %[a], %[b]")
M(f_smull, "smull %[lo], %[hi], %[a], %[b]")
M(f_umlal, "umlal %[lo], %[hi], %[a], %[b]")
M(f_smlal, "smlal %[lo], %[hi], %[a], %[b]")
M(f_umaal, "umaal %[lo], %[hi], %[a], %[b]")
M(f_udiv, "udiv %[lo], %[a], %[b]")
M(f_sdiv, "sdiv %[lo], %[a], %[b]")

static void f_muls(uint32_t a, uint32_t b, uint32_t c, uint32_t d, uint32_t fl, uint32_t out[3])
{
  uint32_t r, p;
  (void)c; (void)d;
  __asm volatile("mov r0, %[a]\n\tmov r1, %[b]\n\tmsr apsr_nzcvqg, %[fl]\n\tmuls.n r0, r1, r0\n\tmrs %[p], apsr\n\tmov %[r], r0"
                 : [r] "=&r"(r), [p] "=&r"(p) : [a] "r"(a), [b] "r"(b), [fl] "r"(fl) : "r0", "r1", "cc");
  out[0] = r; out[1] = 0; out[2] = p;
}

struct op { const char *name; fn f; };
#define E(x) { #x, x }
static const struct op ops[] = {
  E(f_mul), E(f_mla), E(f_mls), E(f_umull), E(f_smull), E(f_umlal), E(f_smlal), E(f_umaal), E(f_udiv), E(f_sdiv), E(f_muls),
};
static const uint32_t edge[] = { 0, 1, 2, 3, 7, 0x7fffffff, 0x80000000, 0x80000001, 0xffffffff, 0xfffffffe, 0x10000, 0xffff, 0x12345678 };
#define NE (sizeof(edge) / sizeof(edge[0]))

int main(void)
{
  uint32_t total = 0;
  for (unsigned k = 0; k < sizeof(ops) / sizeof(ops[0]); k++) {
    uint32_t h = 0x811c9dc5;
    t_srand(1234 + k);
    for (unsigned i = 0; i < NE * NE + 1000; i++) {
      uint32_t a, b;
      if (i < NE * NE) { a = edge[i / NE]; b = edge[i % NE]; }
      else {
        a = t_rand(); b = t_rand();
        if ((i & 3) == 1) b >>= (t_rand() & 31);
        if ((i & 3) == 2) a >>= (t_rand() & 31);
      }
      uint32_t c = t_rand(), d = t_rand(), fl = t_rand() & 0xf80f0000u, out[3];
      ops[k].f(a, b, c, d, fl, out);
      h = t_mix(h, out[0]);
      h = t_mix(h, out[1]);
      h = t_mix(h, out[2] & 0xf80f0000u);
    }
    t_kv(ops[k].name, h);
    total = t_mix(total, h);
  }
  /* C 수준 64비트 연산(libgcc) */
  uint64_t acc = 0x0123456789abcdefull;
  int64_t sacc = -5;
  for (int i = 1; i < 300; i++) {
    acc = acc * 6364136223846793005ull + 1442695040888963407ull;
    acc ^= acc / (uint64_t)(i * 977 + 1);
    sacc = sacc * 3 - (int64_t)acc % 1000003 + (sacc >> 3) / 7;
  }
  t_kv("u64lo", (uint32_t)acc);
  t_kv("u64hi", (uint32_t)(acc >> 32));
  t_kv("s64lo", (uint32_t)sacc);
  t_kv("s64hi", (uint32_t)((uint64_t)sacc >> 32));
  t_kv("total", total);
  return 0;
}
