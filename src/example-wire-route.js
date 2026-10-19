import {endpointInfo} from './pins.js';
import {terminalKeys} from './components.js';

export function segmentHitsBox(a,b,r){
 if(a.x===b.x)return a.x>r.left&&a.x<r.right&&Math.max(a.y,b.y)>r.top&&Math.min(a.y,b.y)<r.bottom;
 if(a.y===b.y)return a.y>r.top&&a.y<r.bottom&&Math.max(a.x,b.x)>r.left&&Math.min(a.x,b.x)<r.right;
 let low=0,high=1;for(const [start,end,min,max]of [[a.x,b.x,r.left,r.right],[a.y,b.y,r.top,r.bottom]]){const delta=end-start;if(Math.abs(delta)<1e-10){if(start<=min||start>=max)return false;continue;}const t1=(min-start)/delta,t2=(max-start)/delta;low=Math.max(low,Math.min(t1,t2));high=Math.min(high,Math.max(t1,t2));if(low>=high)return false;}return low<high;
}
export function exampleWireObstacles(project,wire,bodies){
 const a=endpointInfo(wire.from,project.components,project.surfaces),b=endpointInfo(wire.to,project.components,project.surfaces);
 const boxes=bodies.map(r=>({left:r.left-6,right:r.right+6,top:r.top-6,bottom:r.bottom+6}));
 for(const p of project.components)for(const key of terminalKeys(p)){
  const q=endpointInfo(`part:${p.id}:${key}`,project.components,project.surfaces);if(!q||Math.hypot(q.x-a.x,q.y-a.y)<.01||Math.hypot(q.x-b.x,q.y-b.y)<.01)continue;
  boxes.push({left:q.x-4,right:q.x+4,top:q.y-4,bottom:q.y+4});
 }
 return boxes;
}
export function routeExampleWire(project,wire,bodies){
 const a=endpointInfo(wire.from,project.components,project.surfaces),b=endpointInfo(wire.to,project.components,project.surfaces),boxes=exampleWireObstacles(project,wire,bodies);
 const clear=(p,q)=>!boxes.some(r=>segmentHitsBox(p,q,r)),routes=[];
 const add=points=>{if(points.every((p,i)=>!i||clear(points[i-1],p)))routes.push(points);};
 add([a,{x:a.x,y:b.y},b]);add([a,{x:b.x,y:a.y},b]);
 for(const x of [a.x+(b.x-a.x)*.47,...boxes.flatMap(r=>[r.left-2,r.right+2])])add([a,{x,y:a.y},{x,y:b.y},b]);
 for(const y of boxes.flatMap(r=>[r.top-2,r.bottom+2]))add([a,{x:a.x,y},{x:b.x,y},b]);
 const length=ps=>ps.slice(1).reduce((n,p,i)=>n+Math.abs(p.x-ps[i].x)+Math.abs(p.y-ps[i].y),0)+ps.length*5;
 routes.sort((x,y)=>length(x)-length(y));
 if(routes.length)return routes[0].slice(1,-1);
 // Visibility-grid fallback for a crowded board. Edges lie outside package
 // bounds, so an automatically generated wire never disappears under a part.
 const xs=[...new Set([a.x,b.x,...boxes.flatMap(r=>[r.left-2,r.right+2])])].sort((x,y)=>x-y),ys=[...new Set([a.y,b.y,...boxes.flatMap(r=>[r.top-2,r.bottom+2])])].sort((x,y)=>x-y);
 const key=(x,y)=>y*xs.length+x,start=key(xs.indexOf(a.x),ys.indexOf(a.y)),end=key(xs.indexOf(b.x),ys.indexOf(b.y)),dist=new Map([[start,0]]),prev=new Map(),queue=[start],done=new Set();
 while(queue.length){queue.sort((x,y)=>dist.get(y)-dist.get(x));const id=queue.pop();if(done.has(id))continue;done.add(id);if(id===end)break;
  const x=id%xs.length,y=Math.floor(id/xs.length),p={x:xs[x],y:ys[y]};
  for(const [xx,yy]of [[x-1,y],[x+1,y],[x,y-1],[x,y+1]]){if(xx<0||xx>=xs.length||yy<0||yy>=ys.length)continue;const n=key(xx,yy),q={x:xs[xx],y:ys[yy]};if(done.has(n)||!clear(p,q))continue;const cost=dist.get(id)+Math.abs(p.x-q.x)+Math.abs(p.y-q.y);if(cost<(dist.get(n)??Infinity)){dist.set(n,cost);prev.set(n,id);queue.push(n);}}
 }
 if(!dist.has(end))throw new Error('부품을 가리지 않는 예제 배선 경로를 찾지 못했습니다.');
 const path=[];for(let id=end;id!==undefined;id=prev.get(id))path.unshift({x:xs[id%xs.length],y:ys[Math.floor(id/xs.length)]});
 const simple=path.filter((p,i)=>!i||i===path.length-1||(p.x!==path[i-1].x||p.x!==path[i+1].x)&&(p.y!==path[i-1].y||p.y!==path[i+1].y));
 if(simple.length>34)throw new Error('예제 배선 경로가 너무 복잡합니다. 빵판 주변에 여유 공간을 확보해 주세요.');
 return simple.slice(1,-1);
}
