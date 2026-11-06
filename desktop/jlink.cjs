// SEGGER J-Link for the FPB-RA6E1's on-board J-Link OB: list the probes (USB VID 1366), write a build with J-Link
// Commander (JLink.exe: connect over SWD, erase what the image covers, load firmware.hex, verify, reset, go) and serve
// GDB with JLinkGDBServerCL.exe for source debugging (arm-none-eabi-gdb on 127.0.0.1:2331).
// OpenOCD cannot do either: it has no Renesas RA flash driver, and the OB enumerates with SEGGER's USB driver.
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {execute,launch}=require('./process-tools.cjs');

/** J-Link device name of each supported RA MCU family (SEGGER's device list). */
const JLINK_DEVICES={R7FA6E10F:'R7FA6E10F'};
const GDB_PORT=2331;

/** JLink.exe of the newest SEGGER install (C:/Program Files/SEGGER/JLink_Vxxx or JLink), or ''. */
async function findJlink(){
  for(const base of ['C:/Program Files/SEGGER','C:/Program Files (x86)/SEGGER']){
    const dirs=(await fs.readdir(base,{withFileTypes:true}).catch(()=>[])).filter(e=>e.isDirectory()&&/^JLink/i.test(e.name)).map(e=>e.name).sort((a,b)=>b.localeCompare(a,undefined,{numeric:true}));
    for(const d of dirs){const exe=path.join(base,d,'JLink.exe');if(await fs.access(exe).then(()=>true,()=>false))return exe;}
  }
  return '';
}
const gdbServerOf=jlink=>path.join(path.dirname(jlink),'JLinkGDBServerCL.exe');
/** Connected J-Link probes: [{serial, board, port, probe:'jlink'}]. The app supports one J-Link board, so a probe is
 * listed as the FPB-RA6E1 (its J-Link OB reports no board name). */
async function listJlinks(){
  if(os.platform()!=='win32')return [];
  const r=await execute(path.join(process.env.SystemRoot||'C:/Windows','System32/WindowsPowerShell/v1.0/powershell.exe'),['-NoProfile','-NonInteractive','-Command',"Get-PnpDevice -PresentOnly | Where-Object { $_.InstanceId -match '^USB\\\\VID_1366&PID_[0-9A-F]{4}\\\\' } | ForEach-Object { $_.InstanceId.Split('\\')[-1] }"],{timeout:15000}).catch(()=>null);
  return [...new Set((r?.stdout||'').split(/\r?\n/).map(s=>s.trim()).filter(s=>/^\d{6,12}$/.test(s)).map(s=>String(Number(s))))].map(serial=>({serial,board:'FPB-RA6E1',port:'',probe:'jlink'}));
}
/** The J-Link serial to use: the one picked, else the only one connected. */
async function chooseJlink(preferred,list=listJlinks){
  const links=await list();
  if(preferred&&links.some(l=>l.serial===preferred))return preferred;
  if(links.length===1)return links[0].serial;
  if(!links.length)throw new Error('J-Link가 연결되어 있지 않습니다. FPB-RA6E1을 USB(J10, DEBUG)로 연결하세요.');
  throw new Error(`J-Link가 ${links.length}개 연결되어 있습니다. 실행 대상에서 보드를 고르세요: ${links.map(l=>l.serial).join(', ')}`);
}
function commonArgs({serial,device}){return [...(serial?['-USB',serial]:[]),'-device',device,'-if','SWD','-speed','4000','-autoconnect','1','-NoGui','1','-ExitOnError','1'];}
/** J-Link Commander script that writes `hex`, verifies it, resets and runs the target. */
function programScript(hex){return ['r','h',`loadfile "${hex.replace(/\\/g,'/')}"`,'r','g','qc'].join('\n')+'\n';} // loadfile erases, programs and verifies
const JLINK_HINTS=[
  [/Cannot connect to J-Link|No J-Link found|Connecting to J-Link via USB\.{3}FAILED/i,'J-Link에 연결하지 못했습니다. USB(J10, DEBUG) 케이블과 다른 프로그램(e² studio·J-Link 창)이 J-Link를 쓰고 있지 않은지 확인하세요.'],
  [/Could not connect to target|Cannot connect to target|Failed to attach/i,'타깃 MCU에 연결하지 못했습니다. 보드 전원과 J-Link OB 점퍼(J6/J9 기본 설정)를 확인하세요.'],
  [/Unknown device|Device .* not found/i,'J-Link 소프트웨어가 R7FA6E10F를 모릅니다. SEGGER J-Link 소프트웨어를 최신 판으로 설치하세요.'],
  [/Verify failed|Verification failed|Programming failed|Failed to download/i,'기록 또는 검증에 실패했습니다. 보드를 다시 연결하고 다시 기록하세요.'],
];
function jlinkHint(log){return JLINK_HINTS.find(([p])=>p.test(String(log??'')))?.[1]??null;}
/** Write firmware.hex next to the ELF through one J-Link (J-Link Commander loadfile verifies what it writes). */
async function programJlink({jlink,hex,serial,device,onOutput=()=>{},launcher=launch,directory}){
  if(!jlink)throw new Error('SEGGER J-Link 소프트웨어(JLink.exe)가 없습니다. segger.com에서 J-Link Software and Documentation Pack을 설치하거나 개발 도구 설정에서 JLink.exe를 지정하세요.');
  const script=path.join(directory,'program.jlink');await fs.writeFile(script,programScript(hex));
  const child=launcher(jlink,[...commonArgs({serial,device}),'-CommandFile',script],{cwd:directory});let log='';
  const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',resolve);for(const stream of [child.stdout,child.stderr]){stream.setEncoding('utf8');stream.on('data',t=>{log=(log+t).slice(-20000);onOutput(t);});}});
  if(code!==0||/^\s*(ERROR|Error while|Failed)/mi.test(log)&&!/O\.K\./.test(log))throw new Error(`J-Link 기록 실패 (종료 코드 ${code}). ${jlinkHint(log)??'J-Link 연결을 확인하세요.'}\n`+log.slice(-1500));
  return log;
}
/** Arguments of JLinkGDBServerCL for the probe and MCU (only 127.0.0.1, one session). */
function gdbServerArgs({serial,device}){return [...(serial?['-select',`USB=${serial}`]:[]),'-device',device,'-if','SWD','-speed','4000','-port',String(GDB_PORT),'-swoport','2332','-telnetport','2333','-localhostonly','1','-nogui','1','-singlerun','-noir'];}
module.exports={JLINK_DEVICES,GDB_PORT,findJlink,gdbServerOf,listJlinks,chooseJlink,programJlink,programScript,gdbServerArgs,jlinkHint,commonArgs};
