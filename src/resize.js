// Resizing what stands in the workspace, with the parts mounted on it. What changes is worked out in Rust
// (rust/stm-core/src/edit.rs, feature 62); this file sends what that needs of the project and applies the answer.
import {BOARD,vector} from './geometry.js';
import {applyResize} from './resize-apply.js';
import {partsView} from './components.js';
import {rustExact} from './rust-core.js';

const view=project=>({components:partsView(project.components),surfaces:project.surfaces});
/** Resizes a part or a surface (`size`: a scale, or {scaleX, scaleY, x, y, rotation}); the parts mounted on a surface
 *  or a breadboard follow through the same transform. Everything is checked before anything is changed. */
export function resizeObject(project,target,size){
 const change=rustExact('resize_object',view(project),target,size,BOARD);
 applyResize(project,target,change);
 return typeof size==='number'?size:change.fields;
}
/** The frame the resize handles of an object are drawn in. */
export function resizeFrame(project,target,bounds){
 const {matrix,translation}=rustExact('resize_frame',view(project),target,BOARD);
 return {bounds,matrix,translation,point:(x,y)=>{const q=vector(matrix,{x,y});return {x:q.x+translation.x,y:q.y+translation.y};}};
}
/** A copy of the project with the object resized by dragging `handle` from `start` to `end`. */
export function resizeFromHandle(project,target,bounds,handle,start,end,lockAspect=false){
 const change=rustExact('resize_from_handle',view(project),target,bounds,handle,start,end,lockAspect,BOARD);
 const next=structuredClone(project);
 applyResize(next,target,change);
 return next;
}
