const objects='g[data-surface],g[data-part],g[data-wire],[data-wire-point],[data-button]';
const targets=objects+',[data-endpoint]';
function descriptor(node){
  if(!node)return null;
  if(node.hasAttribute('data-wire-point'))return {type:'bend',id:node.dataset.ownerWire,index:Number(node.dataset.wirePoint)};
  for(const type of ['endpoint','button','part','wire','surface'])if(node.hasAttribute('data-'+type))return {type,id:node.getAttribute('data-'+type)};
  return null;
}
export function setupCanvasKeyboard(svg,o){
  let last=null,held=null;
  const help=document.createElement('p');help.id='canvas-keyboard-help';help.className='canvas-keyboard-help';help.textContent='PageDown / PageUp: 부품·보드 버튼 탐색. Enter: 선택. Space: 실행 중 버튼을 누르고 떼기, 스위치 전환, RESET. 방향키: 이동, Shift: 크게 이동. P: 핀 탐색, 방향키로 핀 이동, Enter로 배선 연결. Insert: 배선 꺾임점 추가. 꺾임점에서 Delete: 점 삭제. Esc: 작성 중 배선 취소, 선택한 객체 삭제.';svg.after(help);svg.setAttribute('aria-describedby',help.id);
  const visible=node=>node.getBoundingClientRect().width>0&&getComputedStyle(node).display!=='none';
  const same=(a,b)=>a&&b&&a.type===b.type&&a.id===b.id&&a.index===b.index;
  const releaseHeld=()=>{if(!held)return;const previous=held;held=null;o.press?.(previous,false);};
  // A press callback may synchronously redraw and refocus the same SVG object.
  // Wait until that operation completes before treating focusout as a release.
  const checkHeldFocus=()=>{if(held&&!same(held,descriptor(document.activeElement?.closest?.(targets))))releaseHeld();};
  const find=target=>[...svg.querySelectorAll(targets)].find(n=>same(descriptor(n),target));
  const focus=target=>{const node=find(target);if(node){const box=node.getBoundingClientRect(),frame=svg.getBoundingClientRect(),x=box.x+box.width/2,y=box.y+box.height/2;if(x<frame.left||x>frame.right||y<frame.top||y>frame.bottom)o.reveal?.(x,y);(find(target)||node).focus({preventScroll:true});last=target;o.announce?.(node.getAttribute('aria-label'));return true;}return false;};
  const snapshot=()=>svg.contains(document.activeElement)&&document.activeElement!==svg?descriptor(document.activeElement.closest(targets)):null;
  const refresh=restore=>{
    for(const node of svg.querySelectorAll(targets)){
      const target=descriptor(node),label=o.label(target);node.setAttribute('tabindex','-1');node.setAttribute('role','button');node.setAttribute('aria-label',target.type==='button'&&!label.includes('Space')?label+'; Space: 실행 중 버튼 입력':label);
      if(target.type!=='endpoint')node.setAttribute('data-keyboard-object','');
    }
    if(restore&&!focus(restore))svg.focus({preventScroll:true});
    if(held)queueMicrotask(checkHeldFocus);
  };
  svg.addEventListener('focusin',event=>{const target=descriptor(event.target.closest(targets));if(target)last=target;else if(event.target===svg)o.announce?.('회로 작업 공간');if(held)queueMicrotask(checkHeldFocus);});
  svg.addEventListener('focusout',()=>{if(held)queueMicrotask(checkHeldFocus);});
  window.addEventListener('blur',releaseHeld);
  window.addEventListener('keyup',event=>{
    if(event.key!==' '||!held)return;
    event.preventDefault();event.stopPropagation();releaseHeld();
  },true);
  svg.addEventListener('keydown',event=>{
    if(event.defaultPrevented||event.ctrlKey||event.metaKey||event.altKey||event.isComposing||event.target.closest('[data-resize-handle]'))return;
    const target=descriptor(event.target.closest(targets)),key=event.key;
    const handled=()=>{event.preventDefault();event.stopPropagation();};
    const managed=['PageDown','PageUp','[',']','Enter',' ','Insert','Delete','Backspace','ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(key)||key.toLowerCase()==='p';
    if(o.isDragging?.()&&managed){handled();return;}
    if(['PageDown','PageUp','[',']'].includes(key)){
      handled();const list=[...svg.querySelectorAll(objects)].filter(visible).map(descriptor);if(!list.length)return;
      const index=list.findIndex(item=>same(item,target||last)),forward=['PageDown',']'].includes(key);
      focus(list[index<0?(forward?0:list.length-1):(index+(forward?1:list.length-1))%list.length]);return;
    }
    if(key.toLowerCase()==='p'){
      handled();const owner=target||last,pins=[...svg.querySelectorAll('[data-endpoint]')].filter(visible);
      const owned=pins.filter(node=>o.owns(owner,node.dataset.endpoint));focus(descriptor(owned[0]||pins[0]));return;
    }
    if(!target)return;
    if(key==='Enter'||key===' '){
      handled();if(event.repeat)return;
      if(key===' '&&['part','button'].includes(target.type)){
        if(held)releaseHeld();held=target;
        let accepted=false;
        try{accepted=o.press?.(target,true)===true;}finally{if(!accepted)held=null;}
        if(accepted){focus(target);return;}
      }
      o.activate(target);focus(target);return;
    }
    if(target.type==='bend'&&['Delete','Backspace'].includes(key)){handled();o.removeBend(target);focus({type:'wire',id:target.id});return;}
    if(target.type==='wire'&&key==='Insert'){handled();const inserted=o.addBend(target);if(inserted)focus(inserted);return;}
    const direction={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[key];if(!direction)return;
    handled();
    if(target.type==='endpoint'){
      const current=o.position(target),[dx,dy]=direction;if(!current)return;
      const candidates=[...svg.querySelectorAll('[data-endpoint]')].filter(visible).map(node=>({target:descriptor(node),point:o.position(descriptor(node))})).filter(item=>item.point&&!same(target,item.target));
      let best=null,score=Infinity;for(const item of candidates){const x=item.point.x-current.x,y=item.point.y-current.y,forward=x*dx+y*dy,cross=Math.abs(x*dy-y*dx);if(forward<=.01)continue;const distance=Math.hypot(x,y)+cross*3;if(distance<score){score=distance;best=item.target;}}
      if(best)focus(best);
    }else{o.move(target,direction[0]*(event.shiftKey?70:14),direction[1]*(event.shiftKey?70:14));focus(target);}
  });
  refresh();return {snapshot,refresh};
}
