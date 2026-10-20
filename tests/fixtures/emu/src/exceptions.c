/* 예외: SVC, PendSV, SysTick, NVIC 선점·중첩, tail-chaining, BASEPRI/PRIMASK, FPU 문맥 보존 */
#include "common/tlib.h"

#define NVIC_ISER   0xE000E100
#define NVIC_ICER   0xE000E180
#define NVIC_ISPR   0xE000E200
#define NVIC_ICPR   0xE000E280
#define NVIC_IABR   0xE000E300
#define NVIC_IPR    0xE000E400
#define SCB_ICSR    0xE000ED04
#define SCB_AIRCR   0xE000ED0C
#define SCB_SHPR2   0xE000ED1C
#define SCB_SHPR3   0xE000ED20
#define SCB_SHCSR   0xE000ED24
#define NVIC_STIR   0xE000EF00
#define SYST_CSR    0xE000E010
#define SYST_RVR    0xE000E014
#define SYST_CVR    0xE000E018

static volatile char logbuf[512];
static volatile unsigned logn;
static void lg(char c) { if (logn < sizeof logbuf - 1) logbuf[logn++] = c; }
static void dump(const char *name) { logbuf[logn] = 0; t_puts(name); t_putc('='); t_puts((const char *)logbuf); t_putc('\n'); logn = 0; }

static void set_prio(int irq, uint8_t p) { *(volatile uint8_t *)(NVIC_IPR + irq) = p; }
static void enable(int irq) { REG32(NVIC_ISER + 4 * (irq / 32)) = 1u << (irq % 32); }
static void pend(int irq) { REG32(NVIC_ISPR + 4 * (irq / 32)) = 1u << (irq % 32); }
static uint32_t ipsr(void) { uint32_t v; __asm volatile("mrs %0, ipsr" : "=r"(v)); return v; }

/* SVC: 스택 프레임에서 SVC 번호와 인자 읽기 */
static volatile uint32_t svc_seen[4];
void SVC_Handler_C(uint32_t *frame)
{
  uint16_t insn = *(uint16_t *)(frame[6] - 2);
  svc_seen[0] = insn & 0xff;
  svc_seen[1] = frame[0] + frame[1];
  frame[0] = svc_seen[1] * 2; /* 반환값 */
  lg('S');
}
__attribute__((naked)) void SVC_Handler(void)
{
  __asm volatile("tst lr, #4\n\tite eq\n\tmrseq r0, msp\n\tmrsne r0, psp\n\tb SVC_Handler_C");
}
static uint32_t svc_call(uint32_t a, uint32_t b)
{
  register uint32_t r0 __asm("r0") = a;
  register uint32_t r1 __asm("r1") = b;
  __asm volatile("svc #42" : "+r"(r0) : "r"(r1) : "memory");
  return r0;
}

static volatile uint32_t pendsv_count;
void PendSV_Handler(void) { pendsv_count++; lg('P'); }

static volatile uint32_t ticks;
void SysTick_Handler(void) { ticks++; }

/* 선점: IRQ3(낮은 우선순위)이 IRQ5(높음)를 걸면 즉시 중첩, IRQ4(같은 우선순위)는 꼬리 물기 */
void IRQ3_Handler(void)
{
  lg('3'); lg('<');
  pend(5);          /* 더 높은 우선순위 → 즉시 선점 */
  lg('a');
  REG32(NVIC_STIR) = 4; /* 같은 우선순위 → 복귀 후 */
  lg('b');
  pend(6);          /* 더 낮은 우선순위 → 나중 */
  lg('>');
}
void IRQ4_Handler(void) { lg('4'); }
void IRQ5_Handler(void)
{
  lg('5');
  /* 활성 비트: IRQ3과 IRQ5 모두 활성 */
  if ((REG32(NVIC_IABR) & ((1u << 3) | (1u << 5))) == ((1u << 3) | (1u << 5))) lg('A');
  uint32_t icsr = REG32(SCB_ICSR);
  if ((icsr & 0x1ff) == 16 + 5) lg('V');
  if (!(icsr & (1u << 11))) lg('n'); /* RETTOBASE=0 (중첩) */
}
void IRQ6_Handler(void) { lg('6'); if (REG32(SCB_ICSR) & (1u << 11)) lg('r'); }

/* BASEPRI 마스킹 */
static volatile uint32_t irq7_count;
void IRQ7_Handler(void) { irq7_count++; lg('7'); }

/* FPU 문맥: 인터럽트에서 부동소수점 사용 */
static volatile float isr_f;
void IRQ8_Handler(void)
{
  volatile float a = 1.25f, b = -3.5f;
  float s = 0;
  for (int i = 0; i < 10; i++) s = s * a + b;
  isr_f = s;
  __asm volatile("vmov.f32 s0, #2.0\n\tvmov.f32 s15, #3.0\n\tvmov.f32 s16, #4.0" ::: "s0", "s15", "s16");
  lg('8');
}

/* 우선순위 그룹 */
void IRQ9_Handler(void) { lg('9'); pend(10); lg('9'); }
void IRQ10_Handler(void) { lg('X'); }

/* PSP 스레드 */
static uint32_t psp_stack[128] __attribute__((aligned(8)));

int main(void)
{
  REG32(SCB_AIRCR) = 0x05FA0000 | (3 << 8); /* PRIGROUP=3: 4비트 모두 선점 우선순위 */
  /* SVC */
  uint32_t r = svc_call(5, 6);
  t_kv("svc_num", svc_seen[0]);
  t_kv("svc_ret", r);
  /* PendSV */
  REG32(SCB_SHPR3) = (REG32(SCB_SHPR3) & 0x00ffffff) | (0xf0u << 24);
  REG32(SCB_ICSR) = 1u << 28;
  __asm volatile("dsb\n\tisb");
  t_kv("pendsv", pendsv_count);
  dump("log0");

  /* 선점·중첩·꼬리 물기 */
  set_prio(3, 0x80); set_prio(4, 0x80); set_prio(5, 0x40); set_prio(6, 0xc0);
  enable(3); enable(4); enable(5); enable(6);
  pend(3);
  __asm volatile("dsb\n\tisb\n\tnop\n\tnop");
  dump("nest");

  /* PRIMASK: 대기만, 해제 후 진입 */
  __asm volatile("cpsid i");
  pend(4);
  lg('m');
  if (REG32(NVIC_ISPR) & (1u << 4)) lg('p');
  __asm volatile("cpsie i\n\tisb");
  lg('e');
  dump("primask");

  /* BASEPRI */
  set_prio(7, 0x60);
  enable(7);
  uint32_t bp = 0x60;
  __asm volatile("msr basepri, %0" :: "r"(bp));
  pend(7);
  __asm volatile("isb");
  lg(irq7_count ? 'X' : 'w');
  bp = 0x70;
  __asm volatile("msr basepri, %0\n\tisb" :: "r"(bp)); /* 0x60 < 0x70 → 진입 */
  lg(irq7_count ? 'y' : 'X');
  bp = 0x40;
  __asm volatile("msr basepri_max, %0" :: "r"(bp));
  uint32_t got; __asm volatile("mrs %0, basepri" : "=r"(got));
  lg(got == 0x40 ? 'M' : 'X');
  bp = 0x80;
  __asm volatile("msr basepri_max, %0" :: "r"(bp)); /* 더 낮은 우선순위로는 바뀌지 않음 */
  __asm volatile("mrs %0, basepri" : "=r"(got));
  lg(got == 0x40 ? 'M' : 'X');
  bp = 0;
  __asm volatile("msr basepri, %0" :: "r"(bp));
  dump("basepri");

  /* FPU 문맥 보존 */
  set_prio(8, 0x20);
  enable(8);
  volatile float x = 0.5f;
  float acc = 0;
  for (int i = 0; i < 20; i++) {
    acc = acc * 0.75f + x;
    if (i == 7) pend(8);
    __asm volatile("vmov.f32 s16, #10.0\n\tvmov.f32 s0, #0.5" ::: "s0", "s16");
    if (i == 12) pend(8);
  }
  uint32_t u, isr_u, s16;
  __builtin_memcpy(&u, &acc, 4);
  { float t = isr_f; __builtin_memcpy(&isr_u, &t, 4); }
  __asm volatile("vmov %0, s16" : "=r"(s16));
  t_kv("fp_thread", u);
  t_kv("fp_isr", isr_u);
  t_kv("fp_s16", s16);
  uint32_t ctrl; __asm volatile("mrs %0, control" : "=r"(ctrl));
  t_kv("control", ctrl);
  dump("fpu");

  /* 우선순위 그룹: PRIGROUP=5 → 상위 2비트만 선점 */
  REG32(SCB_AIRCR) = 0x05FA0000 | (5 << 8);
  set_prio(9, 0x50); set_prio(10, 0x40); /* 같은 그룹(0x40) → 선점 안 함 */
  enable(9); enable(10);
  pend(9);
  __asm volatile("isb");
  dump("group");
  REG32(SCB_AIRCR) = 0x05FA0000 | (3 << 8);

  /* SysTick */
  REG32(SYST_RVR) = 999;
  REG32(SYST_CVR) = 0;
  REG32(SYST_CSR) = 7;
  while (ticks < 5) __asm volatile("wfi");
  REG32(SYST_CSR) = 0;
  t_kv("ticks", ticks >= 5);
  REG32(SYST_RVR) = 0xffffff;
  REG32(SYST_CVR) = 0;
  REG32(SYST_CSR) = 5;
  for (volatile int i = 0; i < 100; i++) {}
  uint32_t v1 = REG32(SYST_CVR);
  for (volatile int i = 0; i < 100; i++) {}
  uint32_t v2 = REG32(SYST_CVR);
  t_kv("systick_counts_down", v1 > v2);
  REG32(SYST_CSR) = 0;

  /* PSP 스레드 모드 + SVC 복귀 */
  uint32_t top = (uint32_t)&psp_stack[128];
  __asm volatile("msr psp, %0\n\tmov r0, #2\n\tmsr control, r0\n\tisb" :: "r"(top) : "r0");
  __asm volatile("mrs %0, control" : "=r"(ctrl));
  t_kv("control_psp", ctrl & 3);
  r = svc_call(100, 23);
  t_kv("svc_psp", r);
  uint32_t sp, psp;
  __asm volatile("mov %0, sp\n\tmrs %1, psp" : "=r"(sp), "=r"(psp));
  t_kv("sp_is_psp", sp == psp);
  __asm volatile("mov r0, #0\n\tmsr control, r0\n\tisb" ::: "r0");
  t_kv("ipsr", ipsr());

  /* SHCSR 활성 비트, ICSR VECTPENDING */
  __asm volatile("cpsid i");
  pend(4);
  t_kv("vectpending", (REG32(SCB_ICSR) >> 12) & 0x1ff);
  t_kv("isrpending", (REG32(SCB_ICSR) >> 22) & 1);
  REG32(NVIC_ICPR) = 1u << 4;
  t_kv("cleared", (REG32(NVIC_ISPR) >> 4) & 1);
  __asm volatile("cpsie i");
  t_kv("shcsr", REG32(SCB_SHCSR));
  dump("end");
  return 0;
}
