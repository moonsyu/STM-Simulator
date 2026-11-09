// RTC on the built-in interpreter with the MX_RTC_Init the Pinout generates (BCD literals, LSE): the calendar runs with
// the simulated time and rolls over at midnight, alarm A calls HAL_RTC_AlarmAEventCallback through RTC_Alarm_IRQn,
// the F4 wakeup timer and the F1 second interrupt run, and HAL misuse the real chip would not survive is reported.
import test from 'node:test';
import assert from 'node:assert/strict';
import {halProject,run,advance} from './helpers.js';
import {blankProject} from '../../src/project.js';
import {generateHal} from '../../src/mcu-config.js';

const show='    HAL_RTC_GetTime(&hrtc, &now, RTC_FORMAT_BIN);\n    HAL_RTC_GetDate(&hrtc, &today, RTC_FORMAT_BIN);\n    printf("20%02u-%02u-%02u %02u:%02u:%02u wd%u alarms=%lu wakeups=%lu\\n", today.Year, today.Month, today.Date, now.Hours, now.Minutes, now.Seconds, today.WeekDay, alarms, wakeups);\n    HAL_Delay(1000);';
const globals='RTC_TimeTypeDef now;\nRTC_DateTypeDef today;\nvolatile uint32_t alarms, wakeups;';
const callbacks='void HAL_RTC_AlarmAEventCallback(RTC_HandleTypeDef *h) { (void)h; alarms++; }\nvoid HAL_RTCEx_WakeUpTimerEventCallback(RTC_HandleTypeDef *h) { (void)h; wakeups++; }';
const rtc=extra=>({enabled:true,clockSource:'LSE',time:{hours:23,minutes:59,seconds:58},date:{weekDay:4,month:12,date:31,year:26},...extra});

test('F446RE: midnight rollover to 2027-01-01 (weekday counts on), alarm A at 00:00:02 and the 1 Hz wakeup timer',()=>{
 const p=halProject({peripherals:{RTC:rtc({alarm:{enabled:true,hours:0,minutes:0,seconds:2,maskDateWeekDay:true},wakeUp:{enabled:true,clock:'CK_SPRE_16BITS',counter:0}})},
  nvic:{RTC_Alarm_IRQn:{enabled:true,priority:1},RTC_WKUP_IRQn:{enabled:true,priority:2}},globals,loop:show,extra:callbacks});
 assert.match(p.code,/sTime\.Hours = 0x23;[\s\S]*HAL_RTC_SetTime\(&hrtc, &sTime, RTC_FORMAT_BCD\)[\s\S]*sDate\.Month = RTC_MONTH_DECEMBER;[\s\S]*sAlarm\.AlarmMask = RTC_ALARMMASK_DATEWEEKDAY;[\s\S]*HAL_RTC_SetAlarm_IT[\s\S]*HAL_RTCEx_SetWakeUpTimer_IT\(&hrtc, 0, RTC_WAKEUPCLOCK_CK_SPRE_16BITS\)/);
 const {s,output,warnings}=run(p);advance(s,4050,10);
 assert.ok(!s.result?.fault);assert.deepEqual(warnings,[]);
 const lines=output.filter(l=>/^20\d\d-/.test(l));
 assert.deepEqual(lines.slice(0,5),['2026-12-31 23:59:58 wd4 alarms=0 wakeups=0','2026-12-31 23:59:59 wd4 alarms=0 wakeups=1','2027-01-01 00:00:00 wd5 alarms=0 wakeups=2','2027-01-01 00:00:01 wd5 alarms=0 wakeups=3','2027-01-01 00:00:02 wd5 alarms=1 wakeups=4']);
});

test('F103RB: the same calendar and alarm with RTC_AUTO_1_SECOND; the second interrupt (HAL_RTCEx_SetSecond_IT) on RTC_IRQn',()=>{
 const p=blankProject('STM32F103RB');p.boardId='nucleo-f103rb';Object.assign(p.mcu.peripherals,{RTC:rtc({alarm:{enabled:true,hours:0,minutes:0,seconds:2}})});Object.assign(p.mcu.nvic,{RTC_Alarm_IRQn:{enabled:true,priority:1},RTC_IRQn:{enabled:true,priority:2}});
 p.code=generateHal(p.mcu,{minimal:true}).replace('int main(void) {',globals+'\nvolatile uint32_t seconds;\nint main(void) {').replace('  /* USER CODE BEGIN 2 */','  /* USER CODE BEGIN 2 */\n  HAL_RTCEx_SetSecond_IT(&hrtc);').replace('    /* USER CODE BEGIN 3 */','    /* USER CODE BEGIN 3 */\n'+show.replace('wakeups=%lu','seconds=%lu').replace(', wakeups);',', seconds);'))
  +'\n'+callbacks.split('\n')[0]+'\nvoid HAL_RTCEx_RTCEventCallback(RTC_HandleTypeDef *h) { (void)h; seconds++; }\n';
 assert.match(p.code,/hrtc\.Init\.AsynchPrediv = RTC_AUTO_1_SECOND;[\s\S]*DateToUpdate\.Month = RTC_MONTH_DECEMBER;[\s\S]*HAL_RTC_SetDate\(&hrtc, &DateToUpdate, RTC_FORMAT_BCD\)/);
 const {s,output}=run(p);advance(s,3050,10);assert.ok(!s.result?.fault);
 assert.deepEqual(output.filter(l=>/^20\d\d-/.test(l)).slice(0,4),['2026-12-31 23:59:58 wd4 alarms=0 seconds=0','2026-12-31 23:59:59 wd4 alarms=0 seconds=1','2027-01-01 00:00:00 wd5 alarms=0 seconds=2','2027-01-01 00:00:01 wd5 alarms=0 seconds=3']);
});

test('errors the real HAL would not report: an F1 binary-format October-December month, an F1 wakeup timer, a missing init',()=>{
 const f1=body=>{const p=blankProject('STM32F103RB');p.boardId='nucleo-f103rb';p.mcu.peripherals.RTC=rtc({});p.code=generateHal(p.mcu,{minimal:true}).replace('  /* USER CODE BEGIN 2 */','  /* USER CODE BEGIN 2 */\n'+body);return p;};
 const fails=(p,pattern)=>assert.throws(()=>{const {s}=run(p);advance(s,50,10);},pattern);
 fails(f1('  RTC_DateTypeDef d = {0};\n  d.WeekDay = RTC_WEEKDAY_MONDAY; d.Month = RTC_MONTH_OCTOBER; d.Date = 1; d.Year = 26;\n  HAL_RTC_SetDate(&hrtc, &d, RTC_FORMAT_BIN);'),/STM32F1 HAL은 RTC_FORMAT_BIN에서 RTC_MONTH_OCTOBER~DECEMBER/);
 fails(f1('  HAL_RTCEx_SetWakeUpTimer_IT(&hrtc, 0, 4);'),/STM32F103에는 WakeUp 타이머가 없습니다/);
 fails(halProject({peripherals:{RTC:rtc({})},code:'#include "main.h"\nRTC_HandleTypeDef hrtc;\nint main(void) { RTC_TimeTypeDef t = {0}; hrtc.Instance = RTC; HAL_RTC_GetTime(&hrtc, &t, RTC_FORMAT_BIN); while (1) {} }\n'}),/RTC: HAL_RTC_Init이 필요합니다/);
});
