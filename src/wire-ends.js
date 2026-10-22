// Jumper wire ends: one wire per hole, pin or part terminal (as on a real breadboard), and moving an existing end.
import {endpoints} from './pins.js';
import {occupiedHoles} from './placement.js';
import {attachments} from './components.js';

/** Why `id` cannot take a new wire end (null when it can). `ignoreWire` is the wire being moved. */
export function endpointBlocked(project,id,{ignoreWire}={}){
  if(project.wires.some(w=>w.id!==ignoreWire&&(w.from===id||w.to===id)))return '이미 배선이 연결된 칸입니다. 한 칸에는 점퍼선 하나만 꽂을 수 있습니다. 빵판의 같은 줄 다른 구멍을 사용하세요.';
  if(occupiedHoles(project.components).has(id))return '이미 부품 다리가 꽂힌 구멍입니다. 빵판의 같은 줄 다른 구멍을 사용하세요.';
  // A lead pushed into a hole fills that hole: wire to another hole of the same row instead.
  const lead=/^part:([^:]+):(.+)$/.exec(id),part=lead&&project.components.find(c=>c.id===lead[1]);
  if(part&&attachments(part)[lead[2]])return '부품 다리가 빵판 구멍에 꽂혀 있습니다. 같은 줄의 다른 구멍에 배선하세요.';
  return null;
}

/** The endpoint nearest to `point` within `radius` (circuit units), or null. */
export function endpointAt(project,point,radius=8){
  let best=null,bestD=radius;
  for(const e of endpoints(project.components,project.surfaces)){if(!e)continue;const d=Math.hypot(e.x-point.x,e.y-point.y);if(d<=bestD){best=e.id;bestD=d;}}
  return best;
}

/** Moves end `end` ('from' | 'to') of wire `wireId` to endpoint `id`. Throws a user-facing message when not allowed. */
export function moveWireEnd(project,wireId,end,id){
  const w=project.wires.find(w=>w.id===wireId);if(!w||!['from','to'].includes(end))throw new Error('배선을 찾을 수 없습니다.');
  if(!id)throw new Error('핀 또는 빵판 구멍 위에 놓으세요.');
  if(w[end]===id)return false;
  if(w[end==='from'?'to':'from']===id)throw new Error('배선의 양 끝을 같은 칸에 연결할 수 없습니다.');
  const blocked=endpointBlocked(project,id,{ignoreWire:w.id});if(blocked)throw new Error(blocked);
  w[end]=id;return true;
}

// A free endpoint on the same net as `id` for a new wire end: `id` itself when free, else another hole of the same
// breadboard strip (a mounted lead's own row, or the row a taken board pin is wired to) or another header pin with the
// same signal. `taken` holds the wire ends already used; null when the net has no free place.
export function freeEquivalent(project,id,taken,avoid){
  const all=endpoints(project.components,project.surfaces).filter(Boolean),byId=new Map(all.map(e=>[e.id,e])),occupied=occupiedHoles(project.components);
  const leadHole=end=>{const m=/^part:([^:]+):(.+)$/.exec(end),part=m&&project.components.find(c=>c.id===m[1]);return part&&attachments(part)[m[2]]||null;};
  const free=end=>end!==avoid&&!taken.has(end)&&!occupied.has(end)&&!leadHole(end);
  if(free(id))return id;
  const here=byId.get(leadHole(id)||id);if(!here)return null;
  let bus=here.bus;
  if(!bus&&here.signal&&here.signal!=='NC'){
    const same=all.find(e=>e.signal===here.signal&&free(e.id));if(same)return same.id;
    const peer=project.wires.find(w=>w.from===id||w.to===id),other=peer&&(peer.from===id?peer.to:peer.from);bus=other&&byId.get(leadHole(other)||other)?.bus;
  }
  if(!bus)return null;
  return all.filter(e=>e.bus===bus&&free(e.id)).sort((a,b)=>Math.hypot(a.x-here.x,a.y-here.y)-Math.hypot(b.x-here.x,b.y-here.y))[0]?.id??null;
}
/** Moves ends of the wires `wireIds` that share a pin/hole or sit on a mounted lead to free places of the same net. */
export function legalizeWireEnds(project,wireIds){
  const ids=new Set(wireIds),taken=new Set(project.wires.filter(w=>!ids.has(w.id)).flatMap(w=>[w.from,w.to]));let moved=0;
  for(const w of project.wires.filter(w=>ids.has(w.id)))for(const end of ['from','to']){
    const place=freeEquivalent(project,w[end],taken,w[end==='from'?'to':'from']);
    if(place&&place!==w[end]){w[end]=place;delete w.points;moved++;}
    taken.add(place??w[end]);
  }
  return moved;
}
