// Saving and opening projects and files.
import {running,checkpoint,log,setSaveState} from './app-core.js';
import {syncEditor} from './app-editor.js';
import {replaceProject} from './app-examples.js';
import {state} from './app-state.js';
import {feedback} from './app.js';
import {formatProjectSources} from './code-format-ui.js';
import {$} from './common.js';
import {compileHal} from './hal-source.js';
import {loadPreferences} from './ide-preferences.js';
import {validateProject} from './project.js';

export async function save(){if(loadPreferences().formatOnSave&&!running()){const next=structuredClone(state.project);if(formatProjectSources(next)){checkpoint();state.project=next;syncEditor();log('저장하면서 코드를 정렬했습니다.');}}try{const savedProject=state.project,data=JSON.stringify(state.project,null,2);if(await state.ide?.saveWorkspace(data)){}else if(window.desktop){const path=await window.desktop.save(data);if(!path)return;}else{const blob=new Blob([data],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=state.project.name.replace(/[^\w가-힣-]/g,'_')+'.stm32lab';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}if(state.project===savedProject&&JSON.stringify(state.project,null,2)===data){state.dirty=false;state.lastCodeCheckpoint=0;}
  // A pending autosave from the last keystroke would replace "파일 저장됨" moments later; store it now instead.
  if(state.saveTimer){clearTimeout(state.saveTimer);state.saveTimer=null;try{localStorage.setItem('stm32lab.project.v2',JSON.stringify(state.project));}catch{}}
  feedback.clear('save');setSaveState('파일 저장됨','saved');log('회로 파일을 저장했습니다.');}catch(e){setSaveState('파일 저장 실패','error-file');log('저장 실패: '+e.message,'error');feedback.show('파일 저장에 실패했습니다. 저장 위치와 권한을 확인한 뒤 다시 저장해 주세요.','save');}}
export async function open(){try{if(window.desktop){const data=await window.desktop.open();if(data!=null){replaceProject(validateProject(JSON.parse(data)));feedback.clear('open');}}else $('file-input').click();}catch(e){log('불러오기 실패: '+e.message,'error');feedback.show('회로 파일을 열지 못했습니다. 현재 작업은 유지됩니다. 올바른 회로 파일을 선택해 주세요.','open');}}
export async function onFileInputChange(e){try{const f=e.target.files[0];if(!f)return;if(f.size>2e6)throw new Error('파일 크기는 2 MB 이하여야 합니다.');replaceProject(validateProject(JSON.parse(await f.text())));feedback.clear('open');}catch(err){log('불러오기 실패: '+err.message,'error');feedback.show('회로 파일을 열지 못했습니다. 현재 작업은 유지됩니다. 올바른 회로 파일을 선택해 주세요.','open');}e.target.value='';}
export async function onMainExportClick(){try{if(state.project.firmware?.mode!=='hal')throw new Error('HAL main.c를 선택하세요.');if($('native-target').value==='simulator')compileHal(state.project.code,state.project.firmware.files,state.project.mcu?.family);if(window.desktop?.exportMain){if(!await window.desktop.exportMain(state.project.code))return;}else{const url=URL.createObjectURL(new Blob([state.project.code],{type:'text/plain;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download='main.c';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}log('main.c를 저장했습니다. 실제 프로젝트의 핀·주변장치·NVIC 설정을 동일하게 구성하세요.');}catch(e){log(e.message,'error');}}
