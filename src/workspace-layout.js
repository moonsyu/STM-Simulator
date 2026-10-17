import {DEFAULT_LAYOUT,PANELS,validateLayout,movePanel} from './layout-model.js';
const KEY='stm32lab.workspaceLayout.v1';
const names={project:'프로젝트 · 부품',code:'코드',simulator:'시뮬레이터',terminal:'터미널 · 모니터'};
const svg=(path)=>`<svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><path d="${path}" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
export function setupWorkspaceLayout() {
  const shell=document.querySelector('.app-shell'),root=document.createElement('div');root.id='dock-root';
  const contents={project:document.querySelector('.library'),code:document.querySelector('.editor-panel'),simulator:document.querySelector('.workbench'),terminal:document.querySelector('.console')};
  let tree=structuredClone(DEFAULT_LAYOUT),hidden=new Set(),maximized=null,dragging=null;
  try{const s=JSON.parse(localStorage.getItem(KEY));if(s){tree=validateLayout(s.tree);hidden=new Set((s.hidden||[]).filter(x=>PANELS.includes(x)));if(hidden.size===4)hidden.clear();}}catch{}
  const panels=new Map();let moving=null;
  const moveDialog=document.createElement('dialog');moveDialog.id='dock-move-dialog';moveDialog.setAttribute('aria-labelledby','dock-move-title');
  moveDialog.innerHTML='<h2 id="dock-move-title">패널 이동</h2><label for="dock-move-target">이동할 위치</label><select id="dock-move-target"></select><div class="dialog-actions"><button id="dock-move-cancel" autofocus>취소</button><button id="dock-move-apply" class="run-button">이동</button></div>';
  document.body.append(moveDialog);const moveSelect=moveDialog.querySelector('select');
  moveDialog.querySelector('#dock-move-cancel').onclick=()=>moveDialog.close();
  moveDialog.querySelector('#dock-move-apply').onclick=()=>{const [target,edge]=moveSelect.value.split(':');if(!moving||!target)return;tree=movePanel(tree,moving,target,edge);hidden.delete(target);hidden.delete(moving);maximized=null;moveDialog.close();paint();save();panels.get(moving).querySelector('.dock-heading').focus();};
  const openMove=id=>{if(document.querySelector('dialog[open]'))return;moving=id;moveDialog.querySelector('h2').textContent=names[id]+' 이동';moveSelect.replaceChildren(...PANELS.filter(p=>p!==id).flatMap(p=>['left','right','top','bottom'].map((edge,i)=>new Option(names[p]+' '+['왼쪽','오른쪽','위','아래'][i],p+':'+edge))));moveDialog.showModal();};
  for(const id of PANELS){
    const pane=document.createElement('section');pane.className='dock-pane';pane.dataset.panel=id;pane.setAttribute('aria-label',names[id]);
    const head=document.createElement('header');head.className='dock-heading';head.draggable=true;head.tabIndex=0;head.title='제목을 끌어 이동 · 우클릭 / Shift+F10: 이동 위치 선택';head.innerHTML=`<span class="dock-grab" title="제목을 끌어 패널 이동">${svg('M6 5h.01M6 10h.01M6 15h.01M11 5h.01M11 10h.01M11 15h.01')}</span><strong>${names[id]}</strong><button class="dock-maximize" title="최대화 / 복원" aria-label="${names[id]} 최대화">${svg('M3 8V3h5M12 3h5v5M17 12v5h-5M8 17H3v-5')}</button><button class="dock-collapse" title="패널 접기" aria-label="${names[id]} 접기">${svg('M4 10h12')}</button>`;
    const body=document.createElement('div');body.className='dock-content';body.append(contents[id]);pane.append(head,body);panels.set(id,pane);
    head.addEventListener('dragstart',e=>{if(e.target.closest('button,select')){e.preventDefault();return;}dragging=id;e.dataTransfer.setData('text/plain',id);e.dataTransfer.effectAllowed='move';root.classList.add('docking');});
    head.addEventListener('dragend',clearDrop);
    head.oncontextmenu=e=>{e.preventDefault();openMove(id);};
    head.onkeydown=e=>{if(e.key==='ContextMenu'||e.shiftKey&&!e.ctrlKey&&!e.altKey&&!e.metaKey&&e.key==='F10'){e.preventDefault();e.stopPropagation();openMove(id);}};
    head.querySelector('.dock-maximize').onclick=()=>{maximized=maximized===id?null:id;paint();};
    head.querySelector('.dock-collapse').onclick=()=>{if(hidden.size===3)return;hidden.add(id);maximized=null;paint();save();};
    head.ondblclick=e=>{if(!e.target.closest('button,select')){maximized=maximized===id?null:id;paint();}};
    pane.addEventListener('dragover',e=>{if(!dragging||dragging===id)return;e.preventDefault();e.dataTransfer.dropEffect='move';const r=pane.getBoundingClientRect(),x=(e.clientX-r.left)/r.width,y=(e.clientY-r.top)/r.height;const values=[x,1-x,y,1-y];pane.dataset.drop=['left','right','top','bottom'][values.indexOf(Math.min(...values))];});
    pane.addEventListener('dragleave',e=>{if(!pane.contains(e.relatedTarget))delete pane.dataset.drop;});
    pane.addEventListener('drop',e=>{if(!dragging||dragging===id)return;e.preventDefault();tree=movePanel(tree,dragging,id,pane.dataset.drop||'right');maximized=null;clearDrop();paint();save();});
  }
  const parking=document.createElement('div');parking.hidden=true;parking.id='dock-parking';
  shell.replaceChildren(root,parking);shell.classList.add('ide-shell');
  const view=document.createElement('div');view.className='layout-controls';view.innerHTML=`<select id="panel-show" aria-label="패널 표시"><option value="">패널 표시</option>${PANELS.map(id=>`<option value="${id}">${names[id]}</option>`).join('')}</select><button id="layout-reset" title="IDE 기본 배치로 되돌리기">배치 초기화</button>`;document.querySelector('.top-actions').prepend(view);
  view.querySelector('select').onchange=e=>{reveal(e.target.value);e.target.value='';};
  view.querySelector('button').onclick=()=>{tree=structuredClone(DEFAULT_LAYOUT);hidden.clear();maximized=null;paint();save();};
  function clearDrop(){dragging=null;root.classList.remove('docking');for(const p of panels.values())delete p.dataset.drop;}
  function save(){try{localStorage.setItem(KEY,JSON.stringify({tree,hidden:[...hidden]}));}catch{}}
  function branch(node,path='root'){
    if(typeof node==='string')return panels.get(node);
    const el=document.createElement('div');el.className='dock-split';el.dataset.axis=node.axis;
    const a=document.createElement('div'),b=document.createElement('div');a.className=b.className='dock-branch';
    a.append(branch(node.a,path+'a'));b.append(branch(node.b,path+'b'));
    const grip=document.createElement('div');grip.className='dock-resizer';grip.tabIndex=0;grip.role='separator';grip.setAttribute('aria-label','패널 크기 조절');grip.setAttribute('aria-orientation',node.axis==='x'?'vertical':'horizontal');grip.setAttribute('aria-valuemin','1');grip.setAttribute('aria-valuemax','99');grip.title='드래그 / 방향키: 크기 조절 · 두 번 클릭: 균등 분할';
    function resize(r){node.ratio=Math.max(.01,Math.min(.99,r));if(node.origin)node.origin.ratio=node.ratio;a.style.flex=`${node.ratio} 1 0px`;b.style.flex=`${1-node.ratio} 1 0px`;grip.setAttribute('aria-valuenow',String(Math.round(node.ratio*100)));}
    let active=null;
    grip.onpointerdown=e=>{if(e.button!==0)return;e.preventDefault();const r=el.getBoundingClientRect();active={id:e.pointerId,start:node.axis==='x'?e.clientX:e.clientY,size:(node.axis==='x'?r.width:r.height)-6,ratio:node.ratio};grip.setPointerCapture(e.pointerId);document.body.classList.add('resizing-workspace');};
    grip.onpointermove=e=>{if(active?.id===e.pointerId)resize(active.ratio+((node.axis==='x'?e.clientX:e.clientY)-active.start)/Math.max(1,active.size));};
    const end=()=>{if(!active)return;active=null;document.body.classList.remove('resizing-workspace');save();};for(const event of ['pointerup','pointercancel','lostpointercapture'])grip.addEventListener(event,end);
    grip.ondblclick=()=>{resize(.5);save();};grip.onkeydown=e=>{const keys=node.axis==='x'?['ArrowLeft','ArrowRight']:['ArrowUp','ArrowDown'];if(![...keys,'Home','End'].includes(e.key))return;e.preventDefault();e.stopPropagation();resize(e.key==='Home'?.01:e.key==='End'?.99:node.ratio+(e.key===keys[0]?-1:1)*(e.shiftKey?.1:.02));save();};
    resize(node.ratio);el.append(a,grip,b);return el;
  }
  function paint(){
    // Move live DOM nodes; editors and terminal output are never reconstructed.
    for(const p of panels.values())parking.append(p);
    const prune=n=>{if(typeof n==='string')return hidden.has(n)?null:n;const a=prune(n.a),b=prune(n.b);return !a?b:!b?a:{...n,a,b,origin:n};};
    const visible=prune(tree);
    root.replaceChildren(branch(maximized||visible));
    for(const [id,p]of panels){p.classList.toggle('maximized',id===maximized);p.querySelector('.dock-maximize').setAttribute('aria-pressed',String(id===maximized));}
    window.dispatchEvent(new Event('resize'));
  }
  function reveal(id){if(!PANELS.includes(id))return;hidden.delete(id);maximized=null;paint();save();}
  paint();return {reveal,maximize(id){hidden.delete(id);maximized=maximized===id?null:id;paint();},snapshot:()=>({tree:structuredClone(tree),hidden:[...hidden]})};
}
