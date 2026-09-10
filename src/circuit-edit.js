import {topology} from './engine.js';
import {PINS,circuitHoles,endpointInfo,breadboardPrefix} from './pins.js';
import {terminalKeys,attachments,assignAttachments} from './components.js';
import {moveBreadboard} from './breadboards.js';

export const selectedIds=(selection,type)=>selection?.type==='group'?selection[type==='part'?'parts':'wires']:selection?.type===type?[selection.id]:[];
export const isSelected=(selection,type,id)=>selectedIds(selection,type).includes(id);
export function toggleSelection(selection,type,id){
  const parts=selectedIds(selection,'part'),wires=selectedIds(selection,'wire'),ids=type==='part'?parts:wires;
  const next=ids.includes(id)?ids.filter(v=>v!==id):[...ids,id];
  return {type:'group',parts:type==='part'?next:parts,wires:type==='wire'?next:wires};
}
export function wirePoints(project,wire){const a=endpointInfo(wire.from,project.components),b=endpointInfo(wire.to,project.components);if(!a||!b)return [];return wire.points?[a,...wire.points,b]:[a,{x:a.x+(b.x-a.x)*.47,y:a.y},{x:a.x+(b.x-a.x)*.47,y:b.y},b];}
export function insertWirePoint(project,wire,point){
  const points=wirePoints(project,wire);if(points.length>=34)throw new Error('배선 꺾임점은 32개까지 추가할 수 있습니다.');
  let best=Infinity,index=1;
  for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((point.x-a.x)*dx+(point.y-a.y)*dy)/(dx*dx+dy*dy||1))),d=Math.hypot(point.x-a.x-t*dx,point.y-a.y-t*dy);if(d<best){best=d;index=i;}}
  points.splice(index,0,{x:point.x,y:point.y});wire.points=points.slice(1,-1);return index-1;
}
export function connectedNet(project,endpoint,pressed={}){
  const uf=topology(project,pressed),root=uf.find(endpoint),all=[...PINS,...circuitHoles(project.components),...project.components.flatMap(p=>terminalKeys(p).map(k=>endpointInfo(`part:${p.id}:${k}`,project.components)))];
  return {endpoints:all.filter(p=>uf.find(p.id)===root),wires:project.wires.filter(w=>uf.find(w.from)===root)};
}
export function copySelection(project,selection){
  const wanted=new Set(selectedIds(selection,'part'));
  // A selected breadboard brings its mounted parts along, just as moving it does.
  for(const p of project.components)if(p.type==='breadboard'&&wanted.has(p.id))for(const part of project.components)if(Object.values(attachments(part)).some(id=>id.startsWith(breadboardPrefix(p.id))))wanted.add(part.id);
  const components=structuredClone(project.components.filter(p=>wanted.has(p.id)));
  const owned=id=>id.startsWith('part:')?wanted.has(id.split(':')[1]):components.some(p=>p.type==='breadboard'&&id.startsWith(breadboardPrefix(p.id)));
  const wires=structuredClone(project.wires.filter(w=>owned(w.from)&&owned(w.to)||isSelected(selection,'wire',w.id)));
  // Preserve connections made through the original breadboard when detached parts are copied.
  const detached=structuredClone(components);for(const p of detached)assignAttachments(p,Object.fromEntries(Object.entries(attachments(p)).filter(([,id])=>owned(id))));
  const original=topology(project),internal=topology({components:detached,wires}),groups=new Map();
  for(const p of components)for(const key of terminalKeys(p)){const id=`part:${p.id}:${key}`,root=original.find(id);if(!groups.has(root))groups.set(root,[]);groups.get(root).push(id);}
  for(const terminals of groups.values()){const from=terminals[0];for(const to of terminals.slice(1))if(internal.find(from)!==internal.find(to)){wires.push({id:'copy-net-'+wires.length,from,to,color:'#23a68a'});internal.join(from,to);}}
  return {components,wires};
}
export function pasteSelection(project,clip,uid,offset=28){
  if(project.components.length+clip.components.length>100||project.wires.length+clip.wires.length>500)throw new Error('부품 100개, 배선 500개 한도를 넘습니다.');
  if(project.components.filter(p=>p.type==='breadboard').length+clip.components.filter(p=>p.type==='breadboard').length>8)throw new Error('추가 빵판은 8개까지 지원합니다.');
  const ids=new Map(clip.components.map(p=>[p.id,uid('p')]));
  const remap=id=>{if(id.startsWith('part:')){const [,part,key]=id.split(':');return ids.has(part)?`part:${ids.get(part)}:${key}`:id;}for(const p of clip.components)if(p.type==='breadboard'&&id.startsWith(breadboardPrefix(p.id)))return breadboardPrefix(ids.get(p.id))+id.slice(breadboardPrefix(p.id).length);return id;};
  const components=clip.components.map(p=>{const q=structuredClone(p);q.id=ids.get(p.id);q.name=p.name.slice(0,77)+' 복사';q.x+=offset;q.y+=offset;if(q.x>6000||q.y>6000)throw new Error('복사할 위치가 작업 공간을 벗어납니다.');assignAttachments(q,Object.fromEntries(Object.entries(attachments(q)).filter(([,id])=>remap(id)!==id).map(([key,id])=>[key,remap(id)])));return q;});
  const endpoints=new Set([...PINS,...circuitHoles([...project.components,...components])].map(p=>p.id));for(const p of [...project.components,...components])for(const k of terminalKeys(p))endpoints.add(`part:${p.id}:${k}`);
  const wires=clip.wires.map(w=>({...structuredClone(w),id:uid('w'),from:remap(w.from),to:remap(w.to),...(w.points?{points:w.points.map(p=>({x:p.x+offset,y:p.y+offset}))}:{})})).filter(w=>endpoints.has(w.from)&&endpoints.has(w.to));
  project.components.push(...components);project.wires.push(...wires);return {type:'group',parts:components.map(p=>p.id),wires:wires.map(w=>w.id)};
}
export function moveSelection(project,selection,dx,dy){
  const wanted=new Set(selectedIds(selection,'part')),moved=new Set();
  for(const p of project.components)if(p.type==='breadboard'&&wanted.has(p.id)){
    for(const part of project.components){const ends=Object.values(attachments(part));if(ends.length&&ends.every(id=>id.startsWith(breadboardPrefix(p.id))))moved.add(part.id);}
    moveBreadboard(project,p.id,{x:p.x+dx,y:p.y+dy});moved.add(p.id);
  }
  for(const p of project.components)if(wanted.has(p.id)&&!moved.has(p.id)){assignAttachments(p,{});p.x+=dx;p.y+=dy;}
  for(const w of project.wires)if(isSelected(selection,'wire',w.id)&&w.points)w.points=w.points.map(p=>({x:p.x+dx,y:p.y+dy}));
}
