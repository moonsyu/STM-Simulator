/* 테스트 픽스처 공용 스타트업: 벡터 테이블, .data/.bss 초기화, FPU 활성화 */
#include <stdint.h>
#include "tlib.h"

extern uint32_t _estack, _sidata, _sdata, _edata, _sbss, _ebss;
extern int main(void);
void Reset_Handler(void);
void Default_Handler(void);

#define WEAK __attribute__((weak, alias("Default_Handler")))
void NMI_Handler(void) WEAK;
void HardFault_Handler(void) WEAK;
void MemManage_Handler(void) WEAK;
void BusFault_Handler(void) WEAK;
void UsageFault_Handler(void) WEAK;
void SVC_Handler(void) WEAK;
void DebugMon_Handler(void) WEAK;
void PendSV_Handler(void) WEAK;
void SysTick_Handler(void) WEAK;
void IRQ0_Handler(void) WEAK;
void IRQ1_Handler(void) WEAK;
void IRQ2_Handler(void) WEAK;
void IRQ3_Handler(void) WEAK;
void IRQ4_Handler(void) WEAK;
void IRQ5_Handler(void) WEAK;
void IRQ6_Handler(void) WEAK;
void IRQ7_Handler(void) WEAK;
void IRQ8_Handler(void) WEAK;
void IRQ9_Handler(void) WEAK;
void IRQ10_Handler(void) WEAK;
void IRQ11_Handler(void) WEAK;
void IRQ12_Handler(void) WEAK;
void IRQ13_Handler(void) WEAK;
void IRQ14_Handler(void) WEAK;
void IRQ15_Handler(void) WEAK;

__attribute__((section(".isr_vector"), used))
void (*const g_vectors[16 + 32])(void) = {
  (void (*)(void))&_estack, Reset_Handler, NMI_Handler, HardFault_Handler,
  MemManage_Handler, BusFault_Handler, UsageFault_Handler, 0, 0, 0, 0,
  SVC_Handler, DebugMon_Handler, 0, PendSV_Handler, SysTick_Handler,
  IRQ0_Handler, IRQ1_Handler, IRQ2_Handler, IRQ3_Handler, IRQ4_Handler, IRQ5_Handler,
  IRQ6_Handler, IRQ7_Handler, IRQ8_Handler, IRQ9_Handler, IRQ10_Handler, IRQ11_Handler,
  IRQ12_Handler, IRQ13_Handler, IRQ14_Handler, IRQ15_Handler,
};

extern void __libc_init_array(void) __attribute__((weak));

void Reset_Handler(void)
{
  uint32_t *s = &_sidata, *d = &_sdata;
  while (d < &_edata) *d++ = *s++;
  for (d = &_sbss; d < &_ebss; ) *d++ = 0;
  REG32(0xE000ED88) |= 0xFu << 20; /* CPACR: CP10/CP11 full access */
  __asm volatile("dsb\n isb");
  if (__libc_init_array) __libc_init_array();
  int rc = main();
  t_exit(rc);
}

void Default_Handler(void)
{
  uint32_t ipsr;
  __asm volatile("mrs %0, ipsr" : "=r"(ipsr));
  t_puts("UNHANDLED EXC ");
  t_hex(ipsr);
  t_puts(" CFSR=");
  t_hex(REG32(0xE000ED28));
  t_puts(" HFSR=");
  t_hex(REG32(0xE000ED2C));
  t_putc('\n');
  t_exit(3);
}
