const assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),net=require('node:net');
const {createHash}=require('node:crypto');
const {_electron,chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {launch,terminate}=require('../desktop/process-tools.cjs');
// Node 20 has no global WebSocket; reuse Playwright's installed transport.
const WebSocketClient=globalThis.WebSocket||require('playwright-core/lib/utilsBundle').ws;

const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const freePort=()=>new Promise((resolve,reject)=>{
 const server=net.createServer();server.once('error',reject);
 server.listen(0,'127.0.0.1',()=>{const port=server.address().port;server.close(error=>error?reject(error):resolve(port));});
});
async function json(url){const response=await fetch(url,{signal:AbortSignal.timeout(1000)});if(!response.ok)throw Error('Inspector HTTP '+response.status);return response.json();}

// The portable NSIS launcher does not reliably forward inspector stdout. Connect
// to its actual Electron child through explicitly allocated loopback endpoints.
// Main-process access preserves the same native dialogs/window controls as the
// ordinary _electron test, without installing a bridge in the product renderer.
async function inspector(url){
 const socket=new WebSocketClient(url),pending=new Map();let next=0;
 const fail=error=>{for(const request of pending.values()){clearTimeout(request.timer);request.reject(error);}pending.clear();};
 socket.addEventListener('message',event=>{const response=JSON.parse(event.data),request=pending.get(response.id);if(!request)return;pending.delete(response.id);clearTimeout(request.timer);response.error?request.reject(Error(response.error.message)):request.resolve(response.result);});
 socket.addEventListener('close',()=>fail(Error('Main-process inspector disconnected')));
 socket.addEventListener('error',()=>fail(Error('Main-process inspector connection failed')));
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{socket.close();reject(Error('Main-process inspector startup timed out'));},10000);socket.addEventListener('open',()=>{clearTimeout(timer);resolve();},{once:true});socket.addEventListener('error',()=>{clearTimeout(timer);reject(Error('Main-process inspector connection failed'));},{once:true});});
 const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++next,timer=setTimeout(()=>{pending.delete(id);reject(Error('Main-process inspector request timed out: '+method));},30000);pending.set(id,{resolve,reject,timer});try{socket.send(JSON.stringify({id,method,params}));}catch(error){pending.delete(id);clearTimeout(timer);reject(error);}});
 await send('Runtime.enable');
 return {
  async evaluate(fn,arg){
   const response=await send('Runtime.evaluate',{expression:`(${fn.toString()})(require('electron'),${arg===undefined?'undefined':JSON.stringify(arg)})`,includeCommandLineAPI:true,awaitPromise:true,returnByValue:true});
   if(response.exceptionDetails)throw Error(response.exceptionDetails.exception?.description||response.exceptionDetails.text||'Main-process evaluation failed');
   return response.result?.value;
  },
  close(){fail(Error('Main-process inspector closed'));socket.close();}
 };
}

exports.launchWorkbenchRuntime=async({root,profile,env,execution})=>{
 const portable=Boolean(process.env.LAB_PORTABLE_EXE),executable=portable?path.resolve(process.env.LAB_PORTABLE_EXE):process.env.LAB_EXE||path.join(root,'node_modules/electron/dist/electron.exe');
 Object.assign(execution,{mode:portable?'portable-exe-cdp':'electron',viewportKind:'BrowserWindow content size'});
 const childEnv={...env};delete childEnv.ELECTRON_RUN_AS_NODE;delete childEnv.PORTABLE_EXECUTABLE_FILE;delete childEnv.PORTABLE_EXECUTABLE_DIR;delete childEnv.NODE_OPTIONS;
 if(!portable)return _electron.launch({executablePath:executable,args:process.env.LAB_EXE?[]:[root],cwd:root,env:childEnv});
 execution.exeSha256=createHash('sha256').update(await fs.readFile(executable)).digest('hex');
 await fs.mkdir(path.join(profile,'updates'),{recursive:true});await fs.writeFile(path.join(profile,'updates/settings.json'),JSON.stringify({automatic:false}));
 const rendererPort=await freePort();let mainPort=await freePort();while(mainPort===rendererPort)mainPort=await freePort();
 const rendererUrl=`http://127.0.0.1:${rendererPort}`,mainUrl=`http://127.0.0.1:${mainPort}/json/list`;
 let child,browser,main,page,mainWs,mainPid,startupError,closed=false;
 const close=async()=>{
  if(closed)return;closed=true;
  // Ask the genuine window to close so its ordinary autosave/diagnostic flush
  // completes. Detach the inspector so Node can finish exiting normally.
  if(main&&mainPid)await main.evaluate(({BrowserWindow})=>{for(const window of BrowserWindow.getAllWindows())window.close();}).catch(()=>{});
  else if(page)await page.evaluate(()=>window.close()).catch(()=>{});
  main?.close();if(browser)await browser.close().catch(()=>{});
  if(child?.exitCode===null)await Promise.race([new Promise(resolve=>child.once('exit',resolve)),delay(2500)]);
  // A portable stub may exit before its Electron child. Only terminate that
  // PID if the original inspector identity still proves it is our test process.
  if(mainPid&&mainWs){const targets=await json(mainUrl).catch(()=>[]);if(targets.some(target=>target.webSocketDebuggerUrl===mainWs))await terminate({pid:mainPid,exitCode:null});}
  if(child)await terminate(child);
 };
 try{
  child=launch(executable,[`--inspect=127.0.0.1:${mainPort}`,`--remote-debugging-port=${rendererPort}`,'--remote-debugging-address=127.0.0.1','--disable-background-timer-throttling','--disable-renderer-backgrounding'],{cwd:root,env:childEnv,stdio:'ignore'});child.once('error',error=>{startupError=error;});
  let ready=false;const deadline=Date.now()+90000;
  while(Date.now()<deadline){if(startupError)throw startupError;try{const [version,targets]=await Promise.all([json(rendererUrl+'/json/version'),json(mainUrl)]);mainWs=targets.find(target=>target.webSocketDebuggerUrl)?.webSocketDebuggerUrl;if(version.webSocketDebuggerUrl&&mainWs){ready=true;break;}}catch{}await delay(200);}
  assert.ok(ready,'Public portable executable must expose renderer and main-process inspectors');
  main=await inspector(mainWs);const identity=await main.evaluate(({app})=>({pid:process.pid,profile:app.getPath('userData')}));
  assert.equal(path.resolve(identity.profile),path.resolve(profile),'Portable main process must use the isolated test profile');mainPid=identity.pid;
  browser=await chromium.connectOverCDP(rendererUrl);const context=browser.contexts()[0];page=context.pages()[0]||await context.waitForEvent('page');
  return {firstWindow:async()=>page,evaluate:(fn,arg)=>main.evaluate(fn,arg),close};
 }catch(error){await close();throw error;}
};
