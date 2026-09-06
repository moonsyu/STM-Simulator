export function rgbColor(read){
 const values=['r','g','b'].map(c=>read?.channels?.[c]?.on?Math.round(255*Math.min(1,Math.sqrt(Math.max(0,read.channels[c].current)/.006))):0);
 return values.some(Boolean)?`rgb(${values.join(',')})`:'#465366';
}
export function extraShape(p,result){
 const read=result?.parts[p.id];
 if(p.type==='potentiometer')return `<rect x="-21" y="-22" width="42" height="43" rx="5" fill="#287ea6" stroke="#205673"/><circle cy="-3" r="15" fill="#e7e3d2" stroke="#b0b8b8"/><path class="pot-knob" d="M0 -3V-15" stroke="#3d5367" stroke-width="4" transform="rotate(${-135+p.position*2.7} 0 -3)"/><text class="environment-label" y="18" text-anchor="middle" font-size="7" fill="white">${p.position}%</text>`;
 if(p.type==='slide')return `<rect x="-24" y="-15" width="48" height="31" rx="3" fill="#a7b4bb" stroke="#667f8c"/><rect x="-19" y="-9" width="38" height="18" rx="2" fill="#233547"/><rect class="slide-thumb" x="${p.position?2:-17}" y="-8" width="15" height="16" rx="2" fill="#e9ebd8"/><text x="-18" y="-19" font-size="7" fill="#426174">A</text><text x="13" y="-19" font-size="7" fill="#426174">B</text>`;
 if(p.type==='rgb')return `<circle class="rgb-glow" r="25" fill="${rgbColor(read)}" opacity="${read?.on?.55:0}" filter="url(#led-glow)"/><circle class="rgb-lens" r="15" fill="${rgbColor(read)}" stroke="#8b9caa" stroke-width="2"/><ellipse cx="-5" cy="-6" rx="4" ry="5" fill="white" opacity=".35"/><text y="5" text-anchor="middle" font-size="7" fill="white">RGB</text>`;
 if(p.type==='capacitor')return '<path d="M-12 0H-4M4 0H12M-4 -13V13M4 -13V13" stroke="#3689ae" stroke-width="4" fill="none"/><rect x="-8" y="-15" width="16" height="30" fill="transparent"/>';
 if(p.type==='diode')return '<rect x="-14" y="-7" width="28" height="14" rx="4" fill="#394655" stroke="#223243"/><path d="M8 -7V7" stroke="#c6d2d6" stroke-width="4"/><text x="-21" y="-11" font-size="7" fill="#496477">A</text><text x="16" y="-11" font-size="7" fill="#496477">K</text>';
 if(p.type==='buzzer')return `<circle r="18" fill="#24343e" stroke="#536978" stroke-width="2"/><circle r="5" fill="#0f1b26"/><text x="-12" y="-7" font-size="9" fill="#ccd8e0">+</text><path class="buzzer-wave" d="M22 -9Q30 0 22 9M28 -14Q40 0 28 14" stroke="#23a78a" fill="none" stroke-width="2" opacity="${read?.on?1:0}"/>`;
 if(p.type==='temperature')return `<path d="M-17 12V-8Q-17 -23 0 -23Q17 -23 17 -8V12Z" fill="#384959" stroke="#203443"/><text y="-7" text-anchor="middle" font-size="7" fill="#c4d8e1">TMP36</text><text class="environment-label" y="6" text-anchor="middle" font-size="8" fill="#8fddca">${p.temperature}°C</text>`;
 if(p.type==='ultrasonic')return `<rect x="-49" y="-26" width="98" height="49" rx="3" fill="#34789d" stroke="#215772"/>${[-27,27].map(x=>`<circle cx="${x}" cy="-5" r="18" fill="#c9d2d4" stroke="#7894a1"/><circle cx="${x}" cy="-5" r="13" fill="#394f5d"/><circle cx="${x}" cy="-5" r="9" fill="#7b929c" stroke="#243e4e" stroke-dasharray="1 2" stroke-width="7"/>`).join('')}<text class="environment-label" y="20" text-anchor="middle" font-size="8" fill="white">${p.distance} cm</text>`;
 if(p.type==='sevenseg'){
   const paths={a:'M-10 -21H10L13 -18L10 -15H-10L-13 -18Z',g:'M-10 -3H10L13 0L10 3H-10L-13 0Z',d:'M-10 15H10L13 18L10 21H-10L-13 18Z',f:'M-16 -16L-13 -13V-5L-16 -2L-19 -5V-13Z',b:'M16 -16L19 -13V-5L16 -2L13 -5V-13Z',e:'M-16 2L-13 5V13L-16 16L-19 13V5Z',c:'M16 2L19 5V13L16 16L13 13V5Z'};
   return `<rect x="-25" y="-28" width="50" height="56" rx="4" fill="#202f3d" stroke="#82939f"/>${Object.entries(paths).map(([name,d])=>`<path data-segment="${name}" d="${d}" fill="${read?.channels?.[name]?.on?'#ff594b':'#443f45'}"/>`).join('')}<circle data-segment="dp" cx="20" cy="22" r="2.5" fill="${read?.channels?.dp?.on?'#ff594b':'#443f45'}"/>`;
 }
 return '';
}
export function updateExtraSvg(g,p,read){
 if(p.type==='rgb'){const color=rgbColor(read);g.querySelector('.rgb-lens')?.setAttribute('fill',color);const glow=g.querySelector('.rgb-glow');glow?.setAttribute('fill',color);glow?.setAttribute('opacity',read?.on?'.55':'0');}
 if(p.type==='sevenseg')g.querySelectorAll('[data-segment]').forEach(s=>s.setAttribute('fill',read?.channels?.[s.dataset.segment]?.on?'#ff594b':'#443f45'));
 if(p.type==='buzzer')g.querySelector('.buzzer-wave')?.setAttribute('opacity',read?.on?'1':'0');
 if(p.type==='slide')g.querySelector('.slide-thumb')?.setAttribute('x',p.position?'2':'-17');
 if(p.type==='potentiometer')g.querySelector('.pot-knob')?.setAttribute('transform',`rotate(${-135+p.position*2.7} 0 -3)`);
 const label=g.querySelector('.environment-label');if(label)label.textContent=p.type==='potentiometer'?`${p.position}%`:p.type==='temperature'?`${p.temperature}°C`:`${p.distance} cm`;
}
