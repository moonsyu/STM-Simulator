import {resizeObject} from './resize.js';
import {surfaceOrigin,surfaceCentre,BOARD,matrixOf,matrixFields,vector,inverse,multiply,assignScale} from './geometry.js';
import {attachments} from './components.js';

const quarter=value=>((Math.round(value/90)*90)%360+360)%360;
const mountedOn=(project,owns)=>new Set(project.components.filter(p=>{const anchors=Object.values(attachments(p));return anchors.length&&anchors.every(owns);}).map(p=>p.id));
/** Turn the main board by `delta` degrees (quarter turns) about its centre. Parts mounted on its headers and the bend
 * points of wires that run between its own pins turn with it; wire ends follow the pins. */
export function rotateBoard(project,delta=90){
 if(project.surfaces?.board?.hidden)throw new Error('주 보드가 회로에 없습니다.');
 const surface=project.surfaces?.board??{},origin=surfaceOrigin('board',project.surfaces),centre=surfaceCentre('board',project.surfaces);
 const rotation=quarter((surface.rotation??0)+delta),before=matrixOf(surface),after=matrixOf({...surface,rotation});
 const half=vector(after,{x:BOARD.w/2,y:BOARD.h/2}),destination={x:centre.x-half.x,y:centre.y-half.y},turn=multiply(after,inverse(before));
 const owns=anchor=>anchor.startsWith('board:'),mounted=mountedOn(project,owns),attached=anchor=>owns(anchor)||anchor.startsWith('part:')&&mounted.has(anchor.split(':')[1]);
 for(const wire of project.wires)if(wire.points&&attached(wire.from)&&attached(wire.to))wire.points=wire.points.map(p=>{const q=vector(turn,{x:p.x-origin.x,y:p.y-origin.y});return {x:destination.x+q.x,y:destination.y+q.y};});
 resizeObject(project,{type:'surface',id:'board'},{...destination,rotation});
 return project;
}
/** Turn a board component (ESP32, Raspberry Pi, another STM32 board) by `delta` degrees about its centre, with the parts
 * mounted only on its pins and the bend points of wires between its own pins. */
export function rotateDevboard(project,id,delta=90){
 const part=project.components.find(p=>p.id===id&&p.type==='devboard');if(!part)throw new Error('회전할 보드를 확인하세요.');
 const rotation=quarter(part.rotation+delta),turn=multiply(matrixOf({rotation}),inverse(matrixOf({rotation:quarter(part.rotation)})));
 const prefix=`devboard:${id}:`,owns=anchor=>anchor.startsWith(prefix),mounted=mountedOn(project,owns),attached=anchor=>owns(anchor)||anchor.startsWith('part:')&&mounted.has(anchor.split(':')[1]);
 const about=p=>{const q=vector(turn,{x:p.x-part.x,y:p.y-part.y});return {x:part.x+q.x,y:part.y+q.y};};
 for(const p of project.components)if(mounted.has(p.id)){const fields=matrixFields(multiply(turn,matrixOf(p)));Object.assign(p,about(p));assignScale(p,fields);}
 for(const wire of project.wires)if(wire.points&&attached(wire.from)&&attached(wire.to))wire.points=wire.points.map(about);
 part.rotation=rotation;
 return project;
}

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
