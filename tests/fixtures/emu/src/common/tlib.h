/* 테스트 픽스처 공용: 세미호스팅 출력 도우미 */
#ifndef TLIB_H
#define TLIB_H
#include <stdint.h>

void t_putc(char c);
void t_puts(const char *s);          /* 줄바꿈 없음 */
void t_hex(uint32_t v);              /* 8자리 16진수 */
void t_dec(int32_t v);
void t_kv(const char *k, uint32_t v); /* "k=XXXXXXXX\n" */
void t_flush(void);
void t_exit(int code);
uint32_t t_mix(uint32_t h, uint32_t v);
uint32_t t_rand(void);
void t_srand(uint32_t s);

static inline uint32_t t_apsr(void) { uint32_t v; __asm volatile("mrs %0, apsr" : "=r"(v)); return v; }
static inline void t_set_apsr(uint32_t v) { __asm volatile("msr apsr_nzcvqg, %0" :: "r"(v) : "cc"); }

#define REG32(a) (*(volatile uint32_t *)(a))
#endif
