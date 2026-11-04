// Launches the real Electron app with an isolated profile for end-to-end checks.
import {_electron} from 'playwright';
import electronPath from 'electron';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
export const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
// The test window is dark and sits behind the user's windows: the app starts it hidden (CIRCUIT_LAB_TEST_BACKGROUND),
// the harness puts it at the bottom of the z-order and shows it without focus, so it really renders but never covers the
// screen. E2E_SHOW=1 shows it in front instead; CI only shows it.
const sendToBack=hwnd=>new Promise(resolve=>execFile('powershell.exe',['-NoProfile','-NonInteractive','-Command',
 `Add-Type -Namespace E2E -Name Z -MemberDefinition '[DllImport("user32.dll")] public static extern bool SetWindowPos(System.IntPtr h, System.IntPtr after, int x, int y, int cx, int cy, uint flags);'; [void][E2E.Z]::SetWindowPos([System.IntPtr]${hwnd}, [System.IntPtr]1, 0, 0, 0, 0, 0x13)`],{windowsHide:true},()=>resolve()));
export async function launch({profile,env={},size={width:1600,height:900},toolsNotice=false,simEngine='interpreter'}={}){
 const dir=profile||await mkdtemp(path.join(tmpdir(),'stm-e2e-'));
 const args=[...(process.platform==='linux'?['--no-sandbox']:[]),root];
 const app=await _electron.launch({executablePath:electronPath,args,colorScheme:'dark',env:{...process.env,CIRCUIT_LAB_TEST_PROFILE:dir,CIRCUIT_LAB_TEST_BOARDS:'[]',CIRCUIT_LAB_TEST_BACKGROUND:process.env.E2E_SHOW==='1'?'0':'1',...env}});
 const win=await app.firstWindow();const errors=[];
 win.on('pageerror',error=>errors.push(error.message));
 win.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
 await app.evaluate(({BrowserWindow},s)=>{const w=BrowserWindow.getAllWindows()[0];w.setSize(s.width,s.height);},size);
 if(process.env.E2E_SHOW!=='1'){
  // HWND_BOTTOM with SWP_NOSIZE | SWP_NOMOVE | SWP_NOACTIVATE while hidden, then shown without activation.
  const hwnd=await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].getNativeWindowHandle().readBigUInt64LE().toString());
  if(process.platform==='win32'&&!process.env.CI)await sendToBack(hwnd);
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].showInactive());
 }
 await win.waitForSelector('html[data-shell="vscode"]',{timeout:30000});
 await win.waitForFunction(()=>document.getElementById('status-left')?.children.length>0);
 // The start-up 'missing tools' notice (shown 3 s after start) would cover controls; only its own test turns it on.
 if(!toolsNotice)await win.evaluate(()=>localStorage.setItem('stm32lab.toolsNotice.v1','never'));
 // The simulator engine: tests use the built-in interpreter (fast, no tools) unless they ask for ARM GCC.
 await win.evaluate(engine=>{localStorage.setItem('stm32lab.simEngine',engine);},simEngine);
 return {app,win,profile:dir,errors,async close({keep=false}={}){await app.close().catch(()=>{});if(!keep&&!profile)await rm(dir,{recursive:true,force:true}).catch(()=>{});}};
}
export const visible=(win,selector)=>win.locator(selector).first().isVisible();
export async function applyExample(win,query){
 await win.click('[data-activity="examples"]');
 if(!await win.locator('#view-examples').isVisible())await win.click('[data-activity="examples"]');
 await win.fill('#hal-example-search',query);
 await win.locator('#hal-example-list [data-example]').first().click();
 await win.waitForFunction(()=>document.querySelectorAll('#part-layer [data-part]').length>0);
}
export function contrast(a,b){
 const lum=([r,g,b])=>{const c=[r,g,b].map(v=>{v/=255;return v<=.03928?v/12.92:((v+.055)/1.055)**2.4;});return .2126*c[0]+.7152*c[1]+.0722*c[2];};
 const [x,y]=[lum(a),lum(b)].sort((p,q)=>q-p);return (x+.05)/(y+.05);
}
