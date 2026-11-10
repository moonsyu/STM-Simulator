// The circuit canvas: pointer input (select, drag, wire drawing, wire ends), zoom and pan, finding a pin.
import {checkpoint,log,changed,running,inspectTab,uid,autosave} from './app-core.js';
import {recompute,resetRuntime,resetBoard} from './app-run.js';
import {state} from './app-state.js';
import {refresh,renderConnections,signalState} from './app-view.js';
import {wireDraft,svg,pinout} from './app.js';
import {breadboardBounds,moveBreadboard} from './breadboards.js';
import {zoomView} from './canvas-view.js';
import {CATALOG_BY_TYPE} from './catalog-defs.js';
import {boxSelection,selectedIds,mountSelection,insertWirePoint,moveSelection,toggleSelection,isSelected} from './circuit-edit.js';
import {$} from './common.js';
import {attachments,terminalKeys,detachPart} from './components.js';
import {scaleXOf,scaleYOf,BOARD,surfaceOrigin,partVector} from './geometry.js';
import {endpointInfo,PIN_BY_ID,BB,searchPins,holeInfo,circuitHoles,bridgeNote} from './pins.js';
import {applyMount,findMount} from './placement.js';
import {validateProject} from './project.js';
import {route,esc,renderPinSearch,renderMountPreview} from './render.js';
import {moveSurface} from './surface-move.js';
import {endpointAt,endpointBlocked,moveWireEnd} from './wire-ends.js';

// A wire end picked up by a click (toggle move, `carry`): the next click on a pin or hole puts it there.
export function wireEndPreview(id,end,q){
 const w=state.project.wires.find(w=>w.id===id),other=w?.[end==='from'?'to':'from'],fixed=w&&endpointInfo(other,state.project.components,state.project.surfaces),target=endpointAt(state.project,q),info=target&&endpointInfo(target,state.project.components,state.project.surfaces),ok=target&&target!==other&&!endpointBlocked(state.project,target,{ignoreWire:id});
 $('preview-layer').innerHTML=fixed?`<path d="${route(fixed,info&&ok?info:q)}" fill="none" stroke="${esc(w.color)}" stroke-width="2.6" stroke-dasharray="5 4" pointer-events="none"/>${info?`<circle cx="${info.x}" cy="${info.y}" r="6" fill="none" stroke="${ok?'#2f9e6f':'#d24b3e'}" stroke-width="2" vector-effect="non-scaling-stroke" pointer-events="none"/>`:''}`:'';
}
// Moves the end to the endpoint at q; true when moved (errors are logged and leave the circuit unchanged).
export function dropWireEnd(id,end,q){
 const next=structuredClone(state.project);
 try{if(moveWireEnd(next,id,end,endpointAt(state.project,q))){validateProject(next);checkpoint();state.project=next;state.selection={type:'wire',id};log('배선 끝을 옮겼습니다.');changed();return true;}}catch(error){log(error.message,'error');}
 return false;
}
export function cancelCarry(){if(!state.carry)return false;state.carry=null;$('preview-layer').innerHTML='';refresh({preserveWires:true});return true;}
export function cancelWireDraft(){state.pending=null;wireDraft.reset();state.selection=null;state.mode='select';$('preview-layer').innerHTML='';refresh();}
export function clickEndpoint(id){
 const pin=PIN_BY_ID.get(id);state.selection={type:'endpoint',id};
 if(running()){inspectTab();refresh();return;}
 if(pin?.signal==='NC'){log(pin.bridge?`${pin.header}-${pin.number} ${pin.label}: ${bridgeNote(pin)}. 솔더 브리지를 닫지 않으면 헤더에서 쓸 수 없습니다.`:'NC 핀은 내부에 연결되지 않았습니다.');state.pending=null;refresh();return;}
 // One jumper per hole / pin, as on a real breadboard.
 const blocked=state.pending!==id?endpointBlocked(state.project,id):null;
 if(!state.pending){if(blocked){log(blocked);inspectTab();refresh();return;}state.pending=id;wireDraft.reset(id);inspectTab();refresh();return;}
 if(state.pending===id){state.pending=null;refresh();return;}
 if(blocked){log(blocked);return;}
 if(state.project.wires.length>=500){log('배선은 500개까지 추가할 수 있습니다.','error');state.pending=null;return;}
 if(!state.project.wires.some(w=>(w.from===state.pending&&w.to===id)||(w.to===state.pending&&w.from===id))){checkpoint();state.project.wires.push({id:uid('w'),from:state.pending,to:id,color:state.color,...wireDraft.finish(state.pending)});}
 state.pending=null;state.selection=null;$('preview-layer').innerHTML='';changed();
}
export function point(e){const p=svg.createSVGPoint();p.x=e.clientX;p.y=e.clientY;return p.matrixTransform(svg.getScreenCTM().inverse());}
export function viewUpdate({preserveKeyboardFocus=true}={}){const focused=preserveKeyboardFocus?state.canvasKeys?.snapshot():null;svg.setAttribute('viewBox',`${state.view.x} ${state.view.y} ${state.view.w} ${state.view.h}`);$('zoom-reset').textContent=Math.round(1120/state.view.w*100)+'%';renderConnections();if(focused?.type==='bend')state.canvasKeys.refresh(focused);}
export function release(event){if(!state.drag)return;
 if(state.drag.type==='wire-end'){const d=state.drag;state.drag=null;$('preview-layer').innerHTML='';
  if(event?.type==='pointercancel'){refresh({preserveWires:true});return;}
  if(!d.moved){state.carry={id:d.id,end:d.end};state.selection={type:'wire',id:d.id};inspectTab();refresh({preserveWires:true});wireEndPreview(d.id,d.end,d.current);return;}
  if(!dropWireEnd(d.id,d.end,d.current))refresh({preserveWires:true});return;
 }
 if(state.drag.type==='marquee'){
  const previous=state.drag.selection;
  if(event?.type==='pointercancel'||running())state.selection=previous;
  else {const found=boxSelection(state.project,{minX:state.drag.start.x,minY:state.drag.start.y,maxX:state.drag.current.x,maxY:state.drag.current.y});state.selection={type:'group',parts:[...new Set([...selectedIds(previous,'part'),...found.parts])],wires:[...new Set([...selectedIds(previous,'wire'),...found.wires])]};if(!state.selection.parts.length&&!state.selection.wires.length)state.selection=null;}
  state.drag=null;$('preview-layer').innerHTML='';if(state.selection)inspectTab();refresh();return;
 }if(state.drag.type==='surface'){const next=state.project;state.project=state.drag.base;if(state.drag.moved&&event?.type!=='pointercancel'){checkpoint();state.project=next;}if(state.drag.moved)autosave();state.drag=null;refresh();pinSearch();return;}if(state.drag?.type==='group'&&state.drag.moved&&event?.type!=='pointercancel'){mountSelection(state.project,state.selection);refresh();}if(['wire-point','group'].includes(state.drag?.type)&&state.drag.moved)autosave();if(state.drag?.type==='press'){state.pressed[state.drag.id]=false;recompute();refresh();}if(state.drag?.type==='part'&&state.drag.moved){const p=state.project.components.find(p=>p.id===state.drag.id);if(p?.type==='breadboard')log(p.name+': 빵판과 장착 부품을 이동했습니다.');else if(p?.type==='devboard'){const mounted=applyMount(p,findMount(p,state.project.components,15,state.project.surfaces,state.project.wires));log(mounted?`${p.name}: ${Object.keys(attachments(p)).length}개 핀을 빵판에 꽂았습니다.`:`${p.name}: 보드를 옮겼습니다. 보드 핀에 연결된 배선도 함께 따라갑니다.`);}else if(p){const mounted=applyMount(p,findMount(p,state.project.components,15,state.project.surfaces,state.project.wires));log(mounted?`${p.name}: ${terminalKeys(p).length}개 다리를 빵판에 장착했습니다.`:`${p.name}: 자유 배치 상태입니다. 모든 다리가 구멍에 맞을 때 장착됩니다.`);}autosave();}state.drag=null;$('preview-layer').innerHTML='';refresh();}
export function zoom(mult,anchor=null){state.view=zoomView(state.view,mult,anchor);viewUpdate();}
export function fitView(){
 const scaled=Object.values(state.project.surfaces||{}).some(s=>scaleXOf(s)!==1||scaleYOf(s)!==1||s.x!==undefined)||state.project.components.some(p=>scaleXOf(p)!==1||scaleYOf(p)!==1||p.skewX||p.x<0||p.y<0||p.x>1120||p.y>730)||state.project.wires.some(w=>w.points?.some(p=>p.x<0||p.y<0||p.x>1120||p.y>730));
 if(scaled){const boxes=[{x:0,y:0,w:1120,h:730},...state.project.wires.flatMap(w=>(w.points||[]).map(p=>({...p,w:0,h:0}))),...Object.entries({board:BOARD,breadboard:BB}).filter(([key])=>!state.project.surfaces?.[key]?.hidden).map(([name,b])=>({...surfaceOrigin(name,state.project.surfaces),w:b.w*scaleXOf(state.project.surfaces?.[name]),h:b.h*scaleYOf(state.project.surfaces?.[name])})),...state.project.components.map(p=>{if(p.type==='breadboard'){const b=breadboardBounds(p);return {x:b.left,y:b.top,w:b.right-b.left,h:b.bottom-b.top};}const points=[[-170,-280],[170,-280],[170,280],[-170,280]].map(([x,y])=>partVector(p,x,y)),xs=points.map(v=>p.x+v.x),ys=points.map(v=>p.y+v.y);return {x:Math.min(...xs),y:Math.min(...ys),w:Math.max(...xs)-Math.min(...xs),h:Math.max(...ys)-Math.min(...ys)};})],x=Math.min(...boxes.map(b=>b.x))-20,y=Math.min(...boxes.map(b=>b.y))-20,right=Math.max(...boxes.map(b=>b.x+b.w))+20,bottom=Math.max(...boxes.map(b=>b.y+b.h))+20,w=Math.max(right-x,(bottom-y)*1120/730);state.view={x,y,w,h:w*730/1120};}
 else{const extra=state.project.components.filter(p=>p.type==='breadboard');let w=1120;if(extra.length)w=Math.max(w,...state.project.components.map(p=>p.type==='breadboard'?breadboardBounds(p).right+40:p.x+360),...state.project.components.map(p=>(p.type==='breadboard'?breadboardBounds(p).bottom+40:p.y+360)*1120/730));state.view={x:0,y:0,w,h:w*730/1120};}viewUpdate();
}
export function pinSearch(){
 const pins=state.project.surfaces?.board?.hidden?[]:searchPins($('pin-search').value);
 $('search-layer').innerHTML=renderPinSearch(pins,state.searchSelectedId,state.project.surfaces);
 $('pin-results').innerHTML=!$('pin-search').value.trim()?'':pins.length?pins.map(p=>`<button data-search-pin="${p.id}" class="${p.id===state.searchSelectedId?'selected':''}" aria-pressed="${p.id===state.searchSelectedId}"><strong>${esc(p.signal)}</strong><span>${esc(p.header)}-${p.number} · ${esc(p.label)}</span></button>`).join(''):'<p>일치하는 핀이 없습니다.</p>';
 $('pin-results').querySelectorAll('button').forEach(b=>b.onclick=()=>focusPin(b.dataset.searchPin));
}
export function focusPin(id){const p=endpointInfo(id,state.project.components,state.project.surfaces);if(!p)return;state.pending=null;state.selection={type:'endpoint',id};state.searchSelectedId=id;$('preview-layer').innerHTML='';pinSearch();state.view={x:p.x-310,y:p.y-202,w:620,h:620*730/1120};viewUpdate();inspectTab();refresh();svg.focus({preventScroll:true});}
export function onSvgDblclick(e){
 if(running()||state.mode!=='select')return;
 // Keep the wire element alive during selection so real double-clicks arrive.
 const hit=e.target.closest('[data-wire]');
 if(!hit||!svg.contains(hit))return;e.preventDefault();
 const w=state.project.wires.find(w=>w.id===hit.dataset.wire);
 try{const next=structuredClone(w);insertWirePoint(state.project,next,point(e));checkpoint();w.points=next.points;state.selection={type:'wire',id:w.id};state.pending=null;changed();}
 catch(error){log(error.message,'error');}
}
export function onSvgPointermove(e){
 const q=point(e);
 if(state.drag?.type==='marquee'){state.drag.current=q;const x=Math.min(state.drag.start.x,q.x),y=Math.min(state.drag.start.y,q.y),w=Math.abs(state.drag.start.x-q.x),h=Math.abs(state.drag.start.y-q.y);$('preview-layer').innerHTML=`<rect class="marquee-box" x="${x}" y="${y}" width="${w}" height="${h}" vector-effect="non-scaling-stroke"/>`;return;}
 if(state.drag?.type==='surface'){const dx=q.x-state.drag.start.x,dy=q.y-state.drag.start.y;if(!state.drag.moved&&Math.hypot(dx,dy)<=3)return;const next=structuredClone(state.drag.base);try{moveSurface(next,state.drag.id,{x:state.drag.origin.x+dx,y:state.drag.origin.y+dy});validateProject(next);clearTimeout(state.saveTimer);state.drag.moved=true;state.project=next;refresh();pinSearch();}catch(error){log(error.message,'error');}return;}
 if(state.drag?.type==='wire-end'){state.drag.current=q;if(!state.drag.moved&&Math.hypot(q.x-state.drag.start.x,q.y-state.drag.start.y)<3)return;state.drag.moved=true;wireEndPreview(state.drag.id,state.drag.end,q);return;}
 if(state.carry&&!state.drag){wireEndPreview(state.carry.id,state.carry.end,q);return;}
 if(state.drag?.type==='wire-point'){const w=state.project.wires.find(w=>w.id===state.drag.id),dx=q.x-state.drag.start.x,dy=q.y-state.drag.start.y;if(!state.drag.moved&&Math.hypot(dx,dy)<2)return;if(!state.drag.moved){checkpoint();state.drag.moved=true;}w.points[state.drag.index]={x:state.drag.origin.x+dx,y:state.drag.origin.y+dy};refresh();return;}
 if(state.drag?.type==='group'){let dx=q.x-state.drag.start.x,dy=q.y-state.drag.start.y;if(!state.drag.moved&&Math.hypot(dx,dy)<=3)return;if(!state.drag.moved){checkpoint();state.drag.moved=true;}try{const next=structuredClone(state.drag.base);moveSelection(next,state.selection,dx,dy);validateProject(next);state.project=next;refresh();}catch{}return;}
 if(state.drag?.type==='part'){
   const p=state.project.components.find(p=>p.id===state.drag.id),dx=q.x-state.drag.start.x,dy=q.y-state.drag.start.y;
   if(!state.drag.moved&&Math.hypot(dx,dy)>3){checkpoint();state.drag.moved=true;detachPart(p);}
   if(state.drag.moved){const x=state.drag.x+dx,y=state.drag.y+dy;if(p.type==='breadboard')moveBreadboard(state.project,p.id,{x,y});else {p.x=x;p.y=y;}refresh();$('preview-layer').innerHTML=renderMountPreview(findMount(p,state.project.components,15,state.project.surfaces,state.project.wires));}
   return;
 }
 if(state.drag?.type==='pan'){const box=svg.getBoundingClientRect();state.view.x=state.drag.x-(e.clientX-state.drag.clientX)*state.view.w/box.width;state.view.y=state.drag.y-(e.clientY-state.drag.clientY)*state.view.h/box.height;viewUpdate();return;}
 if(state.pending){const a=endpointInfo(state.pending,state.project.components,state.project.surfaces);$('preview-layer').innerHTML=`<path d="${wireDraft.points.length?wireDraft.path(state.pending,a,q):route(a,q)}" fill="none" stroke="${state.color}" stroke-width="2" stroke-dasharray="5 5" pointer-events="none"/>`;}
 // A wire or wire end on a pin or hole does not hide it: the tooltip names the pin under the pointer, as a click does.
 const wireHit=e.target.closest('[data-wire]'),hit=e.target.closest('[data-endpoint]')??(wireHit?document.elementsFromPoint(e.clientX,e.clientY).find(el=>el.matches?.('[data-endpoint]')):null);
 document.querySelectorAll('.same-net').forEach(el=>el.classList.remove('same-net'));
 if(hit){const id=hit.dataset.endpoint,info=endpointInfo(id,state.project.components,state.project.surfaces),v=state.result?.voltage(id),hole=holeInfo(id,state.project.components,state.project.surfaces);if(hole)for(const h of circuitHoles(state.project.components,state.project.surfaces))if(h.bus===hole.bus)svg.querySelector(`[data-hole="${h.id}"]`)?.classList.add('same-net');
   $('tooltip').textContent=info.label+(state.result?`\n${Number.isFinite(v)?v.toFixed(3)+' V · ':''}${signalState(v).label}`:'');const box=$('canvas-container').getBoundingClientRect();$('tooltip').style.left=Math.min(e.clientX-box.left+12,box.width-220)+'px';$('tooltip').style.top=Math.max(0,e.clientY-box.top-47)+'px';$('tooltip').hidden=false;
 }else if(wireHit&&state.result){const w=state.project.wires.find(w=>w.id===wireHit.dataset.wire),v=w&&state.result.voltage(w.from),box=$('canvas-container').getBoundingClientRect();$('tooltip').textContent=`점퍼선 · ${Number.isFinite(v)?v.toFixed(3)+' V · ':''}${signalState(v).label}`;$('tooltip').style.left=Math.min(e.clientX-box.left+12,box.width-220)+'px';$('tooltip').style.top=Math.max(0,e.clientY-box.top-47)+'px';$('tooltip').hidden=false;}else $('tooltip').hidden=true;
}
const lastPress={id:null,at:0,x:0,y:0};
export function onSvgPointerdown(e){
 if(e.button!==0&&e.button!==1)return;svg.focus({preventScroll:true});
 if(e.button===1){state.drag={type:'pan',clientX:e.clientX,clientY:e.clientY,x:state.view.x,y:state.view.y};e.preventDefault();svg.setPointerCapture(e.pointerId);return;}
 const target=e.target,part=target.closest('[data-part]'),onboard=target.closest('[data-button]');
 // A double-click on a part or a board opens its properties, also when the properties panel was closed. The browser's
 // dblclick event does not arrive for parts (the first press redraws the part and captures the pointer), so two presses
 // on the same part within 450 ms and a few pixels count as one.
 if(part&&e.button===0&&!running()&&state.mode==='select'&&!e.shiftKey){
  const now=performance.now(),id=part.dataset.part;
  if(lastPress.id===id&&now-lastPress.at<450&&Math.hypot(e.clientX-lastPress.x,e.clientY-lastPress.y)<6){lastPress.id=null;inspectTab({force:true});}
  else Object.assign(lastPress,{id,at:now,x:e.clientX,y:e.clientY});
 }
 if(running()&&(onboard||part)){
   if(onboard?.dataset.button==='RESET'){resetRuntime();return;}
   if(onboard?.dataset.button.endsWith('.RESET')){resetBoard(onboard.dataset.button.slice(0,-6));return;}
   const id=onboard?.dataset.button||part?.dataset.part,p=state.project.components.find(p=>p.id===id);
   if((p?.type==='slide'||CATALOG_BY_TYPE[p?.type]?.family==='slide')&&!target.closest('[data-endpoint]')){checkpoint();p.position=(p.position+1)%(CATALOG_BY_TYPE[p.type]?.id.includes('dp3t')?3:2);state.selection={type:'part',id:p.id};inspectTab();recompute();autosave();refresh();return;}
   if(id==='USER'||id==='SW1'||id.endsWith('.USER')||p?.type==='button'||CATALOG_BY_TYPE[p?.type]?.family==='button'){state.pressed[id]=true;state.drag={type:'press',id};svg.setPointerCapture(e.pointerId);recompute();refresh();return;}
 }
 if(state.carry&&e.button===0){
   const c=state.carry,q=point(e),hit=target.closest('[data-wire-end]');
   if(running()||(hit&&hit.dataset.ownerWire===c.id&&hit.dataset.wireEnd===c.end)||!endpointAt(state.project,q)){cancelCarry();return;}
   state.carry=null;if(!dropWireEnd(c.id,c.end,q)){state.carry=c;wireEndPreview(c.id,c.end,q);refresh({preserveWires:true});}
   return;
 }
 // Dragging a wire end moves it to another hole or pin; a click without moving picks it up (toggle move).
 const end=target.closest('[data-wire-end]');if(end&&!running()&&!e.shiftKey){if(state.pending){clickEndpoint(state.project.wires.find(w=>w.id===end.dataset.ownerWire)?.[end.dataset.wireEnd]);return;}state.drag={type:'wire-end',id:end.dataset.ownerWire,end:end.dataset.wireEnd,start:point(e),current:point(e),moved:false};svg.setPointerCapture(e.pointerId);return;}
 const handle=target.closest('[data-wire-point]');if(handle&&!running()){const id=handle.dataset.ownerWire,index=Number(handle.dataset.wirePoint);state.drag={type:'wire-point',id,index,start:point(e),origin:{...state.project.wires.find(w=>w.id===id).points[index]},moved:false};svg.setPointerCapture(e.pointerId);return;}
 if(e.shiftKey&&!running()){const wire=target.closest('[data-wire]');if(wire||part){state.selection=toggleSelection(state.selection,wire?'wire':'part',wire?.dataset.wire||part.dataset.part);state.pending=null;state.mode='select';inspectTab();refresh();return;}}
 if(part&&state.selection?.type==='group'&&isSelected(state.selection,'part',part.dataset.part)&&!running()){state.drag={type:'group',start:point(e),base:structuredClone(state.project),moved:false};svg.setPointerCapture(e.pointerId);return;}
 // A wire drawn across a pin or hole does not hide it: the pin under the pointer takes the click.
 const pin=target.closest('[data-endpoint]')??(target.closest('[data-wire]')&&!target.closest('[data-wire-end]')?document.elementsFromPoint(e.clientX,e.clientY).find(el=>el.matches?.('[data-endpoint]')):null);if(pin){clickEndpoint(pin.dataset.endpoint);return;}
 const wire=target.closest('[data-wire]');if(wire){state.pending=null;wireDraft.reset();$('preview-layer').innerHTML='';state.selection={type:'wire',id:wire.dataset.wire};inspectTab();refresh({preserveWires:true});return;}
 const surface=target.closest('[data-surface]');if(surface&&!part&&e.button===0&&state.mode==='select'&&!state.pending){state.selection={type:'surface',id:surface.dataset.surface};if(!running()){state.drag={type:'surface',id:state.selection.id,start:point(e),origin:surfaceOrigin(state.selection.id,state.project.surfaces),base:structuredClone(state.project),moved:false};svg.setPointerCapture(e.pointerId);}inspectTab();refresh();return;}
 if(part){
   state.pending=null;wireDraft.reset();$('preview-layer').innerHTML='';state.selection={type:'part',id:part.dataset.part};inspectTab();
   if(!running()){const p=state.project.components.find(p=>p.id===part.dataset.part),q=point(e);state.drag={type:'part',id:p.id,start:q,x:p.x,y:p.y,moved:false};svg.setPointerCapture(e.pointerId);}
   refresh();return;
 }
 const q=point(e);
 if(e.shiftKey&&!running()&&state.mode==='select'&&!state.pending){state.drag={type:'marquee',start:q,current:q,additive:true,selection:structuredClone(state.selection)};e.preventDefault();svg.setPointerCapture(e.pointerId);return;}
 if(state.pending&&!running()&&e.button===0){try{wireDraft.add(state.pending,q);$('hint').textContent='꺾임점 추가 · 다음 바닥 또는 연결할 핀을 클릭하세요. Backspace: 마지막 점 취소 / Esc: 배선 취소';}catch(error){log(error.message,'error');}return;}
 state.selection=null;state.drag={type:'pan',clientX:e.clientX,clientY:e.clientY,x:state.view.x,y:state.view.y};svg.setPointerCapture(e.pointerId);refresh();
}
export function onSvgContextmenu(e){if(state.pending&&!running()){e.preventDefault();e.stopImmediatePropagation();cancelWireDraft();return;}if(e.target.closest('[data-wire-point]'))return;const id=(e.target.closest('[data-endpoint]')??(e.target.closest('[data-wire]')?document.elementsFromPoint(e.clientX,e.clientY).find(el=>el.matches?.('[data-endpoint]')):null))?.dataset.endpoint,p=PIN_BY_ID.get(id);if(p&&/^P[A-H]\d+$/.test(p.signal)){e.preventDefault();pinout.open(p.signal);}}
