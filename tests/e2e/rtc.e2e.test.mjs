// Pinout RTC card: on the NUCLEO-F103RB (new circuits) the calendar time/date and the alarm are set, "설정으로 HAL 코드
// 생성" writes MX_RTC_Init (BCD literals, RTC_AUTO_1_SECOND) and RTC_Alarm_IRQHandler, and the run prints the running
// clock and the alarm callback; on the NUCLEO-F446RE the 12-hour format and the wakeup timer reach the generated code.
import test from 'node:test';
import assert from 'node:assert/strict';
import {launch} from './harness.mjs';

const generate=async win=>{await win.evaluate(()=>document.getElementById('hal-generate').click());if(await win.evaluate(()=>document.getElementById('hal-replace-dialog').open))await win.click('#hal-replace-confirm');};
const fill=async(win,selector,value)=>{await win.fill(selector,String(value));await win.dispatchEvent(selector,'change');};

test('Pinout RTC: F103RB calendar + alarm run in the simulator; F446RE 12-hour format and wakeup in main.c',{timeout:150000},async()=>{
 const s=await launch();
 try{
  const {win}=s,code=()=>win.evaluate(()=>document.getElementById('code').value);
  await win.evaluate(()=>document.getElementById('pinout-open').click());await win.waitForSelector('#pinout-dialog[open]');
  await win.check('[data-peripheral="RTC"]');await win.waitForSelector('[data-rtc="clockSource"]');
  assert.equal(await win.inputValue('[data-rtc="clockSource"]'),'LSE');
  assert.equal(await win.locator('[data-rtc="hourFormat"]').count(),0,'the F1 RTC has no hour format');
  for(const [k,v]of [['hours',23],['minutes',59],['seconds',58]])await fill(win,`[data-rtc-time="${k}"]`,v);
  await win.selectOption('[data-rtc-date="month"]','12');await fill(win,'[data-rtc-date="date"]',31);await fill(win,'[data-rtc-date="year"]',26);
  await win.check('[data-rtc-alarm="enabled"]');await win.waitForSelector('[data-rtc-alarm="seconds"]');
  await fill(win,'[data-rtc-alarm="seconds"]',2);
  const card='#pinout-peripherals section.peripheral-card:has([data-peripheral="RTC"])';
  await win.check(`${card} [data-card-irq="RTC_Alarm_IRQn"]`);
  // An impossible date is reported in the card.
  await fill(win,'[data-rtc-date="date"]',32);await win.waitForSelector(`${card} .rtc-problem`);await fill(win,'[data-rtc-date="date"]',31);
  assert.equal(await win.locator(`${card} .rtc-problem`).count(),0);
  await generate(win);
  await win.waitForFunction(()=>/hrtc\.Init\.AsynchPrediv = RTC_AUTO_1_SECOND;[\s\S]*sTime\.Hours = 0x23;[\s\S]*DateToUpdate\.Month = RTC_MONTH_DECEMBER;[\s\S]*HAL_RTC_SetAlarm_IT\(&hrtc, &sAlarm, RTC_FORMAT_BCD\)[\s\S]*void RTC_Alarm_IRQHandler\(void\)[\s\S]*void HAL_RTC_AlarmAEventCallback/.test(document.getElementById('code').value),null,{timeout:10000})
   .catch(async e=>{throw new Error(e.message+'\n'+(await code()).split('\n').filter(l=>/rtc|RTC|sTime|Date/.test(l)).join('\n'));});
  // Print the clock every second and the alarm from its callback (the project's own USER CODE sections stay on regeneration).
  await win.evaluate(()=>{const c=document.getElementById('code');c.value=c.value.replace('int main(void) {','RTC_TimeTypeDef now;\nRTC_DateTypeDef today;\nint main(void) {')
   .replace(/\/\* USER CODE BEGIN 3 \*\/\n/,m=>m+'        HAL_RTC_GetTime(&hrtc, &now, RTC_FORMAT_BIN);\n        HAL_RTC_GetDate(&hrtc, &today, RTC_FORMAT_BIN);\n        printf("20%02u-%02u-%02u %02u:%02u:%02u\\n", today.Year, today.Month, today.Date, now.Hours, now.Minutes, now.Seconds);\n')
   .replace('/* 알람 A 시각이 됨 (HAL_RTC_GetTime으로 시각 읽기) */','printf("ALARM\\n");');c.dispatchEvent(new Event('input',{bubbles:true}));});
  await win.keyboard.press('Control+F5');
  await win.waitForFunction(()=>{const t=document.getElementById('console-output').textContent;return /2027-01-01 00:00:0[2-9]/.test(t)&&/ALARM/.test(t);},null,{timeout:25000})
   .catch(async e=>{throw new Error(e.message+'\n'+await win.textContent('#console-output'));});
  assert.match(await win.textContent('#console-output'),/2026-12-31 23:59:5[89]/);
  // Stop the run (the board picker does not open while running).
  await win.click('#run');await win.waitForFunction(()=>/실행/.test(document.getElementById('run').textContent)&&!/정지/.test(document.getElementById('run').textContent));
  // NUCLEO-F446RE: 12-hour format (23:00 → 11 PM) and the 1 Hz wakeup timer.
  await win.evaluate(()=>document.getElementById('board-open').click());await win.click('#board-results [data-board-id="nucleo-f446re"]');
  if(await win.locator('#board-change-dialog').isVisible())await win.click('#board-change-confirm');
  await win.waitForFunction(()=>/F446RE/.test(document.getElementById('current-board-name').textContent));
  await win.evaluate(()=>document.getElementById('pinout-open').click());await win.waitForSelector('#pinout-dialog[open]');
  if(!await win.locator('[data-peripheral="RTC"]').isChecked())await win.check('[data-peripheral="RTC"]');
  await win.waitForSelector('[data-rtc="hourFormat"]');
  await fill(win,'[data-rtc-time="hours"]',23);await win.selectOption('[data-rtc="hourFormat"]','12');
  await win.waitForSelector('[data-rtc-time="pm"]');assert.equal(await win.inputValue('[data-rtc-time="hours"]'),'11');assert.equal(await win.inputValue('[data-rtc-time="pm"]'),'1');
  await win.check('[data-rtc-wakeup="enabled"]');await win.waitForSelector('[data-rtc-wakeup="counter"]');
  await win.check('#pinout-peripherals section.peripheral-card:has([data-peripheral="RTC"]) [data-card-irq="RTC_WKUP_IRQn"]');
  await generate(win);
  await win.waitForFunction(()=>/hrtc\.Init\.HourFormat = RTC_HOURFORMAT_12;[\s\S]*sTime\.Hours = 0x11;\n\s*sTime\.Minutes[\s\S]*sTime\.TimeFormat = RTC_HOURFORMAT12_PM;[\s\S]*HAL_RTCEx_SetWakeUpTimer_IT\(&hrtc, 0, RTC_WAKEUPCLOCK_CK_SPRE_16BITS\)[\s\S]*void RTC_WKUP_IRQHandler\(void\)/.test(document.getElementById('code').value),null,{timeout:10000})
   .catch(async e=>{throw new Error(e.message+'\n'+(await code()).split('\n').filter(l=>/rtc|RTC|sTime/.test(l)).join('\n'));});
  assert.deepEqual(s.errors,[]);
 }finally{await s.close();}
});
