// HAL-flavoured idioms on the built-in interpreter (probing 39 of them found these failing): GPIO_TypeDef * kept in
// variables, tables, parameters and struct fields; pointer fields of a struct; static inline; statement macros
// (do { … } while (0)) and multi-line macros; __HAL_GPIO_EXTI_GET_IT / CLEAR_IT; a pointer compared with its array.
import test from 'node:test';
import assert from 'node:assert/strict';
import {blankProject} from '../../src/project.js';
import {generateHal,validateMcu} from '../../src/mcu-config.js';
import {SimulationSession} from '../../src/session.js';
import {expandMacros} from '../../src/hal-source.js';

const pin=(fn,label='')=>({function:fn,pull:'NOPULL',edge:'FALLING',label,initial:0});
function run(globals,body){
 const p=blankProject();p.mcu.pins={PA5:pin('GPIO_Output','LD2'),PB0:pin('GPIO_Output'),PC13:pin('GPIO_EXTI','B1')};p.mcu.nvic={EXTI15_10_IRQn:{enabled:true,priority:5}};p.mcu=validateMcu(p.mcu);
 p.code=generateHal(p.mcu,{minimal:true}).replace('/* USER CODE BEGIN 0 */','/* USER CODE BEGIN 0 */\n'+globals).replace('  /* USER CODE BEGIN 2 */','  /* USER CODE BEGIN 2 */\n  '+body);
 const out=[],s=new SimulationSession(p,{print:x=>out.push(x),warn:()=>{}});s.tick(0);for(let t=10;t<=60;t+=10)s.tick(t);return out;
}
const r=String.raw;

test('GPIO_TypeDef *: a variable, a table, a parameter, a struct field; compared with a port',()=>{
 assert.deepEqual(run(r`static GPIO_TypeDef *const ports[] = {GPIOA, GPIOB};
static const uint16_t pins[] = {GPIO_PIN_5, GPIO_PIN_0};
static void on(GPIO_TypeDef *port, uint16_t pin) { HAL_GPIO_WritePin(port, pin, GPIO_PIN_SET); }
static const char *portName(GPIO_TypeDef *p) { if (p == GPIOA) return "A"; return p == GPIOB ? "B" : "?"; }`,
  r`for (int i = 0; i < 2; i++) on(ports[i], pins[i]); GPIO_TypeDef *p = GPIOB; printf("%d %d %s%s %d\n", HAL_GPIO_ReadPin(GPIOA, GPIO_PIN_5), HAL_GPIO_ReadPin(p, GPIO_PIN_0), portName(ports[0]), portName(p), (int)sizeof(ports));`),['1 1 AB 8']);
 assert.deepEqual(run(r`typedef struct { GPIO_TypeDef *port; uint16_t pin; const char *name; } Led;
static Led led = {GPIOA, GPIO_PIN_5, "LD2"};
static void on(Led *l) { HAL_GPIO_WritePin(l->port, l->pin, GPIO_PIN_SET); }`,r`on(&led); printf("%s %d %d\n", led.name, HAL_GPIO_ReadPin(led.port, led.pin), led.port == GPIOA);`),['LD2 1 1']);
 assert.throws(()=>run('',r`GPIO_TypeDef p;`),/GPIO_TypeDef는 포인터\(GPIO_TypeDef \*\)로 선언하세요/);
});

test('register access through a peripheral is refused with a message that says so',()=>{
 assert.throws(()=>run('',r`GPIOA->ODR |= GPIO_PIN_5;`),/레지스터 직접 접근\(GPIOA->ODR\)은 내장 해석기에서 지원하지 않습니다/);
 assert.throws(()=>run('',r`GPIO_TypeDef *p = GPIOB; uint32_t v = p->IDR; printf("%lu\n", v);`),/레지스터 직접 접근\(GPIOB->IDR\)/);
});

test('pointer fields of a struct: string tables, a buffer pointer, a pointer to another struct, NULL',()=>{
 assert.deepEqual(run(r`typedef struct { const char *name; int code; } Cmd;
static const Cmd cmds[] = { {"on", 1}, {"off", 0} };`,r`for (unsigned i = 0; i < sizeof(cmds) / sizeof(cmds[0]); i++) if (strcmp(cmds[i].name, "off") == 0) printf("%d %s %c %d\n", cmds[i].code, cmds[i].name, cmds[i].name[1], (int)sizeof(Cmd));`),['0 off f 8']);
 assert.deepEqual(run(r`typedef struct { uint8_t *data; uint16_t len; } Buf;
static uint8_t store[4] = {1, 2, 3, 4};`,r`Buf b = {store, 4}; b.data[1] = 9; Buf c = b; c.data += 2; printf("%d %d %d %d %d\n", store[1], *c.data, c.data[1], b.data == store, c.data == store);`),['9 3 4 1 0']);
 assert.deepEqual(run(r`typedef struct { int v; } In;
typedef struct { In *in; const char *label; } Out;
static In inner = {5};`,r`Out o = {&inner}; o.in->v += 1; if (o.label == NULL) o.label = "set"; printf("%d %s\n", inner.v, o.label);`),['6 set']);
 assert.throws(()=>run(r`typedef struct { const char *names[2]; } T;`,'printf("x\\n");'),/포인터 배열 필드는 지원하지 않습니다/);
});

test('static inline, statement macros and macros that continue over lines',()=>{
 assert.deepEqual(run(r`static inline uint16_t clamp(const uint16_t v, const uint16_t hi) { return v > hi ? hi : v; }
#define SWAP(a, b) do { int t = (a); (a) = (b); (b) = t; } while (0)
#define CHECK(x) do { if (!(x)) Error_Handler(); } while (0)
#define BLINK(n) \
  for (int i = 0; i < (n); i++) { \
    HAL_GPIO_TogglePin(GPIOA, GPIO_PIN_5); \
  }
static int after = 7;`,r`int x = 1, y = 2; SWAP(x, y); CHECK(x == 2); BLINK(3); printf("%d %d %d %d %d\n", x, y, clamp(5000, 4095), HAL_GPIO_ReadPin(GPIOA, GPIO_PIN_5), after);`),['2 1 4095 1 7']);
 const macros=new Map([['S',{params:['a'],body:'do { f(a); } while (0)'}],['E',{params:['a'],body:'a + 1'}]]);
 assert.equal(expandMacros('S(1); x = E(2) * 3;',macros),'do { f(1); } while (0); x = (2 + 1) * 3;');
 // A runtime error after a continued macro is still reported on its own line.
 assert.throws(()=>run('#define TWO \\\n  2\n',r`int z = TWO; printf("%d\n", z);
  undefined_function();`),/main\.c:\d+|undefined_function/);
});

test('__HAL_GPIO_EXTI_GET_IT / CLEAR_IT in a hand-written handler; the pending bit is cleared',()=>{
 assert.deepEqual(run('',r`__HAL_GPIO_EXTI_CLEAR_IT(GPIO_PIN_13); printf("%d\n", __HAL_GPIO_EXTI_GET_IT(GPIO_PIN_13) != RESET);`),['0']);
});
