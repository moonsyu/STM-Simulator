import {createCodeEditor} from './generated/code-editor.js';
import {compile} from './parser.js';
import {compileHal} from './hal-source.js';
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
import {exportIoc} from './ioc-export.js';
import {isRaFamily} from './ra-config.js';
import {RA_EXAMPLES,raExample} from './ra-examples.js';
import {raHalEntry} from './ra-generator.js';
import {generateRaFiles} from './ra-generator.js';
export function mountIdeChrome(){
  const toolbar=document.createElement('nav');toolbar.className='ide-toolbar';toolbar.setAttribute('aria-label','빌드와 디버그');toolbar.innerHTML='<button id="ide-build" class="primary" title="시뮬레이터용 빌드">빌드</button><span class="toolbar-divider"></span><button id="debug-start" title="시작 위치에서 디버깅">디버그 시작</button><span id="build-status" role="status">시뮬레이터용 빌드</span>';
  document.querySelector('.topbar').after(toolbar);toolbar.prepend(document.querySelector('.run-tools'));
  const tree=document.createElement('section');tree.className='project-files';tree.innerHTML='<div class="project-files-title"><strong>소스 파일</strong><button id="source-add">파일 추가</button></div><nav id="file-tree" aria-label="프로젝트 파일"></nav><div class="file-tools"><button id="source-rename">이름 변경</button><button id="source-delete">삭제</button></div><details id="build-files" class="build-files" hidden><summary><span id="build-files-title">Core · Startup</span> <small>빌드에 들어가는 파일 · 읽기 전용</small></summary><nav id="build-file-list" aria-label="빌드 파일"></nav></details><div class="project-folder-note" id="workspace-path">미저장 프로젝트</div>';
  document.querySelector('.library').prepend(tree);
  // CubeIDE's Outline: the structure of the file on screen (project or SDK); the file tree keeps the project files only.
  const outline=document.createElement('section');outline.className='project-files outline-view';outline.innerHTML='<div class="project-files-title"><strong>코드 개요 (Outline)</strong><span id="outline-file"></span></div><input id="outline-filter" type="search" placeholder="개요 검색" aria-label="코드 개요 검색"><nav id="outline-list" aria-label="코드 개요"></nav>';tree.after(outline);
  const tabs=document.createElement('nav');tabs.className='source-tabs';tabs.id='source-tabs';tabs.setAttribute('aria-label','열린 소스');$('code-panel').prepend(tabs);
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
  const editor=createCodeEditor({textarea:$('code'),getFile:o.getSource,getFiles:()=>sourceFiles(o.getProject()),onBreakpoint:toggleBreakpoint,onBreakpointsMoved:(file,moved)=>{const unique=[...new Map(moved.map(b=>[b.line,b])).values()];settings().breakpoints=[...points().filter(b=>b.file!==file),...unique];o.saveLocal();debugView();},onPosition:p=>{$('cursor-position').textContent=`줄 ${p?.lineNumber||1}, 열 ${p?.column||1}`;},getFamily:()=>o.getProject().mcu?.family||'STM32F446RE',getGenerated:()=>generatedFiles(),onExternal:()=>tabsView()});
  function select(file,line,column){editor.showProject();o.selectSource(file);o.layout.reveal('code');document.querySelector('[data-tab="code"]').click();if(line)editor.goto(line,column);}
  // The debug view lives in the side bar; every other monitor is a bottom-panel tab.
  function showMonitor(name){if(name==='debug'){o.layout.showView('debug');return;}o.layout.showPanel(name);}
  function toggleBreakpoint(file,line){if(!Number.isInteger(line)||line<1||isBoardFile(file))return;o.checkpoint();const p=settings(),i=p.breakpoints.findIndex(b=>b.file===file&&b.line===line);if(i<0)p.breakpoints.push({file,line});else p.breakpoints.splice(i,1);const r=o.getSession()?.runtime;if(r)r.debug.breakpoints=new Set(points().map(b=>`${b.file}:${b.line}`));o.saveLocal();native?.syncBreakpoints();debugView();}
  // An FSP project's main source is e² studio's src/hal_entry.c (stored as the project's main file).
  const shown=name=>name==='main.c'&&o.getProject().firmware?.mode==='fsp'?'hal_entry.c':name;
  function sync(){
    const focused=document.activeElement?.closest('[data-source]'),focusSource=focused?.dataset.source,focusContainer=focused?.parentElement.id;
    const files=sourceFiles(o.getProject()),active=o.getSource(),key=JSON.stringify([o.getProject().firmware?.mode,files]);if(sourceKey&&sourceKey!==key){built=null;$('build-status').textContent='변경됨 · 빌드 필요';editor.diagnostics([]);}sourceKey=key;
    // Other boards' programs follow the STM32 sources, labelled with the board name.
    const boards=boardSourceFiles(o.getProject());
    // A file kept in a folder (Core/Src/app.c) shows its name with the folder beside it, as the build file list does.
    const folderOfFile=name=>name==='main.c'?(o.getProject().firmware?.mainFolder??''):name.split('/').slice(0,-1).join('/'),leaf=name=>shown(name).split('/').at(-1);
    $('file-tree').innerHTML=[...files].sort((a,b)=>folderOfFile(a.name).localeCompare(folderOfFile(b.name))).map(f=>`<button data-source="${esc(f.name)}" class="${f.name===active?'active':''}" title="${esc((folderOfFile(f.name)?folderOfFile(f.name)+'/':'')+leaf(f.name))}"><span class="file-kind">${f.name.endsWith('.h')?'H':'C'}</span><span class="file-label">${esc(leaf(f.name))}</span>${folderOfFile(f.name)?`<small>${esc(folderOfFile(f.name))}</small>`:''}</button>`).join('')+boards.map(f=>`<button data-source="${esc(f.name)}" class="${f.name===active?'active':''}" title="${esc(f.label)}"><span class="file-kind">${f.name.endsWith('.py')?'PY':'INO'}</span><span class="file-label">${esc(f.label)}</span></button>`).join('');
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
    return [...buildEnvironment(p).files,...ioc];}
  // The rows of the CubeIDE tree: {kind: 'own' | 'gen' | 'sdk', file, label}. `file` is what opens (a project source
  // name, a generated view, a path under the SDK); `label` is the path CubeIDE shows it at.
  let treeLabels=new Map();const treeOpen=new Set(['Core','Core/Inc','Core/Src','Core/Startup']);
  function projectRows(p){
    const family=p.mcu.family,prefix=prefixOf(family),series=prefix.toUpperCase().replace('XX','xx'),hal=`Drivers/${series}_HAL_Driver`,device='Drivers/CMSIS/Device/ST/'+series,base=n=>n.split('/').at(-1);
    const files=sourceFiles(p),ownBase=new Set(files.map(f=>base(f.name))),folder=p.firmware?.mainFolder;
    // A project file without a folder sits where CubeIDE would keep it.
    const place=name=>name.includes('/')||folder?name:/\.(h|hpp)$/.test(name)?'Core/Inc/'+name:/\.s$/.test(name)?'Core/Startup/'+name:/\.ld$/.test(name)?name:'Core/Src/'+name;
    const own=files.map(f=>({kind:'own',file:f.name,label:f.name==='main.c'?(folder||'Core/Src')+'/main.c':place(f.name)}));
    const gen=generatedFiles().filter(g=>!ownBase.has(base(g.file))).map(g=>({kind:'gen',file:g.file,label:g.file}));
    const sdk=[];const add=(file,label=file)=>sdk.push({kind:'sdk',file,label});
    if(!ownBase.has(`${prefix}_hal_conf.h`))add(`${hal}/Inc/${prefix}_hal_conf_template.h`,`Core/Inc/${prefix}_hal_conf.h`);
    if(!ownBase.has(`system_${prefix}.c`))add(`${device}/Source/Templates/system_${prefix}.c`,`Core/Src/system_${prefix}.c`);
    if(![...ownBase].some(n=>/^startup_.*\.s$/i.test(n)))add(`${device}/Source/Templates/gcc/${startupOf(family)}`,`Core/Startup/${startupOf(family)}`);
    for(const m of HAL_MODULES[family]||[]){if(!ownBase.has(`${prefix}_${m}.c`))add(`${hal}/Src/${prefix}_${m}.c`);if(!ownBase.has(`${prefix}_${m}.h`))add(`${hal}/Inc/${prefix}_${m}.h`);}
    add(`${device}/Include/${prefix}.h`);add(`${device}/Include/system_${prefix}.h`);
    return [...own,...gen,...sdk];
  }
  function buildFilesView(){
    const p=o.getProject(),hal=p.firmware?.mode==='hal'&&!!p.mcu,fsp=p.firmware?.mode==='fsp'&&!!p.mcu;$('build-files').hidden=!hal&&!fsp;$('build-files-title').textContent=fsp?'ra_gen · ra_cfg':'프로젝트 구조 (CubeIDE)';if(!hal&&!fsp){$('build-file-list').innerHTML='';return;}
    if(fsp){const ext=editor.externalFile()?.file;$('build-file-list').innerHTML=generatedFiles().map(g=>`<button data-build-file="${esc(g.file)}" data-build-kind="gen" class="${ext===g.file?'active':''}" title="RA Smart Configurator 방식으로 앱이 만드는 FSP 파일 · 읽기 전용"><span class="file-kind">${/\.ld$/.test(g.file)?'L':/\.h$/.test(g.file)?'H':'C'}</span><span class="file-label">${esc(g.file.split('/').at(-1))}</span><small>${esc(g.file.split('/').slice(0,-1).join('/'))}</small></button>`).join('');for(const el of $('build-file-list').querySelectorAll('[data-build-file]'))el.onclick=()=>{o.layout.reveal('code');document.querySelector('[data-tab="code"]')?.click();editor.openGenerated(el.dataset.buildFile);};return;}
    // Feature 14: the project as CubeIDE lays it out — the .ioc, Core/Inc, Core/Src, Core/Startup, Drivers and the
    // linker script — with the project's own files (plain) next to what the build provides (italic, read only until
    // "프로젝트로 복사해 수정" makes a project file of it, which the build then uses in its place).
    const rows=projectRows(p),ext=editor.externalFile()?.file,active=o.getSource();treeLabels=new Map(rows.map(r=>[r.file,r.label]));
    const root={folders:new Map(),files:[]};
    for(const r of rows){const parts=r.label.split('/');let node=root;for(const part of parts.slice(0,-1)){if(!node.folders.has(part))node.folders.set(part,{folders:new Map(),files:[]});node=node.folders.get(part);}node.files.push({...r,leaf:parts.at(-1)});}
    const kindOf=n=>/\.ioc$/.test(n)?'M':/\.ld$/.test(n)?'L':/\.s$/i.test(n)?'S':/\.(h|hpp)$/.test(n)?'H':'C';
    const fileRow=r=>r.kind==='own'
      ?`<button data-tree-source="${esc(r.file)}" class="tree-own${!ext&&r.file===active?' active':''}" title="${esc(r.label)} · 프로젝트 파일"><span class="file-kind">${kindOf(r.leaf)}</span><span class="file-label">${esc(r.leaf)}</span></button>`
      :`<button data-build-file="${esc(r.file)}" data-build-kind="${r.kind}" class="${ext===r.file?'active':''}" title="${esc(r.kind==='gen'?'STM Simulator가 빌드에 넣는 코드':'STM32Cube SDK '+r.file)} · 읽기 전용${/\.ioc$/.test(r.leaf)?'':' · 열어서 \"프로젝트로 복사해 수정\"'}"><span class="file-kind">${kindOf(r.leaf)}</span><span class="file-label">${esc(r.leaf)}</span></button>`;
    const render=(node,path)=>[...[...node.folders].sort(([x],[y])=>x.localeCompare(y)).map(([name,child])=>{const full=path?path+'/'+name:name;return `<details class="tree-folder" data-tree-folder="${esc(full)}"${treeOpen.has(full)?' open':''}><summary>${esc(name)}</summary><div class="tree-children">${render(child,full)}</div></details>`;}),...node.files.sort((x,y)=>x.leaf.localeCompare(y.leaf)).map(fileRow)].join('');
    $('build-file-list').innerHTML=render(root,'');
    for(const el of $('build-file-list').querySelectorAll('[data-tree-folder]'))el.addEventListener('toggle',()=>{if(el.open)treeOpen.add(el.dataset.treeFolder);else treeOpen.delete(el.dataset.treeFolder);});
    for(const el of $('build-file-list').querySelectorAll('[data-tree-source]'))el.onclick=()=>{o.layout.reveal('code');select(el.dataset.treeSource);};
    for(const el of $('build-file-list').querySelectorAll('[data-build-file]'))el.onclick=async()=>{o.layout.reveal('code');document.querySelector('[data-tab="code"]')?.click();try{if(el.dataset.buildKind==='gen')editor.openGenerated(el.dataset.buildFile);else await editor.openSdk(el.dataset.buildFile);}catch(e){o.log(e.message,'error');}};
  }
  // Feature 11: a read-only file (what the build adds, an SDK source or header) becomes a project file the user can
  // edit. The ARM build then compiles the project's copy in place of the generated / SDK one (native-build.cjs), and
  // regenerating main.c or updating the SDK never touches it.
  const copyable=ext=>o.getProject().firmware?.mode==='hal'&&/\.([chs]|ld)$/.test(ext.file);
  function copyToProject(ext){
    try{
      if(o.isRunning())throw new Error('실행을 정지한 뒤 복사하세요.');
      const shown=treeLabels.get(ext.file),leaf=(shown||ext.file).split('/').at(-1),name=shown&&SOURCE_PATH.test(shown)?shown:SOURCE_PATH.test(ext.file)?ext.file:leaf,p=structuredClone(o.getProject());p.firmware.files??=[];
      if(leaf==='main.c'||!SOURCE_PATH.test(name))throw new Error('이 파일은 프로젝트로 복사할 수 없습니다.');
      if(sourceFiles(p).some(f=>f.name.split('/').at(-1).toLowerCase()===leaf.toLowerCase()))throw new Error(`${leaf}: 같은 이름의 파일이 이미 프로젝트에 있습니다.`);
      // The view's own header comment ("읽기 전용") is replaced: the copy is the user's file now.
      const text=(editor.externalText()??'').replace(/^\/\* [^\n]* — STM Simulator가 ARM 빌드에 넣는 코드\(읽기 전용\)\.[\s\S]*?\*\/\n?/,/\.(c|h)$/.test(leaf)?`/* ${leaf} — 프로젝트로 복사한 파일입니다. ARM 빌드는 이 파일을 쓰며, 여기 없는 핸들러·시스템 호출만 앱이 채웁니다. */\n`:`/* ${leaf} — 프로젝트로 복사한 파일입니다. ARM 빌드는 이 파일을 씁니다. */\n`);
      p.firmware.files.push({name,text});editor.closeExternal(ext.file);o.applySources(p,name);sync();
      o.log(`${name}을 프로젝트로 복사했습니다. 이제 빌드가 이 파일을 쓰고, 자유롭게 고칠 수 있습니다(지우면 원래 파일로 돌아갑니다).`);
    }catch(e){o.log(e.message,'error');}
  }
  // Open tabs: project files, other boards' programs, then SDK files opened by go to definition (read only, ×).
  function tabsView(){
    const files=sourceFiles(o.getProject()),boards=boardSourceFiles(o.getProject()),active=o.getSource(),ext=editor.externalFile(),base=f=>f.split('/').at(-1);
    $('source-tabs').innerHTML=[...files.map(f=>({name:f.name,label:shown(f.name)})),...boards].map(f=>`<button data-source="${esc(f.name)}" class="${!ext&&f.name===active?'active':''}">${esc(f.label)}</button>`).join('')
      +editor.externalFiles().map(f=>`<span class="source-tab-sdk${ext?.file===f.file?' active':''}"><button data-sdk-file="${esc(f.file)}" title="${esc(f.sdk+' › '+f.file)} · 읽기 전용">${esc(base(f.file))}</button><button class="source-tab-close" data-sdk-close="${esc(f.file)}" aria-label="${esc(base(f.file))} 닫기" title="닫기">×</button></span>`).join('');
    for(const el of $('source-tabs').querySelectorAll('[data-source]'))el.onclick=()=>select(el.dataset.source);
    for(const el of $('source-tabs').querySelectorAll('[data-sdk-file]'))el.onclick=()=>editor.showExternal(el.dataset.sdkFile);
    for(const el of $('source-tabs').querySelectorAll('[data-sdk-close]'))el.onclick=e=>{e.stopPropagation();editor.closeExternal(el.dataset.sdkClose);};
    // Where the file lives in the SDK (CubeIDE shows it in the title bar), like the Drivers folder of a Cube project.
    $('source-path').hidden=!ext;$('code-panel').classList.toggle('sdk-open',!!ext);$('source-path').innerHTML=ext?`<span>${esc(ext.sdk)}</span>${ext.file.split('/').map(p=>`<span>${esc(p)}</span>`).join('')}<em>읽기 전용 · Alt+← 돌아가기</em>${copyable(ext)?'<button type="button" id="copy-to-project" title="이 파일을 프로젝트 소스로 복사합니다. 복사한 뒤에는 빌드가 프로젝트의 파일을 쓰고, 자유롭게 고칠 수 있습니다.">프로젝트로 복사해 수정</button>':''}`:'';
    if($('copy-to-project'))$('copy-to-project').onclick=()=>copyToProject(ext);
    buildFilesView();outlineView();
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
    try{const p=o.getProject(),program=p.firmware?.mode==='hal'?compileHal(p.code,p.firmware.files,p.mcu?.family):compile(p.code);built=program;$('build-status').textContent='빌드 통과';$('build-output').textContent=`빌드 성공 · ${sourceFiles(p).length}개 파일 · ${Object.keys(program.functions).length}개 함수\n시뮬레이터 실행 프로그램을 준비했습니다. 전원·배선·HAL 설정은 실행 시 검사합니다.`;return program;}
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
  return {sync,controls,build,editor,debugView,debug:doDebug,format:()=>formatter.formatDocument(),formatSelection:()=>formatter.formatSelection(),emulator:()=>!!native?.emulator(),gccSimulation:()=>!!native?.gccSimulation(),ensureSimTools:()=>native?native.ensureSimTools():Promise.resolve('interpreter'),nativePaused:()=>!!native?.paused(),buildElf:source=>native.buildElf(source),connectedBoards:()=>native?.boards?.()||[],nativeBusy:()=>native.busy(),breakpoints:()=>points().map(b=>`${b.file}:${b.line}`),invalidate(){built=null;sourceKey=JSON.stringify([o.getProject().firmware?.mode,sourceFiles(o.getProject())]);$('build-status').textContent='변경됨 · 빌드 필요';editor.diagnostics([]);native.queueLanguage();},reset({preserveWorkspace=false}={}){if(!preserveWorkspace)window.desktop?.clearWorkspace?.().catch(e=>o.log(e.message,'error'));folder='';built=null;lastPause='';sourceKey='';$('build-status').textContent='시뮬레이터용 빌드';editor.diagnostics([]);native.reset();sync();},async saveWorkspace(text){if(!folder)return false;await window.desktop.saveWorkspace(text);return true;}};
}
