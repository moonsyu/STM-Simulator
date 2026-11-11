import {CATALOG_BY_TYPE} from './catalog-defs.js';
import {connectedNet} from './circuit-edit.js';
import {PIN_BY_ID,endpointInfo,breadboardModel} from './pins.js';
import {WIRE_COLORS,terminalKeys,attachments} from './components.js';
import {partControls,partReadouts} from './part-controls.js';
import {validateProject} from './project.js';
import {projectBoard} from './boards.js';
import {devboardModel,devboardPinInfo,boardFileKey} from './devboards.js';
import {isStm32Board,stm32Boards,mainBoardName} from './stm32-boards.js';
import {mediaSection,bindMedia} from './part-media-ui.js';
import {esc,updateSimulationSvg} from './render.js';
import {hasPythonCode} from './rpi-python.js';
import {$} from './common.js';

/**
 * The right side bar's circuit inspector: what is selected, its values and its controls.
 * `app` is the rest of the application: its current state and the actions on it.
 */
export function setupInspector(app){
 const {running,log,autosave,checkpoint,changed,syncEditor,tab,updateReadouts,copyCircuit,removeSelected,rotateSelected,recompute,setWireColor,editBoard,svg}=app;
 let inspectorKey=null,inspectorModel=null;
// The ST-LINK a board is written through when the circuit runs on real boards (connected boards, or one typed in).
function stlinkField(serial,dis){
 const boards=app.ide?.connectedBoards?.()||[],options=[['','자동 (보드 종류로 찾기)'],...boards.map(b=>[b.serial,`${b.board||'ST-LINK'} · ${b.serial}${b.port?` (${b.port})`:''}`])];
 if(serial&&!boards.some(b=>b.serial===serial))options.push([serial,`${serial} (연결 안 됨)`]);
 return `<label for="board-stlink">실물 기록 ST-LINK</label><select id="board-stlink" ${dis}>${options.map(([v,l])=>`<option value="${esc(v)}" ${v===(serial||'')?'selected':''}>${esc(l)}</option>`).join('')}</select>`;
}
function bindStlink(apply){const el=$('board-stlink');if(el)el.onchange=e=>apply(e.target.value);}
function inspector(force=false){
 const el=$('inspector'),selected=app.selection?.type==='part'?app.project.components.find(p=>p.id===app.selection.id):app.selection?.type==='wire'?app.project.wires.find(w=>w.id===app.selection.id):app.selection?.type==='endpoint'?endpointInfo(app.selection.id,app.project.components,app.project.surfaces):null;
 const key=JSON.stringify([app.selection,selected,running(),app.selection?.type==='surface'?app.project.surfaces?.[app.selection.id]?.rotation??0:0]);
 if(!force&&key===inspectorKey&&(!['part','wire'].includes(app.selection?.type)||selected===inspectorModel))return;
 inspectorKey=key;inspectorModel=selected;
 if(!app.selection){el.innerHTML='<span class="overline">CIRCUIT INSPECTOR</span><h2>회로 살펴보기</h2><div class="empty-inspector">핀, 배선 또는 부품을 선택하세요.<br>실행 중 전압과 전류를 확인할 수 있습니다.</div>';return;}
 if(app.selection.type==='group'){el.innerHTML=`<span class="overline">MULTIPLE SELECTION</span><h2>여러 항목 선택</h2><p>부품 ${app.selection.parts.length}개 · 배선 ${app.selection.wires.length}개</p><p>Shift+클릭 또는 Shift+빈 공간 드래그로 선택을 추가합니다. Ctrl+A: 전체 선택 · Ctrl+D: 복제 · Ctrl+C/V: 복사/붙여넣기 · Esc: 선택 삭제.</p><button id="copy-group" class="inspector-action">선택 복사</button><button id="remove-group" class="inspector-action danger" ${running()?'disabled':''}>선택 삭제</button>`;$('copy-group').onclick=copyCircuit;$('remove-group').onclick=removeSelected;return;}
 if(app.selection.type==='surface'){
   if(app.selection.id==='board'&&stm32Boards(app.project).length){
    const dis=running()?'disabled':'';
    el.innerHTML=`<span class="overline">STM32 · 편집 중</span><h2 title="${esc(mainBoardName(app.project))}">${esc(mainBoardName(app.project))}</h2><p>${esc(projectBoard(app.project).name)} · 지금 편집기·핀 설정·빌드·디버그가 이 보드를 대상으로 합니다.</p><div class="inspector-card"><label for="part-name">보드 이름</label><input id="part-name" value="${esc(mainBoardName(app.project))}" maxlength="40" ${dis}>${stlinkField(app.project.surfaces.board.stlink,dis)}</div><div class="measure"><span>방향</span><b id="board-rotation">${app.project.surfaces.board.rotation??0}°</b></div><p>실행하면 회로의 STM32 보드가 모두 함께 실행됩니다. 실물 보드 실행은 보드마다 빌드해 각자의 ST-LINK에 차례로 기록합니다.</p><button class="inspector-action" id="rotate-part" ${dis}>90° 회전 (R)</button><button class="inspector-action" id="inspect-open-docs">장치 Docs · 배선/예제 보기</button>`;
    $('inspect-open-docs').onclick=()=>tab('docs');$('rotate-part').onclick=rotateSelected;
    $('part-name').onchange=e=>{const name=e.target.value.trim();if(!name||app.project.components.some(c=>c.name===name)){log('보드 이름이 비었거나 다른 부품·보드 이름과 같습니다.','error');inspector(true);return;}checkpoint();app.project.surfaces.board.name=name;syncEditor();changed();};
    bindStlink(value=>{checkpoint();if(value)app.project.surfaces.board.stlink=value;else delete app.project.surfaces.board.stlink;changed();});return;
   }
   el.innerHTML=`<h2>${app.selection.id==='board'?'STM32 보드':'기본 빵판'}</h2><p>몸체를 끌어 이동하세요. 드래그 중 Esc를 누르면 취소합니다. 연결된 핀·배선과 장착 부품도 함께 이동합니다.</p>${app.selection.id==='board'?`<div class="measure"><span>방향</span><b id="board-rotation">${app.project.surfaces?.board?.rotation??0}°</b></div><button class="inspector-action" id="rotate-part" ${running()?'disabled':''}>90° 회전 (R)</button>`:''}<button class="inspector-action" id="inspect-open-docs">장치 Docs · 배선/예제 보기</button>`;
   $('inspect-open-docs').onclick=()=>tab('docs');if($('rotate-part'))$('rotate-part').onclick=rotateSelected;
 } else if(app.selection.type==='endpoint'){
   const e=endpointInfo(app.selection.id,app.project.components,app.project.surfaces),pin=PIN_BY_ID.get(app.selection.id),boardPin=devboardPinInfo(app.selection.id,app.project.components);
   const connected=connectedNet(app.project,app.selection.id,app.pressed).endpoints.length;
   el.innerHTML=`<span class="overline">CONNECTION POINT</span><h2 title="${esc(e?.label||app.selection.id)}">${esc(e?.label||app.selection.id)}</h2><p>${pin?esc(pin.signal==='NC'?'연결되지 않은 NC 핀':`신호: ${pin.signal}`):boardPin?esc(`신호: ${boardPin.signal}`):'빵판의 실제 연결 그룹을 기준으로 계산합니다.'}</p>${boardPin?.notes?.length?`<ul class="pin-notes">${boardPin.notes.map(n=>`<li class="${n.warn?'warn':''}">${n.warn?'⚠ ':''}${esc(n.text)}</li>`).join('')}</ul>`:''}<div class="measure"><span>전압 · GND 기준</span><span class="measure-value"><b id="endpoint-voltage">—</b><span id="endpoint-signal" class="signal-badge" data-signal="idle">미측정</span></span></div><div class="measure"><span>연결된 핀 / 구멍</span><b id="endpoint-connected">${connected}</b></div><p>${running()?'전압이 표시되지 않으면 부유 상태이거나 전원에 연결되지 않은 노드입니다.':'시뮬레이션을 실행하면 연결점의 전압을 확인할 수 있습니다.'}</p>`;
 } else if(app.selection.type==='part'){
   const p=app.project.components.find(p=>p.id===app.selection.id);if(!p)return;
   if(p.type==='breadboard'){
    el.innerHTML=`<span class="overline">BREADBOARD</span><h2 title="${esc(p.name)}">${esc(p.name)}</h2><p>${breadboardModel(p).label} · A–E / F–J 행과 전원 레일은 각각 연결됩니다. 다른 빵판과는 배선으로 연결해야 합니다.</p><div class="inspector-card"><label for="part-name">빵판 이름</label><input id="part-name" value="${esc(p.name)}" maxlength="80" ${running()?'disabled':''}></div><p>테두리를 끌어 이동하세요. 장착한 부품과 배선도 함께 이동합니다. 삭제하면 구멍에 연결된 배선과 장착 연결이 해제되며 다른 부품은 남습니다.</p><div class="measure"><span>회전 각도</span><b>${p.rotation}°</b></div><button class="inspector-action" id="inspect-open-docs">장치 Docs · 배선/예제 보기</button><button class="inspector-action" id="rotate-part" ${running()?'disabled':''}>45° 회전 (R)</button><button class="inspector-action danger" id="remove-part" ${running()?'disabled':''}>빵판 삭제</button>`;
    $('part-name').onchange=e=>{checkpoint();p.name=e.target.value.trim()||p.name;changed();};$('inspect-open-docs').onclick=()=>tab('docs');$('rotate-part').onclick=rotateSelected;$('remove-part').onclick=removeSelected;return;
   }
   if(isStm32Board(p)){
    const model=devboardModel(p),dis=running()?'disabled':'';
    el.innerHTML=`<span class="overline">STM32</span><h2 title="${esc(p.name)}">${esc(p.name)}</h2><p>${esc(model.name)} · ${esc(model.description)}</p><div class="inspector-card"><label for="part-name">보드 이름</label><input id="part-name" value="${esc(p.name)}" maxlength="40" ${dis}>${stlinkField(p.stlink,dis)}</div><div class="measure"><span>코드</span><b>main.c · ${p.firmware?.mode==='hal'?'HAL':'스케치'}${p.firmware?.files?.length?` · 소스 ${p.firmware.files.length+1}개`:''}</b></div><p>이 보드의 main.c·핀 설정·소스는 보드에 따로 저장됩니다. 편집하면 이 보드가 편집 대상이 되고, 지금 편집 중인 ${esc(mainBoardName(app.project))}는 이 자리에 그대로 남습니다.</p><div class="measure"><span>방향</span><b id="board-rotation">${p.rotation}°</b></div><button class="inspector-action" id="edit-board" ${dis}>이 보드 편집 · 코드와 핀 설정</button><button class="inspector-action" id="rotate-part" ${dis}>90° 회전 (R)</button><button class="inspector-action" id="inspect-open-docs">장치 Docs · 핀 표</button><button class="inspector-action danger" id="remove-part" ${dis}>보드 삭제</button>`;
    $('part-name').onchange=e=>{const name=e.target.value.trim();if(!name||name===mainBoardName(app.project)||app.project.components.some(c=>c!==p&&c.name===name)){log('보드 이름이 비었거나 다른 부품·보드 이름과 같습니다.','error');inspector(true);return;}checkpoint();p.name=name;syncEditor();changed();};
    $('edit-board').onclick=()=>{if(editBoard(p.id))tab('code');};$('inspect-open-docs').onclick=()=>tab('docs');$('rotate-part').onclick=rotateSelected;$('remove-part').onclick=removeSelected;
    bindStlink(value=>{checkpoint();if(value)p.stlink=value;else delete p.stlink;changed();});return;
   }
   if(p.type==='devboard'){
    const model=devboardModel(p),dis=running()?'disabled':'';
    el.innerHTML=`<span class="overline">${model.kind==='rpi'?'RASPBERRY PI':'ESP32'}</span><h2 title="${esc(p.name)}">${esc(p.name)}</h2><p>${esc(model.name)} · ${esc(model.description)}</p>${model.unverified?`<p class="pin-check">⚠ ${esc(model.unverified)}</p>`:''}<div class="inspector-card"><label for="part-name">보드 이름</label><input id="part-name" value="${esc(p.name)}" maxlength="40" ${dis}></div><div class="measure"><span>실행 방식</span><b>${model.kind==='esp32'?'스케치 실행':hasPythonCode(p.code)?'main.py 실행 (Python)':p.scenario?'고정 실행 · 커널 모듈':'실행 안 함'}</b></div><p>${model.kind==='esp32'?'sketch.ino를 실행할 때 해석해 STM32와 같은 회로·시간축에서 동작합니다.':hasPythonCode(p.code)?'main.py를 Python으로 해석해 STM32와 같은 회로·시간축에서 실행합니다(gpiozero·RPi.GPIO). 코드를 고치면 동작도 바뀝니다.':p.scenario?'코드를 빌드·실행하지 않고 예제 시나리오대로 핀이 바뀝니다. 배선이 틀리면 실제처럼 동작하지 않습니다.':'강의 예제에서 불러온 라즈베리파이만 고정 실행합니다. 이 보드의 핀은 입력 상태로 두고 전압만 계산합니다.'}</p><button class="inspector-action" id="open-board-code">${esc(model.file)} 열기</button><div class="measure"><span>회전 각도</span><b>${p.rotation}°</b></div><button class="inspector-action" id="rotate-part" ${dis}>90° 회전 (R)</button><button class="inspector-action danger" id="remove-part" ${dis}>보드 삭제</button>`;
    $('part-name').onchange=e=>{const name=e.target.value.trim();if(!name||app.project.components.some(c=>c!==p&&c.name===name)){log('보드 이름이 비었거나 다른 부품·보드 이름과 같습니다.','error');inspector(true);return;}checkpoint();p.name=name;syncEditor();changed();};
    $('open-board-code').onclick=()=>{app.sourceFile=boardFileKey(p);syncEditor();tab('code');};$('rotate-part').onclick=rotateSelected;$('remove-part').onclick=removeSelected;return;
   }
   const read=app.result?.parts[p.id],mounted=Object.keys(attachments(p)).length;
   el.innerHTML=`<span class="overline" title="${esc(p.type)}">${esc(CATALOG_BY_TYPE[p.type]?.interface||p.type.toUpperCase())}</span><h2 title="${esc(p.name)}">${esc(p.name)}</h2><p>${mounted?`${mounted} / ${terminalKeys(p).length}개 다리 장착`:'자유 배치 · 끌어서 빵판에 놓으세요.'}</p><div class="inspector-card"><label for="part-name">부품 이름</label><input id="part-name" value="${esc(p.name)}" maxlength="80" ${running()?'disabled':''}>${p.type==='resistor'?`<label for="part-value">저항 (Ω)</label><input id="part-value" type="number" value="${p.value}" min="1" max="10000000" ${running()?'disabled':''}>`:''}${p.type==='led'?`<label for="part-color">LED 색상</label><select id="part-color" ${running()?'disabled':''}>${[['red','빨강'],['green','초록'],['blue','파랑'],['yellow','노랑']].map(([v,l])=>`<option value="${v}" ${p.color===v?'selected':''}>${l}</option>`).join('')}</select>`:''}</div>${partControls(p,running())}${mediaSection(p,running())}<div class="measure"><span>부품 전압</span><b id="part-voltage">${read?read.voltage.toFixed(3)+' V':'—'}</b></div><div class="measure"><span>전류</span><b id="part-current">${read?(read.current*1000).toFixed(3)+' mA':'—'}</b></div>${p.type==='resistor'?`<div class="measure"><span>소비 전력</span><b id="part-power">${read?(read.power*1000).toFixed(2)+' mW':'—'}</b></div>`:''}${p.type==='button'?'<p>실행 중 버튼 몸체를 누르고 계시면 연결되고 손을 떼면 끊어집니다. A1–A2, B1–B2는 항상 연결되며, 누르면 양쪽이 연결됩니다.</p>':''}${p.type==='lcd'?'<p>LCD 1602의 4/8비트 명령·문자 출력을 지원합니다. VDD 5 V, VSS·R/W·VO를 GND에 연결하고 RS/E/DATA 핀을 배선하세요. 기존 스케치의 LiquidCrystal API를 사용할 수 있습니다.</p>':''}<div class="measure"><span>회전 각도</span><b>${Number(p.rotation.toFixed(1))}°</b></div><button class="inspector-action" id="inspect-open-docs">장치 Docs · 배선/예제 보기</button><button class="inspector-action" id="rotate-part" ${running()?'disabled':''}>45° 회전 (R)</button><button class="inspector-action danger" id="remove-part" ${running()?'disabled':''}>부품 삭제</button>`;
   $('part-name').onchange=e=>{checkpoint();p.name=e.target.value.trim()||p.name;changed();};
   if($('part-value'))$('part-value').onchange=e=>{const n=Number(e.target.value);if(!Number.isFinite(n)||n<1||n>1e7){log('저항 범위: 1 Ω~10 MΩ','error');inspector(true);updateReadouts();return;}checkpoint();p.value=n;changed();};
   if($('part-color'))$('part-color').onchange=e=>{checkpoint();p.color=e.target.value;changed();};
   if($('part-live'))$('part-live').innerHTML=partReadouts(p,app.result);
   el.querySelectorAll('[data-part-prop]').forEach(input=>{input.oninput=()=>{if(running()&&input.dataset.live!=='true')return;const key=input.dataset.partProp,n=key==='color'?input.value:Number(input.value);if(key==='color'){if(!['red','green','blue','yellow'].includes(n))return;checkpoint();p.color=n;changed();return;}if(!Number.isFinite(n)||(input.min!==undefined&&input.min!==''&&n<Number(input.min))||(input.max!==undefined&&input.max!==''&&n>Number(input.max)))return;if((['switch','motion'].includes(key)||p.type==='encoder'&&key==='position')&&!Number.isInteger(n))return;
    // Only values the app.project loader accepts are stored (an I²C address of 80.5 would make the saved app.project unloadable).
    try{validateProject({...app.project,components:app.project.components.map(c=>c===p?{...p,[key]:n}:c)});}catch{return;}if(!input.dataset.checkpoint){checkpoint();input.dataset.checkpoint='1';}p[key]=n;if($('output-'+key))$('output-'+key).textContent=input.type==='range'?n:'';autosave();if(running())recompute();updateSimulationSvg(svg,app.project,app.result,app.pressed);updateReadouts();};input.onchange=()=>{delete input.dataset.checkpoint;
    // A value outside the allowed range is not applied: show the stored value again and say the range.
    const key=input.dataset.partProp;if(key!=='color'&&String(p[key]??'')!==input.value&&input.type!=='range'){const range=input.min!==''&&input.max!==''?` (${input.min}~${input.max})`:'';log(`${(input.labels?.[0]??input.closest('label'))?.firstChild?.textContent?.trim()||key}: 허용 범위${range}의 값을 입력하세요${['address','baud'].includes(key)?' (정수)':''}.`,'error');input.value=p[key]??'';}};});
   $('inspect-open-docs').onclick=()=>tab('docs');$('remove-part').onclick=removeSelected;$('rotate-part').onclick=rotateSelected;
   bindMedia(p,{running:running(),checkpoint,changed,getSession:()=>app.session,log});
 } else if(app.selection.type==='wire'){
   const w=app.project.wires.find(w=>w.id===app.selection.id);if(!w)return;
   const connected=connectedNet(app.project,w.from,app.pressed).endpoints.length;
   el.innerHTML=`<span class="overline">WIRE</span><h2>점퍼선</h2><div class="inspector-card wire-terminals"><label>시작</label><p title="${esc(endpointInfo(w.from,app.project.components,app.project.surfaces)?.label)}">${esc(endpointInfo(w.from,app.project.components,app.project.surfaces)?.label)}</p><label>끝</label><p title="${esc(endpointInfo(w.to,app.project.components,app.project.surfaces)?.label)}">${esc(endpointInfo(w.to,app.project.components,app.project.surfaces)?.label)}</p></div><div class="measure"><span>전압 · GND 기준</span><span class="measure-value"><b id="wire-voltage">—</b><span id="wire-signal" class="signal-badge" data-signal="idle">미측정</span></span></div><div class="measure"><span>연결된 핀 / 구멍</span><b id="wire-connected">${connected}</b></div><div class="inspector-card"><span>배선 색상</span><div class="wire-colors" role="group" aria-label="선택한 배선 색상">${WIRE_COLORS.map(([value,name])=>`<button type="button" class="swatch ${value===w.color?'active':''}" data-wire-color="${value}" style="--swatch:${value}" title="${name} 배선" aria-label="${name} 배선" aria-pressed="${value===w.color}" ${running()?'disabled':''}></button>`).join('')}</div></div><p>전기 저항이 없는 이상적인 도선으로 계산합니다. 선이 교차하는 위치는 서로 연결되지 않습니다. 선택한 배선과 전기적으로 이어진 연결망을 금색으로 표시합니다.</p><p>배선을 더블클릭해 꺾임점을 추가하고 점을 끌어 이동하세요. 점 우클릭은 삭제입니다.</p><button class="inspector-action" id="reset-wire-route" ${running()?'disabled':''}>배선 경로 자동 정렬</button><button class="inspector-action danger" id="remove-wire" ${running()?'disabled':''}>배선 삭제</button>`;
   $('remove-wire').onclick=removeSelected;$('reset-wire-route').onclick=()=>{if(running())return;checkpoint();delete w.points;changed();};
   el.querySelectorAll('[data-wire-color]').forEach(button=>button.onclick=()=>{if(running())return;setWireColor(button.dataset.wireColor);});
 }
}
 return inspector;
}
