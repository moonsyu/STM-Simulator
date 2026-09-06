const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('desktop',{save:text=>ipcRenderer.invoke('project:save',text),open:()=>ipcRenderer.invoke('project:open'),exportCsv:text=>ipcRenderer.invoke('waveform:export',text)});
