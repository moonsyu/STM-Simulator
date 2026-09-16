import {selectedIds,isSelected,toggleSelection,wirePoints,insertWirePoint,connectedNet,copySelection,pasteSelection,moveSelection} from './circuit-edit.js';
import {circuitDiagnostics} from './circuit-diagnostics.js';
import {PINS,BB,PIN_BY_ID,endpointInfo,searchPins,circuitHoles,holeInfo} from './pins.js';
import {TWO_PIN_TYPES,MULTI_PIN_TYPES,WIRE_COLORS,PART_DEFS,terminalKeys,attachments,detachPart,normalizeAngle} from './components.js';
import {findMount,applyMount,occupiedHoles} from './placement.js';
import {SimulationSession} from './session.js';
import {Monitor} from './monitor.js';
import {partControls,partReadouts} from './part-controls.js';
import {blankProject,validateProject,projectForBoard} from './project.js';
import {moveBreadboard,removeBreadboard} from './breadboards.js';
import {setupBoardPicker} from './board-picker.js';
import {PinoutPanel} from './pinout-ui.js';
import {defaultMcu} from './mcu-config.js';
import {importFirmware} from './firmware-import.js';
import {compileHal} from './hal-source.js';
import {compile} from './parser.js';
import {HAL_EXAMPLES,HAL_GUIDES,applyHalExample} from './hal-examples.js';
import {setupEditorResize} from './editor-layout.js';
import {setupEditorSearch} from './editor-search.js';
import {SERIAL_IDS} from './serial-config.js';
import {PART_LIBRARY,searchParts} from './part-library.js';
import {esc,initSvg,renderWires,renderParts,renderBreadboards,renderEndpoints,route,updateSimulationSvg,renderMountPreview,renderPinSearch} from './render.js';

const $=id=>document.getElementById(id),svg=$('circuit');
setupEditorResize();
let project=blankProject(),mode='select',pending=null,selection=null,color='#23a68a',status='stopped',result=null,runtime=null,simTime=0,pressed={},undoStack=[],redoStack=[],dirty=false;
let view={x:0,y:0,w:1120,h:730},drag=null,lastWarnings='',replaceAction=null,paintCounter=0,saveTimer,searchSelectedId=null;
try{const cached=localStorage.getItem('stm32lab.project.v2')||localStorage.getItem('stm32lab.project.v1');if(cached)project=validateProject(JSON.parse(cached));}catch{}
initSvg(svg);
let session=null,audioEnabled=false,audioContext,oscillator,audioGain;
const monitor=new Monitor({getSession:()=>session,isRunning:()=>running(),onSettings:settings=>{if(running())return;checkpoint();project.simulation=settings;autosave();},onError:message=>log(message,'error')});
let sourceFile='main.c',circuitClipboard=null,clipboardOffset=28,issuesStamp=0,issuesKey='';
const pinout=new PinoutPanel({getProject:()=>project,isRunning:running,onError:message=>log(message,'error'),apply:({mcu,code})=>{checkpoint();project.mcu=mcu;if(code!==null){project.code=code;project.firmware={mode:'hal',files:[]};sourceFile='main.c';}syncEditor();changed();log(code===null?'핀 설정을 적용했습니다.':'설정에 맞는 HAL main.c를 생성했습니다.');}});
const updateBoardPicker=setupBoardPicker({getProject:()=>project,isRunning:running,onSelect:id=>{sourceFile='main.c';replaceProject(projectForBoard(id));log('선택한 보드의 기본 회로로 시작합니다.');}});
const editorSearch=setupEditorSearch({applyEdit:replaceCodeText,maxLength:()=>{
 const otherFiles=(project.firmware?.files||[]).filter(f=>f.name!==sourceFile).reduce((n,f)=>n+f.text.length,0);
 return sourceFile==='main.c'?Math.min(50000,300000-otherFiles):300000-project.code.length-otherFiles;
}});
svg.addEventListener('contextmenu',e=>{const id=e.target.closest('[data-endpoint]')?.dataset.endpoint,p=PIN_BY_ID.get(id);if(p&&/^P[A-H]\d+$/.test(p.signal)){e.preventDefault();pinout.open(p.signal);}});
$('part-list').innerHTML=PART_LIBRARY.map(part=>`<button class="part-card" data-add="${part.type}"><span class="part-icon ${part.iconClass}">${part.icon}</span><span><strong>${part.name}</strong><small>${part.hint}</small></span><b>+</b></button>`).join('')+'<p id="part-no-results" hidden>검색 결과가 없습니다.<br>다른 이름으로 검색해 주세요.</p>';
function filterParts(){
 const matches=new Set(searchParts($('part-search').value).map(part=>part.type));
 $('part-list').querySelectorAll('[data-add]').forEach(button=>{button.hidden=!matches.has(button.dataset.add);});
 $('part-count').textContent=`${matches.size} / ${PART_LIBRARY.length}`;$('part-no-results').hidden=matches.size>0;$('part-list').scrollTop=0;
}
$('part-search').addEventListener('input',filterParts);filterParts();
$('hal-example').innerHTML='<option value="">HAL 예제 선택…</option>'+Object.entries(HAL_EXAMPLES).map(([id,name])=>`<option value="${id}">${name}</option>`).join('');
const uartLines=new Map();
function uid(prefix){return prefix+crypto.randomUUID().replaceAll('-','').slice(0,12);}
function running(){return status==='running'||status==='paused';}
function log(message,type='info'){
 const div=document.createElement('div');div.className=`log-line ${type}`;
 const span=document.createElement('span');span.className='stamp';span.textContent=(simTime/1000).toFixed(3)+' s';div.append(span,document.createTextNode(message));
 $('console-output').append(div);while($('console-output').children.length>150)$('console-output').firstChild.remove();$('console-output').scrollTop=$('console-output').scrollHeight;
 return div;
}
function logUart(event){
 const key=event.instance+' '+event.direction;
 for(const byte of event.bytes){if(byte===13)continue;if(byte===10){uartLines.delete(key);continue;}
  let row=uartLines.get(key);if(!row?.node.isConnected||row.text.length>=512){row={node:log('['+key+'] ','serial'),text:''};row.node.querySelector('.stamp').textContent=(event.micros/1e6).toFixed(3)+' s';uartLines.set(key,row);}
  row.text+=byte>=32&&byte<=126?String.fromCharCode(byte):'\\x'+byte.toString(16).padStart(2,'0');row.node.lastChild.textContent='['+key+'] '+row.text;
 }
 $('console-output').scrollTop=$('console-output').scrollHeight;
}
function autosave(){clearTimeout(saveTimer);$('save-state').textContent='저장 중…';saveTimer=setTimeout(()=>{try{localStorage.setItem('stm32lab.project.v2',JSON.stringify(project));$('save-state').textContent='자동 저장됨';}catch{$('save-state').textContent='파일로 저장해 주세요';}},200);}
function checkpoint(){undoStack.push(JSON.stringify(project));if(undoStack.length>80)undoStack.shift();redoStack=[];dirty=true;}
function changed(){autosave();refresh();}
function setMode(m){if(running()){log('편집하려면 시뮬레이션을 먼저 정지하세요.');return;}mode=m;pending=null;selection=null;$('preview-layer').innerHTML='';refresh();}
function syncEditor(){
 lastCodeCheckpoint=0;
 $('project-name').value=project.name;const files=project.firmware?.files||[],hal=project.firmware?.mode==='hal';if(!files.some(f=>f.name===sourceFile))sourceFile='main.c';
 $('source-file').innerHTML=`<option value="main.c">${hal?'main.c':'main.ino'}</option>`+files.map(f=>`<option value="${esc(f.name)}">${esc(f.name)}</option>`).join('');$('source-file').value=sourceFile;
 $('code').value=sourceFile==='main.c'?project.code:files.find(f=>f.name===sourceFile).text;$('firmware-mode').value=hal?'hal':'sketch';$('firmware-status').textContent=hal?'main(void) · HAL 소스 실행 · ELF/BIN 미지원':'setup() / loop()';
 document.querySelector('.language-badge').textContent=hal?'STM32 HAL':'GPIO 스케치';lineNumbers();monitor.settings(project.simulation);
 document.querySelector('.code-note code').textContent=hal?'HAL_GPIO_Init · WritePin · ReadPin · TogglePin\nHAL_UART_Transmit · Receive_IT\nHAL_GPIO_EXTI_Callback\nHAL_TIM_Base_Start_IT · HAL_ADC_GetValue\nHAL_I2C_Mem_Read · HAL_SPI_Transmit\nprintf("value=%lu\\n", value)':'pinMode · digitalWrite · digitalRead\nanalogRead · analogWrite · delay\nLiquidCrystal · Serial1 · Wire · SPI\nTimer · attachInterrupt · DMA';
 document.querySelector('.code-note p').textContent=hal?'main(void)와 지원 HAL API를 회로에 연결합니다. 전체 HAL 드라이버·ELF/BIN 실행은 지원하지 않습니다.':'GPIO 스케치 문법의 일부를 실행합니다. ELF/BIN 펌웨어 로더는 포함되지 않습니다.';
 const selectedSerial=$('serial-target').value,serials=hal?SERIAL_IDS.filter(id=>project.mcu?.peripherals[id]?.enabled):[],serialKey=hal?serials.join(','):'sketch',keepSerial=$('serial-target').dataset.channels===serialKey;
 $('serial-target').innerHTML=hal?(serials.length?serials.map(id=>`<option value="${id}">UART 터미널 → ${id}</option>`).join(''):'<option value="">UART 핀을 활성화하세요</option>'):'<option value="Serial1">UART 터미널 → Serial1</option><option value="Serial">USB 콘솔 → Serial</option>';
 $('serial-target').value=keepSerial&&[...$('serial-target').options].some(o=>o.value===selectedSerial)?selectedSerial:serials[0]??(hal?'':'Serial1');$('serial-target').dataset.channels=serialKey;$('serial-target').disabled=hal&&!serials.length;
 editorSearch.refresh({sourceChanged:true});
}
function lineNumbers(){ $('line-numbers').textContent=Array.from({length:$('code').value.split('\n').length},(_,i)=>i+1).join('\n'); }
function tab(name){document.querySelectorAll('[data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab===name));$('code-panel').hidden=name!=='code';$('inspect-panel').hidden=name!=='inspect';}
function refresh({preserveWires=false}={}){
 updateBoardPicker();svg.classList.toggle('connecting',mode==='wire'||!!pending||TWO_PIN_TYPES.includes(mode));
 $('breadboard-layer').innerHTML=renderBreadboards(project,selection);
 if(!preserveWires)$('wire-layer').innerHTML=renderWires(project,selection);
 else $('wire-layer').querySelectorAll('[data-wire]').forEach(el=>el.classList.toggle('wire-selected',isSelected(selection,'wire',el.dataset.wire)));
 $('part-layer').innerHTML=renderParts(project,selection,result,pressed);
 $('endpoint-layer').innerHTML=renderEndpoints(project,pending);
 renderConnections();renderIssues(true);
 $('builtin-led').setAttribute('fill',result&&result.voltage('signal:PA5')>1.8?'#64e66b':'#89a486');
 $('builtin-led').style.filter=result&&result.voltage('signal:PA5')>1.8?'drop-shadow(0 0 5px #59dc65)':'';
 $('tool-select').classList.toggle('active',mode==='select');$('tool-wire').classList.toggle('active',mode==='wire');
 document.querySelectorAll('[data-add]').forEach(b=>{b.classList.toggle('active',mode===b.dataset.add);b.disabled=running();});
 $('undo').disabled=running()||!undoStack.length;$('redo').disabled=running()||!redoStack.length;$('delete').disabled=running()||!['part','wire','group'].includes(selection?.type);
 $('rotate').disabled=running()||selection?.type!=='part';
 $('code').readOnly=running();$('project-name').readOnly=running();
 editorSearch.refresh();
 for(const id of ['pinout-open','firmware-mode','firmware-import','firmware-folder','firmware-check','hal-example'])$(id).disabled=running();
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
 monitor.render();renderIssues();
 if(selection?.type==='part'){const p=project.components.find(p=>p.id===selection.id);if(p&&$('part-live'))$('part-live').innerHTML=partReadouts(p,result);const read=p&&result?.parts[p.id];if($('part-voltage'))$('part-voltage').textContent=read?read.voltage.toFixed(3)+' V':'—';if($('part-current'))$('part-current').textContent=read?(read.current*1000).toFixed(3)+' mA':'—';}
 $('sim-time').textContent=(simTime/1000).toFixed(3)+' s';
 $('sim-current').textContent=result&&!result.fault?(result.current*1000).toFixed(2)+' mA':'—';
 $('warning-count').textContent=result?.warnings.length?`확인 ${result.warnings.length}건`:running()?'연결 상태 정상':'정지 상태';
}
function renderConnections(){
 const endpoint=selection?.type==='endpoint'?selection.id:selection?.type==='wire'?project.wires.find(w=>w.id===selection.id)?.from:null;
 const net=endpoint?connectedNet(project,endpoint,pressed):null;
 $('net-layer').innerHTML=net?net.wires.map(w=>`<path d="${wirePoints(project,w).map((p,i)=>`${i?'L':'M'}${p.x} ${p.y}`).join(' ')}" fill="none" stroke="#e8b843" stroke-width="8" opacity=".45"/>`).join('')+net.endpoints.map(p=>`<circle data-net-endpoint="${p.id}" cx="${p.x}" cy="${p.y}" r="7" fill="#ffcf4233" stroke="#c28b14" stroke-width="1.5"/>`).join(''):'';
 const wire=selection?.type==='wire'?project.wires.find(w=>w.id===selection.id):null;
 const handleRadius=7/(svg.getScreenCTM()?.a||1);
 $('wire-handle-layer').innerHTML=!running()&&wire?(wire.points||[]).map((p,i)=>`<circle data-wire-point="${i}" data-owner-wire="${wire.id}" cx="${p.x}" cy="${p.y}" r="${handleRadius}" fill="${drag?.type==='wire-point'&&drag.index===i?'#f1cd6d':'#fffdf4'}" stroke="#937338" stroke-width="2" vector-effect="non-scaling-stroke" tabindex="0" role="button" aria-label="배선 꺾임점 ${i+1}; 끌어서 이동, 우클릭으로 삭제"><title>꺾임점 ${i+1} · 끌어서 이동 · 우클릭 삭제</title></circle>`).join(''):'';
}
function focusIssue(target){
 if(!target){pinout.open();return;}
 pending=null;mode='select';selection=target;const p=target.type==='endpoint'?endpointInfo(target.id,project.components):project.components.find(p=>p.id===target.id);
 if(p){view={x:p.x-310,y:p.y-202,w:620,h:620*730/1120};viewUpdate();}tab('inspect');refresh();svg.focus({preventScroll:true});
}
function renderIssues(force=false){
 if(!force&&performance.now()-issuesStamp<250)return;issuesStamp=performance.now();
 const issues=circuitDiagnostics(project,result,pressed),key=JSON.stringify(issues);if(key===issuesKey)return;issuesKey=key;
 $('circuit-issues').innerHTML=issues.length?issues.map((issue,i)=>`<button class="circuit-issue ${issue.severity}" data-issue="${i}" ${!issue.target&&running()?'disabled':''}><span>${issue.severity==='error'?'!':'·'}</span>${esc(issue.message)}<b>위치 보기 ↗</b></button>`).join(''):'<p class="issues-clear">현재 연결 검사에서 발견한 문제가 없습니다. 실행 중 전압·전류 검사도 함께 표시됩니다.</p>';
 $('circuit-issues').querySelectorAll('[data-issue]').forEach(b=>b.onclick=()=>focusIssue(issues[Number(b.dataset.issue)].target));
 document.querySelector('[data-monitor="issues"]').textContent='회로 검사'+(issues.length?` (${issues.length})`:'');
}
function copyCircuit(){if(!selection)return;circuitClipboard=copySelection(project,selection);clipboardOffset=28;log(`부품 ${circuitClipboard.components.length}개와 내부 배선 ${circuitClipboard.wires.length}개를 복사했습니다.`);}
function pasteCircuit(){if(running()||!circuitClipboard)return;try{const draft=structuredClone(project),next=pasteSelection(draft,circuitClipboard,uid,clipboardOffset);validateProject(draft);checkpoint();project=draft;selection=next;clipboardOffset+=28;pending=null;mode='select';tab('inspect');changed();}catch(e){log(e.message,'error');}}
function inspector(){
 const el=$('inspector');
 if(!selection){el.innerHTML='<span class="overline">CIRCUIT INSPECTOR</span><h2>회로 살펴보기</h2><div class="empty-inspector">핀, 배선 또는 부품을 선택하세요.<br>실행 중 전압과 전류를 확인할 수 있습니다.</div>';return;}
 if(selection.type==='group'){el.innerHTML=`<span class="overline">MULTIPLE SELECTION</span><h2>여러 항목 선택</h2><p>부품 ${selection.parts.length}개 · 배선 ${selection.wires.length}개</p><p>Shift+클릭으로 선택을 바꾸고 선택한 부품을 끌어 함께 이동합니다. Ctrl+C/V로 내부 배선과 함께 복사할 수 있습니다.</p><button id="copy-group" class="inspector-action">선택 복사</button><button id="remove-group" class="inspector-action danger" ${running()?'disabled':''}>선택 삭제</button>`;$('copy-group').onclick=copyCircuit;$('remove-group').onclick=removeSelected;return;}
 if(selection.type==='endpoint'){
   const e=endpointInfo(selection.id,project.components),pin=PIN_BY_ID.get(selection.id),v=result?.voltage(selection.id);
   const connected=connectedNet(project,selection.id,pressed).endpoints.length;
   el.innerHTML=`<span class="overline">CONNECTION POINT</span><h2>${esc(e?.label||selection.id)}</h2><p>${pin?esc(pin.signal==='NC'?'연결되지 않은 NC 핀':`신호: ${pin.signal}`):'빵판의 실제 연결 그룹을 기준으로 계산합니다.'}</p><div class="measure"><span>전압 · GND 기준</span><b>${v!=null?v.toFixed(3)+' V':'—'}</b></div><div class="measure"><span>연결된 핀 / 구멍</span><b>${connected}</b></div><p>${running()?'전압이 표시되지 않으면 부유 상태이거나 전원에 연결되지 않은 노드입니다.':'시뮬레이션을 실행하면 연결점의 전압을 확인할 수 있습니다.'}</p>`;
 } else if(selection.type==='part'){
   const p=project.components.find(p=>p.id===selection.id);if(!p)return;
   if(p.type==='breadboard'){
    el.innerHTML=`<span class="overline">BREADBOARD</span><h2>${esc(p.name)}</h2><p>400홀 · A–E / F–J 행과 전원 레일은 각각 연결됩니다. 다른 빵판과는 배선으로 연결해야 합니다.</p><div class="inspector-card"><label for="part-name">빵판 이름</label><input id="part-name" value="${esc(p.name)}" maxlength="80" ${running()?'disabled':''}></div><p>테두리를 끌어 이동하세요. 장착한 부품과 배선도 함께 이동합니다. 삭제하면 구멍에 연결된 배선과 장착 연결이 해제되며 다른 부품은 남습니다.</p><div class="measure"><span>회전 각도</span><b>${p.rotation}°</b></div><button class="inspector-action" id="rotate-part" ${running()?'disabled':''}>45° 회전 (R)</button><button class="inspector-action danger" id="remove-part" ${running()?'disabled':''}>빵판 삭제</button>`;
    $('part-name').onchange=e=>{checkpoint();p.name=e.target.value.trim()||p.name;changed();};$('rotate-part').onclick=rotateSelected;$('remove-part').onclick=removeSelected;return;
   }
   const read=result?.parts[p.id],mounted=Object.keys(attachments(p)).length;
   el.innerHTML=`<span class="overline">${p.type.toUpperCase()}</span><h2>${esc(p.name)}</h2><p>${mounted?`${mounted} / ${terminalKeys(p).length}개 다리 장착`:'자유 배치 · 끌어서 빵판에 놓으세요.'}</p><div class="inspector-card"><label for="part-name">부품 이름</label><input id="part-name" value="${esc(p.name)}" maxlength="80" ${running()?'disabled':''}>${p.type==='resistor'?`<label for="part-value">저항 (Ω)</label><input id="part-value" type="number" value="${p.value}" min="1" max="10000000" ${running()?'disabled':''}>`:''}${p.type==='led'?`<label for="part-color">LED 색상</label><select id="part-color" ${running()?'disabled':''}>${[['red','빨강'],['green','초록'],['blue','파랑'],['yellow','노랑']].map(([v,l])=>`<option value="${v}" ${p.color===v?'selected':''}>${l}</option>`).join('')}</select>`:''}</div>${partControls(p,running())}<div class="measure"><span>부품 전압</span><b id="part-voltage">${read?read.voltage.toFixed(3)+' V':'—'}</b></div><div class="measure"><span>전류</span><b id="part-current">${read?(read.current*1000).toFixed(3)+' mA':'—'}</b></div>${p.type==='resistor'?`<div class="measure"><span>소비 전력</span><b>${read?(read.power*1000).toFixed(2)+' mW':'—'}</b></div>`:''}${p.type==='button'?'<p>실행 중 버튼 몸체를 누르고 계시면 연결되고 손을 떼면 끊어집니다. A1–A2, B1–B2는 항상 연결되며, 누르면 양쪽이 연결됩니다.</p>':''}${p.type==='lcd'?'<p>LCD 1602의 4/8비트 명령·문자 출력을 지원합니다. VDD 5 V, VSS·R/W·VO를 GND에 연결하고 RS/E/DATA 핀을 배선하세요. 기존 스케치의 LiquidCrystal API를 사용할 수 있습니다.</p>':''}<div class="measure"><span>회전 각도</span><b>${Number(p.rotation.toFixed(1))}°</b></div><button class="inspector-action" id="rotate-part" ${running()?'disabled':''}>45° 회전 (R)</button><button class="inspector-action danger" id="remove-part" ${running()?'disabled':''}>부품 삭제</button>`;
   $('part-name').onchange=e=>{checkpoint();p.name=e.target.value||p.name;changed();};
   if($('part-value'))$('part-value').onchange=e=>{const n=Number(e.target.value);if(!Number.isFinite(n)||n<1||n>1e7){log('저항 범위: 1 Ω~10 MΩ','error');inspector();return;}checkpoint();p.value=n;changed();};
   if($('part-color'))$('part-color').onchange=e=>{checkpoint();p.color=e.target.value;changed();};
   if($('part-live'))$('part-live').innerHTML=partReadouts(p,result);
   el.querySelectorAll('[data-part-prop]').forEach(input=>{input.oninput=()=>{if(running()&&input.dataset.live!=='true')return;const n=Number(input.value),key=input.dataset.partProp;if(!Number.isFinite(n)||(input.min!==undefined&&input.min!==''&&n<Number(input.min))||(input.max!==undefined&&input.max!==''&&n>Number(input.max)))return;if((['switch','motion'].includes(key)||p.type==='encoder'&&key==='position')&&!Number.isInteger(n))return;if(!input.dataset.checkpoint){checkpoint();input.dataset.checkpoint='1';}p[key]=n;if($('output-'+key))$('output-'+key).textContent=input.type==='range'?n:'';autosave();if(running())recompute();updateSimulationSvg(svg,project,result,pressed);updateReadouts();};input.onchange=()=>{delete input.dataset.checkpoint;};});
   $('remove-part').onclick=removeSelected;$('rotate-part').onclick=rotateSelected;
 } else if(selection.type==='wire'){
   const w=project.wires.find(w=>w.id===selection.id);if(!w)return;
   el.innerHTML=`<span class="overline">WIRE</span><h2>점퍼선</h2><div class="inspector-card"><label>시작</label><p>${esc(endpointInfo(w.from,project.components)?.label)}</p><label>끝</label><p>${esc(endpointInfo(w.to,project.components)?.label)}</p></div><p>전기 저항이 없는 이상적인 도선으로 계산합니다. 선이 교차하는 위치는 서로 연결되지 않습니다. 선택한 배선과 전기적으로 이어진 연결망을 금색으로 표시합니다.</p><p>배선을 더블클릭해 꺾임점을 추가하고 점을 끌어 이동하세요. 점 우클릭은 삭제입니다.</p><button class="inspector-action" id="reset-wire-route" ${running()?'disabled':''}>배선 경로 자동 정렬</button><button class="inspector-action danger" id="remove-wire" ${running()?'disabled':''}>배선 삭제</button>`;
   $('remove-wire').onclick=removeSelected;$('reset-wire-route').onclick=()=>{checkpoint();delete w.points;changed();};
 }
}
function removeSelected(){
 if(running()||!selection)return;
 if(selection.type==='group'){checkpoint();const parts=new Set(selection.parts),wires=new Set(selection.wires);for(const id of parts)if(project.components.find(p=>p.id===id)?.type==='breadboard')removeBreadboard(project,id);project.components=project.components.filter(p=>!parts.has(p.id));project.wires=project.wires.filter(w=>!wires.has(w.id)&&![w.from,w.to].some(id=>id.startsWith('part:')&&parts.has(id.split(':')[1])));}
 else if(selection.type==='part'){checkpoint();if(project.components.find(p=>p.id===selection.id)?.type==='breadboard')removeBreadboard(project,selection.id);else {project.components=project.components.filter(p=>p.id!==selection.id);project.wires=project.wires.filter(w=>![w.from,w.to].some(id=>id.startsWith(`part:${selection.id}:`)));}}
 else if(selection.type==='wire'){checkpoint();project.wires=project.wires.filter(w=>w.id!==selection.id);}else return;
 selection=null;pending=null;drag=null;$('preview-layer').innerHTML='';changed();
}
function rotateSelected(){
 if(running()||selection?.type!=='part')return;
 const p=project.components.find(p=>p.id===selection.id);if(!p)return;
 if(!drag?.moved)checkpoint();
 if(p.type==='breadboard'){moveBreadboard(project,p.id,{x:p.x,y:p.y,rotation:p.rotation+45});if(drag?.type==='part')drag.moved=true;changed();return;}
 detachPart(p);p.rotation=normalizeAngle(p.rotation+45);
 if(drag?.type==='part'){drag.moved=true;refresh();$('preview-layer').innerHTML=renderMountPreview(findMount(p,project.components));}
 else {applyMount(p,findMount(p,project.components));changed();}
}
function editUndo(redo=false){if(running())return;const from=redo?redoStack:undoStack,to=redo?undoStack:redoStack;if(!from.length)return;to.push(JSON.stringify(project));project=JSON.parse(from.pop());selection=null;pending=null;syncEditor();changed();}
function addPart(type,a,b,position){
 if(project.components.length>=100){log('부품은 100개까지 추가할 수 있습니다.','error');return;}
 const name=((({resistor:'R',led:'LED',button:'SW',lcd:'LCD',breadboard:'BB'})[type])||PART_DEFS[type]?.prefix)+(project.components.filter(p=>p.type===type).length+1);
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
   addPart(mode,endpointInfo(pending,project.components),endpointInfo(id,project.components));return;
 }
 if(project.wires.length>=500){log('배선은 500개까지 추가할 수 있습니다.','error');pending=null;return;}
 if(!project.wires.some(w=>(w.from===pending&&w.to===id)||(w.to===pending&&w.from===id))){checkpoint();project.wires.push({id:uid('w'),from:pending,to:id,color});}
 pending=null;selection=null;$('preview-layer').innerHTML='';changed();
}
function point(e){const p=svg.createSVGPoint();p.x=e.clientX;p.y=e.clientY;return p.matrixTransform(svg.getScreenCTM().inverse());}
function viewUpdate(){svg.setAttribute('viewBox',`${view.x} ${view.y} ${view.w} ${view.h}`);$('zoom-reset').textContent=Math.round(1120/view.w*100)+'%';renderConnections();}
svg.addEventListener('pointerdown',e=>{
 if(e.button!==0&&e.button!==1)return;svg.focus({preventScroll:true});
 const target=e.target,part=target.closest('[data-part]'),onboard=target.closest('[data-button]');
 if(running()&&(onboard||part)){
   if(onboard?.dataset.button==='RESET'){if(status==='running'){initializeRuntime();status='running';}else initializeRuntime();refresh();return;}
   const id=onboard?.dataset.button||part?.dataset.part,p=project.components.find(p=>p.id===id);
   if(p?.type==='slide'&&!target.closest('[data-endpoint]')){checkpoint();p.position=1-p.position;selection={type:'part',id:p.id};tab('inspect');recompute();autosave();refresh();return;}
   if(id==='USER'||p?.type==='button'){pressed[id]=true;drag={type:'press',id};svg.setPointerCapture(e.pointerId);recompute();refresh();return;}
 }
 const handle=target.closest('[data-wire-point]');if(handle&&!running()){const id=handle.dataset.ownerWire,index=Number(handle.dataset.wirePoint);drag={type:'wire-point',id,index,start:point(e),origin:{...project.wires.find(w=>w.id===id).points[index]},moved:false};svg.setPointerCapture(e.pointerId);return;}
 if(e.shiftKey&&!running()){const wire=target.closest('[data-wire]');if(wire||part){selection=toggleSelection(selection,wire?'wire':'part',wire?.dataset.wire||part.dataset.part);pending=null;mode='select';tab('inspect');refresh();return;}}
 if(part&&selection?.type==='group'&&isSelected(selection,'part',part.dataset.part)&&!running()){drag={type:'group',start:point(e),base:structuredClone(project),moved:false};svg.setPointerCapture(e.pointerId);return;}
 const pin=target.closest('[data-endpoint]');if(pin){clickEndpoint(pin.dataset.endpoint);return;}
 const wire=target.closest('[data-wire]');if(wire){pending=null;selection={type:'wire',id:wire.dataset.wire};tab('inspect');refresh({preserveWires:true});return;}
 if(part){
   pending=null;selection={type:'part',id:part.dataset.part};tab('inspect');
   if(!running()){const p=project.components.find(p=>p.id===part.dataset.part),q=point(e);drag={type:'part',id:p.id,start:q,x:p.x,y:p.y,moved:false};svg.setPointerCapture(e.pointerId);}
   refresh();return;
 }
 const q=point(e);
 if(!running()&&TWO_PIN_TYPES.includes(mode)){addPart(mode,null,null,{x:Math.max(40,Math.min(5600,q.x)),y:Math.max(40,Math.min(5600,q.y))});return;}
 if(pending){pending=null;$('preview-layer').innerHTML='';refresh();return;}
 selection=null;drag={type:'pan',clientX:e.clientX,clientY:e.clientY,x:view.x,y:view.y};svg.setPointerCapture(e.pointerId);refresh();
});
svg.addEventListener('pointermove',e=>{
 const q=point(e);
 if(drag?.type==='wire-point'){const w=project.wires.find(w=>w.id===drag.id),dx=q.x-drag.start.x,dy=q.y-drag.start.y;if(!drag.moved&&Math.hypot(dx,dy)<2)return;if(!drag.moved){checkpoint();drag.moved=true;}w.points[drag.index]={x:Math.max(0,Math.min(6000,drag.origin.x+dx)),y:Math.max(0,Math.min(6000,drag.origin.y+dy))};refresh();return;}
 if(drag?.type==='group'){let dx=q.x-drag.start.x,dy=q.y-drag.start.y;if(!drag.moved&&Math.hypot(dx,dy)<=3)return;if(!drag.moved){checkpoint();drag.moved=true;}const selected=drag.base.components.filter(p=>isSelected(selection,'part',p.id));if(selected.length){dx=Math.max(-Math.min(...selected.map(p=>p.x)),Math.min(6000-Math.max(...selected.map(p=>p.x)),dx));dy=Math.max(-Math.min(...selected.map(p=>p.y)),Math.min(6000-Math.max(...selected.map(p=>p.y)),dy));}try{const next=structuredClone(drag.base);moveSelection(next,selection,dx,dy);validateProject(next);project=next;refresh();}catch{}return;}
 if(drag?.type==='part'){
   const p=project.components.find(p=>p.id===drag.id),dx=q.x-drag.start.x,dy=q.y-drag.start.y;
   if(!drag.moved&&Math.hypot(dx,dy)>3){checkpoint();drag.moved=true;detachPart(p);}
   if(drag.moved){const x=Math.max(p.type==='breadboard'?360:40,Math.min(5400,drag.x+dx)),y=Math.max(p.type==='breadboard'?360:40,Math.min(5400,drag.y+dy));if(p.type==='breadboard')moveBreadboard(project,p.id,{x,y});else {p.x=x;p.y=y;}refresh();$('preview-layer').innerHTML=renderMountPreview(findMount(p,project.components));}
   return;
 }
 if(drag?.type==='pan'){const box=svg.getBoundingClientRect();view.x=drag.x-(e.clientX-drag.clientX)*view.w/box.width;view.y=drag.y-(e.clientY-drag.clientY)*view.h/box.height;viewUpdate();return;}
 if(pending){const a=endpointInfo(pending,project.components);$('preview-layer').innerHTML=`<path d="${route(a,q)}" fill="none" stroke="${color}" stroke-width="2" stroke-dasharray="5 5" pointer-events="none"/>`;}
 const hit=e.target.closest('[data-endpoint]');
 document.querySelectorAll('.same-net').forEach(el=>el.classList.remove('same-net'));
 if(hit){const id=hit.dataset.endpoint,info=endpointInfo(id,project.components),v=result?.voltage(id),hole=holeInfo(id,project.components);if(hole)for(const h of circuitHoles(project.components))if(h.bus===hole.bus)svg.querySelector(`[data-hole="${h.id}"]`)?.classList.add('same-net');
   $('tooltip').textContent=info.label+(running()?`\n${v==null?'부유 상태':v.toFixed(3)+' V'}`:'');const box=$('canvas-container').getBoundingClientRect();$('tooltip').style.left=Math.min(e.clientX-box.left+12,box.width-220)+'px';$('tooltip').style.top=Math.max(0,e.clientY-box.top-47)+'px';$('tooltip').hidden=false;
 }else $('tooltip').hidden=true;
});
svg.addEventListener('dblclick',e=>{
 if(running()||mode!=='select')return;
 // Keep the wire element alive during selection so real double-clicks arrive.
 const hit=e.target.closest('[data-wire]');
 if(!hit||!svg.contains(hit))return;e.preventDefault();
 const w=project.wires.find(w=>w.id===hit.dataset.wire);
 try{const next=structuredClone(w);insertWirePoint(project,next,point(e));checkpoint();w.points=next.points;selection={type:'wire',id:w.id};pending=null;changed();}
 catch(error){log(error.message,'error');}
});
svg.addEventListener('contextmenu',e=>{const hit=e.target.closest('[data-wire-point]');if(!hit||running())return;e.preventDefault();checkpoint();project.wires.find(w=>w.id===hit.dataset.ownerWire).points.splice(Number(hit.dataset.wirePoint),1);changed();});
function release(){if(!drag)return;if(['wire-point','group'].includes(drag?.type)&&drag.moved)autosave();if(drag?.type==='press'){pressed[drag.id]=false;recompute();refresh();}if(drag?.type==='part'&&drag.moved){const p=project.components.find(p=>p.id===drag.id);if(p?.type==='breadboard')log(p.name+': 빵판과 장착 부품을 이동했습니다.');else if(p){const mounted=applyMount(p,findMount(p,project.components));log(mounted?`${p.name}: ${terminalKeys(p).length}개 다리를 빵판에 장착했습니다.`:`${p.name}: 자유 배치 상태입니다. 모든 다리가 구멍에 맞을 때 장착됩니다.`);}autosave();}drag=null;$('preview-layer').innerHTML='';refresh();}
svg.addEventListener('pointerup',release);svg.addEventListener('pointercancel',release);window.addEventListener('blur',()=>{if(Object.values(pressed).some(Boolean)){pressed={};recompute();refresh();}});
svg.addEventListener('pointerleave',()=>{$('tooltip').hidden=true;});
function zoom(mult){const nw=Math.max(430,Math.min(9000,view.w*mult)),nh=nw*730/1120;view.x+=(view.w-nw)/2;view.y+=(view.h-nh)/2;view.w=nw;view.h=nh;viewUpdate();}
svg.addEventListener('wheel',e=>{e.preventDefault();zoom(e.deltaY>0?1.08:1/1.08);},{passive:false});
$('zoom-in').onclick=()=>zoom(1/1.2);$('zoom-out').onclick=()=>zoom(1.2);$('zoom-reset').onclick=fitView;
function fitView(){const extra=project.components.filter(p=>p.type==='breadboard');let w=1120;if(extra.length)w=Math.max(w,...project.components.map(p=>p.x+360),...project.components.map(p=>(p.y+360)*1120/730));view={x:0,y:0,w,h:w*730/1120};viewUpdate();}
function pinSearch(){
 const pins=searchPins($('pin-search').value);
 $('search-layer').innerHTML=renderPinSearch(pins,searchSelectedId);
 $('pin-results').innerHTML=!$('pin-search').value.trim()?'':pins.length?pins.map(p=>`<button data-search-pin="${p.id}" class="${p.id===searchSelectedId?'selected':''}" aria-pressed="${p.id===searchSelectedId}"><strong>${esc(p.signal)}</strong><span>${esc(p.header)}-${p.number} · ${esc(p.label)}</span></button>`).join(''):'<p>일치하는 핀이 없습니다.</p>';
 $('pin-results').querySelectorAll('button').forEach(b=>b.onclick=()=>focusPin(b.dataset.searchPin));
}
function focusPin(id){const p=PIN_BY_ID.get(id);if(!p)return;pending=null;selection={type:'endpoint',id};searchSelectedId=id;$('preview-layer').innerHTML='';pinSearch();view={x:p.x-310,y:p.y-202,w:620,h:620*730/1120};viewUpdate();tab('inspect');refresh();svg.focus({preventScroll:true});}
$('pin-search').addEventListener('input',()=>{searchSelectedId=null;pinSearch();});
$('pin-search').addEventListener('keydown',e=>{if(e.key==='Enter'){const p=searchPins(e.target.value)[0];if(p)focusPin(p.id);}if(e.key==='Escape'){e.stopPropagation();e.target.value='';searchSelectedId=null;pinSearch();}});
function recompute(){if(!runtime||!session)return;try{session.setPressed(pressed);result=session.result;const warning=result.warnings.join('|');if(warning&&warning!==lastWarnings)result.warnings.forEach(w=>log(w,'error'));lastWarnings=warning;}catch(e){result=session.result;status='error';log(e.message,'error');}}
function initializeRuntime(){
 try{simTime=0;pressed={};lastWarnings='';result=null;monitor.clear();uartLines.clear();session=new SimulationSession(project,{print:s=>log(s,'serial'),uart:logUart,trace:event=>monitor.trace(event),channels:monitor.channels()});runtime=session.runtime;status='paused';pending=null;mode='select';result=session.tick(0);log(project.firmware?.mode==='hal'?'HAL 프로그램을 시작했습니다.':'스케치를 시작했습니다.');return true;}
 catch(e){runtime=null;result=session?.result??null;status='error';log(e.message,'error');return false;}
}
function stop(){status='stopped';runtime=null;result=null;pressed={};pending=null;$('preview-layer').innerHTML='';log('시뮬레이션을 정지했습니다.');refresh();}
$('run').onclick=()=>{if(running())stop();else {if(initializeRuntime())status='running';refresh();}};
$('step').onclick=()=>{if(!runtime||status==='error'){initializeRuntime();}else {try{simTime+=20;result=session.tick(simTime);recompute();}catch(e){status='error';log(e.message,'error');}}refresh();};
setInterval(()=>{
 if(status!=='running')return;
 try{simTime+=20;result=session.tick(simTime);recompute();
   updateSimulationSvg(svg,project,result,pressed);updateReadouts();
   if(status==='error')refresh();else if(++paintCounter%10===0&&!$('inspect-panel').hidden&&!$('inspector').contains(document.activeElement))inspector();
 }catch(e){result=session?.result??result;status='error';log(e.message,'error');refresh();}
},20);
$('tool-select').onclick=()=>setMode('select');$('tool-wire').onclick=()=>setMode('wire');$('delete').onclick=removeSelected;$('rotate').onclick=rotateSelected;$('undo').onclick=()=>editUndo();$('redo').onclick=()=>editUndo(true);
document.querySelectorAll('[data-add]').forEach(b=>b.onclick=()=>{if(running())return;const type=b.dataset.add;if(type==='breadboard'){
 const boards=project.components.filter(p=>p.type==='breadboard');if(boards.length>=8){log('추가 빵판은 8개까지 사용할 수 있습니다.','error');return;}
 let position;for(let i=0;i<32;i++){const x=BB.x+BB.w/2+390*(1+i%4),y=BB.y+BB.h/2+600*Math.floor(i/4);if(!boards.some(p=>Math.abs(p.x-x)<350&&Math.abs(p.y-y)<560)){position={x,y};break;}}
 addPart(type,null,null,position);fitView();svg.focus({preventScroll:true});
}else if(MULTI_PIN_TYPES.includes(type)){addPart(type,null,null,{x:Math.max(130,Math.min(990,view.x+view.w*.48)),y:Math.max(80,Math.min(670,view.y+view.h*.85))});svg.focus({preventScroll:true});}else setMode(type);});
$('wire-palette').innerHTML=WIRE_COLORS.map(([value,name])=>`<button data-color="${value}" class="swatch ${value===color?'active':''}" style="--swatch:${value}" title="${name} 배선" aria-label="${name} 배선"></button>`).join('');
document.querySelectorAll('[data-color]').forEach(b=>b.onclick=()=>{color=b.dataset.color;document.querySelectorAll('[data-color]').forEach(s=>s.classList.toggle('active',s===b));if(!running()&&selection?.type==='wire'){checkpoint();project.wires.find(w=>w.id===selection.id).color=color;changed();}});
document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>tab(b.dataset.tab));
function replaceProject(p){if(running())stop();project=validateProject(p);mode='select';pressed={};lastWarnings='';uartLines.clear();searchSelectedId=null;$('pin-search').value='';pinSearch();fitView();selection=null;pending=null;drag=null;$('preview-layer').innerHTML='';undoStack=[];redoStack=[];status='stopped';runtime=null;session=null;monitor.clear();result=null;simTime=0;dirty=false;syncEditor();autosave();refresh();log('회로를 열었습니다: '+project.name);}
function requestReplace(action){if(dirty){replaceAction=action;$('replace-dialog').showModal();}else action();}
$('replace-cancel').onclick=()=>{$('replace-dialog').close();replaceAction=null;};$('replace-confirm').onclick=()=>{$('replace-dialog').close();replaceAction?.();replaceAction=null;};
$('hal-example').onchange=e=>{const type=e.target.value;e.target.value='';if(running()||!Object.hasOwn(HAL_EXAMPLES,type))return;checkpoint();project=applyHalExample(project,type);sourceFile='main.c';runtime=null;session=null;result=null;status='stopped';simTime=0;pressed={};selection=null;pending=null;drag=null;mode='select';lastWarnings='';$('preview-layer').innerHTML='';view={x:0,y:0,w:1120,h:730};viewUpdate();monitor.clear();uartLines.clear();syncEditor();changed();tab('code');log(HAL_EXAMPLES[type]+' · '+HAL_GUIDES[type]);svg.focus({preventScroll:true});};
$('new').onclick=()=>requestReplace(()=>replaceProject(blankProject()));
$('project-name').onchange=e=>{checkpoint();project.name=e.target.value.trim()||'새 회로';changed();};
let lastCodeCheckpoint=0,replaceCheckpoint=false;
function replaceCodeText(edit){
 if(running())throw new Error('시뮬레이션을 정지한 뒤 바꿔 주세요.');
 const code=$('code');code.focus({preventScroll:true});code.setSelectionRange(edit.start,edit.end);
 // Each replacement is one project-history entry, independent of typing in
 // the search inputs (Chromium shares native edit history across controls).
 replaceCheckpoint=true;
 try{code.setRangeText(edit.text,edit.start,edit.end,'end');code.dispatchEvent(new Event('input',{bubbles:true}));}
 finally{replaceCheckpoint=false;}
}
$('code').addEventListener('input',()=>{if(replaceCheckpoint||Date.now()-lastCodeCheckpoint>1000){checkpoint();lastCodeCheckpoint=Date.now();}if(sourceFile==='main.c')project.code=$('code').value;else project.firmware.files.find(f=>f.name===sourceFile).text=$('code').value;lineNumbers();autosave();$('undo').disabled=false;$('redo').disabled=true;});
$('source-file').onchange=e=>{sourceFile=e.target.value;syncEditor();};
$('firmware-mode').onchange=e=>{if(running())return;checkpoint();project.firmware={mode:e.target.value,files:project.firmware?.files||[]};if(e.target.value==='hal')project.mcu??=defaultMcu();syncEditor();changed();};
$('firmware-check').onclick=()=>{try{if(project.firmware?.mode==='hal')compileHal(project.code,project.firmware.files);else compile(project.code);$('firmware-status').textContent='문법 검사 통과 · 배선과 HAL 설정은 실행 시 검사';log('소스 문법 검사를 통과했습니다.');}catch(e){$('firmware-status').textContent=e.message;log(e.message,'error');}};
function applyFirmware(files){try{if(!files)return;const imported=importFirmware(project,files);checkpoint();project=imported.project;sourceFile='main.c';syncEditor();changed();log('가져왔습니다: '+files.map(f=>f.name).join(', '));for(const warning of imported.warnings)log(warning,'error');$('firmware-status').textContent=imported.warnings.length?imported.warnings.join(' · '):'가져오기 완료 · Pinout과 코드 검사로 확인하세요.';}catch(e){log(e.message,'error');$('firmware-status').textContent=e.message;}}
$('firmware-import').onclick=async()=>{try{if(window.desktop?.importFirmware)applyFirmware(await window.desktop.importFirmware(false));else $('firmware-files').click();}catch(e){log(e.message,'error');}};
$('firmware-folder').hidden=!window.desktop?.importFirmware;
$('firmware-folder').onclick=async()=>{try{applyFirmware(await window.desktop.importFirmware(true));}catch(e){log(e.message,'error');}};
$('firmware-files').onchange=async e=>{const chosen=[...e.target.files];try{if(chosen.length>41||chosen.reduce((n,f)=>n+f.size,0)>800000)throw new Error('파일은 41개, 합계 800 KB 이하로 선택하세요.');applyFirmware(await Promise.all(chosen.map(async f=>({name:f.name,text:await f.text()}))));}catch(err){log(err.message,'error');}finally{e.target.value='';}};
$('code').addEventListener('scroll',()=>{$('line-numbers').scrollTop=$('code').scrollTop;});
$('code').addEventListener('keydown',e=>{if(e.key==='Tab'){e.preventDefault();if(running())return;const a=e.target.selectionStart,b=e.target.selectionEnd;e.target.setRangeText('  ',a,b,'end');e.target.dispatchEvent(new Event('input'));}});
async function save(){try{const data=JSON.stringify(project,null,2);if(window.desktop){const path=await window.desktop.save(data);if(!path)return;}else{const blob=new Blob([data],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=project.name.replace(/[^\w가-힣-]/g,'_')+'.stm32lab';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}dirty=false;log('회로 파일을 저장했습니다.');}catch(e){log('저장 실패: '+e.message,'error');}}
$('main-export').onclick=async()=>{try{if(project.firmware?.mode!=='hal')throw new Error('HAL main.c를 선택하세요.');compileHal(project.code,project.firmware.files);if(window.desktop?.exportMain){if(!await window.desktop.exportMain(project.code))return;}else{const url=URL.createObjectURL(new Blob([project.code],{type:'text/plain;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download='main.c';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}log('main.c를 저장했습니다. 실제 프로젝트의 핀·주변장치·NVIC 설정을 동일하게 구성하세요.');}catch(e){log(e.message,'error');}};
$('save').onclick=save;
async function open(){try{if(window.desktop){const data=await window.desktop.open();if(data!=null)replaceProject(validateProject(JSON.parse(data)));}else $('file-input').click();}catch(e){log('불러오기 실패: '+e.message,'error');}}
$('open').onclick=()=>requestReplace(open);
$('file-input').onchange=async e=>{try{const f=e.target.files[0];if(!f)return;if(f.size>2e6)throw new Error('파일 크기는 2 MB 이하여야 합니다.');replaceProject(validateProject(JSON.parse(await f.text())));}catch(err){log('불러오기 실패: '+err.message,'error');}e.target.value='';};
$('clear-console').onclick=()=>{$('console-output').textContent='';uartLines.clear();};
$('help').onclick=$('api-help').onclick=()=>$('help-dialog').showModal();
window.addEventListener('keydown',e=>{
 const editing=['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName),modal=document.querySelector('dialog[open]');
 if(e.key==='F5'){e.preventDefault();if(!e.ctrlKey&&!e.metaKey&&!e.altKey&&!e.shiftKey&&!modal&&!e.repeat)$('run').click();return;}
 if(modal)return;
 if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();save();return;}
 if(document.activeElement===$('code')&&(e.ctrlKey||e.metaKey)&&['z','y'].includes(e.key.toLowerCase())){e.preventDefault();editUndo(e.key.toLowerCase()==='y'||e.shiftKey);return;}
 if(editing)return;
 if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='c'){e.preventDefault();copyCircuit();return;}
 if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='v'){e.preventDefault();pasteCircuit();return;}
 if(e.key==='Escape'){e.preventDefault();if(!pending&&['part','wire','group'].includes(selection?.type)){removeSelected();}else {pending=null;mode='select';selection=null;$('preview-layer').innerHTML='';refresh();}}
 if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();removeSelected();}
 if(e.key.toLowerCase()==='r')rotateSelected();if(e.key.toLowerCase()==='w')setMode('wire');if(e.key.toLowerCase()==='v')setMode('select');
 if(e.ctrlKey&&e.key.toLowerCase()==='z'){e.preventDefault();editUndo(e.shiftKey);}if(e.ctrlKey&&e.key.toLowerCase()==='y'){e.preventDefault();editUndo(true);}
});
window.addEventListener('error',e=>log('화면 오류: '+e.message,'error'));
syncEditor();fitView();refresh();log('회로를 연결하고 시뮬레이션 시작 또는 F5를 눌러 보세요.');
