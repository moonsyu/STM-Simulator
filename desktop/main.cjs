const {app,BrowserWindow,ipcMain,dialog}=require('electron');
const fs=require('node:fs/promises');
const path=require('node:path');
// Keep the existing profile so renaming the app retains auto-saved circuits.
const legacyUserData=path.join(app.getPath('appData'),'STM32 Circuit Lab');
app.setName('STM Emulator');
app.setPath('userData',process.env.CIRCUIT_LAB_TEST_PROFILE||legacyUserData);
let win;
app.whenReady().then(()=>{
  win=new BrowserWindow({width:1540,height:1020,minWidth:1120,minHeight:760,show:process.env.CIRCUIT_LAB_SMOKE!=='1',backgroundColor:'#101b29',title:'STM Emulator',webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
  win.setMenuBarVisibility(false);
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  win.webContents.on('will-navigate',e=>e.preventDefault());
  win.loadFile(path.join(__dirname,'../index.html'));
});
app.on('window-all-closed',()=>app.quit());
ipcMain.handle('project:save',async(_event,text)=>{
  if(typeof text!=='string'||Buffer.byteLength(text)>2_000_000)throw new Error('회로 파일이 너무 큽니다.');
  JSON.parse(text);
  const result=await dialog.showSaveDialog(win,{title:'회로 저장',defaultPath:'my-circuit.stm32lab',filters:[{name:'STM Emulator',extensions:['stm32lab']}]});
  if(result.canceled)return null;
  await fs.writeFile(result.filePath,text,'utf8');return result.filePath;
});
ipcMain.handle('project:open',async()=>{
  const result=await dialog.showOpenDialog(win,{title:'회로 불러오기',properties:['openFile'],filters:[{name:'STM Emulator',extensions:['stm32lab','json']}]});
  if(result.canceled)return null;
  const stat=await fs.stat(result.filePaths[0]);if(stat.size>2_000_000)throw new Error('2 MB 이하의 회로 파일만 열 수 있습니다.');
  return await fs.readFile(result.filePaths[0],'utf8');
});
ipcMain.handle('waveform:export',async(_event,text)=>{
  if(typeof text!=='string'||Buffer.byteLength(text)>2_000_000||!text.startsWith('time_ms,'))throw new Error('파형 데이터가 올바르지 않습니다.');
  const result=await dialog.showSaveDialog(win,{title:'파형 CSV 저장',defaultPath:'stm-emulator-waveform.csv',filters:[{name:'CSV',extensions:['csv']}]});
  if(result.canceled)return null;await fs.writeFile(result.filePath,text,'utf8');return result.filePath;
});
