import {HOLES,HOLE_BY_ID} from './pins.js';
import {attachments,nominalTerminals,assignAttachments} from './components.js';

export function occupiedHoles(components,exceptId){const used=new Set();for(const p of components)if(p.id!==exceptId)for(const id of Object.values(attachments(p)))if(HOLE_BY_ID.has(id))used.add(id);return used;}
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
// Find one complete, collision-free footprint. Never connect only some new legs.
// Small lead bends are allowed; all electrical and visible contact points use exact holes.
export function findMount(p,components=[],radius=15){
 const terms=nominalTerminals(p),occupied=occupiedHoles(components,p.id),available=HOLES.filter(h=>!occupied.has(h.id));
 const candidates=available.map(h=>({h,d:distance(h,terms[0])})).filter(x=>x.d<=radius).sort((a,b)=>a.d-b.d).slice(0,8);
 let best=null;
 for(const {h}of candidates){
   const dx=h.x-terms[0].x,dy=h.y-terms[0].y,used=new Set(),map={},points=[];let error=0,valid=true;
   for(const t of terms){const target={x:t.x+dx,y:t.y+dy};let near=null,min=8.1;
     for(const hole of available){if(used.has(hole.id))continue;const d=distance(hole,target);if(d<min){near=hole;min=d;}}
     if(!near){valid=false;break;}used.add(near.id);map[t.key]=near.id;points.push({...near,key:t.key});error+=min*min;
   }
   const score=dx*dx+dy*dy+error*4;
   if(valid&&(!best||score<best.score))best={x:p.x+dx,y:p.y+dy,attachments:map,points,score};
 }
 return best;
}
export function applyMount(p,mount){if(!mount)return false;p.x=mount.x;p.y=mount.y;assignAttachments(p,mount.attachments);return true;}
