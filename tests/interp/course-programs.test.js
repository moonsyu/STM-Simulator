// Whole small programs of the kind a course hands out, run from start to finish on the built-in interpreter. Each one
// combines the syntax and HAL calls added in 1.36–1.41 (function pointer tables, designated initializers, 2-D tables,
// sscanf, the timer update flag), so a regression in any of them shows here as a program that stops.
import test from 'node:test';
import assert from 'node:assert/strict';
import {blankProject} from '../../src/project.js';
import {generateHal,validateMcu} from '../../src/mcu-config.js';
import {SimulationSession} from '../../src/session.js';

const pin=(fn,label='')=>({function:fn,pull:'NOPULL',edge:'FALLING',label,initial:0});
function run(globals,body,loop,{ms=600,drive=()=>{}}={}){
 const p=blankProject();
 p.mcu.pins={PA5:pin('GPIO_Output','LD2'),PC13:pin('GPIO_EXTI','B1'),PA2:pin('USART2_TX'),PA3:pin('USART2_RX'),PA0:pin('ADC1_IN0'),PA6:pin('TIM3_CH1'),PB0:pin('GPIO_Output'),PB1:pin('GPIO_Output'),PB2:pin('GPIO_Output')};
 p.mcu.peripherals={USART2:{enabled:true},ADC1:{enabled:true},TIM3:{enabled:true,mode:'pwm',prescaler:15,period:999},TIM2:{enabled:true,prescaler:15999,period:99}};
 p.mcu.nvic={EXTI15_10_IRQn:{enabled:true,priority:5},USART2_IRQn:{enabled:true,priority:4}};p.mcu=validateMcu(p.mcu);
 p.code=generateHal(p.mcu,{minimal:true}).replace('/* USER CODE BEGIN 0 */','/* USER CODE BEGIN 0 */\n'+globals).replace('  /* USER CODE BEGIN 2 */','  /* USER CODE BEGIN 2 */\n  '+body).replace('    /* USER CODE BEGIN 3 */','    /* USER CODE BEGIN 3 */\n    '+loop);
 const out=[],warnings=[],s=new SimulationSession(p,{print:x=>out.push(x),warn:w=>warnings.push(w)});s.tick(0);for(let t=10;t<=ms;t+=10){drive(s,t);s.tick(t);}
 assert.deepEqual(warnings,[]);return out;
}
const r=String.raw;

test('a cooperative scheduler: tasks in a table of { function, period } run on HAL_GetTick',()=>{
 const out=run(r`typedef struct { void (*run)(void); uint32_t period; uint32_t last; } Task;
static int blinks;
static void blink(void) { HAL_GPIO_TogglePin(LD2_GPIO_Port, LD2_Pin); blinks++; }
static void report(void) { printf("blinks=%d\n", blinks); }
static Task tasks[] = { { .run = blink, .period = 50 }, { .run = report, .period = 200 } };
#define TASKS (sizeof(tasks) / sizeof(tasks[0]))`,'',
  r`uint32_t now = HAL_GetTick(); for (unsigned i = 0; i < TASKS; i++) { if (now - tasks[i].last >= tasks[i].period) { tasks[i].last = now; tasks[i].run(); } } HAL_Delay(1);`);
 // last = now (not last += period): each pass of the loop takes a little over a millisecond, so the periods drift late.
 assert.equal(out[0],'blinks=4');assert.match(out[1],/^blinks=[78]$/);assert.ok(out.length>=2);
});

test('a command parser: sscanf splits the line, a table of { name, handler } runs it',()=>{
 assert.deepEqual(run(r`#include <string.h>
#include <stdio.h>
typedef struct { const char *name; int (*fn)(int); } Cmd;
static int led(int v) { HAL_GPIO_WritePin(GPIOA, GPIO_PIN_5, v ? GPIO_PIN_SET : GPIO_PIN_RESET); return HAL_GPIO_ReadPin(GPIOA, GPIO_PIN_5); }
static int duty(int v) { __HAL_TIM_SET_COMPARE(&htim3, TIM_CHANNEL_1, v * 10); return (int)__HAL_TIM_GET_COMPARE(&htim3, TIM_CHANNEL_1); }
static const Cmd cmds[] = { {"led", led}, {"duty", duty} };
static int handle(const char *line) { char name[8]; int arg = 0; if (sscanf(line, "%7s %d", name, &arg) < 1) return -1; for (size_t i = 0; i < sizeof(cmds) / sizeof(cmds[0]); i++) if (strcmp(name, cmds[i].name) == 0) return cmds[i].fn(arg); return -2; }`,
  r`HAL_TIM_PWM_Start(&htim3, TIM_CHANNEL_1); const char *script[] = { "led 1", "duty 25", "nope", "" }; for (int i = 0; i < 4; i++) printf("%s -> %d\n", script[i], handle(script[i]));`,''),
  ['led 1 -> 1','duty 25 -> 250','nope -> -2',' -> -1']);
});

test('a pattern player: the timer update flag steps through a 2-D table onto pins from a port table',()=>{
 assert.deepEqual(run(r`static GPIO_TypeDef *const port[] = { GPIOB, GPIOB, GPIOB };
static const uint16_t bit[] = { GPIO_PIN_0, GPIO_PIN_1, GPIO_PIN_2 };
static const uint8_t pattern[4][3] = { {1, 0, 0}, {0, 1, 0}, {0, 0, 1}, {1, 1, 1} };
static int step;`,r`HAL_TIM_Base_Start(&htim2);`,
  r`if (__HAL_TIM_GET_FLAG(&htim2, TIM_FLAG_UPDATE) != RESET) { __HAL_TIM_CLEAR_FLAG(&htim2, TIM_FLAG_UPDATE); for (int k = 0; k < 3; k++) HAL_GPIO_WritePin(port[k], bit[k], pattern[step][k] ? GPIO_PIN_SET : GPIO_PIN_RESET); printf("step %d: %d%d%d\n", step, HAL_GPIO_ReadPin(GPIOB, GPIO_PIN_0), HAL_GPIO_ReadPin(GPIOB, GPIO_PIN_1), HAL_GPIO_ReadPin(GPIOB, GPIO_PIN_2)); step = (step + 1) % 4; }`),
  ['step 0: 100','step 1: 010','step 2: 001','step 3: 111','step 0: 100']);
});

test('interrupt-driven input: UART bytes gathered into a line in the Rx callback, a debounced button count in the EXTI callback',()=>{
 assert.deepEqual(run(r`#include <string.h>
#include <stdio.h>
static uint8_t ch; static char line[32]; static volatile uint8_t len, ready;
void HAL_UART_RxCpltCallback(UART_HandleTypeDef *huart) { if (huart->Instance == USART2) { if (ch == '\n') { line[len] = 0; ready = 1; } else if (len < sizeof(line) - 1) line[len++] = (char)ch; HAL_UART_Receive_IT(&huart2, &ch, 1); } }`,
  r`HAL_UART_Receive_IT(&huart2, &ch, 1);`,
  r`if (ready) { ready = 0; char name[8]; int arg = 0; int n = sscanf(line, "%7s %d", name, &arg); printf("got '%s' (%d) %d %s=%d\n", line, len, n, name, arg); len = 0; }`,
  {drive:(s,t)=>{if(t===100)s.inject('led 1\n','USART2');}}),["got 'led 1' (5) 2 led=1"]);
 assert.deepEqual(run(r`static volatile uint16_t presses; static uint32_t last;
void HAL_GPIO_EXTI_Callback(uint16_t GPIO_Pin) { if (GPIO_Pin == B1_Pin) { uint32_t now = HAL_GetTick(); if (now - last > 50) { presses++; last = now; } } }`,'',
  r`static uint16_t shown; if (shown != presses) { shown = presses; printf("presses=%d\n", shown); }`,
  {drive:(s,t)=>{if(t===100||t===300)s.setPressed({USER:true});if(t===150||t===350)s.setPressed({});}}),['presses=1','presses=2']);
});
