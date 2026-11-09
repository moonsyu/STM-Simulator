// RTC (CubeMX Pinout & Configuration › Timers › RTC) for NUCLEO-F446RE (STM32F4 RTC, RM0390 22) and NUCLEO-F103RB
// (STM32F1 RTC counter, RM0008 18): clock source, calendar time and date, alarm A and (F4) the wakeup timer.
// The project keeps `mcu.peripherals.RTC`; this module validates it, writes MX_RTC_Init and reads a CubeMX .ioc.

export const RTC_CLOCKS={LSE:'LSE 32.768 kHz 크리스털 (NUCLEO X2)',LSI:'LSI 내부 RC (F446 32 kHz · F103 40 kHz)'};
export const RTC_LSI_HZ={STM32F446RE:32000,STM32F103RB:40000};
export const RTC_WEEKDAYS=['MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY','SUNDAY'];
export const RTC_MONTHS=['JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE','JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER'];
// RTCEx wakeup clock (F4): RTCCLK/16, /8, /4, /2 or ck_spre (1 Hz) with a 16-bit counter.
export const RTC_WAKEUP_CLOCKS={RTCCLK_DIV16:16,RTCCLK_DIV8:8,RTCCLK_DIV4:4,RTCCLK_DIV2:2,CK_SPRE_16BITS:0};
const f1Of=family=>family==='STM32F103RB';

export const rtcDefaults=()=>({enabled:false,clockSource:'LSE',time:{hours:0,minutes:0,seconds:0},date:{weekDay:1,month:1,date:1,year:0}});
// Asynchronous / synchronous prescalers for a 1 Hz calendar (F4: (A+1)(S+1) = RTC clock).
export const rtcPrescalers=(family,source)=>source==='LSI'&&!f1Of(family)?{asynch:127,synch:249}:{asynch:127,synch:255};
export const rtcClockHz=(family,source)=>source==='LSI'?RTC_LSI_HZ[family]??32000:32768;
const DAYS_IN=[31,29,31,30,31,30,31,31,30,31,30,31];

/** A checked copy of the project's RTC settings, or throws with the reason (Korean, shown in the Pinout). */
export function validateRtc(p,family){
  const f1=f1Of(family),q={enabled:p.enabled},int=(v,min,max,label)=>{if(!Number.isInteger(v)||v<min||v>max)throw new Error(`RTC ${label}: ${min}~${max} 범위의 정수를 입력하세요.`);return v;};
  const d=rtcDefaults();
  q.clockSource=p.clockSource??d.clockSource;if(!Object.hasOwn(RTC_CLOCKS,q.clockSource))throw new Error('RTC 클록 원본은 LSE 또는 LSI입니다.');
  const twelve=p.hourFormat===12;if(p.hourFormat!==undefined&&![12,24].includes(p.hourFormat))throw new Error('RTC Hour Format은 24 또는 12입니다.');
  if(twelve){if(f1)throw new Error('RTC: STM32F103의 RTC는 초 카운터라 12시간 형식이 없습니다.');q.hourFormat=12;}
  const clock=(t,label)=>{const out={hours:int(t?.hours??0,twelve?1:0,twelve?12:23,label+' Hours'),minutes:int(t?.minutes??0,0,59,label+' Minutes'),seconds:int(t?.seconds??0,0,59,label+' Seconds')};
    if(twelve&&t?.hours===undefined)out.hours=12;if(twelve&&t?.pm)out.pm=true;return out;};
  q.time=clock(p.time,'Time');
  const dt=p.date??{};q.date={weekDay:int(dt.weekDay??1,1,7,'Week Day'),month:int(dt.month??1,1,12,'Month'),date:int(dt.date??1,1,31,'Date'),year:int(dt.year??0,0,99,'Year')};
  if(q.date.date>DAYS_IN[q.date.month-1]||q.date.month===2&&q.date.date===29&&q.date.year%4)throw new Error(`RTC Date: 20${String(q.date.year).padStart(2,'0')}년 ${q.date.month}월에는 ${q.date.date}일이 없습니다.`);
  if(p.alarm!==undefined&&p.alarm.enabled){
    const a=p.alarm,out={enabled:true,...clock(a,'Alarm A')};
    if(!f1){for(const k of ['maskDateWeekDay','maskHours','maskMinutes','maskSeconds'])if(a[k]){if(a[k]!==true)throw new Error(`RTC Alarm A ${k}: true 또는 false입니다.`);out[k]=true;}
      out.date=int(a.date??1,1,31,'Alarm A Date');}
    else if(['maskDateWeekDay','maskHours','maskMinutes','maskSeconds','date'].some(k=>a[k]!==undefined&&a[k]!==false&&!(k==='date'&&a[k]===1)))throw new Error('RTC: STM32F103의 알람은 시·분·초가 같을 때 한 번 울립니다(마스크·날짜 없음).');
    q.alarm=out;
  }
  if(p.wakeUp!==undefined&&p.wakeUp.enabled){
    if(f1)throw new Error('RTC: STM32F103에는 WakeUp 타이머가 없습니다(초 인터럽트 HAL_RTCEx_SetSecond_IT를 쓰세요).');
    const clockName=p.wakeUp.clock??'CK_SPRE_16BITS';if(!Object.hasOwn(RTC_WAKEUP_CLOCKS,clockName))throw new Error(`RTC WakeUp Clock: ${Object.keys(RTC_WAKEUP_CLOCKS).join(' / ')} 중에서 고르세요.`);
    q.wakeUp={enabled:true,clock:clockName,counter:int(p.wakeUp.counter??0,0,65535,'WakeUp Counter')};
  }
  return q;
}
/** Wakeup period in seconds: (counter + 1) ticks of RTCCLK/n or of the 1 Hz ck_spre. */
export const rtcWakeupSeconds=(rtc,family)=>{const w=rtc.wakeUp;if(!w)return null;const div=RTC_WAKEUP_CLOCKS[w.clock];return (w.counter+1)*(div?div/rtcClockHz(family,rtc.clockSource):1);};

// CubeMX writes calendar values as BCD literals with RTC_FORMAT_BCD (its default Data Format). The F1 HAL stores a
// binary-format month as given, so the BCD month constants (RTC_MONTH_DECEMBER = 0x12) need the BCD format there.
const bcd=n=>'0x'+((Math.floor(n/10)<<4)|(n%10)).toString(16).toUpperCase().replace(/^0X/,'');
const time24=(t,twelve)=>twelve?{h:t.hours,format:t.pm?'PM':'AM'}:{h:t.hours,format:null};
/** MX_RTC_Init body lines (CubeMX order, with the clock part CubeMX puts in HAL_RTC_MspInit / SystemClock_Config). */
export function rtcInitLines(config){
  const rtc=config.peripherals.RTC,family=config.family,f1=f1Of(family),twelve=rtc.hourFormat===12,src=rtc.clockSource,nvic=config.nvic||{};
  const lines=[`  /* RTC clock: ${src==='LSE'?'LSE 32.768 kHz crystal (X2 on the NUCLEO)':`LSI ${rtcClockHz(family,'LSI')/1000} kHz RC`} */`,
    '  RCC_OscInitTypeDef osc = {0};',`  osc.OscillatorType = RCC_OSCILLATORTYPE_${src};`,`  osc.${src}State = RCC_${src}_ON;`,'  osc.PLL.PLLState = RCC_PLL_NONE;','  if (HAL_RCC_OscConfig(&osc) != HAL_OK) Error_Handler();',
    '  RCC_PeriphCLKInitTypeDef periph = {0};','  periph.PeriphClockSelection = RCC_PERIPHCLK_RTC;',`  periph.RTCClockSelection = RCC_RTCCLKSOURCE_${src};`,'  if (HAL_RCCEx_PeriphCLKConfig(&periph) != HAL_OK) Error_Handler();',
    ...(f1?['  __HAL_RCC_PWR_CLK_ENABLE();','  HAL_PWR_EnableBkUpAccess();','  __HAL_RCC_BKP_CLK_ENABLE();']:[]),'  __HAL_RCC_RTC_ENABLE();',
    '  RTC_TimeTypeDef sTime = {0};',`  RTC_DateTypeDef ${f1?'DateToUpdate':'sDate'} = {0};`,...(rtc.alarm?['  RTC_AlarmTypeDef sAlarm = {0};']:[]),
    '  hrtc.Instance = RTC;'];
  if(f1)lines.push('  hrtc.Init.AsynchPrediv = RTC_AUTO_1_SECOND;','  hrtc.Init.OutPut = RTC_OUTPUTSOURCE_NONE;');
  else{const {asynch,synch}=rtcPrescalers(family,src);lines.push(`  hrtc.Init.HourFormat = RTC_HOURFORMAT_${twelve?12:24};`,`  hrtc.Init.AsynchPrediv = ${asynch};`,`  hrtc.Init.SynchPrediv = ${synch};`,'  hrtc.Init.OutPut = RTC_OUTPUT_DISABLE;','  hrtc.Init.OutPutPolarity = RTC_OUTPUT_POLARITY_HIGH;','  hrtc.Init.OutPutType = RTC_OUTPUT_TYPE_OPENDRAIN;');}
  lines.push('  if (HAL_RTC_Init(&hrtc) != HAL_OK) Error_Handler();');
  const t=time24(rtc.time,twelve);
  lines.push(`  sTime.Hours = ${bcd(t.h)};`,`  sTime.Minutes = ${bcd(rtc.time.minutes)};`,`  sTime.Seconds = ${bcd(rtc.time.seconds)};`,...(f1?[]:[...(twelve?[`  sTime.TimeFormat = RTC_HOURFORMAT12_${t.format};`]:[]),'  sTime.DayLightSaving = RTC_DAYLIGHTSAVING_NONE;','  sTime.StoreOperation = RTC_STOREOPERATION_RESET;']),
    '  if (HAL_RTC_SetTime(&hrtc, &sTime, RTC_FORMAT_BCD) != HAL_OK) Error_Handler();');
  const d=f1?'DateToUpdate':'sDate';
  lines.push(`  ${d}.WeekDay = RTC_WEEKDAY_${RTC_WEEKDAYS[rtc.date.weekDay-1]};`,`  ${d}.Month = RTC_MONTH_${RTC_MONTHS[rtc.date.month-1]};`,`  ${d}.Date = ${bcd(rtc.date.date)};`,`  ${d}.Year = ${bcd(rtc.date.year)};`,
    `  if (HAL_RTC_SetDate(&hrtc, &${d}, RTC_FORMAT_BCD) != HAL_OK) Error_Handler();`);
  if(rtc.alarm){
    const a=rtc.alarm,at=time24(a,twelve),it=nvic.RTC_Alarm_IRQn?.enabled;
    lines.push(`  sAlarm.AlarmTime.Hours = ${bcd(at.h)};`,`  sAlarm.AlarmTime.Minutes = ${bcd(a.minutes)};`,`  sAlarm.AlarmTime.Seconds = ${bcd(a.seconds)};`);
    if(!f1){const masks=[['maskDateWeekDay','DATEWEEKDAY'],['maskHours','HOURS'],['maskMinutes','MINUTES'],['maskSeconds','SECONDS']].filter(([k])=>a[k]).map(([,n])=>'RTC_ALARMMASK_'+n);
      lines.push(...(twelve?[`  sAlarm.AlarmTime.TimeFormat = RTC_HOURFORMAT12_${at.format};`]:[]),'  sAlarm.AlarmTime.SubSeconds = 0;','  sAlarm.AlarmTime.DayLightSaving = RTC_DAYLIGHTSAVING_NONE;','  sAlarm.AlarmTime.StoreOperation = RTC_STOREOPERATION_RESET;',
       `  sAlarm.AlarmMask = ${masks.length?masks.join(' | '):'RTC_ALARMMASK_NONE'};`,'  sAlarm.AlarmSubSecondMask = RTC_ALARMSUBSECONDMASK_ALL;','  sAlarm.AlarmDateWeekDaySel = RTC_ALARMDATEWEEKDAYSEL_DATE;',`  sAlarm.AlarmDateWeekDay = ${bcd(a.date)};`);}
    lines.push('  sAlarm.Alarm = RTC_ALARM_A;',`  if (HAL_RTC_SetAlarm${it?'_IT':''}(&hrtc, &sAlarm, RTC_FORMAT_BCD) != HAL_OK) Error_Handler();`);
  }
  if(rtc.wakeUp)lines.push(`  if (HAL_RTCEx_SetWakeUpTimer${nvic.RTC_WKUP_IRQn?.enabled?'_IT':''}(&hrtc, ${rtc.wakeUp.counter}, RTC_WAKEUPCLOCK_${rtc.wakeUp.clock}) != HAL_OK) Error_Handler();`);
  return lines;
}

/** RTC settings from CubeMX .ioc keys (RTC.Hours, RTC.WeekDay, RTC.Hours_A, RTC.WakeUpCounter, RCC.RTCClockSelection, VP_RTC_*). */
export function rtcFromIoc(values,family,number){
  const q={enabled:true,clockSource:/LSE/.test(values['RCC.RTCClockSelection']||'')||values['RCC.RTCFreq_Value']==='32768'?'LSE':'LSI'};
  const twelve=values['RTC.HourFormat']==='RTC_HOURFORMAT_12'&&!f1Of(family);if(twelve)q.hourFormat=12;
  const t=s=>({hours:number(values['RTC.Hours'+s],twelve?12:0),minutes:number(values['RTC.Minutes'+s],0),seconds:number(values['RTC.Seconds'+s],0),...(twelve&&/PM/.test(values['RTC.TimeFormat'+s]||'')?{pm:true}:{})});
  q.time=t('');
  const named=(key,list,fallback)=>{const m=/_([A-Z]+)$/.exec(values[key]||'');const i=m?list.indexOf(m[1]):-1;return i<0?fallback:i+1;};
  q.date={weekDay:named('RTC.WeekDay',RTC_WEEKDAYS,1),month:named('RTC.Month',RTC_MONTHS,1),date:number(values['RTC.Date'],1),year:number(values['RTC.Year'],0)};
  if(values['VP_RTC_VS_RTC_Alarm_A_Intern.Mode']||values['RTC.Alarm']==='RTC_ALARM_A'){
    q.alarm={enabled:true,...t('_A')};
    // RTC.AlarmMaskDateWeekDay=RTC_ALARMMASK_DATEWEEKDAY, RTC.AlarmMaskHours=…: every RTC.AlarmMask* value names its mask.
    const masks=Object.entries(values).filter(([k])=>/^RTC\.AlarmMask/.test(k)).map(([,v])=>v).join(' ');
    if(!f1Of(family)){for(const [k,n]of [['maskDateWeekDay','DATEWEEKDAY'],['maskHours','HOURS'],['maskMinutes','MINUTES'],['maskSeconds','SECONDS']])if(masks.includes('RTC_ALARMMASK_'+n)||masks.includes('RTC_ALARMMASK_ALL'))q.alarm[k]=true;
      q.alarm.date=number(values['RTC.AlarmDateWeekDay']??values['RTC.Date_A'],1);}
  }
  if(values['VP_RTC_VS_RTC_WakeUp_intern.Mode']&&!f1Of(family)){const c=/RTC_WAKEUPCLOCK_(\w+)/.exec(values['RTC.WakeUpClock']||'')?.[1];q.wakeUp={enabled:true,clock:Object.hasOwn(RTC_WAKEUP_CLOCKS,c)?c:'RTCCLK_DIV16',counter:number(values['RTC.WakeUpCounter'],0)};}
  return q;
}
