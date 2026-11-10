// What .ioc files written by CubeMX itself hold, checked against 190 real ones (two CubeMX 6.18.1 projects made from the
// NUCLEO-F103RB board template and 188 from public repositories, CubeMX 4.8–6.17). The fixtures below are reduced to
// the keys each case is about.
import test from 'node:test';
import assert from 'node:assert/strict';
import {importIoc,configProblems,generateHal} from '../../src/mcu-config.js';
import {exportIoc} from '../../src/ioc-export.js';
import {importFirmware} from '../../src/firmware-import.js';
import {planDrop} from '../../src/file-drop.js';
import {projectForBoard,validateProject} from '../../src/project.js';
import {SimulationSession} from '../../src/session.js';

// A project created from the NUCLEO-F103RB board template (CubeMX 6.18.1): pin names with their alternate names
// (PC13-TAMPER-RTC), labels with a comment in brackets, SWD and oscillator pins, PA3 (USART2 RX) as GPIO_MODE_AF_PP.
const BOARD_TEMPLATE=String.raw`#MicroXplorer Configuration settings - do not modify
File.Version=6
Mcu.CPN=STM32F103RBT6
Mcu.Family=STM32F1
Mcu.IP0=NVIC
Mcu.IP1=RCC
Mcu.IP2=SYS
Mcu.IP3=USART2
Mcu.IPNb=4
Mcu.Name=STM32F103R(8-B)Tx
Mcu.Package=LQFP64
Mcu.Pin0=PC13-TAMPER-RTC
Mcu.Pin1=PC14-OSC32_IN
Mcu.Pin2=PC15-OSC32_OUT
Mcu.Pin3=PD0-OSC_IN
Mcu.Pin4=PD1-OSC_OUT
Mcu.Pin5=PA2
Mcu.Pin6=PA3
Mcu.Pin7=PA5
Mcu.Pin8=PA13
Mcu.Pin9=PA14
Mcu.Pin10=PB3
Mcu.Pin11=VP_SYS_VS_Systick
Mcu.PinsNb=12
Mcu.UserName=STM32F103RBTx
MxCube.Version=6.18.1
NVIC.EXTI15_10_IRQn=true\:0\:0\:false\:false\:true\:true\:true\:true
NVIC.PriorityGroup=NVIC_PRIORITYGROUP_4
NVIC.SysTick_IRQn=true\:0\:0\:false\:false\:true\:true\:true\:false
PA13.GPIOParameters=GPIO_Label
PA13.GPIO_Label=TMS
PA13.Locked=true
PA13.Mode=Serial_Wire
PA13.Signal=SYS_JTMS-SWDIO
PA14.GPIOParameters=GPIO_Label
PA14.GPIO_Label=TCK
PA14.Locked=true
PA14.Mode=Serial_Wire
PA14.Signal=SYS_JTCK-SWCLK
PA2.GPIOParameters=GPIO_Speed,GPIO_PuPd,GPIO_Label,GPIO_Mode
PA2.GPIO_Label=USART_TX
PA2.GPIO_Mode=GPIO_MODE_AF_PP
PA2.GPIO_PuPd=GPIO_NOPULL
PA2.GPIO_Speed=GPIO_SPEED_FREQ_LOW
PA2.Locked=true
PA2.Mode=Asynchronous
PA2.Signal=USART2_TX
PA3.GPIOParameters=GPIO_Speed,GPIO_PuPd,GPIO_Label,GPIO_Mode
PA3.GPIO_Label=USART_RX
PA3.GPIO_Mode=GPIO_MODE_AF_PP
PA3.GPIO_PuPd=GPIO_NOPULL
PA3.GPIO_Speed=GPIO_SPEED_FREQ_LOW
PA3.Locked=true
PA3.Mode=Asynchronous
PA3.Signal=USART2_RX
PA5.GPIOParameters=GPIO_Speed,GPIO_PuPd,GPIO_Label,GPIO_ModeDefaultOutputPP
PA5.GPIO_Label=LD2 [Green Led]
PA5.GPIO_ModeDefaultOutputPP=GPIO_MODE_OUTPUT_PP
PA5.GPIO_PuPd=GPIO_NOPULL
PA5.GPIO_Speed=GPIO_SPEED_FREQ_LOW
PA5.Locked=true
PA5.Signal=GPIO_Output
PB3.GPIOParameters=GPIO_Label
PB3.GPIO_Label=SWO
PB3.Locked=true
PB3.Signal=SYS_JTDO-TRACESWO
PC13-TAMPER-RTC.GPIOParameters=GPIO_PuPd,GPIO_Label
PC13-TAMPER-RTC.GPIO_Label=B1 [Blue PushButton]
PC13-TAMPER-RTC.GPIO_PuPd=GPIO_NOPULL
PC13-TAMPER-RTC.Locked=true
PC13-TAMPER-RTC.Signal=GPXTI13
PC14-OSC32_IN.Locked=true
PC14-OSC32_IN.Signal=RCC_OSC32_IN
PC15-OSC32_OUT.Locked=true
PC15-OSC32_OUT.Signal=RCC_OSC32_OUT
PD0-OSC_IN.Locked=true
PD0-OSC_IN.Mode=HSE-External-Clock-Source
PD0-OSC_IN.Signal=RCC_OSC_IN
PD1-OSC_OUT.Locked=true
PD1-OSC_OUT.Mode=HSE-External-Clock-Source
PD1-OSC_OUT.Signal=RCC_OSC_OUT
RCC.APB1CLKDivider=RCC_HCLK_DIV2
RCC.PLLMUL=RCC_PLL_MUL16
RCC.SYSCLKSource=RCC_SYSCLKSOURCE_PLLCLK
SH.GPXTI13.0=GPIO_EXTI13
SH.GPXTI13.ConfNb=1
USART2.IPParameters=VirtualMode
USART2.VirtualMode=VM_ASYNC
VP_SYS_VS_Systick.Mode=SysTick
VP_SYS_VS_Systick.Signal=SYS_VS_Systick
board=NUCLEO-F103RB
boardIOC=true
`;
// The USART2 part of the stm32f1xx_hal_msp.c CubeMX generates for that .ioc: TX and RX together as AF_PP.
const MSP=`#include "main.h"
void HAL_MspInit(void) { __HAL_RCC_AFIO_CLK_ENABLE(); __HAL_RCC_PWR_CLK_ENABLE(); }
void HAL_UART_MspInit(UART_HandleTypeDef* huart)
{
  GPIO_InitTypeDef GPIO_InitStruct = {0};
  if(huart->Instance==USART2)
  {
    __HAL_RCC_USART2_CLK_ENABLE();
    __HAL_RCC_GPIOA_CLK_ENABLE();
    GPIO_InitStruct.Pin = USART_TX_Pin|USART_RX_Pin;
    GPIO_InitStruct.Mode = GPIO_MODE_AF_PP;
    GPIO_InitStruct.Speed = GPIO_SPEED_FREQ_LOW;
    HAL_GPIO_Init(GPIOA, &GPIO_InitStruct);
  }
}
`;

test('the NUCLEO-F103RB board template: pins, labels, EXTI default edge, 64 MHz from HSI/2 × 16, no warning',()=>{
 const {config,warnings}=importIoc(BOARD_TEMPLATE);
 assert.deepEqual(warnings,[]);assert.deepEqual(configProblems(config),[]);
 assert.equal(config.family,'STM32F103RB');
 assert.deepEqual(Object.fromEntries(Object.entries(config.pins).map(([p,v])=>[p,v.function+(v.label?':'+v.label:'')])),
  {PA13:'Reserved:TMS',PA14:'Reserved:TCK',PA2:'USART2_TX:USART_TX',PA3:'USART2_RX:USART_RX',PA5:'GPIO_Output:LD2',PB3:'Reserved:SWO',PC13:'GPIO_EXTI:B1',PC14:'Reserved',PC15:'Reserved',PD0:'Reserved',PD1:'Reserved'});
 assert.equal(config.pins.PC13.edge,'RISING');assert.equal(config.timerClockHz,64000000);
 assert.deepEqual(config.nvic,{EXTI15_10_IRQn:{enabled:true,priority:0}});
 const code=generateHal(config);assert.match(code,/RCC_PLL_MUL16/);assert.match(code,/GPIO_MODE_IT_RISING/);
 // Exported and read again: the same configuration, the debug and oscillator pins included.
 const text=exportIoc(config);assert.match(text,/^PA13\.Signal=SYS_JTMS-SWDIO$/m);assert.match(text,/^PD0\.Signal=RCC_OSC_IN$/m);
 assert.deepEqual(importIoc(text).config,config);
});

test('the project CubeMX generates for it runs on the interpreter: PA3 set up as GPIO_MODE_AF_PP, sources with CRLF',()=>{
 const base=projectForBoard('nucleo-f103rb'),mcu=importIoc(BOARD_TEMPLATE).config;
 const main=generateHal(mcu,{minimal:true}).replace('  /* USER CODE BEGIN 2 */','  /* USER CODE BEGIN 2 */\n  printf("up %lu\\n", SystemCoreClock);');
 const crlf=t=>'﻿'+t.replace(/\n/g,'\r\n');
 const dropped=[{name:'proj/proj.ioc',text:crlf(BOARD_TEMPLATE)},{name:'proj/Core/Src/main.c',text:crlf(main)},{name:'proj/Core/Src/stm32f1xx_hal_msp.c',text:crlf(MSP)},{name:'proj/Core/Src/syscalls.c',text:''}];
 const plan=planDrop(dropped,base);assert.equal(plan.action,'import');
 const {project,warnings}=importFirmware(base,plan.files);assert.deepEqual(warnings,[]);
 // Kept with \n line ends and no byte order mark.
 assert.ok(!/\r|﻿/.test(project.code+project.firmware.files.map(f=>f.text).join('')));
 const out=[],warn=[],s=new SimulationSession(validateProject(project),{print:x=>out.push(x),warn:w=>warn.push(w)});s.tick(0);for(let t=10;t<=50;t+=10)s.tick(t);
 assert.deepEqual(out,['up 64000000']);assert.deepEqual(warn,[]);
 // A project saved earlier with \r\n text is read back with \n.
 assert.ok(!/\r/.test(validateProject({...project,code:project.code.replace(/\n/g,'\r\n')}).code));
});

const F446=`Mcu.Family=STM32F4\nMcu.Name=STM32F446R(C-E)Tx\nMcu.UserName=STM32F446RETx\nMcu.Package=LQFP64\n`;
test('a shared timer signal follows its SH line: S_TIM2_CH1_ETR is TIM2_CH1',()=>{
 const {config,warnings}=importIoc(F446+String.raw`Mcu.IP0=TIM2
PA5.Signal=S_TIM2_CH1_ETR
SH.S_TIM2_CH1_ETR.0=TIM2_CH1,PWM Generation1 CH1
SH.S_TIM2_CH1_ETR.ConfNb=1
TIM2.Channel-PWM\ Generation1\ CH1=TIM_CHANNEL_1
TIM2.IPParameters=Channel-PWM Generation1 CH1
`);
 assert.equal(config.pins.PA5.function,'TIM2_CH1');assert.equal(config.peripherals.TIM2.mode,'pwm');assert.deepEqual(warnings,[]);
});

test('a label a C name cannot hold is read as CubeMX names its macro: LCD-D4 → LCD_D4, HV+ → HV_',()=>{
 const {config,warnings}=importIoc(F446+`PA8.Signal=GPIO_Output\nPA8.GPIO_Label=LCD-D4\nPA9.Signal=GPIO_Output\nPA9.GPIO_Label=HV+\nPA10.Signal=GPIO_Input\nPA10.GPIO_Label=3V3_OK [power good]\n`);
 assert.deepEqual([config.pins.PA8.label,config.pins.PA9.label,config.pins.PA10.label],['LCD_D4','HV_','_3V3_OK']);assert.deepEqual(warnings,[]);
 assert.deepEqual(configProblems(config),[]);
});

test('an interrupt line of a peripheral that is not imported is left out with a note, so the code can be generated',()=>{
 // TIM1 as the HAL time base (FreeRTOS projects): its update interrupt is on, the timer is not a peripheral of the project.
 const {config,warnings}=importIoc(F446+String.raw`Mcu.IP0=NVIC
NVIC.TIM1_UP_TIM10_IRQn=true\:15\:0\:false\:false\:true\:false\:false\:true
NVIC.TimeBase=TIM1_UP_TIM10_IRQn
NVIC.TimeBaseIP=TIM1
PA5.Signal=GPIO_Output
VP_SYS_VS_tim1.Mode=TIM1
VP_SYS_VS_tim1.Signal=SYS_VS_tim1
`);
 assert.equal(config.nvic.TIM1_UP_TIM10_IRQn,undefined);
 assert.deepEqual(warnings,['TIM1_UP_TIM10_IRQn: 이 인터럽트를 쓰는 주변장치를 가져오지 않아 NVIC 설정에서 뺐습니다.']);
 assert.deepEqual(configProblems(config),[]);generateHal(config);
});
