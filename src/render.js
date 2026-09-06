import {PINS,HOLES,BB,endpointInfo} from './pins.js';
import {terminalKeys,localTerminals,nominalTerminals,rotatePoint,attachments,PART_DEFS} from './components.js';
import {extraShape,updateExtraSvg} from './part-render.js';
export const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const text=(x,y,s,size=10,color='#4a6e87',other='')=>`<text x="${x}" y="${y}" font-size="${size}" fill="${color}" ${other}>${esc(s)}</text>`;
const rect=(x,y,w,h,fill,rx=0,extra='')=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" ${extra}/>`;
function chip(x,y,w,h){let pins='';for(let i=0;i<16;i++){const d=(i+1)*(w-8)/17;pins+=rect(x+4+d,y-6,2,8,'#a9b4b7')+rect(x+4+d,y+h-2,2,8,'#a9b4b7')+rect(x-6,y+4+d,8,2,'#a9b4b7')+rect(x+w-2,y+4+d,8,2,'#a9b4b7');}return pins+rect(x,y,w,h,'#27303a',4,'stroke="#111b25" stroke-width="2"')+`<circle cx="${x+7}" cy="${y+7}" r="2" fill="#5d6c75"/>`;}
function button(x,y,color,id,label){return `<g data-button="${id}" class="board-button">${rect(x-19,y-19,38,38,'#c7cdcc',4,'stroke="#8c999d"')}<circle cx="${x}" cy="${y}" r="14" fill="${color}" stroke="#233744" stroke-width="2"/>${[[-14,-14],[14,-14],[-14,14],[14,14]].map(([dx,dy])=>`<circle cx="${x+dx}" cy="${y+dy}" r="2.5" fill="#303b40"/>`).join('')}${text(x,y+31,label,8,'#3f6684','text-anchor="middle"')}</g>`;}
export function boardSvg(){
 let s=`<g class="board"><path d="M59 48H471Q485 48 485 62V216H326Q315 216 315 224Q315 232 326 232H485V565Q485 580 470 580H67L45 559V232H178Q187 232 187 224Q187 216 178 216H45V63Q45 48 59 48Z" fill="url(#pcb)" stroke="#cad4d7" stroke-width="1.3" filter="url(#shadow)"/>`;
 s+=rect(305,35,58,54,'#b9975c',3,'stroke="#846b40" stroke-width="2"')+rect(313,41,42,35,'#dab879',2)+rect(322,43,6,23,'#866a3d',1)+rect(340,43,6,23,'#866a3d',1);
 s+=text(305,103,'USB · ST-LINK',9)+text(85,77,'ST-LINK / V2-1',11)+chip(232,128,55,55)+rect(173,130,25,59,'#dfe2dc',12,'stroke="#abb7b8"');
 s+=rect(112,94,13,61,'#242f38',2)+rect(77,99,12,91,'#2b3741',2);
 for(let i=0;i<6;i++)s+=rect(80,105+i*14,5,5,'#c9ad62',1);
 for(let i=0;i<34;i++){const x=306+(i%9)*16,y=121+Math.floor(i/9)*22;s+=rect(x,y,8,13,i%4?'#cbbd95':'#677379',1)+rect(x,y,8,2,'#c4ccd0')+rect(x,y+11,8,2,'#c4ccd0');}
 s+=text(440,192,'DBG',12,'#34749c','text-anchor="middle"');
 s+=button(212,255,'#2d8bc5','USER','USER · PC13')+button(327,255,'#29333b','RESET','RESET');
 for(const [x,y]of [[111,257],[420,258],[161,563],[362,563]])s+=`<circle cx="${x}" cy="${y}" r="9" fill="#ecf1f3" stroke="#c7d1d5"/>`;
 s+=text(170,311,'NUCLEO-F446RE',13,'#406b88','font-weight="700"');
 s+=chip(219,415,77,77)+text(258,449,'STM32',11,'#a9b8c2','text-anchor="middle"')+text(258,467,'F446RE',9,'#889ca9','text-anchor="middle"');
 s+=rect(192,332,35,29,'#303d46',2)+rect(235,331,19,30,'#d5b86b',2)+rect(286,325,21,28,'#384951',2)+rect(322,338,18,15,'#ccbb89',2);
 for(let i=0;i<20;i++){const x=177+(i%5)*33,y=379+Math.floor(i/5)*9;s+=rect(x,y,12,5,i%3?'#cbbb92':'#79898a',1);}
 s+=rect(249,514,47,17,'#e8e6d7',9,'stroke="#d0cec0"')+text(320,543,'GPIO',12,'#397999');
 s+=`<circle id="builtin-led" cx="294" cy="354" r="5" fill="#89a486" stroke="#6c886b"/>`+text(305,357,'LD2 · PA5',7);
 s+=text(164,551,'MB1136',8)+text(202,574,'STM32 Nucleo-64',8);
 // Header wells are computed from the exact same pin list as interaction and simulation.
 for(const name of ['CN7','CN10','CN6','CN8','CN5','CN9']){
   const group=PINS.filter(p=>p.header===name),xs=group.map(p=>p.x),ys=group.map(p=>p.y);const x=Math.min(...xs),y=Math.min(...ys),w=Math.max(...xs)-x+14,h=Math.max(...ys)-y+14;
   s+=rect(x-7,y-7,w,h,'#22303a',2)+text(name==='CN7'?x-3:name==='CN10'?x-2:x,y-13,name,7,'#63829a');
 }
 for(const p of PINS){const morph=['CN7','CN10'].includes(p.header);s+=rect(p.x-3.4,p.y-3.4,6.8,6.8,morph?'#c7ad6c':'#101c26',1,'stroke="#4e5960" stroke-width=".5"');if(!morph)s+=text(p.x+(p.x<250?12:-12),p.y+3,p.label,8,'#496b84',`text-anchor="${p.x<250?'start':'end'}"`);}
 return s+'</g>';
}
export function breadboardSvg(){
 let s=`<g class="breadboard">${rect(BB.x,BB.y,BB.w,BB.h,'url(#plastic)',6,'stroke="#cbd1d4" filter="url(#shadow)"')}`;
 s+=rect(BB.x+157,BB.startY-12,13,436,'#dce3e5',3)+rect(BB.x+160,BB.startY-9,6,429,'#d0d9dc',2);
 for(const [x,sign,color]of [[BB.x+12,'+','#d87565'],[BB.x+48,'−','#6c9eca'],[BB.x+290,'+','#d87565'],[BB.x+326,'−','#6c9eca']]){
   s+=`<path d="M${x} ${BB.startY-10}V${BB.startY+425}" stroke="${color}" stroke-width="1.5"/>`+text(x,BB.startY-20,sign,15,color,'text-anchor="middle"');
 }
 for(let i=0;i<10;i++)s+=text(BB.x+86+i*14+(i>=5?28:0),BB.startY-21,'abcdefghij'[i],9,'#63737f','text-anchor="middle"');
 for(let r=1;r<=30;r++){const y=BB.startY+(r-1)*14;s+=text(BB.x+69,y+3,r,7,'#a0a9ae','text-anchor="end"')+text(BB.x+285,y+3,r,7,'#a0a9ae','text-anchor="start"');}
 for(const h of HOLES)s+=rect(h.x-4.2,h.y-4.2,8.4,8.4,'#dde1e0',1)+rect(h.x-2.4,h.y-2.4,4.8,4.8,'#62717a',.5,`class="hole" data-hole="${h.id}"`);
 s+=text(BB.x+BB.w/2,BB.y+BB.h-20,'400 POINTS  /  30 ROWS',9,'#9aa7ae','text-anchor="middle" letter-spacing="1.2"');
 return s+'</g>';
}
export function initSvg(svg){svg.innerHTML=`<defs><linearGradient id="pcb" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#fff"/><stop offset="1" stop-color="#edf1ef"/></linearGradient><linearGradient id="plastic" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#fffefa"/><stop offset="1" stop-color="#f0f0e9"/></linearGradient><filter id="shadow" x="-20%" y="-10%" width="145%" height="140%"><feDropShadow dx="0" dy="6" stdDeviation="5" flood-color="#536c7b" flood-opacity=".16"/></filter><filter id="led-glow" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="6"/></filter></defs><g id="surface">${boardSvg()}${breadboardSvg()}${text(46,32,'01  /  MICROCONTROLLER',9,'#8395a3','letter-spacing="1.6"')}${text(BB.x,51,'02  /  BREADBOARD',9,'#8395a3','letter-spacing="1.6"')}<g id="wire-layer"></g><g id="endpoint-layer"></g><g id="part-layer"></g><g id="search-layer" pointer-events="none"></g><g id="preview-layer" pointer-events="none"></g>${text(48,710,'2핀: 두 연결점 클릭  /  다핀: 모형을 끌어 설치  /  R: 45° 회전  /  Esc: 선택 삭제',10,'#a0afb9','pointer-events="none"')}</g>`;}
export function route(a,b){const mid=a.x+(b.x-a.x)*.47;return `M${a.x} ${a.y} L${mid} ${a.y} L${mid} ${b.y} L${b.x} ${b.y}`;}
export function renderWires(project,selected){return project.wires.map(w=>{
  const a=endpointInfo(w.from,project.components),b=endpointInfo(w.to,project.components);if(!a||!b)return '';
  const d=route(a,b);return `<g class="${selected?.type==='wire'&&selected.id===w.id?'wire-selected':''}" data-wire="${w.id}"><path d="${d}" stroke="#0d25331a" stroke-width="6" class="wire-visible" transform="translate(0 2)"/><path d="${d}" stroke="${w.color}" stroke-width="3.5" class="wire-visible"/><path d="${d}" class="wire-hit"/><circle cx="${a.x}" cy="${a.y}" r="3" fill="${w.color}"/><circle cx="${b.x}" cy="${b.y}" r="3" fill="${w.color}"/></g>`;
}).join('');}
export const LED_COLORS={red:'#f05a4b',green:'#65c668',blue:'#53a8f7',yellow:'#f4c941'};
export function renderParts(project,selected,result,pressed){const ordered=[...project.components.filter(p=>selected?.id!==p.id),...project.components.filter(p=>selected?.id===p.id)];return ordered.map(p=>{
 const x=p.x,y=p.y,angle=p.rotation,terms=localTerminals(p),nominal=nominalTerminals(p),half=Math.min(18,Math.max(4,(p.span??70)/2-4));
 let shape=extraShape(p,result);
 if(p.type==='resistor')shape=rect(-half,-7,half*2,14,'#ddc394',4,'stroke="#9f895f"')+[-.6,-.2,.25,.7].map((v,i)=>rect(v*half,-7,Math.min(3,half/5),14,['#c26839','#bf6638','#805139','#d7b543'][i])).join('');
 if(p.type==='led'){const color=LED_COLORS[p.color],on=result?.parts[p.id]?.on;shape=`<circle class="led-glow" r="23" fill="${color}" opacity="${on?.6:0}" filter="url(#led-glow)"/><circle class="led-lens" r="12" fill="${on?color:'#704b4c'}" stroke="${color}" stroke-width="2"/><ellipse cx="-4" cy="-4" rx="3" ry="4" fill="#fff" opacity=".3"/><path d="M8 -8V8" stroke="#421e26" stroke-width="2"/>`+text(-18,-13,'+',10,color)+text(15,-13,'−',10,color);}
 if(p.type==='button')shape=rect(-16,-11,32,22,'#a1adb3',3,'stroke="#6d7f8b"')+`<circle class="switch-cap" r="9" fill="${pressed[p.id]?'#168775':'#354857'}" stroke="#233541" stroke-width="2"/>`;
 if(p.type==='lcd'){
   shape=rect(-121,-46,242,84,'#286e61',4,'stroke="#184a40" stroke-width="2"')+rect(-110,-34,220,57,'#213950',4)+rect(-103,-27,206,43,'#9ba958',2)+text(0,-9,'LCD 1602',13,'#394721','text-anchor="middle" font-family="monospace"')+text(0,7,'16 PIN MODEL',9,'#4b572e','text-anchor="middle" font-family="monospace"');
   for(const xx of [-114,114])for(const yy of [-39,31])shape+=`<circle cx="${xx}" cy="${yy}" r="3" fill="#e6d395"/>`;
   shape+=text(-105,34,'1',7,'#d0e7df')+text(105,34,'16',7,'#d0e7df','text-anchor="end"');
 }
 const label=['resistor','potentiometer'].includes(p.type)?`${p.name} · ${p.value>=1000?(p.value/1000)+' kΩ':p.value+' Ω'}`:p.type==='capacitor'?`${p.name} · ${p.value} µF`:p.name;
 const radians=angle*Math.PI/180,lcdHeight=Math.abs(Math.sin(radians))*121+Math.abs(Math.cos(radians))*46;
 const labelY=Math.min(y-(p.type==='lcd'?lcdHeight+14:PART_DEFS[p.type]?42:27),...terminalKeys(p).map(key=>endpointInfo(`part:${p.id}:${key}`,project.components).y-13));
 const leads=terms.map((t,i)=>{const end=endpointInfo(`part:${p.id}:${t.key}`,project.components);let root;
   if(p.type==='button')root=rotatePoint(Math.sign(t.x)*14,Math.sign(t.y)*9,angle);
   else if(p.type==='lcd')root=rotatePoint(t.x,35,angle);
   else if(p.type==='sevenseg')root=rotatePoint(t.x,Math.sign(t.y)*27,angle);
   else if(PART_DEFS[p.type]?.labels)root=rotatePoint(t.x,p.type==='ultrasonic'?22:14,angle);
   else if(['capacitor','diode','buzzer'].includes(p.type))root=rotatePoint(Math.sign(t.x)*(p.type==='buzzer'?16:12),0,angle);
   else root=rotatePoint(Math.sign(t.x)*(p.type==='led'?10:half),0,angle);
   return `<path d="M${x+root.x} ${y+root.y}L${nominal[i].x} ${nominal[i].y}L${end.x} ${end.y}" fill="none" stroke="#708c9b" stroke-width="3" stroke-linejoin="round"/><circle class="part-contact" cx="${end.x}" cy="${end.y}" r="3" fill="${attachments(p)[t.key]?'#20a985':'#bdcdd5'}" stroke="#607d8d"/>`;
 }).join('');
 const hits=terminalKeys(p).map(key=>{const e=endpointInfo(`part:${p.id}:${key}`,project.components);return `<circle cx="${e.x}" cy="${e.y}" r="5.5" data-endpoint="${e.id}" class="pin-hit part-pin"/>`;}).join('');
 return `<g data-part="${p.id}" data-rotation="${angle}" data-mounted="${Object.keys(attachments(p)).length}" class="${selected?.type==='part'&&selected.id===p.id?'part-selected':''}">${leads}<g class="part-body" transform="translate(${x} ${y}) rotate(${angle})">${shape}</g>${text(x,labelY,label,9,'#496477','text-anchor="middle" pointer-events="none"')}${hits}</g>`;
}).join('');}
export function renderEndpoints(project,pending){return [...PINS,...HOLES].map(e=>`<circle cx="${e.x}" cy="${e.y}" r="6.5" data-endpoint="${e.id}" class="pin-hit ${pending===e.id?'pending':''}"/>`).join('');}
export function renderMountPreview(mount){return mount?mount.points.map(h=>`<circle cx="${h.x}" cy="${h.y}" r="6" fill="#24b78b44" stroke="#159b73" stroke-width="1.6"/>`).join(''):'';}
export function renderPinSearch(pins,selectedId=null){return [...pins.filter(p=>p.id!==selectedId),...pins.filter(p=>p.id===selectedId)].map(p=>{
 const selected=p.id===selectedId,x=p.x<260?p.x+24:p.x-154;
 return `<g data-search-highlight="${p.id}" data-selected="${selected}"><title>${esc(`${selected?'선택됨: ':''}${p.header}-${p.number} · ${p.signal}`)}</title><circle cx="${p.x}" cy="${p.y}" r="${selected?16:9}" fill="${selected?'#2786d744':'#ffda6120'}" stroke="${selected?'#1979cc':'#e7a71f'}" stroke-width="${selected?3:1.5}"/>${selected?`<circle cx="${p.x}" cy="${p.y}" r="7" fill="#1979cc" stroke="white" stroke-width="2"/><path d="M${p.x} ${p.y-16}V${p.y-33}H${x+65}" fill="none" stroke="#1979cc" stroke-width="1.5"/>${rect(x,p.y-57,130,24,'#1764a4',5)}${text(x+65,p.y-41,`${p.header}-${p.number} · ${p.signal}`,10,'white','text-anchor="middle" font-weight="700"')}`:`<circle cx="${p.x}" cy="${p.y}" r="3" fill="#ffe389"/>`}</g>`;
 }).join('');}
export function updateSimulationSvg(svg,project,result,pressed){
 for(const p of project.components){const g=svg.querySelector(`[data-part="${p.id}"]`);if(!g)continue;
   updateExtraSvg(g,p,result?.fault?null:result?.parts[p.id]);
   if(p.type==='led'){const on=!result?.fault&&result?.parts[p.id]?.on;g.querySelector('.led-lens')?.setAttribute('fill',on?LED_COLORS[p.color]:'#704b4c');g.querySelector('.led-glow')?.setAttribute('opacity',on?'.6':'0');}
   if(p.type==='button')g.querySelector('.switch-cap')?.setAttribute('fill',pressed[p.id]?'#168775':'#354857');
 }
 const on=result&&!result.fault&&result.voltage('signal:PA5')>1.8,led=svg.querySelector('#builtin-led');led.setAttribute('fill',on?'#64e66b':'#89a486');led.style.filter=on?'drop-shadow(0 0 5px #59dc65)':'';
}
