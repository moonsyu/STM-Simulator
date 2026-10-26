import {CATALOG_BY_TYPE} from './catalog-defs.js';
import {updateDeviceSvg} from './device-ui.js';
import {catalogShape} from './catalog-render.js';
import {displayModel,modelTransform} from './model-geometry.js';
import {channelLevels,glowOpacity,lensColor} from './rgb-color.js';
export function remodelLegacyShape(p,shape,result){
 const model=displayModel(p);if(!model)return shape;
 if(CATALOG_BY_TYPE[p.type])return model.scaleX===1&&model.scaleY===1&&!model.dx&&!model.dy?shape:`<g transform="${modelTransform(model)}">${shape}</g>`;
 const ref=catalogShape({...p,type:model.referenceType},result?.parts[p.id],false,model);
 // Silkscreen/header labels are rendered by the existing physical terminal layer.
 return `<g class="remodeled-device" transform="${modelTransform(model)}">${ref}</g>`;
}
export function updateCatalogView(g,p,r,pressed=false,lcdRender=null){
 const v=CATALOG_BY_TYPE[p.type],family=v?.family||p.type;
 // Addressable RGB (WS2812) lights only with a received colour; analog RGB follows its channel currents.
 const addressable=family==='rgb'&&!r?.channels,received=addressable?r?.device?.color:null;
 const light=g.querySelector('.catalog-light');if(light){const channels=r?.channels,color=addressable?received&&lensColor(received):channels?channelLevels(channels):null;light.setAttribute('fill',color?`rgb(${color.join(',')})`:r?.on&&!addressable?({red:'#f05a4b',green:'#65c668',blue:'#53a8f7',yellow:'#f4c941'}[p.color]||'#ff7055'):'#94a2a4');
  // On a photo the lens shows through until it lights.
  if(light.hasAttribute('data-art'))light.setAttribute('fill-opacity',color||(r?.on&&!addressable)?'.88':'0');}
 const cap=g.querySelector('.switch-cap');cap?.setAttribute('fill',pressed?'#16a583':'#30363a');if(cap?.hasAttribute('data-art'))cap.setAttribute('fill-opacity',pressed?'.55':'0');
 g.querySelector('.art-relay-led')?.setAttribute('fill-opacity',r?.on?'.95':'0');
 updateDeviceSvg(g,{...p,type:family},r);
 g.querySelectorAll('[data-segment]').forEach(el=>{const digit=Number(el.dataset.digit??0),bit=el.dataset.segment==='dp'?7:'abcdefg'.indexOf(el.dataset.segment),on=r?.digits?!!(r.digits[digit]&(1<<bit)):r?.channels?.[el.dataset.segment]?.on;el.setAttribute('fill',on?(p.type==='sevenseg'?'#ff594b':'#fa6655'):'#434c4f');if(el.hasAttribute('data-art'))el.setAttribute('fill-opacity',on?'.95':'0');});
 g.querySelector('.buzzer-wave')?.setAttribute('opacity',r?.on?'1':'0');const frequency=g.querySelector('.buzzer-frequency');if(frequency)frequency.textContent=r?.on?Math.round(r.frequency)+' Hz':'무음';
 const rpm=g.querySelector('.dc-rpm');if(rpm)rpm.textContent=`${(r?.rpm??0).toFixed(0)} rpm`;
 if(family==='dc_motor')g.querySelector('.device-rotor')?.setAttribute('transform',`rotate(${r?.angle??0} 0 -7)`);
 g.querySelector('.pot-knob')?.setAttribute('transform',`rotate(${(p.position??50)*2.7-135} 0 -5)`);
 const thumb=g.querySelector('.catalog-slide-thumb');if(thumb)thumb.setAttribute('transform',`translate(${Number(thumb.dataset.start)+(p.position??0)*Number(thumb.dataset.step)} 0)`);
 const glow=g.querySelector('.led-glow, .rgb-glow');if(glow){glow.setAttribute('opacity',addressable?String(glowOpacity(received)):r?.on?'.32':'0');glow.setAttribute('fill',light?.getAttribute('fill')||'#f16f52');}
 const display=g.querySelector('.catalog-display');if(display&&family==='lcd'&&lcdRender){display.innerHTML=lcdRender(r?.lcd);return;}if(display){const lines=r?.lcd?.lines;if(lines){display.innerHTML='';for(let i=0;i<2;i++){const text=document.createElementNS('http://www.w3.org/2000/svg','text');text.setAttribute('class','lcd-line');text.setAttribute('data-row',String(i));text.setAttribute('xml:space','preserve');text.setAttribute('x','-96');text.setAttribute('y',String(-5+i*19));text.setAttribute('font-family','Consolas,monospace');text.setAttribute('font-size','12');text.setAttribute('fill','#293e1b');text.textContent=r.lcd.visible===false?'':lines[i];display.append(text);}}

 }
}
