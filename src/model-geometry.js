import {CATALOG_BY_TYPE,CATALOG_DEFS,catalogType} from './catalog-defs.js';
import {localTerminals} from './components.js';

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
export function displayModel(p){
 const referenceType=CATALOG_BY_TYPE[p.type]?p.type:legacy[p.type]?catalogType(legacy[p.type]):null;if(!referenceType)return null;
 const bounds=catalogBodyBounds(referenceType),terms=localTerminals({...p,scale:1,scaleX:1,scaleY:1,skewX:0});
 let scale=CATALOG_BY_TYPE[p.type]?1:['led','rgb','button','temperature','potentiometer'].includes(p.type)?.65:['resistor','diode','capacitor'].includes(p.type)?.7:.8;
 if(terms.length===2&&terms.every(t=>t.y===0)){
  const left=Math.abs(Math.min(...terms.map(t=>t.x))),right=Math.max(...terms.map(t=>t.x));
  scale=Math.min(scale,Math.max(.01,left-4)/Math.abs(bounds.left),Math.max(.01,right-4)/bounds.right);
 }else if(!CATALOG_BY_TYPE[p.type]&&terms.every(t=>t.y>0))scale=Math.min(scale,Math.max(1,Math.min(...terms.map(t=>t.y))-8)/bounds.bottom);
 return {referenceType,scale,bounds:box(bounds.left*scale,bounds.top*scale,bounds.right*scale,bounds.bottom*scale)};
}
