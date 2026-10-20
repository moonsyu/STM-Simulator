/* 디버그 정보(-O0 -g) 검증용: 줄 번호 표, 심볼, 단계 실행. 표식 주석은 테스트가 줄 번호를 찾는 데 씁니다. */
#include "common/tlib.h"

volatile int g_counter;

int add3(int a, int b, int c)
{
  int s = a + b;       /* @ADD3_FIRST */
  s += c;              /* @ADD3_SECOND */
  return s;            /* @ADD3_RETURN */
}

static int square(int x)
{
  return x * x;        /* @SQUARE_BODY */
}

int main(void)
{
  int total = 0;                     /* @MAIN_FIRST */
  for (int i = 0; i < 3; i++) {
    total += add3(i, 1, 2);          /* @MAIN_CALL */
    g_counter++;                     /* @MAIN_AFTER_CALL */
  }
  total += square(total);            /* @MAIN_SQUARE */
  t_kv("total", total);              /* @MAIN_PRINT */
  return 0;
}
