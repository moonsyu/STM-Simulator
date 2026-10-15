import {CATALOG_BY_TYPE,CATALOG_DEFS} from './catalog-defs.js';
const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
const rect=(x,y,w,h,fill,rx=2,extra='')=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" ${extra}/>`;
const circle=(x,y,r,fill,extra='')=>`<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}" ${extra}/>`;
const label=(x,y,t,size=7,color='#ecece4')=>`<text x="${x}" y="${y}" text-anchor="middle" font-family="Consolas,monospace" font-size="${size}" fill="${color}">${esc(t)}</text>`;
function chip(x,y,w=28,h=20){return `<g transform="translate(${x} ${y})">`+Array.from({length:6},(_,i)=>rect(-w/2-4,-h/2+i*h/6,4,2,'#b6babc')+rect(w/2,-h/2+i*h/6,4,2,'#b6babc')).join('')+rect(-w/2,-h/2,w,h,'#20252a')+circle(-w/2+4,-h/2+4,1.4,'#657071')+'</g>';}
function screws(x,y,n){return Array.from({length:n},(_,i)=>rect(x+i*15,y,15,18,'#237bb0')+circle(x+7+i*15,y+7,4,'#c4c7bd')+`<path d="M${x+4+i*15} ${y+4}l6 6" stroke="#565e62"/>`).join('');}
function pcb(w,h,color='#235f51'){return rect(-w/2,-h/2,w,h,color,3,'stroke="#193d35" stroke-width="1.5"')+[-1,1].flatMap(x=>[-1,1].map(y=>circle(x*(w/2-6),y*(h/2-6),3.5,'#c7ad63')+circle(x*(w/2-6),y*(h/2-6),1.8,'#dce3de'))).join('')+Array.from({length:4},(_,i)=>`<path d="M${-w/2+12} ${-h/2+13+i*4}h${w/4+i*4}v${h/3}h18" fill="none" stroke="#3a8069" stroke-width=".6"/>`).join('');}
export function catalogShape(p,read,physicalPins=true){
 const v=CATALOG_BY_TYPE[p.type];if(!v)return '';const {width:w,height:h}=CATALOG_DEFS[p.type].body,f=v.family,id=v.id;
 let s='',board=!/^(?:resistor|led|capacitor|diode|dc_motor|dc_supply)$/.test(f)&&!id.includes('bare-')&&!id.includes('to92')&&!id.includes('probe')&&!['button-2','button-4','rgb-common-anode-4','rgb-neopixel-4','buzzer-active-2','buzzer-passive-2','slide-spdt-3','slide-dpdt-6','slide-dp3t-8','sevenseg-common-cathode-10','sevenseg-common-anode-10','sevenseg-4digit-12','stepper-bipolar-4','stepper-unipolar-5'].includes(id);
 if(board)s=pcb(w,h,/grove|tft|oled|dht|storage|can-/.test(id)?'#235b82':/KY-|module|breakout|flora|gravity/.test(v.name+id)?'#303a3c':'#286e55');
 if(f==='resistor')s=rect(-25,-9,50,18,'#dbbb86',8,'stroke="#987548"')+[-16,-7,5,17].map((x,i)=>rect(x,-9,4,18,['#b35f30','#bd5535','#553b2b','#b79740'][i])).join('');
 else if(f==='led'||f==='rgb')s+=circle(0,-5,19,'#c4d4d8','stroke="#f1f6f4" stroke-width="2"')+circle(0,-5,15,read?.on?'#ff835b':'#9da9aa',`class="catalog-light ${f==='led'?'led-lens':'rgb-lens'}" opacity=".85"`)+rect(-5,-12,10,14,'#d3d6c7',0)+circle(-7,-13,4,'#ffffff99')+(id.includes('flora')?chip(0,20,12,8):'');
 else if(f==='button')s+=rect(-21,-18,42,36,'#aeb7b8',3,'stroke="#565e61"')+[-1,1].flatMap(x=>[-1,1].map(y=>circle(x*16,y*13,2,'#dce4e2'))).join('')+circle(0,0,12,'#30363a','class="switch-cap"')+circle(-3,-4,7,'#485156');
 else if(f==='ldr')s+=circle(-13,-7,18,'#d3ad75','stroke="#d9c6a6" stroke-width="2"')+'<path d="M-24 -19H-4V-13H-23V-7H-4V-1H-23V5H-3" fill="none" stroke="#785d41" stroke-width="2"/>'+(id.includes('comparator')?chip(29,0)+rect(21,-26,17,15,'#2874bb')+circle(29,-19,5,'#c7d3cc'):'');
 else if(f==='ntc')s+=`<path d="M-20 16Q-32 -10 -10 -20M20 16Q31 -10 10 -20" fill="none" stroke="#60635f" stroke-width="3"/>`+circle(0,-21,12,'#193e48');
 else if(f==='capacitor')s=id.includes('electrolytic')?rect(-17,-24,34,48,'#273841',3)+rect(8,-21,6,43,'#c6cfcb')+circle(0,-21,17,'#c4c9c6')+`<path d="M-10 -21H10M0 -31V-11" stroke="#6d7778"/>`+label(0,12,p.value+'µF',8):rect(-17,-17,34,34,'#d5b766',10,'stroke="#a3864a"')+label(0,3,'104',10,'#4e4a32');
 else if(f==='diode')s=rect(-23,-9,46,18,'#273037',5)+rect(13,-9,5,18,'#d4d8cf')+label(-3,3,'4001',7);
 else if(['buzzer','passive_buzzer'].includes(f))s+=circle(0,-4,25,'#181d21','stroke="#454d52" stroke-width="3"')+circle(0,-7,7,'#06090b')+label(-15,-16,'+',10)+label(0,14,f==='buzzer'?'DC':'PWM',8);
 else if(f==='temperature')s+=id.includes('probe')?rect(-38,-10,76,20,'#b8c2c6',9,'stroke="#747f83"')+rect(16,-10,7,20,'#62696d'):`<path d="M-20 14V-9Q-20 -30 0 -30Q20 -30 20 -9V14Z" fill="#252c30" stroke="#4b5256"/>`+label(0,-4,id.includes('ds18')?'DS18B20':'TMP36',8);
 else if(f==='ultrasonic')s+=[-1,1].map(k=>circle(k*26,-6,22,id.includes('hcsr')?'#b6bfc2':'#20292d','stroke="#d1d8d9" stroke-width="2"')+circle(k*26,-6,17,'#394b52')+circle(k*26,-6,12,'#27353c','stroke="#81969e" stroke-dasharray="1 2" stroke-width="5"')).join('');
 else if(f==='potentiometer')s+=rect(-22,-23,44,42,id.includes('bare')?'#217ab4':'#898f8b',4)+circle(0,-5,17,'#a7b9b4')+circle(0,-5,12,id.includes('bare')?'#318cc3':'#282f34')+`<path class="pot-knob" d="M0 -5V-18" stroke="#dde6df" stroke-width="3" transform="rotate(${(p.position??50)*2.7-135} 0 -5)"/>`;
 else if(f==='slide')s=rect(-w/2,-17,w,34,'#a6adb0',3,'stroke="#4f5b63"')+rect(-w/2+4,-13,w-8,26,'#232a2f')+rect(-w/2+9+(p.position??0)*(w-33)/(id.includes('dp3t')?2:1),-20,19,35,'#4f5658')+Array.from({length:4},(_,i)=>rect(-w/2+12+i*4,-17,1,27,'#747a7a')).join('');
 else if(['lcd','oled','tft'].includes(f)){s+=rect(-w/2+9,-h/2+10,w-18,h-29,'#141d24',3,'stroke="#86988c" stroke-width="2"')+rect(-w/2+16,-h/2+16,w-32,h-42,f==='lcd'?'#173c79':'#0b151c');s+=`<g class="catalog-display">${label(0,-3,read?.text||'',12,f==='lcd'?'#dfedf7':'#62d4ed')}</g>`;}
 else if(f==='matrix')s+=rect(-57,-34,114,68,'#1b2326')+Array.from({length:64},(_,i)=>circle((i%8-3.5)*11,(Math.floor(i/8)-3.5)*8,3.5,read?.on?'#ed6352':'#d7d8cb')).join('');
 else if(f==='sevenseg'){
  const digits=/4digit|tm1637/.test(id)?4:1;s+=rect(-w/2+4,-h/2+4,w-8,h-8,'#dedccb',2)+rect(-w/2+8,-h/2+8,w-16,h-16,'#273035',0);
  for(let digit=0;digit<digits;digit++){const x=(digit-(digits-1)/2)*31;s+=`<g transform="translate(${x} -5)">`;for(const [i,[px,py,pw,ph]]of [[-9,-20,18,3],[10,-17,3,15],[10,3,3,15],[-9,18,18,3],[-13,3,3,15],[-13,-17,3,15],[-9,-1,18,3],[13,19,3,3]].entries())s+=rect(px,py,pw,ph,'#434c4f',1,`data-segment="${i===7?'dp':'abcdefg'.charAt(i)}" data-digit="${digit}"`);s+='</g>';}
 }
 else if(f==='dc_motor')s=rect(-36,-24,72,48,'#bdc5c7',13,'stroke="#788488"')+rect(25,-21,12,42,'#a0aaac',6)+rect(35,-4,27,8,'#cdd4d4')+[-1,1].map(y=>rect(-26,y*12-3,24,6,'#47555d',3)).join('');
 else if(f==='dc_supply')s=rect(-42,-26,84,52,'#222e34',5)+rect(-36,-22,72,43,'#39464d',2)+label(0,5,(p.voltage??12)+' V',17);
 else if(f==='servo')s=rect(-38,-26,76,50,id.includes('feedback')?'#262e34':'#2768ac',5,'stroke="#475d75"')+rect(-46,-15,92,8,'#344a65',2)+circle(0,-13,20,'#dae1d8')+rect(-30,-18,60,11,'#dbe2d8',5)+circle(0,-12,4,'#7c898d');
 else if(f==='stepper'){if(id.includes('driver'))s+=chip(0,-4,56,24)+screws(-15,15,2)+Array.from({length:4},(_,i)=>circle(-25+i*16,-23,3,'#c64036')).join('');else s=rect(-36,-30,72,60,id.includes('bipolar')?'#424d57':'#9aaab4',id.includes('bipolar')?3:24,'stroke="#bdc9c9" stroke-width="4"')+circle(0,-4,20,'#bfc7c5')+circle(0,-4,7,'#657077')+rect(-4,-7,8,33,'#e1e5dc',1);}
 else if(f==='relay')s+=rect(-33,-25,43,45,'#237ec3',3,'stroke="#52a5c4"')+label(-12,-7,'RELAY',8)+label(-12,5,'5V DC',7)+screws(14,-23,3);
 else if(f==='joystick'||f==='encoder')s+=rect(-25,-23,50,46,'#98a4a6',3)+circle(0,-4,22,'#20282e')+circle(-3,-8,17,'#303b40')+(f==='encoder'?rect(-7,-22,14,28,'#aeb9ba',3):circle(-3,-12,11,'#38454a'));
 else if(f==='l298n'){s+=chip(0,0,Math.min(w-24,95),32);if(id.includes('module'))s+=rect(-31,-30,62,30,'#334046')+Array.from({length:7},(_,i)=>rect(-28+i*9,-30,4,30,'#6f7c80')).join('')+screws(-w/2+6,16,3)+screws(w/2-36,16,2);else if(id.includes('15'))s+=rect(-42,-31,84,17,'#b8c3c4')+circle(0,-23,4,'#45545c');}
 else if(f==='pir')s+=circle(0,-8,25,'#e0e6de','stroke="#b0c5bd"')+Array.from({length:5},(_,i)=>`<path d="M-22 ${-22+i*7}Q0 ${-12+i*7} 22 ${-22+i*7}" stroke="#c3d1c9" fill="none"/>`).join('');
 else if(f==='dcmi')s+=rect(-32,-34,64,50,'#bdc7b9',3)+circle(0,-15,26,'#222e34','stroke="#4a5558" stroke-width="6"')+circle(0,-15,16,'#0b151d')+circle(-5,-21,6,'#4b657a')+rect(-35,22,70,9,'#d6bf69',1);
 else if(f==='external_rtc')s+=circle(-18,-4,23,'#a2afb5','stroke="#d1d9d8" stroke-width="3"')+label(-18,-1,'CR1220',7,'#374b59')+chip(28,0,22,28);
 else if(f==='sd')s+=rect(-28,-25,56,49,'#bec8c7',2,'stroke="#778c94"')+rect(-24,15,48,10,'#303b43')+label(0,-3,'µSD',14,'#637d87');
 else if(f==='dht11'||f==='dht22')s+=rect(-23,-29,46,51,f==='dht11'?'#29a9cf':'#e8e5d9',3)+Array.from({length:24},(_,i)=>rect(-17+i%4*10,-23+Math.floor(i/4)*7,5,4,f==='dht11'?'#22778e':'#a3aaa2',1)).join('');
 else {s+=chip(0,-5);if(/eeprom/.test(id))s=chip(0,0,w-18,h-16)+label(0,3,f==='i2c'?'24LC02B':'25LC020A',9);else if(['can','rs485','i2s','motor'].includes(f))s+=screws(-w/2+9,10,Math.min(5,Math.floor((w-18)/15)));else s+=rect(-w/2+8,-h/2+9,12,6,'#b7b3a1')+rect(w/2-20,-h/2+9,12,6,'#b7b3a1');}
 if(['oled','tft','matrix'].includes(f)){const sw=f==='matrix'?8:128,sh=f==='tft'?160:f==='matrix'?8:64,dw=f==='matrix'?84:128,dh=f==='tft'?160:f==='matrix'?84:64;s+=`<foreignObject x="${-dw/2}" y="${-dh/2-4}" width="${dw}" height="${dh}" pointer-events="none"><canvas xmlns="http://www.w3.org/1999/xhtml" class="device-screen" width="${sw}" height="${sh}" style="display:block;width:100%;height:100%;image-rendering:pixelated"></canvas></foreignObject>`;}
 if(['servo','dc_motor','stepper','motor'].includes(f))s+='<g class="device-rotor"><path d="M0 -7V-23" stroke="#e1e7dd" stroke-width="5"/><circle cy="-7" r="4" fill="#6c7c80"/></g>';
 if(['buzzer','passive_buzzer'].includes(f))s+='<path class="buzzer-wave" d="M29 -10Q40 0 29 10M36 -16Q51 0 36 16" stroke="#23a78a" fill="none" stroke-width="2" opacity="0"/>';
 if(f==='passive_buzzer')s+='<text class="buzzer-frequency" x="0" y="-35" text-anchor="middle" fill="#495c61" font-size="9">PWM</text>';
 if(f==='relay')s+='<path class="relay-contact" d="M15 0L29 10" stroke="#f3dc8b" stroke-width="3" fill="none"/>';
 if(f==='l298n')s+=circle(-w/2+10,-h/2+10,3,'#68443e','class="l298-power"');
 if(f==='dc_motor')s+='<text class="dc-rpm" y="-34" text-anchor="middle" fill="#567477" font-size="10">0 rpm</text>';
 if(board)s+=label(0,h/2-6,id.split('-')[0].toUpperCase(),7);
 if(physicalPins&&v.pins.length>2)s+=CATALOG_DEFS[p.type].terminals.map(([x,y],i)=>{
  const side=Math.abs(x)>w/2,inside=Math.abs(y)<=h/2&&!side,px=side?Math.sign(x)*(w/2-5):x,py=side?y:inside?y:Math.sign(y)*(h/2-5),tx=side?px-Math.sign(x)*7:x,ty=side?y+2:py+(y>0?-7:11);
  const name=v.pins[i].replace(/^PI(\d+):.*/, '$1'),short=name.length>5?name.slice(0,5):name;
  return circle(px,py,3.2,'#c7b16c')+circle(px,py,1.4,'#23363c')+`<text x="${tx}" y="${ty}" text-anchor="${side?(x>0?'end':'start'):'middle'}" font-size="5.5" fill="${board?'#ecede1':'#596b73'}"><title>${esc(v.pins[i])}</title>${esc(short)}</text>`;
 }).join('');
 return `<g data-reference="${v.id}">${rect(-w/2-4,-h/2-6,w+8,h+12,'transparent',3,'pointer-events="all"')}${physicalPins&&v.pins.length===2?'<path d="M-35 0H35" stroke="#aeb9b5" stroke-width="3"/>':''}${s}</g>`;
}
