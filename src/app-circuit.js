// Editing the circuit: adding, copying, pasting, removing and rotating parts and boards, wire colours, board reset.
import {pinSearch,fitView} from './app-canvas.js';
import {log,running,uid,checkpoint,inspectTab,changed} from './app-core.js';
import {syncEditor} from './app-editor.js';
import {state} from './app-state.js';
import {refresh} from './app-view.js';
import {wireDraft,monitor,uartLines,diagnostic} from './app.js';
import {resetBoardConfiguration} from './board-reset.js';
import {removeBreadboard,moveBreadboard,breadboardBounds} from './breadboards.js';
import {selectedIds,copySelection,pasteSelection} from './circuit-edit.js';
import {$} from './common.js';
import {detachPart,normalizeAngle,PART_DEFS,TWO_PIN_TYPES,fixedLeadSpan} from './components.js';
import {removeDevboard,boardForFile,devboardBounds,DEVBOARD_MODELS,newDevboardFields} from './devboards.js';
import {surfaceBounds} from './geometry.js';
import {rotateBoard,rotateDevboard} from './surface-move.js';
import {displayModel} from './model-geometry.js';
import {BB} from './pins.js';
import {findMount,applyMount} from './placement.js';
import {validateProject} from './project.js';
import {renderMountPreview} from './render.js';
import {stm32Boards,mainBoardName,promoteStm32,isStm32Board,newStm32Fields} from './stm32-boards.js';
import {removeSurface} from './surfaces.js';

export function copyCircuit(){if(!selectedIds(state.selection,'part').length&&!selectedIds(state.selection,'wire').length)return false;state.circuitClipboard=copySelection(state.project,state.selection);state.clipboardOffset=28;log(`부품 ${state.circuitClipboard.components.length}개와 내부 배선 ${state.circuitClipboard.wires.length}개를 복사했습니다.`);return true;}
export function pasteCircuit(){if(running()||!state.circuitClipboard)return;try{const draft=structuredClone(state.project),{skipped,...next}=pasteSelection(draft,state.circuitClipboard,uid,state.clipboardOffset);validateProject(draft);checkpoint();state.project=draft;state.selection=next;if(skipped)log(`이미 배선이나 부품 다리가 있는 핀·구멍에 닿는 배선 ${skipped}개는 붙여 넣지 않았습니다.`);state.clipboardOffset+=28;state.pending=null;state.mode='select';inspectTab();changed();}catch(e){log(e.message,'error');}}
export function removeSelected(){
 if(running()||!state.selection)return;
 if(state.selection.type==='surface'&&state.selection.id==='board'&&stm32Boards(state.project).length){checkpoint();const gone=mainBoardName(state.project);promoteStm32(state.project);state.firmware=null;state.sourceFile='main.c';syncEditor();log(`${gone}를 삭제했습니다. 이제 ${mainBoardName(state.project)}를 편집합니다.`);state.searchSelectedId=null;pinSearch();}
 else if(state.selection.type==='surface'){checkpoint();removeSurface(state.project,state.selection.id);state.searchSelectedId=null;pinSearch();}
 else if(state.selection.type==='group'){checkpoint();const parts=new Set(state.selection.parts),wires=new Set(state.selection.wires);for(const id of parts){const type=state.project.components.find(p=>p.id===id)?.type;if(type==='breadboard')removeBreadboard(state.project,id);if(type==='devboard')removeDevboard(state.project,id);}state.project.components=state.project.components.filter(p=>!parts.has(p.id));state.project.wires=state.project.wires.filter(w=>!wires.has(w.id)&&![w.from,w.to].some(id=>id.startsWith('part:')&&parts.has(id.split(':')[1])));}
 else if(state.selection.type==='part'){checkpoint();const type=state.project.components.find(p=>p.id===state.selection.id)?.type;if(type==='breadboard')removeBreadboard(state.project,state.selection.id);else if(type==='devboard'){if(boardForFile(state.project,state.sourceFile)?.id===state.selection.id)state.sourceFile='main.c';removeDevboard(state.project,state.selection.id);syncEditor();}else {state.project.components=state.project.components.filter(p=>p.id!==state.selection.id);state.project.wires=state.project.wires.filter(w=>![w.from,w.to].some(id=>id.startsWith(`part:${state.selection.id}:`)));}}
 else if(state.selection.type==='wire'){checkpoint();state.project.wires=state.project.wires.filter(w=>w.id!==state.selection.id);}else return;
 state.selection=null;state.pending=null;state.drag=null;$('preview-layer').innerHTML='';changed();
}
export function rotateSelected(){
 if(running())return;
 // The main board turns in quarter turns about its centre (not while it is being dragged: the drag works on a draft).
 if(state.selection?.type==='surface'&&state.selection.id==='board'){if(state.drag||state.project.surfaces?.board?.hidden)return;checkpoint();rotateBoard(state.project,90);log(`${mainBoardName(state.project)}: ${state.project.surfaces.board.rotation??0}°로 돌렸습니다. 헤더에 꽂은 부품과 배선도 함께 돕니다.`);changed();return;}
 if(state.selection?.type!=='part')return;
 const p=state.project.components.find(p=>p.id===state.selection.id);if(!p)return;
 if(!state.drag?.moved)checkpoint();
 if(p.type==='breadboard'){moveBreadboard(state.project,p.id,{x:p.x,y:p.y,rotation:p.rotation+45});if(state.drag?.type==='part')state.drag.moved=true;changed();return;}
 // Boards turn in 90° steps; an ESP32 then plugs in again where its pins meet free holes.
 if(p.type==='devboard'){detachPart(p);rotateDevboard(state.project,p.id,90);if(state.drag?.type==='part'){state.drag.moved=true;refresh();$('preview-layer').innerHTML=renderMountPreview(findMount(p,state.project.components,15,state.project.surfaces,state.project.wires));}else{applyMount(p,findMount(p,state.project.components,15,state.project.surfaces,state.project.wires));changed();}return;}
 detachPart(p);p.rotation=normalizeAngle(p.rotation+45);
 if(state.drag?.type==='part'){state.drag.moved=true;refresh();$('preview-layer').innerHTML=renderMountPreview(findMount(p,state.project.components,15,state.project.surfaces,state.project.wires));}
 else {applyMount(p,findMount(p,state.project.components,15,state.project.surfaces,state.project.wires));changed();}
}
export function addPart(type,a,b,position,extra={}){
 if(state.project.components.length>=100){log('부품은 100개까지 추가할 수 있습니다.','error');return;}
 // Names count up per type (R1, LED2). A model number ending in a digit is not run together with the counter:
 // DS3231, DS3231-2 (not DS32311, DS32312).
 const prefix=(({resistor:'R',led:'LED',button:'SW',lcd:'LCD',breadboard:'BB'})[type])||PART_DEFS[type]?.prefix,names=new Set(state.project.components.map(p=>p.name));let number=state.project.components.filter(p=>p.type===type).length+1;const label=n=>/\d$/.test(prefix)?(n===1?prefix:`${prefix}-${n}`):prefix+n;while(names.has(label(number)))number++;const name=label(number);
 const p={id:uid('p'),type,name,x:position?.x??(a.x+b.x)/2,y:position?.y??(a.y+b.y)/2,rotation:0};Object.assign(p,extra);
 if(type==='resistor')p.value=330;if(type==='led')p.color='red';Object.assign(p,PART_DEFS[type]?.defaults||{});
 if(TWO_PIN_TYPES.includes(type)){p.span=a&&b?Math.hypot(b.x-a.x,b.y-a.y):fixedLeadSpan(p)??70;if(a&&b){p.attachA=a.id;p.attachB=b.id;p.rotation=normalizeAngle(Math.atan2(b.y-a.y,b.x-a.x)*180/Math.PI);}}
 checkpoint();state.project.components.push(p);state.selection={type:'part',id:p.id};state.pending=null;state.mode='select';$('preview-layer').innerHTML='';inspectTab();changed();
}
// Every part is placed at once in the middle of the visible workspace (the next free spot, clear of the parts already
// there at their datasheet size); it is then dragged onto the breadboard.
export function freeSpot(type){
 const radius=p=>{const b=displayModel(p)?.bounds;return b?Math.hypot(b.right-b.left,b.bottom-b.top)/2:30;};
 const centre={x:state.view.x+state.view.w*.5,y:state.view.y+state.view.h*.5},own=radius({type,x:0,y:0,rotation:0}),step=Math.max(42,own);
 const others=state.project.components.filter(p=>p.type!=='breadboard').map(p=>({x:p.x,y:p.y,r:radius(p)}));
 for(let ring=0;ring<12;ring++)for(let k=0;k<Math.max(1,ring*8);k++){const a=ring?k/(ring*8)*Math.PI*2:0,q={x:centre.x+Math.cos(a)*ring*step,y:centre.y+Math.sin(a)*ring*step};if(!others.some(o=>Math.hypot(o.x-q.x,o.y-q.y)<o.r+own+6))return q;}
 return centre;
}
export function addDevboard(modelId){
 if(running())return;if(state.project.components.length>=100){log('부품은 100개까지 추가할 수 있습니다.','error');return;}
 // A second STM32 board swaps with the main board when edited; a Renesas RA main board cannot swap with it.
 if(DEVBOARD_MODELS[modelId]?.kind==='stm32'&&state.project.firmware?.mode==='fsp'){log('FPB-RA6E1 회로에는 STM32 보드를 함께 놓을 수 없습니다. ESP32·라즈베리파이 보드는 추가할 수 있습니다.','error');return;}
 const surfaceRight=key=>state.project.surfaces?.[key]?.hidden?0:surfaceBounds(key,state.project.surfaces).right;
 const right=Math.max(surfaceRight('board'),surfaceRight('breadboard'),...state.project.components.map(p=>p.type==='breadboard'?breadboardBounds(p).right:p.type==='devboard'?devboardBounds(p).right:p.x+40));
 let fields;try{fields=DEVBOARD_MODELS[modelId].kind==='stm32'?newStm32Fields(state.project,modelId,right):newDevboardFields(state.project,modelId,right);}catch(e){log(e.message,'error');return;}
 checkpoint();const p={id:uid('b'),...fields};state.project.components.push(p);state.selection={type:'part',id:p.id};state.pending=null;state.mode='select';inspectTab();syncEditor();changed();fitView();
 log(`${p.name}: ${DEVBOARD_MODELS[modelId].name}를 추가했습니다. ${({esp32:'sketch.ino를 실행합니다.',stm32:'빈 HAL main.c로 시작합니다. 속성의 "이 보드 편집"으로 코드와 핀 설정을 바꿉니다.'})[DEVBOARD_MODELS[modelId].kind]??'강의 예제가 아닌 라즈베리파이는 코드를 실행하지 않고 전압만 계산합니다.'}`);
}
export function setWireColor(value){
 state.color=value;document.querySelectorAll('[data-color]').forEach(s=>{s.classList.toggle('active',s.dataset.color===value);s.setAttribute('aria-pressed',String(s.dataset.color===value));});
 const wire=state.selection?.type==='wire'&&state.project.wires.find(w=>w.id===state.selection.id);
 if(!running()&&wire&&wire.color!==value){checkpoint();wire.color=value;changed();}
}
export function onBoardResetConfirmClick(){
 try{
  if(running())throw new Error('빌드·실행·디버그를 정지한 뒤 초기화하세요.');
  const removedParts=state.project.components.length,removedWires=state.project.wires.length,beforeLength=state.project.code.length,next=resetBoardConfiguration(state.project);
  checkpoint();state.project=next;state.sourceFile='main.c';state.firmware=null;state.runtime=null;state.session=null;state.result=null;state.status='stopped';state.simTime=0;state.pressed={};state.selection=null;state.pending=null;state.mode='select';state.searchSelectedId=null;
  wireDraft.reset();$('preview-layer').innerHTML='';$('search-layer').innerHTML='';$('pin-search').value='';monitor.clear();uartLines.clear();
  syncEditor();pinSearch();changed();state.ide?.invalidate();fitView();
  diagnostic('board.reset',{removedParts,removedWires,resetCode:true,beforeLength,afterLength:state.project.code.length},true);
  $('board-reset-dialog').close();log('보드 구성과 main.c를 초기화했습니다. 다른 소스 파일은 유지됩니다. Ctrl+Z로 되돌릴 수 있습니다.');
 }catch(error){$('board-reset-error').textContent=error.message;}
}
