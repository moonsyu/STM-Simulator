// The part and example lists: filtering by text and board, and applying an example or a lecture circuit.
import {pinSearch,fitView} from './app-canvas.js';
import {running,setSaveState,autosave,log,checkpoint,changed,tab} from './app-core.js';
import {syncEditor} from './app-editor.js';
import {stop} from './app-run.js';
import {state} from './app-state.js';
import {refresh} from './app-view.js';
import {HAL_EXAMPLES,feedback,uartLines,monitor,svg,layout} from './app.js';
import {projectBoard} from './boards.js';
import {CATALOG_BY_TYPE} from './catalog-defs.js';
import {$} from './common.js';
import {RA_EXAMPLES,raExample} from './ra-examples.js';
import {searchHalExamples} from './hal-example-search.js';
import {applyHalExample,halGuideFor} from './hal-examples.js';
import {searchLectureExamples,EXAMPLE_BOARDS,LECTURE_PREFIX,applyLectureExample,lectureExample,lectureGuide} from './lecture-examples.js';
import {searchParts,PART_LIBRARY} from './part-library.js';
import {validateProject} from './project.js';
import {esc} from './render.js';

export function filterParts(){
 const matches=new Set(searchParts($('part-search').value).map(part=>part.type));
 $('part-list').querySelectorAll('[data-add]').forEach(button=>{button.hidden=!matches.has(button.dataset.add);});
 $('part-count').textContent=`${matches.size} / ${PART_LIBRARY.length}`;$('part-no-results').hidden=matches.size>0;$('part-list').scrollTop=0;
}
export function filterExamples(){
 // An FSP project (FPB-RA6E1) lists the FSP examples instead of the STM32 HAL ones (they need the HAL and CubeMX pins).
 const fsp=state.project.firmware?.mode==='fsp',query=$('hal-example-search').value,matches=fsp?[]:searchHalExamples(query,projectBoard(state.project).mcuFamily),lectures=searchLectureExamples(query);
 const words=query.trim().toLowerCase().split(/\s+/).filter(Boolean),raRows=fsp?RA_EXAMPLES.filter(e=>words.every(w=>(e.name+' '+e.tags.join(' ')+' '+e.id).toLowerCase().includes(w))):[];
 if(!EXAMPLE_BOARDS.some(b=>b.id===state.exampleBoard))state.exampleBoard='all';
 document.querySelectorAll('[data-example-board]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.exampleBoard===state.exampleBoard)));
 const lectureOption=e=>`<option value="${LECTURE_PREFIX}${e.id}">${esc(e.how?'보드 간 통신':e.kind==='과제'?'강의 과제':'강의 실습')} · ${esc(e.title)}</option>`;
 const groups=EXAMPLE_BOARDS.filter(b=>state.exampleBoard==='all'||b.id===state.exampleBoard).map(b=>{const own=lectures.filter(e=>e.boards.includes(b.id)),hal=b.id==='stm32'?matches:[];return {b,count:own.length+hal.length,html:own.map(lectureOption).join('')+hal.map(({id,name,native,simOnly})=>`<option value="${id}">${name}${native?' · ARM':''}${simOnly?' · SIM':''}</option>`).join('')};}).filter(g=>g.count);
 const total=new Set(groups.flatMap(g=>[...g.html.matchAll(/value="([^"]+)"/g)].map(m=>m[1]))).size;
 const raGroup=raRows.length?`<optgroup label="FPB-RA6E1 · FSP" data-count="${raRows.length}">${raRows.map(e=>`<option value="${RA_PREFIX}${e.id}">${esc(e.name)}</option>`).join('')}</optgroup>`:'';
 $('hal-example').innerHTML='<option value="">'+(total+raRows.length?`예제 선택… (${total+raRows.length})`:'검색 결과 없음')+'</option>'+raGroup+groups.map(g=>`<optgroup label="${esc(g.b.label)}" data-count="${g.count}">${g.html}</optgroup>`).join('');
 $('hal-example-count').textContent=`${total} / ${Object.keys(HAL_EXAMPLES).length+searchLectureExamples('').length}`;
}
export function replaceProject(p,{preserveWorkspace=false}={}){if(running())stop();state.firmware=null;state.project=validateProject(p);feedback.clear('save');setSaveState('저장 중…','saving');state.selection=null;state.pending=null;state.drag=null;state.mode='select';state.pressed={};state.lastWarnings='';uartLines.clear();state.searchSelectedId=null;$('pin-search').value='';pinSearch();fitView();state.selection=null;state.pending=null;state.drag=null;$('preview-layer').innerHTML='';state.undoStack=[];state.redoStack=[];state.status='stopped';state.runtime=null;state.session=null;monitor.clear();state.result=null;state.simTime=0;state.dirty=false;state.lastCodeCheckpoint=0;state.sourceFile='main.c';syncEditor();state.ide?.reset({preserveWorkspace});autosave();refresh();log('회로를 열었습니다: '+state.project.name);}
export function requestReplace(action){if(state.ide?.nativeBusy()){log('빌드·실행·디버그를 정지한 뒤 프로젝트를 변경하세요.','error');return;}if(state.dirty){state.replaceAction=action;$('replace-dialog').showModal();}else action();}
// A lecture example replaces the circuit (Ctrl+Z restores it) and opens the board program.
export function applyLecture(id){
 try{const applied=applyLectureExample(id);checkpoint();state.project=applied.project;state.sourceFile=applied.file;state.runtime=null;state.session=null;state.result=null;state.status='stopped';state.simTime=0;state.pressed={};state.selection=null;state.pending=null;state.drag=null;state.mode='select';state.lastWarnings='';$('preview-layer').innerHTML='';fitView();monitor.clear();uartLines.clear();syncEditor();changed();tab('code');
  log(`${lectureExample(id).title} · ${lectureGuide(id)}`);svg.focus({preventScroll:true});}
 catch(error){log(error.message,'error');}
}
// An example chosen while the simulation runs stops it first (the UART example keeps running until it is stopped, and
// an ignored choice looked like a broken list); a build, a board write or a debug session has to be stopped by the user.
function readyForExample(){if(state.ide?.nativeBusy()){log('빌드·보드 실행·디버그 중에는 예제를 바꿀 수 없습니다. 실행 정지(■) 후 다시 고르세요.','error');return false;}if(running()){stop();log('실행을 정지하고 예제를 적용합니다.');}return true;}
const RA_PREFIX='ra:';
// An FSP example sets the RA pins and hal_entry.c (the circuit stays); Ctrl+Z restores the previous code.
function applyRaExample(id){const ex=raExample(id);if(!ex)return;checkpoint();state.project.mcu=ex.mcu();state.project.code=ex.code;if(ex.circuit){const c=ex.circuit();state.project.components=c.components;state.project.wires=c.wires;state.selection=null;}state.project.firmware={mode:'fsp',files:[]};state.sourceFile='main.c';state.runtime=null;state.session=null;state.result=null;state.status='stopped';syncEditor();changed();state.ide?.invalidate?.();log(`${ex.name} 예제를 적용했습니다. 실행(Ctrl+F5)하면 ARM GCC와 Renesas FSP로 빌드해 RA6E1 에뮬레이터에서 실행합니다.`);}
export function onHalExampleChange(e){const type=e.target.value;e.target.value='';if(type.startsWith(RA_PREFIX)){if(state.project.firmware?.mode==='fsp'&&readyForExample())applyRaExample(type.slice(RA_PREFIX.length));return;}if(type.startsWith(LECTURE_PREFIX)){if(readyForExample())applyLecture(type.slice(LECTURE_PREFIX.length));return;}if(!Object.hasOwn(HAL_EXAMPLES,type)||!readyForExample())return;checkpoint();state.project=applyHalExample(state.project,type);state.sourceFile='main.c';state.runtime=null;state.session=null;state.result=null;state.status='stopped';state.simTime=0;state.pressed={};state.selection=null;state.pending=null;state.drag=null;state.mode='select';state.lastWarnings='';$('preview-layer').innerHTML='';fitView();monitor.clear();uartLines.clear();syncEditor();changed();if(type==='uart')$('serial-target').value='USART2';else if(type==='uart_external'||CATALOG_BY_TYPE[type]?.family==='uart')$('serial-target').value='USART1';tab('code');const guide=halGuideFor(type,projectBoard(state.project).id);log(HAL_EXAMPLES[type]+' · '+guide);
 // Examples driven from the serial monitor open it, so text is typed there (not into the Windows terminal).
 if(/직렬 모니터 탭/.test(guide))layout.showPanel('bus');svg.focus({preventScroll:true});}
