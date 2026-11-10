import {lsiHz,pclk1Hz} from './wdg-config.js';
// Watchdogs on the built-in interpreter (both boards). HAL_IWDG_Init starts the independent watchdog: unless
// HAL_IWDG_Refresh comes within (Reload + 1) × Prescaler / LSI the program restarts from the top, as after a reset.
// HAL_WWDG_Init starts the window watchdog counting down from Counter at PCLK1 / 4096 / Prescaler: HAL_WWDG_Refresh while
// the counter is still above Window resets at once, the counter passing 0x40 → 0x3F resets, and with EWIMode the early
// wakeup interrupt (WWDG_IRQn → HAL_WWDG_EarlyWakeupCallback) comes at 0x40. RCC_CSR reset flags (__HAL_RCC_GET_FLAG) tell
// the restarted program why it restarted; HalWdg keeps them across the restart (hal.js inheritReset).
export const WDG_CONSTANTS={IWDG:'IWDG',WWDG:'WWDG',...Object.fromEntries([4,8,16,32,64,128,256].map((d,i)=>['IWDG_PRESCALER_'+d,i])),
 WWDG_PRESCALER_1:0,WWDG_PRESCALER_2:0x80,WWDG_PRESCALER_4:0x100,WWDG_PRESCALER_8:0x180,WWDG_EWI_DISABLE:0,WWDG_EWI_ENABLE:0x200,
 IWDG_KEY_RELOAD:0xAAAA,IWDG_KEY_ENABLE:0xCCCC,HAL_IWDG_DEFAULT_TIMEOUT:48,
 RCC_FLAG_BORRST:0x79,RCC_FLAG_PINRST:0x7A,RCC_FLAG_PORRST:0x7B,RCC_FLAG_SFTRST:0x7C,RCC_FLAG_IWDGRST:0x7D,RCC_FLAG_WWDGRST:0x7E,RCC_FLAG_LPWRRST:0x7F};
export const WDG_F4_ONLY=/^RCC_FLAG_BORRST$/;
// RCC_CSR bits: 25 BOR (F4), 26 PIN, 27 POR, 28 SFT, 29 IWDG, 30 WWDG.
export const RESET_BITS={SFT:28,IWDG:29,WWDG:30};
export const powerOnFlags=f1=>new Set(f1?[26,27]:[25,26,27]);
export class HalWdg{
 constructor(hal){this.hal=hal;this.iwdg=null;this.wwdg=null;}
 handle(ptr,r,type,id){
  const h=r.get(r.pointerCell(ptr));if(h?.type!==type)throw new Error(`${type} 포인터가 필요합니다.`);
  if(this.hal.field(h,'Instance')!==id||!this.hal.config.peripherals[id]?.enabled)throw new Error(`${id}: Pinout & Configuration › System Core에서 ${id}를 활성화하세요.`);return h;
 }
 // Watchdog reset from a timed event: the runtime restarts the program (session.js makes a new HAL that inherits the flags).
 expire(r,id,why){this.hal.resetCause=RESET_BITS[id];r.warn(`[${id}] ${why} — 워치독 리셋: 프로그램을 처음부터 다시 실행합니다.`);r.restart();}
 // ---- IWDG
 iwdgReload(r){
  const w=this.iwdg,gen=++w.gen;w.at=r.microTime;
  r.event((r.microTime+w.us)/1000,()=>{if(gen!==w.gen||this.iwdg!==w)return;this.expire(r,'IWDG',`${(w.us/1000).toFixed(1)} ms 안에 HAL_IWDG_Refresh가 없었습니다`);});
 }
 iwdgInit(a,r){
  const hal=this.hal,h=this.handle(a,r,'IWDG_HandleTypeDef','IWDG'),init=hal.field(h,'Init'),pr=hal.field(init,'Prescaler'),reload=hal.field(init,'Reload');
  if(!Number.isInteger(pr)||pr<0||pr>6)throw new Error('IWDG Prescaler는 IWDG_PRESCALER_4~256입니다.');
  if(!Number.isInteger(reload)||reload<0||reload>4095)throw new Error('IWDG Reload는 0~4095입니다.');
  const us=(reload+1)*(4<<pr)/lsiHz(hal.config.family)*1e6;
  this.iwdg={us,gen:this.iwdg?.gen??0,at:0};this.iwdgReload(r);return 0;
 }
 // ---- WWDG
 counter(r){const w=this.wwdg;return w.value-Math.floor((r.microTime-w.at)/w.tickUs+1e-9);}
 wwdgLoad(r,value){
  const w=this.wwdg,hal=this.hal,gen=++w.gen;w.value=value;w.at=r.microTime;
  if(w.ewi&&value>=0x40)r.event((w.at+(value-0x40)*w.tickUs)/1000,()=>{if(gen!==w.gen||this.wwdg!==w)return;hal.queue('WWDG_IRQn',function*(){yield* hal.userCall(r,'HAL_WWDG_EarlyWakeupCallback',[w.handle]);},'wwdg:ewi');});
  r.event((w.at+(value-0x3f)*w.tickUs)/1000,()=>{if(gen!==w.gen||this.wwdg!==w)return;this.expire(r,'WWDG',`카운터가 0x40 아래로 내려갔습니다(마지막 Refresh 뒤 ${((value-0x3f)*w.tickUs/1000).toFixed(2)} ms)`);});
 }
 wwdgInit(a,r){
  const hal=this.hal,h=this.handle(a,r,'WWDG_HandleTypeDef','WWDG'),init=hal.field(h,'Init'),get=k=>hal.field(init,k),pr=get('Prescaler'),win=get('Window'),cnt=get('Counter'),ewi=get('EWIMode');
  if(![0,0x80,0x100,0x180].includes(pr))throw new Error('WWDG Prescaler는 WWDG_PRESCALER_1/2/4/8입니다.');
  if(!Number.isInteger(win)||win<0x40||win>0x7f)throw new Error('WWDG Window는 0x40~0x7F(64~127)입니다.');
  if(!Number.isInteger(cnt)||cnt<0x40||cnt>0x7f)throw new Error('WWDG Counter는 0x40~0x7F(64~127)입니다.');
  if(![0,0x200].includes(ewi))throw new Error('WWDG EWIMode는 WWDG_EWI_DISABLE 또는 WWDG_EWI_ENABLE입니다.');
  hal.callback(r,'HAL_WWDG_MspInit',[a]);if(ewi)hal.noticeIrq.add('WWDG_IRQn');
  this.wwdg={handle:a,window:win,tickUs:4096*(1<<(pr>>7))/pclk1Hz(hal.config)*1e6,ewi:!!ewi,gen:this.wwdg?.gen??0,value:cnt,at:0};this.wwdgLoad(r,cnt);return 0;
 }
 invoke(name,args,r){
  // A refresh above the window resets right away: the program must not run past it.
  if(name==='HAL_WWDG_Refresh'){
   const h=this.handle(args[0],r,'WWDG_HandleTypeDef','WWDG'),w=this.wwdg;if(!w)throw new Error('WWDG: HAL_WWDG_Init이 필요합니다.');
   const now=this.counter(r);if(now<=w.window)return null;
   const self=this;return (function*(){self.hal.resetCause=RESET_BITS.WWDG;r.warn(`[WWDG] 카운터 0x${now.toString(16).toUpperCase()}가 Window 0x${w.window.toString(16).toUpperCase()}보다 클 때 HAL_WWDG_Refresh를 불렀습니다 — 워치독 리셋: 프로그램을 처음부터 다시 실행합니다.`);yield {kind:'reset'};})();
  }
  if(name==='HAL_WWDG_IRQHandler'){this.handle(args[0],r,'WWDG_HandleTypeDef','WWDG');return this.hal.drain(r,'WWDG_IRQn');}
  return null;
 }
 call(name,args,r){
  const hal=this.hal,[a]=args;
  if(name==='__HAL_RCC_GET_FLAG'){if(!Number.isInteger(a)||a<0x79||a>0x7f)throw new Error('__HAL_RCC_GET_FLAG: 리셋 원인은 RCC_FLAG_PINRST/PORRST/SFTRST/IWDGRST/WWDGRST/LPWRRST입니다.');return Number(hal.resetFlags.has(a&0x1f));}
  if(name==='__HAL_RCC_CLEAR_RESET_FLAGS'){hal.resetFlags.clear();return 0;}
  if(name==='__HAL_RCC_WWDG_CLK_ENABLE')return 0;
  if(name==='__HAL_RCC_IWDG_CLK_ENABLE')throw new Error('__HAL_RCC_IWDG_CLK_ENABLE: IWDG는 LSI로 돌아 클록 켜기가 없습니다(HAL_IWDG_Init이 LSI를 켭니다).');
  if(name==='HAL_IWDG_Init')return this.iwdgInit(a,r);
  if(name==='HAL_IWDG_Refresh'){this.handle(a,r,'IWDG_HandleTypeDef','IWDG');if(!this.iwdg)throw new Error('IWDG: HAL_IWDG_Init이 필요합니다.');this.iwdgReload(r);return 0;}
  if(name==='HAL_WWDG_Init')return this.wwdgInit(a,r);
  // Inside the window (HalWdg.invoke resets above it): the counter starts again from hwwdg.Init.Counter.
  if(name==='HAL_WWDG_Refresh'){const h=this.handle(a,r,'WWDG_HandleTypeDef','WWDG');if(!this.wwdg)throw new Error('WWDG: HAL_WWDG_Init이 필요합니다.');const c=hal.field(hal.field(h,'Init'),'Counter');if(!Number.isInteger(c)||c<0x40||c>0x7f)throw new Error('WWDG Counter는 0x40~0x7F(64~127)입니다.');this.wwdgLoad(r,c);return 0;}
  if(name==='HAL_WWDG_MspInit')return 0;
  if(/^HAL_[IW]WDG_/.test(name))throw new Error(`${name}: 내장 해석기에서 지원하지 않는 워치독 함수입니다. ARM GCC 시뮬레이터로 실행하세요.`);
  return undefined;
 }
}
