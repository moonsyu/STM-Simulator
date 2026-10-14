import {BOARD,BB,scaleOf,validScale} from './geometry.js';
import {attachments} from './components.js';
import {breadboardPrefix} from './pins.js';

export function resizeObject(project,target,scale){
 validScale(scale);
 const {id,type}=target,surface=type==='surface'&&['board','breadboard'].includes(id),part=type==='part'?project.components.find(p=>p.id===id):null;
 if(!surface&&!part)throw new Error('크기를 바꿀 장치를 선택하세요.');
 const container=surface||part.type==='breadboard',origin=surface?(id==='board'?BOARD:BB):part;
 const previous=surface?scaleOf(project.surfaces?.[id]):scaleOf(part),ratio=scale/previous;
 const owns=anchor=>id==='board'?anchor.startsWith('board:'):id==='breadboard'?anchor.startsWith('bb:')||anchor.startsWith('rail:'):anchor.startsWith(breadboardPrefix(id));
 const children=container?project.components.filter(p=>p!==part&&Object.values(attachments(p)).length&&Object.values(attachments(p)).every(owns)):[];
 // Validate all geometry first so failed resizing never partially edits a circuit.
 const changes=children.map(p=>({p,x:origin.x+(p.x-origin.x)*ratio,y:origin.y+(p.y-origin.y)*ratio,scale:validScale(scaleOf(p)*ratio)}));
 if(changes.some(p=>p.x<0||p.y<0||p.x>6000||p.y>6000))throw new Error('크기를 바꾸면 장착 부품이 작업 공간을 벗어납니다.');
 for(const change of changes)Object.assign(change.p,{x:change.x,y:change.y,scale:change.scale});
 if(surface){project.surfaces??={};project.surfaces[id]={scale};}else part.scale=scale;
 return scale;
}
