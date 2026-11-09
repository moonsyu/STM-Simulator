// RTC settings (rtc-config.js): project rules on both boards, the NVIC lines and handlers, and CubeMX .ioc import.
import test from 'node:test';
import assert from 'node:assert/strict';
import {validateMcu,generateHal,importIoc,defaultMcu} from '../../src/mcu-config.js';
import {irqNamesOf} from '../../src/mcu-family.js';
import {peripheralIrqs,irqLabel} from '../../src/nvic-config.js';
import {rtcWakeupSeconds} from '../../src/rtc-config.js';

const mcu=(family,rtc,nvic={})=>({...defaultMcu(family),peripherals:{RTC:{enabled:true,...rtc}},nvic});

test('defaults, 12-hour format, alarm masks and wakeup on the F446RE; the F103RB keeps a plain alarm and no wakeup',()=>{
 assert.deepEqual(validateMcu(mcu('STM32F446RE',{})).peripherals.RTC,{enabled:true,clockSource:'LSE',time:{hours:0,minutes:0,seconds:0},date:{weekDay:1,month:1,date:1,year:0}});
 const f4=validateMcu(mcu('STM32F446RE',{clockSource:'LSI',hourFormat:12,time:{hours:11,minutes:30,seconds:0,pm:true},alarm:{enabled:true,hours:12,minutes:0,seconds:0,maskDateWeekDay:true,maskHours:true},wakeUp:{enabled:true,clock:'RTCCLK_DIV16',counter:2047}})).peripherals.RTC;
 assert.deepEqual(f4.alarm,{enabled:true,hours:12,minutes:0,seconds:0,maskDateWeekDay:true,maskHours:true,date:1});
 assert.equal(rtcWakeupSeconds(f4,'STM32F446RE'),2048*16/32000,'RTCCLK/16 from the 32 kHz LSI');
 assert.match(generateHal(mcu('STM32F446RE',{clockSource:'LSI'})),/hrtc\.Init\.AsynchPrediv = 127;\n {2}hrtc\.Init\.SynchPrediv = 249;/,'LSI 32 kHz: 128 × 250');
 for(const [rtc,message]of [[{date:{month:2,date:30,year:26}},/2월에는 30일이 없습니다/],[{date:{month:2,date:29,year:25}},/2월에는 29일이 없습니다/],[{time:{hours:24}},/Hours: 0~23/],[{clockSource:'HSE'},/LSE 또는 LSI/]])
  assert.throws(()=>validateMcu(mcu('STM32F446RE',rtc)),message);
 assert.throws(()=>validateMcu(mcu('STM32F103RB',{hourFormat:12})),/12시간 형식이 없습니다/);
 assert.throws(()=>validateMcu(mcu('STM32F103RB',{wakeUp:{enabled:true}})),/WakeUp 타이머가 없습니다/);
 assert.throws(()=>validateMcu(mcu('STM32F103RB',{alarm:{enabled:true,maskHours:true}})),/마스크·날짜 없음/);
 assert.deepEqual(validateMcu(mcu('STM32F103RB',{alarm:{enabled:true,seconds:5}})).peripherals.RTC.alarm,{enabled:true,hours:0,minutes:0,seconds:5});
});

test('NVIC: RTC_Alarm_IRQn and RTC_WKUP_IRQn (F446RE), RTC_IRQn and RTC_Alarm_IRQn (F103RB), with their handlers',()=>{
 assert.deepEqual(peripheralIrqs('STM32F446RE','RTC'),['RTC_Alarm_IRQn','RTC_WKUP_IRQn']);
 assert.deepEqual(peripheralIrqs('STM32F103RB','RTC').sort(),['RTC_Alarm_IRQn','RTC_IRQn']);
 assert.ok(irqNamesOf('STM32F446RE').includes('RTC_Alarm_IRQn'));assert.equal(irqLabel('RTC_WKUP_IRQn'),'RTC wake-up interrupt through the EXTI line 22');
 const code=generateHal(mcu('STM32F103RB',{},{RTC_IRQn:{enabled:true,priority:0},RTC_Alarm_IRQn:{enabled:true,priority:1}}));
 assert.match(code,/void RTC_IRQHandler\(void\) \{[\s\S]*?HAL_RTCEx_RTCIRQHandler\(&hrtc\);/);assert.match(code,/void RTC_Alarm_IRQHandler\(void\) \{[\s\S]*?HAL_RTC_AlarmIRQHandler\(&hrtc\);/);
 assert.match(code,/__HAL_RCC_PWR_CLK_ENABLE\(\);\n {2}HAL_PWR_EnableBkUpAccess\(\);\n {2}__HAL_RCC_BKP_CLK_ENABLE\(\);\n {2}__HAL_RCC_RTC_ENABLE\(\);/);
});

test('.ioc: calendar, alarm A (masks, date) and wakeup keys as CubeMX writes them; the clock source from RCC',()=>{
 const ioc=['Mcu.Name=STM32F446R(C-E)Tx','Mcu.IP0=NVIC','Mcu.IP1=RCC','Mcu.IP2=RTC','RCC.RTCClockSelection=RCC_RTCCLKSOURCE_LSE','RCC.RTCFreq_Value=32768',
  'RTC.IPParameters=Hours,Minutes,Seconds,WeekDay,Month,Date,Year,Alarm,Hours_A,Seconds_A,AlarmMaskDateWeekDay,WakeUpClock,WakeUpCounter','RTC.Hours=11','RTC.Minutes=59','RTC.Seconds=55',
  'RTC.WeekDay=RTC_WEEKDAY_SUNDAY','RTC.Month=RTC_MONTH_MAY','RTC.Date=21','RTC.Year=23','RTC.Alarm=RTC_ALARM_A','RTC.Hours_A=12','RTC.Seconds_A=5','RTC.AlarmMaskDateWeekDay=RTC_ALARMMASK_DATEWEEKDAY',
  'RTC.WakeUpClock=RTC_WAKEUPCLOCK_RTCCLK_DIV16','RTC.WakeUpCounter=2000','VP_RTC_VS_RTC_Activate.Mode=RTC_Enabled','VP_RTC_VS_RTC_Calendar.Mode=RTC_Calendar','VP_RTC_VS_RTC_Alarm_A_Intern.Mode=Alarm A',
  'VP_RTC_VS_RTC_WakeUp_intern.Mode=WakeUp','NVIC.RTC_WKUP_IRQn=true\\:5\\:0\\:false\\:false\\:true\\:true\\:true\\:true'].join('\n');
 const {config,warnings}=importIoc(ioc);
 assert.deepEqual(config.peripherals.RTC,{enabled:true,clockSource:'LSE',time:{hours:11,minutes:59,seconds:55},date:{weekDay:7,month:5,date:21,year:23},
  alarm:{enabled:true,hours:12,minutes:0,seconds:5,maskDateWeekDay:true,date:1},wakeUp:{enabled:true,clock:'RTCCLK_DIV16',counter:2000}});
 assert.deepEqual(config.nvic,{RTC_WKUP_IRQn:{enabled:true,priority:5}});assert.deepEqual(warnings,[]);
 // CubeMX's own default clock source is the LSI (RCC.RTCFreq_Value=32000, no RTCClockSelection key).
 assert.equal(importIoc('Mcu.Name=STM32F103R(8-B)Tx\nMcu.IP0=RTC\nRCC.RTCFreq_Value=40000').config.peripherals.RTC.clockSource,'LSI');
});
