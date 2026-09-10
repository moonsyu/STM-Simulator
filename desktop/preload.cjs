const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('desktop',{exportMain:text=>ipcRenderer.invoke('firmware:export-main',text),save:text=>ipcRenderer.invoke('project:save',text),open:()=>ipcRenderer.invoke('project:open'),exportCsv:text=>ipcRenderer.invoke('waveform:export',text),importFirmware:folder=>ipcRenderer.invoke('firmware:import',folder===true)});
