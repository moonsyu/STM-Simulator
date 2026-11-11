// Actions every part of the app uses: the log, autosave and undo checkpoints, the editing mode, panel tabs.
import {pinSearch} from './app-canvas.js';
import {syncEditor} from './app-editor.js';
import {state} from './app-state.js';
import {refresh} from './app-view.js';
import {diagnostic,uartLines,feedback,layout} from './app.js';
import {$} from './common.js';
import {uartLineText} from './uart-text.js';

export function uid(prefix){return prefix+crypto.randomUUID().replaceAll('-','').slice(0,12);}
export function running(){return state.status==='running'||state.status==='paused'||!!state.ide?.nativeBusy();}
export function log(message,type='info'){
 diagnostic('console',{type,message:String(message).slice(0,8000),simulationMs:state.simTime,status:state.status});
 const div=document.createElement('div');div.className=`log-line ${type}`;
 const span=document.createElement('span');span.className='stamp';span.textContent=(state.simTime/1000).toFixed(3)+' s';div.append(span,document.createTextNode(message));
 $('console-output').append(div);while($('console-output').children.length>150)$('console-output').firstChild.remove();$('console-output').scrollTop=$('console-output').scrollHeight;
 return div;
}
export function logUart(event){
 diagnostic('uart',{instance:event.instance,direction:event.direction,bytes:Array.from(event.bytes).slice(0,512),micros:event.micros});
 const key=event.instance+' '+event.direction;
 for(const byte of event.bytes){if(byte===13)continue;if(byte===10){uartLines.delete(key);continue;}
  let row=uartLines.get(key);if(!row?.node.isConnected||row.bytes.length>=512){row={node:log('['+key+'] ','serial'),text:'',bytes:[]};row.node.querySelector('.stamp').textContent=(event.micros/1e6).toFixed(3)+' s';uartLines.set(key,row);}
  // UTF-8 text (a Korean printf) is shown as text; other bytes as \\xNN (uart-text.js).
  row.bytes.push(byte);row.text=uartLineText(row.bytes);row.node.lastChild.textContent='['+key+'] '+row.text;
 }
 $('console-output').scrollTop=$('console-output').scrollHeight;
}
export function setSaveState(text,state){$('save-state').textContent=text;$('save-state').dataset.state=state;}
export function flushAutosave(){clearTimeout(state.saveTimer);state.saveTimer=null;localStorage.setItem('stm32lab.project.v2',JSON.stringify(state.project));if($('save-state').dataset.state==='error-file')setSaveState('파일 저장 실패','error-file');else setSaveState('자동 저장됨','saved');feedback.clear('autosave');diagnostic('project.saved',{status:state.status},true);}
export function autosave(){clearTimeout(state.saveTimer);if($('save-state').dataset.state!=='error-file')setSaveState('저장 중…','saving');state.saveTimer=setTimeout(()=>{try{flushAutosave();}catch(error){setSaveState('자동 저장 실패',$('save-state').dataset.state==='error-file'?'error-file':'error');log('자동 저장 실패: '+error.message,'error');feedback.show('자동 저장에 실패했습니다. 파일 저장으로 작업을 보관해 주세요.','autosave');}},200);}
export function checkpoint(){state.undoStack.push(JSON.stringify(state.project));if(state.undoStack.length>80)state.undoStack.shift();state.redoStack=[];state.dirty=true;}
export function changed(){autosave();refresh();}
export function setMode(m){if(running()){log('편집하려면 시뮬레이션을 먼저 정지하세요.');return;}state.mode=m;state.pending=null;state.selection=null;$('preview-layer').innerHTML='';refresh();}
// The shell owns where each view lives: code in the editor group, the inspector in the
// secondary side bar, settings and device Docs in the primary side bar.
export function tab(name){if(name==='code')layout.reveal('code');else if(name==='inspect')layout.reveal('inspect');else if(['settings','docs'].includes(name))layout.showView(name);}
export function inspectTab(options){layout.reveal('inspect',options);}
export function editUndo(redo=false){if(running())return;const from=redo?state.redoStack:state.undoStack,to=redo?state.undoStack:state.redoStack;if(!from.length)return;to.push(JSON.stringify(state.project));state.project=JSON.parse(from.pop());state.selection=null;state.pending=null;syncEditor();changed();pinSearch();}
