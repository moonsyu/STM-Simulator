/* 폴트: BusFault/HardFault 승격, UsageFault(0 나누기·비정렬·미정의·상태·NOCP), 명령 페치 폴트, SVC 승격 */
#include "common/tlib.h"

#define SCB_SHCSR 0xE000ED24
#define SCB_CCR   0xE000ED14
#define SCB_CFSR  0xE000ED28
#define SCB_HFSR  0xE000ED2C
#define SCB_MMFAR 0xE000ED34
#define SCB_BFAR  0xE000ED38
#define CPACR     0xE000ED88

static volatile uint32_t nfault;

void fault_c(uint32_t *frame, uint32_t lr)
{
  uint32_t ipsr;
  __asm volatile("mrs %0, ipsr" : "=r"(ipsr));
  uint32_t cfsr = REG32(SCB_CFSR), hfsr = REG32(SCB_HFSR);
  nfault++;
  t_puts("  fault exc="); t_dec(ipsr);
  t_puts(" cfsr="); t_hex(cfsr);
  t_puts(" hfsr="); t_hex(hfsr);
  if (cfsr & (1u << 15)) { t_puts(" bfar="); t_hex(REG32(SCB_BFAR)); }
  if (cfsr & (1u << 7)) { t_puts(" mmfar="); t_hex(REG32(SCB_MMFAR)); }
  t_puts(" lr="); t_hex(lr & 0x1f);
  t_putc('\n');
  REG32(SCB_CFSR) = cfsr;
  REG32(SCB_HFSR) = hfsr;
  uint32_t pc = frame[6];
  if (cfsr & ((1u << 0) | (1u << 8))) {
    frame[6] = frame[5] & ~1u;            /* 명령 페치 실패: 호출자로 복귀 */
  } else if (cfsr & (1u << 17)) {
    frame[7] |= 1u << 24;                 /* INVSTATE: T 비트 복구 후 재시도 */
  } else if (cfsr & (1u << 19)) {
    REG32(CPACR) |= 0xfu << 20;           /* NOCP: FPU 켜고 재시도 */
  } else if (cfsr == 0) {
    /* SVC 승격 등: 복귀 주소가 이미 다음 명령 */
  } else {
    uint16_t insn = *(uint16_t *)pc;
    frame[6] = pc + ((insn >= 0xe800) ? 4 : 2);
  }
}
__attribute__((naked)) void fault_entry(void)
{
  __asm volatile("tst lr, #4\n\tite eq\n\tmrseq r0, msp\n\tmrsne r0, psp\n\tmov r1, lr\n\tb fault_c");
}
void HardFault_Handler(void) __attribute__((alias("fault_entry")));
void MemManage_Handler(void) __attribute__((alias("fault_entry")));
void BusFault_Handler(void) __attribute__((alias("fault_entry")));
void UsageFault_Handler(void) __attribute__((alias("fault_entry")));

static void good_func(void) { t_puts("  good_func ran\n"); }

static volatile uint32_t sink;
void IRQ2_Handler(void)
{
  t_puts("  irq2 svc\n");
  __asm volatile("svc #1");
  t_puts("  irq2 after\n");
}
void SVC_Handler(void) { t_puts("  svc handler\n"); }

int main(void)
{
  volatile uint32_t *bad = (volatile uint32_t *)0x30000000;
  t_puts("load bad (hardfault forced)\n");
  sink = *bad;
  t_puts("store bad (hardfault forced)\n");
  *(volatile uint32_t *)0x24000010 = 1;
  __asm volatile("dsb");
  REG32(SCB_SHCSR) |= (1u << 16) | (1u << 17) | (1u << 18);
  t_puts("load bad (busfault)\n");
  sink = bad[3];
  t_puts("ldrb bad (busfault)\n");
  sink = *(volatile uint8_t *)0x30000101;
  t_puts("div0 no trap\n");
  volatile int a = 7, z = 0;
  t_dec(a / z); t_putc('\n');
  REG32(SCB_CCR) |= 1u << 4;
  t_puts("div0 trap (usagefault)\n");
  sink = a / z;
  sink = (unsigned)a / (unsigned)z;
  t_puts("unaligned allowed\n");
  static uint8_t buf[16] __attribute__((aligned(4))) = { 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16 };
  uint32_t v;
  __asm volatile("ldr %0, [%1, #1]" : "=r"(v) : "r"(buf)); t_hex(v); t_putc('\n');
  t_puts("ldrd unaligned (always faults)\n");
  { uint32_t x0, x1, base = (uint32_t)buf + 2; __asm volatile("ldrd %0, %1, [%2]" : "=r"(x0), "=r"(x1) : "r"(base) : "memory"); sink = x0 + x1; }
  t_puts("ldm unaligned\n");
  { uint32_t base = (uint32_t)buf + 2, x0; __asm volatile("ldm %1, {%0}" : "=r"(x0) : "r"(base) : "memory"); sink = x0; }
  REG32(SCB_CCR) |= 1u << 3;
  t_puts("unaligned trap\n");
  __asm volatile("ldr %0, [%1, #1]" : "=r"(v) : "r"(buf) : "memory");
  __asm volatile("ldrh %0, [%1, #3]" : "=r"(v) : "r"(buf) : "memory");
  __asm volatile("str %0, [%1, #2]" :: "r"(v), "r"(buf) : "memory");
  REG32(SCB_CCR) &= ~((1u << 3) | (1u << 4));
  t_puts("udf\n");
  __asm volatile("udf #7");
  __asm volatile("udf.w #300");
  t_puts("invstate\n");
  void (*fp)(void) = (void (*)(void))((uint32_t)good_func & ~1u);
  fp();
  t_puts("nocp\n");
  REG32(CPACR) &= ~(0xfu << 20);
  __asm volatile("dsb\n\tisb");
  { float f = 1.5f; __asm volatile("vadd.f32 %0, %0, %0" : "+t"(f)); __builtin_memcpy(&v, &f, 4); }
  t_hex(v); t_putc('\n');
  t_puts("exec from xn region\n");
  ((void (*)(void))0xE0000001)();
  t_puts("exec from unmapped\n");
  ((void (*)(void))0x30000001)();
  t_puts("svc escalation\n");
  *(volatile uint8_t *)(0xE000E400 + 2) = 0x00;
  REG32(0xE000ED1C) = 0x80u << 24; /* SVCall 우선순위 0x80 */
  REG32(0xE000E100) = 1u << 2;
  REG32(0xE000E200) = 1u << 2;
  __asm volatile("isb");
  t_puts("svc from thread\n");
  __asm volatile("svc #2");
  t_puts("nfault="); t_dec(nfault); t_putc('\n');
  return 0;
}
