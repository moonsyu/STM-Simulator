// What a resize answered by the Rust side (rust/stm-core/src/edit.rs) changes, put on the project's own objects.
import {assignScale} from './geometry.js';

// The answer on the project's own objects: the mounted parts first, then the object itself. A surface keeps its other
// fields (the main board's name, ST-LINK serial and turn).
export function applyResize(project,target,change){
 for(const c of change.children){const p=project.components[c.index];assignScale(p,c.fields);p.x=c.x;p.y=c.y;}
 if(target.type==='surface'){
  project.surfaces??={};const next={...project.surfaces[target.id]};assignScale(next,change.fields);
  if('rotation' in change)next.rotation=change.rotation;if(!next.rotation)delete next.rotation;
  project.surfaces[target.id]={...next,x:change.x,y:change.y};
 }else{const object=project.components.find(p=>p.id===target.id);assignScale(object,change.fields);object.x=change.x;object.y=change.y;}
}
