import {PART_LIBRARY} from './part-library.js';
import {partPreview} from './part-preview.js';
import {datasheetIdOf} from './model-geometry.js';
import {datasheetLine} from './part-datasheets.js';

export function setupPartPreviews(){
  const list=document.getElementById('part-list'),parts=new Map(PART_LIBRARY.map(part=>[part.type,part]));
  const popup=document.createElement('aside');popup.id='part-model-preview';popup.popover='manual';popup.hidden=true;popup.setAttribute('role','tooltip');
  popup.innerHTML='<strong class="part-preview-name"></strong><div class="part-preview-image"><img alt=""></div><p class="part-preview-model"></p><p class="part-preview-detail"></p>';
  document.body.append(popup);
  const name=popup.querySelector('strong'),image=popup.querySelector('img'),detail=popup.querySelector('.part-preview-detail'),model=popup.querySelector('.part-preview-model');
  let active=null,openTimer,closeTimer;
  function thumbnail(button){
    const img=button.querySelector('.part-thumbnail');if(!img||img.hasAttribute('src'))return;
    try{img.src=partPreview(button.dataset.add).src;}catch{img.alt='미리보기 없음';}
  }
  const observer=new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting){thumbnail(entry.target);observer.unobserve(entry.target);}},{root:list,rootMargin:'80px'});
  for(const button of list.querySelectorAll('[data-add]')){
    const icon=button.querySelector('.part-icon');icon.classList.add('part-model-icon');icon.replaceChildren();
    const img=document.createElement('img');img.className='part-thumbnail';img.alt='';img.setAttribute('aria-hidden','true');img.decoding='async';icon.append(img);observer.observe(button);
  }
  function hide(){clearTimeout(openTimer);clearTimeout(closeTimer);active?.removeAttribute('aria-describedby');active=null;if(popup.matches(':popover-open'))popup.hidePopover();popup.hidden=true;}
  function show(button){
    clearTimeout(openTimer);clearTimeout(closeTimer);if(!button.isConnected||button.hidden||!button.getClientRects().length||(!button.matches(':hover')&&document.activeElement!==button))return;
    const part=parts.get(button.dataset.add);if(!part)return;active?.removeAttribute('aria-describedby');active=button;
    try{const preview=partPreview(part.type);thumbnail(button);name.textContent=part.name;image.src=preview.src;image.alt=part.name+' 장치 모형';model.textContent=datasheetLine(datasheetIdOf(part.type));model.hidden=!model.textContent;detail.textContent=(part.type==='breadboard'?'400홀':part.type==='breadboard_full'?'830홀':preview.pins+'핀')+' · '+part.hint.replace(/^\d+\s*(?:핀|홀)\s*·\s*/,'');}catch{hide();return;}
    popup.dataset.type=part.type;popup.hidden=false;popup.showPopover?.();button.setAttribute('aria-describedby',popup.id);
    const anchor=button.getBoundingClientRect(),box=popup.getBoundingClientRect(),gap=12;
    let left=anchor.right+gap;if(left+box.width>innerWidth-8)left=anchor.left-box.width-gap;
    popup.style.left=Math.max(8,Math.min(innerWidth-box.width-8,left))+'px';popup.style.top=Math.max(8,Math.min(innerHeight-box.height-8,anchor.top+(anchor.height-box.height)/2))+'px';
  }
  function schedule(button){clearTimeout(openTimer);clearTimeout(closeTimer);if(active===button&&!popup.hidden)return;openTimer=setTimeout(()=>show(button),160);}
  function leave(){clearTimeout(openTimer);closeTimer=setTimeout(hide,120);}
  list.addEventListener('pointerover',event=>{if(event.pointerType==='touch')return;const button=event.target.closest('[data-add]');if(button&&!button.contains(event.relatedTarget))schedule(button);});
  list.addEventListener('pointerout',event=>{const button=event.target.closest('[data-add]');if(button&&!button.contains(event.relatedTarget))leave();});
  list.addEventListener('focusin',event=>{const button=event.target.closest('[data-add]');if(button)schedule(button);});
  list.addEventListener('focusout',hide);
  popup.addEventListener('pointerenter',()=>clearTimeout(closeTimer));popup.addEventListener('pointerleave',leave);
  list.addEventListener('click',hide,true);
  document.addEventListener('pointerdown',event=>{if(!popup.contains(event.target))hide();},true);
  window.addEventListener('keydown',event=>{if(event.key==='Escape'&&!popup.hidden){event.preventDefault();event.stopImmediatePropagation();hide();}},true);
  document.getElementById('part-search').addEventListener('input',hide);
  // Scrolling a newly hovered card into view must not cancel its pending open.
  // show() rechecks hover/focus so a card scrolled away cannot open afterward.
  document.addEventListener('scroll',()=>{if(!popup.hidden)hide();},true);window.addEventListener('resize',hide);window.addEventListener('blur',hide);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)hide();});
  return {hide};
}
