// Breadboard layout planner for complete HAL example circuits.
// The example's netlist is rebuilt on a breadboard so that series parts sit in line
// with the lead they serve, supplies come from the nearest header pin (a rail only when
// several strips share a supply), each net gets one colour, and wires are routed on
// nested orthogonal paths by the lattice router. Returns null when the circuit cannot be
// laid out this way; the caller then keeps the general arranger.
import {attachments,assignAttachments,nominalTerminals,terminalKeys,terminalLabel,TWO_PIN_TYPES,fixedLeadSpan} from './components.js';
import {PINS,BOARD,BB,circuitHoles,holeInfo,endpointInfo,breadboardHoles} from './pins.js';
import {surfacePoint} from './geometry.js';
import {displayModel} from './model-geometry.js';
import {CATALOG_BY_TYPE} from './catalog-defs.js';
import {wiringTopology} from './circuit-topology.js';
import {routeWires} from './wire-router.js';

const GND='#4e647b',POWER='#dd654c';
const SIGNAL_COLORS=['#ebbd2b','#2786d7','#23a68a','#8064d8','#ee8735','#df68ac','#8b603e','#a9d6ed','#b8dfa4','#f6c28b','#cdb4e8','#f4a6a6','#a4d8c5','#f5e6a1','#b4bbed','#edbad5','#d8c5b4'];
const SUPPLIES=new Set(['GND','3V3','5V','VDD','VIN','E5V','U5V','AVDD','IOREF','VBAT']);
const SERIES_TYPES=['resistor','ref_resistor_axial_2','diode','ref_diode_axial_2','capacitor','ref_capacitor_ceramic_2'];
const term=(p,k)=>`part:${p.id}:${k}`;
const manhattan=(a,b)=>Math.abs(a.x-b.x)+Math.abs(a.y-b.y);
const key=p=>Math.round(p.x*2)/2+','+Math.round(p.y*2)/2;
// Two outlines per part: the package at its datasheet size (what must not collide with other parts or the board) and its
// footprint at drawing size (the holes it blocks; jumpers can run under a module raised on its header pins).
const localBounds=new WeakMap(),localFootprints=new WeakMap();
const boxOf=(p,source=p,footprint=false)=>{const cache=footprint?localFootprints:localBounds;let b=cache.get(source);if(!b){b=displayModel({...p,x:0,y:0,rotation:0},{datasheet:!footprint})?.bounds||{left:-30,right:30,top:-25,bottom:25};cache.set(source,b);}const r=(p.rotation||0)*Math.PI/180,c=Math.cos(r),s=Math.sin(r);const pts=[[b.left,b.top],[b.right,b.top],[b.left,b.bottom],[b.right,b.bottom]].map(([x,y])=>({x:p.x+x*c-y*s,y:p.y+x*s+y*c}));return {left:Math.min(...pts.map(q=>q.x)),right:Math.max(...pts.map(q=>q.x)),top:Math.min(...pts.map(q=>q.y)),bottom:Math.max(...pts.map(q=>q.y))};};
const inBox=(b,p,m=0)=>p.x>b.left-m&&p.x<b.right+m&&p.y>b.top-m&&p.y<b.bottom+m;
const overlap=(a,b,m=0)=>a.left<b.right+m&&a.right>b.left-m&&a.top<b.bottom+m&&a.bottom>b.top-m;
const normalize=s=>s==='AGND'?'GND':s;

/** Netlist of the example: board-pin signals and part terminals per electrical net. */
export function exampleNets(project){
 const uf=wiringTopology(project),nets=new Map();
 const net=root=>{if(!nets.has(root))nets.set(root,{id:'n'+nets.size,terms:[],signals:new Set()});return nets.get(root);};
 for(const p of project.components)if(p.type!=='breadboard')for(const k of terminalKeys(p))net(uf.find(term(p,k))).terms.push({part:p,key:k,id:term(p,k)});
 for(const pin of PINS)if(pin.signal!=='NC'&&!project.surfaces?.board?.hidden){const root=uf.find(pin.id);if(nets.has(root))nets.get(root).signals.add(normalize(pin.signal));}
 // Pins wired only to each other (timer loopback) still form a net.
 for(const w of project.wires){const a=PINS.find(p=>p.id===w.from),b=PINS.find(p=>p.id===w.to);if(a&&b){const n=net(uf.find(a.id));n.signals.add(normalize(a.signal));n.signals.add(normalize(b.signal));}}
 return [...nets.values()].filter(n=>n.terms.length+n.signals.size>1||n.signals.size>1);
}

function accessPins(project,signal){
 return PINS.filter(p=>normalize(p.signal)===signal).map(p=>({...endpointInfo(p.id,project.components,project.surfaces),id:p.id}));
}

/** Plans the layout in place. Returns the project, or null when the planner gives up. */
let lastFailure='';
export const layoutFailure=()=>lastFailure;
export function planExampleLayout(source,{variant='half',debug=false,halfShift=42}={}){
 lastFailure='';
 const project=structuredClone(source);
 if(project.surfaces?.board?.hidden)return null;
 const nets=exampleNets(project),parts=project.components.filter(p=>p.type!=='breadboard');
 const netOf=new Map(nets.flatMap(n=>n.terms.map(t=>[t.id,n])));
 // Unconnected leads still own their strip, so no other net may share it.
 for(const p of parts)for(const k of terminalKeys(p))if(!netOf.has(term(p,k)))netOf.set(term(p,k),{id:'float:'+term(p,k),terms:[{part:p,key:k,id:term(p,k)}],signals:new Set(),floating:true});
 // Fresh breadboard next to the header that faces it.
 project.wires=[];for(const p of parts)assignAttachments(p,{});
 project.components=project.components.filter(p=>p.type!=='breadboard');
 const mcuRight=surfacePoint({x:BOARD.x+BOARD.w,y:BOARD.y},'board',project.surfaces).x;
 let holes;
 if(variant==='half'){
  project.surfaces={...(project.surfaces||{}),breadboard:{x:mcuRight+68,y:BB.y+halfShift}};
  holes=circuitHoles([],project.surfaces);
 }else{
  project.surfaces={...(project.surfaces||{}),breadboard:{hidden:true}};
  const board={id:'exampleBB1',type:'breadboard',variant:'full',name:'BB1',x:mcuRight+68+152,y:BOARD.y+BOARD.h/2,rotation:90};
  project.components.unshift(board);holes=breadboardHoles(board);
 }
 const bbBox={left:Math.min(...holes.map(h=>h.x))-30,right:Math.max(...holes.map(h=>h.x))+30,top:Math.min(...holes.map(h=>h.y))-30,bottom:Math.max(...holes.map(h=>h.y))+30};
 const mcuBox=(()=>{const a=surfacePoint({x:BOARD.x,y:BOARD.y},'board',project.surfaces),b=surfacePoint({x:BOARD.x+BOARD.w,y:BOARD.y+BOARD.h},'board',project.surfaces);return {left:a.x,top:a.y,right:b.x,bottom:b.y};})();
 const strips=new Map(),holeAt=new Map();
 for(const h of holes){if(!strips.has(h.bus))strips.set(h.bus,{bus:h.bus,holes:[],net:null,rail:h.id.includes('rail:')});strips.get(h.bus).holes.push(h);if(!h.id.includes('rail:'))holeAt.set(key(h),h);}
 const state={used:new Set(),bodies:[],covered:new Set(),leadAt:new Map()};
 const cells=new Map(),cell=p=>Math.floor(p.x/14)+':'+Math.floor(p.y/14);
 for(const h of holeAt.values()){const c=cell(h);if(!cells.has(c))cells.set(c,[]);cells.get(c).push(h);}
 const near=(p,r)=>{const out=[],n=Math.ceil(r/14);const cx=Math.floor(p.x/14),cy=Math.floor(p.y/14);for(let i=-n;i<=n;i++)for(let j=-n;j<=n;j++){const list=cells.get((cx+i)+':'+(cy+j));if(list)out.push(...list);}return out;};
 const allCells=new Map();for(const h of holes){const c=Math.floor(h.x/14)+':'+Math.floor(h.y/14);if(!allCells.has(c))allCells.set(c,[]);allCells.get(c).push(h);}
 const coveredBy=box=>{const out=[];for(let i=Math.floor((box.left-2)/14);i<=Math.floor((box.right+2)/14);i++)for(let j=Math.floor((box.top-2)/14);j<=Math.floor((box.bottom+2)/14);j++)for(const h of allCells.get(i+':'+j)||[])if(inBox(box,h,2))out.push(h.id);return out;};
 const holeById=new Map(holes.map(h=>[h.id,h]));
 const freeHoles=(strip,extraUsed=new Set(),extraCovered=new Set())=>strip.holes.filter(h=>!state.used.has(h.id)&&!state.covered.has(h.id)&&!extraUsed.has(h.id)&&!extraCovered.has(h.id));
 // Targets a lead's net wants to reach: header pins of its signals or strips of placed partners.
 const pinTargets=new Map();
 for(const n of nets){const t=[];for(const s of n.signals)t.push(...accessPins(project,s));pinTargets.set(n,t);}
 const placedStrips=n=>[...strips.values()].filter(s=>s.net===n);
 function leadCost(n,strip,extraUsed,extraCovered,box,lead){
  if(strip.net===n)return -260;
  const via=lead&&[...series.values()].find(x=>x.host.id===lead&&!state.done.has(x.part.id));
  if(via)n=netOf.get(term(via.part,via.outer));
  const free=freeHoles(strip,extraUsed,extraCovered);if(!free.length)return 0;
  const targets=[...(pinTargets.get(n)||[]),...placedStrips(n).flatMap(s=>freeHoles(s,extraUsed,extraCovered))];
  if(!targets.length)return 0;
  let best=Infinity;
  // A body between the socket and its target forces a detour.
  const blockers=box?[...state.bodies.map(b=>b.foot),box]:state.bodies.map(b=>b.foot);
  for(const h of free)for(const t of targets){let c=manhattan(h,t);
   if(c-0>=best)continue;
   if(blockers.some(b=>h.y>b.top&&h.y<b.bottom&&((t.x<h.x&&b.right<=h.x&&b.right>t.x)||(t.x>h.x&&b.left>=h.x&&b.left<t.x))))c+=160;
   best=Math.min(best,c);}
  return best;
 }
 // Order: devices by the height of the header pins they use; series parts follow their host.
 const series=new Map();
 for(const p of parts){
  if(!TWO_PIN_TYPES.includes(p.type)||!SERIES_TYPES.includes(p.type))continue;
  const [ka,kb]=terminalKeys(p);
  const options=[[ka,kb],[kb,ka]].sort(([,x],[,y])=>(netOf.get(term(p,y))?.signals.size?1:0)-(netOf.get(term(p,x))?.signals.size?1:0));
  for(const [inner,outer]of options){
   const ni=netOf.get(term(p,inner)),no=netOf.get(term(p,outer));if(!ni||!no||ni===no)continue;
   const host=ni.terms.filter(t=>t.part!==p);
   if(host.length!==1||ni.signals.size||SERIES_TYPES.includes(host[0].part.type)&&!no.signals.size)continue;
   if([...series.values()].some(x=>x.host.id===host[0].id))continue;
   series.set(p.id,{part:p,inner,outer,host:host[0]});break;
  }
 }
 const hostOf=new Map();
 for(const s of series.values()){if(!hostOf.has(s.host.part.id))hostOf.set(s.host.part.id,[]);hostOf.get(s.host.part.id).push(s);}
 const signalY=p=>{const ys=terminalKeys(p).flatMap(k=>{const n=netOf.get(term(p,k));return n?[...n.signals].filter(s=>!SUPPLIES.has(s)).flatMap(s=>accessPins(project,s).map(q=>q.y)):[];});return ys.length?Math.min(...ys):Infinity;};
 const devices=parts.filter(p=>!series.has(p.id)).sort((a,b)=>terminalKeys(b).length-terminalKeys(a).length||signalY(a)-signalY(b));
 devices.sort((a,b)=>signalY(a)-signalY(b));
 const order=[];for(const d of devices){order.push(d);for(const s of hostOf.get(d.id)||[])order.push(s.part);}
 for(const p of parts)if(!order.includes(p))order.push(p);

 function evaluate(p,positioned,map){
  // map: key → hole. Returns cost or null.
  const box=boxOf(positioned,p),foot=boxOf(positioned,p,true),leadHoles=Object.values(map),leadIds=new Set(leadHoles.map(h=>h.id));
  if(!overlap(foot,bbBox)&&!inBox(bbBox,{x:(foot.left+foot.right)/2,y:(foot.top+foot.bottom)/2}))return null;
  if(foot.left<bbBox.left-40||foot.right>bbBox.right+40||foot.top<bbBox.top-40||foot.bottom>bbBox.bottom+40)return null;
  // Two-lead off-board parts (battery holder, DC motor) lie beside the breadboard on their wires, so only their
  // footprint has to stay clear; every other package keeps its real (datasheet) outline clear of the others.
  const solid=terminalKeys(p).length===2&&/^(dc_supply|dc_motor)$/.test(CATALOG_BY_TYPE[p.type]?.family??p.type)?foot:box;
  if(overlap(solid,mcuBox,6)||state.bodies.some(b=>overlap(solid,b.solid??b.box,3)))return null;
  // A package may sit over its own leads (a tactile switch, a module on its header); every other hole under its footprint is covered.
  const cover=new Set(coveredBy(foot).filter(id=>!leadIds.has(id)));
  for(const id of state.used)if(cover.has(id))return null;
  const nets=new Map();let cost=0;
  for(const [k,h]of Object.entries(map)){
   if(state.used.has(h.id)||state.covered.has(h.id))return null;
   const n=netOf.get(term(p,k)),strip=strips.get(h.bus);
   if(strip.net&&strip.net!==n)return null;
   if(nets.has(h.bus)&&nets.get(h.bus)!==n)return null;nets.set(h.bus,n);
  }
  // Every strip in use keeps a free socket for its jumper.
  const affected=new Set([...nets.keys(),...[...cover].map(id=>holeById.get(id).bus)]);
  for(const bus of affected){const s=strips.get(bus);
   const n=s.net||nets.get(s.bus);if(!n||s.rail)continue;
   const free=freeHoles(s,leadIds,cover);
   // Sockets this strip still needs: one for the header wire, one to join leads elsewhere.
   const here=s.holes.filter(h=>state.leadAt.has(h.id)||leadIds.has(h.id)).length,outside=n.terms.length-here;
   const supply=n.signals.size&&[...n.signals].every(x=>SUPPLIES.has(x));
   const need=!n.signals.size?(outside>0?1:0):supply?1:1+(outside>0?1:0);
   if(free.length<need)return null;
  }
  for(const [k,h]of Object.entries(map)){const n=netOf.get(term(p,k));if(n)cost+=leadCost(n,strips.get(h.bus),leadIds,cover,foot,term(p,k));}
  // Keep the order of signal leads in the order of the header pins they use.
  const sig=Object.entries(map).map(([k,h])=>{const n=netOf.get(term(p,k)),t=n?(pinTargets.get(n)||[]).filter(q=>![...n.signals].every(s=>SUPPLIES.has(s))):[];return t.length?{h,y:Math.min(...t.map(q=>q.y))}:null;}).filter(Boolean);
  for(let i=0;i<sig.length;i++)for(let j=i+1;j<sig.length;j++)if((sig[i].h.y-sig[j].h.y)*(sig[i].y-sig[j].y)<0)cost+=40;
  cost+=cover.size*.5;
  return {cost,box,foot,solid,cover};
 }
 function candidates(p){
  const out=[];
  if(TWO_PIN_TYPES.includes(p.type)){
   const [ka,kb]=terminalKeys(p),body=displayModel({...p,x:0,y:0,rotation:0})?.bounds||{left:-15,right:15},len=body.right-body.left;
   const fixed=fixedLeadSpan(p),minSpan=fixed??len+6,maxSpan=fixed??Math.max(minSpan+28,Math.min(112,(p.span||70)+42));
   const s=series.get(p.id),hostStrip=s?strips.get(holeInfo(attachments(s.host.part)[s.host.key],project.components,project.surfaces)?.bus):null;
   const firsts=s?freeHoles(hostStrip):[...holeAt.values()].filter(h=>!state.used.has(h.id)&&!state.covered.has(h.id));
   for(const h1 of firsts)for(const h2 of holeAt.values()){
    if(h1===h2||h1.bus===h2.bus)continue;const dx=h2.x-h1.x,dy=h2.y-h1.y,span=Math.hypot(dx,dy);
    if(Math.abs(dx)>.5&&Math.abs(dy)>.5||span<minSpan||span>maxSpan)continue;
    const [first,second]=s?(s.inner===ka?[h1,h2]:[h2,h1]):[h1,h2];
    const positioned={...p,x:(first.x+second.x)/2,y:(first.y+second.y)/2,rotation:((Math.atan2(second.y-first.y,second.x-first.x)*180/Math.PI)+360)%360,span};
    const r=evaluate(p,positioned,{[ka]:first,[kb]:second});if(r)out.push({...r,positioned,map:{[ka]:first,[kb]:second},cost:r.cost+span*.15});
   }
   return out;
  }
  for(const bend of [0,22]){
   for(const rotation of [0,90,180,270]){
    const proto={...p,x:0,y:0,rotation},terms=nominalTerminals(proto),first=terms[0];
    const offsets=bend?[-21,-14,-7,7,14,21].flatMap(v=>[[v,0],[0,v]]):[[0,0]];
    const seen=new Set();
    for(const anchor of holeAt.values())for(const [ox,oy]of offsets){
     const positioned={...proto,x:anchor.x+ox-first.x,y:anchor.y+oy-first.y},map={},taken=new Set(),busNet=new Map();let ok=true,bent=0;
     const sig=Math.round(positioned.x)+','+Math.round(positioned.y);if(seen.has(sig))continue;seen.add(sig);
     for(const t of nominalTerminals(positioned)){
      const n=netOf.get(term(p,t.key)),fits=q=>!taken.has(q.id)&&(!busNet.has(q.bus)||busNet.get(q.bus)===n);
      let h=holeAt.get(key(t));if(h&&!fits(h))h=null;
      if(!h&&bend){let best=null,min=bend+.01;for(const q of near(t,bend)){const d=Math.hypot(q.x-t.x,q.y-t.y);if(d<min-.01&&fits(q)){min=d;best=q;}}h=best;if(h)bent+=min;}
      if(!h){ok=false;break;}taken.add(h.id);busNet.set(h.bus,n);map[t.key]=h;
     }
     if(!ok)continue;const r=evaluate(p,positioned,map);if(r)out.push({...r,positioned,map,cost:r.cost+bent*4+(rotation===p.rotation?0:1)});
    }
   }
   if(out.length)break;
  }
  return out;
 }
 state.done=new Set();
 function commit(p,c){
  const saved={x:p.x,y:p.y,rotation:p.rotation,span:p.span,map:attachments(p)},nets=[],used=[],covered=[];
  Object.assign(p,{x:c.positioned.x,y:c.positioned.y,rotation:c.positioned.rotation});if(TWO_PIN_TYPES.includes(p.type))p.span=c.positioned.span;
  assignAttachments(p,Object.fromEntries(Object.entries(c.map).map(([k,h])=>[k,h.id])));
  for(const [k,h]of Object.entries(c.map)){if(!state.used.has(h.id)){state.used.add(h.id);used.push(h.id);state.leadAt.set(h.id,term(p,k));}const n=netOf.get(term(p,k)),strip=strips.get(h.bus);if(n&&!strip.net){strip.net=n;nets.push(strip);}}
  for(const id of c.cover)if(!state.covered.has(id)){state.covered.add(id);covered.push(id);}
  state.bodies.push({id:p.id,box:c.box,foot:c.foot,solid:c.solid});state.done.add(p.id);
  return ()=>{for(const id of used){state.used.delete(id);state.leadAt.delete(id);}for(const id of covered)state.covered.delete(id);for(const strip of nets)strip.net=null;state.bodies.pop();state.done.delete(p.id);
   Object.assign(p,{x:saved.x,y:saved.y,rotation:saved.rotation});if(saved.span!==undefined)p.span=saved.span;assignAttachments(p,saved.map);};
 }
 const placed=new Set();
 for(const p of order){
  if(placed.has(p.id))continue;
  const hosted=hostOf.get(p.id)||[];
  const list=candidates(p).sort((a,b)=>a.cost-b.cost);
  if(!list.length){lastFailure='place '+p.id;return null;}
  let best=null;
  for(const c of hosted.length?list.slice(0,16):list.slice(0,1)){
   const undo=commit(p,c),undos=[];let total=c.cost;
   for(const sp of hosted){const options=candidates(sp.part).sort((x,y)=>x.cost-y.cost);if(!options.length){total+=400;continue;}total+=options[0].cost;undos.push(commit(sp.part,options[0]));}
   for(const u of undos.reverse())u();undo();
   if(!best||total<best.total)best={total,c};
  }
  commit(p,best.c);placed.add(p.id);
  // Series parts in line with their host lead; one that does not fit is placed and wired like any other part.
  for(const sp of hosted){const options=candidates(sp.part).sort((x,y)=>x.cost-y.cost);if(!options.length){series.delete(sp.part.id);order.push(sp.part);continue;}commit(sp.part,options[0]);placed.add(sp.part.id);}
 }
 // Wiring plan.
 const uf=wiringTopology(project),wires=[],usedPins=new Set(),colorOf=new Map();
 let signalIndex=0;
 const holeFree=h=>!state.used.has(h.id)&&!state.covered.has(h.id);
 const groupHoles=root=>[...strips.values()].filter(s=>!s.rail&&s.holes.some(h=>uf.find(h.id)===root)).flatMap(s=>s.holes.filter(holeFree));
 const take=h=>{state.used.add(h.id);return h.id;};
 const blockedRay=(h,t)=>state.bodies.some(({foot:b})=>h.y>b.top-2&&h.y<b.bottom+2&&((t.x<h.x&&b.right<=h.x+1&&b.right>t.x)||(t.x>h.x&&b.left>=h.x-1&&b.left<t.x)))?180:0;
 const pickHole=(list,target)=>list.slice().sort((a,b)=>manhattan(a,target)+blockedRay(a,target)-manhattan(b,target)-blockedRay(b,target))[0];
 const pickPin=(signal,target)=>accessPins(project,signal).filter(p=>!usedPins.has(p.id)).sort((a,b)=>manhattan(a,target)+(a.x<target.x?0:40)-manhattan(b,target)-(b.x<target.x?0:40))[0];
 const color=(n,signal)=>{if(signal==='GND')return GND;if(SUPPLIES.has(signal))return POWER;if(colorOf.has(n))return colorOf.get(n);
  // Look through an in-line resistor to the lead it drives (RGB channels keep their own colour).
  const through=n.terms.flatMap(t=>{const sp=series.get(t.part.id);return sp&&t.key===sp.outer?[sp.host,t]:[t];});
  const label=through.map(t=>terminalLabel(t.part,t.key)).find(l=>/^(R|G|B|RED|GREEN|BLUE)$/i.test(l));
  const c=label?{R:'#dd654c',RED:'#dd654c',G:'#23a68a',GREEN:'#23a68a',B:'#2786d7',BLUE:'#2786d7'}[label.toUpperCase()]:SIGNAL_COLORS[signalIndex++%SIGNAL_COLORS.length];colorOf.set(n,c);return c;};
 const add=(from,to,c)=>{wires.push({id:'w'+(wires.length+1),from,to,color:c});};
 const railFor=new Map();
 const sortedNets=nets.slice().sort((a,b)=>{const y=n=>{const t=(pinTargets.get(n)||[]);return t.length?Math.min(...t.map(q=>q.y)):Infinity;};return y(a)-y(b);});
 for(const n of sortedNets){
  const roots=[...new Set(n.terms.map(t=>uf.find(t.id)))];
  const signals=[...n.signals];
  if(!roots.length&&signals.length<2)continue;
  const supply=signals.length===1&&SUPPLIES.has(signals[0]);
  if(supply&&roots.length>=2){
   // Rail hub: the minus rail for ground, a plus rail per supply voltage.
   const want=signals[0]==='GND'?'-':'+';
   const rails=[...strips.values()].filter(s=>s.rail&&s.bus.includes(':'+want)&&!railFor.has(s.bus)&&s.holes.some(holeFree));
   if(!rails.length){lastFailure='wire1';return null;}
   const score=s=>roots.reduce((sum,r)=>{const hs=groupHoles(r);return sum+Math.min(...hs.map(h=>Math.min(...s.holes.filter(holeFree).map(q=>manhattan(h,q)))));},0)+Math.min(...s.holes.map(q=>Math.min(...accessPins(project,signals[0]).map(p=>manhattan(p,q)))))*.5;
   const rail=rails.sort((a,b)=>score(a)-score(b))[0];railFor.set(rail.bus,signals[0]);
   const c=color(n,signals[0]);
   let feed=null,bestFeed=Infinity;
   for(const pin of accessPins(project,signals[0]).filter(p=>!usedPins.has(p.id)))for(const q of rail.holes.filter(holeFree)){const d=manhattan(pin,q)+(pin.x<q.x?0:60);if(d<bestFeed){bestFeed=d;feed=[pin,q];}}
   if(!feed){lastFailure='wire2';return null;}usedPins.add(feed[0].id);add(feed[0].id,take(feed[1]),c);
   for(const r of roots){
    let best=null,min=Infinity;
    for(const h of groupHoles(r))for(const q of rail.holes.filter(holeFree)){const d=Math.abs(h.x-q.x)+Math.abs(h.y-q.y)*2.5+blockedRay(h,q);if(d<min){min=d;best=[h,q];}}
    if(!best){lastFailure='wire3';return null;}add(take(best[0]),take(best[1]),c);
   }
   continue;
  }
  const c=color(n,signals.find(s=>!SUPPLIES.has(s))||signals[0]);
  const groups=roots.map(r=>({root:r,holes:groupHoles(r)}));
  if(groups.some(g=>!g.holes.length&&roots.length+signals.length>1)){lastFailure='wire4';return null;}
  if(!groups.length&&signals.length>=2){
   // Pins wired to each other run through one free terminal strip.
   const target=accessPins(project,signals[0])[0];
   const strip=[...strips.values()].filter(s=>!s.rail&&!s.net&&s.holes.filter(holeFree).length>=signals.length).sort((a,b)=>manhattan(a.holes[0],target)-manhattan(b.holes[0],target))[0];
   if(!strip){lastFailure='wire5';return null;}strip.net=n;groups.push({root:null,holes:strip.holes.filter(holeFree)});
  }
  // Join the net's groups first (nearest free sockets), then bring each header signal to the
  // nearest free socket anywhere on the joined net.
  const pending=[...groups],connected=[];
  if(pending.length)connected.push(...pending.shift().holes);
  while(pending.length){
   let best=null,min=Infinity;
   for(const g of pending)for(const h of g.holes.filter(holeFree))for(const q of connected.filter(holeFree)){const d=manhattan(h,q)+blockedRay(h,q)+blockedRay(q,h);if(d<min){min=d;best={g,h,q};}}
   if(!best){lastFailure='join';return null;}add(take(best.q),take(best.h),c);pending.splice(pending.indexOf(best.g),1);connected.push(...best.g.holes);
  }
  for(const s of signals){
   let best=null,min=Infinity;
   for(const h of connected.filter(holeFree)){const pin=pickPin(s,h);if(!pin)continue;const d=manhattan(pin,h)+blockedRay(h,pin);if(d<min){min=d;best={h,pin};}}
   if(!best){lastFailure='header '+s;if(debug){project.wires=wires;return project;}return null;}usedPins.add(best.pin.id);add(best.pin.id,take(best.h),c);
  }
 }
 project.wires=wires;
 const origin=holes.find(h=>!h.id.includes('rail:'));
 let routed;try{routed=routeWires(project,project.wires,{bodies:state.bodies.map(b=>b.foot),origin:{x:origin.x,y:origin.y}});}catch(e){lastFailure='route: '+(e.wire?e.wire.from+' → '+e.wire.to:e.message);if(debug)return project;return null;}
 for(const w of project.wires){w.points=routed.points.get(w.id);if(w.points.length>32){lastFailure='bends';return null;}}
 return project;
}

/** Canonical netlist (board pins and part terminals grouped by net) for comparing layouts. */
export function netSignature(project){
 const uf=wiringTopology(project),groups=new Map();
 const ids=[...(project.surfaces?.board?.hidden?[]:PINS.filter(p=>p.signal!=='NC').map(p=>p.id)),...project.components.filter(p=>p.type!=='breadboard').flatMap(p=>terminalKeys(p).map(k=>term(p,k)))];
 for(const id of ids){const r=uf.find(id);if(!groups.has(r))groups.set(r,[]);groups.get(r).push(id);}
 return JSON.stringify([...groups.values()].filter(g=>g.length>1).map(g=>g.sort().join(',')).sort());
}
/** Lays out a complete example; null when neither breadboard size works without changing its netlist. */
export function layoutExample(project){
 const intended=netSignature(project),options=[];
 for(const variant of ['half','full']){
  let planned=null;try{planned=planExampleLayout(project,{variant});}catch(e){lastFailure=e.message;planned=null;}
  if(planned&&netSignature(planned)===intended)options.push({planned,score:layoutScore(planned)});
  // A half-size layout without crossings is comfortable; the full-size board is not tried.
  if(variant==='half'&&options[0]&&!options[0].score.crossings)break;
 }
 // The 830-point board is used only when the circuit does not sit comfortably on the half-size
 // board, i.e. it can be wired there with fewer crossings.
 if(options.length===2){const [h,f]=options;if(f.score.crossings<h.score.crossings)return f.planned;}
 return options[0]?.planned||null;
}
const segmentsOf=(project,w)=>{const a=endpointInfo(w.from,project.components,project.surfaces),b=endpointInfo(w.to,project.components,project.surfaces),pts=[a,...(w.points||[]),b];return pts.slice(1).map((q,i)=>[pts[i],q]);};
/** Wire count, drawn length and right-angle crossings folded into one comparable number. */
export function layoutScore(project){
 const segs=project.wires.map(w=>segmentsOf(project,w));let length=0,crossings=0;
 for(const list of segs)for(const [a,b]of list)length+=Math.abs(a.x-b.x)+Math.abs(a.y-b.y);
 for(let i=0;i<segs.length;i++)for(let j=i+1;j<segs.length;j++)for(const [a,b]of segs[i])for(const [c,d]of segs[j]){
  const h1=a.y===b.y,h2=c.y===d.y;if(h1===h2)continue;const [H,V]=h1?[[a,b],[c,d]]:[[c,d],[a,b]];
  const x=V[0].x,y=H[0].y;if(x>Math.min(H[0].x,H[1].x)&&x<Math.max(H[0].x,H[1].x)&&y>Math.min(V[0].y,V[1].y)&&y<Math.max(V[0].y,V[1].y))crossings++;
 }
 return {total:length+project.wires.length*40+crossings*450,length,crossings};
}
/** Re-routes the existing wires of an arranged project on the lattice router; keeps the old bends on failure. */
export function rerouteExampleWires(project){
 const bodies=project.components.filter(p=>p.type!=='breadboard').map(p=>boxOf(p,p,true));
 const origin=circuitHoles(project.components,project.surfaces).find(h=>!h.id.includes('rail:'));
 try{const routed=routeWires(project,project.wires,{bodies,origin:origin?{x:origin.x,y:origin.y}:{x:0,y:0}});for(const w of project.wires){const pts=routed.points.get(w.id);if(pts.length<=32)w.points=pts;}}catch{}
 return project;
}
/** One colour per net on an arranged project: black ground, red supplies, distinct signal colours. */
export function recolorExampleWires(project){
 const uf=wiringTopology(project),colors=new Map();let index=0;
 const pinsOf=root=>PINS.filter(p=>p.signal!=='NC'&&uf.find(p.id)===root).map(p=>normalize(p.signal));
 const roots=[...new Set(project.wires.map(w=>uf.find(w.from)))];
 const y=root=>{const ys=PINS.filter(p=>uf.find(p.id)===root).map(p=>p.y);return ys.length?Math.min(...ys):Infinity;};
 for(const root of roots.sort((a,b)=>y(a)-y(b))){
  const signals=pinsOf(root);
  if(signals.includes('GND'))colors.set(root,GND);else if(signals.some(s=>SUPPLIES.has(s)))colors.set(root,POWER);
  else colors.set(root,SIGNAL_COLORS[index++%SIGNAL_COLORS.length]);
 }
 for(const w of project.wires)w.color=colors.get(uf.find(w.from))||w.color;
 return project;
}
