import {BB,inverse} from './geometry.js';
import {localTerminals} from './components.js';
import {resizeFrame,resizeFromHandle} from './resize.js';
const $=id=>document.getElementById(id);
export function setupResizing(o){
 const row=document.createElement('div');row.className='object-size-tools';row.innerHTML='<label for="resize-target">장치 선택</label><select id="resize-target" aria-label="크기를 바꿀 장치"></select><output id="resize-size" aria-live="polite"></output>';
 document.querySelector('.canvas-heading').after(row);
 const svg=$('circuit'),layer=document.createElementNS('http://www.w3.org/2000/svg','g');layer.id='resize-layer';layer.setAttribute('pointer-events','none');$('surface').insertBefore(layer,$('part-layer'));
 const positions={nw:[0,0],n:[.5,0],ne:[1,0],e:[1,.5],se:[1,1],s:[.5,1],sw:[0,1],w:[0,.5]};
 const labels={nw:'왼쪽 위',n:'위',ne:'오른쪽 위',e:'오른쪽',se:'오른쪽 아래',s:'아래',sw:'왼쪽 아래',w:'왼쪽'};
 let target={type:'surface',id:'board'},active=null,frame=null;
 const point=e=>new DOMPoint(e.clientX,e.clientY).matrixTransform(svg.getScreenCTM().inverse());
 const available=()=>!o.isRunning()&&o.canResize();
 $('resize-target').onchange=()=>{const [type,id]=$('resize-target').value.split(':');target={type,id};o.select(target);refresh();if(frame)o.focus(frame);};
 row.title='가장자리 드래그 · Shift: 비율 유지 · Alt+0: 선택한 장치 기본 크기';
 function boundsFor(p){
  if(target.type==='surface'){const box=svg.querySelector(`[data-surface="${target.id}"]`)?.getBBox();return box&&{x:box.x,y:box.y,width:box.width,height:box.height};}
  const object=p.components.find(c=>c.id===target.id);if(!object)return null;
  if(object.type==='breadboard')return {x:-BB.w/2,y:-BB.h/2,width:BB.w,height:BB.h};
  const box=svg.querySelector(`[data-part="${target.id}"] .part-body`)?.getBBox();if(!box)return null;
  const pins=localTerminals({...object,scale:1,scaleX:1,scaleY:1,skewX:0}),m=inverse(resizeFrame(p,target,box).matrix),rx=6*Math.hypot(m.a,m.c),ry=6*Math.hypot(m.b,m.d);
  const x=Math.min(box.x,...pins.map(t=>t.x-rx)),y=Math.min(box.y,...pins.map(t=>t.y-ry)),right=Math.max(box.x+box.width,...pins.map(t=>t.x+rx)),bottom=Math.max(box.y+box.height,...pins.map(t=>t.y+ry));return {x,y,width:Math.max(1,right-x),height:Math.max(1,bottom-y)};
 }
 function finish(cancel=false){
  if(!active)return;const previous=active;active=null;
  if(svg.hasPointerCapture(previous.pointerId))svg.releasePointerCapture(previous.pointerId);
  svg.classList.remove('resizing-device');
  if(cancel)o.cancel(previous.base);else if(previous.moved)o.commit(previous.base,o.getProject());
  if(previous.error&&!cancel)o.onError(previous.error);refresh();
 }
 svg.addEventListener('pointerdown',e=>{
  const handle=e.target.closest('[data-resize-handle]');if(!handle||e.button!==0||!available()||!frame)return;
  e.preventDefault();e.stopImmediatePropagation();svg.focus({preventScroll:true});
  active={pointerId:e.pointerId,base:structuredClone(o.getProject()),target:{...target},bounds:{...frame.bounds},handle:handle.dataset.resizeHandle,start:point(e),moved:false};
  svg.setPointerCapture(e.pointerId);svg.classList.add('resizing-device');
 },true);
 svg.addEventListener('pointermove',e=>{
  if(!active||e.pointerId!==active.pointerId)return;e.preventDefault();e.stopImmediatePropagation();
  const end=point(e);if(!active.moved&&Math.hypot(end.x-active.start.x,end.y-active.start.y)<.1)return;
  try{const next=resizeFromHandle(active.base,active.target,active.bounds,active.handle,active.start,end,e.shiftKey);active.moved=true;active.error=null;o.preview(next);}catch(error){active.error=error.message;}
 },true);
 for(const event of ['pointerup','pointercancel','lostpointercapture'])svg.addEventListener(event,e=>{if(!active||e.pointerId!==active.pointerId)return;e.stopImmediatePropagation();finish(event!=='pointerup');},true);
 window.addEventListener('blur',()=>finish(true));
 window.addEventListener('keydown',e=>{
  if(active){if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();finish(true);}else if(e.key!=='Shift'){e.preventDefault();e.stopImmediatePropagation();}return;}
  if(e.altKey&&!e.ctrlKey&&!e.metaKey&&!e.shiftKey&&e.key==='0'&&!e.repeat&&!document.querySelector('dialog[open]')&&(svg.contains(e.target)||row.contains(e.target))){
   e.preventDefault();e.stopImmediatePropagation();
   if(available()&&target&&['part','surface'].includes(o.getSelection()?.type)){try{o.resize(target,1);}catch(error){o.onError(error.message);}refresh();}return;
  }
  const handle=e.target.closest?.('[data-resize-handle]');if(!handle||!available()||!frame||!e.key.startsWith('Arrow'))return;
  e.preventDefault();e.stopImmediatePropagation();const step=(e.altKey?10:1)/Math.hypot(svg.getScreenCTM().a,svg.getScreenCTM().b),key=handle.dataset.resizeHandle;
  const end={x:e.key==='ArrowLeft'?-step:e.key==='ArrowRight'?step:0,y:e.key==='ArrowUp'?-step:e.key==='ArrowDown'?step:0};
  try{const base=structuredClone(o.getProject()),next=resizeFromHandle(base,target,frame.bounds,key,{x:0,y:0},end,e.shiftKey);o.commit(base,next);layer.querySelector(`rect[data-resize-handle="${key}"]`)?.focus();}catch(error){o.onError(error.message);}
 },true);
 svg.addEventListener('wheel',e=>{if(active){e.preventDefault();e.stopImmediatePropagation();}},{capture:true,passive:false});
 new ResizeObserver(()=>refresh()).observe(svg);
 function refresh(){
  const p=o.getProject(),selection=o.getSelection();if(['part','surface'].includes(selection?.type))target=selection;
  const items=[{type:'surface',id:'board',name:'STM32 보드'},{type:'surface',id:'breadboard',name:'기본 빵판'}].filter(item=>!p.surfaces?.[item.id]?.hidden).concat(p.components.map(c=>({type:'part',id:c.id,name:c.name})));
  if(!items.some(item=>item.id===target?.id&&item.type===target?.type))target=items[0];
  const select=$('resize-target'),key=items.map(item=>`${item.type}:${item.id}:${item.name}`).join('|');
  if(select.dataset.items!==key){select.replaceChildren(...items.map(item=>new Option(item.name,`${item.type}:${item.id}`)));select.dataset.items=key;}
  select.value=target?`${target.type}:${target.id}`:'';
  $('resize-target').disabled=o.isRunning()||!target;
  layer.replaceChildren();frame=null;$('resize-size').textContent='';
  if(!target||!available()||!['surface','part'].includes(selection?.type))return;
  const bodyBounds=boundsFor(p);if(!bodyBounds)return;const bounds=active?.bounds??{...bodyBounds};
  const part=target.type==='part'?svg.querySelector(`[data-part="${target.id}"]`):null;if(part?.parentElement.id==='part-layer')part.parentElement.insertBefore(layer,part);else $('surface').append(layer);
  frame=resizeFrame(p,target,bounds);const unit=1/Math.hypot(svg.getScreenCTM()?.a||1,svg.getScreenCTM()?.b||0),r=5*unit;
  // Leave the body draggable and keep real terminals above the resize controls.
  if(!active){const ux=unit/Math.hypot(frame.matrix.a,frame.matrix.b),uy=unit/Math.hypot(frame.matrix.c,frame.matrix.d),w=Math.max(bounds.width+16*ux,32*ux),h=Math.max(bounds.height+16*uy,32*uy);bounds.x-=(w-bounds.width)/2;bounds.y-=(h-bounds.height)/2;bounds.width=w;bounds.height=h;}
  const b=frame.bounds,points=Object.fromEntries(Object.entries(positions).map(([key,[x,y]])=>[key,frame.point(b.x+x*b.width,b.y+y*b.height)]));
  const size={width:bodyBounds.width*Math.hypot(frame.matrix.a,frame.matrix.b),height:bodyBounds.height*Math.hypot(frame.matrix.c,frame.matrix.d)};
  $('resize-size').textContent=`${size.width.toFixed(1)} × ${size.height.toFixed(1)}`;
  const cursor=key=>{const [x,y]=positions[key],v=frame.matrix,angle=Math.atan2(v.b*(x-.5)+v.d*(y-.5),v.a*(x-.5)+v.c*(y-.5))*180/Math.PI;return ['ew-resize','nwse-resize','ns-resize','nesw-resize'][((Math.round(angle/45)%4)+4)%4];};
  layer.innerHTML=[['n','nw','ne'],['e','ne','se'],['s','se','sw'],['w','sw','nw']].map(([key,a,z])=>`<path class="resize-edge-hit" data-resize-handle="${key}" d="M${points[a].x} ${points[a].y}L${points[z].x} ${points[z].y}" style="cursor:${cursor(key)}"/><path class="resize-outline" d="M${points[a].x} ${points[a].y}L${points[z].x} ${points[z].y}"/>`).join('')+Object.entries(points).map(([key,p])=>`<rect class="resize-handle" data-resize-handle="${key}" x="${p.x-r}" y="${p.y-r}" width="${r*2}" height="${r*2}" rx="${unit}" tabindex="0" role="button" aria-label="${labels[key]} 크기 조절; 방향키로 미세 조절, Shift로 비율 유지" style="cursor:${cursor(key)}"><title>${labels[key]} 크기 조절 · Esc: 드래그 취소</title></rect>`).join('');
 }
 refresh();return {refresh};
}
