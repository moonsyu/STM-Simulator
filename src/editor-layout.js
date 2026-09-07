// Layout is a local UI preference, not part of a circuit document.
export function setupEditorResize(){
  const shell=document.querySelector('.app-shell'),panel=document.querySelector('.editor-panel'),library=document.querySelector('.library');
  const grip=document.createElement('div');grip.id='editor-resizer';grip.tabIndex=0;grip.role='separator';grip.setAttribute('aria-orientation','vertical');grip.setAttribute('aria-label','코드·속성 패널 너비');grip.title='드래그 또는 방향키로 너비 조절 · 두 번 클릭하면 기본 너비';
  panel.before(grip);
  const key='stm32lab.editorWidth.v1';let preferred=440,drag=null;
  try{const saved=Number(localStorage.getItem(key));if(saved>=300&&saved<=1200)preferred=saved;}catch{}
  const bounds=()=>({min:300,max:Math.max(300,Math.min(1200,shell.clientWidth-library.getBoundingClientRect().width-478))});
  const paint=()=>{const {min,max}=bounds(),width=Math.round(Math.max(min,Math.min(max,preferred)));shell.style.setProperty('--editor-width',width+'px');grip.setAttribute('aria-valuemin',String(min));grip.setAttribute('aria-valuemax',String(max));grip.setAttribute('aria-valuenow',String(width));};
  const save=()=>{try{localStorage.setItem(key,String(preferred));}catch{}};
  grip.addEventListener('pointerdown',e=>{if(e.button!==0)return;e.preventDefault();drag={id:e.pointerId,x:e.clientX,width:panel.getBoundingClientRect().width};grip.setPointerCapture(e.pointerId);document.body.classList.add('resizing-editor');});
  grip.addEventListener('pointermove',e=>{if(!drag||drag.id!==e.pointerId)return;const {min,max}=bounds();preferred=Math.max(min,Math.min(max,drag.width+drag.x-e.clientX));paint();});
  const end=()=>{if(!drag)return;drag=null;document.body.classList.remove('resizing-editor');save();};
  for(const name of ['pointerup','pointercancel','lostpointercapture'])grip.addEventListener(name,end);
  grip.addEventListener('dblclick',()=>{preferred=440;paint();save();});
  grip.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();e.stopPropagation();const {min,max}=bounds();preferred=e.key==='Home'?min:e.key==='End'?max:Math.max(min,Math.min(max,Number(grip.getAttribute('aria-valuenow'))+(e.key==='ArrowLeft'?1:-1)*(e.shiftKey?50:20)));paint();save();});
  new ResizeObserver(paint).observe(shell);paint();
}
