/* DSP 확장: 포화·병렬·SIMD 곱셈, Q·GE 플래그 */
#include "common/tlib.h"

typedef void (*fn)(uint32_t a, uint32_t b, uint32_t c, uint32_t d, uint32_t fl, uint32_t out[3]);

/* 3피연산자: r = op(a, b) */
#define D3(name, insn)                                                                    \
  static void name(uint32_t a, uint32_t b, uint32_t c, uint32_t d, uint32_t fl, uint32_t out[3]) { \
    uint32_t r, p; (void)c; (void)d;                                                       \
    __asm volatile("msr apsr_nzcvqg, %[fl]\n\t" insn "\n\tmrs %[p], apsr"                  \
                   : [r] "=&r"(r), [p] "=&r"(p) : [a] "r"(a), [b] "r"(b), [fl] "r"(fl) : "cc"); \
    out[0] = r; out[1] = 0; out[2] = p; }
/* 누산: r = op(a, b, c) */
#define D4(name, insn)                                                                    \
  static void name(uint32_t a, uint32_t b, uint32_t c, uint32_t d, uint32_t fl, uint32_t out[3]) { \
    uint32_t r, p; (void)d;                                                                \
    __asm volatile("msr apsr_nzcvqg, %[fl]\n\t" insn "\n\tmrs %[p], apsr"                  \
                   : [r] "=&r"(r), [p] "=&r"(p) : [a] "r"(a), [b] "r"(b), [c] "r"(c), [fl] "r"(fl) : "cc"); \
    out[0] = r; out[1] = 0; out[2] = p; }
/* 64비트 누산: lo=c, hi=d */
#define DL(name, insn)                                                                    \
  static void name(uint32_t a, uint32_t b, uint32_t c, uint32_t d, uint32_t fl, uint32_t out[3]) { \
    uint32_t lo = c, hi = d, p;                                                            \
    __asm volatile("msr apsr_nzcvqg, %[fl]\n\t" insn "\n\tmrs %[p], apsr"                  \
                   : [lo] "+&r"(lo), [hi] "+&r"(hi), [p] "=&r"(p) : [a] "r"(a), [b] "r"(b), [fl] "r"(fl) : "cc"); \
    out[0] = lo; out[1] = hi; out[2] = p; }

D3(qadd, "qadd %[r], %[a], %[b]")
D3(qsub, "qsub %[r], %[a], %[b]")
D3(qdadd, "qdadd %[r], %[a], %[b]")
D3(qdsub, "qdsub %[r], %[a], %[b]")
D3(sadd16, "sadd16 %[r], %[a], %[b]")
D3(ssub16, "ssub16 %[r], %[a], %[b]")
D3(sasx, "sasx %[r], %[a], %[b]")
D3(ssax, "ssax %[r], %[a], %[b]")
D3(sadd8, "sadd8 %[r], %[a], %[b]")
D3(ssub8, "ssub8 %[r], %[a], %[b]")
D3(uadd16, "uadd16 %[r], %[a], %[b]")
D3(usub16, "usub16 %[r], %[a], %[b]")
D3(uasx, "uasx %[r], %[a], %[b]")
D3(usax, "usax %[r], %[a], %[b]")
D3(uadd8, "uadd8 %[r], %[a], %[b]")
D3(usub8, "usub8 %[r], %[a], %[b]")
D3(qadd16, "qadd16 %[r], %[a], %[b]")
D3(qsub16, "qsub16 %[r], %[a], %[b]")
D3(qasx, "qasx %[r], %[a], %[b]")
D3(qsax, "qsax %[r], %[a], %[b]")
D3(qadd8, "qadd8 %[r], %[a], %[b]")
D3(qsub8, "qsub8 %[r], %[a], %[b]")
D3(uqadd16, "uqadd16 %[r], %[a], %[b]")
D3(uqsub16, "uqsub16 %[r], %[a], %[b]")
D3(uqasx, "uqasx %[r], %[a], %[b]")
D3(uqsax, "uqsax %[r], %[a], %[b]")
D3(uqadd8, "uqadd8 %[r], %[a], %[b]")
D3(uqsub8, "uqsub8 %[r], %[a], %[b]")
D3(shadd16, "shadd16 %[r], %[a], %[b]")
D3(shsub16, "shsub16 %[r], %[a], %[b]")
D3(shasx, "shasx %[r], %[a], %[b]")
D3(shsax, "shsax %[r], %[a], %[b]")
D3(shadd8, "shadd8 %[r], %[a], %[b]")
D3(shsub8, "shsub8 %[r], %[a], %[b]")
D3(uhadd16, "uhadd16 %[r], %[a], %[b]")
D3(uhsub16, "uhsub16 %[r], %[a], %[b]")
D3(uhasx, "uhasx %[r], %[a], %[b]")
D3(uhsax, "uhsax %[r], %[a], %[b]")
D3(uhadd8, "uhadd8 %[r], %[a], %[b]")
D3(uhsub8, "uhsub8 %[r], %[a], %[b]")
D3(sel, "sel %[r], %[a], %[b]")
D3(usad8, "usad8 %[r], %[a], %[b]")
D3(smulbb, "smulbb %[r], %[a], %[b]")
D3(smulbt, "smulbt %[r], %[a], %[b]")
D3(smultb, "smultb %[r], %[a], %[b]")
D3(smultt, "smultt %[r], %[a], %[b]")
D3(smulwb, "smulwb %[r], %[a], %[b]")
D3(smulwt, "smulwt %[r], %[a], %[b]")
D3(smuad, "smuad %[r], %[a], %[b]")
D3(smuadx, "smuadx %[r], %[a], %[b]")
D3(smusd, "smusd %[r], %[a], %[b]")
D3(smusdx, "smusdx %[r], %[a], %[b]")
D3(smmul, "smmul %[r], %[a], %[b]")
D3(smmulr, "smmulr %[r], %[a], %[b]")
D3(pkhbt, "pkhbt %[r], %[a], %[b], lsl #11")
D3(pkhbt0, "pkhbt %[r], %[a], %[b]")
D3(pkhtb, "pkhtb %[r], %[a], %[b], asr #7")
D3(pkhtb32, "pkhtb %[r], %[a], %[b], asr #31")
D3(sxtab, "sxtab %[r], %[a], %[b], ror #8")
D3(sxtah, "sxtah %[r], %[a], %[b], ror #24")
D3(sxtab16, "sxtab16 %[r], %[a], %[b]")
D3(uxtab, "uxtab %[r], %[a], %[b], ror #16")
D3(uxtah, "uxtah %[r], %[a], %[b]")
D3(uxtab16, "uxtab16 %[r], %[a], %[b], ror #8")
D3(sxtb16, "sxtb16 %[r], %[b], ror #8")
D3(uxtb16, "uxtb16 %[r], %[b]")
D3(ssat_l, "ssat %[r], #8, %[b], lsl #3")
D3(ssat_a, "ssat %[r], #16, %[b], asr #9")
D3(ssat32, "ssat %[r], #32, %[b]")
D3(ssat1, "ssat %[r], #1, %[b]")
D3(usat_l, "usat %[r], #8, %[b], lsl #1")
D3(usat_a, "usat %[r], #15, %[b], asr #31")
D3(usat0, "usat %[r], #0, %[b]")
D3(usat31, "usat %[r], #31, %[b]")
D3(ssat16, "ssat16 %[r], #9, %[b]")
D3(usat16, "usat16 %[r], #7, %[b]")
D4(smlabb, "smlabb %[r], %[a], %[b], %[c]")
D4(smlabt, "smlabt %[r], %[a], %[b], %[c]")
D4(smlatb, "smlatb %[r], %[a], %[b], %[c]")
D4(smlatt, "smlatt %[r], %[a], %[b], %[c]")
D4(smlawb, "smlawb %[r], %[a], %[b], %[c]")
D4(smlawt, "smlawt %[r], %[a], %[b], %[c]")
D4(smlad, "smlad %[r], %[a], %[b], %[c]")
D4(smladx, "smladx %[r], %[a], %[b], %[c]")
D4(smlsd, "smlsd %[r], %[a], %[b], %[c]")
D4(smlsdx, "smlsdx %[r], %[a], %[b], %[c]")
D4(smmla, "smmla %[r], %[a], %[b], %[c]")
D4(smmlar, "smmlar %[r], %[a], %[b], %[c]")
D4(smmls, "smmls %[r], %[a], %[b], %[c]")
D4(smmlsr, "smmlsr %[r], %[a], %[b], %[c]")
D4(usada8, "usada8 %[r], %[a], %[b], %[c]")
DL(smlalbb, "smlalbb %[lo], %[hi], %[a], %[b]")
DL(smlalbt, "smlalbt %[lo], %[hi], %[a], %[b]")
DL(smlaltb, "smlaltb %[lo], %[hi], %[a], %[b]")
DL(smlaltt, "smlaltt %[lo], %[hi], %[a], %[b]")
DL(smlald, "smlald %[lo], %[hi], %[a], %[b]")
DL(smlaldx, "smlaldx %[lo], %[hi], %[a], %[b]")
DL(smlsld, "smlsld %[lo], %[hi], %[a], %[b]")
DL(smlsldx, "smlsldx %[lo], %[hi], %[a], %[b]")

struct op { const char *name; fn f; };
#define E(x) { #x, x }
static const struct op ops[] = {
  E(qadd), E(qsub), E(qdadd), E(qdsub), E(sadd16), E(ssub16), E(sasx), E(ssax), E(sadd8), E(ssub8), E(uadd16),
  E(usub16), E(uasx), E(usax), E(uadd8), E(usub8), E(qadd16), E(qsub16), E(qasx), E(qsax), E(qadd8), E(qsub8),
  E(uqadd16), E(uqsub16), E(uqasx), E(uqsax), E(uqadd8), E(uqsub8), E(shadd16), E(shsub16), E(shasx), E(shsax),
  E(shadd8), E(shsub8), E(uhadd16), E(uhsub16), E(uhasx), E(uhsax), E(uhadd8), E(uhsub8), E(sel), E(usad8),
  E(smulbb), E(smulbt), E(smultb), E(smultt), E(smulwb), E(smulwt), E(smuad), E(smuadx), E(smusd), E(smusdx),
  E(smmul), E(smmulr), E(pkhbt), E(pkhbt0), E(pkhtb), E(pkhtb32), E(sxtab), E(sxtah), E(sxtab16), E(uxtab), E(uxtah),
  E(uxtab16), E(sxtb16), E(uxtb16), E(ssat_l), E(ssat_a), E(ssat32), E(ssat1), E(usat_l), E(usat_a), E(usat0), E(usat31),
  E(ssat16), E(usat16), E(smlabb), E(smlabt), E(smlatb), E(smlatt), E(smlawb), E(smlawt), E(smlad), E(smladx),
  E(smlsd), E(smlsdx), E(smmla), E(smmlar), E(smmls), E(smmlsr), E(usada8), E(smlalbb), E(smlalbt), E(smlaltb),
  E(smlaltt), E(smlald), E(smlaldx), E(smlsld), E(smlsldx),
};
static const uint32_t edge[] = {
  0, 1, 0x7fff, 0x8000, 0xffff, 0x7fff7fff, 0x80008000, 0x80000000, 0x7fffffff, 0xffffffff, 0x7f7f7f7f, 0x80808080,
  0x01ff80fe, 0x12345678, 0xfedcba98,
};
#define NE (sizeof(edge) / sizeof(edge[0]))

int main(void)
{
  uint32_t total = 0;
  for (unsigned k = 0; k < sizeof(ops) / sizeof(ops[0]); k++) {
    uint32_t h = 0x811c9dc5;
    t_srand(777 + k * 31);
    for (unsigned i = 0; i < NE * NE + 600; i++) {
      uint32_t a, b;
      if (i < NE * NE) { a = edge[i / NE]; b = edge[i % NE]; }
      else { a = t_rand(); b = t_rand(); }
      uint32_t c = t_rand(), d = t_rand(), out[3];
      if (i & 1) c = edge[(i >> 1) % NE];
      uint32_t fl = t_rand() & 0xf80f0000u;
      if (i & 2) fl &= ~0x08000000u; /* Q=0에서 시작 */
      ops[k].f(a, b, c, d, fl, out);
      h = t_mix(h, out[0]);
      h = t_mix(h, out[1]);
      h = t_mix(h, out[2] & 0xf80f0000u);
    }
    t_kv(ops[k].name, h);
    total = t_mix(total, h);
  }
  t_kv("total", total);
  return 0;
}
