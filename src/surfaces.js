import {attachments,assignAttachments} from './components.js';

// Missing flags preserve the board and breadboard in projects saved before 0.23.
export const surfacePresent=(surfaces,key)=>surfaces?.[key]?.hidden!==true;
export function showSurface(project,key,position){
 project.surfaces??={};project.surfaces[key]={...project.surfaces[key],hidden:false,...position};
}
export function removeSurface(project,key){
 const owns=id=>key==='board'?id.startsWith('board:'):/^(bb:|rail:)/.test(id);
 for(const part of project.components)assignAttachments(part,Object.fromEntries(Object.entries(attachments(part)).filter(([,id])=>!owns(id))));
 project.wires=project.wires.filter(w=>!owns(w.from)&&!owns(w.to));
 project.surfaces??={};project.surfaces[key]={...project.surfaces[key],hidden:true};
 if(project.deviceDocs)project.deviceDocs.bindings=project.deviceDocs.bindings.filter(b=>b.key!=='surface_'+key);
}
