// Breadboard parts: moving one with what stands on it, taking one out, and placing a new one clear of the others.
// What changes is worked out in Rust (rust/stm-core/src/place.rs, feature 62); this file applies it to the project.
import {rustExact} from './rust-core.js';
import {assignAttachments,partView} from './components.js';

const parts=project=>project.components.map(partView);
// Wire endpoints retain their own board identity when boards move or overlap.
export function moveBreadboard(project,id,position){
 const change=rustExact('move_breadboard',{components:parts(project)},id,position);if(!change)return;
 for(const c of change.parts){const part=project.components[c.index];if(c.attachments)assignAttachments(part,c.attachments);else{part.x=c.x;part.y=c.y;part.rotation=c.rotation;}}
 const board=project.components.find(p=>p.id===id&&p.type==='breadboard');board.x=position.x;board.y=position.y;board.rotation=change.board.rotation;
}
export function removeBreadboard(project,id){
 const change=rustExact('remove_breadboard',{components:parts(project),wires:project.wires.map(w=>({from:w.from,to:w.to}))},id);
 for(const c of change.parts)assignAttachments(project.components[c.index],c.attachments);
 project.wires=project.wires.filter((w,i)=>change.wires[i]);
 project.components=project.components.filter(p=>p.id!==id);
}

export const MAX_BREADBOARDS=8;
// Parts-library entries that create a breadboard component. Both kinds share type 'breadboard'
// (so moving, rotating, resizing, copying and deleting work alike); `variant:'full'` selects the 830-point model.
export const BREADBOARD_LIBRARY={breadboard:'half',breadboard_full:'full'};
export const isBreadboardLibraryType=type=>Object.hasOwn(BREADBOARD_LIBRARY,type);
/** Axis-aligned bounds of a breadboard component in circuit coordinates. */
export const breadboardBounds=part=>rustExact('breadboard_bounds',partView(part));
/** Fields for a new breadboard component of the given library type, placed clear of the existing boards. */
export function newBreadboardFields(project,libraryType='breadboard'){return rustExact('new_breadboard_fields',{components:parts(project),surfaces:project.surfaces},libraryType);}
