import {CATALOG_BY_TYPE,catalogMap} from './catalog-defs.js';
import {l298Readouts} from './l298n-ui.js';
import {deviceControls,deviceReadouts} from './device-ui.js';
import {PART_DEFS} from './components.js';
import {channelLevels,hexColor} from './rgb-color.js';
const esc=t=>String(t).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
// WS2812: the last 24-bit word received on DIN, shown in wire order (G, R, B).
function ws2812Readouts(r){
 if(!r)return '<p>실행하면 DIN으로 받은 색과 G/R/B 값이 표시됩니다.</p>';
 if(!r.powered)return '<p>전원(5V/VCC)과 GND를 확인하세요.</p>';
 const d=r.device;if(!d?.grb)return '<p>전원 연결됨 · 아직 받은 색 데이터가 없습니다. DIN 배선과 WS2812 비트 타이밍(800 kHz)을 확인하세요.</p>';
 const [g,red,b]=d.grb;
 return `<p>받은 색 <span class="rgb-swatch" style="background:rgb(${d.color.join(',')})"></span> <b>${hexColor(d.color)}</b>${d.display?'':' · 꺼짐(0,0,0)'}</p><div class="channel-readouts"><span>G <b>${g}</b></span><span>R <b>${red}</b></span><span>B <b>${b}</b></span></div><p>수신 ${d.frames}회 · 전송 순서 G→R→B</p>`;
}
const number=(key,label,value,min,max,live=false,type='number')=>`<label for="extra-${key}">${label}</label><input id="extra-${key}" data-part-prop="${key}" data-live="${live}" type="${type}" min="${min}" max="${max}" step="${type==='range'?1:'any'}" value="${value}"><output id="output-${key}">${type==='range'?value:''}</output>`;
export function partControls(p,running){
 const variant=CATALOG_BY_TYPE[p.type];if(variant){const family=variant.family,base={...p,type:family};if(family==='resistor')return number('value','저항 (Ω)',p.value,1,1e7)+'<div id="part-live"></div>';if(family==='led')return '<label>LED 색상</label><select data-part-prop="color" data-value-type="string">'+['red','green','blue','yellow'].map(c=>'<option '+(c===p.color?'selected':'')+'>'+c+'</option>').join('')+'</select><div id="part-live"></div>';if(['dht11','dht22'].includes(family))return number('temperature','온도 (°C)',p.temperature,family==='dht11'?0:-40,family==='dht11'?50:80,true)+number('humidity','습도 (%)',p.humidity,family==='dht11'?20:0,family==='dht11'?90:100,true)+'<div id="part-live"></div>';if(family==='rgb'&&!catalogMap(p.type))return '<p>'+variant.appearance+' DIN으로 받은 24비트 색(G→R→B 순서)으로 켜집니다. 공통극 RGB LED처럼 채널별 저항을 연결하지 않습니다.</p><div id="part-live"></div>';if(PART_DEFS[family]){let html=partControls(base,running);if(variant.id.includes('dp3t'))html=html.replace('</select>','<option value="2" '+(p.position===2?'selected':'')+'>COM ↔ C</option></select>');return html+'<p>'+variant.appearance+'</p>';}return '<p>'+variant.appearance+'</p><div id="part-live"></div>';}
 const def=PART_DEFS[p.type];if(!def)return '';
 let controls=deviceControls(p);
 if(p.type==='dc_supply')controls+=number('voltage','출력 전압 (V)',p.voltage,6,24);
 if(p.type==='uart')controls+=number('baud','UART 속도 (baud)',p.baud,300,2000000);
 if(p.type==='i2c')controls+=number('address','I²C 주소 (10진수, 80 = 0x50)',p.address,8,119);
 if(['capacitor','potentiometer'].includes(p.type))controls+=number('value',p.type==='capacitor'?'용량 (µF)':'전체 저항 (Ω)',p.value,p.type==='capacitor'?.001:1,p.type==='capacitor'?100000:1e7);
 if(p.type==='potentiometer')controls+=number('position','가변 접점 위치 (%)',p.position,0,100,true,'range');
 if(p.type==='temperature')controls+=number('temperature','주변 온도 (°C)',p.temperature,-40,125,true,'range');
 if(p.type==='ultrasonic')controls+=number('distance','물체까지 거리 (cm)',p.distance,2,400,true,'range');
 if(p.type==='slide')controls+=`<label for="extra-position">연결 방향</label><select id="extra-position" data-part-prop="position" data-live="true"><option value="0" ${p.position===0?'selected':''}>COM ↔ A</option><option value="1" ${p.position===1?'selected':''}>COM ↔ B</option></select>`;
 if(running)controls=controls.replaceAll('data-live="false"','data-live="false" disabled');
 return `${controls?`<div class="inspector-card part-controls">${controls}</div>`:''}<p>${def.help}</p><div id="part-live"></div>`;
}
export function partReadouts(p,result){
 const variant=CATALOG_BY_TYPE[p.type];if(variant){const r=result?.parts[p.id];if(variant.family==='can')return '<p>CAN 송신 '+(r?.transmitted??0)+'회 · 오류 '+(r?.errors??0)+' · '+(r?.loopback?'내부 루프백':'외부 노드 ACK 필요')+'</p>';if(variant.family==='i2s')return '<p>'+(r?.powered?'전원 연결됨':'전원 확인')+' · '+(r?.frames??0)+' 프레임 · '+(r?.frequency??0)+' Hz</p>';if(['dht11','dht22'].includes(variant.family))return '<p>'+(r?.powered?'전원 연결됨 · 측정값은 HAL 로그에서 확인하세요.':'전원을 확인하세요.')+'</p>';if(variant.id.startsWith('ds18b20'))return '<p>'+(r?.powered?'1-Wire 전원 연결됨 · 변환/CRC 결과는 HAL 로그에서 확인하세요.':'전원을 확인하세요.')+'</p>';if(r?.digits)return '<p>세그먼트: '+r.digits.map(n=>n.toString(16).padStart(2,'0')).join(' ')+'</p>';if(r?.steps!==undefined)return '<p>'+r.steps+' 스텝 · '+r.angle.toFixed(1)+'°</p>';if(variant.family==='rgb'&&!catalogMap(p.type))return ws2812Readouts(r);
  if(variant.id==='lcd-i2c-4')return r?.powered?`<p>전원 연결됨 · ${r.lcd?.visible?'문자 표시 중':'초기화 명령 대기'}</p>${r.lcd?.visible?`<pre class="lcd-readout">${esc(r.lcd.lines.join(String.fromCharCode(10)))}</pre>`:''}`:'<p>전원과 GND를 확인하세요.</p>';
  if(variant.id==='motor-driver-hat')return '<p>'+(r?.powered?'전원 연결됨 · PWM 출력은 연결된 모터의 회전수와 방향으로 확인하세요.':'전원과 GND를 확인하세요.')+'</p>';
  if(variant.id==='encoder-bare-5')return `<p>A=${r?.a??1} B=${r?.b??1} · 버튼 ${r?.pressed?'누름':'놓음'}</p><p>속성의 회전 위치를 바꾸면 A/B 변화가 실행 로그에 표시됩니다.</p>`;
  if(variant.id==='isolated-rs485')return '<p>'+(r?.powered?'전원 연결됨':'전원과 GND를 확인하세요.')+'</p><p>송수신 내용은 하단 통신 탭에서 확인할 수 있습니다.</p>';
  if(variant.id==='stepper-driver-11'&&result){const v=n=>result.voltage(`part:${p.id}:p${n}`)??0,gnd=v(6),supply=v(5)-gnd,inputs=[1,2,3,4].map(n=>v(n)-gnd>=2);return `<p>${supply>=4.5?`V+ <b>${supply.toFixed(1)} V</b>`:'V+(5 V)와 GND를 확인하세요.'}</p><div class="channel-readouts">${inputs.map((on,i)=>`<span>IN${i+1} → M${i+1} <b>${on?'ON':'OFF'}</b></span>`).join('')}</div>`;}
  if(['ads1115-10','mcp4725-6','ds3231-8'].includes(variant.id))return '<p>'+(r?.powered?'전원 연결됨 · 측정값은 실행 로그에서 확인하세요.':'전원과 GND를 확인하세요.')+'</p>';const map=catalogMap(p.type);return partReadouts({...p,type:variant.family},result&&map?{...result,voltage:id=>result.voltage(id.replace(new RegExp('^part:'+p.id+':(.*)$'),(_,key)=>'part:'+p.id+':'+(map[key]||key)))}:result);}
 const read=result?.parts[p.id];if(!read)return '';
 const l298=l298Readouts(p,read);if(l298)return l298;
 const device=deviceReadouts(p,read);if(device)return device;
 if(p.type==='lcd')return `<p>${read.lcd?.powered?'LCD 전원 연결됨':'LCD 5 V 전원을 확인하세요.'} · ${read.lcd?.visible?'문자 표시 중':'디스플레이 초기화·VO 연결을 확인하세요.'}</p>`;
 if(['uart','i2c','spi'].includes(p.type))return `<p>${read.powered?'전원 연결됨':'전원과 GND를 확인하세요.'}</p>${p.type==='uart'?'<p>송수신 내용은 하단 통신 탭에서 확인할 수 있습니다.</p>':`<p>메모리 0x10: ${read.memory?.[16]??0}</p>`}`;
 if(p.type==='potentiometer'){const v=result.voltage(`part:${p.id}:p2`),base=result.voltage(`part:${p.id}:p1`);return `<p>가변 접점 전압 (1 기준): <b>${v!=null&&base!=null?(v-base).toFixed(3)+' V':'—'}</b></p>`;}
 if(['temperature','ultrasonic'].includes(p.type))return `<p>${read.powered?'전원 연결됨':'전원 전압 또는 배선을 확인하세요.'}${p.type==='temperature'&&read.powered?` · 출력 ${read.voltage.toFixed(3)} V`:''}</p>`;
 if(read.channels){const levels=p.type==='rgb'?channelLevels(read.channels):null;return `${levels?`<p>표시 색 <span class="rgb-swatch" style="background:rgb(${levels.join(',')})"></span> <b>${hexColor(levels)}</b></p>`:''}<div class="channel-readouts">${Object.entries(read.channels).map(([key,value])=>`<span>${key.toUpperCase()} <b>${levels?levels['rgb'.indexOf(key)]+' · ':''}${(value.current*1000).toFixed(2)} mA</b></span>`).join('')}</div>`;}
 if(p.type==='buzzer')return `<p>${read.on?'부저 동작 중':'부저 꺼짐'} · 상단 소리 버튼으로 음향을 켤 수 있습니다.</p>`;
 if(p.type==='passive_buzzer')return `<p>${read.on?`수동 부저 동작 중 · <b>${read.frequency.toFixed(1)} Hz</b> · 듀티 ${(read.duty*100).toFixed(1)}%`:'수동 부저 무음 · 배선과 20~2000 Hz 사각파를 확인하세요. DC 전압에서는 지속음이 나지 않습니다.'}</p><p>상단 소리 버튼으로 음향을 켤 수 있습니다.${result&&!read.on?' PWM 사용 시 파형 설정을 켜세요.':''}</p>`;
 return '';
}
