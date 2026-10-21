// Code formatting in the editor: 편집 → 코드 정렬 (clangd when it is running, otherwise the built-in
// C formatter) and automatic formatting of a block when its closing `}` is typed.
import {formatCode,blockRange} from './c-format.js';
import {loadPreferences} from './ide-preferences.js';

/** Edits that replace each source line with the lines formatCode made of it (breakpoint decorations stay on their line). */
function lineEdits(model,lines){
 const eol=model.getEOL(),edits=[];
 for(let i=0;i<lines.length&&i<model.getLineCount();i++){
  const line=i+1,current=model.getLineContent(line),text=lines[i].join(eol);
  if(current!==text)edits.push({range:{startLineNumber:line,startColumn:1,endLineNumber:line,endColumn:current.length+1},text});
 }
 return edits;
}

export function setupCodeFormat({code,textarea,lsp,log}){
 const editor=code.editor;let applying=false;
 const tabSize=()=>loadPreferences().tabSize||4;
 const writable=()=>!textarea.readOnly&&!!editor.getModel();
 /** Formats the given source lines (all when range is null); returns formatCode's per-line result, or null if nothing changed. */
 function apply(range){
  const model=editor.getModel();if(!model||!writable())return null;
  const result=formatCode(model.getValue(),{tabSize:tabSize(),range}),edits=lineEdits(model,result.lines);
  if(!edits.length)return null;
  applying=true;try{editor.pushUndoStop();editor.executeEdits('stm-format',edits);editor.pushUndoStop();}finally{applying=false;}
  return result.lines;
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
 // Typing `}` formats the block it closes. Monaco's onDidType (its type command) also reports
 // IME input, where the key event says "Process" (Korean IME on Windows), and over-typing an
 // auto-closed `}`, which changes no text.
 function closeBlock(){
  if(applying||!loadPreferences().formatOnType||!writable())return;
  const model=editor.getModel(),pos=editor.getPosition();if(!model||!pos)return;
  if(model.getLineContent(pos.lineNumber).charAt(pos.column-2)!=='}')return;
  const range=blockRange(model.getValue(),pos.lineNumber,pos.column);if(!range)return;
  const after=model.getLineContent(pos.lineNumber).length-(pos.column-1),lines=apply(range);if(!lines)return;
  // Keep the cursor right after the typed `}`: the end of what its line became, minus the text that followed it.
  const line=pos.lineNumber+lines.slice(0,pos.lineNumber).reduce((n,g)=>n+g.length-1,0),last=lines[pos.lineNumber-1].at(-1);
  editor.setPosition({lineNumber:line,column:Math.max(1,last.length-after+1)});
 }
 if(editor.onDidType)editor.onDidType(text=>{if(text.includes('}'))closeBlock();});
 else editor.onKeyUp(event=>{if(event.browserEvent?.key==='}')closeBlock();});
 return {formatDocument,formatSelection,formatBlock:apply};
}

/**
 * Formats every C/C++ source of a project in place (used by 저장 시 코드 정렬) and moves its breakpoints
 * to the line their statement starts on. Returns true if anything changed.
 */
export function formatProjectSources(project,tabSize=loadPreferences().tabSize||4){
 let changed=false;
 const format=(name,text)=>{
  const {text:next,lines}=formatCode(text,{tabSize});if(next===text)return text;
  changed=true;const start=[];let n=1;for(const g of lines){start.push(n);n+=g.length;}
  for(const b of project.ide?.breakpoints||[])if(b.file===name&&start[b.line-1])b.line=start[b.line-1];
  return next;
 };
 if(typeof project.code==='string')project.code=format('main.c',project.code);
 for(const file of project.firmware?.files||[])if(/\.(c|h|cpp|hpp|cc)$/i.test(file.name))file.text=format(file.name,file.text);
 return changed;
}
