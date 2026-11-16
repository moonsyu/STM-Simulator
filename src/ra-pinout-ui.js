import {$,esc} from './common.js';
import {RA6E1_PORTS,RA_IRQ_PINS,RA_RESERVED,FPB_RA6E1,RA_PERIPHERAL_PINS,RA_ADC_CHANNELS,RA_GPT_32BIT,RA_GPT_CHANNELS,RA_AGT_CHANNELS,RA_TIMER_UNITS,RA_CLOCK_LIMITS,RA_IIC_RATES,RA_SPI_CHANNELS,RA_SCI_SPI_CHANNELS,raIicClock,raGptCounts,raAgtCounts,raClockHz,raSpiBitrate,raSciSpiBitrate,raFamily,validateRaMcu,raDefaultMcu,raIrqName,RA_BSP_DEFAULTS,RA_WDT,RA_WDT_WINDOW_START,RA_WDT_WINDOW_END,raWdtTiming,RA_RTC_DEFAULTS} from './ra-config.js';
import {sciBaudSetting,raPclka} from './ra-generator.js';
// Pin settings of a Renesas RA project (FPB-RA6E1), as the RA Smart Configurator's Pins tab sets them: per port pin the
// mode (output / input / IRQ / analog), the symbolic name RASC writes into bsp_pin_cfg.h, output level and drive, the
// pull-up, and for IRQ pins the trigger, priority and callback that the generated g_external_irqN instance uses.
// Peripheral pins carry an SCI UART signal (TXDn / RXDn); choosing one turns on that channel's g_uartN (r_sci_uart) stack with
// its baud rate, interrupt priority and callback, and a channel with no pin left is turned off again. A GPT GTIOCnA/B
// signal does the same for g_timerN (r_gpt): mode (PWM / periodic), period and unit, duty, cycle-end callback.
// SPI: an RSPCKn/MOSIn/MISOn/SSL0 signal turns on g_spiN (r_spi), and SCI9 can be a simple SPI master (g_sci_spi9, r_sci_spi)
// instead of a UART: its SCK9 pin or the Mode select switches it; both are also New Stack → Connectivity entries.
const MODES=[['','Disabled'],['GPIO_Output','Output mode'],['GPIO_Input','Input mode'],['IRQ','IRQ'],['Analog','Analog mode'],['Peripheral','Peripheral mode (SCI · SPI · GPT · IIC)']];
const signalsOf=pin=>Object.keys(RA_PERIPHERAL_PINS).filter(s=>RA_PERIPHERAL_PINS[s].includes(pin));
const SIGNAL_NOTE={TXD:'SCI 송신 · Simple SPI MOSI',RXD:'SCI 수신 · Simple SPI MISO',SCK:'Simple SPI 클록',GTIOCA:'GPT 출력 A',GTIOCB:'GPT 출력 B',SCL:'I²C 클록',SDA:'I²C 데이터',RSPCK:'SPI 클록',MOSI:'SPI 마스터 출력',MISO:'SPI 마스터 입력',SSL0:'SPI 슬레이브 선택'};
const signalLabel=sg=>{const [id,role]=sg.split('_');return role.startsWith('GTIOC')?`${role.slice(0,5)}${id.slice(3)}${role.slice(5)} (${SIGNAL_NOTE[role]})`:`${sg} (${SIGNAL_NOTE[role]})`;};
const PRIORITIES=(cur,none)=>(none?`<option value="" ${cur===''?'selected':''}>Disabled</option>`:'')+Array.from({length:16},(_,i)=>`<option value="${i}" ${String(i)===String(cur)?'selected':''}>Priority ${i}${i===0?' (highest)':i===15?' (lowest)':''}</option>`).join('');
const SPI_DEFAULTS={bitrate:1000000,cpol:0,cpha:0,bitOrder:'MSB',priority:12};
const DEFAULTS={IIC:ch=>({rate:'STANDARD',slave:0x50,callback:`i2c_master${ch}_callback`,priority:12}),SCI:ch=>({baud:115200,callback:`user_uart${ch}_callback`,priority:12}),GPT:()=>({mode:'PWM',period:1,unit:'kHz',duty:50,callback:'',priority:12}),SPI:ch=>({...SPI_DEFAULTS,ssl:'SSL0',callback:`spi${ch}_callback`})};
// The pins New Stack → Connectivity gives an SPI stack: RSPI pin group A (Arduino D10-D13) or B, SCI9 on D0/D1 and P111.
const SPI_PIN_GROUPS={SPI1:[{P100:'SPI1_MISO',P101:'SPI1_MOSI',P102:'SPI1_RSPCK',P103:'SPI1_SSL0'},{P410:'SPI1_MISO',P411:'SPI1_MOSI',P412:'SPI1_RSPCK',P413:'SPI1_SSL0'}],SCI9:[{P109:'SCI9_TXD',P110:'SCI9_RXD',P111:'SCI9_SCK'}]};
// Stacks without pins (added from New Stack, kept until removed there).
const PINLESS=['WDT','IWDT','RTC'];
const STACK_NAMES={WDT:['g_wdt0','Watchdog (r_wdt)'],IWDT:['g_iwdt0','Independent Watchdog (r_iwdt)'],RTC:['g_rtc0','Realtime Clock (r_rtc)']};
const SUBCLOCK_NOTE='FPB-RA6E1에는 32.768 kHz 크리스털 X2가 실장되어 있지만 E25/E26이 열려 있어 그대로는 서브 클록이 돌지 않습니다(XCIN/XCOUT은 J3로만 나옴). 실물 보드에서 Sub-Clock을 쓰려면 E25/E26을 닫으세요.';
const WDT_DEFAULTS=id=>({enabled:true,...(id==='WDT'?{startMode:'REGISTER'}:{}),...RA_WDT[id].defaults,windowStart:100,windowEnd:0,reset:'RESET',stopInSleep:false,callback:''});
const ARDUINO_OF=Object.fromEntries(Object.entries(FPB_RA6E1.arduino).map(([k,v])=>[v,k]));
const NOTES={P408:'LED1 (녹색, 보드 내장 · 직렬 10 kΩ)',P407:'LED2 (녹색, 보드 내장 · 직렬 10 kΩ)',P205:'S1 사용자 스위치 (보드 내장, 누르면 LOW · 10 kΩ 풀업 R17)',P014:'Arduino 헤더의 RESET 핀(J2-3) · 10 kΩ 풀업 R4 — MCU의 RES#가 아니라 GPIO라서 LOW로 당겨도 리셋되지 않습니다',P400:'Arduino SCL · 2.2 kΩ 풀업 (보드)',P401:'Arduino SDA · 2.2 kΩ 풀업 (보드)'};

export class RaPinoutPanel {
 constructor({getProject,apply,isRunning,onError}){
  Object.assign(this,{getProject,apply,isRunning,onError});this.pin='P408';
  document.body.insertAdjacentHTML('beforeend',`<dialog id="ra-pinout-dialog" class="ra-pinout" aria-labelledby="ra-pinout-title"><div class="ra-pinout-head"><h2 id="ra-pinout-title">FPB-RA6E1 · RA Configuration</h2><span class="form-hint">R7FA6E10F2CFP · LQFP100 · RA Smart Configurator의 Summary · BSP · Clocks · Pins · Stacks 탭과 같은 설정입니다. 적용하면 다음 빌드의 ra_gen(pin_data.c, hal_data.c, vector_data.c, bsp_clock_cfg.h)과 ra_cfg에 반영됩니다.</span><div class="ra-tabs" role="tablist"><button type="button" role="tab" data-ra-tab="summary">Summary</button><button type="button" role="tab" data-ra-tab="bsp">BSP</button><button type="button" role="tab" data-ra-tab="clocks">Clocks</button><button type="button" role="tab" data-ra-tab="pins">Pins</button><button type="button" role="tab" data-ra-tab="stacks">Stacks</button></div></div>
<div class="ra-pinout-body" data-ra-view="pins"><div id="ra-pin-grid" class="ra-pin-grid" role="listbox" aria-label="핀 목록"></div><section id="ra-pin-props" class="ra-pin-props" aria-live="polite"></section></div>
<section id="ra-summary" class="ra-config-view" data-ra-view="summary" hidden></section><section id="ra-bsp" class="ra-config-view" data-ra-view="bsp" hidden></section><section id="ra-clocks" class="ra-config-view" data-ra-view="clocks" hidden></section><section id="ra-stacks" class="ra-config-view" data-ra-view="stacks" hidden></section>
<p id="ra-pinout-error" class="form-error" role="alert"></p><div class="dialog-actions"><button type="button" id="ra-pinout-reset">보드 기본값</button><button type="button" id="ra-pinout-close">닫기</button><button type="button" id="ra-pinout-apply" class="run-button">적용</button></div></dialog>`);
  this.tab='pins';
  $('ra-pinout-dialog').querySelector('.ra-tabs').onclick=e=>{const b=e.target.closest('[data-ra-tab]');if(b){this.tab=b.dataset.raTab;this.render();}};
  $('ra-clocks').addEventListener('change',e=>{const k=e.target.dataset.raClock;if(!k)return;this.draft.clock={...(this.draft.clock||{}),[k]:Number(e.target.value)};this.validate();this.render();});
  $('ra-bsp').addEventListener('change',e=>this.bspChange(e.target));
  $('ra-pin-props').addEventListener('click',e=>{if(e.target.closest('[data-ra-to-stacks]')){this.tab='stacks';this.render();}});
  $('ra-stacks').addEventListener('change',e=>this.stackChange(e.target));
  $('ra-stacks').addEventListener('click',e=>this.stackClick(e.target));
  $('ra-pinout-close').onclick=()=>$('ra-pinout-dialog').close();
  $('ra-pinout-apply').onclick=()=>this.commit();
  $('ra-pinout-reset').onclick=()=>{this.draft=raDefaultMcu(this.draft.family);this.render();};
  $('ra-pin-grid').onclick=e=>{const b=e.target.closest('[data-ra-pin]');if(b){this.pin=b.dataset.raPin;this.render();}};
  $('ra-pin-props').addEventListener('change',e=>this.change(e.target));
 }
 open(pin){
  if(this.isRunning())return;const project=this.getProject();
  this.draft=structuredClone(project.mcu);if(pin&&RA6E1_PORTS.includes(pin)){this.pin=pin;this.tab='pins';}
  $('ra-pinout-error').textContent='';this.render();$('ra-pinout-dialog').showModal();
 }
 validate(){$('ra-pinout-error').textContent='';try{validateRaMcu(this.draft);}catch(error){$('ra-pinout-error').textContent=error.message;}}
 render(){
  for(const b of $('ra-pinout-dialog').querySelectorAll('[data-ra-tab]')){b.classList.toggle('active',b.dataset.raTab===this.tab);b.setAttribute('aria-selected',String(b.dataset.raTab===this.tab));}
  for(const v of $('ra-pinout-dialog').querySelectorAll('[data-ra-view]'))v.hidden=v.dataset.raView!==this.tab;
  if(this.tab==='summary')return this.renderSummary();
  if(this.tab==='bsp')return this.renderBsp();
  if(this.tab==='clocks')return this.renderClocks();
  if(this.tab==='stacks')return this.renderStacks();
  const pins=this.draft.pins;
  $('ra-pin-grid').innerHTML=RA6E1_PORTS.map(pin=>{const p=pins[pin],locked=RA_RESERVED[pin];return `<button type="button" role="option" data-ra-pin="${pin}" class="ra-pin ${p?'mode-'+p.function:''} ${locked?'locked':''} ${pin===this.pin?'active':''}" aria-selected="${pin===this.pin}" title="${esc([pin,ARDUINO_OF[pin]&&'Arduino '+ARDUINO_OF[pin],NOTES[pin],locked,p?.label].filter(Boolean).join(' · '))}"><b>${pin}</b><small>${esc(p?.label||ARDUINO_OF[pin]||(locked?'잠김':''))}</small></button>`;}).join('');
  const pin=this.pin,p=pins[pin],locked=RA_RESERVED[pin],irq=RA_IRQ_PINS[pin];
  const option=(value,label,cur)=>`<option value="${value}" ${value===cur?'selected':''}>${label}</option>`;
  const signals=signalsOf(pin),modes=MODES.filter(([m])=>(m!=='IRQ'||irq!=null)&&(m!=='Peripheral'||signals.length)).map(([m,l])=>option(m,m==='IRQ'?`${raIrqName(pin)} (Input mode · 외부 인터럽트)`:l,p?.function||'')).join('');
  let html=`<h3>${pin}${ARDUINO_OF[pin]?` · Arduino ${ARDUINO_OF[pin]}`:''}</h3>${NOTES[pin]?`<p class="form-hint">${NOTES[pin]}</p>`:''}`;
  if(locked&&!['P212','P213','P200'].includes(pin))html+=`<p class="form-hint">${esc(locked)} — 보드가 쓰는 핀이라 바꿀 수 없습니다.</p>`;
  else{
   html+=`<label>Mode<select data-ra="function">${modes}</select></label>`;
   if(p){
    html+=`<label>Symbolic Name<input data-ra="label" value="${esc(p.label||'')}" placeholder="예: LED1" spellcheck="false"></label>`;
    if(p.function==='GPIO_Output')html+=`<label>Output Data (초기값)<select data-ra="initial">${option('0','Low',String(p.initial??0))}${option('1','High',String(p.initial??0))}</select></label><label>Drive Capacity<select data-ra="drive">${['LOW','MID','HIGH'].map(d=>option(d,{LOW:'Low',MID:'Middle',HIGH:'High'}[d],p.drive||'LOW')).join('')}</select></label><label>Output type<select data-ra="outputType">${option('CMOS','CMOS',p.outputType||'CMOS')}${option('NMOS','n-ch open drain',p.outputType||'CMOS')}</select></label>`;
    if(p.function==='GPIO_Input')html+=`<label>Pull up/down<select data-ra="pull">${option('NONE','None',p.pull||'NONE')}${option('PULLUP','input pull-up',p.pull||'NONE')}</select></label>`;
    if(p.function==='Analog'&&RA_ADC_CHANNELS[pin]!=null){
     const u={mode:'SINGLE',resolution:12,callback:'',priority:12,...this.draft.peripherals?.ADC0},an=String(RA_ADC_CHANNELS[pin]).padStart(3,'0'),scan=Object.entries(pins).filter(([q,x])=>x.function==='Analog'&&RA_ADC_CHANNELS[q]!=null).map(([q])=>'AN'+String(RA_ADC_CHANNELS[q]).padStart(3,'0'));
     html+=`<fieldset><legend>g_adc0 (r_adc · ADC0) · AN${an}</legend><label>Mode<select data-ra-adc="mode">${option('SINGLE','Single Scan',u.mode)}${option('CONTINUOUS','Continuous Scan',u.mode)}</select></label><label>Resolution<select data-ra-adc="resolution">${[12,10,8].map(b=>option(String(b),`${b}-Bit`,String(u.resolution))).join('')}</select></label><label>Callback<input data-ra-adc="callback" value="${esc(u.callback)}" placeholder="NULL" spellcheck="false"></label>${u.callback?`<label>Scan End Interrupt Priority<select data-ra-adc="priority">${PRIORITIES(u.priority)}</select></label>`:''}<p class="form-hint">스캔 채널: ${scan.join(', ')} (Analog로 정한 핀). hal_entry()에서 R_ADC_Open(&amp;g_adc0_ctrl, &amp;g_adc0_cfg), R_ADC_ScanCfg(&amp;g_adc0_ctrl, &amp;g_adc0_channel_cfg) 후 R_ADC_ScanStart · R_ADC_StatusGet · R_ADC_Read(&amp;g_adc0_ctrl, ADC_CHANNEL_${RA_ADC_CHANNELS[pin]}, &amp;value)로 읽습니다. VREFH0 3.3 V 기준입니다.</p></fieldset>`;
    }
    else if(p.function==='Analog')html+=`<p class="form-hint">이 핀에는 ADC12 입력(AN 채널)이 없습니다.</p>`;
    if(p.function==='IRQ')html+=`<label>Pull up/down<select disabled title="인터럽트 핀의 풀업은 Stacks 탭에서 정합니다"><option>${p.pull==='PULLUP'?'input pull-up':'None'}</option></select></label><fieldset><legend>g_external_irq${irq} (r_icu) · ${raIrqName(pin)}</legend><p class="form-hint">Trigger ${({FALLING:'Falling',RISING:'Rising',BOTH:'Both Edges',LOW:'Low Level'})[p.edge||'FALLING']} · Priority ${p.priority??12} · ${esc(p.callback||`external_irq${irq}_callback`)}. 인터럽트 핀의 Trigger · Callback · 우선순위 · 풀업은 RASC처럼 Stacks 탭의 g_external_irq${irq} Properties에서 정합니다.</p><button type="button" data-ra-to-stacks>Stacks: g_external_irq${irq} Properties</button></fieldset>`;
    if(p.function==='Peripheral'&&p.signal.startsWith('SPI')){
     const id=p.signal.split('_')[0],ch=Number(id.slice(3)),u={...DEFAULTS.SPI(ch),...this.draft.peripherals?.[id]};
     html+=`<label>Signal<select data-ra="signal">${signals.map(sg=>option(sg,signalLabel(sg),p.signal)).join('')}</select></label><fieldset><legend>g_spi${ch} (r_spi · SPI${ch})</legend>${this.spiFields(id,u)}</fieldset>`;
    }
    else if(p.function==='Peripheral'&&p.signal.startsWith('IIC')){
     const id=p.signal.split('_')[0],ch=Number(id.slice(3)),u={...DEFAULTS.IIC(ch),...this.draft.peripherals?.[id]};
     let info='';try{const c=raIicClock(raClockHz(this.draft,'pclkb'),u.rate);info=`PCLKB ${raClockHz(this.draft,'pclkb')/1e6} MHz / ${2**c.cks} · ICBRH ${c.brh} · ICBRL ${c.brl} → ${Math.round(c.actual)} bps (듀티 ${Math.round(c.duty)} %)`;}catch(error){info=error.message;}
     html+=`<label>Signal<select data-ra="signal">${signals.map(sg=>option(sg,signalLabel(sg),p.signal)).join('')}</select></label><fieldset><legend>g_i2c_master${ch} (r_iic_master · IIC${ch})</legend><label>Rate<select data-ra-iic="rate">${Object.keys(RA_IIC_RATES).filter(r=>r!=='FASTPLUS'||ch===0).map(r=>option(r,{STANDARD:'Standard (100 kHz)',FAST:'Fast-mode (400 kHz)',FASTPLUS:'Fast-mode plus (1 MHz)'}[r],u.rate)).join('')}</select></label><p class="form-hint">${esc(info)}</p><label>Slave Address<input data-ra-iic="slave" value="0x${u.slave.toString(16).padStart(2,'0')}" spellcheck="false"></label><label>Callback<input data-ra-iic="callback" value="${esc(u.callback)}" spellcheck="false"></label><label>Interrupt Priority<select data-ra-iic="priority">${PRIORITIES(u.priority)}</select></label><p class="form-hint">SCL과 SDA를 모두 이 채널로 정합니다(P400/P401은 보드의 2.2 kΩ 풀업). hal_entry()에서 R_IIC_MASTER_Open(&amp;g_i2c_master${ch}_ctrl, &amp;g_i2c_master${ch}_cfg) 후 R_IIC_MASTER_Write · R_IIC_MASTER_Read를 부르고, 콜백에서 I2C_MASTER_EVENT_TX_COMPLETE · RX_COMPLETE · ABORTED를 받습니다.</p></fieldset>`;
    }
    else if(p.function==='Peripheral'&&p.signal.startsWith('GPT')){
     const id=p.signal.split('_')[0],ch=Number(id.slice(3)),u={...DEFAULTS.GPT(),...this.draft.peripherals?.[id]},pwm=u.mode==='PWM';
     let info='';try{const c=raGptCounts(raClockHz(this.draft),ch,u.period,u.unit,u.duty);info=`PCLKD ${raClockHz(this.draft)/1e6} MHz / ${2**c.div} → ${c.counts} counts${pwm?`, 듀티 ${c.duty} counts`:''} (${Number(c.hz.toPrecision(6))} Hz, ${RA_GPT_32BIT.includes(ch)?32:16}비트)`;}catch(error){info=error.message;}
     html+=`<label>Signal<select data-ra="signal">${signals.map(sg=>option(sg,signalLabel(sg),p.signal)).join('')}</select></label><fieldset><legend>g_timer${ch} (r_gpt · GPT${ch})</legend><label>Mode<select data-ra-gpt="mode">${option('PWM','PWM',u.mode)}${option('PERIODIC','Periodic',u.mode)}</select></label><label>Period<input type="number" data-ra-gpt="period" min="0" step="any" value="${u.period}"></label><label>Period Unit<select data-ra-gpt="unit">${RA_TIMER_UNITS.map(x=>option(x,{Hz:'Hertz',kHz:'Kilohertz',s:'Seconds',ms:'Milliseconds',us:'Microseconds'}[x],u.unit)).join('')}</select></label>${pwm?`<label>Duty Cycle Percent<input type="number" data-ra-gpt="duty" min="0" max="100" step="any" value="${u.duty}"></label>`:''}<p class="form-hint">${esc(info)}</p><label>Callback<input data-ra-gpt="callback" value="${esc(u.callback)}" placeholder="NULL" spellcheck="false"></label>${u.callback?`<label>Overflow/Crest Interrupt Priority<select data-ra-gpt="priority">${PRIORITIES(u.priority)}</select></label>`:''}<p class="form-hint">hal_entry()에서 R_GPT_Open(&amp;g_timer${ch}_ctrl, &amp;g_timer${ch}_cfg)과 R_GPT_Start(&amp;g_timer${ch}_ctrl)를 부릅니다.${pwm?` 듀티는 R_GPT_DutyCycleSet(&amp;g_timer${ch}_ctrl, counts, GPT_IO_PIN_${p.signal.split('_')[1]})로 바꿉니다.`:''}${u.callback?` 주기마다 ${esc(u.callback)}(TIMER_EVENT_CYCLE_END)가 불립니다.`:' 콜백 이름을 쓰면 주기 끝 인터럽트가 켜집니다.'}</p></fieldset>`;
    }
    else if(p.function==='Peripheral'&&this.draft.peripherals?.[p.signal.split('_')[0]]?.mode==='SPI'){
     const id=p.signal.split('_')[0],ch=id.slice(3),u={...SPI_DEFAULTS,callback:`sci_spi${ch}_callback`,...this.draft.peripherals[id]};
     html+=`<label>Signal<select data-ra="signal">${signals.map(sg=>option(sg,signalLabel(sg),p.signal)).join('')}</select></label><fieldset><legend>g_sci_spi${ch} (r_sci_spi · SCI${ch})</legend><label>Mode<select data-ra-sci="mode">${option('UART','UART (r_sci_uart)','SPI')}${option('SPI','Simple SPI (r_sci_spi)','SPI')}</select></label>${this.spiFields(id,u)}</fieldset>`;
    }
    else if(p.function==='Peripheral'){
     const id=p.signal.split('_')[0],ch=id.slice(3),u=this.draft.peripherals?.[id]||{},baud=u.baud??115200;
     let rate='';try{const b=sciBaudSetting(raPclka(this.draft),baud);rate=`PCLKA ${raPclka(this.draft)/1e6} MHz → 실제 ${Math.round(b.actual)} bps (오차 ${b.error.toFixed(2)} %)`;}catch(error){rate=error.message;}
     const mode=RA_SCI_SPI_CHANNELS.includes(Number(ch))?`<label>Mode<select data-ra-sci="mode">${option('UART','UART (r_sci_uart)','UART')}${option('SPI','Simple SPI (r_sci_spi)','UART')}</select></label>`:'';
     html+=`<label>Signal<select data-ra="signal">${signals.map(sg=>option(sg,signalLabel(sg),p.signal)).join('')}</select></label><fieldset><legend>g_uart${ch} (r_sci_uart · SCI${ch})</legend>${mode}<label>Baud Rate<input type="number" data-ra-sci="baud" min="300" max="2000000" step="1" value="${baud}"></label><p class="form-hint">${esc(rate)} · 8N1</p><label>Priority<select data-ra-sci="priority">${Array.from({length:16},(_,i)=>option(String(i),`Priority ${i}${i===0?' (highest)':i===15?' (lowest)':''}`,String(u.priority??12))).join('')}</select></label><label>Callback<input data-ra-sci="callback" value="${esc(u.callback||`user_uart${ch}_callback`)}" spellcheck="false"></label><p class="form-hint">hal_entry()에서 R_SCI_UART_Open(&amp;g_uart${ch}_ctrl, &amp;g_uart${ch}_cfg) 후 R_SCI_UART_Write · R_SCI_UART_Read를 부르고, 콜백에서 UART_EVENT_RX_CHAR · UART_EVENT_TX_COMPLETE를 받습니다.</p></fieldset>`;
    }
    if(p.label)html+=`<p class="form-hint">bsp_pin_cfg.h: <code>#define ${esc(p.label)} (BSP_IO_PORT_${pin.slice(1,2).padStart(2,'0')}_PIN_${pin.slice(2)})</code></p>`;
   }
  }
  $('ra-pin-props').innerHTML=html;
 }
 change(el){
  const key=el.dataset.ra;if(!key&&!el.dataset.raSci&&!el.dataset.raGpt&&!el.dataset.raAdc&&!el.dataset.raIic&&!el.dataset.raSpi)return;const pin=this.pin,pins=this.draft.pins;
  if(key==='function'){if(!el.value)delete pins[pin];else{const old=pins[pin]||{};pins[pin]={function:el.value,...(old.label?{label:old.label}:{})};if(el.value==='IRQ')Object.assign(pins[pin],{edge:'FALLING',pull:'PULLUP',priority:12,callback:`external_irq${RA_IRQ_PINS[pin]}_callback`});if(el.value==='GPIO_Output')Object.assign(pins[pin],{initial:0,drive:'LOW'});if(el.value==='GPIO_Input')pins[pin].pull='NONE';if(el.value==='Peripheral')pins[pin].signal=signalsOf(pin)[0];}}
  else if(el.dataset.raSpi)this.spiValue(el);
  else if(el.dataset.raSci==='mode'){const id=pins[pin]?.signal?.split('_')[0];if(id)this.sciMode(id,el.value);}
  else if(el.dataset.raSci){const id=pins[pin]?.signal?.split('_')[0];if(!id)return;const u=this.draft.peripherals[id];const v=el.value.trim();u[el.dataset.raSci]=el.dataset.raSci==='callback'?v:Number(v);}
  else if(el.dataset.raAdc){const u=((this.draft.peripherals||={}).ADC0||={enabled:true}),k=el.dataset.raAdc,v=el.value.trim();u[k]=['mode','callback'].includes(k)?v:Number(v);}
  else if(el.dataset.raIic){const id=pins[pin]?.signal?.split('_')[0];if(!id)return;const u=this.draft.peripherals[id],k=el.dataset.raIic,v=el.value.trim();u[k]=k==='slave'?(/^(0x[0-9a-f]+|\d+)$/i.test(v)?Number(v):NaN):['rate','callback'].includes(k)?v:Number(v);}
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
  // SPI: the SSL0 pin decides hardware slave select (4-wire) or none (3-wire, CS from a GPIO); an SCK pin makes the SCI
  // channel a simple SPI master.
  const signals=new Set(Object.values(this.draft.pins).filter(p=>p.function==='Peripheral').map(p=>p.signal));
  for(const id of used)if(id.startsWith('SPI'))per[id].ssl=signals.has(id+'_SSL0')?'SSL0':'NONE';
  for(const id of used)if(signals.has(id+'_SCK')&&per[id].mode!=='SPI')this.sciMode(id,'SPI');
  // ADC0 is on while a pin with an AN channel is set to Analog.
  if(Object.entries(this.draft.pins).some(([q,x])=>x.function==='Analog'&&RA_ADC_CHANNELS[q]!=null))used.add('ADC0');
  if(used.has('ADC0'))per.ADC0={mode:'SINGLE',resolution:12,callback:'',priority:12,...per.ADC0,enabled:true};
  for(const id of Object.keys(per))if(!used.has(id)&&!id.startsWith('AGT')&&!PINLESS.includes(id)&&!(id.startsWith('GPT')&&per[id].mode==='PERIODIC'))per[id].enabled=false;
 }
 // The Properties of an SPI master stack (r_spi or r_sci_spi), shown on its pins and in the Stacks tab.
 spiFields(id,u){
  const sci=id.startsWith('SCI'),ch=id.replace(/\D/g,''),g=sci?`g_sci_spi${ch}`:`g_spi${ch}`,pclka=raClockHz(this.draft,'pclka'),attr=k=>`data-ra-spi="${k}" data-ra-spi-id="${id}"`;
  let info='';
  try{if(sci){const c=raSciSpiBitrate(pclka,u.bitrate);info=`PCLKA ${pclka/1e6} MHz / (4 × ${4**c.cks} × ${c.brr+1}) · CKS ${c.cks} · BRR ${c.brr} → ${Math.round(c.actual)} bps`;}else{const c=raSpiBitrate(pclka,u.bitrate);info=`PCLKA ${pclka/1e6} MHz / (2 × ${c.spbr+1} × ${2**c.brdv}) · SPBR ${c.spbr} · BRDV ${c.brdv} → ${Math.round(c.actual)} bps`;}}catch(error){info=error.message;}
  const sel=(k,opts)=>`<select ${attr(k)}>${opts.map(([v,l])=>`<option value="${v}" ${String(v)===String(u[k])?'selected':''}>${l}</option>`).join('')}</select>`;
  const ssl=sci?'Slave Select: 없음 — r_sci_spi는 CS를 내지 않으니 GPIO 출력 핀으로 CS를 직접 내리고 올립니다.'
   :u.ssl==='SSL0'?`Slave Select: SSL0 (${Object.entries(this.draft.pins).find(([,p])=>p.signal===id+'_SSL0')?.[0]}) — SPI Operation(4-wire). RSPI가 전송마다 SSL0을 LOW로 내리고 끝나면 올립니다.`
   :'Slave Select: 사용 안 함 — Clock Synchronous Operation(3-wire). SSL0 핀(P103 · D10 또는 P413)을 정하면 SSL0을 쓰고, 아니면 GPIO 출력 핀으로 CS를 내립니다.';
  return `<label>Operating Mode<select disabled><option>Master</option></select></label><label>Bitrate<input type="number" ${attr('bitrate')} min="1000" step="1" value="${u.bitrate}"></label><p class="form-hint">${esc(info)}</p><label>Clock Phase${sel('cpha',[[0,'Data sampling on odd edge, data variation on even edge'],[1,'Data sampling on even edge, data variation on odd edge']])}</label><label>Clock Polarity${sel('cpol',[[0,'Low when idle'],[1,'High when idle']])}</label><label>Bit Order${sel('bitOrder',[['MSB','MSB First'],['LSB','LSB First']])}</label><label>Callback<input ${attr('callback')} value="${esc(u.callback)}" spellcheck="false"></label><label>Interrupt Priority<select ${attr('priority')}>${PRIORITIES(u.priority)}</select></label><p class="form-hint">${esc(ssl)}</p><p class="form-hint">hal_entry()에서 R_${sci?'SCI_SPI':'SPI'}_Open(&amp;${g}_ctrl, &amp;${g}_cfg) 후 R_${sci?'SCI_SPI':'SPI'}_Write · Read · WriteRead(…, SPI_BIT_WIDTH_8_BITS)를 부르고, 콜백에서 SPI_EVENT_TRANSFER_COMPLETE를 받습니다.${sci?' 8비트 프레임만 됩니다.':' 비트 폭(8 · 16 · 32비트)은 호출마다 정합니다.'}</p>`;
 }
 spiValue(el){const id=el.dataset.raSpiId,k=el.dataset.raSpi,u=this.draft.peripherals?.[id];if(!u)return;const v=el.value.trim();u[k]=['bitOrder','callback'].includes(k)?v:Number(v);}
 // SCI channel as UART or simple SPI: the callback follows the mode while it still has the other mode's default name.
 sciMode(id,mode){
  const per=this.draft.peripherals||={},ch=id.slice(3),u=per[id]||={enabled:true},uart=`user_uart${ch}_callback`,spi=`sci_spi${ch}_callback`;
  if(mode==='SPI'){Object.assign(u,{...SPI_DEFAULTS,...u,mode:'SPI'});if(!u.callback||u.callback===uart)u.callback=spi;}
  else{delete u.mode;if(!u.callback||u.callback===spi)u.callback=uart;u.baud??=115200;for(const pin of Object.keys(this.draft.pins))if(this.draft.pins[pin].signal===id+'_SCK')delete this.draft.pins[pin];}
 }
 // Clocks tab: HOCO → PLL → the internal clock dividers, with the resulting frequencies and their limits.
 renderClocks(){
  const fam=raFamily(this.draft.family),c={...fam.clock,...(this.draft.clock||{})},pll=c.hocoMHz/c.pllDiv*c.pllMul;
  const sel=(k,values,fmt=v=>v)=>`<select data-ra-clock="${k}">${values.map(v=>`<option value="${v}" ${v===c[k]?'selected':''}>${fmt(v)}</option>`).join('')}</select>`;
  const divs=[1,2,4,8,16,32,64],rows=Object.entries(RA_CLOCK_LIMITS).map(([k,max])=>{const f=pll/c[k+'Div'];return `<tr class="${f>max+1e-9?'over':''}"><th>${k.toUpperCase()}</th><td>${sel(k+'Div',divs,v=>'/ '+v)}</td><td>${+f.toFixed(3)} MHz</td><td>최대 ${max} MHz</td></tr>`;}).join('');
  $('ra-clocks').innerHTML=`<div class="ra-clock-tree"><label>HOCO ${sel('hocoMHz',[16,18,20],v=>v+' MHz')}</label><span>→</span><label>PLL Src: HOCO · Div ${sel('pllDiv',[1,2,3],v=>'/ '+v)}</label><label>Mul ${sel('pllMul',Array.from({length:21},(_,i)=>i+10),v=>'x '+v+'.0')}</label><span>→</span><strong>PLL ${+pll.toFixed(3)} MHz</strong><span class="form-hint">(입력 ${+(c.hocoMHz/c.pllDiv).toFixed(3)} MHz: 8~24, 출력 120~200 MHz)</span></div>
<table class="ra-clock-table"><thead><tr><th>클록</th><th>분주</th><th>주파수</th><th>한계</th></tr></thead><tbody>${rows}</tbody></table><p class="form-hint">Clock Src: PLL. 메인 크리스털(24 MHz)은 FPB-RA6E1에 실장되어 있지 않아 HOCO를 씁니다. PCLKA는 SCI, PCLKB는 AGT, PCLKC는 ADC, PCLKD는 GPT의 기준 클록입니다. 적용하면 bsp_clock_cfg.h가 바뀌고, 에뮬레이터는 FSP가 설정한 레지스터대로 동작합니다.</p>`
   +(()=>{const rtc=this.draft.peripherals?.RTC?.enabled?{...RA_RTC_DEFAULTS,...this.draft.peripherals.RTC}:null,sub=rtc?.clockSource==='SUBCLOCK';
    return `<table class="ra-clock-table" data-ra-low-clocks><thead><tr><th>저속 클록</th><th>주파수</th><th>쓰임</th></tr></thead><tbody><tr><th>LOCO</th><td>32.768 kHz</td><td>${rtc&&!sub?'RTC 카운트 소스 · ':''}AGT LOCO 카운트 소스</td></tr><tr><th>SOSC (Sub-Clock)</th><td>32.768 kHz</td><td>${sub?'RTC 카운트 소스 · Populated (BSP_CLOCK_CFG_SUBCLOCK_POPULATED 1)':'Not Populated'}</td></tr></tbody></table><p class="form-hint">${esc(SUBCLOCK_NOTE)} RTC의 카운트 소스는 Stacks의 g_rtc0에서 고릅니다.</p>`;})();
 }
 // Stacks tab: the FSP module instances the configuration generates; timers without pins (AGT, periodic GPT) are added
 // and set here, the others link to the pin that owns them.
 renderStacks(){
  const per=this.draft.peripherals||{},pins=this.draft.pins,list=[];
  const pinOf=prefix=>Object.entries(pins).find(([,p])=>p.function==='Peripheral'&&p.signal.startsWith(prefix+'_'))?.[0];
  for(const [pin,p]of Object.entries(pins))if(p.function==='IRQ')list.push({irq:pin});
  for(const [id,p]of Object.entries(per)){
   if(!p.enabled)continue;const ch=id.slice(3);
   if(PINLESS.includes(id))list.push({pinless:id});
   else if(id.startsWith('IIC'))list.push({name:`g_i2c_master${ch}`,module:'I2C Master (r_iic_master)',pin:pinOf(id),info:`${p.rate} · 0x${(p.slave??0x50).toString(16)} · ${p.callback}`});
   else if(id.startsWith('SPI'))list.push({spi:id,name:`g_spi${ch}`,module:'SPI (r_spi)',pin:pinOf(id)});
   else if(id.startsWith('SCI')&&p.mode==='SPI')list.push({spi:id,name:`g_sci_spi${ch}`,module:'SPI (r_sci_spi)',pin:pinOf(id)});
   else if(id.startsWith('SCI'))list.push({name:`g_uart${ch}`,module:'UART (r_sci_uart)',pin:pinOf(id),info:`${p.baud} bps · ${p.callback}`});
   else if(id==='ADC0')list.push({name:'g_adc0',module:'ADC (r_adc)',pin:Object.entries(pins).find(([q,x])=>x.function==='Analog'&&RA_ADC_CHANNELS[q]!=null)?.[0],info:`${p.mode==='CONTINUOUS'?'Continuous':'Single'} Scan · ${p.resolution}-Bit`});
   else if(id.startsWith('GPT')&&p.mode==='PWM')list.push({name:`g_timer${ch}`,module:'Timer, General PWM (r_gpt)',pin:pinOf(id),info:`PWM ${p.period} ${p.unit} · ${p.duty} %`});
   else list.push({id,name:id.startsWith('AGT')?`g_agt${ch}`:`g_timer${ch}`,module:id.startsWith('AGT')?'Timer, Low-Power (r_agt)':'Timer, General PWM (r_gpt) · Periodic',p,edit:true});
  }
  const timerInfo=(id,p)=>{try{if(id.startsWith('AGT')){const c=raAgtCounts(raClockHz(this.draft,'pclkb'),Number(id.slice(3)),p.period,p.unit);return `${c.source}${c.source==='LOCO'?' 32.768 kHz':' '+raClockHz(this.draft,'pclkb')/1e6+' MHz'} / ${c.source==='LOCO'?2**c.div:[1,2,0,8][c.div]} → ${c.counts} counts (${Number(c.hz.toPrecision(6))} Hz)`;}const c=raGptCounts(raClockHz(this.draft),Number(id.slice(3)),p.period,p.unit);return `PCLKD / ${2**c.div} → ${c.counts} counts (${Number(c.hz.toPrecision(6))} Hz)`;}catch(error){return error.message;}};
  const card=s=>s.irq?this.irqCard(s.irq):s.pinless?this.pinlessCard(s.pinless):s.spi?`<article class="ra-stack" data-ra-spi-stack="${s.spi}"><header><b>${s.name}</b><span>${s.module}</span>${s.pin?`<button type="button" data-ra-goto="${s.pin}">Pins: ${s.pin}</button>`:''}<button type="button" data-ra-spi-remove="${s.spi}">삭제</button></header><div class="ra-stack-fields">${this.spiFields(s.spi,{...SPI_DEFAULTS,...per[s.spi]})}</div></article>`:s.edit?`<article class="ra-stack" data-ra-stack="${s.id}"><header><b>${s.name}</b><span>${s.module}</span><button type="button" data-ra-remove="${s.id}">삭제</button></header><div class="ra-stack-fields"><label>Period<input type="number" data-ra-field="period" min="0" step="any" value="${s.p.period}"></label><label>Unit<select data-ra-field="unit">${RA_TIMER_UNITS.map(u=>`<option value="${u}" ${u===s.p.unit?'selected':''}>${u}</option>`).join('')}</select></label><label>Callback<input data-ra-field="callback" value="${esc(s.p.callback)}" placeholder="NULL" spellcheck="false"></label><label>Priority<select data-ra-field="priority">${PRIORITIES(s.p.priority)}</select></label></div><p class="form-hint">${esc(timerInfo(s.id,s.p))} · R_${s.id.startsWith('AGT')?'AGT':'GPT'}_Open(&amp;${s.name}_ctrl, &amp;${s.name}_cfg) · R_${s.id.startsWith('AGT')?'AGT':'GPT'}_Start(&amp;${s.name}_ctrl)</p></article>`
   :`<article class="ra-stack"><header><b>${s.name}</b><span>${s.module}</span>${s.pin?`<button type="button" data-ra-goto="${s.pin}">Pins: ${s.pin}</button>`:''}</header><p class="form-hint">${esc(s.info)}</p></article>`;
  const free=[...RA_AGT_CHANNELS.map(ch=>'AGT'+ch),...RA_GPT_CHANNELS.map(ch=>'GPT'+ch)].filter(id=>!per[id]?.enabled);
  const spiFree=[...RA_SPI_CHANNELS.map(ch=>['SPI'+ch,`SPI (r_spi) · SPI${ch}`]),...RA_SCI_SPI_CHANNELS.map(ch=>['SCI'+ch,`SPI (r_sci_spi) · SCI${ch} Simple SPI`])].filter(([id])=>!per[id]?.enabled);
  $('ra-stacks').innerHTML=`<div class="ra-stack-new"><label>New Stack<select id="ra-stack-add"><optgroup label="Input"><option value="IRQ">External IRQ (r_icu)</option></optgroup>${spiFree.length?`<optgroup label="Connectivity">${spiFree.map(([id,l])=>`<option value="${id}" data-ra-spi-add>${l}</option>`).join('')}</optgroup>`:''}<optgroup label="Timers">${free.map(id=>`<option value="${id}">${id.startsWith('AGT')?`Timer, Low-Power (r_agt) · AGT${id.slice(3)}`:`Timer, General PWM (r_gpt) · GPT${id.slice(3)} Periodic`}</option>`).join('')}</optgroup>${PINLESS.some(id=>!per[id]?.enabled)?`<optgroup label="Monitoring · System">${PINLESS.filter(id=>!per[id]?.enabled).map(id=>`<option value="${id}">${STACK_NAMES[id][1]}</option>`).join('')}</optgroup>`:''}</select></label><button type="button" data-ra-add>추가</button></div>${list.length?list.map(card).join(''):'<p class="form-hint">스택이 없습니다. New Stack으로 External IRQ · SPI · 타이머를 넣거나, Pins 탭에서 핀 기능을 정하세요.</p>'}`;
 }
 // A stack without pins (New Stack → Monitoring · System): the watchdogs with the Properties RASC shows for them.
 pinlessCard(id){
  const p=this.draft.peripherals[id],[name,module]=STACK_NAMES[id],option=(value,label,cur)=>`<option value="${value}" ${String(value)===String(cur)?'selected':''}>${label}</option>`;
  const sel=(field,values,cur)=>`<select data-ra-field="${field}">${values.map(([v,l])=>option(v,l,cur)).join('')}</select>`;
  let fields='',hint='';
  if(RA_WDT[id]){
   const q={...WDT_DEFAULTS(id),...p};let timing='';try{const t=raWdtTiming(this.draft,id);timing=`${id==='IWDT'?'IWDTCLK 15 kHz':`PCLKB ${raClockHz(this.draft,'pclkb')/1e6} MHz`} / ${q.clockDiv} = ${Number(t.hz.toPrecision(6))} Hz × ${q.timeout} 클록 → ${Number(t.ms.toPrecision(4))} ms 안에 새로 고침해야 합니다.`;}catch(error){timing=error.message;}
   fields=(id==='WDT'?`<label>Start Mode${sel('startMode',[['REGISTER','Register Start Mode'],['AUTO','Auto Start Mode (OFS0)']],q.startMode)}</label>`:`<label>Start Mode<input value="Auto Start Mode (OFS0)" readonly title="RA6E1의 IWDT는 OFS0으로만 시작합니다"></label>`)
    +`<label>Timeout${sel('timeout',RA_WDT[id].timeouts.map(v=>[v,`${v} Cycles`]),q.timeout)}</label><label>Clock Division Ratio${sel('clockDiv',RA_WDT[id].dividers.map(v=>[v,`${id==='IWDT'?'IWDTCLK':'PCLKB'}/${v}`]),q.clockDiv)}</label>`
    +`<label>Window Start Position${sel('windowStart',RA_WDT_WINDOW_START.map(v=>[v,v===100?'100 (Window Position Not Specified)':`${v} %`]),q.windowStart)}</label><label>Window End Position${sel('windowEnd',RA_WDT_WINDOW_END.map(v=>[v,v===0?'0 (Window Position Not Specified)':`${v} %`]),q.windowEnd)}</label>`
    +`<label>Reset Control${sel('reset',[['RESET','Reset Output'],['NMI','NMI Generated']],q.reset)}</label><label>Stop Control${sel('stopInSleep',[[0,'WDT Count Enabled in Low Power Mode'],[1,'WDT Count Disabled in Low Power Mode']],q.stopInSleep?1:0)}</label>`
    +`<label>NMI Callback<input data-ra-field="callback" value="${esc(q.callback)}" placeholder="NULL" spellcheck="false"></label>`;
   hint=`${esc(timing)} ${id==='IWDT'||q.startMode==='AUTO'?'리셋 직후부터 셉니다(OFS0, bsp_mcu_ofs_cfg.h).':'R_WDT_Open 뒤 첫 R_WDT_Refresh부터 셉니다.'} R_${id}_Open(&amp;${name}_ctrl, &amp;${name}_cfg) · R_${id}_Refresh(&amp;${name}_ctrl). 시간 초과면 ${q.reset==='NMI'?`NMI로 ${esc(q.callback||'콜백')}을 부릅니다`:'MCU가 리셋되고 실행 로그에 남습니다'}. 리셋 원인은 R_SYSTEM-&gt;RSTSR1_b.${id}RF로 읽습니다.`;
  }
  if(id==='RTC'){
   const q={...RA_RTC_DEFAULTS,...p},prio=(field,cur,none)=>`<select data-ra-field="${field}">${PRIORITIES(cur===null?'':cur,none)}</select>`;
   fields=`<label>Clock Source${sel('clockSource',[['LOCO','LOCO'],['SUBCLOCK','Sub-Clock']],q.clockSource)}</label>`
    +(q.clockSource==='LOCO'?`<label>Frequency Comparison Value (LOCO)<input type="number" data-ra-field="freqCompare" min="8" max="510" step="1" value="${q.freqCompare}"></label>`:'')
    +`<label>시작 시각 (시뮬레이터)${sel('start',[['SIMULATION','시뮬레이션: 2000-01-01 00:00:00'],['HOST_TIME','PC 시각 (배터리로 계속 돈 RTC처럼)']],q.start)}</label>`
    +`<label>Callback<input data-ra-field="callback" value="${esc(q.callback)}" placeholder="NULL" spellcheck="false"></label><label>Alarm Interrupt Priority${prio('alarmPriority',q.alarmPriority,true)}</label><label>Period Interrupt Priority${prio('periodicPriority',q.periodicPriority,true)}</label><label>Carry Interrupt Priority${prio('carryPriority',q.carryPriority,false)}</label>`;
   hint=`${q.clockSource==='SUBCLOCK'?esc(SUBCLOCK_NOTE)+' ':'LOCO 32.768 kHz로 셉니다(RFRL '+q.freqCompare+'). '}${q.start==='HOST_TIME'?'실행을 시작할 때 RTC가 PC 시각을 갖고 돌고 있으며, R_RTC_Open이 멈추지 않습니다(r_rtc_cfg.h RTC_CFG_OPEN_SET_CLOCK_SOURCE 0) — R_RTC_CalendarTimeGet이 바로 PC 시각을 읽습니다.':'실행마다 2000-01-01 00:00:00에서 시작하고, R_RTC_Open이 RTC를 멈추니 R_RTC_CalendarTimeSet으로 시각을 정하세요.'} R_RTC_PeriodicIrqRateSet(1/256~2초) · R_RTC_CalendarAlarmSet의 콜백은 ${esc(q.callback||'(없음)')}에서 RTC_EVENT_PERIODIC_IRQ · RTC_EVENT_ALARM_IRQ로 옵니다. MCU 리셋에도 시각은 이어집니다.`;
  }
  return `<article class="ra-stack" data-ra-stack="${id}"><header><b>${name}</b><span>${module}</span><button type="button" data-ra-remove="${id}">삭제</button></header><div class="ra-stack-fields">${fields}</div><p class="form-hint">${hint}</p></article>`;
 }
 // An External IRQ stack (New Stack → Input → External IRQ), with the Properties RASC shows: Name, Channel, Trigger,
 // Digital Filtering, Callback, Pin Interrupt Priority, and the pin of the channel with its pull-up. The data stays on the
 // pin (pins[pin].function 'IRQ'), so earlier project files open unchanged.
 irqFree(q,self){return q===self||(!this.draft.pins[q]&&!(RA_RESERVED[q]&&!['P212','P213'].includes(q)));}
 irqCard(pin){
  const pins=this.draft.pins,p=pins[pin],ch=RA_IRQ_PINS[pin],g=`g_external_irq${ch}`,used=new Set(Object.entries(pins).filter(([q,x])=>x.function==='IRQ'&&q!==pin).map(([q])=>RA_IRQ_PINS[q]));
  const option=(value,label,cur)=>`<option value="${value}" ${String(value)===String(cur)?'selected':''}>${label}</option>`;
  const channels=[...new Set(Object.keys(RA_IRQ_PINS).filter(q=>!used.has(RA_IRQ_PINS[q])&&this.irqFree(q,pin)).map(q=>RA_IRQ_PINS[q]))].sort((a,b)=>a-b);
  const pinsOf=Object.keys(RA_IRQ_PINS).filter(q=>RA_IRQ_PINS[q]===ch&&this.irqFree(q,pin));
  return `<article class="ra-stack" data-ra-irq="${pin}"><header><b>${g}</b><span>External IRQ (r_icu)</span><button type="button" data-ra-goto="${pin}">Pins: ${pin}</button><button type="button" data-ra-irq-remove="${pin}">삭제</button></header><div class="ra-stack-fields"><label>Name<input value="${g}" readonly title="이름은 채널 번호를 따릅니다"></label><label>Channel<select data-ra-irq-field="channel">${channels.map(c=>option(c,c,ch)).join('')}</select></label><label>Pin<select data-ra-irq-field="pin">${pinsOf.map(q=>option(q,`${q} (${raIrqName(q)})`,pin)).join('')}</select></label><label>Trigger<select data-ra-irq-field="edge">${[['FALLING','Falling'],['RISING','Rising'],['BOTH','Both Edges'],['LOW','Low Level']].map(([v,l])=>option(v,l,p.edge||'FALLING')).join('')}</select></label><label>Digital Filtering<select data-ra-irq-field="filter">${option('0','Disabled',p.filter?'1':'0')}${option('1','Enabled',p.filter?'1':'0')}</select></label><label>Callback<input data-ra-irq-field="callback" value="${esc(p.callback||`external_irq${ch}_callback`)}" spellcheck="false"></label><label>Pin Interrupt Priority<select data-ra-irq-field="priority">${PRIORITIES(p.priority??12)}</select></label><label>Pin Input Pull-up<select data-ra-irq-field="pull">${option('NONE','None',p.pull||'NONE')}${option('PULLUP','input pull-up',p.pull||'NONE')}</select></label></div><p class="form-hint">${pin} · ${raIrqName(pin)} · R_ICU_ExternalIrqOpen(&amp;${g}_ctrl, &amp;${g}_cfg) · R_ICU_ExternalIrqEnable(&amp;${g}_ctrl) 뒤에 콜백이 불립니다. IRQ${ch}와 IRQ${ch}-DS는 같은 채널이라 한 핀만 씁니다.</p></article>`;
 }
 irqChange(pin,el){
  const pins=this.draft.pins,p=pins[pin],f=el.dataset.raIrqField,v=el.value.trim();
  if(f==='channel'||f==='pin'){
   const to=f==='pin'?v:Object.keys(RA_IRQ_PINS).find(q=>RA_IRQ_PINS[q]===Number(v)&&this.irqFree(q,pin));if(!to||to===pin||!this.irqFree(to,pin))return;
   const was=`external_irq${RA_IRQ_PINS[pin]}_callback`;delete pins[pin];pins[to]={...p,callback:!p.callback||p.callback===was?`external_irq${RA_IRQ_PINS[to]}_callback`:p.callback};if(this.pin===pin)this.pin=to;
  }
  else if(f==='priority')p.priority=Number(v);else if(f==='filter'){if(v==='1')p.filter=true;else delete p.filter;}else p[f]=v;
  this.validate();this.renderStacks();
 }
 renderSummary(){
  const fam=raFamily(this.draft.family),c={...fam.clock,...(this.draft.clock||{})},pll=c.hocoMHz/c.pllDiv*c.pllMul,pins=this.draft.pins,per=this.draft.peripherals||{};
  const stacks=['g_ioport (r_ioport)',...Object.entries(pins).filter(([,p])=>p.function==='IRQ').map(([q])=>`g_external_irq${RA_IRQ_PINS[q]} (r_icu)`),...Object.entries(per).filter(([,p])=>p.enabled).map(([id,p])=>{const n=id.replace(/\D/g,'');return STACK_NAMES[id]?`${STACK_NAMES[id][0]} (${STACK_NAMES[id][1].match(/\((.+)\)/)[1]})`:id.startsWith('SCI')?(p.mode==='SPI'?`g_sci_spi${n} (r_sci_spi)`:`g_uart${n} (r_sci_uart)`):id.startsWith('SPI')?`g_spi${n} (r_spi)`:id.startsWith('GPT')?`g_timer${n} (r_gpt)`:id.startsWith('AGT')?`g_agt${n} (r_agt)`:id.startsWith('IIC')?`g_i2c_master${n} (r_iic_master)`:'g_adc0 (r_adc)';})];
  const row=(k,v)=>`<tr><th>${k}</th><td>${esc(String(v))}</td></tr>`;
  $('ra-summary').innerHTML=`<table class="ra-clock-table ra-summary-table"><tbody>${row('Board','FPB-RA6E1')}${row('Device',fam.part)}${row('Core','CM33')}${row('Package','LQFP100')}${row('Toolchain','GNU ARM Embedded (arm-none-eabi-gcc)')}${row('FSP','앱에 설치된 FSP (ra/fsp/inc/fsp_version.h)')}${row('Project Type','Flat (Non-TrustZone) Project')}${row('RTOS','No RTOS (Bare Metal)')}${row('Clock',`HOCO ${c.hocoMHz} MHz → PLL ${+pll.toFixed(3)} MHz → ICLK ${+(pll/c.iclkDiv).toFixed(3)} MHz`)}${row('Pins',`${Object.keys(pins).length}개 설정`)}${row('Stacks',stacks.join(', '))}</tbody></table><p class="form-hint">문서: FSP User's Manual (renesas.github.io/fsp) · RA6E1 Group User's Manual: Hardware (R01UH0930) · FPB-RA6E1 v1 User's Manual (R20UT4960). 앱은 바깥 링크를 열지 않으니 브라우저에서 찾아 여세요. 설정은 BSP · Clocks · Pins · Stacks 탭에서 바꿉니다.</p>`;
 }
 renderBsp(){
  const b={...RA_BSP_DEFAULTS,...(this.draft.bsp||{})},hex=v=>Number.isInteger(v)?'0x'+v.toString(16).toUpperCase():'';
  const fixed=[['MCU Vcc (mV)','3300'],['Parameter checking','Enabled'],['Assert Failures','Return FSP_ERR_ASSERTION'],['Error Log','No Error Log'],['PFS Protect','Enabled'],['C Runtime Initialization','Enabled'],['Main Oscillator Populated','Not Populated (FPB-RA6E1)'],['RTOS','No RTOS']];
  $('ra-bsp').innerHTML=`<table class="ra-clock-table"><thead><tr><th>Property</th><th>Value</th></tr></thead><tbody><tr><th>Main stack size (bytes)</th><td><input data-ra-bsp="stackBytes" value="${hex(b.stackBytes)}" spellcheck="false"></td></tr><tr><th>Heap size (bytes)</th><td><input data-ra-bsp="heapBytes" value="${hex(b.heapBytes)}" spellcheck="false"></td></tr>${fixed.map(([k,v])=>`<tr><th>${k}</th><td>${v}</td></tr>`).join('')}</tbody></table><p class="form-hint">Main stack size와 Heap size는 ra_cfg/fsp_cfg/bsp/bsp_cfg.h의 BSP_CFG_STACK_MAIN_BYTES · BSP_CFG_HEAP_BYTES가 됩니다(8의 배수). printf·malloc을 쓰면 Heap이 필요합니다. 나머지 항목은 앱이 고정해 둔 값입니다.</p>`;
 }
 bspChange(el){
  const k=el.dataset.raBsp;if(!k)return;const v=el.value.trim();
  this.draft.bsp={...RA_BSP_DEFAULTS,...(this.draft.bsp||{}),[k]:/^(0x[0-9a-f]+|\d+)$/i.test(v)?Number(v):NaN};this.validate();
 }
 stackChange(el){
  const irqPin=el.closest('[data-ra-irq]')?.dataset.raIrq;if(irqPin&&el.dataset.raIrqField)return this.irqChange(irqPin,el);
  if(el.dataset.raSpi){this.spiValue(el);this.validate();this.renderStacks();return;}
  const id=el.closest('[data-ra-stack]')?.dataset.raStack,k=el.dataset.raField;if(!id||!k)return;
  const v=el.value.trim(),q=this.draft.peripherals[id];
  if(['unit','callback','startMode','reset','clockSource','start'].includes(k))q[k]=v;
  else if(k==='stopInSleep')q[k]=v==='1';
  else if(/Priority$/.test(k)&&v==='')q[k]=null;
  else q[k]=Number(v);
  this.validate();this.renderStacks();
 }
 stackClick(el){
  const per=this.draft.peripherals||={};
  const gone=el.closest('[data-ra-irq-remove]')?.dataset.raIrqRemove;if(gone){delete this.draft.pins[gone];this.validate();this.renderStacks();return;}
  if(el.closest('[data-ra-add]')&&$('ra-stack-add').value==='IRQ'){
   // The board's S1 (IRQ1-DS) first, then the first free channel.
   const pins=this.draft.pins,used=new Set(Object.entries(pins).filter(([,x])=>x.function==='IRQ').map(([q])=>RA_IRQ_PINS[q])),pin=['P205',...Object.keys(RA_IRQ_PINS)].find(q=>!used.has(RA_IRQ_PINS[q])&&this.irqFree(q));
   if(!pin){$('ra-pinout-error').textContent='External IRQ를 둘 수 있는 빈 핀이 없습니다.';return;}
   pins[pin]={function:'IRQ',edge:'FALLING',pull:'PULLUP',priority:12,callback:`external_irq${RA_IRQ_PINS[pin]}_callback`};this.validate();this.renderStacks();return;
  }
  const spiGone=el.closest('[data-ra-spi-remove]')?.dataset.raSpiRemove;
  if(spiGone){for(const [pin,p]of Object.entries(this.draft.pins))if(p.function==='Peripheral'&&p.signal.startsWith(spiGone+'_'))delete this.draft.pins[pin];delete per[spiGone];this.validate();this.renderStacks();return;}
  if(el.closest('[data-ra-add]')&&$('ra-stack-add').selectedOptions[0]?.hasAttribute('data-ra-spi-add'))return this.addSpiStack($('ra-stack-add').value);
  if(el.closest('[data-ra-add]')&&RA_WDT[$('ra-stack-add').value]){const id=$('ra-stack-add').value;per[id]=WDT_DEFAULTS(id);this.validate();this.renderStacks();return;}
  if(el.closest('[data-ra-add]')&&$('ra-stack-add').value==='RTC'){per.RTC={enabled:true,...RA_RTC_DEFAULTS};this.validate();this.renderStacks();return;}
  if(el.closest('[data-ra-add]')){const id=$('ra-stack-add').value;if(!id)return;per[id]=id.startsWith('AGT')?{enabled:true,period:100,unit:'ms',callback:`agt${id.slice(3)}_callback`,priority:12}:{enabled:true,mode:'PERIODIC',period:100,unit:'ms',duty:50,callback:`gpt${id.slice(3)}_callback`,priority:12};this.validate();this.renderStacks();return;}
  const rm=el.closest('[data-ra-remove]')?.dataset.raRemove;if(rm){delete per[rm];this.validate();this.renderStacks();return;}
  const go=el.closest('[data-ra-goto]')?.dataset.raGoto;if(go){this.pin=go;this.tab='pins';this.render();}
 }
 // New Stack → Connectivity → SPI: the first free pin group gets the stack's signals (RSPI group A is Arduino D10-D13).
 addSpiStack(id){
  const pins=this.draft.pins,free=q=>!pins[q]&&!RA_RESERVED[q],group=SPI_PIN_GROUPS[id]?.find(g=>Object.keys(g).every(free));
  if(!group){$('ra-pinout-error').textContent=`${id}: 핀(${SPI_PIN_GROUPS[id].map(g=>Object.keys(g).join('·')).join(' 또는 ')})이 다른 기능에 쓰이고 있습니다. Pins 탭에서 비우세요.`;return;}
  for(const [pin,signal]of Object.entries(group))pins[pin]={function:'Peripheral',signal};
  this.syncChannels();this.validate();this.renderStacks();
 }
 commit(){
  try{const mcu=validateRaMcu(this.draft);this.apply({mcu});$('ra-pinout-dialog').close();}
  catch(error){$('ra-pinout-error').textContent=error.message;this.onError?.(error.message);}
 }
}
