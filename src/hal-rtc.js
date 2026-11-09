import {rtcClockHz} from './rtc-config.js';
// RTC on the built-in interpreter (HAL level): the calendar as seconds since 2000-01-01 00:00:00 that advance with the
// simulated time, HAL_RTC_Set/GetTime and Set/GetDate in BIN or BCD, alarm A (and B on the F4) with the F4 masks,
// the F4 wakeup timer, the F1 second interrupt and the backup registers. Interrupts go through the NVIC lines the
// generated code uses: RTC_Alarm_IRQn (EXTI 17), RTC_WKUP_IRQn (F4, EXTI 22) and RTC_IRQn (F1 second / overflow).
const MONTHS_BCD=[1,2,3,4,5,6,7,8,9,0x10,0x11,0x12];
export const RTC_CONSTANTS={RTC:'RTC',RTC_FORMAT_BIN:0,RTC_FORMAT_BCD:1,RTC_HOURFORMAT_24:0,RTC_HOURFORMAT_12:0x40,RTC_HOURFORMAT12_AM:0,RTC_HOURFORMAT12_PM:0x40,
 RTC_OUTPUT_DISABLE:0,RTC_OUTPUT_POLARITY_HIGH:0,RTC_OUTPUT_POLARITY_LOW:0x100000,RTC_OUTPUT_TYPE_OPENDRAIN:0,RTC_OUTPUT_TYPE_PUSHPULL:0x40000,RTC_DAYLIGHTSAVING_NONE:0,RTC_STOREOPERATION_RESET:0,RTC_STOREOPERATION_SET:0x40000,
 RTC_ALARM_A:0x100,RTC_ALARM_B:0x200,RTC_ALARMMASK_NONE:0,RTC_ALARMMASK_DATEWEEKDAY:0x80000000,RTC_ALARMMASK_HOURS:0x800000,RTC_ALARMMASK_MINUTES:0x8000,RTC_ALARMMASK_SECONDS:0x80,RTC_ALARMMASK_ALL:0x80808080,
 RTC_ALARMSUBSECONDMASK_ALL:0,RTC_ALARMDATEWEEKDAYSEL_DATE:0,RTC_ALARMDATEWEEKDAYSEL_WEEKDAY:0x40000000,
 RTC_WAKEUPCLOCK_RTCCLK_DIV16:0,RTC_WAKEUPCLOCK_RTCCLK_DIV8:1,RTC_WAKEUPCLOCK_RTCCLK_DIV4:2,RTC_WAKEUPCLOCK_RTCCLK_DIV2:3,RTC_WAKEUPCLOCK_CK_SPRE_16BITS:4,RTC_WAKEUPCLOCK_CK_SPRE_17BITS:6,
 HAL_RTC_STATE_RESET:0,HAL_RTC_STATE_READY:1,HAL_RTC_STATE_BUSY:2,HAL_RTC_STATE_TIMEOUT:3,HAL_RTC_STATE_ERROR:4,
 RCC_PERIPHCLK_RTC:0x20,RCC_RTCCLKSOURCE_LSE:0x100,RCC_RTCCLKSOURCE_LSI:0x200,
 ...Object.fromEntries(['MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY','SUNDAY'].map((d,i)=>['RTC_WEEKDAY_'+d,i+1])),
 ...Object.fromEntries(['JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE','JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER'].map((m,i)=>['RTC_MONTH_'+m,MONTHS_BCD[i]])),
 ...Object.fromEntries(Array.from({length:20},(_,i)=>['RTC_BKP_DR'+i,i]))};
// STM32F1 HAL values that differ (stm32f1xx_hal_rtc.h / _ex.h): no hour format, output select, one alarm, DR1-DR10.
// The F1 HAL numbers Sunday 0 (F4: 7) and works the weekday out from the date itself (RTC_WeekDayNum).
export const RTC_F1_CONSTANTS={RTC_WEEKDAY_SUNDAY:0,RTC_AUTO_1_SECOND:0xFFFFFFFF,RTC_OUTPUTSOURCE_NONE:0,RTC_OUTPUTSOURCE_CALIBCLOCK:0x80,RTC_OUTPUTSOURCE_ALARM:0x100,RTC_OUTPUTSOURCE_SECOND:0x300,RTC_ALARM_A:0,RCC_PERIPHCLK_RTC:1,
 ...Object.fromEntries(Array.from({length:10},(_,i)=>['RTC_BKP_DR'+(i+1),i+1]))};
export const RTC_F4_ONLY=/^RTC_(HOURFORMAT|OUTPUT_|DAYLIGHT|STOREOP|ALARMMASK|ALARMSUBSECOND|ALARMDATEWEEKDAYSEL|WAKEUPCLOCK|ALARM_B$|BKP_DR(0|1[1-9])$)/;

const fromBcd=v=>(v>>4)*10+(v&15),toBcd=n=>(Math.floor(n/10)<<4)|(n%10);
const DAY=86400,EPOCH=Date.UTC(2000,0,1);
export class HalRtc{
 constructor(hal){this.hal=hal;this.s=null;this.bkp=new Map();}
 get f1(){return this.hal.f1;}
 handle(ptr,r){
  const h=r.get(r.pointerCell(ptr));if(h?.type!=='RTC_HandleTypeDef')throw new Error('RTC_HandleTypeDef 포인터가 필요합니다.');
  if(this.hal.field(h,'Instance')!=='RTC'||!this.hal.config.peripherals.RTC?.enabled)throw new Error('RTC: Pinout & Configuration에서 RTC를 활성화하세요.');return h;
 }
 state(){if(!this.s)throw new Error('RTC: HAL_RTC_Init이 필요합니다.');return this.s;}
 // Calendar seconds now; `rate` is the 1 Hz tick of the programmed prescalers against the selected clock.
 seconds(r){const s=this.state();return s.base+Math.floor((r.microTime-s.at)*s.rate/1e6);}
 phase(r){const s=this.state();return (r.microTime-s.at)*s.rate/1e6%1;}
 setSeconds(r,secs){const s=this.state(),frac=this.phase(r);s.base=secs;s.at=r.microTime-frac*1e6/s.rate;this.schedule(r);}
 weekday(day){if(this.f1)return new Date(EPOCH+day*864e5).getUTCDay();const s=this.s;return ((s.weekDay-1+(day-s.weekDayAt))%7+7)%7+1;}
 num(v,fmt,label,min,max){const n=fmt===1?fromBcd(v):v;if(!Number.isInteger(n)||n<min||n>max||fmt===1&&((v&15)>9))throw new Error(`RTC ${label}: ${fmt===1?'BCD ':''}${min}~${max} 범위를 확인하세요.`);return n;}
 init(a,r){
  const hal=this.hal,h=this.handle(a,r),init=hal.field(h,'Init'),get=k=>hal.field(init,k),cfg=hal.config.peripherals.RTC,clock=rtcClockHz(hal.config.family,cfg.clockSource);
  hal.callback(r,'HAL_RTC_MspInit',[a]);
  let rate;
  if(this.f1){const pre=get('AsynchPrediv')>>>0;rate=pre===0xFFFFFFFF?1:clock/(pre+1);}
  else{const A=get('AsynchPrediv'),S=get('SynchPrediv');if(!Number.isInteger(A)||A<0||A>127||!Number.isInteger(S)||S<0||S>32767)throw new Error('RTC: AsynchPrediv 0~127, SynchPrediv 0~32767입니다.');rate=clock/((A+1)*(S+1));this.synch=S;
   if(![0,0x40].includes(get('HourFormat')))throw new Error('RTC: HourFormat은 RTC_HOURFORMAT_24 또는 RTC_HOURFORMAT_12입니다.');}
  if(Math.abs(rate-1)>1e-6&&!this.warned){this.warned=true;r.warn?.(`[RTC] 프리스케일러가 ${cfg.clockSource} ${clock} Hz에서 1 Hz를 만들지 않아 달력이 ${rate.toFixed(4)}배 빠르기로 갑니다.`);}
  // A calendar that was already running keeps its time (the RTC is in the backup domain); the first init starts at the
  // reset values, 2000-01-01 (Monday on the F4 RTC_DR, the F1 HAL's DateToUpdate) 00:00:00.
  const old=this.s;this.s={base:old?this.seconds(r):0,at:r.microTime,rate,twelve:!this.f1&&get('HourFormat')===0x40,weekDay:old?.weekDay??1,weekDayAt:old?.weekDayAt??0,alarms:old?.alarms??{},wakeup:old?.wakeup??null,second:old?.second??null,gen:(old?.gen??0)+1,handle:a};
  if(h.fields.State)h.fields.State.value=1;this.schedule(r);return 0;
 }
 setTime(a,b,fmt,r){
  this.handle(a,r);const s=this.state(),t=r.get(r.pointerCell(b)),get=k=>this.hal.field(t,k);
  let hh=this.num(get('Hours'),fmt,'Hours',s.twelve?1:0,s.twelve?12:23);const mm=this.num(get('Minutes'),fmt,'Minutes',0,59),ss=this.num(get('Seconds'),fmt,'Seconds',0,59);
  if(s.twelve)hh=hh%12+(get('TimeFormat')===0x40?12:0);
  const day=Math.floor(this.seconds(r)/DAY);this.setSeconds(r,day*DAY+hh*3600+mm*60+ss);return 0;
 }
 getTime(a,b,fmt,r){
  this.handle(a,r);const s=this.state(),t=r.get(r.pointerCell(b)),secs=this.seconds(r)%DAY,put=(k,v)=>{if(t.fields[k])t.fields[k].value=v;},enc=v=>fmt===1?toBcd(v):v;
  let hh=Math.floor(secs/3600);if(s.twelve){put('TimeFormat',hh>=12?0x40:0);hh=hh%12||12;}
  put('Hours',enc(hh));put('Minutes',enc(Math.floor(secs/60)%60));put('Seconds',enc(secs%60));
  if(!this.f1){put('SubSeconds',this.synch-Math.floor(this.phase(r)*(this.synch+1)));put('SecondFraction',this.synch);}
  return 0;
 }
 setDate(a,b,fmt,r){
  this.handle(a,r);const s=this.state(),d=r.get(r.pointerCell(b)),get=k=>this.hal.field(d,k);
  let month=get('Month');
  if(fmt===0&&month&0x10){if(this.f1)throw new Error('RTC: STM32F1 HAL은 RTC_FORMAT_BIN에서 RTC_MONTH_OCTOBER~DECEMBER(0x10~0x12)를 10~12로 바꾸지 않아 날짜가 멈춥니다. RTC_FORMAT_BCD를 쓰거나 10~12를 쓰세요.');month=(month&~0x10)+10;}
  month=this.num(month,fmt,'Month',1,12);const date=this.num(get('Date'),fmt,'Date',1,31),year=this.num(get('Year'),fmt,'Year',0,99),weekDay=this.num(get('WeekDay'),0,'WeekDay',this.f1?0:1,7);
  const ms=Date.UTC(2000+year,month-1,date);if(new Date(ms).getUTCDate()!==date)throw new Error(`RTC Date: 20${String(year).padStart(2,'0')}년 ${month}월에는 ${date}일이 없습니다.`);
  const day=(ms-EPOCH)/864e5;s.weekDay=weekDay;s.weekDayAt=day;this.setSeconds(r,day*DAY+this.seconds(r)%DAY);return 0;
 }
 getDate(a,b,fmt,r){
  this.handle(a,r);const d=r.get(r.pointerCell(b)),day=Math.floor(this.seconds(r)/DAY),dt=new Date(EPOCH+day*864e5),put=(k,v)=>{if(d.fields[k])d.fields[k].value=v;},enc=v=>fmt===1?toBcd(v):v;
  put('WeekDay',this.weekday(day));put('Month',enc(dt.getUTCMonth()+1));put('Date',enc(dt.getUTCDate()));put('Year',enc(dt.getUTCFullYear()-2000));
  return 0;
 }
 setAlarm(a,b,fmt,it,r){
  this.handle(a,r);const s=this.state(),al=r.get(r.pointerCell(b)),get=k=>this.hal.field(al,k),t=get('AlarmTime'),tt=k=>this.hal.field(t,k);
  const which=this.f1?'A':get('Alarm')===0x200?'B':'A';if(!this.f1&&![0x100,0x200].includes(get('Alarm')))throw new Error('RTC: Alarm은 RTC_ALARM_A 또는 RTC_ALARM_B입니다.');
  let hh=this.num(tt('Hours'),fmt,'Alarm Hours',s.twelve?1:0,s.twelve?12:23);if(s.twelve)hh=hh%12+(tt('TimeFormat')===0x40?12:0);
  const alarm={hh,mm:this.num(tt('Minutes'),fmt,'Alarm Minutes',0,59),ss:this.num(tt('Seconds'),fmt,'Alarm Seconds',0,59),it};
  if(!this.f1){const mask=get('AlarmMask')>>>0,weekday=(get('AlarmDateWeekDaySel')>>>0)===0x40000000;Object.assign(alarm,{mask,weekday,day:weekday?this.num(get('AlarmDateWeekDay'),0,'Alarm WeekDay',1,7):this.num(get('AlarmDateWeekDay'),fmt,'Alarm Date',1,31)});}
  if(it)this.hal.noticeIrq.add('RTC_Alarm_IRQn');
  s.alarms[which]=alarm;this.schedule(r);return 0;
 }
 matches(al,secs){
  const tod=secs%DAY,day=Math.floor(secs/DAY),[hh,mm,ss]=[Math.floor(tod/3600),Math.floor(tod/60)%60,tod%60];
  if(this.f1)return hh===al.hh&&mm===al.mm&&ss===al.ss;
  const m=al.mask;if(!(m&0x80)&&ss!==al.ss)return false;if(!(m&0x8000)&&mm!==al.mm)return false;if(!(m&0x800000)&&hh!==al.hh)return false;
  if(!(m&0x80000000))return al.weekday?this.weekday(day)===al.day:new Date(EPOCH+day*864e5).getUTCDate()===al.day;
  return true;
 }
 // One check per calendar second while an alarm or the F1 second interrupt is on; the wakeup timer has its own period.
 schedule(r){
  const s=this.s;if(!s)return;const gen=++s.gen,hal=this.hal;
  if(Object.keys(s.alarms).length||s.second){
   const tick=()=>{if(gen!==s.gen)return;const secs=this.seconds(r);
    for(const [which,al]of Object.entries(s.alarms))if(al.it&&this.matches(al,secs))hal.queue('RTC_Alarm_IRQn',function*(){yield* hal.userCall(r,which==='A'?'HAL_RTC_AlarmAEventCallback':'HAL_RTCEx_AlarmBEventCallback',[s.handle]);},'rtc:alarm'+which);
    if(s.second)hal.queue('RTC_IRQn',function*(){yield* hal.userCall(r,'HAL_RTCEx_RTCEventCallback',[s.handle]);},'rtc:second');
    r.event(r.microTime/1000+1000/s.rate,tick);};
   r.event(r.microTime/1000+(1-this.phase(r))*1000/s.rate+.001,tick);
  }
  if(s.wakeup){const w=s.wakeup,wgen=w.gen=(w.gen??0)+1,fire=()=>{if(wgen!==w.gen||s.wakeup!==w)return;if(w.it)hal.queue('RTC_WKUP_IRQn',function*(){yield* hal.userCall(r,'HAL_RTCEx_WakeUpTimerEventCallback',[s.handle]);},'rtc:wakeup');r.event(r.microTime/1000+w.ms,fire);};r.event(r.microTime/1000+w.ms,fire);}
 }
 invoke(name,args,r){
  if(name==='HAL_RTC_AlarmIRQHandler'){this.handle(args[0],r);return this.hal.drain(r,'RTC_Alarm_IRQn');}
  if(name==='HAL_RTCEx_WakeUpTimerIRQHandler'){this.handle(args[0],r);return this.hal.drain(r,'RTC_WKUP_IRQn');}
  if(name==='HAL_RTCEx_RTCIRQHandler'){this.handle(args[0],r);return this.hal.drain(r,'RTC_IRQn');}
  return null;
 }
 call(name,args,r){
  if(['__HAL_RCC_RTC_ENABLE','__HAL_RCC_RTC_DISABLE','__HAL_RCC_BKP_CLK_ENABLE','HAL_PWR_EnableBkUpAccess','HAL_PWR_DisableBkUpAccess'].includes(name)){if(name==='__HAL_RCC_BKP_CLK_ENABLE'&&!this.f1)throw new Error('__HAL_RCC_BKP_CLK_ENABLE: STM32F4에는 BKP가 없습니다(백업 레지스터는 RTC 안에 있습니다).');return 0;}
  if(!/^HAL_RTC(Ex)?_/.test(name))return undefined;
  const [a,b,c]=args;
  if(name==='HAL_RTC_Init')return this.init(a,r);
  if(name==='HAL_RTC_WaitForSynchro'){this.handle(a,r);return 0;}
  if(name==='HAL_RTC_SetTime')return this.setTime(a,b,c,r);
  if(name==='HAL_RTC_GetTime')return this.getTime(a,b,c,r);
  if(name==='HAL_RTC_SetDate')return this.setDate(a,b,c,r);
  if(name==='HAL_RTC_GetDate')return this.getDate(a,b,c,r);
  if(name==='HAL_RTC_SetAlarm'||name==='HAL_RTC_SetAlarm_IT')return this.setAlarm(a,b,c,name.endsWith('_IT'),r);
  if(name==='HAL_RTC_DeactivateAlarm'){this.handle(a,r);delete this.state().alarms[this.f1||b!==0x200?'A':'B'];this.schedule(r);return 0;}
  if(name==='HAL_RTCEx_SetWakeUpTimer'||name==='HAL_RTCEx_SetWakeUpTimer_IT'){
   if(this.f1)throw new Error('RTC: STM32F103에는 WakeUp 타이머가 없습니다(초 인터럽트 HAL_RTCEx_SetSecond_IT를 쓰세요).');
   this.handle(a,r);const s=this.state();if(!Number.isInteger(b)||b<0||b>65535||![0,1,2,3,4,6].includes(c))throw new Error('RTC WakeUp: 카운터 0~65535와 RTC_WAKEUPCLOCK_*를 쓰세요.');
   const div=[16,8,4,2][c],hz=rtcClockHz(this.hal.config.family,this.hal.config.peripherals.RTC.clockSource),ms=div?(b+1)*div/hz*1000:(b+1+(c===6?65536:0))*1000/s.rate;
   if(ms<.1)throw new Error('RTC WakeUp: 주기가 0.1 ms보다 짧습니다.');
   const it=name.endsWith('_IT');if(it)this.hal.noticeIrq.add('RTC_WKUP_IRQn');s.wakeup={ms,it};this.schedule(r);return 0;
  }
  if(name==='HAL_RTCEx_DeactivateWakeUpTimer'){this.handle(a,r);this.state().wakeup=null;this.schedule(r);return 0;}
  if(name==='HAL_RTCEx_SetSecond_IT'||name==='HAL_RTCEx_DeactivateSecond'){
   if(!this.f1)throw new Error(`${name}: STM32F1 HAL 함수입니다(F4는 WakeUp 타이머를 쓰세요).`);
   this.handle(a,r);const s=this.state();s.second=name==='HAL_RTCEx_SetSecond_IT';if(s.second)this.hal.noticeIrq.add('RTC_IRQn');this.schedule(r);return 0;
  }
  if(name==='HAL_RTCEx_BKUPWrite'||name==='HAL_RTCEx_BKUPRead'){
   this.handle(a,r);const max=this.f1?10:19,min=this.f1?1:0;if(!Number.isInteger(b)||b<min||b>max)throw new Error(`RTC 백업 레지스터 번호는 RTC_BKP_DR${min}~DR${max}입니다.`);
   if(name==='HAL_RTCEx_BKUPRead')return this.bkp.get(b)??0;this.bkp.set(b,this.f1?c&0xffff:c>>>0);return 0;
  }
  if(name==='HAL_RTC_MspInit'||name==='HAL_RTC_MspDeInit')return 0;
  throw new Error(`${name}: 내장 해석기에서 지원하지 않는 RTC 함수입니다. ARM GCC 시뮬레이터로 실행하세요.`);
 }
}
