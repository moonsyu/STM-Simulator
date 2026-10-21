import {remodelLegacyShape,updateCatalogView} from './catalog-view.js';
import {displayModel,catalogPadPosition,packageLeadRoot} from './model-geometry.js';
import {isSelected,wirePoints} from './circuit-edit.js';
import {roundedWirePath} from './wire-path.js';
import {PINS,HOLES,FULL_HOLES,BB,FULL_BB,endpointInfo,circuitHoles,breadboardPrefix,breadboardModel,boardPins} from './pins.js';
import {DEFAULT_BOARD_ID,getBoard} from './boards.js';
import {terminalKeys,terminalLabel,localTerminals,nominalTerminals,rotatePoint,attachments,PART_DEFS} from './components.js';
import {extraShape,updateExtraSvg} from './part-render.js';
import {scaleXOf,scaleYOf,partTransform,partVector,surfaceTransform,surfacePoint} from './geometry.js';
export const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const text=(x,y,s,size=10,color='#4a6e87',other='')=>`<text x="${x}" y="${y}" font-size="${size}" fill="${color}" ${other}>${esc(s)}</text>`;
const rect=(x,y,w,h,fill,rx=0,extra='')=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" ${extra}/>`;
function chip(x,y,w,h){let pins='';for(let i=0;i<16;i++){const d=(i+1)*(w-8)/17;pins+=rect(x+4+d,y-6,2,8,'#aeb4b5')+rect(x+4+d,y+h-2,2,8,'#aeb4b5')+rect(x-6,y+4+d,8,2,'#aeb4b5')+rect(x+w-2,y+4+d,8,2,'#aeb4b5');}return pins+rect(x,y,w,h,'#292b2c',2,'stroke="#111718" stroke-width="1.5"')+rect(x+2,y+2,w-4,h-4,'none',1,'stroke="#444849" stroke-width=".7"')+`<circle cx="${x+7}" cy="${y+7}" r="2" fill="#767c7c"/>`;}
function button(x,y,color,id,label){return `<g data-button="${id}" class="board-button">${rect(x-19,y-19,38,38,'#c7cdcc',4,'stroke="#8c999d"')}<circle cx="${x}" cy="${y}" r="14" fill="${color}" stroke="#233744" stroke-width="2"/>${[[-14,-14],[14,-14],[-14,14],[14,14]].map(([dx,dy])=>`<circle cx="${x+dx}" cy="${y+dy}" r="2.5" fill="#303b40"/>`).join('')}${text(x,y+31,label,8,'#3f6684','text-anchor="middle"')}</g>`;}
// Both supported boards are the MB1136 NUCLEO-64; only the MCU label and a few header signals differ.
export function boardSvg(boardId=DEFAULT_BOARD_ID){
 const board=getBoard(boardId)??getBoard(DEFAULT_BOARD_ID);
 let s=`<g class="board" data-board="${board.id}"><path d="M59 48H471Q485 48 485 62V216H326Q315 216 315 224Q315 232 326 232H485V565Q485 580 470 580H67L45 559V232H178Q187 232 187 224Q187 216 178 216H45V63Q45 48 59 48Z" fill="url(#pcb)" stroke="#aeb5b2" stroke-width="1.3" filter="url(#shadow)"/>`;
 // Mini-USB shell, tongue and contact fingers in top view (NUCLEO-F446RE).
 s+=rect(302,62,7,19,'#c8cecc',1)+rect(359,62,7,19,'#c8cecc',1)+rect(305,35,58,54,'#c7cdcc',3,'stroke="#798484" stroke-width="1.5"')+rect(309,39,50,45,'#e8ebea',2,'stroke="#a1aaa8"')+rect(313,35,42,16,'#374142',2)+rect(317,38,34,8,'#111b1d',1)+rect(320,41,28,5,'#9d9e8b',1);
 for(let i=0;i<5;i++)s+=rect(322+i*5,41,2,5,'#dbbc6e',.5);
 s+=rect(315,60,6,13,'#929d9b',1)+rect(347,60,6,13,'#929d9b',1)+`<path d="M326 53h16M326 76h16" stroke="#adb6b4" stroke-width="1.2"/>`;
 s+=text(305,103,'USB · ST-LINK',9)+text(85,77,'ST-LINK / V2-1',11)+chip(232,128,55,55)+rect(173,130,25,59,'#dfe2dc',12,'stroke="#abb7b8"');
 s+=rect(112,94,13,61,'#242f38',2)+rect(77,99,12,91,'#2b3741',2);
 for(let i=0;i<6;i++)s+=rect(80,105+i*14,5,5,'#c9ad62',1);
 for(let i=0;i<34;i++){const x=306+(i%9)*16,y=121+Math.floor(i/9)*22;s+=rect(x,y,8,13,i%4?'#cbbd95':'#677379',1)+rect(x,y,8,2,'#c4ccd0')+rect(x,y+11,8,2,'#c4ccd0');}
 s+=text(440,192,'DBG',12,'#34749c','text-anchor="middle"');
 s+=button(212,255,'#2d8bc5','USER','USER · PC13')+button(327,255,'#29333b','RESET','RESET');
 for(const [x,y]of [[111,257],[420,258],[161,563],[362,563]])s+=`<circle cx="${x}" cy="${y}" r="9" fill="#ecf1f3" stroke="#c7d1d5"/>`;
 s+=chip(219,415,77,77)+text(257.5,459,'ARM '+board.core,5.5,'#949c98','text-anchor="middle"');
 s+=rect(192,332,35,29,'#303d46',2)+rect(235,331,19,30,'#d5b86b',2)+rect(286,325,21,28,'#384951',2)+rect(322,338,18,15,'#ccbb89',2);
 for(let i=0;i<20;i++){const x=177+(i%5)*33,y=379+Math.floor(i/5)*9;s+=rect(x,y,12,5,i%3?'#cbbb92':'#79898a',1);}
 s+=rect(249,514,47,17,'#dce1dc',8,'stroke="#939e99"')+rect(254,517,37,11,'#eff1e9',5);
 s+=`<circle id="builtin-led" cx="294" cy="354" r="5" fill="#89a486" stroke="#6c886b"/>`+text(305,357,'LD2 · PA5',7);
 // Header wells are computed from the exact same pin list as interaction and simulation.
 for(const name of ['CN7','CN10','CN6','CN8','CN5','CN9']){
   const group=PINS.filter(p=>p.header===name),xs=group.map(p=>p.x),ys=group.map(p=>p.y);const x=Math.min(...xs),y=Math.min(...ys),w=Math.max(...xs)-x+14,h=Math.max(...ys)-y+14;
   s+=rect(x-7,y-7,w,h,'#242a2c',1,'stroke="#101819" stroke-width="1"')+rect(x-5.5,y-5.5,w-3,h-3,'none',.5,'stroke="#414a49" stroke-width=".7"')+text(name==='CN7'?x-3:name==='CN10'?x-2:x,y-13,name,7,'#47615e');
 }
 for(const p of boardPins(board.id)){const morph=['CN7','CN10'].includes(p.header);s+=rect(p.x-3.4,p.y-3.4,6.8,6.8,morph?'#b69450':'#535c59',.6,'stroke="#111b1a" stroke-width=".5"')+rect(p.x-2.1,p.y-2.1,4.2,4.2,morph?'#e0c47c':'#101a19',.2);if(morph)s+=rect(p.x-1.5,p.y-1.5,1.3,1.3,'#f6e5a9',0);if(!morph)s+=text(p.x+(p.x<250?12:-12),p.y+3,p.label,8,'#3f625e',`text-anchor="${p.x<250?'start':'end'}"`);}
 return s+'</g>';
}
const holeSvg=(h,prefix)=>rect(h.x-4,h.y-4,8,8,'#cfcbbf',.8)+`<path d="M${h.x-3.6} ${h.y+3.6}h7.2v-7.2" fill="none" stroke="#fff" stroke-width=".9"/>`+rect(h.x-2.4,h.y-2.4,4.8,4.8,'#28332f',.4,`class="hole" data-hole="${prefix+h.id}"`)+rect(h.x-1.7,h.y+1.1,3.4,.7,'#6a746d',.1,'pointer-events="none"');
const sign=(x,y,value,size=14)=>text(x,y,value==='+'?'+':'−',size,value==='+'?'#e0322b':'#2f7fd6','text-anchor="middle" font-weight="700"');
// Dovetail clips on the edges of the plastic body, as on real interlocking boards.
const clip=(x,y,w,h)=>rect(x,y,w,h,'#f1ede3',2,'stroke="#c9c4b6" stroke-width=".8"');
// 400-point half-size board: vertical, rows 1-30, a-e | channel | f-j, + / - rails on both outer sides.
function halfBreadboardSvg(prefix){
 let s='';
 for(const r of [3.5,15.5,27])for(const x of [BB.x-5,BB.x+BB.w-1])s+=clip(x,BB.startY+(r-1)*14-15,6,30);
 s+=rect(BB.x,BB.y,BB.w,BB.h,'url(#plastic)',7,'stroke="#c4bfb1" filter="url(#shadow)" class="breadboard-body"');
 s+=rect(BB.x+4,BB.y+4,BB.w-8,BB.h-8,'none',5,'stroke="#ffffff" stroke-width="1.5"')+rect(BB.x+58,BB.y+10,1.5,BB.h-20,'#dcd7ca',.7)+rect(BB.x+282.5,BB.y+10,1.5,BB.h-20,'#dcd7ca',.7)+rect(BB.x+157,BB.y+10,13,BB.h-20,'#e3dfd3',3)+rect(BB.x+160,BB.y+13,7,BB.h-26,'#f4f1e8',2);
 for(const [x,value]of [[BB.x+12,'+'],[BB.x+48,'-'],[BB.x+290,'+'],[BB.x+326,'-']])s+=`<path d="M${x} ${BB.startY-10}V${BB.startY+416}" stroke="${value==='+'?'#e0322b':'#2f7fd6'}" stroke-width="1.6"/>`;
 s+=sign(BB.x+22,BB.startY-22,'+')+sign(BB.x+36,BB.startY-22,'-')+sign(BB.x+300,BB.startY-22,'+')+sign(BB.x+314,BB.startY-22,'-');
 for(let i=0;i<10;i++)s+=text(BB.x+86+i*14+(i>=5?28:0),BB.startY-20,'abcdefghij'[i],10,'#3d443f','text-anchor="middle" font-weight="600"');
 for(let r=1;r<=30;r++){const y=BB.startY+(r-1)*14;s+=text(BB.x+70,y+3,r,8,'#4f5751','text-anchor="end"')+text(BB.x+272,y+3,r,8,'#4f5751','text-anchor="start"');}
 for(const h of HOLES)s+=holeSvg(h,prefix);
 return s;
}
// 830-point full-size board: horizontal, columns 1-63, a-e | channel | f-j, + / - rails top and bottom.
function fullBreadboardSvg(prefix){
 const F=FULL_BB,x0=F.left,x1=F.left+(F.columns-1)*F.step;let s='';
 for(const cx of [130,330,474,618,818])s+=clip(cx-18,-5,36,6)+clip(cx-18,F.h-1,36,6);
 for(const y of [F.rows.a+28,F.rows.f+28])s+=clip(-5,y-14,6,28)+clip(F.w-1,y-14,6,28);
 s+=rect(0,0,F.w,F.h,'url(#plastic)',7,'stroke="#c4bfb1" filter="url(#shadow)" class="breadboard-body"')+rect(4,4,F.w-8,F.h-8,'none',5,'stroke="#ffffff" stroke-width="1.5"');
 s+=rect(10,57,F.w-20,1.5,'#dcd7ca',.7)+rect(10,F.h-59,F.w-20,1.5,'#dcd7ca',.7)+rect(10,(F.rows.a+4*F.step+F.rows.f)/2-6.5,F.w-20,13,'#e3dfd3',3)+rect(13,(F.rows.a+4*F.step+F.rows.f)/2-3.5,F.w-26,7,'#f4f1e8',2);
 for(const [side,[plus,minus]]of Object.entries(F.rails)){
  const red=side==='T'?plus-11:plus-11,blue=minus+11;
  s+=`<path d="M${x0-12} ${red}H${x1+12}" stroke="#e0322b" stroke-width="1.6"/><path d="M${x0-12} ${blue}H${x1+12}" stroke="#2f7fd6" stroke-width="1.6"/>`;
  s+=sign(18,plus+5,'+',13)+sign(18,minus+5,'-',13);
 }
 const labels=[1,...Array.from({length:12},(_,i)=>(i+1)*5),63];
 for(const n of labels){const x=x0+(n-1)*F.step;s+=text(x,F.rows.a-11,n,8,'#4f5751','text-anchor="middle"')+text(x,F.rows.f+4*F.step+14,n,8,'#4f5751','text-anchor="middle"');}
 for(let i=0;i<10;i++)s+=text(24,(i<5?F.rows.a:F.rows.f)+(i%5)*F.step+3.5,'abcdefghij'[i],10,'#3d443f','text-anchor="middle" font-weight="600"');
 for(const h of FULL_HOLES)s+=holeSvg(h,prefix);
 return s;
}
export function breadboardSvg(part=null,selected=null){
 const {frame}=breadboardModel(part),full=part?.variant==='full',prefix=part?breadboardPrefix(part.id):'',attributes=part?` data-part="${part.id}" data-rotation="${part.rotation}"${full?' data-variant="full"':''} transform="${partTransform(part)} translate(${-frame.x-frame.w/2} ${-frame.y-frame.h/2})"`:' data-surface="breadboard"';
 let s=`<g class="breadboard ${part&&isSelected(selected,'part',part.id)?'part-selected':''}"${attributes}>`+(full?fullBreadboardSvg(prefix):halfBreadboardSvg(prefix));
 if(full)s+=text(frame.w-14,frame.h-6,`${part.name} · 830 POINTS`,7,'#7d847d','text-anchor="end" letter-spacing="1"');
 else s+=text(BB.x+BB.w/2,BB.y+BB.h-18,part?`${part.name} · 400 POINTS`:'400 POINTS  /  30 ROWS',8,'#7d847d','text-anchor="middle" letter-spacing="1.2"');
 return s+'</g>';
}
export function initSvg(svg){svg.innerHTML=`<defs><linearGradient id="pcb" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#fff"/><stop offset="1" stop-color="#edf1ef"/></linearGradient><linearGradient id="plastic" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#fbf8f0"/><stop offset="1" stop-color="#efebe0"/></linearGradient><filter id="shadow" x="-20%" y="-10%" width="145%" height="140%"><feDropShadow dx="0" dy="6" stdDeviation="5" flood-color="#536c7b" flood-opacity=".16"/></filter><filter id="led-glow" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="6"/></filter></defs><g id="surface">${boardSvg()}${breadboardSvg()}<g id="breadboard-layer"></g><g id="endpoint-layer"></g><g id="wire-layer"></g><g id="part-layer"></g><g id="net-layer" pointer-events="none"></g><g id="wire-handle-layer"></g><g id="search-layer" pointer-events="none"></g><g id="preview-layer" pointer-events="none"></g></g>`;}
export function route(a,b){const mid=a.x+(b.x-a.x)*.47;return roundedWirePath([a,{x:mid,y:a.y},{x:mid,y:b.y},b]);}
export function renderWires(project,selected){return project.wires.map(w=>{
  const a=endpointInfo(w.from,project.components,project.surfaces),b=endpointInfo(w.to,project.components,project.surfaces);if(!a||!b)return '';
  const d=roundedWirePath(wirePoints(project,w));if(!d)return '';return `<g class="${isSelected(selected,'wire',w.id)?'wire-selected':''}" data-wire="${w.id}"><path d="${d}" stroke="#152a2526" stroke-width="4.2" class="wire-visible" transform="translate(0 1)"/><path d="${d}" stroke="${esc(w.color)}" stroke-width="2.6" class="wire-visible"/><path d="${d}" class="wire-hit"/>${[['from',a],['to',b]].map(([end,p])=>`<g class="wire-end" data-wire-end="${end}" data-owner-wire="${w.id}"><title>끌어서 다른 핀·구멍으로 옮기기</title><circle cx="${p.x}" cy="${p.y}" r="5" fill="transparent"/><circle cx="${p.x}" cy="${p.y}" r="2.4" fill="${esc(w.color)}" stroke="#ffffff66" stroke-width=".6"/></g>`).join('')}</g>`;
}).join('');}
export const LED_COLORS={red:'#f05a4b',green:'#65c668',blue:'#53a8f7',yellow:'#f4c941'};
export function renderBreadboards(project,selected){return project.components.filter(p=>p.type==='breadboard').map(p=>breadboardSvg(p,selected)).join('');}
export function updateSurfaces(svg,project,selected){for(const [key,selector]of [['board','.board'],['breadboard','[data-surface="breadboard"]']]){const group=svg.querySelector(selector);group.style.display=project.surfaces?.[key]?.hidden?'none':'';group.dataset.surface=key;group.setAttribute('transform',surfaceTransform(key,project.surfaces));group.classList.toggle('part-selected',selected?.type==='surface'&&selected.id===key);}}
export function renderParts(project,selected,result,pressed){const parts=project.components.filter(p=>p.type!=='breadboard'),ordered=[...parts.filter(p=>selected?.id!==p.id),...parts.filter(p=>selected?.id===p.id)];return ordered.map(p=>{
 const x=p.x,y=p.y,angle=p.rotation,scale=Math.max(scaleXOf(p),scaleYOf(p)),terms=localTerminals({...p,scale:1,scaleX:1,scaleY:1,skewX:0}),nominal=nominalTerminals(p),half=Math.min(18,Math.max(4,(p.span??70)/2-4));
 let shape=extraShape(p,result);
 if(p.type==='resistor')shape=rect(-half,-7,half*2,14,'#ddc394',4,'stroke="#9f895f"')+[-.6,-.2,.25,.7].map((v,i)=>rect(v*half,-7,Math.min(3,half/5),14,['#c26839','#bf6638','#805139','#d7b543'][i])).join('');
 if(p.type==='led'){const color=LED_COLORS[p.color],on=result?.parts[p.id]?.on;shape=`<circle class="led-glow" r="23" fill="${color}" opacity="${on?.6:0}" filter="url(#led-glow)"/><circle class="led-lens" r="12" fill="${on?color:'#704b4c'}" stroke="${color}" stroke-width="2"/><ellipse cx="-4" cy="-4" rx="3" ry="4" fill="#fff" opacity=".3"/><path d="M8 -8V8" stroke="#421e26" stroke-width="2"/>`+text(-18,-13,'+',10,color)+text(15,-13,'−',10,color);}
 if(p.type==='button')shape=rect(-16,-11,32,22,'#a1adb3',3,'stroke="#6d7f8b"')+`<circle class="switch-cap" r="9" fill="${pressed[p.id]?'#168775':'#354857'}" stroke="#233541" stroke-width="2"/>`;
 if(p.type==='lcd'){
   shape=rect(-121,-46,242,84,'#286e61',4,'stroke="#184a40" stroke-width="2"')+rect(-110,-34,220,57,'#213950',4)+rect(-103,-27,206,43,'#9ba958',2)+`<g class="lcd-content">${lcdContent(result?.parts[p.id]?.lcd)}</g>`;
   for(const xx of [-114,114])for(const yy of [-39,31])shape+=`<circle cx="${xx}" cy="${yy}" r="3" fill="#e6d395"/>`;
   shape+=text(-105,34,'1',7,'#d0e7df')+text(105,34,'16',7,'#d0e7df','text-anchor="end"');
 }
 shape=remodelLegacyShape(p,shape,result);
 // Older project types use their own contact order; show those actual labels
 // instead of inheriting a superficially similar catalog variant's numbering.
 if(!p.type.startsWith('ref_')&&(!['resistor','capacitor','ldr','ntc'].includes(p.type)))shape+=terms.map(t=>{const label=terminalLabel(p,t.key),short=label.replace(/^[0-9]+ · /,'').split(' ')[0].slice(0,4);return `<g class="terminal-label"><title>${esc(label)}</title>${text(t.x,t.y+(t.y<0?-6:10),short,5.5,'#52664f','text-anchor="middle" pointer-events="none"')}</g>`;}).join('');
 const label=['resistor','potentiometer'].includes(p.type)?`${p.name} · ${p.value>=1000?(p.value/1000)+' kΩ':p.value+' Ω'}`:p.type==='capacitor'?`${p.name} · ${p.value} µF`:p.name;
 const radians=angle*Math.PI/180,lcdHeight=(Math.abs(Math.sin(radians))*121+Math.abs(Math.cos(radians))*46)*scale;
 const body=PART_DEFS[p.type]?.body,bodyHeight=(body?(Math.abs(Math.sin(radians))*body.width+Math.abs(Math.cos(radians))*body.height)/2+14:42)*scale;
 const labelY=Math.min(y-(p.type==='lcd'?lcdHeight+14:PART_DEFS[p.type]?bodyHeight:27),...terminalKeys(p).map(key=>endpointInfo(`part:${p.id}:${key}`,project.components,project.surfaces).y-13));
 const model=displayModel(p);
 const leads=terms.map((t,i)=>{const end=endpointInfo(`part:${p.id}:${t.key}`,project.components,project.surfaces);let root;
   if(p.type==='uart'&&model)root=partVector(p,t.x*model.scale,model.bounds.bottom);
   else if(model){const start=p.type.startsWith('ref_')&&terms.length>2?catalogPadPosition(p.type,i):packageLeadRoot(model.bounds,t);root=partVector(p,start.x,start.y);}
   else if(p.type.startsWith('ref_')){const b=PART_DEFS[p.type].body;root=partVector(p,Math.max(-b.width/2,Math.min(b.width/2,t.x)),Math.max(-b.height/2,Math.min(b.height/2,t.y)));}
   else if(p.type==='button')root=partVector(p,Math.sign(t.x)*14,Math.sign(t.y)*9);
   else if(p.type==='lcd')root=partVector(p,t.x*.8,33.6);
   else if(p.type==='sevenseg')root=partVector(p,Math.max(-24.8,Math.min(24.8,t.x)),Math.sign(t.y)*24.8);
   else if(p.type==='l298n')root=partVector(p,Math.max(-56,Math.min(56,t.x)),Math.max(-44.8,Math.min(44.8,t.y)));
   else if(['i2c','spi'].includes(p.type))root=partVector(p,Math.max(-20.8,Math.min(20.8,t.x)),10.4);
   else if(p.type==='uart')root=partVector(p,t.x*.8,18.4);
   else if(p.type==='temperature')root=partVector(p,Math.max(-13,Math.min(13,t.x)),9);
   else if(p.type==='potentiometer')root=partVector(p,t.x,12);
   else if(p.type==='slide')root=partVector(p,t.x,11);
   else if(['ldr','ntc'].includes(p.type))root=partVector(p,Math.sign(t.x)*(p.type==='ldr'?14:9),0);
   else if(['dc_motor','dc_supply'].includes(p.type))root=partVector(p,Math.sign(t.x)*28,0);
   else if(PART_DEFS[p.type]?.labels)root=partVector(p,t.x,PART_DEFS[p.type].pinY?PART_DEFS[p.type].pinY-14:p.type==='ultrasonic'?22:14);
   else if(['capacitor','diode','buzzer','passive_buzzer'].includes(p.type))root=partVector(p,Math.sign(t.x)*(['buzzer','passive_buzzer'].includes(p.type)?16:12),0);
   else root=partVector(p,Math.sign(t.x)*(p.type==='led'?10:half),0);
   const d=`M${x+root.x} ${y+root.y}L${nominal[i].x} ${nominal[i].y}L${end.x} ${end.y}`;
   return `<path d="${d}" fill="none" stroke="#737d78" stroke-width="3.2" stroke-linejoin="round"/><path d="${d}" fill="none" stroke="#d6dcd5" stroke-width="1.5" stroke-linejoin="round"/>`;
 }).join('');
 const contacts=terms.map(t=>{const end=endpointInfo(`part:${p.id}:${t.key}`,project.components,project.surfaces);return `<circle class="part-contact" cx="${end.x}" cy="${end.y}" r="2.7" fill="${attachments(p)[t.key]?'#acc5ad':'#dce1d8'}" stroke="#68776c" stroke-width=".8"/>`;}).join('');
 const hits=terminalKeys(p).map(key=>{const e=endpointInfo(`part:${p.id}:${key}`,project.components,project.surfaces);return `<circle cx="${e.x}" cy="${e.y}" r="5.5" data-endpoint="${e.id}" class="pin-hit part-pin"/>`;}).join('');
 return `<g data-part="${p.id}" data-rotation="${angle}" data-scale="${scale}" data-mounted="${Object.keys(attachments(p)).length}" class="${isSelected(selected,'part',p.id)?'part-selected':''}">${leads}<g class="part-body" transform="${partTransform(p)}">${shape}</g>${contacts}${text(x,labelY,label,9,'#496477','text-anchor="middle" pointer-events="none"')}${hits}</g>`;
}).join('');}
export function renderEndpoints(project,pending){return [...(project.surfaces?.board?.hidden?[]:PINS.map(p=>surfacePoint(p,'board',project.surfaces))),...circuitHoles(project.components,project.surfaces)].map(e=>`<circle cx="${e.x}" cy="${e.y}" r="6.5" data-endpoint="${e.id}" class="pin-hit ${pending===e.id?'pending':''}"/>`).join('');}
export function renderMountPreview(mount){return mount?mount.points.map(h=>`<circle cx="${h.x}" cy="${h.y}" r="6" fill="#24b78b44" stroke="#159b73" stroke-width="1.6"/>`).join(''):'';}
export function renderPinSearch(pins,selectedId=null,surfaces){return [...pins.filter(p=>p.id!==selectedId),...pins.filter(p=>p.id===selectedId)].map(raw=>{const p=surfacePoint(raw,'board',surfaces);
 const selected=p.id===selectedId,x=p.x<260?p.x+24:p.x-154;
 return `<g data-search-highlight="${p.id}" data-selected="${selected}"><title>${esc(`${selected?'선택됨: ':''}${p.header}-${p.number} · ${p.signal}`)}</title><circle cx="${p.x}" cy="${p.y}" r="${selected?16:9}" fill="${selected?'#2786d744':'#ffda6120'}" stroke="${selected?'#1979cc':'#e7a71f'}" stroke-width="${selected?3:1.5}"/>${selected?`<circle cx="${p.x}" cy="${p.y}" r="7" fill="#1979cc" stroke="white" stroke-width="2"/><path d="M${p.x} ${p.y-16}V${p.y-33}H${x+65}" fill="none" stroke="#1979cc" stroke-width="1.5"/>${rect(x,p.y-57,130,24,'#1764a4',5)}${text(x+65,p.y-41,`${p.header}-${p.number} · ${p.signal}`,10,'white','text-anchor="middle" font-weight="700"')}`:`<circle cx="${p.x}" cy="${p.y}" r="3" fill="#ffe389"/>`}</g>`;
 }).join('');}
export function updateSimulationSvg(svg,project,result,pressed){
 for(const p of project.components){const g=svg.querySelector(`[data-part="${p.id}"]`);if(!g)continue;
   if(p.type==='lcd'&&g.querySelector('.lcd-content'))g.querySelector('.lcd-content').innerHTML=lcdContent(result?.fault?null:result?.parts[p.id]?.lcd);
   updateExtraSvg(g,p,result?.fault?null:result?.parts[p.id]);updateCatalogView(g,p,result?.fault?null:result?.parts[p.id],!!pressed[p.id],lcdContent);
   if(p.type==='led'){const on=!result?.fault&&result?.parts[p.id]?.on;g.querySelector('.led-lens')?.setAttribute('fill',on?LED_COLORS[p.color]:'#704b4c');g.querySelector('.led-glow')?.setAttribute('opacity',on?'.6':'0');}
   if(p.type==='button')g.querySelector('.switch-cap')?.setAttribute('fill',pressed[p.id]?'#168775':'#354857');
 }
 const on=result&&!result.fault&&result.voltage('signal:PA5')>1.8,led=svg.querySelector('#builtin-led');if(led){led.setAttribute('fill',on?'#64e66b':'#89a486');led.style.filter=on?'drop-shadow(0 0 5px #59dc65)':'';}
}
export function lcdContent(lcd){
 if(!lcd?.visible)return text(0,-9,lcd?.powered?'LCD · INITIALIZE':'LCD 1602',12,'#687440','text-anchor="middle"')+text(0,7,lcd?.powered?'RS / E / DATA / VO':'5 V POWER',8,'#687440','text-anchor="middle"');
 let output=lcd.lines.map((line,row)=>`<text class="lcd-line" data-row="${row}" x="-96" y="${-10+row*19}" font-family="Consolas,monospace" font-size="12" textLength="192" lengthAdjust="spacingAndGlyphs" xml:space="preserve" fill="#293e1b">${esc(line)}</text>`).join('');
 lcd.codes.forEach((row,r)=>row.forEach((code,c)=>{if(code>=8)return;for(let y=0;y<8;y++)for(let x=0;x<5;x++)if(lcd.cgram[code*8+y]&(1<<(4-x)))output+=rect(-96+c*12+x*1.9,-22+r*19+y*1.7,1.5,1.4,'#293e1b');}));
 if(lcd.cursor||lcd.blink){const row=lcd.address>=64?1:0,col=(lcd.address%64-lcd.shift+40)%40;if(col<16)output+=rect(-96+col*12,-8+row*19-(lcd.blink?13:0),10,lcd.blink?15:1.5,'#293e1b');}return output;
}
