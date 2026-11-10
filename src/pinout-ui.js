import {isTimer,isBasicTimer,timerIrq,timerMax,TIMER_MODES} from './timer-config.js';
import {timerDefaults} from './mcu-defaults.js';
import {GPIO_PINS} from './pins.js';
import {MODES,ROUTES,defaultMcu,validateMcu,configProblems,pinFunctions,irqForPin,IRQ_NAMES,generateHal,USART_CK_ROUTES,DMA_MODES,DMA_PRIORITIES,dmaPeripheral,dmaDirection} from './mcu-config.js';
import {DMA_REQUESTS} from './hal-dma.js';
import {expandC} from './c-format.js';
import {keepUserCode,dropShadowedHandlers} from './c-source-edit.js';
// What the project's current settings generate: sections still equal to it were never edited.
const previousDefault=mcu=>{try{return expandC(generateHal(mcu));}catch{return '';}};
import {isSerial,serialAf,serialFunction,assignSerialPin,setSerialEnabled} from './serial-config.js';
import {familyProfile,routesOf,irqNamesOf} from './mcu-family.js';
import {renderClockPanel} from './clock-ui.js';
import {clockTreeOf,clockFrequencies} from './clock-tree.js';
import {ADC_SAMPLING,adcSamplingOf} from './mcu-config.js';
// ADC1 Rank 1 Sampling Time and the conversion time it gives at the current ADC clock (sampling + 12 / 12.5 cycles).
function adcSamplingField(config,c){
  const f1=config.family==='STM32F103RB',now=adcSamplingOf(config);let adcHz=null;try{adcHz=clockFrequencies(config.family,clockTreeOf(config)).adc;}catch{}
  const us=adcHz?(now+(f1?12.5:12))/adcHz*1e6:null;
  return `<label>Sampling Time (Rank 1)<select data-adc-sampling aria-label="ADC1 Sampling Time" ${c.enabled?'':'disabled'}>${ADC_SAMPLING[config.family].map(v=>`<option value="${v}" ${v===now?'selected':''}>${v} Cycles</option>`).join('')}</select></label><small class="serial-mode-note">${us?`한 번 변환 ${Number(us.toFixed(2))} µs (ADC 클록 ${Number((adcHz/1e6).toFixed(3))} MHz). `:''}가변저항처럼 출력 저항이 큰 입력은 긴 시간을 고르세요.</small>`;
}
import {dmaRequestsOf,UART_PARAMS,SPI_PARAMS,timChannelParams} from './mcu-config.js';
import {counterModeField,timerChannelsField,basicTimerField} from './timer-ui.js';
import {rtcFields,bindRtc} from './rtc-ui.js';
import {dacFields,bindDac} from './dac-ui.js';
import {wdgFields,bindWdg} from './wdg-ui.js';
import {projectBoard} from './boards.js';
import {$,esc} from './common.js';
import {IRQ_NUMBERS} from './hal-nvic.js';
import {SYSTEM_IRQS,irqLabel,peripheralIrqs,irqAvailable,dmaForced,nvicGroup,tickPriority,priorityLimits,NVIC_GROUP_DEFAULT} from './nvic-config.js';
import {speedsOf,SPEED_NAMES,defaultSpeed,gpioMode,hasSpeed,signalName} from './gpio-config.js';
const PULL_NAMES={NOPULL:'No pull-up and no pull-down',PULLUP:'Pull-up',PULLDOWN:'Pull-down'};
const EDGE_NAMES={RISING:'External Interrupt Mode with Rising edge trigger detection',FALLING:'External Interrupt Mode with Falling edge trigger detection',CHANGE:'External Interrupt Mode with Rising/Falling edge trigger detection'};
const MODE_NAMES={OUTPUT_PP:'Output Push Pull',OUTPUT_OD:'Output Open Drain',INPUT:'Input mode',ANALOG:'Analog mode',AF_PP:'Alternate Function Push Pull',AF_OD:'Alternate Function Open Drain'};
const RESET_PIN={function:'Reset',pull:'NOPULL',edge:'RISING',label:'',initial:0};
// System Core › SYS: the NUCLEO's ST-LINK talks SWD, so Debug is Serial Wire (PA13/PA14) and the HAL time base is SysTick.
const SYS_PINS={PA13:'SYS_JTMS-SWDIO',PA14:'SYS_JTCK-SWCLK'};
const sysSignal=(config,pin)=>SYS_PINS[pin]&&['Reset','Reserved',undefined].includes(config.pins[pin]?.function)?SYS_PINS[pin]:null;
const DEBUG_MODES=['No Debug','Trace Asynchronous Sw','JTAG (4 pins)','JTAG (5 pins)','Serial Wire'];
// F1: TX and RX of a USART move together with its AFIO remap, so choosing one moves the other to the same group.
function alignSerialRemap(config,id,pin){
  const option=familyProfile(config.family).remaps?.[id]?.find(o=>Object.values(o.pins).includes(pin));if(!option)return;
  for(const [signal,target]of Object.entries(option.pins)){
    if(target===pin)continue;const fn=`${id}_${signal}`,current=Object.keys(config.pins).find(p=>config.pins[p].function===fn),free=!config.pins[target]||config.pins[target].function==='Reset';
    // CK only follows when it is in use (synchronous mode); TX/RX partners are moved, or added when missing.
    if(signal==='CK'&&!current)continue;
    if(current&&current!==target&&free){config.pins[target]={...config.pins[current]};config.pins[current]={...config.pins[current],function:'Reset',label:''};}
    else if(!current&&free)config.pins[target]={function:fn,pull:'NOPULL',edge:'FALLING',initial:0,label:''};
  }
}
const numberInput=el=>el.value.trim()===''?NaN:Number(el.value);
const numberText=value=>Number.isFinite(value)?value:'';
const timerHint=(id,c,max=timerMax(id))=>`${isBasicTimer(id)?`기본 타이머(채널·핀 없음, Up 카운터, 인터럽트 ${timerIrq(id)}) · `:''}${max===65535?'16':'32'}비트 · 초기 ARR ${max}${c.period===0?' · ARR=0: 카운터 정지':''}`;
export class PinoutPanel {
  constructor({getProject,apply,isRunning,onError}){
    Object.assign(this,{getProject,apply,isRunning,onError});this.pin='PA5';
    $('pinout-open').onclick=()=>this.open();$('pinout-close').onclick=()=>$('pinout-dialog').close();
    // NVIC, numeric fields and pin properties re-render nothing: refresh the problem list (this bubbling listener runs after their own onchange).
    $('pinout-dialog').addEventListener('change',e=>{if(!e.target.matches('[data-irq],[data-priority],[data-sub],[data-peripheral-value],#timer-clock,#pin-label,#pin-pull,#pin-edge,#pin-level,#pin-speed,#pin-otype'))return;
      if(e.target.matches('#pin-label,#pin-pull,#pin-edge,#pin-level,#pin-speed,#pin-otype'))this.sync();try{$('pinout-errors').textContent=configProblems(this.draft).join('\n');}catch{}});
    // Right column: pin settings or the NVIC table (CubeMX System Core > NVIC).
    $('pinout-dialog').querySelectorAll('[data-side-tab]').forEach(b=>b.onclick=()=>this.showSide(b.dataset.sideTab));
    $('nvic-show').onchange=()=>this.renderNvic();$('nvic-search').oninput=()=>this.renderNvic();
    // A new group narrows the ranges: priorities above them (the time base's 15 too) become the new maximum.
    $('nvic-group').onchange=()=>{const d=this.draft;d.nvicGroup=Number($('nvic-group').value);const lim=priorityLimits(d.nvicGroup);
      for(const n of Object.values(d.nvic)){n.priority=Math.min(n.priority,lim.preempt);if(n.sub!==undefined){n.sub=Math.min(n.sub,lim.sub);if(!n.sub)delete n.sub;}}
      if(tickPriority(d)>lim.preempt)d.tickPriority=lim.preempt;this.render();};
    // The pin click menu (CubeMX): Esc or a click elsewhere closes it, not the dialog.
    $('pin-menu').addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();this.closeMenu(true);}
      if(['ArrowDown','ArrowUp'].includes(e.key)){e.preventDefault();const items=[...$('pin-menu').querySelectorAll('button')],i=items.indexOf(document.activeElement);items[(i+(e.key==='ArrowDown'?1:-1)+items.length)%items.length]?.focus();}});
    $('pinout-dialog').addEventListener('pointerdown',e=>{if(!$('pin-menu').hidden&&!e.target.closest('#pin-menu,[data-config-pin]'))this.closeMenu();});
    $('pinout-dialog').addEventListener('cancel',e=>{if(!$('pin-menu').hidden){e.preventDefault();this.closeMenu(true);}});
    $('pinout-dialog').addEventListener('close',()=>this.closeMenu());
    $('pinout-apply').onclick=()=>this.commit(false);$('hal-generate').onclick=()=>{if(this.isRunning())return;this.sync();if(this.getProject().code.trim())$('hal-replace-dialog').showModal();else this.commit(true);};
    $('hal-replace-cancel').onclick=()=>$('hal-replace-dialog').close();$('hal-replace-confirm').onclick=()=>{$('hal-replace-dialog').close();this.commit(true);};
  }
  open(pin){if(this.isRunning())return;const project=this.getProject();
    // Renesas RA projects have their own Pins dialog (RA Smart Configurator style, ra-pinout-ui.js).
    if(project.firmware?.mode==='fsp'){this.ra?.open(pin);return;}
    this.draft=structuredClone(project.mcu||defaultMcu(projectBoard(project).mcuFamily));const fam=familyProfile(this.draft.family);if(fam.gpioPins.includes(pin))this.pin=pin;
    // A pin chosen on the other board (PH1 on F446RE, PB11 on F103RB) does not exist here.
    else if(!fam.gpioPins.includes(this.pin))this.pin=fam.gpioPins.includes('PA5')?'PA5':fam.gpioPins[0];
    $('pinout-dialog').querySelector('footer > span').textContent=`HAL GPIO · UART/USART ${Object.keys(fam.serial).length}개 · ${['I2C1','SPI1','ADC1'].filter(id=>fam.extra[id]).join(' · ').replace('I2C','I²C')} · TIM${Object.keys(fam.timers).map(t=>t.slice(3)).join('/')}`;
    this.side='pin';this.render();$('pinout-dialog').showModal();}
  // The fields shown for the selected pin; its function only changes through choose() (pin menu or the signal list).
  sync(){
    if(!$('pinout-properties').dataset.pin)return;const pin=$('pinout-properties').dataset.pin,old=this.draft.pins[pin]||RESET_PIN,f1=familyProfile(this.draft.family).pinMux==='remap';
    const next={function:old.function,pull:$('pin-pull')?.value??old.pull,edge:$('pin-edge')?.value??old.edge,initial:$('pin-level')?Number($('pin-level').value):old.initial,label:$('pin-label')?.value.trim()??old.label};
    const speed=$('pin-speed')?.value;if(speed&&(speed!==defaultSpeed(old.function,f1)||old.speed))next.speed=speed;
    const type=$('pin-otype')?.value;if(type==='OD'||type==='PP'&&old.outputType)next.outputType=type;
    this.draft.pins[pin]=next;
  }
  refreshProblems(){try{$('pinout-errors').textContent=configProblems(this.draft).join('\n');}catch(e){$('pinout-errors').textContent=e.message;}}
  showSide(side){this.side=side;for(const b of $('pinout-dialog').querySelectorAll('[data-side-tab]'))b.setAttribute('aria-selected',String(b.dataset.sideTab===side));$('pinout-pin-panel').hidden=side!=='pin';$('pinout-nvic-panel').hidden=side!=='nvic';$('pinout-clock-panel').hidden=side!=='clock';if(side==='nvic')this.renderNvic();if(side==='clock')this.renderClock();}
  // Clock Configuration: every edit re-checks the draft, so limits show while choosing.
  renderClock(){renderClockPanel($('pinout-clock-panel'),this.draft,()=>{try{const v=validateMcu(this.draft);this.draft.timerClockHz=v.timerClockHz;$('pinout-errors').textContent=configProblems(v).join('\n');}catch(e){$('pinout-errors').textContent=e.message;}this.syncTimerClock();this.renderClock();});}
  syncTimerClock(){const tree=!!this.draft.clock;$('timer-clock').value=numberText(this.draft.timerClockHz);$('timer-clock').disabled=tree;$('timer-clock-tree').hidden=!tree;}
  // A pin's new function (CubeMX pin menu): serial pins bring their peripheral and partner pins, a peripheral signal
  // turns its peripheral on, EXTI starts with CubeMX's rising edge.
  choose(pin,fn){
    this.sync();const before=structuredClone(this.draft),fam=familyProfile(this.draft.family),old=this.draft.pins[pin]||RESET_PIN;this.pin=pin;
    const next={...old,function:fn};if(fn!==old.function){delete next.speed;delete next.outputType;if(fn==='GPIO_EXTI')next.edge='RISING';}
    this.draft.pins[pin]=next;const id=serialFunction(fn);
    try{
      if(id){assignSerialPin(this.draft,id,fn.endsWith('_TX')?'TX':'RX',pin,fam.serial);alignSerialRemap(this.draft,id,pin);this.draft=setSerialEnabled(this.draft,id,true,fam.serial,fam.remaps?.[id]);}
      // A CK pin means synchronous mode: the USART is turned on with its TX/RX (the CK's remap group on F1).
      else if(/^USART\d_CK$/.test(fn)){const usart=fn.slice(0,-3);this.draft.peripherals[usart]={...this.draft.peripherals[usart],enabled:true,mode:'synchronous'};alignSerialRemap(this.draft,usart,pin);this.draft=setSerialEnabled(this.draft,usart,true,fam.serial,fam.remaps?.[usart]);}
      // Choosing a peripheral signal for a pin turns that peripheral on, as the serial pins already do.
      else{const owner=fn.split('_')[0];if(!MODES.includes(fn)&&routesOf(this.draft.family)[owner]&&!this.draft.peripherals[owner]?.enabled)this.draft.peripherals[owner]={...this.draft.peripherals[owner],enabled:true};}
      this.render();
    }catch(e){this.draft=before;this.render();$('pinout-errors').textContent=e.message;}
  }
  openMenu(pin){
    const menu=$('pin-menu'),tile=$('pinout-pins').querySelector(`[data-config-pin="${pin}"]`),current=this.draft.pins[pin]?.function??'Reset',sys=sysSignal(this.draft,pin);
    // CubeMX order: Reset_State, the peripheral signals (A→Z), then GPIO_Input / Output / Analog / EXTIn.
    const all=pinFunctions(pin,this.draft.family),gpio=['GPIO_Input','GPIO_Output','Analog','GPIO_EXTI'];
    const options=[...(current==='Reserved'?['Reserved']:[]),'Reset',...all.filter(fn=>!MODES.includes(fn)).sort(),...gpio.filter(fn=>all.includes(fn))];
    // A Serial Wire pin keeps its SYS signal (CubeMX shows it in green and locked).
    if(sys)menu.innerHTML=`<div class="pin-menu-title">${pin}</div><button type="button" role="menuitemradio" aria-checked="true" class="current" data-sys-signal>${sys}</button><p class="pin-menu-note">System Core › SYS · Debug: Serial Wire 핀이라 바꿀 수 없습니다.</p>`;
    else menu.innerHTML=`<div class="pin-menu-title">${pin}</div>`+options.map(fn=>`<button type="button" role="menuitemradio" aria-checked="${fn===current}" data-pin-signal="${fn}" class="${fn===current?'current':''}">${esc(signalName(fn,pin))}</button>`).join('');
    menu.querySelectorAll('[data-pin-signal]').forEach(b=>b.onclick=()=>{this.closeMenu();this.choose(pin,b.dataset.pinSignal);});menu.querySelector('[data-sys-signal]')?.addEventListener('click',()=>this.closeMenu(true));
    menu.hidden=false;menu.dataset.pin=pin;
    const r=tile?.getBoundingClientRect(),h=menu.offsetHeight,w=menu.offsetWidth;
    if(r){menu.style.left=Math.max(4,Math.min(innerWidth-w-4,r.left))+'px';menu.style.top=(r.bottom+h+4<innerHeight?r.bottom+2:Math.max(4,r.top-h-2))+'px';}
    (menu.querySelector('.current')||menu.querySelector('button'))?.focus();
  }
  closeMenu(focusTile=false){const menu=$('pin-menu');if(menu.hidden)return;const pin=menu.dataset.pin;menu.hidden=true;if(focusTile)$('pinout-pins').querySelector(`[data-config-pin="${pin}"]`)?.focus();}
  // One NVIC row (the table and a peripheral's NVIC Settings use the same config entry).
  irqRow(config,irq,{card=false}={}){
    const n=config.nvic[irq]||{enabled:false,priority:0},forced=dmaForced(config,irq),lim=priorityLimits(nvicGroup(config)),k=card?'card-':'';
    return `<div class="irq-row" role="row"><label class="irq-name" role="cell"><input type="checkbox" data-${k}irq="${irq}" ${n.enabled||forced?'checked':''} ${forced?'disabled title="사용 중인 DMA 스트림의 인터럽트는 항상 켜집니다 (CubeMX Force DMA channels Interrupts)."':''}><span title="${irq}">${esc(irqLabel(irq))}</span></label><input type="number" role="cell" min="0" max="${lim.preempt}" value="${numberText(n.priority)}" data-${k}priority="${irq}" aria-label="${irq} Preemption Priority"><input type="number" role="cell" min="0" max="${lim.sub}" value="${numberText(n.sub??0)}" data-${k}sub="${irq}" aria-label="${irq} Sub Priority" ${lim.sub?'':'disabled'}></div>`;
  }
  bindIrqRows(root,{card=false}={}){
    const k=card?'card':'',on=(name,fn)=>root.querySelectorAll(`[data-${card?'card-':''}${name}]`).forEach(el=>el.onchange=()=>{fn(el.dataset[k?k+name[0].toUpperCase()+name.slice(1):name],el);card?this.render():(this.updateNvicCount(),this.refreshProblems());});
    const entry=irq=>this.draft.nvic[irq]??={enabled:dmaForced(this.draft,irq),priority:0};
    on('irq',(irq,el)=>{entry(irq).enabled=el.checked;});
    on('priority',(irq,el)=>{entry(irq).priority=numberInput(el);});
    on('sub',(irq,el)=>{const v=numberInput(el);if(v)entry(irq).sub=v;else delete entry(irq).sub;});
  }
  updateNvicCount(){const config=this.draft,on=Object.entries(config.nvic).filter(([irq,n])=>n.enabled||dmaForced(config,irq)).length;$('pinout-nvic-count').textContent=on?`(${on})`:'';const open=$('pinout-peripherals').querySelector('[data-open-nvic] small');if(open)open.textContent=`켜진 인터럽트 ${on}개 · Priority Group ${nvicGroup(config)}`;}
  renderNvic(){
    const config=this.draft,fam=familyProfile(config.family),numbers=fam.irqNumbers??IRQ_NUMBERS,lim=priorityLimits(nvicGroup(config)),show=$('nvic-show').value,q=$('nvic-search').value.trim().toLowerCase();
    $('nvic-group').innerHTML=[0,1,2,3,4].map(g=>`<option value="${g}" ${nvicGroup(config)===g?'selected':''}>${g} bits for pre-emption priority ${4-g} bits for subpriority</option>`).join('');
    $('nvic-group-hint').textContent=`NVIC_PRIORITYGROUP_${nvicGroup(config)} · Preemption 0~${lim.preempt}, Sub 0~${lim.sub}${nvicGroup(config)===NVIC_GROUP_DEFAULT?' (HAL 기본값)':''}`;
    const match=(irq,label)=>!q||irq.toLowerCase().includes(q)||label.toLowerCase().includes(q);
    const irqs=irqNamesOf(config.family).filter(irq=>(show==='all'||show==='enabled'&&(config.nvic[irq]?.enabled||dmaForced(config,irq))||show==='available'&&(irqAvailable(config,irq)||dmaForced(config,irq)))&&match(irq,irqLabel(irq))).sort((a,b)=>(numbers[a]??99)-(numbers[b]??99));
    const system=SYSTEM_IRQS.filter(([irq,label])=>match(irq,label)).map(([irq,label])=>irq==='SysTick_IRQn'?`<div class="irq-row system" role="row"><label class="irq-name" role="cell"><input type="checkbox" checked disabled><span title="${irq}">${label}</span></label><input type="number" role="cell" id="nvic-tick" min="0" max="${lim.preempt}" value="${tickPriority(config)}" aria-label="SysTick_IRQn Preemption Priority"><input type="number" role="cell" value="0" disabled aria-label="SysTick_IRQn Sub Priority"></div>`:`<div class="irq-row system" role="row"><label class="irq-name" role="cell"><input type="checkbox" checked disabled><span title="${irq}">${label}</span></label><input type="number" role="cell" value="0" disabled aria-label="${irq} Preemption Priority"><input type="number" role="cell" value="0" disabled aria-label="${irq} Sub Priority"></div>`).join('');
    $('pinout-nvic').innerHTML=`<div class="irq-row irq-head" role="row"><span role="columnheader">NVIC Interrupt Table · Enabled</span><span role="columnheader" title="Preemption Priority">Pre.</span><span role="columnheader" title="Sub Priority">Sub</span></div>${system}${irqs.map(irq=>this.irqRow(config,irq)).join('')}${irqs.length?'':`<p class="pinout-hint">${show==='available'?'켜진 주변장치·EXTI 핀·DMA가 없습니다. 주변장치를 켜거나 "모든 인터럽트"를 고르세요.':'맞는 인터럽트가 없습니다.'}</p>`}`;
    this.bindIrqRows($('pinout-nvic'));
    $('nvic-tick')&&($('nvic-tick').onchange=()=>{const v=numberInput($('nvic-tick'));config.tickPriority=v;this.refreshProblems();});
    this.updateNvicCount();
  }
  commit(generate){try{this.sync();for(const el of $('pinout-dialog').querySelectorAll('input[type="number"]'))if(!Number.isFinite(numberInput(el)))throw new Error(`${el.getAttribute('aria-label')||(el.id==='timer-clock'?'APB1 타이머 입력 클록':'숫자 설정')}: 숫자를 입력하세요.`);const mcu=validateMcu(this.draft),project=this.getProject(),code=generate?dropShadowedHandlers(keepUserCode(project.code,expandC(generateHal(mcu)),previousDefault(project.mcu)),(project.firmware?.files||[]).map(f=>f.text)):null;this.apply({mcu,code});$('pinout-dialog').close();}catch(e){$('pinout-errors').textContent=e.message;this.onError(e.message);}}
  // DMA requests of the enabled peripherals: stream/channel, direction, normal/circular, priority.
  dmaCard(config){
    const requestsOf=dmaRequestsOf(config.family),f1=familyProfile(config.family).pinMux==='remap',enabled=id=>id===null||config.peripherals[id]?.enabled,requests=Object.keys(requestsOf).filter(r=>enabled(dmaPeripheral(r)));
    const dir={P2M:'주변장치→메모리',M2P:'메모리→주변장치',M2M:'메모리→메모리'};
    return `<section class="peripheral-card dma-card"><strong>DMA</strong><small class="serial-mode-note">활성화한 주변장치의 DMA 요청 · ${f1?'요청마다 고정된 DMA1 채널(RM0008)':'스트림/채널은 RM0390 매핑만 표시'} · 생성 코드에 MX_DMA_Init와 __HAL_LINKDMA를 추가합니다.</small>${requests.map(r=>{const d=config.dma?.[r],on=!!d;return `<div class="dma-row"><label class="check-label"><input type="checkbox" data-dma-request="${r}" ${on?'checked':''}>${r} · ${dir[dmaDirection(r)]}</label>${on?`<label>${f1?'채널':'스트림'}<select data-dma-field="${r}" data-key="route" aria-label="${r} ${f1?'채널':'스트림'}">${requestsOf[r].map(([st,ch])=>`<option value="${st}:${ch??0}" ${d.stream===st&&(ch===null||d.channel===ch)?'selected':''}>${st}${ch===null?'':' · CH'+ch}</option>`).join('')}</select></label><label>모드<select data-dma-field="${r}" data-key="mode" aria-label="${r} 모드">${DMA_MODES.filter(m=>r!=='MEMTOMEM'||m==='normal').map(m=>`<option value="${m}" ${d.mode===m?'selected':''}>${m==='circular'?'Circular':'Normal'}</option>`).join('')}</select></label><label>우선순위<select data-dma-field="${r}" data-key="priority" aria-label="${r} 우선순위">${DMA_PRIORITIES.map(v=>`<option value="${v}" ${d.priority===v?'selected':''}>${v.replace('_',' ')}</option>`).join('')}</select></label>`:''}</div>`;}).join('')||'<small>DMA를 사용할 UART/ADC/SPI/I2C/TIM(PWM)/DCMI/SDIO를 먼저 활성화하세요.</small>'}</section>`;
  }
  bindDma(config){
    const root=$('pinout-peripherals');
    root.querySelectorAll('[data-dma-request]').forEach(el=>el.onchange=()=>{this.sync();const r=el.dataset.dmaRequest;config.dma??={};if(el.checked){const options=dmaRequestsOf(config.family)[r],used=new Set(Object.values(config.dma).map(d=>d.stream)),[stream,channel]=options.find(([st])=>!used.has(st))??options[0];config.dma[r]={stream,channel:channel??0,mode:'normal',priority:'low'};}else delete config.dma[r];if(!Object.keys(config.dma).length)delete config.dma;this.render();});
    root.querySelectorAll('[data-dma-field]').forEach(el=>el.onchange=()=>{const d=config.dma[el.dataset.dmaField];if(el.dataset.key==='route'){const [stream,channel]=el.value.split(':');d.stream=stream;d.channel=Number(channel);}else d[el.dataset.key]=el.value;$('pinout-errors').textContent=(()=>{try{validateMcu(config);return configProblems(config).join('\n');}catch(e){return e.message;}})();});
  }
  render(){
    const config=this.draft,p=config.pins[this.pin]||RESET_PIN,fam=familyProfile(config.family),f1=fam.pinMux==='remap';
    document.querySelector('.pinout-heading .eyebrow').textContent=`${fam.id} · LQFP64 · ${fam.core}`;$('timer-clock').title=`APB1 타이머 클록: ${fam.clock.label}`;$('timer-clock').min=fam.clock.minHz;$('timer-clock').max=fam.clock.maxHz;$('timer-clock-hint').textContent=`새 프로젝트: HSI ${fam.clock.defaultHz/1e6} MHz · PLL OFF · AHB/APB 분주 1 · 설정 범위 ${fam.clock.label}. 예제와 저장된 설정은 각 프로젝트 값을 사용합니다.`;
    $('pinout-pins').innerHTML=[...fam.gpioPins].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true})).map(pin=>{const value=config.pins[pin],sys=sysSignal(config,pin);if(sys)return `<button class="pin-tile enabled sys ${pin===this.pin?'selected':''}" data-config-pin="${pin}" aria-haspopup="menu" title="${pin}: ${sys} (Serial Wire 디버그, 잠김)"><strong>${pin}</strong><small>${sys}</small></button>`;return `<button class="pin-tile ${pin===this.pin?'selected':''} ${value&&!['Reset','Reserved'].includes(value.function)?'enabled':''} ${value?.function==='Reserved'?'reserved':''}" data-config-pin="${pin}" aria-haspopup="menu" title="${pin}: 눌러서 신호 선택"><strong>${pin}</strong><small>${esc(value?.label||signalName(value?.function||'Reset',pin))}</small>${value?.label?`<small class="pin-signal">${esc(signalName(value.function,pin))}</small>`:''}</button>`;}).join('');
    // CubeMX: clicking a pin selects it and opens the list of its signals.
    $('pinout-pins').querySelectorAll('button').forEach(b=>b.onclick=()=>{const pin=b.dataset.configPin,again=!$('pin-menu').hidden&&$('pin-menu').dataset.pin===pin;this.sync();this.pin=pin;if(this.side!=='pin')this.showSide('pin');this.render();if(!again)this.openMenu(pin);});
    // CubeMX GPIO configuration of the selected pin: only the fields its mode has.
    const mode=p.function==='Reset'||p.function==='Reserved'?null:gpioMode(p,config,f1),select=(id,label,options,value)=>`<label>${label}<select id="${id}">${Object.entries(options).map(([v,name])=>`<option value="${v}" ${String(value)===v?'selected':''}>${esc(name)}</option>`).join('')}</select></label>`;
    const speed=p.speed??defaultSpeed(p.function,f1),exti=p.function==='GPIO_EXTI'?irqForPin(this.pin):null;
    const sys=sysSignal(config,this.pin);
    // Serial Wire pins: nothing to set (sync() leaves them alone).
    $('pinout-properties').dataset.pin=sys?'':this.pin;
    if(sys)$('pinout-properties').innerHTML=`<h3>${this.pin} Configuration</h3><label>신호<input value="${sys}" readonly></label><p>System Core › SYS의 Debug: Serial Wire가 쓰는 핀입니다(ST-LINK ${this.pin==='PA13'?'SWDIO':'SWCLK'}). 다른 기능으로 바꾸면 보드 쓰기와 디버깅이 끊기므로 바꿀 수 없습니다.</p>`;
    else $('pinout-properties').innerHTML=`<h3>${this.pin} Configuration</h3><label>신호<select id="pin-function">${pinFunctions(this.pin,config.family).filter(v=>v!=='Reserved'||p.function==='Reserved').map(v=>`<option value="${v}" ${p.function===v?'selected':''}>${esc(signalName(v,this.pin))}</option>`).join('')}</select></label>`
      +(p.function==='GPIO_Output'?select('pin-level','GPIO output level',{0:'Low',1:'High'},p.initial):'')
      +(p.function==='GPIO_Output'?select('pin-otype','GPIO mode',{PP:MODE_NAMES.OUTPUT_PP,OD:MODE_NAMES.OUTPUT_OD},p.outputType??'PP'):exti?select('pin-edge','GPIO mode',EDGE_NAMES,p.edge):mode?`<label>GPIO mode<input value="${MODE_NAMES[mode]}" readonly></label>`:'')
      +(mode&&mode!=='ANALOG'?select('pin-pull','GPIO Pull-up/Pull-down',PULL_NAMES,p.pull):'')
      +(mode&&hasSpeed(mode)?select('pin-speed','Maximum output speed',Object.fromEntries(speedsOf(f1).map(s=>[s,SPEED_NAMES[s]])),speed):'')
      +(p.function==='Reserved'?'':`<label>User Label<input id="pin-label" maxlength="40" value="${esc(p.label)}" placeholder="예: LD2"></label>`)
      +(exti?`<div class="card-nvic"><strong>NVIC</strong>${this.irqRow(config,exti,{card:true})}</div>`:'')
      +(mode?'':'<p>핀을 눌러 나오는 목록이나 위의 신호에서 용도를 고르세요.</p>');
    for(const id of ['pin-pull','pin-edge','pin-level','pin-speed','pin-otype'])if($(id))$(id).onchange=()=>{this.sync();this.render();};
    if($('pin-function'))$('pin-function').onchange=()=>this.choose(this.pin,$('pin-function').value);
    if(exti)this.bindIrqRows($('pinout-properties'),{card:true});
    const timebases=['SysTick',...Object.keys(fam.timers)];
    const system=`<section class="peripheral-card system-card"><strong>System Core</strong><button type="button" class="nvic-open" data-open-nvic>NVIC<small></small></button><div class="sys-settings"><strong>SYS</strong><label>Debug<select id="sys-debug" aria-describedby="sys-note">${DEBUG_MODES.map(m=>`<option ${m==='Serial Wire'?'selected':'disabled'}>${m}</option>`).join('')}</select></label><label>Timebase Source<select id="sys-timebase" aria-describedby="sys-note">${timebases.map(t=>`<option ${t==='SysTick'?'selected':'disabled'}>${t}</option>`).join('')}</select></label><small id="sys-note" class="serial-mode-note">NUCLEO의 ST-LINK가 SWD로 연결되어 Serial Wire(PA13 SWDIO · PA14 SWCLK)로 고정됩니다. HAL 시간은 SysTick이며 우선순위는 NVIC의 Time base 줄에서 바꿉니다.</small></div></section>`;
    $('pinout-peripherals').innerHTML=system+Object.keys(routesOf(config.family)).map(id=>{
      const c=config.peripherals[id]||{enabled:false},defaults=isTimer(id)?timerDefaults(id,config.family):null,timerMax=id=>fam.timerMax(id),fields=isSerial(id)?[['baud','Baud rate',115200]]:id==='I2C1'||id==='SPI1'?[['clock','Clock (Hz)',id==='I2C1'?100000:1000000]]:isTimer(id)?[['prescaler','Prescaler (PSC)',defaults.prescaler,65535],['period','Period (ARR)',defaults.period,timerMax(id)],...(['pwm','oc'].includes(c.mode)?[['pulse','초기 Pulse (CCR)',defaults.pulse,timerMax(id)]]:[])]:[];
      const syncMode=c.mode==='synchronous',ck=fam.usartCk[id],ckFn=id+'_CK',ckPin=Object.keys(config.pins).find(pin=>config.pins[pin].function===ckFn);
      const syncUi=ck?`<label>모드<select data-serial-mode="${id}" aria-label="${id} 모드" ${c.enabled?'':'disabled'}><option value="asynchronous">Asynchronous (HAL_UART)</option><option value="synchronous" ${syncMode?'selected':''}>Synchronous (HAL_USART)</option></select></label>`+(syncMode?`<label>CK 핀<select data-serial-ck="${id}" aria-label="${id} CK 핀"><option value="">선택…</option>${ck.map(pin=>{const other=config.pins[pin]?.function,busy=other&&other!=='Reset'&&other!==ckFn;return `<option value="${pin}" ${pin===ckPin?'selected':''} ${busy?'disabled':''}>${pin}${busy?' · '+esc(other)+' 사용 중':''}</option>`;}).join('')}</select></label>`+[['cpol','CPOL',['LOW','HIGH']],['cpha','CPHA',['1EDGE','2EDGE']],['lastBit','Last bit clock',['DISABLE','ENABLE']]].map(([key,label,names])=>`<label>${label}<select data-usart-param="${id}" data-key="${key}" aria-label="${id} ${label}">${names.map((n,v)=>`<option value="${v}" ${(c[key]??0)===v?'selected':''}>${n}</option>`).join('')}</select></label>`).join(''):''):'';
      // Asynchronous Parameter Settings (CubeMX: Word Length includes the parity bit; F103 has no Over Sampling 8).
      const params=isSerial(id)&&!syncMode?[['wordLength','Word Length',[[8,'8 Bits (including Parity)'],[9,'9 Bits (including Parity)']]],['parity','Parity',[['NONE','None'],['EVEN','Even'],['ODD','Odd']]],['stopBits','Stop Bits',[[1,'1'],[2,'2']]],['direction','Data Direction',[['TX_RX','Receive and Transmit'],['TX','Transmit Only'],['RX','Receive Only']]],...(f1?[]:[['overSampling','Over Sampling',[[16,'16 Samples'],[8,'8 Samples']]]])].map(([key,label,opts])=>`<label>${label}<select data-uart-param="${id}" data-key="${key}" aria-label="${id} ${label}" ${c.enabled?'':'disabled'}>${opts.map(([v,t])=>`<option value="${v}" ${String(c[key]??opts[0][0])===String(v)?'selected':''}>${t}</option>`).join('')}</select></label>`).join(''):'';
      // SPI1 Parameter Settings: Clock Polarity/Phase (SPI mode 0-3), Data Size, First Bit.
      const i2cParams=id==='I2C1'?`<label>Primary Address (7-bit)<input data-i2c-param="ownAddress" aria-label="I2C1 Primary Address" value="0x${(c.ownAddress??0).toString(16).padStart(2,'0')}" spellcheck="false" ${c.enabled?'':'disabled'}></label><label>Fast Mode Duty Cycle<select data-i2c-param="dutyCycle" aria-label="I2C1 Fast Mode Duty Cycle" ${c.enabled&&(c.clock??100000)>100000?'':'disabled'}><option value="2">Duty cycle Tlow/Thigh = 2</option><option value="16_9" ${c.dutyCycle==='16_9'?'selected':''}>Duty cycle Tlow/Thigh = 16/9</option></select></label><label>Clock No Stretch Mode<select data-i2c-param="noStretch" aria-label="I2C1 Clock No Stretch Mode" ${c.enabled?'':'disabled'}><option value="0">Disabled</option><option value="1" ${c.noStretch?'selected':''}>Enabled</option></select></label><small class="serial-mode-note">${(c.clock??100000)>100000?'Fast Mode':'Standard Mode'} · 7-bit addressing · Primary Address는 슬레이브로 쓸 때의 주소(OwnAddress1 = 주소 << 1)</small>`:'';
      const spiParams=id==='SPI1'?[['cpol','Clock Polarity (CPOL)',[['LOW','Low'],['HIGH','High']]],['cpha','Clock Phase (CPHA)',[['1EDGE','1 Edge'],['2EDGE','2 Edge']]],['dataSize','Data Size',[[8,'8 Bits'],[16,'16 Bits']]],['firstBit','First Bit',[['MSB','MSB First'],['LSB','LSB First']]]].map(([key,label,opts])=>`<label>${label}<select data-spi-param="${key}" aria-label="SPI1 ${label}" ${c.enabled?'':'disabled'}>${opts.map(([v,t])=>`<option value="${v}" ${String(c[key]??opts[0][0])===String(v)?'selected':''}>${t}</option>`).join('')}</select></label>`).join('')+`<small class="serial-mode-note">SPI mode ${((c.cpol??'LOW')==='HIGH'?2:0)+((c.cpha??'1EDGE')==='2EDGE'?1:0)} · Full-Duplex Master · Software NSS</small>`:'';
      const routing=isSerial(id)?`<small class="serial-mode-note">${syncMode?'Synchronous · HAL_USART · CK 클록 출력':'Asynchronous · HAL_UART'} · ${f1?'AFIO 리맵 핀 묶음':'AF'+serialAf(id)}${id==='USART2'&&!syncMode?' · 내장 ST-LINK VCP: 별도 부품 없이 하단 직렬 모니터 탭 연결':''}</small>`+syncUi+params+['TX','RX'].map(role=>{
        const fn=id+'_'+role,current=Object.keys(config.pins).find(pin=>config.pins[pin].function===fn);
        return `<label>${role} 핀<select data-serial-route="${id}" data-role="${role}" aria-label="${id} ${role} 핀" ${c.enabled?'':'disabled'}><option value="">선택…</option>${fam.serial[id][role].map(pin=>{const other=config.pins[pin]?.function,busy=other&&other!=='Reset'&&other!==fn;return `<option value="${pin}" ${pin===current?'selected':''} ${busy?'disabled':''}>${pin}${busy?' · '+esc(other)+' 사용 중':''}</option>`;}).join('')}</select></label>`;
      }).join(''):'';
      return `<section class="peripheral-card"><label class="check-label"><input type="checkbox" data-peripheral="${id}" ${c.enabled?'checked':''}>${id}</label>${routing}${i2cParams}${spiParams}${id==='ADC1'?`<label>Continuous Conversion Mode<select data-adc-continuous aria-label="ADC1 Continuous Conversion Mode" ${c.enabled?'':'disabled'}><option value="0">Disabled</option><option value="1" ${c.continuous?'selected':''}>Enabled</option></select></label><small class="serial-mode-note">${c.continuous?'HAL_ADC_Start 한 번 뒤 계속 변환합니다. HAL_ADC_GetValue가 최신 값을 돌려줍니다.':'변환은 HAL_ADC_Start마다 한 번입니다. 값을 새로 읽으려면 매번 Start · PollForConversion을 부르세요.'}</small>${adcSamplingField(config,c)}`:''}${id==='RTC'&&c.enabled?rtcFields(config,c):''}${id==='DAC'&&c.enabled?dacFields(config,c):''}${(id==='IWDG'||id==='WWDG')&&c.enabled?wdgFields(config,id,c):''}${isBasicTimer(id)?basicTimerField(id,c):isTimer(id)?`<label>동작 모드<select data-timer-mode="${id}">${Object.entries(TIMER_MODES).map(([mode,label])=>`<option value="${mode}" ${(c.mode??'base')===mode?'selected':''}>${label}</option>`).join('')}</select></label>${counterModeField(id,c)}`:''}${fields.map(([key,label,value,max])=>`<label>${label}<input type="number" data-peripheral-value="${id}" data-key="${key}" aria-label="${id} ${label}" value="${numberText(c[key]??value)}" min="0" ${max===undefined?'':`max="${max}"`} step="1"></label>`).join('')}${isTimer(id)?`<small class="serial-mode-note">${timerHint(id,c,fam.timerMax(id))}</small>`:''}${isTimer(id)?timerChannelsField(id,c,config,fam.timerMax(id)):''}${c.enabled&&peripheralIrqs(config.family,id).length?`<div class="card-nvic"><strong>NVIC Settings</strong>${peripheralIrqs(config.family,id).map(irq=>this.irqRow(config,irq,{card:true})).join('')}</div>`:''}</section>`;
    }).join('')+this.dmaCard(config);
    this.bindDma(config);this.bindIrqRows($('pinout-peripherals'),{card:true});
    $('pinout-peripherals').querySelector('[data-open-nvic]').onclick=()=>this.showSide('nvic');
    $('pinout-peripherals').querySelectorAll('[data-serial-mode]').forEach(el=>el.onchange=()=>{this.sync();const id=el.dataset.serialMode,c=config.peripherals[id]??={enabled:true};if(el.value==='synchronous'){c.mode='synchronous';c.cpol??=0;c.cpha??=0;c.lastBit??=0;const tx=Object.keys(config.pins).find(p=>config.pins[p].function===id+'_TX'),group=fam.remaps?.[id]?.find(o=>o.pins.TX===tx&&o.pins.CK),pin=[...(group?[group.pins.CK]:[]),...fam.usartCk[id]].find(p=>!config.pins[p]||config.pins[p].function==='Reset');if(pin)config.pins[pin]={function:id+'_CK',pull:'NOPULL',edge:'FALLING',initial:0,label:''};}else{delete c.mode;delete c.cpol;delete c.cpha;delete c.lastBit;for(const [pin,p]of Object.entries(config.pins))if(p.function===id+'_CK')config.pins[pin]={...p,function:'Reset',label:''};}this.render();});
    $('pinout-peripherals').querySelectorAll('[data-serial-ck]').forEach(el=>el.onchange=()=>{this.sync();const id=el.dataset.serialCk;for(const [pin,p]of Object.entries(config.pins))if(p.function===id+'_CK')config.pins[pin]={...p,function:'Reset',label:''};if(el.value)config.pins[el.value]={function:id+'_CK',pull:'NOPULL',edge:'FALLING',initial:0,label:''};this.render();});
    $('pinout-peripherals').querySelector('[data-adc-sampling]')?.addEventListener('change',e=>{this.sync();const c=config.peripherals.ADC1??={enabled:true};c.samplingTime=Number(e.target.value);this.render();});
    $('pinout-peripherals').querySelector('[data-adc-continuous]')?.addEventListener('change',e=>{this.sync();const c=config.peripherals.ADC1??={enabled:true};if(e.target.value==='1')c.continuous=true;else delete c.continuous;this.render();});
    $('pinout-peripherals').querySelectorAll('[data-tim-channel]').forEach(el=>el.onchange=()=>{this.sync();const id=el.dataset.timChannel,c=config.peripherals[id]??={enabled:true},ch=(c.channels??={})[el.dataset.ch]??={},k=el.dataset.key;if(k==='pulse')ch.pulse=numberInput(el);else if(el.value===timChannelParams(c.mode)[k][0])delete ch[k];else ch[k]=el.value;if(k==='pulse'&&ch.pulse===c.pulse)delete ch.pulse;if(!Object.keys(ch).length)delete c.channels[el.dataset.ch];if(!Object.keys(c.channels).length)delete c.channels;this.render();});
    $('pinout-peripherals').querySelectorAll('[data-i2c-param]').forEach(el=>el.onchange=()=>{this.sync();const c=config.peripherals.I2C1??={enabled:true},k=el.dataset.i2cParam;if(k==='ownAddress'){const v=el.value.trim(),n=/^(0x[0-9a-f]+|\d+)$/i.test(v)?Number(v):NaN;if(n)c.ownAddress=n;else if(n===0)delete c.ownAddress;else c.ownAddress=NaN;}else if(k==='dutyCycle'){if(el.value==='16_9')c.dutyCycle='16_9';else delete c.dutyCycle;}else{if(el.value==='1')c.noStretch=true;else delete c.noStretch;}this.render();});
    $('pinout-peripherals').querySelectorAll('[data-spi-param]').forEach(el=>el.onchange=()=>{this.sync();const c=config.peripherals.SPI1??={enabled:true},k=el.dataset.spiParam,v=/^\d+$/.test(el.value)?Number(el.value):el.value;if(v===SPI_PARAMS[k][0])delete c[k];else c[k]=v;this.render();});
    $('pinout-peripherals').querySelectorAll('[data-uart-param]').forEach(el=>el.onchange=()=>{this.sync();const c=config.peripherals[el.dataset.uartParam]??={enabled:true},k=el.dataset.key,v=/^\d+$/.test(el.value)?Number(el.value):el.value;if(v===UART_PARAMS[k][0])delete c[k];else c[k]=v;this.render();});
    $('pinout-peripherals').querySelectorAll('[data-usart-param]').forEach(el=>el.onchange=()=>{config.peripherals[el.dataset.usartParam][el.dataset.key]=Number(el.value);});
    $('pinout-peripherals').querySelectorAll('[data-peripheral]').forEach(el=>el.onchange=()=>{this.sync();const id=el.dataset.peripheral;try{if(isSerial(id)&&!el.checked){for(const [pin,p]of Object.entries(config.pins))if(p.function===id+'_CK')config.pins[pin]={...p,function:'Reset',label:''};delete config.peripherals[id]?.mode;}if(isSerial(id))this.draft=setSerialEnabled(config,id,el.checked,fam.serial,fam.remaps?.[id]);else config.peripherals[id]={...config.peripherals[id],enabled:el.checked};this.render();}catch(e){this.render();$('pinout-errors').textContent=e.message;}});
    $('pinout-peripherals').querySelectorAll('[data-serial-route]').forEach(el=>el.onchange=()=>{this.sync();try{assignSerialPin(config,el.dataset.serialRoute,el.dataset.role,el.value,fam.serial);alignSerialRemap(config,el.dataset.serialRoute,el.value);this.render();}catch(e){this.render();$('pinout-errors').textContent=e.message;}});
    $('pinout-peripherals').querySelectorAll('[data-timer-mode]').forEach(el=>el.onchange=()=>{
      this.sync();const id=el.dataset.timerMode,c=config.peripherals[id]??={enabled:false},pulse=c.pulse??timerDefaults(id,config.family).pulse;
      if(['pwm','oc'].includes(c.mode)&&!['pwm','oc'].includes(el.value)&&(!Number.isInteger(pulse)||pulse<0||pulse>fam.timerMax(id))){
        el.value=c.mode;$('pinout-errors').textContent=`${id} 초기 Pulse (CCR): ${Number.isFinite(pulse)?`0~${fam.timerMax(id)} 범위의 정수를 입력하세요.`:'숫자를 입력하세요.'}`;return;
      }
      if(c.channels&&c.mode!==el.value)for(const [ch,cc]of Object.entries(c.channels)){delete cc.ocMode;if(!Object.keys(cc).length)delete c.channels[ch];}
      if(c.channels&&!Object.keys(c.channels).length)delete c.channels;
      c.mode=el.value;if(el.value==='encoder'){c.prescaler=0;delete c.counterMode;}this.render();
    });
    bindRtc($('pinout-peripherals'),config,()=>this.sync(),()=>this.render());
    bindDac($('pinout-peripherals'),config,()=>this.sync(),()=>this.render());
    bindWdg($('pinout-peripherals'),config,()=>this.sync(),()=>this.render());
    $('pinout-peripherals').querySelectorAll('[data-timer-trgo]').forEach(el=>el.onchange=()=>{this.sync();const c=config.peripherals[el.dataset.timerTrgo]??={enabled:false};if(el.value==='RESET')delete c.trgo;else c.trgo=el.value;this.render();});
    $('pinout-peripherals').querySelectorAll('[data-timer-counter]').forEach(el=>el.onchange=()=>{this.sync();const c=config.peripherals[el.dataset.timerCounter]??={enabled:false};if(el.value==='UP')delete c.counterMode;else c.counterMode=el.value;this.render();});
    $('pinout-peripherals').querySelectorAll('[data-peripheral-value]').forEach(el=>el.onchange=()=>{const id=el.dataset.peripheralValue;config.peripherals[id]??={enabled:false};config.peripherals[id][el.dataset.key]=numberInput(el);const note=el.closest('.peripheral-card').querySelector('.serial-mode-note');if(isTimer(id)&&note)note.textContent=timerHint(id,config.peripherals[id],fam.timerMax(id));});
    this.renderNvic();this.showSide(this.side??'pin');
    this.syncTimerClock();$('timer-clock').onchange=()=>config.timerClockHz=numberInput($('timer-clock'));
    $('pinout-errors').textContent=configProblems(config).join('\n');
    $('pinout-summary').textContent=`${Object.values(config.pins).filter(p=>!['Reset','Reserved'].includes(p.function)).length}개 핀 활성 · ${[...new Set(Object.entries(config.peripherals).filter(([,p])=>p.enabled).map(([id])=>'HAL_'+(isSerial(id)?'UART':id.replace(/\d$/,''))))].join(' · ')||'HAL_GPIO'}`;
  }
}
