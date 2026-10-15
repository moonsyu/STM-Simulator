import {CATALOG_BY_TYPE,catalogType} from './catalog-defs.js';
import {updateDeviceSvg} from './device-ui.js';
import {catalogShape} from './catalog-render.js';
const legacy={resistor:'resistor-axial-2',led:'led-tht-2',button:'button-4',ldr:'ldr-bare-2',ntc:'ntc-bare-2',sht31:'sht31-grove-4',mpu6050:'mpu6050-8',pir:'pir-3',potentiometer:'pot-bare-3',slide:'slide-spdt-3',rgb:'rgb-common-cathode-4',capacitor:'capacitor-ceramic-2',diode:'diode-axial-2',buzzer:'buzzer-active-2',passive_buzzer:'buzzer-passive-2',temperature:'tmp36-to92-3',ultrasonic:'hcsr04-4',dc_motor:'dc-motor-2',dc_supply:'dc-supply-2',relay:'relay-module-6',joystick:'joystick-module-5',encoder:'encoder-module-5',lcd:'lcd-parallel-16',oled:'oled-i2c-4',tft:'st7735-8',matrix:'matrix-10',sevenseg:'sevenseg-common-cathode-10',stepper:'stepper-bipolar-4',motor:'motor-driver-hat',l298n:'l298n-module-13',servo:'servo-3',uart:'uart-cable-4',i2c:'i2c-eeprom-8',spi:'spi-eeprom-8'};
export function remodelLegacyShape(p,shape,result){
 if(CATALOG_BY_TYPE[p.type])return shape;

 const id=legacy[p.type];if(!id)return shape;
 const ref=catalogShape({...p,type:catalogType(id)},result?.parts[p.id],false);
 // Silkscreen/header labels are rendered by the existing physical terminal layer.
 return `<g class="remodeled-device" transform="scale(${['led','rgb','button','temperature','potentiometer'].includes(p.type)?.65:['resistor','diode','capacitor'].includes(p.type)?.7:.8})">${ref}</g>`;
}
export function updateCatalogView(g,p,r,pressed=false,lcdRender=null){
 const v=CATALOG_BY_TYPE[p.type],family=v?.family||p.type;
 const light=g.querySelector('.catalog-light');if(light){const channels=r?.channels,color=r?.device?.color||(channels?['r','g','b'].map(k=>channels[k]?.on?Math.round(255*Math.min(1,Math.sqrt(Math.max(0,channels[k].current)/.006))):0):null);light.setAttribute('fill',color?`rgb(${color.join(',')})`:r?.on?({red:'#f05a4b',green:'#65c668',blue:'#53a8f7',yellow:'#f4c941'}[p.color]||'#ff7055'):'#94a2a4');}
 g.querySelector('.switch-cap')?.setAttribute('fill',pressed?'#16a583':'#30363a');
 updateDeviceSvg(g,{...p,type:family},r);
 g.querySelectorAll('[data-segment]').forEach(el=>{const digit=Number(el.dataset.digit??0),bit=el.dataset.segment==='dp'?7:'abcdefg'.indexOf(el.dataset.segment),on=r?.digits?!!(r.digits[digit]&(1<<bit)):r?.channels?.[el.dataset.segment]?.on;el.setAttribute('fill',on?(p.type==='sevenseg'?'#ff594b':'#fa6655'):'#434c4f');});
 g.querySelector('.buzzer-wave')?.setAttribute('opacity',r?.on?'1':'0');const frequency=g.querySelector('.buzzer-frequency');if(frequency)frequency.textContent=r?.on?Math.round(r.frequency)+' Hz':'무음';
 const rpm=g.querySelector('.dc-rpm');if(rpm)rpm.textContent=`${(r?.rpm??0).toFixed(0)} rpm`;
 if(family==='dc_motor')g.querySelector('.device-rotor')?.setAttribute('transform',`rotate(${r?.angle??0} 0 -7)`);
 g.querySelector('.pot-knob')?.setAttribute('transform',`rotate(${(p.position??50)*2.7-135} 0 -5)`);
 const display=g.querySelector('.catalog-display');if(display&&family==='lcd'&&lcdRender){display.innerHTML=lcdRender(r?.lcd).replaceAll('#293e1b','#b9e5f6');return;}if(display){const lines=r?.lcd?.lines;if(lines){display.innerHTML='';for(let i=0;i<2;i++){const text=document.createElementNS('http://www.w3.org/2000/svg','text');text.setAttribute('class','lcd-line');text.setAttribute('data-row',String(i));text.setAttribute('xml:space','preserve');text.setAttribute('x','-96');text.setAttribute('y',String(-5+i*19));text.setAttribute('font-family','Consolas,monospace');text.setAttribute('font-size','12');text.setAttribute('fill','#b9e5f6');text.textContent=r.lcd.visible===false?'':lines[i];display.append(text);}}

 }
}
