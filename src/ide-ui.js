import {createCodeEditor} from './generated/code-editor.js';
import {compile} from './parser.js';
import {compileHal} from './hal-source.js';
import {blankProject,validateProject} from './project.js';
import {HAL_EXAMPLES,halExample} from './hal-examples.js';
import {sourceFiles,changeSourceFile} from './source-files.js';
import {inspectRuntime,watchValue} from './debug-tools.js';
import {esc} from './render.js';
const $=id=>document.getElementById(id);
export function mountIdeChrome(){
  const toolbar=document.createElement('nav');toolbar.className='ide-toolbar';toolbar.setAttribute('aria-label','빌드와 디버그');toolbar.innerHTML='<button id="ide-build" class="primary" title="시뮬레이터용 빌드 (Ctrl+Shift+B)">빌드</button><span class="toolbar-divider"></span><button id="debug-start" title="시작 위치에서 디버깅">디버그 시작</button><button id="debug-pause" title="일시정지 (F6)">일시정지</button><button id="debug-over" title="한 줄 실행 (F10)">한 줄 실행</button><button id="debug-into" title="함수 안으로 (F11)">함수 안으로</button><button id="debug-out" title="함수 밖으로 (Shift+F11)">함수 밖으로</button><button id="debug-stop" title="디버그 / 실행 종료 (Shift+F5)">정지</button><span id="build-status" role="status">시뮬레이터용 빌드</span>';
  document.querySelector('.topbar').after(toolbar);toolbar.prepend(document.querySelector('.run-tools'));
  const tree=document.createElement('section');tree.className='project-files';tree.innerHTML='<div class="project-files-title"><strong>소스 파일</strong><button id="source-add">파일 추가</button></div><nav id="file-tree" aria-label="프로젝트 파일"></nav><div class="file-tools"><button id="source-rename">이름 변경</button><button id="source-delete">삭제</button></div><div class="project-folder-note" id="workspace-path">미저장 프로젝트</div>';
  document.querySelector('.library').prepend(tree);
  const tabs=document.createElement('nav');tabs.className='source-tabs';tabs.id='source-tabs';tabs.setAttribute('aria-label','열린 소스');$('code-panel').prepend(tabs);
  const position=document.createElement('div');position.className='editor-position';position.innerHTML='<span id="cursor-position">줄 1, 열 1</span><span>UTF-8 · C/H · F9 중단점</span>';document.querySelector('.editor-wrap').after(position);
  document.querySelector('.monitor-tabs').insertAdjacentHTML('beforeend','<button data-monitor="build">빌드</button><button data-monitor="debug">디버그</button>');
  document.querySelector('.console').insertAdjacentHTML('beforeend','<section id="build-panel" hidden><div id="build-output">빌드하면 지원 문법을 검사하고 실행 프로그램을 준비합니다. ARM ELF/BIN 생성은 포함하지 않습니다.</div><div id="build-errors"></div></section><section id="debug-panel" hidden><div class="debug-location" id="debug-location">디버그 시작 또는 중단점을 설정한 뒤 실행하세요.</div><div class="debug-grid"><section><h3>지역 변수</h3><table><tbody id="debug-locals"></tbody></table><h3 style="margin-top:14px">전역 변수</h3><table><tbody id="debug-globals"></tbody></table></section><section><h3>감시식</h3><form class="watch-entry" id="watch-form"><input id="watch-expression" aria-label="감시식" placeholder="count 또는 values[0]" maxlength="250"><button>추가</button></form><div id="watch-values"></div></section><section><h3>호출 스택</h3><div id="debug-stack"></div><h3 style="margin-top:14px">중단점</h3><div id="debug-breakpoints"></div></section></div></section>');
  $('new').textContent='새 프로젝트';$('open').textContent='회로 파일 열기';
  const open=document.createElement('button');open.id='workspace-open';open.className='quiet';open.textContent='프로젝트 열기';$('open').before(open);
  document.body.insertAdjacentHTML('beforeend',`<dialog id="project-dialog" aria-labelledby="project-dialog-title"><form id="project-form" class="ide-form"><h2 id="project-dialog-title">새 STM32 프로젝트</h2><label>프로젝트 이름<input id="new-project-name" value="MyProject" maxlength="80" required autocomplete="off"></label><label>보드<select id="new-project-board"><option>NUCLEO-F446RE</option></select></label><label>시작 템플릿<select id="new-project-template"><option value="blank">빈 HAL 프로젝트</option>${Object.entries(HAL_EXAMPLES).map(([k,v])=>`<option value="${k}">${esc(v)}</option>`).join('')}</select></label><label>저장할 상위 폴더<div class="folder-field"><input id="new-project-folder" readonly placeholder="선택하지 않으면 미저장 프로젝트"><button type="button" id="project-folder-choose">폴더 선택</button></div></label><p class="form-hint">프로젝트 폴더에는 회로·핀 설정과 main.c, 보조 C/H 소스를 함께 저장합니다. 기존 폴더는 덮어쓰지 않습니다.</p><p id="project-form-error" class="form-error" role="alert"></p><div class="dialog-actions"><button type="button" id="project-cancel">취소</button><button class="run-button" id="project-create">프로젝트 생성</button></div></form></dialog><dialog id="source-dialog" aria-labelledby="source-dialog-title"><form id="source-form" class="ide-form"><h2 id="source-dialog-title">소스 파일 추가</h2><label>파일 이름<input id="source-name" placeholder="user.c 또는 user.h" maxlength="76" required autocomplete="off"></label><p id="source-form-error" class="form-error" role="alert"></p><div class="dialog-actions"><button type="button" id="source-cancel">취소</button><button class="run-button">적용</button></div></form></dialog>`);
}
export function setupIde(o){
  let folder='',fileAction='add',lastPause='',built=null,sourceKey='';
  const points=()=>o.getProject().ide?.breakpoints||[],watches=()=>o.getProject().ide?.watches||[];
  const settings=()=>o.getProject().ide??=( {breakpoints:[],watches:[]} );
  const editor=createCodeEditor({textarea:$('code'),getFile:o.getSource,getFiles:()=>sourceFiles(o.getProject()),onBreakpoint:toggleBreakpoint,onBreakpointsMoved:(file,moved)=>{const unique=[...new Map(moved.map(b=>[b.line,b])).values()];settings().breakpoints=[...points().filter(b=>b.file!==file),...unique];o.saveLocal();debugView();},onPosition:p=>{$('cursor-position').textContent=`줄 ${p?.lineNumber||1}, 열 ${p?.column||1}`;}});
  function select(file,line){o.selectSource(file);o.layout.reveal('code');document.querySelector('[data-tab="code"]').click();if(line)editor.goto(line);}
  function showMonitor(name){o.layout.reveal('terminal');document.querySelector(`[data-monitor="${name}"]`).click();}
  function toggleBreakpoint(file,line){if(!Number.isInteger(line)||line<1)return;o.checkpoint();const p=settings(),i=p.breakpoints.findIndex(b=>b.file===file&&b.line===line);if(i<0)p.breakpoints.push({file,line});else p.breakpoints.splice(i,1);const r=o.getSession()?.runtime;if(r)r.debug.breakpoints=new Set(points().map(b=>`${b.file}:${b.line}`));o.saveLocal();debugView();}
  function sync(){
    const files=sourceFiles(o.getProject()),active=o.getSource(),key=JSON.stringify([o.getProject().firmware?.mode,files]);if(sourceKey&&sourceKey!==key){built=null;$('build-status').textContent='변경됨 · 빌드 필요';editor.diagnostics([]);}sourceKey=key;
    $('file-tree').innerHTML=files.map(f=>`<button data-source="${esc(f.name)}" class="${f.name===active?'active':''}" title="${esc(f.name)}"><span class="file-kind">${f.name.endsWith('.h')?'H':'C'}</span><span class="file-label">${esc(f.name)}</span></button>`).join('');
    $('source-tabs').innerHTML=files.map(f=>`<button data-source="${esc(f.name)}" class="${f.name===active?'active':''}">${esc(f.name)}</button>`).join('');
    for(const el of document.querySelectorAll('[data-source]'))el.onclick=()=>select(el.dataset.source);
    $('workspace-path').textContent=folder||'미저장 프로젝트';editor.reset();editor.updateDebug(points(),o.getSession()?.runtime?.debug.paused?o.getSession().runtime.location:null);controls();
  }
  function controls(){const running=o.isRunning(),r=o.getSession()?.runtime,paused=!!r?.debug.paused;
    for(const id of ['source-add','source-rename','source-delete','ide-build','debug-start'])$(id).disabled=running;
    for(const id of ['source-rename','source-delete'])$(id).disabled=running||o.getSource()==='main.c';
    $('debug-pause').disabled=!running||paused;$('debug-stop').disabled=!running;
    $('debug-into').disabled=$('debug-over').disabled=!paused;$('debug-out').disabled=!paused||r.depth<=1;
  }
  function build({reveal=true}={}){
    if(o.isRunning())return null;editor.diagnostics([]);$('build-errors').replaceChildren();if(reveal)showMonitor('build');
    try{const p=o.getProject(),program=p.firmware?.mode==='hal'?compileHal(p.code,p.firmware.files):compile(p.code);built=program;$('build-status').textContent='빌드 통과';$('firmware-status').textContent='시뮬레이터 빌드 통과';$('build-output').textContent=`빌드 성공 · ${sourceFiles(p).length}개 파일 · ${Object.keys(program.functions).length}개 함수\n시뮬레이터 실행 프로그램을 준비했습니다. 전원·배선·HAL 설정은 실행 시 검사합니다.`;return program;}
    catch(e){built=null;$('build-status').textContent='빌드 실패';$('firmware-status').textContent=e.message;$('build-output').textContent='빌드 실패 — 아래 항목을 누르면 오류 위치로 이동합니다.';const m=/^(?:(.+?):)?(\d+)(?:행)?:/.exec(e.message),loc=e.location||{file:m?.[1]||'main.c',line:Number(m?.[2]||1)},d={...loc,message:e.message};editor.diagnostics([d]);const b=document.createElement('button');b.className='build-error';b.textContent=e.message;b.onclick=()=>select(loc.file,loc.line);$('build-errors').append(b);return null;}
  }
  function debugView(){
    const r=o.getSession()?.runtime,paused=!!r?.debug.paused;editor.updateDebug(points(),paused?r.location:null);controls();
    $('debug-breakpoints').innerHTML=points().map(b=>`<button class="debug-frame" data-breakpoint="${esc(b.file)}:${b.line}">${esc(b.file)}:${b.line} · 해제</button>`).join('')||'<span>설정된 중단점 없음</span>';
    for(const el of $('debug-breakpoints').querySelectorAll('button'))el.onclick=()=>{const [file,line]=el.dataset.breakpoint.split(':');toggleBreakpoint(file,Number(line));};
    if(!paused){lastPause='';$('debug-location').textContent=o.isRunning()?'실행 중 — 일시정지하면 변수와 호출 스택을 표시합니다.':'디버그 시작 또는 F9로 중단점을 설정하세요.';for(const id of ['debug-locals','debug-globals','debug-stack','watch-values'])$(id).replaceChildren();return;}
    const state=inspectRuntime(r),key=`${r.microTime}:${state.location.file}:${state.location.line}:${r.depth}`;
    $('debug-location').textContent=`일시정지 · ${state.location.file}:${state.location.line} · ${(r.microTime/1000).toFixed(3)} ms`;
    if(lastPause!==key){lastPause=key;select(state.location.file,state.location.line);showMonitor('debug');}
    const table=rows=>rows.map(row=>`<tr><td title="${esc(row.type)}">${esc(row.name)}</td><td>${esc(row.value)}</td></tr>`).join('')||'<tr><td>없음</td></tr>';
    $('debug-locals').innerHTML=table(state.locals);$('debug-globals').innerHTML=table(state.globals);
    $('debug-stack').innerHTML=state.frames.map(f=>`<button class="debug-frame" data-stack-file="${esc(f.loc?.file||'main.c')}" data-line="${f.loc?.line||1}">${esc(f.name)}() · ${esc(f.loc?.file||'main.c')}:${f.loc?.line||1}</button>`).join('');
    for(const el of $('debug-stack').querySelectorAll('button'))el.onclick=()=>select(el.dataset.stackFile,Number(el.dataset.line));
    $('watch-values').innerHTML=watches().map((expression,index)=>{let value;try{value=watchValue(r,expression);}catch(e){value=e.message;}return `<div class="watch-row"><button title="감시식 제거" data-remove-watch="${index}">${esc(expression)}</button><div>${esc(value)}</div></div>`;}).join('');
    for(const el of document.querySelectorAll('[data-remove-watch]'))el.onclick=()=>{o.checkpoint();settings().watches.splice(Number(el.dataset.removeWatch),1);o.saveLocal();debugView();};
  }
  $('watch-form').onsubmit=e=>{e.preventDefault();const text=$('watch-expression').value.trim();if(!text||watches().includes(text)||watches().length>=20)return;o.checkpoint();settings().watches.push(text);$('watch-expression').value='';o.saveLocal();debugView();};
  $('ide-build').onclick=()=>build();$('firmware-check').onclick=()=>build();
  for(const [id,command]of Object.entries({'debug-start':'start','debug-pause':'pause','debug-over':'over','debug-into':'into','debug-out':'out','debug-stop':'stop'}))$(id).onclick=()=>o.debugCommand(command);
  const fileDialog=action=>{fileAction=action;$('source-dialog-title').textContent={add:'소스 파일 추가',rename:'소스 파일 이름 변경',delete:'소스 파일 삭제'}[action];$('source-name').value=action==='add'?'user.c':o.getSource();$('source-name').readOnly=action==='delete';$('source-form-error').textContent='';$('source-dialog').showModal();};
  $('source-add').onclick=()=>fileDialog('add');$('source-rename').onclick=()=>fileDialog('rename');$('source-delete').onclick=()=>fileDialog('delete');$('source-cancel').onclick=()=>$('source-dialog').close();
  $('source-form').onsubmit=e=>{e.preventDefault();try{if(o.isRunning())throw new Error('실행을 정지한 뒤 파일을 변경하세요.');const old=o.getSource(),name=$('source-name').value.trim(),p=changeSourceFile(o.getProject(),fileAction,fileAction==='add'?name:old,name);if(p.ide){p.ide.breakpoints=p.ide.breakpoints.filter(b=>fileAction!=='delete'||b.file!==old).map(b=>fileAction==='rename'&&b.file===old?{...b,file:name}:b);}o.applySources(p,fileAction==='delete'?'main.c':name);$('source-dialog').close();sync();}catch(e){$('source-form-error').textContent=e.message;}};
  $('new').onclick=()=>o.requestReplace(()=>{$('project-form-error').textContent='';$('project-dialog').showModal();});$('project-cancel').onclick=()=>$('project-dialog').close();
  $('project-folder-choose').disabled=!window.desktop?.chooseProjectParent;
  $('project-folder-choose').onclick=async()=>{try{const path=await window.desktop.chooseProjectParent();if(path)$('new-project-folder').value=path;}catch(e){$('project-form-error').textContent=e.message;}};
  $('project-form').onsubmit=async e=>{e.preventDefault();$('project-create').disabled=true;try{const name=$('new-project-name').value.trim();if(!name)throw new Error('프로젝트 이름을 입력하세요.');let p=$('new-project-template').value==='blank'?blankProject():halExample($('new-project-template').value);p.name=name;p.firmware.files.push({name:'main.h',text:'#pragma once\n#include "stm32f4xx_hal.h"\nvoid Error_Handler(void);\n'+Object.entries(p.mcu.pins).filter(([,s])=>s.label).map(([pin,s])=>`#define ${s.label}_Pin GPIO_PIN_${pin.slice(2)}\n#define ${s.label}_GPIO_Port GPIO${pin[1]}\n`).join('')});p=validateProject(p);const directory=$('new-project-folder').value?await window.desktop.createWorkspace({name,text:JSON.stringify(p)}):'';o.replaceProject(p);folder=directory;sync();$('project-dialog').close();select('main.c');}catch(e){$('project-form-error').textContent=e.message;}finally{$('project-create').disabled=false;}};
  $('workspace-open').disabled=!window.desktop?.openWorkspace;$('workspace-open').onclick=()=>o.requestReplace(async()=>{try{const opened=await window.desktop.openWorkspace();if(!opened)return;o.replaceProject(validateProject(JSON.parse(opened.text)));folder=opened.directory;sync();}catch(e){o.log(e.message,'error');}});
  document.addEventListener('ide-open-source',e=>select(e.detail.file,e.detail.line));
  window.addEventListener('keydown',e=>{if(document.querySelector('dialog[open]')||e.repeat)return;if((e.ctrlKey||e.metaKey)&&e.shiftKey&&e.key.toLowerCase()==='b'){e.preventDefault();build();}else if(e.key==='F6'){e.preventDefault();o.debugCommand('pause');}else if(e.key==='F10'){e.preventDefault();o.debugCommand('over');}else if(e.key==='F11'){e.preventDefault();o.debugCommand(e.shiftKey?'out':'into');}else if(e.key==='F5'&&e.shiftKey){e.preventDefault();o.debugCommand('stop');}},true);
  return {sync,controls,build,editor,debugView,breakpoints:()=>points().map(b=>`${b.file}:${b.line}`),invalidate(){built=null;$('build-status').textContent='변경됨 · 빌드 필요';editor.diagnostics([]);},reset(){folder='';built=null;lastPause='';sourceKey='';$('build-status').textContent='시뮬레이터용 빌드';editor.diagnostics([]);sync();},async saveWorkspace(text){if(!folder)return false;await window.desktop.saveWorkspace(text);return true;}};
}
