const fs=require('node:fs/promises'),path=require('node:path');
const {createHash}=require('node:crypto');
const {EventEmitter}=require('node:events');
const {detectTools,validateTools,probeTools,prepareBuild,build,fingerprint}=require('./native-build.cjs');
const {GdbSession}=require('./gdb-mi.cjs');
const {LanguageServer}=require('./clangd.cjs');
const {launch,terminate}=require('./process-tools.cjs');
const {installPlan,installTools}=require('./tool-installer.cjs');
const {execute}=require('./process-tools.cjs');
const os=require('node:os');
// OpenOCD bundled with STM32CubeIDE is ST's fork: its scripts live in a separate plugin (…debug.openocd_*/resources/
// openocd/st_scripts) and it reaches the ST-LINK through the DAP interface; the legacy hla interface/stlink.cfg loops there.
// `target` is the OpenOCD target script of the project's MCU; `serial` picks one ST-LINK when several boards are connected.
async function openocdArgs(executable,{target='stm32f4x',serial}={}){
  const select=serial?['-c','adapter serial '+serial]:[];
  const m=/^(.*[\\/]plugins)[\\/][^\\/]*\.externaltools\.openocd\.[^\\/]*[\\/]/i.exec(executable||'');
  if(m)for(const name of (await fs.readdir(m[1]).catch(()=>[])).filter(n=>/\.debug\.openocd_/.test(n)).sort().reverse()){
    const scripts=path.join(m[1],name,'resources','openocd','st_scripts');
    if(await fs.access(path.join(scripts,'interface','stlink-dap.cfg')).then(()=>true,()=>false))return ['-s',scripts,'-f','interface/stlink-dap.cfg',...select,'-c','transport select dapdirect_swd','-f',`target/${target}.cfg`];
  }
  return ['-f','interface/stlink.cfg',...select,'-f',`target/${target}.cfg`];
}
const OPENOCD_TARGETS={STM32F446RE:'stm32f4x',STM32F103RB:'stm32f1x'};
// STM32CubeProgrammer (also inside STM32CubeIDE) lists each ST-LINK with its serial number and NUCLEO board name.
async function findProgrammer(){
  const candidates=[path.join(process.env.ProgramFiles||'C:/Program Files','STMicroelectronics/STM32Cube/STM32CubeProgrammer/bin/STM32_Programmer_CLI.exe')];
  for(const e of await fs.readdir('C:/ST',{withFileTypes:true}).catch(()=>[]))if(e.isDirectory()&&/^STM32CubeIDE/i.test(e.name)){
    const plugins=path.join('C:/ST',e.name,'STM32CubeIDE','plugins');
    for(const n of (await fs.readdir(plugins).catch(()=>[])).filter(n=>/\.cubeprogrammer\.win32_/.test(n)).sort().reverse())candidates.push(path.join(plugins,n,'tools','bin','STM32_Programmer_CLI.exe'));
  }
  for(const c of candidates)if(await fs.access(c).then(()=>true,()=>false))return c;return '';
}
/** Connected ST-LINKs as [{serial,board}] (board is '' when unknown). */
async function listStlinks(){
  const programmer=await findProgrammer();
  if(programmer){const r=await execute(programmer,['-l','st-link'],{timeout:15000}).catch(()=>null);const out=r?.stdout||'';if(/ST-LINK SN/.test(out))return [...out.matchAll(/ST-LINK SN\s*:\s*(\w+)[\s\S]*?Board Name\s*:\s*([^\r\n]*)/g)].map(m=>({serial:m[1],board:m[2].trim()}));}
  if(os.platform()!=='win32')return [];
  const r=await execute(path.join(process.env.SystemRoot||'C:/Windows','System32/WindowsPowerShell/v1.0/powershell.exe'),['-NoProfile','-NonInteractive','-Command',"Get-PnpDevice -PresentOnly | Where-Object { $_.InstanceId -match '^USB\\\\VID_0483&PID_(374B|374E|374F|3752|3753|3748)\\\\' } | ForEach-Object { $_.InstanceId.Split('\\')[-1] }"],{timeout:15000}).catch(()=>null);
  return (r?.stdout||'').split(/\r?\n/).map(s=>s.trim()).filter(s=>/^\w{8,}$/.test(s)).map(serial=>({serial,board:''}));
}
/** The ST-LINK serial for `boardName`: the one set by the user, the one whose board name matches, or the only one
 * connected when its board is unknown. A connected board of another kind is never chosen (it would be written with
 * firmware for the wrong MCU). */
async function chooseStlink(boardName,preferred,list=listStlinks){
  if(preferred)return preferred;
  const links=await list(),same=l=>l.board.toUpperCase()===boardName.toUpperCase();
  const match=links.filter(same);if(match.length===1)return match[0].serial;
  if(links.length===1&&!links[0].board)return links[0].serial;
  if(!links.length)return '';
  if(links.every(l=>l.board&&!same(l)))throw new Error(`프로젝트 보드 ${boardName}가 연결되어 있지 않습니다. 연결된 보드: ${links.map(l=>l.board).join(', ')}. 보드를 연결하거나 프로젝트 보드를 바꾸세요.`);
  throw new Error(`ST-LINK가 ${links.length}개 연결되어 있습니다. 보드 연결 설정에서 ${boardName}의 ST-LINK 시리얼을 지정하세요: ${links.map(l=>l.serial+(l.board?` (${l.board})`:'')).join(', ')}`);
}
function checkedConfig(value){if(!value||!['arm','host'].includes(value.target)||!['Debug','Release'].includes(value.configuration))throw new Error('빌드 대상과 구성을 선택하세요.');return {target:value.target,configuration:value.configuration};}
class NativeIde extends EventEmitter{
  constructor(directory){super();this.directory=directory;this.gdb=new GdbSession();this.lsp=new LanguageServer();this.result=null;this.buildController=null;this.tools=null;this.runProcess=null;this.server=null;this.terminal=null;
    this.gdb.on('output',text=>this.send('debug-output',{text}));this.gdb.on('state',state=>{this.send('debug-state',state);if(state.state==='idle')void this.stopServer();if(state.state==='exited')void this.gdb.stop();});
    this.gdb.on('breakpoints',points=>this.send('breakpoints',{points}));
    this.lsp.on('diagnostics',data=>this.send('diagnostics',data));this.lsp.on('status',data=>this.send('language-state',data));this.lsp.on('log',text=>this.send('language-log',{text}));
  }
  send(type,data){this.emit('event',{type,...data});}
  async settings(){if(!this.tools){let saved={};try{saved=JSON.parse(await fs.readFile(path.join(this.directory,'native-tools.json'),'utf8'));}catch(e){if(e.code!=='ENOENT'&&!(e instanceof SyntaxError))throw e;}this.tools=await detectTools(validateTools(saved));}return this.tools;}
  // The file keeps what the user entered; empty entries are auto-detected (as at start-up), not left empty until a restart.
  async configure(value){if(this.busy())throw new Error('빌드·실행·디버그를 종료한 뒤 도구 설정을 변경하세요.');const saved=validateTools(value);await fs.mkdir(this.directory,{recursive:true});await fs.writeFile(path.join(this.directory,'native-tools.json'),JSON.stringify(saved,null,2));this.tools=await detectTools(saved);await this.lsp.stop();this.result=null;return this.tools;}
  /** Missing tools for an ARM / real-board build, with download sizes (shown before anything is downloaded). */
  async installPlan(){return installPlan(await this.settings());}
  async installTools(ids){
    if(this.busy()||this.installing)throw new Error('빌드·실행·디버그 또는 설치를 마친 뒤 도구를 설치하세요.');
    this.installing=new AbortController();
    try{await installTools(ids,{signal:this.installing.signal,onProgress:p=>this.send('tools-install',p)});}finally{this.installing=null;}
    let saved={};try{saved=JSON.parse(await fs.readFile(path.join(this.directory,'native-tools.json'),'utf8'));}catch{}
    // Entries the user left empty (or that point at a missing file) now resolve to the installed tools.
    for(const [key,value]of Object.entries(saved))if(value&&!await fs.access(value).then(()=>true,()=>false))saved[key]='';
    this.tools=await detectTools(validateTools(saved));this.result=null;return this.tools;
  }
  cancelInstall(){this.installing?.abort();}
  busy(){return !!this.buildController||!this.gdb.closed||!!this.runProcess;}
  async validate(text){if(typeof text!=='string'||Buffer.byteLength(text)>2000000)throw new Error('프로젝트 크기 제한을 넘었습니다.');const {validateProject}=await import('../src/project.js');return validateProject(JSON.parse(text));}
  async compile(text,config){
    config=checkedConfig(config);if(this.busy())throw new Error('현재 작업을 정지한 뒤 빌드하세요.');const project=await this.validate(text);this.result=null;this.buildController=new AbortController();this.send('build-state',{state:'building'});
    try{const plan=await prepareBuild({project,tools:await this.settings(),root:path.join((await this.settings()).buildRoot||this.directory,'native-builds'),...config});this.result=await build(plan,{signal:this.buildController.signal,onOutput:text=>this.send('build-output',{text})});this.result.fingerprint=fingerprint(project,config);this.send('build-state',{state:'succeeded',result:this.result});return this.result;}
    catch(error){this.send('build-state',{state:'failed',message:error.message,diagnostics:error.diagnostics||[]});throw error;}finally{this.buildController=null;}
  }
  async ensureBuild(text,config){const p=await this.validate(text);if(this.result?.fingerprint===fingerprint(p,config))return this.result;return this.compile(text,config);}
  async startDebug({text,config,connection={},entry=true,breakpoints=[]}){
    if(this.busy())throw new Error('현재 실행을 먼저 종료하세요.');const plan=await this.ensureBuild(text,config),tools=await this.settings();
    if(entry&&config.configuration!=='Debug')throw new Error('소스 디버깅은 Debug 구성으로 빌드하세요.');
    if(config.target==='arm'&&connection.server==='openocd')await this.startServer(tools.openocd,await this.boardTarget(text,connection));
    try{await this.gdb.start({gdb:config.target==='arm'?tools.armGdb:tools.hostGdb,elf:plan.elf,cwd:plan.directory,target:config.target,endpoint:connection.server==='openocd'?'127.0.0.1:3333':connection.endpoint||'127.0.0.1:3333',flash:connection.flash===true,reset:connection.server==='openocd',entry,breakpoints,files:plan.files});}
    catch(e){await this.stopServer();throw e;}
    return {directory:plan.directory};
  }
  // OpenOCD target script and ST-LINK serial of the project's board.
  async boardTarget(text,connection={}){
    const project=await this.validate(text),{projectBoard}=await import('../src/boards.js'),board=projectBoard(project);
    return {target:OPENOCD_TARGETS[board.mcuFamily],serial:await chooseStlink(board.name,typeof connection.serial==='string'&&/^\w{8,40}$/.test(connection.serial)?connection.serial:'')};
  }
  // Run (Ctrl+F5) on the board like CubeIDE's Run: always write the current build, verify, reset, and let OpenOCD exit
  // so no debugger keeps polling the target through the ST-LINK (its COM LED LD1 stops blinking).
  // The connection's flash option only decides whether debugging (F10) loads the ELF or attaches to what is on the board.
  async runOnBoard({text,config,connection}){
    if(this.busy())throw new Error('현재 실행을 먼저 종료하세요.');
    const plan=await this.ensureBuild(text,config),tools=await this.settings();
    if(!tools.openocd)throw new Error('OpenOCD 경로를 설정하세요.');
    const steps=['-c',`program {${plan.elf.replace(/\\/g,'/')}} verify reset exit`];
    const child=this.runProcess=launch(tools.openocd,[...await openocdArgs(tools.openocd,await this.boardTarget(text,connection)),'-c','bindto 127.0.0.1','-c','gdb_port disabled','-c','tcl_port disabled','-c','telnet_port disabled',...steps],{});
    this.send('run-state',{state:'running'});let log='';
    try{
      const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',resolve);for(const stream of [child.stdout,child.stderr]){stream.setEncoding('utf8');stream.on('data',t=>{log=(log+t).slice(-10000);this.send('run-output',{text:t});});}});
      if(code!==0)throw new Error(`OpenOCD 기록 실패 (종료 코드 ${code}). ST-LINK 연결을 확인하세요.\n`+log.slice(-1500));
      this.send('run-output',{text:'\n펌웨어를 보드에 기록·검증하고 리셋했습니다. 디버거를 분리했으므로 보드가 단독으로 실행합니다.\n'});
      return {directory:plan.directory,flashed:true};
    }finally{if(this.runProcess===child)this.runProcess=null;this.send('run-state',{state:'idle'});}
  }
  async startServer(executable,options){
    if(!executable)throw new Error('OpenOCD 경로를 설정하세요.');
    if(this.server)throw new Error('OpenOCD가 이미 실행 중입니다.');
    const child=this.server=launch(executable,[...await openocdArgs(executable,options),'-c','bindto 127.0.0.1','-c','gdb_port 3333','-c','tcl_port disabled','-c','telnet_port disabled'],{});
    try{await new Promise((resolve,reject)=>{let log='';const timer=setTimeout(()=>reject(new Error('OpenOCD 연결 시간이 초과되었습니다. ST-LINK 연결을 확인하세요.')),15000);const done=(error)=>{clearTimeout(timer);error?reject(error):resolve();};child.once('error',done);child.once('exit',code=>{if(this.server===child)this.server=null;done(new Error('OpenOCD 종료: '+code+'\n'+log.slice(-2000)));});for(const stream of [child.stdout,child.stderr]){stream.setEncoding('utf8');stream.on('data',text=>{log=(log+text).slice(-10000);this.send('debug-output',{text});if(/Listening on port 3333 for gdb connections/.test(log))done();});}});}catch(e){await this.stopServer();throw e;}
  }
  async stopServer(){const child=this.server;this.server=null;await terminate(child);}
  async run({text,config,connection}){
    if(config.target==='arm')return connection?.server==='openocd'?this.runOnBoard({text,config,connection}):this.startDebug({text,config,connection,entry:false});
    if(this.busy())throw new Error('현재 실행을 먼저 종료하세요.');const plan=await this.ensureBuild(text,config);const child=this.runProcess=launch(plan.elf,[],{cwd:plan.directory});this.send('run-state',{state:'running'});
    for(const stream of [child.stdout,child.stderr]){stream.setEncoding('utf8');stream.on('data',text=>this.send('run-output',{text}));}
    child.once('error',error=>this.send('run-output',{text:error.message+'\n'}));child.once('close',code=>{if(this.runProcess===child)this.runProcess=null;this.send('run-state',{state:'exited',code});});return {directory:plan.directory};
  }
  input(text){if(typeof text!=='string'||text.length>8192)throw new Error('입력이 너무 큽니다.');if(!this.runProcess)throw new Error('실행 중인 Windows 프로그램이 없습니다.');this.runProcess.stdin.write(text);}
  async language(text,config){config=checkedConfig(config);const project=await this.validate(text),tools=await this.settings();if(!tools.clangd)throw new Error('clangd 경로를 개발 도구 설정에서 지정하세요.');const key=createHash('sha256').update(JSON.stringify([config,project.firmware?.files.map(f=>f.name),project.mcu])).digest('hex');const files=[{name:'main.c',text:project.code},...(project.firmware?.files||[])];if(this.languageKey===key&&!this.lsp.closed){await this.lsp.update(files);return {state:'ready'};}await this.lsp.stop();const plan=await prepareBuild({project,tools,root:path.join(tools.buildRoot||this.directory,'language-workspaces'),...config});await this.lsp.start(tools.clangd,plan,files);this.languageKey=key;return {state:'ready'};}
  async openTerminal(cwd){if(this.terminal)return;const command=path.join(process.env.SystemRoot||'C:/Windows','System32/cmd.exe');const directory=cwd||this.directory;
    // Switch the code page before cmd prints its first prompt so Korean paths are not garbled.
    const child=this.terminal=launch(command,['/D','/Q','/K','chcp 65001>nul'],{cwd:directory});this.terminalDirectory=directory;for(const stream of [child.stdout,child.stderr]){stream.setEncoding('utf8');stream.on('data',text=>this.send('terminal-output',{text}));}child.once('error',error=>this.send('terminal-output',{text:error.message}));child.once('close',()=>{if(this.terminal===child){this.terminal=null;this.send('terminal-state',{state:'closed'});}});this.send('terminal-state',{state:'running',cwd:directory});}
  terminalInput(text){if(!this.terminal)throw new Error('터미널이 시작되지 않았습니다. Windows 명령은 터미널을 시작한 뒤 입력하고, 실행 중인 시뮬레이터·보드의 UART로 보낼 문자는 직렬 모니터 탭에 입력하세요.');if(typeof text!=='string'||text.length>8192)throw new Error('명령이 너무 깁니다.');this.terminal.stdin.write(text+'\r\n');}
  async stop(){this.buildController?.abort();await this.gdb.stop();await this.stopServer();const child=this.runProcess;this.runProcess=null;await terminate(child);this.send('run-state',{state:'exited'});}
  async close(){await this.stop();await this.lsp.stop();await this.closeTerminal();}
  async closeTerminal(){const child=this.terminal;this.terminal=null;await terminate(child);if(!this.terminal)this.send('terminal-state',{state:'closed'});}
}
module.exports={NativeIde,openocdArgs,chooseStlink};
