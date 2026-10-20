#include "common/tlib.h"
int main(void)
{
  t_puts("hello from cortex-m4\n");
  t_kv("answer", 42);
  return 0;
}
