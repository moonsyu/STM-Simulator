// Keyboard shortcuts of the circuit and the editor.
import {cancelCarry} from './app-canvas.js';
import {copyCircuit,pasteCircuit,removeSelected,rotateSelected} from './app-circuit.js';
import {editUndo,running,inspectTab,setMode} from './app-core.js';
import {save} from './app-files.js';
import {state} from './app-state.js';
import {refresh} from './app-view.js';
import {wireDraft} from './app.js';
import {$} from './common.js';

// Text the user dragged over in a panel (문제, 출력, 터미널 …): Ctrl+C copies it instead of the selected circuit parts.
const selectedText=()=>{const s=window.getSelection?.();return !!s&&!s.isCollapsed&&s.toString().trim()!=='';};
// The panel holding the text selection, for Ctrl+A there (the circuit's Ctrl+A selects every part).
const selectionPanel=()=>{const n=window.getSelection?.()?.anchorNode,el=n&&(n.nodeType===1?n:n.parentElement);return el?.closest('#bottom-panel [role="tabpanel"], #bottom-panel section, .monitor-window [role="tabpanel"]')||null;};
// ---- event handlers
export function onWindowKeydown(e){
 if(e.defaultPrevented)return;
 const editing=['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)||document.activeElement.isContentEditable,modal=document.querySelector('dialog[open]');
 if(modal)return;
 if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();save();return;}
 if(document.activeElement===$('code')&&(e.ctrlKey||e.metaKey)&&['z','y'].includes(e.key.toLowerCase())){e.preventDefault();editUndo(e.key.toLowerCase()==='y'||e.shiftKey);return;}
 if(editing)return;
 if((e.ctrlKey||e.metaKey)&&!e.shiftKey&&!e.altKey&&e.key.toLowerCase()==='c'&&selectedText())return;
 if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='a'){const panel=selectionPanel();if(panel){e.preventDefault();const r=document.createRange();r.selectNodeContents(panel);const s=window.getSelection();s.removeAllRanges();s.addRange(r);return;}}
 if((e.ctrlKey||e.metaKey)&&['a','d'].includes(e.key.toLowerCase())){
  if(state.drag){e.preventDefault();return;}
  if(running())return;
  if(e.key.toLowerCase()==='a'){e.preventDefault();state.pending=null;wireDraft.reset();state.mode='select';state.selection={type:'group',parts:state.project.components.map(p=>p.id),wires:state.project.wires.map(w=>w.id)};if(!state.selection.parts.length&&!state.selection.wires.length)state.selection=null;$('preview-layer').innerHTML='';inspectTab();refresh();}
  else if(copyCircuit()){e.preventDefault();pasteCircuit();}
  return;
 }
 if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='c'){e.preventDefault();copyCircuit();return;}
 if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='v'){e.preventDefault();pasteCircuit();return;}
 if(e.key==='Backspace'&&state.pending){e.preventDefault();wireDraft.sync(state.pending);wireDraft.back();$('preview-layer').innerHTML='';return;}
 if(e.key==='Escape'&&cancelCarry()){e.preventDefault();return;}
 if(e.key==='Escape'){wireDraft.reset();e.preventDefault();if(!state.pending&&['part','wire','group','surface'].includes(state.selection?.type)){removeSelected();}else {state.pending=null;state.mode='select';state.selection=null;$('preview-layer').innerHTML='';refresh();}}
 if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();removeSelected();}
 // Single-letter tools only without Ctrl/Alt/Meta (Ctrl+R is the editor's replace shortcut).
 if(!e.ctrlKey&&!e.metaKey&&!e.altKey){if(e.key.toLowerCase()==='r')rotateSelected();if(e.key.toLowerCase()==='w')setMode('wire');if(e.key.toLowerCase()==='v')setMode('select');}
 if(e.ctrlKey&&e.key.toLowerCase()==='z'){e.preventDefault();editUndo(e.shiftKey);}if(e.ctrlKey&&e.key.toLowerCase()==='y'){e.preventDefault();editUndo(true);}
}
