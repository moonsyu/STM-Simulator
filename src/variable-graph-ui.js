import {$,esc} from './common.js';
import {cSymbols} from './c-symbols.js';
import {COLORS,INTERVALS_MS,MAX_PLOTS,WINDOWS_S,variableChart} from './variable-graph.js';
// Bottom-panel 변수 그래프 tab (STM Studio style): pick globals of the program, run, and watch their values over
// simulation time. The list is saved in the project (ide.plots); the samples live in the running session.
export function setupVariableGraph({getSession,getProject,isRunning,onChange,onError}){
 const tabs=document.querySelector('.monitor-tabs');
 const tab=document.createElement('button');tab.dataset.monitor='vars';tab.textContent='변수 그래프';tabs.querySelector('[data-monitor="wave"]')?.after(tab)??tabs.append(tab);
 const panel=document.createElement('section');panel.id='vars-panel';panel.hidden=true;
 panel.innerHTML=`<div class="vg-toolbar"><input id="vg-name" list="vg-names" autocomplete="off" spellcheck="false" placeholder="전역 변수 (예: value, adc[0], s.x)" aria-label="그래프에 추가할 변수"><datalist id="vg-names"></datalist><button id="vg-add" type="button">추가</button><label>샘플 간격 <select id="vg-interval">${INTERVALS_MS.map(v=>`<option value="${v}" ${v===10?'selected':''}>${v} ms</option>`).join('')}</select></label><label>시간 범위 <select id="vg-window">${WINDOWS_S.map(v=>`<option value="${v}" ${v===10?'selected':''}>${v} s</option>`).join('')}</select></label><span class="la-spacer"></span><button id="vg-export" type="button">CSV 저장</button><button id="vg-clear" type="button">기록 지우기</button></div><div id="vg-legend" class="vg-legend"></div><p id="vg-empty" class="la-empty">그래프에 그릴 전역 변수를 추가하고 실행하세요. 해석 실행과 ARM GCC 빌드(에뮬레이터) 모두 실행 중에 변수 값을 샘플 간격마다 읽어 그립니다(STM Studio처럼 전역 변수만).</p><div id="vg-view" class="vg-view"></div>`;
 document.getElementById('bottom-panel').append(panel);
 let last=0,rafPending=false;
 const plots=()=>getProject()?.ide?.plots??[];
 const recorder=()=>{const s=getSession(),r=s?.vars;if(!r)return null;
  // A new run starts from the project's list; keep the session in step with the list and the interval.
  if(r.series.map(x=>x.name).join('\n')!==plots().join('\n'))r.setVariables(plots());
  const us=Number($('vg-interval').value)*1000;if(r.intervalUs!==us)r.setInterval(us/1000);return r;};
 function setPlots(list){onChange([...new Set(list)].slice(0,MAX_PLOTS));recorder();paint(true);}
 function add(){
  const name=$('vg-name').value.trim();
  try{
   if(!name)throw new Error('그래프에 추가할 변수 이름을 입력하세요.');if(name.length>250)throw new Error('변수 식은 250자 이하로 입력하세요.');
   if(plots().includes(name))throw new Error(name+'은(는) 이미 그래프에 있습니다.');if(plots().length>=MAX_PLOTS)throw new Error(`변수는 ${MAX_PLOTS}개까지 그릴 수 있습니다.`);
   setPlots([...plots(),name]);$('vg-name').value='';
  }catch(error){onError(error.message);}
 }
 // Suggestions: globals declared in the project's sources.
 function suggest(){
  const project=getProject(),texts=[project?.code||'',...(project?.firmware?.files||[]).filter(f=>/\.(c|h|cpp)$/i.test(f.name)).map(f=>f.text||'')];
  const names=[...new Set(texts.flatMap(t=>{try{return cSymbols(t).filter(s=>s.kind==='variable').map(s=>s.name);}catch{return [];}}))].sort();
  $('vg-names').innerHTML=names.map(n=>`<option value="${esc(n)}"></option>`).join('');
 }
 $('vg-add').onclick=add;$('vg-name').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();add();}};$('vg-name').onfocus=suggest;
 $('vg-legend').onclick=e=>{const b=e.target.closest('[data-vg-remove]');if(b)setPlots(plots().filter(n=>n!==b.dataset.vgRemove));};
 $('vg-interval').onchange=()=>{recorder();};$('vg-window').onchange=()=>paint(true);
 $('vg-clear').onclick=()=>{getSession()?.vars?.clear();paint(true);};
 $('vg-export').onclick=async()=>{try{const r=recorder();if(!r?.count)throw new Error('먼저 실행해 변수 값을 기록하세요.');const text=r.csv();if(window.desktop?.exportCsv)await window.desktop.exportCsv(text);else{const url=URL.createObjectURL(new Blob([text],{type:'text/csv;charset=utf-8'})),link=document.createElement('a');link.href=url;link.download='stm-simulator-variables.csv';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}}catch(error){onError(error.message);}};
 function paint(force=false){
  if(panel.hidden)return;const now=performance.now();if(!force&&now-last<100)return;last=now;
  const names=plots(),r=recorder(),series=new Map((r?.series??[]).map(s=>[s.name,s]));
  $('vg-legend').innerHTML=names.map((name,i)=>{const s=series.get(name),value=s?.value,error=s?.error;
   return `<span class="vg-chip${error?' error':''}" title="${esc(error||name)}"><i style="background:${COLORS[i%COLORS.length]}"></i><code>${esc(name)}</code><b data-vg-value="${esc(name)}">${error?'읽기 실패':value==null?'—':esc(String(Number(value.toPrecision(8))))}</b><button type="button" data-vg-remove="${esc(name)}" aria-label="${esc(name)} 그래프에서 제거" title="제거">×</button></span>`;}).join('');
  const errors=(r?.series??[]).filter(s=>s.error);
  $('vg-empty').hidden=names.length>0;$('vg-view').hidden=!names.length;
  if(!names.length){$('vg-view').replaceChildren();return;}
  // Fit the panel's visible height under the toolbar and legend (the bottom panel is often short).
  const view=$('vg-view'),room=panel.getBoundingClientRect().bottom-view.getBoundingClientRect().top-(errors.length?18*errors.length+16:0)-12;
  const width=Math.max(360,Math.floor((view.clientWidth||panel.clientWidth-32)-2)),height=Math.max(140,Math.min(600,Math.floor(room)||260));
  $('vg-view').innerHTML=r?variableChart(r,{windowUs:Number($('vg-window').value)*1e6,width,height})+(errors.length?`<p class="vg-error">${errors.map(s=>`${esc(s.name)}: ${esc(s.error)}`).join('<br>')}</p>`:''):`<p class="la-empty">실행하면 ${names.map(esc).join(', ')} 값을 그립니다.</p>`;
 }
 function schedule(){if(rafPending)return;rafPending=true;requestAnimationFrame(()=>{rafPending=false;paint();});}
 tab.addEventListener('click',()=>requestAnimationFrame(()=>paint(true)));
 setInterval(()=>{if(!panel.hidden&&isRunning())schedule();},120);
 return {refresh:()=>paint(true)};
}
