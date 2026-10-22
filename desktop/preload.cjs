const {contextBridge,ipcRenderer}=require('electron');
// Main-process errors reach the page as "Error invoking remote method 'x': Error: message"; show only the message.
const invoke=(channel,...args)=>ipcRenderer.invoke(channel,...args).catch(error=>{throw new Error(String(error?.message??error).replace(/^Error invoking remote method '[^']*': (?:[A-Za-z]*Error: )?/,''));});
contextBridge.exposeInMainWorld('localDiagnostics',{record:input=>invoke('diagnostics:record',input)});
const updates={};
for(const name of ['state','check','download','configure','releases','install'])updates[name]=(...args)=>invoke('update:'+name,...args);
updates.onState=callback=>{const handler=(_event,state)=>callback(state);ipcRenderer.on('update:state',handler);return()=>ipcRenderer.removeListener('update:state',handler);};
contextBridge.exposeInMainWorld('appUpdates',updates);
const native={};
for(const name of ['settings','detect','configure','probe','install-plan','install-tools','install-cancel','choose-tool','build','run','debug','stop','action','inspect','evaluate','memory','breakpoints','input','language','language-stop','language-query','artifacts','terminal-open','terminal-input','terminal-close','elf'])native[name]=(...args)=>invoke('native:'+name,...args);
native.onEvent=callback=>{const handler=(_event,data)=>callback(data);ipcRenderer.on('native:event',handler);return()=>ipcRenderer.removeListener('native:event',handler);};
contextBridge.exposeInMainWorld('nativeIde',native);
contextBridge.exposeInMainWorld('desktop',{openElf:()=>invoke('firmware:open-elf'),exportColorscheme:text=>invoke('colorscheme:export',text),exportPreferences:text=>invoke('preferences:export',text),chooseProjectParent:()=>invoke('workspace:choose-parent'),createWorkspace:data=>invoke('workspace:create',data),openWorkspace:()=>invoke('workspace:open'),clearWorkspace:()=>invoke('workspace:clear'),saveWorkspace:text=>invoke('workspace:save',text),exportMain:text=>invoke('firmware:export-main',text),save:text=>invoke('project:save',text),open:()=>invoke('project:open'),exportCsv:text=>invoke('waveform:export',text),importFirmware:folder=>invoke('firmware:import',folder===true)});
