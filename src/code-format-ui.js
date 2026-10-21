// Code formatting in the editor: 편집 → 코드 정렬 (clangd when it is running, otherwise the built-in
// C formatter) and automatic re-indentation of a block when its closing `}` is typed.
import {formatC,blockRange} from './c-format.js';
import {loadPreferences} from './ide-preferences.js';

/** Edits that turn `model`'s lines into `formatted`'s lines (line count is preserved by formatC). */
function lineEdits(model,formatted){
 const next=formatted.split(/\r?\n/),edits=[];
 for(let i=0;i<next.length&&i<model.getLineCount();i++){
  const line=i+1,current=model.getLineContent(line);
  if(current!==next[i])edits.push({range:{startLineNumber:line,startColumn:1,endLineNumber:line,endColumn:current.length+1},text:next[i]});
 }
 return edits;
}

export function setupCodeFormat({code,textarea,lsp,log}){
 const editor=code.editor;let applying=false;
 const tabSize=()=>loadPreferences().tabSize||4;
 const writable=()=>!textarea.readOnly&&!!editor.getModel();
 function apply(range){
  const model=editor.getModel();if(!model||!writable())return 0;
  const edits=lineEdits(model,formatC(model.getValue(),{tabSize:tabSize(),range}));
  if(!edits.length)return 0;
  applying=true;try{editor.pushUndoStop();editor.executeEdits('stm-format',edits);editor.pushUndoStop();}finally{applying=false;}
  return edits.length;
 }
 async function formatDocument(){
  if(!writable()){log?.('실행 중에는 코드를 정렬할 수 없습니다.','error');return;}
  // clangd formats with the project's .clang-format when it is running; otherwise use the built-in formatter.
  if(lsp?.enabled?.()){const action=editor.getAction?.('editor.action.formatDocument');if(action){await action.run();return;}}
  apply(null);
 }
 function formatSelection(){
  const s=editor.getSelection();if(!s||s.isEmpty?.())return formatDocument();
  return apply({start:s.startLineNumber,end:s.endLineNumber});
 }
 // Typing `}` re-indents the block it closes.
 editor.onKeyUp(event=>{
  if(applying||event.browserEvent?.key!=='}'||!loadPreferences().formatOnType||!writable())return;
  const model=editor.getModel(),pos=editor.getPosition();if(!model||!pos)return;
  if(model.getLineContent(pos.lineNumber).charAt(pos.column-2)!=='}')return;
  const range=blockRange(model.getValue(),pos.lineNumber,pos.column);if(!range)return;
  const before=model.getLineContent(pos.lineNumber).length;
  if(apply(range)){const after=model.getLineContent(pos.lineNumber).length;editor.setPosition({lineNumber:pos.lineNumber,column:Math.max(1,pos.column+after-before)});}
 });
 return {formatDocument,formatSelection,formatBlock:apply};
}

/** Formats every C/C++ source of a project in place (used by 저장 시 코드 정렬). Returns true if anything changed. */
export function formatProjectSources(project,tabSize=loadPreferences().tabSize||4){
 let changed=false;
 if(typeof project.code==='string'){const next=formatC(project.code,{tabSize});if(next!==project.code){project.code=next;changed=true;}}
 for(const file of project.firmware?.files||[])if(/\.(c|h|cpp|hpp|cc)$/i.test(file.name)){const next=formatC(file.text,{tabSize});if(next!==file.text){file.text=next;changed=true;}}
 return changed;
}
