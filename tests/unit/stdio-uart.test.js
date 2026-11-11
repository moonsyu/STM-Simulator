// Feature 44: printf / scanf go to the UART. The interpreter sends printf through the project's own _write (or
// __io_putchar) and reads scanf / getchar through _read (or __io_getchar), as newlib does on the board; the generator
// writes _write / _read on USART2 when it is enabled; an example opened as a project gets USART2 on PA2 / PA3.
import test from 'node:test';
import assert from 'node:assert/strict';
import {SimulationSession} from '../../src/session.js';
import {blankProject,validateProject} from '../../src/project.js';
import {generateHal,validateMcu,consoleUart,defaultMcu} from '../../src/mcu-config.js';
import {regenerateMain} from '../../src/c-source-edit.js';
import {applyHalExample,halExampleFor,allHalExamples,consoleExample} from '../../src/hal-examples.js';
import {recipeFor} from '../../src/device-docs-data.js';
import {uartLineText,uartMonitorText} from '../../src/uart-text.js';
import {consoleSink} from './helpers/console.js';

const pin=fn=>({function:fn,pull:'NOPULL',edge:'FALLING',label:'',initial:0});
const withUart=(extra={})=>validateMcu({...defaultMcu(),pins:{PA2:pin('USART2_TX'),PA3:pin('USART2_RX')},peripherals:{USART2:{enabled:true,baud:115200,...extra}},nvic:{}});
// A project whose main.c is the generated code with `loop` in the main loop and `zero` in USER CODE 0.
function program(mcu,{setup='',loop='    HAL_Delay(100);',zero=''}={}){
 const p=blankProject();p.mcu=mcu;
 p.code=generateHal(mcu).replace(/ *uint8_t message\[\] = "HAL ready\\r\\n";\n *HAL_UART_Transmit\(&huart2, message, sizeof\(message\)-1, 100\);\n/,'')
  .replace('/* USER CODE BEGIN 0 */','/* USER CODE BEGIN 0 */\n'+zero).replace('  /* USER CODE BEGIN 2 */','  /* USER CODE BEGIN 2 */\n'+setup)
  .replace(/    \/\* USER CODE BEGIN 3 \*\/\n[\s\S]*?    \/\* USER CODE END 3 \*\//,'    /* USER CODE BEGIN 3 */\n'+loop+'\n    /* USER CODE END 3 */');
 return validateProject(p);
}
function run(p,ms,inject){
 const console_=[],events=[],s=new SimulationSession(p,{print:v=>console_.push(String(v)),uart:e=>events.push(e)});
 s.tick(0);for(let t=10;t<=ms;t+=10){if(inject&&t===inject[0])s.inject(inject[1],'USART2');s.tick(t);}
 const tx=events.filter(e=>e.direction==='TX').map(e=>String.fromCharCode(...e.bytes));
 return {console:console_,tx,vcp:s.buses.vcpOutput||'',s};
}

test('generated code: _write / _read on USART2 when it is enabled, the ITM __io_putchar without it',()=>{
 const on=generateHal(withUart()),off=generateHal(validateMcu({...defaultMcu(),pins:{},peripherals:{},nvic:{}}));
 assert.match(on,/int _write\(int file, char \*ptr, int len\) \{\n {2}UNUSED\(file\);\n {2}HAL_UART_Transmit\(&huart2, \(uint8_t \*\)ptr, len, HAL_MAX_DELAY\);\n {2}return len;\n\}/);
 assert.match(on,/int _read\(int file, char \*ptr, int len\) \{[\s\S]*HAL_UART_Receive\(&huart2, \(uint8_t \*\)ptr, 1, HAL_MAX_DELAY\)[\s\S]*HAL_UART_Transmit\(&huart2, \(uint8_t \*\)ptr, 1, HAL_MAX_DELAY\);\n {2}return 1;\n\}/);
 assert.doesNotMatch(on,/ITM_SendChar|__io_putchar/);assert.match(on,/printf \/ scanf: USART2/);
 assert.match(off,/int __io_putchar\(int ch\) \{\n {2}ITM_SendChar\(ch\);/);assert.doesNotMatch(off,/_write|_read/);
 // A transmit-only USART2 has no _read; a receive-only or synchronous one keeps ITM.
 const txOnly=generateHal(withUart({direction:'TX'}));assert.match(txOnly,/int _write\(/);assert.doesNotMatch(txOnly,/int _read\(/);
 assert.match(generateHal(withUart({direction:'RX'})),/ITM_SendChar/);
 // The minimal code (코드 초기화) has neither.
 assert.doesNotMatch(generateHal(withUart(),{minimal:true}),/_write|__io_putchar/);
});

test('regenerating: the project\'s own _write / _read in a user section replaces the generated ones',()=>{
 const mcu=withUart(),generated=generateHal(mcu);
 const mine=generated.replace('/* USER CODE BEGIN 0 */','/* USER CODE BEGIN 0 */\nint _write(int file, char *ptr, int len) { HAL_UART_Transmit(&huart2, (uint8_t *)ptr, len, 10); return len; }\nint _read(int file, char *ptr, int len) { return 0; }');
 const again=regenerateMain(mine,generated,generated).code;
 assert.equal(again.split('int _write(').length-1,1,'one _write');assert.equal(again.split('int _read(').length-1,1,'one _read');
 assert.match(again,/HAL_UART_Transmit\(&huart2, \(uint8_t \*\)ptr, len, 10\)/,'the user\'s version is the one kept');
});

test('interpreter: printf goes out through the generated _write on USART2, a line at a time, not to the console',()=>{
 const r=run(program(withUart(),{loop:'    printf("tick %lu\\r\\n", HAL_GetTick() / 100);\n    HAL_Delay(100);'}),350);
 assert.deepEqual(r.console,[]);
 assert.ok(r.tx.length>=3);assert.match(r.tx[0],/^tick 0\r\n$/);assert.match(r.vcp,/^tick 0\r\ntick 1\r\ntick 2\r\n/);
 // Without USART2 the same printf goes to the console (SWV ITM), as before.
 const itm=run(program(validateMcu({...defaultMcu(),pins:{},peripherals:{},nvic:{}}),{loop:'    printf("tick\\n");\n    HAL_Delay(100);'}),150);
 assert.deepEqual(itm.console.slice(0,2),['tick','tick']);assert.deepEqual(itm.tx,[]);
});

test('interpreter: stdout is line buffered — text without a line end waits; fflush and setvbuf send it; puts and putchar follow',()=>{
 const buffered=run(program(withUart(),{setup:'  printf("a");\n  printf("b");\n  HAL_Delay(50);\n  printf("c\\n");\n  puts("d");\n  putchar(69);\n  putchar(10);',loop:'    HAL_Delay(100);'}),200);
 assert.deepEqual(buffered.tx,['abc\n','d\n','E\n']);
 const flushed=run(program(withUart(),{setup:'  printf("a");\n  fflush(stdout);\n  HAL_Delay(50);\n  printf("b\\n");',loop:'    HAL_Delay(100);'}),200);
 assert.deepEqual(flushed.tx,['a','b\n']);
 const raw=run(program(withUart(),{setup:'  setvbuf(stdout, NULL, _IONBF, 0);\n  printf("a");\n  printf("b");',loop:'    HAL_Delay(100);'}),200);
 assert.deepEqual(raw.tx,['a','b']);
 // A long line goes out in pieces the HAL call can take; nothing is lost.
 const long=run(program(withUart(),{setup:'  for (int i = 0; i < 30; i++) printf("0123456789");\n  printf("\\n");',loop:'    HAL_Delay(100);'}),300);
 assert.equal(long.tx.join(''),'0123456789'.repeat(30)+'\n');assert.ok(long.tx.every(t=>t.length<=128));
});

test('interpreter: a project\'s own __io_putchar and _write are called; Korean text arrives as UTF-8',()=>{
 const mcu=withUart();
 // __io_putchar that sends each character itself (the generated _write is replaced by the user's functions).
 const own=program(mcu,{loop:'    printf("hi\\n");\n    HAL_Delay(100);'});
 own.code=own.code.replace(/int _write\(int file, char \*ptr, int len\) \{[\s\S]*?\n\}\n/,'int __io_putchar(int ch) {\n  uint8_t c = (uint8_t)ch;\n  HAL_UART_Transmit(&huart2, &c, 1, 10);\n  return ch;\n}\n').replace(/int _read\(int file, char \*ptr, int len\) \{[\s\S]*?\n\}\n/,'');
 const r=run(validateProject(own),150);assert.deepEqual(r.tx.slice(0,3),['h','i','\n']);assert.deepEqual(r.console,[]);
 const korean=program(mcu,{setup:'  printf("온도 %d도\\n", 25);',loop:'    HAL_Delay(100);'}),out=[],s=new SimulationSession(korean,consoleSink(out));
 s.tick(0);for(let t=10;t<=100;t+=10)s.tick(t);assert.deepEqual(out,['온도 25도']);
});

test('interpreter: scanf and getchar read the serial input through _read, with the echo; the prompt is sent first',()=>{
 const p=program(withUart(),{loop:'    int a = 0, b = 0;\n    printf("two numbers? ");\n    int n = scanf("%d %d", &a, &b);\n    printf("n=%d sum=%d\\r\\n", n, a + b);\n    int c = getchar();\n    printf("key=%c\\r\\n", c);\n    HAL_Delay(1000);'});
 const waiting=run(p,100);assert.equal(waiting.vcp,'two numbers? ','the prompt is out before the input is read');
 const r=run(p,400,[100,'12 30\rx']);
 // Each typed character is echoed by the generated _read, then the answers.
 assert.match(r.vcp,/^two numbers\? 12 30\rn=2 sum=42\r\nxkey=x\r\n/);
 assert.ok(!r.s.result?.fault);
});

test('error cases: scanf without _read says what to add; printf inside an interrupt callback still goes out',()=>{
 const p=program(withUart(),{loop:'    int v;\n    scanf("%d", &v);\n    HAL_Delay(100);'});
 p.code=p.code.replace(/int _read\(int file, char \*ptr, int len\) \{[\s\S]*?\n\}\n/,'');
 assert.throws(()=>{const s=new SimulationSession(validateProject(p),{});s.tick(0);for(let t=10;t<=50;t+=10)s.tick(t);if(s.runtime.error)throw s.runtime.error;},/scanf: 입력을 받는 _read\(또는 __io_getchar\)가 프로젝트에 없습니다/);
 // printf in HAL_GPIO_EXTI_Callback: HAL_UART_Transmit polls, so it works inside the handler.
 const mcu=validateMcu({...defaultMcu(),pins:{PA2:pin('USART2_TX'),PA3:pin('USART2_RX'),PC13:{...pin('GPIO_EXTI'),edge:'FALLING'}},peripherals:{USART2:{enabled:true,baud:115200}},nvic:{EXTI15_10_IRQn:{enabled:true,priority:0}}});
 const q=program(mcu,{loop:'    HAL_Delay(100);'});
 q.code=q.code.replace('  /* 핀 번호에 따라 인터럽트 처리를 작성하세요. */','  printf("pressed\\n");');
 const events=[],s=new SimulationSession(validateProject(q),{uart:e=>events.push(e)});
 s.tick(0);for(let t=10;t<=50;t+=10)s.tick(t);s.setPressed({USER:true});for(let t=60;t<=120;t+=10)s.tick(t);
 assert.ok(events.some(e=>e.direction==='TX'&&String.fromCharCode(...e.bytes)==='pressed\n'),JSON.stringify(events.map(e=>String.fromCharCode(...e.bytes))));
});

test('examples opened as a project print on USART2; those that use USART2 or its pins keep their code; Docs recipes are untouched',()=>{
 const ids=Object.keys(allHalExamples()),kept=[];
 for(const id of ids){
  let p;try{p=applyHalExample(blankProject(),id);}catch{continue;}
  if(!/\bprintf\(/.test(p.code))continue;
  const plain=halExampleFor(id,'nucleo-f446re');
  if(plain.mcu.peripherals.USART2||plain.mcu.pins.PA2||plain.mcu.pins.PA3){kept.push(id);continue;}
  assert.match(p.code,/int _write\(int file, char \*ptr, int len\)/,id);assert.doesNotMatch(p.code,/ITM_SendChar/,id);
  assert.deepEqual([p.mcu.pins.PA2.function,p.mcu.pins.PA3.function,p.mcu.peripherals.USART2.baud],['USART2_TX','USART2_RX',115200],id);
  assert.match(p.code,/\n {4}MX_USART2_UART_Init\(\);\n {4}\/\* USER CODE BEGIN 2 \*\//,id);
  assert.doesNotThrow(()=>validateProject(p),id);
 }
 // Examples whose subject is USART2 itself are the ones left as they were.
 assert.ok(kept.includes('dma_uart_echo')&&kept.includes('noise_errors'),kept.join(' '));
 // The recipe device Docs merge into a project carries only the device's own pins.
 const recipe=recipeFor('ref_ds3231_zs042_10','nucleo-f446re');
 assert.equal(recipe.mcu.peripherals.USART2,undefined);assert.equal(recipe.mcu.pins.PA2,undefined);
 // consoleUart leaves a configuration that uses a pin or the port alone, and consoleExample one that has its own _write.
 const busy={...defaultMcu(),pins:{PA2:pin('GPIO_Output')},peripherals:{},nvic:{}};assert.equal(consoleUart(busy).peripherals.USART2,undefined);
 const own=halExampleFor('blink','nucleo-f446re');own.code=own.code.replace('/* USER CODE BEGIN 0 */','/* USER CODE BEGIN 0 */\nint _write(int file, char *ptr, int len) { return len; }');
 const before=own.code;assert.equal(consoleExample(own).code,before);
});

test('the DS3231 module example prints the time on the virtual COM port',()=>{
 const p=validateProject(applyHalExample(blankProject(),'ref_ds3231_zs042_10')),out=[],direct=[];
 const s=new SimulationSession(p,{...consoleSink(out),print:v=>direct.push(String(v))});
 s.tick(0);for(let t=50;t<=2100;t+=50)s.tick(t);
 assert.deepEqual(direct,[],'nothing on the SWV console');
 assert.ok(out.some(l=>/^20\d\d-\d\d-\d\d \d\d:\d\d:\d\d/.test(l)),out.join('|'));
 assert.match(s.buses.vcpOutput,/20\d\d-\d\d-\d\d \d\d:\d\d:\d\d/);
});

test('UART text for the log: UTF-8 characters are decoded, other bytes stay as \\xNN; the monitor decodes its text',()=>{
 const bytes=text=>[...new TextEncoder().encode(text)];
 assert.equal(uartLineText(bytes('온도 25도 OK')),'온도 25도 OK');
 assert.equal(uartLineText([0x41,0x00,0xff,0x42]),'A\\x00\\xffB');
 // A character whose bytes have not all arrived is not shown yet; an invalid sequence is shown as bytes.
 assert.equal(uartLineText(bytes('가').slice(0,2)),'');assert.equal(uartLineText([...bytes('가').slice(0,2),0x41]),'\\xea\\xb0A');
 const codes=String.fromCharCode(...bytes('시간 12:00\r\nok\r\n'));
 assert.equal(uartMonitorText(codes),'시간 12:00\r\nok\r\n');assert.equal(uartMonitorText('plain\r\n'),'plain\r\n');assert.equal(uartMonitorText(undefined),'');
});
