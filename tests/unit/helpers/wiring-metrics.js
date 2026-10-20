// Geometry and netlist metrics for arranged example circuits.
// Used by tests/unit/example-wiring.test.js and by the baseline snapshot script.
import {PINS,holeInfo} from '../../../src/pins.js';
import {terminalKeys,attachments} from '../../../src/components.js';
import {wiringTopology} from '../../../src/circuit-topology.js';
import {wirePoints} from '../../../src/circuit-edit.js';

const EPS=1e-6;
/** Polyline points of every wire as drawn (stored bends or the default elbow). */
export function wirePaths(project){return project.wires.map(w=>({id:w.id,from:w.from,to:w.to,points:wirePoints(project,w)}));}
const segs=path=>path.points.slice(1).map((p,i)=>[path.points[i],p]).filter(([a,b])=>Math.hypot(a.x-b.x,a.y-b.y)>EPS);
const cross=(o,a,b)=>(a.x-o.x)*(b.y-o.y)-(a.y-o.y)*(b.x-o.x);
const near=(p,q,d=.5)=>Math.hypot(p.x-q.x,p.y-q.y)<d;
/** Proper intersection point of two segments (not parallel), or null. */
export function intersection(a,b,c,d){
 const r={x:b.x-a.x,y:b.y-a.y},s={x:d.x-c.x,y:d.y-c.y},den=r.x*s.y-r.y*s.x;
 if(Math.abs(den)<EPS)return null;
 const t=((c.x-a.x)*s.y-(c.y-a.y)*s.x)/den,u=((c.x-a.x)*r.y-(c.y-a.y)*r.x)/den;
 if(t<-EPS||t>1+EPS||u<-EPS||u>1+EPS)return null;return {x:a.x+t*r.x,y:a.y+t*r.y};
}
/** Length of the collinear overlap of two segments (0 when not collinear). */
export function overlapLength(a,b,c,d){
 if(Math.abs(cross(a,b,c))>EPS*100||Math.abs(cross(a,b,d))>EPS*100)return 0;
 const len=Math.hypot(b.x-a.x,b.y-a.y),ux=(b.x-a.x)/len,uy=(b.y-a.y)/len,t=p=>(p.x-a.x)*ux+(p.y-a.y)*uy;
 const lo=Math.max(0,Math.min(t(c),t(d))),hi=Math.min(len,Math.max(t(c),t(d)));return Math.max(0,hi-lo);
}
/** Crossing pairs, collinear overlaps, wire count and total drawn length. */
export function wiringMetrics(project){
 const paths=wirePaths(project),crossings=[],overlaps=[];let length=0;
 for(const p of paths)for(const [a,b]of segs(p))length+=Math.hypot(b.x-a.x,b.y-a.y);
 for(let i=0;i<paths.length;i++)for(let j=i+1;j<paths.length;j++){
  const A=paths[i],B=paths[j],ends=[A.points[0],A.points.at(-1),B.points[0],B.points.at(-1)];let crossed=false,overlap=0;
  for(const [a,b]of segs(A))for(const [c,d]of segs(B)){
   overlap+=overlapLength(a,b,c,d);
   const q=intersection(a,b,c,d);
   // Touching at a shared terminal (same hole/pin) is a junction, not a crossing.
   if(q&&!ends.some(e=>near(e,q)))crossed=true;
  }
  if(crossed)crossings.push([A.id,B.id]);if(overlap>.5)overlaps.push([A.id,B.id,+overlap.toFixed(1)]);
 }
 return {wires:paths.length,length:Math.round(length),crossings,overlaps};
}
/** Board pins and part terminals: the endpoints whose grouping defines the netlist. */
export function netEndpoints(project){
 return [...(project.surfaces?.board?.hidden?[]:PINS.filter(p=>p.signal!=='NC').map(p=>p.id)),...project.components.flatMap(p=>terminalKeys(p).map(k=>`part:${p.id}:${k}`))];
}
/** Canonical partition of endpoints into nets; equal strings mean identical connectivity. */
export function netlist(project){
 const uf=wiringTopology(project),groups=new Map();
 for(const id of netEndpoints(project)){const r=uf.find(id);if(!groups.has(r))groups.set(r,[]);groups.get(r).push(id);}
 return [...groups.values()].filter(g=>g.length>1).map(g=>g.sort().join(',')).sort();
}
/** Terminals of non-breadboard parts that are not seated in a breadboard hole. */
export function unmountedLeads(project){
 const out=[];for(const p of project.components){if(p.type==='breadboard')continue;const map=attachments(p);for(const k of terminalKeys(p))if(!map[k]||!holeInfo(map[k],project.components,project.surfaces))out.push(`${p.id}:${k}`);}return out;
}
