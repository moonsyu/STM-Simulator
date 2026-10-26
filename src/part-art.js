// Catalog parts drawn from their top-view photos (part-images.js) at real size.
// The photo is fitted, undistorted, into the datasheet outline of the part (model-geometry displayModel) and drawn
// in real coordinates (1 mm = 14/2.54 units), so it keeps its size against the breadboard and the board. Pads and
// leads stay at the exact 2.54 mm pin positions; the parts that change while running get overlays measured on each
// photo (u/v: 0-1 across the fitted photo, r: fraction of its width).
import {PART_IMAGES} from './part-images.js';
import {CATALOG_BY_TYPE,CATALOG_DEFS} from './catalog-defs.js';
import {displayModel} from './model-geometry.js';

const ART={
 'led-tht-2':{light:[.5,.52,.4]},'rgb-common-anode-4':{light:[.5,.52,.4]},'rgb-neopixel-4':{light:[.5,.52,.4]},
 'rgb-common-cathode-4':{light:[.22,.43,.12]},'rgb-neopixel-flora-4':{light:[.5,.5,.12]},'rgb-gravity-3':{light:[.37,.47,.07]},
 'button-2':{cap:[.5,.52,.4]},'button-4':{cap:[.5,.5,.36]},'button-module-3':{cap:[.47,.56,.13]},
 'lcd-parallel-16':{lcd:[.08,.21,.92,.72]},'lcd-i2c-4':{lcd:[.08,.23,.92,.7]},
 'oled-i2c-4':{screen:[.03,.15,.97,.87]},'oled-configurable-7':{screen:[.03,.15,.97,.75]},'oled-configurable-8':{screen:[.03,.13,.97,.72]},
 'st7735-8':{screen:[.06,.05,.94,.6]},'matrix-10':{screen:[.14,.02,.75,.98]},
 'servo-3':{rotor:[.68,.5,.3]},'servo-feedback-4':{rotor:[.7,.38,.3]},'dc-motor-2':{rotor:[.06,.5,.12]},
 'stepper-bipolar-4':{rotor:[.5,.5,.18]},'stepper-unipolar-5':{rotor:[.58,.17,.08]},
 'pot-bare-3':{knob:[.5,.45,.3]},'pot-module-3':{knob:[.48,.53,.25]},
 'joystick-module-5':{stick:[.5,.5,.3]},'encoder-bare-5':{stick:[.5,.49,.22]},'encoder-module-5':{stick:[.52,.47,.1]},
 'slide-spdt-3':{slot:[.28,.18,.72,.68]},'slide-dpdt-6':{slot:[.26,.3,.73,.78]},'slide-dp3t-8':{slot:[.27,.3,.73,.78]},
 'sevenseg-common-cathode-10':{digits:[[.14,.1,.88,.86]]},'sevenseg-common-anode-10':{digits:[[.14,.1,.88,.86]]},
 'sevenseg-4digit-12':{digits:[[.04,.1,.25,.9],[.25,.1,.46,.9],[.54,.1,.75,.9],[.75,.1,.96,.9]]},
 'sevenseg-tm1637-4':{digits:[[.07,.2,.23,.75],[.24,.2,.4,.75],[.47,.2,.63,.75],[.65,.2,.81,.75]]},
 'relay-module-6':{relayLed:[.8,.17,.025]}
};
/** True when a catalog part type is drawn from its photo. */
export const hasPartArt=type=>!!PART_IMAGES[CATALOG_BY_TYPE[type]?.id];

// Blob URLs keep the workspace markup small; previews that become standalone SVG images use the data form.
const urls=new Map();
export const partImageData=id=>'data:image/webp;base64,'+PART_IMAGES[id].webp;
export function partImageUrl(id){
 if(!urls.has(id)){let url;try{const b=atob(PART_IMAGES[id].webp),bytes=new Uint8Array(b.length);for(let i=0;i<b.length;i++)bytes[i]=b.charCodeAt(i);url=URL.createObjectURL(new Blob([bytes],{type:'image/webp'}));}catch{url=partImageData(id);}urls.set(id,url);}
 return urls.get(id);
}

/** The photo's rectangle in real part coordinates: the datasheet outline with the photo fitted in its middle. */
export function photoRect(type,model=displayModel({type,x:0,y:0,rotation:0})){
 const img=PART_IMAGES[CATALOG_BY_TYPE[type].id],b=model.bounds,W=b.right-b.left,H=b.bottom-b.top,a=img.w/img.h;
 const w=a>W/H?W:H*a,h=a>W/H?W/a:H;return {x:(b.left+b.right-w)/2,y:(b.top+b.bottom-h)/2,w,h};
}
/** Pad of a pin (real part coordinates): just inside the outline edge next to the pin, at the pin's own position. */
export function artPadPosition(type,index,model=displayModel({type,x:0,y:0,rotation:0})){
 const [x,y]=CATALOG_DEFS[type].terminals[index],b=model.bounds,inset=7;
 const clamp=(v,lo,hi)=>lo>hi?(lo+hi)/2:Math.max(lo,Math.min(hi,v));
 if(y>=b.bottom)return {x:clamp(x,b.left+3.5,b.right-3.5),y:b.bottom-inset,outside:true};
 if(y<=b.top)return {x:clamp(x,b.left+3.5,b.right-3.5),y:b.top+inset,outside:true};
 if(x<=b.left)return {x:b.left+inset,y:clamp(y,b.top+inset,b.bottom-inset),outside:true};
 if(x>=b.right)return {x:b.right-inset,y:clamp(y,b.top+inset,b.bottom-inset),outside:true};
 return {x,y,outside:false};
}

const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
// A seven-segment digit template (the vector model's layout): a b c d e f g dp, local box x -13..16, y -20..22.
const SEGMENTS=[[-9,-20,18,3],[10,-17,3,15],[10,3,3,15],[-9,18,18,3],[-13,3,3,15],[-13,-17,3,15],[-9,-1,18,3],[13,19,3,3]];

export function partArtShape(p,read,physicalPins=true,model=null){
 const v=CATALOG_BY_TYPE[p.type],id=v.id,f=v.family,a=ART[id]||{},m=model??displayModel({...p,x:0,y:0,rotation:0}),R=photoRect(p.type,m),b=m.bounds;
 const P=(u,w)=>({x:R.x+u*R.w,y:R.y+w*R.h}),L=k=>k*R.w;
 let s=`<rect x="${b.left}" y="${b.top}" width="${b.right-b.left}" height="${b.bottom-b.top}" fill="transparent" pointer-events="all"/>`;
 s+=`<image class="part-photo" data-part-image="${id}" href="${partImageUrl(id)}" x="${R.x}" y="${R.y}" width="${R.w}" height="${R.h}" preserveAspectRatio="none" pointer-events="none"/>`;
 if(a.light){const q=P(a.light[0],a.light[1]),r=L(a.light[2]);s+=`<circle class="${f==='led'?'led-glow':'rgb-glow'}" cx="${q.x}" cy="${q.y}" r="${r*2.2}" fill="#f16f52" opacity="0" filter="url(#led-glow)" pointer-events="none"/><circle class="catalog-light" data-art="" cx="${q.x}" cy="${q.y}" r="${r}" fill="#94a2a4" fill-opacity="0" pointer-events="none"/>`;}
 if(a.cap){const q=P(a.cap[0],a.cap[1]);s+=`<circle class="switch-cap" data-art="" cx="${q.x}" cy="${q.y}" r="${L(a.cap[2])}" fill="#30363a" fill-opacity="0"/>`;}
 if(a.lcd){const [x0,y0,x1,y1]=a.lcd,p0=P(x0,y0),p1=P(x1,y1),kx=(p1.x-p0.x)/200,ky=(p1.y-p0.y)/46;s+=`<g transform="translate(${(p0.x+p1.x)/2} ${(p0.y+p1.y)/2+3*ky}) scale(${kx} ${ky})" pointer-events="none"><g class="catalog-display"><text x="0" y="-3" text-anchor="middle" font-family="Consolas,monospace" font-size="12">${esc(read?.text||'')}</text></g></g>`;}
 if(a.screen){const [x0,y0,x1,y1]=a.screen,p0=P(x0,y0),p1=P(x1,y1),sw=f==='matrix'?8:128,sh=f==='tft'?160:f==='matrix'?8:64,W=p1.x-p0.x,H=p1.y-p0.y,k=Math.min(W/sw,H/sh),dw=sw*k,dh=sh*k;
  // Screen blending: the dark canvas background leaves the photo's glass as it is; lit pixels add their light.
  s+=`<foreignObject x="${(p0.x+p1.x-dw)/2}" y="${(p0.y+p1.y-dh)/2}" width="${dw}" height="${dh}" pointer-events="none" style="mix-blend-mode:screen"><canvas xmlns="http://www.w3.org/1999/xhtml" class="device-screen" width="${sw}" height="${sh}" style="display:block;width:100%;height:100%;image-rendering:pixelated"></canvas></foreignObject>`;}
 if(a.digits)a.digits.forEach(([x0,y0,x1,y1],digit)=>{const p0=P(x0,y0),p1=P(x1,y1),kx=(p1.x-p0.x)/29,ky=(p1.y-p0.y)/42;
  s+=`<g transform="translate(${p0.x+13*kx} ${p0.y+20*ky}) scale(${kx} ${ky}) skewX(-8)" pointer-events="none">`+SEGMENTS.map(([x,y,w,h],i)=>`<rect data-art="" x="${x}" y="${y}" width="${w}" height="${h}" rx="1" fill="#434c4f" fill-opacity="0" data-segment="${i===7?'dp':'abcdefg'.charAt(i)}" data-digit="${digit}"/>`).join('')+'</g>';});
 if(a.rotor){const q=P(a.rotor[0],a.rotor[1]),k=L(a.rotor[2])/(f==='servo'?56:32);
  s+=`<g transform="translate(${q.x} ${q.y+7*k}) scale(${k})" pointer-events="none"><g class="device-rotor">${f==='servo'?'<rect x="-28" y="-12" width="56" height="10" rx="5" fill="#f2f3ec" stroke="#a4b79e" stroke-width=".8"/>'+[-21,-14,14,21].map(x=>`<circle cx="${x}" cy="-7" r="1.5" fill="#8c9d82"/>`).join(''):'<path d="M0 -7V-23" stroke="#e8ece4" stroke-width="4" stroke-linecap="round"/>'}<circle cy="-7" r="4" fill="#899c80"/></g></g>`;}
 if(f==='dc_motor')s+=`<text class="dc-rpm" x="${R.x+R.w/2}" y="${R.y-4}" text-anchor="middle" fill="#567477" font-size="9">0 rpm</text>`;
 if(a.knob){const q=P(a.knob[0],a.knob[1]),r=L(a.knob[2]);s+=`<g transform="translate(${q.x} ${q.y+5})" pointer-events="none"><g class="pot-knob" transform="rotate(${(p.position??50)*2.7-135} 0 -5)"><path d="M0 -5V${-5-r*.85}" stroke="#ffffff" stroke-width="${Math.max(1.4,r*.12)}" stroke-linecap="round" opacity=".9"/></g></g>`;}
 if(a.stick){const q=P(a.stick[0],a.stick[1]),r=L(a.stick[2]);s+=`<g transform="translate(${q.x} ${q.y+6})" pointer-events="none"><g class="device-knob">${f==='joystick'?`<circle cy="-6" r="${r*.18}" fill="#7fe0c0" opacity=".85"/>`:`<path d="M0 -6V${-6-r*.85}" stroke="#ffffff" stroke-width="${Math.max(1.4,r*.12)}" stroke-linecap="round" opacity=".9"/>`}</g></g>`;}
 if(a.slot){const [x0,y0,x1,y1]=a.slot,p0=P(x0,y0),p1=P(x1,y1),W=p1.x-p0.x,H=p1.y-p0.y,max=id.includes('dp3t')?2:1,tw=W*.42,step=(W-tw)/max;
  s+=`<rect x="${p0.x}" y="${p0.y}" width="${W}" height="${H}" rx="1" fill="#161b1e"/><g class="catalog-slide-thumb" data-start="0" data-step="${step}" transform="translate(${(p.position??0)*step} 0)"><rect x="${p0.x}" y="${p0.y+H*.06}" width="${tw}" height="${H*.88}" rx="1.5" fill="#2b3236" stroke="#0e1214" stroke-width=".6"/>${Array.from({length:5},(_,i)=>`<path d="M${p0.x+tw*(.18+i*.16)} ${p0.y+H*.18}V${p0.y+H*.82}" stroke="#4a545a" stroke-width="${Math.max(.6,tw*.04)}"/>`).join('')}</g>`;}
 if(a.relayLed){const q=P(a.relayLed[0],a.relayLed[1]);s+=`<circle class="art-relay-led" cx="${q.x}" cy="${q.y}" r="${L(a.relayLed[2])*1.6}" fill="#ff4a3d" fill-opacity="0" filter="url(#led-glow)" pointer-events="none"/>`;}
 if(['buzzer','passive_buzzer'].includes(f)){const x=R.x+R.w+3,y=R.y+R.h/2;s+=`<path class="buzzer-wave" d="M${x} ${y-8}Q${x+8} ${y} ${x} ${y+8}M${x+6} ${y-13}Q${x+18} ${y} ${x+6} ${y+13}" stroke="#23a78a" fill="none" stroke-width="2" opacity="0" pointer-events="none"/>`;}
 if(f==='passive_buzzer')s+=`<text class="buzzer-frequency" x="${R.x+R.w/2}" y="${R.y-4}" text-anchor="middle" fill="#495c61" font-size="8">PWM</text>`;
 if(['uart','i2c','spi','motor','l298n','relay'].includes(f)&&!id.includes('eeprom')&&!id.includes('bare'))s+=`<circle class="device-power bus-power${f==='l298n'?' l298-power':''}" cx="${R.x+L(.04)}" cy="${R.y+L(.04)}" r="2.2" fill="#586d4d" stroke="#c3c9a3" stroke-width=".6" pointer-events="none"/>`;
 if(physicalPins&&v.pins.length>2)s+=CATALOG_DEFS[p.type].terminals.map(([x,y],i)=>{
  const pad=artPadPosition(p.type,i,m);if(!pad.outside)return '';
  const name=v.pins[i].replace(/^PI(\d+):.*/,'$1'),short=name.length>4?name.slice(0,4):name,side=x<=b.left||x>=b.right,tx=side?x+(x>0?6:-6):x,ty=side?y+2:y+(y<0?-6:10);
  return `<g data-pad="${i+1}">${i===0?`<rect x="${pad.x-3.4}" y="${pad.y-3.4}" width="6.8" height="6.8" rx=".7" fill="#d2b66c" stroke="#f2dfa4" stroke-width=".5"/>`:`<circle cx="${pad.x}" cy="${pad.y}" r="3.4" fill="#c6ae68" stroke="#ead79e" stroke-width=".5"/>`}<circle cx="${pad.x}" cy="${pad.y}" r="1.4" fill="#263d2d"/><text class="terminal-label" x="${tx}" y="${ty}" text-anchor="${side?(x>0?'start':'end'):'middle'}" font-size="5" fill="#405844" pointer-events="none"><title>${esc(v.pins[i])}</title>${esc(short)}</text></g>`;
 }).join('');
 // The model transform (catalog-view) scales the vector drawing to the datasheet size; the photo is already real
 // size, so this group undoes that transform.
 return `<g data-reference="${id}" data-model-family="${f}" data-art=""><g transform="matrix(${1/m.scaleX} 0 0 ${1/m.scaleY} ${-m.dx/m.scaleX} ${-m.dy/m.scaleY})">${s}</g></g>`;
}
