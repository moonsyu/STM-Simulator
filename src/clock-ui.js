// Pinout & Configuration › Clock: CubeMX's Clock Configuration as a table — sources, PLL, AHB/APB and ADC dividers,
// the frequencies they give and CubeMX's limits. Off, the project keeps the single APB1 timer clock (HSI only).
import {AHB_DIVIDERS,APB_DIVIDERS,ADC_PRESCALERS,PLLP_VALUES,LIMITS,isF1Clock,clockFrequencies,clockTreeProblems,adcClockProblem,flashLatency,needsOverDrive,treeFromTimerHz} from './clock-tree.js';
import {familyProfile} from './mcu-family.js';

const mhz=hz=>hz==null?'—':`${Number((hz/1e6).toFixed(3))} MHz`;
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c]);
// Ready-made trees: CubeMX's NUCLEO board defaults (HSI PLL) and the fastest clock from the ST-LINK 8 MHz (HSE BYPASS).
export const CLOCK_PRESETS={
 STM32F446RE:[{id:'board',label:'NUCLEO 보드 기본 · HSI PLL 84 MHz',tree:{sysclkSource:'PLLCLK',pllSource:'HSI',pllM:16,pllN:336,pllP:4,pllQ:7,ahb:1,apb1:2,apb2:1,adcPrescaler:4}},
  {id:'max',label:'최대 · HSE 8 MHz PLL 180 MHz',tree:{sysclkSource:'PLLCLK',pllSource:'HSE',pllM:4,pllN:180,pllP:2,pllQ:2,ahb:1,apb1:4,apb2:2,adcPrescaler:4}}],
 STM32F103RB:[{id:'board',label:'NUCLEO 보드 기본 · HSI/2 PLL 64 MHz',tree:{sysclkSource:'PLLCLK',pllSource:'HSI',hsePrediv:1,pllMul:16,ahb:1,apb1:2,apb2:1,adcPrescaler:6}},
  {id:'max',label:'최대 · HSE 8 MHz PLL 72 MHz',tree:{sysclkSource:'PLLCLK',pllSource:'HSE',hsePrediv:1,pllMul:9,ahb:1,apb1:2,apb2:1,adcPrescaler:6}}]
};

const select=(field,value,options,label)=>`<label>${label}<select data-clock-field="${field}">${options.map(([v,text])=>`<option value="${v}"${String(v)===String(value)?' selected':''}>${esc(text)}</option>`).join('')}</select></label>`;
const number=(field,value,[lo,hi],label)=>`<label>${label}<input type="number" data-clock-field="${field}" min="${lo}" max="${hi}" step="1" value="${value}" aria-label="${label}"></label>`;

/** The Clock panel for the draft MCU settings; `changed()` is called after every edit. */
export function renderClockPanel(root,config,changed){
 const family=config.family,f1=isF1Clock(family),t=config.clock,fam=familyProfile(family);
 const head=`<p class="pinout-hint">CubeMX Clock Configuration과 같습니다. HSE는 NUCLEO의 ST-LINK MCO 8 MHz(BYPASS)입니다. 끄면 APB1 타이머 입력 클록 하나(HSI)만 정합니다.</p>
  <label class="clock-toggle"><input type="checkbox" id="clock-tree-on"${t?' checked':''}> 클록 트리 사용</label>`;
 if(!t){root.innerHTML=head+`<p class="pinout-hint">지금: APB1 타이머 클록 ${mhz(config.timerClockHz)} (${esc(fam.clock.label)}).</p>`;bind(root,config,changed);return;}
 const q=clockFrequencies(family,t),L=LIMITS[family],problems=[...clockTreeProblems(family,t),...(config.peripherals.ADC1?.enabled&&adcClockProblem(family,t)?[adcClockProblem(family,t)]:[])];
 const src=[['HSI',`HSI ${mhz(q.hsi)}`],['HSE','HSE 8 MHz (BYPASS)'],['PLLCLK','PLLCLK']];
 const pll=f1?[select('pllSource',t.pllSource,[['HSI','HSI / 2'],['HSE','HSE']],'PLL Source Mux'),select('hsePrediv',t.hsePrediv,[[1,'/1'],[2,'/2']],'HSE Prediv'),select('pllMul',t.pllMul,Array.from({length:15},(_,i)=>[i+2,'× '+(i+2)]),'PLLMul')]
  :[select('pllSource',t.pllSource,[['HSI','HSI'],['HSE','HSE']],'PLL Source Mux'),number('pllM',t.pllM,L.pllM,'PLLM (/M)'),number('pllN',t.pllN,L.pllN,'PLLN (×N)'),select('pllP',t.pllP,PLLP_VALUES.map(v=>[v,'/'+v]),'PLLP (/P)'),number('pllQ',t.pllQ,L.pllQ,'PLLQ (/Q)')];
 const div=(field,list,label)=>select(field,t[field],list.map(v=>[v,'/'+v]),label);
 const row=(name,hz,max)=>`<tr${max&&hz>max?' class="clock-over"':''}><th>${name}</th><td>${mhz(hz)}</td><td>${max?'최대 '+mhz(max):''}</td></tr>`;
 root.innerHTML=head+`<div class="clock-presets">${CLOCK_PRESETS[family].map(p=>`<button type="button" data-clock-preset="${p.id}">${esc(p.label)}</button>`).join('')}</div>
  <fieldset class="clock-group"><legend>원본</legend>${select('sysclkSource',t.sysclkSource,src,'System Clock Mux')}</fieldset>
  <fieldset class="clock-group"><legend>PLL</legend>${pll.join('')}</fieldset>
  <fieldset class="clock-group"><legend>분주</legend>${div('ahb',AHB_DIVIDERS,'AHB Prescaler')}${div('apb1',APB_DIVIDERS,'APB1 Prescaler')}${div('apb2',APB_DIVIDERS,'APB2 Prescaler')}${div('adcPrescaler',ADC_PRESCALERS,'ADC Prescaler (PCLK2)')}</fieldset>
  <table class="clock-table" aria-label="클록 주파수"><tbody>
   ${f1?'':row('VCO 입력',q.vcoIn)+row('VCO 출력',q.vco)}${t.sysclkSource==='PLLCLK'?row('PLLCLK',q.pll,L.pll[1]):''}
   ${row('SYSCLK',q.sysclk,L.sysclk)}${row('HCLK (AHB)',q.hclk,L.hclk)}${row('APB1 (PCLK1)',q.pclk1,L.pclk1)}${row('APB1 타이머',q.tim1)}${row('APB2 (PCLK2)',q.pclk2,L.pclk2)}${row('APB2 타이머',q.tim2)}${row('ADC',q.adc,L.adc)}
   <tr><th>Flash latency</th><td>${flashLatency(family,q.hclk)} WS</td><td>${needsOverDrive(family,q.hclk)?'Over-drive 켬':''}</td></tr>
  </tbody></table>
  <p id="clock-problems" class="clock-problems" role="status">${problems.map(esc).join('<br>')}</p>`;
 bind(root,config,changed);
}
function bind(root,config,changed){
 root.querySelector('#clock-tree-on').onchange=e=>{
  if(e.target.checked)config.clock=treeFromTimerHz(config.family,config.timerClockHz);
  else{const hz=Math.round(clockFrequencies(config.family,config.clock).tim1),fam=familyProfile(config.family);delete config.clock;config.timerClockHz=fam.clock.valid(hz)?hz:fam.clock.defaultHz;}
  changed();
 };
 root.querySelectorAll('[data-clock-preset]').forEach(b=>b.onclick=()=>{config.clock={...CLOCK_PRESETS[config.family].find(p=>p.id===b.dataset.clockPreset).tree};changed();});
 root.querySelectorAll('[data-clock-field]').forEach(el=>el.onchange=()=>{
  const f=el.dataset.clockField,v=['sysclkSource','pllSource'].includes(f)?el.value:Number(el.value);
  if(typeof v==='number'&&!Number.isInteger(v))return;config.clock={...config.clock,[f]:v};changed();
 });
}
