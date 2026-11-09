// Pinout DAC card (CubeMX Analog › DAC: OUT1 / OUT2 Configuration and Parameter Settings). Ticking a channel puts its
// pin (PA4 DAC_OUT1, PA5 DAC_OUT2) in analog mode as CubeMX does; trigger, output buffer and wave are per channel.
import {DAC_TRIGGERS,DAC_WAVES,dacAmplitudeName} from './dac-config.js';
import {esc} from './common.js';

const PIN={OUT1:'PA4',OUT2:'PA5'};
const sel=(ch,key,label,options,value,disabled=false)=>`<label>${label}<select data-dac="${ch}" data-key="${key}" aria-label="DAC ${ch} ${label}" ${disabled?'disabled':''}>${options.map(([v,t])=>`<option value="${v}" ${String(value)===String(v)?'selected':''}>${t}</option>`).join('')}</select></label>`;

export function dacFields(config,c){
  return ['OUT1','OUT2'].map(ch=>{
    const pin=PIN[ch],fn=config.pins[pin]?.function,on=fn==='DAC_'+ch,busy=fn&&!['Reset','DAC_'+ch].includes(fn),cc=c.channels?.[ch]??{},trigger=cc.trigger??'NONE',wave=cc.wave??'NONE';
    let html=`<fieldset class="tim-channel"><legend><label class="check-label"><input type="checkbox" data-dac-pin="${ch}" ${on?'checked':''} ${busy?'disabled':''}>${ch} Configuration · ${pin}${busy?` · ${esc(fn)} 사용 중`:''}</label></legend>`;
    if(on){
      html+=sel(ch,'trigger','Trigger',Object.entries(DAC_TRIGGERS),trigger)+sel(ch,'buffer','Output Buffer',[['true','Enable'],['false','Disable']],cc.buffer!==false)
        +sel(ch,'wave','Wave generation mode',Object.entries(DAC_WAVES),wave,trigger==='NONE');
      if(wave!=='NONE')html+=sel(ch,'amplitude',wave==='TRIANGLE'?'Maximum Triangle Amplitude':'Mask selection',Array.from({length:12},(_,n)=>[n,dacAmplitudeName(wave,n).replace(/^DAC_/,'')]),cc.amplitude??0);
      const timer=/^T(\d)_TRGO$/.exec(trigger)?.[1];
      html+=`<small class="serial-mode-note">${trigger==='NONE'?'HAL_DAC_SetValue 값이 바로 출력됩니다':timer?`TIM${timer}의 Trigger Event Selection을 Update Event로 두면 갱신마다 출력 · DMA(DAC${ch.slice(3)})로 표 출력`:trigger==='SOFTWARE'?'HAL_DAC_Start 때와 SWTRIGR를 쓸 때 출력':'EXTI 9번 줄의 엣지마다 출력'} · ${pin} = 값/4095 × 3.3 V</small>`;
    }
    return html+'</fieldset>';
  }).join('');
}

/** Binds the DAC card; `before` syncs the open pin panel, `after` redraws the Pinout. */
export function bindDac(root,config,before,after){
  const dac=()=>config.peripherals.DAC??={enabled:true};
  root.querySelectorAll('[data-dac-pin]').forEach(el=>el.onchange=()=>{before();const ch=el.dataset.dacPin,pin=PIN[ch];
    if(el.checked)config.pins[pin]={function:'DAC_'+ch,pull:'NOPULL',edge:'FALLING',initial:0,label:config.pins[pin]?.label??''};
    else{config.pins[pin]={...config.pins[pin],function:'Reset',label:''};const c=dac();if(c.channels){delete c.channels[ch];if(!Object.keys(c.channels).length)delete c.channels;}}
    after();});
  root.querySelectorAll('[data-dac]').forEach(el=>el.onchange=()=>{before();const c=dac(),ch=el.dataset.dac,k=el.dataset.key,o=(c.channels??={})[ch]??={};
    if(k==='trigger'){if(el.value==='NONE'){delete o.trigger;delete o.wave;delete o.amplitude;}else o.trigger=el.value;}
    else if(k==='buffer'){if(el.value==='false')o.buffer=false;else delete o.buffer;}
    else if(k==='wave'){if(el.value==='NONE'){delete o.wave;delete o.amplitude;}else{o.wave=el.value;o.amplitude??=0;}}
    else o.amplitude=Number(el.value);
    if(!Object.keys(o).length)delete c.channels[ch];if(!Object.keys(c.channels).length)delete c.channels;after();});
}
