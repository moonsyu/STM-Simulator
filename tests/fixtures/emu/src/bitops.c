/* 비트필드·확장·바이트 순서·CLZ/RBIT */
#include "common/tlib.h"

typedef uint32_t (*fn)(uint32_t a, uint32_t b);
#define B(name, insn) \
  static uint32_t name(uint32_t a, uint32_t b) { uint32_t r = a; \
    __asm volatile(insn : [r] "+&r"(r) : [a] "r"(a), [b] "r"(b)); return r; }
#define BN(name, insn) \
  static uint32_t name(uint32_t a, uint32_t b) { uint32_t r; (void)a; \
    __asm volatile("mov r1, %[b]\n\t" insn "\n\tmov %[r], r0" : [r] "=r"(r) : [b] "r"(b) : "r0", "r1"); return r; }

B(bfi_0_1, "bfi %[r], %[b], #0, #1")
B(bfi_4_8, "bfi %[r], %[b], #4, #8")
B(bfi_31_1, "bfi %[r], %[b], #31, #1")
B(bfi_0_32, "bfi %[r], %[b], #0, #32")
B(bfi_7_20, "bfi %[r], %[b], #7, #20")
B(bfc_3_9, "bfc %[r], #3, #9")
B(bfc_16_16, "bfc %[r], #16, #16")
B(ubfx_0_1, "ubfx %[r], %[b], #0, #1")
B(ubfx_5_11, "ubfx %[r], %[b], #5, #11")
B(ubfx_0_32, "ubfx %[r], %[b], #0, #32")
B(ubfx_31_1, "ubfx %[r], %[b], #31, #1")
B(sbfx_0_1, "sbfx %[r], %[b], #0, #1")
B(sbfx_5_11, "sbfx %[r], %[b], #5, #11")
B(sbfx_0_32, "sbfx %[r], %[b], #0, #32")
B(sbfx_20_12, "sbfx %[r], %[b], #20, #12")
B(clz, "clz %[r], %[b]")
B(rbit, "rbit %[r], %[b]")
B(rev_w, "rev.w %[r], %[b]")
B(rev16_w, "rev16.w %[r], %[b]")
B(revsh_w, "revsh.w %[r], %[b]")
B(sxtb_w, "sxtb.w %[r], %[b], ror #8")
B(sxth_w, "sxth.w %[r], %[b], ror #16")
B(uxtb_w, "uxtb.w %[r], %[b], ror #24")
B(uxth_w, "uxth.w %[r], %[b], ror #8")
B(sxtb_w0, "sxtb.w %[r], %[b]")
B(uxth_w0, "uxth.w %[r], %[b]")
BN(rev_n, "rev.n r0, r1")
BN(rev16_n, "rev16.n r0, r1")
BN(revsh_n, "revsh.n r0, r1")
BN(sxtb_n, "sxtb.n r0, r1")
BN(sxth_n, "sxth.n r0, r1")
BN(uxtb_n, "uxtb.n r0, r1")
BN(uxth_n, "uxth.n r0, r1")
B(lsl_w_r, "lsl.w %[r], %[a], %[b]")
B(ror_i, "ror.w %[r], %[b], #9")
B(asr_i, "asr.w %[r], %[b], #1")
B(rrx_i, "rrx %[r], %[b]")

struct op { const char *name; fn f; };
#define E(x) { #x, x }
static const struct op ops[] = {
  E(bfi_0_1), E(bfi_4_8), E(bfi_31_1), E(bfi_0_32), E(bfi_7_20), E(bfc_3_9), E(bfc_16_16), E(ubfx_0_1), E(ubfx_5_11),
  E(ubfx_0_32), E(ubfx_31_1), E(sbfx_0_1), E(sbfx_5_11), E(sbfx_0_32), E(sbfx_20_12), E(clz), E(rbit), E(rev_w),
  E(rev16_w), E(revsh_w), E(sxtb_w), E(sxth_w), E(uxtb_w), E(uxth_w), E(sxtb_w0), E(uxth_w0), E(rev_n), E(rev16_n),
  E(revsh_n), E(sxtb_n), E(sxth_n), E(uxtb_n), E(uxth_n), E(lsl_w_r), E(ror_i), E(asr_i),
};

/* C 수준 비트 조작 */
struct bits { unsigned a : 3; signed b : 7; unsigned c : 13; signed d : 9; };

int main(void)
{
  uint32_t total = 0;
  for (unsigned k = 0; k < sizeof(ops) / sizeof(ops[0]); k++) {
    uint32_t h = 0x811c9dc5;
    t_srand(99 + k);
    for (unsigned i = 0; i < 800; i++) {
      uint32_t a = t_rand(), b = t_rand();
      if (i < 40) b = (i & 1) ? (1u << (i >> 1)) : ~(1u << (i >> 1));
      if (i == 40) b = 0;
      h = t_mix(h, ops[k].f(a, b));
    }
    t_kv(ops[k].name, h);
    total = t_mix(total, h);
  }
  uint32_t h = 0;
  volatile struct bits bb = { 0 };
  for (int i = 0; i < 500; i++) {
    uint32_t x = t_rand();
    bb.a = x; bb.b = x >> 3; bb.c = x >> 10; bb.d = x >> 23;
    h = t_mix(h, bb.a + (uint32_t)bb.b * 3 + bb.c * 7 + (uint32_t)bb.d * 11);
    h = t_mix(h, __builtin_popcount(x) + __builtin_ctz(x | 1) * 64 + __builtin_clz(x | 1) * 4096);
    h = t_mix(h, __builtin_bswap32(x) ^ (uint32_t)__builtin_bswap16((uint16_t)x));
  }
  t_kv("cbits", h);
  t_kv("total", total);
  return 0;
}
