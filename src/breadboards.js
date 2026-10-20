import {breadboardPrefix,breadboardModel,BB} from './pins.js';
import {partVector} from './geometry.js';
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

export const MAX_BREADBOARDS=8;
// Parts-library entries that create a breadboard component. Both kinds share type 'breadboard'
// (so moving, rotating, resizing, copying and deleting work alike); `variant:'full'` selects the 830-point model.
export const BREADBOARD_LIBRARY={breadboard:'half',breadboard_full:'full'};
export const isBreadboardLibraryType=type=>Object.hasOwn(BREADBOARD_LIBRARY,type);
/** Axis-aligned bounds of a breadboard component in circuit coordinates. */
export function breadboardBounds(part){
 const {frame}=breadboardModel(part),pts=[[-1,-1],[1,-1],[-1,1],[1,1]].map(([sx,sy])=>{const v=partVector(part,sx*frame.w/2,sy*frame.h/2);return {x:part.x+v.x,y:part.y+v.y};});
 return {left:Math.min(...pts.map(p=>p.x)),right:Math.max(...pts.map(p=>p.x)),top:Math.min(...pts.map(p=>p.y)),bottom:Math.max(...pts.map(p=>p.y))};
}
/** Fields for a new breadboard component of the given library type, placed clear of the existing boards. */
export function newBreadboardFields(project,libraryType='breadboard'){
 const variant=BREADBOARD_LIBRARY[libraryType]||'half',boards=project.components.filter(p=>p.type==='breadboard');
 if(boards.length>=MAX_BREADBOARDS)throw new Error('추가 빵판은 8개까지 사용할 수 있습니다.');
 const probe={id:'probe',type:'breadboard',x:0,y:0,rotation:0,...(variant==='full'?{variant}:{})},{frame}=breadboardModel(probe),w=frame.w,h=frame.h;
 const taken=[...boards.map(breadboardBounds),...(project.surfaces?.breadboard?.hidden?[]:[{left:BB.x,right:BB.x+BB.w,top:BB.y,bottom:BB.y+BB.h}])];
 const startX=BB.x+(project.surfaces?.breadboard?.hidden?0:BB.w+48);
 for(let i=0;i<64;i++){
  const x=startX+w/2+(w+48)*(i%4),y=BB.y+h/2+(h+60)*Math.floor(i/4),box={left:x-w/2,right:x+w/2,top:y-h/2,bottom:y+h/2};
  if(!taken.some(b=>b.left<box.right+24&&b.right>box.left-24&&b.top<box.bottom+24&&b.bottom>box.top-24))return {type:'breadboard',x,y,rotation:0,...(variant==='full'?{variant}:{})};
 }
 return {type:'breadboard',x:startX+w/2,y:BB.y+h/2,rotation:0,...(variant==='full'?{variant}:{})};
}
