import './popout.js'; // must run before the modules below register listeners and look up elements
import {formatProjectSources} from './code-format-ui.js';
import {keyFor,withKey} from './keybindings.js';
import {showSurface,removeSurface} from './surfaces.js';
import {searchHalExamples} from './hal-example-search.js';
import {CATALOG_BY_TYPE} from './catalog-defs.js';
import {moveSurface} from './surface-move.js';
import {loadPreferences} from './ide-preferences.js';
import {WireDraft} from './wire-draft.js';
import {roundedWirePath} from './wire-path.js';
import {setupFeedback} from './ui-feedback.js';
import {setupTabAccessibility} from './tab-accessibility.js';
import {setupCanvasKeyboard} from './canvas-keyboard.js';
import {setupDeviceDocs} from './device-docs-ui.js';
import {applyDeviceExample} from './device-assistance.js';
import {createDiagnostics} from './diagnostics.js';
import {resetMainCode} from './code-reset.js';
import {resetBoardConfiguration} from './board-reset.js';
import {selectedIds,isSelected,toggleSelection,wirePoints,insertWirePoint,connectedNet,copySelection,pasteSelection,moveSelection,mountSelection,boxSelection} from './circuit-edit.js';
import {zoomView} from './canvas-view.js';
import {circuitDiagnostics} from './circuit-diagnostics.js';
import {PINS,BB,PIN_BY_ID,endpointInfo,searchPins,circuitHoles,holeInfo,breadboardModel,setActiveBoard} from './pins.js';
import {TWO_PIN_TYPES,MULTI_PIN_TYPES,WIRE_COLORS,PART_DEFS,terminalKeys,attachments,detachPart,normalizeAngle} from './components.js';
import {findMount,applyMount,occupiedHoles,wiredHoles} from './placement.js';
import {endpointBlocked,endpointAt,moveWireEnd} from './wire-ends.js';
import {SimulationSession} from './session.js';
import {FirmwareSession} from './firmware-session.js';
import {BuzzerAudio} from './buzzer-audio.js';
import {Monitor} from './monitor.js';
import {partControls,partReadouts} from './part-controls.js';
import {blankProject,validateProject,projectForBoard} from './project.js';
import {projectBoard} from './boards.js';
import {boardSvg} from './render.js';
import {moveBreadboard,removeBreadboard,isBreadboardLibraryType,newBreadboardFields,breadboardBounds} from './breadboards.js';
import {setupBoardPicker} from './board-picker.js';
import {PinoutPanel} from './pinout-ui.js';
import {defaultMcu} from './mcu-config.js';
import {importFirmware} from './firmware-import.js';
import {compileHal} from './hal-source.js';
import {compile} from './parser.js';
import {allHalExamples,allHalGuides,applyHalExample,halGuideFor} from './hal-examples.js';
const HAL_EXAMPLES=allHalExamples(),HAL_GUIDES=allHalGuides();
import {createShell} from './shell.js';
import {setupLogicAnalyzer} from './logic-analyzer.js';
import {mediaSection,bindMedia,paintMedia,applyCameraImage,isCamera} from './part-media-ui.js';
import {mountIdeChrome,setupIde} from './ide-ui.js';
import {setupUpdates} from './update-ui.js';
import {setupResizing} from './resize-ui.js';
import {setupIdeSettings} from './ide-settings-ui.js';
import {resizeObject} from './resize.js';
import {BOARD,scaleXOf,scaleYOf,surfaceOrigin,partVector} from './geometry.js';
import {setupEditorSearch} from './editor-search.js';
import {SERIAL_IDS} from './serial-config.js';
import {PART_LIBRARY,searchParts} from './part-library.js';
import {setupPartPreviews} from './part-preview-ui.js';
import {setupExamplePreviews} from './example-preview-ui.js';
import {esc,initSvg,renderWires,renderParts,renderBreadboards,renderEndpoints,route,updateSimulationSvg,renderMountPreview,renderPinSearch,updateSurfaces} from './render.js';

const $=id=>document.getElementById(id),svg=$('circuit');
mountIdeChrome();const layout=createShell();let ide=null,resizing=null,deviceDocs=null,canvasKeys=null;
const feedback=setupFeedback({showLog:()=>{layout.reveal('terminal');document.querySelector('[data-monitor="log"]').click();}});
const wireDraft=new WireDraft();
let carry=null;
const CARRY_HINT='배선 끝을 옮길 핀 또는 빵판 구멍을 클릭하세요. 같은 끝을 다시 누르거나 Esc: 취소';
let project=blankProject(),mode='select',pending=null,selection=null,color='#23a68a',status='stopped',result=null,runtime=null,simTime=0,pressed={},undoStack=[],redoStack=[],dirty=false,starting=false,startToken=0,firmware=null;
let view={x:0,y:0,w:1120,h:730},drag=null,lastWarnings='',replaceAction=null,saveTimer,searchSelectedId=null,breadboardKey='',inspectorKey='',inspectorModel=null;
// A saved project that no longer validates is kept aside (not overwritten by the blank one) and reported once the log exists.
let restoreError='';try{const cached=localStorage.getItem('stm32lab.project.v2')||localStorage.getItem('stm32lab.project.v1');if(cached)try{project=validateProject(JSON.parse(cached));}catch(e){restoreError=e.message;localStorage.setItem('stm32lab.project.recovery',cached);}}catch{}
const diagnostic=createDiagnostics(window.localDiagnostics?.record,()=>project);
initSvg(svg);
let session=null,audioEnabled=false,audioContext,buzzerAudio;
const monitor=new Monitor({getSession:()=>session,isRunning:()=>running(),onSettings:settings=>{if(running())return;checkpoint();project.simulation=settings;autosave();},onError:message=>log(message,'error')});
// The open source tab survives a relaunch (syncEditor falls back to main.c when the file is gone).
const SOURCE_KEY='stm32lab.sourceFile.v1';
let sourceFile=(()=>{try{return localStorage.getItem(SOURCE_KEY)||'main.c';}catch{return 'main.c';}})(),circuitClipboard=null,clipboardOffset=28,issuesStamp=0,issuesKey='';
const pinout=new PinoutPanel({getProject:()=>project,isRunning:running,onError:message=>log(message,'error'),apply:({mcu,code})=>{checkpoint();project.mcu=mcu;if(code!==null){project.code=code;project.firmware={mode:'hal',files:[]};sourceFile='main.c';}syncEditor();changed();log(code===null?'핀 설정을 적용했습니다.':'설정에 맞는 HAL main.c를 생성했습니다.');}});
const updateBoardPicker=setupBoardPicker({getProject:()=>project,isRunning:running,onSelect:id=>{sourceFile='main.c';replaceProject(projectForBoard(id));log('선택한 보드의 기본 회로로 시작합니다.');}});
const editorSearch=setupEditorSearch({applyEdit:replaceCodeText,maxLength:()=>{
 const otherFiles=(project.firmware?.files||[]).filter(f=>f.name!==sourceFile).reduce((n,f)=>n+f.text.length,0);
 return sourceFile==='main.c'?300000-otherFiles:300000-project.code.length-otherFiles;
}});
svg.addEventListener('contextmenu',e=>{if(pending&&!running()){e.preventDefault();e.stopImmediatePropagation();cancelWireDraft();return;}const id=e.target.closest('[data-endpoint]')?.dataset.endpoint,p=PIN_BY_ID.get(id);if(p&&/^P[A-H]\d+$/.test(p.signal)){e.preventDefault();pinout.open(p.signal);}});
$('part-list').innerHTML=PART_LIBRARY.map(part=>`<button class="part-card" data-add="${part.type}"><span class="part-icon ${part.iconClass}">${part.icon}</span><span><strong title="${esc(part.name)}">${esc(part.name)}</strong><small title="${esc(part.hint)}">${esc(part.hint)}</small></span><b>+</b></button>`).join('')+'<p id="part-no-results" hidden>검색 결과가 없습니다.<br>다른 이름으로 검색해 주세요.</p>';
setupPartPreviews();setupExamplePreviews({getBoardId:()=>projectBoard(project).id});
function filterParts(){
 const matches=new Set(searchParts($('part-search').value).map(part=>part.type));
 $('part-list').querySelectorAll('[data-add]').forEach(button=>{button.hidden=!matches.has(button.dataset.add);});
 $('part-count').textContent=`${matches.size} / ${PART_LIBRARY.length}`;$('part-no-results').hidden=matches.size>0;$('part-list').scrollTop=0;
}
$('part-search').addEventListener('input',filterParts);filterParts();
function filterExamples(){const matches=searchHalExamples($('hal-example-search').value,projectBoard(project).mcuFamily);$('hal-example').innerHTML='<option value="">'+(matches.length?`HAL 예제 선택… (${matches.length})`:'검색 결과 없음')+'</option>'+matches.map(({id,name,native,simOnly})=>`<option value="${id}">${name}${native?' · ARM':''}${simOnly?' · SIM':''}</option>`).join('');$('hal-example-count').textContent=`${matches.length} / ${Object.keys(HAL_EXAMPLES).length}`;}
$('hal-example-search').oninput=filterExamples;filterExamples();
const uartLines=new Map();
function uid(prefix){return prefix+crypto.randomUUID().replaceAll('-','').slice(0,12);}
function running(){return status==='running'||status==='paused'||!!ide?.nativeBusy();}
function log(message,type='info'){
 diagnostic('console',{type,message:String(message).slice(0,8000),simulationMs:simTime,status});
 const div=document.createElement('div');div.className=`log-line ${type}`;
 const span=document.createElement('span');span.className='stamp';span.textContent=(simTime/1000).toFixed(3)+' s';div.append(span,document.createTextNode(message));
 $('console-output').append(div);while($('console-output').children.length>150)$('console-output').firstChild.remove();$('console-output').scrollTop=$('console-output').scrollHeight;
 return div;
}
function logUart(event){
 diagnostic('uart',{instance:event.instance,direction:event.direction,bytes:Array.from(event.bytes).slice(0,512),micros:event.micros});
 const key=event.instance+' '+event.direction;
 for(const byte of event.bytes){if(byte===13)continue;if(byte===10){uartLines.delete(key);continue;}
  let row=uartLines.get(key);if(!row?.node.isConnected||row.text.length>=512){row={node:log('['+key+'] ','serial'),text:''};row.node.querySelector('.stamp').textContent=(event.micros/1e6).toFixed(3)+' s';uartLines.set(key,row);}
  row.text+=byte>=32&&byte<=126?String.fromCharCode(byte):'\\x'+byte.toString(16).padStart(2,'0');row.node.lastChild.textContent='['+key+'] '+row.text;
 }
 $('console-output').scrollTop=$('console-output').scrollHeight;
}
function setSaveState(text,state){$('save-state').textContent=text;$('save-state').dataset.state=state;}
function flushAutosave(){clearTimeout(saveTimer);saveTimer=null;localStorage.setItem('stm32lab.project.v2',JSON.stringify(project));if($('save-state').dataset.state==='error-file')setSaveState('파일 저장 실패','error-file');else setSaveState('자동 저장됨','saved');feedback.clear('autosave');diagnostic('project.saved',{status},true);}
function autosave(){clearTimeout(saveTimer);if($('save-state').dataset.state!=='error-file')setSaveState('저장 중…','saving');saveTimer=setTimeout(()=>{try{flushAutosave();}catch(error){setSaveState('자동 저장 실패',$('save-state').dataset.state==='error-file'?'error-file':'error');log('자동 저장 실패: '+error.message,'error');feedback.show('자동 저장에 실패했습니다. 파일 저장으로 작업을 보관해 주세요.','autosave');}},200);}
window.addEventListener('beforeunload',event=>{try{flushAutosave();}catch{log('자동 저장에 실패했습니다. 파일로 저장한 뒤 종료해 주세요.','error');if(dirty){event.preventDefault();event.returnValue=false;}}});
function checkpoint(){undoStack.push(JSON.stringify(project));if(undoStack.length>80)undoStack.shift();redoStack=[];dirty=true;}
function changed(){autosave();refresh();}
function setMode(m){if(running()){log('편집하려면 시뮬레이션을 먼저 정지하세요.');return;}mode=m;pending=null;selection=null;$('preview-layer').innerHTML='';refresh();}
function syncEditor(){
 lastCodeCheckpoint=0;
 $('project-name').value=project.name;const files=project.firmware?.files||[],hal=project.firmware?.mode==='hal';if(!files.some(f=>f.name===sourceFile))sourceFile='main.c';try{localStorage.setItem(SOURCE_KEY,sourceFile);}catch{}
 $('source-file').innerHTML=`<option value="main.c">${hal?'main.c':'main.ino'}</option>`+files.map(f=>`<option value="${esc(f.name)}">${esc(f.name)}</option>`).join('');$('source-file').value=sourceFile;
 $('code').value=sourceFile==='main.c'?project.code:files.find(f=>f.name===sourceFile).text;$('firmware-mode').value=hal?'hal':'sketch';
 document.querySelector('.language-badge').textContent=hal?'STM32 HAL':'GPIO 스케치';lineNumbers();monitor.settings(project.simulation);
 document.querySelector('.code-note code').textContent=hal?'HAL_GPIO_Init · WritePin · ReadPin · TogglePin\nHAL_UART_Transmit · Receive_IT\nHAL_GPIO_EXTI_Callback\nHAL_TIM_Base_Start_IT · HAL_ADC_GetValue\nHAL_I2C_Mem_Read · HAL_SPI_Transmit\nprintf("value=%lu\\n", value)':'pinMode · digitalWrite · digitalRead\nanalogRead · analogWrite · delay\nLiquidCrystal · Serial1 · Wire · SPI\nTimer · attachInterrupt · DMA';
 document.querySelector('.code-note p').textContent=hal?'main(void)와 지원 HAL API를 회로에 연결합니다. 전체 HAL 드라이버·ELF/BIN 실행은 지원하지 않습니다.':'GPIO 스케치 문법의 일부를 실행합니다. ELF/BIN 펌웨어 로더는 포함되지 않습니다.';
 const selectedSerial=$('serial-target').value,serials=hal?SERIAL_IDS.filter(id=>project.mcu?.peripherals[id]?.enabled):[],serialKey=hal?serials.join(','):'sketch',keepSerial=$('serial-target').dataset.channels===serialKey;
 $('serial-target').innerHTML=hal?(serials.length?serials.map(id=>id==='USART2'?'<option value="USART2">ST-LINK VCP → USART2 (내장)</option><option value="USART2:external">외부 UART 장치 → USART2</option>':`<option value="${id}">외부 UART 장치 → ${id}</option>`).join(''):'<option value="">UART 핀을 활성화하세요</option>'):'<option value="Serial1">외부 UART 장치 → Serial1</option><option value="Serial">USB 콘솔 → Serial</option>';
 $('serial-target').value=keepSerial&&[...$('serial-target').options].some(o=>o.value===selectedSerial)?selectedSerial:serials.includes('USART2')?'USART2':serials[0]??(hal?'':'Serial1');$('serial-target').dataset.channels=serialKey;$('serial-target').disabled=hal&&!serials.length;
 editorSearch.refresh({sourceChanged:true});
 ide?.sync();
}
function lineNumbers(){ $('line-numbers').textContent=Array.from({length:$('code').value.split('\n').length},(_,i)=>i+1).join('\n'); }
// The shell owns where each view lives: code in the editor group, the inspector in the
// secondary side bar, settings and device Docs in the primary side bar.
function tab(name){if(name==='code')layout.reveal('code');else if(name==='inspect')layout.reveal('inspect');else if(['settings','docs'].includes(name))layout.showView(name);}
function inspectTab(){layout.reveal('inspect');}
function refresh({preserveWires=false}={}){
 setActiveBoard(projectBoard(project).id);
 const keyboardFocus=canvasKeys?.snapshot();
 deviceDocs?.refresh();
 // The board drawing is static; redraw it when the project switches to another board.
 const boardGroup=svg.querySelector('#surface > .board');if(boardGroup&&boardGroup.dataset.board!==projectBoard(project).id){boardGroup.outerHTML=boardSvg(projectBoard(project).id);filterExamples();}
 updateSurfaces(svg,project,selection);
 updateBoardPicker();if(project.surfaces?.board?.hidden)$('search-layer').innerHTML='';svg.classList.toggle('connecting',mode==='wire'||!!pending||TWO_PIN_TYPES.includes(mode));
 const boards=project.components.filter(p=>p.type==='breadboard'),nextBreadboardKey=JSON.stringify(boards.map(p=>[p,isSelected(selection,'part',p.id)]));
 if(nextBreadboardKey!==breadboardKey){$('breadboard-layer').innerHTML=renderBreadboards(project,selection);breadboardKey=nextBreadboardKey;}
 if(!preserveWires)$('wire-layer').innerHTML=renderWires(project,selection);
 else $('wire-layer').querySelectorAll('[data-wire]').forEach(el=>el.classList.toggle('wire-selected',isSelected(selection,'wire',el.dataset.wire)));
 $('part-layer').innerHTML=renderParts(project,selection,result,pressed);
 updateSimulationSvg(svg,project,result,pressed);
 $('endpoint-layer').innerHTML=renderEndpoints(project,pending);
 renderConnections();renderIssues(true);
 $('builtin-led').setAttribute('fill',result&&result.voltage('signal:PA5')>1.8?'#64e66b':'#89a486');
 $('builtin-led').style.filter=result&&result.voltage('signal:PA5')>1.8?'drop-shadow(0 0 5px #59dc65)':'';
 $('tool-select')?.classList.toggle('active',mode==='select');
 document.querySelectorAll('[data-add]').forEach(b=>{b.classList.toggle('active',mode===b.dataset.add);b.disabled=running();if(b.dataset.add==='board')b.querySelector('b').textContent=project.surfaces?.board?.hidden?'+':'✓';});
 $('undo').disabled=running()||!undoStack.length;$('redo').disabled=running()||!redoStack.length;$('delete').disabled=running()||!['part','wire','group','surface'].includes(selection?.type);
 $('rotate').disabled=running()||selection?.type!=='part';
 $('code').readOnly=running();$('project-name').readOnly=running();
 editorSearch.refresh();
 for(const id of ['pinout-open','firmware-mode','firmware-import','firmware-folder','firmware-check','hal-example','code-reset','board-reset'])$(id).disabled=running();
 $('run').classList.toggle('running',running()||starting);$('run').textContent=starting?'■  빌드 취소':runtime?.debug.paused?'⏵ 계속':running()?'■ 정지':'▶ 실행';
 const runKey=keyFor('run.run');$('run').title=withKey('실행 / 정지','run.run');if(runKey)$('run').setAttribute('aria-keyshortcuts',runKey);else $('run').removeAttribute('aria-keyshortcuts');
 $('step').disabled=status==='running';
 $('mode-label').textContent=running()?'시뮬레이션 실행 중':status==='error'?'회로 확인 필요':'회로 편집';
 $('run-status').textContent=runtime?.debug.paused?'일시정지':({running:'실행 중',paused:'한 단계 실행',stopped:'준비됨',error:'오류로 정지'})[status];
 $('status-led').className=running()?'running':'';
 $('connection-count').textContent=`부품 ${project.components.length}개 · 배선 ${project.wires.length}개`;
 $('canvas-empty').hidden=!(project.surfaces?.board?.hidden&&project.surfaces?.breadboard?.hidden&&!project.components.length)||running();
 if($('explorer-circuit-summary'))$('explorer-circuit-summary').textContent=`${project.surfaces?.board?.hidden?'보드 없음':projectBoard(project).name} · 부품 ${project.components.filter(p=>p.type!=='breadboard').length}개 · 빵판 ${project.components.filter(p=>p.type==='breadboard').length+(project.surfaces?.breadboard?.hidden?0:1)}개 · 배선 ${project.wires.length}개`;
 $('hint').textContent=running()?'실행 중 핀을 클릭하면 전압을 측정합니다. 버튼은 누르는 동안 연결됩니다.':carry?CARRY_HINT:pending?'핀을 클릭하면 연결 · 바닥 클릭으로 꺾임점 추가 · 우클릭 / Esc: 작성 중 배선 취소':TWO_PIN_TYPES.includes(mode)?'빵판 구멍 두 곳을 선택해 다리를 꽂으세요. 빈 공간 클릭 시 자유 배치합니다.':drag?.type==='part'?'초록색 표시가 나타나면 놓아서 장착하세요. R: 45° 회전':'몸체: 이동 · 가장자리: 크기 조절 · 빈 공간 / 가운데 버튼: 화면 이동 · 배치 범위 제한 없음';
 inspector();updateReadouts();resizing?.refresh();
 ide?.controls();canvasKeys?.refresh(keyboardFocus);
}
function updateAudio(){buzzerAudio?.update(project,result,audioEnabled,status==='running');}
$('sound').onclick=async()=>{audioEnabled=!audioEnabled;if(audioEnabled&&!audioContext){audioContext=new AudioContext();buzzerAudio=new BuzzerAudio(audioContext);}if(audioEnabled)await audioContext.resume();$('sound').textContent=audioEnabled?'소리 켜짐':'소리 꺼짐';$('sound').setAttribute('aria-pressed',String(audioEnabled));updateAudio();};
function signalState(voltage){
 if(!result)return {kind:'idle',label:'미측정'};
 if(!Number.isFinite(voltage))return {kind:'floating',label:'부유'};
 return voltage>=2?{kind:'high',label:'HIGH'}:voltage<=.8?{kind:'low',label:'LOW'}:{kind:'analog',label:'ANALOG'};
}
function patchText(id,text){const el=$(id);if(el&&el.textContent!==String(text))el.textContent=text;}
function patchSignal(id,voltage){const el=$(id);if(!el)return;const state=signalState(voltage);el.dataset.signal=state.kind;patchText(id,state.label);}
function updateReadouts(){
 updateAudio();
 monitor.render();renderIssues();
 if(selection?.type==='part'){
  const p=project.components.find(p=>p.id===selection.id),read=p&&result?.parts[p.id],live=$('part-live');
  if(p&&live){const html=partReadouts(p,result);if(live.innerHTML!==html)live.innerHTML=html;}
  if(p)paintMedia(p,result,session);
  patchText('part-voltage',Number.isFinite(read?.voltage)?read.voltage.toFixed(3)+' V':'—');
  patchText('part-current',Number.isFinite(read?.current)?(read.current*1000).toFixed(3)+' mA':'—');
  patchText('part-power',Number.isFinite(read?.power)?(read.power*1000).toFixed(2)+' mW':'—');
 }
 const endpoint=selection?.type==='endpoint'?selection.id:selection?.type==='wire'?project.wires.find(w=>w.id===selection.id)?.from:null;
 if(endpoint){
  const prefix=selection.type,v=result?.voltage(endpoint);
  patchText(prefix+'-voltage',Number.isFinite(v)?v.toFixed(3)+' V':'—');
  patchSignal(prefix+'-signal',v);
  patchText(prefix+'-connected',connectedNet(project,endpoint,pressed).endpoints.length);
 }
 patchText('sim-time',(simTime/1000).toFixed(3)+' s');
 patchText('sim-current',result&&!result.fault?(result.current*1000).toFixed(2)+' mA':'—');
 patchText('warning-count',result?.warnings.length?`확인 ${result.warnings.length}건`:running()?'연결 상태 정상':'정지 상태');
}
function renderConnections(){
 const endpoint=selection?.type==='endpoint'?selection.id:selection?.type==='wire'?project.wires.find(w=>w.id===selection.id)?.from:null;
 const net=endpoint?connectedNet(project,endpoint,pressed):null;
 $('net-layer').innerHTML=net?net.wires.map(w=>`<path d="${roundedWirePath(wirePoints(project,w))}" fill="none" stroke="#e8b843" stroke-width="8" opacity=".45"/>`).join('')+net.endpoints.map(p=>`<circle data-net-endpoint="${p.id}" cx="${p.x}" cy="${p.y}" r="7" fill="#ffcf4233" stroke="#c28b14" stroke-width="1.5"/>`).join(''):'';
 const wire=selection?.type==='wire'?project.wires.find(w=>w.id===selection.id):null;
 const handleRadius=7/(svg.getScreenCTM()?.a||1);
 $('wire-handle-layer').innerHTML=!running()&&wire?(wire.points||[]).map((p,i)=>`<circle data-wire-point="${i}" data-owner-wire="${wire.id}" cx="${p.x}" cy="${p.y}" r="${handleRadius}" fill="${drag?.type==='wire-point'&&drag.index===i?'#f1cd6d':'#fffdf4'}" stroke="#937338" stroke-width="2" vector-effect="non-scaling-stroke" tabindex="0" role="button" aria-label="배선 꺾임점 ${i+1}; 끌어서 이동, 우클릭으로 삭제"><title>꺾임점 ${i+1} · 끌어서 이동 · 우클릭 삭제</title></circle>`).join(''):'';
}
function focusIssue(target){
 if(!target){pinout.open();return;}
 pending=null;mode='select';selection=target;const p=target.type==='endpoint'?endpointInfo(target.id,project.components,project.surfaces):project.components.find(p=>p.id===target.id);
 if(p){view={x:p.x-310,y:p.y-202,w:620,h:620*730/1120};viewUpdate();}inspectTab();refresh();svg.focus({preventScroll:true});
}
function renderIssues(force=false){
 if(!force&&performance.now()-issuesStamp<250)return;issuesStamp=performance.now();
 const issues=circuitDiagnostics(project,result,pressed),key=JSON.stringify(issues);if(key===issuesKey)return;issuesKey=key;
 $('circuit-issues').innerHTML=issues.length?issues.map((issue,i)=>`<button class="circuit-issue ${issue.severity}" data-issue="${i}" ${!issue.target&&running()?'disabled':''}><span>${issue.severity==='error'?'!':'·'}</span>${esc(issue.message)}<b>위치 보기 ↗</b></button>`).join(''):'<p class="issues-clear">현재 연결 검사에서 발견한 문제가 없습니다. 실행 중 전압·전류 검사도 함께 표시됩니다.</p>';
 $('circuit-issues').querySelectorAll('[data-issue]').forEach(b=>b.onclick=()=>focusIssue(issues[Number(b.dataset.issue)].target));
 document.querySelector('[data-monitor="issues"]').textContent='문제'+(issues.length?` (${issues.length})`:'');
}
function copyCircuit(){if(!selectedIds(selection,'part').length&&!selectedIds(selection,'wire').length)return false;circuitClipboard=copySelection(project,selection);clipboardOffset=28;log(`부품 ${circuitClipboard.components.length}개와 내부 배선 ${circuitClipboard.wires.length}개를 복사했습니다.`);return true;}
function pasteCircuit(){if(running()||!circuitClipboard)return;try{const draft=structuredClone(project),{skipped,...next}=pasteSelection(draft,circuitClipboard,uid,clipboardOffset);validateProject(draft);checkpoint();project=draft;selection=next;if(skipped)log(`이미 배선이나 부품 다리가 있는 핀·구멍에 닿는 배선 ${skipped}개는 붙여 넣지 않았습니다.`);clipboardOffset+=28;pending=null;mode='select';inspectTab();changed();}catch(e){log(e.message,'error');}}
function inspector(force=false){
 const el=$('inspector'),selected=selection?.type==='part'?project.components.find(p=>p.id===selection.id):selection?.type==='wire'?project.wires.find(w=>w.id===selection.id):selection?.type==='endpoint'?endpointInfo(selection.id,project.components,project.surfaces):null;
 const key=JSON.stringify([selection,selected,running()]);
 if(!force&&key===inspectorKey&&(!['part','wire'].includes(selection?.type)||selected===inspectorModel))return;
 inspectorKey=key;inspectorModel=selected;
 if(!selection){el.innerHTML='<span class="overline">CIRCUIT INSPECTOR</span><h2>회로 살펴보기</h2><div class="empty-inspector">핀, 배선 또는 부품을 선택하세요.<br>실행 중 전압과 전류를 확인할 수 있습니다.</div>';return;}
 if(selection.type==='group'){el.innerHTML=`<span class="overline">MULTIPLE SELECTION</span><h2>여러 항목 선택</h2><p>부품 ${selection.parts.length}개 · 배선 ${selection.wires.length}개</p><p>Shift+클릭 또는 Shift+빈 공간 드래그로 선택을 추가합니다. Ctrl+A: 전체 선택 · Ctrl+D: 복제 · Ctrl+C/V: 복사/붙여넣기 · Esc: 선택 삭제.</p><button id="copy-group" class="inspector-action">선택 복사</button><button id="remove-group" class="inspector-action danger" ${running()?'disabled':''}>선택 삭제</button>`;$('copy-group').onclick=copyCircuit;$('remove-group').onclick=removeSelected;return;}
 if(selection.type==='surface'){
   el.innerHTML=`<h2>${selection.id==='board'?'STM32 보드':'기본 빵판'}</h2><p>몸체를 끌어 이동하고, 가장자리와 모서리를 끌어 가로·세로 크기를 조절하세요. Shift를 누르면 비율을 유지하고, 드래그 중 Esc를 누르면 취소합니다. 연결된 핀·배선과 장착 부품도 함께 이동합니다.</p><button class="inspector-action" id="inspect-open-docs">장치 Docs · 배선/예제 보기</button>`;
   $('inspect-open-docs').onclick=()=>tab('docs');
 } else if(selection.type==='endpoint'){
   const e=endpointInfo(selection.id,project.components,project.surfaces),pin=PIN_BY_ID.get(selection.id);
   const connected=connectedNet(project,selection.id,pressed).endpoints.length;
   el.innerHTML=`<span class="overline">CONNECTION POINT</span><h2 title="${esc(e?.label||selection.id)}">${esc(e?.label||selection.id)}</h2><p>${pin?esc(pin.signal==='NC'?'연결되지 않은 NC 핀':`신호: ${pin.signal}`):'빵판의 실제 연결 그룹을 기준으로 계산합니다.'}</p><div class="measure"><span>전압 · GND 기준</span><span class="measure-value"><b id="endpoint-voltage">—</b><span id="endpoint-signal" class="signal-badge" data-signal="idle">미측정</span></span></div><div class="measure"><span>연결된 핀 / 구멍</span><b id="endpoint-connected">${connected}</b></div><p>${running()?'전압이 표시되지 않으면 부유 상태이거나 전원에 연결되지 않은 노드입니다.':'시뮬레이션을 실행하면 연결점의 전압을 확인할 수 있습니다.'}</p>`;
 } else if(selection.type==='part'){
   const p=project.components.find(p=>p.id===selection.id);if(!p)return;
   if(p.type==='breadboard'){
    el.innerHTML=`<span class="overline">BREADBOARD</span><h2 title="${esc(p.name)}">${esc(p.name)}</h2><p>${breadboardModel(p).label} · A–E / F–J 행과 전원 레일은 각각 연결됩니다. 다른 빵판과는 배선으로 연결해야 합니다.</p><div class="inspector-card"><label for="part-name">빵판 이름</label><input id="part-name" value="${esc(p.name)}" maxlength="80" ${running()?'disabled':''}></div><p>테두리를 끌어 이동하세요. 장착한 부품과 배선도 함께 이동합니다. 삭제하면 구멍에 연결된 배선과 장착 연결이 해제되며 다른 부품은 남습니다.</p><div class="measure"><span>회전 각도</span><b>${p.rotation}°</b></div><button class="inspector-action" id="inspect-open-docs">장치 Docs · 배선/예제 보기</button><button class="inspector-action" id="rotate-part" ${running()?'disabled':''}>45° 회전 (R)</button><button class="inspector-action danger" id="remove-part" ${running()?'disabled':''}>빵판 삭제</button>`;
    $('part-name').onchange=e=>{checkpoint();p.name=e.target.value.trim()||p.name;changed();};$('inspect-open-docs').onclick=()=>tab('docs');$('rotate-part').onclick=rotateSelected;$('remove-part').onclick=removeSelected;return;
   }
   const read=result?.parts[p.id],mounted=Object.keys(attachments(p)).length;
   el.innerHTML=`<span class="overline" title="${esc(p.type)}">${esc(CATALOG_BY_TYPE[p.type]?.interface||p.type.toUpperCase())}</span><h2 title="${esc(p.name)}">${esc(p.name)}</h2><p>${mounted?`${mounted} / ${terminalKeys(p).length}개 다리 장착`:'자유 배치 · 끌어서 빵판에 놓으세요.'}</p><div class="inspector-card"><label for="part-name">부품 이름</label><input id="part-name" value="${esc(p.name)}" maxlength="80" ${running()?'disabled':''}>${p.type==='resistor'?`<label for="part-value">저항 (Ω)</label><input id="part-value" type="number" value="${p.value}" min="1" max="10000000" ${running()?'disabled':''}>`:''}${p.type==='led'?`<label for="part-color">LED 색상</label><select id="part-color" ${running()?'disabled':''}>${[['red','빨강'],['green','초록'],['blue','파랑'],['yellow','노랑']].map(([v,l])=>`<option value="${v}" ${p.color===v?'selected':''}>${l}</option>`).join('')}</select>`:''}</div>${partControls(p,running())}${mediaSection(p,running())}<div class="measure"><span>부품 전압</span><b id="part-voltage">${read?read.voltage.toFixed(3)+' V':'—'}</b></div><div class="measure"><span>전류</span><b id="part-current">${read?(read.current*1000).toFixed(3)+' mA':'—'}</b></div>${p.type==='resistor'?`<div class="measure"><span>소비 전력</span><b id="part-power">${read?(read.power*1000).toFixed(2)+' mW':'—'}</b></div>`:''}${p.type==='button'?'<p>실행 중 버튼 몸체를 누르고 계시면 연결되고 손을 떼면 끊어집니다. A1–A2, B1–B2는 항상 연결되며, 누르면 양쪽이 연결됩니다.</p>':''}${p.type==='lcd'?'<p>LCD 1602의 4/8비트 명령·문자 출력을 지원합니다. VDD 5 V, VSS·R/W·VO를 GND에 연결하고 RS/E/DATA 핀을 배선하세요. 기존 스케치의 LiquidCrystal API를 사용할 수 있습니다.</p>':''}<div class="measure"><span>회전 각도</span><b>${Number(p.rotation.toFixed(1))}°</b></div><button class="inspector-action" id="inspect-open-docs">장치 Docs · 배선/예제 보기</button><button class="inspector-action" id="rotate-part" ${running()?'disabled':''}>45° 회전 (R)</button><button class="inspector-action danger" id="remove-part" ${running()?'disabled':''}>부품 삭제</button>`;
   $('part-name').onchange=e=>{checkpoint();p.name=e.target.value.trim()||p.name;changed();};
   if($('part-value'))$('part-value').onchange=e=>{const n=Number(e.target.value);if(!Number.isFinite(n)||n<1||n>1e7){log('저항 범위: 1 Ω~10 MΩ','error');inspector(true);updateReadouts();return;}checkpoint();p.value=n;changed();};
   if($('part-color'))$('part-color').onchange=e=>{checkpoint();p.color=e.target.value;changed();};
   if($('part-live'))$('part-live').innerHTML=partReadouts(p,result);
   el.querySelectorAll('[data-part-prop]').forEach(input=>{input.oninput=()=>{if(running()&&input.dataset.live!=='true')return;const key=input.dataset.partProp,n=key==='color'?input.value:Number(input.value);if(key==='color'){if(!['red','green','blue','yellow'].includes(n))return;checkpoint();p.color=n;changed();return;}if(!Number.isFinite(n)||(input.min!==undefined&&input.min!==''&&n<Number(input.min))||(input.max!==undefined&&input.max!==''&&n>Number(input.max)))return;if((['switch','motion'].includes(key)||p.type==='encoder'&&key==='position')&&!Number.isInteger(n))return;
    // Only values the project loader accepts are stored (an I²C address of 80.5 would make the saved project unloadable).
    try{validateProject({...project,components:project.components.map(c=>c===p?{...p,[key]:n}:c)});}catch{return;}if(!input.dataset.checkpoint){checkpoint();input.dataset.checkpoint='1';}p[key]=n;if($('output-'+key))$('output-'+key).textContent=input.type==='range'?n:'';autosave();if(running())recompute();updateSimulationSvg(svg,project,result,pressed);updateReadouts();};input.onchange=()=>{delete input.dataset.checkpoint;
    // A value outside the allowed range is not applied: show the stored value again and say the range.
    const key=input.dataset.partProp;if(key!=='color'&&String(p[key]??'')!==input.value&&input.type!=='range'){const range=input.min!==''&&input.max!==''?` (${input.min}~${input.max})`:'';log(`${(input.labels?.[0]??input.closest('label'))?.firstChild?.textContent?.trim()||key}: 허용 범위${range}의 값을 입력하세요${['address','baud'].includes(key)?' (정수)':''}.`,'error');input.value=p[key]??'';}};});
   $('inspect-open-docs').onclick=()=>tab('docs');$('remove-part').onclick=removeSelected;$('rotate-part').onclick=rotateSelected;
   bindMedia(p,{running:running(),checkpoint,changed,getSession:()=>session,log});
 } else if(selection.type==='wire'){
   const w=project.wires.find(w=>w.id===selection.id);if(!w)return;
   const connected=connectedNet(project,w.from,pressed).endpoints.length;
   el.innerHTML=`<span class="overline">WIRE</span><h2>점퍼선</h2><div class="inspector-card wire-terminals"><label>시작</label><p title="${esc(endpointInfo(w.from,project.components,project.surfaces)?.label)}">${esc(endpointInfo(w.from,project.components,project.surfaces)?.label)}</p><label>끝</label><p title="${esc(endpointInfo(w.to,project.components,project.surfaces)?.label)}">${esc(endpointInfo(w.to,project.components,project.surfaces)?.label)}</p></div><div class="measure"><span>전압 · GND 기준</span><span class="measure-value"><b id="wire-voltage">—</b><span id="wire-signal" class="signal-badge" data-signal="idle">미측정</span></span></div><div class="measure"><span>연결된 핀 / 구멍</span><b id="wire-connected">${connected}</b></div><div class="inspector-card"><span>배선 색상</span><div class="wire-colors" role="group" aria-label="선택한 배선 색상">${WIRE_COLORS.map(([value,name])=>`<button type="button" class="swatch ${value===w.color?'active':''}" data-wire-color="${value}" style="--swatch:${value}" title="${name} 배선" aria-label="${name} 배선" aria-pressed="${value===w.color}" ${running()?'disabled':''}></button>`).join('')}</div></div><p>전기 저항이 없는 이상적인 도선으로 계산합니다. 선이 교차하는 위치는 서로 연결되지 않습니다. 선택한 배선과 전기적으로 이어진 연결망을 금색으로 표시합니다.</p><p>배선을 더블클릭해 꺾임점을 추가하고 점을 끌어 이동하세요. 점 우클릭은 삭제입니다.</p><button class="inspector-action" id="reset-wire-route" ${running()?'disabled':''}>배선 경로 자동 정렬</button><button class="inspector-action danger" id="remove-wire" ${running()?'disabled':''}>배선 삭제</button>`;
   $('remove-wire').onclick=removeSelected;$('reset-wire-route').onclick=()=>{if(running())return;checkpoint();delete w.points;changed();};
   el.querySelectorAll('[data-wire-color]').forEach(button=>button.onclick=()=>{if(running())return;setWireColor(button.dataset.wireColor);});
 }
}
function removeSelected(){
 if(running()||!selection)return;
 if(selection.type==='surface'){checkpoint();removeSurface(project,selection.id);searchSelectedId=null;pinSearch();}
 else if(selection.type==='group'){checkpoint();const parts=new Set(selection.parts),wires=new Set(selection.wires);for(const id of parts)if(project.components.find(p=>p.id===id)?.type==='breadboard')removeBreadboard(project,id);project.components=project.components.filter(p=>!parts.has(p.id));project.wires=project.wires.filter(w=>!wires.has(w.id)&&![w.from,w.to].some(id=>id.startsWith('part:')&&parts.has(id.split(':')[1])));}
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
 if(drag?.type==='part'){drag.moved=true;refresh();$('preview-layer').innerHTML=renderMountPreview(findMount(p,project.components,15,project.surfaces,project.wires));}
 else {applyMount(p,findMount(p,project.components,15,project.surfaces,project.wires));changed();}
}
function editUndo(redo=false){if(running())return;const from=redo?redoStack:undoStack,to=redo?undoStack:redoStack;if(!from.length)return;to.push(JSON.stringify(project));project=JSON.parse(from.pop());selection=null;pending=null;syncEditor();changed();pinSearch();}
function addPart(type,a,b,position,extra={}){
 if(project.components.length>=100){log('부품은 100개까지 추가할 수 있습니다.','error');return;}
 const prefix=(({resistor:'R',led:'LED',button:'SW',lcd:'LCD',breadboard:'BB'})[type])||PART_DEFS[type]?.prefix,names=new Set(project.components.map(p=>p.name));let number=project.components.filter(p=>p.type===type).length+1;while(names.has(prefix+number))number++;const name=prefix+number;
 const p={id:uid('p'),type,name,x:position?.x??(a.x+b.x)/2,y:position?.y??(a.y+b.y)/2,rotation:0};Object.assign(p,extra);
 if(type==='resistor')p.value=330;if(type==='led')p.color='red';Object.assign(p,PART_DEFS[type]?.defaults||{});
 if(TWO_PIN_TYPES.includes(type)){p.span=a&&b?Math.hypot(b.x-a.x,b.y-a.y):70;if(a&&b){p.attachA=a.id;p.attachB=b.id;p.rotation=normalizeAngle(Math.atan2(b.y-a.y,b.x-a.x)*180/Math.PI);}}
 checkpoint();project.components.push(p);selection={type:'part',id:p.id};pending=null;mode='select';$('preview-layer').innerHTML='';inspectTab();changed();
}
// A wire end picked up by a click (toggle move, `carry`): the next click on a pin or hole puts it there.
function wireEndPreview(id,end,q){
 const w=project.wires.find(w=>w.id===id),other=w?.[end==='from'?'to':'from'],fixed=w&&endpointInfo(other,project.components,project.surfaces),target=endpointAt(project,q),info=target&&endpointInfo(target,project.components,project.surfaces),ok=target&&target!==other&&!endpointBlocked(project,target,{ignoreWire:id});
 $('preview-layer').innerHTML=fixed?`<path d="${route(fixed,info&&ok?info:q)}" fill="none" stroke="${esc(w.color)}" stroke-width="2.6" stroke-dasharray="5 4" pointer-events="none"/>${info?`<circle cx="${info.x}" cy="${info.y}" r="6" fill="none" stroke="${ok?'#2f9e6f':'#d24b3e'}" stroke-width="2" vector-effect="non-scaling-stroke" pointer-events="none"/>`:''}`:'';
}
// Moves the end to the endpoint at q; true when moved (errors are logged and leave the circuit unchanged).
function dropWireEnd(id,end,q){
 const next=structuredClone(project);
 try{if(moveWireEnd(next,id,end,endpointAt(project,q))){validateProject(next);checkpoint();project=next;selection={type:'wire',id};log('배선 끝을 옮겼습니다.');changed();return true;}}catch(error){log(error.message,'error');}
 return false;
}
function cancelCarry(){if(!carry)return false;carry=null;$('preview-layer').innerHTML='';refresh({preserveWires:true});return true;}
function cancelWireDraft(){pending=null;wireDraft.reset();selection=null;mode='select';$('preview-layer').innerHTML='';refresh();}
function clickEndpoint(id){
 const pin=PIN_BY_ID.get(id);selection={type:'endpoint',id};
 if(running()){inspectTab();refresh();return;}
 if(pin?.signal==='NC'){log('NC 핀은 내부에 연결되지 않았습니다.');pending=null;refresh();return;}
 // A part lead cannot go into a hole that already holds a jumper wire end (and the reverse below).
 if(TWO_PIN_TYPES.includes(mode)&&pending!==id&&wiredHoles(project.wires).has(id)){log('점퍼선이 꽂힌 구멍입니다. 부품 다리는 같은 줄의 다른 구멍에 꽂으세요.');refresh();return;}
 // One jumper per hole / pin, as on a real breadboard.
 const blocked=!TWO_PIN_TYPES.includes(mode)&&pending!==id?endpointBlocked(project,id):null;
 if(!pending){if(blocked){log(blocked);inspectTab();refresh();return;}pending=id;wireDraft.reset(id);inspectTab();refresh();return;}
 if(pending===id){pending=null;refresh();return;}
 if(TWO_PIN_TYPES.includes(mode)){
   if(id.startsWith('part:')||pending.startsWith('part:')){log('부품을 꽂으려면 보드 핀 또는 빵판 구멍을 선택하세요.');return;}
   const occupied=occupiedHoles(project.components);if(occupied.has(id)||occupied.has(pending)){log('이미 부품이 꽂힌 구멍입니다. 다른 구멍을 선택하세요.');pending=null;refresh();return;}
   addPart(mode,endpointInfo(pending,project.components,project.surfaces),endpointInfo(id,project.components,project.surfaces));return;
 }
 if(blocked){log(blocked);return;}
 if(project.wires.length>=500){log('배선은 500개까지 추가할 수 있습니다.','error');pending=null;return;}
 if(!project.wires.some(w=>(w.from===pending&&w.to===id)||(w.to===pending&&w.from===id))){checkpoint();project.wires.push({id:uid('w'),from:pending,to:id,color,...wireDraft.finish(pending)});}
 pending=null;selection=null;$('preview-layer').innerHTML='';changed();
}
function point(e){const p=svg.createSVGPoint();p.x=e.clientX;p.y=e.clientY;return p.matrixTransform(svg.getScreenCTM().inverse());}
function viewUpdate({preserveKeyboardFocus=true}={}){const focused=preserveKeyboardFocus?canvasKeys?.snapshot():null;svg.setAttribute('viewBox',`${view.x} ${view.y} ${view.w} ${view.h}`);$('zoom-reset').textContent=Math.round(1120/view.w*100)+'%';renderConnections();resizing?.refresh();if(focused?.type==='bend')canvasKeys.refresh(focused);}
svg.addEventListener('pointerdown',e=>{
 if(e.button!==0&&e.button!==1)return;svg.focus({preventScroll:true});
 if(e.button===1){drag={type:'pan',clientX:e.clientX,clientY:e.clientY,x:view.x,y:view.y};e.preventDefault();svg.setPointerCapture(e.pointerId);return;}
 const target=e.target,part=target.closest('[data-part]'),onboard=target.closest('[data-button]');
 if(running()&&(onboard||part)){
   if(onboard?.dataset.button==='RESET'){resetRuntime();return;}
   const id=onboard?.dataset.button||part?.dataset.part,p=project.components.find(p=>p.id===id);
   if((p?.type==='slide'||CATALOG_BY_TYPE[p?.type]?.family==='slide')&&!target.closest('[data-endpoint]')){checkpoint();p.position=(p.position+1)%(CATALOG_BY_TYPE[p.type]?.id.includes('dp3t')?3:2);selection={type:'part',id:p.id};inspectTab();recompute();autosave();refresh();return;}
   if(id==='USER'||p?.type==='button'||CATALOG_BY_TYPE[p?.type]?.family==='button'){pressed[id]=true;drag={type:'press',id};svg.setPointerCapture(e.pointerId);recompute();refresh();return;}
 }
 if(carry&&e.button===0){
   const c=carry,q=point(e),hit=target.closest('[data-wire-end]');
   if(running()||(hit&&hit.dataset.ownerWire===c.id&&hit.dataset.wireEnd===c.end)||!endpointAt(project,q)){cancelCarry();return;}
   carry=null;if(!dropWireEnd(c.id,c.end,q)){carry=c;wireEndPreview(c.id,c.end,q);refresh({preserveWires:true});}
   return;
 }
 // Dragging a wire end moves it to another hole or pin; a click without moving picks it up (toggle move).
 const end=target.closest('[data-wire-end]');if(end&&!running()&&!e.shiftKey){if(pending||TWO_PIN_TYPES.includes(mode)){clickEndpoint(project.wires.find(w=>w.id===end.dataset.ownerWire)?.[end.dataset.wireEnd]);return;}drag={type:'wire-end',id:end.dataset.ownerWire,end:end.dataset.wireEnd,start:point(e),current:point(e),moved:false};svg.setPointerCapture(e.pointerId);return;}
 const handle=target.closest('[data-wire-point]');if(handle&&!running()){const id=handle.dataset.ownerWire,index=Number(handle.dataset.wirePoint);drag={type:'wire-point',id,index,start:point(e),origin:{...project.wires.find(w=>w.id===id).points[index]},moved:false};svg.setPointerCapture(e.pointerId);return;}
 if(e.shiftKey&&!running()){const wire=target.closest('[data-wire]');if(wire||part){selection=toggleSelection(selection,wire?'wire':'part',wire?.dataset.wire||part.dataset.part);pending=null;mode='select';inspectTab();refresh();return;}}
 if(part&&selection?.type==='group'&&isSelected(selection,'part',part.dataset.part)&&!running()){drag={type:'group',start:point(e),base:structuredClone(project),moved:false};svg.setPointerCapture(e.pointerId);return;}
 // A wire drawn across a pin or hole does not hide it: the pin under the pointer takes the click.
 const pin=target.closest('[data-endpoint]')??(target.closest('[data-wire]')&&!target.closest('[data-wire-end]')?document.elementsFromPoint(e.clientX,e.clientY).find(el=>el.matches?.('[data-endpoint]')):null);if(pin){clickEndpoint(pin.dataset.endpoint);return;}
 const wire=target.closest('[data-wire]');if(wire){pending=null;wireDraft.reset();$('preview-layer').innerHTML='';selection={type:'wire',id:wire.dataset.wire};inspectTab();refresh({preserveWires:true});return;}
 const surface=target.closest('[data-surface]');if(surface&&!part&&e.button===0&&mode==='select'&&!pending){selection={type:'surface',id:surface.dataset.surface};if(!running()){drag={type:'surface',id:selection.id,start:point(e),origin:surfaceOrigin(selection.id,project.surfaces),base:structuredClone(project),moved:false};svg.setPointerCapture(e.pointerId);}inspectTab();refresh();return;}
 if(part){
   pending=null;wireDraft.reset();$('preview-layer').innerHTML='';selection={type:'part',id:part.dataset.part};inspectTab();
   if(!running()){const p=project.components.find(p=>p.id===part.dataset.part),q=point(e);drag={type:'part',id:p.id,start:q,x:p.x,y:p.y,moved:false};svg.setPointerCapture(e.pointerId);}
   refresh();return;
 }
 const q=point(e);
 if(e.shiftKey&&!running()&&mode==='select'&&!pending){drag={type:'marquee',start:q,current:q,additive:true,selection:structuredClone(selection)};e.preventDefault();svg.setPointerCapture(e.pointerId);return;}
 if(!running()&&TWO_PIN_TYPES.includes(mode)){addPart(mode,null,null,{x:q.x,y:q.y});return;}
 if(pending&&!running()&&e.button===0){try{wireDraft.add(pending,q);$('hint').textContent='꺾임점 추가 · 다음 바닥 또는 연결할 핀을 클릭하세요. Backspace: 마지막 점 취소 / Esc: 배선 취소';}catch(error){log(error.message,'error');}return;}
 selection=null;drag={type:'pan',clientX:e.clientX,clientY:e.clientY,x:view.x,y:view.y};svg.setPointerCapture(e.pointerId);refresh();
});
svg.addEventListener('pointermove',e=>{
 const q=point(e);
 if(drag?.type==='marquee'){drag.current=q;const x=Math.min(drag.start.x,q.x),y=Math.min(drag.start.y,q.y),w=Math.abs(drag.start.x-q.x),h=Math.abs(drag.start.y-q.y);$('preview-layer').innerHTML=`<rect class="marquee-box" x="${x}" y="${y}" width="${w}" height="${h}" vector-effect="non-scaling-stroke"/>`;return;}
 if(drag?.type==='surface'){const dx=q.x-drag.start.x,dy=q.y-drag.start.y;if(!drag.moved&&Math.hypot(dx,dy)<=3)return;const next=structuredClone(drag.base);try{moveSurface(next,drag.id,{x:drag.origin.x+dx,y:drag.origin.y+dy});validateProject(next);clearTimeout(saveTimer);drag.moved=true;project=next;refresh();pinSearch();}catch(error){log(error.message,'error');}return;}
 if(drag?.type==='wire-end'){drag.current=q;if(!drag.moved&&Math.hypot(q.x-drag.start.x,q.y-drag.start.y)<3)return;drag.moved=true;wireEndPreview(drag.id,drag.end,q);return;}
 if(carry&&!drag){wireEndPreview(carry.id,carry.end,q);return;}
 if(drag?.type==='wire-point'){const w=project.wires.find(w=>w.id===drag.id),dx=q.x-drag.start.x,dy=q.y-drag.start.y;if(!drag.moved&&Math.hypot(dx,dy)<2)return;if(!drag.moved){checkpoint();drag.moved=true;}w.points[drag.index]={x:drag.origin.x+dx,y:drag.origin.y+dy};refresh();return;}
 if(drag?.type==='group'){let dx=q.x-drag.start.x,dy=q.y-drag.start.y;if(!drag.moved&&Math.hypot(dx,dy)<=3)return;if(!drag.moved){checkpoint();drag.moved=true;}try{const next=structuredClone(drag.base);moveSelection(next,selection,dx,dy);validateProject(next);project=next;refresh();}catch{}return;}
 if(drag?.type==='part'){
   const p=project.components.find(p=>p.id===drag.id),dx=q.x-drag.start.x,dy=q.y-drag.start.y;
   if(!drag.moved&&Math.hypot(dx,dy)>3){checkpoint();drag.moved=true;detachPart(p);}
   if(drag.moved){const x=drag.x+dx,y=drag.y+dy;if(p.type==='breadboard')moveBreadboard(project,p.id,{x,y});else {p.x=x;p.y=y;}refresh();$('preview-layer').innerHTML=renderMountPreview(findMount(p,project.components,15,project.surfaces,project.wires));}
   return;
 }
 if(drag?.type==='pan'){const box=svg.getBoundingClientRect();view.x=drag.x-(e.clientX-drag.clientX)*view.w/box.width;view.y=drag.y-(e.clientY-drag.clientY)*view.h/box.height;viewUpdate();return;}
 if(pending){const a=endpointInfo(pending,project.components,project.surfaces);$('preview-layer').innerHTML=`<path d="${wireDraft.points.length?wireDraft.path(pending,a,q):route(a,q)}" fill="none" stroke="${color}" stroke-width="2" stroke-dasharray="5 5" pointer-events="none"/>`;}
 const hit=e.target.closest('[data-endpoint]'),wireHit=e.target.closest('[data-wire]');
 document.querySelectorAll('.same-net').forEach(el=>el.classList.remove('same-net'));
 if(hit){const id=hit.dataset.endpoint,info=endpointInfo(id,project.components,project.surfaces),v=result?.voltage(id),hole=holeInfo(id,project.components,project.surfaces);if(hole)for(const h of circuitHoles(project.components,project.surfaces))if(h.bus===hole.bus)svg.querySelector(`[data-hole="${h.id}"]`)?.classList.add('same-net');
   $('tooltip').textContent=info.label+(result?`\n${Number.isFinite(v)?v.toFixed(3)+' V · ':''}${signalState(v).label}`:'');const box=$('canvas-container').getBoundingClientRect();$('tooltip').style.left=Math.min(e.clientX-box.left+12,box.width-220)+'px';$('tooltip').style.top=Math.max(0,e.clientY-box.top-47)+'px';$('tooltip').hidden=false;
 }else if(wireHit&&result){const w=project.wires.find(w=>w.id===wireHit.dataset.wire),v=w&&result.voltage(w.from),box=$('canvas-container').getBoundingClientRect();$('tooltip').textContent=`점퍼선 · ${Number.isFinite(v)?v.toFixed(3)+' V · ':''}${signalState(v).label}`;$('tooltip').style.left=Math.min(e.clientX-box.left+12,box.width-220)+'px';$('tooltip').style.top=Math.max(0,e.clientY-box.top-47)+'px';$('tooltip').hidden=false;}else $('tooltip').hidden=true;
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
function release(event){if(!drag)return;
 if(drag.type==='wire-end'){const d=drag;drag=null;$('preview-layer').innerHTML='';
  if(event?.type==='pointercancel'){refresh({preserveWires:true});return;}
  if(!d.moved){carry={id:d.id,end:d.end};selection={type:'wire',id:d.id};inspectTab();refresh({preserveWires:true});wireEndPreview(d.id,d.end,d.current);return;}
  if(!dropWireEnd(d.id,d.end,d.current))refresh({preserveWires:true});return;
 }
 if(drag.type==='marquee'){
  const previous=drag.selection;
  if(event?.type==='pointercancel'||running())selection=previous;
  else {const found=boxSelection(project,{minX:drag.start.x,minY:drag.start.y,maxX:drag.current.x,maxY:drag.current.y});selection={type:'group',parts:[...new Set([...selectedIds(previous,'part'),...found.parts])],wires:[...new Set([...selectedIds(previous,'wire'),...found.wires])]};if(!selection.parts.length&&!selection.wires.length)selection=null;}
  drag=null;$('preview-layer').innerHTML='';if(selection)inspectTab();refresh();return;
 }if(drag.type==='surface'){const next=project;project=drag.base;if(drag.moved&&event?.type!=='pointercancel'){checkpoint();project=next;}if(drag.moved)autosave();drag=null;refresh();pinSearch();return;}if(drag?.type==='group'&&drag.moved&&event?.type!=='pointercancel'){mountSelection(project,selection);refresh();}if(['wire-point','group'].includes(drag?.type)&&drag.moved)autosave();if(drag?.type==='press'){pressed[drag.id]=false;recompute();refresh();}if(drag?.type==='part'&&drag.moved){const p=project.components.find(p=>p.id===drag.id);if(p?.type==='breadboard')log(p.name+': 빵판과 장착 부품을 이동했습니다.');else if(p){const mounted=applyMount(p,findMount(p,project.components,15,project.surfaces,project.wires));log(mounted?`${p.name}: ${terminalKeys(p).length}개 다리를 빵판에 장착했습니다.`:`${p.name}: 자유 배치 상태입니다. 모든 다리가 구멍에 맞을 때 장착됩니다.`);}autosave();}drag=null;$('preview-layer').innerHTML='';refresh();}
svg.addEventListener('pointerup',release);svg.addEventListener('pointercancel',release);window.addEventListener('blur',()=>{if(['surface','marquee'].includes(drag?.type))release({type:'pointercancel'});if(Object.values(pressed).some(Boolean)){pressed={};recompute();refresh();}});
window.addEventListener('keydown',e=>{if(e.key==='Escape'&&['surface','marquee'].includes(drag?.type)){e.preventDefault();e.stopImmediatePropagation();release({type:'pointercancel'});}},true);
svg.addEventListener('pointerleave',()=>{$('tooltip').hidden=true;});
function zoom(mult,anchor=null){view=zoomView(view,mult,anchor);viewUpdate();}
svg.addEventListener('wheel',e=>{e.preventDefault();if(!e.deltaY)return;const step=e.ctrlKey?1.04:1.08;zoom(e.deltaY>0?step:1/step,point(e));},{passive:false});
$('zoom-in').onclick=()=>zoom(1/1.2);$('zoom-out').onclick=()=>zoom(1.2);$('zoom-reset').onclick=fitView;
function fitView(){
 const scaled=Object.values(project.surfaces||{}).some(s=>scaleXOf(s)!==1||scaleYOf(s)!==1||s.x!==undefined)||project.components.some(p=>scaleXOf(p)!==1||scaleYOf(p)!==1||p.skewX||p.x<0||p.y<0||p.x>1120||p.y>730)||project.wires.some(w=>w.points?.some(p=>p.x<0||p.y<0||p.x>1120||p.y>730));
 if(scaled){const boxes=[{x:0,y:0,w:1120,h:730},...project.wires.flatMap(w=>(w.points||[]).map(p=>({...p,w:0,h:0}))),...Object.entries({board:BOARD,breadboard:BB}).filter(([key])=>!project.surfaces?.[key]?.hidden).map(([name,b])=>({...surfaceOrigin(name,project.surfaces),w:b.w*scaleXOf(project.surfaces?.[name]),h:b.h*scaleYOf(project.surfaces?.[name])})),...project.components.map(p=>{if(p.type==='breadboard'){const b=breadboardBounds(p);return {x:b.left,y:b.top,w:b.right-b.left,h:b.bottom-b.top};}const points=[[-170,-280],[170,-280],[170,280],[-170,280]].map(([x,y])=>partVector(p,x,y)),xs=points.map(v=>p.x+v.x),ys=points.map(v=>p.y+v.y);return {x:Math.min(...xs),y:Math.min(...ys),w:Math.max(...xs)-Math.min(...xs),h:Math.max(...ys)-Math.min(...ys)};})],x=Math.min(...boxes.map(b=>b.x))-20,y=Math.min(...boxes.map(b=>b.y))-20,right=Math.max(...boxes.map(b=>b.x+b.w))+20,bottom=Math.max(...boxes.map(b=>b.y+b.h))+20,w=Math.max(right-x,(bottom-y)*1120/730);view={x,y,w,h:w*730/1120};}
 else{const extra=project.components.filter(p=>p.type==='breadboard');let w=1120;if(extra.length)w=Math.max(w,...project.components.map(p=>p.type==='breadboard'?breadboardBounds(p).right+40:p.x+360),...project.components.map(p=>(p.type==='breadboard'?breadboardBounds(p).bottom+40:p.y+360)*1120/730));view={x:0,y:0,w,h:w*730/1120};}viewUpdate();
}
function pinSearch(){
 const pins=project.surfaces?.board?.hidden?[]:searchPins($('pin-search').value);
 $('search-layer').innerHTML=renderPinSearch(pins,searchSelectedId,project.surfaces);
 $('pin-results').innerHTML=!$('pin-search').value.trim()?'':pins.length?pins.map(p=>`<button data-search-pin="${p.id}" class="${p.id===searchSelectedId?'selected':''}" aria-pressed="${p.id===searchSelectedId}"><strong>${esc(p.signal)}</strong><span>${esc(p.header)}-${p.number} · ${esc(p.label)}</span></button>`).join(''):'<p>일치하는 핀이 없습니다.</p>';
 $('pin-results').querySelectorAll('button').forEach(b=>b.onclick=()=>focusPin(b.dataset.searchPin));
}
function focusPin(id){const p=endpointInfo(id,project.components,project.surfaces);if(!p)return;pending=null;selection={type:'endpoint',id};searchSelectedId=id;$('preview-layer').innerHTML='';pinSearch();view={x:p.x-310,y:p.y-202,w:620,h:620*730/1120};viewUpdate();inspectTab();refresh();svg.focus({preventScroll:true});}
$('pin-search').addEventListener('input',()=>{searchSelectedId=null;pinSearch();});
$('pin-search').addEventListener('keydown',e=>{if(e.key==='Enter'){const p=searchPins(e.target.value)[0];if(p)focusPin(p.id);}if(e.key==='Escape'){e.stopPropagation();e.target.value='';searchSelectedId=null;pinSearch();}});
function recompute(){if(!runtime||!session)return;try{session.setPressed(pressed);result=session.viewResult;const warning=result.warnings.join('|');if(warning&&warning!==lastWarnings)result.warnings.forEach(w=>log(w,'error'));lastWarnings=warning;}catch(e){result=session.viewResult;status='error';log(e.message,'error');}}
function initializeRuntime({debug=false,entry=false}={}){
 const emulate=!!ide?.emulator();
 if(emulate&&!firmware){status='error';runtime=null;session=null;log('펌웨어 ELF가 없습니다. 빌드하거나 파일 → 펌웨어 ELF 열기를 사용하세요.','error');return false;}
 const program=emulate?null:ide?.build({reveal:false});if(!emulate&&ide&&!program){status='error';runtime=null;session=null;layout.showPanel('build');return false;}
 try{simTime=0;pressed={};lastWarnings='';result=null;monitor.clear();uartLines.clear();const options={debug:debug?{entry,breakpoints:ide?.breakpoints()||[]}:undefined,print:s=>log(s,'serial'),uart:logUart,trace:event=>monitor.trace(event),channels:monitor.channels()};
  session=emulate?new FirmwareSession(project,{...options,elf:firmware.bytes}):new SimulationSession(project,{...options,program});runtime=session.runtime;status='paused';pending=null;mode='select';// The start line comes before what the program prints in its first tick.
  log(emulate?`펌웨어 에뮬레이터를 시작했습니다 · ${firmware.name} · ${projectBoard(project).mcu} (${projectBoard(project).core}) 명령어 실행`:project.firmware?.mode==='hal'?'HAL 프로그램을 시작했습니다.':'스케치를 시작했습니다.');result=session.tick(0);for(const p of project.components)if(isCamera(p))void applyCameraImage(p,session);diagnostic('simulation.started',{debug,entry},true);ide?.debugView();return true;}
 catch(e){runtime=null;result=session?.viewResult??null;status='error';log(e.message,'error');return false;}
}
function recordSimulation(){if(result)diagnostic('simulation.state',{status,simulationMs:simTime,pins:runtime?.gpio||{},parts:result.parts,fault:result.fault,warnings:result.warnings});}
function resetRuntime(){
 if(!runtime||!session||!['running','paused'].includes(status))return false;
 const wasRunning=status==='running',debug=!!runtime.debug?.enabled||!!ide?.breakpoints().length;recordSimulation();status='stopped';
 // End the previous run before compiling: manual builds remain blocked while running.
 const initialized=initializeRuntime({debug,entry:debug&&!wasRunning});
 if(initialized&&wasRunning)status=runtime.debug.paused?'paused':'running';
 refresh();return initialized;
}
setInterval(recordSimulation,2000);
function stop(){recordSimulation();try{const before=JSON.stringify(project.components.map(p=>p.cardImage??null)),draft=structuredClone(project);session?.storage?.applyTo?.(draft);if(JSON.stringify(draft.components.map(p=>p.cardImage??null))!==before){checkpoint();project.components.forEach((p,i)=>{if(draft.components[i]?.cardImage!==undefined)p.cardImage=draft.components[i].cardImage;});autosave();log('SD 카드에 기록된 파일을 프로젝트에 저장했습니다.');}}catch(error){log('SD 카드 저장 실패: '+error.message,'error');}status='stopped';runtime=null;result=null;pressed={};pending=null;$('preview-layer').innerHTML='';log('시뮬레이션을 정지했습니다.');refresh();ide?.debugView();}
$('run').onclick=()=>{if(runtime?.debug.paused){runtime.resume();simTime=runtime.microTime/1000;status='running';ide?.debugView();refresh();}else if(running())stop();else if(starting)cancelStart();else void startRun({debug:!!ide?.breakpoints().length});};
// The emulator target needs a built (or opened) ELF before the session can start.
function cancelStart(){starting=false;startToken++;window.nativeIde?.stop?.().catch(()=>{});log('펌웨어 빌드를 취소했습니다.');refresh();}
async function startRun(options){
 if(starting)return false;
 if(ide?.emulator()){const token=++startToken;starting=true;refresh();try{await ensureFirmware();}catch(error){if(token===startToken){log(error.message,'error');feedback.show('펌웨어를 준비하지 못했습니다. 빌드 탭의 오류를 확인하거나 ELF 파일을 여세요.','firmware');}return false;}finally{if(token===startToken)starting=false;}if(token!==startToken)return false;}
 if(running())return false;const ok=initializeRuntime(options);if(ok)status=runtime.debug.paused?'paused':'running';refresh();if(ok)ide?.debugView();return ok;
}
// The build configuration (Debug -O0 / Release -Os) is part of what the cached ELF was built from.
const firmwareKey=()=>JSON.stringify([project.code,project.firmware?.files,project.mcu,$('native-config')?.value]);
async function ensureFirmware(force=false){
 if(!force&&firmware&&(firmware.source==='file'||firmware.key===firmwareKey()))return firmware;
 log('ARM GCC로 펌웨어를 빌드합니다…');
 const bytes=await ide.buildElf();firmware={bytes,name:'firmware.elf',key:firmwareKey(),source:'build'};feedback.clear('firmware');
 log(`펌웨어 ELF 준비 완료 · ${(bytes.length/1024).toFixed(1)} KB`);return firmware;
}
async function openElf(){
 try{if(!window.desktop?.openElf)throw new Error('ELF 열기는 데스크톱 앱에서 사용할 수 있습니다.');const opened=await window.desktop.openElf();if(!opened)return;
  if(running())stop();firmware={bytes:opened.bytes,name:opened.name,key:null,source:'file'};
  const select=$('native-target');if(select&&select.value!=='emulator'){select.value='emulator';select.dispatchEvent(new Event('change'));}
  log(`펌웨어 ELF를 열었습니다 · ${opened.name} · ${(opened.bytes.length/1024).toFixed(1)} KB. ${keyFor('run.run')||'실행 버튼'}으로 에뮬레이터에서 실행합니다.`);
 }catch(error){log(error.message,'error');}
}
function debugCommand(command){
 diagnostic('debug.command',{command,status,location:runtime?.location??null});
 if(command==='stop'){if(running())stop();return;}
 if(command==='start'){if(running())return;void startRun({debug:true,entry:true});return;}
 if(!runtime)return;
 if(command==='pause'){if(status==='running'){runtime.debug.enabled=true;runtime.debug.mode='into';}return;}
 if(!runtime.debug.paused)return;if(command==='out'&&runtime.depth<=1)return;
 runtime.resume(command);simTime=runtime.microTime/1000;status='running';ide?.debugView();refresh();
}
// Keyboard/menu entry points: run (Ctrl+F5), start debugging (F10), stop (Ctrl+F2) and the step commands.
function runCommand(kind){
 // Paused in the simulator, emulator or a GDB session: Ctrl+F5 and F10 both continue.
 if(runtime?.debug.paused||ide?.nativePaused?.()){$('run').click();return;}
 if(running()||starting)return;
 if(kind==='debug'){ide?.debug('start');return;}
 $('run').click();
}
function shellDebugCommand(command){
 if(command==='stop'&&starting){cancelStart();return;}
 if(ide?.debug)ide.debug(command);else debugCommand(command);
}
$('step').onclick=()=>{if(!runtime||status==='error'){if(ide?.emulator()){void startRun({}).then(ok=>{if(ok){status='paused';refresh();}});return;}initializeRuntime();}else {try{simTime+=20;result=session.tick(simTime);recompute();}catch(e){status='error';log(e.message,'error');}}refresh();};
setInterval(()=>{
 if(status!=='running')return;
 try{simTime+=20;result=session.tick(simTime);recompute();
   if(runtime.debug.paused){simTime=runtime.microTime/1000;status='paused';recordSimulation();diagnostic('debug.paused',{location:runtime.location,depth:runtime.depth,simulationMs:simTime});refresh();ide?.debugView();return;}
   if(runtime.finished&&runtime.debug.enabled){status='paused';log('프로그램이 종료되었습니다. 정지 버튼으로 편집을 재개하세요.');refresh();ide?.debugView();return;}
   updateSimulationSvg(svg,project,result,pressed);updateReadouts();
   if(status==='error')refresh();
 }catch(e){result=session?.viewResult??result;status='error';log(e.message,'error');refresh();}
},20);
if($('tool-select'))$('tool-select').onclick=()=>setMode('select');$('delete').onclick=removeSelected;$('rotate').onclick=rotateSelected;$('undo').onclick=()=>editUndo();$('redo').onclick=()=>editUndo(true);
document.querySelectorAll('[data-add]').forEach(b=>b.onclick=()=>{if(running())return;const type=b.dataset.add;if(type==='board'){
 if(project.surfaces?.board?.hidden){checkpoint();showSurface(project,'board');changed();pinSearch();}
 selection={type:'surface',id:'board'};pending=null;mode='select';inspectTab();fitView();refresh();svg.focus({preventScroll:true});return;
 }if(isBreadboardLibraryType(type)){
 let f;try{f=newBreadboardFields(project,type);}catch(e){log(e.message,'error');return;}
 addPart('breadboard',null,null,{x:f.x,y:f.y},f.variant?{variant:f.variant}:{});fitView();svg.focus({preventScroll:true});
}else if(MULTI_PIN_TYPES.includes(type)){addPart(type,null,null,{x:view.x+view.w*.48,y:view.y+view.h*.85});svg.focus({preventScroll:true});}else setMode(type);});
$('empty-add-board').onclick=()=>document.querySelector('[data-add="board"]')?.click();$('empty-open-parts').onclick=()=>layout.showView('parts');$('empty-open-examples').onclick=()=>layout.showView('examples');
$('wire-palette').innerHTML=WIRE_COLORS.map(([value,name],i)=>`<button data-palette="${i<10?'basic':'pastel'}" data-color="${value}" class="swatch ${value===color?'active':''}" style="--swatch:${value}" title="${name} 배선" aria-label="${name} 배선"></button>`).join('');
function setWireColor(value){
 color=value;document.querySelectorAll('[data-color]').forEach(s=>{s.classList.toggle('active',s.dataset.color===value);s.setAttribute('aria-pressed',String(s.dataset.color===value));});
 const wire=selection?.type==='wire'&&project.wires.find(w=>w.id===selection.id);
 if(!running()&&wire&&wire.color!==value){checkpoint();wire.color=value;changed();}
}
document.querySelectorAll('[data-color]').forEach(b=>b.onclick=()=>setWireColor(b.dataset.color));
document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>tab(b.dataset.tab));
function replaceProject(p,{preserveWorkspace=false}={}){if(running())stop();firmware=null;project=validateProject(p);feedback.clear('save');setSaveState('저장 중…','saving');selection=null;pending=null;drag=null;mode='select';pressed={};lastWarnings='';uartLines.clear();searchSelectedId=null;$('pin-search').value='';pinSearch();fitView();selection=null;pending=null;drag=null;$('preview-layer').innerHTML='';undoStack=[];redoStack=[];status='stopped';runtime=null;session=null;monitor.clear();result=null;simTime=0;dirty=false;lastCodeCheckpoint=0;sourceFile='main.c';syncEditor();ide?.reset({preserveWorkspace});autosave();refresh();log('회로를 열었습니다: '+project.name);}
function requestReplace(action){if(ide?.nativeBusy()){log('빌드·실행·디버그를 정지한 뒤 프로젝트를 변경하세요.','error');return;}if(dirty){replaceAction=action;$('replace-dialog').showModal();}else action();}
$('replace-cancel').onclick=()=>{$('replace-dialog').close();replaceAction=null;};$('replace-confirm').onclick=()=>{$('replace-dialog').close();replaceAction?.();replaceAction=null;};
$('hal-example').onchange=e=>{const type=e.target.value;e.target.value='';if(running()||!Object.hasOwn(HAL_EXAMPLES,type))return;checkpoint();project=applyHalExample(project,type);sourceFile='main.c';runtime=null;session=null;result=null;status='stopped';simTime=0;pressed={};selection=null;pending=null;drag=null;mode='select';lastWarnings='';$('preview-layer').innerHTML='';fitView();monitor.clear();uartLines.clear();syncEditor();changed();if(type==='uart')$('serial-target').value='USART2';else if(type==='uart_external'||CATALOG_BY_TYPE[type]?.family==='uart')$('serial-target').value='USART2:external';tab('code');const guide=halGuideFor(type,projectBoard(project).id);log(HAL_EXAMPLES[type]+' · '+guide);
 // Examples driven from the serial monitor open it, so text is typed there (not into the Windows terminal).
 if(/직렬 모니터 탭/.test(guide))layout.showPanel('bus');svg.focus({preventScroll:true});};
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
$('code').addEventListener('input',()=>{if(replaceCheckpoint||Date.now()-lastCodeCheckpoint>1000){checkpoint();lastCodeCheckpoint=Date.now();}dirty=true;if(sourceFile==='main.c')project.code=$('code').value;else project.firmware.files.find(f=>f.name===sourceFile).text=$('code').value;lineNumbers();autosave();ide?.invalidate();$('undo').disabled=false;$('redo').disabled=true;});
$('source-file').onchange=e=>{sourceFile=e.target.value;syncEditor();};
$('board-reset').onclick=()=>{if(running())return;$('board-reset-error').textContent='';$('board-reset-dialog').showModal();};
$('board-reset-cancel').onclick=()=>$('board-reset-dialog').close();
$('board-reset-confirm').onclick=()=>{
 try{
  if(running())throw new Error('빌드·실행·디버그를 정지한 뒤 초기화하세요.');
  const removedParts=project.components.length,removedWires=project.wires.length,next=resetBoardConfiguration(project);
  checkpoint();project=next;runtime=null;session=null;result=null;status='stopped';simTime=0;pressed={};selection=null;pending=null;mode='select';searchSelectedId=null;
  wireDraft.reset();$('preview-layer').innerHTML='';$('search-layer').innerHTML='';$('pin-search').value='';monitor.clear();uartLines.clear();
  syncEditor();pinSearch();changed();ide?.invalidate();fitView();
  diagnostic('board.reset',{removedParts,removedWires,preservedCode:true},true);
  $('board-reset-dialog').close();log('보드 구성을 초기화했습니다. 코드와 다른 소스 파일은 유지됩니다. Ctrl+Z로 되돌릴 수 있습니다.');
 }catch(error){$('board-reset-error').textContent=error.message;}
};
$('code-reset').onclick=()=>{if(running())return;$('code-reset-error').textContent='';$('code-reset-file').textContent=project.firmware?.mode==='hal'?'main.c':'main.ino';$('code-reset-dialog').showModal();};
$('code-reset-cancel').onclick=()=>$('code-reset-dialog').close();
$('code-reset-confirm').onclick=()=>{
 try{
  if(running())throw new Error('빌드·실행·디버그를 정지한 뒤 초기화하세요.');
  const beforeLength=project.code.length,next=resetMainCode(project);
  checkpoint();project=next;sourceFile='main.c';runtime=null;session=null;result=null;status='stopped';simTime=0;pressed={};monitor.clear();uartLines.clear();
  syncEditor();changed();ide?.invalidate();tab('code');layout.reveal('code');
  diagnostic('code.reset',{file:'main.c',mode:project.firmware?.mode,beforeLength,afterLength:project.code.length,preservedParts:project.components.length,preservedWires:project.wires.length},true);
  $('code-reset-dialog').close();log('기본 코드로 초기화했습니다. 회로·핀 설정·다른 파일은 유지됩니다. Ctrl+Z로 되돌릴 수 있습니다.');
 }catch(error){$('code-reset-error').textContent=error.message;}
};
$('firmware-mode').onchange=e=>{if(running())return;checkpoint();project.firmware={mode:e.target.value,files:project.firmware?.files||[]};if(e.target.value==='hal')project.mcu??=defaultMcu(projectBoard(project).mcuFamily);syncEditor();changed();};
$('firmware-check').onclick=()=>{try{if(project.firmware?.mode==='hal')compileHal(project.code,project.firmware.files,project.mcu?.family);else compile(project.code);log('소스 문법 검사를 통과했습니다.');}catch(e){log(e.message,'error');}};
function applyFirmware(files){try{if(!files)return;const imported=importFirmware(project,files);checkpoint();project=imported.project;sourceFile='main.c';syncEditor();changed();log('가져왔습니다: '+files.map(f=>f.name).join(', '));for(const warning of imported.warnings)log(warning,'error');}catch(e){log(e.message,'error');}}
$('firmware-import').onclick=async()=>{try{if(window.desktop?.importFirmware)applyFirmware(await window.desktop.importFirmware(false));else $('firmware-files').click();}catch(e){log(e.message,'error');}};
$('firmware-folder').hidden=!window.desktop?.importFirmware;
$('firmware-folder').onclick=async()=>{try{applyFirmware(await window.desktop.importFirmware(true));}catch(e){log(e.message,'error');}};
$('firmware-files').onchange=async e=>{const chosen=[...e.target.files];try{if(chosen.length>41||chosen.reduce((n,f)=>n+f.size,0)>800000)throw new Error('파일은 41개, 합계 800 KB 이하로 선택하세요.');applyFirmware(await Promise.all(chosen.map(async f=>({name:f.name,text:await f.text()}))));}catch(err){log(err.message,'error');}finally{e.target.value='';}};
$('code').addEventListener('scroll',()=>{$('line-numbers').scrollTop=$('code').scrollTop;});
$('code').addEventListener('keydown',e=>{if(e.key==='Tab'){e.preventDefault();if(running())return;const a=e.target.selectionStart,b=e.target.selectionEnd;e.target.setRangeText(' '.repeat(loadPreferences().tabSize),a,b,'end');e.target.dispatchEvent(new Event('input'));}});
async function save(){if(loadPreferences().formatOnSave&&!running()){const next=structuredClone(project);if(formatProjectSources(next)){checkpoint();project=next;syncEditor();log('저장하면서 코드를 정렬했습니다.');}}try{const savedProject=project,data=JSON.stringify(project,null,2);if(await ide?.saveWorkspace(data)){}else if(window.desktop){const path=await window.desktop.save(data);if(!path)return;}else{const blob=new Blob([data],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=project.name.replace(/[^\w가-힣-]/g,'_')+'.stm32lab';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}if(project===savedProject&&JSON.stringify(project,null,2)===data){dirty=false;lastCodeCheckpoint=0;}
  // A pending autosave from the last keystroke would replace "파일 저장됨" moments later; store it now instead.
  if(saveTimer){clearTimeout(saveTimer);saveTimer=null;try{localStorage.setItem('stm32lab.project.v2',JSON.stringify(project));}catch{}}
  feedback.clear('save');setSaveState('파일 저장됨','saved');log('회로 파일을 저장했습니다.');}catch(e){setSaveState('파일 저장 실패','error-file');log('저장 실패: '+e.message,'error');feedback.show('파일 저장에 실패했습니다. 저장 위치와 권한을 확인한 뒤 다시 저장해 주세요.','save');}}
$('main-export').onclick=async()=>{try{if(project.firmware?.mode!=='hal')throw new Error('HAL main.c를 선택하세요.');if($('native-target').value==='simulator')compileHal(project.code,project.firmware.files,project.mcu?.family);if(window.desktop?.exportMain){if(!await window.desktop.exportMain(project.code))return;}else{const url=URL.createObjectURL(new Blob([project.code],{type:'text/plain;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download='main.c';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}log('main.c를 저장했습니다. 실제 프로젝트의 핀·주변장치·NVIC 설정을 동일하게 구성하세요.');}catch(e){log(e.message,'error');}};
$('save').onclick=save;
async function open(){try{if(window.desktop){const data=await window.desktop.open();if(data!=null){replaceProject(validateProject(JSON.parse(data)));feedback.clear('open');}}else $('file-input').click();}catch(e){log('불러오기 실패: '+e.message,'error');feedback.show('회로 파일을 열지 못했습니다. 현재 작업은 유지됩니다. 올바른 회로 파일을 선택해 주세요.','open');}}
$('open').onclick=()=>requestReplace(open);
$('file-input').onchange=async e=>{try{const f=e.target.files[0];if(!f)return;if(f.size>2e6)throw new Error('파일 크기는 2 MB 이하여야 합니다.');replaceProject(validateProject(JSON.parse(await f.text())));feedback.clear('open');}catch(err){log('불러오기 실패: '+err.message,'error');feedback.show('회로 파일을 열지 못했습니다. 현재 작업은 유지됩니다. 올바른 회로 파일을 선택해 주세요.','open');}e.target.value='';};
$('clear-console').onclick=()=>{$('console-output').textContent='';uartLines.clear();};
$('help').onclick=$('api-help').onclick=()=>$('help-dialog').showModal();
window.addEventListener('keydown',e=>{
 if(e.defaultPrevented)return;
 const editing=['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)||document.activeElement.isContentEditable,modal=document.querySelector('dialog[open]');
 if(modal)return;
 if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();save();return;}
 if(document.activeElement===$('code')&&(e.ctrlKey||e.metaKey)&&['z','y'].includes(e.key.toLowerCase())){e.preventDefault();editUndo(e.key.toLowerCase()==='y'||e.shiftKey);return;}
 if(editing)return;
 if((e.ctrlKey||e.metaKey)&&['a','d'].includes(e.key.toLowerCase())){
  if(drag){e.preventDefault();return;}
  if(running())return;
  if(e.key.toLowerCase()==='a'){e.preventDefault();pending=null;wireDraft.reset();mode='select';selection={type:'group',parts:project.components.map(p=>p.id),wires:project.wires.map(w=>w.id)};if(!selection.parts.length&&!selection.wires.length)selection=null;$('preview-layer').innerHTML='';inspectTab();refresh();}
  else if(copyCircuit()){e.preventDefault();pasteCircuit();}
  return;
 }
 if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='c'){e.preventDefault();copyCircuit();return;}
 if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='v'){e.preventDefault();pasteCircuit();return;}
 if(e.key==='Backspace'&&pending){e.preventDefault();wireDraft.sync(pending);wireDraft.back();$('preview-layer').innerHTML='';return;}
 if(e.key==='Escape'&&cancelCarry()){e.preventDefault();return;}
 if(e.key==='Escape'){wireDraft.reset();e.preventDefault();if(!pending&&['part','wire','group','surface'].includes(selection?.type)){removeSelected();}else {pending=null;mode='select';selection=null;$('preview-layer').innerHTML='';refresh();}}
 if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();removeSelected();}
 // Single-letter tools only without Ctrl/Alt/Meta (Ctrl+R is the editor's replace shortcut).
 if(!e.ctrlKey&&!e.metaKey&&!e.altKey){if(e.key.toLowerCase()==='r')rotateSelected();if(e.key.toLowerCase()==='w')setMode('wire');if(e.key.toLowerCase()==='v')setMode('select');}
 if(e.ctrlKey&&e.key.toLowerCase()==='z'){e.preventDefault();editUndo(e.shiftKey);}if(e.ctrlKey&&e.key.toLowerCase()==='y'){e.preventDefault();editUndo(true);}
});
window.addEventListener('error',e=>log('화면 오류: '+e.message,'error'));
document.addEventListener('ide-undo',e=>editUndo(e.detail));
document.addEventListener('ide-find',e=>{layout.reveal('code');editorSearch.open(e.detail);});
ide=setupIde({buildFirmware:()=>ensureFirmware(true).catch(error=>log(error.message,'error')),getProject:()=>project,getSource:()=>sourceFile,getSession:()=>runtime?session:null,isRunning:running,isSimulationRunning:()=>status==='running'||status==='paused',refresh,checkpoint,saveLocal:autosave,layout,log,feedback,requestReplace,replaceProject,debugCommand,
 selectSource:name=>{if(name!=='main.c'&&!project.firmware?.files.some(f=>f.name===name))return;sourceFile=name;syncEditor();},
 applySources:(p,file)=>{checkpoint();project=validateProject(p);sourceFile=file;syncEditor();changed();ide.invalidate();}});
// Button titles show the current shortcuts as soon as a binding changes.
// Help text and the palette button show the user's keys too.
const bindingTexts=()=>{for(const el of document.querySelectorAll('[data-binding-key]'))el.textContent=keyFor(el.dataset.bindingKey)||'(키 없음)';$('command-palette-open').title=withKey('명령 팔레트','view.palette');};bindingTexts();
layout.onBindings(()=>{$('debug-start').title=withKey('시작 위치에서 디버깅','run.debug');refresh();ide.controls();bindingTexts();});
setupIdeSettings({editor:ide.editor,layout,open:()=>tab('settings')});
if(restoreError)log(`저장된 프로젝트를 열지 못해 새 회로로 시작합니다 (${restoreError}). 이전 내용은 브라우저 저장소 stm32lab.project.recovery에 보관했습니다.`,'error');
deviceDocs=setupDeviceDocs({getProject:()=>project,getSelection:()=>selection,isRunning:running,open:()=>tab('docs'),showSource:file=>{sourceFile=file;syncEditor();tab('code');},apply:(target,options)=>{
 if(running())throw new Error('실행을 정지한 뒤 적용하세요.');
 let applied;try{applied=applyDeviceExample(project,target,options);}catch(error){diagnostic('docs.failed',{target,options,message:error.message},true);throw error;}
 checkpoint();project=applied.project;sourceFile=applied.file;runtime=null;session=null;status='stopped';syncEditor();changed();fitView();
 diagnostic('docs.applied',{target,binding:applied.binding,report:applied.report},true);
 if(applied.action!=='remove'&&(applied.binding.type==='uart'||CATALOG_BY_TYPE[applied.binding.type]?.family==='uart')){const id=applied.binding.peripherals.USART2;$('serial-target').value=id==='USART2'?'USART2:external':id;}
 ide.invalidate();return applied;
}});
resizing=setupResizing({getProject:()=>project,getSelection:()=>selection,isRunning:running,canResize:()=>!drag&&!pending&&mode==='select',focus:frame=>{const b=frame.bounds,points=[[0,0],[1,0],[1,1],[0,1]].map(([x,y])=>frame.point(b.x+x*b.width,b.y+y*b.height)),xs=points.map(p=>p.x),ys=points.map(p=>p.y),left=Math.min(...xs),top=Math.min(...ys),width=Math.max(...xs)-left,height=Math.max(...ys)-top,w=Math.max(430,width*1.8,height*1.8*1120/730);view={x:left+width/2-w/2,y:top+height/2-w*730/1120/2,w,h:w*730/1120};viewUpdate();},onError:message=>log(message,'error'),select:target=>{selection=target;pending=null;mode='select';inspectTab();refresh();},preview:draft=>{clearTimeout(saveTimer);project=draft;refresh();pinSearch();},cancel:base=>{project=base;changed();pinSearch();},commit:(base,draft)=>{validateProject(draft);project=base;checkpoint();project=draft;changed();pinSearch();},resize:(target,scale)=>{if(running())return;const draft=structuredClone(project);resizeObject(draft,target,scale);validateProject(draft);checkpoint();project=draft;selection=target;changed();pinSearch();}});
const logicAnalyzer=setupLogicAnalyzer({getSession:()=>session,getProject:()=>project,isRunning:()=>status==='running',log,onNoise:noise=>{checkpoint();project.simulation={...(project.simulation||{}),noise};autosave();}});
layout.mount({openElf,debugCommand:shellDebugCommand,runCommand,formatCode:()=>{layout.reveal('code');lastCodeCheckpoint=0;void ide?.format?.();},formatSelection:()=>{layout.reveal('code');lastCodeCheckpoint=0;ide?.formatSelection?.();},find:replace=>editorSearch.open(replace),files:()=>[project.code!==undefined?'main.c':null,...(project.firmware?.files||[]).map(f=>f.name)].filter(Boolean),openFile:name=>{if(name!=='main.c'&&!project.firmware?.files.some(f=>f.name===name))return;sourceFile=name;syncEditor();layout.reveal('code');ide?.editor?.focus?.();},gotoLine:line=>ide?.editor?.goto?.(line),setTarget:value=>{const select=$('native-target');if(!select||select.disabled||![...select.options].some(o=>o.value===value))return;select.value=value;select.dispatchEvent(new Event('change'));}});layout.setMonitor(monitor);
setupTabAccessibility();
canvasKeys=setupCanvasKeyboard(svg,{
 isDragging:()=>!!drag,
 label:target=>target.type==='endpoint'?(endpointInfo(target.id,project.components,project.surfaces)?.label||target.id):target.type==='button'?`${target.id} 버튼; 실행 중 Space로 누르기`:target.type==='bend'?`배선 꺾임점 ${target.index+1}; 방향키 이동, Delete 삭제`:target.type==='wire'?'점퍼선; Enter 선택, Insert 꺾임점 추가':target.type==='surface'?(target.id==='board'?'STM32 보드':'빵판'):(project.components.find(p=>p.id===target.id)?.name||'부품'),
 position:target=>endpointInfo(target.id,project.components,project.surfaces),
 reveal:(x,y)=>{const p=new DOMPoint(x,y).matrixTransform(svg.getScreenCTM().inverse());view.x=p.x-view.w/2;view.y=p.y-view.h/2;viewUpdate({preserveKeyboardFocus:false});},
 owns:(target,id)=>target?.type==='part'?id.startsWith(`part:${target.id}:`)||id.startsWith(`breadboard:${target.id}:`):target?.type==='surface'?(target.id==='board'?id.startsWith('board:'):id.startsWith('bb:')||id.startsWith('rail:')):false,
 announce:text=>{$('hint').textContent=carry?CARRY_HINT:text+' · PageUp/Down 탐색 · Enter 선택 · 방향키 이동 · P 핀 탐색';},
 activate:target=>{if(drag)return;if(target.type==='endpoint'){clickEndpoint(target.id);return;}if(target.type==='button')return;selection={type:target.type==='bend'?'wire':target.type,id:target.id};pending=null;wireDraft.reset();$('preview-layer').innerHTML='';mode='select';inspectTab();refresh();},
 press:(target,down)=>{
  const part=target.type==='part'?project.components.find(p=>p.id===target.id):null,id=target.type==='button'?target.id:part?.id;
  if(!id)return false;
  const family=CATALOG_BY_TYPE[part?.type]?.family,button=id==='USER'||part?.type==='button'||family==='button',slide=part?.type==='slide'||family==='slide',reset=id==='RESET';
  if(!button&&!slide&&!reset)return false;
  if(!down){if(button&&pressed[id]){delete pressed[id];if(runtime)recompute();refresh();}return true;}
  if(drag||!runtime||!['running','paused'].includes(status))return false;
  if(reset){resetRuntime();return true;}
  if(slide){checkpoint();part.position=(part.position+1)%(CATALOG_BY_TYPE[part.type]?.id.includes('dp3t')?3:2);autosave();}else pressed[id]=true;
  recompute();refresh();return true;
 },
 move:(target,dx,dy)=>{if(running()||drag||pending)return;let draft=structuredClone(project);try{if(target.type==='bend'){const point=draft.wires.find(w=>w.id===target.id)?.points?.[target.index];if(!point)return;point.x+=dx;point.y+=dy;}else if(target.type==='surface'){const origin=surfaceOrigin(target.id,draft.surfaces);moveSurface(draft,target.id,{x:origin.x+dx,y:origin.y+dy});}else if(target.type==='part'){
   // A step that lands in the same holes (e.g. across the breadboard's centre gap) is retried 2x and 3x farther.
   const holes=d=>JSON.stringify(selectedIds(target,'part').map(id=>attachments(d.components.find(c=>c.id===id)||{})));const before=holes(project);
   // A mounted part must also stay on its line: a remount that slides sideways into another row is not this move
   // (a free part snapping into its first holes may shift slightly).
   const centre=d=>{const c=d.components.find(c=>c.id===selectedIds(target,'part')[0]);return c?{x:c.x,y:c.y}:{x:0,y:0};},from=centre(project),straight=d=>{const to=centre(d);return dx?Math.abs(to.y-from.y)<1:Math.abs(to.x-from.x)<1;};
   let found=false;for(let k=1;k<=3;k++){draft=structuredClone(project);moveSelection(draft,target,dx*k,dy*k);mountSelection(draft,target);if(before==='[]'||k===1&&!holes(draft).includes('"')||holes(draft).includes('"')&&holes(draft)!==before&&(!before.includes('"')||straight(draft))){found=true;break;}}
   if(!found){log('그 방향에는 부품을 꽂을 빈 구멍이 없습니다.','error');return;}
  }else return;validateProject(draft);checkpoint();project=draft;selection={type:target.type==='bend'?'wire':target.type,id:target.id};changed();pinSearch();}catch(error){log(error.message,'error');}},
 removeBend:target=>{if(running()||drag||pending)return;const wire=project.wires.find(w=>w.id===target.id);if(!wire?.points?.[target.index])return;checkpoint();wire.points.splice(target.index,1);changed();},
 addBend:target=>{if(running()||drag||pending)return;const draft=structuredClone(project),wire=draft.wires.find(w=>w.id===target.id);if(!wire)return;try{const points=wirePoints(draft,wire),i=Math.max(1,Math.floor(points.length/2)),a=points[i-1],b=points[i],index=insertWirePoint(draft,wire,{x:(a.x+b.x)/2,y:(a.y+b.y)/2});validateProject(draft);checkpoint();project=draft;selection={type:'wire',id:target.id};changed();return {type:'bend',id:target.id,index};}catch(error){log(error.message,'error');}}
});
syncEditor();fitView();refresh();log(`회로를 연결하고 실행(${keyFor('run.run')}) 또는 디버그 시작(${keyFor('run.debug')})을 눌러 보세요.`);
diagnostic('app.started',{status},true);
setupUpdates({beforeInstall:async()=>{
 clearTimeout(saveTimer);
 const text=JSON.stringify(project);
 localStorage.setItem('stm32lab.project.v2',text);
 await diagnostic('app.before-update',{status},true);
 await ide.saveWorkspace(text);
 $('save-state').textContent='자동 저장됨';
}});
