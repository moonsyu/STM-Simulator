/* 정수 ALU와 플래그: 무작위·경계값 피연산자 스윕의 체크섬 */
#include "common/tlib.h"

typedef uint32_t (*fn2)(uint32_t a, uint32_t b, uint32_t fl, uint32_t *ps);

/* 32비트(wide) 형식: 컴파일러가 레지스터 선택 */
#define W(name, insn)                                                              \
  static uint32_t name(uint32_t a, uint32_t b, uint32_t fl, uint32_t *ps) {        \
    uint32_t r, p;                                                                 \
    __asm volatile("msr apsr_nzcvq, %[fl]\n\t" insn "\n\tmrs %[p], apsr"           \
                   : [r] "=&r"(r), [p] "=&r"(p)                                    \
                   : [a] "r"(a), [b] "r"(b), [fl] "r"(fl) : "cc");                 \
    *ps = p; return r; }

/* 16비트(narrow) 형식: r0=a, r1=b, 결과 r0 */
#define N(name, insn)                                                              \
  static uint32_t name(uint32_t a, uint32_t b, uint32_t fl, uint32_t *ps) {        \
    uint32_t r, p;                                                                 \
    __asm volatile("mov r0, %[a]\n\tmov r1, %[b]\n\tmsr apsr_nzcvq, %[fl]\n\t" insn \
                   "\n\tmrs %[p], apsr\n\tmov %[r], r0"                            \
                   : [r] "=&r"(r), [p] "=&r"(p)                                    \
                   : [a] "r"(a), [b] "r"(b), [fl] "r"(fl) : "r0", "r1", "cc");     \
    *ps = p; return r; }

W(w_adds, "adds.w %[r], %[a], %[b]")
W(w_adds_lsl, "adds.w %[r], %[a], %[b], lsl #7")
W(w_adds_asr, "adds.w %[r], %[a], %[b], asr #31")
W(w_adcs, "adcs.w %[r], %[a], %[b]")
W(w_adcs_ror, "adcs.w %[r], %[a], %[b], ror #13")
W(w_subs, "subs.w %[r], %[a], %[b]")
W(w_subs_lsr, "subs.w %[r], %[a], %[b], lsr #32")
W(w_sbcs, "sbcs.w %[r], %[a], %[b]")
W(w_sbcs_rrx, "sbcs.w %[r], %[a], %[b], rrx")
W(w_rsbs, "rsbs.w %[r], %[a], %[b]")
W(w_rsbs_lsl, "rsbs.w %[r], %[a], %[b], lsl #1")
W(w_ands, "ands.w %[r], %[a], %[b]")
W(w_ands_lsl, "ands.w %[r], %[a], %[b], lsl #1")
W(w_ands_lsr, "ands.w %[r], %[a], %[b], lsr #1")
W(w_ands_asr32, "ands.w %[r], %[a], %[b], asr #32")
W(w_orrs_ror, "orrs.w %[r], %[a], %[b], ror #1")
W(w_eors_rrx, "eors.w %[r], %[a], %[b], rrx")
W(w_bics_lsl, "bics.w %[r], %[a], %[b], lsl #31")
W(w_orns, "orns %[r], %[a], %[b], lsr #3")
W(w_movs_lsl, "movs.w %[r], %[b], lsl #4")
W(w_movs_lsr, "movs.w %[r], %[b], lsr #17")
W(w_movs_asr, "movs.w %[r], %[b], asr #9")
W(w_movs_ror, "movs.w %[r], %[b], ror #23")
W(w_movs_rrx, "movs.w %[r], %[b], rrx")
W(w_mvns_asr, "mvns.w %[r], %[b], asr #3")
W(w_tst, "tst.w %[a], %[b], lsl #3\n\tmov %[r], %[a]")
W(w_teq, "teq.w %[a], %[b], ror #5\n\tmov %[r], %[a]")
W(w_cmp, "cmp.w %[a], %[b]\n\tmov %[r], %[a]")
W(w_cmp_lsl, "cmp.w %[a], %[b], lsl #2\n\tmov %[r], %[a]")
W(w_cmn, "cmn.w %[a], %[b]\n\tmov %[r], %[a]")
W(w_cmn_asr, "cmn.w %[a], %[b], asr #2\n\tmov %[r], %[a]")
W(w_lsls_r, "lsls.w %[r], %[a], %[b]")
W(w_lsrs_r, "lsrs.w %[r], %[a], %[b]")
W(w_asrs_r, "asrs.w %[r], %[a], %[b]")
W(w_rors_r, "rors.w %[r], %[a], %[b]")
W(w_add_nf, "add.w %[r], %[a], %[b], lsl #2")
W(w_sub_nf, "sub.w %[r], %[a], %[b], asr #5")
/* 수정 즉치 */
W(i_adds1, "adds.w %[r], %[a], #0xab")
W(i_adds2, "adds.w %[r], %[a], #0x00ab00ab")
W(i_adcs3, "adcs.w %[r], %[a], #0xab00ab00")
W(i_subs4, "subs.w %[r], %[a], #0xabababab")
W(i_sbcs5, "sbcs.w %[r], %[a], #0x3fc00")
W(i_rsbs6, "rsbs.w %[r], %[a], #0x80000000")
W(i_ands7, "ands.w %[r], %[a], #0x80000000")
W(i_ands8, "ands.w %[r], %[a], #0xff")
W(i_orrs9, "orrs.w %[r], %[a], #0x7f800000")
W(i_eors10, "eors.w %[r], %[a], #0x00000ff0")
W(i_bics11, "bics.w %[r], %[a], #0xff000000")
W(i_orns12, "orns %[r], %[a], #0x1fe")
W(i_movs13, "movs.w %[r], #0xc0000000")
W(i_mvns14, "mvns.w %[r], #0x2")
W(i_tst15, "tst.w %[a], #0x00810081\n\tmov %[r], %[a]")
W(i_teq16, "teq.w %[a], #0x40000000\n\tmov %[r], %[a]")
W(i_cmp17, "cmp.w %[a], #0x10000\n\tmov %[r], %[a]")
W(i_cmn18, "cmn.w %[a], #0xff\n\tmov %[r], %[a]")
W(i_addw, "addw %[r], %[a], #0xfff")
W(i_subw, "subw %[r], %[a], #0x123")
W(i_movw, "movw %[r], #0xbeef")
W(i_movt, "mov %[r], %[a]\n\tmovt %[r], #0xcafe")
/* 16비트 */
N(n_adds3, "adds.n r0, r0, r1")
N(n_addsi3, "adds.n r0, r1, #7")
N(n_addsi8, "adds.n r0, #200")
N(n_subs3, "subs.n r0, r0, r1")
N(n_subsi3, "subs.n r0, r1, #5")
N(n_subsi8, "subs.n r0, #255")
N(n_movsi8, "movs.n r0, #0")
N(n_cmpi8, "cmp.n r0, #128")
N(n_lsls_i, "lsls.n r0, r1, #31")
N(n_lsls_0, "lsls.n r0, r1, #0")
N(n_lsrs_i, "lsrs.n r0, r1, #1")
N(n_lsrs_32, "lsrs.n r0, r1, #32")
N(n_asrs_i, "asrs.n r0, r1, #15")
N(n_asrs_32, "asrs.n r0, r1, #32")
N(n_ands, "ands.n r0, r1")
N(n_eors, "eors.n r0, r1")
N(n_lsls_r, "lsls.n r0, r1")
N(n_lsrs_r, "lsrs.n r0, r1")
N(n_asrs_r, "asrs.n r0, r1")
N(n_adcs, "adcs.n r0, r1")
N(n_sbcs, "sbcs.n r0, r1")
N(n_rors, "rors.n r0, r1")
N(n_tst, "tst.n r0, r1")
N(n_negs, "rsbs.n r0, r1, #0")
N(n_cmp, "cmp.n r0, r1")
N(n_cmn, "cmn.n r0, r1")
N(n_orrs, "orrs.n r0, r1")
N(n_muls, "muls.n r0, r1, r0")
N(n_bics, "bics.n r0, r1")
N(n_mvns, "mvns.n r0, r1")
N(n_add_hi, "add.n r0, r1")
N(n_mov_hi, "mov.n r0, r1")

struct op { const char *name; fn2 f; };
#define E(x) { #x, x }
static const struct op ops[] = {
  E(w_adds), E(w_adds_lsl), E(w_adds_asr), E(w_adcs), E(w_adcs_ror), E(w_subs), E(w_subs_lsr), E(w_sbcs),
  E(w_sbcs_rrx), E(w_rsbs), E(w_rsbs_lsl), E(w_ands), E(w_ands_lsl), E(w_ands_lsr), E(w_ands_asr32), E(w_orrs_ror),
  E(w_eors_rrx), E(w_bics_lsl), E(w_orns), E(w_movs_lsl), E(w_movs_lsr), E(w_movs_asr), E(w_movs_ror), E(w_movs_rrx),
  E(w_mvns_asr), E(w_tst), E(w_teq), E(w_cmp), E(w_cmp_lsl), E(w_cmn), E(w_cmn_asr), E(w_lsls_r), E(w_lsrs_r),
  E(w_asrs_r), E(w_rors_r), E(w_add_nf), E(w_sub_nf),
  E(i_adds1), E(i_adds2), E(i_adcs3), E(i_subs4), E(i_sbcs5), E(i_rsbs6), E(i_ands7), E(i_ands8), E(i_orrs9),
  E(i_eors10), E(i_bics11), E(i_orns12), E(i_movs13), E(i_mvns14), E(i_tst15), E(i_teq16), E(i_cmp17), E(i_cmn18),
  E(i_addw), E(i_subw), E(i_movw), E(i_movt),
  E(n_adds3), E(n_addsi3), E(n_addsi8), E(n_subs3), E(n_subsi3), E(n_subsi8), E(n_movsi8), E(n_cmpi8),
  E(n_lsls_i), E(n_lsls_0), E(n_lsrs_i), E(n_lsrs_32), E(n_asrs_i), E(n_asrs_32), E(n_ands), E(n_eors),
  E(n_lsls_r), E(n_lsrs_r), E(n_asrs_r), E(n_adcs), E(n_sbcs), E(n_rors), E(n_tst), E(n_negs), E(n_cmp), E(n_cmn),
  E(n_orrs), E(n_muls), E(n_bics), E(n_mvns), E(n_add_hi), E(n_mov_hi),
};

static const uint32_t edge[] = {
  0, 1, 2, 31, 32, 33, 0x7fffffff, 0x80000000, 0x80000001, 0xffffffff, 0xfffffffe, 0x55555555, 0xaaaaaaaa, 0x100, 0xff,
};
#define NEDGE (sizeof(edge) / sizeof(edge[0]))

int main(void)
{
  uint32_t total = 0;
  for (unsigned k = 0; k < sizeof(ops) / sizeof(ops[0]); k++) {
    uint32_t h = 0x811c9dc5;
    t_srand(0x9e3779b9u + k);
    for (unsigned i = 0; i < NEDGE * NEDGE + 600; i++) {
      uint32_t a, b;
      if (i < NEDGE * NEDGE) { a = edge[i / NEDGE]; b = edge[i % NEDGE]; }
      else {
        a = t_rand(); b = t_rand();
        if (i & 1) b &= 0x3f; /* 시프트 양 */
        if ((i & 7) == 2) b = a;
      }
      uint32_t fl = (t_rand() & 0xf8000000u);
      uint32_t ps;
      uint32_t r = ops[k].f(a, b, fl, &ps);
      h = t_mix(h, r);
      h = t_mix(h, ps & 0xf8000000u);
    }
    t_kv(ops[k].name, h);
    total = t_mix(total, h);
  }
  t_kv("total", total);
  return 0;
}
