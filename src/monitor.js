import {GPIO_PINS} from './pins.js';
import {waveSvg} from './trace.js';
const $=id=>document.getElementById(id);
export class Monitor {
  constructor(options){
    Object.assign(this,options);this.events=[];this.view='log';this.lastPaint=0;this.dirty=true;
    // Each bottom-panel tab owns the element `${name}-panel` (the output log is #console-output).
    const panelOf=name=>name==='log'?$('console-output'):$(name+'-panel');
    this.select=name=>{const button=document.querySelector(`[data-monitor="${name}"]`);if(!button)return false;this.view=name;document.querySelectorAll('[data-monitor]').forEach(b=>{b.classList.toggle('active',b===button);const panel=panelOf(b.dataset.monitor);if(panel)panel.hidden=b!==button;});if(this.view==='log')$('console-output').scrollTop=$('console-output').scrollHeight;this.dirty=true;this.render();return true;};
    document.querySelector('.monitor-tabs').addEventListener('click',e=>{const button=e.target.closest('[data-monitor]');if(button)this.select(button.dataset.monitor);});
    ['PA5','PA10','PA0','PC13'].forEach((pin,i)=>{const select=$('channel-'+i);select.innerHTML=GPIO_PINS.map(p=>`<option ${pin===p?'selected':''}>${p}</option>`).join('');select.onchange=()=>{this.getSession()?.wave.setChannels(this.channels());this.dirty=true;this.render();};});
    $('wave-window').onchange=()=>{this.dirty=true;this.render();};
    $('wave-clear').onclick=()=>{this.getSession()?.wave.clear();this.dirty=true;this.render();};
    const settings=()=>this.onSettings({stepMs:Number($('sim-resolution').value),pwmWaveform:$('pwm-waveform').checked});
    $('sim-resolution').onchange=settings;$('pwm-waveform').onchange=settings;
    $('wave-export').onclick=async()=>{try{const session=this.getSession();if(!session?.wave.samples.length)throw new Error('먼저 시뮬레이션을 실행해 파형을 기록하세요.');const text=session.wave.csv();if(window.desktop?.exportCsv)await window.desktop.exportCsv(text);else{const url=URL.createObjectURL(new Blob([text],{type:'text/csv;charset=utf-8'})),link=document.createElement('a');link.href=url;link.download='stm-simulator-waveform.csv';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}}catch(error){this.onError(error.message);}};
    $('serial-send').onclick=()=>{try{if(!this.isRunning())throw new Error('시뮬레이션을 먼저 실행하세요.');const session=this.getSession();if(!session)throw new Error('빌드가 끝나고 실행이 시작된 뒤에 보내세요.');const text=$('serial-input').value+($('serial-newline').checked?'\n':'');if(!text)throw new Error('전송할 문자를 입력하세요.');const count=session.inject(text,$('serial-target').value);if(!count)throw new Error($('serial-target').value==='USART2'?'USART2 PA2/TX·PA3/RX 설정과 HAL_UART_Init() 실행을 확인하세요.':'외부 UART 장치의 전원·TX/RX 교차 배선·통신 속도를 확인하세요.');$('serial-input').value='';$('serial-feedback').textContent='';this.trace({micros:session.runtime.microTime,protocol:'INPUT',message:`${count} B → ${$('serial-target').selectedOptions[0].textContent}`});}catch(error){this.onError(error.message);$('serial-feedback').textContent=error.message;}};
    $('serial-target').onchange=()=>{$('serial-feedback').textContent='';this.dirty=true;this.render();};
    $('serial-input').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();$('serial-send').click();}};
  }
  channels(){return Array.from({length:4},(_,i)=>$('channel-'+i).value);}
  settings(value){$('sim-resolution').value=String(value?.stepMs??1);$('pwm-waveform').checked=value?.pwmWaveform??false;}
  clear(){this.events=[];this.dirty=true;$('serial-feedback').textContent='';$('bus-events').textContent='';$('uart-output').textContent='';$('wave-svg').textContent='시뮬레이션을 실행하면 파형이 표시됩니다.';}
  trace(event){this.events.push(event);if(this.events.length>250)this.events.shift();this.dirty=true;}
  render(){
    const running=this.isRunning(),board=$('serial-target').value.startsWith('board:');$('sim-resolution').disabled=running;$('pwm-waveform').disabled=running;$('serial-send').disabled=!running||!$('serial-target').value||board;
    if(!this.dirty&&performance.now()-this.lastPaint<100)return;this.lastPaint=performance.now();this.dirty=false;
    const session=this.getSession();
    if(this.view==='wave'){
      if(session)$('wave-svg').innerHTML=waveSvg(session.wave,Number($('wave-window').value));
      $('wave-count').textContent=session?`${session.wave.samples.length.toLocaleString()}개 기록${session.wave.dropped?' · 이전 기록 순환 삭제':''}`:'기록 없음';
    }
    if(this.view==='bus'){
      $('bus-events').replaceChildren(...this.events.slice(-60).map(event=>{const row=document.createElement('div');row.textContent=`${(event.micros/1000).toFixed(3)} ms  ${event.protocol}  ${event.message}`;return row;}));$('bus-events').scrollTop=$('bus-events').scrollHeight;
      // ESP32 / Raspberry Pi boards: what the board program prints (fixed run; input is not sent to them).
      const board=$('serial-target').value.startsWith('board:')?session?.circuit?.drivers?.find(d=>d.part.id===$('serial-target').value.slice(6)):null;
      if($('serial-target').value.startsWith('board:'))$('uart-output').textContent=board?`${board.part.name} · Serial (USB) · ${board.outputLabel??'고정 실행 출력'}
${board.output??''}`:'이 보드는 이번 실행에 포함되지 않았습니다.';
      else $('uart-output').textContent=session?($('serial-target').value==='USART2'?`ST-LINK VCP · USART2 · ${session.buses.uart.baud} baud\n${session.buses.vcpOutput||''}`:[...session.buses.received.entries()].map(([id,text])=>`${session.project.components.find(p=>p.id===id)?.name}: ${text}`).join('\n')):'';
    }
  }
}
