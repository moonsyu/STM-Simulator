// The code an STM32 ARM build adds to the project's sources (CubeIDE keeps it in Core/Src): interrupt handlers
// (stm32xxxx_it.c), newlib system calls (syscalls.c) and the heap (sysmem.c). The build compiles them as one file,
// __stm_environment.c; the editor shows the same text split into CubeIDE's files, read only.
import {isSerial,serialHandle} from './serial-config.js';
import {isTimer} from './timer-config.js';
import {irqHandlers} from './irq-handlers.js';
const PREFIX={STM32F446RE:'stm32f4xx',STM32F103RB:'stm32f1xx'},STARTUP={STM32F446RE:'startup_stm32f446xx.s',STM32F103RB:'startup_stm32f103xb.s'};
export const prefixOf=family=>PREFIX[family]||'stm32f4xx';
export const startupOf=family=>STARTUP[family]||STARTUP.STM32F446RE;
// Lines inside `#if 0` (up to its #else/#elif/#endif, nesting followed) do not define anything; `#if 1 … #else` drops the
// #else part. Other conditions are kept, both branches.
function liveLines(text){const stack=[];return text.split('\n').filter(line=>{
  const d=/^[ \t]*#[ \t]*(if|ifdef|ifndef|elif|else|endif)\b(.*)$/.exec(line),live=()=>stack.every(s=>s.live);
  if(!d)return live();
  if(['if','ifdef','ifndef'].includes(d[1])){const c=d[1]==='if'?d[2].trim():'';stack.push({known:c==='0'||c==='1',live:c!=='0',taken:c==='1'});return false;}
  const top=stack.at(-1);if(!top)return false;
  if(d[1]==='endif')stack.pop();else if(top.known)top.live=!top.taken&&!top.live,top.taken=top.taken||top.live;else top.live=true;
  return false;
}).join('\n');}
const stripC=text=>liveLines(text.replace(/\/\*[\s\S]*?\*\//g,' ').replace(/\/\/[^\n]*/g,' '));
const SBRK=`extern char end, _estack;
__attribute__((weak)) void *_sbrk(ptrdiff_t increment) {
  static uintptr_t current;
  const uintptr_t base=(uintptr_t)&end, limit=(uintptr_t)&_estack-0x1000;
  if(!current) current=base;
  if((increment>0 && (uintptr_t)increment>limit-current) || (increment<0 && (uintptr_t)(-(increment+1))+1>current-base)) { errno=ENOMEM; return (void*)-1; }
  void *previous=(void*)current; current+=increment; return previous;
}`;
// The remaining newlib system calls, as STM32CubeIDE's syscalls.c has them (weak: a project's own syscalls.c wins).
// Without them newlib's nosys stubs link in and every build warns "_close is not implemented".
const SYSCALLS=`__attribute__((weak)) int __io_getchar(void) { return -1; }
__attribute__((weak)) int _read(int file, char *ptr, int len) { (void)file; int i=0; for(;i<len;i++){ int c=__io_getchar(); if(c<0) break; ptr[i]=(char)c; } return i; }
__attribute__((weak)) int _close(int file) { (void)file; return -1; }
__attribute__((weak)) int _fstat(int file, struct stat *st) { (void)file; st->st_mode=S_IFCHR; return 0; }
__attribute__((weak)) int _isatty(int file) { (void)file; return 1; }
__attribute__((weak)) int _lseek(int file, int ptr, int dir) { (void)file; (void)ptr; (void)dir; return 0; }
__attribute__((weak)) int _getpid(void) { return 1; }
__attribute__((weak)) int _kill(int pid, int sig) { (void)pid; (void)sig; errno=EINVAL; return -1; }`;
// The HAL modules the ARM build compiles from the SDK (CubeIDE's Drivers/<HAL>/Src), and the memory of each part.
export const HAL_MODULES=Object.freeze({
  STM32F446RE:['hal','hal_rcc','hal_rcc_ex','hal_gpio','hal_cortex','hal_pwr','hal_pwr_ex','hal_flash','hal_flash_ex','hal_dma','hal_dma_ex','hal_can','hal_i2s','hal_i2s_ex','hal_uart','hal_usart','hal_adc','hal_adc_ex','hal_i2c','hal_spi','hal_tim','hal_tim_ex','hal_dcmi','hal_dcmi_ex','hal_sd','ll_sdmmc','hal_iwdg','hal_wwdg','hal_rtc','hal_rtc_ex','hal_dac','hal_dac_ex','hal_crc'],
  STM32F103RB:['hal','hal_rcc','hal_rcc_ex','hal_gpio','hal_gpio_ex','hal_cortex','hal_pwr','hal_flash','hal_flash_ex','hal_dma','hal_can','hal_uart','hal_usart','hal_adc','hal_adc_ex','hal_i2c','hal_spi','hal_tim','hal_tim_ex','hal_iwdg','hal_wwdg','hal_rtc','hal_rtc_ex','hal_crc']});
const LINKER={STM32F446RE:{name:'STM32F446RETX_FLASH.ld',flash:'512K',ram:'128K'},STM32F103RB:{name:'STM32F103RBTX_FLASH.ld',flash:'128K',ram:'20K'}};
/** The linker script's file name as CubeIDE names it. */
export const linkerName=family=>(LINKER[family]||LINKER.STM32F446RE).name;
/** The linker script the ARM build uses unless the project has its own .ld file. */
export function linkerScript(family){
  const m=LINKER[family]||LINKER.STM32F446RE;
  return `ENTRY(Reset_Handler)
MEMORY { FLASH (rx) : ORIGIN = 0x08000000, LENGTH = ${m.flash}
RAM (xrw) : ORIGIN = 0x20000000, LENGTH = ${m.ram} }
_estack = ORIGIN(RAM) + LENGTH(RAM);
SECTIONS {
 .isr_vector : { KEEP(*(.isr_vector)) } >FLASH
 .text : { *(.text*) *(.rodata*) KEEP(*(.init)) KEEP(*(.fini)) . = ALIGN(4); } >FLASH
 .ARM.extab : { *(.ARM.extab*) } >FLASH
 .ARM.exidx : { __exidx_start = .; *(.ARM.exidx*) __exidx_end = .; } >FLASH
 .preinit_array : { PROVIDE_HIDDEN(__preinit_array_start = .); KEEP(*(.preinit_array*)) PROVIDE_HIDDEN(__preinit_array_end = .); } >FLASH
 .init_array : { PROVIDE_HIDDEN(__init_array_start = .); KEEP(*(SORT(.init_array.*))) KEEP(*(.init_array)) PROVIDE_HIDDEN(__init_array_end = .); } >FLASH
 .fini_array : { PROVIDE_HIDDEN(__fini_array_start = .); KEEP(*(.fini_array*)) PROVIDE_HIDDEN(__fini_array_end = .); } >FLASH
 _sidata = LOADADDR(.data);
 .data : { . = ALIGN(4); _sdata = .; *(.data*) . = ALIGN(4); _edata = .; } >RAM AT>FLASH
 .bss : { . = ALIGN(4); _sbss = .; __bss_start__ = .; *(.bss*) *(COMMON) . = ALIGN(8); _ebss = .; __bss_end__ = .; end = .; _end = .; } >RAM
 .heap_stack (NOLOAD) : { . = ALIGN(8); . += 0x400; . += 0x1000; . = ALIGN(8); } >RAM
}
`;
}
/** The main.h the ARM build writes when the project has none: the HAL include, Error_Handler and the Pinout labels. */
export function mainHeader(project){
  const p=prefixOf(project.mcu?.family),labels=Object.entries(project.mcu?.pins||{}).filter(([,q])=>q.label);
  const section=tag=>[`/* USER CODE BEGIN ${tag} */`,'',`/* USER CODE END ${tag} */`,''];
  return ['#pragma once','',`#include "${p}_hal.h"`,'',...section('Includes'),...section('ET'),...section('EC'),...section('EM'),'void Error_Handler(void);','',...section('EFP'),
    ...(labels.length?['/* Pinout labels (CubeMX writes them here; the build also passes them to every source). */',...labels.flatMap(([pin,q])=>[`#define ${q.label}_Pin GPIO_PIN_${pin.slice(2)}`,`#define ${q.label}_GPIO_Port GPIO${pin[1]}`]),'']:[]),
    ...section('Private defines')].join('\n');
}
/** The build's added code for a HAL project: {text} for the build and {files} as CubeIDE would name them. */
export function buildEnvironment(project){
  const files=[{name:'main.c',text:project.code||''},...(project.firmware?.files||[])],p=prefixOf(project.mcu?.family);
  // Interrupt handlers must be strong: the startup file's Default_Handler aliases are weak too, and a weak-vs-weak tie
  // leaves SysTick unhandled (HAL_Delay would hang). A handler the user's sources already define is left out, so
  // imported Cube stm32f4xx_it.c files still link. Comments and `#if 0` blocks do not count as definitions.
  const userText=stripC(files.map(f=>f.text||'').join('\n')),defined=name=>new RegExp(`\\b${name}\\s*\\(\\s*(?:void)?\\s*\\)\\s*\\{`).test(userText);
  const owner=name=>files.find(f=>new RegExp(`\\b${name}\\s*\\(\\s*(?:void)?\\s*\\)\\s*\\{`).test(stripC(f.text||'')))?.name;
  const handler=(name,body)=>defined(name)?null:`void ${name}(void) { ${body} }`;
  const it=[],skipped=[];
  const tick=handler('SysTick_Handler','HAL_IncTick();');if(tick)it.push(tick);else skipped.push(['SysTick_Handler',owner('SysTick_Handler')]);
  // A synchronous USART uses a USART_HandleTypeDef named husartN (as the generated main.c does).
  const peripherals=project.mcu?.peripherals||{},sync=id=>peripherals[id]?.mode==='synchronous';
  for(const [id,q]of Object.entries(peripherals))if(q.enabled){if(isSerial(id))it.push(sync(id)?`extern USART_HandleTypeDef husart${id.replace(/\D/g,'')};`:`extern UART_HandleTypeDef ${serialHandle(id)};`);if(isTimer(id))it.push(`extern TIM_HandleTypeDef htim${id.slice(3)};`);}
  // DMA streams and every enabled NVIC line get the handler CubeMX writes into stm32xxxx_it.c, unless a source defines it.
  for(const h of irqHandlers(project.mcu)){const text=handler(h.name,h.body);if(!text){if(h.body)skipped.push([h.name,owner(h.name)]);continue;}if(h.extern)it.push(h.extern);it.push(text);}
  const syscalls=['__attribute__((weak)) void _init(void) {}','__attribute__((weak)) void _fini(void) {}','__attribute__((weak)) int __io_putchar(int ch) { return ch; }','__attribute__((weak)) int _write(int file, char *ptr, int len) { (void)file; for(int i=0;i<len;i++) __io_putchar(ptr[i]); return len; }',SYSCALLS];
  const includes=['#include "main.h"','#include <stddef.h>','#include <stdint.h>','#include <errno.h>','#include <sys/stat.h>'];
  const text=[...includes,...syscalls,SBRK,...it].join('\n');
  const note=(file,what,regen)=>`/* ${file} — STM Simulator가 ARM 빌드에 넣는 코드. CubeIDE 프로젝트의 Core/Src/${file}에 해당합니다.\n * ${what}\n * ${regen?'바로 고칠 수 있고 고친 파일만 프로젝트에 저장됩니다. 코드를 다시 생성하면 USER CODE 구역 안만 남고 나머지는 새로 써집니다.':'바로 고칠 수 있고 고친 파일만 프로젝트에 저장됩니다. 한 번 만드는 파일이라 코드를 다시 생성해도 고친 내용이 남습니다.'}\n * 고치기 전에는 빌드가 이 내용을 __stm_environment.c 하나로 합쳐 컴파일하며, 같은 함수를 main.c나 추가 소스에 쓰면 그쪽을 씁니다. */`;
  // As CubeMX writes stm32xxxx_it.c: each handler between its "<IRQ> 0" and "<IRQ> 1" USER CODE sections.
  const block=line=>{const m=/^void (\w+)\(void\) \{ ([\s\S]*) \}$/.exec(line);if(!m)return [line,''];const irq=m[1].replace(/_IRQHandler$|_Handler$/,'')+'_IRQn';
    return [`void ${m[1]}(void)`,'{',`  /* USER CODE BEGIN ${irq} 0 */`,'',`  /* USER CODE END ${irq} 0 */`,`  ${m[2]}`,`  /* USER CODE BEGIN ${irq} 1 */`,'',`  /* USER CODE END ${irq} 1 */`,'}',''];};
  const viewIt=[note(`${p}_it.c`,'켜진 인터럽트의 핸들러와 SysTick(HAL 시간)을 처리합니다.',true),'#include "main.h"','','/* USER CODE BEGIN Includes */','/* USER CODE END Includes */','',
    ...(skipped.length?['/* 프로젝트 소스에 있어 여기서는 만들지 않는 핸들러:',...skipped.map(([n,f])=>` *   ${n}()${f?' — '+f:''}`),' */','']:[]),
    ...new Set(it.filter(l=>l.startsWith('extern '))),'/* USER CODE BEGIN EV */','/* USER CODE END EV */','',
    ...it.filter(l=>!l.startsWith('extern ')).flatMap(block),'/* USER CODE BEGIN 1 */','/* USER CODE END 1 */','',
    `/* NMI_Handler, HardFault_Handler, MemManage_Handler, BusFault_Handler, UsageFault_Handler, SVC_Handler,\n * DebugMon_Handler, PendSV_Handler와 정의하지 않은 다른 IRQ는 ${startupOf(project.mcu?.family)}의 Default_Handler(무한 반복)가 받습니다. */`];
  const viewSyscalls=[note('syscalls.c','printf(_write → __io_putchar)·scanf(_read → __io_getchar)가 쓰는 newlib 시스템 호출입니다.',false),'#include <errno.h>','#include <sys/stat.h>','',...syscalls.flatMap(l=>[l,''])];
  const viewSysmem=[note('sysmem.c','malloc이 쓰는 힙(_sbrk): 링커의 end부터 스택 4 KB 앞(_estack-0x1000)까지입니다.',false),'#include <errno.h>','#include <stddef.h>','#include <stdint.h>','',SBRK];
  // main.h and the linker script are written by the build too, unless the project has its own.
  const has=test=>files.some(f=>test(f.name.split('/').at(-1)));
  const extra=[...(has(n=>n==='main.h')?[]:[{file:'Core/Inc/main.h',text:`/* main.h — STM Simulator가 ARM 빌드에 넣는 코드. CubeIDE 프로젝트의 Core/Inc/main.h에 해당합니다. Pinout 라벨이 바뀌면 이 내용도 바뀝니다.\n * 바로 고칠 수 있고 고친 파일만 프로젝트에 저장됩니다. 코드를 다시 생성하면 USER CODE 구역 안만 남고 나머지는 새로 써집니다. */\n`+mainHeader(project)}]),...(has(n=>/\.ld$/.test(n))?[]:[{file:linkerName(project.mcu?.family),text:`/* ${linkerName(project.mcu?.family)} — STM Simulator가 ARM 빌드에 넣는 코드. CubeIDE 프로젝트의 링커 스크립트에 해당합니다: FLASH·RAM 크기, 섹션 배치, 힙 1 KB와 스택 4 KB.\n * 바로 고칠 수 있고 고친 파일만 프로젝트에 저장됩니다. 한 번 만드는 파일이라 코드를 다시 생성해도 고친 내용이 남습니다. */\n`+linkerScript(project.mcu?.family)}])];
  return {text,files:[{file:`Core/Src/${p}_it.c`,text:viewIt.join('\n')+'\n'},{file:'Core/Src/syscalls.c',text:viewSyscalls.join('\n')},{file:'Core/Src/sysmem.c',text:viewSysmem.join('\n')+'\n'},...extra]};
}
