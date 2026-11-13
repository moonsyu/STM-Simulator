// Running and debugging: which boards run, starting and stopping a run, firmware builds for the emulator, step commands.
import {log,running,logUart,checkpoint,autosave} from './app-core.js';
import {state} from './app-state.js';
import {refresh} from './app-view.js';
import {runScope,boardOnlyRun,BOARD_ONLY_PROGRAM,monitor,uartLines,diagnostic,runStm32,feedback,firmwareKey} from './app.js';
import {projectBoard} from './boards.js';
import {$} from './common.js';
import {devboardModel} from './devboards.js';
import {FirmwareSession} from './firmware-session.js';
import {createBoardDrivers} from './fixed-run.js';
import {keyFor} from './keybindings.js';
import {compile} from './parser.js';
import {isCamera,applyCameraImage} from './part-media-ui.js';
import {esc} from './render.js';
import {SimulationSession} from './session.js';
import {stm32Boards,mainBoardName,createStm32Drivers,connectStm32Drivers,stm32View} from './stm32-boards.js';
import {PC,INTERNET} from './wireless.js';
import {armOnly} from './project-overrides.js';
const armNoted=new Set();

export function recompute(){if(!state.runtime||!state.session)return;try{state.session.setPressed(state.pressed);state.result=state.session.viewResult;const warning=state.result.warnings.join('|');if(warning&&warning!==state.lastWarnings)state.result.warnings.forEach(w=>log(w,'error'));state.lastWarnings=warning;}catch(e){state.result=state.session.viewResult;state.status='error';log(e.message,'error');}}
export function updateRunScope(){
 const select=$('run-scope');if(!select)return;const boards=state.project.components.filter(p=>p.type==='devboard'),value=runScope();
 select.closest('label').hidden=!boards.length;
 select.innerHTML=`<option value="all">전체 보드</option><option value="stm32">${stm32Boards(state.project).length?esc(mainBoardName(state.project)):'STM32'}만</option>`+boards.map(p=>`<option value="${esc(p.id)}">${esc(p.name)}만</option>`).join('');select.value=value;select.disabled=running();
}
export function initializeRuntime({debug=false,entry=false}={}){
 const scope=runScope(),boardOnly=boardOnlyRun(),emulate=!boardOnly&&!!state.ide?.emulator();
 if(emulate&&!state.firmware){state.status='error';state.runtime=null;state.session=null;log('펌웨어 ELF가 없습니다. 빌드하거나 파일 → 펌웨어 ELF 열기를 사용하세요.','error');return false;}
 const program=boardOnly?compile(BOARD_ONLY_PROGRAM):emulate?null:state.ide?.build({reveal:false});if(!boardOnly&&!emulate&&state.ide&&!program){state.status='error';state.runtime=null;state.session=null;log(`코드 검사에 실패해 실행하지 않았습니다: ${$('build-errors').textContent.trim()||'빌드 탭을 확인하세요.'} (편집기의 빨간 밑줄 위치)`,'error');return false;}
 try{state.simTime=0;state.pressed={};state.lastWarnings='';state.result=null;monitor.clear();uartLines.clear();const options={debug:debug?{entry,breakpoints:state.ide?.breakpoints()||[]}:undefined,print:s=>log(s,'serial'),uart:logUart,trace:event=>monitor.trace(event),channels:monitor.channels(),
   // Program hints (e.g. ADC single conversion mode read again) go to the 출력 log as well as the protocol monitor.
   warn:message=>{log(message,'error');monitor.trace({micros:state.session?.now??state.session?.runtime?.microTime??0,protocol:'경고',message});}};
  if(!emulate&&!boardOnly&&state.project.firmware?.mode==='hal'){const only=(state.project.firmware.files||[]).filter(f=>armOnly(f.name)&&!armNoted.has(f.name));if(only.length){for(const f of only)armNoted.add(f.name);log(`${only.map(f=>f.name).join(', ')}: 내장 해석기는 이 파일을 쓰지 않습니다. 고친 내용은 ARM GCC 빌드(시뮬레이터 엔진 ARM GCC, 에뮬레이터, 실물 보드)에서만 반영됩니다.`,'warning');}}
  state.session=emulate?new FirmwareSession(state.project,{...options,elf:state.firmware.bytes}):new SimulationSession(boardOnly?{...state.project,code:BOARD_ONLY_PROGRAM,firmware:{mode:'sketch',files:[]}}:state.project,{...options,program});state.runtime=state.session.runtime;state.status='paused';state.pending=null;state.mode='select';// The start line comes before what the program prints in its first tick.
  log(boardOnly?'다른 보드만 실행합니다. STM32 코드는 실행하지 않습니다.':emulate?`${state.ide?.gccSimulation?.()?'시뮬레이터(ARM GCC 빌드)를 시작했습니다':'펌웨어 에뮬레이터를 시작했습니다'} · ${state.firmware.name} · ${projectBoard(state.project).mcu} (${projectBoard(state.project).core}) 명령어 실행`:state.project.firmware?.mode==='hal'?'HAL 프로그램을 시작했습니다.':state.project.firmware?.mode==='fsp'?'FSP 프로그램(hal_entry.c)을 내장 해석기로 시작했습니다.':'스케치를 시작했습니다.');
  state.overvoltageLogged=new Set();
  state.session.circuit.drivers=scope==='stm32'?[]:[...createBoardDrivers(state.project,{log:s=>log(s,'serial'),scope}),...createStm32Drivers(state.project,{scope,emulate:!!state.ide?.emulator(),elfs:state.boardElfs,log:s=>log(s,'serial'),trace:event=>monitor.trace(event)})];state.session.buses.boards=()=>state.session.circuit.drivers;connectStm32Drivers(state.session);state.result=state.session.tick(0);for(const p of state.project.components)if(isCamera(p))void applyCameraImage(p,state.session);diagnostic('simulation.started',{debug,entry},true);state.ide?.debugView();return true;}
 catch(e){state.runtime=null;state.result=state.session?.viewResult??null;state.status='error';log(e.message,'error');return false;}
}
// Peers outside the circuit, for the serial monitor: a phone per Bluetooth module or ESP32, the PC on the router.
export function outsideTargets(p){
 const bluetooth=p.components.filter(c=>c.type==='wireless'&&c.catalogVariant!=='esp01-wifi-8').map(c=>[c.id,c.name]),esp32=p.components.filter(c=>c.type==='devboard'&&devboardModel(c)?.kind==='esp32'),wifi=esp32.length||p.components.some(c=>c.type==='wireless'&&c.catalogVariant==='esp01-wifi-8');
 return [...bluetooth,...esp32.map(c=>['esp32bt:'+c.id,c.name+' Bluetooth'])].map(([id,name])=>`<option value="outside:phone:${esc(id)}">스마트폰 → ${esc(name)}</option>`).join('')+(wifi?`<option value="outside:pc">공유기의 PC (${PC.ip}:${PC.port})</option><option value="outside:broker">인터넷 MQTT 브로커 (${INTERNET.broker.name})</option><option value="outside:web">인터넷 웹 서버 기록 (${INTERNET.web.name})</option>`:'');
}
export function resetBoard(id){const driver=state.session?.circuit?.drivers?.find(d=>d.part.id===id);if(!driver?.reset)return;try{driver.reset();log(`[${driver.part.name}] RESET · 프로그램을 처음부터 다시 실행합니다.`,'serial');}catch(e){state.status='error';log(e.message,'error');}refresh();}
export function recordSimulation(){if(state.result)diagnostic('simulation.state',{status:state.status,simulationMs:state.simTime,pins:state.runtime?.gpio||{},parts:state.result.parts,fault:state.result.fault,warnings:state.result.warnings});}
export function resetRuntime(){
 if(!state.runtime||!state.session||!['running','paused'].includes(state.status))return false;
 const wasRunning=state.status==='running',debug=!!state.runtime.debug?.enabled||!!state.ide?.breakpoints().length;recordSimulation();state.status='stopped';
 // End the previous run before compiling: manual builds remain blocked while running.
 const initialized=initializeRuntime({debug,entry:debug&&!wasRunning});
 if(initialized&&wasRunning)state.status=state.runtime.debug.paused?'paused':'running';
 refresh();return initialized;
}
export function stop(){recordSimulation();try{const before=JSON.stringify(state.project.components.map(p=>p.cardImage??null)),draft=structuredClone(state.project);state.session?.storage?.applyTo?.(draft);if(JSON.stringify(draft.components.map(p=>p.cardImage??null))!==before){checkpoint();state.project.components.forEach((p,i)=>{if(draft.components[i]?.cardImage!==undefined)p.cardImage=draft.components[i].cardImage;});autosave();log('SD 카드에 기록된 파일을 프로젝트에 저장했습니다.');}}catch(error){log('SD 카드 저장 실패: '+error.message,'error');}state.status='stopped';state.runtime=null;state.result=null;state.pressed={};state.pending=null;$('preview-layer').innerHTML='';log('시뮬레이션을 정지했습니다.');refresh();state.ide?.debugView();}
// The emulator target needs a built (or opened) ELF before the session can start.
export function cancelStart(){state.starting=false;state.startToken++;window.nativeIde?.stop?.().catch(()=>{});log('펌웨어 빌드를 취소했습니다.');refresh();}
export async function startRun(options){
 if(state.starting)return false;
 // The simulator builds with ARM GCC like the real board: missing tools are installed first (or the run falls back to
 // the built-in interpreter, or is cancelled).
 // gccSimulation(true): an FSP project that fell back to the interpreter on an earlier run checks the tools again.
 if(state.ide?.gccSimulation?.(true)&&!running()){state.starting=true;refresh();let tools;try{tools=await state.ide.ensureSimTools();}catch(error){log(error.message,'error');tools='cancel';}finally{state.starting=false;refresh();}if(tools==='cancel')return false;}
 if(state.ide?.emulator()&&(!boardOnlyRun()||runStm32().length)){const token=++state.startToken;state.starting=true;refresh();try{if(!boardOnlyRun())await ensureFirmware();await ensureBoardFirmware();}catch(error){if(token===state.startToken){log(error.message,'error');feedback.show('펌웨어를 준비하지 못했습니다. 빌드 탭의 오류를 확인하거나 ELF 파일을 여세요.','firmware');}return false;}finally{
  // The run button reads state.starting ("■ 빌드 취소"), so it is redrawn when the build ends either way: a failed build
  // once left the button on "빌드 취소", and pressing it started a new build.
  if(token===state.startToken){state.starting=false;refresh();}}if(token!==state.startToken)return false;}
 if(running())return false;const ok=initializeRuntime(options);if(ok)state.status=state.runtime.debug.paused?'paused':'running';refresh();if(ok)state.ide?.debugView();return ok;
}
export async function ensureFirmware(force=false){
 if(!force&&state.firmware&&(state.firmware.source==='file'||state.firmware.key===firmwareKey()))return state.firmware;
 log('ARM GCC로 펌웨어를 빌드합니다…');
 const bytes=await state.ide.buildElf();state.firmware={bytes,name:'firmware.elf',key:firmwareKey(),source:'build'};feedback.clear('firmware');
 log(`펌웨어 ELF 준비 완료 · ${(bytes.length/1024).toFixed(1)} KB`);return state.firmware;
}
export async function ensureBoardFirmware(){
 for(const p of runStm32()){
  const text=JSON.stringify(stm32View(state.project,p.id)),key=JSON.stringify([text,$('native-config')?.value]);if(state.boardElfs[p.id]&&state.boardElfKeys[p.id]===key)continue;
  log(`[${p.name}] ARM GCC로 펌웨어를 빌드합니다…`);state.boardElfs[p.id]=await state.ide.buildElf(text);state.boardElfKeys[p.id]=key;log(`[${p.name}] 펌웨어 ELF 준비 완료 · ${(state.boardElfs[p.id].length/1024).toFixed(1)} KB`);
 }
}
export async function openElf(){
 try{if(!window.desktop?.openElf)throw new Error('ELF 열기는 데스크톱 앱에서 사용할 수 있습니다.');const opened=await window.desktop.openElf();if(!opened)return;
  if(running())stop();state.firmware={bytes:opened.bytes,name:opened.name,key:null,source:'file'};
  const select=$('native-target');if(select&&select.value!=='emulator'){select.value='emulator';select.dispatchEvent(new Event('change'));}
  log(`펌웨어 ELF를 열었습니다 · ${opened.name} · ${(opened.bytes.length/1024).toFixed(1)} KB. ${keyFor('run.run')||'실행 버튼'}으로 에뮬레이터에서 실행합니다.`);
 }catch(error){log(error.message,'error');}
}
export function debugCommand(command){
 diagnostic('debug.command',{command,status:state.status,location:state.runtime?.location??null});
 if(command==='stop'){if(running())stop();return;}
 if(command==='start'){if(running())return;void startRun({debug:true,entry:true});return;}
 if(!state.runtime)return;
 if(command==='pause'){if(state.status==='running'){state.runtime.debug.enabled=true;state.runtime.debug.mode='into';}return;}
 if(!state.runtime.debug.paused)return;if(command==='out'&&state.runtime.depth<=1)return;
 state.runtime.resume(command);state.simTime=state.runtime.microTime/1000;state.status='running';state.ide?.debugView();refresh();
}
// Keyboard/menu entry points: run (Ctrl+F5), start debugging (F10), stop (Ctrl+F2) and the step commands.
export function runCommand(kind){
 // Paused in the simulator, emulator or a GDB session: Ctrl+F5 and F10 both continue.
 if(state.runtime?.debug.paused||state.ide?.nativePaused?.()){$('run').click();return;}
 if(running()||state.starting)return;
 if(kind==='debug'){state.ide?.debug('start');return;}
 $('run').click();
}
export function shellDebugCommand(command){
 if(command==='stop'&&state.starting){cancelStart();return;}
 if(state.ide?.debug)state.ide.debug(command);else debugCommand(command);
}
