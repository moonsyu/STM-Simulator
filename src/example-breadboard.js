import {attachments,assignAttachments,nominalTerminals,terminalKeys} from './components.js';
import {PINS,BOARD,BB,circuitHoles,holeInfo,endpointInfo,breadboardHoles,boardPin} from './pins.js';
import {partVector,surfacePoint} from './geometry.js';
import {displayModel} from './model-geometry.js';
import {wiringTopology} from './circuit-topology.js';
import {routeExampleWire,exampleWireObstacles,segmentHitsBox} from './example-wire-route.js';

const terminal=(p,key)=>`part:${p.id}:${key}`;
const bounds=points=>({left:Math.min(...points.map(p=>p.x)),right:Math.max(...points.map(p=>p.x)),top:Math.min(...points.map(p=>p.y)),bottom:Math.max(...points.map(p=>p.y))});
const corners=b=>[{x:b.left,y:b.top},{x:b.right,y:b.top},{x:b.left,y:b.bottom},{x:b.right,y:b.bottom}];
export const containsPoint=(b,p,margin=0)=>p.x>b.left-margin&&p.x<b.right+margin&&p.y>b.top-margin&&p.y<b.bottom+margin;
export const overlapBounds=(a,b,margin=0)=>a.left<b.right+margin&&a.right>b.left-margin&&a.top<b.bottom+margin&&a.bottom>b.top-margin;
export function exampleBodyBounds(p){
 const b=displayModel(p)?.bounds||{left:-30,right:30,top:-25,bottom:25};
 return bounds(corners(b).map(q=>{const v=partVector(p,q.x,q.y);return {x:p.x+v.x,y:p.y+v.y};}));
}
export function exampleBreadboards(project){
 const boards=[];
 if(!project.surfaces?.breadboard?.hidden)boards.push({id:'surface',bounds:bounds(corners({left:BB.x,right:BB.x+BB.w,top:BB.y,bottom:BB.y+BB.h}).map(q=>surfacePoint(q,'breadboard',project.surfaces))),holes:circuitHoles([],project.surfaces)});
 for(const p of project.components.filter(p=>p.type==='breadboard'))boards.push({id:p.id,bounds:bounds(corners({left:-BB.w/2,right:BB.w/2,top:-BB.h/2,bottom:BB.h/2}).map(q=>{const v=partVector(p,q.x,q.y);return {x:p.x+v.x,y:p.y+v.y};})),holes:breadboardHoles(p)});
 return boards;
}
const inside=(outer,inner)=>inner.left>=outer.left+10&&inner.right<=outer.right-10&&inner.top>=outer.top+10&&inner.bottom<=outer.bottom-10;
const mcuBounds=project=>bounds(corners({left:BOARD.x,right:BOARD.x+BOARD.w,top:BOARD.y,bottom:BOARD.y+BOARD.h}).map(q=>surfacePoint(q,'board',project.surfaces)));
function nextId(project,prefix){const ids=new Set([...project.components,...project.wires].map(p=>p.id));let n=1;while(ids.has(prefix+n))n++;return prefix+n;}
function addBreadboard(project,scale=1){
 const boards=exampleBreadboards(project),boxes=[...boards.map(b=>b.bounds),...project.components.filter(p=>p.type!=='breadboard').map(exampleBodyBounds)];
 const right=Math.max(560,mcuBounds(project).right,...boxes.map(b=>b.right));
 if(!boards.length&&project.surfaces?.breadboard?.hidden){project.surfaces.breadboard={hidden:false,x:Math.max(BB.x,mcuBounds(project).right+72),y:BB.y,scale};return exampleBreadboards(project)[0];}
 if(project.components.filter(p=>p.type==='breadboard').length>=8)throw new Error('예제 부품을 놓을 빵판 공간이 부족합니다. 사용하지 않는 부품이나 빵판을 정리해 주세요.');
 const p={id:nextId(project,'exampleBB'),type:'breadboard',name:'BB'+(boards.length+1),x:right+72+BB.w*scale/2,y:68+BB.h*scale/2,rotation:0,scale};project.components.push(p);return exampleBreadboards(project).at(-1);
}
// Mount on distinct five-hole strips. A hole occupied by a leg is never also
// used by a jumper, and every strip keeps an exposed hole for its jumpers.
function mountCandidate(p,board,state,maxBend){
 const original={...p},orientations=[p.rotation,90,0,270,180].filter((v,i,a)=>a.indexOf(v)===i),holes=board.holes.filter(h=>h.id.includes('bb:'));
 let best=null;
 for(const rotation of orientations){
  const proto={...p,x:0,y:0,rotation},terms=nominalTerminals(proto),first=terms[0];
  for(const anchor of holes.filter(h=>/bb:[befi]:/.test(h.id))){
   const candidate={...proto,x:anchor.x-first.x,y:anchor.y-first.y},box=exampleBodyBounds(candidate);
   if(!inside(board.bounds,box)||state.boxes.some(b=>overlapBounds(box,b,16))||state.contacts.some(c=>containsPoint(box,c,8)))continue;
   const available=holes.filter(h=>!state.used.has(h.id)&&!containsPoint(box,h,8)&&!state.boxes.some(b=>containsPoint(b,h,8)));
   const used=new Set(),busLabels=new Map(state.busLabels),map={};let cost=0,valid=true;
   for(const t of nominalTerminals(candidate)){
    const label=state.net.find(terminal(p,t.key));
    const choices=available.filter(h=>!used.has(h.id)&&(!busLabels.has(h.bus)||busLabels.get(h.bus)===label)&&Math.hypot(h.x-t.x,h.y-t.y)<=maxBend).sort((a,b)=>Math.hypot(a.x-t.x,a.y-t.y)-Math.hypot(b.x-t.x,b.y-t.y));
    const h=choices.find(h=>available.some(spare=>spare.bus===h.bus&&spare.id!==h.id&&!used.has(spare.id)));
    if(!h){valid=false;break;}used.add(h.id);busLabels.set(h.bus,label);map[t.key]=h.id;cost+=(h.x-t.x)**2+(h.y-t.y)**2;
   }
   if(valid)for(const bus of new Set(Object.values(map).map(id=>available.find(h=>h.id===id).bus)))if(!available.some(h=>h.bus===bus&&!used.has(h.id)))valid=false;
   if(!valid)continue;
   // Keep exact mounts ahead of bent leads, then fill from top to bottom.
   cost+=Math.abs(candidate.y-board.bounds.top)*.1+Math.abs(candidate.x-(board.bounds.left+board.bounds.right)/2)*.1+(rotation===original.rotation?0:2);
   if(!best||cost<best.cost)best={part:candidate,map,box,cost};
  }
 }
 return best;
}

export function arrangeExampleOnBreadboards(project,{partIds,preferredBoard,report}={}){
 const selected=new Set(partIds||project.components.filter(p=>p.type!=='breadboard').map(p=>p.id)),parts=project.components.filter(p=>selected.has(p.id)&&p.type!=='breadboard');
 if(!exampleBreadboards(project).length)addBreadboard(project);
 const net=wiringTopology(project),roots=new Set(parts.flatMap(p=>terminalKeys(p).map(k=>net.find(terminal(p,k))))),groups=new Map();
 const ends=[...PINS.filter(p=>p.signal!=='NC').map(p=>p.id),...project.components.flatMap(p=>terminalKeys(p).map(k=>terminal(p,k))),...project.wires.flatMap(w=>[w.from,w.to])];
 for(const id of new Set(ends)){const root=net.find(id);if(roots.has(root)){if(!groups.has(root))groups.set(root,[]);groups.get(root).push(id);}}
 const fixed=project.components.filter(p=>p.type!=='breadboard'&&!selected.has(p.id)),state={net,boxes:[...fixed.map(exampleBodyBounds),...(!project.surfaces?.board?.hidden?[mcuBounds(project)]:[])],contacts:[],used:new Set(),busLabels:new Map()};
 const remember=(id,label)=>{const h=holeInfo(id,project.components,project.surfaces);if(h){state.used.add(id);state.busLabels.set(h.bus,label);state.contacts.push(h);}};
 for(const p of fixed)for(const key of terminalKeys(p)){const id=terminal(p,key),h=attachments(p)[key];if(h)remember(h,net.find(id));else state.contacts.push(endpointInfo(id,project.components,project.surfaces));}
 for(const w of project.wires)for(const id of [w.from,w.to])remember(id,net.find(id));
 for(const p of parts){
  const map=attachments(p),box=exampleBodyBounds(p),board=exampleBreadboards(project).find(b=>inside(b.bounds,box)&&Object.values(map).every(id=>b.holes.some(h=>h.id===id)));
  const points=terminalKeys(p).map(k=>map[k]&&holeInfo(map[k],project.components,project.surfaces));
  const occupied=new Set();let valid=!!board&&points.every(Boolean)&&!state.boxes.some(b=>overlapBounds(box,b,16))&&!state.contacts.some(c=>containsPoint(box,c,8));
  for(let i=0;valid&&i<points.length;i++){const h=points[i],root=net.find(terminal(p,terminalKeys(p)[i]));if(state.used.has(h.id)||occupied.has(h.id)||containsPoint(box,h,8)||state.boxes.some(b=>containsPoint(b,h,8))||state.busLabels.has(h.bus)&&state.busLabels.get(h.bus)!==root)valid=false;occupied.add(h.id);}
  if(valid)for(const h of points)if(!board.holes.some(q=>q.bus===h.bus&&!occupied.has(q.id)&&!fixed.some(part=>Object.values(attachments(part)).includes(q.id))&&!containsPoint(box,q,8)&&!state.boxes.some(b=>containsPoint(b,q,8))))valid=false;
  if(!valid){
   assignAttachments(p,{});
   const boards=exampleBreadboards(project).sort((a,b)=>Number(b.id===preferredBoard)-Number(a.id===preferredBoard));let mount=null;
   for(const b of boards){mount=mountCandidate(p,b,state,22);if(mount)break;}
   if(!mount)for(const b of boards){mount=mountCandidate(p,b,state,70);if(mount)break;}
   const size=exampleBodyBounds(p),fit=Math.max(1,(size.right-size.left+60)/BB.w,(size.bottom-size.top+100)/BB.h);
   for(const factor of [1,1.5,2,3]){if(mount)break;const scale=Math.min(1000,fit*factor),b=addBreadboard(project,scale);mount=mountCandidate(p,b,state,Math.max(70,140*scale));if(!mount)project.components=project.components.filter(p=>p.id!==b.id);}
   if(!mount)throw new Error(p.name+': 다른 부품의 접점을 가리지 않는 빵판 위치를 찾지 못했습니다.');
   Object.assign(p,{x:mount.part.x,y:mount.part.y,rotation:mount.part.rotation});assignAttachments(p,mount.map);if(report)report.mountedParts=(report.mountedParts||0)+1;
  }
  state.boxes.push(exampleBodyBounds(p));for(const key of terminalKeys(p))remember(attachments(p)[key],net.find(terminal(p,key)));
  for(const bus of new Set(Object.values(attachments(p)).map(id=>holeInfo(id,project.components,project.surfaces).bus))){const spare=circuitHoles(project.components,project.surfaces).filter(h=>h.bus===bus&&!state.used.has(h.id)&&!state.boxes.some(b=>containsPoint(b,h,8)));state.contacts.push(...spare);}
 }
 // Convert explicit device leads to free holes on the same strip. Existing
 // unrelated wiring and its IDs, colors and bends remain intact.
 const bodies=project.components.filter(p=>p.type!=='breadboard').map(exampleBodyBounds),holes=circuitHoles(project.components,project.surfaces),occupiedLegs=new Set(project.components.flatMap(p=>Object.values(attachments(p))));
 const wireHoles=new Set(project.wires.flatMap(w=>[w.from,w.to]).filter(id=>holeInfo(id,project.components,project.surfaces)));
 const changed=new Set(),extensions=new Map();
 function jumperEnd(id){
  const match=/^part:([^:]+):(.+)$/.exec(id),p=match&&project.components.find(p=>p.id===match[1]);if(!p||!selected.has(p.id))return id;
  const mount=holeInfo(attachments(p)[match[2]],project.components,project.surfaces);if(!mount)return id;
  let bus=extensions.get(mount.bus)||mount.bus;
  const free=h=>!occupiedLegs.has(h.id)&&!wireHoles.has(h.id)&&!bodies.some(b=>containsPoint(b,h,8));
  let choices=holes.filter(h=>h.bus===bus&&free(h)).sort((a,b)=>Math.abs(b.x-p.x)-Math.abs(a.x-p.x));
  if(!choices.length){
   // A previous apply may already have extended this strip. Recover that
   // physical network without counting the temporary direct repair leads.
   const physical=wiringTopology({...project,wires:project.wires.filter(w=>![w.from,w.to].some(id=>id.startsWith('part:')&&selected.has(id.split(':')[1])))}),root=physical.find(mount.id);
   choices=holes.filter(h=>free(h)&&physical.find(h.id)===root).sort((a,b)=>Math.hypot(a.x-mount.x,a.y-mount.y)-Math.hypot(b.x-mount.x,b.y-mount.y));
  }
  if(choices.length===1){
   // Reserve the last free hole for an extension strip instead of stacking
   // several jumpers in one socket when a supply fans out to many devices.
   const spare=holes.filter(h=>h.id.includes('bb:')&&!state.busLabels.has(h.bus)&&free(h)&&holes.filter(other=>other.bus===h.bus&&free(other)).length>=3).sort((a,b)=>Math.hypot(a.x-mount.x,a.y-mount.y)-Math.hypot(b.x-mount.x,b.y-mount.y))[0];
   if(spare){const w={id:nextId(project,'bbJunction'),from:choices[0].id,to:spare.id,color:'#23a68a'};project.wires.push(w);changed.add(w.id);wireHoles.add(w.from);wireHoles.add(w.to);state.busLabels.set(spare.bus,net.find(id));extensions.set(mount.bus,spare.bus);bus=spare.bus;choices=holes.filter(h=>h.bus===bus&&free(h));if(report)report.addedWires++;}
  }
  const h=choices[0];if(!h)throw new Error(p.name+' 접점 옆에 점퍼를 꽂을 빈 구멍이 없습니다.');wireHoles.add(h.id);return h.id;
 }
 for(const w of [...project.wires]){const from=jumperEnd(w.from),to=jumperEnd(w.to);if(from!==w.from||to!==w.to){w.from=from;w.to=to;changed.add(w.id);}}
 let current=wiringTopology(project);
 for(const group of groups.values())for(const id of group.slice(1)){
  if(current.find(group[0])===current.find(id))continue;
  const anchor=group.filter(other=>holeInfo(other,project.components,project.surfaces)&&current.find(other)===current.find(group[0])).flatMap(other=>{const bus=holeInfo(other,project.components,project.surfaces).bus;return holes.filter(h=>h.bus===bus&&!occupiedLegs.has(h.id)&&!wireHoles.has(h.id)&&!bodies.some(b=>containsPoint(b,h,8)));})[0];
  const from=anchor?.id||jumperEnd(group[0]),to=jumperEnd(id);if(anchor)wireHoles.add(anchor.id);if(from===to)continue;
  const pin=PINS.find(p=>current.find(p.id)===current.find(from)||current.find(p.id)===current.find(to)),color=pin?.signal==='GND'?'#4e647b':/^(3V3|5V|VDD|U5V)$/.test(pin?.signal)?'#dd654c':'#23a68a';
  const w={id:nextId(project,'bbWire'),from,to,color};project.wires.push(w);current.join(from,to);changed.add(w.id);if(report)report.addedWires++;
 }
 const sockets=new Set(occupiedLegs),connected=wiringTopology(project);
 for(const w of project.wires)for(const end of ['from','to']){
  const h=holeInfo(w[end],project.components,project.surfaces);if(!h)continue;
  if(sockets.has(h.id)&&(!partIds||roots.has(net.find(w[end]))||changed.has(w.id))){
   const spare=holes.filter(q=>!sockets.has(q.id)&&!wireHoles.has(q.id)&&!bodies.some(b=>containsPoint(b,q,8))&&connected.find(q.id)===connected.find(h.id)).sort((a,b)=>Math.hypot(a.x-h.x,a.y-h.y)-Math.hypot(b.x-h.x,b.y-h.y))[0];
   if(!spare)throw new Error('점퍼가 겹치지 않도록 연결할 빵판 구멍이 부족합니다.');w[end]=spare.id;wireHoles.add(spare.id);changed.add(w.id);
  }
  sockets.add(w[end]);
 }
 // Even a timer loopback goes through a terminal strip, rather than bypassing
 // the breadboard with a board-to-board jumper.
 for(const w of [...project.wires])if(w.from.startsWith('board:')&&w.to.startsWith('board:')){
  const pair=holes.filter(h=>h.id.includes('bb:')&&!state.busLabels.has(h.bus)&&!occupiedLegs.has(h.id)&&!wireHoles.has(h.id)&&!bodies.some(b=>containsPoint(b,h,8)));
  const a=pair.find(h=>pair.some(other=>other.bus===h.bus&&other.id!==h.id)),b=a&&pair.find(h=>h.bus===a.bus&&h.id!==a.id);if(!a||!b)throw new Error('보드 신호를 연결할 빈 빵판 행이 없습니다.');
  const next={id:nextId(project,'bbLoop'),from:b.id,to:w.to,color:w.color};w.to=a.id;project.wires.push(next);state.busLabels.set(a.bus,net.find(w.from));wireHoles.add(a.id);wireHoles.add(b.id);changed.add(w.id);changed.add(next.id);
 }
 // Separate 3.3 V and 5 V rails; ground gets its own minus rail. Every jumper
 // occupies a different hole, including the board's rail feed.
 const boards=exampleBreadboards(project),feeds=new Map();
 for(const w of [...project.wires]){
  const atFrom=PINS.find(p=>p.id===w.from),atTo=PINS.find(p=>p.id===w.to),pin=atFrom||atTo,other=atFrom?w.to:w.from;
  if(!pin||!['GND','AGND','3V3','5V'].includes(pin.signal)||!holeInfo(other,project.components,project.surfaces)||other.includes('rail:'))continue;
  if(partIds&&!changed.has(w.id))continue;
  const board=boards.find(b=>b.holes.some(h=>h.id===other)),signal=pin.signal==='AGND'?'GND':pin.signal,rail=signal==='GND'?'rail:L:-:':signal==='3V3'?'rail:L:+:':'rail:R:+:',key=board.id+signal;
  const railHole=board.holes.find(h=>h.id.includes(rail)),live=wiringTopology(project),railRoot=live.find(railHole.id);
  if(railRoot!==live.find(boardPin(signal))&&project.wires.some(v=>[v.from,v.to].some(id=>live.find(id)===railRoot)))continue;
  const candidates=board.holes.filter(h=>h.id.includes(rail)&&!wireHoles.has(h.id)&&!occupiedLegs.has(h.id)&&!bodies.some(b=>containsPoint(b,h,8)));
  const existing=project.wires.some(v=>(v.from===boardPin(signal)&&board.holes.some(h=>h.id===v.to&&h.id.includes(rail)))||(v.to===boardPin(signal)&&board.holes.some(h=>h.id===v.from&&h.id.includes(rail))));
  if(!feeds.has(key)&&!existing){const hole=candidates.shift();if(!hole)continue;const feed={id:nextId(project,'bbPower'),from:boardPin(signal),to:hole.id,color:signal==='GND'?'#4e647b':'#dd654c'};project.wires.push(feed);wireHoles.add(hole.id);feeds.set(key,true);changed.add(feed.id);if(report)report.addedWires++;}
  const q=holeInfo(other,project.components,project.surfaces),h=candidates.sort((a,b)=>Math.hypot(a.x-q.x,a.y-q.y)-Math.hypot(b.x-q.x,b.y-q.y))[0];if(!h)continue;
  if(atFrom)w.from=h.id;else w.to=h.id;w.color=signal==='GND'?'#4e647b':'#dd654c';wireHoles.add(h.id);changed.add(w.id);
 }
 for(const w of project.wires){
  const involved=roots.has(net.find(w.from))||roots.has(net.find(w.to));
  const unrelated=partIds&&[w.from,w.to].some(id=>id.startsWith('part:')&&!selected.has(id.split(':')[1]));
  const a=endpointInfo(w.from,project.components,project.surfaces),b=endpointInfo(w.to,project.components,project.surfaces),path=[a,...(w.points||[{x:a.x+(b.x-a.x)*.47,y:a.y},{x:a.x+(b.x-a.x)*.47,y:b.y}]),b];
  const obstacles=exampleWireObstacles(project,w,bodies);
  if(changed.has(w.id)||!unrelated&&(!partIds||involved)&&path.some((p,i)=>i&&obstacles.some(box=>segmentHitsBox(path[i-1],p,box))))w.points=routeExampleWire(project,w,bodies);
 }
 return project;
}
