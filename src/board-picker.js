import {DEFAULT_BOARD_ID,getBoard,searchBoards} from './boards.js';
import {hasBoardChanges} from './project.js';
import {esc} from './render.js';

export function setupBoardPicker({getProject,isRunning,onSelect}){
 const $=id=>document.getElementById(id);let pending=null;
 function render(){
  const current=getProject().boardId??DEFAULT_BOARD_ID,boards=searchBoards($('board-search').value);
  $('board-results').innerHTML=boards.length?boards.map(board=>`<button class="board-option" data-board-id="${board.id}"><span class="board-option-icon" aria-hidden="true">F4</span><span><strong>${esc(board.name)}</strong><small>${esc(board.mcu)}</small><small>${esc(board.description)}</small></span><span class="board-option-action">${board.id===current?'현재 보드<br>새로 시작':'선택'}</span></button>`).join(''):'<p class="board-empty">검색 결과가 없습니다.<br>보드명 또는 MCU 이름으로 검색해 주세요.</p>';
  $('board-results').querySelectorAll('[data-board-id]').forEach(button=>button.onclick=()=>{
   if(isRunning())return;pending=button.dataset.boardId;$('board-dialog').close();
   if(hasBoardChanges(getProject())){$('board-change-name').textContent=getBoard(pending).name;$('board-change-dialog').showModal();$('board-change-cancel').focus();}
   else apply();
  });
 }
 function apply(){if(!pending||isRunning())return;const id=pending;pending=null;$('board-change-dialog').close();onSelect(id);$('circuit').focus({preventScroll:true});}
 $('board-open').onclick=()=>{if(isRunning())return;pending=null;$('board-search').value='';render();$('board-dialog').showModal();$('board-search').focus();};
 $('board-search').addEventListener('input',render);
 $('board-close').onclick=()=>$('board-dialog').close();
 $('board-change-confirm').onclick=apply;
 $('board-change-cancel').onclick=()=>{$('board-change-dialog').close();pending=null;$('board-open').focus();};
 $('board-change-dialog').addEventListener('cancel',()=>{pending=null;});
 return ()=>{const board=getBoard(getProject().boardId??DEFAULT_BOARD_ID);$('current-board-name').textContent=board.name;$('canvas-board-name').textContent=board.name+' + Breadboard';$('board-open').disabled=isRunning();};
}
