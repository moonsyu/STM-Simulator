import {resizeObject} from './resize.js';
import {surfaceOrigin} from './geometry.js';
import {attachments} from './components.js';

export function moveSurface(project,id,position){
 if(!['board','breadboard'].includes(id))throw new Error('이동할 보드를 확인하세요.');
 const origin=surfaceOrigin(id,project.surfaces),dx=position.x-origin.x,dy=position.y-origin.y;
 const owns=id==='board'?anchor=>anchor.startsWith('board:'):anchor=>anchor.startsWith('bb:')||anchor.startsWith('rail:');
 const mounted=new Set(project.components.filter(p=>{const anchors=Object.values(attachments(p));return anchors.length&&anchors.every(owns);}).map(p=>p.id));
 const attached=anchor=>owns(anchor)||anchor.startsWith('part:')&&mounted.has(anchor.split(':')[1]);
 resizeObject(project,{type:'surface',id},position);
 for(const wire of project.wires)if(wire.points&&attached(wire.from)&&attached(wire.to))wire.points=wire.points.map(p=>({x:p.x+dx,y:p.y+dy}));
 return project;
}
