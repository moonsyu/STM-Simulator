// Jumper wire ends: one wire per hole, pin or part terminal (as on a real breadboard), and moving an existing end.
import {endpoints} from './pins.js';
import {occupiedHoles} from './placement.js';

/** Why `id` cannot take a new wire end (null when it can). `ignoreWire` is the wire being moved. */
export function endpointBlocked(project,id,{ignoreWire}={}){
  if(project.wires.some(w=>w.id!==ignoreWire&&(w.from===id||w.to===id)))return '이미 배선이 연결된 칸입니다. 한 칸에는 점퍼선 하나만 꽂을 수 있습니다. 빵판의 같은 줄 다른 구멍을 사용하세요.';
  if(occupiedHoles(project.components).has(id))return '이미 부품 다리가 꽂힌 구멍입니다. 빵판의 같은 줄 다른 구멍을 사용하세요.';
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
