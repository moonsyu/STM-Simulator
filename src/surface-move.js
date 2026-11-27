// Moving and turning the boards of a circuit with what stands on them. What changes is worked out in Rust
// (rust/stm-core/src/edit.rs, feature 62); this file sends what that needs of the project and applies the answer.
// An answer with `error` is applied as far as it goes and then thrown (the order the changes were made in before).
import {BOARD,assignScale} from './geometry.js';
import {partsView} from './components.js';
import {applyResize} from './resize-apply.js';
import {rustExact} from './rust-core.js';

const wiresView=wires=>Array.isArray(wires)?wires.map(w=>w&&typeof w==='object'?{from:w.from,to:w.to,points:w.points}:w):wires;
const view=project=>({components:partsView(project.components),surfaces:project.surfaces,wires:wiresView(project.wires)});
const bends=(project,change)=>{for(const w of change.wires)project.wires[w.index].points=w.points;};
const stop=change=>{if(change.error)throw new Error(change.error);};
/** Turn the main board by `delta` degrees (quarter turns) about its centre. Parts mounted on its headers and the bend
 * points of wires that run between its own pins turn with it; wire ends follow the pins. */
export function rotateBoard(project,delta=90){
 const change=rustExact('rotate_board',view(project),delta,BOARD);
 bends(project,change);stop(change);
 applyResize(project,{type:'surface',id:'board'},change.resize);
 return project;
}
/** Turn a board component (another STM32 board) by `delta` degrees about its centre, with the parts
 * mounted only on its pins and the bend points of wires between its own pins. */
export function rotateDevboard(project,id,delta=90){
 const change=rustExact('rotate_devboard',view(project),id,delta);
 for(const c of change.parts){const p=project.components[c.index];p.x=c.x;p.y=c.y;assignScale(p,c.fields);}
 bends(project,change);stop(change);
 project.components.find(p=>p.id===id&&p.type==='devboard').rotation=change.rotation;
 return project;
}

export function moveSurface(project,id,position){
 const change=rustExact('move_surface',view(project),id,position,BOARD);
 applyResize(project,{type:'surface',id},change.resize);
 bends(project,change);stop(change);
 return project;
}
