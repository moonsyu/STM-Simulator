import {L298_MODES} from './l298n.js';
export function l298Shape(p){
 if(p.type==='l298n')return `<rect x="-82" y="-56" width="164" height="112" rx="5" fill="#ac4840" stroke="#703b35" stroke-width="2"/><rect x="-30" y="-32" width="60" height="49" rx="3" fill="#263139"/>${[-20,-10,0,10,20].map(x=>`<path d="M${x} -28V13" stroke="#59636a" stroke-width="4"/>`).join('')}<text y="30" text-anchor="middle" font-size="12" fill="white">L298N</text><circle class="l298-power" cx="46" cy="-20" r="4" fill="#68443e"/>${[[-56,-46,'VM'],[0,-46,'GND'],[56,-46,'5V'],[-70,54,'ENA'],[-42,54,'IN1'],[-14,54,'IN2'],[14,54,'IN3'],[42,54,'IN4'],[70,54,'ENB'],[-63,-18,'OUT1'],[-63,24,'OUT2'],[63,-18,'OUT3'],[63,24,'OUT4']].map(([x,y,label])=>`<text x="${x}" y="${y}" font-size="8" text-anchor="middle" fill="#fff1cf">${label}</text>`).join('')}`;
 if(p.type==='dc_motor')return '<rect x="-28" y="-27" width="56" height="49" rx="10" fill="#afbbc1" stroke="#5a707a"/><circle cy="-7" r="18" fill="#e0dcc0" stroke="#75847c"/><g class="device-rotor"><path d="M0 -7V-22" stroke="#536564" stroke-width="5"/><circle cy="-7" r="4" fill="#eff0da"/></g><text y="19" text-anchor="middle" font-size="8" fill="#2d4849">DC 12V</text><text class="dc-rpm" y="-34" text-anchor="middle" font-size="9" fill="#3c605c">0 rpm</text>';
 if(p.type==='dc_supply')return `<rect x="-28" y="-24" width="56" height="48" rx="5" fill="#49687c" stroke="#233d4d"/><text y="-7" text-anchor="middle" fill="#d3efbb" font-size="12">${p.voltage} V</text><text y="13" text-anchor="middle" fill="white" font-size="9">+ DC −</text>`;
 return '';
}
export function updateL298Svg(g,p,r){
 if(p.type==='l298n')g.querySelector('.l298-power')?.setAttribute('fill',r?.powered?'#82eaa5':'#68443e');
 if(p.type==='dc_motor'){
  g.querySelector('.device-rotor')?.setAttribute('transform',`rotate(${r?.angle??0} 0 -7)`);
  const label=g.querySelector('.dc-rpm');if(label)label.textContent=`${(r?.rpm??0).toFixed(0)} rpm`;
 }
}
export function l298Readouts(p,r){
 if(p.type==='l298n')return `<p>${r.powered?'모터·논리 전원 연결됨':'VM·5V·공통 GND를 확인하세요.'}</p>${Object.entries(r.channels??{}).map(([name,c])=>`<p>채널 ${name}: <b>${L298_MODES[c.mode]}</b></p>`).join('')}<p>PWM 중에는 현재 순간의 출력 상태를 표시합니다.</p>`;
 if(p.type==='dc_motor')return `<p><b>${(r.rpm??0).toFixed(1)} rpm</b> · ${r.direction>0?'정회전':r.direction<0?'역회전':'정지'}</p><p>${L298_MODES[r.mode]??'단자 전압 구동'} · 단자 전압 ${r.voltage.toFixed(2)} V</p>`;
 if(p.type==='dc_supply')return `<p>설정 ${p.voltage} V · 공급 전류 ${Math.abs(r.current).toFixed(3)} A</p>`;
 return '';
}
