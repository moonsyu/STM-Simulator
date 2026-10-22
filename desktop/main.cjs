const {app,BrowserWindow,ipcMain,dialog,shell,nativeTheme,Menu}=require('electron');
const fs=require('node:fs/promises');
const path=require('node:path');
// Keep the existing profile so renaming the app retains auto-saved circuits.
const legacyUserData=path.join(app.getPath('appData'),'STM32 Circuit Lab');
app.setName('STM Simulator');
app.setAppUserModelId('local.stm32.circuitlab');
app.setPath('userData',process.env.CIRCUIT_LAB_TEST_PROFILE||legacyUserData);
let win;
let chosenProjectParent=null,workspaceState=null;
const workspace=require('./workspace.cjs');
const {NativeIde}=require('./native-ide.cjs');
const {PortableUpdater,RELEASES}=require('./updater.cjs');
const updater=new PortableUpdater({version:app.getVersion(),directory:path.join(app.getPath('userData'),'updates'),target:process.env.PORTABLE_EXECUTABLE_FILE,enabled:app.isPackaged&&process.platform==='win32'&&!!process.env.PORTABLE_EXECUTABLE_FILE});
updater.on('state',state=>{if(win&&!win.isDestroyed())win.webContents.send('update:state',state);});
let updaterReady;
const {TOOL_KEYS,detectTools,probeTools}=require('./native-build.cjs');
const nativeIde=new NativeIde(app.getPath('userData'));
const {Diagnostics}=require('./diagnostics.cjs');
const diagnostics=new Diagnostics(app.getPath('userData'),app.getVersion());
ipcMain.handle('diagnostics:record',(event,input)=>{
 if(event.sender!==win?.webContents||!event.senderFrame||event.senderFrame!==win.webContents.mainFrame)throw new Error('허용하지 않는 요청입니다.');
 return diagnostics.record(input);
});
nativeIde.on('event',data=>{if(win&&!win.isDestroyed())win.webContents.send('native:event',data);});
let quitting=false,closing=null;
app.on('before-quit',event=>{
 if(quitting)return;event.preventDefault();
 // Let the renderer synchronously persist its latest draft before its window dies.
 // A failed draft write may veto close; keep the app and tools usable in that case.
 if(win&&!win.isDestroyed()){win.close();return;}
 if(!closing){updater.close();closing=Promise.allSettled([nativeIde.close(),workspace.flush(),diagnostics.flush()]).finally(()=>{quitting=true;app.quit();});}
});
function updateHandle(name,handler){ipcMain.handle('update:'+name,async(event,...args)=>{if(event.sender!==win?.webContents||event.senderFrame?.parent)throw new Error('허용하지 않는 요청입니다.');await updaterReady;return handler(...args);});}
updateHandle('state',()=>updater.snapshot());
updateHandle('check',()=>updater.check());
updateHandle('download',()=>updater.download());
updateHandle('configure',automatic=>updater.configure(automatic));
updateHandle('releases',()=>shell.openExternal(RELEASES));
updateHandle('install',async()=>{await updater.install();setImmediate(()=>app.quit());return true;});
function nativeHandle(name,handler){ipcMain.handle('native:'+name,async(event,...args)=>{if(event.sender!==win?.webContents||event.senderFrame?.parent)throw new Error('허용하지 않는 요청입니다.');return handler(...args);});}
nativeHandle('settings',()=>nativeIde.settings());
nativeHandle('detect',async()=>detectTools(await nativeIde.settings()));
nativeHandle('configure',value=>nativeIde.configure(value));
nativeHandle('probe',async()=>probeTools(await nativeIde.settings()));
nativeHandle('install-plan',()=>nativeIde.installPlan());
nativeHandle('install-tools',ids=>nativeIde.installTools(ids));
nativeHandle('install-cancel',()=>nativeIde.cancelInstall());
nativeHandle('choose-tool',async key=>{if(!TOOL_KEYS.includes(key))throw new Error('지원하지 않는 도구입니다.');const folder=['cube','cubeF1','buildRoot'].includes(key);const r=await dialog.showOpenDialog(win,{title:{cube:'STM32CubeF4 SDK 폴더 선택',cubeF1:'STM32CubeF1 SDK 폴더 선택',buildRoot:'빌드 작업 폴더 선택'}[key]||'개발 도구 실행 파일 선택',properties:[folder?'openDirectory':'openFile'],...(folder?{}:{filters:[{name:'실행 파일',extensions:['exe']}]})});return r.canceled?null:r.filePaths[0];});
nativeHandle('build',(text,config)=>nativeIde.compile(text,config));
nativeHandle('run',data=>nativeIde.run(data));
nativeHandle('debug',data=>nativeIde.startDebug(data));
nativeHandle('stop',()=>nativeIde.stop());
nativeHandle('action',action=>nativeIde.gdb.action(action));
nativeHandle('inspect',frame=>nativeIde.gdb.inspect(frame));
nativeHandle('evaluate',expression=>nativeIde.gdb.evaluate(expression));
nativeHandle('memory',(address,count)=>nativeIde.gdb.memory(address,count));
nativeHandle('breakpoints',points=>nativeIde.gdb.setBreakpoints(points));
nativeHandle('input',text=>nativeIde.input(text));
nativeHandle('language',(text,config)=>nativeIde.language(text,config));
nativeHandle('language-stop',()=>nativeIde.lsp.stop());
nativeHandle('language-query',(method,file,position)=>nativeIde.lsp.query(method,file,position));
nativeHandle('artifacts',async()=>{if(!nativeIde.result)throw new Error('먼저 빌드를 완료하세요.');return shell.openPath(nativeIde.result.directory);});
// The firmware emulator runs the ELF of the latest successful ARM build inside the renderer.
nativeHandle('elf',async()=>{const r=nativeIde.result;if(!r||r.target!=='arm'||!r.elf)throw new Error('먼저 STM32 · ARM GCC 빌드를 완료하세요.');const data=await fs.readFile(r.elf);if(data.length>16_000_000)throw new Error('ELF 파일이 너무 큽니다.');return new Uint8Array(data);});
nativeHandle('terminal-open',()=>nativeIde.openTerminal(workspaceState?.directory));
nativeHandle('terminal-input',text=>nativeIde.terminalInput(text));
nativeHandle('terminal-close',()=>nativeIde.closeTerminal());
app.whenReady().then(()=>{
  // The default Electron menu stays active while hidden and steals F11 (full screen), Ctrl+R (reload) and Ctrl+W;
  // the renderer owns every shortcut (편집 → 단축키 설정), so remove it.
  Menu.setApplicationMenu(null);
  updaterReady=updater.init().catch(error=>updater.set('error',{message:'업데이트 설정을 읽지 못했습니다: '+error.message}));
  win=new BrowserWindow({icon:path.join(__dirname,'icons/stm-simulator.ico'),width:1540,height:1020,minWidth:900,minHeight:560,show:process.env.CIRCUIT_LAB_SMOKE!=='1',backgroundColor:nativeTheme.shouldUseDarkColors?'#202020':'#f3f3f3',title:'STM Simulator',webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
  win.setMenuBarVisibility(false);
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  win.webContents.on('will-navigate',e=>e.preventDefault());
  win.loadFile(path.join(__dirname,'../index.html'));
});
app.on('window-all-closed',()=>app.quit());
ipcMain.handle('workspace:choose-parent',async()=>{const r=await dialog.showOpenDialog(win,{title:'프로젝트를 생성할 상위 폴더',properties:['openDirectory','createDirectory']});if(r.canceled)return null;chosenProjectParent=r.filePaths[0];return chosenProjectParent;});
ipcMain.handle('workspace:create',async(_event,{name,text})=>{if(!chosenProjectParent)throw new Error('저장할 상위 폴더를 먼저 선택하세요.');const created=await workspace.createWorkspace(chosenProjectParent,name,text);await nativeIde.closeTerminal();workspaceState=created;return workspaceState.directory;});
ipcMain.handle('workspace:open',async()=>{const r=await dialog.showOpenDialog(win,{title:'STM Simulator 프로젝트 폴더 열기',properties:['openDirectory']});if(r.canceled)return null;const opened=await workspace.openWorkspace(r.filePaths[0]);await nativeIde.closeTerminal();workspaceState=opened.state;return {text:opened.text,directory:workspaceState.directory};});
ipcMain.handle('workspace:save',async(_event,text)=>workspace.saveWorkspace(workspaceState,text));
ipcMain.handle('workspace:clear',async event=>{if(event.sender!==win?.webContents||event.senderFrame?.parent)throw new Error('허용하지 않는 요청입니다.');workspaceState=null;await nativeIde.closeTerminal();});
ipcMain.handle('firmware:import',async(_event,folder)=>{
  const result=await dialog.showOpenDialog(win,{title:folder?'Cube 프로젝트 루트 폴더 선택':'.ioc, main.c와 필요한 .c/.h 선택',properties:folder?['openDirectory']:['openFile','multiSelections'],...(!folder?{filters:[{name:'Cube 소스와 설정',extensions:['ioc','c','h']}]}:{})});
  if(result.canceled)return null;
  let paths=result.filePaths;
  if(folder){
    const root=paths[0];paths=[];
    for(const relative of ['','Core/Src','Core/Inc']){
      const directory=path.join(root,relative);let entries;try{entries=await fs.readdir(directory,{withFileTypes:true});}catch(error){if(error.code==='ENOENT')continue;throw error;}
      for(const entry of entries){if(!entry.isFile())continue;const ext=relative?/\.[ch]$/:/\.ioc$/;
        if(ext.test(entry.name)&&!['syscalls.c','sysmem.c','system_stm32f4xx.c','stm32f4xx_hal_conf.h','system_stm32f1xx.c','stm32f1xx_hal_conf.h'].includes(entry.name))paths.push(path.join(directory,entry.name));}
    }
  }
  if(!paths.length||paths.length>41)throw new Error('소스 파일 1~41개를 선택하세요.');
  const files=[];let total=0;
  for(const filename of paths){if(!/\.(ioc|c|h)$/.test(filename))throw new Error('.ioc 및 .c/.h 파일만 읽을 수 있습니다.');const stat=await fs.stat(filename);total+=stat.size;if(total>800000)throw new Error('소스는 합계 800 KB 이하로 선택하세요.');files.push({name:path.basename(filename),text:await fs.readFile(filename,'utf8')});}
  return files;
});
ipcMain.handle('project:save',async(_event,text)=>{
  if(typeof text!=='string'||Buffer.byteLength(text)>2_000_000)throw new Error('회로 파일이 너무 큽니다.');
  JSON.parse(text);
  const result=await dialog.showSaveDialog(win,{title:'회로 저장',defaultPath:'my-circuit.stm32lab',filters:[{name:'STM Simulator',extensions:['stm32lab']}]});
  if(result.canceled)return null;
  await fs.writeFile(result.filePath,text,'utf8');return result.filePath;
});
ipcMain.handle('preferences:export',async(event,text)=>{
  if(event.sender!==win?.webContents||event.senderFrame?.parent||typeof text!=='string'||Buffer.byteLength(text)>4000000)throw new Error('IDE 설정 내보내기 요청을 확인하세요.');
  const {validatePreferences}=await import('../src/ide-preferences.js');const preferences=validatePreferences(JSON.parse(text));
  const result=await dialog.showSaveDialog(win,{title:'IDE 설정 내보내기',defaultPath:'stm-ide-settings.json',filters:[{name:'IDE 설정',extensions:['json']}]});
  if(result.canceled)return null;await fs.writeFile(result.filePath,JSON.stringify(preferences,null,2),'utf8');return result.filePath;
});
ipcMain.handle('colorscheme:export',async(event,text)=>{
  if(event.sender!==win?.webContents||event.senderFrame?.parent||typeof text!=='string'||Buffer.byteLength(text)>500000)throw new Error('Colorscheme 내보내기 요청을 확인하세요.');
  const {validateEditorTheme}=await import('../src/colorscheme.js');const data=JSON.parse(text),theme=validateEditorTheme(data);
  const result=await dialog.showSaveDialog(win,{title:'Colorscheme 내보내기',defaultPath:'colorscheme.json',filters:[{name:'Monaco colorscheme',extensions:['json']}]});
  if(result.canceled)return null;await fs.writeFile(result.filePath,JSON.stringify({name:typeof data.name==='string'?data.name.slice(0,50):'Colorscheme',...theme},null,2),'utf8');return result.filePath;
});
ipcMain.handle('project:open',async()=>{
  const result=await dialog.showOpenDialog(win,{title:'회로 불러오기',properties:['openFile'],filters:[{name:'STM Simulator',extensions:['stm32lab','json']}]});
  if(result.canceled)return null;
  const stat=await fs.stat(result.filePaths[0]);if(stat.size>2_000_000)throw new Error('2 MB 이하의 회로 파일만 열 수 있습니다.');
  return await fs.readFile(result.filePaths[0],'utf8');
});
ipcMain.handle('waveform:export',async(_event,text)=>{
  if(typeof text!=='string'||Buffer.byteLength(text)>2_000_000||!text.startsWith('time_ms,'))throw new Error('파형 데이터가 올바르지 않습니다.');
  const result=await dialog.showSaveDialog(win,{title:'파형 CSV 저장',defaultPath:'stm-simulator-waveform.csv',filters:[{name:'CSV',extensions:['csv']}]});
  if(result.canceled)return null;await fs.writeFile(result.filePath,text,'utf8');return result.filePath;
});

ipcMain.handle('firmware:open-elf',async event=>{
  if(event.sender!==win?.webContents||event.senderFrame?.parent)throw new Error('허용하지 않는 요청입니다.');
  const result=await dialog.showOpenDialog(win,{title:'펌웨어 ELF 열기',properties:['openFile'],filters:[{name:'ARM ELF 펌웨어',extensions:['elf','axf','out']}]});
  if(result.canceled)return null;const file=result.filePaths[0],stat=await fs.stat(file);if(!stat.isFile()||stat.size>16_000_000)throw new Error('16 MB 이하의 ELF 파일을 선택하세요.');
  const data=await fs.readFile(file);if(data.length<52||data.readUInt32BE(0)!==0x7f454c46)throw new Error('ELF 형식의 펌웨어 파일이 아닙니다.');
  return {name:path.basename(file),bytes:new Uint8Array(data)};
});
ipcMain.handle('firmware:export-main',async(_event,text)=>{
  if(typeof text!=='string'||text.length>300000)throw new Error('main.c는 300,000자 이하로 저장하세요.');
  const result=await dialog.showSaveDialog(win,{title:'HAL main.c 저장',defaultPath:'main.c',filters:[{name:'C 소스',extensions:['c']}]});
  if(result.canceled)return null;await fs.writeFile(result.filePath,text,'utf8');return result.filePath;
});
