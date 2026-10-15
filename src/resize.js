import {BOARD,BB,scaleXOf,scaleYOf,scaleFields,assignScale,matrixOf,matrixFields,inverse,multiply,vector,surfaceOrigin,MIN_SCALE,MAX_SCALE} from './geometry.js';
import {attachments} from './components.js';
import {breadboardPrefix} from './pins.js';

function objectInfo(project,target){
 const {id,type}=target,surface=type==='surface'&&['board','breadboard'].includes(id),part=type==='part'?project.components.find(p=>p.id===id):null;
 if(!surface&&!part)throw new Error('크기를 바꿀 장치를 선택하세요.');
 return {surface,object:surface?(project.surfaces?.[id]??{}):part,origin:surface?surfaceOrigin(id,project.surfaces):part};
}
export function resizeObject(project,target,size){
 const {surface,object,origin}=objectInfo(project,target),{id}=target;
 const fields=typeof size==='number'?scaleFields(size,size):scaleFields(size.scaleX??scaleXOf(object),size.scaleY??scaleYOf(object));
 const destination={x:size.x??origin.x,y:size.y??origin.y};
 const validPosition=p=>Number.isFinite(p.x)&&Number.isFinite(p.y);
 if(!validPosition(destination))throw new Error('장치가 작업 공간을 벗어납니다.');
 const next={...object};assignScale(next,fields);
 const transform=multiply(matrixOf(next),inverse(matrixOf(object)));
 const owns=anchor=>surface?(id==='board'?anchor.startsWith('board:'):anchor.startsWith('bb:')||anchor.startsWith('rail:')):anchor.startsWith(breadboardPrefix(id));
 const children=surface||object.type==='breadboard'?project.components.filter(p=>p!==object&&Object.values(attachments(p)).length&&Object.values(attachments(p)).every(owns)):[];
 // Propagate the full affine transform so rotated mounted pins remain aligned.
 // Validate all changes before mutating the circuit.
 const changes=children.map(p=>{const q=vector(transform,{x:p.x-origin.x,y:p.y-origin.y});return {p,position:{x:destination.x+q.x,y:destination.y+q.y},fields:matrixFields(multiply(transform,matrixOf(p)))};});
 if(changes.some(c=>!validPosition(c.position)))throw new Error('크기를 바꾸면 장착 부품이 작업 공간을 벗어납니다.');
 for(const c of changes){assignScale(c.p,c.fields);Object.assign(c.p,c.position);}
 if(surface){project.surfaces??={};project.surfaces[id]={...fields,...destination};}
 else{assignScale(object,fields);Object.assign(object,destination);}
 return typeof size==='number'?size:fields;
}
export function resizeFrame(project,target,bounds){
 const {surface,object,origin}=objectInfo(project,target),matrix=matrixOf(object);
 const base=surface?(target.id==='board'?BOARD:BB):{x:0,y:0},offset=vector(matrix,base);
 const translation={x:origin.x-offset.x,y:origin.y-offset.y};
 return {bounds,matrix,translation,point:(x,y)=>{const q=vector(matrix,{x,y});return {x:q.x+translation.x,y:q.y+translation.y};}};
}
export function resizeFromHandle(project,target,bounds,handle,start,end,lockAspect=false){
 if(!/^(n|s|e|w|ne|nw|se|sw)$/.test(handle))throw new Error('크기 조절점을 확인하세요.');
 const {object}=objectInfo(project,target),frame=resizeFrame(project,target,bounds);
 const delta=vector(inverse(frame.matrix),{x:end.x-start.x,y:end.y-start.y});
 const horizontal=/[ew]/.test(handle),vertical=/[ns]/.test(handle);
 let fx=horizontal?1+delta.x*(handle.includes('e')?1:-1)/bounds.width:1;
 let fy=vertical?1+delta.y*(handle.includes('s')?1:-1)/bounds.height:1;
 if(lockAspect){const f=!horizontal?fy:!vertical?fx:Math.abs(fx-1)>=Math.abs(fy-1)?fx:fy;fx=fy=f;}
 const sx=scaleXOf(object),sy=scaleYOf(object);
 if(lockAspect){fx=fy=Math.max(MIN_SCALE/Math.min(sx,sy),Math.min(MAX_SCALE/Math.max(sx,sy),fx));}
 else{fx=Math.max(MIN_SCALE/sx,Math.min(MAX_SCALE/sx,fx));fy=Math.max(MIN_SCALE/sy,Math.min(MAX_SCALE/sy,fy));}
 const anchor={x:bounds.x+(handle.includes('w')?bounds.width:handle.includes('e')?0:bounds.width/2),y:bounds.y+(handle.includes('n')?bounds.height:handle.includes('s')?0:bounds.height/2)};
 const shift=vector(frame.matrix,{x:anchor.x*(1-fx),y:anchor.y*(1-fy)});
 const base=target.type==='surface'?(target.id==='board'?BOARD:BB):{x:0,y:0};
 const baseOffset=vector(frame.matrix,{x:base.x*fx,y:base.y*fy});
 const next=structuredClone(project);
 resizeObject(next,target,{scaleX:sx*fx,scaleY:sy*fy,x:frame.translation.x+shift.x+baseOffset.x,y:frame.translation.y+shift.y+baseOffset.y});
 return next;
}
