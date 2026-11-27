import {assignAttachments,partsView} from './components.js';
import {rustExact} from './rust-core.js';

// Missing flags preserve the board and breadboard in projects saved before 0.23.
export const surfacePresent=(surfaces,key)=>surfaces?.[key]?.hidden!==true;
export function showSurface(project,key,position){
 project.surfaces??={};project.surfaces[key]={...project.surfaces[key],hidden:false,...position};
}
// What stays of each part's attachments and which wires stay is worked out in Rust (rust/stm-core/src/edit.rs,
// feature 62).
export function removeSurface(project,key){
 const change=rustExact('remove_surface',{components:partsView(project.components),wires:Array.isArray(project.wires)?project.wires.map(w=>w&&typeof w==='object'?{from:w.from,to:w.to}:w):project.wires},key);
 change.parts.forEach((map,i)=>assignAttachments(project.components[i],map));
 if(change.error)throw new Error(change.error);
 project.wires=project.wires.filter((w,i)=>change.wires[i]);
 project.surfaces??={};project.surfaces[key]={...project.surfaces[key],hidden:true};
 if(project.deviceDocs)project.deviceDocs.bindings=project.deviceDocs.bindings.filter(b=>b.key!=='surface_'+key);
}
