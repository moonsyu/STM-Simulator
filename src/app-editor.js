import {validateProject} from './project.js';
// The code editor: the open source file, line numbers, edits from tools, firmware mode and the board being edited.
import {pinSearch} from './app-canvas.js';
import {running,checkpoint,changed,log,autosave,tab} from './app-core.js';
import {outsideTargets} from './app-run.js';
import {state} from './app-state.js';
import {SOURCE_KEY,monitor,editorSearch,uartLines,layout,diagnostic} from './app.js';
import {resetMainCode} from './code-reset.js';
import {$} from './common.js';
import {raUartChannels} from './ra-config.js';
import {importFirmware} from './firmware-import.js';
import {offerCircuit} from './ioc-circuit-ui.js';
import {esc} from './render.js';
import {SERIAL_IDS} from './serial-config.js';
import {isStm32Board,stm32Boards,mainBoardName,swapStm32} from './stm32-boards.js';

export function syncEditor(){
 state.lastCodeCheckpoint=0;
 $('project-name').value=state.project.name;const files=state.project.firmware?.files||[],hal=state.project.firmware?.mode==='hal',fsp=state.project.firmware?.mode==='fsp',others=stm32Boards(state.project);if(!files.some(f=>f.name===state.sourceFile))state.sourceFile='main.c';try{localStorage.setItem(SOURCE_KEY,state.sourceFile);}catch{}
 // Other STM32 boards are edited by making them the board being edited (stm32:<id> swaps it with the main board).
 $('source-file').innerHTML=`<option value="main.c">${others.length?esc(mainBoardName(state.project))+' · ':''}${state.project.firmware?.mode==='fsp'?'hal_entry.c':hal?'main.c':'main.ino'}</option>`+files.map(f=>`<option value="${esc(f.name)}">${esc(f.name)}</option>`).join('')+others.map(p=>`<option value="stm32:${esc(p.id)}">${esc(p.name)} · main.c (이 보드 편집)</option>`).join('');$('source-file').value=state.sourceFile;
 $('code').readOnly=running();
 $('code').value=state.sourceFile==='main.c'?state.project.code:files.find(f=>f.name===state.sourceFile).text;$('firmware-mode').value=hal?'hal':'sketch';
 document.querySelector('.language-badge').textContent=(others.length?mainBoardName(state.project)+' · ':'')+(fsp?'Renesas FSP':hal?'STM32 HAL':'GPIO 스케치');lineNumbers();monitor.settings(state.project.simulation);
 document.querySelector('.code-note code').textContent=fsp?'R_IOPORT_PinWrite · R_IOPORT_PinRead\nR_BSP_SoftwareDelay\nR_ICU_ExternalIrqOpen · Enable\nR_SCI_UART_Open · Write · Read\nhal_entry() · R_BSP_WarmStart()':hal?'HAL_GPIO_Init · WritePin · ReadPin · TogglePin\nHAL_UART_Transmit · Receive_IT\nHAL_GPIO_EXTI_Callback\nHAL_TIM_Base_Start_IT · HAL_ADC_GetValue\nHAL_I2C_Mem_Read · HAL_SPI_Transmit\nprintf("value=%lu\\n", value)':'pinMode · digitalWrite · digitalRead\nanalogRead · analogWrite · delay\nLiquidCrystal · Serial1 · Wire · SPI\nTimer · attachInterrupt · DMA';
 document.querySelector('.code-note p').textContent=fsp?'Renesas FSP 코드를 ARM GCC로 빌드해 RA6E1 에뮬레이터에서 실행합니다.':hal?'main(void)와 지원 HAL API를 회로에 연결합니다. 전체 HAL 드라이버·ELF/BIN 실행은 지원하지 않습니다.':'GPIO 스케치 문법의 일부를 실행합니다. ELF/BIN 펌웨어 로더는 포함되지 않습니다.';
 // FSP (FPB-RA6E1): the enabled SCI UART channels, reached through a UART part on their RXD pin (no VCP on the board);
 // an SCI channel in simple SPI mode (r_sci_spi) is not one.
 const selectedSerial=$('serial-target').value,serials=hal?SERIAL_IDS.filter(id=>state.project.mcu?.peripherals[id]?.enabled):fsp?raUartChannels(state.project.mcu):[],serialKey=hal||fsp?serials.join(','):'sketch',keepSerial=$('serial-target').dataset.channels===serialKey;
 $('serial-target').innerHTML=fsp?(serials.length?serials.map(id=>`<option value="${id}">외부 UART 장치(USB-TTL 등) → ${id}</option>`).join(''):'<option value="">Pins에서 SCI UART 핀을 정하세요</option>'):hal?(serials.length?serials.map(id=>id==='USART2'?'<option value="USART2">ST-LINK VCP → USART2 (내장)</option>':`<option value="${id}">외부 UART 장치 → ${id}</option>`).join(''):'<option value="">UART 핀을 활성화하세요</option>'):'<option value="Serial1">외부 UART 장치 → Serial1</option><option value="Serial">USB 콘솔 → Serial</option>';
// Other boards' program output has its own entries (read only).
 $('serial-target').insertAdjacentHTML('beforeend',state.project.components.filter(p=>p.type==='devboard').map(p=>`<option value="board:${esc(p.id)}">${esc(p.name)} · Serial (USB)</option>`).join('')+outsideTargets(state.project));
 $('serial-target').value=keepSerial&&[...$('serial-target').options].some(o=>o.value===selectedSerial)?selectedSerial:serials.includes('USART2')?'USART2':serials[0]??(hal?'':'Serial1');$('serial-target').dataset.channels=serialKey;$('serial-target').disabled=hal&&!serials.length;
 editorSearch.refresh({sourceChanged:true});
 state.ide?.sync();
}
export function lineNumbers(){ $('line-numbers').textContent=Array.from({length:$('code').value.split('\n').length},(_,i)=>i+1).join('\n'); }
export function replaceCodeText(edit){
 if(running())throw new Error('시뮬레이션을 정지한 뒤 바꿔 주세요.');
 const code=$('code');code.focus({preventScroll:true});code.setSelectionRange(edit.start,edit.end);
 // Each replacement is one project-history entry, independent of typing in
 // the search inputs (Chromium shares native edit history across controls).
 state.replaceCheckpoint=true;
 try{code.setRangeText(edit.text,edit.start,edit.end,'end');code.dispatchEvent(new Event('input',{bubbles:true}));}
 finally{state.replaceCheckpoint=false;}
}
export function applyFirmware(files){try{if(!files)return;const imported=importFirmware(state.project,files);checkpoint();state.project=imported.project;state.sourceFile='main.c';syncEditor();changed();log('가져왔습니다: '+files.map(f=>f.name).join(', ')+(imported.regenerated?' · Pinout 설정과 main.c를 .ioc대로 만들었습니다(USER CODE 구역은 유지).':''));for(const warning of imported.warnings)log(warning,'error');
  // An .ioc carries no circuit: offer the parts its pins suggest (feature 13). Only when the project has no circuit yet,
  // so importing settings into a finished project does not ask every time (the Pinout has the same button).
  if(files.some(f=>/\.ioc$/i.test(f.name))&&!state.project.components.length&&document.getElementById('ioc-circuit-dialog'))offerCircuit(state.project.mcu,{getProject:()=>state.project,log:()=>{},intro:'.ioc에는 회로가 없습니다. ',apply:applyCircuit});
  }catch(e){log(e.message,'error');}}
/** Replaces the circuit with one built from the Pinout (ioc-circuit.js). */
export function applyCircuit(project){checkpoint();state.project=validateProject(project);syncEditor();changed();log(`핀 설정으로 회로를 만들었습니다: ${project.components.map(c=>c.name).join(', ')} (Ctrl+Z로 되돌림). 부품은 초안이니 실제 장치에 맞게 바꾸세요.`);}
export /** Edit another STM32 board: it becomes the main board (code, pin settings, sources, build, debug and flashing). */
function editBoard(id){
 const part=state.project.components.find(p=>p.id===id);if(!isStm32Board(part))return false;
 if(running()){log('편집할 STM32 보드를 바꾸려면 실행을 먼저 정지하세요.','error');return false;}
 checkpoint();const name=part.name;swapStm32(state.project,id);state.firmware=null;state.sourceFile='main.c';state.selection={type:'surface',id:'board'};state.pending=null;
 syncEditor();changed();pinSearch();state.ide?.invalidate?.();
 log(`${name} 보드를 편집합니다. 코드·핀 설정·빌드·디버그가 이 보드를 대상으로 하고, 다른 보드의 코드는 보드마다 저장되어 있습니다.`);return true;
}
export function onCodeInput(){if(state.replaceCheckpoint||Date.now()-state.lastCodeCheckpoint>1000){checkpoint();state.lastCodeCheckpoint=Date.now();}state.dirty=true;if(state.sourceFile==='main.c')state.project.code=$('code').value;else state.project.firmware.files.find(f=>f.name===state.sourceFile).text=$('code').value;lineNumbers();autosave();state.ide?.invalidate();$('undo').disabled=false;$('redo').disabled=true;}
export function onCodeResetConfirmClick(){
 try{
  if(running())throw new Error('빌드·실행·디버그를 정지한 뒤 초기화하세요.');
  const beforeLength=state.project.code.length,next=resetMainCode(state.project);
  checkpoint();state.project=next;state.sourceFile='main.c';state.runtime=null;state.session=null;state.result=null;state.status='stopped';state.simTime=0;state.pressed={};monitor.clear();uartLines.clear();
  syncEditor();changed();state.ide?.invalidate();tab('code');layout.reveal('code');
  diagnostic('code.reset',{file:'main.c',mode:state.project.firmware?.mode,beforeLength,afterLength:state.project.code.length,preservedParts:state.project.components.length,preservedWires:state.project.wires.length},true);
  $('code-reset-dialog').close();log('기본 코드로 초기화했습니다. 회로·핀 설정·다른 파일은 유지됩니다. Ctrl+Z로 되돌릴 수 있습니다.');
 }catch(error){$('code-reset-error').textContent=error.message;}
}
export async function onFirmwareFilesChange(e){const chosen=[...e.target.files];try{if(chosen.length>121||chosen.reduce((n,f)=>n+f.size,0)>1000000)throw new Error('파일은 121개, 합계 1 MB 이하로 선택하세요.');applyFirmware(await Promise.all(chosen.map(async f=>({name:f.name,text:await f.text()}))));}catch(err){log(err.message,'error');}finally{e.target.value='';}}
