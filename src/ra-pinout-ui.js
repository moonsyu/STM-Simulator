import {$,esc} from './common.js';
import {RA6E1_PORTS,RA_IRQ_PINS,RA_RESERVED,FPB_RA6E1,RA_PERIPHERAL_PINS,RA_ADC_CHANNELS,RA_GPT_32BIT,RA_GPT_CHANNELS,RA_AGT_CHANNELS,RA_TIMER_UNITS,RA_CLOCK_LIMITS,RA_IIC_RATES,RA_IIC_CHANNELS,RA_IIC_SLAVE_ADDRESS,raIicSlaveClock,RA_SPI_CHANNELS,RA_SCI_SPI_CHANNELS,raIicClock,raGptCounts,raAgtCounts,raClockHz,raSpiBitrate,raSciSpiBitrate,raFamily,validateRaMcu,raDefaultMcu,raIrqName,RA_BSP_DEFAULTS,RA_WDT,RA_WDT_WINDOW_START,RA_WDT_WINDOW_END,raWdtTiming,RA_RTC_DEFAULTS,RA_IRQ_DS,RA_LPM_DEFAULTS,RA_LPM_MODES,RA_LPM_MODE_NAMES,RA_LPM_WAKE,RA_LPM_CANCEL,raDsPin,RA_FLASH_DEFAULTS,RA_ELC_EVENTS,RA_TRANSFER_DEFAULTS,RA_TRANSFER_MODES,RA_TRANSFER_ADDR_MODES,RA_DMAC_CHANNELS,raTransferEvents,raEventHasVector} from './ra-config.js';
import {RA_DF_BASE,RA_DF_SIZE,RA_DF_BLOCK,RA_DF_UNIT,dataFlashUsed} from './ra-data-flash.js';
import {lpmWakeLabel,lpmCancelLabel} from './ra-lpm.js';
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
// The pins New Stack → Connectivity gives an I2C slave stack (IIC0 on the Arduino SCL/SDA pins first).
const IIC_PIN_GROUPS={IIC0:[{P400:'IIC0_SCL',P401:'IIC0_SDA'},{P408:'IIC0_SCL',P407:'IIC0_SDA'}],IIC1:[{P205:'IIC1_SCL',P206:'IIC1_SDA'}]};
// Stacks without pins (added from New Stack, kept until removed there).
const PINLESS=['WDT','IWDT','RTC','LPM','FLASH','ELC'];
const STACK_NAMES={WDT:['g_wdt0','Watchdog (r_wdt)'],IWDT:['g_iwdt0','Independent Watchdog (r_iwdt)'],RTC:['g_rtc0','Realtime Clock (r_rtc)'],LPM:['g_lpm0','Low Power Modes (r_lpm)'],FLASH:['g_flash0','Flash (r_flash_hp)'],ELC:['g_elc','Event Link Controller (r_elc)']};
// Transfer stacks (feature 36): g_transferN with r_dtc or r_dmac, any number of them (New Stack → Transfer).
const isTransfer=id=>/^TRANSFER\d+$/.test(id);
const EVENT_LABEL=ev=>ev==='SOFTWARE'?'Software start (R_DMAC_SoftwareStart)':ev.replace(/_/g,' ');
// New Stack groups of the pin-less stacks, as RASC files them (Power → Low Power Modes).
const PINLESS_GROUPS=[['Monitoring · System',['WDT','IWDT','RTC','ELC']],['Power',['LPM']],['Storage',['FLASH']]];
const SUBCLOCK_NOTE='FPB-RA6E1에는 32.768 kHz 크리스털 X2가 실장되어 있지만 E25/E26이 열려 있어 그대로는 서브 클록이 돌지 않습니다(XCIN/XCOUT은 J3로만 나옴). 실물 보드에서 Sub-Clock을 쓰려면 E25/E26을 닫으세요.';
const WDT_DEFAULTS=id=>({enabled:true,...(id==='WDT'?{startMode:'REGISTER'}:{}),...RA_WDT[id].defaults,windowStart:100,windowEnd:0,reset:'RESET',stopInSleep:false,callback:''});
const hexAddr=v=>'0x'+v.toString(16).toUpperCase().padStart(8,'0');
const ARDUINO_OF=Object.fromEntries(Object.entries(FPB_RA6E1.arduino).map(([k,v])=>[v,k]));
const NOTES={P408:'LED1 (녹색, 보드 내장 · 직렬 10 kΩ)',P407:'LED2 (녹색, 보드 내장 · 직렬 10 kΩ)',P205:'S1 사용자 스위치 (보드 내장, 누르면 LOW · 10 kΩ 풀업 R17)',P014:'Arduino 헤더의 RESET 핀(J2-3) · 10 kΩ 풀업 R4 — MCU의 RES#가 아니라 GPIO라서 LOW로 당겨도 리셋되지 않습니다',P400:'Arduino SCL · 2.2 kΩ 풀업 (보드)',P401:'Arduino SDA · 2.2 kΩ 풀업 (보드)'};

export class RaPinoutPanel {
 constructor({getProject,apply,isRunning,onError,clearDataFlash}){
  Object.assign(this,{getProject,apply,isRunning,onError,clearDataFlash});this.pin='P408';
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
     html+=`<fieldset><legend>g_adc0 (r_adc · ADC0) · AN${an}</legend><label>Mode<select data-ra-adc="mode">${option('SINGLE','Single Scan',u.mode)}${option('CONTINUOUS','Continuous Scan',u.mode)}</select></label><label>Resolution<select data-ra-adc="resolution">${[12,10,8].map(b=>option(String(b),`${b}-Bit`,String(u.resolution))).join('')}</select></label><label>Callback<input data-ra-adc="callback" value="${esc(u.callback)}" placeholder="NULL" spellcheck="false"></label>${u.callback?`<label>Scan End Interrupt Priority<select data-ra-adc="priority">${PRIORITIES(u.priority)}</select></label>`:''}<label>Start Trigger<select data-ra-adc="trigger">${option('SOFTWARE','Software (R_ADC_ScanStart)',u.trigger||'SOFTWARE')}${option('ELC','ELC Event (ELC_PERIPHERAL_ADC0)',u.trigger||'SOFTWARE')}</select></label>${u.trigger==='ELC'?`<label>ELC Event<select data-ra-adc="elcEvent">${Object.keys(RA_ELC_EVENTS).filter(k=>k!=='ADC0_SCAN_END').map(k=>option(k,EVENT_LABEL(k),u.elcEvent||'GPT1_COUNTER_OVERFLOW')).join('')}</select></label><p class="form-hint">g_elc_cfg의 링크 ELC_PERIPHERAL_ADC0 ← ELC_EVENT_${esc(u.elcEvent||'GPT1_COUNTER_OVERFLOW')}. R_ELC_Open · R_ELC_Enable 뒤 R_ADC_ScanStart가 트리거를 켜면 그 이벤트마다 스캔합니다.</p>`:''}<p class="form-hint">스캔 채널: ${scan.join(', ')} (Analog로 정한 핀). hal_entry()에서 R_ADC_Open(&amp;g_adc0_ctrl, &amp;g_adc0_cfg), R_ADC_ScanCfg(&amp;g_adc0_ctrl, &amp;g_adc0_channel_cfg) 후 R_ADC_ScanStart · R_ADC_StatusGet · R_ADC_Read(&amp;g_adc0_ctrl, ADC_CHANNEL_${RA_ADC_CHANNELS[pin]}, &amp;value)로 읽습니다. VREFH0 3.3 V 기준입니다.</p></fieldset>`;
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
     const iicMode=`<label>Mode<select data-ra-iic="mode">${option('MASTER','Master (r_iic_master)',u.mode||'MASTER')}${option('SLAVE','Slave (r_iic_slave)',u.mode||'MASTER')}</select></label>`,rates=`<select data-ra-iic="rate">${Object.keys(RA_IIC_RATES).filter(r=>r!=='FASTPLUS'||ch===0).map(r=>option(r,{STANDARD:'Standard (100 kHz)',FAST:'Fast-mode (400 kHz)',FASTPLUS:'Fast-mode plus (1 MHz)'}[r],u.rate)).join('')}</select>`;
     // Slave mode (r_iic_slave): the address is this board's own, and the callback serves every transfer.
     if(u.mode==='SLAVE'){
      let slaveInfo='';try{const c=raIicSlaveClock(raClockHz(this.draft,'pclkb'),u.rate);slaveInfo=`PCLKB ${raClockHz(this.draft,'pclkb')/1e6} MHz / ${2**c.cks} · ICBRL ${c.brl} (SCL은 마스터가 만듭니다)`;}catch(error){slaveInfo=error.message;}
      html+=`<label>Signal<select data-ra="signal">${signals.map(sg=>option(sg,signalLabel(sg),p.signal)).join('')}</select></label><fieldset><legend>g_i2c_slave${ch} (r_iic_slave · IIC${ch})</legend>${iicMode}<label>Rate${rates}</label><p class="form-hint">${esc(slaveInfo)}</p><label>Slave Address (이 보드의 주소)<input data-ra-iic="slave" value="0x${Number(u.slave).toString(16).padStart(2,'0')}" spellcheck="false"></label><label>Callback<input data-ra-iic="callback" value="${esc(u.callback)}" spellcheck="false"></label><label>Interrupt Priority<select data-ra-iic="priority">${PRIORITIES(u.priority)}</select></label><p class="form-hint">SCL과 SDA를 모두 이 채널로 정합니다(P400/P401은 보드의 2.2 kΩ 풀업${ch===1?' · IIC1의 SCL P205는 보드의 S1 스위치 핀이라 S1을 함께 쓸 수 없습니다':''}). hal_entry()에서 R_IIC_SLAVE_Open(&amp;g_i2c_slave${ch}_ctrl, &amp;g_i2c_slave${ch}_cfg)을 부르면 다른 보드(마스터)가 이 주소로 쓰고 읽을 수 있습니다. 콜백에서 I2C_SLAVE_EVENT_RX_REQUEST에는 R_IIC_SLAVE_Read, TX_REQUEST에는 R_IIC_SLAVE_Write로 버퍼를 주고, RX_COMPLETE · TX_COMPLETE에서 p_args-&gt;bytes로 옮겨진 바이트 수를 받습니다. 7비트 주소 · General Call 사용 안 함 · Clock Stretching 사용.</p></fieldset>`;
     }else
     html+=`<label>Signal<select data-ra="signal">${signals.map(sg=>option(sg,signalLabel(sg),p.signal)).join('')}</select></label><fieldset><legend>g_i2c_master${ch} (r_iic_master · IIC${ch})</legend>${iicMode}<label>Rate<select data-ra-iic="rate">${Object.keys(RA_IIC_RATES).filter(r=>r!=='FASTPLUS'||ch===0).map(r=>option(r,{STANDARD:'Standard (100 kHz)',FAST:'Fast-mode (400 kHz)',FASTPLUS:'Fast-mode plus (1 MHz)'}[r],u.rate)).join('')}</select></label><p class="form-hint">${esc(info)}</p><label>Slave Address<input data-ra-iic="slave" value="0x${u.slave.toString(16).padStart(2,'0')}" spellcheck="false"></label><label>Callback<input data-ra-iic="callback" value="${esc(u.callback)}" spellcheck="false"></label><label>Interrupt Priority<select data-ra-iic="priority">${PRIORITIES(u.priority)}</select></label><p class="form-hint">SCL과 SDA를 모두 이 채널로 정합니다(P400/P401은 보드의 2.2 kΩ 풀업). hal_entry()에서 R_IIC_MASTER_Open(&amp;g_i2c_master${ch}_ctrl, &amp;g_i2c_master${ch}_cfg) 후 R_IIC_MASTER_Write · R_IIC_MASTER_Read를 부르고, 콜백에서 I2C_MASTER_EVENT_TX_COMPLETE · RX_COMPLETE · ABORTED를 받습니다.</p></fieldset>`;
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
     html+=`<label>Signal<select data-ra="signal">${signals.map(sg=>option(sg,signalLabel(sg),p.signal)).join('')}</select></label><fieldset><legend>g_uart${ch} (r_sci_uart · SCI${ch})</legend>${mode}<label>Baud Rate<input type="number" data-ra-sci="baud" min="300" max="2000000" step="1" value="${baud}"></label><p class="form-hint">${esc(rate)} · 8N1</p><label>Priority<select data-ra-sci="priority">${Array.from({length:16},(_,i)=>option(String(i),`Priority ${i}${i===0?' (highest)':i===15?' (lowest)':''}`,String(u.priority??12))).join('')}</select></label><label>Callback<input data-ra-sci="callback" value="${esc(u.callback||`user_uart${ch}_callback`)}" spellcheck="false"></label>${['transferTx','transferRx'].map(k=>`<label>${k==='transferTx'?'Transmit (p_transfer_tx)':'Receive (p_transfer_rx)'}<select data-ra-sci-transfer="${k}">${option('','None (CPU interrupt)',u[k]?'DTC':'')}${option('DTC',`Transfer (r_dtc)${u[k]?` · g_transfer${u[k].slice(8)}`:''}`,u[k]?'DTC':'')}</select></label>`).join('')}<p class="form-hint">hal_entry()에서 R_SCI_UART_Open(&amp;g_uart${ch}_ctrl, &amp;g_uart${ch}_cfg) 후 R_SCI_UART_Write · R_SCI_UART_Read를 부르고, 콜백에서 UART_EVENT_RX_CHAR · UART_EVENT_TX_COMPLETE를 받습니다.</p></fieldset>`;
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
  else if(el.dataset.raSciTransfer){const id=pins[pin]?.signal?.split('_')[0];if(id)this.uartTransfer(id,el.dataset.raSciTransfer,el.value);}
  else if(el.dataset.raSci==='mode'){const id=pins[pin]?.signal?.split('_')[0];if(id)this.sciMode(id,el.value);}
  else if(el.dataset.raSci){const id=pins[pin]?.signal?.split('_')[0];if(!id)return;const u=this.draft.peripherals[id];const v=el.value.trim();u[el.dataset.raSci]=el.dataset.raSci==='callback'?v:Number(v);}
  else if(el.dataset.raAdc){const per=this.draft.peripherals||={},u=(per.ADC0||={enabled:true}),k=el.dataset.raAdc,v=el.value.trim();u[k]=['mode','callback','trigger','elcEvent'].includes(k)?v:Number(v);
   // An ELC start trigger needs the g_elc stack: it comes with the choice (RASC adds the dependency the same way).
   if(k==='trigger'){if(v==='ELC'){u.elcEvent??='GPT1_COUNTER_OVERFLOW';if(!per.ELC?.enabled)per.ELC={enabled:true};}else{delete u.trigger;delete u.elcEvent;}}}
  else if(el.dataset.raIic==='mode'){const id=pins[pin]?.signal?.split('_')[0];if(id)this.iicMode(id,el.value);}
  else if(el.dataset.raIic){const id=pins[pin]?.signal?.split('_')[0];if(!id)return;const u=this.draft.peripherals[id],k=el.dataset.raIic,v=el.value.trim();u[k]=k==='slave'?(/^(0x[0-9a-f]+|\d+)$/i.test(v)?Number(v):NaN):['rate','callback'].includes(k)?v:Number(v);}
  else if(el.dataset.raGpt){const id=pins[pin]?.signal?.split('_')[0];if(!id)return;const u=this.draft.peripherals[id],k=el.dataset.raGpt,v=el.value.trim();u[k]=['mode','unit','callback'].includes(k)?v:Number(v);}
  else if(key){const p=pins[pin];if(!p)return;let v=el.value.trim();if(['initial','priority'].includes(key))v=Number(v);if(key==='label'&&!v)delete p.label;else if(key==='outputType'&&v==='CMOS')delete p.outputType;else p[key]=v;}
  this.syncChannels();
  $('ra-pinout-error').textContent='';try{validateRaMcu(this.draft);}catch(error){$('ra-pinout-error').textContent=error.message;}
  this.render();
 }
 // An IIC channel as a master (r_iic_master) or a slave (r_iic_slave): the default callback name and address follow the
 // mode unless they were changed.
 iicMode(id,mode){
  const ch=id.slice(3),per=this.draft.peripherals||={},u=per[id]={...DEFAULTS.IIC(ch),...per[id]},was=u.mode==='SLAVE'?'slave':'master',now=mode==='SLAVE'?'slave':'master';
  if(was===now)return;
  if(u.callback===`i2c_${was}${ch}_callback`)u.callback=`i2c_${now}${ch}_callback`;
  if(now==='slave'){u.mode='SLAVE';if(u.slave===0x50||u.slave<0x08||u.slave>0x77)u.slave=RA_IIC_SLAVE_ADDRESS;}else{delete u.mode;if(u.slave===RA_IIC_SLAVE_ADDRESS)u.slave=0x50;}
 }
 // New Stack → Connectivity → I2C Slave: the channel's SCL/SDA pins (IIC0: Arduino SCL/SDA) get the signals.
 addIicSlaveStack(id){
  const pins=this.draft.pins,free=q=>!pins[q]&&!RA_RESERVED[q],group=IIC_PIN_GROUPS[id]?.find(g=>Object.keys(g).every(free));
  if(!group){$('ra-pinout-error').textContent=`${id}: 핀(${IIC_PIN_GROUPS[id].map(g=>Object.keys(g).join('·')).join(' 또는 ')})이 다른 기능에 쓰이고 있습니다${id==='IIC1'?' (P205는 보드의 S1 스위치 · IRQ1 핀입니다)':''}. Pins 탭에서 비우세요.`;return;}
  for(const [pin,signal]of Object.entries(group))pins[pin]={function:'Peripheral',signal};
  this.syncChannels();this.iicMode(id,'SLAVE');this.validate();this.renderStacks();
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
  // A UART's transfers go on and off with the UART (they are its sub-stacks).
  for(const [id,u]of Object.entries(per))if(/^SCI\d$/.test(id))for(const k of ['transferTx','transferRx'])if(u?.[k]&&per[u[k]])per[u[k]].enabled=used.has(id)&&u.mode!=='SPI';
  for(const id of Object.keys(per))if(!used.has(id)&&!id.startsWith('AGT')&&!PINLESS.includes(id)&&!isTransfer(id)&&!(id.startsWith('GPT')&&per[id].mode==='PERIODIC'))per[id].enabled=false;
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
   else if(isTransfer(id))list.push({transfer:id});
   else if(id.startsWith('IIC')&&p.mode==='SLAVE')list.push({name:`g_i2c_slave${ch}`,module:'I2C Slave (r_iic_slave)',pin:pinOf(id),info:`${p.rate} · 자기 주소 0x${Number(p.slave??RA_IIC_SLAVE_ADDRESS).toString(16)} · ${p.callback} · R_IIC_SLAVE_Open(&g_i2c_slave${ch}_ctrl, &g_i2c_slave${ch}_cfg)`,remove:id});
   else if(id.startsWith('IIC'))list.push({name:`g_i2c_master${ch}`,module:'I2C Master (r_iic_master)',pin:pinOf(id),info:`${p.rate} · 0x${(p.slave??0x50).toString(16)} · ${p.callback}`});
   else if(id.startsWith('SPI'))list.push({spi:id,name:`g_spi${ch}`,module:'SPI (r_spi)',pin:pinOf(id)});
   else if(id.startsWith('SCI')&&p.mode==='SPI')list.push({spi:id,name:`g_sci_spi${ch}`,module:'SPI (r_sci_spi)',pin:pinOf(id)});
   else if(id.startsWith('SCI'))list.push({name:`g_uart${ch}`,module:'UART (r_sci_uart)',pin:pinOf(id),info:`${p.baud} bps · ${p.callback}`});
   else if(id==='ADC0')list.push({name:'g_adc0',module:'ADC (r_adc)',pin:Object.entries(pins).find(([q,x])=>x.function==='Analog'&&RA_ADC_CHANNELS[q]!=null)?.[0],info:`${p.mode==='CONTINUOUS'?'Continuous':'Single'} Scan · ${p.resolution}-Bit`});
   else if(id.startsWith('GPT')&&p.mode==='PWM')list.push({name:`g_timer${ch}`,module:'Timer, General PWM (r_gpt)',pin:pinOf(id),info:`PWM ${p.period} ${p.unit} · ${p.duty} %`});
   else list.push({id,name:id.startsWith('AGT')?`g_agt${ch}`:`g_timer${ch}`,module:id.startsWith('AGT')?'Timer, Low-Power (r_agt)':'Timer, General PWM (r_gpt) · Periodic',p,edit:true});
  }
  const timerInfo=(id,p)=>{try{if(id.startsWith('AGT')){const c=raAgtCounts(raClockHz(this.draft,'pclkb'),Number(id.slice(3)),p.period,p.unit);return `${c.source}${c.source==='LOCO'?' 32.768 kHz':' '+raClockHz(this.draft,'pclkb')/1e6+' MHz'} / ${c.source==='LOCO'?2**c.div:[1,2,0,8][c.div]} → ${c.counts} counts (${Number(c.hz.toPrecision(6))} Hz)`;}const c=raGptCounts(raClockHz(this.draft),Number(id.slice(3)),p.period,p.unit);return `PCLKD / ${2**c.div} → ${c.counts} counts (${Number(c.hz.toPrecision(6))} Hz)`;}catch(error){return error.message;}};
  const card=s=>s.irq?this.irqCard(s.irq):s.pinless?this.pinlessCard(s.pinless):s.transfer?this.transferCard(s.transfer):s.spi?`<article class="ra-stack" data-ra-spi-stack="${s.spi}"><header><b>${s.name}</b><span>${s.module}</span>${s.pin?`<button type="button" data-ra-goto="${s.pin}">Pins: ${s.pin}</button>`:''}<button type="button" data-ra-spi-remove="${s.spi}">삭제</button></header><div class="ra-stack-fields">${this.spiFields(s.spi,{...SPI_DEFAULTS,...per[s.spi]})}</div></article>`:s.edit?`<article class="ra-stack" data-ra-stack="${s.id}"><header><b>${s.name}</b><span>${s.module}</span><button type="button" data-ra-remove="${s.id}">삭제</button></header><div class="ra-stack-fields"><label>Period<input type="number" data-ra-field="period" min="0" step="any" value="${s.p.period}"></label><label>Unit<select data-ra-field="unit">${RA_TIMER_UNITS.map(u=>`<option value="${u}" ${u===s.p.unit?'selected':''}>${u}</option>`).join('')}</select></label><label>Callback<input data-ra-field="callback" value="${esc(s.p.callback)}" placeholder="NULL" spellcheck="false"></label><label>Priority<select data-ra-field="priority">${PRIORITIES(s.p.priority)}</select></label></div><p class="form-hint">${esc(timerInfo(s.id,s.p))} · R_${s.id.startsWith('AGT')?'AGT':'GPT'}_Open(&amp;${s.name}_ctrl, &amp;${s.name}_cfg) · R_${s.id.startsWith('AGT')?'AGT':'GPT'}_Start(&amp;${s.name}_ctrl)</p></article>`
   :`<article class="ra-stack"${s.remove?` data-ra-iic-stack="${s.remove}"`:''}><header><b>${s.name}</b><span>${s.module}</span>${s.pin?`<button type="button" data-ra-goto="${s.pin}">Pins: ${s.pin}</button>`:''}${s.remove?`<button type="button" data-ra-spi-remove="${s.remove}">삭제</button>`:''}</header><p class="form-hint">${esc(s.info)}</p></article>`;
  const iicFree=RA_IIC_CHANNELS.map(ch=>'IIC'+ch).filter(id=>!per[id]?.enabled);
  const free=[...RA_AGT_CHANNELS.map(ch=>'AGT'+ch),...RA_GPT_CHANNELS.map(ch=>'GPT'+ch)].filter(id=>!per[id]?.enabled);
  const spiFree=[...RA_SPI_CHANNELS.map(ch=>['SPI'+ch,`SPI (r_spi) · SPI${ch}`]),...RA_SCI_SPI_CHANNELS.map(ch=>['SCI'+ch,`SPI (r_sci_spi) · SCI${ch} Simple SPI`])].filter(([id])=>!per[id]?.enabled);
  $('ra-stacks').innerHTML=`<div class="ra-stack-new"><label>New Stack<select id="ra-stack-add"><optgroup label="Input"><option value="IRQ">External IRQ (r_icu)</option></optgroup>${spiFree.length||iicFree.length?`<optgroup label="Connectivity">${spiFree.map(([id,l])=>`<option value="${id}" data-ra-spi-add>${l}</option>`).join('')}${iicFree.map(id=>`<option value="${id}" data-ra-iic-slave-add>I2C Slave (r_iic_slave) · ${id}</option>`).join('')}</optgroup>`:''}<optgroup label="Timers">${free.map(id=>`<option value="${id}">${id.startsWith('AGT')?`Timer, Low-Power (r_agt) · AGT${id.slice(3)}`:`Timer, General PWM (r_gpt) · GPT${id.slice(3)} Periodic`}</option>`).join('')}</optgroup>${PINLESS_GROUPS.map(([label,ids])=>ids.some(id=>!per[id]?.enabled)?`<optgroup label="${label}">${ids.filter(id=>!per[id]?.enabled).map(id=>`<option value="${id}">${STACK_NAMES[id][1]}</option>`).join('')}</optgroup>`:'').join('')}<optgroup label="Transfer"><option value="DTC" data-ra-transfer-add>Transfer (r_dtc)</option><option value="DMAC" data-ra-transfer-add>Transfer (r_dmac)</option></optgroup></select></label><button type="button" data-ra-add>추가</button></div>${list.length?list.map(card).join(''):'<p class="form-hint">스택이 없습니다. New Stack으로 External IRQ · SPI · 타이머를 넣거나, Pins 탭에서 핀 기능을 정하세요.</p>'}`;
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
    +`<label>NMI Callback<input data-ra-field="callback" value="${esc(q.reset==='NMI'?q.callback:'')}" placeholder="NULL" spellcheck="false"${q.reset==='NMI'?'':' disabled title="Reset Output에서는 콜백이 없습니다(FSP: p_callback이 NULL이어야 R_'+id+'_Open이 성공). NMI Generated로 바꾸면 쓸 수 있습니다."'}></label>`;
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
  if(id==='FLASH'){
   const q={...RA_FLASH_DEFAULTS,...p},saved=dataFlashUsed(this.getProject().dataFlash);
   fields=`<label>Code Flash Programming<input value="Disabled" readonly title="시뮬레이터는 데이터 플래시만 프로그램합니다(r_flash_hp_cfg.h FLASH_HP_CFG_CODE_FLASH_PROGRAMMING_ENABLE 0)"></label><label>Data Flash Programming<input value="Enabled" readonly></label>`
    +`<label>Data Flash Background Operation${sel('bgo',[[0,'Disabled'],[1,'Enabled']],q.bgo?1:0)}</label>`
    +`<label>Callback<input data-ra-field="callback" value="${esc(q.bgo?q.callback:'')}" placeholder="NULL" spellcheck="false"${q.bgo?'':' disabled title="Background Operation이 Disabled면 r_flash_hp가 콜백을 부르지 않습니다(R_FLASH_HP_Open이 콜백을 받지 않음). Enabled로 바꾸면 쓸 수 있습니다."'}></label>`
    +(q.bgo?`<label>Flash Ready Interrupt Priority<select data-ra-field="readyPriority">${PRIORITIES(q.readyPriority)}</select></label><label>Flash Error Interrupt Priority<select data-ra-field="errorPriority">${PRIORITIES(q.errorPriority)}</select></label>`:'');
   hint=`데이터 플래시: ${hexAddr(RA_DF_BASE)}~${hexAddr(RA_DF_BASE+RA_DF_SIZE-1)} (${RA_DF_SIZE/1024} KB) · 지우기 블록 ${RA_DF_BLOCK}바이트 · 쓰기 단위 ${RA_DF_UNIT}바이트. R_FLASH_HP_Open(&amp;${name}_ctrl, &amp;${name}_cfg) 뒤 R_FLASH_HP_Erase(&amp;${name}_ctrl, 주소, 블록 수)로 지운 곳에만 R_FLASH_HP_Write(&amp;${name}_ctrl, (uint32_t) 버퍼, 주소, 바이트 수)로 쓸 수 있습니다(지우지 않고 다시 쓰면 FSP_ERR_WRITE_FAILED). 읽기는 주소를 포인터로 — *(uint32_t *) ${hexAddr(RA_DF_BASE)}. 지운 곳을 읽은 값은 실제 칩에서 정해지지 않으니, 썼는지는 R_FLASH_HP_BlankCheck로 확인하세요. `
    +(q.bgo?`Background Operation: 호출이 바로 돌아오고 끝나면 ${esc(q.callback||'콜백(R_FLASH_HP_CallbackSet)')}이 FLASH_EVENT_ERASE_COMPLETE · WRITE_COMPLETE · BLANK · NOT_BLANK · ERR_FAILURE로 불립니다. 그동안 데이터 플래시는 읽지 못합니다. `:'Background Operation 없이는 호출이 끝날 때까지 기다립니다(인터럽트 없음). ')
    +`내용은 MCU 리셋에도, 실행을 멈췄다 다시 실행해도 남습니다(프로젝트에 저장).</p><p class="form-hint" data-ra-flash-saved>프로젝트에 저장된 데이터 플래시: ${saved?`${saved}바이트`:'없음(모두 지워진 상태)'} <button type="button" data-ra-flash-clear${saved?'':' disabled'}>데이터 플래시 지우기</button>`;
  }
  if(id==='ELC'){
   const adc=this.draft.peripherals?.ADC0,cur=adc?.trigger==='ELC'?adc.elcEvent||'GPT1_COUNTER_OVERFLOW':'';
   fields=`<label>ELC_PERIPHERAL_ADC0 (ADC0 Start)<select data-ra-elc-adc>${option('','No allocation',cur)}${Object.keys(RA_ELC_EVENTS).filter(k=>k!=='ADC0_SCAN_END').map(k=>option(k,EVENT_LABEL(k),cur)).join('')}</select></label>`;
   hint=`g_elc_cfg (ra_gen/elc_data.c)의 링크: ${cur?`ADC0 ← ${esc(cur)}`:'없음'}. 링크된 이벤트는 CPU 인터럽트 없이 주변장치를 바로 움직입니다(예: GPT1 주기 → ADC0 스캔 시작). R_ELC_Open(&amp;g_elc_ctrl, &amp;g_elc_cfg) · R_ELC_Enable(&amp;g_elc_ctrl) 뒤에 동작하고, R_ELC_LinkSet · LinkBreak로 바꾸며, R_ELC_SoftwareEventGenerate(&amp;g_elc_ctrl, ELC_SOFTWARE_EVENT_0)는 코드에서 이벤트를 냅니다. 시뮬레이터가 받는 쪽은 ADC0 스캔 시작이고(그룹 A), GPT 시작·정지 · ADC 그룹 B · I/O 포트 링크는 실행 로그에 안내만 남깁니다.${adc?.enabled?'':' ADC0은 Pins에서 AN 핀을 Analog로 정하면 켜집니다.'}`;
  }
  if(id==='LPM'){
   const q={...RA_LPM_DEFAULTS,...p},pins=this.draft.pins,irqPin=ch=>Object.keys(pins).find(x=>pins[x].function==='IRQ'&&RA_IRQ_PINS[x]===ch);
   const check=(list,value,label,on)=>`<label class="ra-lpm-check"><input type="checkbox" data-ra-lpm="${list}" value="${value}" ${on?'checked':''}>${esc(label)}</label>`;
   fields=`<label>Low Power Mode${sel('mode',RA_LPM_MODES.map(m=>[m,`${RA_LPM_MODE_NAMES[m]} mode`]),q.mode)}</label>`;
   if(q.mode==='STANDBY'){
    // The IRQ channels that have an External IRQ stack (others have no interrupt to wake with), and what is already chosen.
    const names=RA_LPM_WAKE.filter(n=>{const m=/^IRQ(\d+)$/.exec(n);return !m||q.wake.includes(n)||irqPin(Number(m[1]));});
    fields+=`<div class="ra-lpm-list" data-ra-lpm-wake><span>Wake Sources (WUPEN)</span>${names.map(n=>{const m=/^IRQ(\d+)$/.exec(n),pin=m&&irqPin(Number(m[1]));return check('wake',n,m?`${n}${pin?` · ${pin}`:' · External IRQ 스택 없음'}`:lpmWakeLabel(n),q.wake.includes(n));}).join('')}</div>`;
   }
   if(q.mode==='DEEP'){
    fields+=`<label>I/O Port Retention${sel('ioKeep',[[1,'Maintain the IO port states (IOKEEP)'],[0,'Do not maintain (reset state)']],q.ioKeep?1:0)}</label><label>Power-Supply Control${sel('power',[['DEEPCUT0','DEEPCUT0 · LOCO · AGT 전원 유지'],['DEEPCUT1','DEEPCUT1 · LOCO · AGT 전원 끔'],['DEEPCUT3','DEEPCUT3 · LOCO · AGT 끔, LVD 끔']],q.power)}</label>`
     +`<div class="ra-lpm-list" data-ra-lpm-cancel><span>Cancel Sources (DPSIER)</span>${RA_LPM_CANCEL.map(n=>check('cancel',n,lpmCancelLabel(n),q.cancel.includes(n))).join('')}</div>`
     +q.cancel.filter(n=>/^IRQ/.test(n)).map(n=>`<label>${n}-DS Edge<select data-ra-lpm-edge="${n}">${option('FALLING','Falling',q.cancelRising.includes(n)?'RISING':'FALLING')}${option('RISING','Rising',q.cancelRising.includes(n)?'RISING':'FALLING')}</select></label>`).join('');
   }
   const notes=[];
   // An AGT source needs its stack, and a count source that runs in the mode (LOCO: the period decides, raAgtCounts).
   const agtNote=(n,mode)=>{const t=this.draft.peripherals?.['AGT'+n];let source='';try{source=t?.enabled?raAgtCounts(raClockHz(this.draft,'pclkb'),Number(n),t.period,t.unit).source:'';}catch{source='';}
    if(!t?.enabled)notes.push(`AGT${n} 스택이 없습니다(New Stack → Timers).`);else if(source!=='LOCO')notes.push(`AGT${n}은 PCLKB로 세어 ${mode}에서 멈춥니다 — 주기를 ${Number((65536*8/raClockHz(this.draft,'pclkb')*1000).toFixed(1))} ms보다 길게 정해 LOCO로 세게 하세요.`);};
   if(q.mode==='SLEEP')notes.push('CPU만 멈추고 주변장치는 계속 동작합니다. 켜 둔 인터럽트가 깨웁니다.');
   if(q.mode==='STANDBY'){
    notes.push('클록이 멈춥니다(GPT · PCLKB로 세는 AGT · WDT · SCI 등). RTC와 LOCO로 세는 AGT는 계속 돕니다. 고른 소스의 인터럽트만 깨우며, 그 인터럽트가 켜져 있어야 합니다.');
    if(!q.wake.length)notes.push('깨우는 소스가 없습니다 — 리셋으로만 깨어납니다.');
    for(const n of q.wake){const m=/^AGT(\d)UD$/.exec(n);if(m)agtNote(m[1],'Software Standby');}
    if(q.wake.some(n=>/^RTC/.test(n))&&!this.draft.peripherals?.RTC?.enabled)notes.push('RTC 스택이 없습니다(New Stack → Realtime Clock).');
   }
   if(q.mode==='DEEP'){
    notes.push('해제 소스가 오면 MCU가 리셋되어 처음부터 다시 실행됩니다(R_SYSTEM-&gt;RSTSR0_b.DPSRSTF가 1). 핀으로는 IRQn-DS 핀만 해제합니다.');
    notes.push(q.ioKeep?'I/O 포트 상태는 리셋 뒤에도 그대로이고 R_LPM_IoKeepClear(NULL)를 부를 때 풀립니다.':'해제되면 I/O 포트는 리셋 상태가 됩니다.');
    if(!q.cancel.length)notes.push('해제 소스가 없습니다 — 리셋으로만 깨어납니다.');
    for(const n of q.cancel){const m=/^IRQ(\d+)$/.exec(n);if(!m)continue;const ch=Number(m[1]),used=irqPin(ch),ds=raDsPin(ch);if(used&&used!==ds)notes.push(`IRQ${ch} 스택은 ${used}(IRQ${ch})에 있습니다 — Deep Software Standby는 IRQ${ch}-DS 핀 ${ds}의 엣지로만 해제됩니다.`);}
    for(const n of q.cancel){const m=/^AGT(\d)$/.exec(n);if(m)agtNote(m[1],'Deep Software Standby');}
    if(q.power!=='DEEPCUT0'&&q.cancel.some(n=>/^(RTC|AGT)/.test(n)))notes.push(`${q.power}에서는 LOCO와 AGT 전원이 꺼집니다 — LOCO로 세는 RTC와 AGT는 해제하지 못합니다.`);
    if(q.cancel.some(n=>/^RTC/.test(n))&&!this.draft.peripherals?.RTC?.enabled)notes.push('RTC 스택이 없습니다(New Stack → Realtime Clock).');
   }
   hint=`${notes.join(' ')} R_LPM_Open(&amp;g_lpm0_ctrl, &amp;g_lpm0_cfg) · R_LPM_LowPowerModeEnter(&amp;g_lpm0_ctrl). 다른 모드는 코드에서 lpm_cfg_t를 만들어 R_LPM_LowPowerReconfigure로 바꿉니다. 진입과 깨어남은 실행 로그(LPM)에 남습니다.`;
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
  const stacks=['g_ioport (r_ioport)',...Object.entries(pins).filter(([,p])=>p.function==='IRQ').map(([q])=>`g_external_irq${RA_IRQ_PINS[q]} (r_icu)`),...Object.entries(per).filter(([,p])=>p.enabled).map(([id,p])=>{const n=id.replace(/\D/g,'');return STACK_NAMES[id]?`${STACK_NAMES[id][0]} (${STACK_NAMES[id][1].match(/\((.+)\)/)[1]})`:isTransfer(id)?`g_transfer${n} (r_${p.driver==='DMAC'?'dmac':'dtc'})`:id.startsWith('SCI')?(p.mode==='SPI'?`g_sci_spi${n} (r_sci_spi)`:`g_uart${n} (r_sci_uart)`):id.startsWith('SPI')?`g_spi${n} (r_spi)`:id.startsWith('GPT')?`g_timer${n} (r_gpt)`:id.startsWith('AGT')?`g_agt${n} (r_agt)`:id.startsWith('IIC')?(p.mode==='SLAVE'?`g_i2c_slave${n} (r_iic_slave)`:`g_i2c_master${n} (r_iic_master)`):'g_adc0 (r_adc)';})];
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
  if(el.dataset.raTransferField){this.transferValue(el);this.validate();this.renderStacks();return;}
  if(el.dataset.raElcAdc!==undefined){const per=this.draft.peripherals||={};if(el.value){per.ADC0={mode:'SINGLE',resolution:12,callback:'',priority:12,...per.ADC0,enabled:per.ADC0?.enabled??false,trigger:'ELC',elcEvent:el.value};}else if(per.ADC0){delete per.ADC0.trigger;delete per.ADC0.elcEvent;}this.validate();this.renderStacks();return;}
  const id=el.closest('[data-ra-stack]')?.dataset.raStack;
  // Low Power Modes: the source check boxes and the edge of an IRQn-DS source.
  if(id==='LPM'&&(el.dataset.raLpm||el.dataset.raLpmEdge)){
   const q=this.draft.peripherals.LPM,set=(key,name,on)=>{q[key]=(q[key]||[]).filter(x=>x!==name);if(on)q[key].push(name);};
   if(el.dataset.raLpm){set(el.dataset.raLpm,el.value,el.checked);if(el.dataset.raLpm==='cancel'&&!el.checked)set('cancelRising',el.value,false);}
   else set('cancelRising',el.dataset.raLpmEdge,el.value==='RISING');
   this.validate();this.renderStacks();return;
  }
  const k=el.dataset.raField;if(!id||!k)return;
  const v=el.value.trim(),q=this.draft.peripherals[id];
  if(['unit','callback','startMode','reset','clockSource','start','mode','power'].includes(k))q[k]=v;
  else if(k==='stopInSleep'||k==='ioKeep'||k==='bgo')q[k]=v==='1';
  else if(/Priority$/.test(k)&&v==='')q[k]=null;
  else q[k]=Number(v);
  // A watchdog's callback goes with the NMI output: a default name when NMI is chosen, none with Reset.
  if(k==='reset'&&RA_WDT[id]){if(v==='NMI'&&!q.callback)q.callback=id.toLowerCase()+'_nmi_callback';if(v==='RESET')q.callback='';}
  // The flash callback goes with background operation, the same way.
  if(k==='bgo'&&id==='FLASH'){if(q.bgo&&!q.callback)q.callback='flash_callback';if(!q.bgo)q.callback='';}
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
  if(el.closest('[data-ra-add]')&&$('ra-stack-add').selectedOptions[0]?.hasAttribute('data-ra-transfer-add')){const id=this.newTransfer($('ra-stack-add').value);this.validate();this.renderStacks();document.querySelector(`#ra-stacks [data-ra-transfer="${id}"]`)?.scrollIntoView?.({block:'nearest'});return;}
  const transferGone=el.closest('[data-ra-transfer-remove]')?.dataset.raTransferRemove;
  if(transferGone){delete per[transferGone];for(const u of Object.values(per))for(const k of ['transferTx','transferRx'])if(u?.[k]===transferGone)delete u[k];this.validate();this.renderStacks();return;}
  const spiGone=el.closest('[data-ra-spi-remove]')?.dataset.raSpiRemove;
  if(spiGone){for(const [pin,p]of Object.entries(this.draft.pins))if(p.function==='Peripheral'&&p.signal.startsWith(spiGone+'_'))delete this.draft.pins[pin];delete per[spiGone];this.validate();this.renderStacks();return;}
  if(el.closest('[data-ra-add]')&&$('ra-stack-add').selectedOptions[0]?.hasAttribute('data-ra-spi-add'))return this.addSpiStack($('ra-stack-add').value);
  if(el.closest('[data-ra-add]')&&$('ra-stack-add').selectedOptions[0]?.hasAttribute('data-ra-iic-slave-add'))return this.addIicSlaveStack($('ra-stack-add').value);
  if(el.closest('[data-ra-add]')&&RA_WDT[$('ra-stack-add').value]){const id=$('ra-stack-add').value;per[id]=WDT_DEFAULTS(id);this.validate();this.renderStacks();return;}
  if(el.closest('[data-ra-add]')&&$('ra-stack-add').value==='RTC'){per.RTC={enabled:true,...RA_RTC_DEFAULTS};this.validate();this.renderStacks();return;}
  if(el.closest('[data-ra-add]')&&$('ra-stack-add').value==='FLASH'){per.FLASH={enabled:true,...RA_FLASH_DEFAULTS};this.validate();this.renderStacks();return;}
  // The saved data flash contents are the project's, not this dialog's draft: erased at once (undo brings them back).
  if(el.closest('[data-ra-flash-clear]')){this.clearDataFlash?.();this.renderStacks();return;}
  if(el.closest('[data-ra-add]')&&$('ra-stack-add').value==='LPM'){
   // The External IRQ stacks there are become the first sources: every one wakes Software Standby, the ones on an
   // IRQn-DS pin cancel Deep Software Standby (the board's S1 on P205 is IRQ1-DS).
   const irqs=Object.keys(this.draft.pins).filter(q=>this.draft.pins[q].function==='IRQ');
   per.LPM={enabled:true,...RA_LPM_DEFAULTS,wake:irqs.map(q=>'IRQ'+RA_IRQ_PINS[q]).filter(n=>RA_LPM_WAKE.includes(n)),cancel:irqs.filter(q=>RA_IRQ_DS.includes(q)).map(q=>'IRQ'+RA_IRQ_PINS[q]).filter(n=>RA_LPM_CANCEL.includes(n)),cancelRising:[]};
   this.validate();this.renderStacks();return;
  }
  if(el.closest('[data-ra-add]')){const id=$('ra-stack-add').value;if(!id)return;per[id]=id.startsWith('AGT')?{enabled:true,period:100,unit:'ms',callback:`agt${id.slice(3)}_callback`,priority:12}:{enabled:true,mode:'PERIODIC',period:100,unit:'ms',duty:50,callback:`gpt${id.slice(3)}_callback`,priority:12};this.validate();this.renderStacks();return;}
  const rm=el.closest('[data-ra-remove]')?.dataset.raRemove;if(rm){delete per[rm];if(rm==='ELC'&&per.ADC0?.trigger==='ELC'){delete per.ADC0.trigger;delete per.ADC0.elcEvent;}this.validate();this.renderStacks();return;}
  const go=el.closest('[data-ra-goto]')?.dataset.raGoto;if(go){this.pin=go;this.tab='pins';this.render();}
 }
 // ---- Transfers (feature 36): New Stack → Transfer, and a UART's transmit / receive transfer.
 newTransfer(driver,extra={}){
  const per=this.draft.peripherals||={};let n=0;while(per['TRANSFER'+n])n++;
  const used=new Set(Object.values(per).filter(t=>t?.driver==='DMAC').map(t=>t.channel)),channel=RA_DMAC_CHANNELS.find(c=>!used.has(c))??0;
  // A DTC needs an event with a vector: the first one this configuration has (the ADC scan end, a timer, an IRQ pin).
  const events=raTransferEvents(driver),activation=driver==='DMAC'?'SOFTWARE':events.find(ev=>raEventHasVector(this.draft,ev))??'ADC0_SCAN_END';
  per['TRANSFER'+n]={enabled:true,...RA_TRANSFER_DEFAULTS,driver,activation,...(driver==='DMAC'?{channel,srcMode:'INCREMENTED',size:1,length:1}:{}),callback:'',...extra};
  if(driver!=='DMAC')delete per['TRANSFER'+n].channel;
  return 'TRANSFER'+n;
 }
 uartTransfer(id,key,value){
  const per=this.draft.peripherals||={},u=per[id];if(!u)return;
  if(u[key]){delete per[u[key]];delete u[key];}
  if(value==='DTC')u[key]=this.newTransfer('DTC',{activation:`${id}_${key==='transferTx'?'TXI':'RXI'}`});
 }
 transferValue(el){
  const id=el.dataset.raTransferId,k=el.dataset.raTransferField,q=this.draft.peripherals?.[id];if(!q)return;const v=el.value.trim();
  q[k]=['activation','mode','srcMode','destMode','repeatArea','irq','callback'].includes(k)?v:Number(v);
 }
 transferCard(id){
  const p={...RA_TRANSFER_DEFAULTS,...this.draft.peripherals[id]},g=`g_transfer${id.slice(8)}`,dmac=p.driver==='DMAC',api=dmac?'DMAC':'DTC';
  const owner=Object.entries(this.draft.peripherals).find(([k,u])=>/^SCI\d$/.test(k)&&u?.enabled&&(u.transferTx===id||u.transferRx===id));
  const option=(value,label,cur)=>`<option value="${value}" ${String(value)===String(cur)?'selected':''}>${label}</option>`;
  const sel=(k,values)=>`<select data-ra-transfer-field="${k}" data-ra-transfer-id="${id}">${values.map(([v,l])=>option(v,l,p[k])).join('')}</select>`;
  const num=(k,min,max)=>`<input type="number" data-ra-transfer-field="${k}" data-ra-transfer-id="${id}" min="${min}" max="${max}" step="1" value="${p[k]}">`;
  const addr=RA_TRANSFER_ADDR_MODES.map(m=>[m,{FIXED:'Fixed',INCREMENTED:'Incremented',DECREMENTED:'Decremented'}[m]]);
  let fields,hint;
  if(owner){
   const [uart,u]=owner,tx=u.transferTx===id;
   fields=`<label>Activation Source<input value="${uart} ${tx?'TXI':'RXI'}" readonly title="r_sci_uart이 정합니다"></label><label>Mode<input value="Normal · 1 Byte · ${tx?'Source Incremented → TDR':'RDR → Destination Incremented'}" readonly></label>`;
   hint=`g_uart${uart.slice(3)}의 ${tx?'송신':'수신'} 전송입니다. R_SCI_UART_Open이 이 DTC를 열고, ${tx?'R_SCI_UART_Write는 첫 바이트만 CPU가 쓰고 나머지는 TXI마다 DTC가 TDR로 옮깁니다. 마지막 바이트를 옮기면 TX_DATA_EMPTY, 다 보내면 TX_COMPLETE가 옵니다.':'R_SCI_UART_Read의 버퍼로 RXI마다 DTC가 RDR을 옮기고, 다 받으면 RX_COMPLETE가 옵니다.'} Pins의 ${uart} 카드에서 None으로 바꾸면 없어집니다.`;
  }else{
   const events=raTransferEvents(p.driver);
   fields=(dmac?`<label>Channel${sel('channel',RA_DMAC_CHANNELS.map(c=>[c,'Channel '+c]))}</label>`:'')
    +`<label>Activation Source${sel('activation',events.map(ev=>[ev,EVENT_LABEL(ev)+(!dmac&&!raEventHasVector(this.draft,ev)?' (벡터 없음)':'')]))}</label>`
    +`<label>Mode${sel('mode',RA_TRANSFER_MODES.map(m=>[m,{NORMAL:'Normal',REPEAT:'Repeat',BLOCK:'Block'}[m]]))}</label><label>Transfer Size${sel('size',[[1,'1 Byte'],[2,'2 Bytes'],[4,'4 Bytes']])}</label>`
    +`<label>Source Address Mode${sel('srcMode',addr)}</label><label>Destination Address Mode${sel('destMode',addr)}</label>`
    +(p.mode!=='NORMAL'?`<label>Repeat Area (Unused in Normal Mode)${sel('repeatArea',[['SOURCE','Source'],['DESTINATION','Destination']])}</label>`:'')
    +`<label>Interrupt Frequency${sel('irq',[['END','After all transfers have completed'],['EACH','After each transfer']])}</label>`
    +`<label>Number of Transfers${num('length',0,p.mode==='NORMAL'?65535:dmac?1024:256)}</label>`+(p.mode!=='NORMAL'?`<label>Number of Blocks${num('blocks',0,65535)}</label>`:'')
    +(dmac?`<label>Callback<input data-ra-transfer-field="callback" data-ra-transfer-id="${id}" value="${esc(p.callback)}" placeholder="NULL" spellcheck="false"></label>${p.callback?`<label>Transfer End Interrupt Priority${sel('priority',Array.from({length:16},(_,i)=>[i,`Priority ${i}`]))}</label>`:''}`:'');
   const mode={NORMAL:'한 번 활성화될 때마다 1단위, Number of Transfers만큼 옮기면 끝',REPEAT:'1단위씩 옮기고 Number of Transfers마다 반복 영역 주소가 처음으로 돌아감(끝나지 않음)'+(dmac?' — DMAC는 Number of Blocks번 반복 뒤 끝':''),BLOCK:'활성화마다 Number of Transfers 단위(한 블록)를 옮기고 Number of Blocks 블록 뒤 끝'}[p.mode];
   hint=`${mode}. R_${api}_Open(&amp;${g}_ctrl, &amp;${g}_cfg) 뒤 R_${api}_Reset(&amp;${g}_ctrl, 소스, 목적지, 횟수)가 주소와 횟수를 정하고 전송을 켭니다. `
    +(dmac?(p.activation==='SOFTWARE'?`R_DMAC_SoftwareStart(&amp;${g}_ctrl, TRANSFER_START_MODE_REPEAT)로 시작합니다. `:`${esc(p.activation)} 이벤트마다 움직입니다(DELSR). `)+(p.callback?`끝나면 ${esc(p.callback)}(dmac_int_isr)이 불립니다.`:'콜백 이름을 쓰면 끝 인터럽트가 켜집니다.')
     :`${esc(p.activation)} 인터럽트를 DTC가 가로채 전송하고, 전송이 끝나면(또는 매번) 그 인터럽트가 CPU로 가 원래 스택의 콜백이 불립니다. ADC 결과는 R_ADC_InfoGet의 p_address에서 읽습니다.`);
  }
  return `<article class="ra-stack" data-ra-transfer="${id}"><header><b>${g}</b><span>Transfer (r_${api.toLowerCase()})</span>${owner?'':`<button type="button" data-ra-transfer-remove="${id}">삭제</button>`}</header><div class="ra-stack-fields">${fields}</div><p class="form-hint">${hint}</p></article>`;
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
