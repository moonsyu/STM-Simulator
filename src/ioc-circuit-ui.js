// The dialog of feature 13: the parts a Pinout suggests (ioc-circuit.js), ticked by default, and what is left out with
// the reason. Applying replaces the project's circuit with the chosen parts on the breadboard (undo with Ctrl+Z).
import {suggestCircuit,buildCircuit} from './ioc-circuit.js';
import {esc} from './common.js';

const $=id=>document.getElementById(id);

/** Opens the dialog for `mcu`; `o` = {getProject, apply(project), log(message, type), intro?}. Returns false when nothing can be made. */
export function offerCircuit(mcu,o){
  const list=suggestCircuit(mcu),made=list.filter(s=>!s.skipped);
  if(!made.length){o.log?.('이 핀 설정으로 만들 부품이 없습니다(출력·입력·ADC·PWM·I2C·SPI·UART 핀이 있으면 부품을 제안합니다).');return false;}
  const dialog=$('ioc-circuit-dialog'),hasCircuit=o.getProject().components.length>0;
  $('ioc-circuit-intro').textContent=(o.intro??'')+'핀 기능과 라벨로 고른 부품입니다. 필요한 것만 남기고 적용하면 빵판에 놓고 배선합니다.';
  $('ioc-circuit-list').innerHTML=made.map((s,i)=>`<label class="check-label"><input type="checkbox" data-ioc-part="${i}" checked><span>${esc(s.title)}${s.note?`<small>${esc(s.note)}</small>`:''}</span></label>`).join('')
    +(list.length>made.length?`<details><summary>부품을 만들지 않는 핀 ${list.length-made.length}개</summary>${list.filter(s=>s.skipped).map(s=>`<p><strong>${esc(s.title)}</strong><br><small>${esc(s.skipped)}</small></p>`).join('')}</details>`:'');
  $('ioc-circuit-replace').hidden=!hasCircuit;$('ioc-circuit-error').textContent='';
  $('ioc-circuit-cancel').onclick=()=>dialog.close();
  $('ioc-circuit-apply').onclick=()=>{
    try{
      const chosen=made.filter((_,i)=>dialog.querySelector(`[data-ioc-part="${i}"]`).checked);
      if(!chosen.length)throw new Error('부품을 하나 이상 고르세요.');
      const next=buildCircuit(o.getProject(),chosen);o.apply(next);dialog.close();
    }catch(e){$('ioc-circuit-error').textContent=e.message;}
  };
  dialog.showModal();return true;
}
