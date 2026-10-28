const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {createHash}=require('node:crypto');
const {execute}=require('./process-tools.cjs');
// ESP32 boards of the circuit build their sketch.ino with Arduino CLI (the copy inside Arduino IDE 2 is found) and the
// Espressif esp32 core, then upload through the board's USB-serial bridge with esptool (run by `arduino-cli upload`).
const FQBN='esp32:esp32:esp32';
// USB-serial bridges of ESP32 boards: Silicon Labs CP210x, WCH CH340/CH9102, FTDI and the ESP32-S/C native USB.
const ESP_VIDS=['10C4','1A86','0403','303A'];
// Headers of the libraries the app's ESP32 sketches use, by Arduino library name.
const LIBRARIES={'DHT.h':'DHT sensor library'};
const BAUDS=[9600,19200,38400,57600,74880,115200,230400,460800,921600];
async function exists(p){try{await fs.access(p);return true;}catch{return false;}}
function cliCandidates(){
  const local=process.env.LOCALAPPDATA||path.join(os.homedir(),'AppData','Local'),inside='resources/app/lib/backend/resources/arduino-cli.exe';
  return [path.join(local,'Programs','Arduino IDE',inside),path.join(process.env.ProgramFiles||'C:/Program Files','Arduino IDE',inside)];
}
/** Arduino CLI: a saved path, Arduino IDE 2's bundled copy, or arduino-cli on PATH. */
async function findArduinoCli(){
  for(const c of cliCandidates())if(await exists(c))return c;
  for(const dir of (process.env.PATH||'').split(path.delimiter)){if(!dir)continue;const p=path.join(dir,'arduino-cli'+(process.platform==='win32'?'.exe':''));if(await exists(p))return p;}
  return '';
}
// Arduino IDE 2 keeps its CLI settings (board manager URLs, sketchbook with the libraries the user installed) here;
// the CLI then sees the same cores and libraries as the IDE.
async function cliConfig(){const file=path.join(os.homedir(),'.arduinoIDE','arduino-cli.yaml');return await exists(file)?['--config-file',file]:[];}
/** USB-serial ports of connected ESP32 boards: [{port:'COM4', name:'Silicon Labs CP210x USB to UART Bridge'}]. */
async function listEsp32Ports(){
  if(os.platform()!=='win32')return [];
  const script=`Get-PnpDevice -PresentOnly -Class Ports | Where-Object { $_.InstanceId -match 'VID_(${ESP_VIDS.join('|')})' } | ForEach-Object { $_.FriendlyName }`;
  const r=await execute(path.join(process.env.SystemRoot||'C:/Windows','System32/WindowsPowerShell/v1.0/powershell.exe'),['-NoProfile','-NonInteractive','-Command',script],{timeout:15000}).catch(()=>null);
  return (r?.stdout||'').split(/\r?\n/).flatMap(line=>{const m=/^(.*?)\s*\((COM\d+)\)\s*$/.exec(line.trim());return m?[{port:m[2],name:m[1]}]:[];}).sort((a,b)=>Number(a.port.slice(3))-Number(b.port.slice(3)));
}
const checkedPort=port=>{if(typeof port!=='string'||!/^COM\d{1,3}$/.test(port))throw new Error('ESP32 보드의 COM 포트를 실행 대상에서 고르세요. 보드를 USB로 연결하면 "ESP32 (COM4)"처럼 표시됩니다.');return port;};
/** The baud rate of the sketch's Serial.begin (115200 when it has none or uses another value). */
function sketchBaud(code){const n=Number(/Serial\.begin\s*\(\s*(\d{3,7})/.exec(code||'')?.[1]);return BAUDS.includes(n)?n:115200;}
// What a failed compile needs: a missing library is named (with how to install it), a missing core likewise.
function compileHint(log){
  const header=/fatal error: ([\w./-]+\.h): No such file or directory/.exec(log)?.[1];
  if(header){const library=LIBRARIES[path.basename(header)];return library?`라이브러리 "${library}"가 없습니다. Arduino IDE의 도구 → 라이브러리 관리에서 "${library}"를 검색해 설치하세요(함께 필요한 라이브러리도 모두 설치).`:`${header}를 찾을 수 없습니다. 필요한 라이브러리를 Arduino IDE의 라이브러리 매니저에서 설치하세요.`;}
  if(/platform not installed|Platform '?esp32:esp32'? not found|Invalid FQBN|unknown package/i.test(log))return 'ESP32 보드 패키지가 없습니다. Arduino IDE의 보드 매니저에서 "esp32 by Espressif Systems"를 설치하세요.';
  return '';
}
/** Why an upload failed, in terms of what to do on the board. */
function uploadHint(log){
  if(/Wrong boot mode|Failed to connect|No serial data received|Timed out waiting for packet header/i.test(log))return 'ESP32가 다운로드 모드에 들어가지 않았습니다. 보드의 BOOT 버튼을 누른 채로 다시 실행하고, "Connecting..."이 끝나고 "Writing"이 나오면 손을 떼세요. USB 케이블이 데이터 케이블인지도 확인하세요.';
  if(/could not open port|Access is denied|PermissionError|port is busy|Resource busy/i.test(log))return '포트를 다른 프로그램이 쓰고 있습니다. Arduino IDE의 시리얼 모니터 같은 프로그램을 닫고 다시 실행하세요.';
  if(/does not exist|FileNotFoundError|could not find port/i.test(log))return '포트를 찾을 수 없습니다. ESP32 보드가 USB로 연결되어 있는지 확인하세요.';
  return '';
}
/** What the board printing its ROM boot message means: held in download mode (BOOT still pressed at the reset). */
function monitorHint(text){return /waiting for download/.test(text)?'ESP32가 다운로드 모드로 다시 부팅했습니다(boot:0x3). BOOT 버튼에서 손을 뗀 뒤 보드의 EN(RST) 버튼을 한 번 누르면 업로드한 스케치가 실행됩니다.':'';}
const quote=a=>/\s/.test(a)?JSON.stringify(a):a;
/** Compile a sketch into a folder named by its code: a sketch that was already built is not compiled again. */
async function compileSketch({cli,code,root,fqbn=FQBN,signal,onOutput=()=>{}}){
  if(!cli||!await exists(cli))throw new Error('ESP32 빌드에는 Arduino CLI가 필요합니다. Arduino IDE 2를 설치하거나 개발 도구 설정에서 arduino-cli.exe 경로를 지정하세요.');
  const hash=createHash('sha256').update(JSON.stringify({code,fqbn})).digest('hex').slice(0,16),directory=path.join(root,hash),sketch=path.join(directory,'sketch'),out=path.join(directory,'build'),bin=path.join(out,'sketch.ino.bin');
  const result={target:'esp32',fqbn,directory:out,sketch,out,elf:'',baud:sketchBaud(code),diagnostics:[],artifacts:['sketch.ino.bin','sketch.ino.merged.bin','sketch.ino.elf','sketch.ino.map'].map(name=>({name,path:path.join(out,name)}))};
  if(await exists(bin)){onOutput(`이전에 빌드한 같은 스케치를 사용합니다 · ${out}\n`);return {...result,cached:true};}
  await fs.mkdir(sketch,{recursive:true});await fs.writeFile(path.join(sketch,'sketch.ino'),code,'utf8');
  const args=[...await cliConfig(),'compile','--fqbn',fqbn,'--output-dir',out,'--warnings','default',sketch];let log='';
  onOutput(`> arduino-cli ${args.map(quote).join(' ')}\n`);
  const r=await execute(cli,args,{signal,timeout:900000,onOutput:text=>{log=(log+text).slice(-2000000);onOutput(text);}});
  const {diagnosticsFrom}=require('./native-build.cjs');result.diagnostics=diagnosticsFrom(log);
  if(r.code!==0){await fs.rm(out,{recursive:true,force:true});const hint=compileHint(log),error=new Error(`ESP32 스케치 컴파일 실패 (종료 코드 ${r.code})${hint?'. '+hint:''}`);error.diagnostics=result.diagnostics;throw error;}
  return result;
}
const uploadArgs=async(result,port)=>[...await cliConfig(),'upload','--fqbn',result.fqbn,'-p',checkedPort(port),'--input-dir',result.out,result.sketch];
const monitorArgs=async(port,baud)=>[...await cliConfig(),'monitor','-p',checkedPort(port),'--config','baudrate='+baud,'--quiet'];
module.exports={FQBN,ESP_VIDS,findArduinoCli,listEsp32Ports,sketchBaud,compileHint,uploadHint,monitorHint,compileSketch,uploadArgs,monitorArgs,checkedPort};
