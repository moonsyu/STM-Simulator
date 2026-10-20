/* 성능 측정용 CPU 부하: CRC32, 정수 행렬 곱, 에라토스테네스의 체, 부동소수점 루프 */
#include "common/tlib.h"

static uint32_t crc32(const uint8_t *p, unsigned n, uint32_t crc)
{
  crc = ~crc;
  while (n--) {
    crc ^= *p++;
    for (int k = 0; k < 8; k++) crc = (crc >> 1) ^ (0xedb88320u & -(crc & 1));
  }
  return ~crc;
}

static uint8_t data[1024];
static int32_t ma[16][16], mb[16][16], mc[16][16];
static uint8_t sieve[8192];

int main(void)
{
  for (int i = 0; i < 1024; i++) data[i] = (uint8_t)(i * 131 + 7);
  uint32_t crc = 0;
  for (int r = 0; r < 100; r++) crc = crc32(data, sizeof data, crc);
  t_kv("crc", crc);

  for (int i = 0; i < 16; i++)
    for (int j = 0; j < 16; j++) { ma[i][j] = i * 3 - j; mb[i][j] = (i ^ j) + 1; }
  uint32_t h = 0;
  for (int r = 0; r < 200; r++) {
    for (int i = 0; i < 16; i++)
      for (int j = 0; j < 16; j++) {
        int32_t s = 0;
        for (int k = 0; k < 16; k++) s += ma[i][k] * mb[k][j];
        mc[i][j] = s;
      }
    ma[r & 15][(r * 7) & 15] += mc[3][5] & 7;
    h = t_mix(h, (uint32_t)mc[r & 15][15 - (r & 15)]);
  }
  t_kv("matrix", h);

  unsigned count = 0;
  for (int r = 0; r < 30; r++) {
    for (int i = 0; i < 8192; i++) sieve[i] = 1;
    count = 0;
    for (int i = 2; i < 8192; i++) {
      if (!sieve[i]) continue;
      count++;
      for (int j = i * 2; j < 8192; j += i) sieve[j] = 0;
    }
  }
  t_kv("primes", count);

  float x = 0.5f, y = 0.25f;
  for (int i = 0; i < 1000000; i++) {
    x = x * 0.999f + y * 0.001f;
    y = y + x * 0.0001f - y * 0.00005f;
  }
  uint32_t ux, uy;
  __builtin_memcpy(&ux, &x, 4); __builtin_memcpy(&uy, &y, 4);
  t_kv("float_x", ux);
  t_kv("float_y", uy);
  return 0;
}
