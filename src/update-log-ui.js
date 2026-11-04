// 도움말 → 업데이트 로그: a floating window over the IDE (not modal) that can be moved by its title, with search and
// five releases a page, newest first.
import {UPDATE_LOG} from './update-log-data.js';
import {sortUpdateLog,searchUpdateLog,updateLogPage} from './update-log.js';
import {$,esc,clamp} from './common.js';

// The text with every search word marked, in one pass over the plain text.
function marked(text,query){
 text=String(text);const words=String(query).split(/\s+/).filter(Boolean);if(!words.length)return esc(text);
 const pattern=new RegExp(words.map(w=>w.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|'),'gi');let html='',at=0;
 for(const m of text.matchAll(pattern)){html+=esc(text.slice(at,m.index))+`<mark>${esc(m[0])}</mark>`;at=m.index+m[0].length;}
 return html+esc(text.slice(at));
}

export function setupUpdateLog(){
 const log=sortUpdateLog(UPDATE_LOG);let page=1;
 const win=document.createElement('section');win.id='update-log';win.className='update-log-window';win.hidden=true;win.setAttribute('role','dialog');win.setAttribute('aria-modal','false');win.setAttribute('aria-labelledby','update-log-title');
 win.innerHTML=`<header class="update-log-title"><h2 id="update-log-title">업데이트 로그</h2><button type="button" id="update-log-close" class="icon-only" title="닫기 (Esc)" aria-label="업데이트 로그 닫기">×</button></header>
 <div class="update-log-search"><input id="update-log-search" type="search" placeholder="버전, 날짜, 기능 검색" aria-label="업데이트 로그 검색" autocomplete="off"><span id="update-log-count" aria-live="polite"></span></div>
 <div id="update-log-list" class="update-log-list" tabindex="-1"></div>
 <nav id="update-log-pages" class="update-log-pages" aria-label="업데이트 로그 페이지"></nav>`;
 document.body.append(win);
 function render(){
  const query=$('update-log-search').value,found=searchUpdateLog(log,query),view=updateLogPage(found,page);page=view.page;
  $('update-log-count').textContent=query.trim()?`${found.length}개 버전`:`전체 ${log.length}개 버전`;
  $('update-log-list').innerHTML=view.entries.length?view.entries.map(e=>`<article class="update-entry"><header><time datetime="${esc(e.date)}">${marked(e.date,query)}</time><span class="update-version">${marked('v'+e.version,query)}</span></header><ul>${e.items.map(item=>`<li>${marked(item,query)}</li>`).join('')}</ul></article>`).join(''):'<p class="update-log-empty">검색 결과가 없습니다.</p>';
  // Page numbers: the first, the last and two either side of the current page.
  const numbers=[...new Set([1,view.pages,...Array.from({length:5},(_,i)=>page-2+i)])].filter(n=>n>=1&&n<=view.pages).sort((a,b)=>a-b);
  const buttons=[];numbers.forEach((n,i)=>{if(i&&n-numbers[i-1]>1)buttons.push('<span class="update-log-gap" aria-hidden="true">…</span>');buttons.push(`<button type="button" data-page="${n}" ${n===page?'aria-current="page" class="current"':''} aria-label="${n}페이지">${n}</button>`);});
  $('update-log-pages').innerHTML=`<button type="button" data-page="${page-1}" ${page<=1?'disabled':''} aria-label="이전 페이지">‹ 이전</button>${buttons.join('')}<button type="button" data-page="${page+1}" ${page>=view.pages?'disabled':''} aria-label="다음 페이지">다음 ›</button>`;
 }
 $('update-log-search').addEventListener('input',()=>{page=1;render();});
 $('update-log-pages').addEventListener('click',e=>{const b=e.target.closest('[data-page]');if(!b||b.disabled)return;page=Number(b.dataset.page);render();$('update-log-list').scrollTop=0;});
 $('update-log-close').onclick=()=>close();
 win.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close();}});
 // Moved by its title bar, kept inside the window.
 const title=win.querySelector('.update-log-title');
 title.addEventListener('pointerdown',e=>{
  if(e.button!==0||e.target.closest('button'))return;const r=win.getBoundingClientRect(),dx=e.clientX-r.left,dy=e.clientY-r.top;title.setPointerCapture(e.pointerId);
  const move=m=>{win.style.left=clamp(m.clientX-dx,0,innerWidth-r.width)+'px';win.style.top=clamp(m.clientY-dy,0,innerHeight-40)+'px';};
  const up=()=>{title.removeEventListener('pointermove',move);title.removeEventListener('pointerup',up);};
  title.addEventListener('pointermove',move);title.addEventListener('pointerup',up);
 });
 let opener=null;
 function open(){
  opener=document.activeElement;
  if(win.hidden){win.hidden=false;if(!win.style.left){const r=win.getBoundingClientRect();win.style.left=Math.max(8,(innerWidth-r.width)/2)+'px';win.style.top=Math.max(8,(innerHeight-r.height)/3)+'px';}}
  render();$('update-log-search').focus();
 }
 function close(){win.hidden=true;if(opener?.isConnected)opener.focus?.();}
 return {open,close};
}
