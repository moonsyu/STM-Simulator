// Orthogonal wire router for generated example circuits.
// Wires run on a lattice aligned to the breadboard pitch (half-pitch lanes) plus the
// exact endpoint coordinates. A wire never runs collinearly on another wire, never
// turns or ends on another wire, never passes over a part body, a lead, a header pin
// or a socket occupied by another wire. Crossing another wire is allowed only at a
// right angle and costs as much as a long detour, so nested routes are preferred.
import {endpointInfo,PINS} from './pins.js';
import {terminalKeys} from './components.js';

const LANE=7,CLEAR=3.6,CROSS=450,BEND=5;
const DIRS=[[1,0],[-1,0],[0,1],[0,-1]];

class Heap{
 constructor(){this.items=[];}
 get size(){return this.items.length;}
 push(item){const a=this.items;a.push(item);let i=a.length-1;while(i){const p=(i-1)>>1;if(a[p][0]<=a[i][0])break;[a[p],a[i]]=[a[i],a[p]];i=p;}}
 pop(){const a=this.items,top=a[0],last=a.pop();if(a.length){a[0]=last;let i=0;for(;;){const l=2*i+1,r=l+1;let m=i;if(l<a.length&&a[l][0]<a[m][0])m=l;if(r<a.length&&a[r][0]<a[m][0])m=r;if(m===i)break;[a[m],a[i]]=[a[i],a[m]];i=m;}}return top;}
}
const round=v=>Math.round(v*100)/100;
function lines(values,origin,min,max){
 const fixed=[...new Set(values.map(round))].sort((a,b)=>a-b),out=[...fixed];
 const start=origin+Math.ceil((min-origin)/LANE)*LANE;
 for(let v=start;v<=max;v+=LANE){const r=round(v);if(fixed.every(f=>Math.abs(f-r)>=3))out.push(r);}
 return [...new Set(out)].sort((a,b)=>a-b);
}
const segmentDistance=(p,a,b)=>{const dx=b.x-a.x,dy=b.y-a.y,l=dx*dx+dy*dy,t=l?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/l)):0;return Math.hypot(a.x+t*dx-p.x,a.y+t*dy-p.y);};
const lowerBound=(arr,v)=>{let lo=0,hi=arr.length;while(lo<hi){const m=(lo+hi)>>1;if(arr[m]<v)lo=m+1;else hi=m;}return lo;};

/**
 * Routes `wires` (objects with from/to) of `project` and returns {points:Map(id→bends), crossings}.
 * `bodies` are part body boxes; existing wires not in `wires` are treated as fixed obstacles.
 */
export function routeWires(project,wires,{bodies=[],origin={x:0,y:0},passes=2}={}){
 const info=id=>endpointInfo(id,project.components,project.surfaces);
 const ends=wires.map(w=>[info(w.from),info(w.to)]);
 if(ends.some(([a,b])=>!a||!b))throw new Error('배선 끝점을 찾지 못했습니다.');
 const fixedWires=project.wires.filter(w=>!wires.includes(w));
 const pins=project.surfaces?.board?.hidden?[]:PINS.map(p=>info(p.id)).filter(Boolean);
 const leads=project.components.flatMap(p=>terminalKeys(p).map(k=>info(`part:${p.id}:${k}`))).filter(Boolean);
 const fixedEnds=fixedWires.flatMap(w=>[info(w.from),info(w.to)]).filter(Boolean);
 const pts=[...ends.flat(),...fixedEnds];
 const boxes=bodies.map(b=>({left:b.left-3,right:b.right+3,top:b.top-3,bottom:b.bottom+3}));
 const all=[...pts,...boxes.flatMap(b=>[{x:b.left,y:b.top},{x:b.right,y:b.bottom}])];
 const minX=Math.min(...all.map(p=>p.x))-70,maxX=Math.max(...all.map(p=>p.x))+70,minY=Math.min(...all.map(p=>p.y))-70,maxY=Math.max(...all.map(p=>p.y))+70;
 const xs=lines(pts.map(p=>p.x),origin.x,minX,maxX),ys=lines(pts.map(p=>p.y),origin.y,minY,maxY),nx=xs.length,ny=ys.length,N=nx*ny;
 const node=(i,j)=>j*nx+i,X=n=>xs[n%nx],Y=n=>ys[Math.floor(n/nx)];
 const nodeOf=p=>{const i=xs.indexOf(round(p.x)),j=ys.indexOf(round(p.y));return i<0||j<0?-1:node(i,j);};
 // Static obstacles: bodies, and the neighbourhood of every pin, lead and fixed wire end.
 const blocked=new Uint8Array(N),edgeBlocked=[new Uint8Array(N),new Uint8Array(N)];// [0]: edge n→n+1 (x), [1]: n→n+nx (y)
 for(const b of boxes){const i0=lowerBound(xs,b.left),i1=lowerBound(xs,b.right),j0=lowerBound(ys,b.top),j1=lowerBound(ys,b.bottom);for(let j=j0;j<j1;j++)for(let i=i0;i<i1;i++)if(xs[i]>b.left&&ys[j]>b.top)blocked[node(i,j)]=1;}
 const foreign=[...pins,...leads,...fixedEnds,...ends.flat()];
 const markPoint=(p,flag)=>{
  const i0=Math.max(0,lowerBound(xs,p.x-12)-1),i1=Math.min(nx-1,lowerBound(xs,p.x+12)),j0=Math.max(0,lowerBound(ys,p.y-12)-1),j1=Math.min(ny-1,lowerBound(ys,p.y+12));
  for(let j=j0;j<=j1;j++)for(let i=i0;i<=i1;i++){
   const n=node(i,j),q={x:xs[i],y:ys[j]};
   if(Math.hypot(q.x-p.x,q.y-p.y)<CLEAR+1)flag.nodes.push(n);
   if(i<nx-1&&segmentDistance(p,q,{x:xs[i+1],y:ys[j]})<CLEAR)flag.edges.push([0,n]);
   if(j<ny-1&&segmentDistance(p,q,{x:xs[i],y:ys[j+1]})<CLEAR)flag.edges.push([1,n]);
  }
 };
 // Each foreign point blocks its surroundings except for wires that end exactly there.
 const pointKey=p=>round(p.x)+','+round(p.y),zones=new Map();
 for(const p of foreign){const key=pointKey(p);if(zones.has(key))continue;const flag={nodes:[],edges:[]};markPoint(p,flag);zones.set(key,flag);}
 for(const [,flag]of zones){for(const n of flag.nodes)blocked[n]=1;for(const [a,n]of flag.edges)edgeBlocked[a][n]=1;}
 // Dynamic occupancy from routed wires.
 const occ=[new Int32Array(N),new Int32Array(N)],hard=new Int32Array(N),used=[new Int32Array(N),new Int32Array(N)];
 const terminals=ends.map(([a,b])=>[nodeOf(a),nodeOf(b)]);
 if(terminals.some(([a,b])=>a<0||b<0))throw new Error('배선 격자를 만들지 못했습니다.');
 // Wire ends are sockets: other wires may not touch them; their surroundings follow the own-zone exception.
 const zoneOf=n=>zones.get(X(n)+','+Y(n));
 const reserve=(k,sign)=>{for(const n of terminals[k]){hard[n]+=sign*(k+1);}};
 terminals.forEach((_,k)=>reserve(k,1));
 const routes=new Array(wires.length).fill(null);
 function search(k){
  const [s,t]=terminals[k],tx=X(t),ty=Y(t);
  // Allow this wire through the protected zone around its own endpoints.
  const ownZones=[zoneOf(s),zoneOf(t)].filter(Boolean),freed=[];
  for(const z of ownZones){for(const n of z.nodes)if(blocked[n]===1){blocked[n]=2;freed.push(n);}}
  const ownEdges=new Set(ownZones.flatMap(z=>z.edges.map(([a,n])=>a+':'+n)));
  const best=new Float64Array(N*5).fill(Infinity),prev=new Int32Array(N*5).fill(-1),heap=new Heap();
  const h=n=>Math.abs(X(n)-tx)+Math.abs(Y(n)-ty);
  best[s*5+4]=0;heap.push([h(s),s*5+4,0]);let goal=-1;
  while(heap.size){
   const [,state,g]=heap.pop();if(g>best[state])continue;
   const n=(state/5)|0,din=state%5;if(n===t){goal=state;break;}
   const i=n%nx,j=(n/nx)|0;
   for(let d=0;d<4;d++){
    if(din<4&&(d^1)===din)continue;
    let cost=0;
    if(n!==s){
     const axisOcc=occ[d<2?0:1][n],crossOcc=occ[d<2?1:0][n];
     if(din!==d){if(axisOcc||crossOcc||hard[n])continue;cost+=BEND;}
     else{if(hard[n]||axisOcc)continue;if(crossOcc)cost+=CROSS;}
    }
    const ii=i+DIRS[d][0],jj=j+DIRS[d][1];if(ii<0||jj<0||ii>=nx||jj>=ny)continue;
    const m=node(ii,jj),axis=d<2?0:1,edge=d===0?n:d===1?m:d===2?n:m;
    if(used[axis][edge])continue;
    if(edgeBlocked[axis][edge]&&!ownEdges.has(axis+':'+edge))continue;
    if(m!==t&&(blocked[m]===1||hard[m]))continue;
    const ng=g+cost+Math.abs(xs[ii]-xs[i])+Math.abs(ys[jj]-ys[j]),ms=m*5+d;
    if(ng<best[ms]){best[ms]=ng;prev[ms]=state;heap.push([ng+h(m),ms,ng]);}
   }
  }
  for(const n of freed)blocked[n]=1;
  if(goal<0)return null;
  const path=[];for(let st=goal;st>=0;st=prev[st])path.unshift((st/5)|0);
  return path;
 }
 const crossingsOf=path=>{let c=0;for(let q=1;q<path.length-1;q++){const a=path[q-1],n=path[q],b=path[q+1],horizontal=Y(a)===Y(n);if((Y(a)===Y(b))||(X(a)===X(b))){if(occ[horizontal?1:0][n])c++;}}return c;};
 function mark(k,path,sign){
  for(let q=0;q<path.length;q++){
   const n=path[q];if(q===0||q===path.length-1)continue;
   const a=path[q-1],b=path[q+1],straightH=Y(a)===Y(n)&&Y(b)===Y(n),straightV=X(a)===X(n)&&X(b)===X(n);
   if(straightH)occ[0][n]+=sign*(k+1);else if(straightV)occ[1][n]+=sign*(k+1);else hard[n]+=sign*(k+1);
  }
  for(let q=1;q<path.length;q++){const a=path[q-1],b=path[q];if(Y(a)===Y(b))used[0][Math.min(a,b)]+=sign;else used[1][Math.min(a,b)]+=sign;}
 }
 const dist=k=>Math.abs(ends[k][0].x-ends[k][1].x)+Math.abs(ends[k][0].y-ends[k][1].y),top=k=>Math.min(ends[k][0].y,ends[k][1].y);
 const base=wires.map((w,k)=>k);
 const orders=[base.slice().sort((a,b)=>dist(a)-dist(b)),base.slice().sort((a,b)=>top(a)-top(b)),base.slice().sort((a,b)=>dist(b)-dist(a))];
 function runOrder(order){
  occ[0].fill(0);occ[1].fill(0);used[0].fill(0);used[1].fill(0);hard.fill(0);terminals.forEach((_,k)=>reserve(k,1));routes.fill(null);
  // A wire that finds no path is moved to the front and the whole set is routed again.
  for(let attempt=0;;attempt++){
   let failed=-1;
   for(const k of order){const path=search(k);if(!path){failed=k;break;}routes[k]=path;mark(k,path,1);}
   if(failed<0)break;
   for(const k of order)if(routes[k]){mark(k,routes[k],-1);routes[k]=null;}
   if(attempt>=Math.min(8,wires.length))return {failed};
   order.splice(order.indexOf(failed),1);order.unshift(failed);
  }
  // Rip up wires that cross others and route them again against the rest.
  for(let pass=0;pass<passes;pass++){
   let improved=false;
   for(const k of order){
    const others=routes.map((p,q)=>q!==k&&p?countCross(p,routes[k]):0).reduce((a,b)=>a+b,0);
    if(!others)continue;
    mark(k,routes[k],-1);const path=search(k);
    const before=lengthOf(routes[k])+others*CROSS,after=path?lengthOf(path)+crossingsOf(path)*CROSS:Infinity;
    if(path&&after<before-1){routes[k]=path;improved=true;}
    mark(k,routes[k],1);
   }
   if(!improved)break;
  }
  let crossings=0;for(let a=0;a<routes.length;a++)for(let b=a+1;b<routes.length;b++)crossings+=countCross(routes[a],routes[b]);
  return {routes:routes.slice(),crossings,score:crossings*CROSS+routes.reduce((n,p)=>n+lengthOf(p),0)};
 }
 let best=null,failure=null;
 for(const order of orders){const r=runOrder(order);if(r.failed!==undefined){failure=r.failed;continue;}if(!best||r.score<best.score)best=r;if(!r.crossings)break;}
 if(!best){const e=new Error('부품을 가리지 않는 배선 경로를 찾지 못했습니다.');e.wire=wires[failure];throw e;}
 routes.splice(0,routes.length,...best.routes);
 function lengthOf(path){let l=0;for(let q=1;q<path.length;q++)l+=Math.abs(X(path[q])-X(path[q-1]))+Math.abs(Y(path[q])-Y(path[q-1]));return l;}
 function countCross(a,b){const set=new Set(b.slice(1,-1));let c=0;for(let q=1;q<a.length-1;q++)if(set.has(a[q]))c++;return c;}
 const points=new Map(),total=best.crossings;
 routes.forEach((path,k)=>{
  const bends=[];for(let q=1;q<path.length-1;q++){const a=path[q-1],n=path[q],b=path[q+1];if(!((Y(a)===Y(n)&&Y(n)===Y(b))||(X(a)===X(n)&&X(n)===X(b))))bends.push({x:X(n),y:Y(n)});}
  points.set(wires[k].id,bends);
 });
 return {points,crossings:total};
}
