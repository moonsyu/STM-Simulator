// VS Code style workbench shell: activity bar, side bar views, editor groups,
// bottom panel, secondary side bar, status bar, menus and command palette.
// Existing controls keep their IDs and listeners; the shell only relocates them.
import {loadKeybindings,saveKeybindings,createMatcher,eventKey,conflicts,DEFAULT_KEYBINDINGS,setCurrentKeybindings} from './keybindings.js';
const $=id=>document.getElementById(id);
const KEY='stm32lab.shellLayout.v1';
const ICON={
 explorer:'M4 3h7l2 2h7v14H4z M4 8h16',
 parts:'M7 4h10v6H7z M4 14h6v6H4z M14 14h6v6h-6z M12 10v4 M7 14v-2h10v2',
 examples:'M8 4C6 4 6 5.5 6 7v2.5C6 11 5 12 4 12c1 0 2 1 2 2.5V17c0 1.5 0 3 2 3 M16 4c2 0 2 1.5 2 3v2.5c0 1.5 1 2.5 2 2.5-1 0-2 1-2 2.5V17c0 1.5 0 3-2 3',
 board:'M6 6h12v12H6z M9 3v3 M15 3v3 M9 18v3 M15 18v3 M3 9h3 M3 15h3 M18 9h3 M18 15h3 M10 10h4v4h-4z',
 debug:'M8 5l11 7-11 7z M4 4v16',
 docs:'M3 5.5C5.5 4.5 8.5 4.6 12 6.5c3.5-1.9 6.5-2 9-1V19c-2.5-1-5.5-.9-9 1-3.5-1.9-6.5-2-9-1z M12 6.5V20',
 settings:'M12 8.5a3.5 3.5 0 1 0 0 7a3.5 3.5 0 1 0 0-7z M12 2v3 M12 19v3 M2 12h3 M19 12h3 M4.9 4.9l2.1 2.1 M17 17l2.1 2.1 M4.9 19.1L7 17 M17 7l2.1-2.1',
 sidebar:'M3 4h18v16H3z M9 4v16',panel:'M3 4h18v16H3z M3 14h18',aux:'M3 4h18v16H3z M15 4v16',
 split:'M3 4h18v16H3z M12 4v16',rotate:'M4 12a8 8 0 0 1 14-5 M18 3v4h-4 M20 12a8 8 0 0 1-14 5 M6 21v-4h4',swap:'M7 7h12l-3-3 M17 17H5l3 3',max:'M4 9V4h5 M15 4h5v5 M20 15v5h-5 M9 20H4v-5',
 close:'M6 6l12 12 M18 6L6 18',more:'M6 12h.01 M12 12h.01 M18 12h.01',bell:'M6 16V11a6 6 0 0 1 12 0v5l2 2H4z M10 20h4'
};
export const icon=(name,size=20)=>`<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true" class="icon"><path d="${ICON[name]}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const VIEWS=[
 {id:'explorer',label:'탐색기'},
 {id:'parts',label:'부품'},
 {id:'examples',label:'HAL 예제',hint:'회로·코드·핀 설정을 예제 프로젝트로 교체'},
 {id:'board',label:'보드 · 핀 설정'},
 {id:'debug',label:'실행 및 디버그'},
 {id:'docs',label:'장치 Docs',hint:'선택한 장치의 설명과 코드를 현재 프로젝트에 추가'}
];
const HIDDEN_VIEWS=[{id:'settings',label:'설정'},{id:'keybindings',label:'단축키 설정'}];
const DEFAULT={sidebar:272,aux:300,panel:240,ratio:.5,orientation:'row',swapped:false,show:{sidebar:true,aux:true,panel:true},view:'explorer',maximized:null,activityOrder:VIEWS.map(v=>v.id)};
const validOrder=o=>Array.isArray(o)&&o.length===VIEWS.length&&VIEWS.every(v=>o.includes(v.id))?[...o]:VIEWS.map(v=>v.id);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function loadState(){
 try{const s=JSON.parse(localStorage.getItem(KEY));if(!s||typeof s!=='object')return structuredClone(DEFAULT);
  const n=(v,a,b,d)=>Number.isFinite(v)?clamp(v,a,b):d;
  return {sidebar:n(s.sidebar,170,640,DEFAULT.sidebar),aux:n(s.aux,200,640,DEFAULT.aux),panel:n(s.panel,90,900,DEFAULT.panel),ratio:n(s.ratio,.12,.88,DEFAULT.ratio),orientation:s.orientation==='column'?'column':'row',swapped:s.swapped===true,
   show:{sidebar:s.show?.sidebar!==false,aux:s.show?.aux!==false,panel:s.show?.panel!==false},view:[...VIEWS,...HIDDEN_VIEWS].some(v=>v.id===s.view)?s.view:'explorer',maximized:null,activityOrder:validOrder(s.activityOrder)};
 }catch{return structuredClone(DEFAULT);}
}

// Phase 1: a layout object that other modules can call before the shell is mounted.
export function createShell(){
 const state=loadState();let mounted=false,commands=[],palette=null,monitor=null,bindings=loadKeybindings();setCurrentKeybindings(bindings);const keyListeners=new Set();
 const root=document.documentElement;
 const save=()=>{try{localStorage.setItem(KEY,JSON.stringify({...state,maximized:null}));}catch{}};
 function apply(){
  if(!mounted)return;
  const shell=$('shell');
  shell.style.setProperty('--sidebar-width',state.sidebar+'px');shell.style.setProperty('--aux-width',state.aux+'px');shell.style.setProperty('--panel-height',state.panel+'px');
  shell.dataset.sidebar=String(state.show.sidebar);shell.dataset.aux=String(state.show.aux);shell.dataset.panel=String(state.show.panel);shell.dataset.maximized=state.maximized||'';
  const area=$('editor-area');area.dataset.orientation=state.orientation;area.dataset.swapped=String(state.swapped);
  const first=state.swapped?$('group-circuit'):$('group-code'),second=state.swapped?$('group-code'):$('group-circuit');
  if(area.firstElementChild!==first){area.prepend(first);first.after($('sash-editor'));$('sash-editor').after(second);}
  first.style.flex=`${state.ratio} 1 0px`;second.style.flex=`${1-state.ratio} 1 0px`;
  $('sash-editor').setAttribute('aria-orientation',state.orientation==='row'?'vertical':'horizontal');$('sash-editor').className='sash '+(state.orientation==='row'?'sash-v':'sash-h');
  for(const b of document.querySelectorAll('[data-activity]'))b.setAttribute('aria-pressed',String(state.show.sidebar&&b.dataset.activity===state.view));
  for(const v of document.querySelectorAll('.sidebar-view'))v.hidden=v.dataset.view!==state.view;
  $('sidebar-title').textContent=[...VIEWS,...HIDDEN_VIEWS].find(v=>v.id===state.view)?.label||'';
  for(const [id,key] of [['toggle-sidebar','sidebar'],['toggle-panel','panel'],['toggle-aux','aux']]){const b=$(id);if(b)b.setAttribute('aria-pressed',String(state.show[key]));}
  window.dispatchEvent(new Event('resize'));
 }
 function showView(view,{toggle=false}={}){
  if(toggle&&state.view===view&&state.show.sidebar){state.show.sidebar=false;}
  else{state.view=view;state.show.sidebar=true;}
  if(state.maximized&&state.maximized!=='panel')state.maximized=null;apply();save();
  if(state.show.sidebar&&!toggle){const view=document.querySelector(`.sidebar-view[data-view="${state.view}"]`);view?.querySelector('input,button,select,[tabindex="0"]')?.focus?.({preventScroll:true});}
 }
 function showPanel(tab){state.show.panel=true;if(state.maximized&&state.maximized!=='panel')state.maximized=null;apply();save();if(tab&&monitor)monitor.select(tab);else if(tab)document.querySelector(`[data-monitor="${tab}"]`)?.click();}
 let auxClosedByUser=false;
 function toggle(key){state.show[key]=!state.show[key];if(key==='aux')auxClosedByUser=!state.show.aux;if(!state.show.panel&&state.maximized==='panel')state.maximized=null;apply();save();}
 function reveal(id){
  // Compatible with the previous dock API: project | code | simulator | terminal.
  if(id==='project'){state.show.sidebar=true;if(!['explorer','parts','examples','board'].includes(state.view))state.view='explorer';}
  if(id==='terminal'){state.show.panel=true;}
  if(id==='inspect'){if(auxClosedByUser&&!state.show.aux)return;state.show.aux=true;}
  if(['code','simulator'].includes(id)&&state.maximized&&state.maximized!==(id==='code'?'code':'circuit'))state.maximized=null;
  if(id==='terminal'&&state.maximized&&state.maximized!=='panel')state.maximized=null;
  apply();save();
 }
 function maximize(id){const target={code:'code',simulator:'circuit',circuit:'circuit',terminal:'panel',panel:'panel'}[id]||null;state.maximized=state.maximized===target?null:target;if(target==='panel')state.show.panel=true;apply();}
 const api={
  reveal,maximize,showView,showPanel,toggle,
  snapshot:()=>structuredClone(state),
  state:()=>state,
  setMonitor(m){monitor=m;},
  commands:()=>commands,
  register(list){commands=commands.concat(list);},
  keyFor:id=>bindings[id]||'',
  bindings:()=>({...bindings}),
  setBinding(id,key){if(!(id in DEFAULT_KEYBINDINGS))return;bindings[id]=key;saveKeybindings(bindings);setCurrentKeybindings(bindings);for(const f of keyListeners)f();},
  resetBindings(){bindings={...DEFAULT_KEYBINDINGS};saveKeybindings(bindings);setCurrentKeybindings(bindings);for(const f of keyListeners)f();},
  onBindings(f){keyListeners.add(f);},
  openPalette(prefix=''){palette?.open(prefix);},
  reset(){Object.assign(state,structuredClone(DEFAULT));apply();save();},
  setOrientation(o){state.orientation=o==='column'?'column':'row';apply();save();},
  swap(){state.swapped=!state.swapped;apply();save();},
  mount(options){if(mounted)return;mounted=true;mountShell(api,state,options,{apply,save,setPalette:p=>palette=p});apply();},
  get mounted(){return mounted;}
 };
 return api;
}

function button(id,label,iconName,title){const b=document.createElement('button');b.type='button';if(id)b.id=id;b.className='icon-button';b.innerHTML=icon(iconName,16);b.title=title||label;b.setAttribute('aria-label',label);return b;}

function mountShell(layout,state,options,{apply,save,setPalette}){
 const shell=$('shell');
 document.documentElement.setAttribute('data-shell','vscode');
 // ---- Relocate controls mounted by the IDE, Docs and settings modules ----
 const explorer=$('view-explorer');const files=document.querySelector('.project-files');if(files)explorer.append(files);
 explorer.insertAdjacentHTML('beforeend','<section class="explorer-outline"><h3>회로 개요</h3><p id="explorer-circuit-summary" class="form-hint"></p><div class="explorer-links"><button type="button" data-goto-view="parts">부품 추가</button><button type="button" data-goto-view="examples">HAL 예제</button><button type="button" data-goto-view="board">핀 설정</button></div></section>');
 const debug=$('debug-panel');if(debug){debug.hidden=false;$('view-debug').append(debug);}
 const debugBar=document.createElement('div');debugBar.className='debug-toolbar';debugBar.setAttribute('role','toolbar');debugBar.setAttribute('aria-label','디버그 제어');
 const DEBUG_BUTTONS=[['start','디버그 시작','▶','run.debug'],['continue','계속','⏵','run.run'],['pause','일시정지','⏸','run.pause'],['over','한 줄 실행','↷','run.over'],['into','함수 안으로','↓','run.into'],['out','함수 밖으로','↑','run.out'],['stop','정지','■','run.stop']];
 for(const [cmd,label,glyph] of DEBUG_BUTTONS){const b=document.createElement('button');b.type='button';b.dataset.debug=cmd;b.setAttribute('aria-label',label);b.textContent=glyph;b.onclick=()=>{if(cmd==='start')$('debug-start')?.click();else if(cmd==='continue'){if($('run')?.textContent.includes('계속'))$('run').click();}else options.debugCommand?.(cmd);};debugBar.append(b);}
 const debugTitles=()=>{for(const [cmd,label,,id] of DEBUG_BUTTONS){const k=layout.keyFor(id);debugBar.querySelector(`[data-debug="${cmd}"]`).title=k?`${label} (${k})`:label;}};debugTitles();layout.onBindings(debugTitles);
 // The run target and build configuration live in the Run and Debug view.
 const runConfig=document.createElement('section');runConfig.className='run-config';runConfig.innerHTML='<h3>실행 환경</h3>';
 const targetLabel=document.querySelector('.native-target-label');if(targetLabel){[...targetLabel.childNodes].forEach(n=>{if(n.nodeType===3)n.remove();});runConfig.append(targetLabel);}if($('native-config'))runConfig.append($('native-config'));
 $('view-debug').prepend(runConfig,debugBar);
 const docs=$('device-docs-panel');if(docs){docs.hidden=false;$('view-docs').append(docs);}
 const settings=$('ide-settings-panel');if(settings){settings.hidden=false;$('view-settings').append(settings);}
 document.querySelector('[data-monitor="debug"]')?.remove();
 const runArea=$('run-area'),toolbar=document.querySelector('.ide-toolbar');if(toolbar)runArea.append(toolbar);
 if($('debug-start'))$('debug-start').textContent='디버그';
 // Source tabs become the editor group's tab strip.
 const group=$('group-code'),tabs=$('source-tabs');
 const tabRow=document.createElement('div');tabRow.className='group-tabs';const tabActions=document.createElement('div');tabActions.className='group-actions';tabActions.id='code-actions';
 if(tabs)tabRow.append(tabs);tabRow.append(tabActions);group.prepend(tabRow);
 // Code tools (import/check/export/reset/mode) live behind the editor "…" menu.
 const codeMenu=popover('code-tools-menu','코드 도구',[document.querySelector('.firmware-tools')]);
 const more=button('code-tools-menu-toggle','코드 도구','more','코드 도구 · 가져오기 · 검사 · 초기화');more.setAttribute('popovertarget','code-tools-menu');more.setAttribute('aria-haspopup','true');tabActions.append(more);anchor(codeMenu,more);
 // Bottom panel tabs: friendly labels and order.
 const tabLabels={issues:'문제',log:'출력',native:'터미널',bus:'직렬 모니터',wave:'파형',signals:'로직 분석기',build:'빌드'};
 const strip=document.querySelector('.monitor-tabs');
 for(const name of ['issues','log','native','bus','wave','signals','build']){const b=strip.querySelector(`[data-monitor="${name}"]`);if(b){if(!/\(\d+\)/.test(b.textContent))b.textContent=tabLabels[name];strip.append(b);}}
 // Panel actions
 const panelActions=$('panel-actions');
 const maxPanel=button('panel-maximize','패널 최대화','max','패널 최대화 / 복원');maxPanel.onclick=()=>layout.maximize('panel');
 const closePanel=button('panel-close','패널 닫기','close','패널 닫기 (Ctrl+J)');closePanel.onclick=()=>layout.toggle('panel');
 panelActions.append(maxPanel,closePanel);
 // Circuit group actions
 const circuitActions=$('circuit-actions');
 const swap=button('group-swap','코드와 회로 위치 바꾸기','swap');swap.onclick=()=>layout.swap();
 const orient=button('group-orientation','가로 / 세로 분할 전환','rotate');orient.onclick=()=>layout.setOrientation(state.orientation==='row'?'column':'row');
 const maxCircuit=button('circuit-maximize','회로 최대화','max','회로 최대화 / 복원');maxCircuit.onclick=()=>layout.maximize('circuit');
 circuitActions.append(swap,orient,maxCircuit);
 const maxCode=button('code-maximize','편집기 최대화','max','편집기 최대화 / 복원');maxCode.onclick=()=>layout.maximize('code');tabActions.prepend(maxCode);
 // Wire colour palette behind a compact menu
 const palette=$('wire-palette'),wtool=document.querySelector('.workspace-toolbar');
 const paletteMenu=popover('wire-color-menu','배선 색상',[palette]);
 const paletteButton=document.createElement('button');paletteButton.type='button';paletteButton.id='wire-color-menu-toggle';paletteButton.className='workbench-menu-toggle';paletteButton.setAttribute('popovertarget','wire-color-menu');paletteButton.innerHTML='<span class="palette-current" aria-hidden="true"></span>배선 색상';
 wtool.querySelector('.tool-group').after(paletteButton);anchor(paletteMenu,paletteButton);
 const updateChip=()=>{const sel=palette.querySelector('.active');paletteButton.querySelector('.palette-current').style.setProperty('--swatch',sel?.dataset.color||'#23a68a');paletteButton.title=sel?.title||'배선 색상 선택';};
 new MutationObserver(updateChip).observe(palette,{subtree:true,attributes:true,attributeFilter:['class'],childList:true});updateChip();
 palette.addEventListener('click',e=>{if(e.target.closest('[data-color]'))paletteMenu.hidePopover();});
 // Run toolbar extras (sound / step / tools) behind "…"
 const run=document.querySelector('.run-tools');
 if(toolbar&&run){
  const runMore=popover('execution-tools-menu','실행 도구',[$('sound'),$('step'),$('native-tools'),$('native-connection')]);
  const t=document.createElement('button');t.type='button';t.id='execution-tools-menu-toggle';t.className='workbench-menu-toggle';t.textContent='실행 도구';t.setAttribute('popovertarget','execution-tools-menu');toolbar.append(t);anchor(runMore,t);
  runMore.addEventListener('click',e=>{if(e.target.closest('button'))runMore.hidePopover();});
  toolbar.insertBefore($('run'),toolbar.querySelector('#ide-build'));run.remove();
 }
 // ---- Activity bar ----
 const bar=$('activitybar');
 const top=document.createElement('div');top.className='activity-top';const bottom=document.createElement('div');bottom.className='activity-bottom';
 for(const id of state.activityOrder){const v=VIEWS.find(x=>x.id===id);const b=document.createElement('button');b.type='button';b.dataset.activity=v.id;b.className='activity-item';b.innerHTML=icon(v.id,24);b.setAttribute('aria-label',v.label);b.draggable=true;b.onclick=()=>layout.showView(v.id,{toggle:true});top.append(b);}
 bar.append(top,bottom);
 setupActivityTips(bar,id=>{const v=VIEWS.find(x=>x.id===id),k=layout.keyFor('view.'+id);return v?(k?`${v.label} (${k})`:v.label)+(v.hint?' · '+v.hint:''):'';});
 setupActivityDrag(top,order=>{state.activityOrder=order;save();});
 // Explorer quick links
 explorer.addEventListener('click',e=>{const b=e.target.closest('[data-goto-view]');if(b)layout.showView(b.dataset.gotoView);});
 // ---- Title bar layout toggles ----
 const actions=document.querySelector('.top-actions');
 const toggles=document.createElement('div');toggles.className='layout-toggles';toggles.setAttribute('role','group');toggles.setAttribute('aria-label','레이아웃');
 const tSide=button('toggle-sidebar','기본 사이드바 표시','sidebar','기본 사이드바 표시 / 숨기기 (Ctrl+B)');tSide.onclick=()=>layout.toggle('sidebar');
 const tPanel=button('toggle-panel','패널 표시','panel','패널 표시 / 숨기기 (Ctrl+J)');tPanel.onclick=()=>layout.toggle('panel');
 const tAux=button('toggle-aux','보조 사이드바 표시','aux','속성 패널 표시 / 숨기기 (Ctrl+Alt+B)');tAux.onclick=()=>layout.toggle('aux');
 toggles.append(tSide,tPanel,tAux);actions.insertBefore(toggles,$('save'));
 for(const id of ['new','workspace-open','open','app-update'])$(id)?.classList.add('titlebar-hidden');
 $('auxbar-close').onclick=()=>layout.toggle('aux');
 // ---- Status bar ----
 const left=$('status-left'),right=$('status-right');
 const item=(node,cls)=>{const s=document.createElement('span');s.className='status-item'+(cls?' '+cls:'');if(node)s.append(node);return s;};
 const strip2=document.querySelector('.monitor-strip');
 const runState=strip2.firstElementChild;runState.classList.add('status-item','status-run');left.append(runState);
 const target=document.createElement('button');target.type='button';target.className='status-item status-button';target.id='status-target';target.title='실행 환경 선택 (실행 및 디버그)';target.onclick=()=>{layout.showView('debug');$('native-target')?.focus();};left.append(target);
 const problems=document.createElement('button');problems.type='button';problems.className='status-item status-button';problems.id='status-problems';problems.title='문제 보기';problems.onclick=()=>layout.showPanel('issues');left.append(problems);
 for(const s of [...strip2.children]){s.classList.add('status-item');left.append(s);}
 const buildStatus=$('build-status');if(buildStatus){buildStatus.classList.add('status-item');buildStatus.previousElementSibling?.classList.contains('toolbar-divider')&&buildStatus.previousElementSibling.remove();left.append(buildStatus);}
 strip2.remove();
 const position=document.querySelector('.editor-position');
 if(position){for(const child of [...position.children]){child.classList.add('status-item');if(child.tagName==='BUTTON')child.classList.add('status-button');right.append(child);}position.remove();}
 const badge=document.querySelector('.language-badge');if(badge){badge.classList.add('status-item');right.append(badge);}
 const board=document.createElement('span');board.className='status-item';board.id='status-board';board.textContent='NUCLEO-F446RE';right.append(board);
 const bell=document.createElement('button');bell.type='button';bell.className='status-item status-button';bell.id='status-notifications';bell.innerHTML=icon('bell',14);bell.title='알림';bell.setAttribute('aria-label','알림 보기');bell.onclick=()=>{const f=$('app-feedback');if(f&&f.dataset.scope)f.hidden=!f.hidden;else layout.showPanel('log');};right.append(bell);
 const update=()=>{
  const t=$('native-target');target.textContent=t?'⚙ '+(t.selectedOptions[0]?.textContent||''):'';
  const issues=document.querySelector('[data-monitor="issues"]')?.textContent.match(/\((\d+)\)/)?.[1]||'0';problems.innerHTML=`<span aria-hidden="true">⊗</span> ${issues}`;problems.setAttribute('aria-label',`문제 ${issues}건`);
  const runningState=$('status-led')?.className==='running';shell.dataset.running=String(runningState);
  board.textContent=$('current-board-name')?.textContent||'NUCLEO-F446RE';
 };
 new MutationObserver(update).observe(document.querySelector('.monitor-tabs'),{subtree:true,characterData:true,childList:true});
 if($('status-led'))new MutationObserver(update).observe($('status-led'),{attributes:true});
 $('native-target')?.addEventListener('change',update);new MutationObserver(update).observe($('current-board-name'),{childList:true,characterData:true,subtree:true});update();
 // The update button lives in the 도움말 menu; a status item appears only while an update is downloading or ready.
 const upd=$('app-update');if(upd){const st=document.createElement('button');st.type='button';st.className='status-item status-button';st.id='status-update';st.hidden=true;st.onclick=()=>upd.click();right.prepend(st);
  const sync=()=>{const active=upd.classList.contains('update-ready')||/다운로드/.test(upd.textContent);st.hidden=upd.hidden||!active;st.textContent='⬆ '+upd.textContent;st.title=upd.title;};new MutationObserver(sync).observe(upd,{attributes:true,childList:true,characterData:true,subtree:true});sync();}
 // ---- HAL example list ----
 setupExampleList();
 // ---- Sashes ----
 sash($('sash-sidebar'),'x',()=>state.sidebar,v=>{state.sidebar=clamp(v,170,640);},1,apply,save);
 sash($('sash-aux'),'x',()=>state.aux,v=>{state.aux=clamp(v,200,640);},-1,apply,save);
 sash($('sash-panel'),'y',()=>state.panel,v=>{state.panel=clamp(v,90,Math.max(120,innerHeight-220));},-1,apply,save);
 ratioSash($('sash-editor'),state,apply,save);
 // ---- Menus, palette, keys ----
 registerCommands(layout,options);
 buildMenus(layout);
 setPalette(setupPalette(layout,options));
 keyboard(layout,options);
 setupKeybindingsView(layout);
 $('command-palette-open').onclick=()=>layout.openPalette('>');
 // Feedback banner becomes a toast with an icon.
 $('app-feedback')?.classList.add('toast');
 // Settings: keep the legacy tab hooks working (view.settings opens the settings view).
 for(const b of document.querySelectorAll('.panel-tabs [data-tab="settings"],.panel-tabs [data-tab="docs"]'))b.hidden=true;
}

function popover(id,label,nodes){
 const panel=document.createElement('div');panel.id=id;panel.className='workbench-popover';panel.setAttribute('popover','auto');panel.setAttribute('role','group');panel.setAttribute('aria-label',label);panel.append(...nodes.filter(Boolean));document.body.append(panel);return panel;
}
function anchor(panel,buttonEl){
 const place=()=>{if(!panel.matches(':popover-open'))return;const a=buttonEl.getBoundingClientRect(),r=panel.getBoundingClientRect();panel.style.left=Math.max(8,Math.min(a.right-r.width,innerWidth-r.width-8,a.left))+'px';panel.style.top=Math.max(8,Math.min(a.bottom+4,innerHeight-r.height-8))+'px';};
 panel.addEventListener('toggle',e=>{buttonEl.setAttribute('aria-expanded',String(e.newState==='open'));if(e.newState==='open'){place();const first=panel.querySelector('button:not(:disabled),select:not(:disabled),input:not(:disabled)');if(buttonEl.matches(':focus-visible'))first?.focus();}else if(panel.contains(document.activeElement))buttonEl.focus();});
 window.addEventListener('resize',place);
}
function sash(el,axis,get,set,dir,apply,save){
 if(!el)return;let active=null;
 el.addEventListener('pointerdown',e=>{if(e.button!==0)return;e.preventDefault();active={id:e.pointerId,start:axis==='x'?e.clientX:e.clientY,value:get()};el.setPointerCapture(e.pointerId);document.body.classList.add('resizing-workspace');el.classList.add('active');});
 el.addEventListener('pointermove',e=>{if(active?.id!==e.pointerId)return;const d=(axis==='x'?e.clientX:e.clientY)-active.start;set(active.value+d*dir);apply();});
 const end=()=>{if(!active)return;active=null;document.body.classList.remove('resizing-workspace');el.classList.remove('active');save();};
 for(const ev of ['pointerup','pointercancel','lostpointercapture'])el.addEventListener(ev,end);
 el.addEventListener('keydown',e=>{const keys=axis==='x'?['ArrowLeft','ArrowRight']:['ArrowUp','ArrowDown'];if(!keys.includes(e.key))return;e.preventDefault();set(get()+(e.key===keys[1]?1:-1)*dir*(e.shiftKey?40:10));apply();save();});
}
function ratioSash(el,state,apply,save){
 let active=null;
 el.addEventListener('pointerdown',e=>{if(e.button!==0)return;e.preventDefault();const r=$('editor-area').getBoundingClientRect(),row=state.orientation==='row';active={id:e.pointerId,start:row?e.clientX:e.clientY,size:(row?r.width:r.height)-4,ratio:state.ratio,flip:state.swapped};el.setPointerCapture(e.pointerId);document.body.classList.add('resizing-workspace');el.classList.add('active');});
 el.addEventListener('pointermove',e=>{if(active?.id!==e.pointerId)return;const row=state.orientation==='row',d=((row?e.clientX:e.clientY)-active.start)/Math.max(1,active.size);state.ratio=clamp(active.ratio+d,.12,.88);apply();});
 const end=()=>{if(!active)return;active=null;document.body.classList.remove('resizing-workspace');el.classList.remove('active');save();};
 for(const ev of ['pointerup','pointercancel','lostpointercapture'])el.addEventListener(ev,end);
 el.addEventListener('dblclick',()=>{state.ratio=.5;apply();save();});
 el.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(e.key))return;e.preventDefault();state.ratio=clamp(e.key==='Home'?.12:e.key==='End'?.88:state.ratio+(['ArrowRight','ArrowDown'].includes(e.key)?1:-1)*(e.shiftKey?.1:.02),.12,.88);apply();save();});
}

function setupExampleList(){
 const select=$('hal-example'),list=$('hal-example-list');if(!select||!list)return;
 const render=()=>{
  const options=[...select.options].filter(o=>o.value);
  list.innerHTML=options.length?options.map(o=>{let text=o.textContent;const sim=/ · SIM$/.test(text);text=text.replace(/ · SIM$/,'');const arm=/ · ARM$/.test(text);text=text.replace(/ · ARM$/,'');const parts=text.split(' · ');const kind=parts.length>1?parts.shift():'';const name=parts.join(' · ');return `<button type="button" role="option" class="example-item" data-example="${o.value}"><strong>${escapeHtml(name)}</strong><span class="example-meta">${kind?`<span class="example-tag">${escapeHtml(kind)}</span>`:''}${arm?'<span class="example-tag arm">ARM 빌드</span>':''}${sim?'<span class="example-tag arm" title="FatFs를 시뮬레이터가 제공하므로 회로 시뮬레이터 대상에서 실행합니다">시뮬레이터 전용</span>':''}</span></button>`;}).join(''):'<p class="form-hint">검색 결과가 없습니다.</p>';
 };
 new MutationObserver(render).observe(select,{childList:true});render();
 list.addEventListener('click',e=>{const b=e.target.closest('[data-example]');if(!b||select.disabled)return;select.value=b.dataset.example;select.dispatchEvent(new Event('change',{bubbles:true}));});
 list.addEventListener('keydown',e=>{const items=[...list.querySelectorAll('[data-example]')],i=items.indexOf(document.activeElement);if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();items[clamp(i+(e.key==='ArrowDown'?1:-1),0,items.length-1)]?.focus();}});
 $('hal-example-search').addEventListener('keydown',e=>{if(e.key==='ArrowDown'){e.preventDefault();list.querySelector('[data-example]')?.focus();}if(e.key==='Enter'){list.querySelector('[data-example]')?.click();}});
}
const escapeHtml=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
const click=id=>()=>{const el=$(id);if(el&&!el.disabled)el.click();};

function registerCommands(layout,options){
 const key=e=>e;
 const views=VIEWS.map(v=>({id:'view.'+v.id,label:`보기: ${v.label} 열기`,group:'보기',run:()=>layout.showView(v.id)}));
 layout.register([
  {id:'file.newProject',label:'새 프로젝트',group:'파일',run:click('new')},
  {id:'file.openProject',label:'프로젝트 폴더 열기',group:'파일',run:click('workspace-open')},
  {id:'file.openCircuit',label:'회로 파일 열기 (.stm32lab)',group:'파일',run:click('open')},
  {id:'file.save',label:'저장',keys:'Ctrl+S',group:'파일',run:click('save')},
  {id:'file.exportMain',label:'main.c 내보내기',group:'파일',run:click('main-export')},
  {id:'file.openElf',label:'펌웨어 ELF 열기 (에뮬레이터에서 실행)',group:'파일',run:()=>options.openElf?.()},
  {id:'file.import',label:'.ioc / C 소스 가져오기',group:'파일',run:click('firmware-import')},
  {id:'file.importFolder',label:'Cube 프로젝트 폴더 가져오기',group:'파일',run:click('firmware-folder')},
  {id:'file.addSource',label:'소스 파일 추가',group:'파일',run:click('source-add')},
  {id:'edit.undo',label:'실행 취소',keys:'Ctrl+Z',group:'편집',run:click('undo')},
  {id:'edit.redo',label:'다시 실행',keys:'Ctrl+Y',group:'편집',run:click('redo')},
  {id:'edit.find',label:'찾기',keys:'Ctrl+F',group:'편집',run:()=>options.find?.(false)},
  {id:'edit.format',label:'코드 정렬',group:'편집',run:()=>options.formatCode?.()},
  {id:'edit.formatSelection',label:'선택 영역 코드 정렬',group:'편집',run:()=>options.formatSelection?.()},
  {id:'edit.replace',label:'바꾸기',keys:'Ctrl+R',group:'편집',run:()=>options.find?.(true)},
  {id:'edit.rotate',label:'회로: 선택 항목 45° 회전',keys:'R',group:'편집',run:click('rotate')},
  {id:'edit.delete',label:'회로: 선택 항목 삭제',keys:'Delete',group:'편집',run:click('delete')},
  {id:'edit.codeReset',label:'코드 초기화',group:'편집',run:click('code-reset')},
  {id:'edit.boardReset',label:'보드 구성 초기화',group:'편집',run:click('board-reset')},
  {id:'view.palette',label:'명령 팔레트',group:'보기',run:()=>layout.openPalette('>')},
  {id:'view.quickOpen',label:'파일로 이동',group:'보기',run:()=>layout.openPalette('')},
  ...views,
  {id:'view.settings',label:'설정 (IDE · 테마 · 글꼴)',group:'편집',run:()=>layout.showView('settings')},
  {id:'view.keybindings',label:'단축키 설정',group:'편집',run:()=>layout.showView('keybindings')},
  {id:'view.toggleSidebar',label:'기본 사이드바 표시 전환',group:'보기',run:()=>layout.toggle('sidebar')},
  {id:'view.togglePanel',label:'패널 표시 전환',group:'보기',run:()=>layout.toggle('panel')},
  {id:'view.toggleAux',label:'속성 패널(보조 사이드바) 표시 전환',group:'보기',run:()=>layout.toggle('aux')},
  {id:'view.problems',label:'패널: 문제 보기',group:'보기',run:()=>layout.showPanel('issues')},
  {id:'view.output',label:'패널: 출력 보기',group:'보기',run:()=>layout.showPanel('log')},
  {id:'view.terminal',label:'패널: 터미널 보기',group:'보기',run:()=>layout.showPanel('native')},
  {id:'view.serial',label:'패널: 직렬 모니터 보기',group:'보기',run:()=>layout.showPanel('bus')},
  {id:'view.wave',label:'패널: 파형 보기',group:'보기',run:()=>layout.showPanel('wave')},
  {id:'view.logic',label:'패널: 로직 분석기 보기',group:'보기',run:()=>layout.showPanel('signals')},
  {id:'view.swap',label:'편집기 배치: 코드와 회로 위치 바꾸기',group:'보기',run:()=>layout.swap()},
  {id:'view.orientation',label:'편집기 배치: 가로 / 세로 분할 전환',group:'보기',run:()=>layout.setOrientation(layout.state().orientation==='row'?'column':'row')},
  {id:'view.maxCircuit',label:'회로 최대화 / 복원',group:'보기',run:()=>layout.maximize('circuit')},
  {id:'view.maxCode',label:'편집기 최대화 / 복원',group:'보기',run:()=>layout.maximize('code')},
  {id:'view.reset',label:'레이아웃 초기화',group:'보기',run:()=>layout.reset()},
  {id:'view.theme',label:'화면 테마: Dark / White 전환',group:'보기',run:click('appearance-toggle')},
  {id:'view.themeSystem',label:'화면 테마: 시스템 설정 따르기',group:'보기',run:()=>{const sel=$('pref-appearance');if(sel){sel.value='system';sel.dispatchEvent(new Event('change',{bubbles:true}));}}},
  {id:'run.run',label:'실행 / 계속',group:'실행',run:()=>options.runCommand?.('run')},
  {id:'run.debug',label:'디버그 시작 / 계속',group:'실행',run:()=>options.runCommand?.('debug')},
  {id:'run.stop',label:'디버그 및 실행 중지',group:'실행',run:()=>options.debugCommand?.('stop')},
  {id:'run.pause',label:'일시정지',group:'실행',run:()=>options.debugCommand?.('pause')},
  {id:'run.over',label:'한 줄 실행',group:'실행',run:()=>options.debugCommand?.('over')},
  {id:'run.into',label:'함수 안으로',group:'실행',run:()=>options.debugCommand?.('into')},
  {id:'run.out',label:'함수 밖으로',group:'실행',run:()=>options.debugCommand?.('out')},
  {id:'run.step',label:'20 ms 한 단계 실행',group:'실행',run:click('step')},
  {id:'run.build',label:'빌드',group:'실행',run:click('ide-build')},
  {id:'run.target.sim',label:'실행 대상: 회로 시뮬레이터 (C 해석)',group:'실행',run:()=>options.setTarget?.('simulator')},
  {id:'run.target.emu',label:'실행 대상: 펌웨어 에뮬레이터 (ARM ELF)',group:'실행',run:()=>options.setTarget?.('emulator')},
  {id:'run.target.arm',label:'실행 대상: STM32 · ARM GCC (실물 보드)',group:'실행',run:()=>options.setTarget?.('arm')},
  {id:'run.target.host',label:'실행 대상: Windows · C/C++',group:'실행',run:()=>options.setTarget?.('host')},
  {id:'run.tools',label:'개발 도구 설정',group:'실행',run:click('native-tools')},
  {id:'run.connection',label:'보드 연결 설정',group:'실행',run:click('native-connection')},
  {id:'run.sound',label:'부저 소리 켜기 / 끄기',group:'실행',run:click('sound')},
  {id:'run.pinout',label:'Pinout & Configuration 열기',group:'실행',run:click('pinout-open')},
  {id:'terminal.start',label:'터미널: 시작',group:'터미널',run:()=>{layout.showPanel('native');click('terminal-start')();}},
  {id:'terminal.stop',label:'터미널: 종료',group:'터미널',run:click('terminal-close')},
  {id:'terminal.clear',label:'출력 지우기',group:'터미널',run:click('clear-console')},
  {id:'help.guide',label:'사용 방법',group:'도움말',run:click('help')},
  {id:'help.update',label:'업데이트 확인 · 설치',group:'도움말',run:click('app-update')},
  {id:'help.shortcuts',label:'키보드 단축키 보기',group:'도움말',run:()=>layout.showView('keybindings')}
 ].map(key));
}

function buildMenus(layout){
 const bar=$('menubar');
 const groups=['파일','편집','보기','실행','터미널','도움말'];
 const map={'파일':['file.newProject','file.openProject','file.openCircuit','-','file.save','file.exportMain','-','file.import','file.importFolder','file.addSource','-','file.openElf'],
  '편집':['edit.undo','edit.redo','-','edit.find','edit.replace','-','edit.format','edit.formatSelection','-','edit.rotate','edit.delete','-','edit.codeReset','edit.boardReset','-','view.settings','view.keybindings'],
  '보기':['view.palette','view.quickOpen','-','view.explorer','view.parts','view.examples','view.board','view.debug','view.docs','-','view.toggleSidebar','view.togglePanel','view.toggleAux','-','view.problems','view.output','view.terminal','view.serial','view.wave','view.logic','-','view.swap','view.orientation','view.maxCircuit','view.maxCode','view.reset','-','view.theme','view.themeSystem'],
  '실행':['run.run','run.debug','run.stop','run.pause','-','run.over','run.into','run.out','run.step','-','run.build','-','run.target.sim','run.target.emu','run.target.arm','run.target.host','-','run.pinout','run.tools','run.connection','run.sound'],
  '터미널':['terminal.start','terminal.stop','terminal.clear'],
  '도움말':['help.guide','help.shortcuts','help.update']};
 const byId=new Map(layout.commands().map(c=>[c.id,c]));
 let open=null;
 for(const g of groups){
  const b=document.createElement('button');b.type='button';b.className='menubar-item';b.textContent=g;b.setAttribute('aria-haspopup','menu');b.setAttribute('aria-expanded','false');
  const menu=document.createElement('div');menu.className='menu workbench-popover';menu.setAttribute('popover','auto');menu.setAttribute('role','menu');menu.setAttribute('aria-label',g);menu.id='menu-'+groups.indexOf(g);
  for(const id of map[g]){if(id==='-'){const hr=document.createElement('div');hr.className='menu-separator';hr.setAttribute('role','separator');menu.append(hr);continue;}const c=byId.get(id);if(!c)continue;const item=document.createElement('button');item.type='button';item.className='menu-item';item.setAttribute('role','menuitem');item.dataset.command=c.id;item.innerHTML=`<span>${escapeHtml(c.label.replace(/^보기: |^패널: /,''))}</span><kbd></kbd>`;item.onclick=()=>{menu.hidePopover();c.run();};menu.append(item);}
  document.body.append(menu);b.setAttribute('popovertarget',menu.id);bar.append(b);
  // Position and fill shortcuts before the menu is shown: 'toggle' fires after it is already visible.
  menu.addEventListener('beforetoggle',e=>{if(e.newState!=='open')return;open=menu;const r=b.getBoundingClientRect();menu.style.left=r.left+'px';menu.style.top=(r.bottom+2)+'px';refreshMenu(menu);});
  menu.addEventListener('toggle',e=>{b.setAttribute('aria-expanded',String(e.newState==='open'));if(e.newState!=='open'&&open===menu)open=null;});
  b.addEventListener('pointerenter',()=>{if(open&&open!==menu){open.hidePopover();menu.showPopover();}});
  menu.addEventListener('keydown',e=>{const items=[...menu.querySelectorAll('.menu-item:not(:disabled)')],i=items.indexOf(document.activeElement);if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();items[(i+(e.key==='ArrowDown'?1:items.length-1))%items.length]?.focus();}if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();const menus=[...bar.children],j=menus.indexOf(b),next=menus[(j+(e.key==='ArrowRight'?1:menus.length-1))%menus.length];menu.hidePopover();next.click();requestAnimationFrame(()=>document.querySelector('#'+next.getAttribute('popovertarget')+' .menu-item')?.focus());}});
 }
 // Escape closes an open menu before the circuit editor's own Escape handling sees it.
 window.addEventListener('keydown',e=>{if(open&&e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();const b=bar.querySelector(`[popovertarget="${open.id}"]`);open.hidePopover();b?.focus();}},true);
 function refreshMenu(menu){
  // Mirror the enabled state of the controls each command clicks.
  const targets={'file.newProject':'new','file.openProject':'workspace-open','file.openCircuit':'open','file.save':'save','file.exportMain':'main-export','file.import':'firmware-import','file.importFolder':'firmware-folder','file.addSource':'source-add','edit.undo':'undo','edit.redo':'redo','edit.rotate':'rotate','edit.delete':'delete','edit.codeReset':'code-reset','edit.boardReset':'board-reset','run.debug':'debug-start','run.step':'step','run.build':'ide-build','run.tools':'native-tools','run.connection':'native-connection','run.pinout':'pinout-open','terminal.start':'terminal-start','terminal.stop':'terminal-close'};
  for(const item of menu.querySelectorAll('[data-command]')){const k=keyOf(layout,byId.get(item.dataset.command)),kbd=item.querySelector('kbd');kbd.textContent=k;kbd.hidden=!k;const id=targets[item.dataset.command];const el=id&&$(id);item.disabled=!!id&&(!el||el.disabled||(el.hidden&&!['new','workspace-open','open','native-connection','step','native-tools'].includes(id)));}
 }
}

function setupPalette(layout,options){
 const dialog=document.createElement('dialog');dialog.id='command-palette';dialog.className='command-palette';dialog.setAttribute('aria-label','명령 팔레트');
 dialog.innerHTML='<input id="command-palette-input" role="combobox" aria-expanded="true" aria-controls="command-palette-list" aria-autocomplete="list" autocomplete="off" spellcheck="false" placeholder="명령을 입력하세요 (> 명령, 파일 이름으로 이동)"><div id="command-palette-list" role="listbox"></div>';
 document.body.append(dialog);
 const input=dialog.querySelector('input'),list=dialog.querySelector('[role=listbox]');let items=[],index=0;
 const score=(text,query)=>{if(!query)return 1;text=text.toLowerCase();query=query.toLowerCase();if(text.includes(query))return 100-text.indexOf(query);let t=0,s=0;for(const ch of query){const i=text.indexOf(ch,t);if(i<0)return 0;s+=i===t?3:1;t=i+1;}return s;};
 function compute(){
  const value=input.value;
  if(value.startsWith('>')){const q=value.slice(1).trim();items=layout.commands().map(c=>({...c,score:score(c.group+' '+c.label,q)})).filter(c=>c.score>0).sort((a,b)=>b.score-a.score).slice(0,60);}
  else{const q=value.trim();const files=options.files?.()||[];items=files.map(name=>({id:'file:'+name,label:name,group:'파일로 이동',score:score(name,q),run:()=>options.openFile?.(name)})).filter(c=>c.score>0).sort((a,b)=>b.score-a.score);
   if(q.startsWith(':')){const line=Number(q.slice(1));items=Number.isInteger(line)&&line>0?[{id:'line',label:`${line}행으로 이동`,group:'현재 파일',run:()=>options.gotoLine?.(line)}]:[];}
   if(!items.length&&q)items=[{id:'hint',label:'> 를 입력하면 명령을 검색합니다',group:'',run:()=>{input.value='>'+q;compute();}}];}
  index=0;paint();
 }
 function paint(){list.innerHTML=items.map((c,i)=>`<div role="option" id="palette-item-${i}" class="palette-item ${i===index?'active':''}" aria-selected="${i===index}" data-index="${i}"><span class="palette-label">${escapeHtml(c.label)}</span><span class="palette-group">${escapeHtml(c.group||'')}</span>${keyOf(layout,c)?`<kbd>${escapeHtml(keyOf(layout,c))}</kbd>`:''}</div>`).join('')||'<div class="palette-empty">일치하는 명령이 없습니다.</div>';input.setAttribute('aria-activedescendant',items.length?'palette-item-'+index:'');list.querySelector('.active')?.scrollIntoView({block:'nearest'});}
 function run(i){const c=items[i];if(!c)return;dialog.close();setTimeout(()=>c.run(),0);}
 input.addEventListener('input',compute);
 input.addEventListener('keydown',e=>{if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();index=(index+(e.key==='ArrowDown'?1:items.length-1))%Math.max(1,items.length);paint();}if(e.key==='Enter'){e.preventDefault();run(index);}});
 list.addEventListener('click',e=>{const el=e.target.closest('[data-index]');if(el)run(Number(el.dataset.index));});
 dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close();});
 return {open(prefix=''){if(document.querySelector('dialog[open]'))return;input.value=prefix;dialog.showModal();compute();input.focus();input.setSelectionRange(input.value.length,input.value.length);}};
}

function keyboard(layout,options){
 const match=createMatcher(()=>layout.bindings());
 const byId=id=>layout.commands().find(c=>c.id===id);
 // Holding a step key (F11 …) keeps stepping; a step is ignored until the previous one pauses again.
 const REPEATABLE=['run.over','run.into','run.out','run.step'];
 window.addEventListener('keydown',e=>{
  if(e.defaultPrevented||e.isComposing)return;
  if(e.repeat){
   const key=eventKey(e),id=key&&REPEATABLE.find(id=>layout.keyFor(id)===key);
   if(id&&!document.querySelector('dialog[open]')){e.preventDefault();e.stopImmediatePropagation();byId(id)?.run();}
   return;
  }
  if(document.querySelector('dialog[open]:not(#command-palette)')||document.activeElement?.closest('.keybinding-capture'))return;
  const key=eventKey(e);if(!key)return;
  // Inside Monaco, plain Ctrl+Shift+letter view shortcuts give way to the editor's own commands.
  if(document.activeElement?.closest('.monaco-editor')&&/^Ctrl\+Shift\+[A-Z]$/.test(key)&&!['Ctrl+Shift+P','Ctrl+Shift+B'].includes(key))return;
  if(key==='F1'){e.preventDefault();e.stopImmediatePropagation();layout.openPalette('>');return;}
  const hit=match(e);if(!hit)return;
  e.preventDefault();e.stopImmediatePropagation();
  if(hit.id)byId(hit.id)?.run();
 },true);
}

const keyOf=(layout,c)=>c?(layout.keyFor(c.id)||c.keys||''):'';

// Activity bar tooltips sit to the right of the icon, vertically centred (VS Code style).
function setupActivityTips(bar,labelFor){
 const tip=document.createElement('div');tip.className='activity-tip';tip.setAttribute('role','tooltip');tip.id='activity-tip';tip.hidden=true;document.body.append(tip);
 let timer=null;
 const show=b=>{const text=labelFor(b.dataset.activity);if(!text)return;tip.textContent=text;tip.hidden=false;const r=b.getBoundingClientRect();tip.style.left=(r.right+6)+'px';tip.style.top=(r.top+r.height/2-tip.offsetHeight/2)+'px';b.setAttribute('aria-describedby','activity-tip');};
 const hide=()=>{clearTimeout(timer);tip.hidden=true;};
 bar.addEventListener('pointerover',e=>{const b=e.target.closest('[data-activity]');if(!b)return;clearTimeout(timer);timer=setTimeout(()=>show(b),tip.hidden?350:0);});
 bar.addEventListener('pointerout',e=>{const b=e.target.closest('[data-activity]');if(b&&!b.contains(e.relatedTarget))hide();});
 bar.addEventListener('focusin',e=>{const b=e.target.closest('[data-activity]');if(b&&b.matches(':focus-visible'))show(b);});
 bar.addEventListener('focusout',hide);bar.addEventListener('pointerdown',hide);bar.addEventListener('dragstart',hide);
}

// Drag-and-drop (and Alt+Arrow) reordering of the activity bar icons.
function setupActivityDrag(top,onChange){
 let dragged=null;
 const order=()=>[...top.querySelectorAll('[data-activity]')].map(b=>b.dataset.activity);
 const clear=()=>top.querySelectorAll('.drop-before,.drop-after').forEach(b=>b.classList.remove('drop-before','drop-after'));
 top.addEventListener('dragstart',e=>{dragged=e.target.closest('[data-activity]');if(!dragged)return;e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',dragged.dataset.activity);dragged.classList.add('dragging');});
 top.addEventListener('dragover',e=>{if(!dragged)return;const b=e.target.closest('[data-activity]');e.preventDefault();e.dataTransfer.dropEffect='move';clear();if(b&&b!==dragged){const r=b.getBoundingClientRect();b.classList.add(e.clientY<r.top+r.height/2?'drop-before':'drop-after');}});
 top.addEventListener('dragleave',e=>{if(!top.contains(e.relatedTarget))clear();});
 top.addEventListener('drop',e=>{if(!dragged)return;e.preventDefault();const b=e.target.closest('[data-activity]');if(b&&b!==dragged){const r=b.getBoundingClientRect();if(e.clientY<r.top+r.height/2)b.before(dragged);else b.after(dragged);}else if(!b)top.append(dragged);clear();onChange(order());});
 top.addEventListener('dragend',()=>{dragged?.classList.remove('dragging');dragged=null;clear();});
 top.addEventListener('keydown',e=>{const b=e.target.closest('[data-activity]');if(!b||!e.altKey||!['ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();if(e.key==='ArrowUp'&&b.previousElementSibling)b.previousElementSibling.before(b);else if(e.key==='ArrowDown'&&b.nextElementSibling)b.nextElementSibling.after(b);b.focus();onChange(order());});
}

// Keyboard shortcut editor (편집 → 단축키 설정).
function setupKeybindingsView(layout){
 const view=$('view-keybindings');if(!view)return;
 view.innerHTML='<div class="keybinding-head"><input id="keybinding-search" type="search" placeholder="명령 또는 키 검색" aria-label="단축키 검색" autocomplete="off"><button type="button" id="keybinding-reset-all" class="secondary" title="모든 단축키를 기본값으로">초기화</button></div><p class="form-hint">항목을 누른 뒤 원하는 키 조합을 입력하세요. Enter 저장 · Esc 취소 · Backspace 지우기. 두 단계 키(예: Ctrl+K Ctrl+S)도 연속으로 누르면 됩니다.</p><div id="keybinding-list" class="keybinding-list" role="list"></div>';
 const list=view.querySelector('#keybinding-list'),search=view.querySelector('#keybinding-search');
 const label=id=>layout.commands().find(c=>c.id===id)?.label?.replace(/^보기: /,'')||id;
 let editing=null,captured='',chordTimer=null;
 function render(){
  const q=search.value.trim().toLowerCase(),b=layout.bindings();
  const rows=Object.keys(DEFAULT_KEYBINDINGS).filter(id=>!q||label(id).toLowerCase().includes(q)||(b[id]||'').toLowerCase().includes(q)||id.includes(q));
  list.innerHTML=rows.map(id=>{const k=b[id],changed=k!==DEFAULT_KEYBINDINGS[id],clash=conflicts(b,id,k);
   return `<div class="keybinding-row" role="listitem" data-binding="${id}"><span class="keybinding-label" title="${escapeHtml(id)}">${escapeHtml(label(id))}${clash.length?`<small class="keybinding-conflict">충돌: ${escapeHtml(clash.map(label).join(', '))}</small>`:''}</span><button type="button" class="keybinding-key${editing===id?' keybinding-capture':''}" data-edit="${id}" aria-label="${escapeHtml(label(id))} 단축키 변경">${editing===id?escapeHtml(captured||'키 입력…'):(k?`<kbd>${escapeHtml(k)}</kbd>`:'<span class="form-hint">없음</span>')}</button>${changed?`<button type="button" class="keybinding-reset" data-reset="${id}" title="기본값 (${escapeHtml(DEFAULT_KEYBINDINGS[id])})" aria-label="${escapeHtml(label(id))} 기본값으로">↺</button>`:'<span class="keybinding-reset-spacer"></span>'}</div>`;}).join('')||'<p class="form-hint">일치하는 명령이 없습니다.</p>';
  if(editing)list.querySelector('.keybinding-capture')?.focus();
 }
 const stop=()=>{editing=null;captured='';clearTimeout(chordTimer);render();};
 list.addEventListener('click',e=>{const edit=e.target.closest('[data-edit]'),reset=e.target.closest('[data-reset]');
  if(edit){editing=edit.dataset.edit;captured='';render();}
  if(reset){layout.setBinding(reset.dataset.reset,DEFAULT_KEYBINDINGS[reset.dataset.reset]);render();}});
 list.addEventListener('keydown',e=>{
  if(!editing||!e.target.closest('.keybinding-capture'))return;
  e.preventDefault();e.stopPropagation();
  if(!e.ctrlKey&&!e.altKey&&!e.shiftKey){
   if(e.key==='Escape')return stop();
   if(e.key==='Enter'){if(captured)layout.setBinding(editing,captured);return stop();}
   if(e.key==='Backspace'||e.key==='Delete'){layout.setBinding(editing,'');return stop();}
  }
  const key=eventKey(e);if(!key)return;
  captured=captured&&!captured.includes(' ')&&chordTimer?captured+' '+key:key;
  clearTimeout(chordTimer);chordTimer=setTimeout(()=>{chordTimer=null;},1200);
  const btn=list.querySelector('.keybinding-capture');if(btn)btn.textContent=captured;
 });
 list.addEventListener('focusout',e=>{if(editing&&e.target.closest('.keybinding-capture')&&!list.contains(e.relatedTarget))setTimeout(()=>{if(editing&&!list.querySelector('.keybinding-capture:focus'))stop();},0);});
 search.addEventListener('input',render);
 view.querySelector('#keybinding-reset-all').onclick=()=>{layout.resetBindings();render();};
 layout.onBindings(render);render();
}
