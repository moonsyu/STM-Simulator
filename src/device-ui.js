import {DEVICE_DEFS,DEVICE_RANGES,DEVICE_ADDRESSES,ldrResistance,ntcResistance} from './device-defs.js';

const names={lux:'조도 (lux)',temperature:'주변 온도 (°C)',humidity:'상대 습도 (%)',ax:'가속도 X (g)',ay:'가속도 Y (g)',az:'가속도 Z (g)',gx:'자이로 X (°/s)',gy:'자이로 Y (°/s)',gz:'자이로 Z (°/s)',axisX:'X 축 (%)',axisY:'Y 축 (%)',position:'회전 위치 (칸)',switch:'버튼 누름',motion:'움직임 감지'};
export function deviceControls(p){
 let html='';
 if(DEVICE_ADDRESSES[p.type])html+=`<label for="extra-address">I²C 주소</label><select id="extra-address" data-part-prop="address" data-live="false">${DEVICE_ADDRESSES[p.type].map(n=>`<option value="${n}" ${n===p.address?'selected':''}>0x${n.toString(16).toUpperCase()}</option>`).join('')}</select>`;
 for(const [key,[min,max]]of Object.entries(DEVICE_RANGES[p.type]||{})){
  html+=`<label for="extra-${key}">${names[key]}</label>`;
  if(['switch','motion'].includes(key))html+=`<select id="extra-${key}" data-part-prop="${key}" data-live="true"><option value="0" ${!p[key]?'selected':''}>${key==='switch'?'놓음':'감지 없음'}</option><option value="1" ${p[key]?'selected':''}>${key==='switch'?'누름':'움직임 감지'}</option></select>`;
  else {const type=key==='position'||key==='lux'?'number':'range',step=['ax','ay','az'].includes(key)?.1:1;
   html+=`<input id="extra-${key}" data-part-prop="${key}" data-live="true" type="${type}" min="${min}" max="${max}" step="${step}" value="${p[key]}"><output id="output-${key}">${type==='range'?p[key]:''}</output>`;
  }
 }
 return html;
}
export function deviceReadouts(p,r){
 if(!DEVICE_DEFS[p.type]||!r)return '';
 const value=n=>Number(n??0).toFixed(1),power=r.powered?'전원 연결됨':'전원과 GND를 확인하세요.';
 let detail='';
 if(['ldr','ntc'].includes(p.type))return `<p>센서 저항 <b>${Math.round(p.type==='ldr'?ldrResistance(p.lux):ntcResistance(p.temperature)).toLocaleString()} Ω</b></p>`;
 if(p.type==='servo')detail=r.on?`각도 ${value(r.angle)}° · 목표 ${value(r.target)}° · 펄스 ${value(r.pulse)} µs`:'유효한 PWM 신호 대기 · 50 Hz / 1~2 ms, PWM 파형 설정을 확인하세요.';
 if(p.type==='motor')detail=`${value(r.rpm)} rpm · ${r.direction>0?'정회전':r.direction<0?'역회전':'정지'}`;
 if(p.type==='stepper')detail=`${r.steps??0} 스텝 · ${value(r.angle)}°${r.invalidStep?' · 상 순서 오류':''}`;
 if(p.type==='relay')detail=`COM ↔ ${r.contact??'NC'} 접점 연결`;
 if(p.type==='pir')detail=r.motion?'움직임 감지 · OUT HIGH':'감지 없음 · OUT LOW';
 if(p.type==='joystick')detail=`X ${value(r.x)} V · Y ${value(r.y)} V · 버튼 ${r.pressed?'누름':'놓음'}`;
 if(p.type==='encoder')detail=`A=${r.a??1} B=${r.b??1} · 남은 전이 ${r.pending??0}`;
 if(['oled','tft','matrix'].includes(p.type))detail=r.visible?'수신한 화면 데이터 표시 중':'디스플레이 초기화 / 화면 켜기 명령을 확인하세요.';
 if(['sht31','mpu6050'].includes(p.type))detail='HAL 측정값은 하단 로그, 전송 내역은 통신 탭에서 확인하세요.';
 return `<p>${power}</p><p>${detail}</p>`;
}
const text=(y,value,cls='')=>`<text class="${cls}" y="${y}" text-anchor="middle" font-size="9" fill="#def0e7">${value}</text>`;
const screen=(w,h,scale=1)=>`<foreignObject x="${-w*scale/2}" y="${-h*scale/2}" width="${w*scale}" height="${h*scale}" pointer-events="none"><canvas xmlns="http://www.w3.org/1999/xhtml" class="device-screen" width="${w}" height="${h}" style="display:block;width:100%;height:100%;image-rendering:pixelated;background:#0b171d"></canvas></foreignObject>`;
export function deviceShape(p){
 if(!DEVICE_DEFS[p.type])return '';
 if(['ldr','ntc'].includes(p.type))return `<circle r="19" fill="${p.type==='ldr'?'#dcae62':'#506b7d'}" stroke="#785940" stroke-width="2"/>${p.type==='ldr'?'<path d="M-10 -10H8V-5H-8V0H8V5H-8V10H10" stroke="#6b4834" stroke-width="2" fill="none"/>':text(3,'NTC')}<text class="device-label" y="32" text-anchor="middle" font-size="10" fill="#456151"></text>`;
 if(['oled','tft','matrix'].includes(p.type)){
  const tft=p.type==='tft',matrix=p.type==='matrix',w=tft?144:matrix?82:144,h=tft?183:matrix?88:88;
  return `<rect x="${-w/2}" y="${-h/2}" width="${w}" height="${h}" rx="5" fill="#345e53" stroke="#24473d"/>${[-1,1].map(a=>`<circle cx="${a*(w/2-5)}" cy="${-h/2+5}" r="2" fill="#c5b684"/>`).join('')}${screen(tft?128:matrix?8:128,tft?160:matrix?8:64,matrix?8:1)}${text(h/2-3,p.type==='oled'?'SSD1306':p.type==='tft'?'ST7735 · RGB565':'MAX7219')}`;
 }
 if(['servo','motor','stepper'].includes(p.type))return `<rect x="-39" y="-30" width="78" height="49" rx="7" fill="${p.type==='servo'?'#6685a9':'#718477'}" stroke="#384f50"/><circle cy="-7" r="19" fill="#d4d3b8" stroke="#516663"/><g class="device-rotor"><path d="M0 -7L0 -23" stroke="#454f51" stroke-width="6" stroke-linecap="round"/><circle cy="-7" r="4" fill="#eceadc"/></g>${text(16,p.type==='servo'?'SERVO':p.type==='motor'?'DC + DRIVER':'STEPPER')}${text(-36,'','device-label')}`;
 if(p.type==='relay')return `<rect x="-42" y="-27" width="84" height="47" rx="5" fill="#3b7669"/><rect x="-34" y="-20" width="31" height="31" rx="3" fill="#7396b9"/>${text(2,'','device-label')}<path d="M5 0H15M29 -13H37M29 10H37" stroke="#e4d699" stroke-width="2"/><path class="relay-contact" d="M15 0L29 10" stroke="#e4d699" stroke-width="3"/>`;
 if(p.type==='joystick'||p.type==='encoder')return `<rect x="-34" y="-27" width="68" height="47" rx="5" fill="#456d5f"/><circle cy="-6" r="20" fill="#a5aba0"/><g class="device-knob"><circle cy="-6" r="15" fill="#303e42"/><path d="M0 -6V-18" stroke="#b2c2b5" stroke-width="3"/></g>${text(18,p.type==='joystick'?'X / Y / SW':'A / B / SW')}`;
 return `<rect x="-41" y="-27" width="82" height="46" rx="5" fill="#42766b" stroke="#315b52"/>${p.type==='pir'?'<circle cy="-10" r="17" fill="#e0e6d6" stroke="#a3bda8"/>':'<rect x="-15" y="-20" width="30" height="16" rx="3" fill="#2f4448"/>'}${text(-7,p.type==='pir'?'':p.type.toUpperCase())}${text(13,'','device-label')}<circle class="device-power" cx="-32" cy="-18" r="3" fill="#758e82"/>`;
}
// Paint only when device memory/configuration or power changes, not at every simulation step.
export function updateDeviceSvg(g,p,r){
 if(!DEVICE_DEFS[p.type])return;
 g.querySelector('.device-power')?.setAttribute('fill',r?.powered?'#8cf2ae':'#758e82');
 const label=g.querySelector('.device-label');
 if(label)label.textContent=({ldr:`${p.lux} lux`,ntc:`${p.temperature} °C`,sht31:`${p.temperature} °C · ${p.humidity}%`,mpu6050:`${p.ax}, ${p.ay}, ${p.az} g`,pir:r?.motion?'감지됨':'감지 대기',servo:`${(r?.angle??90).toFixed(0)}°`,motor:`${(r?.rpm??0).toFixed(0)} rpm`,stepper:`${r?.steps??0} steps`})[p.type]??'';
 g.querySelector('.device-rotor')?.setAttribute('transform',`rotate(${r?.angle??(p.type==='servo'?90:0)} 0 -7)`);
 g.querySelector('.relay-contact')?.setAttribute('d',r?.on?'M15 0L29 -13':'M15 0L29 10');
 g.querySelector('.device-knob')?.setAttribute('transform',p.type==='joystick'?`translate(${(p.axisX-50)*.16} ${(p.axisY-50)*.16})`:`rotate(${p.position*18} 0 -6)`);
 const canvas=g.querySelector('.device-screen');if(!canvas)return;
 const s=r?.device,key=`${s?.version??0}:${!!r?.visible}`;if(canvas.dataset.frame===key)return;canvas.dataset.frame=key;
 const ctx=canvas.getContext('2d'),frame=ctx.createImageData(canvas.width,canvas.height);
 for(let y=0;y<canvas.height;y++)for(let x=0;x<canvas.width;x++){
  let color=[11,23,29];
  if(s&&r.visible){
   if(p.type==='tft'){let c=s.ram[y*128+x];if(s.invert)c^=65535;color=[(c>>11)*255/31,((c>>5)&63)*255/63,(c&31)*255/31];}
   if(p.type==='oled'){const xx=s.remap?127-x:x,yy=((s.flip?63-y:y)+s.startLine-s.offset+64)&63;let lit=s.all||!!(s.ram[(yy>>3)*128+xx]&(1<<(yy&7)));if(s.invert)lit=!lit;if(lit)color=[110,170+s.contrast/3,185+s.contrast/4];}
   if(p.type==='matrix'&&(s.test||(y<=s.scan&&(s.ram[y]&(128>>x)))))color=[160+s.intensity*6,49,42];
  }
  const i=(y*canvas.width+x)*4;frame.data.set([...color,255],i);
 }
 ctx.putImageData(frame,0,0);
}
