import {CATALOG_BY_TYPE,CATALOG_DEFS,catalogType} from './catalog-defs.js';
import {localTerminals} from './components.js';
import {PART_DATASHEETS,UNITS_PER_MM} from './part-datasheets.js';

const legacy={resistor:'resistor-axial-2',led:'led-tht-2',button:'button-4',ldr:'ldr-bare-2',ntc:'ntc-bare-2',sht31:'sht31-grove-4',mpu6050:'mpu6050-8',pir:'pir-3',potentiometer:'pot-bare-3',slide:'slide-spdt-3',rgb:'rgb-common-cathode-4',capacitor:'capacitor-ceramic-2',diode:'diode-axial-2',buzzer:'buzzer-active-2',passive_buzzer:'buzzer-passive-2',temperature:'tmp36-to92-3',ultrasonic:'hcsr04-4',dc_motor:'dc-motor-2',dc_supply:'dc-supply-2',relay:'relay-module-6',joystick:'joystick-module-5',encoder:'encoder-module-5',lcd:'lcd-parallel-16',oled:'oled-i2c-4',tft:'st7735-8',matrix:'matrix-10',sevenseg:'sevenseg-common-cathode-10',stepper:'stepper-bipolar-4',motor:'motor-driver-hat',l298n:'l298n-module-13',servo:'servo-3',uart:'uart-cable-4',i2c:'i2c-eeprom-8',spi:'spi-eeprom-8'};
const box=(left,top,right,bottom)=>({left,top,right,bottom});

export function catalogHasBoard(type){
 const {family:f,id}=CATALOG_BY_TYPE[type];
 return !/^(?:resistor|led|capacitor|diode|dc_motor|dc_supply|uart|servo)$/.test(f)&&!id.includes('bare-')&&!id.includes('to92')&&!id.includes('probe')&&!id.includes('eeprom')&&!['button-2','button-4','rgb-common-anode-4','rgb-neopixel-4','buzzer-active-2','buzzer-passive-2','slide-spdt-3','slide-dpdt-6','slide-dp3t-8','sevenseg-common-cathode-10','sevenseg-common-anode-10','sevenseg-4digit-12','stepper-bipolar-4','stepper-unipolar-5'].includes(id);
}
// Painted package bounds, excluding glow, invisible hit areas and terminal labels.
// Electrical geometry remains exclusively in components/catalog-defs.
export function catalogBodyBounds(type){
 const {family:f,id}=CATALOG_BY_TYPE[type],{width:w,height:h}=CATALOG_DEFS[type].body;
 if(f==='slide')return box(-w/2,-14,w/2,14);
 if(catalogHasBoard(type))return box(-w/2,-h/2,f==='relay'?Math.max(w/2,59):w/2,h/2);
 if(f==='resistor')return box(-25,-10,25,10);
 if(f==='led'||f==='rgb')return box(-18,-23,18,13);
 if(f==='button')return box(-21,-14,21,14);
 if(f==='ldr')return box(-18,-18,18,18);
 if(f==='ntc')return box(-12,-12,12,12);
 if(f==='capacitor')return id.includes('electrolytic')?box(-22,-22,22,22):box(-17,-15,17,15);
 if(f==='diode')return box(-23,-8,23,8);
 if(f==='buzzer'||f==='passive_buzzer')return box(-24,-28,24,20);
 if(f==='temperature')return id.includes('probe')?box(-38,-10,38,10):box(-20,-30,20,14);
 if(f==='potentiometer')return box(-22,-23,22,19);
 if(f==='dc_motor')return box(-36,-23,62,23);
 if(f==='dc_supply')return box(-42,-26,42,26);
 if(f==='servo')return box(-46,-26,46,24);
 if(f==='stepper')return box(-38,-32,38,32);
 if(f==='uart')return box(-18,-26,18,h/2-5);
 if(f==='sevenseg')return box(-w/2+4,-h/2+4,w/2-4,h/2-4);
 if(f==='l298n')return box(-Math.min(w-24,95)/2,-16,Math.min(w-24,95)/2,16);
 if(id.includes('eeprom'))return box(-(w-18)/2,-(h-16)/2,(w-18)/2,(h-16)/2);
 if(f==='encoder')return box(-25,-23,25,23);
 return box(-w/2,-h/2,w/2,h/2);
}
export function catalogPadPosition(type,index){
 const {width:w,height:h}=CATALOG_DEFS[type].body,terminals=CATALOG_DEFS[type].terminals,[x,y]=terminals[index],side=Math.abs(x)>w/2,inside=Math.abs(y)<=h/2&&!side;
 const rows=terminals.filter(([xx,yy])=>xx===x&&Math.sign(yy)===Math.sign(y)).map(([,yy])=>Math.abs(yy));
 return {x:side?Math.sign(x)*(w/2-5):x,y:side?y:inside?y:Math.sign(y)*(h/2-5+Math.abs(y)-Math.min(...rows))};
}
export function packageLeadRoot(bounds,point){
 const x=(bounds.left+bounds.right)/2,y=(bounds.top+bounds.bottom)/2,rx=Math.max(.001,(bounds.right-bounds.left)/2-1),ry=Math.max(.001,(bounds.bottom-bounds.top)/2-1),dx=point.x-x,dy=point.y-y;
 // An inscribed ellipse stays inside both rectangular packages and round lenses.
 const distance=Math.hypot(dx/rx,dy/ry),ratio=distance>1?1/distance:1;
 return {x:x+dx*ratio,y:y+dy*ratio};
}
// Body scale that makes the drawn package exactly the size its datasheet gives (1 mm = 14/2.54 units, the breadboard
// pitch), so every part has its real size next to the breadboard. The longer datasheet side goes along the drawing's
// longer side; a square drawing, or a size marked xy, keeps the datasheet's width and height as they are.
/** Catalog id whose datasheet describes a part type (a basic part uses the package it is drawn as). */
export const datasheetIdOf=type=>CATALOG_BY_TYPE[type]?.id??legacy[type]??null;
export function datasheetScale(referenceType){
 const v=CATALOG_BY_TYPE[referenceType],size=v&&PART_DATASHEETS[v.id]?.size;if(!size?.w||!size?.h)return null;
 const b=catalogBodyBounds(referenceType),w=b.right-b.left,h=b.bottom-b.top,long=Math.max(size.w,size.h)*UNITS_PER_MM,short=Math.min(size.w,size.h)*UNITS_PER_MM;
 if(size.xy||Math.max(w,h)/Math.min(w,h)<1.1)return {x:size.w*UNITS_PER_MM/w,y:size.h*UNITS_PER_MM/h};
 return {x:(w>=h?long:short)/w,y:(w>=h?short:long)/h};
}
// datasheet:false gives the package at its drawing size: the footprint on the breadboard of a module raised on its header.
export function displayModel(p,{datasheet=true}={}){
 const referenceType=CATALOG_BY_TYPE[p.type]?p.type:legacy[p.type]?catalogType(legacy[p.type]):null;if(!referenceType)return null;
 const bounds=catalogBodyBounds(referenceType),terms=localTerminals({...p,scale:1,scaleX:1,scaleY:1,skewX:0}),sheet=datasheet?datasheetScale(referenceType):null;
 let sx=sheet?.x??(CATALOG_BY_TYPE[p.type]?1:['led','rgb','button','temperature','potentiometer'].includes(p.type)?.65:['resistor','diode','capacitor'].includes(p.type)?.7:.8),sy=sheet?.y??sx;
 // Without a datasheet size, a two-lead part's body still fits between its leads (a datasheet-sized body keeps its
 // real size: radial parts and off-board parts such as a battery holder sit over their leads).
 if(sheet);else if(terms.length===2&&terms.every(t=>t.y===0)){
  const left=Math.abs(Math.min(...terms.map(t=>t.x))),right=Math.max(...terms.map(t=>t.x)),fit=Math.min(1,Math.max(.01,left-4)/Math.abs(bounds.left*sx),Math.max(.01,right-4)/(bounds.right*sx));sx*=fit;sy*=fit;
 }else if(!CATALOG_BY_TYPE[p.type]&&terms.every(t=>t.y>0)){const fit=Math.min(1,Math.max(1,Math.min(...terms.map(t=>t.y))-8)/(bounds.bottom*sy));sx*=fit;sy*=fit;}
 // Pins on one side only (a module's header): that edge of the datasheet-sized package stays where the pins are.
 let dx=0,dy=0;
 if(!sheet);else if(terms.length&&terms.every(t=>t.y>0))dy=bounds.bottom*(1-sy);else if(terms.length&&terms.every(t=>t.y<0))dy=bounds.top*(1-sy);
 else if(terms.length&&terms.every(t=>t.x>0))dx=bounds.right*(1-sx);else if(terms.length&&terms.every(t=>t.x<0))dx=bounds.left*(1-sx);
 // Pins on one side stand out of the package by at most LEAD_GAP: the body moves up to its pins.
 if(sheet&&terms.length){
  const gap=terms.every(t=>t.y>0)?Math.min(...terms.map(t=>t.y))-(bounds.bottom*sy+dy):terms.every(t=>t.y<0)?(bounds.top*sy+dy)-Math.max(...terms.map(t=>t.y)):terms.every(t=>t.x>0)?Math.min(...terms.map(t=>t.x))-(bounds.right*sx+dx):terms.every(t=>t.x<0)?(bounds.left*sx+dx)-Math.max(...terms.map(t=>t.x)):0;
  if(gap>LEAD_GAP){const k=gap-LEAD_GAP;if(terms.every(t=>t.y>0))dy+=k;else if(terms.every(t=>t.y<0))dy-=k;else if(terms.every(t=>t.x>0))dx+=k;else dx-=k;}
 }
 return {referenceType,scale:sx,scaleX:sx,scaleY:sy,dx,dy,bounds:box(bounds.left*sx+dx,bounds.top*sy+dy,bounds.right*sx+dx,bounds.bottom*sy+dy)};
}
/** Longest visible lead between a package edge and its pin: two thirds of an OLED module's header lead (14). */
export const LEAD_GAP=14*2/3;
/** SVG transform of a model's body: its datasheet scale and the shift that keeps the pin edge in place. */
export const modelTransform=m=>`translate(${m.dx} ${m.dy}) scale(${m.scaleX} ${m.scaleY})`;
/** A point of the unscaled package drawing in the displayed (datasheet-sized) body. */
export const modelPoint=(m,q)=>({x:q.x*m.scaleX+m.dx,y:q.y*m.scaleY+m.dy});
