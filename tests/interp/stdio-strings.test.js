// sprintf / snprintf and <string.h> copies in the simulator, as a UART program formats its messages.
import test from 'node:test';
import assert from 'node:assert/strict';
import {pin,halProject,run,advance} from './helpers.js';

const uart={pins:{PA2:pin('USART2_TX'),PA3:pin('USART2_RX')},peripherals:{USART2:{enabled:true,baud:115200}}};
const vcp=s=>s.buses.vcpOutput||'';

test('snprintf formats into a byte buffer and HAL_UART_Transmit sends its length (the USER button counter)',()=>{
 const p=halProject({...uart,globals:'uint8_t sending_cnt = 0;',loop:`    sending_cnt++;
    uint8_t sending_msg[100];
    uint8_t len = snprintf((char*)sending_msg, sizeof(sending_msg), "uart_%d\\r\\n", sending_cnt);
    HAL_UART_Transmit(&huart2, sending_msg, len, 100);
    HAL_Delay(100);`});
 const {s}=run(p);advance(s,250);
 assert.match(vcp(s),/^uart_1\r\nuart_2\r\nuart_3\r\n/);
});

test('snprintf truncates to the buffer size and returns the full length; sprintf and the string copies follow C',()=>{
 const {s,output}=run(halProject({init:`  char small[6];
  int whole = snprintf(small, sizeof(small), "value=%03d", 7);
  printf("%s|%d\\n", small, whole);
  char line[32];
  int n = sprintf(line, "%s-%u", "ab", 42u);
  strcat(line, "!");
  printf("%s|%d|%d\\n", line, n, (int)strlen(line));
  char copy[8];
  strcpy(copy, "xyz");
  memset(copy + 3, '.', 2);
  copy[5] = 0;
  char other[8];
  memcpy(other, copy, 6);
  printf("%s|%s|%d\\n", copy, other, memcmp(copy, other, 6));
  char padded[6];
  strncpy(padded, "hi", 5);
  printf("%d%d%d\\n", padded[1] == 'i', padded[2] == 0, padded[4] == 0);`}));
 advance(s,5);
 assert.deepEqual(output.slice(0,4),['value|9','ab-42!|5|6','xyz..|xyz..|0','111']);
});

test('sprintf past the end of the buffer is an error, not a silent overwrite',()=>{
 assert.throws(()=>{const {s}=run(halProject({init:'  char tiny[4];\n  sprintf(tiny, "%s", "toolong");'}));advance(s,5);},/범위/);
});
