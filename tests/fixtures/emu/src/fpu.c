/* FPv4-SP: 산술·융합·제곱근·변환·비교·반정밀도·FPSCR 플래그·반올림 모드 */
#include "common/tlib.h"
#include <math.h>

typedef uint32_t (*ffn)(uint32_t a, uint32_t b, uint32_t c, uint32_t mode, uint32_t *fs);

/* s0=a, s1=b, s2=c → 결과 s2 */
#define F(name, insn)                                                                    \
  static uint32_t name(uint32_t a, uint32_t b, uint32_t c, uint32_t mode, uint32_t *fs) { \
    uint32_t r, f;                                                                       \
    __asm volatile("vmov s0, %[a]\n\tvmov s1, %[b]\n\tvmov s2, %[c]\n\tvmsr fpscr, %[m]\n\t" insn \
                   "\n\tvmrs %[f], fpscr\n\tvmov %[r], s2"                               \
                   : [r] "=r"(r), [f] "=r"(f) : [a] "r"(a), [b] "r"(b), [c] "r"(c), [m] "r"(mode) \
                   : "s0", "s1", "s2");                                                  \
    *fs = f; return r; }

F(vadd, "vadd.f32 s2, s0, s1")
F(vsub, "vsub.f32 s2, s0, s1")
F(vmul, "vmul.f32 s2, s0, s1")
F(vnmul, "vnmul.f32 s2, s0, s1")
F(vdiv, "vdiv.f32 s2, s0, s1")
F(vmla, "vmla.f32 s2, s0, s1")
F(vmls, "vmls.f32 s2, s0, s1")
F(vnmla, "vnmla.f32 s2, s0, s1")
F(vnmls, "vnmls.f32 s2, s0, s1")
F(vfma, "vfma.f32 s2, s0, s1")
F(vfms, "vfms.f32 s2, s0, s1")
F(vfnma, "vfnma.f32 s2, s0, s1")
F(vfnms, "vfnms.f32 s2, s0, s1")
F(vsqrt, "vsqrt.f32 s2, s0")
F(vabs, "vabs.f32 s2, s0")
F(vneg, "vneg.f32 s2, s0")
F(vmovr, "vmov.f32 s2, s0")
F(vcmp, "vcmp.f32 s0, s1")
F(vcmpe, "vcmpe.f32 s0, s1")
F(vcmpz, "vcmp.f32 s0, #0")
F(vcmpez, "vcmpe.f32 s0, #0")
F(cvt_s32, "vcvt.s32.f32 s2, s0")
F(cvt_u32, "vcvt.u32.f32 s2, s0")
F(cvtr_s32, "vcvtr.s32.f32 s2, s0")
F(cvtr_u32, "vcvtr.u32.f32 s2, s0")
F(cvt_f_s32, "vcvt.f32.s32 s2, s0")
F(cvt_f_u32, "vcvt.f32.u32 s2, s0")
F(fx_s32_16, "vmov s2, s0\n\tvcvt.s32.f32 s2, s2, #16")
F(fx_u32_1, "vmov s2, s0\n\tvcvt.u32.f32 s2, s2, #1")
F(fx_s16_8, "vmov s2, s0\n\tvcvt.s16.f32 s2, s2, #8")
F(fx_u16_15, "vmov s2, s0\n\tvcvt.u16.f32 s2, s2, #15")
F(fx_s32_32, "vmov s2, s0\n\tvcvt.s32.f32 s2, s2, #32")
F(fx_f_s32_16, "vmov s2, s0\n\tvcvt.f32.s32 s2, s2, #16")
F(fx_f_u32_31, "vmov s2, s0\n\tvcvt.f32.u32 s2, s2, #31")
F(fx_f_s16_4, "vmov s2, s0\n\tvcvt.f32.s16 s2, s2, #4")
F(fx_f_u16_16, "vmov s2, s0\n\tvcvt.f32.u16 s2, s2, #16")
F(h_b_f16, "vcvtb.f16.f32 s2, s0")
F(h_t_f16, "vcvtt.f16.f32 s2, s0")
F(h_b_f32, "vcvtb.f32.f16 s2, s0")
F(h_t_f32, "vcvtt.f32.f16 s2, s0")

struct op { const char *name; ffn f; int nmodes; };
#define E(x, n) { #x, x, n }
static const struct op ops[] = {
  E(vadd, 7), E(vsub, 7), E(vmul, 7), E(vnmul, 3), E(vdiv, 7), E(vmla, 4), E(vmls, 3), E(vnmla, 3), E(vnmls, 3),
  E(vfma, 7), E(vfms, 4), E(vfnma, 4), E(vfnms, 4), E(vsqrt, 7), E(vabs, 2), E(vneg, 2), E(vmovr, 1),
  E(vcmp, 2), E(vcmpe, 2), E(vcmpz, 2), E(vcmpez, 2), E(cvt_s32, 3), E(cvt_u32, 3), E(cvtr_s32, 7), E(cvtr_u32, 7),
  E(cvt_f_s32, 7), E(cvt_f_u32, 7), E(fx_s32_16, 3), E(fx_u32_1, 3), E(fx_s16_8, 3), E(fx_u16_15, 3), E(fx_s32_32, 2),
  E(fx_f_s32_16, 7), E(fx_f_u32_31, 7), E(fx_f_s16_4, 4), E(fx_f_u16_16, 4), E(h_b_f16, 7), E(h_t_f16, 7),
  E(h_b_f32, 3), E(h_t_f32, 3),
};
/* RN, RP, RM, RZ, FZ, DN, FZ|DN|RZ */
static const uint32_t modes[7] = { 0, 0x00400000, 0x00800000, 0x00c00000, 0x01000000, 0x02000000, 0x03c00000 };

static const uint32_t special[] = {
  0x00000000, 0x80000000, 0x3f800000, 0xbf800000, 0x7f800000, 0xff800000, 0x7fc00000, 0x7fc12345, 0xffc00001,
  0x7f800001, 0x7fa00000, 0xff812345, 0x00000001, 0x807fffff, 0x00800000, 0x7f7fffff, 0xff7fffff, 0x34000000,
  0x4b800000, 0x3eaaaaab, 0x40490fdb, 0x4f000000, 0xcf000000, 0x4f800000, 0x3f000000, 0x3fc00000, 0x40200000,
  0xbfc00000, 0x477fe000, 0x47800000, 0x387fc000, 0x33800000, 0x00400000, 0x7f000000, 0x0d000000, 0x3c00bc00,
  0x7bff7c00, 0x00017e00, 0x46fffe00, 0xc6fffe00,
};
#define NS (sizeof(special) / sizeof(special[0]))

static uint32_t rnd_float(void)
{
  uint32_t r = t_rand();
  switch (r & 7) {
    case 0: return r;                                                   /* 임의 비트 */
    case 1: return (r & 0x807fffff) | ((120 + (t_rand() % 16)) << 23);  /* 1 근처 */
    case 2: return (r & 0x807fffff) | ((t_rand() % 6) << 23);           /* 비정규 근처 */
    case 3: return (r & 0x807fffff) | ((248 + t_rand() % 7) << 23);     /* 큰 수 */
    case 4: return special[t_rand() % NS];
    case 5: { float f = (float)((int32_t)t_rand() >> (t_rand() & 31)); uint32_t u; __builtin_memcpy(&u, &f, 4); return u; }
    case 6: return t_rand() >> (t_rand() & 31);                         /* 정수 비트 */
    default: return (r & 0x80ffffff) | (0x3e000000 + ((t_rand() & 0x7) << 23));
  }
}

static uint32_t h;
#define HR(x) h = t_mix(h, (uint32_t)(x))

int main(void)
{
  uint32_t total = 0;
  for (unsigned k = 0; k < sizeof(ops) / sizeof(ops[0]); k++) {
    for (int mi = 0; mi < ops[k].nmodes; mi++) {
      h = 0x811c9dc5;
      t_srand(4242 + k * 13 + mi);
      for (unsigned i = 0; i < NS * NS + 1500; i++) {
        uint32_t a, b, c, fs;
        if (i < NS * NS) { a = special[i / NS]; b = special[i % NS]; c = special[(i * 7) % NS]; }
        else { a = rnd_float(); b = rnd_float(); c = rnd_float(); }
        if ((i & 15) == 3) { float fa, fb; __builtin_memcpy(&fa, &a, 4); fb = -fa * 0.5f; __builtin_memcpy(&b, &fb, 4); }
        uint32_t r = ops[k].f(a, b, c, modes[mi] | ((i & 1) ? 0x9f : 0), &fs);
        HR(r);
        HR(fs);
#ifdef DEBUG_OP
        if (k == DEBUG_OP && mi == DEBUG_MODE) { t_hex(a); t_putc(' '); t_hex(b); t_putc(' '); t_hex(c); t_putc(' '); t_hex(r); t_putc(' '); t_hex(fs); t_putc('\n'); }
#endif
      }
      t_puts(ops[k].name);
      t_putc('/');
      t_dec(mi);
      t_putc('=');
      t_hex(h);
      t_putc('\n');
      total = t_mix(total, h);
    }
  }
  /* VMOV 즉치, 전송, 64비트 이동 */
  h = 0;
  uint32_t r0, r1, r2, r3;
  __asm volatile("vmov.f32 s4, #1.5\n\tvmov.f32 s5, #-0.1875\n\tvmov.f32 s6, #31.0\n\tvmov.f32 s7, #0.125\n\t"
                 "vmov %0, s4\n\tvmov %1, s5\n\tvmov %2, s6\n\tvmov %3, s7"
                 : "=r"(r0), "=r"(r1), "=r"(r2), "=r"(r3) :: "s4", "s5", "s6", "s7"); HR(r0); HR(r1); HR(r2); HR(r3);
  __asm volatile("vmov s8, s9, %2, %3\n\tvmov %0, %1, s8, s9" : "=r"(r0), "=r"(r1) : "r"(0x11111111), "r"(0x22222222) : "s8", "s9"); HR(r0); HR(r1);
  __asm volatile("vmov d5, %2, %3\n\tvmov %0, %1, d5" : "=r"(r0), "=r"(r1) : "r"(0x33333333), "r"(0x44444444) : "s10", "s11"); HR(r0); HR(r1);
  /* VLDR/VSTR/VLDM/VSTM/VPUSH/VPOP */
  static uint32_t mem[16] __attribute__((aligned(8)));
  for (int i = 0; i < 16; i++) mem[i] = 0x01010101u * (i + 1);
  uint32_t p = (uint32_t)mem;
  __asm volatile("vldr s16, [%0, #4]\n\tvldr d9, [%0, #8]\n\tvstr s16, [%0, #60]\n\tvstr d9, [%0, #48]" :: "r"(p) : "s16", "s18", "s19", "memory");
  __asm volatile("vldmia %0!, {s20-s23}\n\tvstmdb %0!, {s21-s22}\n\tvldmia %0, {d12-d13}\n\tvpush {s20-s23}\n\tvpush {d12}\n\t"
                 "vmov.f32 s20, #1.0\n\tvpop {d12}\n\tvpop {s20-s23}\n\tadd %0, #32\n\tvstmia %0!, {d10-d11}\n\tvstmia %0, {s24-s27}"
                 : "+r"(p) :: "s20", "s21", "s22", "s23", "s24", "s25", "s26", "s27", "memory");
  for (int i = 0; i < 16; i++) HR(mem[i]);
  HR(p - (uint32_t)mem);
  /* VMRS APSR_nzcv */
  float fx = 1.0f, fy = 2.0f;
  for (int i = 0; i < 4; i++) {
    uint32_t ap;
    __asm volatile("vcmp.f32 %1, %2\n\tvmrs APSR_nzcv, fpscr\n\tmrs %0, apsr" : "=r"(ap) : "t"(fx), "t"(fy) : "cc");
    HR(ap & 0xf0000000u);
    fx += 0.75f;
  }
  t_kv("vmov_ldst", h);
  /* C 수준 libm */
  h = 0;

  __asm volatile("vmsr fpscr, %0" :: "r"(0));
  for (int i = 0; i < 64; i++) {
    float x = (float)i * 0.37f - 7.0f;
    float y;
    y = sinf(x); { uint32_t u; __builtin_memcpy(&u, &y, 4); HR(u); }
    y = cosf(x); { uint32_t u; __builtin_memcpy(&u, &y, 4); HR(u); }
    y = expf(x * 0.5f); { uint32_t u; __builtin_memcpy(&u, &y, 4); HR(u); }
    y = logf(fabsf(x) + 0.01f); { uint32_t u; __builtin_memcpy(&u, &y, 4); HR(u); }
    y = powf(fabsf(x), 1.3f); { uint32_t u; __builtin_memcpy(&u, &y, 4); HR(u); }
    y = sqrtf(fabsf(x)); { uint32_t u; __builtin_memcpy(&u, &y, 4); HR(u); }
    y = atan2f(x, 3.0f); { uint32_t u; __builtin_memcpy(&u, &y, 4); HR(u); }
    double d = (double)x * 1.0000001 + 1e-9; /* 소프트웨어 배정밀도 */
    d = d * d / 3.0 + sqrt(fabs(d));
    { uint64_t u; __builtin_memcpy(&u, &d, 8); HR((uint32_t)u); HR((uint32_t)(u >> 32)); }
  }
  t_kv("libm", h);
  t_kv("total", total);
  return 0;
}
