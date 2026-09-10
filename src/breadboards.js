import {breadboardPrefix} from './pins.js';
import {attachments,assignAttachments,rotatePoint,normalizeAngle} from './components.js';

// Wire endpoints retain their own board identity when boards move or overlap.
export function moveBreadboard(project,id,position){
 const board=project.components.find(p=>p.id===id&&p.type==='breadboard');if(!board)return;
 const prefix=breadboardPrefix(id),angle=normalizeAngle(position.rotation??board.rotation),delta=angle-board.rotation;
 for(const part of project.components){
  if(part===board)continue;const map=attachments(part),anchors=Object.values(map),owned=anchors.filter(anchor=>anchor.startsWith(prefix));if(!owned.length)continue;
  if(owned.length===anchors.length){
   const q=rotatePoint(part.x-board.x,part.y-board.y,delta);part.x=position.x+q.x;part.y=position.y+q.y;part.rotation=normalizeAngle(part.rotation+delta);
  }else assignAttachments(part,Object.fromEntries(Object.entries(map).filter(([,anchor])=>!anchor.startsWith(prefix))));
 }
 board.x=position.x;board.y=position.y;board.rotation=angle;
}
export function removeBreadboard(project,id){
 const prefix=breadboardPrefix(id);
 for(const part of project.components){const map=attachments(part);if(Object.values(map).some(anchor=>anchor.startsWith(prefix)))assignAttachments(part,Object.fromEntries(Object.entries(map).filter(([,anchor])=>!anchor.startsWith(prefix))));}
 project.wires=project.wires.filter(w=>![w.from,w.to].some(endpoint=>endpoint.startsWith(prefix)));
 project.components=project.components.filter(p=>p.id!==id);
}
