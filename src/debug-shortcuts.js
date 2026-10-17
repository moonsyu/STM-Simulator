export function debugShortcut(event){
 if(event.repeat||event.isComposing||event.altKey||event.metaKey)return null;
 const {key,ctrlKey:ctrl,shiftKey:shift}=event;
 if(ctrl)return shift&&key==='F5'?'start':null;
 if(key==='F6'&&!shift)return 'pause';
 if(key==='F10'&&!shift)return 'over';
 if(key==='F11')return shift?'out':'into';
 if(key==='F5'&&shift)return 'stop';
 return null;
}
