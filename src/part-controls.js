import {PART_DEFS} from './components.js';
const number=(key,label,value,min,max,live=false,type='number')=>`<label for="extra-${key}">${label}</label><input id="extra-${key}" data-part-prop="${key}" data-live="${live}" type="${type}" min="${min}" max="${max}" step="${type==='range'?1:'any'}" value="${value}"><output id="output-${key}">${type==='range'?value:''}</output>`;
export function partControls(p,running){
 const def=PART_DEFS[p.type];if(!def)return '';
 let controls='';
 if(['capacitor','potentiometer'].includes(p.type))controls+=number('value',p.type==='capacitor'?'용량 (µF)':'전체 저항 (Ω)',p.value,p.type==='capacitor'?.001:1,p.type==='capacitor'?100000:1e7);
 if(p.type==='potentiometer')controls+=number('position','가변 접점 위치 (%)',p.position,0,100,true,'range');
 if(p.type==='temperature')controls+=number('temperature','주변 온도 (°C)',p.temperature,-40,125,true,'range');
 if(p.type==='ultrasonic')controls+=number('distance','물체까지 거리 (cm)',p.distance,2,400,true,'range');
 if(p.type==='slide')controls+=`<label for="extra-position">연결 방향</label><select id="extra-position" data-part-prop="position" data-live="true"><option value="0" ${p.position===0?'selected':''}>COM ↔ A</option><option value="1" ${p.position===1?'selected':''}>COM ↔ B</option></select>`;
 if(running)controls=controls.replaceAll('data-live="false"','data-live="false" disabled');
 return `${controls?`<div class="inspector-card part-controls">${controls}</div>`:''}<p>${def.help}</p><div id="part-live"></div>`;
}
export function partReadouts(p,result){
 const read=result?.parts[p.id];if(!read)return '';
 if(p.type==='potentiometer'){const v=result.voltage(`part:${p.id}:p2`),base=result.voltage(`part:${p.id}:p1`);return `<p>가변 접점 전압 (1 기준): <b>${v!=null&&base!=null?(v-base).toFixed(3)+' V':'—'}</b></p>`;}
 if(['temperature','ultrasonic'].includes(p.type))return `<p>${read.powered?'전원 연결됨':'전원 전압 또는 배선을 확인하세요.'}${p.type==='temperature'&&read.powered?` · 출력 ${read.voltage.toFixed(3)} V`:''}</p>`;
 if(read.channels)return `<div class="channel-readouts">${Object.entries(read.channels).map(([key,value])=>`<span>${key.toUpperCase()} <b>${(value.current*1000).toFixed(2)} mA</b></span>`).join('')}</div>`;
 if(p.type==='buzzer')return `<p>${read.on?'부저 동작 중':'부저 꺼짐'} · 상단 소리 버튼으로 음향을 켤 수 있습니다.</p>`;
 return '';
}
