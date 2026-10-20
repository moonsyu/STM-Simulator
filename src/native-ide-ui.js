import {esc} from './render.js';
import {sourceFiles} from './source-files.js';
const $=id=>document.getElementById(id);
const TOOL_LABELS={armGcc:'ARM GCC · arm-none-eabi-gcc.exe',armGdb:'ARM GDB · arm-none-eabi-gdb.exe',cube:'STM32CubeF4 SDK 폴더',hostGcc:'Windows GCC · gcc.exe',hostGdb:'Windows GDB · gdb.exe',clangd:'C/C++ 언어 서버 · clangd.exe',openocd:'ST-LINK 서버 · openocd.exe',buildRoot:'빌드 작업 폴더 · 영문 경로 (선택)'};
export function mountNativeChrome(){
 document.querySelector('.ide-toolbar').insertAdjacentHTML('afterbegin','<label class="native-target-label">실행 대상<select id="native-target" aria-label="실행 대상"><option value="simulator">회로 시뮬레이터</option><option value="emulator">펌웨어 에뮬레이터 · ARM ELF</option><option value="arm">STM32 · ARM GCC</option><option value="host">Windows · C/C++</option></select></label><select id="native-config" aria-label="빌드 구성"><option>Debug</option><option>Release</option></select>');
 document.querySelector('.ide-toolbar').insertAdjacentHTML('beforeend','<button id="native-tools">개발 도구</button><button id="native-connection" hidden>보드 연결</button>');
 $('build-panel').insertAdjacentHTML('afterbegin','<div class="native-build-actions" id="native-build-actions" hidden><button id="native-artifacts" disabled>빌드 폴더 열기</button><span id="native-artifact-list"></span></div>');
 document.querySelector('.editor-position').insertAdjacentHTML('beforeend','<button id="language-toggle" title="clangd 의미 분석 사용">clangd 꺼짐</button>');
 document.querySelector('.monitor-tabs').insertAdjacentHTML('beforeend','<button data-monitor="native">터미널</button>');
 document.querySelector('.console').insertAdjacentHTML('beforeend','<section id="native-panel" hidden><div class="native-terminal-tools"><button id="terminal-start">터미널 시작</button><button id="terminal-close" disabled>터미널 종료</button><button id="native-output-clear">화면 지우기</button><span id="terminal-status">Windows 명령 프롬프트</span></div><pre id="native-output" aria-label="실행 및 터미널 출력" tabindex="0"></pre><form id="native-input-form"><select id="native-input-target" aria-label="입력 대상"><option value="terminal">터미널 명령</option><option value="program">실행 프로그램 stdin</option></select><input id="native-input" aria-label="명령 또는 프로그램 입력" autocomplete="off" placeholder="명령을 입력하고 Enter"><button>보내기</button></form></section>');
 $('debug-panel').insertAdjacentHTML('beforeend','<details id="native-debug-details" hidden><summary>CPU 레지스터 · 메모리</summary><div class="native-inspection"><section><h3>레지스터</h3><table><tbody id="native-registers"></tbody></table></section><section><h3>메모리</h3><form id="native-memory-form"><input id="native-memory-address" value="0x20000000" aria-label="메모리 주소"><input id="native-memory-count" type="number" value="128" min="1" max="4096" aria-label="읽을 바이트 수"><button>읽기</button></form><pre id="native-memory-output"></pre></section></div></details>');
 document.body.insertAdjacentHTML('beforeend',`<dialog id="native-tools-dialog" aria-labelledby="native-tools-title"><form id="native-tools-form" class="ide-form"><h2 id="native-tools-title">개발 도구 설정</h2><p class="form-hint">ARM 빌드에는 ARM GCC와 STM32CubeF4가 필요합니다. 실제 보드 디버깅에는 ARM GDB와 ST-LINK 서버를 연결하세요. Windows C/C++는 GCC·GDB, 의미 분석은 clangd를 사용합니다.</p><div class="native-tool-paths">${Object.entries(TOOL_LABELS).map(([key,label])=>`<label>${label}<div class="folder-field"><input id="tool-${key}" autocomplete="off"><button type="button" data-tool-pick="${key}">찾기</button></div><span id="tool-result-${key}" class="form-hint"></span></label>`).join('')}</div><p id="native-tools-error" class="form-error" role="alert"></p><div class="dialog-actions"><button type="button" id="native-tools-detect">자동 검색</button><button type="button" id="native-tools-probe">저장 후 검사</button><button type="button" id="native-tools-cancel">닫기</button><button class="run-button">저장</button></div></form></dialog><dialog id="native-connection-dialog" aria-labelledby="native-connection-title"><form id="native-connection-form" class="ide-form"><h2 id="native-connection-title">STM32 디버그 연결</h2><label>GDB 서버<select id="native-server"><option value="openocd">OpenOCD 자동 시작 · ST-LINK</option><option value="remote">실행 중인 GDB 서버에 연결</option></select></label><label>서버 주소<input id="native-endpoint" value="127.0.0.1:3333" spellcheck="false"></label><label class="native-check"><input id="native-flash" type="checkbox">시작할 때 빌드한 펌웨어를 보드에 기록</label><p class="form-hint">NUCLEO-F446RE의 ST-LINK를 USB로 연결하세요. 기록 옵션을 선택하면 실행·디버그 시작 시 보드의 기존 펌웨어를 새 빌드로 교체합니다. 외부 서버 연결은 서버에서 보드를 먼저 정지시켜 주세요.</p><p id="native-connection-error" class="form-error" role="alert"></p><div class="dialog-actions"><button type="button" id="native-connection-cancel">취소</button><button class="run-button">적용</button></div></form></dialog>`);
 $('new-project-template').insertAdjacentHTML('beforeend','<option value="native-host">Windows C/C++ · 콘솔 프로그램</option>');
}
export function setupNativeIde({o,editor,select,showMonitor,points,watches,toggleBreakpoint}){
 const api=window.nativeIde;let state='idle',building=false,working=false,lastStop=null,frame=0,sequence=0,language=false,languageTimer,languageQueued=false,languageRunning=false,languageReady=false,breakpointStates=[];
 let connection={server:'openocd',endpoint:'127.0.0.1:3333',flash:false};try{connection={...connection,...JSON.parse(localStorage.getItem('stm32lab.debugConnection')||'{}')};}catch{}
 // 'emulator' builds with ARM GCC but runs the ELF in the renderer, so GDB/run flows stay off.
 const emulator=()=>$('native-target').value==='emulator';
 const selected=()=>!['simulator','emulator'].includes($('native-target').value),config=()=>({target:$('native-target').value,configuration:$('native-config').value}),text=()=>JSON.stringify(o.getProject());
 const busy=()=>working||building||['starting','running','paused','finishing'].includes(state);
 const append=(id,value)=>{const el=$(id);el.textContent=(el.textContent+value).slice(-350000);el.scrollTop=el.scrollHeight;};
 function report(error){o.log(error.message,'error');append('native-output',error.message+'\n');if(selected())$('build-status').textContent=error.message;}
 async function guard(task){try{return await task();}catch(e){report(e);return null;}}
 function control(){
  const native=selected(),locked=busy(),paused=state==='paused';
  $('native-config').hidden=!native&&!emulator();$('native-connection').hidden=config().target!=='arm';$('native-build-actions').hidden=!native;$('native-debug-details').hidden=!native&&!emulator();
  document.querySelector('.firmware-tools').hidden=native&&config().target==='host';
  $('sound').hidden=$('step').hidden=native;
  $('native-target').disabled=locked||o.isSimulationRunning();$('native-config').disabled=locked;$('native-tools').disabled=locked;$('native-connection').disabled=locked;
  if(emulator()){$('ide-build').title='ARM GCC 빌드 → 펌웨어 에뮬레이터 (Ctrl+Shift+B)';document.querySelector('.language-badge').textContent='ARM ELF · 에뮬레이터';return;}
  if(!native){$('ide-build').title='시뮬레이터용 빌드 (Ctrl+Shift+B)';return;}
  document.querySelector('.language-badge').textContent=config().target==='arm'?'ARM · STM32 HAL':'C/C++ · GCC';
  $('ide-build').title='GCC 컴파일 및 링크 (Ctrl+Shift+B)';
  $('code').readOnly=locked;for(const id of ['source-add','ide-build','debug-start','new','open','workspace-open','source-rename','source-delete'])$(id).disabled=locked||(['source-rename','source-delete'].includes(id)&&o.getSource()==='main.c');
  $('run').disabled=building||working;$('run').textContent=paused?'계속 실행 (F5)':locked?'■ 실행 정지':'▶ 실행 (F5)';$('step').disabled=true;
  $('run-status').textContent=building?'컴파일 중':({idle:'준비됨',starting:'디버거 연결 중',running:'실행 중',paused:'일시정지',exited:'실행 종료'})[state]||state;
  $('mode-label').textContent=config().target==='arm'?'STM32 보드 실행':'Windows 프로그램 실행';
 }
 function lockUpdate(){o.refresh();control();}
 function renderDiagnostics(items){editor.diagnostics(items);$('build-errors').replaceChildren();for(const item of items){const button=document.createElement('button');button.className='build-error '+(item.severity||'error');button.textContent=`${item.file}:${item.line}:${item.column||1} · ${item.message}`;button.onclick=()=>select(item.file,item.line);$('build-errors').append(button);}}
 async function build(override){if(!api)return report(new Error('실제 빌드는 Windows 데스크톱 앱에서 사용할 수 있습니다.'));if(busy())return;working=true;lockUpdate();$('build-output').textContent='';$('build-errors').replaceChildren();$('native-artifact-list').textContent='';$('native-artifacts').disabled=true;showMonitor('build');try{return await api.build(text(),override||config());}catch(e){report(e);return null;}finally{working=false;lockUpdate();}}
 // Build the ARM firmware for the in-app emulator and return the ELF bytes.
 async function buildElf(){if(!api)throw new Error('ARM GCC 빌드는 Windows 데스크톱 앱에서 사용할 수 있습니다. 대신 파일 → 펌웨어 ELF 열기를 사용하세요.');const result=await build({target:'arm',configuration:$('native-config').value});if(!result)throw new Error('ARM GCC 빌드에 실패했습니다. 빌드 탭의 오류를 확인하세요.');return await api.elf();}
 async function command(action){
  if(!selected())return false;
  if(!api){report(new Error('실제 빌드와 디버그는 데스크톱 앱에서 사용할 수 있습니다.'));return true;}
  if(action==='start'&&busy()||action==='pause'&&(state!=='running'||working)||['into','over','out'].includes(action)&&(state!=='paused'||working))return true;
  if(action==='stop'){await guard(()=>api.stop());state='idle';building=false;working=false;lastStop=null;editor.updateDebug(points(),null);lockUpdate();return true;}
  if(working)return true;working=true;lockUpdate();
  try{
   if(action==='start'){state='starting';showMonitor('debug');await api.debug({text:text(),config:config(),connection,entry:true,breakpoints:points()});}
   else if(action==='run'){
    if(state==='paused')await api.action('continue');else if(state==='running'){await api.stop();state='idle';}else {state='starting';showMonitor('native');await api.run({text:text(),config:config(),connection});}
   }else await api.action(action);
  }catch(e){if(action==='start'||action==='run')state='idle';report(e);}finally{working=false;lockUpdate();}return true;
 }
 async function debugView(){
  if(!selected())return;editor.updateDebug(points(),state==='paused'&&lastStop?.frame?{file:basename(lastStop.frame.file||lastStop.frame.fullname||'main.c'),line:Number(lastStop.frame.line)||1}:null);
  $('debug-breakpoints').innerHTML=points().map(b=>{const result=breakpointStates.find(p=>p.file===b.file&&p.line===b.line);return `<button class="debug-frame" data-native-point="${esc(b.file)}:${b.line}">${esc(b.file)}:${b.line}${result?result.verified?` · 확인됨${result.actualLine!==b.line?' → '+result.actualLine:''}`:' · 보류됨':''} · 해제</button>`;}).join('')||'설정된 중단점 없음';
  for(const el of $('debug-breakpoints').querySelectorAll('button'))el.onclick=()=>{const [file,line]=el.dataset.nativePoint.split(':');toggleBreakpoint(file,Number(line));};
  if(state!=='paused'){sequence++;$('debug-location').textContent=state==='running'?'GDB 실행 중 — 일시정지하면 변수와 스택을 확인할 수 있습니다.':'GDB 디버그 시작 또는 중단점을 설정하세요.';for(const id of ['debug-locals','debug-globals','debug-stack','watch-values','native-registers'])$(id).replaceChildren();return;}
  const current=++sequence;try{
   const result=await api.inspect(frame);if(current!==sequence||state!=='paused')return;
   const active=result.frames.find(f=>Number(f.level)===frame)||result.frames[0];$('debug-location').textContent=`GDB · ${active?.func||'?'} · ${basename(active?.file||'')}:${active?.line||'?'} · ${lastStop?.reason||''}`;
   $('debug-locals').innerHTML=result.locals.map(v=>`<tr><td>${esc(v.name)}</td><td>${esc(v.value??'<최적화됨>')}</td></tr>`).join('')||'<tr><td>지역 변수 없음</td></tr>';
   $('debug-globals').innerHTML=(result.globals||[]).map(v=>`<tr><td title="${esc(v.type||'')}">${esc(v.name)}</td><td>${esc(v.value)}</td></tr>`).join('')||'<tr><td>전역 변수 없음 · 추가 이름은 감시식으로 조회</td></tr>';
   $('debug-stack').innerHTML=result.frames.map(f=>`<button class="debug-frame ${Number(f.level)===frame?'active':''}" data-native-frame="${f.level}">#${f.level} ${esc(f.func||'?')} · ${esc(basename(f.file||''))}:${esc(f.line||'?')}</button>`).join('');
   for(const el of $('debug-stack').querySelectorAll('button'))el.onclick=()=>{frame=Number(el.dataset.nativeFrame);const f=result.frames.find(f=>Number(f.level)===frame);select(basename(f.file||''),Number(f.line));void debugView();};
   $('native-registers').innerHTML=result.registers.map(r=>`<tr><td>${esc(r.name)}</td><td>${esc(r.value)}</td></tr>`).join('');
   const rows=[];for(const expression of watches()){let value;try{value=await api.evaluate(expression);}catch(e){value=e.message;}rows.push({expression,value});}if(current!==sequence||state!=='paused')return;
   $('watch-values').innerHTML=rows.map((r,index)=>`<div class="watch-row"><button data-native-watch="${index}" title="감시식 제거">${esc(r.expression)}</button><div>${esc(r.value)}</div></div>`).join('');for(const el of $('watch-values').querySelectorAll('button'))el.onclick=()=>{o.checkpoint();o.getProject().ide.watches.splice(Number(el.dataset.nativeWatch),1);o.saveLocal();void debugView();};
  }catch(e){if(state==='paused'&&current===sequence)$('debug-location').textContent=e.message;}
 }
 function sync(){const value=o.getProject().ide?.native||{target:'simulator',configuration:'Debug'};$('native-target').value=value.target;$('native-config').value=value.configuration;control();queueLanguage();}
 function change(){o.getProject().ide??={breakpoints:[],watches:[]};o.getProject().ide.native=config();o.saveLocal();editor.diagnostics([]);editor.updateDebug(points(),null);$('build-status').textContent=emulator()?'ARM GCC → 에뮬레이터 · 빌드 준비':selected()?`${config().target==='arm'?'ARM GCC':'Windows GCC'} · 빌드 준비`:'시뮬레이터용 빌드';$('new').disabled=$('open').disabled=$('workspace-open').disabled=false;o.refresh();queueLanguage();}
 function queueLanguage(){clearTimeout(languageTimer);if(!language||!selected())return;languageTimer=setTimeout(()=>void updateLanguage(),500);}
 async function updateLanguage(){if(!language||!selected())return;if(languageRunning){languageQueued=true;return;}languageRunning=true;try{await api.language(text(),config());languageReady=true;$('language-toggle').textContent='clangd 연결됨';}catch(e){languageReady=false;$('language-toggle').textContent='clangd 설정 필요';$('language-toggle').title=e.message;}finally{languageRunning=false;if(languageQueued){languageQueued=false;queueLanguage();}}}
 const lsp={enabled:()=>language&&languageReady&&selected(),query:(method,file,position)=>api['language-query'](method,file,position)};editor.setLanguageService(lsp);
 $('native-target').onchange=change;$('native-config').onchange=change;
 $('run').addEventListener('click',e=>{if(selected()){e.preventDefault();e.stopImmediatePropagation();void command('run');}},true);
 $('native-artifacts').onclick=()=>guard(()=>api.artifacts());
 $('native-tools').onclick=()=>guard(async()=>{const tools=await api.settings();for(const key of Object.keys(TOOL_LABELS))$('tool-'+key).value=tools[key]||'';$('native-tools-error').textContent='';$('native-tools-dialog').showModal();});
 $('native-tools-cancel').onclick=()=>$('native-tools-dialog').close();
 for(const button of document.querySelectorAll('[data-tool-pick]'))button.onclick=()=>guard(async()=>{const value=await api['choose-tool'](button.dataset.toolPick);if(value)$('tool-'+button.dataset.toolPick).value=value;});
 const toolValues=()=>Object.fromEntries(Object.keys(TOOL_LABELS).map(key=>[key,$('tool-'+key).value.trim()]));
 $('native-tools-form').onsubmit=async e=>{e.preventDefault();try{await api.configure(toolValues());$('native-tools-dialog').close();queueLanguage();}catch(error){$('native-tools-error').textContent=error.message;}};
 $('native-tools-detect').onclick=()=>guard(async()=>{const tools=await api.detect();for(const key of Object.keys(TOOL_LABELS))if(!$('tool-'+key).value)$('tool-'+key).value=tools[key]||'';});
 $('native-tools-probe').onclick=async()=>{try{await api.configure(toolValues());$('native-tools-probe').disabled=true;const result=await api.probe();for(const key of Object.keys(TOOL_LABELS))$('tool-result-'+key).textContent=(result[key].ok?'확인됨 · ':'확인 필요 · ')+result[key].message;}catch(e){$('native-tools-error').textContent=e.message;}finally{$('native-tools-probe').disabled=false;}};
 $('native-connection').onclick=()=>{$('native-server').value=connection.server;$('native-endpoint').value=connection.endpoint;$('native-flash').checked=connection.flash;$('native-connection-error').textContent='';$('native-connection-dialog').showModal();};
 $('native-connection-cancel').onclick=()=>$('native-connection-dialog').close();$('native-connection-form').onsubmit=e=>{e.preventDefault();const endpoint=$('native-endpoint').value.trim();if(!/^[\w.-]+:\d{1,5}$/.test(endpoint)||Number(endpoint.split(':')[1])<1||Number(endpoint.split(':')[1])>65535){$('native-connection-error').textContent='서버 주소를 host:port 형식으로 입력하세요.';return;}connection={server:$('native-server').value,endpoint,flash:$('native-flash').checked};localStorage.setItem('stm32lab.debugConnection',JSON.stringify(connection));$('native-connection-dialog').close();};
 $('language-toggle').onclick=()=>{language=!language;languageReady=false;editor.clearLanguageDiagnostics();$('language-toggle').textContent=language?'clangd 연결 중':'clangd 꺼짐';if(language){if(!selected()){language=false;$('language-toggle').textContent='ARM 또는 Windows 대상 선택';return;}queueLanguage();}else void guard(()=>api['language-stop']());};
 $('native-memory-form').onsubmit=e=>{e.preventDefault();const r=o.getSession()?.runtime;if(emulator()){if(typeof r?.memory!=='function'){report(new Error('에뮬레이터 실행 중에 메모리를 읽을 수 있습니다.'));return;}try{const text=$('native-memory-address').value.trim(),address=/^0x[0-9a-f]+$/i.test(text)?parseInt(text,16):/^\d+$/.test(text)?Number(text):NaN,count=Math.min(4096,Math.max(1,Number($('native-memory-count').value)||0));if(!Number.isInteger(address)||address<0)throw new Error('메모리 주소를 0x20000000 형식으로 입력하세요.');const bytes=r.memory(address,count),rows=[];for(let i=0;i<bytes.length;i+=16)rows.push('0x'+(address+i).toString(16).padStart(8,'0')+'  '+[...bytes.slice(i,i+16)].map(b=>b.toString(16).padStart(2,'0')).join(' '));$('native-memory-output').textContent=rows.join('\n');}catch(error){report(error);}return;}void guard(async()=>{const memory=await api.memory($('native-memory-address').value.trim(),Number($('native-memory-count').value));$('native-memory-output').textContent=memory.map(m=>`${m.begin}\n${m.contents.match(/.{1,32}/g).map(row=>row.match(/../g).join(' ')).join('\n')}`).join('\n');});};
 $('terminal-start').onclick=()=>guard(()=>api['terminal-open']());$('terminal-close').onclick=()=>guard(()=>api['terminal-close']());$('native-output-clear').onclick=()=>$('native-output').textContent='';
 $('native-input-form').onsubmit=e=>{e.preventDefault();const value=$('native-input').value;void guard(async()=>{if($('native-input-target').value==='program')await api.input(value+'\n');else await api['terminal-input'](value);$('native-input').value='';});};
 $('code').addEventListener('input',queueLanguage);
 if(api)api.onEvent(event=>{
  if(event.type==='build-output')append('build-output',event.text);
  if(event.type==='build-state'){
   building=event.state==='building';$('build-status').textContent=building?'GCC 컴파일 중':event.state==='succeeded'?'GCC 빌드 성공':'GCC 빌드 실패';
   if(event.state==='succeeded'){renderDiagnostics(event.result.diagnostics);$('native-artifact-list').textContent=event.result.artifacts.map(a=>a.name).join(' · ');$('native-artifacts').disabled=false;}
   if(event.state==='failed'){renderDiagnostics(event.diagnostics||[]);append('build-output','\n'+event.message+'\n');$('native-artifacts').disabled=true;}
   lockUpdate();
  }
  if(event.type==='debug-output'||event.type==='run-output'||event.type==='terminal-output')append('native-output',event.text);
  if(event.type==='debug-state'){state=event.state==='exited'?'finishing':event.state;lastStop=event;frame=0;if(state==='paused'){showMonitor('debug');if(event.frame?.line)select(basename(event.frame.file||event.frame.fullname||'main.c'),Number(event.frame.line));}lockUpdate();void debugView();}
  if(event.type==='breakpoints')breakpointStates=event.points;
  if(event.type==='run-state'){state=event.state;lockUpdate();if(event.state==='exited'&&event.code!==undefined)append('native-output',`\n프로그램 종료 · 코드 ${event.code}\n`);}
  if(event.type==='terminal-state'){$('terminal-start').disabled=event.state==='running';$('terminal-close').disabled=event.state!=='running';$('terminal-status').textContent=event.state==='running'?`명령 프롬프트 실행 중 · ${event.cwd||'앱 기본 폴더'}`:'터미널 종료';$('terminal-status').title=event.cwd||'';}
  if(event.type==='diagnostics'&&language&&selected())editor.languageDiagnostics(event.file,event.items);
 });
 if(!api){for(const id of ['native-tools','native-target','language-toggle','terminal-start'])$(id).disabled=true;}
 return {selected,emulator,buildElf,config,busy,controls:control,sync,build,command,debugView,queueLanguage,async syncBreakpoints(){if(!['paused','running'].includes(state))return;await guard(()=>api.breakpoints(points()));},reset(){state='idle';lastStop=null;sequence++;editor.clearLanguageDiagnostics();sync();}};
}
function basename(value){return value.replaceAll('\\','/').split('/').at(-1);}
