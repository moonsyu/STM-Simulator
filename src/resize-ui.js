import {scaleOf} from './geometry.js';
const $=id=>document.getElementById(id);
export function setupResizing(o){
 const row=document.createElement('div');row.className='object-size-tools';row.innerHTML='<label for="resize-target">장치 크기</label><select id="resize-target" aria-label="크기를 바꿀 장치"></select><input id="object-scale" type="number" min="10" max="400" step="10" value="100" aria-label="장치 크기 백분율"><span>%</span><button id="object-scale-reset" type="button">100%로</button>';
 document.querySelector('.canvas-heading').after(row);
 let target={type:'surface',id:'board'};
 $('resize-target').onchange=()=>{const [type,id]=$('resize-target').value.split(':');target={type,id};o.select(target);refresh();};
 const change=value=>{try{o.resize(target,value/100);}catch(error){o.onError(error.message);}refresh();};
 $('object-scale').onchange=()=>change(Number($('object-scale').value));$('object-scale-reset').onclick=()=>change(100);
 function refresh(){
  const p=o.getProject(),selection=o.getSelection();if(['part','surface'].includes(selection?.type))target=selection;
  const items=[{type:'surface',id:'board',name:'STM32 보드'},{type:'surface',id:'breadboard',name:'기본 빵판'},...p.components.map(c=>({type:'part',id:c.id,name:c.name}))];
  if(!items.some(item=>item.id===target.id&&item.type===target.type))target=items[0];
  const select=$('resize-target'),key=items.map(item=>`${item.type}:${item.id}:${item.name}`).join('|');
  if(select.dataset.items!==key){select.replaceChildren(...items.map(item=>new Option(item.name,`${item.type}:${item.id}`)));select.dataset.items=key;}
  select.value=`${target.type}:${target.id}`;
  const object=target.type==='surface'?p.surfaces?.[target.id]:p.components.find(c=>c.id===target.id);$('object-scale').value=Number((scaleOf(object)*100).toFixed(2));
  for(const id of ['resize-target','object-scale','object-scale-reset'])$(id).disabled=o.isRunning();
 }
 refresh();return {refresh};
}
