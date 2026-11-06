import {$,esc} from './common.js';
import {RA6E1_PORTS,RA_IRQ_PINS,RA_RESERVED,FPB_RA6E1,RA_PERIPHERAL_PINS,RA_ADC_CHANNELS,RA_GPT_32BIT,RA_TIMER_UNITS,raGptCounts,raClockHz,validateRaMcu,raDefaultMcu} from './ra-config.js';
import {sciBaudSetting,raPclka} from './ra-generator.js';
// Pin settings of a Renesas RA project (FPB-RA6E1), as the RA Smart Configurator's Pins tab sets them: per port pin the
// mode (output / input / IRQ / analog), the symbolic name RASC writes into bsp_pin_cfg.h, output level and drive, the
// pull-up, and for IRQ pins the trigger, priority and callback that the generated g_external_irqN instance uses.
// Peripheral pins carry an SCI UART signal (TXDn / RXDn); choosing one turns on that channel's g_uartN (r_sci_uart) stack with
// its baud rate, interrupt priority and callback, and a channel with no pin left is turned off again. A GPT GTIOCnA/B
// signal does the same for g_timerN (r_gpt): mode (PWM / periodic), period and unit, duty, cycle-end callback.
const MODES=[['','사용 안 함'],['GPIO_Output','Output (출력)'],['GPIO_Input','Input (입력)'],['IRQ','IRQ (외부 인터럽트)'],['Analog','Analog (아날로그)'],['Peripheral','Peripheral (SCI UART · GPT)']];
const signalsOf=pin=>Object.keys(RA_PERIPHERAL_PINS).filter(s=>RA_PERIPHERAL_PINS[s].includes(pin));
const SIGNAL_NOTE={TXD:'SCI 송신',RXD:'SCI 수신',GTIOCA:'GPT 출력 A',GTIOCB:'GPT 출력 B'};
const signalLabel=sg=>{const [id,role]=sg.split('_');return role.startsWith('GTIOC')?`${role.slice(0,5)}${id.slice(3)}${role.slice(5)} (${SIGNAL_NOTE[role]})`:`${sg} (${SIGNAL_NOTE[role]})`;};
const PRIORITIES=(cur,none)=>(none?`<option value="" ${cur===''?'selected':''}>Disabled</option>`:'')+Array.from({length:16},(_,i)=>`<option value="${i}" ${String(i)===String(cur)?'selected':''}>Priority ${i}${i===0?' (highest)':i===15?' (lowest)':''}</option>`).join('');
const DEFAULTS={SCI:ch=>({baud:115200,callback:`user_uart${ch}_callback`,priority:12}),GPT:()=>({mode:'PWM',period:1,unit:'kHz',duty:50,callback:'',priority:12})};
const ARDUINO_OF=Object.fromEntries(Object.entries(FPB_RA6E1.arduino).map(([k,v])=>[v,k]));
const NOTES={P408:'LED1 (녹색, 보드 내장)',P407:'LED2 (녹색, 보드 내장)',P205:'S1 사용자 스위치 (보드 내장, 누르면 LOW)',P400:'Arduino SCL · 2.2 kΩ 풀업 (보드)',P401:'Arduino SDA · 2.2 kΩ 풀업 (보드)'};

export class RaPinoutPanel {
 constructor({getProject,apply,isRunning,onError}){
  Object.assign(this,{getProject,apply,isRunning,onError});this.pin='P408';
  document.body.insertAdjacentHTML('beforeend',`<dialog id="ra-pinout-dialog" class="ra-pinout" aria-labelledby="ra-pinout-title"><div class="ra-pinout-head"><h2 id="ra-pinout-title">FPB-RA6E1 · Pins</h2><span class="form-hint">R7FA6E10F2CFP · LQFP100 · RA Smart Configurator의 Pins 탭과 같은 설정입니다. 적용하면 다음 빌드의 ra_gen(pin_data.c, hal_data.c, vector_data.c)과 bsp_pin_cfg.h에 반영됩니다.</span></div>
<div class="ra-pinout-body"><div id="ra-pin-grid" class="ra-pin-grid" role="listbox" aria-label="핀 목록"></div><section id="ra-pin-props" class="ra-pin-props" aria-live="polite"></section></div>
<p id="ra-pinout-error" class="form-error" role="alert"></p><div class="dialog-actions"><button type="button" id="ra-pinout-reset">보드 기본값</button><button type="button" id="ra-pinout-close">닫기</button><button type="button" id="ra-pinout-apply" class="run-button">적용</button></div></dialog>`);
  $('ra-pinout-close').onclick=()=>$('ra-pinout-dialog').close();
  $('ra-pinout-apply').onclick=()=>this.commit();
  $('ra-pinout-reset').onclick=()=>{this.draft=raDefaultMcu(this.draft.family);this.render();};
  $('ra-pin-grid').onclick=e=>{const b=e.target.closest('[data-ra-pin]');if(b){this.pin=b.dataset.raPin;this.render();}};
  $('ra-pin-props').addEventListener('change',e=>this.change(e.target));
 }
 open(pin){
  if(this.isRunning())return;const project=this.getProject();
  this.draft=structuredClone(project.mcu);if(pin&&RA6E1_PORTS.includes(pin))this.pin=pin;
  $('ra-pinout-error').textContent='';this.render();$('ra-pinout-dialog').showModal();
 }
 render(){
  const pins=this.draft.pins;
  $('ra-pin-grid').innerHTML=RA6E1_PORTS.map(pin=>{const p=pins[pin],locked=RA_RESERVED[pin];return `<button type="button" role="option" data-ra-pin="${pin}" class="ra-pin ${p?'mode-'+p.function:''} ${locked?'locked':''} ${pin===this.pin?'active':''}" aria-selected="${pin===this.pin}" title="${esc([pin,ARDUINO_OF[pin]&&'Arduino '+ARDUINO_OF[pin],NOTES[pin],locked,p?.label].filter(Boolean).join(' · '))}"><b>${pin}</b><small>${esc(p?.label||ARDUINO_OF[pin]||(locked?'잠김':''))}</small></button>`;}).join('');
  const pin=this.pin,p=pins[pin],locked=RA_RESERVED[pin],irq=RA_IRQ_PINS[pin];
  const option=(value,label,cur)=>`<option value="${value}" ${value===cur?'selected':''}>${label}</option>`;
  const signals=signalsOf(pin),modes=MODES.filter(([m])=>(m!=='IRQ'||irq!=null)&&(m!=='Peripheral'||signals.length)).map(([m,l])=>option(m,m==='IRQ'?`IRQ${irq} (외부 인터럽트)`:l,p?.function||'')).join('');
  let html=`<h3>${pin}${ARDUINO_OF[pin]?` · Arduino ${ARDUINO_OF[pin]}`:''}</h3>${NOTES[pin]?`<p class="form-hint">${NOTES[pin]}</p>`:''}`;
  if(locked&&!['P212','P213','P200'].includes(pin))html+=`<p class="form-hint">${esc(locked)} — 보드가 쓰는 핀이라 바꿀 수 없습니다.</p>`;
  else{
   html+=`<label>Mode<select data-ra="function">${modes}</select></label>`;
   if(p){
    html+=`<label>Symbolic Name<input data-ra="label" value="${esc(p.label||'')}" placeholder="예: LED1" spellcheck="false"></label>`;
    if(p.function==='GPIO_Output')html+=`<label>Output Data (초기값)<select data-ra="initial">${option('0','Low',String(p.initial??0))}${option('1','High',String(p.initial??0))}</select></label><label>Drive Capacity<select data-ra="drive">${['LOW','MID','HIGH'].map(d=>option(d,{LOW:'Low',MID:'Middle',HIGH:'High'}[d],p.drive||'LOW')).join('')}</select></label><label>Output type<select data-ra="outputType">${option('CMOS','CMOS',p.outputType||'CMOS')}${option('NMOS','n-ch open drain',p.outputType||'CMOS')}</select></label>`;
    if(['GPIO_Input','IRQ'].includes(p.function))html+=`<label>Pull-up<select data-ra="pull">${option('NONE','None',p.pull||'NONE')}${option('PULLUP','Input pull-up',p.pull||'NONE')}</select></label>`;
    if(p.function==='Analog'&&RA_ADC_CHANNELS[pin]!=null){
     const u={mode:'SINGLE',resolution:12,callback:'',priority:12,...this.draft.peripherals?.ADC0},an=String(RA_ADC_CHANNELS[pin]).padStart(3,'0'),scan=Object.entries(pins).filter(([q,x])=>x.function==='Analog'&&RA_ADC_CHANNELS[q]!=null).map(([q])=>'AN'+String(RA_ADC_CHANNELS[q]).padStart(3,'0'));
     html+=`<fieldset><legend>g_adc0 (r_adc · ADC0) · AN${an}</legend><label>Mode<select data-ra-adc="mode">${option('SINGLE','Single Scan',u.mode)}${option('CONTINUOUS','Continuous Scan',u.mode)}</select></label><label>Resolution<select data-ra-adc="resolution">${[12,10,8].map(b=>option(String(b),`${b}-Bit`,String(u.resolution))).join('')}</select></label><label>Callback<input data-ra-adc="callback" value="${esc(u.callback)}" placeholder="NULL" spellcheck="false"></label>${u.callback?`<label>Scan End Interrupt Priority<select data-ra-adc="priority">${PRIORITIES(u.priority)}</select></label>`:''}<p class="form-hint">스캔 채널: ${scan.join(', ')} (Analog로 정한 핀). hal_entry()에서 R_ADC_Open(&amp;g_adc0_ctrl, &amp;g_adc0_cfg), R_ADC_ScanCfg(&amp;g_adc0_ctrl, &amp;g_adc0_channel_cfg) 후 R_ADC_ScanStart · R_ADC_StatusGet · R_ADC_Read(&amp;g_adc0_ctrl, ADC_CHANNEL_${RA_ADC_CHANNELS[pin]}, &amp;value)로 읽습니다. VREFH0 3.3 V 기준입니다.</p></fieldset>`;
    }
    else if(p.function==='Analog')html+=`<p class="form-hint">이 핀에는 ADC12 입력(AN 채널)이 없습니다.</p>`;
    if(p.function==='IRQ')html+=`<fieldset><legend>g_external_irq${irq} (r_icu)</legend><label>Trigger<select data-ra="edge">${[['FALLING','Falling'],['RISING','Rising'],['BOTH','Both Edges'],['LOW','Low Level']].map(([v,l])=>option(v,l,p.edge||'FALLING')).join('')}</select></label><label>Priority<select data-ra="priority">${Array.from({length:16},(_,i)=>option(String(i),`Priority ${i}${i===0?' (highest)':i===15?' (lowest)':''}`,String(p.priority??12))).join('')}</select></label><label>Callback<input data-ra="callback" value="${esc(p.callback||`external_irq${irq}_callback`)}" spellcheck="false"></label><p class="form-hint">hal_entry()에서 R_ICU_ExternalIrqOpen(&amp;g_external_irq${irq}_ctrl, &amp;g_external_irq${irq}_cfg)과 R_ICU_ExternalIrqEnable(&amp;g_external_irq${irq}_ctrl)을 부르면 콜백이 호출됩니다.</p></fieldset>`;
    if(p.function==='Peripheral'&&p.signal.startsWith('GPT')){
     const id=p.signal.split('_')[0],ch=Number(id.slice(3)),u={...DEFAULTS.GPT(),...this.draft.peripherals?.[id]},pwm=u.mode==='PWM';
     let info='';try{const c=raGptCounts(raClockHz(this.draft),ch,u.period,u.unit,u.duty);info=`PCLKD ${raClockHz(this.draft)/1e6} MHz / ${2**c.div} → ${c.counts} counts${pwm?`, 듀티 ${c.duty} counts`:''} (${Number(c.hz.toPrecision(6))} Hz, ${RA_GPT_32BIT.includes(ch)?32:16}비트)`;}catch(error){info=error.message;}
     html+=`<label>Signal<select data-ra="signal">${signals.map(sg=>option(sg,signalLabel(sg),p.signal)).join('')}</select></label><fieldset><legend>g_timer${ch} (r_gpt · GPT${ch})</legend><label>Mode<select data-ra-gpt="mode">${option('PWM','PWM',u.mode)}${option('PERIODIC','Periodic',u.mode)}</select></label><label>Period<input type="number" data-ra-gpt="period" min="0" step="any" value="${u.period}"></label><label>Period Unit<select data-ra-gpt="unit">${RA_TIMER_UNITS.map(x=>option(x,{Hz:'Hertz',kHz:'Kilohertz',s:'Seconds',ms:'Milliseconds',us:'Microseconds'}[x],u.unit)).join('')}</select></label>${pwm?`<label>Duty Cycle Percent<input type="number" data-ra-gpt="duty" min="0" max="100" step="any" value="${u.duty}"></label>`:''}<p class="form-hint">${esc(info)}</p><label>Callback<input data-ra-gpt="callback" value="${esc(u.callback)}" placeholder="NULL" spellcheck="false"></label>${u.callback?`<label>Overflow/Crest Interrupt Priority<select data-ra-gpt="priority">${PRIORITIES(u.priority)}</select></label>`:''}<p class="form-hint">hal_entry()에서 R_GPT_Open(&amp;g_timer${ch}_ctrl, &amp;g_timer${ch}_cfg)과 R_GPT_Start(&amp;g_timer${ch}_ctrl)를 부릅니다.${pwm?` 듀티는 R_GPT_DutyCycleSet(&amp;g_timer${ch}_ctrl, counts, GPT_IO_PIN_${p.signal.split('_')[1]})로 바꿉니다.`:''}${u.callback?` 주기마다 ${esc(u.callback)}(TIMER_EVENT_CYCLE_END)가 불립니다.`:' 콜백 이름을 쓰면 주기 끝 인터럽트가 켜집니다.'}</p></fieldset>`;
    }
    else if(p.function==='Peripheral'){
     const id=p.signal.split('_')[0],ch=id.slice(3),u=this.draft.peripherals?.[id]||{},baud=u.baud??115200;
     let rate='';try{const b=sciBaudSetting(raPclka(this.draft),baud);rate=`PCLKA ${raPclka(this.draft)/1e6} MHz → 실제 ${Math.round(b.actual)} bps (오차 ${b.error.toFixed(2)} %)`;}catch(error){rate=error.message;}
     html+=`<label>Signal<select data-ra="signal">${signals.map(sg=>option(sg,signalLabel(sg),p.signal)).join('')}</select></label><fieldset><legend>g_uart${ch} (r_sci_uart · SCI${ch})</legend><label>Baud Rate<input type="number" data-ra-sci="baud" min="300" max="2000000" step="1" value="${baud}"></label><p class="form-hint">${esc(rate)} · 8N1</p><label>Priority<select data-ra-sci="priority">${Array.from({length:16},(_,i)=>option(String(i),`Priority ${i}${i===0?' (highest)':i===15?' (lowest)':''}`,String(u.priority??12))).join('')}</select></label><label>Callback<input data-ra-sci="callback" value="${esc(u.callback||`user_uart${ch}_callback`)}" spellcheck="false"></label><p class="form-hint">hal_entry()에서 R_SCI_UART_Open(&amp;g_uart${ch}_ctrl, &amp;g_uart${ch}_cfg) 후 R_SCI_UART_Write · R_SCI_UART_Read를 부르고, 콜백에서 UART_EVENT_RX_CHAR · UART_EVENT_TX_COMPLETE를 받습니다.</p></fieldset>`;
    }
    if(p.label)html+=`<p class="form-hint">bsp_pin_cfg.h: <code>#define ${esc(p.label)} (BSP_IO_PORT_${pin.slice(1,2).padStart(2,'0')}_PIN_${pin.slice(2)})</code></p>`;
   }
  }
  $('ra-pin-props').innerHTML=html;
 }
 change(el){
  const key=el.dataset.ra;if(!key&&!el.dataset.raSci&&!el.dataset.raGpt&&!el.dataset.raAdc)return;const pin=this.pin,pins=this.draft.pins;
  if(key==='function'){if(!el.value)delete pins[pin];else{const old=pins[pin]||{};pins[pin]={function:el.value,...(old.label?{label:old.label}:{})};if(el.value==='IRQ')Object.assign(pins[pin],{edge:'FALLING',pull:'PULLUP',priority:12,callback:`external_irq${RA_IRQ_PINS[pin]}_callback`});if(el.value==='GPIO_Output')Object.assign(pins[pin],{initial:0,drive:'LOW'});if(el.value==='GPIO_Input')pins[pin].pull='NONE';if(el.value==='Peripheral')pins[pin].signal=signalsOf(pin)[0];}}
  else if(el.dataset.raSci){const id=pins[pin]?.signal?.split('_')[0];if(!id)return;const u=this.draft.peripherals[id];const v=el.value.trim();u[el.dataset.raSci]=el.dataset.raSci==='callback'?v:Number(v);}
  else if(el.dataset.raAdc){const u=((this.draft.peripherals||={}).ADC0||={enabled:true}),k=el.dataset.raAdc,v=el.value.trim();u[k]=['mode','callback'].includes(k)?v:Number(v);}
  else if(el.dataset.raGpt){const id=pins[pin]?.signal?.split('_')[0];if(!id)return;const u=this.draft.peripherals[id],k=el.dataset.raGpt,v=el.value.trim();u[k]=['mode','unit','callback'].includes(k)?v:Number(v);}
  else if(key){const p=pins[pin];if(!p)return;let v=el.value.trim();if(['initial','priority'].includes(key))v=Number(v);if(key==='label'&&!v)delete p.label;else if(key==='outputType'&&v==='CMOS')delete p.outputType;else p[key]=v;}
  this.syncChannels();
  $('ra-pinout-error').textContent='';try{validateRaMcu(this.draft);}catch(error){$('ra-pinout-error').textContent=error.message;}
  this.render();
 }
 // A channel is on while one of its pins is set (its settings stay when it goes off); a periodic GPT timer needs no pin and
 // stays as it is.
 syncChannels(){
  const used=new Set(Object.values(this.draft.pins).filter(p=>p.function==='Peripheral').map(p=>p.signal.split('_')[0])),per=this.draft.peripherals||={};
  for(const id of used)per[id]={...DEFAULTS[id.slice(0,3)](id.slice(3)),...per[id],enabled:true};
  // ADC0 is on while a pin with an AN channel is set to Analog.
  if(Object.entries(this.draft.pins).some(([q,x])=>x.function==='Analog'&&RA_ADC_CHANNELS[q]!=null))used.add('ADC0');
  if(used.has('ADC0'))per.ADC0={mode:'SINGLE',resolution:12,callback:'',priority:12,...per.ADC0,enabled:true};
  for(const id of Object.keys(per))if(!used.has(id)&&!(id.startsWith('GPT')&&per[id].mode==='PERIODIC'))per[id].enabled=false;
 }
 commit(){
  try{const mcu=validateRaMcu(this.draft);this.apply({mcu});$('ra-pinout-dialog').close();}
  catch(error){$('ra-pinout-error').textContent=error.message;this.onError?.(error.message);}
 }
}
