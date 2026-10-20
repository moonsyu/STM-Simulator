#include "tlib.h"

static char buf[128];
static unsigned len;

static int sh_call(int op, void *arg)
{
  register int r0 __asm("r0") = op;
  register void *r1 __asm("r1") = arg;
  __asm volatile("bkpt 0xAB" : "+r"(r0) : "r"(r1) : "memory");
  return r0;
}

void t_flush(void)
{
  if (!len) return;
  buf[len] = 0;
  sh_call(4, buf);
  len = 0;
}

void t_putc(char c)
{
  buf[len++] = c;
  if (c == '\n' || len >= sizeof(buf) - 1) t_flush();
}

void t_puts(const char *s) { while (*s) t_putc(*s++); }

void t_hex(uint32_t v)
{
  for (int i = 7; i >= 0; i--) t_putc("0123456789abcdef"[(v >> (i * 4)) & 15]);
}

void t_dec(int32_t v)
{
  char tmp[12];
  int n = 0;
  uint32_t u = v < 0 ? -(uint32_t)v : (uint32_t)v;
  if (v < 0) t_putc('-');
  do { tmp[n++] = '0' + u % 10; u /= 10; } while (u);
  while (n) t_putc(tmp[--n]);
}

void t_kv(const char *k, uint32_t v)
{
  t_puts(k);
  t_putc('=');
  t_hex(v);
  t_putc('\n');
}

void t_exit(int code)
{
  t_flush();
  sh_call(0x18, (void *)(code == 0 ? 0x20026 : 0x20023));
  for (;;) {}
}

uint32_t t_mix(uint32_t h, uint32_t v)
{
  h ^= v;
  h *= 0x01000193u;
  h ^= h >> 15;
  h *= 0x2c1b3c6du;
  h ^= h >> 12;
  return h;
}

static uint32_t rs = 0x12345678;
void t_srand(uint32_t s) { rs = s ? s : 1; }
uint32_t t_rand(void)
{
  rs ^= rs << 13;
  rs ^= rs >> 17;
  rs ^= rs << 5;
  return rs;
}

/* newlib printf 용 */
int _write(int fd, char *p, int n)
{
  (void)fd;
  for (int i = 0; i < n; i++) t_putc(p[i]);
  return n;
}
