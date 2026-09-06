import {PINS,HOLES,PIN_BY_ID,HOLE_BY_ID,endpointInfo,searchPins} from './pins.js';
import {TWO_PIN_TYPES,MULTI_PIN_TYPES,WIRE_COLORS,PART_DEFS,terminalKeys,attachments,detachPart,normalizeAngle} from './components.js';
import {findMount,applyMount,occupiedHoles} from './placement.js';
import {CircuitSimulation,digitalRead} from './engine.js';
import {UltrasonicSignals} from './sensors.js';
import {partControls,partReadouts} from './part-controls.js';
import {componentExample} from './component-examples.js';
import {compile,Runtime} from './program.js';
import {blankProject,example,validateProject} from './project.js';
import {esc,initSvg,renderWires,renderParts,renderEndpoints,route,updateSimulationSvg,renderMountPreview,renderPinSearch} from './render.js';

const $=id=>document.getElementById(id),svg=$('circuit');
let project=example(),mode='select',pending=null,selection=null,color='#23a68a',status='stopped',result=null,runtime=null,simTime=0,pressed={},undoStack=[],redoStack=[],dirty=false;
let view={x:0,y:0,w:1120,h:730},drag=null,lastWarnings='',replaceAction=null,paintCounter=0,saveTimer,searchSelectedId=null;
try{const cached=localStorage.getItem('stm32lab.project.v2')||localStorage.getItem('stm32lab.project.v1');if(cached)project=validateProject(JSON.parse(cached));}catch{}
initSvg(svg);
let circuitSimulation=new CircuitSimulation(),sensorSignals=new UltrasonicSignals(),audioEnabled=false,audioContext,oscillator,audioGain;
$('extra-parts').innerHTML=Object.entries(PART_DEFS).map(([type,def])=>`<button class="part-card" data-add="${type}"><span class="part-icon extra-icon">${def.icon}</span><span><strong>${def.name}</strong><small>${def.hint}</small></span><b>+</b></button>`).join('');
$('extra-example').innerHTML='<option value="">추가 부품 예제 선택…</option>'+Object.entries(PART_DEFS).map(([type,def])=>`<option value="${type}">${def.name} 실습</option>`).join('');
function uid(prefix){return prefix+crypto.randomUUID().replaceAll('-','').slice(0,12);}
function running(){return status==='running'||status==='paused';}
function log(message,type='info'){
 const div=document.createElement('div');div.className=`log-line ${type}`;
 const span=document.createElement('span');span.className='stamp';span.textContent=(simTime/1000).toFixed(3)+' s';div.append(span,document.createTextNode(message));
 $('console-output').append(div);while($('console-output').children.length>150)$('console-output').firstChild.remove();$('console-output').scrollTop=$('console-output').scrollHeight;
}
function autosave(){clearTimeout(saveTimer);$('save-state').textContent='저장 중…';saveTimer=setTimeout(()=>{try{localStorage.setItem('stm32lab.project.v2',JSON.stringify(project));$('save-state').textContent='자동 저장됨';}catch{$('save-state').textContent='파일로 저장해 주세요';}},200);}
function checkpoint(){undoStack.push(JSON.stringify(project));if(undoStack.length>80)undoStack.shift();redoStack=[];dirty=true;}
function changed(){autosave();refresh();}
function setMode(m){if(running()){log('편집하려면 시뮬레이션을 먼저 정지하세요.');return;}mode=m;pending=null;selection=null;$('preview-layer').innerHTML='';refresh();}
function syncEditor(){ $('project-name').value=project.name;$('code').value=project.code;lineNumbers(); }
function lineNumbers(){ $('line-numbers').textContent=Array.from({length:$('code').value.split('\n').length},(_,i)=>i+1).join('\n'); }
function tab(name){document.querySelectorAll('[data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab===name));$('code-panel').hidden=name!=='code';$('inspect-panel').hidden=name!=='inspect';}
function refresh(){
 $('wire-layer').innerHTML=renderWires(project,selection);
 $('part-layer').innerHTML=renderParts(project,selection,result,pressed);
 $('endpoint-layer').innerHTML=renderEndpoints(project,pending);
 $('builtin-led').setAttribute('fill',result&&result.voltage('signal:PA5')>1.8?'#64e66b':'#89a486');
 $('builtin-led').style.filter=result&&result.voltage('signal:PA5')>1.8?'drop-shadow(0 0 5px #59dc65)':'';
 $('tool-select').classList.toggle('active',mode==='select');$('tool-wire').classList.toggle('active',mode==='wire');
 document.querySelectorAll('[data-add]').forEach(b=>{b.classList.toggle('active',mode===b.dataset.add);b.disabled=running();});
 $('undo').disabled=running()||!undoStack.length;$('redo').disabled=running()||!redoStack.length;$('delete').disabled=running()||!['part','wire'].includes(selection?.type);
 $('rotate').disabled=running()||selection?.type!=='part';
 $('code').readOnly=running();$('project-name').readOnly=running();
 $('run').classList.toggle('running',running());$('run').textContent=running()?'■  시뮬레이션 정지':'▶  시뮬레이션 시작';
 $('step').disabled=status==='running';
 $('mode-label').textContent=running()?'시뮬레이션 실행 중':status==='error'?'회로 확인 필요':'회로 편집';
 $('run-status').textContent=({running:'실행 중',paused:'한 단계 실행',stopped:'준비됨',error:'오류로 정지'})[status];
 $('status-led').className=running()?'running':'';
 $('connection-count').textContent=`부품 ${project.components.length}개 · 배선 ${project.wires.length}개`;
 $('hint').textContent=running()?'실행 중 핀을 클릭하면 전압을 측정합니다. 버튼은 누르는 동안 연결됩니다.':pending?'연결할 두 번째 핀 또는 구멍을 클릭하세요. Esc로 취소합니다.':TWO_PIN_TYPES.includes(mode)?'빵판 구멍 두 곳을 선택해 다리를 꽂으세요. 빈 공간 클릭 시 자유 배치합니다.':drag?.type==='part'?'초록색 표시가 나타나면 놓아서 장착하세요. R: 45° 회전':'부품을 끌어 빵판에 장착 · R: 45° 회전 · 선택 후 Esc: 삭제';
 updateReadouts();inspector();
}
function updateAudio(){if(audioGain)audioGain.gain.setTargetAtTime(audioEnabled&&status==='running'&&project.components.some(p=>p.type==='buzzer'&&result?.parts[p.id]?.on)&&!result?.fault?0.025:0,audioContext.currentTime,.015);}
$('sound').onclick=async()=>{audioEnabled=!audioEnabled;if(audioEnabled&&!audioContext){audioContext=new AudioContext();oscillator=audioContext.createOscillator();audioGain=audioContext.createGain();oscillator.frequency.value=2300;audioGain.gain.value=0;oscillator.connect(audioGain).connect(audioContext.destination);oscillator.start();}if(audioEnabled)await audioContext.resume();$('sound').textContent=audioEnabled?'소리 켜짐':'소리 꺼짐';$('sound').setAttribute('aria-pressed',String(audioEnabled));updateAudio();};
function updateReadouts(){
 updateAudio();
 if(selection?.type==='part'){const p=project.components.find(p=>p.id===selection.id);if(p&&$('part-live'))$('part-live').innerHTML=partReadouts(p,result);const read=p&&result?.parts[p.id];if($('part-voltage'))$('part-voltage').textContent=read?read.voltage.toFixed(3)+' V':'—';if($('part-current'))$('part-current').textContent=read?(read.current*1000).toFixed(3)+' mA':'—';}
 $('sim-time').textContent=(simTime/1000).toFixed(3)+' s';
 $('sim-current').textContent=result&&!result.fault?(result.current*1000).toFixed(2)+' mA':'—';
 $('warning-count').textContent=result?.warnings.length?`확인 ${result.warnings.length}건`:running()?'연결 상태 정상':'정지 상태';
}
function inspector(){
 const el=$('inspector');
 if(!selection){el.innerHTML='<span class="overline">CIRCUIT INSPECTOR</span><h2>회로 살펴보기</h2><div class="empty-inspector">핀, 배선 또는 부품을 선택하세요.<br>실행 중 전압과 전류를 확인할 수 있습니다.</div>';return;}
 if(selection.type==='endpoint'){
   const e=endpointInfo(selection.id,project.components),pin=PIN_BY_ID.get(selection.id),v=result?.voltage(selection.id);
   const connected=result?[...PINS,...HOLES].filter(p=>result.uf.find(p.id)===result.uf.find(selection.id)).length:0;
   el.innerHTML=`<span class="overline">CONNECTION POINT</span><h2>${esc(e?.label||selection.id)}</h2><p>${pin?esc(pin.signal==='NC'?'연결되지 않은 NC 핀':`신호: ${pin.signal}`):'빵판의 실제 연결 그룹을 기준으로 계산합니다.'}</p><div class="measure"><span>전압 · GND 기준</span><b>${v!=null?v.toFixed(3)+' V':'—'}</b></div><div class="measure"><span>연결된 핀 / 구멍</span><b>${result?connected:'—'}</b></div><p>${running()?'전압이 표시되지 않으면 부유 상태이거나 전원에 연결되지 않은 노드입니다.':'시뮬레이션을 실행하면 연결점의 전압을 확인할 수 있습니다.'}</p>`;
 } else if(selection.type==='part'){
   const p=project.components.find(p=>p.id===selection.id);if(!p)return;
   const read=result?.parts[p.id],mounted=Object.keys(attachments(p)).length;
   el.innerHTML=`<span class="overline">${p.type.toUpperCase()}</span><h2>${esc(p.name)}</h2><p>${mounted?`${mounted} / ${terminalKeys(p).length}개 다리 장착`:'자유 배치 · 끌어서 빵판에 놓으세요.'}</p><div class="inspector-card"><label for="part-name">부품 이름</label><input id="part-name" value="${esc(p.name)}" maxlength="80" ${running()?'disabled':''}>${p.type==='resistor'?`<label for="part-value">저항 (Ω)</label><input id="part-value" type="number" value="${p.value}" min="1" max="10000000" ${running()?'disabled':''}>`:''}${p.type==='led'?`<label for="part-color">LED 색상</label><select id="part-color" ${running()?'disabled':''}>${[['red','빨강'],['green','초록'],['blue','파랑'],['yellow','노랑']].map(([v,l])=>`<option value="${v}" ${p.color===v?'selected':''}>${l}</option>`).join('')}</select>`:''}</div>${partControls(p,running())}<div class="measure"><span>부품 전압</span><b id="part-voltage">${read?read.voltage.toFixed(3)+' V':'—'}</b></div><div class="measure"><span>전류</span><b id="part-current">${read?(read.current*1000).toFixed(3)+' mA':'—'}</b></div>${p.type==='resistor'?`<div class="measure"><span>소비 전력</span><b>${read?(read.power*1000).toFixed(2)+' mW':'—'}</b></div>`:''}${p.type==='button'?'<p>실행 중 버튼 몸체를 누르고 계시면 연결되고 손을 떼면 끊어집니다. A1–A2, B1–B2는 항상 연결되며, 누르면 양쪽이 연결됩니다.</p>':''}${p.type==='lcd'?'<p>LCD 1602의 16핀 배치·배선 모형입니다. 화면 제어 명령은 아직 실행하지 않습니다. 세로로 회전하면 빵판 열에 장착할 수 있습니다.</p>':''}<div class="measure"><span>회전 각도</span><b>${Number(p.rotation.toFixed(1))}°</b></div><button class="inspector-action" id="rotate-part" ${running()?'disabled':''}>45° 회전 (R)</button><button class="inspector-action danger" id="remove-part" ${running()?'disabled':''}>부품 삭제</button>`;
   $('part-name').onchange=e=>{checkpoint();p.name=e.target.value||p.name;changed();};
   if($('part-value'))$('part-value').onchange=e=>{const n=Number(e.target.value);if(!Number.isFinite(n)||n<1||n>1e7){log('저항 범위: 1 Ω~10 MΩ','error');inspector();return;}checkpoint();p.value=n;changed();};
   if($('part-color'))$('part-color').onchange=e=>{checkpoint();p.color=e.target.value;changed();};
   if($('part-live'))$('part-live').innerHTML=partReadouts(p,result);
   el.querySelectorAll('[data-part-prop]').forEach(input=>{input.oninput=()=>{if(running()&&input.dataset.live!=='true')return;const n=Number(input.value),key=input.dataset.partProp;if(!Number.isFinite(n)||(input.min!==undefined&&input.min!==''&&n<Number(input.min))||(input.max!==undefined&&input.max!==''&&n>Number(input.max)))return;if(!input.dataset.checkpoint){checkpoint();input.dataset.checkpoint='1';}p[key]=n;if($('output-'+key))$('output-'+key).textContent=input.type==='range'?n:'';autosave();if(running())recompute();updateSimulationSvg(svg,project,result,pressed);updateReadouts();};input.onchange=()=>{delete input.dataset.checkpoint;};});
   $('remove-part').onclick=removeSelected;$('rotate-part').onclick=rotateSelected;
 } else if(selection.type==='wire'){
   const w=project.wires.find(w=>w.id===selection.id);if(!w)return;
   el.innerHTML=`<span class="overline">WIRE</span><h2>점퍼선</h2><div class="inspector-card"><label>시작</label><p>${esc(endpointInfo(w.from,project.components)?.label)}</p><label>끝</label><p>${esc(endpointInfo(w.to,project.components)?.label)}</p></div><p>전기 저항이 없는 이상적인 도선으로 계산합니다. 선이 교차하는 위치는 서로 연결되지 않습니다.</p><button class="inspector-action danger" id="remove-wire" ${running()?'disabled':''}>배선 삭제</button>`;
   $('remove-wire').onclick=removeSelected;
 }
}
function removeSelected(){
 if(running()||!selection)return;
 if(selection.type==='part'){checkpoint();project.components=project.components.filter(p=>p.id!==selection.id);project.wires=project.wires.filter(w=>![w.from,w.to].some(id=>id.startsWith(`part:${selection.id}:`)));}
 else if(selection.type==='wire'){checkpoint();project.wires=project.wires.filter(w=>w.id!==selection.id);}else return;
 selection=null;pending=null;drag=null;$('preview-layer').innerHTML='';changed();
}
function rotateSelected(){
 if(running()||selection?.type!=='part')return;
 const p=project.components.find(p=>p.id===selection.id);if(!p)return;
 if(!drag?.moved)checkpoint();
 detachPart(p);p.rotation=normalizeAngle(p.rotation+45);
 if(drag?.type==='part'){drag.moved=true;refresh();$('preview-layer').innerHTML=renderMountPreview(findMount(p,project.components));}
 else {applyMount(p,findMount(p,project.components));changed();}
}
function editUndo(redo=false){if(running())return;const from=redo?redoStack:undoStack,to=redo?undoStack:redoStack;if(!from.length)return;to.push(JSON.stringify(project));project=JSON.parse(from.pop());selection=null;pending=null;syncEditor();changed();}
function addPart(type,a,b,position){
 if(project.components.length>=100){log('부품은 100개까지 추가할 수 있습니다.','error');return;}
 const name=((({resistor:'R',led:'LED',button:'SW',lcd:'LCD'})[type])||PART_DEFS[type]?.prefix)+(project.components.filter(p=>p.type===type).length+1);
 const p={id:uid('p'),type,name,x:position?.x??(a.x+b.x)/2,y:position?.y??(a.y+b.y)/2,rotation:0};
 if(type==='resistor')p.value=330;if(type==='led')p.color='red';Object.assign(p,PART_DEFS[type]?.defaults||{});
 if(TWO_PIN_TYPES.includes(type)){p.span=a&&b?Math.hypot(b.x-a.x,b.y-a.y):70;if(a&&b){p.attachA=a.id;p.attachB=b.id;p.rotation=normalizeAngle(Math.atan2(b.y-a.y,b.x-a.x)*180/Math.PI);}}
 checkpoint();project.components.push(p);selection={type:'part',id:p.id};pending=null;mode='select';$('preview-layer').innerHTML='';tab('inspect');changed();
}
function clickEndpoint(id){
 const pin=PIN_BY_ID.get(id);selection={type:'endpoint',id};
 if(running()){tab('inspect');refresh();return;}
 if(pin?.signal==='NC'){log('NC 핀은 내부에 연결되지 않았습니다.');pending=null;refresh();return;}
 if(!pending){pending=id;tab('inspect');refresh();return;}
 if(pending===id){pending=null;refresh();return;}
 if(TWO_PIN_TYPES.includes(mode)){
   if(id.startsWith('part:')||pending.startsWith('part:')){log('부품을 꽂으려면 보드 핀 또는 빵판 구멍을 선택하세요.');return;}
   const occupied=occupiedHoles(project.components);if(occupied.has(id)||occupied.has(pending)){log('이미 부품이 꽂힌 구멍입니다. 다른 구멍을 선택하세요.');pending=null;refresh();return;}
   addPart(mode,endpointInfo(pending),endpointInfo(id));return;
 }
 if(project.wires.length>=500){log('배선은 500개까지 추가할 수 있습니다.','error');pending=null;return;}
 if(!project.wires.some(w=>(w.from===pending&&w.to===id)||(w.to===pending&&w.from===id))){checkpoint();project.wires.push({id:uid('w'),from:pending,to:id,color});}
 pending=null;selection=null;$('preview-layer').innerHTML='';changed();
}
function point(e){const p=svg.createSVGPoint();p.x=e.clientX;p.y=e.clientY;return p.matrixTransform(svg.getScreenCTM().inverse());}
function viewUpdate(){svg.setAttribute('viewBox',`${view.x} ${view.y} ${view.w} ${view.h}`);$('zoom-reset').textContent=Math.round(1120/view.w*100)+'%';}
svg.addEventListener('pointerdown',e=>{
 if(e.button!==0&&e.button!==1)return;svg.focus({preventScroll:true});
 const target=e.target,part=target.closest('[data-part]'),onboard=target.closest('[data-button]');
 if(running()&&(onboard||part)){
   if(onboard?.dataset.button==='RESET'){if(status==='running'){initializeRuntime();status='running';}else initializeRuntime();refresh();return;}
   const id=onboard?.dataset.button||part?.dataset.part,p=project.components.find(p=>p.id===id);
   if(p?.type==='slide'&&!target.closest('[data-endpoint]')){checkpoint();p.position=1-p.position;selection={type:'part',id:p.id};tab('inspect');recompute();autosave();refresh();return;}
   if(id==='USER'||p?.type==='button'){pressed[id]=true;drag={type:'press',id};svg.setPointerCapture(e.pointerId);recompute();refresh();return;}
 }
 const pin=target.closest('[data-endpoint]');if(pin){clickEndpoint(pin.dataset.endpoint);return;}
 const wire=target.closest('[data-wire]');if(wire){pending=null;selection={type:'wire',id:wire.dataset.wire};tab('inspect');refresh();return;}
 if(part){
   pending=null;selection={type:'part',id:part.dataset.part};tab('inspect');
   if(!running()){const p=project.components.find(p=>p.id===part.dataset.part),q=point(e);drag={type:'part',id:p.id,start:q,x:p.x,y:p.y,moved:false};svg.setPointerCapture(e.pointerId);}
   refresh();return;
 }
 const q=point(e);
 if(!running()&&TWO_PIN_TYPES.includes(mode)){addPart(mode,null,null,{x:Math.max(40,Math.min(1080,q.x)),y:Math.max(40,Math.min(690,q.y))});return;}
 if(pending){pending=null;$('preview-layer').innerHTML='';refresh();return;}
 selection=null;drag={type:'pan',clientX:e.clientX,clientY:e.clientY,x:view.x,y:view.y};svg.setPointerCapture(e.pointerId);refresh();
});
svg.addEventListener('pointermove',e=>{
 const q=point(e);
 if(drag?.type==='part'){
   const p=project.components.find(p=>p.id===drag.id),dx=q.x-drag.start.x,dy=q.y-drag.start.y;
   if(!drag.moved&&Math.hypot(dx,dy)>3){checkpoint();drag.moved=true;detachPart(p);}
   if(drag.moved){p.x=Math.max(40,Math.min(1080,drag.x+dx));p.y=Math.max(40,Math.min(690,drag.y+dy));refresh();$('preview-layer').innerHTML=renderMountPreview(findMount(p,project.components));}
   return;
 }
 if(drag?.type==='pan'){const box=svg.getBoundingClientRect();view.x=drag.x-(e.clientX-drag.clientX)*view.w/box.width;view.y=drag.y-(e.clientY-drag.clientY)*view.h/box.height;viewUpdate();return;}
 if(pending){const a=endpointInfo(pending,project.components);$('preview-layer').innerHTML=`<path d="${route(a,q)}" fill="none" stroke="${color}" stroke-width="2" stroke-dasharray="5 5" pointer-events="none"/>`;}
 const hit=e.target.closest('[data-endpoint]');
 document.querySelectorAll('.same-net').forEach(el=>el.classList.remove('same-net'));
 if(hit){const id=hit.dataset.endpoint,info=endpointInfo(id,project.components),v=result?.voltage(id),hole=HOLE_BY_ID.get(id);if(hole)for(const h of HOLES)if(h.bus===hole.bus)svg.querySelector(`[data-hole="${h.id}"]`)?.classList.add('same-net');
   $('tooltip').textContent=info.label+(running()?`\n${v==null?'부유 상태':v.toFixed(3)+' V'}`:'');const box=$('canvas-container').getBoundingClientRect();$('tooltip').style.left=Math.min(e.clientX-box.left+12,box.width-220)+'px';$('tooltip').style.top=Math.max(0,e.clientY-box.top-47)+'px';$('tooltip').hidden=false;
 }else $('tooltip').hidden=true;
});
function release(){if(drag?.type==='press'){pressed[drag.id]=false;recompute();refresh();}if(drag?.type==='part'&&drag.moved){const p=project.components.find(p=>p.id===drag.id);if(p){const mounted=applyMount(p,findMount(p,project.components));log(mounted?`${p.name}: ${terminalKeys(p).length}개 다리를 빵판에 장착했습니다.`:`${p.name}: 자유 배치 상태입니다. 모든 다리가 구멍에 맞을 때 장착됩니다.`);}autosave();}drag=null;$('preview-layer').innerHTML='';refresh();}
svg.addEventListener('pointerup',release);svg.addEventListener('pointercancel',release);window.addEventListener('blur',()=>{if(Object.values(pressed).some(Boolean)){pressed={};recompute();refresh();}});
svg.addEventListener('pointerleave',()=>{$('tooltip').hidden=true;});
function zoom(mult){const nw=Math.max(430,Math.min(1500,view.w*mult)),nh=nw*730/1120;view.x+=(view.w-nw)/2;view.y+=(view.h-nh)/2;view.w=nw;view.h=nh;viewUpdate();}
svg.addEventListener('wheel',e=>{e.preventDefault();zoom(e.deltaY>0?1.08:1/1.08);},{passive:false});
$('zoom-in').onclick=()=>zoom(1/1.2);$('zoom-out').onclick=()=>zoom(1.2);$('zoom-reset').onclick=()=>{view={x:0,y:0,w:1120,h:730};viewUpdate();};
function pinSearch(){
 const pins=searchPins($('pin-search').value);
 $('search-layer').innerHTML=renderPinSearch(pins,searchSelectedId);
 $('pin-results').innerHTML=!$('pin-search').value.trim()?'':pins.length?pins.map(p=>`<button data-search-pin="${p.id}" class="${p.id===searchSelectedId?'selected':''}" aria-pressed="${p.id===searchSelectedId}"><strong>${esc(p.signal)}</strong><span>${esc(p.header)}-${p.number} · ${esc(p.label)}</span></button>`).join(''):'<p>일치하는 핀이 없습니다.</p>';
 $('pin-results').querySelectorAll('button').forEach(b=>b.onclick=()=>focusPin(b.dataset.searchPin));
}
function focusPin(id){const p=PIN_BY_ID.get(id);if(!p)return;pending=null;selection={type:'endpoint',id};searchSelectedId=id;$('preview-layer').innerHTML='';pinSearch();view={x:p.x-310,y:p.y-202,w:620,h:620*730/1120};viewUpdate();tab('inspect');refresh();svg.focus({preventScroll:true});}
$('pin-search').addEventListener('input',()=>{searchSelectedId=null;pinSearch();});
$('pin-search').addEventListener('keydown',e=>{if(e.key==='Enter'){const p=searchPins(e.target.value)[0];if(p)focusPin(p.id);}if(e.key==='Escape'){e.stopPropagation();e.target.value='';searchSelectedId=null;pinSearch();}});
function recompute(){if(!runtime)return;result=circuitSimulation.solve(project,runtime.gpio,pressed,simTime,sensorSignals.echoHigh(Math.max(simTime*1000,runtime.microTime)));const warning=result.warnings.join('|');if(warning&&warning!==lastWarnings)result.warnings.forEach(w=>log(w,'error'));lastWarnings=warning;if(result.fault){status='error';log('회로 오류로 실행을 정지했습니다.','error');}}
function initializeRuntime(){
 try{const compiled=compile(project.code);simTime=0;pressed={};lastWarnings='';result=null;circuitSimulation=new CircuitSimulation();sensorSignals=new UltrasonicSignals();runtime=new Runtime(compiled,{changed:micros=>{recompute();sensorSignals.update(project,result,micros);},pulseIn:(pin,state,timeout,micros)=>{recompute();sensorSignals.update(project,result,micros);return sensorSignals.pulseIn(project,result,pin,state,timeout,micros);},read:pin=>{recompute();return digitalRead(pin,result);},voltage:pin=>{recompute();return result?.voltage(`signal:${pin}`);},print:s=>log(s,'serial')});status='paused';pending=null;mode='select';runtime.tick(0);recompute();log('스케치를 시작했습니다.');return status!=='error';}
 catch(e){runtime=null;status='error';log(e.message,'error');return false;}
}
function stop(){status='stopped';runtime=null;result=null;pressed={};pending=null;$('preview-layer').innerHTML='';log('시뮬레이션을 정지했습니다.');refresh();}
$('run').onclick=()=>{if(running())stop();else {if(initializeRuntime())status='running';refresh();}};
$('step').onclick=()=>{if(!runtime||status==='error'){initializeRuntime();}else {try{simTime+=20;runtime.tick(simTime);recompute();}catch(e){status='error';log(e.message,'error');}}refresh();};
setInterval(()=>{
 if(status!=='running')return;
 try{simTime+=20;runtime.tick(simTime);recompute();
   updateSimulationSvg(svg,project,result,pressed);updateReadouts();
   if(status==='error')refresh();else if(++paintCounter%10===0&&!$('inspect-panel').hidden&&!$('inspector').contains(document.activeElement))inspector();
 }catch(e){status='error';log(e.message,'error');refresh();}
},20);
$('tool-select').onclick=()=>setMode('select');$('tool-wire').onclick=()=>setMode('wire');$('delete').onclick=removeSelected;$('rotate').onclick=rotateSelected;$('undo').onclick=()=>editUndo();$('redo').onclick=()=>editUndo(true);
document.querySelectorAll('[data-add]').forEach(b=>b.onclick=()=>{if(running())return;const type=b.dataset.add;if(MULTI_PIN_TYPES.includes(type)){addPart(type,null,null,{x:Math.max(130,Math.min(990,view.x+view.w*.48)),y:Math.max(80,Math.min(670,view.y+view.h*.85))});svg.focus({preventScroll:true});}else setMode(type);});
$('wire-palette').innerHTML=WIRE_COLORS.map(([value,name])=>`<button data-color="${value}" class="swatch ${value===color?'active':''}" style="--swatch:${value}" title="${name} 배선" aria-label="${name} 배선"></button>`).join('');
document.querySelectorAll('[data-color]').forEach(b=>b.onclick=()=>{color=b.dataset.color;document.querySelectorAll('[data-color]').forEach(s=>s.classList.toggle('active',s===b));if(!running()&&selection?.type==='wire'){checkpoint();project.wires.find(w=>w.id===selection.id).color=color;changed();}});
document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>tab(b.dataset.tab));
function replaceProject(p){if(running())stop();project=validateProject(p);selection=null;pending=null;drag=null;$('preview-layer').innerHTML='';undoStack=[];redoStack=[];status='stopped';runtime=null;result=null;simTime=0;dirty=false;syncEditor();autosave();refresh();log('회로를 열었습니다: '+project.name);}
function requestReplace(action){if(dirty){replaceAction=action;$('replace-dialog').showModal();}else action();}
$('replace-cancel').onclick=()=>{$('replace-dialog').close();replaceAction=null;};$('replace-confirm').onclick=()=>{$('replace-dialog').close();replaceAction?.();replaceAction=null;};
document.querySelectorAll('[data-example]').forEach(b=>b.onclick=()=>requestReplace(()=>replaceProject(example(b.dataset.example))));
$('extra-example').onchange=e=>{const type=e.target.value;if(type)requestReplace(()=>replaceProject(componentExample(type)));e.target.value='';};
$('new').onclick=()=>requestReplace(()=>replaceProject(blankProject()));
$('project-name').onchange=e=>{checkpoint();project.name=e.target.value.trim()||'새 회로';changed();};
let lastCodeCheckpoint=0;
$('code').addEventListener('input',()=>{if(Date.now()-lastCodeCheckpoint>1000){checkpoint();lastCodeCheckpoint=Date.now();}project.code=$('code').value;lineNumbers();autosave();$('undo').disabled=false;});
$('code').addEventListener('scroll',()=>{$('line-numbers').scrollTop=$('code').scrollTop;});
$('code').addEventListener('keydown',e=>{if(e.key==='Tab'){e.preventDefault();if(running())return;const a=e.target.selectionStart,b=e.target.selectionEnd;e.target.setRangeText('  ',a,b,'end');e.target.dispatchEvent(new Event('input'));}});
async function save(){try{const data=JSON.stringify(project,null,2);if(window.desktop){const path=await window.desktop.save(data);if(!path)return;}else{const blob=new Blob([data],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=project.name.replace(/[^\w가-힣-]/g,'_')+'.stm32lab';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}dirty=false;log('회로 파일을 저장했습니다.');}catch(e){log('저장 실패: '+e.message,'error');}}
$('save').onclick=save;
async function open(){try{if(window.desktop){const data=await window.desktop.open();if(data!=null)replaceProject(validateProject(JSON.parse(data)));}else $('file-input').click();}catch(e){log('불러오기 실패: '+e.message,'error');}}
$('open').onclick=()=>requestReplace(open);
$('file-input').onchange=async e=>{try{const f=e.target.files[0];if(!f)return;if(f.size>2e6)throw new Error('파일 크기는 2 MB 이하여야 합니다.');replaceProject(validateProject(JSON.parse(await f.text())));}catch(err){log('불러오기 실패: '+err.message,'error');}e.target.value='';};
$('clear-console').onclick=()=>{$('console-output').textContent='';};
$('help').onclick=$('api-help').onclick=()=>$('help-dialog').showModal();
window.addEventListener('keydown',e=>{
 const editing=['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName),modal=document.querySelector('dialog[open]');if(modal)return;
 if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();save();return;}
 if(editing)return;
 if(e.key==='Escape'){e.preventDefault();if(!pending&&['part','wire'].includes(selection?.type)){removeSelected();}else {pending=null;mode='select';selection=null;$('preview-layer').innerHTML='';refresh();}}
 if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();removeSelected();}
 if(e.key.toLowerCase()==='r')rotateSelected();if(e.key.toLowerCase()==='w')setMode('wire');if(e.key.toLowerCase()==='v')setMode('select');
 if(e.ctrlKey&&e.key.toLowerCase()==='z'){e.preventDefault();editUndo(e.shiftKey);}if(e.ctrlKey&&e.key.toLowerCase()==='y'){e.preventDefault();editUndo(true);}
});
window.addEventListener('error',e=>log('화면 오류: '+e.message,'error'));
syncEditor();refresh();log('회로를 연결하고 시뮬레이션 시작을 눌러 보세요.');
