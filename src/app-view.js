// Drawing the circuit and the panels around it: refresh, board title, live readouts, connections, issues and sound.
import {viewUpdate} from './app-canvas.js';
import {running,inspectTab,log} from './app-core.js';
import {filterExamples} from './app-examples.js';
import {updateRunScope} from './app-run.js';
import {state} from './app-state.js';
import {svg,updateBoardPicker,editorSearch,CARRY_HINT,inspector,monitor,pinout,layout} from './app.js';
import {syncEditor} from './app-editor.js';
import {projectBoard} from './boards.js';
import {BuzzerAudio} from './buzzer-audio.js';
import {circuitDiagnostics} from './circuit-diagnostics.js';
import {isSelected,connectedNet,wirePoints} from './circuit-edit.js';
import {$} from './common.js';
import {isBoardFile,devboardModel,boardForFile} from './devboards.js';
import {BOARD} from './geometry.js';
import {keyFor,withKey} from './keybindings.js';
import {partReadouts} from './part-controls.js';
import {paintMedia} from './part-media-ui.js';
import {setActiveBoard,endpointInfo} from './pins.js';
import {ledShade,boardSvg,updateSurfaces,renderBreadboards,renderDevboards,renderWires,renderParts,updateSimulationSvg,renderEndpoints,esc} from './render.js';
import {stm32Boards,mainBoardName} from './stm32-boards.js';
import {roundedWirePath} from './wire-path.js';

export function refresh({preserveWires=false}={}){
 setActiveBoard(projectBoard(state.project).id);
 const keyboardFocus=state.canvasKeys?.snapshot();
 state.deviceDocs?.refresh();
 // The board drawing is static; redraw it when the project switches to another board.
 const boardGroup=svg.querySelector('#surface > .board');if(boardGroup&&boardGroup.dataset.board!==projectBoard(state.project).id){boardGroup.outerHTML=boardSvg(projectBoard(state.project).id);filterExamples();}
 updateSurfaces(svg,state.project,state.selection);boardTitle();
 updateBoardPicker();if(state.project.surfaces?.board?.hidden)$('search-layer').innerHTML='';svg.classList.toggle('connecting',state.mode==='wire'||!!state.pending);
 const boards=state.project.components.filter(p=>p.type==='breadboard'),nextBreadboardKey=JSON.stringify(boards.map(p=>[p,isSelected(state.selection,'part',p.id)]));
 if(nextBreadboardKey!==state.breadboardKey){$('breadboard-layer').innerHTML=renderBreadboards(state.project,state.selection);state.breadboardKey=nextBreadboardKey;}
 const devboards=state.project.components.filter(p=>p.type==='devboard'),nextDevboardKey=JSON.stringify(devboards.map(p=>[p.id,p.model,p.name,p.x,p.y,p.rotation,p.scale,p.scaleX,p.scaleY,isSelected(state.selection,'part',p.id)]));
 if(nextDevboardKey!==state.devboardKey){$('devboard-layer').innerHTML=renderDevboards(state.project,state.selection);state.devboardKey=nextDevboardKey;updateRunScope();}
 if(!preserveWires)$('wire-layer').innerHTML=renderWires(state.project,state.selection);
 else $('wire-layer').querySelectorAll('[data-wire]').forEach(el=>el.classList.toggle('wire-selected',isSelected(state.selection,'wire',el.dataset.wire)));
 $('part-layer').innerHTML=renderParts(state.project,state.selection,state.result,state.pressed);
 updateSimulationSvg(svg,state.project,state.result,state.pressed);
 $('endpoint-layer').innerHTML=renderEndpoints(state.project,state.pending);
 renderConnections();renderIssues(true);
 // On-board LEDs: LD2 (PA5) on the NUCLEO boards, LED1 (P408) / LED2 (P407) on the FPB-RA6E1.
 for(const [id,pin]of [['builtin-led','PA5'],['board-led-LED1','P408'],['board-led-LED2','P407']]){const el=document.getElementById(id);if(!el)continue;const s=ledShade(state.result?state.result.voltage('signal:'+pin):0);el.setAttribute('fill',s.fill);el.style.filter=s.filter;}
 $('tool-select')?.classList.toggle('active',state.mode==='select');
 document.querySelectorAll('[data-add]').forEach(b=>{b.classList.toggle('active',state.mode===b.dataset.add);b.disabled=running();if(b.dataset.add==='board')b.querySelector('b').textContent=state.project.surfaces?.board?.hidden?'+':'✓';});
 $('undo').disabled=running()||!state.undoStack.length;$('redo').disabled=running()||!state.redoStack.length;$('delete').disabled=running()||!['part','wire','group','surface'].includes(state.selection?.type);
 $('rotate').disabled=running()||state.selection?.type!=='part';
 $('code').readOnly=running()||(isBoardFile(state.sourceFile)&&devboardModel(boardForFile(state.project,state.sourceFile)??{})?.kind!=='esp32');$('code').dataset.readOnlyMessage=running()?'실행 중에는 코드를 고칠 수 없습니다. 실행 정지(■, Ctrl+F5) 후 수정하세요.':'이 파일은 읽기 전용입니다.';$('project-name').readOnly=running();
 editorSearch.refresh();
 for(const id of ['pinout-open','firmware-mode','firmware-import','firmware-folder','firmware-check','code-reset','board-reset'])$(id).disabled=running();$('hal-example').disabled=!!state.ide?.nativeBusy();if($('run-scope'))$('run-scope').disabled=running();document.querySelectorAll('[data-devboard-add]').forEach(b=>b.disabled=running());
 $('run').classList.toggle('running',running()||state.starting);$('run').textContent=state.starting?'■  빌드 취소':state.runtime?.debug.paused?'⏵ 계속':running()?'■ 정지':'▶ 실행';
 const runKey=keyFor('run.run');$('run').title=withKey('실행 / 정지','run.run');if(runKey)$('run').setAttribute('aria-keyshortcuts',runKey);else $('run').removeAttribute('aria-keyshortcuts');
 $('step').disabled=state.status==='running';
 $('mode-label').textContent=running()?'시뮬레이션 실행 중':state.status==='error'?'회로 확인 필요':'회로 편집';
 $('run-status').textContent=state.runtime?.debug.paused?'일시정지':({running:'실행 중',paused:'한 단계 실행',stopped:'준비됨',error:'오류로 정지'})[state.status];
 $('status-led').className=running()?'running':'';
 $('connection-count').textContent=`부품 ${state.project.components.length}개 · 배선 ${state.project.wires.length}개`;
 $('empty-add-board').textContent=projectBoard(state.project).name+' 추가';$('canvas-empty').hidden=!(state.project.surfaces?.board?.hidden&&state.project.surfaces?.breadboard?.hidden&&!state.project.components.length)||running();
 if($('explorer-circuit-summary'))$('explorer-circuit-summary').textContent=`${state.project.surfaces?.board?.hidden?'보드 없음':stm32Boards(state.project).length?`STM32 ${stm32Boards(state.project).length+1}개 (편집: ${mainBoardName(state.project)})`:projectBoard(state.project).name} · 부품 ${state.project.components.filter(p=>!['breadboard','devboard'].includes(p.type)).length}개 · 빵판 ${state.project.components.filter(p=>p.type==='breadboard').length+(state.project.surfaces?.breadboard?.hidden?0:1)}개${devboards.length?` · 다른 보드 ${devboards.length}개`:''} · 배선 ${state.project.wires.length}개`;
 $('hint').textContent=running()?'실행 중 핀을 클릭하면 전압을 측정합니다. 버튼은 누르는 동안 연결됩니다.':state.carry?CARRY_HINT:state.pending?'핀을 클릭하면 연결 · 바닥 클릭으로 꺾임점 추가 · 우클릭 / Esc: 작성 중 배선 취소':state.drag?.type==='part'?'초록색 표시가 나타나면 놓아서 장착하세요. R: 45° 회전':'부품을 끌어 빵판에 꽂기 · 빈 공간 / 가운데 버튼: 화면 이동 · 배치 범위 제한 없음';
 inspector();updateReadouts();
 state.ide?.controls();state.canvasKeys?.refresh(keyboardFocus);
}
// With more STM32 boards the main board shows its name and that it is the one being edited.
export function boardTitle(){
 const group=svg.querySelector('#surface > .board');if(!group)return;let title=group.querySelector('.board-title');
 if(!stm32Boards(state.project).length){title?.remove();return;}
 if(!title){group.insertAdjacentHTML('beforeend',`<text class="board-title devboard-name" x="${BOARD.x+BOARD.w/2}" y="${BOARD.y-10}" font-size="12" fill="#2b7a5f" text-anchor="middle" font-weight="700"></text>`);title=group.querySelector('.board-title');}
 title.textContent=`${mainBoardName(state.project)} · 편집 중`;
}
export function updateAudio(){state.buzzerAudio?.update(state.project,state.result,state.audioEnabled,state.status==='running');}
export function signalState(voltage){
 if(!state.result)return {kind:'idle',label:'미측정'};
 if(!Number.isFinite(voltage))return {kind:'floating',label:'부유'};
 return voltage>=2?{kind:'high',label:'HIGH'}:voltage<=.8?{kind:'low',label:'LOW'}:{kind:'analog',label:'ANALOG'};
}
export function patchText(id,text){const el=$(id);if(el&&el.textContent!==String(text))el.textContent=text;}
export function patchSignal(id,voltage){const el=$(id);if(!el)return;const state=signalState(voltage);el.dataset.signal=state.kind;patchText(id,state.label);}
export function updateReadouts(){
 updateAudio();
 monitor.render();renderIssues();
 if(state.selection?.type==='part'){
  const p=state.project.components.find(p=>p.id===state.selection.id),read=p&&state.result?.parts[p.id],live=$('part-live');
  if(p&&live){const html=partReadouts(p,state.result);if(live.innerHTML!==html)live.innerHTML=html;}
  if(p)paintMedia(p,state.result,state.session);
  patchText('part-voltage',Number.isFinite(read?.voltage)?read.voltage.toFixed(3)+' V':'—');
  patchText('part-current',Number.isFinite(read?.current)?(read.current*1000).toFixed(3)+' mA':'—');
  patchText('part-power',Number.isFinite(read?.power)?(read.power*1000).toFixed(2)+' mW':'—');
 }
 const endpoint=state.selection?.type==='endpoint'?state.selection.id:state.selection?.type==='wire'?state.project.wires.find(w=>w.id===state.selection.id)?.from:null;
 if(endpoint){
  const prefix=state.selection.type,v=state.result?.voltage(endpoint);
  patchText(prefix+'-voltage',Number.isFinite(v)?v.toFixed(3)+' V':'—');
  patchSignal(prefix+'-signal',v);
  patchText(prefix+'-connected',connectedNet(state.project,endpoint,state.pressed).endpoints.length);
 }
 patchText('sim-time',(state.simTime/1000).toFixed(3)+' s');
 patchText('sim-current',state.result&&!state.result.fault?(state.result.current*1000).toFixed(2)+' mA':'—');
 patchText('warning-count',state.result?.warnings.length?`확인 ${state.result.warnings.length}건`:running()?'연결 상태 정상':'정지 상태');
}
export function renderConnections(){
 const endpoint=state.selection?.type==='endpoint'?state.selection.id:state.selection?.type==='wire'?state.project.wires.find(w=>w.id===state.selection.id)?.from:null;
 const net=endpoint?connectedNet(state.project,endpoint,state.pressed):null;
 $('net-layer').innerHTML=net?net.wires.map(w=>`<path d="${roundedWirePath(wirePoints(state.project,w))}" fill="none" stroke="#e8b843" stroke-width="8" opacity=".45"/>`).join('')+net.endpoints.map(p=>`<circle data-net-endpoint="${p.id}" cx="${p.x}" cy="${p.y}" r="7" fill="#ffcf4233" stroke="#c28b14" stroke-width="1.5"/>`).join(''):'';
 const wire=state.selection?.type==='wire'?state.project.wires.find(w=>w.id===state.selection.id):null;
 const handleRadius=7/(svg.getScreenCTM()?.a||1);
 $('wire-handle-layer').innerHTML=!running()&&wire?(wire.points||[]).map((p,i)=>`<circle data-wire-point="${i}" data-owner-wire="${wire.id}" cx="${p.x}" cy="${p.y}" r="${handleRadius}" fill="${state.drag?.type==='wire-point'&&state.drag.index===i?'#f1cd6d':'#fffdf4'}" stroke="#937338" stroke-width="2" vector-effect="non-scaling-stroke" tabindex="0" role="button" aria-label="배선 꺾임점 ${i+1}; 끌어서 이동, 우클릭으로 삭제"><title>꺾임점 ${i+1} · 끌어서 이동 · 우클릭 삭제</title></circle>`).join(''):'';
}
export function focusIssue(target){
 if(!target){pinout.open();return;}
 if(target.type==='code'){state.sourceFile=target.file;syncEditor();layout.reveal('code');state.ide?.editor?.goto?.(target.line);return;}
 state.pending=null;state.mode='select';state.selection=target;const p=target.type==='endpoint'?endpointInfo(target.id,state.project.components,state.project.surfaces):state.project.components.find(p=>p.id===target.id);
 if(p){state.view={x:p.x-310,y:p.y-202,w:620,h:620*730/1120};viewUpdate();}inspectTab();refresh();svg.focus({preventScroll:true});
}
export function renderIssues(force=false){
 if(!force&&performance.now()-state.issuesStamp<250)return;state.issuesStamp=performance.now();
 const issues=circuitDiagnostics(state.project,state.result,state.pressed),key=JSON.stringify(issues);
 // While running, a pin over its voltage rating is also said once per run in the output tab.
 if(running())for(const issue of issues)if(issue.id.startsWith('overvoltage:')&&!(state.overvoltageLogged??=new Set()).has(issue.id)){state.overvoltageLogged.add(issue.id);log('핀 과전압: '+issue.message,'error');}
 if(key===state.issuesKey)return;state.issuesKey=key;
 $('circuit-issues').innerHTML=issues.length?issues.map((issue,i)=>`<button class="circuit-issue ${issue.severity}" data-issue="${i}" ${!issue.target&&running()?'disabled':''}><span>${issue.severity==='error'?'!':'·'}</span>${esc(issue.message)}<b>위치 보기 ↗</b></button>`).join(''):'<p class="issues-clear">현재 연결 검사에서 발견한 문제가 없습니다. 실행 중 전압·전류 검사도 함께 표시됩니다.</p>';
 $('circuit-issues').querySelectorAll('[data-issue]').forEach(b=>b.onclick=()=>focusIssue(issues[Number(b.dataset.issue)].target));
 document.querySelector('[data-monitor="issues"]').textContent='문제'+(issues.length?` (${issues.length})`:'');
}
export async function onSoundClick(){state.audioEnabled=!state.audioEnabled;if(state.audioEnabled&&!state.audioContext){state.audioContext=new AudioContext();state.buzzerAudio=new BuzzerAudio(state.audioContext);}if(state.audioEnabled)await state.audioContext.resume();$('sound').textContent=state.audioEnabled?'소리 켜짐':'소리 꺼짐';$('sound').setAttribute('aria-pressed',String(state.audioEnabled));updateAudio();}
