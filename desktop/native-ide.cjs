const fs=require('node:fs/promises'),path=require('node:path');
const {createHash}=require('node:crypto');
const {EventEmitter}=require('node:events');
const {detectTools,validateTools,probeTools,prepareBuild,build,fingerprint}=require('./native-build.cjs');
const {GdbSession}=require('./gdb-mi.cjs');
const {LanguageServer}=require('./clangd.cjs');
const {launch,terminate}=require('./process-tools.cjs');
function checkedConfig(value){if(!value||!['arm','host'].includes(value.target)||!['Debug','Release'].includes(value.configuration))throw new Error('빌드 대상과 구성을 선택하세요.');return {target:value.target,configuration:value.configuration};}
class NativeIde extends EventEmitter{
  constructor(directory){super();this.directory=directory;this.gdb=new GdbSession();this.lsp=new LanguageServer();this.result=null;this.buildController=null;this.tools=null;this.runProcess=null;this.server=null;this.terminal=null;
    this.gdb.on('output',text=>this.send('debug-output',{text}));this.gdb.on('state',state=>{this.send('debug-state',state);if(state.state==='idle')void this.stopServer();if(state.state==='exited')void this.gdb.stop();});
    this.gdb.on('breakpoints',points=>this.send('breakpoints',{points}));
    this.lsp.on('diagnostics',data=>this.send('diagnostics',data));this.lsp.on('status',data=>this.send('language-state',data));this.lsp.on('log',text=>this.send('language-log',{text}));
  }
  send(type,data){this.emit('event',{type,...data});}
  async settings(){if(!this.tools){let saved={};try{saved=JSON.parse(await fs.readFile(path.join(this.directory,'native-tools.json'),'utf8'));}catch(e){if(e.code!=='ENOENT'&&!(e instanceof SyntaxError))throw e;}this.tools=await detectTools(validateTools(saved));}return this.tools;}
  async configure(value){if(this.busy())throw new Error('빌드·실행·디버그를 종료한 뒤 도구 설정을 변경하세요.');this.tools=validateTools(value);await fs.mkdir(this.directory,{recursive:true});await fs.writeFile(path.join(this.directory,'native-tools.json'),JSON.stringify(this.tools,null,2));await this.lsp.stop();this.result=null;return this.tools;}
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
    if(config.target==='arm'&&connection.server==='openocd')await this.startServer(tools.openocd);
    try{await this.gdb.start({gdb:config.target==='arm'?tools.armGdb:tools.hostGdb,elf:plan.elf,cwd:plan.directory,target:config.target,endpoint:connection.server==='openocd'?'127.0.0.1:3333':connection.endpoint||'127.0.0.1:3333',flash:connection.flash===true,reset:connection.server==='openocd',entry,breakpoints,files:plan.files});}
    catch(e){await this.stopServer();throw e;}
    return {directory:plan.directory};
  }
  async startServer(executable){
    if(!executable)throw new Error('OpenOCD 경로를 설정하세요.');
    if(this.server)throw new Error('OpenOCD가 이미 실행 중입니다.');
    const child=this.server=launch(executable,['-f','interface/stlink.cfg','-f','target/stm32f4x.cfg','-c','bindto 127.0.0.1','-c','gdb_port 3333','-c','tcl_port disabled','-c','telnet_port disabled'],{});
    try{await new Promise((resolve,reject)=>{let log='';const timer=setTimeout(()=>reject(new Error('OpenOCD 연결 시간이 초과되었습니다. ST-LINK 연결을 확인하세요.')),15000);const done=(error)=>{clearTimeout(timer);error?reject(error):resolve();};child.once('error',done);child.once('exit',code=>{if(this.server===child)this.server=null;done(new Error('OpenOCD 종료: '+code+'\n'+log.slice(-2000)));});for(const stream of [child.stdout,child.stderr]){stream.setEncoding('utf8');stream.on('data',text=>{log=(log+text).slice(-10000);this.send('debug-output',{text});if(/Listening on port 3333 for gdb connections/.test(log))done();});}});}catch(e){await this.stopServer();throw e;}
  }
  async stopServer(){const child=this.server;this.server=null;await terminate(child);}
  async run({text,config,connection}){
    if(config.target==='arm')return this.startDebug({text,config,connection,entry:false});
    if(this.busy())throw new Error('현재 실행을 먼저 종료하세요.');const plan=await this.ensureBuild(text,config);const child=this.runProcess=launch(plan.elf,[],{cwd:plan.directory});this.send('run-state',{state:'running'});
    for(const stream of [child.stdout,child.stderr]){stream.setEncoding('utf8');stream.on('data',text=>this.send('run-output',{text}));}
    child.once('error',error=>this.send('run-output',{text:error.message+'\n'}));child.once('close',code=>{if(this.runProcess===child)this.runProcess=null;this.send('run-state',{state:'exited',code});});return {directory:plan.directory};
  }
  input(text){if(typeof text!=='string'||text.length>8192)throw new Error('입력이 너무 큽니다.');if(!this.runProcess)throw new Error('실행 중인 Windows 프로그램이 없습니다.');this.runProcess.stdin.write(text);}
  async language(text,config){config=checkedConfig(config);const project=await this.validate(text),tools=await this.settings();if(!tools.clangd)throw new Error('clangd 경로를 개발 도구 설정에서 지정하세요.');const key=createHash('sha256').update(JSON.stringify([config,project.firmware?.files.map(f=>f.name),project.mcu])).digest('hex');const files=[{name:'main.c',text:project.code},...(project.firmware?.files||[])];if(this.languageKey===key&&!this.lsp.closed){await this.lsp.update(files);return {state:'ready'};}await this.lsp.stop();const plan=await prepareBuild({project,tools,root:path.join(tools.buildRoot||this.directory,'language-workspaces'),...config});await this.lsp.start(tools.clangd,plan,files);this.languageKey=key;return {state:'ready'};}
  async openTerminal(cwd){if(this.terminal)return;const command=path.join(process.env.SystemRoot||'C:/Windows','System32/cmd.exe');const child=this.terminal=launch(command,['/D','/Q'],{cwd:cwd||this.directory});child.stdin.write('chcp 65001 > nul\r\n');for(const stream of [child.stdout,child.stderr]){stream.setEncoding('utf8');stream.on('data',text=>this.send('terminal-output',{text}));}child.once('error',error=>this.send('terminal-output',{text:error.message}));child.once('close',()=>{if(this.terminal===child)this.terminal=null;this.send('terminal-state',{state:'closed'});});this.send('terminal-state',{state:'running'});}
  terminalInput(text){if(!this.terminal)throw new Error('터미널을 먼저 시작하세요.');if(typeof text!=='string'||text.length>8192)throw new Error('명령이 너무 깁니다.');this.terminal.stdin.write(text+'\r\n');}
  async stop(){this.buildController?.abort();await this.gdb.stop();await this.stopServer();const child=this.runProcess;this.runProcess=null;await terminate(child);this.send('run-state',{state:'exited'});}
  async close(){await this.stop();await this.lsp.stop();await this.closeTerminal();}
  async closeTerminal(){const child=this.terminal;this.terminal=null;await terminate(child);}
}
module.exports={NativeIde};
