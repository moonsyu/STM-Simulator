// Two-dimensional arrays on the built-in interpreter: font / keypad tables, rows of text, a row passed as a pointer,
// the whole array as a parameter, sizeof of the whole and of a row, memset / memcpy over it.
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

test('declaring and indexing: nested and flat initializers, rows left to the initializer, zero fill, sizeof',()=>{
 assert.deepEqual(run('',r`int m[2][3] = {{1, 2, 3}, {4, 5, 6}}; m[0][1] += 10; int f[2][2] = {1, 2, 3}; int z[2][3] = {{1}, {0}}; printf("%d %d %d %d%d%d%d %d%d\n", m[1][2], m[0][1], (int)sizeof(m), f[0][0], f[0][1], f[1][0], f[1][1], z[0][0], z[1][2]);`),['6 12 24 1230 10']);
 assert.deepEqual(run(r`static const uint8_t font[][5] = { {0x7E, 0x11, 0x11, 0x11, 0x7E}, {0x7F, 0x49, 0x49, 0x49, 0x36} };
static const char keys[4][4] = { {'1','2','3','A'}, {'4','5','6','B'}, {'7','8','9','C'}, {'*','0','#','D'} };`,
  r`int rows = sizeof(font) / sizeof(font[0]), cols = sizeof(font[0]) / sizeof(font[0][0]); int s = 0; for (int i = 0; i < rows; i++) for (int j = 0; j < cols; j++) s += font[i][j]; printf("%d %d %d %c%c%c\n", rows, cols, s, keys[0][0], keys[2][3], keys[3][1]);`),['2 5 703 1C0']);
 assert.deepEqual(run(r`typedef struct { int v; } C;`,r`C c[2][2] = { {{1}, {2}}, {{3}, {4}} }; c[1][0].v += 10; printf("%d %d\n", c[1][0].v, c[0][1].v);`),['13 2']);
});

test('rows of text, a row where a pointer is taken, the array as a parameter',()=>{
 assert.deepEqual(run(r`static char names[3][8] = {"red", "green"};`,r`strcpy(names[2], "blue"); printf("%s %s %s %d %d\n", names[0], names[1], names[2], (int)strlen(names[1]), (int)sizeof(names));`),['red green blue 5 24']);
 assert.deepEqual(run(r`static int sum(const uint8_t *row, int n) { int s = 0; for (int i = 0; i < n; i++) s += row[i]; return s; }
static int trace(int m[][2], int n) { int t = 0; for (int i = 0; i < n; i++) t += m[i][i]; return t; }
static void clear(int m[2][2]) { m[0][0] = 0; }
static int first(int a[4]) { return a[0]; }`,r`uint8_t g[2][3] = {{1, 2, 3}, {4, 5, 6}}; int m[2][2] = {{1, 2}, {3, 4}}; int v[4] = {9}; int t = trace(m, 2); clear(m); printf("%d %d %d %d %d\n", sum(g[1], 3), sum(g[0], 3), t, m[0][0], first(v));`),['15 6 5 0 9']);
});

test('memset / memcpy over the whole array and over a row',()=>{
 assert.deepEqual(run(r`static uint16_t grid[3][4];`,r`grid[2][3] = 7; int before = grid[2][3] + grid[0][0]; memset(grid, 0, sizeof(grid)); uint8_t a[2][3] = {{1, 2, 3}, {4, 5, 6}}, b[2][3]; memcpy(b, a, sizeof(a)); memcpy(a[0], a[1], 3); printf("%d %d %d %d %d\n", before, grid[2][3], (int)sizeof(grid), b[1][2], a[0][0]);`),['7 0 24 6 4']);
});

test('out of range, a row assigned as a whole, three dimensions and too many values are refused',()=>{
 assert.throws(()=>run('',r`int m[2][3]; m[1][3] = 1;`),/배열 인덱스가 범위를 벗어났습니다/);
 assert.throws(()=>run('',r`int m[2][3]; m[2][0] = 1;`),/배열 인덱스가 범위를 벗어났습니다/);
 assert.throws(()=>run('',r`int m[2][3]; m[0] = 5;`),/const 값은 변경할 수 없습니다/);
 assert.throws(()=>run('',r`int m[2][2][2];`),/3차원 이상의 배열은 지원하지 않습니다/);
 assert.throws(()=>run('',r`int m[2][] = {{1}};`),/열 수를 지정하세요/);
 assert.throws(()=>run('',r`int m[2][2] = {{1, 2, 3}};`),/배열 크기 또는 초기값 개수/);
 assert.throws(()=>run('',r`int m[2][2] = {{1}, 2};`),/행마다 \{ \}로 묶거나/);
});
