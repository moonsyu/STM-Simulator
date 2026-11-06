// Pinout timer card: CubeMX Counter Settings › Counter Mode and the per-channel PWM Generation / Output Compare settings
// (Mode, Pulse, CH Polarity), with what the chosen values do on the pin.
import {esc} from './common.js';
import {TIM_COUNTER_MODES,TIM_OC_MODES} from './mcu-config.js';

export const COUNTER_MODE_LABELS={UP:'Up',DOWN:'Down',CENTERALIGNED1:'Center Aligned mode1',CENTERALIGNED2:'Center Aligned mode2',CENTERALIGNED3:'Center Aligned mode3'};
export const OC_MODE_LABELS={TIMING:'Frozen (used for Timing base)',ACTIVE:'Active Level on match',INACTIVE:'Inactive Level on match',TOGGLE:'Toggle on match',FORCED_ACTIVE:'Forced Active',FORCED_INACTIVE:'Forced Inactive'};
const center=c=>/^CENTER/.test(c.counterMode||'');
const hz=v=>v>=1e6?`${+(v/1e6).toPrecision(4)} MHz`:v>=1e3?`${+(v/1e3).toPrecision(4)} kHz`:`${+v.toPrecision(4)} Hz`;

/** Counter ticks per counting cycle: ARR+1 for up/down, 2·ARR for center-aligned (0 → ARR → 0). */
export const timerCycle=c=>center(c)?2*Math.max(1,c.period??0):(c.period??0)+1;
/** Compare matches per counting cycle: one (CNT = CCR), two in center-aligned mode (up and down), none when CCR > ARR. */
export const compareMatches=(c,pulse)=>pulse>(c.period??0)?0:center(c)&&pulse>0&&pulse<c.period?2:1;

export function counterModeField(id,c){
  if(c.mode==='encoder')return '';
  return `<label>Counter Mode<select data-timer-counter="${id}" aria-label="${id} Counter Mode">${TIM_COUNTER_MODES.map(v=>`<option value="${v}" ${(c.counterMode??'UP')===v?'selected':''}>${COUNTER_MODE_LABELS[v]}</option>`).join('')}</select></label>`;
}

function channelNote(c,cc,clockHz){
  const pulse=cc.pulse??c.pulse??0,polarity=cc.polarity??'HIGH',rate=clockHz/((c.prescaler??0)+1),cycle=timerCycle(c),period=c.period??0;
  if(c.mode==='pwm'){
    const span=center(c)?Math.max(1,period):period+1,d=period?Math.min(100,pulse/span*100):0,on=(cc.ocMode??'PWM1')==='PWM1'?d:100-d;
    return `듀티 ${(polarity==='HIGH'?on:100-on).toFixed(1)} % (출력 High 비율) · ${hz(rate/cycle)}`;
  }
  const mode=cc.ocMode??'TIMING',active=polarity==='HIGH'?'High':'Low',inactive=polarity==='HIGH'?'Low':'High',matches=compareMatches(c,pulse),match=matches?`CCR 일치 ${hz(rate/cycle*matches)}`:'Pulse > ARR: 일치 없음';
  if(mode==='FORCED_ACTIVE')return `바로 ${active} 고정`;
  if(mode==='FORCED_INACTIVE')return `바로 ${inactive} 고정`;
  if(mode==='TIMING')return `핀 출력은 바뀌지 않습니다(인터럽트·시간 측정용) · ${match}`;
  if(mode==='TOGGLE')return matches?`${match} · 핀 토글 → ${hz(rate/cycle*matches/2)} 사각파`:match;
  return `${match} · 첫 일치 뒤 ${mode==='ACTIVE'?active:inactive} 유지`;
}

/** PWM Generation CHn / Output Compare CHn fieldsets for the channels routed to pins. */
export function timerChannelsField(id,c,config,max){
  if(!['pwm','oc'].includes(c.mode))return '';
  const oc=c.mode==='oc',modes=oc?TIM_OC_MODES:['PWM1','PWM2'],label=v=>oc?OC_MODE_LABELS[v]:`PWM mode ${v.slice(3)}`;
  return Object.entries(config.pins).map(([pin,q])=>[pin,new RegExp('^'+id+'_(CH[1-4])$').exec(q.function)?.[1]]).filter(([,ch])=>ch).sort((a,b)=>a[1].localeCompare(b[1])).map(([pin,ch])=>{
    const cc=c.channels?.[ch]||{},attrs=key=>`data-tim-channel="${id}" data-ch="${ch}" data-key="${key}"`;
    return `<fieldset class="tim-channel"><legend>${oc?'Output Compare':'PWM Generation'} ${ch} · ${esc(pin)}</legend>`+
      `<label>Mode<select ${attrs('ocMode')} aria-label="${id} ${ch} Mode">${modes.map(v=>`<option value="${v}" ${(cc.ocMode??modes[0])===v?'selected':''}>${label(v)}</option>`).join('')}</select></label>`+
      `<label>Pulse<input type="number" ${attrs('pulse')} aria-label="${id} ${ch} Pulse" value="${cc.pulse??c.pulse??0}" min="0" max="${max}" step="1"></label>`+
      `<label>CH Polarity<select ${attrs('polarity')} aria-label="${id} ${ch} Polarity">${['HIGH','LOW'].map(v=>`<option value="${v}" ${(cc.polarity??'HIGH')===v?'selected':''}>${v==='HIGH'?'High':'Low'}</option>`).join('')}</select></label>`+
      `<small class="serial-mode-note tim-channel-note">${channelNote(c,cc,config.timerClockHz)}</small></fieldset>`;
  }).join('');
}
