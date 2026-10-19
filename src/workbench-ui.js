// Reuse live controls so their IDs, listeners and project state survive regrouping.
export function setupWorkbenchUi(){
 const $=id=>document.getElementById(id),root=document.documentElement;
 if(root.hasAttribute('data-workbench-ui'))return;
 root.setAttribute('data-workbench-ui','');
 const popovers=[];
 const focusFirst=panel=>[...panel.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],[tabindex]:not([tabindex="-1"])')].find(el=>el.getClientRects().length&&getComputedStyle(el).visibility!=='hidden')?.focus();
 function popup(id,label,nodes,host){
  const button=document.createElement('button');button.id=id+'-toggle';button.type='button';button.className='workbench-menu-toggle';button.textContent=label;button.setAttribute('aria-expanded','false');button.setAttribute('aria-controls',id);button.setAttribute('popovertarget',id);
  const panel=document.createElement('div');panel.id=id;panel.className='workbench-popover';panel.setAttribute('popover','auto');panel.setAttribute('role','group');panel.setAttribute('aria-label',label);panel.append(...nodes.filter(Boolean));document.body.append(panel);host.append(button);
  const position=()=>{if(!panel.matches(':popover-open'))return;const anchor=button.getBoundingClientRect(),r=panel.getBoundingClientRect();panel.style.left=Math.max(8,Math.min(anchor.left,innerWidth-r.width-8))+'px';panel.style.top=Math.max(8,Math.min(anchor.bottom+6,innerHeight-r.height-8))+'px';};
  let keyboardOpen=false;button.addEventListener('click',e=>{keyboardOpen=e.detail===0;});
  panel.addEventListener('toggle',e=>{button.setAttribute('aria-expanded',String(e.newState==='open'));if(e.newState==='open'){position();if(keyboardOpen)focusFirst(panel);}else if(panel.contains(document.activeElement))button.focus();keyboardOpen=false;});
  panel.addEventListener('click',e=>{const action=e.target.closest('button');if(action&&!action.matches('[data-color]'))panel.hidePopover();});
  panel.addEventListener('change',()=>{if(panel.contains($('panel-show')))panel.hidePopover();});
  popovers.push({panel,button,position});return {panel,button};
 }
 const actions=document.querySelector('.top-actions');
 const projectMenu=popup('project-actions','프로젝트',[$('new'),$('workspace-open'),$('open'),document.querySelector('.layout-controls'),$('app-update')],actions);
 actions.append($('save'));projectMenu.button.title='새 프로젝트, 열기 및 패널 배치';
 const library=document.querySelector('.library');
 function drawer(id,title,nodes){
  const group=document.createElement('details');group.id=id;group.className='library-drawer';const summary=document.createElement('summary');summary.textContent=title;summary.setAttribute('aria-controls',id+'-body');const body=document.createElement('div');body.id=id+'-body';body.className='library-drawer-body workbench-popover';body.setAttribute('popover','auto');body.setAttribute('role','group');body.setAttribute('aria-label',title);body.append(...nodes.filter(Boolean));group.append(summary,body);
  const position=()=>{if(!body.matches(':popover-open'))return;const anchor=summary.getBoundingClientRect(),r=body.getBoundingClientRect();body.style.left=Math.max(8,Math.min(anchor.right+6,innerWidth-r.width-8))+'px';body.style.top=Math.max(8,Math.min(anchor.top,innerHeight-r.height-8))+'px';};
  let keyboardOpen=false;summary.addEventListener('click',e=>{keyboardOpen=e.detail===0;});
  group.addEventListener('toggle',()=>{if(group.open&&!body.matches(':popover-open')){body.showPopover();position();}else if(!group.open&&body.matches(':popover-open'))body.hidePopover();});
  body.addEventListener('toggle',e=>{if(e.newState==='closed'){group.open=false;if(body.contains(document.activeElement))summary.focus();}else if(keyboardOpen)focusFirst(body);keyboardOpen=false;});
  body.addEventListener('click',e=>{if(e.target.closest('#pinout-open,#board-open,#board-reset'))body.hidePopover();});
  popovers.push({panel:body,button:summary,position});return group;
 }
 const project=drawer('project-library-tools','프로젝트 파일',[document.querySelector('.project-files')]);
 const hal=drawer('hal-library-tools','HAL 예제',[document.querySelector('label[for="hal-example"]'),$('hal-example-search'),$('hal-example-count'),$('hal-example'),document.querySelector('.hal-example-note')]);
 const board=drawer('board-library-tools','보드 · 핀 설정',[$('board-open'),$('pinout-open'),$('board-reset'),document.querySelector('.pin-search')]);
 library.prepend(project,hal,board);
 for(const group of [project,hal,board])group.addEventListener('toggle',()=>{if(group.open)for(const other of [project,hal,board])if(other!==group)other.open=false;});
 const editorHeading=document.querySelector('.editor-heading');
 popup('code-tools-menu','코드 도구',[document.querySelector('.firmware-tools'),$('language-toggle'),document.querySelector('.language-badge')],editorHeading);
 const codeHead=document.querySelector('[data-panel="code"] > .dock-heading');codeHead.classList.add('dock-tabbed');codeHead.insertBefore(document.querySelector('.panel-tabs'),codeHead.querySelector('strong'));
 const inspectTab=document.querySelector('[data-tab="inspect"]');inspectTab.textContent='속성';inspectTab.title='선택 장치 속성 / 측정';inspectTab.setAttribute('aria-label','속성 / 측정');
 const runToolbar=document.querySelector('.ide-toolbar');
 popup('execution-tools-menu','실행 도구',[$('sound'),$('step'),$('native-tools'),$('native-config'),$('native-connection')],runToolbar);
 const monitorStrip=document.querySelector('.monitor-strip');monitorStrip.append($('connection-count'));
 popup('monitor-status-menu','실행 상태',[monitorStrip],document.querySelector('.console-header'));
 const palette=$('wire-palette'),toolbar=document.querySelector('.workspace-toolbar');
 const paletteMenu=popup('wire-color-menu','배선 색상',[palette],toolbar);
 paletteMenu.button.title='배선 색상 선택';
 const chip=document.createElement('span');chip.className='palette-current';chip.setAttribute('aria-hidden','true');paletteMenu.button.prepend(chip);
 const updateChip=()=>{const selected=palette.querySelector('.active');chip.style.setProperty('--swatch',selected?.dataset.color||'#23a68a');paletteMenu.button.title=selected?.title||'배선 색상 선택';};
 new MutationObserver(updateChip).observe(palette,{subtree:true,attributes:true,attributeFilter:['class'],childList:true});updateChip();
 palette.addEventListener('click',e=>{if(e.target.closest('[data-color]'))paletteMenu.panel.hidePopover();});
 $('save-state').setAttribute('role','status');$('save-state').setAttribute('aria-live','polite');
 const title=()=>{$('project-name').title=$('project-name').value;};$('project-name').addEventListener('input',title);title();
 const updateHeight=()=>{const top=document.querySelector('.topbar').getBoundingClientRect().height,tools=document.querySelector('.ide-toolbar').getBoundingClientRect().height;root.style.setProperty('--workbench-chrome-height',(top+tools)+'px');for(const p of popovers)p.position();};
 const observer=new ResizeObserver(updateHeight);observer.observe(document.querySelector('.topbar'));observer.observe(document.querySelector('.ide-toolbar'));window.addEventListener('resize',updateHeight);updateHeight();
 const revealTab=tab=>{const group=tab.closest('.panel-tabs,.monitor-tabs,.source-tabs');if(!group)return;const r=group.getBoundingClientRect(),t=tab.getBoundingClientRect(),left=r.left+group.clientLeft,right=left+group.clientWidth;if(t.left<left)group.scrollLeft-=left-t.left;else if(t.right>right)group.scrollLeft+=t.right-right;};
 document.addEventListener('focusin',e=>{const tab=e.target.closest('.panel-tabs button,.monitor-tabs button,.source-tabs button');if(!tab)return;revealTab(tab);requestAnimationFrame(()=>{if(document.activeElement===tab)revealTab(tab);});});
 document.addEventListener('keydown',e=>{if(e.key!=='Escape')return;const open=popovers.find(p=>p.panel.matches(':popover-open'));if(!open)return;e.preventDefault();e.stopImmediatePropagation();open.panel.hidePopover();open.button.focus();},true);
 return {revealControl(id){const control=$(id);if(!control)return false;const group=control.closest('.library-drawer');if(group)group.open=true;const p=popovers.find(p=>p.panel.contains(control));if(p&&!p.panel.matches(':popover-open')){p.panel.showPopover();p.position();}return true;}};
}
