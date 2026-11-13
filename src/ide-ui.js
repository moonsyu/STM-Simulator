import {createCodeEditor} from './generated/code-editor.js';
import {compile} from './parser.js';
import {compileHal} from './hal-source.js';
import {compileFsp} from './fsp-interp.js';
import {blankProject,validateProject} from './project.js';
import {allHalExamples,applyHalExample} from './hal-examples.js';
import {searchHalExamples} from './hal-example-search.js';
import {BOARD_CATALOG,DEFAULT_BOARD_ID,START_BOARD_ID,getBoard} from './boards.js';
import {familyProfile} from './mcu-family.js';
import {SOURCE_PATH,sourceFiles,changeSourceFile} from './source-files.js';
import {boardSourceFiles,isBoardFile} from './devboards.js';
import {inspectRuntime,watchValue} from './debug-tools.js';
import {esc} from './render.js';
import {withKey} from './keybindings.js';
import {setupCodeFormat} from './code-format-ui.js';
import {mountNativeChrome,setupNativeIde} from './native-ide-ui.js';
import {$} from './common.js';
import {outlineLabel} from './c-symbols.js';
import {buildEnvironment,prefixOf,startupOf,HAL_MODULES} from './build-environment.js';
import {halFiles,generatedSources} from './peripheral-files.js';
import {regenerated,fileKind,armOnly,outsideRanges,editedLabel} from './project-overrides.js';
import {exportIoc} from './ioc-export.js';
import {isRaFamily} from './ra-config.js';
import {RA_EXAMPLES,raExample} from './ra-examples.js';
import {raHalEntry} from './ra-generator.js';
import {raAssistance} from './ra-assistance.js';
import {generateRaFiles} from './ra-generator.js';
export function mountIdeChrome(){
  const toolbar=document.createElement('nav');toolbar.className='ide-toolbar';toolbar.setAttribute('aria-label','빌드와 디버그');toolbar.innerHTML='<button id="ide-build" class="primary" title="시뮬레이터용 빌드">빌드</button><span class="toolbar-divider"></span><button id="debug-start" title="시작 위치에서 디버깅">디버그 시작</button><span id="build-status" role="status">시뮬레이터용 빌드</span>';
  document.querySelector('.topbar').after(toolbar);toolbar.prepend(document.querySelector('.run-tools'));
  const tree=document.createElement('section');tree.className='project-files';tree.innerHTML='<div class="project-files-title"><strong>소스 파일</strong><button id="source-add">파일 추가</button></div><nav id="file-tree" aria-label="프로젝트 파일"></nav><div class="file-tools"><button id="source-rename">이름 변경</button><button id="source-delete">삭제</button></div><details id="build-files" class="build-files" hidden><summary><span id="build-files-title">Core · Startup</span> <small>빌드에 들어가는 파일 · 바로 고치면 그 파일만 프로젝트에 저장</small></summary><nav id="build-file-list" aria-label="빌드 파일"></nav></details><details id="ra-assist" class="build-files ra-assist" hidden><summary>Developer Assistance <small>눌러서 커서 자리에 넣기</small></summary><nav id="ra-assist-list" aria-label="Developer Assistance"></nav></details><div class="project-folder-note" id="workspace-path">미저장 프로젝트</div>';
  document.querySelector('.library').prepend(tree);
  // CubeIDE's Outline: the structure of the file on screen (project or SDK); the file tree keeps the project files only.
  const outline=document.createElement('section');outline.className='project-files outline-view';outline.innerHTML='<div class="project-files-title"><strong>코드 개요 (Outline)</strong><span id="outline-file"></span></div><input id="outline-filter" type="search" placeholder="개요 검색" aria-label="코드 개요 검색"><nav id="outline-list" aria-label="코드 개요"></nav>';tree.after(outline);
  const tabs=document.createElement('nav');tabs.className='source-tabs';tabs.id='source-tabs';tabs.setAttribute('aria-label','열린 소스');$('code-panel').prepend(tabs);
  {const empty=document.createElement('div');empty.id='editor-empty';empty.className='editor-empty';empty.innerHTML='<p>열린 파일이 없습니다.</p><p>탐색기에서 파일을 눌러 여세요.</p>';document.querySelector('.editor-wrap').append(empty);}
  const sourcePath=document.createElement('div');sourcePath.id='source-path';sourcePath.className='source-path';sourcePath.hidden=true;tabs.after(sourcePath);
  const position=document.createElement('div');position.className='editor-position';position.innerHTML='<span id="cursor-position">줄 1, 열 1</span><span>UTF-8 · C/H · F9 중단점</span>';document.querySelector('.editor-wrap').after(position);
  document.querySelector('.monitor-tabs').insertAdjacentHTML('beforeend','<button data-monitor="build">빌드</button>');
  document.querySelector('.console').insertAdjacentHTML('beforeend','<section id="build-panel" hidden><div id="build-output">빌드하면 지원 문법을 검사하고 실행 프로그램을 준비합니다. ARM ELF/BIN 생성은 포함하지 않습니다.</div><div id="build-errors"></div></section><section id="debug-panel" hidden><div class="debug-location" id="debug-location">디버그 시작 또는 중단점을 설정한 뒤 실행하세요.</div><div class="debug-grid"><section><h3>지역 변수</h3><table><tbody id="debug-locals"></tbody></table><h3 style="margin-top:14px">전역 변수</h3><table><tbody id="debug-globals"></tbody></table></section><section><h3>감시식</h3><form class="watch-entry" id="watch-form"><input id="watch-expression" aria-label="감시식" placeholder="count 또는 values[0]" maxlength="250"><button>추가</button></form><div id="watch-values"></div></section><section><h3>호출 스택</h3><div id="debug-stack"></div><h3 style="margin-top:14px">중단점</h3><div id="debug-breakpoints"></div></section></div></section>');
  $('new').textContent='새 프로젝트';$('open').textContent='회로 파일 열기';
  const open=document.createElement('button');open.id='workspace-open';open.className='quiet';open.textContent='프로젝트 열기';$('open').before(open);
  document.body.insertAdjacentHTML('beforeend',`<dialog id="project-dialog" aria-labelledby="project-dialog-title"><form id="project-form" class="ide-form"><h2 id="project-dialog-title">새 프로젝트</h2><label>프로젝트 이름<input id="new-project-name" value="MyProject" maxlength="80" required autocomplete="off"></label><label>보드<select id="new-project-board">${BOARD_CATALOG.map(b=>`<option value="${b.id}"${b.id===START_BOARD_ID?' selected':''}>${b.name} · ${b.mcu}</option>`).join('')}</select></label><label>시작 템플릿<select id="new-project-template"><option value="blank">빈 HAL 프로젝트</option><option value="ra-minimal" data-ra>Bare Metal - Minimal (빈 hal_entry)</option><option value="ra-blinky" data-ra>Bare Metal - Blinky (LED1·LED2 깜빡이기)</option>${RA_EXAMPLES.map(e=>`<option value="${e.id}" data-ra>${esc(e.name)}</option>`).join('')}${Object.entries(allHalExamples()).map(([k,v])=>`<option value="${k}">${esc(v)}</option>`).join('')}</select></label><label>저장할 상위 폴더<div class="folder-field"><input id="new-project-folder" readonly placeholder="선택하지 않으면 미저장 프로젝트"><button type="button" id="project-folder-choose">폴더 선택</button></div></label><p class="form-hint">프로젝트 폴더에는 회로·핀 설정과 main.c, 보조 C/H 소스를 함께 저장합니다. 기존 폴더는 덮어쓰지 않습니다.</p><p id="project-form-error" class="form-error" role="alert"></p><div class="dialog-actions"><button type="button" id="project-cancel">취소</button><button class="run-button" id="project-create">프로젝트 생성</button></div></form></dialog><dialog id="source-dialog" aria-labelledby="source-dialog-title"><form id="source-form" class="ide-form"><h2 id="source-dialog-title">소스 파일 추가</h2><label>파일 이름<input id="source-name" placeholder="user.c 또는 user.h" maxlength="76" required autocomplete="off"></label><p id="source-form-error" class="form-error" role="alert"></p><div class="dialog-actions"><button type="button" id="source-cancel">취소</button><button class="run-button">적용</button></div></form></dialog>`);
  mountNativeChrome();
}
// Outline marks and names (CubeIDE Outline icons: include, macro, typedef, enum, variable, function, prototype).
const OUTLINE_KIND={include:['#','include'],macro:['M','매크로'],typedef:['T','typedef'],enum:['E','enum 상수'],variable:['V','전역 변수'],function:['F','함수'],declaration:['D','함수 선언']};
export function setupIde(o){
  let folder='',fileAction='add',lastPause='',built=null,sourceKey='',native=null;
  const points=()=>o.getProject().ide?.breakpoints||[],watches=()=>o.getProject().ide?.watches||[];
  const settings=()=>o.getProject().ide??=( {breakpoints:[],watches:[]} );
  const editor=createCodeEditor({textarea:$('code'),getFile:o.getSource,getFiles:()=>sourceFiles(o.getProject()),onBreakpoint:toggleBreakpoint,onBreakpointsMoved:(file,moved)=>{const unique=[...new Map(moved.map(b=>[b.line,b])).values()];settings().breakpoints=[...points().filter(b=>b.file!==file),...unique];o.saveLocal();debugView();},onPosition:p=>{$('cursor-position').textContent=`줄 ${p?.lineNumber||1}, 열 ${p?.column||1}`;},getFamily:()=>o.getProject().mcu?.family||'STM32F446RE',getGenerated:()=>generatedFiles(),onExternal:()=>tabsView(),
    canEdit:file=>canEditExternal(file),readOnlyMessage:file=>externalReadOnlyMessage(file),onExternalEdit:(file,text,meta)=>adoptExternal(file,text,meta),
    isRegenerated:name=>{const p=o.getProject();if(p.firmware?.mode!=='hal')return false;if(name==='main.c')return true;const own=(p.firmware.files||[]).find(f=>f.name===name);if(own)return own.origin==='gen'&&regenerated(name,p.mcu?.family);return regenerated(treeLabels.get(name)||name,p.mcu?.family);},outsideRanges});
  // Features 25 and 26 — open tabs. A project starts with a tab for each of its files; a tab can be closed (×, the tab's
  // context menu, "모두 닫기") and comes back when the file is opened from the explorer. Closing is only about the tab
  // row: the file stays in the project and its text is kept, also while the program runs. closedTabs holds the closed
  // ones; emptyTabs is set when the last tab was closed (the editor then shows a note instead of a file).
  const closedTabs=new Set();let emptyTabs=false;
  function select(file,line,column){closedTabs.delete(file);emptyTabs=false;editor.showProject();o.selectSource(file);o.layout.reveal('code');document.querySelector('[data-tab="code"]').click();if(line)editor.goto(line,column);}
  // The debug view lives in the side bar; every other monitor is a bottom-panel tab.
  function showMonitor(name){if(name==='debug'){o.layout.showView('debug');return;}o.layout.showPanel(name);}
  function toggleBreakpoint(file,line){if(!Number.isInteger(line)||line<1||isBoardFile(file))return;o.checkpoint();const p=settings(),i=p.breakpoints.findIndex(b=>b.file===file&&b.line===line);if(i<0)p.breakpoints.push({file,line});else p.breakpoints.splice(i,1);const r=o.getSession()?.runtime;if(r)r.debug.breakpoints=new Set(points().map(b=>`${b.file}:${b.line}`));o.saveLocal();native?.syncBreakpoints();debugView();}
  // An FSP project's main source is e² studio's src/hal_entry.c (stored as the project's main file).
  const shown=name=>name==='main.c'&&o.getProject().firmware?.mode==='fsp'?'hal_entry.c':name;
  const sourceFolded=new Set();
  function sync(){
    {const ext=editor.externalFile(),p=o.getProject();if(ext&&canEditExternal(ext.file)){const leaf=ext.file.split('/').at(-1),own=(p.firmware?.files||[]).find(f=>(f.origin||treeLabels.get(ext.file)===f.name)&&f.name.split('/').at(-1)===leaf&&(f.of===ext.file||f.name===(treeLabels.get(ext.file)||ext.file)));if(own){editor.closeExternal(ext.file);select(own.name);return;}}}
    const focused=document.activeElement?.closest('[data-source]'),focusSource=focused?.dataset.source,focusContainer=focused?.parentElement.id;
    const files=sourceFiles(o.getProject()),active=o.getSource(),key=JSON.stringify([o.getProject().firmware?.mode,files]);if(sourceKey&&sourceKey!==key){built=null;$('build-status').textContent='변경됨 · 빌드 필요';editor.diagnostics([]);}sourceKey=key;
    // Other boards' programs follow the STM32 sources, labelled with the board name.
    const boards=boardSourceFiles(o.getProject());
    // A file kept in a folder (Core/Src/app.c) shows its name with the folder beside it, as the build file list does.
    const folderOfFile=name=>name==='main.c'?(o.getProject().firmware?.mainFolder??''):name.split('/').slice(0,-1).join('/'),leaf=name=>shown(name).split('/').at(-1);
    // Feature 28: the project's files as a tree — a folder (Core, Core/Src, USER …) folds and its files sit one step in,
    // as in the project structure below. A folder is there because a file's name has it; main.c sits in the folder it
    // was imported from. The folders a user folded stay folded while the list is drawn again.
    const kind=name=>name.endsWith('.h')?'H':/\.s$/i.test(name)?'S':name.endsWith('.ld')?'L':'C';
    const fileRow=f=>`<button data-source="${esc(f.name)}" class="${f.name===active?'active':''}" title="${esc((folderOfFile(f.name)?folderOfFile(f.name)+'/':'')+leaf(f.name))}"><span class="file-kind">${kind(f.name)}</span><span class="file-label">${esc(leaf(f.name))}</span></button>`;
    const root={folders:new Map(),files:[]};
    for(const f of files){let node=root;for(const part of folderOfFile(f.name).split('/').filter(Boolean)){if(!node.folders.has(part))node.folders.set(part,{folders:new Map(),files:[]});node=node.folders.get(part);}node.files.push(f);}
    const drawTree=(node,path)=>[...[...node.folders].sort(([a],[b])=>a.localeCompare(b)).map(([name,child])=>{const full=path?path+'/'+name:name;return `<details class="tree-folder" data-src-folder="${esc(full)}"${sourceFolded.has(full)?'':' open'}><summary>${esc(name)}</summary><div class="tree-children">${drawTree(child,full)}</div></details>`;}),...node.files.map(fileRow)].join('');
    $('file-tree').innerHTML=drawTree(root,'')+boards.map(f=>`<button data-source="${esc(f.name)}" class="${f.name===active?'active':''}" title="${esc(f.label)}"><span class="file-kind">${f.name.endsWith('.py')?'PY':'INO'}</span><span class="file-label">${esc(f.label)}</span></button>`).join('');
    for(const el of $('file-tree').querySelectorAll('[data-src-folder]'))el.addEventListener('toggle',()=>{if(el.open)sourceFolded.delete(el.dataset.srcFolder);else sourceFolded.add(el.dataset.srcFolder);});
    for(const el of $('file-tree').querySelectorAll('[data-source]'))el.onclick=()=>select(el.dataset.source);editor.refreshGenerated();tabsView();
    const wp=folder||'미저장 프로젝트';$('workspace-path').textContent=wp;$('workspace-path').title=wp;editor.reset();if(!native?.selected())editor.updateDebug(points(),o.getSession()?.runtime?.debug.paused?o.getSession().runtime.location:null);native?.sync();controls();if(!o.isRunning())debugView();
    if(focusSource&&focusContainer)[...$(focusContainer).querySelectorAll('[data-source]')].find(el=>el.dataset.source===focusSource)?.focus({preventScroll:true});
  }
  // CubeIDE's Core/Src and Startup files the ARM build uses besides the project's own sources (read only): the added
  // handlers / system calls / heap, and the SDK's system and startup files (unless the project has its own).
  // What the build adds: the STM32 environment (it.c, syscalls.c, sysmem.c) or, for an FSP project, the RASC-style files.
  function generatedFiles(){const p=o.getProject();if(p.firmware?.mode==='fsp'&&p.mcu){try{return Object.entries(generateRaFiles(p.mcu,{board:{fspBoard:true}})).map(([file,text])=>({file,text}));}catch{return [];}}if(!(p.firmware?.mode==='hal'&&p.mcu))return [];
    // The .ioc of the Pinout as it is now (what ".ioc로 내보내기" saves): shown, and changed through the Pinout.
    let ioc=[];try{ioc=[{file:(String(p.name||'').replace(/[^\w.-]+/g,'_').replace(/^[._]+|[._]+$/g,'')||'project')+'.ioc',text:'# 읽기 전용: 이 프로젝트의 핀·주변장치·클록 설정을 CubeMX .ioc 형식으로 본 것입니다.\n# 보드/핀 설정(Pinout)에서 바꾸면 이 내용이 바뀌고, Pinout의 ".ioc로 내보내기"로 파일로 저장합니다.\n'+exportIoc(p.mcu)}];}catch{/* a Pinout with open problems has no .ioc yet */}
    // The peripheral .c/.h pairs the project includes (peripheral-files.js), where CubeIDE keeps them.
    const pairs=generatedSources(p).map(f=>({file:`Core/${f.name.endsWith('.h')?'Inc':'Src'}/${f.name}`,text:f.text}));
    return [...buildEnvironment(p).files,...pairs,...ioc];}
  // Feature 45: every file of the STM32 project tree is edited in place (as in CubeIDE). Not the .ioc view (the Pinout
  // writes it) and not a Renesas FSP project's generated / FSP files (e² studio writes them again; feature 20).
  const canEditExternal=file=>o.getProject().firmware?.mode==='hal'&&!/\.ioc$/.test(file);
  function externalReadOnlyMessage(file){
    if(/\.ioc$/.test(file))return '.ioc는 지금 Pinout 설정을 CubeMX 형식으로 보여 주는 파일입니다. 바꾸려면 보드/핀 설정(Pinout)에서 설정하세요.';
    if(o.getProject().firmware?.mode==='fsp')return /^ra\//.test(file)?'Renesas FSP 소스입니다. e² studio도 Generate Project Content 때 이 파일을 다시 덮어써서, 이 앱에서는 고치지 않습니다. 프로젝트 코드는 src/hal_entry.c에 쓰세요.':'RASC(FSP Configuration)가 Pins·Stacks 설정으로 만드는 파일입니다. 바꾸려면 Pins·Stacks에서 설정하세요 — 다시 생성할 때 덮어씁니다.';
    return '';
  }
  // The SDK files an edit may keep in the project (Drivers, CMSIS): their own budget, beside the 1 MB of sources.
  const SDK_BUDGET=4e6;
  // The first edit of a generated or SDK file: the file goes into the project under the path the tree shows it at, with
  // where it came from (only that file is stored); the editor then carries on in the project file. Returns its name.
  function adoptExternal(file,text,{generated}={}){
    try{
      if(o.isRunning())throw new Error('실행을 정지한 뒤 고치세요.');
      const p=structuredClone(o.getProject());if(p.firmware?.mode!=='hal')throw new Error('이 파일은 고칠 수 없습니다.');p.firmware.files??=[];
      const shownAs=treeLabels.get(file),leaf=(shownAs||file).split('/').at(-1),name=shownAs&&SOURCE_PATH.test(shownAs)?shownAs:SOURCE_PATH.test(file)?file:leaf;
      if(leaf==='main.c'||!SOURCE_PATH.test(name))throw new Error(`${leaf}: 프로젝트에 둘 수 없는 경로의 파일이라 여기서 고칠 수 없습니다.`);
      // One file of a name: the build and the tree match files by name, so a second one would be compiled twice.
      const same=sourceFiles(p).find(f=>f.name.split('/').at(-1).toLowerCase()===leaf.toLowerCase());
      if(same)throw new Error(`${leaf}: 같은 이름의 파일(${same.name})이 이미 프로젝트에 있습니다. 그 파일을 고치세요.`);
      const sdkSize=p.firmware.files.filter(f=>f.origin==='sdk').reduce((n,f)=>n+f.text.length,0);
      if(!generated&&sdkSize+text.length>SDK_BUDGET)throw new Error(`${leaf}: 고친 SDK 파일은 모두 합쳐 4 MB까지 프로젝트에 둘 수 있습니다.`);
      const original=editor.externalOriginal?.(file);
      p.firmware.files.push({name,text,origin:generated?'gen':'sdk',...(generated?{}:{of:file}),...(generated&&typeof original==='string'&&regenerated(name,p.mcu.family)?{base:original}:{})});
      validateProject(p);
      emptyTabs=false;closedTabs.delete(name);
      o.applySources(p,name);
      const kind=fileKind(name,p.mcu.family);
      o.log(`${name}을 고쳐 프로젝트에 저장했습니다(고친 파일만 저장). ${kind==='regen'?'코드를 다시 생성하면 USER CODE 구역 안만 남고 나머지는 Pinout 설정대로 새로 써집니다.':'한 번 만드는 파일이라 코드를 다시 생성해도 고친 내용이 남습니다.'}${armOnly(name)?' 내장 해석기는 이 파일을 쓰지 않아 ARM GCC 빌드에서만 반영됩니다.':''} 탐색기에서 우클릭 → 원본으로 되돌리기로 원래 내용으로 돌아갑니다.`);
      return name;
    }catch(e){o.log(e.message,'error');return null;}
  }
  // "원본으로 되돌리기": the edited copy goes; the generated / SDK file is shown again (Ctrl+Z brings the edit back).
  function revertToOriginal(name){
    try{
      if(o.isRunning())throw new Error('실행을 정지한 뒤 되돌리세요.');
      const p=structuredClone(o.getProject()),file=p.firmware?.files?.find(f=>f.name===name);if(!file)return;
      p.firmware.files=p.firmware.files.filter(f=>f!==file);
      o.applySources(p,o.getSource()===name?'main.c':o.getSource());closedTabs.delete(name);
      const row=projectRows(o.getProject()).find(r=>r.kind!=='own'&&(r.label===name||file.of&&r.file===file.of));
      if(row){if(row.kind==='gen')editor.openGenerated(row.file);else editor.openSdk(row.file).catch(e=>o.log(e.message,'error'));}
      o.log(`${name}을 원본으로 되돌렸습니다. 고친 내용은 Ctrl+Z로 되돌릴 수 있습니다.`);
    }catch(e){o.log(e.message,'error');}
  }
  // The rows of the CubeIDE tree: {kind: 'own' | 'gen' | 'sdk', file, label}. `file` is what opens (a project source
  // name, a generated view, a path under the SDK); `label` is the path CubeIDE shows it at.
  let treeLabels=new Map();const treeOpen=new Set(['Core','Core/Inc','Core/Src','Core/Startup','src','ra_gen']);
  function projectRows(p){
    const family=p.mcu.family,prefix=prefixOf(family),series=prefix.toUpperCase().replace('XX','xx'),hal=`Drivers/${series}_HAL_Driver`,device='Drivers/CMSIS/Device/ST/'+series,base=n=>n.split('/').at(-1);
    const files=sourceFiles(p),ownBase=new Set(files.map(f=>base(f.name))),folder=p.firmware?.mainFolder;
    // A project file without a folder sits where CubeIDE would keep it.
    const place=name=>name.includes('/')||folder?name:/\.(h|hpp)$/.test(name)?'Core/Inc/'+name:/\.s$/.test(name)?'Core/Startup/'+name:/\.ld$/.test(name)?name:'Core/Src/'+name;
    const generatedAll=generatedFiles(),provided=new Set([...generatedAll.map(g=>g.file),`Core/Inc/${prefix}_hal_conf.h`,`Core/Src/system_${prefix}.c`,`Core/Startup/${startupOf(family)}`,...(HAL_MODULES[family]||[]).flatMap(m=>[`${hal}/Src/${prefix}_${m}.c`,`${hal}/Inc/${prefix}_${m}.h`]),`${device}/Include/${prefix}.h`,`${device}/Include/system_${prefix}.h`]);
    const own=files.map(f=>({kind:'own',file:f.name,label:f.name==='main.c'?(folder||'Core/Src')+'/main.c':place(f.name),edited:f.name!=='main.c'&&editedLabel(f,provided)}));
    const gen=generatedAll.filter(g=>!ownBase.has(base(g.file))).map(g=>({kind:'gen',file:g.file,label:g.file}));
    const sdk=[];const add=(file,label=file)=>sdk.push({kind:'sdk',file,label});
    if(!ownBase.has(`${prefix}_hal_conf.h`))add(`${hal}/Inc/${prefix}_hal_conf_template.h`,`Core/Inc/${prefix}_hal_conf.h`);
    if(!ownBase.has(`system_${prefix}.c`))add(`${device}/Source/Templates/system_${prefix}.c`,`Core/Src/system_${prefix}.c`);
    if(![...ownBase].some(n=>/^startup_.*\.s$/i.test(n)))add(`${device}/Source/Templates/gcc/${startupOf(family)}`,`Core/Startup/${startupOf(family)}`);
    for(const m of HAL_MODULES[family]||[]){if(!ownBase.has(`${prefix}_${m}.c`))add(`${hal}/Src/${prefix}_${m}.c`);if(!ownBase.has(`${prefix}_${m}.h`))add(`${hal}/Inc/${prefix}_${m}.h`);}
    if(!ownBase.has(`${prefix}.h`))add(`${device}/Include/${prefix}.h`);if(!ownBase.has(`system_${prefix}.h`))add(`${device}/Include/system_${prefix}.h`);
    return [...own,...gen,...sdk];
  }
  // Feature 21: Developer Assistance — the API calls of this project's stacks; a click puts the call at the cursor of
  // the source being edited, and an item can be dragged into the editor as text.
  const assistOpen=new Set(['g_ioport']),ASSIST_TYPE='application/x-ra-assistance';
  function insertAssist(code,point){
    if(o.isRunning()){o.log('실행을 정지한 뒤 코드를 넣으세요.','error');return;}
    if(editor.externalFile()){o.log('읽기 전용 파일이 열려 있습니다. 프로젝트 소스(hal_entry.c)를 연 뒤 넣으세요.','error');return;}
    o.layout.reveal('code');editor.insert(code+(code.endsWith('\n')?'':'\n'),point);
  }
  // A dragged item is dropped by the app, not by the editor's own text drop (which appends a literal "$0").
  const assistDrag=e=>e.dataTransfer?.types?.includes(ASSIST_TYPE)&&e.target?.closest?.('#group-code');
  document.addEventListener('dragover',e=>{if(assistDrag(e)){e.preventDefault();e.stopPropagation();e.dataTransfer.dropEffect='copy';}},true);
  document.addEventListener('drop',e=>{if(!assistDrag(e))return;const code=e.dataTransfer.getData(ASSIST_TYPE);e.preventDefault();e.stopPropagation();if(code)insertAssist(code,{x:e.clientX,y:e.clientY});},true);
  function assistView(){
    const p=o.getProject(),fsp=p.firmware?.mode==='fsp'&&!!p.mcu;$('ra-assist').hidden=!fsp;if(!fsp){$('ra-assist-list').innerHTML='';return;}
    let groups=[];try{groups=raAssistance(p.mcu);}catch{groups=[];}
    $('ra-assist-list').innerHTML=`<details class="tree-folder" open><summary>HAL/Common</summary><div class="tree-children">${groups.map((g,i)=>`<details class="tree-folder" data-assist="${esc(g.name)}"${assistOpen.has(g.name)?' open':''}><summary title="${esc(g.title)}">${esc(g.name)} <small>${esc(g.title)}</small></summary><div class="tree-children">${g.items.map((it,j)=>`<button data-assist-item="${i}:${j}" draggable="true" class="tree-own" title="${esc(it.code)}"><span class="file-kind">ƒ</span><span class="file-label">${esc(it.label)}</span></button>`).join('')}</div></details>`).join('')}</div></details>`;
    for(const el of $('ra-assist-list').querySelectorAll('[data-assist]'))el.addEventListener('toggle',()=>{if(el.open)assistOpen.add(el.dataset.assist);else assistOpen.delete(el.dataset.assist);});
    for(const el of $('ra-assist-list').querySelectorAll('[data-assist-item]')){
      const [i,j]=el.dataset.assistItem.split(':').map(Number),item=groups[i].items[j];
      el.onclick=()=>insertAssist(item.code);
      el.ondragstart=e=>{e.dataTransfer.setData(ASSIST_TYPE,item.code);e.dataTransfer.effectAllowed='copy';};
    }
  }
  // The rows of an FSP project's tree, as the e² studio project explorer shows it: src (hal_entry.c and the user's
  // sources), ra_gen and ra_cfg (what the configurator generates — "do not edit"), script (linker scripts) and ra (the
  // FSP sources the stacks of this project use: BSP, the r_… modules, their API and instance headers, the board).
  function raRows(p){
    const own=sourceFiles(p).map(f=>({kind:'own',file:f.name,label:f.name==='main.c'?'src/hal_entry.c':f.name.includes('/')?f.name:'src/'+f.name}));
    const gen=generatedFiles().map(g=>({kind:'gen',file:g.file,label:g.file}));
    const sdk=[],add=file=>sdk.push({kind:'sdk',file,label:file}),per=p.mcu.peripherals||{},has=re=>Object.entries(per).some(([id,q])=>re.test(id)&&q?.enabled);
    for(const n of ['bsp_delay.c','bsp_delay.h','bsp_io.c','bsp_io.h','bsp_irq.c','bsp_irq.h','bsp_clocks.c','bsp_common.c','bsp_common.h','bsp_sbrk.c'])add('ra/fsp/src/bsp/mcu/all/'+n);
    for(const n of ['startup.c','system.c'])add('ra/fsp/src/bsp/cmsis/Device/RENESAS/Source/'+n);
    for(const n of ['board.h','board_init.c','board_leds.c','board_leds.h'])add('ra/board/ra6e1_fpb/'+n);
    const modules=[['r_ioport','r_ioport_api.h',true],['r_icu','r_external_irq_api.h',Object.values(p.mcu.pins||{}).some(q=>q.function==='IRQ')],['r_sci_uart','r_uart_api.h',has(/^SCI\d/)],['r_gpt','r_timer_api.h',has(/^GPT\d/)],['r_agt','r_timer_api.h',has(/^AGT\d/)],['r_adc','r_adc_api.h',has(/^ADC\d/)],['r_iic_master','r_i2c_master_api.h',has(/^IIC\d/)]];
    const apis=new Set();
    for(const [m,api,used]of modules)if(used){add(`ra/fsp/src/${m}/${m}.c`);add(`ra/fsp/inc/instances/${m}.h`);if(!apis.has(api)){apis.add(api);add('ra/fsp/inc/api/'+api);}}
    return [...own,...gen,...sdk];
  }
  function buildFilesView(){
    const p=o.getProject(),hal=p.firmware?.mode==='hal'&&!!p.mcu,fsp=p.firmware?.mode==='fsp'&&!!p.mcu;$('build-files').hidden=!hal&&!fsp;$('build-files-title').textContent=fsp?'프로젝트 구조 (e² studio)':'프로젝트 구조 (CubeIDE)';if(!hal&&!fsp){$('build-file-list').innerHTML='';return;}
    // Feature 14: the project as CubeIDE lays it out — the .ioc, Core/Inc, Core/Src, Core/Startup, Drivers and the
    // linker script — with the project's own files (plain) next to what the build provides (italic). Feature 45: those
    // are edited in place; an edited one is a project file (marked "수정됨"), which the build uses in its place.
    // Feature 20: an FSP project as e² studio lays it out — src, ra_gen, ra_cfg, script and ra (FSP itself).
    const rows=fsp?raRows(p):projectRows(p),ext=editor.externalFile()?.file,active=o.getSource();treeLabels=new Map(rows.map(r=>[r.file,r.label]));
    const root={folders:new Map(),files:[]};
    for(const r of rows){const parts=r.label.split('/');let node=root;for(const part of parts.slice(0,-1)){if(!node.folders.has(part))node.folders.set(part,{folders:new Map(),files:[]});node=node.folders.get(part);}node.files.push({...r,leaf:parts.at(-1)});}
    const kindOf=n=>/\.ioc$/.test(n)?'M':/\.ld$/.test(n)?'L':/\.s$/i.test(n)?'S':/\.(h|hpp)$/.test(n)?'H':'C';
    const fileRow=r=>r.kind==='own'
      ?`<button data-tree-source="${esc(r.file)}" class="tree-own${r.edited?' tree-edited':''}${!ext&&r.file===active?' active':''}" title="${esc(r.label)} · ${r.edited?'고친 파일 · 우클릭: 원본으로 되돌리기':'프로젝트 파일'}"${r.edited?' data-tree-edited':''}><span class="file-kind">${kindOf(r.leaf)}</span><span class="file-label">${esc(r.leaf)}</span>${r.edited?'<span class="tree-edited-mark" aria-label="수정됨">●</span>':''}</button>`
      :`<button data-build-file="${esc(r.file)}" data-build-kind="${r.kind}" class="${ext===r.file?'active':''}" title="${esc(r.kind==='gen'?'STM Simulator가 빌드에 넣는 코드':'STM32Cube SDK '+r.file)}${/\.ioc$/.test(r.leaf)||fsp?' · 읽기 전용':' · 바로 고칠 수 있음(고친 파일만 프로젝트에 저장)'}"><span class="file-kind">${kindOf(r.leaf)}</span><span class="file-label">${esc(r.leaf)}</span></button>`;
    const render=(node,path)=>[...[...node.folders].sort(([x],[y])=>x.localeCompare(y)).map(([name,child])=>{const full=path?path+'/'+name:name;return `<details class="tree-folder" data-tree-folder="${esc(full)}"${treeOpen.has(full)?' open':''}><summary>${esc(name)}</summary><div class="tree-children">${render(child,full)}</div></details>`;}),...node.files.sort((x,y)=>x.leaf.localeCompare(y.leaf)).map(fileRow)].join('');
    $('build-file-list').innerHTML=render(root,'');
    for(const el of $('build-file-list').querySelectorAll('[data-tree-folder]'))el.addEventListener('toggle',()=>{if(el.open)treeOpen.add(el.dataset.treeFolder);else treeOpen.delete(el.dataset.treeFolder);});
    for(const el of $('build-file-list').querySelectorAll('[data-tree-source]'))el.onclick=()=>{o.layout.reveal('code');select(el.dataset.treeSource);};
    for(const el of $('build-file-list').querySelectorAll('[data-tree-edited]'))el.oncontextmenu=e=>{e.preventDefault();treeMenu(e.clientX,e.clientY,el.dataset.treeSource);};
    for(const el of $('build-file-list').querySelectorAll('[data-build-file]'))el.onclick=async()=>{o.layout.reveal('code');document.querySelector('[data-tab="code"]')?.click();try{if(el.dataset.buildKind==='gen')editor.openGenerated(el.dataset.buildFile);else await editor.openSdk(el.dataset.buildFile);}catch(e){o.log(e.message,'error');}};
  }
  // Feature 11's "프로젝트로 복사해 수정" became editing in place (feature 45, adoptExternal above).
  const tabIds=()=>[...$('source-tabs').querySelectorAll('[data-tab-id]')].map(el=>el.dataset.tabId);
  // Closes tabs by id (a project file or a board program by name, an SDK file as "sdk:<file>"). When the tab on screen
  // goes, the nearest tab left takes its place (the one to the right first); with none left the editor shows the note.
  function closeTabs(ids){
    const order=tabIds(),shownId=editor.externalFile()?'sdk:'+editor.externalFile().file:o.getSource(),at=order.indexOf(shownId);
    // The read-only tabs first: closing one redraws the row, and that redraw gives the file then on screen its tab back.
    for(const id of ids)if(id.startsWith('sdk:'))editor.closeExternal(id.slice(4));
    for(const id of ids)if(!id.startsWith('sdk:'))closedTabs.add(id);
    if(ids.includes(shownId)){
      const left=order.filter(id=>!ids.includes(id)),next=left.find(id=>order.indexOf(id)>at)??left.at(-1);
      if(!next)emptyTabs=true;else if(next.startsWith('sdk:'))editor.showExternal(next.slice(4));else{select(next);return;}
    }
    tabsView();
  }
  const closeAllTabs=()=>closeTabs(tabIds());
  // The tab menu: on a tab (right click) or from the ⋯ button at the end of the row.
  const menu=document.createElement('div');menu.id='tab-menu';menu.className='tab-menu';menu.setAttribute('role','menu');menu.hidden=true;document.body.append(menu);
  const hideTabMenu=()=>{menu.hidden=true;};
  document.addEventListener('pointerdown',e=>{if(!menu.hidden&&!menu.contains(e.target))hideTabMenu();},true);
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!menu.hidden)hideTabMenu();},true);
  function tabMenu(x,y,id){
    const order=tabIds(),at=order.indexOf(id),items=id?[['close','닫기',[id]],['others','다른 탭 닫기',order.filter(t=>t!==id)],['right','오른쪽 탭 닫기',order.slice(at+1)],['all','모두 닫기',order]]:[['all','모두 닫기',order]];
    menu.innerHTML=items.map(([key,label,list])=>`<button type="button" role="menuitem" data-tab-action="${key}" ${list.length?'':'disabled'}>${label}${key==='all'?'<small>Ctrl+K W</small>':''}</button>`).join('');
    for(const [key,,list]of items)menu.querySelector(`[data-tab-action="${key}"]`).onclick=()=>{hideTabMenu();
      // "다른 탭 닫기" leaves the tab that was right-clicked as the one on screen.
      if(key==='others'&&id){if(id.startsWith('sdk:'))editor.showExternal(id.slice(4));else if(editor.externalFile()||o.getSource()!==id)select(id);}
      closeTabs(list);};
    menu.hidden=false;menu.style.left=Math.max(4,Math.min(x,innerWidth-menu.offsetWidth-4))+'px';menu.style.top=Math.max(4,Math.min(y,innerHeight-menu.offsetHeight-4))+'px';menu.querySelector('button:not([disabled])')?.focus();
  }
  // Open tabs: project files, other boards' programs, then SDK files opened by go to definition (read only, ×).
  function tabsView(){
    const files=sourceFiles(o.getProject()),boards=boardSourceFiles(o.getProject()),active=o.getSource(),ext=editor.externalFile(),base=f=>f.split('/').at(-1);
    const all=[...files.map(f=>({name:f.name,label:shown(f.name)})),...boards];
    for(const name of [...closedTabs])if(!all.some(f=>f.name===name))closedTabs.delete(name);
    // The file on screen always has its tab (a jump from the debugger or the problems list opens it).
    if(!emptyTabs)closedTabs.delete(active);
    const on=name=>!ext&&!emptyTabs&&name===active;
    $('source-tabs').innerHTML=all.filter(f=>!closedTabs.has(f.name)).map(f=>`<span class="source-tab${on(f.name)?' active':''}" data-tab-id="${esc(f.name)}"><button data-source="${esc(f.name)}" class="${on(f.name)?'active':''}">${esc(f.label)}</button><button class="source-tab-close" data-tab-close="${esc(f.name)}" aria-label="${esc(f.label)} 닫기" title="닫기">×</button></span>`).join('')
      +editor.externalFiles().map(f=>`<span class="source-tab-sdk${ext?.file===f.file?' active':''}" data-tab-id="sdk:${esc(f.file)}"><button data-sdk-file="${esc(f.file)}" title="${esc(f.sdk+' › '+f.file)}${canEditExternal(f.file)?' · 고치면 이 파일만 프로젝트에 저장':' · 읽기 전용'}">${esc(base(f.file))}</button><button class="source-tab-close" data-sdk-close="${esc(f.file)}" aria-label="${esc(base(f.file))} 닫기" title="닫기">×</button></span>`).join('');
    for(const el of $('source-tabs').querySelectorAll('[data-source]'))el.onclick=()=>select(el.dataset.source);
    for(const el of $('source-tabs').querySelectorAll('[data-sdk-file]'))el.onclick=()=>editor.showExternal(el.dataset.sdkFile);
    for(const el of $('source-tabs').querySelectorAll('[data-sdk-close]'))el.onclick=e=>{e.stopPropagation();closeTabs(['sdk:'+el.dataset.sdkClose]);};
    for(const el of $('source-tabs').querySelectorAll('[data-tab-close]'))el.onclick=e=>{e.stopPropagation();closeTabs([el.dataset.tabClose]);};
    for(const el of $('source-tabs').querySelectorAll('[data-tab-id]'))el.oncontextmenu=e=>{e.preventDefault();tabMenu(e.clientX,e.clientY,el.dataset.tabId);};
    $('source-tabs').insertAdjacentHTML('beforeend','<button type="button" id="tabs-more" class="tabs-more" title="탭 메뉴 (모두 닫기 Ctrl+K W)" aria-label="탭 메뉴" aria-haspopup="menu">⋯</button>');
    $('tabs-more').onclick=e=>{const r=e.currentTarget.getBoundingClientRect();tabMenu(r.left,r.bottom,null);};
    $('code-panel').classList.toggle('no-tabs',emptyTabs&&!ext);
    // Where the file lives in the SDK (CubeIDE shows it in the title bar), like the Drivers folder of a Cube project.
    $('source-path').hidden=!ext;$('code-panel').classList.toggle('sdk-open',!!ext);$('source-path').innerHTML=ext?`<span>${esc(ext.sdk)}</span>${ext.file.split('/').map(p=>`<span>${esc(p)}</span>`).join('')}<em>${externalNote(ext.file)} · Alt+← 돌아가기</em>`:'';
    buildFilesView();assistView();outlineView();
  }
  // What the path line says about the external file on screen (feature 45).
  function externalNote(file){
    if(!canEditExternal(file))return '읽기 전용';
    const label=treeLabels.get(file)||file,family=o.getProject().mcu?.family;
    return `고치면 이 파일만 프로젝트에 저장 · ${regenerated(label,family)?'다시 생성하면 USER CODE 구역 밖은 새로 써짐':'한 번 만드는 파일 · 고친 내용 유지'}${armOnly(label)?' · ARM GCC 빌드에서만 쓰임':''}`;
  }
  // The project tree's menu on an edited file: "원본으로 되돌리기".
  function treeMenu(x,y,name){
    menu.innerHTML='<button type="button" role="menuitem" data-tree-action="revert">원본으로 되돌리기</button>';
    menu.querySelector('[data-tree-action="revert"]').onclick=()=>{hideTabMenu();revertToOriginal(name);};
    menu.hidden=false;menu.style.left=Math.max(4,Math.min(x,innerWidth-menu.offsetWidth-4))+'px';menu.style.top=Math.max(4,Math.min(y,innerHeight-menu.offsetHeight-4))+'px';menu.querySelector('button')?.focus();
  }
  let outlineTimer;
  function outlineView(){
    const ext=editor.externalFile(),q=$('outline-filter').value.trim().toLowerCase(),items=editor.outline().filter(s=>!q||s.name.toLowerCase().includes(q)),shown=items.slice(0,600);
    $('outline-file').textContent=ext?ext.file.split('/').at(-1):o.getSource();
    $('outline-list').innerHTML=shown.map(s=>`<button data-outline-line="${s.line}" data-outline-column="${s.column}" class="outline-${s.kind}" title="${esc(OUTLINE_KIND[s.kind]?.[1]||s.kind)} · ${s.line}행"><span class="outline-kind">${OUTLINE_KIND[s.kind]?.[0]||'?'}</span><span class="outline-label">${esc(outlineLabel(s))}</span></button>`).join('')
      +(items.length>shown.length?`<p class="outline-more">외 ${items.length-shown.length}개 · 검색으로 좁히세요</p>`:items.length?'':'<p class="outline-more">항목 없음</p>');
    for(const el of $('outline-list').querySelectorAll('[data-outline-line]'))el.onclick=()=>{o.layout.reveal('code');editor.goto(Number(el.dataset.outlineLine),Number(el.dataset.outlineColumn));};
  }
  $('outline-filter').oninput=outlineView;
  editor.onContent(()=>{clearTimeout(outlineTimer);outlineTimer=setTimeout(outlineView,400);});
  document.addEventListener('ide-notice',e=>o.log(e.detail,'error'));
  function controls(){const running=o.isRunning(),r=o.getSession()?.runtime,paused=!!r?.debug.paused;
    native?.controls();if(native?.selected())return;
    for(const id of ['source-add','source-rename','source-delete','ide-build','debug-start'])$(id).disabled=running;
    for(const id of ['source-rename','source-delete'])$(id).disabled=running||o.getSource()==='main.c'||isBoardFile(o.getSource());
  }
  function build({reveal=true}={}){
    if(o.isRunning())return null;editor.diagnostics([]);$('build-errors').replaceChildren();if(reveal)showMonitor('build');
    try{const p=o.getProject(),program=p.firmware?.mode==='fsp'?compileFsp(p.code,p.firmware.files,p.mcu):p.firmware?.mode==='hal'?compileHal(p.code,halFiles(p),p.mcu?.family):compile(p.code);built=program;$('build-status').textContent='빌드 통과';$('build-output').textContent=`빌드 성공 · ${sourceFiles(p).length}개 파일 · ${Object.keys(program.functions).length}개 함수\n시뮬레이터 실행 프로그램을 준비했습니다. 전원·배선·HAL 설정은 실행 시 검사합니다.`;return program;}
    catch(e){built=null;$('build-status').textContent='빌드 실패';$('build-output').textContent='빌드 실패 — 아래 항목을 누르면 오류 위치로 이동합니다.';const m=/^(?:(.+?):)?(\d+)(?:행)?:/.exec(e.message),loc=e.location||{file:m?.[1]||'main.c',line:Number(m?.[2]||1)},d={...loc,message:e.message};editor.diagnostics([d]);const b=document.createElement('button');b.className='build-error';b.textContent=e.message;b.onclick=()=>select(loc.file,loc.line);$('build-errors').append(b);return null;}
  }
  let stackFrame=0;
  function debugView(){
    if(native?.selected())return native.debugView();
    const r=o.getSession()?.runtime,paused=!!r?.debug.paused;editor.updateDebug(points(),paused?r.location:null);controls();
    $('debug-breakpoints').innerHTML=points().map(b=>`<button class="debug-frame" data-breakpoint="${esc(b.file)}:${b.line}">${esc(b.file)}:${b.line} · 해제</button>`).join('')||'<span>설정된 중단점 없음</span>';
    for(const el of $('debug-breakpoints').querySelectorAll('button'))el.onclick=()=>{const [file,line]=el.dataset.breakpoint.split(':');toggleBreakpoint(file,Number(line));};
    if(!paused){lastPause='';$('debug-location').textContent=o.isRunning()?'실행 중 — 일시정지하면 변수와 호출 스택을 표시합니다.':'디버그 시작 또는 F9로 중단점을 설정하세요.';for(const id of ['debug-locals','debug-globals','debug-stack'])$(id).replaceChildren();
      // Saved watches stay listed (and removable) while not paused; values appear at the next pause.
      $('watch-values').innerHTML=watches().map((expression,index)=>`<div class="watch-row"><button title="감시식 제거" data-remove-watch="${index}">${esc(expression)}</button><div>일시정지하면 값을 표시합니다</div></div>`).join('');
      for(const el of document.querySelectorAll('[data-remove-watch]'))el.onclick=()=>{o.checkpoint();settings().watches.splice(Number(el.dataset.removeWatch),1);o.saveLocal();debugView();};
      return;}
    // The firmware emulator's runtime exposes its own inspector (symbols, registers).
    const pauseKey=`${r.microTime}:${r.location?.file}:${r.location?.line}:${r.depth}`;if(pauseKey!==lastPause)stackFrame=0;
    const state=typeof r.inspect==='function'?r.inspect():inspectRuntime(r,stackFrame),key=pauseKey;
    $('debug-location').textContent=`일시정지 · ${state.location.file}:${state.location.line} · ${(r.microTime/1000).toFixed(3)} ms`;
    if(lastPause!==key){lastPause=key;select(state.location.file,state.location.line);showMonitor('debug');}
    const table=rows=>rows.map(row=>`<tr><td title="${esc(row.type)}">${esc(row.name)}</td><td>${esc(row.value)}</td></tr>`).join('')||'<tr><td>없음</td></tr>';
    $('debug-locals').innerHTML=table(state.locals);$('debug-globals').innerHTML=table(state.globals);
    if(state.registers){$('native-debug-details').hidden=false;$('native-registers').innerHTML=state.registers.map(x=>`<tr><td>${esc(x.name)}</td><td>${esc(x.value)}</td></tr>`).join('');}
    $('debug-stack').innerHTML=state.frames.map((f,i)=>`<button class="debug-frame${i===stackFrame?' active':''}" data-stack-index="${i}" data-stack-file="${esc(f.loc?.file||'main.c')}" data-line="${f.loc?.line||1}">${esc(f.name)}() · ${esc(f.loc?.file||'main.c')}:${f.loc?.line||1}</button>`).join('');
    for(const el of $('debug-stack').querySelectorAll('button'))el.onclick=()=>{stackFrame=Number(el.dataset.stackIndex);select(el.dataset.stackFile,Number(el.dataset.line));debugView();};
    $('watch-values').innerHTML=watches().map((expression,index)=>{let value;try{value=typeof r.memory==='function'?r.evaluate(expression):watchValue(r,expression,stackFrame);}catch(e){value=e.message;}return `<div class="watch-row"><button title="감시식 제거" data-remove-watch="${index}">${esc(expression)}</button><div>${esc(value)}</div></div>`;}).join('');
    for(const el of document.querySelectorAll('[data-remove-watch]'))el.onclick=()=>{o.checkpoint();settings().watches.splice(Number(el.dataset.removeWatch),1);o.saveLocal();debugView();};
  }
  $('watch-form').onsubmit=e=>{e.preventDefault();const text=$('watch-expression').value.trim();if(!text||watches().includes(text)||watches().length>=20)return;o.checkpoint();settings().watches.push(text);$('watch-expression').value='';o.saveLocal();debugView();};
  const doBuild=()=>native?.selected()?native.build():native?.emulator()?o.buildFirmware?.():build(),doDebug=command=>{
    if(native?.selected())return native.command(command);
    const r=o.getSession()?.runtime,paused=!!r?.debug.paused;
    if(command==='start'&&o.isRunning()||command==='pause'&&(!r||paused)||command==='stop'&&!o.isRunning())return;
    if(['into','over','out'].includes(command)&&(!paused||command==='out'&&r.depth<=1))return;
    o.debugCommand(command);
  };
  $('ide-build').onclick=doBuild;$('firmware-check').onclick=doBuild;
  $('debug-start').onclick=()=>doDebug('start');$('debug-start').title=withKey('시작 위치에서 디버깅','run.debug');
  const fileDialog=action=>{fileAction=action;$('source-dialog-title').textContent={add:'소스 파일 추가',rename:'소스 파일 이름 변경',delete:'소스 파일 삭제'}[action];$('source-name').value=action==='add'?'user.c':o.getSource();$('source-name').readOnly=action==='delete';$('source-form-error').textContent='';$('source-dialog').showModal();};
  $('source-add').onclick=()=>fileDialog('add');$('source-rename').onclick=()=>fileDialog('rename');$('source-delete').onclick=()=>fileDialog('delete');$('source-cancel').onclick=()=>$('source-dialog').close();
  $('source-form').onsubmit=e=>{e.preventDefault();try{if(o.isRunning())throw new Error('실행을 정지한 뒤 파일을 변경하세요.');const old=o.getSource(),name=$('source-name').value.trim(),p=changeSourceFile(o.getProject(),fileAction,fileAction==='add'?name:old,name);if(p.ide){p.ide.breakpoints=p.ide.breakpoints.filter(b=>fileAction!=='delete'||b.file!==old).map(b=>fileAction==='rename'&&b.file===old?{...b,file:name}:b);}o.applySources(p,fileAction==='delete'?'main.c':name);$('source-dialog').close();sync();}catch(e){$('source-form-error').textContent=e.message;}};
  // Templates follow the chosen board: examples that need F4-only peripherals are hidden for the F103RB.
  // A Renesas RA board has e² studio's templates (Bare Metal - Minimal / Blinky) and the FSP examples; an STM32 board the
  // HAL ones.
  const filterTemplates=()=>{const board=getBoard($('new-project-board').value)??getBoard(DEFAULT_BOARD_ID),ra=isRaFamily(board.mcuFamily),rows=new Map(ra?[]:searchHalExamples('',board.mcuFamily).map(r=>[r.id,r])),select=$('new-project-template');
    for(const option of select.options)if(option.dataset.ra!==undefined||option.value==='blank'){const show=(option.dataset.ra!==undefined)===ra;option.hidden=option.disabled=!show;}
    if(ra){for(const option of select.options)if(option.dataset.ra===undefined&&option.value!=='blank')option.hidden=option.disabled=true;if(select.selectedOptions[0]?.hidden)select.value='ra-minimal';return;}
    for(const option of select.options)if(!['blank','native-host'].includes(option.value)&&option.dataset.ra===undefined){option.hidden=option.disabled=!rows.has(option.value);if(rows.has(option.value))option.textContent=rows.get(option.value).name;}if(select.selectedOptions[0]?.hidden)select.value='blank';};
  $('new-project-board').onchange=filterTemplates;
  $('new').onclick=()=>o.requestReplace(()=>{$('project-form-error').textContent='';filterTemplates();$('project-dialog').showModal();});$('project-cancel').onclick=()=>$('project-dialog').close();
  $('project-folder-choose').disabled=!window.desktop?.chooseProjectParent;
  $('project-folder-choose').onclick=async()=>{try{const path=await window.desktop.chooseProjectParent();if(path)$('new-project-folder').value=path;}catch(e){$('project-form-error').textContent=e.message;}};
  $('project-form').onsubmit=async e=>{e.preventDefault();$('project-create').disabled=true;try{const name=$('new-project-name').value.trim();if(!name)throw new Error('프로젝트 이름을 입력하세요.');const board=getBoard($('new-project-board').value)??getBoard(DEFAULT_BOARD_ID),template=$('new-project-template').value;
    // An RA project: the board's pins (LED1, LED2, S1) as Board Select gives them, with the template's hal_entry.c.
    if(isRaFamily(board.mcuFamily)){let q={...blankProject(board.mcuFamily),boardId:board.id,name};const ex=raExample(template);if(template==='ra-blinky')q.code=raHalEntry({blink:true});else if(ex){q.mcu=ex.mcu();q.code=ex.code;if(ex.circuit){const c=ex.circuit();q.components=c.components;q.wires=c.wires;delete q.surfaces;}}q=validateProject(q);const directory=$('new-project-folder').value?await window.desktop.createWorkspace({name,text:JSON.stringify(q)}):'';o.replaceProject(q,{preserveWorkspace:!!directory});folder=directory;sync();$('project-dialog').close();select('main.c');return;}
    let p=['blank','native-host'].includes(template)?{...blankProject(board.mcuFamily),boardId:board.id}:applyHalExample({...blankProject(board.mcuFamily),boardId:board.id},template);p.name=name;p.firmware.files.push({name:'main.h',text:`#pragma once\n#include "${familyProfile(board.mcuFamily).hal.prefix}_hal.h"\nvoid Error_Handler(void);\n`});if($('new-project-template').value==='native-host'){p.code='#include <stdio.h>\nint main(void) {\n  int value=21;\n  printf("Hello from STM Simulator: %d\\n",value*2);\n  return 0;\n}\n';p.firmware.files=[{name:'main.h',text:'#pragma once\n'}];p.ide={breakpoints:[],watches:[],native:{target:'host',configuration:'Debug'}};}p=validateProject(p);const directory=$('new-project-folder').value?await window.desktop.createWorkspace({name,text:JSON.stringify(p)}):'';o.replaceProject(p,{preserveWorkspace:!!directory});folder=directory;sync();$('project-dialog').close();select('main.c');}catch(e){$('project-form-error').textContent=e.message;}finally{$('project-create').disabled=false;}};
  $('workspace-open').disabled=!window.desktop?.openWorkspace;$('workspace-open').onclick=()=>o.requestReplace(async()=>{try{const opened=await window.desktop.openWorkspace();if(!opened)return;o.replaceProject(validateProject(JSON.parse(opened.text)),{preserveWorkspace:true});folder=opened.directory;sync();o.feedback.clear('open');}catch(e){o.log(e.message,'error');o.feedback.show('프로젝트를 열지 못했습니다. 현재 작업은 유지됩니다. 파일과 폴더를 확인해 다시 열어 주세요.','open');}});
  document.addEventListener('ide-open-source',e=>select(e.detail.file,e.detail.line));
  let languageService=null;const setService=editor.setLanguageService;editor.setLanguageService=service=>{languageService=service;setService(service);};
  const formatter=setupCodeFormat({code:editor,textarea:$('code'),lsp:{enabled:()=>!!languageService?.enabled()},log:o.log});
  native=setupNativeIde({o,editor,select,showMonitor,points,watches,toggleBreakpoint});
  return {closeAllTabs,sync,controls,build,editor,debugView,debug:doDebug,format:()=>formatter.formatDocument(),formatSelection:()=>formatter.formatSelection(),emulator:()=>!!native?.emulator(),gccSimulation:tools=>!!native?.gccSimulation(tools),ensureSimTools:()=>native?native.ensureSimTools():Promise.resolve('interpreter'),recheckTools:()=>native?native.recheckTools():Promise.resolve(false),nativePaused:()=>!!native?.paused(),buildElf:source=>native.buildElf(source),connectedBoards:()=>native?.boards?.()||[],nativeBusy:()=>native.busy(),breakpoints:()=>points().map(b=>`${b.file}:${b.line}`),invalidate(){built=null;sourceKey=JSON.stringify([o.getProject().firmware?.mode,sourceFiles(o.getProject())]);$('build-status').textContent='변경됨 · 빌드 필요';editor.diagnostics([]);native.queueLanguage();
    // The configuration changed (Pinout / RA Configuration applied): the project tree, Developer Assistance and an open
    // generated file follow the new stacks.
    editor.refreshGenerated();buildFilesView();assistView();},reset({preserveWorkspace=false}={}){closedTabs.clear();emptyTabs=false;if(!preserveWorkspace)window.desktop?.clearWorkspace?.().catch(e=>o.log(e.message,'error'));folder='';built=null;lastPause='';sourceKey='';$('build-status').textContent='시뮬레이터용 빌드';editor.diagnostics([]);native.reset();sync();},async saveWorkspace(text){if(!folder)return false;await window.desktop.saveWorkspace(text);return true;}};
}
