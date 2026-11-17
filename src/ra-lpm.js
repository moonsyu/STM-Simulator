// Low power modes of an FPB-RA6E1 project (feature 37) as both engines say them in the run log: the RA6E1 emulator
// (src/emu/ra6e1/lpm.js, the real r_lpm driving SBYCR / DPSBYCR / WUPEN / DPSIER) and the built-in interpreter
// (src/fsp-interp.js R_LPM_*). The names of the sources, the log lines and the rule for which entries are logged are
// here, so the two engines write the same text.
import {RA_LPM_WAKE_BITS,RA_LPM_CANCEL_BITS,RA_LPM_MODE_NAMES,raDsPin} from './ra-config.js';

/** The run log protocol of the entries ("MCU 리셋" entries are RESET). */
export const LPM_PROTOCOL='LPM';
const WAKE_LABEL={IWDT:'IWDT',LVD1:'LVD1',LVD2:'LVD2',RTCALM:'RTC 알람',RTCPRD:'RTC 주기',USBFS:'USBFS',AGT1UD:'AGT1 언더플로',AGT1CA:'AGT1 비교 A',AGT1CB:'AGT1 비교 B',IIC0:'IIC0',AGT3UD:'AGT3 언더플로',AGT3CA:'AGT3 비교 A',AGT3CB:'AGT3 비교 B'};
const CANCEL_LABEL={LVD1:'LVD1',LVD2:'LVD2',RTC_INTERVAL:'RTC 주기',RTC_ALARM:'RTC 알람',NMI:'NMI 핀',USBFS:'USBFS',AGT1:'AGT1 언더플로',AGT3:'AGT3 언더플로'};
/** A Software Standby wake source (a name of RA_LPM_WAKE_BITS) as the log and the settings show it. */
export const lpmWakeLabel=name=>WAKE_LABEL[name]??name;
/** A Deep Software Standby cancel source: an IRQ channel is its IRQn-DS pin ("IRQ1-DS(P205)"). */
export const lpmCancelLabel=name=>{const m=/^IRQ(\d+)$/.exec(name);if(!m)return CANCEL_LABEL[name]??name;const pin=raDsPin(Number(m[1]));return `${name}-DS${pin?`(${pin})`:''}`;};
const namesOf=(bits,lo,hi=0)=>Object.keys(bits).filter(n=>{const b=bits[n];return b<32?(lo>>>b)&1:(hi>>>(b-32))&1;}).sort((a,b)=>bits[a]-bits[b]);
/** The wake sources set in WUPEN (low) and WUPEN1 (high), in bit order. */
export const lpmWakeNames=(lo,hi=0)=>namesOf(RA_LPM_WAKE_BITS,lo,hi);
/** The cancel sources set in DPSIER3..0. */
export const lpmCancelNames=mask=>namesOf(RA_LPM_CANCEL_BITS,mask);
/** The interrupt that woke the CPU, from its vector name (vector_data.h: ICU_IRQ1, RTC_ALARM, AGT1_INT …). */
export function lpmIrqLabel(vector){
 const s=String(vector??'');let m;
 if((m=/^ICU_IRQ(\d+)$/.exec(s)))return 'IRQ'+m[1];
 if((m=/^AGT(\d)_INT$/.exec(s)))return `AGT${m[1]} 언더플로`;
 if((m=/^GPT(\d)_COUNTER_OVERFLOW$/.exec(s)))return `GPT${m[1]} 오버플로`;
 if((m=/^RTC_(ALARM|PERIOD|CARRY)$/.exec(s)))return {ALARM:'RTC 알람',PERIOD:'RTC 주기',CARRY:'RTC 캐리'}[m[1]];
 return s||'인터럽트';
}
/** The Software Standby wake source (WUPEN name) an interrupt belongs to, or null: it cannot end Software Standby. */
export function lpmWakeOfIrq(vector){
 const s=String(vector??'');let m;
 if((m=/^ICU_IRQ(\d+)$/.exec(s)))return 'IRQ'+m[1];
 return {RTC_ALARM:'RTCALM',RTC_PERIOD:'RTCPRD',AGT1_INT:'AGT1UD',AGT3_INT:'AGT3UD'}[s]??null;
}
/** The Deep Software Standby cancel source (DPSIER name) of an interrupt request, or null. */
export const lpmCancelOfIrq=vector=>({RTC_ALARM:'RTC_ALARM',RTC_PERIOD:'RTC_INTERVAL',AGT1_INT:'AGT1',AGT3_INT:'AGT3'}[String(vector??'')]??null);
// Why a configured source cannot end the mode now.
export const LPM_WHY=Object.freeze({
 OFF:'인터럽트가 켜져 있지 않습니다',STOPPED:'이 모드에서 멈춥니다',IDLE:'동작하고 있지 않습니다',UNMODELLED:'시뮬레이터가 다루지 않는 소스입니다',NO_PIN:'IRQn-DS 핀이 없는 채널입니다'});
const duration=us=>{const ms=us/1000;return ms<1000?`${ms.toFixed(1)} ms`:`${(ms/1000).toFixed(2)} s`;};
const STANDBY_LOG_GAP_US=500000;

/** The run log entries of the low power modes. `emit(message)` writes one entry (protocol LPM) at the current time.
 *  Sleep is logged once per program start (a program that sleeps between interrupts would fill the log); Software Standby
 *  when the last logged entry is at least 0.5 s back; Deep Software Standby always. A wake-up is logged with its entry. */
export class LpmLog {
 constructor(emit){this.emit=emit;this.reset();}
 /** A new program start (power-on or reset). */
 reset(){this.sleepLogged=false;this.lastStandby=-Infinity;this.logged=false;this.stuckSaid=new Set();}
 /** Entering `mode` at `us`: `sources` are the labels of the configured wake / cancel sources; `detail` goes after the
  *  mode (Deep Software Standby: the power and I/O options). */
 enter(mode,us,{sources=[],detail=''}={}){
  const name=RA_LPM_MODE_NAMES[mode];
  if(mode==='SLEEP'){this.logged=!this.sleepLogged;this.sleepLogged=true;if(this.logged)this.emit(`${name} 진입 · CPU 정지, 주변장치는 계속 동작 — 인터럽트가 깨웁니다 (이후의 Sleep 진입·깨어남은 적지 않습니다)`);return;}
  if(mode==='STANDBY'){this.logged=us-this.lastStandby>=STANDBY_LOG_GAP_US;if(!this.logged)return;this.lastStandby=us;this.emit(`${name} 진입 · 클록 정지 — 깨우는 소스: ${sources.join(', ')||'없음'}`);return;}
  this.logged=true;this.emit(`${name} 진입 · ${detail?detail+' — ':''}해제 소스: ${sources.join(', ')||'없음(리셋만)'}`);
 }
 /** No configured source can end the mode: said once per distinct reason (the mode is entered all the same, as on the chip). */
 stuck(mode,reasons){
  const text=`${RA_LPM_MODE_NAMES[mode]}: 깨울 수 있는 소스가 없습니다 — ${reasons.join(', ')}. 리셋(S2)으로만 다시 시작합니다.`;
  if(this.stuckSaid.has(text))return;this.stuckSaid.add(text);this.emit(text);
 }
 /** Leaving the mode by `source` after `us` microseconds. Deep Software Standby ends in a reset (`hold`: IOKEEP is set),
  *  unless an exception of the core itself woke the CPU (`core`): then the program goes on. */
 wake(mode,source,us,{hold=false,core=false}={}){
  if(!this.logged)return;const name=RA_LPM_MODE_NAMES[mode];
  if(mode==='DEEP'&&core)this.emit(`${name}에서 깨어남 · ${source} (${duration(us)} 뒤) — 코어 예외라 리셋 없이 이어서 실행합니다`);
  else if(mode==='DEEP')this.emit(`${name} 해제 · ${source} (${duration(us)} 뒤) — MCU 리셋(RSTSR0.DPSRSTF = 1${hold?', I/O는 R_LPM_IoKeepClear까지 유지':''})`);
  else this.emit(`${name}에서 깨어남 · ${source} (${duration(us)} 뒤)`);
 }
}
/** A source that cannot end the mode, with the reason: "IRQ1: 인터럽트가 켜져 있지 않습니다". */
export const lpmReason=(label,why)=>`${label}: ${LPM_WHY[why]??why}`;
/** The detail of a Deep Software Standby entry: DEEPCUT and IOKEEP as the registers have them. */
export const lpmDeepDetail=(deepcut,iokeep)=>`DEEPCUT${deepcut}, I/O ${iokeep?'유지(IOKEEP 1)':'리셋 상태로(IOKEEP 0)'}`;
