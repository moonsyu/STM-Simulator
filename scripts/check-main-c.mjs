import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {HAL_EXAMPLES,halExample} from '../src/hal-examples.js';
import {blankProject} from '../src/project.js';
import {isSerial,serialHandle} from '../src/serial-config.js';
import {isTimer} from '../src/timer-config.js';

// Real ST headers + drivers + CMSIS + ARM link, never simulator header stubs.
const root=fileURLToPath(new URL('..',import.meta.url));
const cube=process.env.STM32CUBE_F4_ROOT||path.join(process.env.USERPROFILE||'','STM32Cube/Repository/STM32Cube_FW_F4_V1.28.3');
const gcc=process.env.ARM_GCC||'arm-none-eabi-gcc',out=path.join(root,'.cache/main-c-check');
await fs.mkdir(out,{recursive:true});
const hal=path.join(cube,'Drivers/STM32F4xx_HAL_Driver'),device=path.join(cube,'Drivers/CMSIS/Device/ST/STM32F4xx'),core=path.join(cube,'Drivers/CMSIS/Include');
await fs.copyFile(path.join(hal,'Inc/stm32f4xx_hal_conf_template.h'),path.join(out,'stm32f4xx_hal_conf.h'));
const flags=['-mcpu=cortex-m4','-mthumb','-mfpu=fpv4-sp-d16','-mfloat-abi=hard','-DSTM32F446xx','-DUSE_HAL_DRIVER','-std=c11','-Os','-ffunction-sections','-fdata-sections','-Werror=implicit-function-declaration','-Werror=incompatible-pointer-types',...['.',path.join(hal,'Inc'),path.join(device,'Include'),core].map(p=>'-I'+p)];
function run(args){const p=spawnSync(gcc,args,{cwd:out,encoding:'utf8',windowsHide:true});if(p.error||p.status!==0)throw new Error(p.error?.message||p.stderr||p.stdout);}
const objects=[];
for(const module of ['hal','hal_rcc','hal_rcc_ex','hal_gpio','hal_cortex','hal_pwr','hal_pwr_ex','hal_flash','hal_flash_ex','hal_dma','hal_dma_ex','hal_uart','hal_adc','hal_adc_ex','hal_i2c','hal_spi','hal_tim','hal_tim_ex']){const obj=module+'.o';run([...flags,'-c',path.join(hal,'Src/stm32f4xx_'+module+'.c'),'-o',obj]);objects.push(obj);}
for(const [name,source]of [['system',path.join(device,'Source/Templates/system_stm32f4xx.c')],['startup',path.join(device,'Source/Templates/gcc/startup_stm32f446xx.s')]]){run([...flags,'-c',source,'-o',name+'.o']);objects.push(name+'.o');}
await fs.writeFile(path.join(out,'stm32f446re.ld'),`ENTRY(Reset_Handler)
MEMORY { FLASH (rx) : ORIGIN = 0x08000000, LENGTH = 512K
RAM (xrw) : ORIGIN = 0x20000000, LENGTH = 128K }
_estack = ORIGIN(RAM) + LENGTH(RAM);
SECTIONS {
 .isr_vector : { KEEP(*(.isr_vector)) } >FLASH
 .text : { *(.text*) *(.rodata*) KEEP(*(.init)) KEEP(*(.fini)) } >FLASH
 .ARM.extab : { *(.ARM.extab*) } >FLASH
 .ARM.exidx : { __exidx_start = .; *(.ARM.exidx*) __exidx_end = .; } >FLASH
 .preinit_array : { PROVIDE_HIDDEN(__preinit_array_start = .); KEEP(*(.preinit_array*)) PROVIDE_HIDDEN(__preinit_array_end = .); } >FLASH
 .init_array : { PROVIDE_HIDDEN(__init_array_start = .); KEEP(*(SORT(.init_array.*))) KEEP(*(.init_array)) PROVIDE_HIDDEN(__init_array_end = .); } >FLASH
 .fini_array : { PROVIDE_HIDDEN(__fini_array_start = .); KEEP(*(.fini_array*)) PROVIDE_HIDDEN(__fini_array_end = .); } >FLASH
 _sidata = LOADADDR(.data);
 .data : { . = ALIGN(4); _sdata = .; *(.data*) . = ALIGN(4); _edata = .; } >RAM AT>FLASH
 .bss : { . = ALIGN(4); _sbss = .; __bss_start__ = .; *(.bss*) *(COMMON) . = ALIGN(4); _ebss = .; __bss_end__ = .; end = .; _end = .; } >RAM
}
`);
const checked=[],sources={};
for(const [name,project]of [['blank',blankProject()],...Object.keys(HAL_EXAMPLES).map(k=>[k,halExample(k)])]){
  const definitions=Object.entries(project.mcu.pins).filter(([,p])=>p.label).map(([pin,p])=>`#define ${p.label}_Pin GPIO_PIN_${pin.slice(2)}\n#define ${p.label}_GPIO_Port GPIO${pin[1]}`).join('\n');
  await fs.writeFile(path.join(out,'main.h'),'#pragma once\n#include "stm32f4xx_hal.h"\nvoid Error_Handler(void);\n'+definitions+'\n');
  await fs.writeFile(path.join(out,'main.c'),project.code);
  const env=['void _init(void) {}','void _fini(void) {}','#include "main.h"','extern int __io_putchar(int);','void SysTick_Handler(void) { HAL_IncTick(); }','__attribute__((weak)) int _write(int file, char *ptr, int len) { (void)file; for(int i=0;i<len;i++) __io_putchar(ptr[i]); return len; }'];
  for(const [id,p]of Object.entries(project.mcu.peripherals))if(p.enabled){if(isSerial(id))env.push(`extern UART_HandleTypeDef ${serialHandle(id)};`);if(isTimer(id))env.push(`extern TIM_HandleTypeDef htim${id.slice(3)};`);}
  for(const [irq,p]of Object.entries(project.mcu.nvic))if(p.enabled){const id=irq.replace('_IRQn','');const body=isTimer(id)?`HAL_TIM_IRQHandler(&htim${id.slice(3)});`:isSerial(id)?`HAL_UART_IRQHandler(&${serialHandle(id)});`:Object.entries(project.mcu.pins).filter(([,p])=>p.function==='GPIO_EXTI').map(([pin])=>`HAL_GPIO_EXTI_IRQHandler(GPIO_PIN_${pin.slice(2)});`).join('');env.push(`void ${id}_IRQHandler(void) { ${body} }`);}
  await fs.writeFile(path.join(out,'cube-environment.c'),env.join('\n'));
  run([...flags,'-c','main.c','-o',name+'.o']);run([...flags,'-c','cube-environment.c','-o','cube-environment.o']);
  run([...flags,'-Tstm32f446re.ld','-nostartfiles','--specs=nano.specs','--specs=nosys.specs','-Wl,--gc-sections','-u','_printf_float',name+'.o','cube-environment.o',...objects,'-lm','-o',name+'.elf']);
  sources[name]=createHash('sha256').update(project.code).digest('hex');checked.push(name);console.log('ARM HAL compile/link:',name);
}
await fs.mkdir(path.join(root,'work','test-results'),{recursive:true});
await fs.writeFile(path.join(root,'work/test-results/main-c-check.json'),JSON.stringify({passed:true,cube,gcc,checked,sources,hardwareRun:false},null,2));
