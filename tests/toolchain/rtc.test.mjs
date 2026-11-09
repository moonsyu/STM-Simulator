// RTC on the ARM GCC build (real STM32Cube HAL) and the firmware emulator, with the MX_RTC_Init the Pinout generates:
// LSE clock, calendar set to 23:59:58 on 2026-12-31, alarm A at 00:00:02 through RTC_Alarm_IRQn (EXTI line 17), the
// date rolling over at midnight (F1: the HAL moves the day out of the seconds counter in HAL_RTC_GetTime) and, on the
// F446RE, the 1 Hz wakeup timer on RTC_WKUP_IRQn.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {FirmwareSession} from '../../src/firmware-session.js';
import {blankProject,projectForBoard} from '../../src/project.js';
import {generateHal} from '../../src/mcu-config.js';

const require=createRequire(import.meta.url),{prepareBuild,build,detectTools}=require('../../desktop/native-build.cjs');
const tools=await detectTools({armGcc:process.env.ARM_GCC||''});
const skip=!(tools.armGcc&&tools.cube&&tools.cubeF1)&&!process.env.CI_REQUIRE_TOOLCHAIN&&'ARM GCC / STM32CubeF4·F1 not installed';
const pin=fn=>({function:fn,pull:'NOPULL',edge:'FALLING',label:'',initial:0});
const runTo=(s,us)=>{for(let t=10;s.now<us;t+=10)s.tick(t);};

test('RTC calendar, midnight rollover, alarm A interrupt and (F446RE) wakeup timer on the emulator (F446RE, F103RB)',{skip,timeout:600000},async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'rtc-'));
 try{
  for(const [board,base]of [['F446RE',blankProject()],['F103RB',projectForBoard('nucleo-f103rb')]]){
   const f4=board==='F446RE',p=structuredClone(base),m=p.mcu;p.components=[];p.wires=[];
   for(const q of ['PC0','PC1','PC2'])m.pins[q]=pin('GPIO_Output');
   m.peripherals.RTC={enabled:true,clockSource:'LSE',time:{hours:23,minutes:59,seconds:58},date:{weekDay:4,month:12,date:31,year:26},
    alarm:{enabled:true,hours:0,minutes:0,seconds:2,...(f4?{maskDateWeekDay:true}:{})},...(f4?{wakeUp:{enabled:true,clock:'CK_SPRE_16BITS',counter:0}}:{})};
   m.nvic.RTC_Alarm_IRQn={enabled:true,priority:1};if(f4)m.nvic.RTC_WKUP_IRQn={enabled:true,priority:2};
   p.code=generateHal(m,{minimal:true}).replace('int main(void) {','volatile uint32_t wakeups;\nRTC_TimeTypeDef now;\nRTC_DateTypeDef today;\nint main(void) {')
    .replace('    /* USER CODE BEGIN 3 */','    /* USER CODE BEGIN 3 */\n    HAL_RTC_GetTime(&hrtc, &now, RTC_FORMAT_BIN);\n    HAL_RTC_GetDate(&hrtc, &today, RTC_FORMAT_BIN);\n    if (today.Year == 27 && today.Month == 1 && today.Date == 1 && now.Hours == 0 && now.Minutes == 0 && now.Seconds >= 1) HAL_GPIO_WritePin(GPIOC, GPIO_PIN_1, GPIO_PIN_SET);')
    +'\nvoid HAL_RTC_AlarmAEventCallback(RTC_HandleTypeDef *h) {\n  (void)h;\n  HAL_GPIO_WritePin(GPIOC, GPIO_PIN_0, GPIO_PIN_SET);\n}\n'
    +(f4?'void HAL_RTCEx_WakeUpTimerEventCallback(RTC_HandleTypeDef *h) {\n  (void)h;\n  if (++wakeups >= 3) HAL_GPIO_WritePin(GPIOC, GPIO_PIN_2, GPIO_PIN_SET);\n}\n':'');
   const result=await build(await prepareBuild({project:p,tools,root,target:'arm'}));
   assert.deepEqual(result.diagnostics.filter(d=>d.severity==='error'),[],board);
   const s=new FirmwareSession(p,{elf:new Uint8Array(await fs.readFile(result.elf))});
   runTo(s,1500000);
   assert.equal(s.gpio.PC0?.value,0,`${board}: no alarm before 00:00:02`);
   runTo(s,4500000);
   assert.equal(s.gpio.PC1?.value,3.3,`${board}: date rolled over to 2027-01-01 00:00`);
   assert.equal(s.gpio.PC0?.value,3.3,`${board}: HAL_RTC_AlarmAEventCallback at 00:00:02`);
   if(f4)assert.equal(s.gpio.PC2?.value,3.3,`${board}: three 1 Hz wakeup interrupts`);
  }
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
