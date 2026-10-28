// Hovering an item in the HAL example list shows how the example lays out its parts on the board and breadboard:
// the example's circuit is drawn with the same renderers as the workspace, fitted into a small popup.
import {applyHalExample,halGuideFor} from './hal-examples.js';
import {blankProject} from './project.js';
import {getBoard} from './boards.js';
import {initSvg,boardSvg,renderBreadboards,renderDevboards,renderWires,renderParts,updateSurfaces} from './render.js';
import {applyLectureExample,lectureGuide,LECTURE_PREFIX} from './lecture-examples.js';

const NS='http://www.w3.org/2000/svg';
const cache=new Map();
// The example's circuit as a standalone <svg> (cached per board and example).
function exampleSvg(id,boardId){
 const key=boardId+':'+id;if(cache.has(key))return cache.get(key).cloneNode(true);
 const board=getBoard(boardId),project=id.startsWith(LECTURE_PREFIX)?applyLectureExample(id.slice(LECTURE_PREFIX.length)).project:applyHalExample({...blankProject(board.mcuFamily),boardId},id);
 const svg=document.createElementNS(NS,'svg');svg.setAttribute('class','example-preview-svg');svg.setAttribute('aria-hidden','true');
 initSvg(svg);svg.querySelector('#surface > .board').outerHTML=boardSvg(boardId);
 svg.querySelector('#breadboard-layer').innerHTML=renderBreadboards(project,null);svg.querySelector('#devboard-layer').innerHTML=renderDevboards(project,null);
 svg.querySelector('#wire-layer').innerHTML=renderWires(project,null);
 svg.querySelector('#part-layer').innerHTML=renderParts(project,null,null,{});
 updateSurfaces(svg,project,null);
 // Measure the drawn circuit off screen, then frame it with a small margin.
 Object.assign(svg.style,{position:'fixed',left:'-10000px',top:'0',width:'1120px',height:'730px',visibility:'hidden'});document.body.append(svg);
 const box=svg.querySelector('#surface').getBBox(),pad=16;svg.remove();svg.removeAttribute('style');
 svg.setAttribute('viewBox',`${box.x-pad} ${box.y-pad} ${box.width+pad*2} ${box.height+pad*2}`);svg.setAttribute('preserveAspectRatio','xMidYMid meet');
 // Layer ids would duplicate the workspace's; gradient/filter ids in <defs> stay (same definitions).
 for(const el of svg.querySelectorAll('[id]'))if(!el.closest('defs'))el.removeAttribute('id');
 for(const el of svg.querySelectorAll('[data-part],[data-wire],[data-endpoint],[tabindex]')){el.removeAttribute('tabindex');}
 cache.set(key,svg);return svg.cloneNode(true);
}

export function setupExamplePreviews({getBoardId}){
 const list=document.getElementById('hal-example-list');if(!list)return {hide(){}};
 const popup=document.createElement('aside');popup.id='example-layout-preview';popup.popover='manual';popup.hidden=true;popup.setAttribute('role','tooltip');
 popup.innerHTML='<strong class="part-preview-name"></strong><div class="example-preview-image"></div><p class="part-preview-detail"></p>';
 document.body.append(popup);
 const name=popup.querySelector('strong'),image=popup.querySelector('.example-preview-image'),detail=popup.querySelector('p');
 let active=null,openTimer,closeTimer;
 function close(){active?.removeAttribute('aria-describedby');active=null;if(popup.matches(':popover-open'))popup.hidePopover();popup.hidden=true;}
 function hide(){clearTimeout(openTimer);clearTimeout(closeTimer);close();}
 function show(item){
  clearTimeout(openTimer);clearTimeout(closeTimer);
  if(!item.isConnected||!item.getClientRects().length||(!item.matches(':hover')&&item.ownerDocument.activeElement!==item))return;
  const id=item.dataset.example,boardId=getBoardId();
  let svg;try{svg=exampleSvg(id,boardId);}catch{hide();return;}
  active?.removeAttribute('aria-describedby');active=item;
  name.textContent=item.querySelector('strong')?.textContent||id;image.replaceChildren(svg);
  try{detail.textContent=id.startsWith(LECTURE_PREFIX)?lectureGuide(id.slice(LECTURE_PREFIX.length)):halGuideFor(id,boardId);}catch{detail.textContent='';}
  // A popover lives in the document of the list (the list may be in a panel window).
  if(popup.ownerDocument!==item.ownerDocument)item.ownerDocument.body.append(popup);
  popup.hidden=false;popup.showPopover?.();item.setAttribute('aria-describedby',popup.id);
  const view=item.ownerDocument.defaultView,anchor=item.getBoundingClientRect(),box=popup.getBoundingClientRect(),gap=12;
  let left=anchor.right+gap;if(left+box.width>view.innerWidth-8)left=anchor.left-box.width-gap;
  popup.style.left=Math.max(8,Math.min(view.innerWidth-box.width-8,left))+'px';popup.style.top=Math.max(8,Math.min(view.innerHeight-box.height-8,anchor.top+(anchor.height-box.height)/2))+'px';
 }
 function schedule(item){clearTimeout(openTimer);clearTimeout(closeTimer);if(active===item&&!popup.hidden)return;openTimer=setTimeout(()=>show(item),220);}
 function leave(){clearTimeout(openTimer);closeTimer=setTimeout(hide,120);}
 list.addEventListener('pointerover',event=>{if(event.pointerType==='touch')return;const item=event.target.closest('[data-example]');if(item&&!item.contains(event.relatedTarget))schedule(item);});
 list.addEventListener('pointerout',event=>{const item=event.target.closest('[data-example]');if(item&&!item.contains(event.relatedTarget))leave();});
 list.addEventListener('focusin',event=>{const item=event.target.closest('[data-example]');if(item)schedule(item);});
 list.addEventListener('focusout',hide);list.addEventListener('click',hide,true);
 // Scrolling closes an open preview but keeps a pending one (a card scrolled into view and then hovered); show() rechecks hover.
 list.addEventListener('scroll',()=>{if(!popup.hidden)close();});
 popup.addEventListener('pointerenter',()=>clearTimeout(closeTimer));popup.addEventListener('pointerleave',leave);
 window.addEventListener('keydown',event=>{if(event.key==='Escape'&&!popup.hidden){event.preventDefault();event.stopImmediatePropagation();hide();}},true);
 document.getElementById('hal-example-search')?.addEventListener('input',hide);
 window.addEventListener('resize',hide);window.addEventListener('blur',hide);
 return {hide};
}
