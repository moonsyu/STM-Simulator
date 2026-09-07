import {GPIO_PINS} from './pins.js';
import {waveSvg} from './trace.js';
const $=id=>document.getElementById(id);
export class Monitor {
  constructor(options){
    Object.assign(this,options);this.events=[];this.view='log';this.lastPaint=0;this.dirty=true;
    document.querySelectorAll('[data-monitor]').forEach(button=>button.onclick=()=>{this.view=button.dataset.monitor;document.querySelectorAll('[data-monitor]').forEach(b=>b.classList.toggle('active',b===button));$('console-output').hidden=this.view!=='log';$('wave-panel').hidden=this.view!=='wave';$('bus-panel').hidden=this.view!=='bus';this.dirty=true;this.render();});
    ['PA5','PA10','PA0','PC13'].forEach((pin,i)=>{const select=$('channel-'+i);select.innerHTML=GPIO_PINS.map(p=>`<option ${pin===p?'selected':''}>${p}</option>`).join('');select.onchange=()=>{this.getSession()?.wave.setChannels(this.channels());this.dirty=true;this.render();};});
    $('wave-window').onchange=()=>{this.dirty=true;this.render();};
    $('wave-clear').onclick=()=>{this.getSession()?.wave.clear();this.dirty=true;this.render();};
    const settings=()=>this.onSettings({stepMs:Number($('sim-resolution').value),pwmWaveform:$('pwm-waveform').checked});
    $('sim-resolution').onchange=settings;$('pwm-waveform').onchange=settings;
    $('wave-export').onclick=async()=>{try{const session=this.getSession();if(!session?.wave.samples.length)throw new Error('먼저 시뮬레이션을 실행해 파형을 기록하세요.');const text=session.wave.csv();if(window.desktop?.exportCsv)await window.desktop.exportCsv(text);else{const url=URL.createObjectURL(new Blob([text],{type:'text/csv;charset=utf-8'})),link=document.createElement('a');link.href=url;link.download='stm-emulator-waveform.csv';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}}catch(error){this.onError(error.message);}};
    $('serial-send').onclick=()=>{try{if(!this.isRunning())throw new Error('시뮬레이션을 먼저 실행하세요.');const session=this.getSession(),text=$('serial-input').value+($('serial-newline').checked?'\n':''),count=session.inject(text,$('serial-target').value);if(!count)throw new Error('UART 전원·TX/RX 연결·통신 속도를 확인하세요.');$('serial-input').value='';this.trace({micros:session.runtime.microTime,protocol:'INPUT',message:`${count} B → ${$('serial-target').value}`});}catch(error){this.onError(error.message);$('serial-feedback').textContent=error.message;}};
    $('serial-input').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();$('serial-send').click();}};
  }
  channels(){return Array.from({length:4},(_,i)=>$('channel-'+i).value);}
  settings(value){$('sim-resolution').value=String(value?.stepMs??1);$('pwm-waveform').checked=value?.pwmWaveform??false;}
  clear(){this.events=[];this.dirty=true;$('serial-feedback').textContent='';$('bus-events').textContent='';$('uart-output').textContent='';$('wave-svg').textContent='시뮬레이션을 실행하면 파형이 표시됩니다.';}
  trace(event){this.events.push(event);if(this.events.length>250)this.events.shift();this.dirty=true;}
  render(){
    const running=this.isRunning();$('sim-resolution').disabled=running;$('pwm-waveform').disabled=running;$('serial-send').disabled=!running||!$('serial-target').value;
    if(!this.dirty&&performance.now()-this.lastPaint<100)return;this.lastPaint=performance.now();this.dirty=false;
    const session=this.getSession();
    if(this.view==='wave'){
      if(session)$('wave-svg').innerHTML=waveSvg(session.wave,Number($('wave-window').value));
      $('wave-count').textContent=session?`${session.wave.samples.length.toLocaleString()}개 기록${session.wave.dropped?' · 이전 기록 순환 삭제':''}`:'기록 없음';
    }
    if(this.view==='bus'){
      $('bus-events').replaceChildren(...this.events.slice(-60).map(event=>{const row=document.createElement('div');row.textContent=`${(event.micros/1000).toFixed(3)} ms  ${event.protocol}  ${event.message}`;return row;}));$('bus-events').scrollTop=$('bus-events').scrollHeight;
      $('uart-output').textContent=session?[...session.buses.received.entries()].map(([id,text])=>`${session.project.components.find(p=>p.id===id)?.name}: ${text}`).join('\n'):'';
    }
  }
}
