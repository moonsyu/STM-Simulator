// Pinout RTC card (CubeMX Timers › RTC: Activate Clock Source / Calendar, Internal Alarm A, Internal WakeUp, Parameter
// Settings). Values are written to config.peripherals.RTC; validateRtc (rtc-config.js) reports what is out of range.
import {RTC_CLOCKS,RTC_WEEKDAYS,RTC_MONTHS,RTC_WAKEUP_CLOCKS,rtcPrescalers,rtcClockHz,rtcWakeupSeconds,validateRtc} from './rtc-config.js';
import {esc} from './common.js';

const cap=s=>s.charAt(0)+s.slice(1).toLowerCase();
const num=(attr,key,value,min,max,label)=>`<label>${label}<input type="number" ${attr}="${key}" aria-label="RTC ${label}" value="${Number.isFinite(value)?value:''}" min="${min}" max="${max}" step="1"></label>`;
const sel=(attr,key,label,options,value)=>`<label>${label}<select ${attr}="${key}" aria-label="RTC ${label}">${options.map(([v,t])=>`<option value="${v}" ${String(value)===String(v)?'selected':''}>${t}</option>`).join('')}</select></label>`;
const check=(attr,key,label,on)=>`<label class="check-label"><input type="checkbox" ${attr}="${key}" ${on?'checked':''}>${label}</label>`;

export function rtcFields(config,c){
  const f1=config.family==='STM32F103RB',src=c.clockSource??'LSE',twelve=c.hourFormat===12,t=c.time??{},d=c.date??{},a=c.alarm??{},w=c.wakeUp??{};
  const hours=(attr,obj)=>num(attr,'hours',obj.hours??(twelve?12:0),twelve?1:0,twelve?12:23,'Hours')+(twelve?sel(attr,'pm','AM/PM',[[0,'AM'],[1,'PM']],obj.pm?1:0):'');
  const {asynch,synch}=rtcPrescalers(config.family,src),hz=rtcClockHz(config.family,src);
  let html=sel('data-rtc','clockSource','RTC 클록 원본 (RTC Source Mux)',Object.entries(RTC_CLOCKS),src)
    +`<small class="serial-mode-note">${f1?`RTC_AUTO_1_SECOND: 프리스케일러 ${hz-1} (${hz} Hz → 1 Hz 초 카운터) · 날짜는 HAL이 핸들에 보관`:`AsynchPrediv ${asynch} · SynchPrediv ${synch} → ${hz} Hz / ${(asynch+1)*(synch+1)} = 1 Hz 달력`}</small>`;
  if(!f1)html+=sel('data-rtc','hourFormat','Hour Format',[[24,'Hourformat 24'],[12,'Hourformat 12']],twelve?12:24);
  html+=`<fieldset class="tim-channel"><legend>Calendar Time</legend>${hours('data-rtc-time',t)}${num('data-rtc-time','minutes',t.minutes??0,0,59,'Minutes')}${num('data-rtc-time','seconds',t.seconds??0,0,59,'Seconds')}</fieldset>`;
  html+=`<fieldset class="tim-channel"><legend>Calendar Date</legend>${f1?'<small class="serial-mode-note">요일: STM32F1 HAL이 날짜로 계산합니다.</small>':sel('data-rtc-date','weekDay','Week Day',RTC_WEEKDAYS.map((n,i)=>[i+1,cap(n)]),d.weekDay??1)}`
    +sel('data-rtc-date','month','Month',RTC_MONTHS.map((n,i)=>[i+1,cap(n)]),d.month??1)+num('data-rtc-date','date',d.date??1,1,31,'Date')+num('data-rtc-date','year',d.year??0,0,99,'Year (20xx)')+'</fieldset>';
  html+=`<fieldset class="tim-channel"><legend>${check('data-rtc-alarm','enabled',f1?'Alarm (RTC_ALARM_A)':'Internal Alarm A',a.enabled)}</legend>`;
  if(a.enabled){
    html+=hours('data-rtc-alarm',a)+num('data-rtc-alarm','minutes',a.minutes??0,0,59,'Minutes')+num('data-rtc-alarm','seconds',a.seconds??0,0,59,'Seconds');
    if(!f1)html+=num('data-rtc-alarm','date',a.date??1,1,31,'Date')+'<div class="rtc-masks">'+[['maskDateWeekDay','Date / Week Day'],['maskHours','Hours'],['maskMinutes','Minutes'],['maskSeconds','Seconds']].map(([k,l])=>check('data-rtc-alarm',k,`Mask ${l}`,a[k])).join('')+'</div>';
    const masked=[['maskSeconds','초'],['maskMinutes','분'],['maskHours','시'],['maskDateWeekDay','날짜']].filter(([k])=>a[k]).map(([,l])=>l);
    html+=`<small class="serial-mode-note">${f1?'시·분·초가 같을 때 하루에 한 번 · NVIC RTC_Alarm_IRQn(EXTI 17) → HAL_RTC_AlarmAEventCallback':`${masked.length?masked.join('·')+' 무시':'날짜·시·분·초 모두 비교'} · NVIC RTC_Alarm_IRQn(EXTI 17) → HAL_RTC_AlarmAEventCallback`}</small>`;
  }
  html+='</fieldset>';
  if(!f1){
    html+=`<fieldset class="tim-channel"><legend>${check('data-rtc-wakeup','enabled','Internal WakeUp',w.enabled)}</legend>`;
    if(w.enabled){const period=rtcWakeupSeconds({clockSource:src,wakeUp:{clock:w.clock??'CK_SPRE_16BITS',counter:Number.isFinite(w.counter)?w.counter:0}},config.family);
      html+=sel('data-rtc-wakeup','clock','Wake Up Clock',Object.keys(RTC_WAKEUP_CLOCKS).map(k=>[k,k==='CK_SPRE_16BITS'?'1 Hz (ck_spre)':`RTCCLK / ${RTC_WAKEUP_CLOCKS[k]}`]),w.clock??'CK_SPRE_16BITS')
        +num('data-rtc-wakeup','counter',w.counter??0,0,65535,'Wake Up Counter')+`<small class="serial-mode-note">주기 ${period>=1?+period.toPrecision(5)+' s':+(period*1000).toPrecision(4)+' ms'} · NVIC RTC_WKUP_IRQn(EXTI 22) → HAL_RTCEx_WakeUpTimerEventCallback</small>`;}
    html+='</fieldset>';
  }
  // Out-of-range values show here at once (the Pinout applies only a valid configuration).
  try{validateRtc(c,config.family);}catch(e){html+=`<p class="rtc-problem" role="alert">${esc(e.message)}</p>`;}
  return html;
}

/** Binds the RTC card inputs; `before` syncs the open pin panel, `after` redraws the Pinout. */
export function bindRtc(root,config,before,after){
  const rtc=()=>config.peripherals.RTC??={enabled:true};
  const value=el=>el.type==='checkbox'?el.checked:/^-?\d+$/.test(el.value)?Number(el.value):el.value===''?NaN:el.value;
  root.querySelectorAll('[data-rtc]').forEach(el=>el.onchange=()=>{before();const c=rtc(),k=el.dataset.rtc,v=value(el);if(k==='hourFormat'){c.time??={hours:0,minutes:0,seconds:0};if(v===12){c.hourFormat=12;for(const t of [c.time,c.alarm].filter(Boolean)){const h=t.hours??0;if(h>=12)t.pm=true;t.hours=h%12||12;}}else{delete c.hourFormat;for(const t of [c.time,c.alarm].filter(Boolean)){t.hours=(t.hours??12)%12+(t.pm?12:0);delete t.pm;}}}else c[k]=v;after();});
  const group=(attr,key)=>root.querySelectorAll(`[${attr}]`).forEach(el=>el.onchange=()=>{before();const c=rtc(),o=c[key]??={},k=el.getAttribute(attr),v=value(el);if(k==='pm'){if(v)o.pm=true;else delete o.pm;}else if(/^mask/.test(k)&&!v)delete o[k];else o[k]=v;if(key==='alarm'&&k==='enabled'&&!v)delete c.alarm;if(key==='wakeUp'&&k==='enabled'&&!v)delete c.wakeUp;after();});
  group('data-rtc-time','time');group('data-rtc-date','date');group('data-rtc-alarm','alarm');group('data-rtc-wakeup','wakeUp');
}
