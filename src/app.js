// Start-up of the app: the shell, the panels and their wiring to the feature modules (app-core, app-view, app-canvas,
// app-circuit, app-editor, app-examples, app-files, app-run, app-keyboard). The shared state lives in app-state.js.
import './popout.js'; // must run before the modules below register listeners and look up elements
import {keyFor,withKey} from './keybindings.js';
import {showSurface} from './surfaces.js';
import {CATALOG_BY_TYPE} from './catalog-defs.js';
import {moveSurface} from './surface-move.js';
import {loadPreferences} from './ide-preferences.js';
import {WireDraft} from './wire-draft.js';
import {setupFeedback} from './ui-feedback.js';
import {setupTabAccessibility} from './tab-accessibility.js';
import {setupCanvasKeyboard} from './canvas-keyboard.js';
import {setupDeviceDocs} from './device-docs-ui.js';
import {applyDeviceExample} from './device-assistance.js';
import {createDiagnostics} from './diagnostics.js';
import {selectedIds,wirePoints,insertWirePoint,moveSelection,mountSelection} from './circuit-edit.js';
import {endpointInfo,searchPins} from './pins.js';
import {WIRE_COLORS,attachments} from './components.js';
import {Monitor} from './monitor.js';
import {startProject,validateProject,projectForBoard} from './project.js';
import {projectBoard} from './boards.js';
import {isBreadboardLibraryType,newBreadboardFields} from './breadboards.js';
import {DEVBOARD_MODELS,boardForFile} from './devboards.js';
import {stm32Boards,mainBoardName,stm32View} from './stm32-boards.js';

import {setupBoardPicker} from './board-picker.js';
import {PinoutPanel} from './pinout-ui.js';
import {defaultMcu} from './mcu-config.js';
import {compileHal} from './hal-source.js';
import {compile} from './parser.js';
import {allHalExamples,allHalGuides} from './hal-examples.js';
export const HAL_EXAMPLES=allHalExamples(),HAL_GUIDES=allHalGuides();
import {createShell} from './shell.js';
import {setupUpdateLog} from './update-log-ui.js';
import {setupLogicAnalyzer} from './logic-analyzer.js';
import {RaPinoutPanel} from './ra-pinout-ui.js';
import {setupVariableGraph} from './variable-graph-ui.js';
import {mountIdeChrome,setupIde} from './ide-ui.js';
import {setupUpdates} from './update-ui.js';
import {setupIdeSettings} from './ide-settings-ui.js';

import {surfaceOrigin} from './geometry.js';
import {setupEditorSearch} from './editor-search.js';
import {PART_LIBRARY} from './part-library.js';
import {setupPartPreviews} from './part-preview-ui.js';
import {setupExamplePreviews} from './example-preview-ui.js';
import {esc,initSvg,updateSimulationSvg} from './render.js';
import {setupInspector} from './inspector.js';
import {$} from './common.js';
import {state} from './app-state.js';
import {running,log,flushAutosave,autosave,checkpoint,changed,setMode,tab,inspectTab,editUndo} from './app-core.js';
import {filterParts,filterExamples,replaceProject,requestReplace,onHalExampleChange} from './app-examples.js';
import {setupFileDrop} from './file-drop.js';
import {syncEditor,replaceCodeText,applyFirmware,editBoard,onCodeInput,onCodeResetConfirmClick,onFirmwareFilesChange} from './app-editor.js';
import {save,open,onFileInputChange,onMainExportClick} from './app-files.js';
import {refresh,updateReadouts,onSoundClick} from './app-view.js';
import {copyCircuit,removeSelected,rotateSelected,addPart,freeSpot,addDevboard,setWireColor,onBoardResetConfirmClick} from './app-circuit.js';
import {clickEndpoint,point,viewUpdate,release,zoom,fitView,pinSearch,focusPin,onSvgDblclick,onSvgPointermove,onSvgPointerdown,onSvgContextmenu} from './app-canvas.js';
import {recompute,updateRunScope,initializeRuntime,resetBoard,recordSimulation,resetRuntime,stop,cancelStart,startRun,ensureFirmware,openElf,debugCommand,runCommand,shellDebugCommand} from './app-run.js';
import {onWindowKeydown} from './app-keyboard.js';

export const svg=$('circuit');
mountIdeChrome();export const layout=createShell();state.ide=null;state.deviceDocs=null;state.canvasKeys=null;
export const feedback=setupFeedback({showLog:()=>{layout.reveal('terminal');document.querySelector('[data-monitor="log"]').click();}});
export const wireDraft=new WireDraft();
state.carry=null;
export const CARRY_HINT='배선 끝을 옮길 핀 또는 빵판 구멍을 클릭하세요. 같은 끝을 다시 누르거나 Esc: 취소';
state.project=startProject();state.mode='select';state.pending=null;state.selection=null;state.color='#23a68a';state.status='stopped';state.result=null;state.runtime=null;state.simTime=0;state.pressed={};state.undoStack=[];state.redoStack=[];state.dirty=false;state.starting=false;state.startToken=0;state.firmware=null;
state.view={x:0,y:0,w:1120,h:730};state.drag=null;state.lastWarnings='';state.replaceAction=null;state.saveTimer=undefined;state.searchSelectedId=null;state.breadboardKey='';state.devboardKey='';
// A saved project that no longer validates is kept aside (not overwritten by the blank one) and reported once the log exists.
state.restoreError='';try{const cached=localStorage.getItem('stm32lab.project.v2')||localStorage.getItem('stm32lab.project.v1');if(cached)try{state.project=validateProject(JSON.parse(cached));}catch(e){state.restoreError=e.message;localStorage.setItem('stm32lab.project.recovery',cached);}}catch{}
export const diagnostic=createDiagnostics(window.localDiagnostics?.record,()=>state.project);
initSvg(svg);
state.session=null;state.audioEnabled=false;state.audioContext=undefined;state.buzzerAudio=undefined;
export const monitor=new Monitor({getSession:()=>state.session,isRunning:()=>running(),onSettings:settings=>{if(running())return;checkpoint();state.project.simulation=settings;autosave();},onError:message=>log(message,'error')});
// The open source tab survives a relaunch (syncEditor falls back to main.c when the file is gone).
export const SOURCE_KEY='stm32lab.sourceFile.v1';
state.sourceFile=(()=>{try{return localStorage.getItem(SOURCE_KEY)||'main.c';}catch{return 'main.c';}})();state.circuitClipboard=null;state.clipboardOffset=28;state.issuesStamp=0;state.issuesKey='';
export const pinout=new PinoutPanel({getProject:()=>state.project,isRunning:running,onError:message=>log(message,'error'),apply:({mcu,code,moved=[]})=>{checkpoint();state.project.mcu=mcu;if(code!==null){state.project.code=code;/* The project's other source files stay (main.c alone is generated). */state.project.firmware={mode:'hal',files:state.project.firmware?.mode==='hal'?state.project.firmware.files||[]:[]};state.sourceFile='main.c';}syncEditor();changed();log(code===null?'핀 설정을 적용했습니다.':'설정에 맞는 HAL main.c를 생성했습니다.');if(moved.length)log('USER CODE 구역 밖에 있던 코드를 구역 안으로 옮겨 유지했습니다: '+moved.join(', '),'warning');}});
pinout.ra=new RaPinoutPanel({getProject:()=>state.project,isRunning:running,onError:message=>log(message,'error'),apply:({mcu})=>{checkpoint();state.project.mcu=mcu;changed();state.ide?.invalidate?.();log('핀 설정을 적용했습니다. 다음 빌드의 ra_gen·bsp_pin_cfg.h에 반영됩니다.');}});
export const updateBoardPicker=setupBoardPicker({getProject:()=>state.project,isRunning:running,onSelect:id=>{state.sourceFile='main.c';replaceProject(projectForBoard(id));log('선택한 보드의 기본 회로로 시작합니다.');}});
export const editorSearch=setupEditorSearch({applyEdit:replaceCodeText,maxLength:()=>{
 const otherFiles=(state.project.firmware?.files||[]).filter(f=>f.name!==state.sourceFile).reduce((n,f)=>n+f.text.length,0);
 return state.sourceFile==='main.c'?300000-otherFiles:300000-state.project.code.length-otherFiles;
}});
svg.addEventListener('contextmenu',onSvgContextmenu);
$('part-list').innerHTML=PART_LIBRARY.map(part=>`<button class="part-card" data-add="${part.type}"><span class="part-icon ${part.iconClass}">${part.icon}</span><span><strong title="${esc(part.name)}">${esc(part.name)}</strong><small title="${esc(part.hint)}">${esc(part.hint)}</small></span><b>+</b></button>`).join('')+'<p id="part-no-results" hidden>검색 결과가 없습니다.<br>다른 이름으로 검색해 주세요.</p>';
setupPartPreviews();setupExamplePreviews({getBoardId:()=>projectBoard(state.project).id});
export const inspector=setupInspector({
 get project(){return state.project;},get selection(){return state.selection;},get result(){return state.result;},get pressed(){return state.pressed;},get session(){return state.session;},get ide(){return state.ide;},set sourceFile(value){state.sourceFile=value;},
 running,log,autosave,checkpoint,changed,syncEditor,tab,updateReadouts,copyCircuit,removeSelected,rotateSelected,recompute,setWireColor,editBoard,svg
});
$('part-search').addEventListener('input',filterParts);filterParts();
// Lecture circuits (ESP32 / Raspberry Pi) come first in the example list: value `lecture:<id>`, tag 강의 실습.
// Examples are grouped by board (Raspberry Pi, STM32, ESP32); one that uses several kinds of board is listed in each
// of their groups. The board filter above the list keeps one group (or all of them).
state.exampleBoard='all';try{state.exampleBoard=localStorage.getItem('stm-simulator.example-board')||'all';}catch{}
document.querySelectorAll('[data-example-board]').forEach(button=>button.addEventListener('click',()=>{state.exampleBoard=button.dataset.exampleBoard;try{localStorage.setItem('stm-simulator.example-board',state.exampleBoard);}catch{}filterExamples();}));
$('hal-example-search').oninput=filterExamples;filterExamples();
export const uartLines=new Map();
window.addEventListener('beforeunload',event=>{try{flushAutosave();}catch{log('자동 저장에 실패했습니다. 파일로 저장한 뒤 종료해 주세요.','error');if(state.dirty){event.preventDefault();event.returnValue=false;}}});
$('sound').onclick=onSoundClick;
svg.addEventListener('pointerdown',onSvgPointerdown);
svg.addEventListener('pointermove',onSvgPointermove);
svg.addEventListener('dblclick',onSvgDblclick);
svg.addEventListener('contextmenu',e=>{const hit=e.target.closest('[data-wire-point]');if(!hit||running())return;e.preventDefault();checkpoint();state.project.wires.find(w=>w.id===hit.dataset.ownerWire).points.splice(Number(hit.dataset.wirePoint),1);changed();});
svg.addEventListener('pointerup',release);svg.addEventListener('pointercancel',release);window.addEventListener('blur',()=>{if(['surface','marquee'].includes(state.drag?.type))release({type:'pointercancel'});if(Object.values(state.pressed).some(Boolean)){state.pressed={};recompute();refresh();}});
window.addEventListener('keydown',e=>{if(e.key==='Escape'&&['surface','marquee'].includes(state.drag?.type)){e.preventDefault();e.stopImmediatePropagation();release({type:'pointercancel'});}},true);
svg.addEventListener('pointerleave',()=>{$('tooltip').hidden=true;});
svg.addEventListener('wheel',e=>{e.preventDefault();if(!e.deltaY)return;const step=e.ctrlKey?1.04:1.08;zoom(e.deltaY>0?step:1/step,point(e));},{passive:false});
$('zoom-in').onclick=()=>zoom(1/1.2);$('zoom-out').onclick=()=>zoom(1.2);$('zoom-reset').onclick=fitView;
$('pin-search').addEventListener('input',()=>{state.searchSelectedId=null;pinSearch();});
$('pin-search').addEventListener('keydown',e=>{if(e.key==='Enter'){const p=searchPins(e.target.value)[0];if(p)focusPin(p.id);}if(e.key==='Escape'){e.stopPropagation();e.target.value='';state.searchSelectedId=null;pinSearch();}});
// ESP32 / Raspberry Pi boards run with the STM32 by default. Choosing one board (or a circuit without the STM32 board)
// runs only the boards' fixed-run scenarios; the STM32 then runs an empty program so its pins stay inputs.
export const BOARD_ONLY_PROGRAM='void setup() {}\nvoid loop() { delay(1000); }';
export const runScope=()=>{const value=$('run-scope')?.value||'all';return value==='all'||value==='stm32'||state.project.components.some(p=>p.type==='devboard'&&p.id===value)?value:'all';};
export const boardOnlyRun=()=>state.project.components.some(p=>p.type==='devboard')&&(!!state.project.surfaces?.board?.hidden||!['all','stm32'].includes(runScope()));
setInterval(recordSimulation,2000);
$('run').onclick=()=>{if(state.runtime?.debug.paused){state.runtime.resume();state.simTime=state.runtime.microTime/1000;state.status='running';state.ide?.debugView();refresh();}else if(running())stop();else if(state.starting)cancelStart();else void startRun({debug:!!state.ide?.breakpoints().length});};
// The build configuration (Debug -O0 / Release -Os) is part of what the cached ELF was built from.
export const firmwareKey=()=>JSON.stringify([state.project.code,state.project.firmware?.files,state.project.mcu,$('native-config')?.value]);
// Other STM32 boards that run this time, and their ELFs for the emulator (built from each board's own view).
export const runStm32=()=>{const scope=runScope();return scope==='stm32'?[]:stm32Boards(state.project).filter(p=>scope==='all'||scope===p.id);};
state.boardElfs={};state.boardElfKeys={};
$('step').onclick=()=>{if(!state.runtime||state.status==='error'){if(state.ide?.emulator()){void startRun({}).then(ok=>{if(ok){state.status='paused';refresh();}});return;}initializeRuntime();}else {try{state.simTime+=20;state.result=state.session.tick(state.simTime);recompute();}catch(e){state.status='error';log(e.message,'error');}}refresh();};
setInterval(()=>{
 if(state.status!=='running')return;
 try{state.simTime+=20;state.result=state.session.tick(state.simTime);recompute();
   if(state.runtime.debug.paused){state.simTime=state.runtime.microTime/1000;state.status='paused';recordSimulation();diagnostic('debug.paused',{location:state.runtime.location,depth:state.runtime.depth,simulationMs:state.simTime});refresh();state.ide?.debugView();return;}
   if(state.runtime.finished&&state.runtime.debug.enabled){state.status='paused';log('프로그램이 종료되었습니다. 정지 버튼으로 편집을 재개하세요.');refresh();state.ide?.debugView();return;}
   updateSimulationSvg(svg,state.project,state.result,state.pressed);updateReadouts();
   if(state.status==='error')refresh();
 }catch(e){state.result=state.session?.viewResult??state.result;state.status='error';log(e.message,'error');refresh();}
},20);
if($('tool-select'))$('tool-select').onclick=()=>setMode('select');$('delete').onclick=removeSelected;$('rotate').onclick=rotateSelected;$('undo').onclick=()=>editUndo();$('redo').onclick=()=>editUndo(true);
document.querySelectorAll('[data-add]').forEach(b=>b.onclick=()=>{if(running())return;const type=b.dataset.add;if(type==='board'){
 if(state.project.surfaces?.board?.hidden){checkpoint();showSurface(state.project,'board');changed();pinSearch();}
 state.selection={type:'surface',id:'board'};state.pending=null;state.mode='select';inspectTab();fitView();refresh();svg.focus({preventScroll:true});return;
 }if(isBreadboardLibraryType(type)){
 let f;try{f=newBreadboardFields(state.project,type);}catch(e){log(e.message,'error');return;}
 addPart('breadboard',null,null,{x:f.x,y:f.y},f.variant?{variant:f.variant}:{});fitView();svg.focus({preventScroll:true});
}else{addPart(type,null,null,freeSpot(type));svg.focus({preventScroll:true});}});
$('devboard-options').innerHTML=Object.values(DEVBOARD_MODELS).map(m=>`<button class="board-option devboard-option" data-devboard-add="${m.id}"><span class="board-option-icon" aria-hidden="true">${({rpi:'Pi',stm32:'ST'})[m.kind]??'32'}</span><span><strong>${esc(m.name)}</strong><small>${esc(m.description)}</small></span><span class="board-option-action">추가</span></button>`).join('');
$('devboard-options').querySelectorAll('[data-devboard-add]').forEach(b=>b.onclick=()=>addDevboard(b.dataset.devboardAdd));
$('empty-add-board').onclick=()=>document.querySelector('[data-add="board"]')?.click();$('empty-open-parts').onclick=()=>layout.showView('parts');$('empty-open-examples').onclick=()=>layout.showView('examples');
$('wire-palette').innerHTML=WIRE_COLORS.map(([value,name],i)=>`<button data-palette="${i<10?'basic':'pastel'}" data-color="${value}" class="swatch ${value===state.color?'active':''}" style="--swatch:${value}" title="${name} 배선" aria-label="${name} 배선"></button>`).join('');
document.querySelectorAll('[data-color]').forEach(b=>b.onclick=()=>setWireColor(b.dataset.color));
document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>tab(b.dataset.tab));
$('replace-cancel').onclick=()=>{$('replace-dialog').close();state.replaceAction=null;};$('replace-confirm').onclick=()=>{$('replace-dialog').close();state.replaceAction?.();state.replaceAction=null;};
$('hal-example').onchange=onHalExampleChange;
$('new').onclick=()=>requestReplace(()=>replaceProject(startProject()));
$('project-name').onchange=e=>{checkpoint();state.project.name=e.target.value.trim()||'새 회로';changed();};
state.lastCodeCheckpoint=0;state.replaceCheckpoint=false;
$('code').addEventListener('input',onCodeInput);
$('source-file').onchange=e=>{if(e.target.value.startsWith('stm32:')){if(!editBoard(e.target.value.slice(6)))syncEditor();return;}state.sourceFile=e.target.value;syncEditor();};
$('board-reset').onclick=()=>{if(running())return;$('board-reset-error').textContent='';$('board-reset-dialog').showModal();};
$('board-reset-cancel').onclick=()=>$('board-reset-dialog').close();
$('board-reset-confirm').onclick=onBoardResetConfirmClick;
$('code-reset').onclick=()=>{if(running())return;$('code-reset-error').textContent='';$('code-reset-file').textContent=({hal:'main.c',fsp:'hal_entry.c'})[state.project.firmware?.mode]??'main.ino';$('code-reset-dialog').showModal();};
$('code-reset-cancel').onclick=()=>$('code-reset-dialog').close();
$('code-reset-confirm').onclick=onCodeResetConfirmClick;
$('firmware-mode').onchange=e=>{if(running())return;checkpoint();state.project.firmware={mode:e.target.value,files:state.project.firmware?.files||[]};if(e.target.value==='hal')state.project.mcu??=defaultMcu(projectBoard(state.project).mcuFamily);syncEditor();changed();};
$('firmware-check').onclick=()=>{try{if(state.project.firmware?.mode==='hal')compileHal(state.project.code,state.project.firmware.files,state.project.mcu?.family);else compile(state.project.code);log('소스 문법 검사를 통과했습니다.');}catch(e){log(e.message,'error');}};
$('firmware-import').onclick=async()=>{try{if(window.desktop?.importFirmware)applyFirmware(await window.desktop.importFirmware(false));else $('firmware-files').click();}catch(e){log(e.message,'error');}};
$('firmware-folder').hidden=!window.desktop?.importFirmware;
$('firmware-folder').onclick=async()=>{try{applyFirmware(await window.desktop.importFirmware(true));}catch(e){log(e.message,'error');}};
$('firmware-files').onchange=onFirmwareFilesChange;
// Files and folders dropped on the window: a project file opens, an .ioc / main.c set is imported, other sources are added.
setupFileDrop(document,{isRunning:running,getProject:()=>state.project,log,
  open:text=>{replaceProject(validateProject(JSON.parse(text)));log('놓은 프로젝트를 열었습니다.');},
  importFiles:files=>applyFirmware(files),
  addFiles:files=>{checkpoint();const p=state.project;p.firmware??={mode:'sketch',files:[]};for(const f of files){const old=p.firmware.files.find(x=>x.name===f.name);if(old)old.text=f.text;else p.firmware.files.push({name:f.name,text:f.text});}
    state.project=validateProject(p);state.sourceFile=files[0].name;syncEditor();changed();state.ide?.invalidate?.();
    const added=files.filter(f=>!f.replaces).map(f=>f.name),replaced=files.filter(f=>f.replaces).map(f=>f.name);
    log([added.length?'소스에 추가했습니다: '+added.join(', '):'',replaced.length?'같은 이름의 파일을 놓은 내용으로 바꿨습니다: '+replaced.join(', '):''].filter(Boolean).join(' · ')+' (Ctrl+Z로 되돌림)');}});
$('code').addEventListener('scroll',()=>{$('line-numbers').scrollTop=$('code').scrollTop;});
$('code').addEventListener('keydown',e=>{if(e.key==='Tab'){e.preventDefault();if(running())return;const a=e.target.selectionStart,b=e.target.selectionEnd;e.target.setRangeText(' '.repeat(loadPreferences().tabSize),a,b,'end');e.target.dispatchEvent(new Event('input'));}});
$('main-export').onclick=onMainExportClick;
$('save').onclick=save;
$('open').onclick=()=>requestReplace(open);
$('file-input').onchange=onFileInputChange;
$('clear-console').onclick=()=>{$('console-output').textContent='';uartLines.clear();};
$('help').onclick=$('api-help').onclick=()=>$('help-dialog').showModal();
window.addEventListener('keydown',onWindowKeydown);
window.addEventListener('error',e=>log('화면 오류: '+e.message,'error'));
document.addEventListener('ide-undo',e=>editUndo(e.detail));
document.addEventListener('ide-find',e=>{layout.reveal('code');editorSearch.open(e.detail);});
state.ide=setupIde({buildFirmware:()=>ensureFirmware(true).catch(error=>log(error.message,'error')),getProject:()=>state.project,getSource:()=>state.sourceFile,getSession:()=>state.runtime?state.session:null,isRunning:running,isSimulationRunning:()=>state.status==='running'||state.status==='paused',refresh,checkpoint,saveLocal:autosave,layout,log,feedback,requestReplace,replaceProject,debugCommand,
 stm32Runs:()=>[{name:mainBoardName(state.project),text:JSON.stringify(state.project),serial:state.project.surfaces?.board?.stlink||'',main:true},...stm32Boards(state.project).map(p=>({name:p.name,text:JSON.stringify(stm32View(state.project,p.id)),serial:p.stlink||''}))],editBoard,
 selectSource:name=>{if(name!=='main.c'&&!state.project.firmware?.files.some(f=>f.name===name)&&!boardForFile(state.project,name))return;state.sourceFile=name;syncEditor();},
 applySources:(p,file)=>{checkpoint();state.project=validateProject(p);state.sourceFile=file;syncEditor();changed();state.ide.invalidate();}});
// Button titles show the current shortcuts as soon as a binding changes.
// Help text and the palette button show the user's keys too.
const bindingTexts=()=>{for(const el of document.querySelectorAll('[data-binding-key]'))el.textContent=keyFor(el.dataset.bindingKey)||'(키 없음)';$('command-palette-open').title=withKey('명령 팔레트','view.palette');};bindingTexts();
layout.onBindings(()=>{$('debug-start').title=withKey('시작 위치에서 디버깅','run.debug');refresh();state.ide.controls();bindingTexts();});
setupIdeSettings({editor:state.ide.editor,layout,open:()=>tab('settings')});
if(state.restoreError)log(`저장된 프로젝트를 열지 못해 새 회로로 시작합니다 (${state.restoreError}). 이전 내용은 브라우저 저장소 stm32lab.project.recovery에 보관했습니다.`,'error');
state.deviceDocs=setupDeviceDocs({getProject:()=>state.project,getSelection:()=>state.selection,isRunning:running,open:()=>tab('docs'),showSource:file=>{state.sourceFile=file;syncEditor();tab('code');},apply:(target,options)=>{
 if(running())throw new Error('실행을 정지한 뒤 적용하세요.');
 let applied;try{applied=applyDeviceExample(state.project,target,options);}catch(error){diagnostic('docs.failed',{target,options,message:error.message},true);throw error;}
 checkpoint();state.project=applied.project;state.sourceFile=applied.file;state.runtime=null;state.session=null;state.status='stopped';syncEditor();changed();fitView();
 diagnostic('docs.applied',{target,binding:applied.binding,report:applied.report},true);
 if(applied.action!=='remove'&&(applied.binding.type==='uart'||CATALOG_BY_TYPE[applied.binding.type]?.family==='uart')){const id=applied.binding.peripherals.USART1;$('serial-target').value=id==='USART2'?'USART2:external':id;}
 state.ide.invalidate();return applied;
}});
const logicAnalyzer=setupLogicAnalyzer({getSession:()=>state.session,getProject:()=>state.project,isRunning:()=>state.status==='running',log,onNoise:noise=>{checkpoint();state.project.simulation={...(state.project.simulation||{}),noise};autosave();}});
setupVariableGraph({getSession:()=>state.session,getProject:()=>state.project,isRunning:()=>state.status==='running',onError:message=>log(message,'error'),onChange:plots=>{state.project.ide??={breakpoints:[],watches:[]};state.project.ide.plots=plots;autosave();}});
const updateLog=setupUpdateLog();
layout.mount({openUpdateLog:updateLog.open,openElf,debugCommand:shellDebugCommand,runCommand,formatCode:()=>{layout.reveal('code');state.lastCodeCheckpoint=0;void state.ide?.format?.();},formatSelection:()=>{layout.reveal('code');state.lastCodeCheckpoint=0;state.ide?.formatSelection?.();},find:replace=>editorSearch.open(replace),files:()=>[state.project.code!==undefined?'main.c':null,...(state.project.firmware?.files||[]).map(f=>f.name)].filter(Boolean),openFile:name=>{if(name!=='main.c'&&!state.project.firmware?.files.some(f=>f.name===name))return;state.sourceFile=name;syncEditor();layout.reveal('code');state.ide?.editor?.focus?.();},gotoLine:line=>state.ide?.editor?.goto?.(line),setTarget:value=>{const select=$('native-target');if(!select||select.disabled||![...select.options].some(o=>o.value===value))return;select.value=value;select.dispatchEvent(new Event('change'));}});layout.setMonitor(monitor);
// Which boards a run starts (shown in Run and Debug once the circuit has an ESP32 or Raspberry Pi board).
(document.querySelector('#view-debug .run-config')||document.querySelector('.ide-toolbar'))?.insertAdjacentHTML('beforeend','<label class="run-scope-label" hidden><span>실행 보드</span><select id="run-scope" aria-label="실행할 보드"></select></label>');updateRunScope();
setupTabAccessibility();
state.canvasKeys=setupCanvasKeyboard(svg,{
 isDragging:()=>!!state.drag,
 label:target=>target.type==='endpoint'?(endpointInfo(target.id,state.project.components,state.project.surfaces)?.label||target.id):target.type==='button'?`${target.id} 버튼; 실행 중 Space로 누르기`:target.type==='bend'?`배선 꺾임점 ${target.index+1}; 방향키 이동, Delete 삭제`:target.type==='wire'?'점퍼선; Enter 선택, Insert 꺾임점 추가':target.type==='surface'?(target.id==='board'?'STM32 보드':'빵판'):(state.project.components.find(p=>p.id===target.id)?.name||'부품'),
 position:target=>endpointInfo(target.id,state.project.components,state.project.surfaces),
 reveal:(x,y)=>{const p=new DOMPoint(x,y).matrixTransform(svg.getScreenCTM().inverse());state.view.x=p.x-state.view.w/2;state.view.y=p.y-state.view.h/2;viewUpdate({preserveKeyboardFocus:false});},
 owns:(target,id)=>target?.type==='part'?id.startsWith(`part:${target.id}:`)||id.startsWith(`breadboard:${target.id}:`):target?.type==='surface'?(target.id==='board'?id.startsWith('board:'):id.startsWith('bb:')||id.startsWith('rail:')):false,
 announce:text=>{$('hint').textContent=state.carry?CARRY_HINT:text+' · PageUp/Down 탐색 · Enter 선택 · 방향키 이동 · P 핀 탐색';},
 activate:target=>{if(state.drag)return;if(target.type==='endpoint'){clickEndpoint(target.id);return;}if(target.type==='button')return;state.selection={type:target.type==='bend'?'wire':target.type,id:target.id};state.pending=null;wireDraft.reset();$('preview-layer').innerHTML='';state.mode='select';inspectTab();refresh();},
 press:(target,down)=>{
  const part=target.type==='part'?state.project.components.find(p=>p.id===target.id):null,id=target.type==='button'?target.id:part?.id;
  if(!id)return false;
  const family=CATALOG_BY_TYPE[part?.type]?.family,button=id==='USER'||id.endsWith('.USER')||part?.type==='button'||family==='button',slide=part?.type==='slide'||family==='slide',reset=id==='RESET'||id.endsWith('.RESET');
  if(!button&&!slide&&!reset)return false;
  if(!down){if(button&&state.pressed[id]){delete state.pressed[id];if(state.runtime)recompute();refresh();}return true;}
  if(state.drag||!state.runtime||!['running','paused'].includes(state.status))return false;
  if(reset){if(id.endsWith('.RESET'))resetBoard(id.slice(0,-6));else resetRuntime();return true;}
  if(slide){checkpoint();part.position=(part.position+1)%(CATALOG_BY_TYPE[part.type]?.id.includes('dp3t')?3:2);autosave();}else state.pressed[id]=true;
  recompute();refresh();return true;
 },
 move:(target,dx,dy)=>{if(running()||state.drag||state.pending)return;let draft=structuredClone(state.project);try{if(target.type==='bend'){const point=draft.wires.find(w=>w.id===target.id)?.points?.[target.index];if(!point)return;point.x+=dx;point.y+=dy;}else if(target.type==='surface'){const origin=surfaceOrigin(target.id,draft.surfaces);moveSurface(draft,target.id,{x:origin.x+dx,y:origin.y+dy});}else if(target.type==='part'){
   // A step that lands in the same holes (e.g. across the breadboard's centre gap) is retried 2x and 3x farther.
   const holes=d=>JSON.stringify(selectedIds(target,'part').map(id=>attachments(d.components.find(c=>c.id===id)||{})));const before=holes(state.project);
   // A mounted part must also stay on its line: a remount that slides sideways into another row is not this move
   // (a free part snapping into its first holes may shift slightly).
   const centre=d=>{const c=d.components.find(c=>c.id===selectedIds(target,'part')[0]);return c?{x:c.x,y:c.y}:{x:0,y:0};},from=centre(state.project),straight=d=>{const to=centre(d);return dx?Math.abs(to.y-from.y)<1:Math.abs(to.x-from.x)<1;};
   let found=false;for(let k=1;k<=3;k++){draft=structuredClone(state.project);moveSelection(draft,target,dx*k,dy*k);mountSelection(draft,target);if(before==='[]'||k===1&&!holes(draft).includes('"')||holes(draft).includes('"')&&holes(draft)!==before&&(!before.includes('"')||straight(draft))){found=true;break;}}
   if(!found){log('그 방향에는 부품을 꽂을 빈 구멍이 없습니다.','error');return;}
  }else return;validateProject(draft);checkpoint();state.project=draft;state.selection={type:target.type==='bend'?'wire':target.type,id:target.id};changed();pinSearch();}catch(error){log(error.message,'error');}},
 removeBend:target=>{if(running()||state.drag||state.pending)return;const wire=state.project.wires.find(w=>w.id===target.id);if(!wire?.points?.[target.index])return;checkpoint();wire.points.splice(target.index,1);changed();},
 addBend:target=>{if(running()||state.drag||state.pending)return;const draft=structuredClone(state.project),wire=draft.wires.find(w=>w.id===target.id);if(!wire)return;try{const points=wirePoints(draft,wire),i=Math.max(1,Math.floor(points.length/2)),a=points[i-1],b=points[i],index=insertWirePoint(draft,wire,{x:(a.x+b.x)/2,y:(a.y+b.y)/2});validateProject(draft);checkpoint();state.project=draft;state.selection={type:'wire',id:target.id};changed();return {type:'bend',id:target.id,index};}catch(error){log(error.message,'error');}}
});
syncEditor();fitView();refresh();log(`회로를 연결하고 실행(${keyFor('run.run')}) 또는 디버그 시작(${keyFor('run.debug')})을 눌러 보세요.`);
diagnostic('app.started',{status:state.status},true);
setupUpdates({beforeInstall:async()=>{
 clearTimeout(state.saveTimer);
 const text=JSON.stringify(state.project);
 localStorage.setItem('stm32lab.project.v2',text);
 await diagnostic('app.before-update',{status:state.status},true);
 await state.ide.saveWorkspace(text);
 $('save-state').textContent='자동 저장됨';
}});

