// Watchdogs (CubeMX System Core › IWDG / WWDG) on both boards. IWDG counts the LSI (F446 32 kHz, F103 40 kHz) down from
// Reload; HAL_IWDG_Refresh must come before it reaches 0. WWDG counts PCLK1 / 4096 / Prescaler down from Counter: a refresh
// is allowed only once the counter is at or below Window, and the MCU resets when the counter passes 0x40 → 0x3F; the
// early wakeup interrupt (WWDG_IRQn) comes at 0x40.
import {clockFrequencies} from './clock-tree.js';

export const IWDG_PRESCALERS=[4,8,16,32,64,128,256];
export const WWDG_PRESCALERS=[1,2,4,8];
export const lsiHz=family=>family==='STM32F103RB'?40000:32000;
// APB1 clock: from the Clock tab, otherwise from the single APB1 timer clock (APB1 is divided above 45 / 36 MHz).
export function pclk1Hz(config){
  if(config.clock)return clockFrequencies(config.family,config.clock).pclk1;
  const hz=config.timerClockHz,max=config.family==='STM32F103RB'?36e6:45e6;return hz>max?hz/2:hz;
}
const int=(v,min,max,label)=>{if(!Number.isInteger(v)||v<min||v>max)throw new Error(`${label}: ${min}~${max} 범위의 정수를 입력하세요.`);return v;};

export function validateIwdg(p){
  const q={enabled:p.enabled,prescaler:p.prescaler??4,reload:p.reload??4095};
  if(!IWDG_PRESCALERS.includes(q.prescaler))throw new Error(`IWDG Prescaler: ${IWDG_PRESCALERS.join(' / ')} 중에서 고르세요.`);
  int(q.reload,0,4095,'IWDG Down-counter reload value');return q;
}
export function validateWwdg(p){
  const q={enabled:p.enabled,prescaler:p.prescaler??1,window:p.window??64,counter:p.counter??64};
  if(!WWDG_PRESCALERS.includes(q.prescaler))throw new Error(`WWDG Prescaler: ${WWDG_PRESCALERS.join(' / ')} 중에서 고르세요.`);
  int(q.window,64,127,'WWDG Window value');int(q.counter,64,127,'WWDG Free-running downcounter value');
  if(p.ewi!==undefined){if(typeof p.ewi!=='boolean')throw new Error('WWDG Early wakeup interrupt: true 또는 false입니다.');if(p.ewi)q.ewi=true;}
  return q;
}
/** IWDG timeout in ms: (Reload + 1) × Prescaler / LSI. */
export const iwdgTimeoutMs=(p,family)=>(p.reload+1)*p.prescaler/lsiHz(family)*1000;
/** WWDG timing in ms: one count, the earliest allowed refresh after a refresh, and the reset. */
export function wwdgTiming(p,config){
  const tick=4096*p.prescaler/pclk1Hz(config)*1000;
  return {tickMs:tick,openMs:Math.max(0,p.counter-p.window)*tick,resetMs:(p.counter-0x3f)*tick};
}
export function iwdgInitLines(p){
  return ['  hiwdg.Instance = IWDG;',`  hiwdg.Init.Prescaler = IWDG_PRESCALER_${p.prescaler};`,`  hiwdg.Init.Reload = ${p.reload};`,'  if (HAL_IWDG_Init(&hiwdg) != HAL_OK) Error_Handler();'];
}
export function wwdgInitLines(p){
  return [`  hwwdg.Init.Prescaler = WWDG_PRESCALER_${p.prescaler};`,`  hwwdg.Init.Window = ${p.window};`,`  hwwdg.Init.Counter = ${p.counter};`,`  hwwdg.Init.EWIMode = WWDG_EWI_${p.ewi?'ENABLE':'DISABLE'};`,'  if (HAL_WWDG_Init(&hwwdg) != HAL_OK) Error_Handler();'];
}
/** CubeMX .ioc keys: IWDG.Prescaler=IWDG_PRESCALER_32, IWDG.Reload=…; WWDG.Prescaler, WWDG.Window, WWDG.Counter, WWDG.EWIMode. */
export function iwdgFromIoc(values,number){
  const pr=Number(/IWDG_PRESCALER_(\d+)/.exec(values['IWDG.Prescaler']||'')?.[1]??4);
  return {enabled:true,prescaler:IWDG_PRESCALERS.includes(pr)?pr:4,reload:number(values['IWDG.Reload'],4095)};
}
export function wwdgFromIoc(values,number){
  const pr=Number(/WWDG_PRESCALER_(\d+)/.exec(values['WWDG.Prescaler']||'')?.[1]??1),q={enabled:true,prescaler:WWDG_PRESCALERS.includes(pr)?pr:1,window:number(values['WWDG.Window'],64),counter:number(values['WWDG.Counter'],64)};
  if(/ENABLE/.test(values['WWDG.EWIMode']||''))q.ewi=true;return q;
}
