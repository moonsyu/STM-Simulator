// Putting a part's leads into free breadboard holes. The search is in Rust (rust/stm-core/src/place.rs, feature 62);
// this file sends what it needs of the circuit and applies the answer to the part.
import {rustExact} from './rust-core.js';
import {assignAttachments,partView} from './components.js';

const ends=wires=>wires.map(w=>({from:w.from,to:w.to}));
export function occupiedHoles(components,exceptId){return new Set(rustExact('occupied_holes',components.map(partView),exceptId));}
/** Holes holding a jumper wire end: a part lead cannot go into the same hole. */
export function wiredHoles(wires=[]){return new Set(wires.flatMap(w=>[w.from,w.to]));}
// Find one complete, collision-free footprint. Never connect only some new legs.
// Small lead bends are allowed; all electrical and visible contact points use exact holes.
export function findMount(p,components=[],radius=15,surfaces,wires=[]){return rustExact('find_mount',partView(p),components.map(partView),radius,surfaces,ends(wires));}
export function applyMount(p,mount){if(!mount)return false;p.x=mount.x;p.y=mount.y;assignAttachments(p,mount.attachments);return true;}
