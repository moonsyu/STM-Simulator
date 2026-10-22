import {isTimer,timerMax,TIMER_MODES} from './timer-config.js';
import {timerDefaults} from './mcu-defaults.js';
import {GPIO_PINS} from './pins.js';
import {MODES,ROUTES,defaultMcu,validateMcu,configProblems,pinFunctions,irqForPin,IRQ_NAMES,generateHal,USART_CK_ROUTES,DMA_MODES,DMA_PRIORITIES,dmaPeripheral,dmaDirection} from './mcu-config.js';
import {DMA_REQUESTS} from './hal-dma.js';
import {expandC} from './c-format.js';
import {isSerial,serialAf,serialFunction,assignSerialPin,setSerialEnabled} from './serial-config.js';
import {familyProfile,routesOf,irqNamesOf} from './mcu-family.js';
import {dmaRequestsOf} from './mcu-config.js';
import {projectBoard} from './boards.js';
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
const $=id=>document.getElementById(id),esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const numberInput=el=>el.value.trim()===''?NaN:Number(el.value);
const numberText=value=>Number.isFinite(value)?value:'';
const timerHint=(id,c,max=timerMax(id))=>`${max===65535?'16':'32'}비트 · 초기 ARR ${max}${c.period===0?' · ARR=0: 카운터 정지':''}`;
export class PinoutPanel {
  constructor({getProject,apply,isRunning,onError}){
    Object.assign(this,{getProject,apply,isRunning,onError});this.pin='PA5';
    $('pinout-open').onclick=()=>this.open();$('pinout-close').onclick=()=>$('pinout-dialog').close();
    // NVIC, numeric fields and pin properties re-render nothing: refresh the problem list (this bubbling listener runs after their own onchange).
    $('pinout-dialog').addEventListener('change',e=>{if(!e.target.matches('[data-irq],[data-priority],[data-peripheral-value],#timer-clock,#pin-label,#pin-pull,#pin-edge,#pin-level'))return;
      if(e.target.matches('#pin-label,#pin-pull,#pin-edge,#pin-level'))this.sync();try{$('pinout-errors').textContent=configProblems(this.draft).join('\n');}catch{}});
    $('pinout-apply').onclick=()=>this.commit(false);$('hal-generate').onclick=()=>{if(this.isRunning())return;this.sync();if(this.getProject().code.trim())$('hal-replace-dialog').showModal();else this.commit(true);};
    $('hal-replace-cancel').onclick=()=>$('hal-replace-dialog').close();$('hal-replace-confirm').onclick=()=>{$('hal-replace-dialog').close();this.commit(true);};
  }
  open(pin){if(this.isRunning())return;const project=this.getProject();this.draft=structuredClone(project.mcu||defaultMcu(projectBoard(project).mcuFamily));const fam=familyProfile(this.draft.family);if(fam.gpioPins.includes(pin))this.pin=pin;
    // A pin chosen on the other board (PH1 on F446RE, PB11 on F103RB) does not exist here.
    else if(!fam.gpioPins.includes(this.pin))this.pin=fam.gpioPins.includes('PA5')?'PA5':fam.gpioPins[0];
    $('pinout-dialog').querySelector('footer > span').textContent=`HAL GPIO · UART/USART ${Object.keys(fam.serial).length}개 · ${['I2C1','SPI1','ADC1'].filter(id=>fam.extra[id]).join(' · ').replace('I2C','I²C')} · TIM${Object.keys(fam.timers).map(t=>t.slice(3)).join('/')}`;
    this.render();$('pinout-dialog').showModal();}
  sync(){if(!$('pin-function'))return;this.draft.pins[this.pin]={function:$('pin-function').value,pull:$('pin-pull').value,edge:$('pin-edge').value,initial:Number($('pin-level').value),label:$('pin-label').value.trim()};}
  commit(generate){try{this.sync();for(const el of $('pinout-dialog').querySelectorAll('input[type="number"]'))if(!Number.isFinite(numberInput(el)))throw new Error(`${el.getAttribute('aria-label')||(el.id==='timer-clock'?'APB1 타이머 입력 클록':'숫자 설정')}: 숫자를 입력하세요.`);const mcu=validateMcu(this.draft),code=generate?expandC(generateHal(mcu)):null;this.apply({mcu,code});$('pinout-dialog').close();}catch(e){$('pinout-errors').textContent=e.message;this.onError(e.message);}}
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
    const config=this.draft,p=config.pins[this.pin]||{function:'Reset',pull:'NOPULL',edge:'FALLING',label:'',initial:0},fam=familyProfile(config.family),f1=fam.pinMux==='remap';
    document.querySelector('.pinout-heading .eyebrow').textContent=`${fam.id} · LQFP64 · ${fam.core}`;$('timer-clock').title=`APB1 타이머 클록: ${fam.clock.label}`;$('timer-clock').min=fam.clock.minHz;$('timer-clock').max=fam.clock.maxHz;$('timer-clock-hint').textContent=`새 프로젝트: HSI ${fam.clock.defaultHz/1e6} MHz · PLL OFF · AHB/APB 분주 1 · 설정 범위 ${fam.clock.label}. 예제와 저장된 설정은 각 프로젝트 값을 사용합니다.`;
    $('pinout-pins').innerHTML=[...fam.gpioPins].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true})).map(pin=>{const value=config.pins[pin];return `<button class="pin-tile ${pin===this.pin?'selected':''} ${value&&!['Reset','Reserved'].includes(value.function)?'enabled':''} ${value?.function==='Reserved'?'reserved':''}" data-config-pin="${pin}"><strong>${pin}</strong><small>${esc(value?.function||'Reset')}</small></button>`;}).join('');
    $('pinout-pins').querySelectorAll('button').forEach(b=>b.onclick=()=>{this.sync();this.pin=b.dataset.configPin;this.render();});
    $('pinout-properties').innerHTML=`<h3>${this.pin}</h3><label>용도<select id="pin-function">${pinFunctions(this.pin,config.family).map(v=>`<option ${p.function===v?'selected':''}>${v}</option>`).join('')}</select></label><label>Pull<select id="pin-pull">${['NOPULL','PULLUP','PULLDOWN'].map(v=>`<option ${p.pull===v?'selected':''}>${v}</option>`).join('')}</select></label><label>EXTI 에지<select id="pin-edge">${['FALLING','RISING','CHANGE'].map(v=>`<option ${p.edge===v?'selected':''}>${v}</option>`).join('')}</select></label><label>초기 출력<select id="pin-level"><option value="0">LOW</option><option value="1" ${p.initial?'selected':''}>HIGH</option></select></label><label>사용자 라벨<input id="pin-label" maxlength="40" value="${esc(p.label)}" placeholder="예: LD2"></label><p>GPIO_EXTI는 ${irqForPin(this.pin)}를 사용합니다. NVIC에서 활성화하세요.</p>`;
    for(const id of ['pin-function','pin-pull','pin-edge','pin-level'])$(id).onchange=()=>{this.sync();this.render();};
    $('pin-function').onchange=()=>{const previousFunction=this.draft.pins[this.pin]?.function??'Reset';this.sync();const previous=structuredClone(this.draft);previous.pins[this.pin].function=previousFunction;const fn=this.draft.pins[this.pin].function,id=serialFunction(fn);try{if(id){assignSerialPin(this.draft,id,fn.endsWith('_TX')?'TX':'RX',this.pin,fam.serial);alignSerialRemap(this.draft,id,this.pin);this.draft=setSerialEnabled(this.draft,id,true,fam.serial,fam.remaps?.[id]);}
      // A CK pin means synchronous mode: the USART is turned on with its TX/RX (the CK's remap group on F1).
      else if(/^USART\d_CK$/.test(fn)){const usart=fn.slice(0,-3);this.draft.peripherals[usart]={...this.draft.peripherals[usart],enabled:true,mode:'synchronous'};alignSerialRemap(this.draft,usart,this.pin);this.draft=setSerialEnabled(this.draft,usart,true,fam.serial,fam.remaps?.[usart]);}
      // Choosing a peripheral signal for a pin turns that peripheral on, as the serial pins already do.
      else{const owner=fn.split('_')[0];if(!MODES.includes(fn)&&routesOf(this.draft.family)[owner]&&!this.draft.peripherals[owner]?.enabled)this.draft.peripherals[owner]={...this.draft.peripherals[owner],enabled:true};}
      this.render();}catch(e){this.draft=previous;this.render();$('pinout-errors').textContent=e.message;}};
    $('pinout-peripherals').innerHTML=Object.keys(routesOf(config.family)).map(id=>{
      const c=config.peripherals[id]||{enabled:false},defaults=isTimer(id)?timerDefaults(id,config.family):null,timerMax=id=>fam.timerMax(id),fields=isSerial(id)?[['baud','Baud rate',115200]]:id==='I2C1'||id==='SPI1'?[['clock','Clock (Hz)',id==='I2C1'?100000:1000000]]:isTimer(id)?[['prescaler','Prescaler (PSC)',defaults.prescaler,65535],['period','Period (ARR)',defaults.period,timerMax(id)],...(c.mode==='pwm'?[['pulse','초기 Pulse (CCR)',defaults.pulse,timerMax(id)]]:[])]:[];
      const syncMode=c.mode==='synchronous',ck=fam.usartCk[id],ckFn=id+'_CK',ckPin=Object.keys(config.pins).find(pin=>config.pins[pin].function===ckFn);
      const syncUi=ck?`<label>모드<select data-serial-mode="${id}" aria-label="${id} 모드" ${c.enabled?'':'disabled'}><option value="asynchronous">Asynchronous (HAL_UART)</option><option value="synchronous" ${syncMode?'selected':''}>Synchronous (HAL_USART)</option></select></label>`+(syncMode?`<label>CK 핀<select data-serial-ck="${id}" aria-label="${id} CK 핀"><option value="">선택…</option>${ck.map(pin=>{const other=config.pins[pin]?.function,busy=other&&other!=='Reset'&&other!==ckFn;return `<option value="${pin}" ${pin===ckPin?'selected':''} ${busy?'disabled':''}>${pin}${busy?' · '+esc(other)+' 사용 중':''}</option>`;}).join('')}</select></label>`+[['cpol','CPOL',['LOW','HIGH']],['cpha','CPHA',['1EDGE','2EDGE']],['lastBit','Last bit clock',['DISABLE','ENABLE']]].map(([key,label,names])=>`<label>${label}<select data-usart-param="${id}" data-key="${key}" aria-label="${id} ${label}">${names.map((n,v)=>`<option value="${v}" ${(c[key]??0)===v?'selected':''}>${n}</option>`).join('')}</select></label>`).join(''):''):'';
      const routing=isSerial(id)?`<small class="serial-mode-note">${syncMode?'Synchronous · HAL_USART · CK 클록 출력':'Asynchronous · HAL_UART'} · ${f1?'AFIO 리맵 핀 묶음':'AF'+serialAf(id)}${id==='USART2'&&!syncMode?' · 내장 ST-LINK VCP: 별도 부품 없이 하단 직렬 모니터 탭 연결':''}</small>`+syncUi+['TX','RX'].map(role=>{
        const fn=id+'_'+role,current=Object.keys(config.pins).find(pin=>config.pins[pin].function===fn);
        return `<label>${role} 핀<select data-serial-route="${id}" data-role="${role}" aria-label="${id} ${role} 핀" ${c.enabled?'':'disabled'}><option value="">선택…</option>${fam.serial[id][role].map(pin=>{const other=config.pins[pin]?.function,busy=other&&other!=='Reset'&&other!==fn;return `<option value="${pin}" ${pin===current?'selected':''} ${busy?'disabled':''}>${pin}${busy?' · '+esc(other)+' 사용 중':''}</option>`;}).join('')}</select></label>`;
      }).join(''):'';
      return `<section class="peripheral-card"><label class="check-label"><input type="checkbox" data-peripheral="${id}" ${c.enabled?'checked':''}>${id}</label>${routing}${isTimer(id)?`<label>동작 모드<select data-timer-mode="${id}">${Object.entries(TIMER_MODES).map(([mode,label])=>`<option value="${mode}" ${(c.mode??'base')===mode?'selected':''}>${label}</option>`).join('')}</select></label>`:''}${fields.map(([key,label,value,max])=>`<label>${label}<input type="number" data-peripheral-value="${id}" data-key="${key}" aria-label="${id} ${label}" value="${numberText(c[key]??value)}" min="0" ${max===undefined?'':`max="${max}"`} step="1"></label>`).join('')}${isTimer(id)?`<small class="serial-mode-note">${timerHint(id,c,fam.timerMax(id))}</small>`:''}</section>`;
    }).join('')+this.dmaCard(config);
    this.bindDma(config);
    $('pinout-peripherals').querySelectorAll('[data-serial-mode]').forEach(el=>el.onchange=()=>{this.sync();const id=el.dataset.serialMode,c=config.peripherals[id]??={enabled:true};if(el.value==='synchronous'){c.mode='synchronous';c.cpol??=0;c.cpha??=0;c.lastBit??=0;const tx=Object.keys(config.pins).find(p=>config.pins[p].function===id+'_TX'),group=fam.remaps?.[id]?.find(o=>o.pins.TX===tx&&o.pins.CK),pin=[...(group?[group.pins.CK]:[]),...fam.usartCk[id]].find(p=>!config.pins[p]||config.pins[p].function==='Reset');if(pin)config.pins[pin]={function:id+'_CK',pull:'NOPULL',edge:'FALLING',initial:0,label:''};}else{delete c.mode;delete c.cpol;delete c.cpha;delete c.lastBit;for(const [pin,p]of Object.entries(config.pins))if(p.function===id+'_CK')config.pins[pin]={...p,function:'Reset',label:''};}this.render();});
    $('pinout-peripherals').querySelectorAll('[data-serial-ck]').forEach(el=>el.onchange=()=>{this.sync();const id=el.dataset.serialCk;for(const [pin,p]of Object.entries(config.pins))if(p.function===id+'_CK')config.pins[pin]={...p,function:'Reset',label:''};if(el.value)config.pins[el.value]={function:id+'_CK',pull:'NOPULL',edge:'FALLING',initial:0,label:''};this.render();});
    $('pinout-peripherals').querySelectorAll('[data-usart-param]').forEach(el=>el.onchange=()=>{config.peripherals[el.dataset.usartParam][el.dataset.key]=Number(el.value);});
    $('pinout-peripherals').querySelectorAll('[data-peripheral]').forEach(el=>el.onchange=()=>{this.sync();const id=el.dataset.peripheral;try{if(isSerial(id)&&!el.checked){for(const [pin,p]of Object.entries(config.pins))if(p.function===id+'_CK')config.pins[pin]={...p,function:'Reset',label:''};delete config.peripherals[id]?.mode;}if(isSerial(id))this.draft=setSerialEnabled(config,id,el.checked,fam.serial,fam.remaps?.[id]);else config.peripherals[id]={...config.peripherals[id],enabled:el.checked};this.render();}catch(e){this.render();$('pinout-errors').textContent=e.message;}});
    $('pinout-peripherals').querySelectorAll('[data-serial-route]').forEach(el=>el.onchange=()=>{this.sync();try{assignSerialPin(config,el.dataset.serialRoute,el.dataset.role,el.value,fam.serial);alignSerialRemap(config,el.dataset.serialRoute,el.value);this.render();}catch(e){this.render();$('pinout-errors').textContent=e.message;}});
    $('pinout-peripherals').querySelectorAll('[data-timer-mode]').forEach(el=>el.onchange=()=>{
      this.sync();const id=el.dataset.timerMode,c=config.peripherals[id]??={enabled:false},pulse=c.pulse??timerDefaults(id,config.family).pulse;
      if(c.mode==='pwm'&&el.value!=='pwm'&&(!Number.isInteger(pulse)||pulse<0||pulse>fam.timerMax(id))){
        el.value='pwm';$('pinout-errors').textContent=`${id} 초기 Pulse (CCR): ${Number.isFinite(pulse)?`0~${fam.timerMax(id)} 범위의 정수를 입력하세요.`:'숫자를 입력하세요.'}`;return;
      }
      c.mode=el.value;if(el.value==='encoder')c.prescaler=0;this.render();
    });
    $('pinout-peripherals').querySelectorAll('[data-peripheral-value]').forEach(el=>el.onchange=()=>{const id=el.dataset.peripheralValue;config.peripherals[id]??={enabled:false};config.peripherals[id][el.dataset.key]=numberInput(el);const note=el.closest('.peripheral-card').querySelector('.serial-mode-note');if(isTimer(id)&&note)note.textContent=timerHint(id,config.peripherals[id],fam.timerMax(id));});
    $('pinout-nvic').innerHTML=irqNamesOf(config.family).map(irq=>{const c=config.nvic[irq]||{enabled:false,priority:0};return `<label class="irq-row"><input type="checkbox" data-irq="${irq}" ${c.enabled?'checked':''}><span>${irq}</span><input type="number" min="0" max="15" value="${numberText(c.priority)}" data-priority="${irq}" aria-label="${irq} 우선순위"></label>`;}).join('');
    $('pinout-nvic').querySelectorAll('[data-irq]').forEach(el=>el.onchange=()=>{config.nvic[el.dataset.irq]={...config.nvic[el.dataset.irq],enabled:el.checked,priority:config.nvic[el.dataset.irq]?.priority??0};});
    $('pinout-nvic').querySelectorAll('[data-priority]').forEach(el=>el.onchange=()=>{config.nvic[el.dataset.priority]??={enabled:false};config.nvic[el.dataset.priority].priority=numberInput(el);});
    $('timer-clock').value=numberText(config.timerClockHz);$('timer-clock').onchange=()=>config.timerClockHz=numberInput($('timer-clock'));
    $('pinout-errors').textContent=configProblems(config).join('\n');
    $('pinout-summary').textContent=`${Object.values(config.pins).filter(p=>!['Reset','Reserved'].includes(p.function)).length}개 핀 활성 · ${[...new Set(Object.entries(config.peripherals).filter(([,p])=>p.enabled).map(([id])=>'HAL_'+(isSerial(id)?'UART':id.replace(/\d$/,''))))].join(' · ')||'HAL_GPIO'}`;
  }
}
