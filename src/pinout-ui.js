import {isTimer,TIMER_MODES} from './timer-config.js';
import {GPIO_PINS} from './pins.js';
import {ROUTES,defaultMcu,validateMcu,configProblems,pinFunctions,irqForPin,IRQ_NAMES,generateHal} from './mcu-config.js';
import {SERIAL_ROUTES,isSerial,serialAf,serialFunction,assignSerialPin,setSerialEnabled} from './serial-config.js';
const $=id=>document.getElementById(id),esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export class PinoutPanel {
  constructor({getProject,apply,isRunning,onError}){
    Object.assign(this,{getProject,apply,isRunning,onError});this.pin='PA5';
    $('pinout-open').onclick=()=>this.open();$('pinout-close').onclick=()=>$('pinout-dialog').close();
    $('pinout-apply').onclick=()=>this.commit(false);$('hal-generate').onclick=()=>{if(this.isRunning())return;this.sync();if(this.getProject().code.trim())$('hal-replace-dialog').showModal();else this.commit(true);};
    $('hal-replace-cancel').onclick=()=>$('hal-replace-dialog').close();$('hal-replace-confirm').onclick=()=>{$('hal-replace-dialog').close();this.commit(true);};
  }
  open(pin){if(this.isRunning())return;if(GPIO_PINS.includes(pin))this.pin=pin;this.draft=structuredClone(this.getProject().mcu||defaultMcu());this.render();$('pinout-dialog').showModal();}
  sync(){if(!$('pin-function'))return;this.draft.pins[this.pin]={function:$('pin-function').value,pull:$('pin-pull').value,edge:$('pin-edge').value,initial:Number($('pin-level').value),label:$('pin-label').value.trim()};}
  commit(generate){try{this.sync();const mcu=validateMcu(this.draft),code=generate?generateHal(mcu):null;this.apply({mcu,code});$('pinout-dialog').close();}catch(e){$('pinout-errors').textContent=e.message;this.onError(e.message);}}
  render(){
    const config=this.draft,p=config.pins[this.pin]||{function:'Reset',pull:'NOPULL',edge:'FALLING',label:'',initial:0};
    $('pinout-pins').innerHTML=[...GPIO_PINS].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true})).map(pin=>{const value=config.pins[pin];return `<button class="pin-tile ${pin===this.pin?'selected':''} ${value&&!['Reset','Reserved'].includes(value.function)?'enabled':''} ${value?.function==='Reserved'?'reserved':''}" data-config-pin="${pin}"><strong>${pin}</strong><small>${esc(value?.function||'Reset')}</small></button>`;}).join('');
    $('pinout-pins').querySelectorAll('button').forEach(b=>b.onclick=()=>{this.sync();this.pin=b.dataset.configPin;this.render();});
    $('pinout-properties').innerHTML=`<h3>${this.pin}</h3><label>용도<select id="pin-function">${pinFunctions(this.pin).map(v=>`<option ${p.function===v?'selected':''}>${v}</option>`).join('')}</select></label><label>Pull<select id="pin-pull">${['NOPULL','PULLUP','PULLDOWN'].map(v=>`<option ${p.pull===v?'selected':''}>${v}</option>`).join('')}</select></label><label>EXTI 에지<select id="pin-edge">${['FALLING','RISING','CHANGE'].map(v=>`<option ${p.edge===v?'selected':''}>${v}</option>`).join('')}</select></label><label>초기 출력<select id="pin-level"><option value="0">LOW</option><option value="1" ${p.initial?'selected':''}>HIGH</option></select></label><label>사용자 라벨<input id="pin-label" maxlength="40" value="${esc(p.label)}" placeholder="예: LD2"></label><p>GPIO_EXTI는 ${irqForPin(this.pin)}를 사용합니다. NVIC에서 활성화하세요.</p>`;
    for(const id of ['pin-function','pin-pull','pin-edge','pin-level'])$(id).onchange=()=>{this.sync();this.render();};
    $('pin-function').onchange=()=>{const previous=structuredClone(this.draft);this.sync();const fn=this.draft.pins[this.pin].function,id=serialFunction(fn);try{if(id){assignSerialPin(this.draft,id,fn.endsWith('_TX')?'TX':'RX',this.pin);this.draft=setSerialEnabled(this.draft,id,true);}this.render();}catch(e){this.draft=previous;this.render();$('pinout-errors').textContent=e.message;}};
    $('pinout-peripherals').innerHTML=Object.keys(ROUTES).map(id=>{
      const c=config.peripherals[id]||{enabled:false},fields=isSerial(id)?[['baud','Baud rate',115200]]:id==='I2C1'||id==='SPI1'?[['clock','Clock (Hz)',id==='I2C1'?100000:1000000]]:isTimer(id)?[['prescaler','Prescaler',8399],['period','Period (ARR)',999]]:[];
      const routing=isSerial(id)?`<small class="serial-mode-note">Asynchronous · HAL_UART · AF${serialAf(id)}</small>`+['TX','RX'].map(role=>{
        const fn=id+'_'+role,current=Object.keys(config.pins).find(pin=>config.pins[pin].function===fn);
        return `<label>${role} 핀<select data-serial-route="${id}" data-role="${role}" aria-label="${id} ${role} 핀" ${c.enabled?'':'disabled'}><option value="">선택…</option>${SERIAL_ROUTES[id][role].map(pin=>{const other=config.pins[pin]?.function,busy=other&&other!=='Reset'&&other!==fn;return `<option value="${pin}" ${pin===current?'selected':''} ${busy?'disabled':''}>${pin}${busy?' · '+esc(other)+' 사용 중':''}</option>`;}).join('')}</select></label>`;
      }).join(''):'';
      return `<section class="peripheral-card"><label class="check-label"><input type="checkbox" data-peripheral="${id}" ${c.enabled?'checked':''}>${id}</label>${routing}${isTimer(id)?`<label>동작 모드<select data-timer-mode="${id}">${Object.entries(TIMER_MODES).map(([mode,label])=>`<option value="${mode}" ${(c.mode??'base')===mode?'selected':''}>${label}</option>`).join('')}</select></label>`:''}${fields.map(([key,label,value])=>`<label>${label}<input type="number" data-peripheral-value="${id}" data-key="${key}" value="${c[key]??value}" min="0"></label>`).join('')}</section>`;
    }).join('');
    $('pinout-peripherals').querySelectorAll('[data-peripheral]').forEach(el=>el.onchange=()=>{this.sync();const id=el.dataset.peripheral;try{if(isSerial(id))this.draft=setSerialEnabled(config,id,el.checked);else config.peripherals[id]={...config.peripherals[id],enabled:el.checked};this.render();}catch(e){this.render();$('pinout-errors').textContent=e.message;}});
    $('pinout-peripherals').querySelectorAll('[data-serial-route]').forEach(el=>el.onchange=()=>{this.sync();try{assignSerialPin(config,el.dataset.serialRoute,el.dataset.role,el.value);this.render();}catch(e){this.render();$('pinout-errors').textContent=e.message;}});
    $('pinout-peripherals').querySelectorAll('[data-timer-mode]').forEach(el=>el.onchange=()=>{const id=el.dataset.timerMode;config.peripherals[id]??={enabled:false};config.peripherals[id].mode=el.value;if(el.value==='encoder')config.peripherals[id].prescaler=0;this.render();});
    $('pinout-peripherals').querySelectorAll('[data-peripheral-value]').forEach(el=>el.onchange=()=>{const id=el.dataset.peripheralValue;config.peripherals[id]??={enabled:false};config.peripherals[id][el.dataset.key]=Number(el.value);});
    $('pinout-nvic').innerHTML=IRQ_NAMES.map(irq=>{const c=config.nvic[irq]||{enabled:false,priority:0};return `<label class="irq-row"><input type="checkbox" data-irq="${irq}" ${c.enabled?'checked':''}><span>${irq}</span><input type="number" min="0" max="15" value="${c.priority}" data-priority="${irq}" aria-label="${irq} 우선순위"></label>`;}).join('');
    $('pinout-nvic').querySelectorAll('[data-irq]').forEach(el=>el.onchange=()=>{config.nvic[el.dataset.irq]={...config.nvic[el.dataset.irq],enabled:el.checked,priority:config.nvic[el.dataset.irq]?.priority??0};});
    $('pinout-nvic').querySelectorAll('[data-priority]').forEach(el=>el.onchange=()=>{config.nvic[el.dataset.priority]??={enabled:false};config.nvic[el.dataset.priority].priority=Number(el.value);});
    $('timer-clock').value=config.timerClockHz;$('timer-clock').onchange=()=>config.timerClockHz=Number($('timer-clock').value);
    $('pinout-errors').textContent=configProblems(config).join('\n');
    $('pinout-summary').textContent=`${Object.values(config.pins).filter(p=>!['Reset','Reserved'].includes(p.function)).length}개 핀 활성 · ${[...new Set(Object.entries(config.peripherals).filter(([,p])=>p.enabled).map(([id])=>'HAL_'+(isSerial(id)?'UART':id.replace(/\d$/,''))))].join(' · ')||'HAL_GPIO'}`;
  }
}
