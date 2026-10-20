/* newlib-nano printf(부동소수점 포함), snprintf, malloc */
#include "common/tlib.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

int main(void)
{
  printf("int %d %i %u %x %X %o %c %s|%5d|%-5d|%05d\n", -42, 7, 3000000000u, 0xbeef, 0xcafe, 8, 'Z', "str", 12, 34, 56);
  printf("long %ld %lu %lx %lld\n", -1234567L, 4000000000UL, 0xdeadbeefUL, -9876543210LL);
  float vals[] = { 0.0f, -0.0f, 1.0f, -1.5f, 3.14159265f, 1e-5f, 123456.789f, 1e30f, 2.5e-38f, 0.1f };
  for (unsigned i = 0; i < sizeof vals / sizeof vals[0]; i++) {
    double d = vals[i];
    printf("f %f | %.3f | %10.4f | %e | %.2e | %g | %G\n", d, d, d, d, d, d, d);
  }
  double acc = 0;
  for (int i = 1; i <= 50; i++) acc += 1.0 / (i * i);
  printf("basel %.12f\n", acc);
  float fs = 0;
  for (int i = 0; i < 1000; i++) fs += 0.001f * (float)i;
  printf("fsum %.6f\n", (double)fs);
  char buf[64];
  int n = snprintf(buf, sizeof buf, "%08.3f/%+d/%%/%p", 2.71828, 99, (void *)0x20001000);
  printf("snprintf %d [%s]\n", n, buf);
  char *p = malloc(100);
  char *q = malloc(300);
  strcpy(p, "heap ok");
  memset(q, 'x', 299); q[299] = 0;
  printf("%s %u %u\n", p, (unsigned)strlen(q), (unsigned)(q > p));
  free(p); free(q);
  printf("atoi %d strtol %ld strtoul %lu\n", atoi("-123"), strtol("0x7fff", 0, 16), strtoul("4294967295", 0, 10));
  printf("한글 출력 테스트\n");
  fflush(stdout);
  return 0;
}
