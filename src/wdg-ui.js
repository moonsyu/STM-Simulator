// Pinout IWDG / WWDG cards (CubeMX System Core › IWDG / WWDG: Activated, Parameter Settings). Values are written to
// config.peripherals.IWDG / WWDG; validateIwdg / validateWwdg (wdg-config.js) report what is out of range.
import {IWDG_PRESCALERS,WWDG_PRESCALERS,validateIwdg,validateWwdg,iwdgTimeoutMs,wwdgTiming,lsiHz,pclk1Hz} from './wdg-config.js';
import {esc} from './common.js';

const ms=v=>v>=100?`${+v.toFixed(1)} ms`:v>=1?`${+v.toPrecision(4)} ms`:`${+(v*1000).toPrecision(4)} µs`;
const num=(id,key,value,min,max,label)=>`<label>${label}<input type="number" data-wdg="${id}" data-key="${key}" aria-label="${id} ${label}" value="${Number.isFinite(value)?value:''}" min="${min}" max="${max}" step="1"></label>`;
const sel=(id,key,label,options,value)=>`<label>${label}<select data-wdg="${id}" data-key="${key}" aria-label="${id} ${label}">${options.map(([v,t])=>`<option value="${v}" ${String(value)===String(v)?'selected':''}>${t}</option>`).join('')}</select></label>`;

export function wdgFields(config,id,c){
  let html='';
  if(id==='IWDG'){
    const p={prescaler:c.prescaler??4,reload:c.reload??4095};
    html+=sel(id,'prescaler','IWDG counter clock prescaler',IWDG_PRESCALERS.map(d=>[d,String(d)]),p.prescaler)+num(id,'reload',p.reload,0,4095,'IWDG down-counter reload value');
    try{validateIwdg(c);html+=`<small class="serial-mode-note">LSI ${lsiHz(config.family)/1000} kHz / ${p.prescaler} · (${p.reload} + 1) 카운트 = ${ms(iwdgTimeoutMs(p,config.family))} 안에 HAL_IWDG_Refresh(&hiwdg)가 없으면 리셋 · HAL_IWDG_Init에서 시작해 멈출 수 없습니다</small>`;}
    catch(e){html+=`<p class="rtc-problem" role="alert">${esc(e.message)}</p>`;}
  }else{
    const p={prescaler:c.prescaler??1,window:c.window??64,counter:c.counter??64};
    html+=sel(id,'prescaler','WWDG counter clock prescaler',WWDG_PRESCALERS.map(d=>[d,String(d)]),p.prescaler)+num(id,'window',p.window,64,127,'WWDG window value')+num(id,'counter',p.counter,64,127,'Free-running downcounter value')
      +sel(id,'ewi','Early wakeup interrupt',[['0','Disable'],['1','Enable']],c.ewi?'1':'0');
    try{validateWwdg(c);const t=wwdgTiming(p,config);
      html+=`<small class="serial-mode-note">PCLK1 ${+(pclk1Hz(config)/1e6).toFixed(3)} MHz / 4096 / ${p.prescaler} = 1카운트 ${ms(t.tickMs)} · Refresh는 ${t.openMs?`${ms(t.openMs)} 뒤(카운터 ≤ ${p.window})부터`:'곧바로'} ${ms(t.resetMs)} 전까지 · 창보다 이르면 바로 리셋${c.ewi?` · ${ms(t.resetMs-t.tickMs)}에 NVIC WWDG_IRQn → HAL_WWDG_EarlyWakeupCallback`:''}</small>`;}
    catch(e){html+=`<p class="rtc-problem" role="alert">${esc(e.message)}</p>`;}
  }
  return html;
}

/** Binds the watchdog cards; `before` syncs the open pin panel, `after` redraws the Pinout. */
export function bindWdg(root,config,before,after){
  root.querySelectorAll('[data-wdg]').forEach(el=>el.onchange=()=>{before();const c=config.peripherals[el.dataset.wdg]??={enabled:true},k=el.dataset.key;
    if(k==='ewi'){if(el.value==='1'){c.ewi=true;config.nvic.WWDG_IRQn={priority:0,...config.nvic.WWDG_IRQn,enabled:true};}else delete c.ewi;}
    else c[k]=/^-?\d+$/.test(el.value)?Number(el.value):NaN;
    after();});
}
