// Text and memory idioms on the built-in interpreter (probing 45 of them): string searches, text to number,
// <ctype.h>, memset / memcpy on buffers whose elements are wider than a byte and on structs, pointers compared by
// position, a const char * that moves, printf %e / %g / %zu, putchar.
import test from 'node:test';
import assert from 'node:assert/strict';
import {blankProject} from '../../src/project.js';
import {generateHal} from '../../src/mcu-config.js';
import {SimulationSession} from '../../src/session.js';

function run(globals,body){
 const p=blankProject();
 p.code=generateHal(p.mcu,{minimal:true}).replace('/* USER CODE BEGIN 0 */','/* USER CODE BEGIN 0 */\n'+globals).replace('  /* USER CODE BEGIN 2 */','  /* USER CODE BEGIN 2 */\n  '+body);
 const out=[],s=new SimulationSession(p,{print:x=>out.push(x),warn:()=>{}});s.tick(0);for(let t=10;t<=30;t+=10)s.tick(t);return out;
}
const r=String.raw;

test('strchr / strrchr / strstr give a pointer into the text (or NULL) that can be read, moved and written through',()=>{
 assert.deepEqual(run('',r`const char *s = "key=val"; char *e = strchr(s, '='); char *v = strstr(s, "val"); printf("%s %s %d\n", e + 1, v, (int)(e - s));`),['val val 3']);
 assert.deepEqual(run('',r`const char *p = "a/b/c.txt"; char *dot = strrchr(p, '.'); char *no = strchr(p, '#'); printf("%s %d %d\n", dot, no == NULL, strstr(p, "zz") == NULL);`),['.txt 1 1']);
 assert.deepEqual(run('',r`char buf[16] = "temp=25C"; char *v = strstr(buf, "="); if (v) { v[1] = '3'; } printf("%s %d\n", buf, atoi(v + 1));`),['temp=35C 35']);
});

test('strtol (base, end pointer), atof as a double, <ctype.h>',()=>{
 assert.deepEqual(run('#include <stdlib.h>',r`const char *s = "12 34"; char *end; long a = strtol(s, &end, 10); long b = strtol(end, NULL, 10); printf("%ld %ld %d %ld %ld %ld\n", a, b, (int)(end - s), strtol("0x1F", NULL, 16), strtol("-077", NULL, 0), strtol("zz", NULL, 10));`),['12 34 2 31 -63 0']);
 assert.deepEqual(run('#include <stdlib.h>',r`float f = atof("2.5"); printf("%d %.2f %d\n", (int)(atof("2.5") * 2), f, (int)atof("x"));`),['5 2.50 0']);
 assert.deepEqual(run('#include <ctype.h>',r`char s[] = "aB3 "; int up = 0, dg = 0, sp = 0; for (int i = 0; s[i]; i++) { if (isupper(s[i])) up++; if (isdigit(s[i])) dg++; if (isspace(s[i])) sp++; s[i] = toupper(s[i]); } printf("%s|%d%d%d %c %d\n", s, up, dg, sp, tolower('Z'), isalpha('7') != 0);`),['AB3 |111 z 0']);
});

test('memset / memcpy / memcmp count bytes: wider elements, floats, structs, and copies between element sizes',()=>{
 assert.deepEqual(run('static uint16_t v[4] = {1, 2, 3, 4};',r`memset(v, 0, sizeof(v)); uint32_t w[2]; memset(w, 0xFF, sizeof(w)); float f[3] = {1.5f, 2.5f, 3.5f}; memset(f, 0, sizeof(f)); printf("%d %d %lu %.1f\n", v[0], v[3], w[1], f[2]);`),['0 0 4294967295 0.0']);
 assert.deepEqual(run('',r`uint16_t a[3] = {100, 200, 300}, b[3]; memcpy(b, a, sizeof(a)); uint8_t c[4] = {1, 2, 3, 4}, d[4] = {0}; memcpy(d + 1, c, 2); printf("%d %d%d%d%d %d\n", b[2], d[0], d[1], d[2], d[3], memcmp(a, b, sizeof(a)));`),['300 0120 0']);
 // Bytes of a receive buffer into a wider value and back (little-endian), and the bits of a float.
 assert.deepEqual(run('',r`uint8_t raw[4] = {0x34, 0x12, 0x78, 0x56}; uint16_t w[2]; memcpy(w, raw, 4); uint32_t v = 0x11223344; uint8_t out[4]; memcpy(out, &v, sizeof(v)); uint32_t bits = 0x3F800000; float f; memcpy(&f, &bits, 4); printf("%04X %04X %02X %02X %.1f\n", w[0], w[1], out[0], out[3], f);`),['1234 5678 44 11 1.0']);
 assert.deepEqual(run(r`typedef struct { int a; int b; } T;
static T devs[3] = { {1, 1}, {2, 1}, {3, 1} };`,r`T x[2] = { {1, 2}, {3, 4} }, y[2]; memcpy(y, x, sizeof(x)); x[1].b = 9; T one; memcpy(&one, &x[0], sizeof(T)); memset(devs, 0, sizeof(devs)); printf("%d %d %d%d\n", y[1].b, one.a + one.b, devs[0].a, devs[2].b);`),['4 3 00']);
 assert.throws(()=>run('',r`uint16_t v[2]; memset(v, 0, 3);`),/memset 길이 3가 요소 크기 2의 배수가 아닙니다/);
 assert.throws(()=>run('typedef struct { int id; } D;',r`D d; memset(&d, 1, sizeof(d));`),/구조체의 memset은 0으로 채우는 것만/);
});

test('pointers into one array compare by position; a const char * moves; pointers into different arrays are refused',()=>{
 assert.deepEqual(run('',r`uint8_t d[4] = {1, 2, 3, 4}; int s = 0; for (uint8_t *p = d; p < d + 4; p++) s += *p; uint8_t *e = d + 4; printf("%d %d %d\n", s, e > d, d >= e);`),['10 1 0']);
 assert.deepEqual(run('static int count(const char *s) { int n = 0; while (*s) { s++; n++; } return n; }',r`int n = 0; for (const char *p = "hey"; *p; p++) n++; printf("%d %d\n", n, count("four"));`),['3 4']);
 assert.throws(()=>run('',r`uint8_t a[2], b[2]; if (a < b) printf("x\n");`),/서로 다른 배열을 가리키는 포인터끼리는 크기를 비교할 수 없습니다/);
 // A const value that is not a pointer still cannot change.
 assert.throws(()=>run('',r`const int k = 1; k = 2;`),/const 값은 변경할 수 없습니다/);
});

test('printf %e / %g / %zu / %lld; putchar gathers a line',()=>{
 assert.deepEqual(run('',r`printf("%.2e %g %g %g %zu %lld %E\n", 12345.678, 0.0001, 1234567.0, 2.50, sizeof(int), 5LL, 0.5);`),['1.23e+04 0.0001 1.23457e+06 2.5 4 5 5.000000E-01']);
 assert.deepEqual(run('',r`for (const char *p = "hey"; *p; p++) putchar(*p); putchar('\n'); puts("done");`),['hey','done']);
});
