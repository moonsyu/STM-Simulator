// Bottom-panel logic analyzer: bit-level UART / I2C / SPI / USART sync / 1-Wire
// waveforms with protocol decoding and a configurable line-noise model.
// Works with both the C interpreter session and the firmware emulator session
// through the shared session.signals contract (channels / samples / decode / noise).
const $=id=>document.getElementById(id);
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
const WINDOWS=[[0.2,'200 µs'],[1,'1 ms'],[5,'5 ms'],[20,'20 ms'],[100,'100 ms'],[1000,'1 s']];
const ROW=34,LABEL=118;
export function setupLogicAnalyzer({getSession,getProject,isRunning,onNoise,log}){
 const tabs=document.querySelector('.monitor-tabs');
 const tab=document.createElement('button');tab.dataset.monitor='signals';tab.textContent='로직 분석기';tabs.querySelector('[data-monitor="wave"]')?.after(tab)??tabs.append(tab);
 const panel=document.createElement('section');panel.id='signals-panel';panel.hidden=true;
 panel.innerHTML=`<div class="la-toolbar"><label>시간 범위 <select id="la-window">${WINDOWS.map(([v,l])=>`<option value="${v}" ${v===5?'selected':''}>${l}</option>`).join('')}</select></label><label class="la-check"><input type="checkbox" id="la-follow" checked> 실시간 따라가기</label><label class="la-check"><input type="checkbox" id="la-decode" checked> 프로토콜 해석</label><button id="la-fit" type="button">처음으로</button><span class="la-spacer"></span><details id="la-noise"><summary>선로 잡음</summary><div class="la-noise-body"><label class="la-check"><input type="checkbox" id="la-noise-enabled"> 잡음 적용</label><label>비트 오류율 <input id="la-ber" type="number" min="0" max="0.5" step="0.0001" value="0"></label><label>글리치 확률 <input id="la-glitch" type="number" min="0" max="0.5" step="0.0001" value="0"></label><label>지터 (ns) <input id="la-jitter" type="number" min="0" max="100000" step="10" value="0"></label><button id="la-noise-apply" type="button">적용</button><p class="form-hint">수신기는 잡음이 섞인 선로 파형을 다시 샘플링합니다. 프레이밍·패리티 오류와 I²C NACK을 직접 확인할 수 있습니다.</p></div></details></div><div id="la-empty" class="la-empty">시뮬레이션을 실행하면 UART · I²C · SPI · USART 동기 · 1-Wire 선로 파형과 해석 결과가 표시됩니다.</div><div id="la-view" class="la-view" hidden><svg id="la-svg" role="img" aria-label="로직 분석기 파형"></svg></div><div id="la-frames" class="la-frames" aria-live="polite"></div>`;
 document.getElementById('bottom-panel').append(panel);
 let offset=null,last=0,drag=null,rafPending=false;
 const windowUs=()=>Number($('la-window').value)*1000;
 const signals=()=>getSession()?.signals||null;
 function syncNoise(){const s=signals(),cfg=s?.noise?.()||getProject()?.simulation?.noise||{};$('la-noise-enabled').checked=!!cfg.enabled;$('la-ber').value=cfg.bitErrorRate??0;$('la-glitch').value=cfg.glitchRate??0;$('la-jitter').value=cfg.jitterNs??0;}
 $('la-noise-apply').onclick=()=>{
  const cfg={enabled:$('la-noise-enabled').checked,bitErrorRate:Number($('la-ber').value),glitchRate:Number($('la-glitch').value),jitterNs:Number($('la-jitter').value)};
  try{
   for(const [k,v,max] of [['비트 오류율',cfg.bitErrorRate,.5],['글리치 확률',cfg.glitchRate,.5],['지터',cfg.jitterNs,100000]])if(!Number.isFinite(v)||v<0||v>max)throw new Error(`${k}: 0~${max} 범위로 입력하세요.`);
   const applied=signals()?.setNoise?.(cfg)??cfg;onNoise?.(applied);log?.(applied.enabled?`선로 잡음을 적용했습니다 · BER ${applied.bitErrorRate} · 글리치 ${applied.glitchRate} · 지터 ${applied.jitterNs} ns`:'선로 잡음을 껐습니다.');
  }catch(error){log?.(error.message,'error');}
 };
 $('la-window').onchange=()=>paint(true);$('la-decode').onchange=()=>paint(true);$('la-follow').onchange=()=>{if($('la-follow').checked)offset=null;paint(true);};
 $('la-fit').onclick=()=>{$('la-follow').checked=false;offset=0;paint(true);};
 const svgEl=$('la-svg');
 svgEl.addEventListener('wheel',e=>{e.preventDefault();const sel=$('la-window'),i=sel.selectedIndex+(e.deltaY>0?1:-1);if(i>=0&&i<sel.options.length){sel.selectedIndex=i;paint(true);}},{passive:false});
 svgEl.addEventListener('pointerdown',e=>{const s=signals();if(!s)return;drag={x:e.clientX,start:offset??Math.max(0,(s.now?.()??0)-windowUs())};svgEl.setPointerCapture(e.pointerId);$('la-follow').checked=false;});
 svgEl.addEventListener('pointermove',e=>{if(!drag)return;const w=svgEl.clientWidth-LABEL;offset=Math.max(0,drag.start-(e.clientX-drag.x)/Math.max(1,w)*windowUs());paint(true);});
 svgEl.addEventListener('pointerup',()=>{drag=null;});
 function paint(force=false){
  if(panel.hidden)return;const now=performance.now();if(!force&&now-last<100)return;last=now;
  const s=signals();let channels=[];try{channels=s?.channels?.()||[];}catch{channels=[];}
  $('la-empty').hidden=channels.length>0;$('la-view').hidden=!channels.length;
  if(!channels.length){$('la-frames').replaceChildren();return;}
  const width=Math.max(320,svgEl.clientWidth||panel.clientWidth-32),span=windowUs(),end=offset===null||$('la-follow').checked?Math.max(span,s.now?.()??span):offset+span,start=end-span;
  const rows=channels.flatMap(ch=>(ch.lines?.length?ch.lines:[{id:ch.id,label:ch.label}]).map((line,i)=>({ch,line,first:i===0})));
  const height=rows.length*ROW+26+(($('la-decode').checked)?channels.length*0:0);
  const x=us=>LABEL+(us-start)/span*(width-LABEL);
  let body='';const frameList=[];
  // time axis
  const step=niceStep(span/8);for(let t=Math.ceil(start/step)*step;t<=end;t+=step){const px=x(t);body+=`<line class="la-grid" x1="${px}" y1="0" x2="${px}" y2="${height-20}"/><text class="la-tick" x="${px+2}" y="${height-6}">${fmt(t)}</text>`;}
  rows.forEach((row,r)=>{
   const y0=r*ROW+6,hi=y0+4,lo=y0+ROW-12;
   body+=`<text class="la-label" x="6" y="${y0+ROW/2}" ${row.first?'':'opacity=".85"'}>${esc(row.first?`${row.ch.label} · ${row.line.label}`:row.line.label)}</text>`;
   let pts=[];try{pts=s.samples(row.line.id,start,end)||[];}catch{pts=[];}
   if(pts.length){let d='',prev=null;for(const [t,v] of pts){const px=Math.max(LABEL,x(t)),py=v?hi:lo;if(prev===null)d+=`M${px},${py}`;else d+=`H${px}V${py}`;prev=py;}d+=`H${width}`;body+=`<path class="la-trace" d="${d}"/>`;}
   else body+=`<line class="la-idle" x1="${LABEL}" y1="${hi}" x2="${width}" y2="${hi}"/>`;
  });
  if($('la-decode').checked){
   channels.forEach(ch=>{
    let frames=[];try{frames=s.decode?.(ch.id)||[];}catch{frames=[];}
    const firstRow=rows.findIndex(r=>r.ch===ch),y=firstRow*ROW+6;
    for(const f of frames){if(f.endUs<start||f.startUs>end)continue;const a=Math.max(LABEL,x(f.startUs)),b=Math.min(width,x(f.endUs));if(b-a<2)continue;body+=`<g class="la-frame ${f.error?'error':''}"><rect x="${a}" y="${y+ROW/2-8}" width="${b-a}" height="16" rx="3"/>${b-a>28?`<text x="${a+4}" y="${y+ROW/2+4}">${esc(String(f.label).slice(0,Math.floor((b-a)/6.5)))}</text>`:''}<title>${esc(f.label)}${f.error?' · '+esc(f.error):''}</title></g>`;}
    frameList.push(...frames.slice(-40).map(f=>({ch,f})));
   });
  }
  svgEl.setAttribute('viewBox',`0 0 ${width} ${height}`);svgEl.setAttribute('height',height);svgEl.innerHTML=body;
  const recent=frameList.sort((a,b)=>b.f.startUs-a.f.startUs).slice(0,60);
  $('la-frames').innerHTML=recent.length?`<table><thead><tr><th>시간</th><th>채널</th><th>내용</th><th>상태</th></tr></thead><tbody>${recent.map(({ch,f})=>`<tr class="${f.error?'error':''}"><td>${fmt(f.startUs)}</td><td>${esc(ch.label)}</td><td>${esc(f.label)}</td><td>${f.error?esc(f.error):'정상'}</td></tr>`).join('')}</tbody></table>`:'<p class="form-hint">해석된 프레임이 없습니다.</p>';
 }
 function schedule(){if(rafPending)return;rafPending=true;requestAnimationFrame(()=>{rafPending=false;paint();});}
 tab.addEventListener('click',()=>{syncNoise();requestAnimationFrame(()=>paint(true));});
 setInterval(()=>{if(!panel.hidden&&(isRunning()||drag))schedule();},120);
 return {refresh:()=>paint(true),syncNoise};
}
function niceStep(raw){const p=10**Math.floor(Math.log10(Math.max(raw,1e-3))),n=raw/p;return (n<1.5?1:n<3.5?2:n<7.5?5:10)*p;}
function fmt(us){return us>=1e6?(us/1e6).toFixed(3)+' s':us>=1000?(us/1000).toFixed(us>=1e5?0:2)+' ms':us.toFixed(us>=100?0:1)+' µs';}
